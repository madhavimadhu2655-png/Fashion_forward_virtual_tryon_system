from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.core.security import hash_password, verify_password


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower()).first()


def create_user(db: Session, full_name: str, email: str, password: str) -> User:
    """Always creates a `customer` — there is no code path that lets a
    request body set role='admin'. Admins are provisioned directly in
    the database (see README)."""
    user = User(
        full_name=full_name.strip(),
        email=email.lower(),
        password_hash=hash_password(password),
        role="customer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def update_user_profile(
    db: Session, user: User, full_name: Optional[str] = None, email: Optional[str] = None
) -> User:
    if full_name is not None:
        user.full_name = full_name.strip()
    if email is not None:
        user.email = email.lower()
    db.commit()
    db.refresh(user)
    return user
