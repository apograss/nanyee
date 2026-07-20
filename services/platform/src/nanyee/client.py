from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from nanyee.config import Settings
from nanyee.security import ip_prefix, keyed_digest


@dataclass(frozen=True, slots=True)
class ClientContext:
    ip: str | None
    ip_prefix: str
    user_agent: str
    anonymous_device: str


def get_client_context(request: Request, settings: Settings) -> ClientContext:
    direct_ip = request.client.host if request.client else None
    client_ip = direct_ip
    if direct_ip in settings.trusted_proxy_ips:
        forwarded = request.headers.get("cf-connecting-ip") or request.headers.get(
            "x-forwarded-for"
        )
        if forwarded:
            client_ip = forwarded.split(",", maxsplit=1)[0].strip()
    return ClientContext(
        ip=client_ip,
        ip_prefix=ip_prefix(client_ip),
        user_agent=request.headers.get("user-agent", "")[:512],
        anonymous_device=request.cookies.get("nanyee_device", "missing")[:128],
    )


def client_subject_digest(
    settings: Settings,
    context: ClientContext,
    *,
    action: str,
    identity: str = "",
) -> str:
    return keyed_digest(
        settings.session_secret.get_secret_value(),
        "rate-limit",
        action,
        context.ip_prefix,
        context.anonymous_device,
        identity,
    )
