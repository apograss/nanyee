FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy
WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY services/platform/pyproject.toml services/platform/pyproject.toml
COPY services/worker/pyproject.toml services/worker/pyproject.toml
COPY services/platform/src services/platform/src
COPY services/worker/src services/worker/src
RUN uv sync --frozen --all-packages --no-dev --no-editable

FROM python:3.12-slim-bookworm AS runtime

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 nanyee \
    && useradd --system --uid 10001 --gid nanyee --home-dir /app nanyee

WORKDIR /app
COPY --from=builder --chown=nanyee:nanyee /app/.venv /app/.venv
COPY --chown=nanyee:nanyee services/platform/alembic.ini services/platform/alembic.ini
COPY --chown=nanyee:nanyee services/platform/migrations services/platform/migrations

USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "nanyee.main:app", "--host", "0.0.0.0", "--port", "8000"]
