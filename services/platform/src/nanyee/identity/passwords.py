from __future__ import annotations

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from nanyee.errors import AppError, ErrorCode

_HASHER = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)

_BLOCKED_PASSWORDS = frozenset(
    {
        "12345678",
        "11111111",
        "00000000",
        "abcdefgh",
        "password",
        "password1",
        "qwerty123",
        "qwertyuiop",
        "iloveyou",
        "admin123",
        "abc12345",
        "1q2w3e4r",
        "123456789",
        "1234567890",
        "南方医科大学",
    }
)


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "密码至少需要 8 个字符。",
            status_code=422,
            details={"field": "password", "reason": "too_short"},
        )
    if len(password) > 128:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "密码不能超过 128 个字符。",
            status_code=422,
            details={"field": "password", "reason": "too_long"},
        )
    if "\x00" in password:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "密码包含不支持的字符。",
            status_code=422,
            details={"field": "password", "reason": "invalid_character"},
        )
    if password.strip().casefold() in _BLOCKED_PASSWORDS:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "该密码过于常见，请换一个。",
            status_code=422,
            details={"field": "password", "reason": "known_password"},
        )


def hash_password(password: str) -> str:
    validate_password(password)
    return _HASHER.hash(password)


def verify_password(password_hash: str, candidate: str) -> bool:
    try:
        return _HASHER.verify(password_hash, candidate)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _HASHER.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True
