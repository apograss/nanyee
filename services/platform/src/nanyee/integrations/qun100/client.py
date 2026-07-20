from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import quote, unquote, urljoin, urlparse

import httpx

from nanyee.config import Settings

QUN100_APP_ID = "wxfc4ef6d539d03373"


class Qun100Error(RuntimeError):
    pass


class Qun100Unavailable(Qun100Error):
    pass


class Qun100Rejected(Qun100Error):
    def __init__(self, code: int | str | None = None) -> None:
        super().__init__("Qun100 rejected the request")
        self.code = code


class Qun100SubmissionUnknown(Qun100Error):
    pass


class Qun100Client:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._base_url = settings.qun100_base_url.rstrip("/")
        self._transport = transport

    async def verify_token(self, token: str) -> dict[str, Any]:
        response = await self._request("GET", "/v1/storage_space/status", token=token)
        return self._require_success(response)

    async def resolve_form_id(self, input_value: str) -> str | None:
        text = input_value.strip()
        direct = _extract_form_id(text)
        if direct is not None:
            return direct
        candidate = text if text.startswith(("http://", "https://")) else f"https://{text}"
        parsed = urlparse(candidate)
        if parsed.scheme != "https" or not _is_qun100_host(parsed.hostname):
            return None
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self._settings.upstream_timeout_seconds),
                follow_redirects=False,
                trust_env=False,
                transport=self._transport,
            ) as client:
                response = await client.get(candidate, headers={"User-Agent": "Mozilla/5.0"})
        except httpx.HTTPError as exc:
            raise Qun100Unavailable("Qun100 share link request failed") from exc
        location = response.headers.get("location", "")
        if location:
            resolved = urljoin(candidate, location)
            if not _is_qun100_host(urlparse(resolved).hostname):
                return None
            return _extract_form_id(unquote(resolved))
        return _extract_form_id(unquote(str(response.url)))

    async def list_active_forms(self, token: str) -> list[dict[str, Any]]:
        response = await self._request(
            "GET",
            "/v2/creation_forms?pageNo=1&pageSize=20&folderId=&forDraft=false",
            token=token,
        )
        data = self._require_success(response)
        groups = data.get("creations", {})
        if not isinstance(groups, dict):
            raise Qun100Unavailable("invalid forms response")
        forms: list[dict[str, Any]] = []
        seen: set[str] = set()
        for items in groups.values():
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                form_id = str(item.get("formId") or "")
                if not form_id or form_id in seen:
                    continue
                seen.add(form_id)
                forms.append(item)
        return forms

    async def load_form_details(self, form_id: str, token: str) -> dict[str, Any]:
        profile, catalogs, last = await asyncio.gather(
            self._request("GET", f"/v1/form/{quote(form_id)}/profile", token=token),
            self._request("GET", f"/v1/form/{quote(form_id)}/catalog", token=token),
            self._optional_last_record(form_id, token),
        )
        profile_data = self._require_success(profile)
        catalog_data = self._require_success(catalogs)
        catalog_items = catalog_data.get("catalogs", [])
        if not isinstance(catalog_items, list):
            raise Qun100Unavailable("invalid catalog response")
        return {
            "profile": profile_data,
            "catalogs": [item for item in catalog_items if isinstance(item, dict)],
            "last_record": last,
        }

    async def get_upload_credentials(self, token: str) -> dict[str, Any]:
        response = await self._request("GET", "/v2/image/pre_upload?fileNum=1", token=token)
        return self._require_success(response)

    async def submit(
        self,
        form_id: str,
        *,
        form_version: str | int,
        catalogs: list[dict[str, Any]],
        token: str,
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            f"/v1/{quote(form_id)}/form_data",
            token=token,
            json={
                "fid": "",
                "subscribe": {},
                "catalogs": catalogs,
                "showQuestions": [item["cid"] for item in catalogs],
                "formVersion": form_version,
            },
        )
        code = response.get("code")
        if code != 0:
            raise Qun100Rejected(code)
        data = response.get("data")
        return data if isinstance(data, dict) else {}

    async def _optional_last_record(self, form_id: str, token: str) -> dict[str, Any] | None:
        try:
            response = await self._request(
                "GET", f"/v1/{quote(form_id)}/form_data/last", token=token
            )
            data = self._require_success(response)
        except Qun100Error:
            return None
        value = data.get("formDataDto")
        return value if isinstance(value, dict) else None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": token,
            "Client-App-Id": QUN100_APP_ID,
            "xweb_xhr": "1",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "MicroMessenger/7.0.20 MiniProgramEnv/Windows"
            ),
            "Referer": f"https://servicewechat.com/{QUN100_APP_ID}/305/page-frame.html",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self._settings.upstream_timeout_seconds),
                follow_redirects=False,
                trust_env=False,
                transport=self._transport,
            ) as client:
                response = await client.request(
                    method,
                    f"{self._base_url}{path}",
                    headers=headers,
                    json=json,
                )
        except httpx.HTTPError as exc:
            if method == "POST":
                raise Qun100SubmissionUnknown("Qun100 submission result is unknown") from exc
            raise Qun100Unavailable("Qun100 request failed") from exc
        if response.is_redirect or response.status_code != 200 or self._too_large(response):
            if method == "POST":
                raise Qun100SubmissionUnknown("Qun100 submission response is unknown")
            raise Qun100Unavailable("Qun100 returned an invalid response")
        try:
            payload = response.json()
        except ValueError as exc:
            if method == "POST":
                raise Qun100SubmissionUnknown("Qun100 submission response is invalid") from exc
            raise Qun100Unavailable("Qun100 response is invalid") from exc
        if not isinstance(payload, dict):
            if method == "POST":
                raise Qun100SubmissionUnknown("Qun100 submission response is invalid")
            raise Qun100Unavailable("Qun100 response is invalid")
        return payload

    def _too_large(self, response: httpx.Response) -> bool:
        raw_length = response.headers.get("content-length")
        if raw_length:
            try:
                if int(raw_length) > self._settings.upstream_max_response_bytes:
                    return True
            except ValueError:
                return True
        return len(response.content) > self._settings.upstream_max_response_bytes

    @staticmethod
    def _require_success(response: dict[str, Any]) -> dict[str, Any]:
        code = response.get("code")
        if code != 0:
            raise Qun100Rejected(code)
        data = response.get("data")
        if not isinstance(data, dict):
            raise Qun100Unavailable("Qun100 response data is invalid")
        return data


def _extract_form_id(value: str) -> str | None:
    import re

    if re.fullmatch(r"\d{15,32}", value):
        return value
    match = re.search(r"(?:formId|fid)[=:]\s*(\d{15,32})", value, re.IGNORECASE)
    return match.group(1) if match else None


def _is_qun100_host(hostname: str | None) -> bool:
    return bool(hostname and (hostname == "qun100.com" or hostname.endswith(".qun100.com")))
