"""Favourites (wishlist) and Saved Looks.

Every query is scoped to the authenticated user. Another user's look id
returns the same 404 as a missing one, so ids can't be probed.
Saved looks hold metadata only — never photos or generated images.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.crud import product as product_crud
from app.db.session import get_db
from app.models.looks import SavedLook, WishlistItem
from app.models.product import Product
from app.models.user import User
from app.schemas.looks import (
    SavedLookIn,
    SavedLookOut,
    SavedLookUpdateIn,
    WishlistMergeIn,
    WishlistOut,
)

router = APIRouter(prefix="/api", tags=["looks"])

MAX_SAVED_LOOKS = 200
MAX_WISHLIST = 200
PRIVATE_HEADERS = {"Cache-Control": "private, no-store"}


def _private(response: Response) -> None:
    response.headers.update(PRIVATE_HEADERS)


def _wishlist_ids(db: Session, user_id: str) -> list[str]:
    rows = (
        db.query(WishlistItem.product_id)
        .filter(WishlistItem.user_id == user_id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    return [row[0] for row in rows]


def _add_wishlist(db: Session, user_id: str, product_id: str) -> None:
    exists = (
        db.query(WishlistItem.id)
        .filter(WishlistItem.user_id == user_id, WishlistItem.product_id == product_id)
        .first()
    )
    if exists:
        return
    if db.query(WishlistItem).filter(WishlistItem.user_id == user_id).count() >= MAX_WISHLIST:
        raise HTTPException(status_code=409, detail="Your favourites list is full.")
    db.add(WishlistItem(user_id=user_id, product_id=product_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # a concurrent request added it first — same end state


@router.get("/wishlist", response_model=WishlistOut, dependencies=[Depends(_private)])
def get_wishlist(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"product_ids": _wishlist_ids(db, current_user.id)}


@router.put("/wishlist/{product_id}", response_model=WishlistOut, dependencies=[Depends(_private)])
def add_to_wishlist(
    product_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    _add_wishlist(db, current_user.id, product_id)
    return {"product_ids": _wishlist_ids(db, current_user.id)}


@router.delete("/wishlist/{product_id}", response_model=WishlistOut, dependencies=[Depends(_private)])
def remove_from_wishlist(
    product_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(WishlistItem).filter(
        WishlistItem.user_id == current_user.id, WishlistItem.product_id == product_id
    ).delete()
    db.commit()
    return {"product_ids": _wishlist_ids(db, current_user.id)}


@router.post("/wishlist/merge", response_model=WishlistOut, dependencies=[Depends(_private)])
def merge_wishlist(
    payload: WishlistMergeIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Adds favourites picked while signed out. Unknown ids are ignored."""
    known = {
        row[0]
        for row in db.query(Product.id).filter(Product.id.in_(set(payload.product_ids))).all()
    }
    for product_id in payload.product_ids:
        if product_id in known:
            _add_wishlist(db, current_user.id, product_id)
    return {"product_ids": _wishlist_ids(db, current_user.id)}


def _look_out(look: SavedLook, product: Product | None) -> SavedLookOut:
    out = SavedLookOut.model_validate(look)
    if product is not None:
        item = product_crud.to_list_item_dict(product)
        out.product_name = product.name
        out.product_price = item["discount_price"] if item["discount_price"] is not None else item["price"]
        out.product_thumbnail_url = item["thumbnail_url"]
        variant = next(
            (v for v in product.variants if v.color_name.casefold() == look.color_name.casefold()), None
        )
        out.color_hex = variant.color_hex if variant else None
    return out


def _own_look(db: Session, look_id: str, user_id: str) -> SavedLook:
    look = db.query(SavedLook).filter(SavedLook.id == look_id, SavedLook.user_id == user_id).first()
    if look is None:
        raise HTTPException(status_code=404, detail="Saved look not found")
    return look


@router.get("/saved-looks", response_model=list[SavedLookOut], dependencies=[Depends(_private)])
def list_saved_looks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    looks = (
        db.query(SavedLook)
        .filter(SavedLook.user_id == current_user.id)
        .order_by(SavedLook.created_at.desc())
        .all()
    )
    products = {p.id: p for p in product_crud.list_products(db, limit=500)[0]}
    return [_look_out(look, products.get(look.product_id)) for look in looks]


@router.post(
    "/saved-looks",
    response_model=SavedLookOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_private)],
)
def create_saved_look(
    payload: SavedLookIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = product_crud.get_product(db, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    variant = next(
        (v for v in product.variants if v.color_name.casefold() == payload.color_name.casefold()), None
    )
    if variant is None:
        raise HTTPException(status_code=422, detail="That colour is not available for this product.")
    if db.query(SavedLook).filter(SavedLook.user_id == current_user.id).count() >= MAX_SAVED_LOOKS:
        raise HTTPException(status_code=409, detail="You have reached the saved-looks limit. Remove some first.")
    look = SavedLook(
        user_id=current_user.id,
        product_id=product.id,
        color_name=variant.color_name,
        label=payload.label,
        source=payload.source,
    )
    db.add(look)
    db.commit()
    db.refresh(look)
    return _look_out(look, product)


@router.patch("/saved-looks/{look_id}", response_model=SavedLookOut, dependencies=[Depends(_private)])
def rename_saved_look(
    look_id: str,
    payload: SavedLookUpdateIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    look = _own_look(db, look_id, current_user.id)
    look.label = payload.label
    db.commit()
    db.refresh(look)
    return _look_out(look, product_crud.get_product(db, look.product_id))


@router.delete("/saved-looks/{look_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_look(
    look_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    look = _own_look(db, look_id, current_user.id)
    db.delete(look)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
