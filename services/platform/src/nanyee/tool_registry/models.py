from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class CredentialMode(StrEnum):
    NONE = "none"
    BROWSER_SESSION = "browser_session"
    TRANSIENT_SERVER = "transient_server"
    HOSTED_AUTOMATION = "hosted_automation"


class RiskLevel(StrEnum):
    READ_ONLY = "read_only"
    USER_CONFIRMED_WRITE = "user_confirmed_write"
    SCHEDULED_WRITE = "scheduled_write"


class ThirdPartyFlow(BaseModel):
    provider: str
    purpose: str
    optional: bool


class ToolDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    description: str
    operations: tuple[str, ...]
    credential_modes: tuple[CredentialMode, ...]
    risk_level: RiskLevel
    account_required: bool
    student_identity_required: bool
    third_party_flows: tuple[ThirdPartyFlow, ...] = ()
    enabled: bool = True
