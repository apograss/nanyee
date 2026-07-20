from __future__ import annotations

import pytest
from nanyee.errors import AppError
from nanyee.identity.passwords import hash_password, validate_password, verify_password


def test_argon2id_password_round_trip() -> None:
    password_hash = hash_password("能记住的密码 2026")
    assert password_hash.startswith("$argon2id$")
    assert verify_password(password_hash, "能记住的密码 2026")
    assert not verify_password(password_hash, "wrong password")


@pytest.mark.parametrize("password", ["short", "12345678", "\x00password", "a" * 129])
def test_password_policy_rejects_unsafe_values(password: str) -> None:
    with pytest.raises(AppError):
        validate_password(password)


def test_password_policy_does_not_require_character_classes() -> None:
    validate_password("只用汉字也可以记住")
