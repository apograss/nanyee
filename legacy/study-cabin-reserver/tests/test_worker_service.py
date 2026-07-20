import base64
from datetime import date, datetime, time

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from smu_reserver.db import Database
from smu_reserver.infospace import InfospaceError, RoomAvailability, UserInfo
from smu_reserver.models import NewTask, TaskStatus
from smu_reserver.repository import TaskRepository
from smu_reserver.security import CredentialCipher
from smu_reserver.session_manager import SessionManager
from smu_reserver.settings_repository import CredentialRepository
from smu_reserver.worker_service import WorkerService


class FakeAuthenticator:
    def __init__(self):
        self.calls = []

    async def login(self, account, password):
        self.calls.append((account, password))
        return "ic-cookie=new-session"


class FakeApi:
    def __init__(self, cookie, token=None):
        self.cookie = cookie
        self.token = token

    async def get_user_info(self):
        return UserInfo(acc_no="student", display_name="测试", token="fresh-token")


def repositories(tmp_path):
    database = Database(tmp_path / "service.db")
    database.initialize()
    key = base64.urlsafe_b64encode(AESGCM.generate_key(bit_length=256)).decode()
    credentials = CredentialRepository(database, CredentialCipher(key))
    return TaskRepository(database), credentials


@pytest.mark.asyncio
async def test_session_manager_logs_in_and_persists_fresh_session(tmp_path) -> None:
    _, credentials = repositories(tmp_path)
    credentials.save_login("student", "password")
    authenticator = FakeAuthenticator()
    created = []

    def client_factory(cookie, token=None):
        client = FakeApi(cookie, token)
        created.append(client)
        return client

    manager = SessionManager(credentials, authenticator, client_factory)

    api = await manager.get_api()

    assert authenticator.calls == [("student", "password")]
    assert api.cookie == "ic-cookie=new-session"
    assert credentials.get_session() == ("ic-cookie=new-session", "fresh-token")


@pytest.mark.asyncio
async def test_session_manager_does_not_relogin_on_network_error(tmp_path) -> None:
    _, credentials = repositories(tmp_path)
    credentials.save_login("student", "password")
    credentials.save_session("ic-cookie=existing", "existing-token")
    authenticator = FakeAuthenticator()

    class NetworkErrorApi(FakeApi):
        async def get_user_info(self):
            raise InfospaceError("network unavailable")

    manager = SessionManager(
        credentials,
        authenticator,
        lambda cookie, token=None: NetworkErrorApi(cookie, token),
    )

    with pytest.raises(InfospaceError, match="network unavailable"):
        await manager.get_api()

    assert authenticator.calls == []
    assert credentials.get_session() == ("ic-cookie=existing", "existing-token")


def test_repository_returns_only_tasks_inside_attempt_window(tmp_path) -> None:
    tasks, _ = repositories(tmp_path)
    task = tasks.create_task(
        NewTask(
            target_date=date(2026, 7, 20),
            start_time=time(9, 0),
            end_time=time(11, 0),
            title="学习",
            attempt_from=datetime(2026, 7, 19, 23, 59),
            attempt_until=datetime(2026, 7, 20, 9, 0),
            cabin_ids=[1],
        )
    )

    assert tasks.list_actionable(datetime(2026, 7, 19, 23, 58)) == []
    assert [item.id for item in tasks.list_actionable(datetime(2026, 7, 20, 0, 0))] == [
        task.id
    ]
    tasks.expire_overdue(datetime(2026, 7, 20, 9, 1))
    assert tasks.get_task(task.id).status is TaskStatus.FAILED_TIMEOUT


@pytest.mark.asyncio
async def test_worker_cycle_executes_due_task(tmp_path) -> None:
    tasks, _ = repositories(tmp_path)
    task = tasks.create_task(
        NewTask(
            target_date=date(2026, 7, 20),
            start_time=time(9, 0),
            end_time=time(11, 0),
            title="学习",
            attempt_from=datetime(2026, 7, 19, 23, 59),
            attempt_until=datetime(2026, 7, 20, 9, 0),
            cabin_ids=[1],
        )
    )

    class DueApi(FakeApi):
        async def list_rooms(self, target_date, *, kind_id):
            return [
                RoomAvailability(
                    dev_id=1,
                    name="学习舱1",
                    open_start=time(8, 0),
                    open_end=time(22, 50),
                    freezing_minutes=0,
                )
            ]

        async def reserve(self, payload):
            return None

    class Manager:
        async def get_api(self):
            return DueApi("cookie", "token")

    service = WorkerService(tasks, Manager())

    await service.run_cycle(datetime(2026, 7, 20, 0, 0))

    assert tasks.get_task(task.id).status is TaskStatus.SUCCEEDED
