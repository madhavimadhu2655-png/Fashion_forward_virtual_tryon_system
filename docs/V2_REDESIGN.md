me # Fashion Forward v2 — redesign and feature upgrade (2026-10-19)

## Run it

With Docker (unchanged):

```
docker compose up --build
docker compose exec backend alembic upgrade head      # applies migrations, including the room-schema repair
docker compose exec backend python -m app.run_seed     # seeds, or re-syncs photo paths on an existing DB
```

Without Docker (what was used for verification): Python 3.11 with
`backend/requirements.txt`, then from `backend/`:

```
set DATABASE_URL=sqlite:///./fashion_forward_dev.db
python -c "from app.db.session import engine; from app.models import Base; Base.metadata.create_all(engine)"
python ../database/seed/seed_products.py   # or python -m app.run_seed inside Docker
uvicorn app.main:app --port 8000
```

and in `frontend/`: `npm ci && npm run dev` → http://localhost:5173.

Optional: `python tools/optimize_product_images.py` writes web-sized JPEG
copies of the shop photos to `static/products/<ID>/web/` (originals untouched,
31 MB → 4.6 MB); re-run the seed afterwards.

## Design system

Tokens live in `frontend/src/index.css` (`:root` CSS variables) and are mapped
in `tailwind.config.js`: ivory/porcelain/canvas surfaces, charcoal ink, stone
text, burgundy "wine" accent, sage/amber/danger states, card/control radii and
two shadows. Type: Fraunces (display) + Manrope (body). Shared classes:
`.btn-*`, `.field`, `.chip`, `.badge-*`, `.notice-*`, `.swatch`, `.card`.
Components: `components/ui.tsx` (Notice, Price, Swatch, Modal, Avatar,
Spinner, EmptyPanel), `components/Icon.tsx` (single SVG icon set), toasts in
`context/ToastContext.tsx`. Old colour names are remapped onto the new palette.

## What was added

| Area | Where |
| --- | --- |
| Photo try-on studio (two engines, quality check, blockers, slider) | `pages/PhotoStudio.tsx`, `components/studio/*`, `lib/tryOnEngine.ts` |
| Before/after slider (mouse, touch, keyboard, reset, aligned crops) | `components/BeforeAfterSlider.tsx` |
| Photo quality guidance | `lib/photoQuality.ts` (thresholds), `lib/photoQualityRunner.ts` |
| Compare Looks (2–3 tops, serial queue) | `pages/Compare.tsx`, `lib/serialQueue.ts` |
| Saved Looks + server favourites | `pages/SavedLooks.tsx`, `api/looks.py`, `models/looks.py` |
| Shop Together | `pages/Rooms.tsx`, `pages/JoinRoom.tsx`, `pages/Room.tsx`, `hooks/useRoomSocket.ts`, `api/rooms.py`, `services/rooms.py`, `services/room_hub.py` |
| Rendering refinements | `lib/garmentRefinement.ts` (edge cleanup, lighting match, recolour limits) |
| Recommendations / assistant / recently viewed | `lib/recommendations.ts`, `lib/assistant.ts`, `lib/recentlyViewed.ts` |
| Reviewer guide + live status | `pages/Status.tsx` (`/status`, `/demo`) |

## API additions (all additive)

- `GET/PUT/DELETE /api/wishlist[/{product_id}]`, `POST /api/wishlist/merge`
- `GET/POST /api/saved-looks`, `PATCH/DELETE /api/saved-looks/{id}`
- `POST/GET /api/rooms`, `POST /api/rooms/join`, `GET /api/rooms/{id}`,
  `GET /api/rooms/{id}/invite`, `POST /api/rooms/{id}/invite/rotate`,
  `POST /api/rooms/{id}/leave`, `POST /api/rooms/{id}/close`,
  `WS /api/rooms/{id}/ws` (first message `{"type":"auth","token":…}`)
- `/api/photo-try-on/status` now also returns `configured` and per-item `checks`
- Product list items now include `fabric`, `fit_type`, `description`, `sizes`;
  garment-assets includes `verified_color`, `exact_color_match`

Migrations: `database/migrations/versions/0005_looks_and_fitting_rooms.py`
creates the wishlist, saved-look and fitting-room tables.
`database/migrations/versions/0008_restore_collaborative_rooms.py` repairs
databases whose migration stamp is ahead of their actual schema, without
recreating existing tables or discarding existing wishlist entries.

## Data fixes

- The seed pointed every product at `front.jpg`, which didn't exist. Photos are
  now matched by view prefix (`front*`, `fron*`, `side*`, `back*`) in
  `app/utils/product_images.py`; `run_seed` re-syncs an existing database.
- `static/garment-assets/colors.json` records which colour each generic
  `tryon.png` shows (checked by eye). Only that colour counts as an exact
  reference; other colours never get a substituted garment for CatVTON.

## Honesty and privacy rules enforced in code

- No ratings, review counts, stock counts or "popular" sorting are shown (seed
  values are placeholders). Checkout is labelled and worded as a demo.
- Results are labelled "Fit preview", "Fit preview · recoloured" or
  "AI generated". Printed colourways and large dark↔light recolours are
  refused instead of rendered.
- Photos and results live only in memory (`context/TryOnSessionContext.tsx`);
  object URLs are revoked on clear/replace/logout/unmount. Saved looks store
  product/colour/label/time only — the table has no image column.
- Room previews are shared only on an explicit action, validated, held in
  bounded memory (one per member, 3 MB each, 96 MB total, 30-min TTL), dropped
  on unshare/selection change/leave/close, and sent only over authenticated
  sockets. Invite codes are HMAC-derived (not stored), rotatable, rate-limited,
  and carried in the URL fragment.

## Known limitations

- CatVTON needs a local NVIDIA GPU (~8 GB VRAM); it was not run here.
- Only one colour per product has an exact garment reference.
- Photo-quality thresholds are heuristic, not validated on labelled data.
- The room hub is in-process: run one backend worker.
- Migration chain 0001–0004 is PostgreSQL-specific (0004 can't run on SQLite).
