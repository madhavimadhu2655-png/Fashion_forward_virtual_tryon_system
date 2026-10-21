"""Reproducible inventory of shopping photos and try-on garment assets.

Run from the repo root:  python tools/asset_inventory.py
Mirrors the filesystem checks in backend/app/api/products.py
(get_garment_assets): a product is try-on ready only if
static/garment-assets/<ID>/tryon.png exists AND has a real alpha channel.
Requires Pillow. Read-only: never writes into static/.
"""
import glob, os, sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.join(os.path.dirname(__file__), "..", "backend", "app", "static")

def info(path):
    if not os.path.exists(path):
        return None
    im = Image.open(path)
    return {"fmt": im.format, "size": im.size, "mode": im.mode,
            "alpha": "A" in im.mode or "transparency" in im.info,
            "mb": round(os.path.getsize(path) / 1e6, 2)}

def main():
    ids = sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "products", "CT*")))
    rows = []
    for pid in ids:
        shop = info(os.path.join(ROOT, "products", pid, "front.jpg"))
        tryon = info(os.path.join(ROOT, "garment-assets", pid, "tryon.png"))
        mask = info(os.path.join(ROOT, "garment-assets", pid, "mask.png"))
        rows.append((pid, shop, tryon, mask))
    print("| ID | Shop photo | Dimensions | MB | tryon.png | mask.png | API asset_available |")
    print("|---|---|---|---|---|---|---|")
    for pid, s, t, m in rows:
        ready = bool(t and t["alpha"])
        print(f"| {pid} | {'yes ('+s['fmt']+', '+s['mode']+')' if s else 'MISSING'} | "
              f"{'%dx%d' % s['size'] if s else '-'} | {s['mb'] if s else '-'} | "
              f"{'present' if t else 'absent'} | {'present' if m else 'absent'} | "
              f"{'true' if t else 'false'} |")
    ok = sum(1 for _, _, t, _ in rows if t and t["alpha"])
    print(f"\nTry-on ready (tryon.png with alpha): {ok}/{len(rows)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
