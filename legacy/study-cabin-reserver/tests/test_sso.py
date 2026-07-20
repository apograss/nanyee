import httpx
import pytest
import respx

from smu_reserver.sso import SsoAuthenticator


class FakeCaptchaSolver:
    async def solve(self, image: bytes) -> str:
        assert image == b"captcha-image"
        return "1234"


@pytest.mark.asyncio
@respx.mock
async def test_sso_login_uses_infospace_appid_and_returns_cookie() -> None:
    service = "https://infospace.example/authcenter/callback"
    respx.get("https://infospace.example/authcenter/toLoginPage").mock(
        return_value=httpx.Response(
            302,
            headers={"Location": f"https://uis.example/login.jsp?service={service}"},
        )
    )
    respx.get("https://uis.example/login.jsp").mock(
        return_value=httpx.Response(200, text="login")
    )
    respx.get("https://uis.example/imageServlet.do").mock(
        return_value=httpx.Response(200, content=b"captcha-image")
    )

    def login_response(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        assert "appid=3458975" in body
        assert "randcodekey=1234" in body
        assert "password=5f4dcc3b5aa765d61d8327deb882cf99" in body
        return httpx.Response(200, json={"ticket": "ticket-value", "message": "成功"})

    respx.post("https://uis.example/login/login.do").mock(side_effect=login_response)
    respx.get(service).mock(
        return_value=httpx.Response(
            200,
            headers={"Set-Cookie": "ic-cookie=session-value; Path=/; HttpOnly"},
        )
    )
    authenticator = SsoAuthenticator(
        infospace_origin="https://infospace.example",
        uis_origin="https://uis.example",
        solver=FakeCaptchaSolver(),
    )

    cookie = await authenticator.login("student", "password")

    assert "ic-cookie=session-value" in cookie
