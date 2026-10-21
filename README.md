# Fashion Forward — Milestone 1

Project scaffold: React + FastAPI + PostgreSQL, wired together with a health check.

## Run

1. `cp .env.example .env`
2. `docker compose up --build`
3. Frontend: http://localhost:5173
4. Backend health check: http://localhost:8000/api/health

## Version 2 (redesign, Try-On Studio, Compare, Saved Looks, Shop Together)

See [docs/V2_REDESIGN.md](docs/V2_REDESIGN.md) for setup, new routes, migration 0005, privacy rules and limitations.

## AI Photo Try-On Studio

The separate, privacy-first photo try-on page and its local CatVTON setup,
license, garment-reference requirements, and tests are documented in
[docs/AI_PHOTO_TRYON.md](docs/AI_PHOTO_TRYON.md). It does not replace the
existing live-camera try-on.

## Milestone 1 — What's real vs placeholder

Real: frontend/backend/database are actually running and actually talking to
each other. The database status on screen reflects a live `SELECT 1` query,
not a hardcoded value. This status page now lives at `/status`.

## Milestone 2 — E-commerce UI

Added Home, Shop, Product Details, Cart, and Wishlist pages with working
filters/sorting/cart math, using `react-router-dom`. Product data source and
image rendering for this milestone are both superseded by Milestone 3 below.

## Milestone 3 — Real database + product API

Added: PostgreSQL tables (via Alembic migrations), a seeded 20-product
crop-top catalogue, and REST endpoints the frontend now actually calls.
`mockProducts.ts` is gone — Home, Shop, Product Details, and Wishlist all
load from the backend.

### First-time setup after pulling this update

```
docker compose down
docker compose up --build
```

Then, in a second terminal, run migrations and seed the database:

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.run_seed
```

You should see `Seeded 20 products, ...` followed by a list of which
products are still missing real photos (all 20, until you add them — see
below).

Run backend tests:

```
docker compose exec backend pytest
```

### Real product photos — what to add and where

Colored placeholder cards have been removed. Product images now point to
real file paths; until a photo exists at that path, the product card shows
a plain "📷 Photo not added yet" box instead — never a colored gradient,
never a broken image icon.

**Where:** `backend/app/static/products/<PRODUCT_ID>/`
**Required file:** `front.jpg` (or `.png`) — the main photo shown on cards and as the gallery hero
**Optional files:** `back.jpg`, `detail.jpg` — shown in the product gallery if present
**Format:** JPG or PNG
**Dimensions:** ~800×1000px, portrait (4:5 ratio) works best with the existing card layout
**Count:** 20 required (`front.jpg` for each product below), 40 more optional (`back.jpg` + `detail.jpg` per product)

A folder already exists for every product with a `READ_ME_FIRST.txt` inside
naming that exact product. Drop your file in, refresh the browser — no
rebuild, no reseed, no restart needed (the folder is live-mounted into the
running container).

| ID | Product | Category | Colors |
|---|---|---|---|
| CT001 | Ribbed Square Neck Crop Top | Ribbed | Black, White, Pink |
| CT002 | Classic Cotton Crop Top | Basic | Black, White, Grey |
| CT003 | Halter Neck Crop Top | Halter | Emerald, Black |
| CT004 | Oversized Graphic Crop Top | Casual | White, Black |
| CT005 | Classic Tank Crop Top | Tank | White, Grey, Navy |
| CT006 | Floral Printed Crop Top | Printed | Multicolor |
| CT007 | Off-Shoulder Crop Top | Off-Shoulder | Burgundy, Black |
| CT008 | Full-Sleeve Layering Crop Top | Full-Sleeve | Black, White |
| CT009 | Sequin Party Crop Top | Party | Gold, Silver |
| CT010 | Performance Sports Crop Top | Sports | Black, Blue |
| CT011 | Weekend Linen Crop Top | Casual | Beige, White |
| CT012 | Ribbed Halter Crop Top | Ribbed | Pink, Black |
| CT013 | Printed Tank Crop Top | Printed | Multicolor |
| CT014 | Everyday Basic Crop Top — Pack of 2 | Basic | Black, White |
| CT015 | High-Neck Sports Crop Top | Sports | Black, Green |
| CT016 | Tie-Front Denim Crop Top | Denim | Light Blue, Dark Blue |
| CT017 | Chunky Knitted Crop Top | Knitted | Cream, Brown |
| CT018 | Square Neck Basic Crop Top | Basic | White, Black, Sage |
| CT019 | Boho Floral Crop Top | Printed | Multicolor |
| CT020 | Sleeveless Scoop Neck Crop Top | Tank | Black, Maroon, White |

**If you don't have your own photos:** free-for-commercial-use stock sites
like Unsplash, Pexels, and Pixabay license their photos for exactly this
kind of reuse — search each site for terms like "crop top [color]" or
"[category] top", download, rename to `front.jpg`, and drop it in the
matching folder. I can't batch-download and host third-party photos on your
behalf (that's a copyright/licensing line I don't cross even for free-license
sites, since I can't verify each individual photo's terms at scale), but you
downloading a handful yourself under their stated free license is fine.

### What's real vs placeholder in this milestone

Real:
- Products, images, colors, sizes all come from PostgreSQL via FastAPI —
  verify with `curl http://localhost:8000/api/products`
- Search, category filtering, color/size filtering, price range, minimum
  rating, and all four sort options run as real SQL queries
- The image *architecture* is real and final — real file paths, served by
  FastAPI, referenced from the database, rendered by React with zero
  hardcoded URLs. Nothing here changes when real photos are added.

Not yet real:
- Image *content* — no photo files exist yet at any product's path (see
  table above). The UI shows an honest "photo not added yet" placeholder,
  not a colored card and not a broken icon.
- `garment_assets` table exists and is seeded with an internal (invisible,
  not user-facing) SVG placeholder for `tryon_image` — nothing in the UI
  reads this field yet. The AI try-on pipeline (a later milestone) is what
  will use it, and will need its own real isolated garment asset, separate
  from the shopping photos above.
- "Try It On" still shows a "not built yet" panel.
- Reviews table exists but has no submission UI/API yet.

### API endpoints added

```
GET /api/products              (search, category, colors, sizes, fabric, fit,
                                 min_price, max_price, min_rating, is_trending,
                                 is_new, sort, skip, limit)
GET /api/products/search?q=
GET /api/products/filters      (distinct categories/colors/fabrics/fits + price bounds)
GET /api/products/{id}
GET /api/products/{id}/images
GET /api/products/{id}/variants
GET /api/products/{id}/sizes
GET /api/categories
```

## Milestone 4 — Authentication & user accounts

Added a real users table, JWT-based auth, and role-based authorization —
both frontend route guards and independent backend enforcement (a customer
JWT genuinely gets a 403 from `/api/admin/ping`; the frontend hiding the
Admin link is not what's actually protecting it).

### Setup after pulling this update

```
docker compose down
docker compose up --build
```

Then, second terminal:

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.run_seed
docker compose exec backend pytest
```

32 tests should pass (11 product tests + 21 auth/authorization/security tests).

### Try it

- Register at `/register`, you'll be logged in immediately
- Refresh the page — you stay logged in (JWT persisted in `localStorage`,
  verified against the backend on load, not just trusted blindly)
- Visit `/wishlist` while logged out — redirected to `/login`; log in and
  you're sent back to `/wishlist` automatically
- Visit `/admin` as a regular customer — redirected away; the backend
  itself also independently rejects the request, not just the frontend route
- `Home`, `/shop`, search, filters, sorting, `/product/:id`, and `/cart`
  all still work without logging in — browsing was never gated

### Creating an admin account

There's no self-registration path to admin — by design, the register API
can't be used to create one. Provision one directly:

```
docker compose exec backend python -m app.create_admin "Admin Name" admin@example.com somepassword123
```

Log in with that account and visit `/admin` — the navbar also shows an
Admin link only for that account.

### Security implementation

- Passwords hashed with bcrypt (via passlib) — never stored or returned in
  plain text; verified in `test_password_is_hashed_not_plaintext` and
  `test_password_hash_never_in_any_response`
- JWT access tokens (30 min) + refresh tokens (7 days), `HS256`, secret
  read from `JWT_SECRET` env var — never hardcoded, never sent to the
  frontend in any response
- `get_current_user` / `require_admin` FastAPI dependencies independently
  verify the JWT and role on the backend for every protected endpoint —
  frontend route guards are a UX convenience, not the actual security
  boundary
- Login errors are generic ("Invalid email or password") — don't reveal
  whether an email is registered
- Registration schema has no `role` field at all, so a client can't set
  `role: "admin"` in the request body even by tampering with it (tested
  in `test_register_cannot_set_role`)

### Known limitation — logout

JWTs are stateless here, so there's no server-side session to destroy.
"Logout" clears the tokens from the browser's `localStorage`; a token
issued before logout would technically still validate if replayed before
it expires. A real "logout everywhere" / token-revocation feature needs a
server-side blocklist table, which is out of scope for this milestone —
flagging this rather than pretending logout does something it doesn't.

### What's still not implemented (by design)

- Cart is intentionally NOT tied to `user_id` yet — it stays anonymous/
  in-memory for both logged-in and logged-out users, per this milestone's
  scope. The backend architecture (JWT identifies `user_id` on any
  request) is ready for a future milestone to persist it per-user.
- Checkout is a guest-accessible UI with delivery details and simulated
  UPI/card/Cash on Delivery choices. It does not process payments, create
  backend orders, or arrange shipments; `/orders` remains a placeholder.
- Full admin product-management dashboard — only a protected `/admin`
  page + one backend-verified endpoint exist as the foundation
- Password reset/"forgot password" — UI text placeholder only

### API endpoints added

```
POST  /api/auth/register     → 201, sets role=customer always, returns tokens + user
POST  /api/auth/login        → 200 + tokens + user, or 401
GET   /api/auth/me           → current user (requires Bearer token)
PATCH /api/auth/me           → update full_name/email (requires Bearer token)
POST  /api/auth/refresh      → new access token from a refresh token
POST  /api/auth/logout       → confirms the token was valid; real logout is client-side
GET   /api/admin/ping        → 200 for admin role, 403 for customer (backend-enforced)
```

## Milestone 5 — Body landmark detection + measurement foundation

Added client-side MediaPipe pose detection on a new protected `/try-on`
page, plus a backend API to save the resulting geometric estimates per
user. **This is not virtual try-on yet** — no garment overlay, no TPS
warping, no skin-tone analysis, no fit prediction. It's the detection and
measurement foundation those features will build on.

### One honest limitation of this delivery

I verified this the same rigorous way as every prior milestone — actually
running the tests, actually type-checking, actually building — **except**
for the camera/MediaPipe part itself. That requires a real browser with a
real webcam, which doesn't exist in my sandbox. I can and did verify:

- The backend measurement API (10 new tests, all passing for real)
- The frontend compiles with zero TypeScript errors
- The production build succeeds with MediaPipe bundled correctly
- The pose-quality and measurement math (`poseAnalysis.ts`) is pure,
  dependency-free logic — inspect it directly if you want to audit the
  thresholds

What I could NOT verify myself: that the camera actually opens, that
MediaPipe actually detects your pose correctly, that the skeleton overlay
actually draws in the right place. **You'll need to test this in your own
browser and tell me what you see** — the same pattern we've used for every
milestone's frontend, just more load-bearing here since this is the first
milestone I can't sanity-check visually myself.

### Setup after pulling this update

```
docker compose down
docker compose up --build
```

Second terminal:

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.run_seed
docker compose exec backend pytest
```

42 tests should pass (11 products + 21 auth + 10 measurements).

### Try it

1. Log in, then click "Try On" in the navbar (or the Try On button on any
   product)
2. Click "Start Camera" — your browser will ask for camera permission
3. Stand facing the camera, upper body + shoulders + hips in frame
4. Watch the green skeleton overlay track your pose (toggle "Show
   Landmarks" to turn it off)
5. The right-hand panel should update: Pose = Front, a confidence
   percentage, and Shoulder/Torso/Hip width numbers once a good pose is
   detected — these are unitless, normalized to the camera frame, **not
   centimeters**
6. Optionally enter your height and click "Save Measurement" — only a
   valid front-facing snapshot (normalized shoulder width, hip width, torso
   length, confidence, and optional entered height) is sent to the backend;
   video/image data is never sent. The page shows the latest saved snapshot
   separately from live values and reloads it from your account on return.
   Failed saves retain the captured snapshot for retry without creating
   duplicate history records.

### What's real vs foundation-only in this milestone

Real:
- MediaPipe Pose runs entirely in your browser (Tasks Vision API,
  official Google CDN for the WASM runtime + model) — no camera frames
  are ever sent to the backend
- Pose quality checks (too close/far, out of frame, side-facing, low
  confidence) are computed from actual landmark geometry, not guessed
- Shoulder/hip/torso measurements are real distances between detected
  landmarks — genuinely computed, not hardcoded
- The backend only ever returns `null` for `chest_estimate` and
  `waist_estimate` — inferring circumference from a single 2D width
  measurement is guessing, so the API doesn't pretend otherwise
- Measurements are strictly scoped to the authenticated user; one user
  can never fetch another's (tested, including the specific "fetch by ID
  belonging to someone else" case — returns 404, not 403, so it doesn't
  even confirm the record exists)
- Invalid, non-front, under-50%-confidence captures are rejected rather
  than stored as successful measurement sessions. Measurements are stored
  as a user-scoped history; repeat submissions with the same retry key
  return the original row instead of adding a duplicate.

Foundation only (explicitly deferred, not fake):
- All measurement values are **normalized image-space distances**, not
  centimeters. No calibration step exists yet — that needs a known
  reference (height, a reference object, or camera intrinsics), which is
  future-milestone work. `user_height` is captured now but not yet used
  for any conversion.
- No garment overlay, no TPS warping, no skin-tone analysis, no fit score

### API endpoints added

```
POST /api/body/measurements       → save a measurement snapshot (requires auth)
GET  /api/body/measurements       → list current user's own measurements (requires auth)
GET  /api/body/measurements/{id}  → get one of the current user's own measurements (requires auth)
```

## Milestone 6 — Body segmentation + garment placement foundation

Added real-time body segmentation, product/color selection on the Try-On
page, a garment-asset API, and landmark-driven garment placement math. **This
is explicitly NOT the final virtual try-on** — no TPS warping, no fabric
deformation, no realistic compositing. It establishes: real landmarks →
real computed placement rectangle → an overlay drawn at that position/
scale/rotation. The overlay is either a real garment image (once you
supply one) or a clearly-labeled debug box proving the math works.

### Same honest limitation as Milestone 5

I can't open a browser or use a webcam myself, so — same as last time —
I verified everything I *could* verify rigorously (backend: 48 tests,
all passing; frontend: TypeScript clean, production build succeeds,
segmentation model bundled correctly) but the actual in-browser behavior
of segmentation + garment overlay needs your testing. Body segmentation
specifically uses a less mature part of the MediaPipe Tasks Vision API
than pose landmarks did, so there's a real chance the exact method names
(`getAsFloat32Array`, `segmentForVideo`) differ slightly from what's
bundled in the CDN version at the moment you test — I wrote defensive
try/catch around it so a failure degrades to "segmentation unavailable"
rather than crashing pose detection, but tell me if you see that message
and I'll adjust.

### Initial milestone asset status (historical; see current status below)

The following asset notes record the state of an earlier milestone. They
are superseded by the current checkout summary at the end of this README.

None of the 20 products have a `tryon.png` (isolated garment cutout).
This is a genuinely different asset type from the shop photos you already
sourced — those show someone *wearing* the top; the try-on pipeline needs
just the garment shape, isolated, transparent background. I'm not
generating a fake one to paper over this. Instead:

- Every product has a real folder ready at
  `backend/app/static/garment-assets/<PRODUCT_ID>/` with a
  `READ_ME_FIRST.txt` naming exactly what's needed
- The API (`GET /api/products/{id}/garment-assets`) honestly reports
  `asset_available: false` for all 20 right now — verified by test
- Until you add a real one, the Try-On page shows a clearly-labeled
  **magenta debug box** at the computed garment position/size/rotation
  instead of an image — this proves the landmark→placement math is real
  and working without pretending a garment image exists
- Drop a real `tryon.png` into any product's folder and refresh — the
  debug box is replaced by the actual image, using the exact same
  placement transform, no code changes needed

**Format spec, if you want to add one:** PNG with transparency,
~1000×1200px, front-facing/flat-lay or ghost-mannequin style (not a photo
of someone wearing it). Optional per-color variants: `tryon-<color>.png`
(e.g. `tryon-black.png`) — falls back to the generic `tryon.png` if a
color-specific one isn't present.

### Setup after pulling this update

```
docker compose down
docker compose up --build
```

Second terminal:

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.run_seed
docker compose exec backend pytest
```

48 tests should pass (11 products + 21 auth + 10 measurements + 6 garment-assets).

### Try it

1. Log in, click "Try On"
2. Pick a crop top from the strip at the top, optionally pick a color
3. Start the camera, get into a good front-facing pose (same as Milestone 5)
4. Toggle **"Show Body Mask"** — you should see a teal-tinted overlay on
   your body silhouette, separate from the green skeleton dots/lines
5. Watch the new **Body Segmentation** panel — "Person detected," a
   coverage percentage, and a confidence number, all computed from the
   actual mask data
6. You should see a **magenta dashed box** roughly where a crop top would
   sit, labeled "No real garment asset — placement preview only" — move
   around and confirm it tracks your shoulders (position, and rough scale
   as you move closer/farther)
7. Switch products/colors in the picker — the box should reflect the
   newly selected garment's metadata (check the small status line under
   the picker)

### What's real vs foundation-only in this milestone

Real:
- Body segmentation runs from actual camera frames via MediaPipe's selfie
  segmentation model — not a static/fake mask
- Segmentation quality (person detected, coverage %, confidence) is
  computed from real per-pixel mask data
- Garment placement (position, width, height, rotation) is computed
  entirely from detected shoulder/hip landmarks each frame — zero
  hardcoded coordinates, verified by reading `garmentPlacement.ts`
  directly if you want to audit it
- When pose becomes invalid, the garment/debug box disappears rather
  than floating at a stale position
- The garment-asset API honestly reports availability per product/color,
  with tested fallback logic for color-specific vs. generic assets

Foundation only (explicitly deferred, not fake):
- No TPS warping, no fabric deformation, no realistic occlusion — the
  overlay is a flat rotated/scaled rectangle, acknowledged in the UI copy
- No garment try-on images exist for any product yet (see above)
- "Multiple people" detection isn't implemented — the segmentation model
  used here does single-subject foreground/background masking and
  doesn't expose a person-count signal to check honestly

### API endpoints added

```
GET /api/products/{id}/garment-assets?color=<name>  → garment_type, fabric_type,
    colors, asset_available, tryon_url, mask_url, fallback_used
```

## Milestone 7 — Garment asset pipeline + 2D try-on overlay (refinement)

Formalizes what Milestone 6 started: a reusable garment-asset loader hook
(instead of an inline fetch), a **"Show Garment"** toggle alongside the
existing landmark/mask toggles, exact-wording missing-asset messages, a
real-time debug panel, and a configurable `GARMENT_SCALE_FACTOR`. No new
backend endpoints — Milestone 6's garment-assets API already covered
what this needed.

### Still the same honest limitations as Milestones 5 & 6

Same as before: I can't test an actual browser/webcam myself, so the
runtime behavior needs your confirmation. And still — **no product has a
real `tryon.png` yet**, so what you'll see by default is the same magenta
debug box from Milestone 6, now gated behind the new "Show Garment"
toggle and displaying the exact required message text
("Virtual Try-On is not available for this product yet." / "Try-on asset
unavailable for this color." when a specific color was requested).

### What's new to check

1. A third toggle, **"Show Garment"** — turning it off should hide both
   the debug box and (once you have one) any real garment image, leaving
   landmarks/mask visualization independent
2. The **Debug Info** panel (dashed border, bottom of the side panel) —
   shows Selected Product, Garment Asset (AVAILABLE/MISSING), Pose,
   Pose Confidence, Shoulder Width, Garment Position (x, y), Garment
   Scale, and Garment Rotation, all updating live as you move
3. Switch products/colors — the status message directly under the color
   swatches should update immediately, using the exact wording from the
   spec depending on whether a color was involved

### Setup after pulling this update

```
docker compose down
docker compose up --build
```

Second terminal:

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.run_seed
docker compose exec backend pytest
```

48 tests should still pass — nothing changed on the backend this milestone.

### What's real vs foundation-only in this milestone

Real:
- `useGarmentAsset` hook cleanly owns all garment-asset fetching/loading-
  state/error-state — no hardcoded asset paths scattered through
  components
- `GARMENT_SCALE_FACTOR` and `GARMENT_HEIGHT_RATIO` are named, exported,
  documented constants — tunable in one place, not magic numbers buried
  in a function
- The debug panel's numbers are the exact same values driving the visual
  overlay — nothing separately faked for display
- A corrupted/failed garment image load surfaces a real error message
  instead of silently doing nothing

Foundation only:
- Still a flat rotated/scaled rectangle, not realistic fabric — TPS
  warping remains explicitly out of scope until a later milestone
- Segmentation is used for visualization and the compositing pipeline
  structure, not yet for actual occlusion (garment doesn't yet render
  "behind" an arm that crosses in front of it)

## Milestone 8 — Initial Thin Plate Spline baseline (historical)

This section documents the initial eight-point TPS implementation. Its
shared source template and performance values were superseded by the
product-specific fitting pipeline described under **Current virtual
try-on status** below.

Replaces the rigid rectangular overlay from Milestone 7 with a genuine
non-rigid TPS warp. **This is the real mathematical transformation** —
not a CSS trick, not a pre-warped image, not an AI-generated result.

### What makes this genuinely verifiable (unlike Milestones 5-7)

The TPS math itself — solving the linear system, evaluating the spline,
warping pixels, deriving control points, smoothing landmarks — is pure
TypeScript with **zero browser dependency**. So this time, instead of
just writing the math and hoping it's right, I added a real test runner
(`vitest`) and wrote 39 numerical unit tests that I actually ran:

```
docker compose exec frontend npm test
```
(or locally: `cd frontend && npm test`)

**39/39 passing**, covering every category the milestone asked for:
identity transform, pure translation, pure scaling, pure rotation, two
independent proofs of genuine non-rigid deformation (including a
mathematically airtight one: a pure affine map is uniquely determined by
any 3 non-collinear points, so if TPS satisfies a 4th point that those 3
alone couldn't reach, it cannot itself be affine), coincident/near-
coincident control points, regularization's effect on fit tightness,
invalid-input rejection, alpha-channel preservation through warping, and
landmark smoothing behavior.

What I still can't verify myself — same honest limitation as every
camera-dependent milestone — is the actual in-browser rendering: does the
mesh visibly bend on your screen, does performance hold up on your
hardware. That needs your testing.

### The math, briefly

Standard 2D Thin Plate Spline (Bookstein formulation). For N control
point correspondences, solves:

```
[ K  P ] [ w ]   [ v ]
[ Pᵀ 0 ] [ a ] = [ 0 ]
```

where `K_ij = U(|Pᵢ - Pⱼ|)`, `U(r) = r²·log(r²)` is the radial basis
("bending energy") kernel, and `P` is the affine-trend matrix. Solved via
Gaussian elimination with partial pivoting (small systems — 8 control
points → an 11×11 matrix — don't need a heavy linear algebra library).

**Why regularization:** at 0, TPS interpolates control points exactly —
which is also precisely what makes the system singular when landmarks
are duplicated, collinear, or nearly so (a real risk with live camera
jitter). A small positive value (`1e-3` by default) both stabilizes that
and slightly relaxes exact interpolation — tested explicitly to confirm
it does both.

**Backward mapping for warping:** for each destination pixel, we ask
"which source garment pixel maps here?" (not the reverse) — this is the
standard approach that avoids holes in the output, implemented with
bilinear sampling for smooth results.

### Garment control points (8, as required)

`leftShoulder`, `rightShoulder`, and a 3-column × 2-row torso grid
(`upper/lowerLeftTorso`, `upper/lowerCenterTorso`, `upper/lowerRightTorso`)
— normalized 0-1 to the garment image's own dimensions, so a garment
asset works at any resolution. Body target points are derived from real
MediaPipe shoulder/hip landmarks via linear interpolation — zero
hardcoded screen coordinates, verified by the `controlPoints.test.ts`
suite.

These are a documented heuristic, not per-design seam calibrations. Tune
`DEFAULT_GARMENT_CONTROL_POINTS` in
`frontend/src/lib/tps/controlPoints.ts` once you have one to calibrate
against.

### Performance — the real, documented tradeoff

An 11×11 linear solve plus tens of thousands of bilinear pixel samples
per warp is too expensive to run on every animation frame on modest
hardware. The actual implementation:

- Warps at a **reduced resolution** (`WARP_MAX_DIMENSION = 220px`), then
  the browser's GPU-accelerated `drawImage` scales it up to fill the
  on-screen bounding box
- Recomputes the warp **at most every 150ms** (`TPS_UPDATE_INTERVAL_MS`),
  not every frame — the garment's *position* still tracks via the mesh
  recompute cadence, but content updates roughly 6-7 times/second, not 60

This is stated plainly, not hidden: the TPS debug panel's "FPS" and
"Processing" numbers reflect this actual throttled rate — never a
faked 60fps.

### What you'll see when a product has no usable garment asset

Milestone 7's magenta rectangle is gone. In its place: a **deforming
mesh grid** at the same position — genuinely computed via the same TPS
transform, so it visibly bends as your body geometry changes, which is a
strictly more honest and more informative placeholder than a rigid box
(it actually demonstrates the non-rigid math, not just a bounding area).

### Setup after pulling this update

```
docker compose down
docker compose up --build
```

Second terminal:

```
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.run_seed
docker compose exec backend pytest
docker compose exec frontend npm test
```

Backend: 48 passed. Frontend: 39 passed.

### Try it

1. Log in, go to Try On, pick a product, start the camera, get a good pose
2. Watch the mesh grid over your torso — it should visibly bend (not
   just translate/scale) as you move your shoulders, lean, or turn
   slightly
3. Toggle **Show TPS Mesh/Grid**, **Show Garment Control Points**, **Show
   Body Target Points** — confirm each draws something sensible and
   updates as you move
4. Adjust the **landmark smoothing (alpha)** slider — lower values
   should make the mesh noticeably steadier (less jittery) but slightly
   laggier; higher values more responsive but twitchier
5. Watch the **TPS Debug Info** panel — Control Points should read 8,
   Processing/FPS should show real (not suspiciously round) numbers that
   change slightly frame to frame

### What's real vs foundation-only in this milestone

Real:
- The TPS transform is mathematically genuine — 39 passing numerical
  tests prove identity/translation/scale/rotation reproduce exactly, and
  non-rigid deformation is proven two independent ways
- Control points and target points are both dynamically computed from
  real data (garment dimensions, live landmarks) — nothing hardcoded
- Landmark smoothing (EMA, configurable alpha) is real and tested
- Alpha channel is preserved through warping — verified with synthetic
  transparent/semi-transparent test images, not assumed
- Mask warping is implemented and genuinely computed when a `mask.png`
  exists, kept as a separate output per the spec — not yet drawn to
  screen or composited (that's explicitly a later milestone)

Explicitly NOT implemented (per the milestone's own scope limits):
- Realistic cloth physics, 3D body understanding, depth-aware fitting
- Accurate side-view try-on (TPS here only activates on front-facing
  poses, same gating as Milestones 5-7)
- Accurate occlusion (an arm crossing in front of the garment doesn't
  yet render correctly) — segmentation data exists but isn't used for
  compositing yet
- Photorealistic rendering of any kind

**To be unambiguous about the thing this milestone most needs stated
plainly: the garment is genuinely being non-rigidly warped via a real,
tested Thin Plate Spline implementation — not rigidly translated/scaled/
rotated as in Milestone 7, and not a pre-rendered or AI-generated result.**

## Current virtual try-on status

- The current renderer uses ten source/target TPS correspondences and
  per-product profiles in
  `frontend/src/lib/tps/garmentFitProfiles.ts`. Each profile defines
  shoulder, neckline, chest, and hem proportions, snapped to visible
  pixels within the product PNG's alpha bounds. This replaces the earlier
  shared eight-point template described in the historical Milestone 8
  section above.
- Target rows derive from visible shoulder/hip landmarks and reduce the
  shoulder, chest, and hem width relative to the detected torso. Source
  and target coordinates are normalized before the TPS solve; degenerate
  inputs are rejected. The alpha-boundary is sampled and projected to
  determine the actual draw region.
- A grid-based orientation check tests both TPS directions for folds.
  When a candidate folds, its non-rigid component is reduced toward a
  least-squares affine fit until the visible garment maps without an
  inversion; the development diagnostics report that TPS strength.
- Fit profiles are product-specific heuristics manually assigned from
  each current image's silhouette, not pixel-annotated seam/armhole points
  or a calibrated clothing/body model. They can only align geometry
  present in a correctly isolated, product-matched PNG.
- Garment files are read from
  `backend/app/static/garment-assets/<PRODUCT_ID>/tryon.png`; the matching
  API endpoint returns the product-specific URL and availability. CT001
  through CT020 each currently have a PNG at that path.
- The browser waits for PNG decoding, rejects opaque images, checks that
  visible alpha pixels exist, and derives the garment-specific TPS points
  from each image's nontransparent bounds. Product/color fallback is reported
  by the UI; it is not represented as a color-specific image.
- Pose validity and normalized live estimates use visible, in-frame
  shoulder and hip landmarks. The values are frame-relative estimates,
  not centimeters. The camera and canvas share source-video dimensions
  and mirrored presentation.
- TPS points remain a fitting heuristic, not calibrated seam annotations.
  The PNG's
  transparency does not establish that its garment design matches its
  catalogue description; visually verify each SKU and replace mismatched
  files before treating the rendered product as correct.
- This remains front-facing 2D compositing without cloth physics,
  calibrated real-world measurements, or reliable arm/garment occlusion.
  A physical-camera acceptance run is required to verify movement and fit.

Use `docker compose down` to stop services without removing the database
volume. Avoid `docker compose down -v` unless you intentionally want to
delete that volume and its data.

Run the current checks from the project root:

```
docker compose exec backend pytest -q
docker compose exec frontend npm test
docker compose exec frontend npm run build
```
