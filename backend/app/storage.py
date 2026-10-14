from __future__ import annotations

import copy
import json
import os
import re
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


ASSET_URL = re.compile(r"^/api/media/draft/([A-Za-z0-9_-]{16,})$")


class FileStorage:
    """Небольшое файловое хранилище для MVP; не предназначено для нескольких процессов."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.projects = root / "projects"
        self.cards = root / "cards"
        self.assets = root / "assets"
        self.meta = root / "asset-meta"
        self._lock = threading.RLock()
        for directory in (self.projects, self.cards, self.assets, self.meta):
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _read(path: Path) -> dict[str, Any] | None:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    @staticmethod
    def _write(path: Path, data: dict[str, Any]) -> None:
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(temp, path)

    def create_project(self, token: str, project: dict[str, Any]) -> None:
        with self._lock:
            self._write(self.projects / f"{token}.json", {"project": project, "createdAt": self.now()})

    def get_project(self, token: str) -> dict[str, Any] | None:
        data = self._read(self.projects / f"{token}.json")
        return data["project"] if data else None

    def save_project(self, token: str, project: dict[str, Any]) -> bool:
        with self._lock:
            path = self.projects / f"{token}.json"
            data = self._read(path)
            if not data:
                return False
            data["project"] = project
            data["updatedAt"] = self.now()
            self._write(path, data)
            return True

    def save_asset(self, asset_id: str, content: bytes, filename: str, media_type: str) -> None:
        with self._lock:
            (self.assets / asset_id).write_bytes(content)
            self._write(self.meta / f"{asset_id}.json", {"filename": filename, "mediaType": media_type, "createdAt": self.now()})

    def get_asset(self, asset_id: str) -> tuple[Path, dict[str, Any]] | None:
        metadata = self._read(self.meta / f"{asset_id}.json")
        path = self.assets / asset_id
        return (path, metadata) if metadata and path.is_file() else None

    def publish(self, token: str, public_id: str, opens_at: datetime | None) -> bool:
        with self._lock:
            project = self.get_project(token)
            if project is None:
                return False
            self._write(self.cards / f"{public_id}.json", {
                "project": copy.deepcopy(project),
                "opensAt": opens_at.isoformat() if opens_at else None,
                "createdAt": self.now(),
            })
            return True

    def get_card(self, public_id: str) -> dict[str, Any] | None:
        return self._read(self.cards / f"{public_id}.json")

    @staticmethod
    def now() -> str:
        return datetime.now(UTC).isoformat()


def project_asset_ids(value: Any) -> set[str]:
    """Возвращает только файлы, реально упомянутые в проекте."""
    if isinstance(value, str):
        match = ASSET_URL.fullmatch(value)
        return {match.group(1)} if match else set()
    if isinstance(value, list):
        return set().union(*(project_asset_ids(item) for item in value)) if value else set()
    if isinstance(value, dict):
        return set().union(*(project_asset_ids(item) for item in value.values())) if value else set()
    return set()


def public_media_urls(value: Any, public_id: str) -> Any:
    """Не раскрывает черновые URL файлов в ответе для получателя."""
    if isinstance(value, str):
        match = ASSET_URL.fullmatch(value)
        return f"/api/media/cards/{public_id}/{match.group(1)}" if match else value
    if isinstance(value, list):
        return [public_media_urls(item, public_id) for item in value]
    if isinstance(value, dict):
        return {key: public_media_urls(item, public_id) for key, item in value.items()}
    return value
