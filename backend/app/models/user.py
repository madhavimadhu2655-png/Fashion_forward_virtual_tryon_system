from datetime import datetime

from sqlalchemy import Column, String, DateTime, Boolean

from app.models.product import Base, gen_uuid


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    # "customer" or "admin" — kept as "customer" rather than the generic
    # "user" so it reads clearly in an e-commerce context. Nothing in the
    # registration API accepts a role from the request body.
    role = Column(String, nullable=False, default="customer")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
