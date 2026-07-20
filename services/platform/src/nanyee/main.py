from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from nanyee.config import Settings, get_settings
from nanyee.context import request_id_context
from nanyee.credentials.factory import build_envelope_cipher
from nanyee.credentials.router import router as credentials_router
from nanyee.db import close_database
from nanyee.errors import AppError, ErrorBody, ErrorCode, ErrorResponse, app_error_handler
from nanyee.health import router as health_router
from nanyee.identity.router import router as identity_router
from nanyee.integrations.qun100.router import router as qun100_router
from nanyee.integrations.smu.client import SmuAcademicClient
from nanyee.integrations.smu.router import router as smu_router
from nanyee.jobs.router import router as jobs_router
from nanyee.logging import configure_logging
from nanyee.middleware import RequestContextMiddleware
from nanyee.registration.router import router as registration_router
from nanyee.tool_registry.router import router as tools_router
from nanyee.transient import TransientSecretStore

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    transient_store = TransientSecretStore(
        ttl_seconds=settings.transient_secret_ttl_seconds,
        max_entries=settings.transient_secret_max_entries,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        logger.info("api_started", extra={"event": "api_started"})
        yield
        await transient_store.close()
        await close_database()
        logger.info("api_stopped", extra={"event": "api_stopped"})

    docs_url = "/docs" if settings.docs_enabled else None
    openapi_url = "/openapi.json" if settings.docs_enabled else None
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url=docs_url,
        redoc_url=None,
        openapi_url=openapi_url,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.credential_cipher = build_envelope_cipher(settings)
    app.state.transient_store = transient_store
    app.state.smu_client = SmuAcademicClient(settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key", "X-Request-ID"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(RequestContextMiddleware)
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = [{"location": list(error["loc"]), "type": error["type"]} for error in exc.errors()]
        body = ErrorResponse(
            error=ErrorBody(
                code=ErrorCode.INVALID_REQUEST,
                message="请求数据无效。",
                request_id=request_id_context.get(),
                details={"fields": errors},
            )
        )
        return JSONResponse(status_code=422, content=body.model_dump(mode="json"))

    app.include_router(health_router)
    app.include_router(tools_router, prefix="/api/v1")
    app.include_router(identity_router, prefix="/api/v1")
    app.include_router(registration_router, prefix="/api/v1")
    app.include_router(credentials_router, prefix="/api/v1")
    app.include_router(jobs_router, prefix="/api/v1")
    app.include_router(smu_router, prefix="/api/v1")
    app.include_router(qun100_router, prefix="/api/v1")
    return app


app = create_app()


def run() -> None:
    uvicorn.run("nanyee.main:app", host="127.0.0.1", port=8000, reload=False)
