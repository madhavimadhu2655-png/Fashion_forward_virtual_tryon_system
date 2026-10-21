"""
Exact-colour garment references for try-on.

A garment reference is "exact" for a colour when either:
  * garment-assets/<ID>/tryon-<colour-slug>.png exists, or
  * the generic garment-assets/<ID>/tryon.png exists AND colors.json
    records (from visual verification) that it depicts that colour.

Anything else is not an exact reference. The AI model must never be
given a different-coloured garment, and the browser fit preview labels
any recolouring it does as an approximation.
"""

import json
from pathlib import Path
from typing import Optional

from app.utils.slug import slugify

MANIFEST_NAME = "colors.json"


def load_color_manifest(assets_dir: Path) -> dict[str, str]:
    try:
        raw = json.loads((assets_dir / MANIFEST_NAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {
        key: value
        for key, value in raw.items()
        if not key.startswith("_") and isinstance(value, str)
    }


def generic_reference_color(assets_dir: Path, product_id: str) -> Optional[str]:
    """The verified colour of the generic tryon.png, if it exists."""
    if not (assets_dir / product_id / "tryon.png").is_file():
        return None
    return load_color_manifest(assets_dir).get(product_id)


def exact_reference(assets_dir: Path, product_id: str, color_name: str) -> Optional[Path]:
    """Path to an exact-colour reference, or None. Callers must validate
    product_id against path traversal before calling (see photo_try_on)."""
    product_dir = assets_dir / product_id
    color_specific = product_dir / f"tryon-{slugify(color_name)}.png"
    if color_specific.is_file():
        return color_specific
    verified = generic_reference_color(assets_dir, product_id)
    if verified is not None and verified.casefold() == color_name.casefold():
        return product_dir / "tryon.png"
    return None
