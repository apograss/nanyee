from datetime import UTC, datetime

from smu_reserver.db import Database
from smu_reserver.security import CredentialCipher, PasswordHasher


class AdminRepository:
    def __init__(self, database: Database, hasher: PasswordHasher) -> None:
        self.database = database
        self.hasher = hasher

    def set_password(self, password: str) -> None:
        encoded = self.hasher.hash(password)
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO admin_users (id, password_hash, updated_at)
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    password_hash = excluded.password_hash,
                    updated_at = excluded.updated_at
                """,
                (encoded, datetime.now(UTC).isoformat()),
            )

    def has_password(self) -> bool:
        with self.database.connect() as connection:
            row = connection.execute("SELECT 1 FROM admin_users WHERE id = 1").fetchone()
        return row is not None

    def verify_password(self, password: str) -> bool:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT password_hash FROM admin_users WHERE id = 1"
            ).fetchone()
        return bool(row and self.hasher.verify(row["password_hash"], password))


class CredentialRepository:
    def __init__(self, database: Database, cipher: CredentialCipher) -> None:
        self.database = database
        self.cipher = cipher

    def save_login(self, account: str, password: str) -> None:
        account_ciphertext = self.cipher.encrypt(account, purpose="smu-account")
        password_ciphertext = self.cipher.encrypt(password, purpose="smu-password")
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO smu_credentials (
                    id, account_ciphertext, password_ciphertext, auth_status, updated_at
                ) VALUES (1, ?, ?, 'unknown', ?)
                ON CONFLICT(id) DO UPDATE SET
                    account_ciphertext = excluded.account_ciphertext,
                    password_ciphertext = excluded.password_ciphertext,
                    cookie_ciphertext = NULL,
                    token_ciphertext = NULL,
                    auth_status = 'unknown',
                    updated_at = excluded.updated_at
                """,
                (account_ciphertext, password_ciphertext, datetime.now(UTC).isoformat()),
            )

    def get_login(self) -> tuple[str, str] | None:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT account_ciphertext, password_ciphertext FROM smu_credentials WHERE id = 1"
            ).fetchone()
        if row is None:
            return None
        return (
            self.cipher.decrypt(row["account_ciphertext"], purpose="smu-account"),
            self.cipher.decrypt(row["password_ciphertext"], purpose="smu-password"),
        )

    def has_login(self) -> bool:
        with self.database.connect() as connection:
            row = connection.execute("SELECT 1 FROM smu_credentials WHERE id = 1").fetchone()
        return row is not None

    def save_session(self, cookie: str, token: str) -> None:
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                UPDATE smu_credentials SET
                    cookie_ciphertext = ?, token_ciphertext = ?,
                    auth_status = 'valid', updated_at = ?
                WHERE id = 1
                """,
                (
                    self.cipher.encrypt(cookie, purpose="smu-cookie"),
                    self.cipher.encrypt(token, purpose="smu-token"),
                    datetime.now(UTC).isoformat(),
                ),
            )
            if cursor.rowcount != 1:
                raise ValueError("请先保存 SMU 账号密码")

    def get_session(self) -> tuple[str, str] | None:
        with self.database.connect() as connection:
            row = connection.execute(
                """
                SELECT cookie_ciphertext, token_ciphertext FROM smu_credentials WHERE id = 1
                """
            ).fetchone()
        if row is None or not row["cookie_ciphertext"] or not row["token_ciphertext"]:
            return None
        return (
            self.cipher.decrypt(row["cookie_ciphertext"], purpose="smu-cookie"),
            self.cipher.decrypt(row["token_ciphertext"], purpose="smu-token"),
        )

    def clear_session(self) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """
                UPDATE smu_credentials SET
                    cookie_ciphertext = NULL, token_ciphertext = NULL,
                    auth_status = 'expired', updated_at = ?
                WHERE id = 1
                """,
                (datetime.now(UTC).isoformat(),),
            )
