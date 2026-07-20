from collections.abc import Callable
from typing import Any, Protocol

from smu_reserver.infospace import InfospaceError, SessionExpired
from smu_reserver.settings_repository import CredentialRepository


class Authenticator(Protocol):
    async def login(self, account: str, password: str) -> str: ...


class SessionManager:
    def __init__(
        self,
        credentials: CredentialRepository,
        authenticator: Authenticator,
        client_factory: Callable[..., Any],
        *,
        max_login_attempts: int = 3,
    ) -> None:
        self.credentials = credentials
        self.authenticator = authenticator
        self.client_factory = client_factory
        self.max_login_attempts = max_login_attempts

    async def get_api(self):
        session = self.credentials.get_session()
        if session:
            cookie, token = session
            api = self.client_factory(cookie, token)
            try:
                await api.get_user_info()
                return api
            except SessionExpired:
                self.credentials.clear_session()

        login = self.credentials.get_login()
        if login is None:
            raise InfospaceError("尚未配置 SMU 账号密码")
        account, password = login
        last_error: Exception | None = None
        for _ in range(self.max_login_attempts):
            try:
                cookie = await self.authenticator.login(account, password)
                api = self.client_factory(cookie, None)
                user = await api.get_user_info()
                self.credentials.save_session(cookie, user.token)
                return api
            except InfospaceError as error:
                last_error = error
        raise InfospaceError("自动登录失败，已达到重试上限") from last_error

    def invalidate(self) -> None:
        self.credentials.clear_session()
