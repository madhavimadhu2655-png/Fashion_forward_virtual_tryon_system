from datetime import datetime, timedelta
from typing import Optional, Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# bcrypt — never store or return plain-text passwords.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def _create_token(user_id: str, role: str, token_type: Literal["access", "refresh"], expires_delta: timedelta) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": user_id,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, role: str) -> str:
    return _create_token(
        user_id, role, "access", timedelta(minutes=settings.access_token_expire_minutes)
    )


def create_refresh_token(user_id: str, role: str) -> str:
    return _create_token(
        user_id, role, "refresh", timedelta(days=settings.refresh_token_expire_days)
    )


def decode_token(token: str) -> Optional[dict]:
    """Returns the token payload if valid, or None if invalid/expired/malformed."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
