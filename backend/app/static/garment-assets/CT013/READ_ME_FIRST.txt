Place the AI TRY-ON garment asset for this product here — NOT the
same as the shopping photo in static/products/CT013/front.jpg.

  CT013 — Printed Tank Crop Top
  Category: Printed
  Colors:   Multicolor

Required file:
  tryon.png   <- the garment ISOLATED from any background, transparent
                 PNG, front-facing/flat-lay or ghost-mannequin style.
                 This is what gets overlaid on the camera feed — a
                 photo of someone WEARING the top (like front.jpg)
                 will not work well here, since the try-on pipeline
                 needs just the garment shape, not a person.

Optional files:
  mask.png              <- garment silhouette mask (white garment
                            shape on black background). If omitted,
                            the mask isn't used yet in this milestone
                            anyway (that comes with TPS warping later).
  tryon-<color>.png      <- e.g. tryon-black.png, tryon-white.png —
                            per-color variants. If a specific color
                            isn't provided, the try-on page falls back
                            to the generic tryon.png above.

Format: PNG with transparency, ~1000x1200px recommended.
After adding files here, refresh the page — no rebuild or reseed needed.
Delete this READ_ME_FIRST.txt file once real assets are in place (optional).
