from __future__ import annotations

from base64 import b64decode
from binascii import Error as Base64Error
from functools import lru_cache
from typing import Literal
from urllib.parse import ParseResult, urlparse

from pydantic import Field, HttpUrl, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

TURNSTILE_TEST_SITE_KEYS = frozenset(
    {
        "1x00000000000000000000AA",
        "2x00000000000000000000AB",
        "1x00000000000000000000BB",
        "2x00000000000000000000BB",
        "3x00000000000000000000FF",
    }
)
TURNSTILE_TEST_SECRET_KEYS = frozenset(
    {
        "1x0000000000000000000000000000000AA",
        "2x0000000000000000000000000000000AA",
        "3x0000000000000000000000000000000AA",
    }
)
DEVELOPMENT_SESSION_SECRET = "development-session-secret-change-me"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="NANYEE_",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Nanyee API"
    app_version: str = "0.1.0"
    app_env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    docs_enabled: bool = True

    database_url: str = "postgresql+asyncpg://nanyee:nanyee@127.0.0.1:5432/nanyee"
    database_pool_size: int = Field(default=10, ge=1, le=50)
    database_pool_timeout_seconds: float = Field(default=10.0, gt=0, le=60)

    public_origin: HttpUrl = HttpUrl("http://localhost:3000")
    api_origin: HttpUrl = HttpUrl("http://localhost:8000")
    allowed_hosts: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    trusted_proxy_ips: list[str] = Field(default_factory=list)

    session_secret: SecretStr = SecretStr(DEVELOPMENT_SESSION_SECRET)
    session_cookie_name: str = "nanyee_session"
    csrf_cookie_name: str = "nanyee_csrf"
    session_ttl_seconds: int = Field(default=60 * 60 * 24 * 14, ge=300, le=60 * 60 * 24 * 90)
    cookie_secure: bool = False
    cookie_domain: str | None = None

    registration_challenge_ttl_seconds: int = Field(default=15 * 60, ge=300, le=3600)
    registration_challenge_max_attempts: int = Field(default=5, ge=1, le=10)
    quiz_question_count: int = Field(default=20, ge=10, le=50)
    quiz_pass_score: int = Field(default=18, ge=1, le=50)
    edu_email_suffixes: list[str] = Field(default_factory=lambda: [".edu.cn"])

    turnstile_enabled: bool = False
    turnstile_site_key: str | None = None
    turnstile_secret_key: SecretStr | None = None
    turnstile_expected_hostnames: list[str] = Field(default_factory=list)
    turnstile_verify_url: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    turnstile_timeout_seconds: float = Field(default=5.0, gt=0, le=15)

    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    mail_from: str | None = None

    cloudmail_gateway_url: str = ""
    cloudmail_gateway_token: SecretStr = SecretStr("")

    # 学校侧出口代理（Cloudflare Worker 多 IP 池，见 infra/cloudflare/egress-proxy/）
    school_egress_proxy_url: str = ""
    school_egress_proxy_token: SecretStr = SecretStr("")
    # 可选：访问 Worker 域名本身要走的上游代理（workers.dev 在国内被封锁时指向本机代理；
    # 生产 VPS 可直连则留空）
    school_egress_proxy_via: str = ""

    credential_key_provider: Literal["local_file", "azure"] = "local_file"
    credential_local_master_key: SecretStr | None = None
    credential_local_key_version: str = "local-v1"
    azure_key_vault_key_id: str | None = None
    credential_default_ttl_seconds: int = Field(default=24 * 60 * 60, ge=300, le=30 * 24 * 60 * 60)

    transient_secret_ttl_seconds: int = Field(default=300, ge=60, le=300)
    transient_secret_max_entries: int = Field(default=1000, ge=10, le=10_000)
    upstream_timeout_seconds: float = Field(default=10.0, gt=0, le=30)
    upstream_max_response_bytes: int = Field(default=2 * 1024 * 1024, ge=1024, le=10 * 1024 * 1024)
    smu_uis_base_url: str = "https://uis.smu.edu.cn"
    smu_academic_base_url: str = "https://zhjw.smu.edu.cn"
    smu_infospace_base_url: str = "https://infospace.smu.edu.cn/ic-web"
    qun100_base_url: str = "https://form.qun100.com"
    wakeup_share_url: str = "https://i.wakeup.fun/share_schedule"

    worker_id: str = Field(default="nanyee-worker-1", min_length=1, max_length=128)
    worker_poll_interval_seconds: float = Field(default=2.0, ge=0.2, le=30)
    worker_lease_seconds: int = Field(default=120, ge=30, le=600)
    worker_retry_interval_seconds: int = Field(default=30, ge=5, le=300)

    @model_validator(mode="after")
    def validate_cross_field_security(self) -> Settings:
        if self.quiz_pass_score > self.quiz_question_count:
            raise ValueError("quiz_pass_score cannot exceed quiz_question_count")

        if self.turnstile_enabled:
            if not self.turnstile_site_key or not self.turnstile_secret_key:
                raise ValueError("Turnstile keys are required when Turnstile is enabled")
            if not self.turnstile_expected_hostnames:
                raise ValueError("Turnstile expected hostnames are required when enabled")

        cloudmail_url_set = bool(self.cloudmail_gateway_url)
        cloudmail_token_set = bool(self.cloudmail_gateway_token.get_secret_value())
        if cloudmail_url_set != cloudmail_token_set:
            raise ValueError("Cloudmail gateway URL and token must be configured together")

        egress_url_set = bool(self.school_egress_proxy_url)
        egress_token_set = bool(self.school_egress_proxy_token.get_secret_value())
        if egress_url_set != egress_token_set:
            raise ValueError("School egress proxy URL and token must be configured together")
        if self.school_egress_proxy_via and not egress_url_set:
            raise ValueError("School egress proxy 'via' requires the proxy URL")

        if self.app_env == "production":
            self._validate_production_security()
        self._validate_credential_provider()
        self._validate_upstream_urls()
        return self

    def _validate_upstream_urls(self) -> None:
        expected = {
            self.smu_uis_base_url: ("uis.smu.edu.cn", ""),
            self.smu_academic_base_url: ("zhjw.smu.edu.cn", ""),
            self.smu_infospace_base_url: ("infospace.smu.edu.cn", "/ic-web"),
        }
        for value, (hostname, path) in expected.items():
            if not _is_exact_https_origin(urlparse(value), hostname=hostname, path=path):
                raise ValueError(f"SMU upstream URL is invalid for {hostname}")
        qun100 = urlparse(self.qun100_base_url)
        if not _is_exact_https_origin(qun100, hostname="form.qun100.com", path=""):
            raise ValueError("Qun100 upstream must be https://form.qun100.com")
        wakeup = urlparse(self.wakeup_share_url)
        if not _is_exact_https_origin(wakeup, hostname="i.wakeup.fun", path="/share_schedule"):
            raise ValueError("WakeUp upstream must be https://i.wakeup.fun/share_schedule")

    def _validate_credential_provider(self) -> None:
        if self.credential_key_provider == "azure":
            if not self.azure_key_vault_key_id:
                raise ValueError("Azure Key Vault key ID is required for the Azure provider")
            parts = self.azure_key_vault_key_id.rstrip("/").split("/")
            if len(parts) < 5 or parts[-3] != "keys" or not parts[-1]:
                raise ValueError("Azure Key Vault key ID must include a key version")
            return
        if self.credential_local_master_key is None:
            return
        try:
            decoded = b64decode(self.credential_local_master_key.get_secret_value(), validate=True)
        except (ValueError, Base64Error) as exc:
            raise ValueError("local credential key must be valid base64") from exc
        if len(decoded) != 32:
            raise ValueError("local credential key must decode to exactly 32 bytes")

    def _validate_production_security(self) -> None:
        if self.session_secret.get_secret_value() == DEVELOPMENT_SESSION_SECRET:
            raise ValueError("production session secret must be configured")
        if len(self.session_secret.get_secret_value()) < 32:
            raise ValueError("production session secret must contain at least 32 characters")
        if not self.cookie_secure:
            raise ValueError("secure cookies are required in production")
        if not self.session_cookie_name.startswith("__Host-") or self.cookie_domain is not None:
            raise ValueError("production session cookie must use the __Host- prefix")
        if self.docs_enabled:
            raise ValueError("interactive API documentation must be disabled in production")
        if "*" in self.allowed_hosts or "*" in self.cors_origins:
            raise ValueError("wildcard hosts and origins are forbidden in production")
        for origin in (self.public_origin, self.api_origin):
            parsed_origin = urlparse(str(origin))
            if (
                parsed_origin.scheme != "https"
                or parsed_origin.username is not None
                or parsed_origin.password is not None
                or parsed_origin.port not in (None, 443)
                or parsed_origin.path not in ("", "/")
                or parsed_origin.query
                or parsed_origin.fragment
            ):
                raise ValueError("production origins must be plain HTTPS origins")
        if not self.database_url.startswith("postgresql+asyncpg://"):
            raise ValueError("production requires PostgreSQL via asyncpg")
        if self.turnstile_enabled:
            assert self.turnstile_site_key is not None
            assert self.turnstile_secret_key is not None
            if self.turnstile_site_key in TURNSTILE_TEST_SITE_KEYS:
                raise ValueError("Turnstile test site key is forbidden in production")
            if self.turnstile_secret_key.get_secret_value() in TURNSTILE_TEST_SECRET_KEYS:
                raise ValueError("Turnstile test secret key is forbidden in production")
        if (
            self.credential_key_provider == "local_file"
            and self.credential_local_master_key is None
        ):
            raise ValueError("local credential provider requires an explicit master key")


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _is_exact_https_origin(parsed: ParseResult, *, hostname: str, path: str) -> bool:
    return bool(
        parsed.scheme == "https"
        and parsed.hostname == hostname
        and parsed.username is None
        and parsed.password is None
        and parsed.port in (None, 443)
        and parsed.path.rstrip("/") == path
        and not parsed.params
        and not parsed.query
        and not parsed.fragment
    )
