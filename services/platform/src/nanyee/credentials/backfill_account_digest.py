"""为存量学校凭据补算学号摘要（account_digest），见 docs/adr/0002。

在能解密凭据的容器里运行（需要凭据主密钥和 NANYEE_SCHOOL_ACCOUNT_DIGEST_KEY）：

    python -m nanyee.credentials.backfill_account_digest           # 只补空值
    python -m nanyee.credentials.backfill_account_digest --all     # 轮换密钥后全部重算

只输出计数，不输出任何学号或密码。
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from nanyee.config import get_settings
from nanyee.credentials.account_digest import digest_for_plaintext
from nanyee.credentials.factory import build_envelope_cipher
from nanyee.credentials.models import SCHOOL_ACCOUNT_PURPOSES, CredentialStatus, HostedCredential
from nanyee.credentials.service import CredentialVaultService
from nanyee.db.session import get_session_factory


async def backfill(*, recompute_all: bool) -> dict[str, int]:
    settings = get_settings()
    if settings.school_account_digest_key is None:
        raise SystemExit("NANYEE_SCHOOL_ACCOUNT_DIGEST_KEY 未配置")
    cipher = build_envelope_cipher(settings)
    if cipher is None:
        raise SystemExit("凭据主密钥未配置")
    vault = CredentialVaultService(cipher, settings)
    counts = {"updated": 0, "skipped": 0, "failed": 0}
    async with get_session_factory()() as db:
        statement = select(HostedCredential).where(
            HostedCredential.purpose.in_(SCHOOL_ACCOUNT_PURPOSES),
            HostedCredential.status != CredentialStatus.DELETED,
        )
        if not recompute_all:
            statement = statement.where(HostedCredential.account_digest.is_(None))
        for record in (await db.execute(statement)).scalars():
            try:
                plaintext = await vault._decrypt_record(record)
            except Exception:
                counts["failed"] += 1
                continue
            digest = digest_for_plaintext(settings, record.purpose, plaintext)
            if digest is None:
                counts["skipped"] += 1
                continue
            record.account_digest = digest
            counts["updated"] += 1
        await db.commit()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--all", action="store_true", help="重算全部（含已有摘要的）")
    args = parser.parse_args()
    print(asyncio.run(backfill(recompute_all=args.all)))


if __name__ == "__main__":
    main()
