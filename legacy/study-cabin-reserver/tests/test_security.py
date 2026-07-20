import base64
import sqlite3

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from smu_reserver.db import Database
from smu_reserver.security import CredentialCipher, PasswordHasher
from smu_reserver.settings_repository import AdminRepository, CredentialRepository


def encryption_key() -> str:
    return base64.urlsafe_b64encode(AESGCM.generate_key(bit_length=256)).decode()


def test_credential_cipher_round_trip_without_plaintext() -> None:
    cipher = CredentialCipher(encryption_key())

    encrypted = cipher.encrypt("secret-cookie", purpose="cookie")

    assert "secret-cookie" not in encrypted
    assert cipher.decrypt(encrypted, purpose="cookie") == "secret-cookie"


def test_credential_cipher_rejects_tampering_and_wrong_purpose() -> None:
    cipher = CredentialCipher(encryption_key())
    encrypted = cipher.encrypt("token-value", purpose="token")

    with pytest.raises(ValueError, match="密文校验失败"):
        cipher.decrypt(encrypted[:-2] + "AA", purpose="token")
    with pytest.raises(ValueError, match="密文校验失败"):
        cipher.decrypt(encrypted, purpose="cookie")


def test_password_hash_verifies_without_storing_plaintext() -> None:
    hasher = PasswordHasher()

    encoded = hasher.hash("panel-password")

    assert "panel-password" not in encoded
    assert hasher.verify(encoded, "panel-password") is True
    assert hasher.verify(encoded, "wrong") is False


def test_admin_and_smu_credentials_are_persisted_securely(tmp_path) -> None:
    database = Database(tmp_path / "test.db")
    database.initialize()
    cipher = CredentialCipher(encryption_key())
    admins = AdminRepository(database, PasswordHasher())
    credentials = CredentialRepository(database, cipher)

    admins.set_password("panel-password")
    credentials.save_login("student-id", "smu-password")

    assert admins.verify_password("panel-password") is True
    assert admins.verify_password("wrong") is False
    assert credentials.get_login() == ("student-id", "smu-password")

    with sqlite3.connect(database.path) as connection:
        rows = connection.execute("SELECT * FROM smu_credentials")
        raw = " ".join(str(value) for row in rows for value in row)
    assert "student-id" not in raw
    assert "smu-password" not in raw
