from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict, model_validator


class RegisterIn(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    confirm_password: str

    @model_validator(mode="after")
    def _validate(self):
        if len(self.full_name.strip()) == 0:
            raise ValueError("Full name is required")
        if len(self.password) < 8:
            raise ValueError("Password must be at least 8 characters")
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    """Never includes password_hash — this is the only user shape the API ever returns."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime


class ProfileUpdateIn(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None

    @model_validator(mode="after")
    def _validate(self):
        if self.full_name is not None and len(self.full_name.strip()) == 0:
            raise ValueError("Full name cannot be empty")
        if self.full_name is None and self.email is None:
            raise ValueError("Provide at least one field to update")
        return self


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut
