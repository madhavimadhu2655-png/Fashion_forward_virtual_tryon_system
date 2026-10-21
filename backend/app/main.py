import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.session import check_db_connection
from app.api import products, categories, auth, admin, body, photo_try_on, looks, rooms

app = FastAPI(title=settings.app_name)

# Milestone 1: wide-open CORS for local dev only.
# This gets locked down to specific origins in a later milestone.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serves generated placeholder product images (Milestone 3) and, later,
# real uploaded product photography.
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

app.include_router(products.router)
app.include_router(categories.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(body.router)
app.include_router(photo_try_on.router)
app.include_router(looks.router)
app.include_router(rooms.router)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api/") and "authorization" in request.headers:
        # Anything fetched with credentials is user-specific; never cache it.
        response.headers.setdefault("Cache-Control", "private, no-store")
    return response


@app.get("/api/health")
def health_check():
    db_ok = check_db_connection()
    return {
        "status": "ok",
        "database": "connected" if db_ok else "unreachable",
    }
