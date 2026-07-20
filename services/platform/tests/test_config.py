from __future__ import annotations

from base64 import b64encode

import pytest
from nanyee.config import Settings
from pydantic import SecretStr, ValidationError


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "database_url": "postgresql+asyncpg://user:pass@database/nanyee",
        "docs_enabled": False,
        "session_secret": SecretStr("x" * 32),
        "session_cookie_name": "__Host-nanyee_session",
        "cookie_secure": True,
        "allowed_hosts": ["api.nanyee.de"],
        "cors_origins": ["https://nanyee.de"],
        "public_origin": "https://nanyee.de",
        "api_origin": "https://api.nanyee.de",
        "credential_local_master_key": SecretStr(b64encode(b"k" * 32).decode("ascii")),
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def test_safe_production_settings_are_accepted() -> None:
    settings = production_settings()
    assert settings.app_env == "production"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("docs_enabled", True),
        ("cookie_secure", False),
        ("session_cookie_name", "nanyee_session"),
        ("database_url", "sqlite+aiosqlite://"),
        ("allowed_hosts", ["*"]),
    ],
)
def test_production_rejects_dangerous_configuration(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        production_settings(**{field: value})


def test_production_rejects_turnstile_test_keys() -> None:
    with pytest.raises(ValidationError, match="test site key"):
        production_settings(
            turnstile_enabled=True,
            turnstile_site_key="1x00000000000000000000AA",
            turnstile_secret_key=SecretStr("1x0000000000000000000000000000000AA"),
            turnstile_expected_hostnames=["nanyee.de"],
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("smu_academic_base_url", "https://zhjw.smu.edu.cn:444"),
        ("smu_uis_base_url", "https://uis.smu.edu.cn/extra"),
        ("smu_infospace_base_url", "https://infospace.smu.edu.cn"),
        ("qun100_base_url", "https://form.qun100.com/extra"),
        ("public_origin", "http://nanyee.de"),
        ("api_origin", "https://api.nanyee.de/extra"),
    ],
)
def test_configuration_rejects_noncanonical_upstreams_and_origins(
    field: str, value: object
) -> None:
    with pytest.raises(ValidationError):
        production_settings(**{field: value})
