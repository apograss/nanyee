from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup, Tag

from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.integrations.egress import egress_transport_from_settings
from nanyee.tools.course_selection import CourseCategory, CourseItem, EnrollmentResult
from nanyee.tools.evaluation import (
    EvaluationDraft,
    EvaluationOption,
    EvaluationQuestion,
    EvaluationReference,
    EvaluationResult,
    PendingEvaluation,
)
from nanyee.tools.grades import GradeDistribution, GradeRecord, RankingInfo, parse_grades
from nanyee.tools.timetable import CourseEvent, SemesterOption

COMMON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9",
}

COOKIE_NAME_PATTERN = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")

logger = logging.getLogger(__name__)


def parse_academic_cookie_header(value: str) -> dict[str, str]:
    """Parse a copied browser Cookie header without forwarding arbitrary headers."""
    raw = value.strip()
    if raw.lower().startswith("cookie:"):
        raw = raw[7:].strip()
    raw = raw.strip(" ;")
    if not raw:
        raise ValueError("empty Cookie header")
    if "=" not in raw and ";" not in raw:
        raw = f"JSESSIONID={raw}"

    cookies: dict[str, str] = {}
    for part in re.split(r"[;\r\n]+", raw):
        item = part.strip()
        if not item or "=" not in item:
            continue
        name, cookie_value = item.split("=", 1)
        name = name.strip()
        cookie_value = cookie_value.strip()
        if (
            not COOKIE_NAME_PATTERN.fullmatch(name)
            or not cookie_value
            or len(name) > 128
            or len(cookie_value) > 4096
            or any(ord(character) < 0x20 or ord(character) == 0x7F for character in cookie_value)
        ):
            continue
        cookies[name] = cookie_value
        if len(cookies) > 50:
            raise ValueError("too many cookies")
    if not cookies:
        raise ValueError("Cookie header contains no usable cookies")
    return cookies


@dataclass(frozen=True, slots=True)
class CaptchaData:
    image: bytes
    content_type: str
    cookies: dict[str, str]


class SmuAcademicClient:
    def __init__(
        self, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._settings = settings
        self._transport = transport or egress_transport_from_settings(settings)

    async def fetch_captcha(self) -> CaptchaData:
        try:
            async with self._client() as client:
                response = await client.get(
                    f"{self._settings.smu_uis_base_url}/imageServlet.do",
                    headers={
                        **COMMON_HEADERS,
                        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                        "Referer": f"{self._settings.smu_uis_base_url}/login.jsp?outLine=0",
                    },
                )
        except httpx.HTTPError as exc:
            raise self._unavailable() from exc
        if response.status_code != 200:
            raise self._unavailable()
        content_type = response.headers.get("content-type", "").split(";", maxsplit=1)[0]
        if content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise self._unavailable()
        if not response.content or len(response.content) > 1024 * 1024:
            raise self._unavailable()
        return CaptchaData(
            image=response.content,
            content_type=content_type,
            cookies=dict(response.cookies),
        )

    async def authenticate(
        self,
        *,
        account: str,
        password: str,
        captcha: str,
        uis_cookies: dict[str, str],
    ) -> dict[str, str]:
        ticket = await self._login_for_ticket(
            account=account,
            password=password,
            captcha=captcha,
            cookies=uis_cookies,
        )
        return await self._establish_academic_session(ticket)

    async def validate_academic_session(
        self, *, academic_cookies: dict[str, str]
    ) -> dict[str, str]:
        """Validate copied academic cookies and return the refreshed cookie jar."""
        base = self._settings.smu_academic_base_url
        allowed_host = urlparse(base).hostname
        current_url = f"{base}/new/welcome.page?ui=new"
        try:
            async with self._client(cookies=academic_cookies) as client:
                for _ in range(5):
                    response = await client.get(
                        current_url,
                        headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
                    )
                    if self._response_size_invalid(response):
                        raise self._unavailable()
                    location = response.headers.get("location")
                    if location and response.is_redirect:
                        candidate = urljoin(current_url, location)
                        parsed = urlparse(candidate)
                        if parsed.scheme != "https" or parsed.hostname != allowed_host:
                            raise self._cookie_rejected()
                        current_url = candidate
                        continue
                    if response.status_code >= 500:
                        raise self._unavailable()
                    if response.status_code != 200 or _is_academic_login_page(response.text):
                        raise self._cookie_rejected()
                    refreshed = {
                        cookie.name: cookie.value
                        for cookie in client.cookies.jar
                        if cookie.domain in {"", allowed_host} and isinstance(cookie.value, str)
                    }
                    if not refreshed:
                        raise self._cookie_rejected()
                    return refreshed
        except httpx.HTTPError as exc:
            raise self._unavailable() from exc
        raise self._cookie_rejected()

    async def fetch_timetable(
        self,
        *,
        academic_cookies: dict[str, str],
        total_weeks: int,
        semester_code: str | None = None,
    ) -> tuple[str, list[CourseEvent]]:
        if total_weeks < 1 or total_weeks > 30:
            raise ValueError("total_weeks must be between 1 and 30")
        if semester_code is not None and not re.fullmatch(r"\d{6}", semester_code):
            raise ValueError("semester_code must be a 6-digit code")
        async with self._client(cookies=academic_cookies) as client:
            if semester_code is None:
                semester_code = await self._default_semester_code(client)
            events: list[CourseEvent] = []
            for start in range(1, total_weeks + 1, 5):
                weeks = range(start, min(start + 5, total_weeks + 1))
                batches = await asyncio.gather(
                    *(self._fetch_week(client, semester_code, week) for week in weeks)
                )
                for batch in batches:
                    events.extend(batch)
        return semester_code, events

    async def list_semesters(
        self, *, academic_cookies: dict[str, str]
    ) -> tuple[str, list[SemesterOption]]:
        """返回（当前学期代码, 全部学期选项）；选项来自 week.page 的 xnxqdm 下拉框。"""
        base = self._settings.smu_academic_base_url
        async with self._client(cookies=academic_cookies) as client:
            default_code = await self._default_semester_code(client)
            try:
                page = await self._get_following_redirects(
                    client,
                    f"{base}/new/student/xsgrkb/week.page?xnxqdm={default_code}",
                )
            except httpx.HTTPError as exc:
                raise self._unavailable() from exc
            self._ensure_success(page)
        semesters = _parse_semester_options(page.text)
        if not semesters:
            raise self._unavailable()
        return default_code, semesters

    async def fetch_semester_start(
        self, *, academic_cookies: dict[str, str], semester_code: str
    ) -> date:
        """学期第一周周一：校历接口 getDatesOfWeek 返回该周每天日期，取 xqmc=1（周一）。"""
        if not re.fullmatch(r"\d{6}", semester_code):
            raise ValueError("semester_code must be a 6-digit code")
        base = self._settings.smu_academic_base_url
        async with self._client(cookies=academic_cookies) as client:
            try:
                response = await client.post(
                    f"{base}/new/xlxx/getDatesOfWeek",
                    data={"xnxqdm": semester_code, "zc": "1"},
                    headers={
                        **COMMON_HEADERS,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": f"{base}/new/student/xsgrkb/week.page?xnxqdm={semester_code}",
                    },
                )
            except httpx.HTTPError as exc:
                raise self._unavailable() from exc
            self._ensure_success(response)
            try:
                payload = response.json()
            except ValueError as exc:
                raise self._unavailable() from exc
        if not isinstance(payload, list):
            raise self._unavailable()
        mondays = [
            item.get("rq") for item in payload if isinstance(item, dict) and item.get("xqmc") == 1
        ]
        if not mondays or not isinstance(mondays[0], str):
            raise self._unavailable()
        try:
            monday = date.fromisoformat(mondays[0])
        except ValueError as exc:
            raise self._unavailable() from exc
        if monday.weekday() != 0:
            raise self._unavailable()
        return monday

    async def _default_semester_code(self, client: httpx.AsyncClient) -> str:
        try:
            page = await self._get_following_redirects(
                client,
                f"{self._settings.smu_academic_base_url}/new/student/xsgrkb/main.page",
            )
        except httpx.HTTPError as exc:
            raise self._unavailable() from exc
        self._ensure_success(page)
        match = re.search(r"xnxqdm=(\d+)", page.text)
        if match is None:
            raise self._rejected()
        return match.group(1)

    async def fetch_grades(self, *, academic_cookies: dict[str, str]) -> list[GradeRecord]:
        base = self._settings.smu_academic_base_url
        async with self._client(cookies=academic_cookies) as client:
            try:
                page = await self._get_following_redirects(
                    client,
                    f"{base}/new/student/xskccj/kccjList.page",
                )
                self._ensure_success(page)
                body = (
                    "xnxqdm=&source=kccjlist&ismax=1&primarySort=+cjdm+desc+"
                    "&page=1&rows=500&sort=xnxqdm%2Ckcmc&order=desc%2Casc"
                )
                response = await client.post(
                    f"{base}/new/student/xskccj/kccjDatas",
                    content=body,
                    headers={
                        **COMMON_HEADERS,
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "Origin": base,
                        "Referer": f"{base}/new/student/xskccj/kccjList.page",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                )
            except httpx.HTTPError as exc:
                raise self._unavailable() from exc
            self._ensure_success(response)
            try:
                grades = parse_grades(response.json())
            except (ValueError, TypeError) as exc:
                raise self._unavailable() from exc
            # 排名页并发补全（有界）：串行 25+ 次请求会让成绩页空转数秒
            semaphore = asyncio.Semaphore(5)

            async def enrich(grade: GradeRecord) -> GradeRecord:
                if not grade.grade_id:
                    return grade
                async with semaphore:
                    ranking = await self._fetch_grade_ranking(client, grade.grade_id)
                return grade.model_copy(update={"ranking": ranking})

            return list(await asyncio.gather(*(enrich(grade) for grade in grades)))

    async def _fetch_grade_ranking(
        self, client: httpx.AsyncClient, grade_id: str
    ) -> RankingInfo | None:
        url = f"{self._settings.smu_academic_base_url}/new/student/xskccj/kccjfxd.page"
        url = f"{url}?{urlencode({'cjdm': grade_id})}"
        try:
            response = await self._get_following_redirects(client, url)
        except (httpx.HTTPError, AppError):
            return None
        if response.status_code != 200 or self._response_size_invalid(response):
            return None
        return _parse_grade_ranking(response.text)

    async def calibrate_server_time(
        self, *, academic_cookies: dict[str, str], samples: int = 3
    ) -> int:
        """Return upstream wall-clock minus local wall-clock in milliseconds."""
        best_rtt = float("inf")
        best_offset = 0.0
        base = self._settings.smu_academic_base_url
        sample_count = max(1, min(samples, 5))
        async with self._client(cookies=academic_cookies) as client:
            for index in range(sample_count):
                wall_before = time.time() * 1000
                monotonic_before = time.monotonic() * 1000
                try:
                    response = await client.get(
                        f"{base}/new/welcome.page?ui=new",
                        headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
                    )
                except httpx.HTTPError:
                    continue
                monotonic_after = time.monotonic() * 1000
                date_header = response.headers.get("date")
                if response.status_code != 200 or not date_header:
                    continue
                try:
                    server_ms = parsedate_to_datetime(date_header).timestamp() * 1000
                except (TypeError, ValueError, OverflowError):
                    continue
                rtt = monotonic_after - monotonic_before
                if rtt < best_rtt:
                    best_rtt = rtt
                    best_offset = server_ms - (wall_before + rtt / 2)
                if index + 1 < sample_count:
                    await asyncio.sleep(0.03)
        return round(best_offset)

    async def fetch_enrollment_categories(
        self, *, academic_cookies: dict[str, str]
    ) -> list[CourseCategory]:
        base = self._settings.smu_academic_base_url
        async with self._client(cookies=academic_cookies) as client:
            try:
                await self._get_following_redirects(
                    client,
                    f"{base}/new/welcome.page?ui=new",
                )
                response = await self._get_following_redirects(
                    client,
                    f"{base}/new/student/xsxk/",
                )
            except httpx.HTTPError as exc:
                raise self._unavailable() from exc
        self._ensure_success(response)
        # 选课未开放时正方会把 xsxk 302 回首页/欢迎页，这是业务状态而非系统故障
        if not response.url.path.startswith("/new/student/xsxk"):
            raise AppError(
                ErrorCode.NOT_FOUND,
                "学校选课当前未开放，请在选课开放期间再试。",
                status_code=404,
            )
        if "统一认证登录" in response.text or "扫码登录" in response.text:
            raise self._rejected()
        return _parse_enrollment_categories(response.text)

    async def fetch_enrollment_courses(
        self,
        *,
        academic_cookies: dict[str, str],
        category_code: str,
    ) -> list[CourseItem]:
        if not re.fullmatch(r"\d{1,8}", category_code):
            raise ValueError("invalid enrollment category code")
        base = self._settings.smu_academic_base_url
        endpoint = f"{base}/new/student/xsxk/xklx/{category_code}/kxkc"
        courses: list[CourseItem] = []
        async with self._client(cookies=academic_cookies) as client:
            for page in range(1, 21):
                try:
                    response = await client.post(
                        endpoint,
                        data={"page": page, "rows": 50, "sort": "kcrwdm", "order": "asc"},
                        headers={
                            **COMMON_HEADERS,
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Referer": f"{base}/new/student/xsxk/xklx/{category_code}",
                        },
                    )
                except httpx.HTTPError as exc:
                    raise self._unavailable() from exc
                self._ensure_success(response)
                try:
                    payload = response.json()
                except ValueError as exc:
                    raise self._rejected() from exc
                if not isinstance(payload, dict) or not isinstance(payload.get("rows"), list):
                    raise self._rejected()
                rows = [row for row in payload["rows"] if isinstance(row, dict)]
                courses.extend(_course_item(row) for row in rows)
                total = _safe_int(payload.get("total"))
                if not rows or len(courses) >= total:
                    break
        return courses

    async def enroll_course(
        self,
        *,
        academic_cookies: dict[str, str],
        category_code: str,
        course: CourseItem,
        confirm_conflict: bool = False,
    ) -> EnrollmentResult:
        if not re.fullmatch(r"\d{1,8}", category_code):
            raise ValueError("invalid enrollment category code")
        base = self._settings.smu_academic_base_url
        try:
            async with self._client(cookies=academic_cookies) as client:
                response = await client.post(
                    f"{base}/new/student/xsxk/xklx/{category_code}/add",
                    data={
                        "kcrwdm": course.task_code,
                        "kcmc": course.name,
                        "qz": "-1",
                        "xxyqdm": "",
                        "hlct": "1" if confirm_conflict else "0",
                    },
                    headers={
                        **COMMON_HEADERS,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": f"{base}/new/student/xsxk/xklx/{category_code}",
                    },
                )
        except httpx.HTTPError as exc:
            raise AppError(
                ErrorCode.RESULT_UNKNOWN,
                "选课提交结果未知，请先在教务系统核验。",
                status_code=502,
                details={"next_action": "verify_upstream"},
            ) from exc
        if response.status_code != 200 or self._response_size_invalid(response):
            raise AppError(
                ErrorCode.RESULT_UNKNOWN,
                "选课提交结果未知，请先在教务系统核验。",
                status_code=502,
                details={"next_action": "verify_upstream"},
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise AppError(
                ErrorCode.RESULT_UNKNOWN,
                "选课提交结果未知，请先在教务系统核验。",
                status_code=502,
                details={"next_action": "verify_upstream"},
            ) from exc
        if not isinstance(payload, dict):
            raise AppError(
                ErrorCode.RESULT_UNKNOWN,
                "选课提交结果未知，请先在教务系统核验。",
                status_code=502,
                details={"next_action": "verify_upstream"},
            )
        code = _safe_int(payload.get("code"), default=-1)
        message = str(payload.get("message") or "")[:200]
        if code == 0 or message == "您已经选了该门课程":
            outcome = "enrolled"
            success = True
        elif message.startswith("超出选课要求门数"):
            outcome = "limit_reached"
            success = True
        elif "冲突" in message:
            outcome = "conflict"
            success = False
        else:
            outcome = "rejected"
            success = False
        return EnrollmentResult(
            success=success,
            course_name=course.name,
            outcome=outcome,
            message=message,
        )

    async def fetch_pending_evaluations(
        self, *, academic_cookies: dict[str, str]
    ) -> list[PendingEvaluation]:
        base = self._settings.smu_academic_base_url
        today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
        values: dict[tuple[str, str, str], PendingEvaluation] = {}
        async with self._client(cookies=academic_cookies) as client:
            for target_date in (today, today - timedelta(days=1)):
                try:
                    response = await client.post(
                        f"{base}/new/student/ktpj/xsktpjData",
                        data={
                            "jsrq": target_date.isoformat(),
                            "page": 1,
                            "rows": 60,
                            "sort": "jsrq, jcdm2",
                            "order": "desc",
                        },
                        headers={
                            **COMMON_HEADERS,
                            "Accept": "application/json, text/javascript, */*; q=0.01",
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "Origin": base,
                            "Referer": f"{base}/new/student/ktpj",
                            "X-Requested-With": "XMLHttpRequest",
                        },
                    )
                except httpx.HTTPError as exc:
                    raise self._unavailable() from exc
                self._ensure_success(response)
                try:
                    payload = response.json()
                except ValueError as exc:
                    raise self._unavailable() from exc
                if not isinstance(payload, dict) or not isinstance(payload.get("rows"), list):
                    raise self._unavailable()
                for row in payload["rows"]:
                    if not isinstance(row, dict) or str(row.get("pjdm") or ""):
                        continue
                    teacher_code = _bounded_text(row.get("teadm"), 128)
                    class_hour_code = _bounded_text(row.get("dgksdm"), 128)
                    questionnaire_code = _bounded_text(row.get("ktpj"), 128)
                    if not teacher_code or not class_hour_code or not questionnaire_code:
                        continue
                    key = (teacher_code, class_hour_code, questionnaire_code)
                    values.setdefault(
                        key,
                        PendingEvaluation(
                            teacher_code=teacher_code,
                            class_hour_code=class_hour_code,
                            questionnaire_code=questionnaire_code,
                            teacher_name=_bounded_text(row.get("teaxm"), 100),
                            course_name=_bounded_text(row.get("kcmc"), 200),
                            end_date=_bounded_text(row.get("jsrq"), 32),
                        ),
                    )
        return list(values.values())

    async def fetch_evaluation_draft(
        self,
        *,
        academic_cookies: dict[str, str],
        reference: EvaluationReference,
    ) -> EvaluationDraft:
        _validate_evaluation_reference(reference)
        base = self._settings.smu_academic_base_url
        try:
            async with self._client(cookies=academic_cookies) as client:
                response = await client.get(
                    f"{base}/new/student/ktpj/showXsktpjwj.page",
                    params={
                        "pjlxdm": "6",
                        "teadm": reference.teacher_code,
                        "dgksdm": reference.class_hour_code,
                        "wjdm": reference.questionnaire_code,
                    },
                    headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
                )
        except httpx.HTTPError as exc:
            raise self._unavailable() from exc
        self._ensure_success(response)
        return _parse_evaluation_draft(response.text, reference)

    async def submit_evaluation(
        self,
        *,
        academic_cookies: dict[str, str],
        draft: EvaluationDraft,
        selections: dict[str, str],
    ) -> EvaluationResult:
        expected = {question.indicator_code for question in draft.questions}
        if set(selections) != expected:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "请完整选择本次评课的所有题目。",
                status_code=422,
            )
        answers: list[dict[str, str | int]] = []
        total_score = 0
        for question in draft.questions:
            selected_code = selections[question.indicator_code]
            option = next((item for item in question.options if item.code == selected_code), None)
            if option is None:
                raise AppError(
                    ErrorCode.INVALID_REQUEST,
                    "评课选项已失效，请重新生成草稿。",
                    status_code=422,
                )
            total_score += option.score
            answers.append(
                {
                    "txdm": question.type_code,
                    "zbdm": question.indicator_code,
                    "zbmc": question.title,
                    "zbxmdm": option.code,
                    "fz": option.score,
                    "dtjg": option.label,
                }
            )
        body = {
            **draft.hidden_fields,
            "teadm": draft.reference.teacher_code,
            "teabh": draft.reference.teacher_code,
            "wjdm": draft.reference.questionnaire_code,
            "dgksdm": draft.reference.class_hour_code,
            "wtpf": str(total_score),
            "pfsm": "",
            "dt": json.dumps(answers, ensure_ascii=False, separators=(",", ":")),
        }
        base = self._settings.smu_academic_base_url
        try:
            async with self._client(cookies=academic_cookies) as client:
                response = await client.post(
                    f"{base}/new/student/ktpj/savePj",
                    data=body,
                    headers={
                        **COMMON_HEADERS,
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "Origin": base,
                        "Referer": f"{base}/new/student/ktpj",
                        "X-Requested-With": "XMLHttpRequest",
                    },
                )
        except httpx.HTTPError as exc:
            raise _evaluation_result_unknown() from exc
        if response.status_code != 200 or self._response_size_invalid(response):
            raise _evaluation_result_unknown()
        if _evaluation_submission_confirmed(response):
            return EvaluationResult(
                submitted=True,
                teacher_name=draft.teacher_name,
                course_name=draft.course_name,
                total_score=total_score,
            )
        try:
            payload = response.json()
        except ValueError:
            raise _evaluation_result_unknown() from None
        if isinstance(payload, dict):
            message = _bounded_text(payload.get("message") or payload.get("msg"), 200)
            raise AppError(
                ErrorCode.UPSTREAM_REJECTED,
                message or "教务系统拒绝了本次评课提交。",
                status_code=422,
            )
        raise _evaluation_result_unknown()

    async def _fetch_week(
        self, client: httpx.AsyncClient, semester_code: str, week: int
    ) -> list[CourseEvent]:
        base = self._settings.smu_academic_base_url
        try:
            response = await client.post(
                f"{base}/new/student/xsgrkb/getCalendarWeekDatas",
                data={"xnxqdm": semester_code, "zc": str(week)},
                headers={
                    **COMMON_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": f"{base}/new/student/xsgrkb/main.page",
                },
            )
        except httpx.HTTPError as exc:
            raise self._unavailable() from exc
        self._ensure_success(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise self._unavailable() from exc
        if not isinstance(payload, dict):
            raise self._unavailable()
        rows = payload.get("data", [])
        if not isinstance(rows, list):
            raise self._unavailable()
        try:
            return [CourseEvent.from_upstream(row) for row in rows if isinstance(row, dict)]
        except (TypeError, ValueError) as exc:
            raise self._unavailable() from exc

    def _ensure_success(self, response: httpx.Response) -> None:
        if response.status_code != 200:
            raise self._unavailable()
        content_length = response.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self._settings.upstream_max_response_bytes:
                    raise self._unavailable()
            except ValueError as exc:
                raise self._unavailable() from exc
        if len(response.content) > self._settings.upstream_max_response_bytes:
            raise self._unavailable()

    def _response_size_invalid(self, response: httpx.Response) -> bool:
        content_length = response.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self._settings.upstream_max_response_bytes:
                    return True
            except ValueError:
                return True
        return len(response.content) > self._settings.upstream_max_response_bytes

    async def _login_for_ticket(
        self,
        *,
        account: str,
        password: str,
        captcha: str,
        cookies: dict[str, str],
    ) -> str:
        body = {
            "loginName": account,
            "password": hashlib.md5(password.encode(), usedforsecurity=False).hexdigest(),
            "randcodekey": captcha,
            "locationBrowser": "谷歌浏览器[Chrome]",
            "appid": "3550176",
            "redirect": f"{self._settings.smu_academic_base_url}/new/ssoLogin",
            "strength": "3",
        }
        try:
            async with self._client(cookies=cookies) as client:
                response = await client.post(
                    f"{self._settings.smu_uis_base_url}/login/login.do",
                    data=body,
                    headers={
                        **COMMON_HEADERS,
                        "Origin": self._settings.smu_uis_base_url,
                        "Referer": (
                            f"{self._settings.smu_uis_base_url}/login.jsp?redirect="
                            "https%3A%2F%2Fzhjw.smu.edu.cn%2Fnew%2FssoLogin"
                        ),
                        "X-Requested-With": "XMLHttpRequest",
                    },
                )
        except httpx.HTTPError as exc:
            raise self._unavailable() from exc
        if response.status_code != 200:
            raise self._rejected()
        try:
            data: Any = response.json()
        except ValueError as exc:
            raise self._rejected() from exc
        if not isinstance(data, dict):
            raise self._rejected()
        ticket = data.get("ticket")
        if isinstance(ticket, str) and ticket and len(ticket) <= 2048:
            return ticket
        raise self._login_rejected(data)

    def _allowed_page_hosts(self) -> set[str | None]:
        return {
            urlparse(self._settings.smu_academic_base_url).hostname,
            urlparse(self._settings.smu_uis_base_url).hostname,
        }

    async def _get_following_redirects(self, client: httpx.AsyncClient, url: str) -> httpx.Response:
        """跟随正方的 302 自检跳转链并逐跳校验域名。

        携带有效会话首次访问模块页时，zhjw 常先 302 到 ssoLogin 再自动回跳，
        直接把非 200 当失败会误杀正常流程；手动跟随可复刻浏览器的正常行为，
        同时避免被重定向到不可信主机。
        """
        allowed_hosts = self._allowed_page_hosts()
        current = url
        # 正方模块页校验 Referer 做防深链，缺失会 302 回首页；与 legacy 行为保持一致
        headers = {
            **COMMON_HEADERS,
            "Accept": "text/html,*/*",
            "Referer": f"{self._settings.smu_academic_base_url}/",
        }
        for _ in range(5):
            response = await client.get(current, headers=headers)
            location = response.headers.get("location")
            if not response.is_redirect or not location:
                return response
            candidate = urljoin(current, location)
            parsed = urlparse(candidate)
            if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
                raise self._unavailable()
            logger.info(
                "smu page redirect hop: %s -> %s (%s)", current, candidate, response.status_code
            )
            current = candidate
        raise self._unavailable()

    async def _establish_academic_session(self, ticket: str) -> dict[str, str]:
        allowed_host = urlparse(self._settings.smu_academic_base_url).hostname
        current_url = f"{self._settings.smu_academic_base_url}/new/ssoLogin"
        params: dict[str, str] | None = {"ticket": ticket}
        cookies: dict[str, str] = {}
        async with self._client() as client:
            for _ in range(5):
                try:
                    response = await client.get(
                        current_url,
                        params=params,
                        headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
                    )
                except httpx.HTTPError as exc:
                    raise self._unavailable() from exc
                params = None
                cookies.update(dict(response.cookies))
                location = response.headers.get("location")
                if not location:
                    break
                candidate = urljoin(current_url, location)
                parsed = urlparse(candidate)
                if parsed.scheme != "https" or parsed.hostname != allowed_host:
                    raise self._unavailable()
                current_url = candidate
        if not cookies:
            raise self._rejected()
        return cookies

    def _client(self, *, cookies: dict[str, str] | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            cookies=cookies,
            follow_redirects=False,
            headers=COMMON_HEADERS,
            timeout=httpx.Timeout(self._settings.upstream_timeout_seconds),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            transport=self._transport,
            trust_env=False,
        )

    @staticmethod
    def _unavailable() -> AppError:
        return AppError(
            ErrorCode.UPSTREAM_UNAVAILABLE,
            "学校系统暂时不可用，请稍后重试。",
            status_code=503,
            retryable=True,
        )

    @staticmethod
    def _login_rejected(data: dict[str, Any]) -> AppError:
        """按学校返回的报错区分登录失败原因。

        学校对验证码错误返回 msg=badRandcodekey，对密码错误返回
        "用户名或密码不匹配" 文案；两类错误的处理方式完全不同（前者值得重试，
        后者重试一万次也不会成功），通过 details.smu_reason 传给调用方。
        """
        msg = data.get("msg")
        message = data.get("message")
        text = message if isinstance(message, str) else ""
        if msg == "badRandcodekey" or "验证码" in text:
            return AppError(
                ErrorCode.UPSTREAM_REJECTED,
                "学校验证码校验失败。",
                status_code=401,
                details={"smu_reason": "bad_captcha"},
            )
        if "密码" in text:
            return AppError(
                ErrorCode.UPSTREAM_REJECTED,
                "学校账号或密码不匹配，请更新保存的凭据。",
                status_code=401,
                details={"smu_reason": "bad_credentials"},
            )
        return SmuAcademicClient._rejected()

    @staticmethod
    def _rejected() -> AppError:
        return AppError(
            ErrorCode.UPSTREAM_REJECTED,
            "学校登录失败，请检查账号、密码和验证码。",
            status_code=401,
        )

    @staticmethod
    def _cookie_rejected() -> AppError:
        return AppError(
            ErrorCode.UPSTREAM_REJECTED,
            "Cookie 会话无效或已过期，请重新复制教务系统 Cookie。",
            status_code=401,
        )


def _is_academic_login_page(html: str) -> bool:
    return all(keyword in html for keyword in ("统一认证登录", "扫码登录", "密码登录"))


def _parse_semester_options(html: str) -> list[SemesterOption]:
    match = re.search(
        r"<select[^>]*id=['\"]xnxqdm['\"][^>]*>(.*?)</select>",
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if match is None:
        return []
    options: list[SemesterOption] = []
    seen: set[str] = set()
    for code, label in re.findall(
        r"<option[^>]*value=['\"]?(\d{6})['\"]?[^>]*>([^<]*)</option>",
        match.group(1),
        re.IGNORECASE,
    ):
        if code in seen:
            continue
        seen.add(code)
        label = re.sub(r"\s+", " ", label).strip() or code
        options.append(SemesterOption(code=code, label=label[:32]))
    return options


def _parse_enrollment_categories(html: str) -> list[CourseCategory]:
    patterns = (
        re.compile(
            r'data-href\s*=\s*["\'][^"\']*xklx/(\d+)[^"\']*["\'][^>]*'
            r'lay-iframe\s*=\s*["\']([^"\']+)["\']',
            re.IGNORECASE,
        ),
        re.compile(
            r'lay-iframe\s*=\s*["\']([^"\']+)["\'][^>]*data-href\s*=\s*'
            r'["\'][^"\']*xklx/(\d+)[^"\']*["\']',
            re.IGNORECASE,
        ),
    )
    values: dict[str, str] = {}
    for index, pattern in enumerate(patterns):
        for match in pattern.finditer(html):
            code, title = (
                (match.group(1), match.group(2))
                if index == 0
                else (
                    match.group(2),
                    match.group(1),
                )
            )
            values.setdefault(code, re.sub(r"\s+", " ", title).strip()[:100])
    for code in re.findall(r"/xklx/(\d{1,8})", html, flags=re.IGNORECASE):
        values.setdefault(code, f"类型{code}")
    return [CourseCategory(code=code, title=title) for code, title in values.items()]


def _parse_evaluation_draft(html: str, reference: EvaluationReference) -> EvaluationDraft:
    soup = BeautifulSoup(html, "html.parser")
    hidden_fields: dict[str, str] = {}
    for script in soup.find_all("script"):
        text = script.string or script.get_text()
        if "entss.post" not in text:
            continue
        for key, value in re.findall(r"(\w+)\s*:\s*['\"]([^'\"]*)['\"]", text):
            if len(key) <= 64 and len(value) <= 500:
                hidden_fields[key] = value
        break
    required = {"xnxqdm", "pjlxdm", "teaxm", "kcrwdm", "kcptdm", "kcdm", "jxhjdm"}
    if not required.issubset(hidden_fields):
        raise SmuAcademicClient._unavailable()
    if hidden_fields.get("teadm", reference.teacher_code) != reference.teacher_code:
        raise SmuAcademicClient._unavailable()
    if hidden_fields.get("wjdm", reference.questionnaire_code) != reference.questionnaire_code:
        raise SmuAcademicClient._unavailable()
    safe_hidden = {key: hidden_fields[key] for key in required}
    questions: list[EvaluationQuestion] = []
    seen_indicators: set[str] = set()
    for node in soup.select("div.question")[:100]:
        if not isinstance(node, Tag):
            continue
        indicator_code = _bounded_text(node.get("data-zbdm"), 128)
        type_code = _safe_int(node.get("data-txdm"))
        if not indicator_code or indicator_code in seen_indicators:
            continue
        title_node = node.find("h3")
        title = _bounded_text(title_node.get_text(" ", strip=True) if title_node else "", 500)
        options = _evaluation_options(node, type_code)
        if not options:
            continue
        seen_indicators.add(indicator_code)
        questions.append(
            EvaluationQuestion(
                type_code=type_code,
                indicator_code=indicator_code,
                title=title,
                options=options,
            )
        )
    if not questions:
        raise SmuAcademicClient._unavailable()
    return EvaluationDraft(
        reference=reference,
        teacher_name=_bounded_text(hidden_fields.get("teaxm"), 100),
        course_name=_bounded_text(hidden_fields.get("kcmc") or hidden_fields.get("kcdm"), 200),
        hidden_fields=safe_hidden,
        questions=questions,
    )


def _evaluation_options(node: Tag, type_code: int) -> list[EvaluationOption]:
    raty = node.select_one("div.raty")
    if isinstance(raty, Tag):
        raw = raty.get("data-wtxm")
        if isinstance(raw, str) and len(raw) <= 20_000:
            try:
                values = json.loads(raw)
            except (TypeError, ValueError):
                values = []
            if isinstance(values, list):
                options: list[EvaluationOption] = []
                for value in values[:20]:
                    if not isinstance(value, dict):
                        continue
                    code = _bounded_text(value.get("zbxmdm"), 128)
                    if not code or any(item.code == code for item in options):
                        continue
                    options.append(
                        EvaluationOption(
                            code=code,
                            score=max(0, min(100, _safe_int(value.get("fz")))),
                            label=_bounded_text(
                                value.get("dtjg") or value.get("zbxmmc") or value.get("mc") or code,
                                100,
                            ),
                        )
                    )
                return options
    if type_code == 3:
        return []
    options = []
    for input_node in node.select('input[type="radio"]')[:20]:
        if not isinstance(input_node, Tag):
            continue
        code = _bounded_text(input_node.get("value"), 128)
        if not code or any(item.code == code for item in options):
            continue
        label_node = input_node.find_parent("label")
        label = _bounded_text(label_node.get_text(" ", strip=True) if label_node else code, 100)
        options.append(EvaluationOption(code=code, label=label or code))
    return options


def _validate_evaluation_reference(reference: EvaluationReference) -> None:
    for value in (
        reference.teacher_code,
        reference.class_hour_code,
        reference.questionnaire_code,
    ):
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", value):
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "评课课程标识无效。",
                status_code=422,
            )


def _evaluation_submission_confirmed(response: httpx.Response) -> bool:
    try:
        payload = response.json()
    except ValueError:
        text = response.text.strip()
        return bool(text and "成功" in text and "失败" not in text)
    if not isinstance(payload, dict):
        return False
    code = payload.get("code")
    return payload.get("success") is True or code == 0 or code == "0"


def _evaluation_result_unknown() -> AppError:
    return AppError(
        ErrorCode.RESULT_UNKNOWN,
        "评课提交结果未知，请先在教务系统核验。",
        status_code=502,
        details={"next_action": "verify_upstream"},
    )


def _bounded_text(value: object, limit: int) -> str:
    if not isinstance(value, (str, int, float)):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()[:limit]


def _safe_int(value: object, *, default: int = 0) -> int:
    if not isinstance(value, (str, bytes, bytearray, int, float)):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: object) -> float:
    if not isinstance(value, (str, bytes, bytearray, int, float)):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _course_item(row: dict[str, Any]) -> CourseItem:
    return CourseItem(
        task_code=str(row.get("kcrwdm") or ""),
        name=str(row.get("kcmc") or ""),
        teacher=str(row.get("teaxm") or ""),
        selected_count=max(0, _safe_int(row.get("pkrs"))),
        capacity=max(0, _safe_int(row.get("xkrs"))),
        credits=max(0, _safe_float(row.get("xf"))),
        hours=max(0, _safe_float(row.get("zxs"))),
        schedule=str(row.get("sksj") or "")[:500],
        location=str(row.get("skdd") or "")[:300],
        department=str(row.get("kkbmmc") or "")[:200],
    )


def _parse_grade_ranking(html: str) -> RankingInfo | None:
    soup = BeautifulSoup(html, "html.parser")
    parsed: dict[str, list[int]] = {}
    for row in soup.select("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in row.select("th,td")]
        if not cells:
            continue
        kind = next((name for name in ("课程", "教学班") if name in cells[0]), None)
        if kind is None:
            continue
        values = [_safe_int(value) for value in cells[2:9]]
        if len(values) == 7:
            parsed[kind] = values
    course = parsed.get("课程")
    class_group = parsed.get("教学班")
    if course is None or class_group is None:
        return None
    return RankingInfo(
        course_rank=course[6],
        course_total=course[5],
        class_rank=class_group[6],
        class_total=class_group[5],
        distribution=GradeDistribution(
            lt60=course[0],
            s60to70=course[1],
            s70to80=course[2],
            s80to90=course[3],
            gte90=course[4],
        ),
    )
