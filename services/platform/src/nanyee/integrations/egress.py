"""学校侧出口代理（Cloudflare Worker 多 IP 池）的 httpx 传输层。

将每个请求改写为对 Worker 的调用：原始目标 URL 放进 X-Proxy-Target 头，
认证用 X-Proxy-Token。Worker 端只做白名单透传（见 infra/cloudflare/egress-proxy/worker.js）。

注意：httpx 传输层的 trust_env 不管代理发现（那是 Client 层行为），
访问 Worker 域名要走代理时用 Settings.school_egress_proxy_via 显式指定。
"""

from __future__ import annotations

import httpx

from nanyee.config import Settings


class EgressProxyTransport(httpx.AsyncBaseTransport):
    def __init__(
        self,
        *,
        proxy_url: str,
        proxy_token: str,
        inner: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._proxy_url = proxy_url
        self._proxy_token = proxy_token
        self._inner = inner or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        original_url = request.url
        original_host = request.headers.get("host")
        # 原地改写并在返回前还原：不重造 Request（会丢失已绑定的异步流），
        # 还原后 AsyncClient 回写的 response.request 仍指向真实目标，
        # CookieJar 按学校域存 Cookie、SSO 相对跳转 urljoin 才不会串到 Worker 域名
        request.headers["host"] = httpx.URL(self._proxy_url).host or ""
        request.headers["x-proxy-target"] = str(original_url)
        request.headers["x-proxy-token"] = self._proxy_token
        request.url = httpx.URL(self._proxy_url)
        try:
            return await self._inner.handle_async_request(request)
        finally:
            request.url = original_url
            request.headers.pop("x-proxy-target", None)
            request.headers.pop("x-proxy-token", None)
            if original_host is not None:
                request.headers["host"] = original_host
            else:
                request.headers.pop("host", None)

    async def aclose(self) -> None:
        await self._inner.aclose()


def egress_transport_from_settings(settings: Settings) -> EgressProxyTransport | None:
    """配置齐全时构建出口代理传输层，否则返回 None（直连）。"""
    url = settings.school_egress_proxy_url
    token = settings.school_egress_proxy_token.get_secret_value()
    if not url or not token:
        return None
    # workers.dev 在国内直连被封时，用 via 指向本机代理访问 Worker 域名
    inner = (
        httpx.AsyncHTTPTransport(proxy=settings.school_egress_proxy_via)
        if settings.school_egress_proxy_via
        else None
    )
    return EgressProxyTransport(proxy_url=url, proxy_token=token, inner=inner)
