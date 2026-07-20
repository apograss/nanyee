from __future__ import annotations

import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest
from nanyee.config import Settings
from nanyee.credentials.service import CredentialVaultService
from nanyee.integrations.infospace.client import BusinessError, UserInfo
from nanyee.integrations.infospace.sso import AuthenticationRejected
from nanyee.jobs.models import Job
from nanyee.tools.study_cabin import RoomAvailability
from nanyee_worker.runtime import ExecutionFailure
from nanyee_worker.study_cabin import DdddOcrSolver, StudyCabinHandler


class FakeVault:
    async def decrypt_for_worker(self, *_args: object, **_kwargs: object) -> bytes:
        return json.dumps({"account": "student", "password": "password"}).encode()


class FakeAuthenticator:
    async def login(self, account: str, password: str) -> dict[str, str]:
        assert (account, password) == ("student", "password")
        return {"ic-cookie": "session"}


class FakeInfospaceClient:
    submitted: list[int] = []

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        pass

    async def get_user_info(self) -> UserInfo:
        return UserInfo(acc_no="student", display_name="测试", token="api-token")

    async def list_rooms(self, _target_date: date, *, kind_id: int) -> list[RoomAvailability]:
        assert kind_id == 29816776
        return [
            RoomAvailability(
                dev_id=29817269,
                name="西侧学习舱1",
                open_start=time(8, 0),
                open_end=time(22, 50),
                freezing_minutes=0,
            ),
            RoomAvailability(
                dev_id=29817270,
                name="西侧学习舱2",
                open_start=time(8, 0),
                open_end=time(22, 50),
                freezing_minutes=0,
            ),
        ]

    async def reserve(self, payload: Any) -> None:
        self.submitted.append(payload.dev_id)
        if payload.dev_id == 29817270:
            raise BusinessError(409)


def build_job() -> Job:
    target = date.today() + timedelta(days=1)
    return Job(
        id=uuid4(),
        user_id=uuid4(),
        credential_id=uuid4(),
        tool_id="study_cabin",
        operation="reserve",
        payload={
            "target_date": target.isoformat(),
            "start_time": "09:00:00",
            "end_time": "11:00:00",
            "title": "学习",
            "cabin_ids": [29817270, 29817269],
            "attempt_until": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        },
        request_digest="digest",
        idempotency_key="handler-test",
        confirmation_version="study_cabin:reserve:v1",
        scheduled_for=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_handler_uses_priority_then_falls_through_on_conflict(monkeypatch: Any) -> None:
    import nanyee_worker.study_cabin as module

    async def active_job(_db: object, _job: Job) -> None:
        return None

    FakeInfospaceClient.submitted = []
    monkeypatch.setattr(module, "InfospaceClient", FakeInfospaceClient)
    monkeypatch.setattr(module, "ensure_execution_active", active_job)
    handler = StudyCabinHandler(
        Settings(app_env="test"),
        cast(CredentialVaultService, FakeVault()),
        DdddOcrSolver(),
    )
    handler._authenticator = cast(Any, FakeAuthenticator())

    receipt = await handler.execute(cast(Any, object()), build_job())

    assert FakeInfospaceClient.submitted == [29817270, 29817269]
    assert receipt.values["dev_id"] == 29817269
    assert "password" not in str(receipt.values)


@pytest.mark.asyncio
async def test_handler_stops_after_attempt_deadline() -> None:
    job = build_job()
    job.payload["attempt_until"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    handler = StudyCabinHandler(
        Settings(app_env="test"),
        cast(CredentialVaultService, FakeVault()),
        DdddOcrSolver(),
    )

    with pytest.raises(ExecutionFailure) as raised:
        await handler.execute(cast(Any, object()), job)
    assert raised.value.error_code == "NO_AVAILABILITY"
    assert raised.value.retryable is False


@pytest.mark.asyncio
async def test_study_cabin_login_retries_ocr_rejections_with_backoff(monkeypatch: Any) -> None:
    import nanyee_worker.study_cabin as module

    class FlakyAuthenticator:
        calls = 0

        async def login(self, _account: str, _password: str) -> dict[str, str]:
            self.calls += 1
            if self.calls < 3:
                raise AuthenticationRejected("captcha rejected")
            return {"ic-cookie": "session"}

    delays: list[float] = []

    async def no_wait(delay: float) -> None:
        delays.append(delay)

    monkeypatch.setattr(module.asyncio, "sleep", no_wait)
    handler = StudyCabinHandler(
        Settings(app_env="test"),
        cast(CredentialVaultService, FakeVault()),
        DdddOcrSolver(),
    )
    handler._authenticator = cast(Any, FlakyAuthenticator())

    cookies = await handler._login_with_backoff("student", "password")

    assert cookies == {"ic-cookie": "session"}
    assert delays == [1, 2]
