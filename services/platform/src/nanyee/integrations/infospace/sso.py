from __future__ import annotations

import hashlib
from typing import Protocol
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

import httpx

from nanyee.config import Settings
from nanyee.integrations.infospace.client import UpstreamUnavailable

INFOSPACE_APP_ID = "3458975"


class CaptchaSolver(Protocol):
    async def solve(self, image: bytes) -> str: ...


class AuthenticationRejected(RuntimeError):
    pass


class SsoAuthenticator:
    def __init__(
        self,
        settings: Settings,
        solver: CaptchaSolver,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._solver = solver
        self._transport = transport
        self._allowed_hosts = {
            urlparse(settings.smu_infospace_base_url).hostname,
            urlparse(settings.smu_uis_base_url).hostname,
        }

    async def login(self, account: str, password: str) -> dict[str, str]:
        infospace = self._settings.smu_infospace_base_url.rstrip("/")
        uis = self._settings.smu_uis_base_url.rstrip("/")
        try:
            async with self._client() as client:
                page = await self._follow_get(
                    client,
                    f"{infospace}/authcenter/toLoginPage",
                    params={
                        "redirectUrl": infospace,
                        "queryParam": "",
                        "typeCode": "",
                        "extInfo": '{"consoleType":"16","manager":false}',
                    },
                )
                service = parse_qs(page.request.url.query.decode()).get("service", [""])[0]
                self._validate_url(service, expected_host=urlparse(infospace).hostname)
                captcha_response = await client.get(f"{uis}/imageServlet.do")
                if captcha_response.status_code != 200 or not captcha_response.content:
                    raise UpstreamUnavailable("captcha request failed")
                captcha = (await self._solver.solve(captcha_response.content)).strip()
                if len(captcha) != 4 or not captcha.isalnum():
                    raise UpstreamUnavailable("captcha solver returned an invalid result")
                response = await client.post(
                    f"{uis}/login/login.do",
                    data={
                        "loginName": account,
                        "password": hashlib.md5(
                            password.encode(), usedforsecurity=False
                        ).hexdigest(),
                        "randcodekey": captcha,
                        "locationBrowser": "谷歌浏览器[Chrome]",
                        "appid": INFOSPACE_APP_ID,
                        "redirect": service,
                        "strength": 3,
                    },
                )
                if response.status_code != 200:
                    raise AuthenticationRejected("SSO rejected the login")
                try:
                    payload = response.json()
                except ValueError as exc:
                    raise AuthenticationRejected("SSO returned an invalid response") from exc
                if not isinstance(payload, dict):
                    raise AuthenticationRejected("SSO returned an invalid response")
                ticket = payload.get("ticket")
                if not isinstance(ticket, str) or not ticket or len(ticket) > 2048:
                    raise AuthenticationRejected("SSO did not issue a ticket")
                await self._follow_get(client, _with_query(service, ticket=ticket))
                cookies = dict(client.cookies)
        except httpx.HTTPError as exc:
            raise UpstreamUnavailable("SSO request failed") from exc
        if "ic-cookie" not in cookies:
            raise AuthenticationRejected("Infospace session cookie was not issued")
        return cookies

    async def _follow_get(
        self,
        client: httpx.AsyncClient,
        url: str,
        *,
        params: dict[str, str] | None = None,
    ) -> httpx.Response:
        self._validate_url(url)
        response = await client.get(url, params=params)
        for _ in range(5):
            location = response.headers.get("location")
            if not response.is_redirect or not location:
                return response
            candidate = urljoin(str(response.request.url), location)
            self._validate_url(candidate)
            response = await client.get(candidate)
        raise UpstreamUnavailable("SSO redirect limit exceeded")

    def _validate_url(self, url: str, *, expected_host: str | None = None) -> None:
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in self._allowed_hosts
            or (expected_host is not None and parsed.hostname != expected_host)
        ):
            raise UpstreamUnavailable("SSO returned an untrusted URL")

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(self._settings.upstream_timeout_seconds),
            trust_env=False,
            transport=self._transport,
        )


def _with_query(url: str, **values: str) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    query.update({key: [value] for key, value in values.items()})
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
