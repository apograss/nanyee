import asyncio
from datetime import datetime
from typing import Protocol
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from smu_reserver.config import Settings, get_settings
from smu_reserver.db import Database
from smu_reserver.infospace import (
    InfospaceClient,
    InfospaceError,
    SessionExpired,
    SubmissionUnknown,
)
from smu_reserver.models import TaskStatus
from smu_reserver.repository import TaskRepository
from smu_reserver.security import CredentialCipher
from smu_reserver.session_manager import SessionManager
from smu_reserver.settings_repository import CredentialRepository
from smu_reserver.sso import DdddOcrSolver, SsoAuthenticator
from smu_reserver.worker import ReservationRunner


class ApiManager(Protocol):
    async def get_api(self): ...

    def invalidate(self) -> None: ...


class WorkerService:
    def __init__(self, tasks: TaskRepository, sessions: ApiManager) -> None:
        self.tasks = tasks
        self.sessions = sessions

    async def run_cycle(self, now: datetime) -> None:
        self.tasks.expire_overdue(now)
        for task in self.tasks.list_actionable(now):
            try:
                api = await self.sessions.get_api()
                await ReservationRunner(self.tasks, api).attempt_once(task.id)
            except SessionExpired:
                self.sessions.invalidate()
                self.tasks.mark_error(
                    task.id,
                    "登录会话已失效，等待自动续期",
                    status=TaskStatus.AUTH_REFRESH,
                )
            except SubmissionUnknown as error:
                self.tasks.mark_error(task.id, str(error), status=TaskStatus.PAUSED_REVIEW)
            except InfospaceError as error:
                self.tasks.mark_error(task.id, str(error), status=TaskStatus.RUNNING)

    async def run_forever(self, settings: Settings) -> None:
        timezone = ZoneInfo(settings.timezone)
        while True:
            now = datetime.now(timezone).replace(tzinfo=None)
            await self.run_cycle(now)
            await asyncio.sleep(settings.worker_poll_seconds)


def build_service(settings: Settings) -> WorkerService:
    database = Database(settings.database_path)
    database.initialize()
    cipher = CredentialCipher(settings.credential_key.get_secret_value())
    credentials = CredentialRepository(database, cipher)
    origin = urlsplit(settings.infospace_base_url).scheme + "://" + urlsplit(
        settings.infospace_base_url
    ).netloc
    authenticator = SsoAuthenticator(
        infospace_origin=origin,
        uis_origin="https://uis.smu.edu.cn",
        solver=DdddOcrSolver(),
    )

    def client_factory(cookie: str, token: str | None = None) -> InfospaceClient:
        return InfospaceClient(
            settings.infospace_base_url,
            cookie=cookie,
            token=token,
        )

    sessions = SessionManager(
        credentials,
        authenticator,
        client_factory,
        max_login_attempts=settings.max_login_attempts,
    )
    return WorkerService(TaskRepository(database), sessions)


def main() -> None:
    settings = get_settings()
    asyncio.run(build_service(settings).run_forever(settings))


if __name__ == "__main__":
    main()
