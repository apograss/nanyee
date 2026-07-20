from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any

import httpx

from smu_reserver.reservation import ReservationPayload


class InfospaceError(RuntimeError):
    """Base error for sanitized target-system failures."""


class SessionExpired(InfospaceError):
    pass


class SubmissionUnknown(InfospaceError):
    pass


class BusinessError(InfospaceError):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class UserInfo:
    acc_no: str
    display_name: str
    token: str


@dataclass(frozen=True)
class RoomKind:
    kind_id: int
    name: str


@dataclass(frozen=True)
class TimeBlock:
    start: time
    end: time


@dataclass(frozen=True)
class RoomAvailability:
    dev_id: int
    name: str
    open_start: time
    open_end: time
    freezing_minutes: int
    blocks: list[TimeBlock] = field(default_factory=list)


class InfospaceClient:
    def __init__(
        self,
        base_url: str,
        *,
        cookie: str,
        token: str | None = None,
        timeout: httpx.Timeout | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.cookie = cookie
        self.token = token
        self.timeout = timeout or httpx.Timeout(15, connect=8)

    async def get_user_info(self) -> UserInfo:
        data = await self._request("GET", "auth/userInfo")
        token = str(data.get("token") or "")
        if not token:
            raise InfospaceError("登录响应缺少 token")
        self.token = token
        return UserInfo(
            acc_no=str(data.get("accNo") or ""),
            display_name=str(data.get("logonName") or ""),
            token=token,
        )

    async def list_room_kinds(self) -> list[RoomKind]:
        data = await self._request("GET", "roomMenu")
        if not isinstance(data, list):
            raise InfospaceError("学习舱分类响应格式错误")
        return [
            RoomKind(kind_id=int(item["kindId"]), name=str(item["kindName"]))
            for item in data
        ]

    async def list_rooms(self, target_date: date, *, kind_id: int) -> list[RoomAvailability]:
        data = await self._request(
            "GET",
            "reserve",
            params={
                "sysKind": 1,
                "resvDates": target_date.strftime("%Y%m%d"),
                "kindIds": kind_id,
                "page": 1,
                "pageSize": 100,
            },
        )
        if not isinstance(data, list):
            raise InfospaceError("学习舱列表响应格式错误")
        return [self._parse_room(item) for item in data]

    async def reserve(self, payload: ReservationPayload) -> None:
        await self._request("POST", "reserve", json=payload.as_dict())

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        headers = {"Cookie": self.cookie, "lan": "1", "Accept": "application/json"}
        if self.token:
            headers["token"] = self.token
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout, follow_redirects=False, trust_env=False
            ) as client:
                response = await client.request(
                    method,
                    self.base_url + path.lstrip("/"),
                    headers=headers,
                    params=params,
                    json=json,
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPError as error:
            if method.upper() == "POST":
                raise SubmissionUnknown("预约提交结果未知，已暂停以避免重复提交") from error
            raise InfospaceError("访问预约系统失败") from error
        except ValueError as error:
            if method.upper() == "POST":
                raise SubmissionUnknown("预约提交响应无法确认，已暂停以避免重复提交") from error
            raise InfospaceError("预约系统响应格式错误") from error

        code = int(payload.get("code", -1))
        message = str(payload.get("message") or "预约系统返回错误")
        if code == 300:
            raise SessionExpired(message)
        if code != 0:
            raise BusinessError(code, message)
        return payload.get("data")

    @staticmethod
    def _parse_room(item: dict[str, Any]) -> RoomAvailability:
        blocks: list[TimeBlock] = []
        for reservation in item.get("resvInfo") or []:
            if int(reservation.get("resvStatus") or 0) & 128:
                continue
            blocks.append(
                TimeBlock(
                    start=_parse_time(reservation.get("startTime")),
                    end=_parse_time(reservation.get("endTime")),
                )
            )
        for closure in item.get("cls") or []:
            blocks.append(
                TimeBlock(
                    start=_parse_time(closure.get("startTime") or closure.get("start")),
                    end=_parse_time(closure.get("endTime") or closure.get("end")),
                )
            )
        rule = item.get("resvRule") or {}
        return RoomAvailability(
            dev_id=int(item["devId"]),
            name=str(item.get("devName") or item["devId"]),
            open_start=_parse_time(item.get("openStart")),
            open_end=_parse_time(item.get("openEnd")),
            freezing_minutes=int(rule.get("freezingTime") or 0),
            blocks=blocks,
        )


def _parse_time(value: Any) -> time:
    text = str(value or "")
    if " " in text:
        text = text.rsplit(" ", 1)[-1]
    return datetime.strptime(text[:5], "%H:%M").time()
