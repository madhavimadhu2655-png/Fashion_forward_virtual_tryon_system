"""
Seed script entrypoint.

Run from inside the backend container:

    docker compose exec backend python -m app.run_seed
"""

import sys

sys.path.insert(0, "/app")

from app.db.session import SessionLocal, engine  # noqa: E402
from app.models.product import (  # noqa: E402
    Base,
    Product,
    ProductImage,
    ProductVariant,
    ProductSize,
    GarmentAsset,
)
from app.seed_data import build_image_rows, build_seed_rows  # noqa: E402


def sync_product_images(db) -> int:
    """Re-points product_images rows at the photos actually on disk.
    Idempotent: safe to run on every seed. Returns how many products changed."""
    changed = 0
    for product in db.query(Product).all():
        rows, _missing = build_image_rows(product.id)
        current = sorted((img.image_type, img.image_url, img.sort_order) for img in product.images)
        wanted = sorted((row["image_type"], row["image_url"], row["sort_order"]) for row in rows)
        if current == wanted:
            continue
        db.query(ProductImage).filter(ProductImage.product_id == product.id).delete()
        db.bulk_insert_mappings(ProductImage, rows)
        changed += 1
    db.commit()
    return changed


def run():
    Base.metadata.create_all(bind=engine)  # safety net if migrations weren't run
    db = SessionLocal()

    try:
        existing = db.query(Product).count()
        if existing > 0:
            print(f"Products table already has {existing} rows — skipping product seed.")
            changed = sync_product_images(db)
            print(f"Synced product photo paths with files on disk ({changed} products updated).")
            return

        products, images, variants, sizes, garment_assets, photo_missing, garment_missing = build_seed_rows()

        db.bulk_insert_mappings(Product, products)
        db.bulk_insert_mappings(ProductImage, images)
        db.bulk_insert_mappings(ProductVariant, variants)
        db.bulk_insert_mappings(ProductSize, sizes)
        db.bulk_insert_mappings(GarmentAsset, garment_assets)
        db.commit()

        print(f"Seeded {len(products)} products, {len(images)} image rows, "
              f"{len(variants)} variants, {len(sizes)} size rows, "
              f"{len(garment_assets)} garment asset rows.")

        if photo_missing:
            print()
            print(f"REAL PHOTOS NEEDED for {len(photo_missing)} of {len(products)} products:")
            print("(place files at backend/app/static/products/<PRODUCT_ID>/<type>.jpg)")
            print()
            for product_id, name, missing_types in photo_missing:
                types_str = ", ".join(missing_types)
                print(f"  {product_id}  {name}  — missing: {types_str}")
        else:
            print("All product photos found on disk — nothing missing.")

        if garment_missing:
            print()
            print(f"TRY-ON GARMENT ASSETS NEEDED for {len(garment_missing)} of {len(products)} products:")
            print("(place files at backend/app/static/garment-assets/<PRODUCT_ID>/<file>)")
            print("These are different from product photos — see the README for exact specs.")
            print()
            for product_id, name, missing_types in garment_missing:
                types_str = ", ".join(missing_types)
                print(f"  {product_id}  {name}  — missing: {types_str}")
        else:
            print("All garment try-on assets found on disk — nothing missing.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
