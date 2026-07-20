# Study Cabin Reservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-user VPS web panel that stores SMU credentials securely, schedules strict future-date study-cabin reservations, and books the highest-priority cabin that fully covers the requested time.

**Architecture:** Run a FastAPI web process and a separate worker process against one SQLite database in WAL mode. Keep all target-system behavior behind an `InfospaceClient`, all scheduling decisions in pure domain services, and use database leases plus remote confirmation to make submission restart-safe and idempotent.

**Tech Stack:** Python 3.12, FastAPI, Jinja2, SQLAlchemy 2, Alembic, httpx, Pydantic Settings, cryptography AES-GCM, pwdlib/Argon2, pytest, respx, Docker Compose, Nginx.

---

## Execution rules

- Work on a feature branch or isolated worktree.
- Use TDD for every domain behavior and bug fix.
- Never put real SMU credentials, Cookie values, tokens, VPS credentials, or production response bodies in fixtures or commits.
- Do not call `POST /ic-web/reserve` in automated tests.
- Do not deploy, edit Nginx, create DNS records, or add production secrets until the user explicitly confirms the production change.
- Before each completion claim, run the verification commands listed in Task 12.

### Task 1: Project scaffold and health endpoints

**Files:**
- Create: `pyproject.toml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/smu_reserver/__init__.py`
- Create: `src/smu_reserver/config.py`
- Create: `src/smu_reserver/web.py`
- Create: `tests/test_health.py`

**Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient
from smu_reserver.web import create_app


def test_liveness_endpoint() -> None:
    client = TestClient(create_app())
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

**Step 2: Run the test and verify failure**

Run: `uv run pytest tests/test_health.py -v`

Expected: FAIL because `smu_reserver.web` does not exist.

**Step 3: Add the minimal application and configuration**

Use a `Settings` class with these environment-backed fields:

```python
class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./data/smu-reserver.db"
    timezone: str = "Asia/Shanghai"
    secret_key: SecretStr
    credential_key: SecretStr
    infospace_base_url: AnyHttpUrl = "https://infospace.smu.edu.cn/ic-web/"
```

`create_app()` must not connect to SMU or start the worker.

**Step 4: Run the test and static checks**

Run: `uv run pytest tests/test_health.py -v`

Expected: PASS.

Run: `uv run ruff check . && uv run mypy src`

Expected: both exit 0.

**Step 5: Commit**

```bash
git add pyproject.toml .gitignore .env.example src tests/test_health.py
git commit -m "chore: scaffold reservation service"
```

### Task 2: Database schema and migrations

**Files:**
- Create: `alembic.ini`
- Create: `migrations/env.py`
- Create: `migrations/versions/0001_initial.py`
- Create: `src/smu_reserver/db.py`
- Create: `src/smu_reserver/models.py`
- Create: `tests/test_models.py`

**Step 1: Write failing model tests**

Cover these invariants:

```python
def test_task_requires_end_after_start(session): ...
def test_active_duplicate_time_range_is_rejected(session): ...
def test_cabin_priorities_are_unique_and_ordered(session): ...
def test_attempt_log_does_not_accept_secret_fields(session): ...
```

**Step 2: Run the model tests**

Run: `uv run pytest tests/test_models.py -v`

Expected: FAIL because models and schema do not exist.

**Step 3: Implement schema**

Create these tables:

- `admin_users`: password hash and timestamps.
- `smu_credentials`: encrypted account, password, Cookie, token, auth status and expiry metadata.
- `cabins`: `dev_id`, name, side, enabled, priority and last-seen timestamp.
- `reservation_tasks`: target date, start/end time, title, attempt window, status, lease fields, success fields, retry fields and version.
- `task_cabin_priorities`: ordered cabin snapshot per task.
- `reservation_attempts`: task, event type, business code, sanitized message, duration and timestamp.
- `worker_heartbeats`: worker ID, current task and last heartbeat.

Enable SQLite foreign keys, busy timeout and WAL mode on connection.

Use database checks for simple time ordering and unique constraints for cabin priority. Enforce overlapping active-task rejection in a repository transaction because SQLite has no native exclusion constraint.

**Step 4: Generate and apply the initial migration**

Run: `uv run alembic upgrade head`

Expected: migration completes and creates the database under the configured test data directory.

**Step 5: Run tests**

Run: `uv run pytest tests/test_models.py -v`

Expected: PASS.

**Step 6: Commit**

```bash
git add alembic.ini migrations src/smu_reserver/db.py src/smu_reserver/models.py tests/test_models.py
git commit -m "feat: add reservation database schema"
```

### Task 3: Secret encryption and administrator authentication

**Files:**
- Create: `src/smu_reserver/security.py`
- Create: `src/smu_reserver/auth.py`
- Create: `tests/test_security.py`
- Create: `tests/test_admin_auth.py`

**Step 1: Write failing security tests**

```python
def test_encrypt_round_trip_without_plaintext_leak(): ...
def test_decrypt_rejects_tampered_ciphertext(): ...
def test_password_hash_uses_argon2_and_verifies(): ...
def test_session_cookie_is_http_only_secure_and_same_site(): ...
def test_logs_redact_cookie_token_password_and_id_fields(): ...
```

**Step 2: Verify failure**

Run: `uv run pytest tests/test_security.py tests/test_admin_auth.py -v`

Expected: FAIL.

**Step 3: Implement security primitives**

Use AES-GCM with a random 96-bit nonce per value. Store a versioned base64 envelope containing nonce and ciphertext. Bind ciphertext to its database column and row ID through authenticated additional data so encrypted fields cannot be swapped.

Hash the panel password with Argon2. Implement signed server-side session identifiers with rotation on login. Add CSRF tokens to every state-changing form.

**Step 4: Run tests**

Run: `uv run pytest tests/test_security.py tests/test_admin_auth.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/smu_reserver/security.py src/smu_reserver/auth.py tests/test_security.py tests/test_admin_auth.py
git commit -m "feat: secure credentials and panel sessions"
```

### Task 4: Infospace HTTP client and response contracts

**Files:**
- Create: `src/smu_reserver/infospace/__init__.py`
- Create: `src/smu_reserver/infospace/client.py`
- Create: `src/smu_reserver/infospace/contracts.py`
- Create: `src/smu_reserver/infospace/errors.py`
- Create: `tests/fixtures/infospace/auth_user_info.json`
- Create: `tests/fixtures/infospace/room_menu.json`
- Create: `tests/fixtures/infospace/reserve_list.json`
- Create: `tests/test_infospace_client.py`

**Step 1: Create sanitized fixtures**

Fixtures must preserve only fields required by the implementation. Replace account numbers, names, UUIDs and reservation titles with synthetic values.

**Step 2: Write failing client tests**

Cover:

```python
def test_user_info_extracts_token_and_account(respx_mock): ...
def test_room_menu_finds_shunde_single_cabin_kind(respx_mock): ...
def test_reserve_query_uses_required_cookie_token_and_lan_headers(respx_mock): ...
def test_business_code_300_becomes_session_expired(respx_mock): ...
def test_non_json_and_timeout_errors_are_sanitized(respx_mock): ...
```

**Step 3: Run tests and verify failure**

Run: `uv run pytest tests/test_infospace_client.py -v`

Expected: FAIL.

**Step 4: Implement the read-only client**

The client exposes:

```python
class InfospaceClient:
    async def get_user_info(self) -> UserInfo: ...
    async def get_public_config(self) -> PublicConfig: ...
    async def get_room_menu(self) -> list[RoomKind]: ...
    async def list_reservable_rooms(self, request: RoomQuery) -> list[RoomAvailability]: ...
```

Set explicit connect/read/write/pool timeouts. Disable automatic retries at the HTTP layer; retry decisions belong to the worker. Never include raw response bodies in raised exceptions.

**Step 5: Run tests**

Run: `uv run pytest tests/test_infospace_client.py -v`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/smu_reserver/infospace tests/fixtures/infospace tests/test_infospace_client.py
git commit -m "feat: add infospace read client"
```

### Task 5: Availability calculation and cabin priority

**Files:**
- Create: `src/smu_reserver/domain/availability.py`
- Create: `src/smu_reserver/domain/validation.py`
- Create: `tests/test_availability.py`
- Create: `tests/test_task_validation.py`

**Step 1: Write table-driven failing tests**

Include exact-boundary cases:

- Full interval is free.
- An existing reservation overlaps the start by one minute.
- A closure splits the requested interval.
- A cancelled/ended reservation does not block.
- Freezing time expands a blocking interval.
- An earlier-priority cabin loses to no lower-priority cabin when available.
- A lower-priority cabin is selected when all higher priorities are blocked.
- No shortened or split interval is ever returned.
- Time outside `08:00–22:50`, non-10-minute increments, under 30 minutes and over 240 minutes is rejected.

**Step 2: Run tests and verify failure**

Run: `uv run pytest tests/test_availability.py tests/test_task_validation.py -v`

Expected: FAIL.

**Step 3: Implement pure functions**

Expose:

```python
def validate_task_window(task: TaskInput, rules: ReservationRules) -> None: ...

def room_covers_interval(
    room: RoomAvailability,
    requested_start: datetime,
    requested_end: datetime,
) -> bool: ...

def choose_room(
    rooms: Sequence[RoomAvailability],
    ordered_dev_ids: Sequence[int],
    requested_start: datetime,
    requested_end: datetime,
) -> RoomAvailability | None: ...
```

Use timezone-aware datetimes only.

**Step 4: Run tests**

Run: `uv run pytest tests/test_availability.py tests/test_task_validation.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/smu_reserver/domain tests/test_availability.py tests/test_task_validation.py
git commit -m "feat: select strict continuous cabin slots"
```

### Task 6: Infospace SSO login and bounded captcha adapter

**Files:**
- Create: `src/smu_reserver/infospace/sso.py`
- Create: `src/smu_reserver/infospace/captcha.py`
- Create: `tests/fixtures/sso/login_page.html`
- Create: `tests/test_sso.py`
- Create: `tests/test_captcha.py`

**Step 1: Discover the infospace SSO contract read-only**

Use the existing authenticated session only to inspect `auth/address` and redirect metadata. Record endpoint shape in tests with synthetic values. Do not copy the old academic-system appid unless the live infospace flow proves it is the same.

**Step 2: Write failing SSO tests**

Cover captcha fetch with cookie preservation, credential POST, redirect-chain Cookie merging, infospace session establishment, token retrieval, incorrect credentials, captcha rejection and retry exhaustion.

**Step 3: Verify failure**

Run: `uv run pytest tests/test_sso.py tests/test_captcha.py -v`

Expected: FAIL.

**Step 4: Implement bounded login flow**

Define a narrow adapter:

```python
class CaptchaSolver(Protocol):
    async def solve(self, image: bytes) -> CaptchaAnswer: ...


class SsoAuthenticator:
    async def establish_infospace_session(
        self,
        account: str,
        password: str,
    ) -> AuthSession: ...
```

Use at most the configured number of attempts per authentication cycle. Validate the resulting session with `auth/userInfo`. Persist only encrypted session material. If the target introduces interactive or unsupported verification, return `AUTH_INTERACTION_REQUIRED` rather than looping.

**Step 5: Run tests**

Run: `uv run pytest tests/test_sso.py tests/test_captcha.py -v`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/smu_reserver/infospace/sso.py src/smu_reserver/infospace/captcha.py tests/fixtures/sso tests/test_sso.py tests/test_captcha.py
git commit -m "feat: renew infospace sessions"
```

### Task 7: Reservation submission and remote confirmation

**Files:**
- Create: `src/smu_reserver/infospace/reservations.py`
- Create: `src/smu_reserver/domain/submission.py`
- Create: `tests/test_reservation_submission.py`

**Step 1: Write failing submission tests**

Cover:

- Exact payload fields and datetime formatting.
- Selected `devId` matches the priority decision.
- A business conflict is classified separately from network failure.
- A successful POST is not trusted until remote confirmation succeeds.
- A timeout after POST performs confirmation before any retry.
- Existing matching remote reservation returns success without a second POST.
- No test can reach the production host.

**Step 2: Verify failure**

Run: `uv run pytest tests/test_reservation_submission.py -v`

Expected: FAIL.

**Step 3: Implement submission orchestration**

Build the request from authenticated user data:

```python
ReservationPayload(
    sysKind=1,
    appAccNo=user.acc_no,
    memberKind=1,
    resvBeginTime=start,
    resvEndTime=end,
    testName=task.title,
    resvKind=2,
    resvProperty=0,
    appUrl="",
    resvMember=[user.acc_no],
    resvDev=[room.dev_id],
    memo="",
    captcha="",
    addServices=[],
)
```

Implement a remote matching function based on account, date, time and device. Do not automatically repeat an uncertain POST.

**Step 4: Run tests**

Run: `uv run pytest tests/test_reservation_submission.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/smu_reserver/infospace/reservations.py src/smu_reserver/domain/submission.py tests/test_reservation_submission.py
git commit -m "feat: submit and confirm reservations safely"
```

### Task 8: Worker state machine, leases and retry policy

**Files:**
- Create: `src/smu_reserver/worker.py`
- Create: `src/smu_reserver/domain/state_machine.py`
- Create: `src/smu_reserver/domain/retry.py`
- Create: `src/smu_reserver/repositories/tasks.py`
- Create: `tests/test_state_machine.py`
- Create: `tests/test_worker.py`

**Step 1: Write failing state-machine tests**

Test every allowed transition and reject illegal transitions. Add worker scenarios for restart after lease expiry, two workers racing for one task, auth refresh and resume, all cabins blocked, one conflict followed by lower-priority success, timeout terminal state and cancellation.

**Step 2: Verify failure**

Run: `uv run pytest tests/test_state_machine.py tests/test_worker.py -v`

Expected: FAIL.

**Step 3: Implement task leasing**

Use an atomic conditional update:

```sql
UPDATE reservation_tasks
SET lease_owner = :worker_id,
    lease_expires_at = :expires,
    version = version + 1
WHERE id = :id
  AND status IN ('WAITING', 'PREFLIGHT', 'RUNNING', 'AUTH_REFRESH')
  AND (lease_expires_at IS NULL OR lease_expires_at < :now)
  AND version = :expected_version;
```

Only the lease owner may mutate task execution state. Renew the lease during long authentication calls.

**Step 4: Implement retry decisions**

- Network/connectivity: bounded exponential backoff with jitter.
- Session expired: transition to `AUTH_REFRESH` without consuming a booking-conflict retry.
- Business conflict: refresh availability and continue with remaining priorities.
- Validation/config change: terminal failure.
- Authentication exhaustion: `PAUSED_AUTH`.
- Stop time reached: `FAILED_TIMEOUT`.

**Step 5: Run tests**

Run: `uv run pytest tests/test_state_machine.py tests/test_worker.py -v`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/smu_reserver/worker.py src/smu_reserver/domain src/smu_reserver/repositories tests/test_state_machine.py tests/test_worker.py
git commit -m "feat: execute reservation task state machine"
```

### Task 9: Web panel authentication and task management

**Files:**
- Create: `src/smu_reserver/routes/auth.py`
- Create: `src/smu_reserver/routes/tasks.py`
- Create: `src/smu_reserver/routes/settings.py`
- Create: `src/smu_reserver/templates/base.html`
- Create: `src/smu_reserver/templates/login.html`
- Create: `src/smu_reserver/templates/tasks/index.html`
- Create: `src/smu_reserver/templates/tasks/form.html`
- Create: `src/smu_reserver/templates/settings.html`
- Create: `src/smu_reserver/static/app.css`
- Create: `src/smu_reserver/static/app.js`
- Create: `tests/test_web_auth.py`
- Create: `tests/test_task_routes.py`

**Step 1: Write failing route tests**

Cover unauthenticated redirect, login/logout, CSRF rejection, task creation validation, duplicate overlap rejection, editing waiting tasks, preventing edits to terminal success details, cancellation and cabin ordering.

**Step 2: Verify failure**

Run: `uv run pytest tests/test_web_auth.py tests/test_task_routes.py -v`

Expected: FAIL.

**Step 3: Implement minimal server-rendered UI**

Use semantic HTML and progressive enhancement only. The new-task form must expose:

- Target date.
- Start/end time in 10-minute increments.
- Theme.
- Start-at and stop-at timestamps.
- Ordered enabled cabin list.

Do not render encrypted fields back to HTML. Credential updates use write-only password inputs.

**Step 4: Run route tests**

Run: `uv run pytest tests/test_web_auth.py tests/test_task_routes.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/smu_reserver/routes src/smu_reserver/templates src/smu_reserver/static tests/test_web_auth.py tests/test_task_routes.py
git commit -m "feat: add reservation management panel"
```

### Task 10: Status, audit log and operational safety

**Files:**
- Create: `src/smu_reserver/routes/status.py`
- Create: `src/smu_reserver/logging.py`
- Create: `src/smu_reserver/templates/status.html`
- Create: `src/smu_reserver/templates/attempts.html`
- Modify: `src/smu_reserver/web.py`
- Modify: `src/smu_reserver/worker.py`
- Create: `tests/test_status.py`
- Create: `tests/test_logging.py`

**Step 1: Write failing operational tests**

Cover readiness failure when migration is pending, stale Worker heartbeat, redaction of nested structures and headers, bounded attempt log sizes, and no raw upstream body in UI errors.

**Step 2: Verify failure**

Run: `uv run pytest tests/test_status.py tests/test_logging.py -v`

Expected: FAIL.

**Step 3: Implement status and audit views**

`/health/live` reports process health only. `/health/ready` checks database connectivity and schema version. The authenticated status page additionally displays Worker heartbeat, last successful authentication and pending task counts.

**Step 4: Run tests**

Run: `uv run pytest tests/test_status.py tests/test_logging.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/smu_reserver/routes/status.py src/smu_reserver/logging.py src/smu_reserver/templates src/smu_reserver/web.py src/smu_reserver/worker.py tests/test_status.py tests/test_logging.py
git commit -m "feat: add operational status and audit logs"
```

### Task 11: Container and reverse-proxy deployment assets

**Files:**
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `docker/entrypoint-web.sh`
- Create: `docker/entrypoint-worker.sh`
- Create: `deploy/nginx.example.conf`
- Create: `deploy/smu-reserver.env.example`
- Create: `tests/test_compose_config.py`

**Step 1: Write failing deployment-asset test**

Parse Compose and assert:

- Web binds only `127.0.0.1:8765`.
- Web and Worker share the data volume.
- Neither service contains committed secrets.
- Both services have restart policies and health checks.
- Worker is not exposed on a host port.

**Step 2: Verify failure**

Run: `uv run pytest tests/test_compose_config.py -v`

Expected: FAIL.

**Step 3: Implement deployment assets**

The image runs as a non-root user. The Web entrypoint applies migrations before starting one Uvicorn process. The Worker entrypoint starts only the worker. Mount the database at `/app/data` and inject keys only through environment or secrets.

Nginx example must proxy to `127.0.0.1:8765`, set forwarded headers, limit request body size, enable reasonable timeouts and assume HTTPS termination. It must use a placeholder `server_name`.

**Step 4: Validate assets**

Run: `docker compose config`

Expected: exit 0 with no interpolation errors when using documented test values.

Run: `uv run pytest tests/test_compose_config.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add Dockerfile compose.yaml docker deploy tests/test_compose_config.py
git commit -m "chore: add isolated VPS deployment"
```

### Task 12: End-to-end fake server, documentation and final verification

**Files:**
- Create: `tests/fake_infospace/app.py`
- Create: `tests/test_end_to_end.py`
- Create: `README.md`
- Create: `docs/operations.md`
- Create: `docs/production-checklist.md`

**Step 1: Build an in-process fake infospace service**

Support deterministic scenarios for session expiry, captcha rejection, delayed release, all cabins blocked, priority conflict, successful submission, lost POST response and remote confirmation.

**Step 2: Write end-to-end tests**

Prove:

- A future task remains waiting before its attempt window.
- Session refresh resumes the same task.
- Delayed release selects the highest available priority.
- A conflict moves to the next priority without changing the requested time.
- An uncertain POST is confirmed without duplication.
- Restarting Web and Worker preserves tasks and successful terminal state.

**Step 3: Run end-to-end tests**

Run: `uv run pytest tests/test_end_to_end.py -v`

Expected: PASS.

**Step 4: Write operator documentation**

README covers local setup, environment generation, first administrator creation, task semantics and safe testing. Operations documentation covers backup, restore, key rotation, Session troubleshooting, log inspection and upgrading. Production checklist explicitly requires user confirmation before DNS, Nginx, secret or deployment changes.

**Step 5: Run the complete verification suite**

Run: `uv run ruff check .`

Expected: exit 0.

Run: `uv run mypy src`

Expected: exit 0.

Run: `uv run pytest -q`

Expected: all tests pass with no production network calls.

Run: `docker build -t smu-reserver:test .`

Expected: image builds successfully.

Run: `docker compose config`

Expected: exit 0.

Run: `docker compose up -d --build && docker compose ps`

Expected: Web and Worker are healthy; Web is bound only to `127.0.0.1:8765`.

Run: `curl --fail http://127.0.0.1:8765/health/live`

Expected: `{"status":"ok"}`.

Run: `docker compose down`

Expected: containers stop without deleting the persistent data volume.

**Step 6: Commit**

```bash
git add tests/fake_infospace tests/test_end_to_end.py README.md docs
git commit -m "test: verify reservation service end to end"
```

## Production handoff checkpoint

After all local verification passes, stop and ask for explicit approval before:

- Uploading files to `79.137.78.127`.
- Creating the production data directory or Docker resources.
- Adding the encryption master key, SMU credentials or administrator password.
- Changing DNS, Nginx, TLS certificates, firewall rules or 1Panel configuration.
- Performing the first real reservation submission.

