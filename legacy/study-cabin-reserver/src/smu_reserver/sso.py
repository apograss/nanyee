import asyncio
import hashlib
from typing import Protocol
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import httpx

from smu_reserver.infospace import InfospaceError

INFOSPACE_APP_ID = "3458975"


class CaptchaSolver(Protocol):
    async def solve(self, image: bytes) -> str: ...


class DdddOcrSolver:
    def __init__(self) -> None:
        self._ocr = None

    async def solve(self, image: bytes) -> str:
        return await asyncio.to_thread(self._solve_sync, image)

    def _solve_sync(self, image: bytes) -> str:
        if self._ocr is None:
            try:
                import ddddocr
            except ImportError as error:
                raise RuntimeError("未安装 ddddocr，无法识别登录验证码") from error
            self._ocr = ddddocr.DdddOcr(show_ad=False, beta=True)
        result = str(self._ocr.classification(image)).strip()
        if len(result) != 4:
            raise InfospaceError("验证码识别结果格式错误")
        return result


class SsoAuthenticator:
    def __init__(
        self,
        *,
        infospace_origin: str,
        uis_origin: str,
        solver: CaptchaSolver,
    ) -> None:
        self.infospace_origin = infospace_origin.rstrip("/")
        self.uis_origin = uis_origin.rstrip("/")
        self.solver = solver

    async def login(self, account: str, password: str) -> str:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(20, connect=10),
            trust_env=False,
        ) as client:
            response = await client.get(
                f"{self.infospace_origin}/authcenter/toLoginPage",
                params={
                    "redirectUrl": self.infospace_origin,
                    "queryParam": "",
                    "typeCode": "",
                    "extInfo": '{"consoleType":"16","manager":false}',
                },
            )
            response.raise_for_status()
            service = parse_qs(urlparse(str(response.url)).query).get("service", [""])[0]
            if not service:
                raise InfospaceError("无法获取 infospace SSO service 地址")

            captcha_response = await client.get(f"{self.uis_origin}/imageServlet.do")
            captcha_response.raise_for_status()
            captcha = await self.solver.solve(captcha_response.content)
            login_response = await client.post(
                f"{self.uis_origin}/login/login.do",
                data={
                    "loginName": account,
                    "password": hashlib.md5(password.encode()).hexdigest(),  # noqa: S324
                    "randcodekey": captcha,
                    "locationBrowser": "谷歌浏览器[Chrome]",
                    "appid": INFOSPACE_APP_ID,
                    "redirect": service,
                    "strength": 3,
                },
            )
            login_response.raise_for_status()
            try:
                payload = login_response.json()
            except ValueError as error:
                raise InfospaceError("SSO 登录响应格式错误") from error
            ticket = str(payload.get("ticket") or "")
            if not ticket:
                raise InfospaceError(str(payload.get("message") or "SSO 登录失败"))

            service_url = _with_query(service, ticket=ticket)
            callback_response = await client.get(service_url)
            callback_response.raise_for_status()
            cookies = "; ".join(f"{name}={value}" for name, value in client.cookies.items())
            if "ic-cookie=" not in cookies:
                raise InfospaceError("SSO 登录后未获取到 infospace Cookie")
            return cookies


def _with_query(url: str, **values: str) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    query.update({key: [value] for key, value in values.items()})
    encoded = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=encoded))
