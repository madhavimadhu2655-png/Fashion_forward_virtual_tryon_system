from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.crud import user as crud
from app.schemas.auth import RegisterIn, LoginIn, RefreshIn, TokenOut, UserOut, ProfileUpdateIn
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _tokens_for(user: User) -> dict:
    return {
        "access_token": create_access_token(user.id, user.role),
        "refresh_token": create_refresh_token(user.id, user.role),
        "token_type": "bearer",
        "user": user,
    }


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if crud.get_user_by_email(db, payload.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = crud.create_user(db, payload.full_name, payload.email, payload.password)
    return _tokens_for(user)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = crud.authenticate_user(db, payload.email, payload.password)
    if user is None:
        # Deliberately generic — don't reveal whether the email exists.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _tokens_for(user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: ProfileUpdateIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.email is not None and payload.email.lower() != current_user.email:
        existing = crud.get_user_by_email(db, payload.email)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    return crud.update_user_profile(db, current_user, full_name=payload.full_name, email=payload.email)


@router.post("/refresh", response_model=TokenOut)
def refresh(payload: RefreshIn, db: Session = Depends(get_db)):
    token_payload = decode_token(payload.refresh_token)
    if token_payload is None or token_payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.id == token_payload.get("sub")).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")

    return _tokens_for(user)


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # JWTs are stateless here — there's no server-side session to destroy,
    # so "logout" is really the client discarding its stored tokens. This
    # endpoint exists so the frontend has something to call and so a
    # missing/invalid token is still rejected the same way any protected
    # route would reject it. A real logout-everywhere feature would need a
    # token blocklist table, which isn't implemented in this milestone.
    return {"message": "Logged out. Discard the access and refresh tokens client-side."}
