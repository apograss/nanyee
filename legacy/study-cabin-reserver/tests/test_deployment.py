from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_compose_exposes_only_web_on_loopback() -> None:
    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")

    assert '"127.0.0.1:8765:8765"' in compose
    assert "python -m smu_reserver.worker_service" in compose
    assert "ADMIN_PASSWORD=" not in compose
    assert "CREDENTIAL_KEY=" not in compose


def test_docker_image_runs_as_non_root() -> None:
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "USER app" in dockerfile
    assert "HEALTHCHECK" in dockerfile
