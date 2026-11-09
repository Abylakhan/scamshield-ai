import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .database import init_db
from .routers import analyze, dashboard, history

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("scamshield")
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    log.info("ScamShield AI started (AI provider: %s)", settings.active_ai_provider or "disabled — heuristic mode")
    yield


app = FastAPI(
    title="ScamShield AI API",
    version="1.0.0",
    description="AI-assisted scam, phishing and fraud analysis for Kazakhstan (kk / ru / en).",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"],
)


CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; "
       "base-uri 'none'; frame-ancestors 'none'; form-action 'self'")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    # Call Guard needs the microphone on our own origin; everything else stays off.
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):  # Swagger UI loads its assets from a CDN
        resp.headers.setdefault("Content-Security-Policy", CSP)
    return resp


@app.exception_handler(RequestValidationError)
async def validation_handler(_req: Request, exc: RequestValidationError):
    errors = [{"field": "body" if e.get("type") == "json_invalid" else ".".join(str(p) for p in e["loc"][1:]),
               "message": e["msg"].removeprefix("Value error, ")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Invalid input", "errors": errors})


@app.exception_handler(StarletteHTTPException)
async def http_handler(_req: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(SQLAlchemyError)
async def db_handler(_req: Request, exc: SQLAlchemyError):
    log.error("Database error: %s", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "The scan database is temporarily unavailable. Please try again."})


@app.exception_handler(Exception)
async def unhandled(_req: Request, exc: Exception):
    log.exception("Unhandled error: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"detail": "Internal error. The analysis could not be completed."})


app.include_router(analyze.router)
app.include_router(history.router)
app.include_router(dashboard.router)


@app.get("/api/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "version": app.version,
        "ai_provider": {"enabled": settings.ai_enabled, "provider": settings.active_ai_provider, "model": settings.active_ai_model},
        "checks": {
            "url_fetch": settings.enable_url_fetch,
            "domain_age_rdap": settings.enable_domain_age,
            "google_safe_browsing": bool(settings.google_safe_browsing_api_key),
            "virustotal": bool(settings.virustotal_api_key),
        },
    }


# Serve the built frontend (frontend/dist) when present, so a single process can run the whole app.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        f = (_dist / path).resolve()
        if path and f.is_file() and _dist in f.parents:
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
