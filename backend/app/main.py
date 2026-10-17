from __future__ import annotations

import mimetypes
import os
import secrets
import sys
import time
from collections import defaultdict, deque
import threading
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .files import MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, validate_upload
from .schemas import EditTokenResponse, OkResponse, ProjectRequest, PublicIdResponse, PublishRequest
from .storage import FileStorage, QuotaExceeded, project_asset_ids, public_media_urls, private_media_urls


BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
storage = FileStorage(DATA_DIR)

# Каталог находится в корне проекта, а сервер может запускаться из backend/.
if str(FRONTEND_DIR) not in sys.path:
    sys.path.insert(0, str(FRONTEND_DIR))
from db.build import build_catalog
from db.catalog_routes import create_router
from db.catalog import Catalog

CATALOG_DIR = Path(os.getenv("CATALOG_DIR", FRONTEND_DIR / "db"))


def ensure_catalog() -> None:
    """Пересобирает каталог после обновления его исходных данных из Git."""
    required = (CATALOG_DIR / "music.sqlite", CATALOG_DIR / "templates.sqlite")
    sources = [FRONTEND_DIR / "db" / "build.py"]
    sources += list((FRONTEND_DIR / "db" / "seeds").rglob("*"))
    sources += list((FRONTEND_DIR / "db" / "schema").rglob("*"))
    newest_source = max(path.stat().st_mtime for path in sources if path.is_file())
    if all(path.is_file() for path in required) and min(path.stat().st_mtime for path in required) >= newest_source:
        return
    if build_catalog(CATALOG_DIR):
        raise RuntimeError("Не удалось собрать каталог материалов из db/seeds")

# Reject oversized request bodies while streaming, before Starlette parses multipart.
# Allow a little multipart overhead around the maximum supported audio file.
MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 256 * 1024
MAX_PROJECT_REQUEST_BYTES = 300 * 1024


class RequestSizeLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = 0
        path = scope.get("path", "")
        allowed = MAX_PROJECT_REQUEST_BYTES if path == "/api/projects" or path.startswith("/api/projects/") else MAX_REQUEST_BYTES
        if declared > allowed:
            response = JSONResponse({"detail": "Запрос слишком большой"}, status_code=413)
            return await response(scope, receive, send)
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > allowed:
                    raise RequestTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestTooLarge:
            # This fallback catches chunked requests without Content-Length.
            response = JSONResponse({"detail": "Запрос слишком большой"}, status_code=413)
            await response(scope, receive, send)


class RequestTooLarge(Exception):
    pass


app = FastAPI(title="Музыкальная открытка API", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)
ensure_catalog()
app.add_middleware(RequestSizeLimitMiddleware)
app.include_router(create_router(CATALOG_DIR))
catalog = Catalog(CATALOG_DIR)
trusted_hosts = [h.strip() for h in os.getenv("TRUSTED_HOSTS", "testserver,localhost,127.0.0.1,192.168.1.102").split(",") if h.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)
origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type", "X-Edit-Token"])

# Bounded in-memory rate limiting; deploy with ONE worker and proxy protections.
_requests: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = threading.Lock()
_last_prune = 0.0
MAX_RATE_KEYS = 10000


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    global _last_prune
    host = request.client.host if request.client else "unknown"
    route = request.scope.get("path", "")  # Never derive security decisions from Host.
    if route == "/api/assets" and request.method == "POST":
        bucket, limit = "upload", 5
    elif route == "/api/projects" and request.method == "POST":
        bucket, limit = "create", 15
    elif route.startswith("/api/projects/") and route.endswith("/publish"):
        bucket, limit = "publish", 10
    else:
        bucket, limit = "general", 120
    now = time.monotonic()
    with _rate_lock:
        if now - _last_prune >= 60 or len(_requests) > MAX_RATE_KEYS:
            for key in list(_requests):
                queue = _requests[key]
                while queue and queue[0] <= now - 60:
                    queue.popleft()
                if not queue:
                    del _requests[key]
            _last_prune = now
        if len(_requests) >= MAX_RATE_KEYS and f"{host}:all" not in _requests:
            return JSONResponse(status_code=429, content={"detail": "Лимит запросов"})
        # General cap applies to *all* endpoint groups, not just unknown routes.
        keys = [(f"{host}:all", 120), (f"{host}:{bucket}", limit)] if bucket != "general" else [(f"{host}:all", 120)]
        for key, allowance in keys:
            queue = _requests[key]
            while queue and queue[0] <= now - 60:
                queue.popleft()
            if len(queue) >= allowance:
                return JSONResponse(status_code=429, content={"detail": "Слишком много запросов. Повторите позднее."})
        for key, _ in keys:
            _requests[key].append(now)
    return await call_next(request)


def token() -> str:
    return secrets.token_urlsafe(32)


def valid_id(value: str) -> bool:
    return bool(__import__("re").fullmatch(r"[A-Za-z0-9_-]{16,128}", value))

def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Ресурс не найден")


def utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        raise HTTPException(status_code=422, detail="Время открытия должно содержать часовой пояс")
    return value.astimezone(UTC)


def is_open(card: dict) -> bool:
    opens_at = card.get("opensAt")
    if not opens_at:
        return True
    return datetime.now(UTC) >= datetime.fromisoformat(opens_at).astimezone(UTC)


def card_credits(project: dict) -> list[dict[str, str]]:
    """Derive attributions from trusted catalog, not user-supplied HTML."""
    used = {e.get("src") for e in project.get("elements", []) if e.get("type") == "image"}
    music = project.get("music") or {}
    used.add(music.get("src"))
    resources = catalog.list_tracks() + catalog.list_backgrounds() + catalog.list_stickers()
    result, seen = [], set()
    for resource in resources:
        credit = resource.get("credit")
        if resource.get("src") in used and credit and resource.get("license") not in ("CC0-1.0", "PD"):
            key = (credit, resource.get("licenseUrl"))
            if key not in seen:
                seen.add(key)
                result.append({"text": credit, "license": resource.get("license", ""),
                               "licenseUrl": resource.get("licenseUrl") or "",
                               "sourceUrl": resource.get("sourceUrl") or ""})
    return result


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/projects", response_model=EditTokenResponse, status_code=201)
def create_project(body: ProjectRequest) -> dict[str, str]:
    edit_token = token()
    data = body.project.model_dump(mode="json")
    if project_asset_ids(data):
        raise HTTPException(status_code=422, detail="Нельзя прикрепить чужие файлы при создании проекта")
    try:
        storage.create_project(edit_token, data)
    except QuotaExceeded as error:
        raise HTTPException(status_code=507, detail=str(error)) from error
    return {"editToken": edit_token}


@app.get("/api/projects/{edit_token}")
def get_project(edit_token: str) -> dict:
    if not valid_id(edit_token):
        raise not_found()
    project = storage.get_project(edit_token)
    if project is None:
        raise not_found()
    return {"project": private_media_urls(project, edit_token)}


@app.put("/api/projects/{edit_token}", response_model=OkResponse)
def save_project(edit_token: str, body: ProjectRequest) -> dict[str, bool]:
    if not valid_id(edit_token):
        raise not_found()
    existing = storage.get_project(edit_token)
    if existing is None:
        raise not_found()
    data = private_media_urls(body.project.model_dump(mode="json"))
    if not storage.allowed_assets(edit_token, data, existing):
        raise HTTPException(status_code=422, detail="Файл не принадлежит этому проекту")
    try:
        if not storage.save_project(edit_token, data):
            raise not_found()
    except QuotaExceeded as error:
        raise HTTPException(status_code=507, detail=str(error)) from error
    return {"ok": True}


@app.delete("/api/projects/{edit_token}", response_model=OkResponse)
def delete_project(edit_token: str) -> dict[str, bool]:
    if not valid_id(edit_token) or not storage.delete_project(edit_token):
        raise not_found()
    return {"ok": True}


@app.post("/api/assets", status_code=201)
async def upload_asset(file: UploadFile = File(...), edit_token: str = Form(...)) -> dict[str, str]:
    if not valid_id(edit_token) or storage.get_project(edit_token) is None:
        raise not_found()
    # Never read an untrusted upload into memory without an explicit bound.
    limit = max(MAX_IMAGE_BYTES, MAX_AUDIO_BYTES)
    chunks = []
    total = 0
    while chunk := await file.read(256 * 1024):
        total += len(chunk)
        if total > limit:
            raise HTTPException(status_code=413, detail="Файл слишком большой")
        chunks.append(chunk)
    content = b"".join(chunks)
    try:
        kind = validate_upload(content)
    except ValueError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    asset_id = token()
    try:
        storage.save_asset(asset_id, content, file.filename or "upload", kind.media_type, owner=edit_token)
    except OSError as error:
        raise HTTPException(status_code=507, detail="Недостаточно места для загрузки") from error
    return {"url": f"/api/media/draft/{asset_id}"}


@app.get("/api/media/draft/{asset_id}")
def get_draft_asset(asset_id: str, request: Request):
    edit_token = request.headers.get("x-edit-token", "")
    # Draft URLs are private even when someone knows the opaque asset ID.
    project = storage.get_project(edit_token) if valid_id(edit_token) else None
    if project is None:
        raise not_found()
    if not valid_id(asset_id):
        raise not_found()
    asset = storage.get_asset(asset_id)
    if asset is None:
        raise not_found()
    path, metadata = asset
    owner = metadata.get("owner")
    # Compatibility: old uploads had no owner metadata. Only allow them when
    # the supplied edit token belongs to a project referencing the asset.
    if owner != edit_token and (owner is not None or asset_id not in project_asset_ids(project)):
        raise not_found()
    return FileResponse(path, media_type=metadata["mediaType"], content_disposition_type="inline", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@app.post("/api/projects/{edit_token}/publish", response_model=PublicIdResponse)
def publish_project(edit_token: str, body: PublishRequest) -> dict[str, str]:
    if not valid_id(edit_token):
        raise not_found()
    opens_at = utc_datetime(body.opensAt)
    if opens_at is not None and opens_at <= datetime.now(UTC):
        raise HTTPException(status_code=422, detail="Время открытия должно быть в будущем")
    public_id = token()
    try:
        if not storage.publish(edit_token, public_id, opens_at):
            raise not_found()
    except QuotaExceeded as error:
        raise HTTPException(status_code=507, detail=str(error)) from error
    return {"publicId": public_id}


@app.get("/api/cards/{public_id}")
def get_card(public_id: str) -> dict:
    if not valid_id(public_id):
        raise not_found()
    card = storage.get_card(public_id)
    if card is None:
        raise not_found()
    if not is_open(card):
        return {"status": "scheduled", "opensAt": card["opensAt"]}
    return {"status": "ready", "project": public_media_urls(card["project"], public_id), "credits": card_credits(card["project"])}


@app.get("/api/media/cards/{public_id}/{asset_id}")
def get_card_asset(public_id: str, asset_id: str):
    if not valid_id(public_id):
        raise not_found()
    card = storage.get_card(public_id)
    if card is None or not is_open(card) or asset_id not in project_asset_ids(card["project"]):
        raise not_found()
    if not valid_id(asset_id):
        raise not_found()
    asset = storage.get_asset(asset_id)
    if asset is None:
        raise not_found()
    path, metadata = asset
    # Published cards made before this migration lack editOwner. They must be
    # re-published via their edit link; do not guess ownership from asset IDs.
    edit_owner = card.get("editOwner")
    if not edit_owner or metadata.get("owner") not in (None, edit_owner):
        raise not_found()
    return FileResponse(path, media_type=metadata["mediaType"], content_disposition_type="inline", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


# Роуты фронтенда подключаются после API: /api/* всегда обрабатывается сервером,
# а браузер получает страницу и ES-модули с того же origin.
app.mount("/src", StaticFiles(directory=FRONTEND_DIR / "src"), name="frontend-src")
# Локальные шрифты (SIL OFL 1.1) — тот же origin, поэтому CSP не ослабляется.
# Тип задаётся явно: реестр Windows может переопределять таблицу mimetypes.
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("text/plain", ".txt")
app.mount("/fonts", StaticFiles(directory=FRONTEND_DIR / "fonts"), name="frontend-fonts")


@app.get("/styles.css", include_in_schema=False)
def frontend_styles() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "styles.css", media_type="text/css")


@app.get("/", include_in_schema=False)
def frontend_index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html", media_type="text/html")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "geolocation=(), payment=()"
    response.headers["Content-Security-Policy"] = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'"
    if request.scope.get("path", "") in ("/", "/styles.css") or request.scope.get("path", "").startswith(("/src/", "/api/projects/", "/api/cards/", "/api/media/draft/")):
        response.headers["Cache-Control"] = "no-store"
    elif request.scope.get("path", "").startswith("/fonts/") and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=604800"
    return response


@app.get("/LICENSES.md", include_in_schema=False)
def license_notice():
    return FileResponse(FRONTEND_DIR / "LICENSES.md", media_type="text/plain; charset=utf-8")


@app.get("/LICENSE", include_in_schema=False)
def project_license():
    return FileResponse(FRONTEND_DIR / "LICENSE", media_type="text/plain; charset=utf-8")
