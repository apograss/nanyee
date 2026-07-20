from __future__ import annotations

import re
import warnings
from dataclasses import dataclass
from io import BytesIO
from urllib.parse import quote, urlparse
from uuid import uuid4

import httpx
from PIL import Image, UnidentifiedImageError

from nanyee.config import Settings
from nanyee.integrations.qun100.client import Qun100Client, Qun100Unavailable

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MAX_IMAGE_DIMENSION = 12_000
SAFE_VALUE = re.compile(r"^[^\x00-\x1f\x7f]{1,4096}$")


@dataclass(frozen=True, slots=True)
class ImageKind:
    content_type: str
    extension: str


class QunImageUploader:
    def __init__(
        self,
        settings: Settings,
        *,
        qun_client: Qun100Client | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._qun_client = qun_client or Qun100Client(settings)
        self._transport = transport

    async def upload(self, image: bytes, *, declared_content_type: str, token: str) -> str:
        if not image or len(image) > MAX_IMAGE_BYTES:
            raise ValueError("image size is invalid")
        kind = _detect_image(image)
        if declared_content_type.split(";", 1)[0].strip().lower() != kind.content_type:
            raise ValueError("image content type does not match its bytes")
        _validate_image(image, kind)
        credentials = await self._qun_client.get_upload_credentials(token)
        host, cdn, key, fields = _parse_credentials(credentials, kind.extension)
        filename = f"{uuid4().hex}{kind.extension}"
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30),
                follow_redirects=False,
                trust_env=False,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    host,
                    data=fields,
                    files={"file": (filename, image, kind.content_type)},
                )
        except httpx.HTTPError as exc:
            raise Qun100Unavailable("OSS upload failed") from exc
        if response.status_code not in {200, 204}:
            raise Qun100Unavailable("OSS rejected the upload")
        return f"{cdn.rstrip('/')}/{quote(key, safe='/')}"


def _detect_image(data: bytes) -> ImageKind:
    if data.startswith(b"\xff\xd8\xff"):
        return ImageKind("image/jpeg", ".jpg")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ImageKind("image/png", ".png")
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ImageKind("image/gif", ".gif")
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ImageKind("image/webp", ".webp")
    raise ValueError("unsupported image format")


def _validate_image(data: bytes, kind: ImageKind) -> None:
    expected_format = {
        "image/jpeg": "JPEG",
        "image/png": "PNG",
        "image/gif": "GIF",
        "image/webp": "WEBP",
    }[kind.content_type]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                width, height = image.size
                if image.format != expected_format:
                    raise ValueError("image format does not match its bytes")
                if (
                    width < 1
                    or height < 1
                    or width > MAX_IMAGE_DIMENSION
                    or height > MAX_IMAGE_DIMENSION
                    or width * height > MAX_IMAGE_PIXELS
                ):
                    raise ValueError("image dimensions are invalid")
                image.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError("image dimensions are invalid") from None
    except (UnidentifiedImageError, OSError):
        raise ValueError("image bytes are invalid") from None


def _parse_credentials(
    credentials: dict[str, object], extension: str
) -> tuple[str, str, str, dict[str, str]]:
    filenames = credentials.get("filenames")
    sign = credentials.get("aliSign")
    if not isinstance(filenames, list) or not filenames or not isinstance(sign, dict):
        raise Qun100Unavailable("upload credentials are incomplete")
    filename = _safe(signless=filenames[0])
    host = _safe(signless=sign.get("host"))
    cdn = _safe(signless=sign.get("cdn"))
    prefix = _safe(signless=sign.get("prefix"))
    key = f"{prefix}{filename}{extension}"
    _validate_upload_url(host, allowed_suffixes=(".aliyuncs.com",))
    _validate_upload_url(cdn, allowed_suffixes=(".aliyuncs.com", ".qun100.com"))
    fields = {
        "key": key,
        "policy": _safe(signless=sign.get("policy")),
        "OSSAccessKeyId": _safe(signless=sign.get("accessid")),
        "signature": _safe(signless=sign.get("signature")),
        "success_action_status": "200",
    }
    return host, cdn, key, fields


def _safe(*, signless: object) -> str:
    value = str(signless or "")
    if not SAFE_VALUE.fullmatch(value):
        raise Qun100Unavailable("upload credential value is invalid")
    return value


def _validate_upload_url(url: str, *, allowed_suffixes: tuple[str, ...]) -> None:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if (
        parsed.scheme != "https"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in (None, 443)
        or not any(host.endswith(suffix) for suffix in allowed_suffixes)
    ):
        raise Qun100Unavailable("upload target is not trusted")
