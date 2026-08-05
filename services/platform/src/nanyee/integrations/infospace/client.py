from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from nanyee.config import Settings
from nanyee.integrations.egress import egress_transport_from_settings
from nanyee.tools.study_cabin import ReservationPayload, RoomAvailability, TimeBlock


class InfospaceError(RuntimeError):
    """Base class for sanitized Infospace failures."""


class UpstreamUnavailable(InfospaceError):
    pass


class SessionExpired(InfospaceError):
    pass


class SubmissionUnknown(InfospaceError):
    pass


class BusinessError(InfospaceError):
    def __init__(self, code: int) -> None:
        super().__init__("Infospace rejected the request")
        self.code = code


@dataclass(frozen=True, slots=True)
class UserInfo:
    acc_no: str
    display_name: str
    token: str


class InfospaceClient:
    def __init__(
        self,
        settings: Settings,
        *,
        cookies: dict[str, str] | None = None,
        token: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._base_url = settings.smu_infospace_base_url.rstrip("/") + "/"
        self._cookies = cookies
        self._token = token
        self._transport = transport or egress_transport_from_settings(settings)

    async def get_user_info(self) -> UserInfo:
        data = await self._request("GET", "auth/userInfo")
        if not isinstance(data, dict):
            raise UpstreamUnavailable("invalid user info response")
        token = data.get("token")
        account = data.get("accNo")
        if not isinstance(token, str) or not token or not isinstance(account, str) or not account:
            raise UpstreamUnavailable("incomplete user info response")
        self._token = token
        return UserInfo(
            acc_no=account,
            display_name=str(data.get("logonName") or ""),
            token=token,
        )

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
            raise UpstreamUnavailable("invalid room list response")
        try:
            return [self._parse_room(item) for item in data if isinstance(item, dict)]
        except (KeyError, TypeError, ValueError) as exc:
            raise UpstreamUnavailable("invalid room data") from exc

    async def reserve(self, payload: ReservationPayload) -> None:
        await self._request("POST", "reserve", json=payload.as_dict())

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str | int | float | bool | None] | None = None,
        json: dict[str, object] | None = None,
    ) -> Any:
        url = urljoin(self._base_url, path.lstrip("/"))
        if urlparse(url).hostname != urlparse(self._base_url).hostname:
            raise UpstreamUnavailable("invalid upstream URL")
        headers = {"lan": "1", "Accept": "application/json"}
        if self._token:
            headers["token"] = self._token
        try:
            async with httpx.AsyncClient(
                cookies=self._cookies,
                timeout=httpx.Timeout(self._settings.upstream_timeout_seconds),
                follow_redirects=False,
                trust_env=False,
                transport=self._transport,
            ) as client:
                response = await client.request(
                    method,
                    url,
                    headers=headers,
                    params=params,
                    json=json,
                )
        except httpx.HTTPError as exc:
            if method == "POST":
                raise SubmissionUnknown("reservation result is unknown") from exc
            raise UpstreamUnavailable("Infospace request failed") from exc
        if response.is_redirect:
            if method == "POST":
                raise SubmissionUnknown("reservation redirect result is unknown")
            raise SessionExpired("Infospace session expired")
        if response.status_code != 200 or self._response_too_large(response):
            if method == "POST":
                raise SubmissionUnknown("reservation response cannot be confirmed")
            raise UpstreamUnavailable("Infospace returned an invalid response")
        try:
            envelope = response.json()
        except ValueError as exc:
            if method == "POST":
                raise SubmissionUnknown("reservation response cannot be decoded") from exc
            raise UpstreamUnavailable("Infospace response cannot be decoded") from exc
        if not isinstance(envelope, dict):
            if method == "POST":
                raise SubmissionUnknown("reservation response envelope is invalid")
            raise UpstreamUnavailable("Infospace response envelope is invalid")
        try:
            code = int(envelope.get("code", -1))
        except (TypeError, ValueError) as exc:
            if method == "POST":
                raise SubmissionUnknown("reservation response code is invalid") from exc
            raise UpstreamUnavailable("Infospace response code is invalid") from exc
        if code == 300:
            raise SessionExpired("Infospace session expired")
        if code != 0:
            raise BusinessError(code)
        return envelope.get("data")

    def _response_too_large(self, response: httpx.Response) -> bool:
        content_length = response.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self._settings.upstream_max_response_bytes:
                    return True
            except ValueError:
                return True
        return len(response.content) > self._settings.upstream_max_response_bytes

    @staticmethod
    def _parse_room(item: dict[str, Any]) -> RoomAvailability:
        blocks: list[TimeBlock] = []
        for reservation in item.get("resvInfo") or []:
            if not isinstance(reservation, dict):
                continue
            if int(reservation.get("resvStatus") or 0) & 128:
                continue
            blocks.append(
                TimeBlock(
                    start=_parse_time(reservation.get("startTime")),
                    end=_parse_time(reservation.get("endTime")),
                )
            )
        for closure in item.get("cls") or []:
            if not isinstance(closure, dict):
                continue
            blocks.append(
                TimeBlock(
                    start=_parse_time(closure.get("startTime") or closure.get("start")),
                    end=_parse_time(closure.get("endTime") or closure.get("end")),
                )
            )
        rule = item.get("resvRule") or {}
        if not isinstance(rule, dict):
            rule = {}
        return RoomAvailability(
            dev_id=int(item["devId"]),
            name=str(item.get("devName") or item["devId"]),
            open_start=_parse_time(item.get("openStart")),
            open_end=_parse_time(item.get("openEnd")),
            freezing_minutes=int(rule.get("freezingTime") or 0),
            blocks=tuple(blocks),
        )


def _parse_time(value: object) -> time:
    text = str(value or "")
    if " " in text:
        text = text.rsplit(" ", 1)[-1]
    return datetime.strptime(text[:5], "%H:%M").time()
