from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from dataclasses import dataclass
from time import monotonic
from typing import TYPE_CHECKING, Protocol

import httpx

from nanyee.config import Settings
from nanyee.integrations.egress import egress_transport_from_settings
from nanyee.integrations.infospace.client import UpstreamUnavailable

if TYPE_CHECKING:
    from playwright.async_api import BrowserContext, Page, Route

MAX_CAPTCHA_ATTEMPTS = 4
MAX_OCR_RETRIES = 3
LOGIN_RESPONSE_TIMEOUT_SECONDS = 20
SESSION_COOKIE_TIMEOUT_SECONDS = 30


class AuthenticationRejected(RuntimeError):
    pass


class CaptchaSolver(Protocol):
    async def solve(self, image: bytes) -> str: ...


@dataclass(frozen=True, slots=True)
class InfospaceSession:
    token: str
    acc_no: str
    display_name: str
    cookies: dict[str, str]


class BrowserLoginDriver(Protocol):
    """测试接缝：真浏览器完成 UIS CAS 登录，带回 infospace 会话 cookie。"""

    async def acquire_session_cookies(
        self, account: str, password: str, solver: CaptchaSolver
    ) -> dict[str, str]: ...


class PlaywrightBrowserLogin:
    """在 Chromium 里走完 UIS 登录页（含验证码 OCR），换取 ic-cookie。

    学校网关对 login.do 做客户端风控：非真实浏览器 TLS 指纹提交的登录即使
    返回 ticket/uniToken，auth/token 也拒绝兑换（200 空响应，不种 ic-cookie）。
    因此登录这一段必须用真浏览器；拿到 ic-cookie 后的 API 调用仍走 httpx。
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def acquire_session_cookies(
        self, account: str, password: str, solver: CaptchaSolver
    ) -> dict[str, str]:
        from playwright.async_api import async_playwright

        base = self._settings.smu_infospace_base_url.rstrip("/")
        origin = base[: -len("/ic-web")] if base.endswith("/ic-web") else base

        login_payloads: list[dict[str, object]] = []

        async def intercept_login(route: Route) -> None:
            # 自己发请求拿响应体再 fulfill 给页面：login.do 成功后页面立刻跳转，
            # 事件/expect_response 拿到的 Response 读体时已被导航销毁。
            response = await route.fetch()
            try:
                payload = json.loads(await response.text())
            except Exception:
                payload = None
            if isinstance(payload, dict):
                login_payloads.append(payload)
            await route.fulfill(response=response)

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True, args=self._settings.playwright_launch_args
            )
            try:
                context = await browser.new_context()
                await context.route("**/login/login.do", intercept_login)
                page = await context.new_page()
                await page.goto(f"{origin}/", wait_until="domcontentloaded")
                await page.wait_for_selector('input[type="password"]', timeout=20000)

                last_error: Exception | None = None
                for _attempt in range(MAX_CAPTCHA_ATTEMPTS):
                    captcha = await self._solve_captcha(page, solver)
                    if captcha is None:
                        last_error = UpstreamUnavailable("UIS captcha recognition failed")
                        continue
                    if not await self._fill_login_form(page, account, password, captcha):
                        raise UpstreamUnavailable("UIS login page layout changed")
                    payload = await self._submit_and_wait(page, login_payloads)
                    if payload is None:
                        raise UpstreamUnavailable("UIS login did not respond")
                    ticket = payload.get("ticket")
                    if isinstance(ticket, str) and ticket:
                        return await self._wait_session_cookies(context, origin)
                    message = str(payload.get("message") or "")
                    if "验证码" in message:
                        last_error = AuthenticationRejected(message)
                        continue
                    raise AuthenticationRejected(message or "UIS rejected the credentials")
                raise UpstreamUnavailable("UIS captcha recognition failed") from last_error
            finally:
                await browser.close()

    @staticmethod
    async def _submit_and_wait(
        page: Page, payloads: list[dict[str, object]]
    ) -> dict[str, object] | None:
        from playwright.async_api import Error as PlaywrightError

        mark = len(payloads)
        try:
            await page.click(
                '#AccountLogin, button:has-text("登"), input[type="submit"], .login-btn',
                timeout=3000,
            )
        except PlaywrightError as exc:
            raise UpstreamUnavailable("UIS login page layout changed") from exc
        deadline = monotonic() + LOGIN_RESPONSE_TIMEOUT_SECONDS
        while monotonic() < deadline:
            if len(payloads) > mark:
                return payloads[-1]
            await asyncio.sleep(0.3)
        return None

    async def _solve_captcha(self, page: Page, solver: CaptchaSolver) -> str | None:
        for _ in range(MAX_OCR_RETRIES):
            img = await page.query_selector('img[src*="imageServlet"]')
            if img is None:
                return None
            try:
                return await solver.solve(await img.screenshot())
            except Exception:
                # OCR 结果不可用或元素已刷新：点图换一张再试
                try:
                    await img.click()
                    await page.wait_for_timeout(700)
                except Exception:
                    return None
        return None

    @staticmethod
    async def _fill_first(page: Page, selectors: list[str], value: str) -> bool:
        for selector in selectors:
            with suppress(Exception):
                # 选择器不存在或不可编辑时换下一个
                await page.fill(selector, value, timeout=1500)
                return True
        return False

    async def _fill_login_form(self, page: Page, account: str, password: str, captcha: str) -> bool:
        if not await self._fill_first(
            page, ['input[name="loginName"]', 'input[type="text"]'], account
        ):
            return False
        if not await self._fill_first(
            page, ['input[name="password"]', 'input[type="password"]'], password
        ):
            return False
        if await self._fill_first(
            page,
            ['input[name="randcodekey"]', 'input[placeholder*="验证码"]', 'input[name*="rand"]'],
            captcha,
        ):
            return True
        # 兜底：验证码框是页面上最后一个可见文本框
        inputs = await page.query_selector_all("input:visible")
        text_inputs = [i for i in inputs if (await i.get_attribute("type")) in (None, "text")]
        if len(text_inputs) >= 2:
            await text_inputs[-1].fill(captcha)
            return True
        return False

    @staticmethod
    async def _wait_session_cookies(context: BrowserContext, origin: str) -> dict[str, str]:
        deadline = monotonic() + SESSION_COOKIE_TIMEOUT_SECONDS
        while monotonic() < deadline:
            jar = {cookie["name"]: cookie["value"] for cookie in await context.cookies(origin)}
            if jar.get("ic-cookie"):
                return jar
            await asyncio.sleep(0.4)
        raise UpstreamUnavailable("Infospace did not issue a session cookie")


class SsoAuthenticator:
    """UIS 统一认证登录，换取 infospace API token。

    学校网关对 login.do 做客户端风控（非真实浏览器提交的登录换不到
    ic-cookie），登录由 PlaywrightBrowserLogin 在 Chromium 内完成；
    随后用 ic-cookie 调 /ic-web/auth/userInfo 取 data.token（32 位 hex），
    即之后所有 /ic-web 接口的 token 头。
    """

    def __init__(
        self,
        settings: Settings,
        solver: CaptchaSolver,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        driver: BrowserLoginDriver | None = None,
    ) -> None:
        self._settings = settings
        self._solver = solver
        self._transport = transport or egress_transport_from_settings(settings)
        self._driver = driver or PlaywrightBrowserLogin(settings)

    async def login(self, account: str, password: str) -> InfospaceSession:
        try:
            cookies = await self._driver.acquire_session_cookies(account, password, self._solver)
        except (AuthenticationRejected, UpstreamUnavailable):
            raise
        except Exception as exc:
            raise UpstreamUnavailable("Infospace browser login failed") from exc
        return await self._fetch_session(cookies)

    async def _fetch_session(self, cookies: dict[str, str]) -> InfospaceSession:
        base = self._settings.smu_infospace_base_url.rstrip("/")
        try:
            async with self._client(cookies) as client:
                response = await client.get(
                    f"{base}/auth/userInfo",
                    headers={"lan": "1", "Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise UpstreamUnavailable("Infospace user info request failed") from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamUnavailable("Infospace user info response is invalid") from exc
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict) or payload.get("code") != 0:
            raise UpstreamUnavailable("Infospace user info response is incomplete")
        token = data.get("token")
        acc_no = data.get("accNo")
        if not isinstance(token, str) or not token or not isinstance(acc_no, (str, int)):
            raise UpstreamUnavailable("Infospace user info response is incomplete")
        return InfospaceSession(
            token=token,
            acc_no=str(acc_no),
            display_name=str(data.get("trueName") or data.get("logonName") or ""),
            cookies=cookies,
        )

    def _client(self, cookies: dict[str, str] | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            cookies=cookies,
            follow_redirects=False,
            timeout=httpx.Timeout(self._settings.upstream_timeout_seconds),
            trust_env=False,
            transport=self._transport,
        )
