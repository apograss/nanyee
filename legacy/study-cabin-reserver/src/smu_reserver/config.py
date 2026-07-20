from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CREDENTIAL_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    database_path: Path = Path("./data/smu-reserver.db")
    app_secret_key: SecretStr = Field(default=SecretStr("development-only-secret"))
    credential_key: SecretStr = Field(default=SecretStr(DEFAULT_CREDENTIAL_KEY))
    admin_password: SecretStr | None = None
    timezone: str = "Asia/Shanghai"
    infospace_base_url: str = "https://infospace.smu.edu.cn/ic-web/"
    worker_poll_seconds: float = Field(default=3.0, ge=1.0, le=60.0)
    max_login_attempts: int = Field(default=3, ge=1, le=5)

    @model_validator(mode="after")
    def reject_development_secrets_in_production(self) -> "Settings":
        if self.app_env == "production":
            values = {
                self.app_secret_key.get_secret_value(),
                self.credential_key.get_secret_value(),
            }
            if "development-only-secret" in values or DEFAULT_CREDENTIAL_KEY in values:
                raise ValueError("production secrets must be configured")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
