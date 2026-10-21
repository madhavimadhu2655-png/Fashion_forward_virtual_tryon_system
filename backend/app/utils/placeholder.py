"""
Generates simple, clearly-labeled gradient SVG images to stand in for real
product photography during development.

This is intentionally NOT:
- a stock photo pulled from the internet
- an AI-generated image pretending to be a real product
- anything claimed to be a real crop top

Each SVG just renders a gradient rectangle with the product name and image
type (front/back/side/etc.) printed on it, so it's obvious at a glance that
it's a development placeholder. Swap these out by writing real files to the
same product-assets path and updating the DB row's image_url — no code
changes needed elsewhere.
"""

import os

PLACEHOLDER_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "placeholders")


def _svg_markup(label: str, sublabel: str, color_from: str, color_to: str, width: int, height: int) -> str:
    gradient_id = "g"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="{gradient_id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{color_from}" />
      <stop offset="100%" stop-color="{color_to}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#{gradient_id})" />
  <text x="50%" y="46%" text-anchor="middle" fill="white" font-family="sans-serif" font-size="{max(12, width // 22)}" font-weight="600">{label}</text>
  <text x="50%" y="56%" text-anchor="middle" fill="white" fill-opacity="0.75" font-family="sans-serif" font-size="{max(10, width // 32)}">{sublabel}</text>
  <text x="50%" y="94%" text-anchor="middle" fill="white" fill-opacity="0.55" font-family="sans-serif" font-size="{max(9, width // 40)}">DEV PLACEHOLDER — not a real product photo</text>
</svg>"""


def generate_placeholder_svg(
    product_id: str,
    image_type: str,
    label: str,
    color_from: str,
    color_to: str,
    width: int = 600,
    height: int = 800,
) -> str:
    """Writes an SVG file to disk and returns its public URL path
    (served via FastAPI's StaticFiles mount at /static/...)."""
    os.makedirs(PLACEHOLDER_DIR, exist_ok=True)
    filename = f"{product_id}-{image_type}.svg"
    filepath = os.path.join(PLACEHOLDER_DIR, filename)

    with open(filepath, "w") as f:
        f.write(_svg_markup(label, image_type.capitalize(), color_from, color_to, width, height))

    return f"/static/placeholders/{filename}"
