import base64
import re
from datetime import date, timedelta

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient

from smu_reserver.config import Settings
from smu_reserver.web import create_app


def build_client(tmp_path) -> TestClient:
    key = base64.urlsafe_b64encode(AESGCM.generate_key(bit_length=256)).decode()
    settings = Settings(
        app_env="test",
        database_path=tmp_path / "panel.db",
        app_secret_key="test-session-secret-value",
        credential_key=key,
    )
    app = create_app(settings)
    app.state.admin_repository.set_password("panel-password")
    return TestClient(app)


def login(client: TestClient) -> None:
    csrf = extract_csrf(client.get("/login").text)
    response = client.post(
        "/login",
        data={"password": "panel-password", "csrf": csrf},
        follow_redirects=False,
    )
    assert response.status_code == 303


def extract_csrf(html: str) -> str:
    match = re.search(r'name="csrf" value="([^"]+)"', html)
    assert match is not None
    return match.group(1)


def test_panel_redirects_unauthenticated_user_to_login(tmp_path) -> None:
    client = build_client(tmp_path)

    response = client.get("/", follow_redirects=False)

    assert response.status_code == 303
    assert response.headers["location"] == "/login"


def test_login_and_save_smu_credentials_without_echoing_password(tmp_path) -> None:
    client = build_client(tmp_path)
    login(client)
    csrf = extract_csrf(client.get("/settings").text)

    response = client.post(
        "/settings/credentials",
        data={"account": "student-id", "password": "smu-password", "csrf": csrf},
        follow_redirects=False,
    )

    assert response.status_code == 303
    page = client.get("/settings")
    assert "student-id" not in page.text
    assert "smu-password" not in page.text
    assert "已保存" in page.text


def test_create_future_task_with_ordered_cabins(tmp_path) -> None:
    client = build_client(tmp_path)
    login(client)
    target = date.today() + timedelta(days=3)
    csrf = extract_csrf(client.get("/tasks/new").text)

    response = client.post(
        "/tasks",
        data={
            "target_date": target.isoformat(),
            "start_time": "09:00",
            "end_time": "11:00",
            "title": "学习",
            "attempt_from": f"{(target - timedelta(days=1)).isoformat()}T23:59",
            "attempt_until": f"{target.isoformat()}T09:00",
            "cabin_ids": "29817278,29817269",
            "csrf": csrf,
        },
        follow_redirects=False,
    )

    assert response.status_code == 303
    tasks = client.get("/")
    assert target.isoformat() in tasks.text
    assert "09:00–11:00" in tasks.text
    assert "等待" in tasks.text


def test_state_change_rejects_missing_csrf_token(tmp_path) -> None:
    client = build_client(tmp_path)
    login(client)

    response = client.post(
        "/settings/credentials",
        data={"account": "student-id", "password": "smu-password"},
        follow_redirects=False,
    )

    assert response.status_code == 403
