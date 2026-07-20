from __future__ import annotations

import asyncio
import logging
import signal
import socket
from contextlib import suppress

from nanyee.config import get_settings
from nanyee.credentials.factory import build_envelope_cipher
from nanyee.credentials.service import CredentialVaultService
from nanyee.db import close_database
from nanyee.db.session import get_session_factory
from nanyee.logging import configure_logging

from nanyee_worker.evaluation import EvaluationHandler
from nanyee_worker.qun_checkin import QunCheckinHandler
from nanyee_worker.runtime import WorkerRuntime
from nanyee_worker.study_cabin import DdddOcrSolver, StudyCabinHandler

logger = logging.getLogger(__name__)


async def serve() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()

    for signum in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(signum, stop.set)

    worker_id = f"{settings.worker_id}@{socket.gethostname()}"
    cipher = build_envelope_cipher(settings)
    if cipher is None:
        raise RuntimeError("worker requires a configured credential key provider")
    vault = CredentialVaultService(cipher, settings)
    solver = DdddOcrSolver()
    handler = StudyCabinHandler(settings, vault, solver)
    runtime = WorkerRuntime(
        get_session_factory(),
        worker_id=worker_id,
        lease_seconds=settings.worker_lease_seconds,
        retry_interval_seconds=settings.worker_retry_interval_seconds,
        handlers={
            "evaluation": EvaluationHandler(settings, vault, solver),
            "study_cabin": handler,
            "qun_checkin": QunCheckinHandler(settings, vault),
        },
    )
    logger.info("worker_started", extra={"event": "worker_started", "worker_id": worker_id})
    try:
        while not stop.is_set():
            processed = await runtime.run_once()
            if processed:
                continue
            with suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_interval_seconds)
    finally:
        await close_database()
        logger.info("worker_stopped", extra={"event": "worker_stopped", "worker_id": worker_id})


def run() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    run()
