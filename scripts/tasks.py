from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*command: str) -> None:
    subprocess.run(command, cwd=ROOT, check=True)  # noqa: S603


def main() -> int:
    parser = argparse.ArgumentParser(description="Nanyee cross-platform development tasks")
    parser.add_argument(
        "task", choices=("api", "check", "format", "migrate", "openapi", "test", "worker")
    )
    task = parser.parse_args().task
    if task == "format":
        run("uv", "run", "ruff", "format", ".")
        run("uv", "run", "ruff", "check", "--fix", ".")
    elif task == "test":
        run("uv", "run", "pytest", "-q")
    elif task == "openapi":
        run("uv", "run", "python", "scripts/export_openapi.py")
    elif task == "migrate":
        run("uv", "run", "alembic", "-c", "services/platform/alembic.ini", "upgrade", "head")
    elif task == "api":
        run("uv", "run", "uvicorn", "nanyee.main:app", "--host", "127.0.0.1", "--port", "8000")
    elif task == "worker":
        run("uv", "run", "nanyee-worker")
    else:
        run("uv", "run", "ruff", "format", "--check", ".")
        run("uv", "run", "ruff", "check", ".")
        run("uv", "run", "mypy")
        run("uv", "run", "pytest", "-q")
        run("uv", "run", "python", "scripts/export_openapi.py", "--check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
