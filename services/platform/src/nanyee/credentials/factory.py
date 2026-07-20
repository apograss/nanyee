from __future__ import annotations

from nanyee.config import Settings
from nanyee.credentials.envelope import EnvelopeCipher
from nanyee.credentials.key_wrapping import (
    AzureKeyVaultKeyWrappingProvider,
    LocalFileKeyWrappingProvider,
)


def build_envelope_cipher(settings: Settings) -> EnvelopeCipher | None:
    if settings.credential_key_provider == "azure":
        assert settings.azure_key_vault_key_id is not None
        return EnvelopeCipher(AzureKeyVaultKeyWrappingProvider(settings.azure_key_vault_key_id))
    if settings.credential_local_master_key is None:
        return None
    return EnvelopeCipher(
        LocalFileKeyWrappingProvider(
            settings.credential_local_master_key.get_secret_value(),
            key_version=settings.credential_local_key_version,
        )
    )
