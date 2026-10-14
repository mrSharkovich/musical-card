"""Готовые маршруты FastAPI для каталога — предложение для бэкенда.

Подключение в backend/app/main.py (две строки + путь к папке db):

    import sys
    sys.path.append(str(FRONTEND_DIR / "db"))
    from catalog_routes import router as catalog_router
    app.include_router(catalog_router)

Маршруты:
    GET /api/catalog/music                       — подборка для панели «Аудио»
    GET /api/catalog/music/{id}/file             — аудиофайл трека (для kind = file)
    GET /api/catalog/templates                   — галерея шаблонов
    GET /api/catalog/templates/{slug}?format=4:5 — шаблон под формат холста
    GET /api/catalog/backgrounds                 — фоны для вкладки «Фоны»
    GET /api/catalog/backgrounds/{id}/file       — файл фона
    GET /api/catalog/stickers                    — картинки и стикеры для вкладки «Элементы»
    GET /api/catalog/stickers/{id}/file          — файл стикера
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

try:  # Поддерживает запуск как пакета и отдельный запуск прежних тестов.
    from .catalog import DB_DIR, Catalog
except ImportError:  # pragma: no cover
    from catalog import DB_DIR, Catalog


def create_router(catalog_dir: str | os.PathLike[str] | None = None,
                  media_dir: str | os.PathLike[str] | None = None) -> APIRouter:
    """Возвращает маршруты для уже подготовленного каталога."""
    router = APIRouter(prefix="/api/catalog", tags=["catalog"])
    catalog = Catalog(catalog_dir or os.getenv("CATALOG_DIR") or DB_DIR, media_dir=media_dir)

    # Каталог общий и меняется только при пересборке баз — его можно кэшировать в браузере.
    cache = {"Cache-Control": "public, max-age=3600"}
    def not_found() -> HTTPException:
        return HTTPException(status_code=404, detail="Ресурс не найден")

    @router.get("/music")
    def list_music() -> dict:
        return {"tracks": catalog.list_tracks()}


    @router.get("/music/{track_id}/file")
    def music_file(track_id: str) -> FileResponse:
        found = catalog.track_file(track_id)
        if not found:
            raise not_found()
        path, media_type = found
        return FileResponse(path, media_type=media_type, headers=cache, content_disposition_type="inline")


    @router.get("/templates")
    def list_templates() -> dict:
        return {"templates": catalog.list_templates()}


    @router.get("/templates/{slug}")
    def get_template(slug: str, format: str = Query("4:5", pattern=r"^(4:5|1:1|9:16|16:9)$")) -> dict:
        template = catalog.get_template(slug, format)
        if not template:
            raise not_found()
        return {"template": template}


    @router.get("/backgrounds")
    def list_backgrounds() -> dict:
        return {"backgrounds": catalog.list_backgrounds()}


    @router.get("/stickers")
    def list_stickers() -> dict:
        return {"stickers": catalog.list_stickers()}


    def send_media(table: str, media_id: str) -> FileResponse:
        found = catalog.media_file(table, media_id)
        if not found:
            raise not_found()
        path, media_type = found
        return FileResponse(path, media_type=media_type, headers=cache, content_disposition_type="inline")


    @router.get("/backgrounds/{media_id}/file")
    def background_file(media_id: str) -> FileResponse:
        return send_media("backgrounds", media_id)


    @router.get("/stickers/{media_id}/file")
    def sticker_file(media_id: str) -> FileResponse:
        return send_media("stickers", media_id)

    return router
