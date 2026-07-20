from fastapi.testclient import TestClient

from smu_reserver.web import create_app


def test_liveness_endpoint() -> None:
    client = TestClient(create_app())

    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
