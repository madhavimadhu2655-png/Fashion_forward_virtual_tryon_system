import json
from PIL import Image

products = ["CT001", "CT002", "CT005"]

for pid in products:
    path = f"backend/static/garment-assets/{pid}/tryon.png"
    im = Image.open(path)
    w, h = im.size
    alpha = im.getchannel("A")
    bbox = alpha.getbbox() # (minX, minY, maxX, maxY)

    norm_minX = bbox[0] / w
    norm_minY = bbox[1] / h
    norm_maxX = bbox[2] / w
    norm_maxY = bbox[3] / h
    cw = norm_maxX - norm_minX
    ch = norm_maxY - norm_minY

    # Compute control points
    ls_x = norm_minX + cw * 0.22
    ls_y = norm_minY + ch * 0.05
    rs_x = norm_minX + cw * 0.78
    rs_y = norm_minY + ch * 0.05
    hem_y = norm_minY + ch * 0.96

    print(f"Product {pid}: size={w}x{h}, alpha_bbox={bbox}")
    print(f"  Normalized bounds: minX={norm_minX:.3f}, minY={norm_minY:.3f}, maxX={norm_maxX:.3f}, maxY={norm_maxY:.3f}")
    print(f"  Content span: width={cw:.3f}, height={ch:.3f}")
    print(f"  Shoulder anchors: left=({ls_x:.3f}, {ls_y:.3f}), right=({rs_x:.3f}, {rs_y:.3f})")
    print(f"  Hem anchor: y={hem_y:.3f}")
    print("-" * 50)
