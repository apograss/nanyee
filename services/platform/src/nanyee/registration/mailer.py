from __future__ import annotations

from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode


class VerificationMailer(Protocol):
    async def send_registration_code(self, *, recipient: str, code: str) -> None: ...


class SmtpVerificationMailer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send_registration_code(self, *, recipient: str, code: str) -> None:
        settings = self._settings
        if not settings.smtp_host or not settings.mail_from:
            raise AppError(
                ErrorCode.UPSTREAM_UNAVAILABLE,
                "注册邮件服务尚未配置。",
                status_code=503,
                retryable=True,
            )
        message = EmailMessage()
        message["From"] = settings.mail_from
        message["To"] = recipient
        message["Subject"] = "Nanyee 注册验证码"
        message.set_content(f"你的 Nanyee 注册验证码是：{code}\n\n验证码 15 分钟内有效，请勿转发。")
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
