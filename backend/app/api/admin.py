from fastapi import APIRouter, Depends

from app.core.deps import require_admin
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/ping")
def admin_ping(current_user: User = Depends(require_admin)):
    """Exists to prove role-based authorization is enforced server-side,
    not just hidden in the frontend. The full admin product-management
    dashboard is a later milestone — this is the foundation only."""
    return {"status": "ok", "message": f"Admin access confirmed for {current_user.email}"}
