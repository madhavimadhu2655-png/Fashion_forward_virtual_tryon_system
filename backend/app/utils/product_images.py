"""
Finds the real shopping photos for a product on disk.

The catalogue folders were filled by hand, so filenames are not uniform:
CT001 has front.png / side.png / back.png, CT002 has frontct002.png,
CT003 has fronct003.png (typo), CT006+ use .jpeg. The seed previously
assumed `<view>.jpg`, which pointed every product at a file that does not
exist. This module matches files by view prefix instead, and prefers the
web-optimised copy written by tools/optimize_product_images.py when it
exists (originals are never modified).

Try-on cutouts that live next to the shop photos (e.g. CT001_tryon.png)
are deliberately excluded — garment references and shopping photography
are different asset types.
"""

import os
from typing import Optional

PRODUCTS_STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "products")
WEB_SUBDIR = "web"

# Display order on the product page: front, side, back, then any detail shot.
GALLERY_VIEWS = ("front", "side", "back", "detail")

_VIEW_PREFIXES = {
    "front": ("front", "fron"),
    "side": ("side",),
    "back": ("back",),
    "detail": ("detail",),
}
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _candidates(directory: str) -> list[str]:
    try:
        names = os.listdir(directory)
    except OSError:
        return []
    return sorted(
        name
        for name in names
        if os.path.splitext(name)[1].lower() in _IMAGE_EXTENSIONS
        and "tryon" not in name.lower()
        and os.path.isfile(os.path.join(directory, name))
    )


def _match_view(names: list[str], view: str) -> Optional[str]:
    stems = {name: os.path.splitext(name)[0].lower() for name in names}
    exact = [name for name, stem in stems.items() if stem == view]
    if exact:
        return exact[0]
    for prefix in _VIEW_PREFIXES[view]:
        for name, stem in stems.items():
            if stem.startswith(prefix):
                return name
    return None


def find_product_image(product_id: str, view: str, root: str = PRODUCTS_STATIC_DIR) -> Optional[str]:
    """Returns the URL path of the best file for this view, or None."""
    product_dir = os.path.join(root, product_id)
    web_match = _match_view(_candidates(os.path.join(product_dir, WEB_SUBDIR)), view)
    if web_match:
        return f"/static/products/{product_id}/{WEB_SUBDIR}/{web_match}"
    match = _match_view(_candidates(product_dir), view)
    if match:
        return f"/static/products/{product_id}/{match}"
    return None


def find_product_gallery(product_id: str, root: str = PRODUCTS_STATIC_DIR) -> list[tuple[str, str]]:
    """[(view, url), ...] in gallery order, only for files that exist."""
    gallery = []
    for view in GALLERY_VIEWS:
        url = find_product_image(product_id, view, root)
        if url:
            gallery.append((view, url))
    return gallery
