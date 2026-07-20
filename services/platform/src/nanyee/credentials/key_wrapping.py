from __future__ import annotations

from base64 import b64decode
from dataclasses import dataclass
from typing import Protocol

from azure.identity.aio import DefaultAzureCredential
from azure.keyvault.keys.crypto import KeyWrapAlgorithm
from azure.keyvault.keys.crypto.aio import CryptographyClient
from cryptography.hazmat.primitives.keywrap import aes_key_unwrap, aes_key_wrap


@dataclass(frozen=True, slots=True)
class WrappedKey:
    ciphertext: bytes
    key_reference: str
    algorithm: str


class KeyWrappingProvider(Protocol):
    async def wrap(self, data_key: bytes) -> WrappedKey: ...

    async def unwrap(self, wrapped_key: WrappedKey) -> bytes: ...


class LocalFileKeyWrappingProvider:
    def __init__(self, encoded_master_key: str, *, key_version: str) -> None:
        master_key = b64decode(encoded_master_key, validate=True)
        if len(master_key) != 32:
            raise ValueError("local master key must decode to exactly 32 bytes")
        self._master_key = master_key
        self._key_reference = key_version

    async def wrap(self, data_key: bytes) -> WrappedKey:
        return WrappedKey(
            ciphertext=aes_key_wrap(self._master_key, data_key),
            key_reference=self._key_reference,
            algorithm="A256KW",
        )

    async def unwrap(self, wrapped_key: WrappedKey) -> bytes:
        if wrapped_key.key_reference != self._key_reference:
            raise ValueError("local key version is unavailable")
        if wrapped_key.algorithm != "A256KW":
            raise ValueError("unsupported local key-wrap algorithm")
        return aes_key_unwrap(self._master_key, wrapped_key.ciphertext)


class AzureKeyVaultKeyWrappingProvider:
    def __init__(
        self,
        key_id: str,
        *,
        credential: DefaultAzureCredential | None = None,
    ) -> None:
        self._key_id = key_id
        self._credential = credential or DefaultAzureCredential()

    async def wrap(self, data_key: bytes) -> WrappedKey:
        async with CryptographyClient(self._key_id, self._credential) as client:
            result = await client.wrap_key(KeyWrapAlgorithm.rsa_oaep_256, data_key)
        return WrappedKey(
            ciphertext=result.encrypted_key,
            key_reference=result.key_id or self._key_id,
            algorithm="RSA-OAEP-256",
        )

    async def unwrap(self, wrapped_key: WrappedKey) -> bytes:
        if wrapped_key.algorithm != "RSA-OAEP-256":
            raise ValueError("unsupported Azure key-wrap algorithm")
        async with CryptographyClient(wrapped_key.key_reference, self._credential) as client:
            result = await client.unwrap_key(KeyWrapAlgorithm.rsa_oaep_256, wrapped_key.ciphertext)
        return result.key

    async def close(self) -> None:
        await self._credential.close()
