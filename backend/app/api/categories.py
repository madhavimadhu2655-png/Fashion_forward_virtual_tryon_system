from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.crud import product as crud

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("")
def list_categories(db: Session = Depends(get_db)):
    try:
        return crud.get_categories(db)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not query categories: {exc}")
