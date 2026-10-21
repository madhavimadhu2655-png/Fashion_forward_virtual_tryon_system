"""
Seed data for the crop-top catalogue — 20 real products.

IMAGE ARCHITECTURE (Milestone 3 correction):
Product photos point to REAL file paths under
app/static/products/{PRODUCT_ID}/ (front/side/back/detail, matched by
filename prefix in app/utils/product_images.py) — not generated placeholders. Those files don't exist until you supply them
(see README). Until then, the frontend shows a "photo not added yet"
state instead of a broken icon or a colored card.

GARMENT-ASSET ARCHITECTURE (Milestone 6):
Same pattern, different folder: app/static/garment-assets/{PRODUCT_ID}/
tryon.png (isolated garment cutout, transparent background) and
optional mask.png. The current checkout includes one tryon.png per
product; these files are not seeded or modified by this module. The
garment-assets API reports whether the selected product's file exists.

Both asset types follow "drop the file in and it just works" — no
reseeding, no code changes, no backend restart needed, since the
static folders are bind-mounted into the running container.
"""

import os

from app.utils.product_images import GALLERY_VIEWS, find_product_gallery

SIZE_ORDER = ["XS", "S", "M", "L", "XL"]

# Base garment measurements per size — reused across products for now.
# Real measurements come from actual garment specs later.
BASE_MEASUREMENTS = {
    "XS": {"shoulder_cm": 34, "chest_cm": 76, "waist_cm": 64, "length_cm": 32},
    "S": {"shoulder_cm": 36, "chest_cm": 82, "waist_cm": 70, "length_cm": 33},
    "M": {"shoulder_cm": 38, "chest_cm": 88, "waist_cm": 76, "length_cm": 34},
    "L": {"shoulder_cm": 40, "chest_cm": 94, "waist_cm": 82, "length_cm": 35},
    "XL": {"shoulder_cm": 42, "chest_cm": 100, "waist_cm": 88, "length_cm": 36},
}

PRODUCTS = [
    dict(id="CT001", name="Ribbed Square Neck Crop Top", brand="Urban Edit", category="Ribbed",
         price=799, discount_price=599, fabric="95% Cotton, 5% Elastane", fit_type="Slim Fit",
         rating=4.3, review_count=128, stock=140, is_trending=True, is_new=False,
         description="An everyday ribbed crop top with a square neckline and a bit of stretch.",
         colors=[("Black", "#111827"), ("White", "#f9fafb"), ("Pink", "#f472b6")],
         sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT002", name="Classic Cotton Crop Top", brand="ChicBasics", category="Basic",
         price=449, discount_price=None, fabric="100% Cotton", fit_type="Regular Fit",
         rating=4.3, review_count=301, stock=210, is_trending=True, is_new=False,
         description="A no-frills basic crop top that works with everything.",
         colors=[("Black", "#111827"), ("White", "#f9fafb"), ("Grey", "#9ca3af")],
         sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT003", name="Halter Neck Crop Top", brand="StyleLoom", category="Halter",
         price=899, discount_price=None, fabric="Viscose Blend", fit_type="Fitted",
         rating=4.1, review_count=84, stock=95, is_trending=False, is_new=True,
         description="A halter-neck crop top with a flattering fitted silhouette.",
         colors=[("Emerald", "#059669"), ("Black", "#111827")], sizes=["S", "M", "L"]),
    dict(id="CT004", name="Oversized Graphic Crop Top", brand="Urban Edit", category="Casual",
         price=749, discount_price=599, fabric="Cotton Jersey", fit_type="Relaxed Fit",
         rating=4.0, review_count=58, stock=120, is_trending=False, is_new=True,
         description="A relaxed, oversized crop top for everyday wear.",
         colors=[("White", "#f9fafb"), ("Black", "#111827")], sizes=["S", "M", "L", "XL"]),
    dict(id="CT005", name="Classic Tank Crop Top", brand="ChicBasics", category="Tank",
         price=549, discount_price=None, fabric="100% Cotton", fit_type="Regular Fit",
         rating=4.5, review_count=210, stock=180, is_trending=True, is_new=False,
         description="A simple tank-style crop top for everyday casual wear.",
         colors=[("White", "#f9fafb"), ("Grey", "#9ca3af"), ("Navy", "#1e3a8a")],
         sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT006", name="Floral Printed Crop Top", brand="Urban Edit", category="Printed",
         price=999, discount_price=749, fabric="Rayon", fit_type="Relaxed Fit",
         rating=4.0, review_count=63, stock=70, is_trending=False, is_new=False,
         description="A breezy printed crop top, perfect for daytime outings.",
         colors=[("Multicolor", "#f59e0b")], sizes=["S", "M", "L"]),
    dict(id="CT007", name="Off-Shoulder Crop Top", brand="StyleLoom", category="Off-Shoulder",
         price=849, discount_price=None, fabric="Cotton Blend", fit_type="Fitted",
         rating=4.2, review_count=97, stock=88, is_trending=False, is_new=True,
         description="An off-shoulder crop top with a structured neckline.",
         colors=[("Burgundy", "#7f1d1d"), ("Black", "#111827")], sizes=["XS", "S", "M", "L"]),
    dict(id="CT008", name="Full-Sleeve Layering Crop Top", brand="ChicBasics", category="Full-Sleeve",
         price=749, discount_price=None, fabric="Cotton Jersey", fit_type="Regular Fit",
         rating=4.4, review_count=55, stock=100, is_trending=False, is_new=False,
         description="A long-sleeve crop top, cozy enough for cooler days.",
         colors=[("Black", "#111827"), ("White", "#f9fafb")], sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT009", name="Sequin Party Crop Top", brand="Urban Edit", category="Party",
         price=1299, discount_price=999, fabric="Polyester Sequin", fit_type="Fitted",
         rating=4.6, review_count=142, stock=45, is_trending=True, is_new=False,
         description="A statement sequin crop top for evenings and celebrations.",
         colors=[("Gold", "#d97706"), ("Silver", "#d1d5db")], sizes=["S", "M", "L"]),
    dict(id="CT010", name="Performance Sports Crop Top", brand="StyleLoom", category="Sports",
         price=999, discount_price=None, fabric="Polyester Spandex", fit_type="Compression Fit",
         rating=4.7, review_count=176, stock=150, is_trending=False, is_new=True,
         description="A moisture-wicking sports crop top built for workouts.",
         colors=[("Black", "#111827"), ("Blue", "#2563eb")], sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT011", name="Weekend Linen Crop Top", brand="ChicBasics", category="Casual",
         price=649, discount_price=None, fabric="Linen Blend", fit_type="Relaxed Fit",
         rating=4.1, review_count=39, stock=64, is_trending=False, is_new=False,
         description="A relaxed linen-blend crop top for casual weekend wear.",
         colors=[("Beige", "#d6cdbf"), ("White", "#f9fafb")], sizes=["S", "M", "L", "XL"]),
    dict(id="CT012", name="Ribbed Halter Crop Top", brand="Urban Edit", category="Ribbed",
         price=849, discount_price=None, fabric="Ribbed Cotton Blend", fit_type="Slim Fit",
         rating=4.2, review_count=71, stock=77, is_trending=False, is_new=False,
         description="Ribbed texture meets a halter neckline in this versatile crop top.",
         colors=[("Pink", "#f472b6"), ("Black", "#111827")], sizes=["XS", "S", "M", "L"]),
    dict(id="CT013", name="Printed Tank Crop Top", brand="StyleLoom", category="Printed",
         price=699, discount_price=549, fabric="Cotton Poplin", fit_type="Regular Fit",
         rating=3.9, review_count=44, stock=60, is_trending=False, is_new=False,
         description="A tank-style crop top with an all-over print.",
         colors=[("Multicolor", "#0ea5e9")], sizes=["S", "M", "L", "XL"]),
    dict(id="CT014", name="Everyday Basic Crop Top — Pack of 2", brand="ChicBasics", category="Basic",
         price=899, discount_price=699, fabric="100% Cotton", fit_type="Regular Fit",
         rating=4.4, review_count=189, stock=130, is_trending=True, is_new=False,
         description="Two basic crop tops in complementary shades for everyday layering.",
         colors=[("Black", "#111827"), ("White", "#f9fafb")], sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT015", name="High-Neck Sports Crop Top", brand="StyleLoom", category="Sports",
         price=1099, discount_price=None, fabric="Polyester Spandex", fit_type="Compression Fit",
         rating=4.5, review_count=92, stock=85, is_trending=False, is_new=True,
         description="A high-neck sports crop top with extra support for high-impact workouts.",
         colors=[("Black", "#111827"), ("Green", "#059669")], sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT016", name="Tie-Front Denim Crop Top", brand="Urban Edit", category="Denim",
         price=1099, discount_price=899, fabric="Cotton Denim", fit_type="Fitted",
         rating=4.3, review_count=67, stock=54, is_trending=True, is_new=True,
         description="A tie-front denim crop top with a structured, slightly cropped fit.",
         colors=[("Light Blue", "#93c5fd"), ("Dark Blue", "#1e3a8a")], sizes=["S", "M", "L", "XL"]),
    dict(id="CT017", name="Chunky Knitted Crop Top", brand="ChicBasics", category="Knitted",
         price=949, discount_price=None, fabric="Acrylic Knit", fit_type="Relaxed Fit",
         rating=4.4, review_count=51, stock=48, is_trending=False, is_new=True,
         description="A chunky knitted crop top, cozy and textured for cooler weather.",
         colors=[("Cream", "#fef3c7"), ("Brown", "#78350f")], sizes=["XS", "S", "M", "L"]),
    dict(id="CT018", name="Square Neck Basic Crop Top", brand="ChicBasics", category="Basic",
         price=599, discount_price=None, fabric="100% Cotton", fit_type="Regular Fit",
         rating=4.2, review_count=38, stock=90, is_trending=False, is_new=False,
         description="A clean square-neck crop top that layers well under jackets and shirts.",
         colors=[("White", "#f9fafb"), ("Black", "#111827"), ("Sage", "#84a98c")],
         sizes=["XS", "S", "M", "L", "XL"]),
    dict(id="CT019", name="Boho Floral Crop Top", brand="StyleLoom", category="Printed",
         price=899, discount_price=699, fabric="Rayon", fit_type="Relaxed Fit",
         rating=4.1, review_count=29, stock=42, is_trending=False, is_new=True,
         description="A boho-inspired floral crop top with flutter sleeves.",
         colors=[("Multicolor", "#f472b6")], sizes=["S", "M", "L"]),
    dict(id="CT020", name="Sleeveless Scoop Neck Crop Top", brand="Urban Edit", category="Tank",
         price=549, discount_price=None, fabric="Cotton Lycra", fit_type="Fitted",
         rating=4.3, review_count=45, stock=110, is_trending=False, is_new=False,
         description="A sleeveless scoop-neck crop top, simple and versatile.",
         colors=[("Black", "#111827"), ("Maroon", "#7f1d1d"), ("White", "#f9fafb")],
         sizes=["XS", "S", "M", "L", "XL"]),
]


def _real_image_url(product_id: str, image_type: str) -> str:
    """Returns the URL a real photo WOULD be served at, whether or not
    the file exists on disk yet. Used only for the required front photo
    when nothing matching is on disk, so dropping the file in still works."""
    return f"/static/products/{product_id}/{image_type}.jpg"


def build_image_rows(product_id: str) -> tuple[list[dict], list[str]]:
    """Image rows for every real front/side/back/detail photo on disk
    (filenames are matched by view prefix — see utils/product_images.py),
    plus the list of views that are missing."""
    found = dict(find_product_gallery(product_id))
    rows, missing = [], []
    for sort_order, view in enumerate(GALLERY_VIEWS):
        url = found.get(view)
        if url is None:
            missing.append(view)
            if view != "front":
                continue  # optional views: no DB row unless the file exists
            url = _real_image_url(product_id, view)
        rows.append({"product_id": product_id, "image_type": view, "image_url": url, "sort_order": sort_order})
    return rows, missing


GARMENT_ASSETS_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static", "garment-assets")


def _garment_asset_url(product_id: str, filename: str) -> str:
    return f"/static/garment-assets/{product_id}/{filename}"


def _garment_asset_exists(product_id: str, filename: str) -> bool:
    return os.path.exists(os.path.join(GARMENT_ASSETS_STATIC_DIR, product_id, filename))


def build_seed_rows():
    """Returns (products, images, variants, sizes, garment_assets,
    photo_missing_report, garment_missing_report) as lists of plain
    dicts ready for bulk insert, plus two separate "what's missing on
    disk" reports (product photos vs. garment try-on assets are
    different asset types with different folders, so they're tracked
    separately rather than conflated into one list)."""
    products, images, variants, sizes, garment_assets = [], [], [], [], []
    photo_missing_report = []
    garment_missing_report = []

    for p in PRODUCTS:
        products.append({
            "id": p["id"], "name": p["name"], "brand": p["brand"], "category": p["category"],
            "description": p["description"], "price": p["price"], "discount_price": p["discount_price"],
            "fabric": p["fabric"], "fit_type": p["fit_type"], "rating": p["rating"],
            "review_count": p["review_count"], "stock": p["stock"],
            "is_trending": p["is_trending"], "is_new": p["is_new"],
        })

        # front is required; side/back/detail are optional. See build_image_rows.
        image_rows, photo_missing = build_image_rows(p["id"])
        images.extend(image_rows)

        if "front" in photo_missing:  # side/back/detail are optional
            photo_missing_report.append((p["id"], p["name"], photo_missing))

        for color_name, color_hex in p["colors"]:
            variants.append({
                "product_id": p["id"], "color_name": color_name, "color_hex": color_hex,
                "image_url": None, "stock": p["stock"] // max(len(p["colors"]), 1), "price": None,
            })

        for size in p["sizes"]:
            m = BASE_MEASUREMENTS[size]
            sizes.append({
                "product_id": p["id"], "size": size, "shoulder_cm": m["shoulder_cm"],
                "chest_cm": m["chest_cm"], "waist_cm": m["waist_cm"], "length_cm": m["length_cm"],
                "stock": p["stock"] // max(len(p["sizes"]), 1),
            })

        # Real garment-asset architecture (Milestone 6): tryon.png and
        # mask.png point at their real expected paths regardless of
        # whether the files exist yet — same "drop it in and it just
        # works" pattern as the product photos. No generated placeholder
        # image is used here anymore; a missing asset is reported as
        # missing, not disguised.
        garment_missing = []
        if not _garment_asset_exists(p["id"], "tryon.png"):
            garment_missing.append("tryon.png")
        if not _garment_asset_exists(p["id"], "mask.png"):
            garment_missing.append("mask.png")
        if "tryon.png" in garment_missing:  # mask.png is optional
            garment_missing_report.append((p["id"], p["name"], garment_missing))

        garment_assets.append({
            "product_id": p["id"],
            "tryon_image": _garment_asset_url(p["id"], "tryon.png"),
            "mask_image": _garment_asset_url(p["id"], "mask.png"),
            "asset_width": None, "asset_height": None, "garment_type": p["category"],
            "fabric_type": p["fabric"], "control_points": None,
        })

    return products, images, variants, sizes, garment_assets, photo_missing_report, garment_missing_report
