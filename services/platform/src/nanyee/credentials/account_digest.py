"""学校凭据的学号盲索引。见 docs/adr/0002-school-account-conflict-takeover.md。"""

from __future__ import annotations

import json

from nanyee.config import Settings
from nanyee.credentials.models import SCHOOL_ACCOUNT_PURPOSES
from nanyee.security import keyed_digest

_LABEL = "school-account"


def school_account_digest(settings: Settings, account: str) -> str | None:
    """学号的 HMAC；密钥未配置时返回 None。"""
    key = settings.school_account_digest_key
    normalized = account.strip()
    if key is None or not key.get_secret_value() or not normalized:
        return None
    return keyed_digest(key.get_secret_value(), _LABEL, normalized)


def digest_for_plaintext(settings: Settings, purpose: str, plaintext: str | bytes) -> str | None:
    """从学校账号类凭据明文（{"account", "password"}）计算学号摘要；其他用途返回 None。"""
    if purpose not in SCHOOL_ACCOUNT_PURPOSES:
        return None
    try:
        data = json.loads(plaintext)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    account = data.get("account") if isinstance(data, dict) else None
    return school_account_digest(settings, account) if isinstance(account, str) else None
