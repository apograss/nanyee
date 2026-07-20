import base64
import binascii
import os

from argon2 import PasswordHasher as ArgonPasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CredentialCipher:
    def __init__(self, encoded_key: str) -> None:
        try:
            key = base64.urlsafe_b64decode(encoded_key.encode())
        except (ValueError, binascii.Error) as error:
            raise ValueError("CREDENTIAL_KEY 必须是 base64 编码") from error
        if len(key) != 32:
            raise ValueError("CREDENTIAL_KEY 解码后必须为 32 字节")
        self._cipher = AESGCM(key)

    def encrypt(self, plaintext: str, *, purpose: str) -> str:
        nonce = os.urandom(12)
        ciphertext = self._cipher.encrypt(nonce, plaintext.encode(), purpose.encode())
        payload = base64.urlsafe_b64encode(nonce + ciphertext).decode()
        return f"v1.{payload}"

    def decrypt(self, envelope: str, *, purpose: str) -> str:
        try:
            version, payload = envelope.split(".", 1)
            if version != "v1":
                raise ValueError
            raw = base64.urlsafe_b64decode(payload.encode())
            plaintext = self._cipher.decrypt(raw[:12], raw[12:], purpose.encode())
            return plaintext.decode()
        except (ValueError, binascii.Error, InvalidTag, UnicodeDecodeError) as error:
            raise ValueError("密文校验失败") from error


class PasswordHasher:
    def __init__(self) -> None:
        self._hasher = ArgonPasswordHasher()

    def hash(self, password: str) -> str:
        if len(password) < 10:
            raise ValueError("面板密码至少需要 10 个字符")
        return self._hasher.hash(password)

    def verify(self, encoded: str, password: str) -> bool:
        try:
            return self._hasher.verify(encoded, password)
        except (VerifyMismatchError, InvalidHashError):
            return False
