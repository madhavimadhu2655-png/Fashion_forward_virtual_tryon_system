import asyncio
import io
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.core.config import settings
from app.core.deps import get_current_user
from app.crud import product as product_crud
from app.db.session import get_db
from app.models.product import Product
from app.models.user import User
from app.utils.garment_refs import exact_reference
from app.utils.slug import slugify

router = APIRouter(prefix="/api/photo-try-on", tags=["photo-try-on"])

GARMENT_ASSETS_DIR = Path(__file__).resolve().parents[1] / "static" / "garment-assets"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_FORM_BYTES = MAX_UPLOAD_BYTES + 128 * 1024
MAX_IMAGE_PIXELS = 12_000_000
MAX_IMAGE_DIMENSION = 4096
MAX_RESULT_BYTES = 20 * 1024 * 1024
RATE_LIMIT_REQUESTS = 3
RATE_LIMIT_WINDOW_SECONDS = 60
WORKER_TIMEOUT_SECONDS = 240
NO_STORE_HEADERS = {
    "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
}

_rate_limit_events: dict[str, list[float]] = {}
_rate_limit_lock = asyncio.Lock()
_inference_slots = asyncio.Semaphore(1)


class InvalidImage(ValueError):
    pass


def _normalize_image(
    data: bytes,
    *,
    person: bool,
    max_bytes: int = MAX_UPLOAD_BYTES,
) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as source:
            image_format = source.format
            width, height = source.size
            if image_format not in {"JPEG", "PNG"}:
                raise InvalidImage("Use a JPEG or PNG image.")
            if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
                raise InvalidImage("The image dimensions are too large (maximum 4096 × 4096).")
            if width * height > MAX_IMAGE_PIXELS:
                raise InvalidImage("The image contains too many pixels.")
            source.verify()

        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source)
            if person and (image.width < 256 or image.height < 384):
                raise InvalidImage("Choose a clear portrait at least 256 × 384 pixels.")
            if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
                rgba = image.convert("RGBA")
                background = Image.new("RGBA", rgba.size, "white")
                image = Image.alpha_composite(background, rgba).convert("RGB")
            else:
                image = image.convert("RGB")

            if person:
                image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                image.save(output, format="JPEG", quality=88, optimize=True)
            else:
                output = io.BytesIO()
                image.save(output, format="PNG", optimize=True)
            normalized = output.getvalue()
            if len(normalized) > max_bytes:
                raise InvalidImage("This image is too detailed to process. Choose a smaller photo.")
            return normalized
    except InvalidImage:
        raise
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise InvalidImage("The image could not be opened. Choose a valid JPEG or PNG.") from exc


def _color_asset(product_id: str, color_name: str) -> Path:
    """Exact-colour garment reference for this product/colour. The returned
    path does not exist when no exact reference is configured — callers
    check .is_file(). A different colour is never substituted."""
    safe_product_id = product_id.strip()
    if not safe_product_id or not safe_product_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=422, detail="Select a valid catalogue product.")
    asset_root = GARMENT_ASSETS_DIR.resolve()
    product_dir = (asset_root / safe_product_id).resolve()
    if product_dir.parent != asset_root:
        raise HTTPException(status_code=422, detail="Select a valid catalogue product.")
    reference = exact_reference(asset_root, safe_product_id, color_name)
    if reference is not None and reference.resolve().parent == product_dir:
        return reference
    asset = product_dir / f"tryon-{slugify(color_name)}.png"
    if asset.resolve().parent != product_dir:
        raise HTTPException(status_code=422, detail="Select a valid catalogue color.")
    return asset


def _product_photo_url(product: Product) -> str | None:
    front = next((image for image in product.images if image.image_type == "front"), None)
    if front:
        return front.image_url
    first = min(product.images, key=lambda image: image.sort_order, default=None)
    return first.image_url if first else None


@router.get("/catalog")
def photo_tryon_catalog(db: Session = Depends(get_db)):
    products, _ = product_crud.list_products(db, sort="popular", limit=100)
    return {
        "items": [
            {
                "id": product.id,
                "name": product.name,
                "category": product.category,
                "thumbnail_url": _product_photo_url(product),
                "colors": [
                    {
                        "color_name": variant.color_name,
                        "color_hex": variant.color_hex,
                        "image_available": _color_asset(product.id, variant.color_name).is_file(),
                    }
                    for variant in product.variants
                ],
            }
            for product in products
        ]
    }


async def _allow_generation(user_id: str) -> None:
    now = time.monotonic()
    async with _rate_limit_lock:
        active_users = {
            user: [stamp for stamp in stamps if now - stamp < RATE_LIMIT_WINDOW_SECONDS]
            for user, stamps in _rate_limit_events.items()
        }
        _rate_limit_events.clear()
        _rate_limit_events.update({user: stamps for user, stamps in active_users.items() if stamps})
        events = _rate_limit_events.get(user_id, [])
        if len(events) >= RATE_LIMIT_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many try-on requests. Wait a minute and try again.",
                headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
            )
        if len(_rate_limit_events) >= 10_000 and user_id not in _rate_limit_events:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The try-on service is busy. Please try again shortly.",
            )
        _rate_limit_events.setdefault(user_id, []).append(now)


def _validate_worker_url() -> str:
    url = settings.photo_tryon_worker_url
    try:
        parsed = urlsplit(url)
        worker_port = parsed.port
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local AI inference is not configured. No photo was sent to an external provider.",
        ) from exc
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"catvton", "localhost", "127.0.0.1", "host.docker.internal"}
        or worker_port != 8001
        or parsed.path != "/api/generate"
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local AI inference is not configured. No photo was sent to an external provider.",
        )
    if not settings.photo_tryon_noncommercial_confirmed:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "CatVTON's published license is non-commercial. An administrator must confirm "
                "permitted non-commercial use before enabling this model."
            ),
        )
    if not settings.photo_tryon_worker_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local AI inference is not configured. No photo was sent to an external provider.",
        )
    return url


_worker_health_cache: dict[str, tuple[float, bool]] = {}
WORKER_HEALTH_TTL_SECONDS = 15


async def _worker_ready(worker_url: str) -> bool:
    """Probes the local worker's /health. Cached briefly so the status
    endpoint can be polled by the UI without hammering the GPU host."""
    now = time.monotonic()
    cached = _worker_health_cache.get(worker_url)
    if cached and now - cached[0] < WORKER_HEALTH_TTL_SECONDS:
        return cached[1]
    parsed = urlsplit(worker_url)
    health_url = f"{parsed.scheme}://{parsed.netloc}/health"
    try:
        async with httpx.AsyncClient(timeout=2.5, trust_env=False) as client:
            response = await client.get(health_url)
        ready = response.status_code == 200 and response.json().get("status") == "ready"
    except (httpx.HTTPError, ValueError):
        ready = False
    _worker_health_cache[worker_url] = (now, ready)
    return ready


@router.get("/status")
async def photo_tryon_status():
    """What the AI (CatVTON) path needs, checked one by one, so the UI can
    say exactly what is missing. No photo is involved in this request."""
    url = settings.photo_tryon_worker_url
    url_ok = True
    try:
        parsed = urlsplit(url)
        url_ok = (
            parsed.scheme == "http"
            and parsed.hostname in {"catvton", "localhost", "127.0.0.1", "host.docker.internal"}
            and parsed.port == 8001
            and parsed.path == "/api/generate"
        )
    except ValueError:
        url_ok = False
    checks = [
        {
            "id": "worker_url",
            "label": "Local worker address configured",
            "ok": bool(url) and url_ok,
            "help": "Set CATVTON_WORKER_URL to http://catvton:8001/api/generate (local only).",
        },
        {
            "id": "worker_token",
            "label": "Worker access token configured",
            "ok": bool(settings.photo_tryon_worker_token),
            "help": "Set CATVTON_WORKER_TOKEN to the same random secret on backend and worker.",
        },
        {
            "id": "license",
            "label": "Non-commercial licence confirmed",
            "ok": settings.photo_tryon_noncommercial_confirmed,
            "help": "CatVTON is CC BY-NC-SA 4.0. Set CATVTON_NONCOMMERCIAL_USE_CONFIRMED=true only for permitted use.",
        },
    ]
    configured = all(check["ok"] for check in checks)
    ready = await _worker_ready(url) if configured else False
    checks.append(
        {
            "id": "worker_ready",
            "label": "GPU worker running and model loaded",
            "ok": ready,
            "help": "Start it with `docker compose --profile ai up catvton` on an NVIDIA GPU host (~8 GB VRAM).",
        }
    )
    if ready:
        message = "Local CatVTON is configured for non-commercial use and the worker reports ready."
    elif configured:
        message = "CatVTON is configured, but the local GPU worker is not reachable or still loading."
    else:
        message = "A private local model and permitted-use configuration are required."
    return {"available": configured and ready, "configured": configured, "message": message, "checks": checks}


async def _run_local_inference(person_jpeg: bytes, garment_png: bytes) -> bytes:
    worker_url = _validate_worker_url()
    try:
        async with _inference_slots:
            async with httpx.AsyncClient(
                timeout=WORKER_TIMEOUT_SECONDS,
                trust_env=False,
            ) as client:
                response = await client.post(
                    worker_url,
                    headers={"Authorization": f"Bearer {settings.photo_tryon_worker_token}"},
                    files={
                        "person": ("person.jpg", person_jpeg, "image/jpeg"),
                        "garment": ("garment.png", garment_png, "image/png"),
                    },
                )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The local AI model took too long. Please try again.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The local AI model is unavailable. No image was saved.",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The local AI model could not generate a preview. Please retry.",
        )
    if response.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "image/png":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The local AI model returned an invalid preview. Please retry.",
        )
    if len(response.content) > MAX_RESULT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The local AI model returned an oversized preview. Please retry.",
        )
    try:
        return _normalize_image(response.content, person=False, max_bytes=MAX_RESULT_BYTES)
    except InvalidImage as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The local AI model returned an invalid preview. Please retry.",
        ) from exc


@router.post("/generate")
async def generate_photo_tryon(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content_length = request.headers.get("content-length")
    if content_length is None:
        raise HTTPException(status_code=411, detail="A bounded Content-Length is required.")
    try:
        if int(content_length) > MAX_FORM_BYTES:
            raise HTTPException(status_code=413, detail="The upload is too large (maximum 8 MB).")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid upload length.") from exc

    async with request.form(max_files=1, max_fields=3) as form:
        photo = form.get("photo")
        product_id = form.get("product_id")
        color = form.get("color")
        consent = form.get("consent")
        if not isinstance(photo, UploadFile):
            raise HTTPException(status_code=422, detail="Choose a person photo to continue.")
        if not isinstance(product_id, str) or not isinstance(color, str):
            raise HTTPException(status_code=422, detail="Choose a catalogue product and color.")
        if len(product_id) > 64 or len(color) > 64:
            raise HTTPException(status_code=422, detail="Choose a valid catalogue product and color.")
        if consent != "true":
            raise HTTPException(
                status_code=422,
                detail="Confirm that you have permission to use this person's photo.",
            )
        source_bytes = await photo.read(MAX_UPLOAD_BYTES + 1)
        if len(source_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="The photo is too large (maximum 8 MB).")

    try:
        person_jpeg = _normalize_image(source_bytes, person=True)
    except InvalidImage as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        source_bytes = b""

    product = product_crud.get_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Catalogue product not found.")
    variant = next(
        (item for item in product.variants if item.color_name.casefold() == color.casefold()),
        None,
    )
    if variant is None:
        raise HTTPException(status_code=422, detail="That color is not available for this product.")

    garment_path = _color_asset(product.id, variant.color_name)
    if not garment_path.is_file():
        raise HTTPException(
            status_code=422,
            detail=(
                f"No verified AI garment photo is configured for {variant.color_name}. "
                "The catalog cutout is not substituted for a different color."
            ),
        )
    if garment_path.stat().st_size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=422, detail="The configured AI garment photo is too large.")
    try:
        garment_png = _normalize_image(garment_path.read_bytes(), person=False)
    except (OSError, InvalidImage) as exc:
        raise HTTPException(status_code=422, detail="The configured AI garment photo is invalid.") from exc

    await _allow_generation(current_user.id)
    result = await _run_local_inference(person_jpeg, garment_png)
    person_jpeg = b""
    garment_png = b""
    return Response(
        content=result,
        media_type="image/png",
        headers=NO_STORE_HEADERS,
    )
