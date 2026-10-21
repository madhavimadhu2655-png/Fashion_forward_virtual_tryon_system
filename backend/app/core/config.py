from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Fashion Forward API"
    database_url: str = "postgresql://ff_user:ff_password@db:5432/fashion_forward"
    environment: str = "development"
    cors_origins: str = "http://localhost:5173"

    # JWT auth — override JWT_SECRET via .env in any real deployment.
    # This default is fine for local dev only.
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    photo_tryon_worker_url: str = Field(default="", validation_alias="CATVTON_WORKER_URL")
    photo_tryon_worker_token: str = Field(default="", validation_alias="CATVTON_WORKER_TOKEN")
    photo_tryon_noncommercial_confirmed: bool = Field(
        default=False,
        validation_alias="CATVTON_NONCOMMERCIAL_USE_CONFIRMED",
    )

    class Config:
        env_file = ".env"


settings = Settings()
