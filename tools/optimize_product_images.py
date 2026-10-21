"""
Writes web-optimised JPEG copies of the shopping photos.

    python tools/optimize_product_images.py

For every products/<ID>/ folder, each front/side/back/detail photo is
resized to at most 1400 px on its long edge and saved as a progressive
JPEG in products/<ID>/web/<view>.jpg. The original files are never
modified or deleted. app/utils/product_images.py prefers these copies
when they exist; re-run `python -m app.run_seed` afterwards so the
database points at them.

Garment try-on cutouts (*_tryon.png, garment-assets/) are not touched:
they need their alpha channel and full resolution.
"""

import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, ROOT)

from app.utils.product_images import (  # noqa: E402
    GALLERY_VIEWS,
    PRODUCTS_STATIC_DIR,
    WEB_SUBDIR,
    _candidates,
    _match_view,
)

MAX_EDGE = 1400
QUALITY = 84


def main() -> None:
    total_before = total_after = 0
    for product_id in sorted(os.listdir(PRODUCTS_STATIC_DIR)):
        product_dir = os.path.join(PRODUCTS_STATIC_DIR, product_id)
        if not os.path.isdir(product_dir):
            continue
        names = _candidates(product_dir)
        out_dir = os.path.join(product_dir, WEB_SUBDIR)
        for view in GALLERY_VIEWS:
            source_name = _match_view(names, view)
            if not source_name:
                continue
            source = os.path.join(product_dir, source_name)
            target = os.path.join(out_dir, f"{view}.jpg")
            os.makedirs(out_dir, exist_ok=True)
            with Image.open(source) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
                image.save(target, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            before, after = os.path.getsize(source), os.path.getsize(target)
            total_before += before
            total_after += after
            print(f"{product_id} {view:<6} {source_name:<18} {before // 1024:>5} KB -> {after // 1024:>4} KB")
    print(f"\nTotal: {total_before / 1e6:.1f} MB -> {total_after / 1e6:.1f} MB (originals kept)")


if __name__ == "__main__":
    main()
