from __future__ import annotations

from nanyee.config import Settings
from nanyee.credentials.service import CredentialVaultService
from nanyee.integrations.qun100 import (
    Qun100Client,
    Qun100Rejected,
    Qun100SubmissionUnknown,
    Qun100Unavailable,
)
from nanyee.jobs.models import Job
from nanyee.tools.qun_checkin import QunSubmitRequest, validate_auth_token
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee_worker.runtime import ExecutionFailure, ExecutionReceipt, ensure_execution_active


class QunCheckinHandler:
    def __init__(self, settings: Settings, vault: CredentialVaultService) -> None:
        self._vault = vault
        self._client = Qun100Client(settings)

    async def execute(self, db: AsyncSession, job: Job) -> ExecutionReceipt:
        if job.credential_id is None:
            raise ExecutionFailure(
                "CREDENTIAL_REQUIRED", retryable=False, next_action="replace_credential"
            )
        request = QunSubmitRequest.model_validate(job.payload)
        try:
            plaintext = await self._vault.decrypt_for_worker(
                db,
                credential_id=job.credential_id,
                user_id=job.user_id,
                purpose="qun_checkin",
            )
            token_buffer = bytearray(plaintext)
            token = validate_auth_token(token_buffer.decode("utf-8"))
        except Exception as exc:
            raise ExecutionFailure(
                "CREDENTIAL_UNAVAILABLE", retryable=False, next_action="replace_credential"
            ) from exc
        finally:
            if "token_buffer" in locals():
                token_buffer[:] = b"\x00" * len(token_buffer)
        try:
            await ensure_execution_active(db, job)
            await self._client.submit(
                request.form_id,
                form_version=request.form_version,
                catalogs=[item.model_dump(mode="json") for item in request.catalogs],
                token=token,
            )
        except Qun100SubmissionUnknown as exc:
            raise ExecutionFailure(
                "RESULT_UNKNOWN",
                retryable=False,
                result_unknown=True,
                next_action="verify_upstream",
            ) from exc
        except Qun100Rejected as exc:
            raise ExecutionFailure(
                "UPSTREAM_REJECTED", retryable=False, next_action="replace_credential"
            ) from exc
        except Qun100Unavailable as exc:
            raise ExecutionFailure("UPSTREAM_UNAVAILABLE", retryable=True) from exc
        finally:
            token = ""
        return ExecutionReceipt(
            {
                "form_id": request.form_id,
                "title": request.title,
                "submitted": True,
            }
        )
