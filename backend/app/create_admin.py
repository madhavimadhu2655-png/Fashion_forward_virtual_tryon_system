"""
Creates an admin user directly in the database. There is no API endpoint
for this — registration always creates a `customer` — by design, so this
is the only way to provision an admin account.

Run with:
    docker compose exec backend python -m app.create_admin "Admin Name" admin@example.com somepassword123
"""

import sys

from app.db.session import SessionLocal
from app.crud.user import get_user_by_email, create_user
from app.models.user import User


def run(full_name: str, email: str, password: str):
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = get_user_by_email(db, email)
        if existing is not None:
            existing.role = "admin"
            db.commit()
            print(f"User {email} already existed — promoted to admin.")
            return

        user = create_user(db, full_name, email, password)
        user.role = "admin"
        db.commit()
        print(f"Admin user created: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print('Usage: python -m app.create_admin "Full Name" email@example.com password123')
        sys.exit(1)
    run(sys.argv[1], sys.argv[2], sys.argv[3])
