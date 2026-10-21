# AI Photo Try-On Studio

The `/photo-try-on` page (linked as **AI Photo Try-On**) creates a free
fitting preview directly in the browser. It reuses the existing
product-specific transparent garment cutouts and fitting profiles from the
live-camera try-on: MediaPipe detects the uploaded photo's pose, a thin-plate
spline warps the garment to the torso, and foreground-arm segmentation is
composited over it when available. The selected catalog shade tints the
cutout.

The person's photo is processed in browser memory and is not uploaded to
the backend or a hosted inference provider by this page. MediaPipe's
runtime and model files are downloaded from their configured public CDNs;
the photo itself stays local. The preview is a geometric fitting
approximation, **not** an image-generating model: fabric, folds, lighting,
prints, and exact product/color appearance are not synthesized. The
catalog's generic cutout may not represent every product detail or color.
Use a front-facing photo with visible shoulders and hips. An optional local
CatVTON endpoint is still available separately; its licensing and hardware
requirements are described below.

The product selector includes local fit adjustments for shoulder width,
torso width, garment length, and vertical placement. Changing a slider clears
the previous result; generate the preview again to apply the new settings.
It also includes horizontal placement for off-center photos. These controls
adjust the geometric cutout only and cannot remove clothing showing through
transparent necklines or armholes. Garment resampling uses premultiplied-alpha
interpolation to reduce color fringes from transparent image padding, and
shade tinting retains some source fabric color variation and texture.

## Optional local AI inference

The separate backend inference endpoint uses **CatVTON**, rather than
IDM-VTON. CatVTON is an 899M-parameter model with automatic upper-body
mask generation, but needs dedicated setup and is not required for the
free browser fitting preview.

The official CatVTON code **and checkpoints** are licensed
[CC BY-NC-SA 4.0](https://github.com/Zheng-Chong/CatVTON/blob/main/LICENSE)
and the project explicitly says non-commercial use only. Obtain a
separate license before using either CatVTON or IDM-VTON commercially.
CatVTON also uses Stable Diffusion v1.5 inpainting, whose model card
declares [CreativeML OpenRAIL-M](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting).
Review and comply with that license as well; it does not override
CatVTON's non-commercial restriction.

The current Windows/Docker environment has no NVIDIA GPU. A compatible
Linux/WSL2 Docker host with NVIDIA Container Toolkit and an NVIDIA GPU
with about 8 GB or more VRAM is needed to start the optional worker.
CPU-only CatVTON inference is not offered.

### Exact-color references for the optional AI endpoint

The free browser preview uses the selected product's fitting cutout and
tints it to the selected shade. The optional CatVTON endpoint requires an
actual isolated front-view reference for the selected color. Add a PNG at:

```text
backend/app/static/garment-assets/<PRODUCT_ID>/tryon-<color-slug>.png
```

For example, CT001's black variant must be
`backend/app/static/garment-assets/CT001/tryon-black.png`. Each image must
show that exact color and product, be no larger than 8 MB or 4096 × 4096,
and be suitable as a front-facing garment reference. Do not copy or rename
a different color or substitute a shopping photo. The catalog endpoint
reports availability from these exact per-color paths.

## Privacy and request behavior

- The `/photo-try-on` page runs pose detection, garment warping, color
  tinting, and arm layering in the browser. It does not send the uploaded
  photo or fitted preview to the backend or a hosted image provider.
- MediaPipe downloads its runtime and model files from the public CDN
  URLs configured in `frontend/src/lib/mediapipe.ts`; these downloads do
  not contain the user's photo.
- The selected `File` and preview object URLs exist only in page memory.
  Clear and page unmount revoke those URLs and clear React state. The page
  does not write images to localStorage, IndexedDB, or a persistent browser
  cache. Download creates a separate local copy managed by the user.
- The optional `POST /api/photo-try-on/generate` endpoint remains
  separate from this browser preview. It requires the existing
  bearer-token login and explicit permission to use the depicted person's
  photo.
- Only JPEG/PNG file contents are accepted. The backend checks the actual
  image format, dimensions and pixel count, rejects images over 8 MB,
  strips metadata while normalizing the person photo in memory, and
  validates the selected product/color against the database and exact
  garment file.
- The optional API does not insert the person's photo or generated image
  into a database, write them to public/static storage, log them, or return
  them through a durable URL. It returns image bytes directly with
  `Cache-Control: no-store`; the worker returns bytes directly as well.
- Multipart upload parsing may use Starlette's temporary upload spool.
  Compose places backend and worker `/tmp` on tmpfs; the request form is
  closed before inference, which closes/removes its upload spool. Decoded
  images and inference outputs live in memory. Source/output images are
  not part of the persistent Hugging Face model-cache volume.
- The optional API is rate-limited to three requests per user per minute
  per backend process, serialized by the worker, size/dimension checked,
  and restricted to an explicitly allow-listed local worker URL. A
  multi-replica deployment needs a shared rate limiter and private network
  policy before exposure.
- CatVTON can take several minutes. The backend uses a bounded 240-second
  worker timeout and returns explicit unavailable, timeout, and generation
  errors. It does not return a sample or overlay on failure.

## Configure local inference

1. On a supported Linux/WSL2 host, install Docker Compose and NVIDIA
   Container Toolkit, and clone the upstream CatVTON repository locally:

   ```sh
   git clone https://github.com/Zheng-Chong/CatVTON.git /path/to/CatVTON
   ```

2. Add these values to the project's root `.env` file. Use a high-entropy
   random token shared only by the backend and worker. Do not use the
   example development JWT secret in a real deployment.

   ```dotenv
   CATVTON_WORKER_URL=http://catvton:8001/api/generate
   CATVTON_WORKER_TOKEN=<random-secret>
   CATVTON_NONCOMMERCIAL_USE_CONFIRMED=true
   CATVTON_REPO_PATH=/path/to/CatVTON
   CATVTON_MIXED_PRECISION=bf16
   CATVTON_CHECKPOINT_REPO=zhengchong/CatVTON
   CATVTON_BASE_MODEL_PATH=stable-diffusion-v1-5/stable-diffusion-inpainting
   # HF_TOKEN=<optional Hugging Face access token>
   ```

   Set `CATVTON_NONCOMMERCIAL_USE_CONFIRMED=true` only when the deployment
   is permitted under the model license. It is not a commercial license.
   Use `CATVTON_MIXED_PRECISION=fp16` if the GPU does not support bfloat16.

3. Add or verify the exact-color garment reference PNGs listed above.
4. From the project root, start the optional GPU worker:

   ```sh
   docker compose --profile ai up --build
   ```

   The worker has no published host port. Its only configured network
   target is the backend's private Compose service address. Normal
   `docker compose up --build` does not start or require the model.
5. The free browser fitting preview does not require this setup. To call
   the optional backend AI endpoint directly, log in and provide a
   permitted photo, an exact-color garment reference, and the explicit
   non-commercial-use configuration.

If CatVTON is not configured, the status endpoint reports it as
unavailable and the optional backend endpoint refuses generation. These
requirements do not disable the browser-based fitting preview.

## API and tests

- `GET /api/photo-try-on/status` reports whether the private worker,
  shared token, and non-commercial-use setting are configured.
- `GET /api/photo-try-on/catalog` returns real products and color-specific
  asset availability, without exposing asset URLs.
- `POST /api/photo-try-on/generate` accepts multipart fields `photo`,
  `product_id`, `color`, and `consent=true`; it returns a no-store PNG.
- Worker `POST /api/generate` is private to the Compose network and
  requires the shared bearer token.

Run focused backend tests and the frontend build:

```sh
docker compose exec backend pytest tests/test_photo_try_on.py tests/test_catvton_worker.py
docker compose exec frontend npm run build
```

The automated backend tests use a mocked in-memory generator. They verify
validation, authorization, cache headers, error paths, and absence of
source/result files; they do **not** claim that a real CatVTON model was
executed. The browser fitting preview uses the local pose and garment
warping code and does not invoke that inference endpoint.
