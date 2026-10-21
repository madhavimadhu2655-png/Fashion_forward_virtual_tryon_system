import asyncio
import hmac
import io
import logging
import os
import secrets
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request, status
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.datastructures import UploadFile
from starlette.responses import Response

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_FORM_BYTES = 2 * MAX_IMAGE_BYTES + 128 * 1024
MAX_IMAGE_PIXELS = 12_000_000
MAX_IMAGE_DIMENSION = 4096
NO_STORE_HEADERS = {
    "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
}
logger = logging.getLogger("catvton-worker")


def _validated_rgb(data: bytes, *, person: bool) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format not in {"JPEG", "PNG"}:
                raise ValueError("Only JPEG and PNG images are supported.")
            if (
                source.width > MAX_IMAGE_DIMENSION
                or source.height > MAX_IMAGE_DIMENSION
                or source.width * source.height > MAX_IMAGE_PIXELS
            ):
                raise ValueError("Image dimensions exceed the processing limit.")
            source.verify()
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source)
            if person and (image.width < 256 or image.height < 384):
                raise ValueError("The person photo is too small.")
            if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
                rgba = image.convert("RGBA")
                background = Image.new("RGBA", rgba.size, "white")
                return Image.alpha_composite(background, rgba).convert("RGB")
            return image.convert("RGB")
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail="Invalid inference image.") from exc


class CatVTONRuntime:
    def __init__(self):
        repo_path = Path(os.environ["CATVTON_REPO_PATH"]).resolve()
        if not (repo_path / "model" / "pipeline.py").is_file():
            raise RuntimeError("CATVTON_REPO_PATH must point to a CatVTON checkout.")
        if repo_path.as_posix() not in sys.path:
            sys.path.insert(0, str(repo_path))

        import torch
        from diffusers.image_processor import VaeImageProcessor
        from huggingface_hub import snapshot_download
        from model.cloth_masker import AutoMasker
        from model.pipeline import CatVTONPipeline
        from utils import resize_and_crop, resize_and_padding

        if not torch.cuda.is_available():
            raise RuntimeError("CatVTON requires an available CUDA GPU.")
        precision = os.getenv("CATVTON_MIXED_PRECISION", "bf16")
        if precision not in {"fp16", "bf16"}:
            raise RuntimeError("CATVTON_MIXED_PRECISION must be fp16 or bf16.")
        if precision == "bf16" and not torch.cuda.is_bf16_supported():
            raise RuntimeError("This GPU does not support bfloat16; configure fp16.")

        model_path = snapshot_download(
            repo_id=os.getenv("CATVTON_CHECKPOINT_REPO", "zhengchong/CatVTON")
        )
        base_model_path = os.getenv(
            "CATVTON_BASE_MODEL_PATH", "stable-diffusion-v1-5/stable-diffusion-inpainting"
        )
        weight_dtype = torch.bfloat16 if precision == "bf16" else torch.float16
        self.pipeline = CatVTONPipeline(
            base_ckpt=base_model_path,
            attn_ckpt=model_path,
            attn_ckpt_version="mix",
            weight_dtype=weight_dtype,
            device="cuda",
            use_tf32=True,
        )
        self.mask_processor = VaeImageProcessor(
            vae_scale_factor=8,
            do_normalize=False,
            do_binarize=True,
            do_convert_grayscale=True,
        )
        self.automasker = AutoMasker(
            densepose_ckpt=str(Path(model_path) / "DensePose"),
            schp_ckpt=str(Path(model_path) / "SCHP"),
            device="cuda",
        )
        self.torch = torch
        self.resize_and_crop = resize_and_crop
        self.resize_and_padding = resize_and_padding
        self.lock = threading.Lock()

    def generate(self, person: Image.Image, garment: Image.Image) -> Image.Image:
        with self.lock:
            person = self.resize_and_crop(person, (768, 1024))
            garment = self.resize_and_padding(garment, (768, 1024))
            mask = self.automasker(person, "upper")["mask"]
            mask = self.mask_processor.blur(mask, blur_factor=9)
            generator = self.torch.Generator(device="cuda").manual_seed(
                secrets.randbits(32)
            )
            return self.pipeline(
                image=person,
                condition_image=garment,
                mask=mask,
                num_inference_steps=30,
                guidance_scale=2.0,
                generator=generator,
            )[0].convert("RGB")


runtime: Optional[CatVTONRuntime] = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global runtime
    runtime = CatVTONRuntime()
    yield
    runtime = None


app = FastAPI(title="Private CatVTON worker", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ready" if runtime is not None else "unavailable"}


@app.post("/api/generate")
async def generate(
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    expected_token = os.getenv("CATVTON_WORKER_TOKEN", "")
    supplied_token = (
        authorization.removeprefix("Bearer ").strip()
        if authorization and authorization.startswith("Bearer ")
        else ""
    )
    if not expected_token or not hmac.compare_digest(supplied_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    content_length = request.headers.get("content-length")
    if content_length is None:
        raise HTTPException(status_code=411, detail="A bounded Content-Length is required.")
    try:
        if int(content_length) > MAX_FORM_BYTES:
            raise HTTPException(status_code=413, detail="Inference upload is too large.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid upload length.") from exc

    async with request.form(max_files=2, max_fields=0) as form:
        person = form.get("person")
        garment = form.get("garment")
        if not isinstance(person, UploadFile) or not isinstance(garment, UploadFile):
            raise HTTPException(status_code=422, detail="Both inference images are required.")
        person_data = await person.read(MAX_IMAGE_BYTES + 1)
        garment_data = await garment.read(MAX_IMAGE_BYTES + 1)
        if len(person_data) > MAX_IMAGE_BYTES or len(garment_data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Inference image is too large.")

    person_image = _validated_rgb(person_data, person=True)
    garment_image = _validated_rgb(garment_data, person=False)
    person_data = b""
    garment_data = b""
    if runtime is None:
        raise HTTPException(
            status_code=503,
            detail="The local CatVTON model is not ready.",
        )
    try:
        result = await asyncio.to_thread(runtime.generate, person_image, garment_image)
        person_image.close()
        garment_image.close()
        output = io.BytesIO()
        result.save(output, format="PNG", optimize=True)
        if output.tell() > 20 * 1024 * 1024:
            raise RuntimeError("Generated image exceeds the response size limit.")
        output_data = output.getvalue()
        output.close()
        result.close()
        return Response(
            content=output_data,
            media_type="image/png",
            headers=NO_STORE_HEADERS,
        )
    except Exception as exc:
        logger.error("CatVTON inference failed (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="The local AI model could not generate a preview.",
        ) from exc
