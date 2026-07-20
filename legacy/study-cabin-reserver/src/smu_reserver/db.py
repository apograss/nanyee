import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS smu_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    account_ciphertext TEXT NOT NULL,
    password_ciphertext TEXT NOT NULL,
    cookie_ciphertext TEXT,
    token_ciphertext TEXT,
    auth_status TEXT NOT NULL DEFAULT 'unknown',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cabins (
    dev_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    side TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservation_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    title TEXT NOT NULL,
    attempt_from TEXT NOT NULL,
    attempt_until TEXT NOT NULL,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    reserved_dev_id INTEGER,
    reserved_at TEXT,
    lease_owner TEXT,
    lease_expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS task_cabins (
    task_id INTEGER NOT NULL REFERENCES reservation_tasks(id) ON DELETE CASCADE,
    dev_id INTEGER NOT NULL,
    priority INTEGER NOT NULL,
    PRIMARY KEY (task_id, dev_id),
    UNIQUE (task_id, priority)
);

CREATE TABLE IF NOT EXISTS reservation_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES reservation_tasks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    business_code INTEGER,
    message TEXT NOT NULL,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_id TEXT PRIMARY KEY,
    task_id INTEGER,
    last_seen_at TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(SCHEMA)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
