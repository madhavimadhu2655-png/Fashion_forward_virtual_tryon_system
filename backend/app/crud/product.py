from typing import Optional

from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from app.models.product import Product, ProductVariant, ProductImage

SIZE_RANK = {"XS": 0, "S": 1, "M": 2, "L": 3, "XL": 4}


def _base_query(db: Session):
    return db.query(Product).options(
        joinedload(Product.images),
        joinedload(Product.variants),
        joinedload(Product.sizes),
        joinedload(Product.garment_asset),
    )


def list_products(
    db: Session,
    search: Optional[str] = None,
    category: Optional[str] = None,
    colors: Optional[list[str]] = None,
    sizes: Optional[list[str]] = None,
    fabric: Optional[str] = None,
    fit: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_rating: Optional[float] = None,
    is_trending: Optional[bool] = None,
    is_new: Optional[bool] = None,
    sort: str = "popular",
    skip: int = 0,
    limit: int = 24,
) -> tuple[list[Product], int]:
    query = _base_query(db)

    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            or_(func.lower(Product.name).like(like), func.lower(Product.category).like(like))
        )

    if category:
        query = query.filter(Product.category == category)

    if fabric:
        query = query.filter(Product.fabric == fabric)

    if fit:
        query = query.filter(Product.fit_type == fit)

    if min_rating is not None:
        query = query.filter(Product.rating >= min_rating)

    if is_trending is not None:
        query = query.filter(Product.is_trending == is_trending)

    if is_new is not None:
        query = query.filter(Product.is_new == is_new)

    if colors:
        query = query.join(ProductVariant).filter(ProductVariant.color_name.in_(colors))

    if sizes:
        from app.models.product import ProductSize

        query = query.join(ProductSize).filter(ProductSize.size.in_(sizes))

    # Price filtering happens against the effective price (discount if set).
    effective_price = func.coalesce(Product.discount_price, Product.price)
    if min_price is not None:
        query = query.filter(effective_price >= min_price)
    if max_price is not None:
        query = query.filter(effective_price <= max_price)

    query = query.distinct()
    total = query.count()

    if sort == "priceLow":
        query = query.order_by(effective_price.asc())
    elif sort == "priceHigh":
        query = query.order_by(effective_price.desc())
    elif sort == "rating":
        query = query.order_by(Product.rating.desc())
    elif sort == "newest":
        query = query.order_by(Product.is_new.desc(), Product.created_at.desc())
    else:  # popular
        query = query.order_by(Product.review_count.desc())

    items = query.offset(skip).limit(limit).all()
    return items, total


def get_product(db: Session, product_id: str) -> Optional[Product]:
    return _base_query(db).filter(Product.id == product_id).first()


def get_categories(db: Session) -> list[str]:
    rows = db.query(Product.category).distinct().order_by(Product.category).all()
    return [r[0] for r in rows]


def get_filter_options(db: Session):
    categories = get_categories(db)

    color_rows = (
        db.query(ProductVariant.color_name, ProductVariant.color_hex)
        .distinct()
        .order_by(ProductVariant.color_name)
        .all()
    )
    colors = [{"color_name": name, "color_hex": hex_, "image_url": None, "stock": 0} for name, hex_ in color_rows]

    fabric_rows = db.query(Product.fabric).distinct().all()
    fabrics = [r[0] for r in fabric_rows if r[0]]

    fit_rows = db.query(Product.fit_type).distinct().all()
    fits = [r[0] for r in fit_rows if r[0]]

    effective_price = func.coalesce(Product.discount_price, Product.price)
    price_bounds = db.query(func.min(effective_price), func.max(effective_price)).first()
    min_price = float(price_bounds[0]) if price_bounds and price_bounds[0] is not None else 0.0
    max_price = float(price_bounds[1]) if price_bounds and price_bounds[1] is not None else 0.0

    return {
        "categories": categories,
        "colors": colors,
        "fabrics": fabrics,
        "fits": fits,
        "min_price": min_price,
        "max_price": max_price,
    }


def to_list_item_dict(product: Product) -> dict:
    thumbnail = next((img.image_url for img in product.images if img.image_type == "thumbnail"), None)
    if thumbnail is None and product.images:
        thumbnail = sorted(product.images, key=lambda i: i.sort_order)[0].image_url

    return {
        "id": product.id,
        "name": product.name,
        "brand": product.brand,
        "category": product.category,
        "price": float(product.price),
        "discount_price": float(product.discount_price) if product.discount_price is not None else None,
        "fabric": product.fabric or "",
        "fit_type": product.fit_type or "",
        "description": product.description or "",
        "rating": product.rating,
        "review_count": product.review_count,
        "is_trending": product.is_trending,
        "is_new": product.is_new,
        "thumbnail_url": thumbnail,
        "colors": product.variants,
        "sizes": [size.size for size in sorted(product.sizes, key=lambda item: SIZE_RANK.get(item.size, 99))],
    }
