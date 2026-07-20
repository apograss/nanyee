from __future__ import annotations

from base64 import b64decode
from typing import Any, cast

import httpx
import pytest
import respx
from nanyee.config import Settings
from nanyee.integrations.qun100 import Qun100Client, Qun100Unavailable
from nanyee.integrations.qun100.uploader import QunImageUploader

PNG_1X1 = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class FakeQunClient:
    def __init__(self, host: str = "https://bucket.oss-cn-shenzhen.aliyuncs.com") -> None:
        self.host = host

    async def get_upload_credentials(self, token: str) -> dict[str, Any]:
        assert token == "a" * 60
        return {
            "filenames": ["server-file-name"],
            "aliSign": {
                "host": self.host,
                "cdn": "https://images.qun100.com",
                "prefix": "uploads/",
                "policy": "signed-policy",
                "accessid": "access-id",
                "signature": "signature",
            },
        }


@pytest.mark.asyncio
@respx.mock
async def test_image_upload_validates_bytes_and_posts_only_to_signed_oss_host() -> None:
    route = respx.post("https://bucket.oss-cn-shenzhen.aliyuncs.com").mock(
        return_value=httpx.Response(200)
    )
    uploader = QunImageUploader(
        Settings(app_env="test"),
        qun_client=cast(Qun100Client, FakeQunClient()),
    )
    image = PNG_1X1

    url = await uploader.upload(image, declared_content_type="image/png", token="a" * 60)

    assert url == "https://images.qun100.com/uploads/server-file-name.png"
    body = route.calls[0].request.read()
    assert b"signed-policy" in body
    assert b"image/png" in body


@pytest.mark.asyncio
async def test_image_upload_rejects_untrusted_signed_host_and_mime_spoofing() -> None:
    uploader = QunImageUploader(
        Settings(app_env="test"),
        qun_client=cast(Qun100Client, FakeQunClient("https://evil.example")),
    )
    image = PNG_1X1

    with pytest.raises(Qun100Unavailable, match="not trusted"):
        await uploader.upload(image, declared_content_type="image/png", token="a" * 60)
    with pytest.raises(ValueError, match="does not match"):
        await uploader.upload(image, declared_content_type="image/jpeg", token="a" * 60)

    with pytest.raises(ValueError, match="bytes are invalid"):
        await uploader.upload(
            b"\x89PNG\r\n\x1a\nnot-an-image",
            declared_content_type="image/png",
            token="a" * 60,
        )
