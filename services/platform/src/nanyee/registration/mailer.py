from __future__ import annotations

import logging
from email.message import EmailMessage
from typing import Literal, Protocol

import aiosmtplib
import httpx

from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)

# 与 Cloudmail 网关约定的用途（网关按用途选择正文模板）
CodePurpose = Literal["register", "reset", "bind"]
_SMTP_SUBJECTS: dict[str, str] = {
    "register": "Nanyee 注册验证码",
    "reset": "Nanyee 找回密码验证码",
    "bind": "Nanyee 绑定邮箱验证码",
}


class VerificationMailer(Protocol):
    async def send_code(
        self, *, recipient: str, code: str, purpose: CodePurpose, subject: str | None = None
    ) -> None: ...

    async def send_registration_code(self, *, recipient: str, code: str) -> None: ...


class CloudmailVerificationMailer:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    async def send_registration_code(self, *, recipient: str, code: str) -> None:
        await self.send_code(recipient=recipient, code=code, purpose="register")

    async def send_code(
        self, *, recipient: str, code: str, purpose: CodePurpose, subject: str | None = None
    ) -> None:
        settings = self._settings
        token = settings.cloudmail_gateway_token.get_secret_value()
        if not settings.cloudmail_gateway_url or not token:
            raise AppError(
                ErrorCode.UPSTREAM_UNAVAILABLE,
                "注册邮件服务尚未配置。",
                status_code=503,
                retryable=True,
            )
        url = f"{settings.cloudmail_gateway_url.rstrip('/')}/api/gateway/verification-email"
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Gateway-Token": token,
        }
        payload = {
            "to": recipient,
            "code": code,
            "purpose": purpose,
            "subject": subject or f"[nanyee.de] 注册验证码: {code}",
        }
        try:
            if self._client is not None:
                response = await self._client.post(url, json=payload, headers=headers, timeout=10)
            else:
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AppError(
                ErrorCode.UPSTREAM_UNAVAILABLE,
                "验证码暂时无法发送，请稍后重试。",
                status_code=503,
                retryable=True,
            ) from exc


class SmtpVerificationMailer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send_registration_code(self, *, recipient: str, code: str) -> None:
        await self.send_code(recipient=recipient, code=code, purpose="register")

    async def send_code(
        self, *, recipient: str, code: str, purpose: CodePurpose, subject: str | None = None
    ) -> None:
        title = subject or _SMTP_SUBJECTS[purpose]
        await self.send_text(
            recipient=recipient,
            subject=title,
            text=f"{_SMTP_SUBJECTS[purpose]}：{code}\n\n验证码 15 分钟内有效，请勿转发。",
        )

    async def send_text(self, *, recipient: str, subject: str, text: str) -> None:
        settings = self._settings
        if not settings.smtp_host or not settings.mail_from:
            raise AppError(
                ErrorCode.UPSTREAM_UNAVAILABLE,
                "邮件服务尚未配置。",
                status_code=503,
                retryable=True,
            )
        message = EmailMessage()
        message["From"] = settings.mail_from
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(text)
        try:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_username,
                password=(
                    settings.smtp_password.get_secret_value() if settings.smtp_password else None
                ),
                start_tls=settings.smtp_port != 465,
                use_tls=settings.smtp_port == 465,
                timeout=10,
            )
        except aiosmtplib.SMTPException as exc:
            raise AppError(
                ErrorCode.UPSTREAM_UNAVAILABLE,
                "验证码暂时无法发送，请稍后重试。",
                status_code=503,
                retryable=True,
            ) from exc


class NoticeMailer:
    """不带验证码的通知邮件（换绑提醒等），只走 SMTP。

    Cloudmail 网关只支持验证码模板，SMTP 未配置时跳过并记日志；通知是尽力而为，
    发送失败不影响主流程。
    """

    def __init__(self, settings: Settings) -> None:
        self._smtp = SmtpVerificationMailer(settings)
        self._enabled = bool(settings.smtp_host and settings.mail_from)

    async def send_notice(self, *, recipient: str, subject: str, text: str) -> None:
        if not self._enabled:
            logger.info("通知邮件未发送：SMTP 未配置。", extra={"event": "notice_mail_skipped"})
            return
        try:
            await self._smtp.send_text(recipient=recipient, subject=subject, text=text)
        except AppError:
            logger.warning("通知邮件发送失败。", extra={"event": "notice_mail_failed"})
