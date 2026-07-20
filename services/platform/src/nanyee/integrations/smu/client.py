from __future__ import annotations

import asyncio
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup, Tag

from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.tools.course_selection import CourseCategory, CourseItem, EnrollmentResult
from nanyee.tools.evaluation import (
    EvaluationDraft,
    EvaluationOption,
    EvaluationQuestion,
    EvaluationReference,
    EvaluationResult,
    PendingEvaluation,
)
from nanyee.tools.grades import GradeRecord, parse_grades
from nanyee.tools.timetable import CourseEvent

COMMON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9",
}


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
        self._transport = transport

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

    async def fetch_timetable(
        self, *, academic_cookies: dict[str, str], total_weeks: int
    ) -> tuple[str, list[CourseEvent]]:
        if total_weeks < 1 or total_weeks > 30:
            raise ValueError("total_weeks must be between 1 and 30")
        async with self._client(cookies=academic_cookies) as client:
            try:
                page = await client.get(
                    f"{self._settings.smu_academic_base_url}/new/student/xsgrkb/main.page",
                    headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
                )
            except httpx.HTTPError as exc:
                raise self._unavailable() from exc
            self._ensure_success(page)
            match = re.search(r"xnxqdm=(\d+)", page.text)
            if match is None:
                raise self._rejected()
            semester_code = match.group(1)
            events: list[CourseEvent] = []
            for start in range(1, total_weeks + 1, 5):
                weeks = range(start, min(start + 5, total_weeks + 1))
                batches = await asyncio.gather(
                    *(self._fetch_week(client, semester_code, week) for week in weeks)
                )
                for batch in batches:
                    events.extend(batch)
        return semester_code, events

    async def fetch_grades(self, *, academic_cookies: dict[str, str]) -> list[GradeRecord]:
        base = self._settings.smu_academic_base_url
        async with self._client(cookies=academic_cookies) as client:
            try:
                page = await client.get(
                    f"{base}/new/student/xskccj/kccjList.page",
                    headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
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
            return parse_grades(response.json())
        except (ValueError, TypeError) as exc:
            raise self._unavailable() from exc

    async def fetch_enrollment_categories(
        self, *, academic_cookies: dict[str, str]
    ) -> list[CourseCategory]:
        base = self._settings.smu_academic_base_url
        async with self._client(cookies=academic_cookies) as client:
            try:
                await client.get(
                    f"{base}/new/welcome.page?ui=new",
                    headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
                )
                response = await client.get(
                    f"{base}/new/student/xsxk/",
                    headers={**COMMON_HEADERS, "Accept": "text/html,*/*"},
                )
            except httpx.HTTPError as exc:
                raise self._unavailable() from exc
        self._ensure_success(response)
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
                        "hlct": "0",
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
        else:
            outcome = "rejected"
            success = False
        return EnrollmentResult(success=success, course_name=course.name, outcome=outcome)

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
        if not isinstance(ticket, str) or not ticket or len(ticket) > 2048:
            raise self._rejected()
        return ticket

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
    def _rejected() -> AppError:
        return AppError(
            ErrorCode.UPSTREAM_REJECTED,
            "学校登录失败，请检查账号、密码和验证码。",
            status_code=401,
        )


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
