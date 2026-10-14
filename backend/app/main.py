from __future__ import annotations

import os
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .files import validate_upload
from .schemas import EditTokenResponse, OkResponse, ProjectRequest, PublicIdResponse, PublishRequest
from .storage import FileStorage, project_asset_ids, public_media_urls


BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
storage = FileStorage(DATA_DIR)

app = FastAPI(title="Музыкальная открытка API", version="0.1.0")
origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type"])

_requests: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    """Простой in-memory лимит для MVP; при нескольких процессах заменяется Redis."""
    host = request.client.host if request.client else "unknown"
    key = f"{host}:{request.url.path.split('/')[2] if request.url.path.startswith('/api/') else ''}"
    now = time.monotonic()
    timestamps = _requests[key]
    while timestamps and timestamps[0] <= now - 60:
        timestamps.popleft()
    if len(timestamps) >= 120:
        return JSONResponse(status_code=429, content={"detail": "Слишком много запросов. Повторите позднее."})
    timestamps.append(now)
    return await call_next(request)


def token() -> str:
    return secrets.token_urlsafe(32)


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


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/projects", response_model=EditTokenResponse, status_code=201)
def create_project(body: ProjectRequest) -> dict[str, str]:
    edit_token = token()
    storage.create_project(edit_token, body.project.model_dump(mode="json"))
    return {"editToken": edit_token}


@app.get("/api/projects/{edit_token}")
def get_project(edit_token: str) -> dict:
    project = storage.get_project(edit_token)
    if project is None:
        raise not_found()
    return {"project": project}


@app.put("/api/projects/{edit_token}", response_model=OkResponse)
def save_project(edit_token: str, body: ProjectRequest) -> dict[str, bool]:
    if not storage.save_project(edit_token, body.project.model_dump(mode="json")):
        raise not_found()
    return {"ok": True}


@app.post("/api/assets", status_code=201)
async def upload_asset(file: UploadFile = File(...)) -> dict[str, str]:
    content = await file.read()
    try:
        kind = validate_upload(content)
    except ValueError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    asset_id = token()
    storage.save_asset(asset_id, content, file.filename or "upload", kind.media_type)
    return {"url": f"/api/media/draft/{asset_id}"}


@app.get("/api/media/draft/{asset_id}")
def get_draft_asset(asset_id: str):
    asset = storage.get_asset(asset_id)
    if asset is None:
        raise not_found()
    path, metadata = asset
    return FileResponse(path, media_type=metadata["mediaType"], content_disposition_type="inline")


@app.post("/api/projects/{edit_token}/publish", response_model=PublicIdResponse)
def publish_project(edit_token: str, body: PublishRequest) -> dict[str, str]:
    opens_at = utc_datetime(body.opensAt)
    if opens_at is not None and opens_at <= datetime.now(UTC):
        raise HTTPException(status_code=422, detail="Время открытия должно быть в будущем")
    public_id = token()
    if not storage.publish(edit_token, public_id, opens_at):
        raise not_found()
    return {"publicId": public_id}


@app.get("/api/cards/{public_id}")
def get_card(public_id: str) -> dict:
    card = storage.get_card(public_id)
    if card is None:
        raise not_found()
    if not is_open(card):
        return {"status": "scheduled", "opensAt": card["opensAt"]}
    return {"status": "ready", "project": public_media_urls(card["project"], public_id)}


@app.get("/api/media/cards/{public_id}/{asset_id}")
def get_card_asset(public_id: str, asset_id: str):
    card = storage.get_card(public_id)
    if card is None or not is_open(card) or asset_id not in project_asset_ids(card["project"]):
        raise not_found()
    asset = storage.get_asset(asset_id)
    if asset is None:
        raise not_found()
    path, metadata = asset
    return FileResponse(path, media_type=metadata["mediaType"], content_disposition_type="inline")


# Роуты фронтенда подключаются после API: /api/* всегда обрабатывается сервером,
# а браузер получает страницу и ES-модули с того же origin.
app.mount("/src", StaticFiles(directory=FRONTEND_DIR / "src"), name="frontend-src")


@app.get("/styles.css", include_in_schema=False)
def frontend_styles() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "styles.css", media_type="text/css")


@app.get("/", include_in_schema=False)
def frontend_index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html", media_type="text/html")
