from __future__ import annotations

import copy
import json
import os
import re
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

MAX_ASSETS_TOTAL_BYTES = int(os.getenv("MAX_ASSETS_TOTAL_BYTES", str(1024 * 1024 * 1024)))
MAX_PROJECTS = int(os.getenv("MAX_PROJECTS", "5000"))
MAX_CARDS = int(os.getenv("MAX_CARDS", "10000"))
MAX_METADATA_TOTAL_BYTES = int(os.getenv("MAX_METADATA_TOTAL_BYTES", str(256 * 1024 * 1024)))
MAX_PROJECT_BYTES = 256 * 1024
ASSET_URL = re.compile(r"^/api/media/draft/([A-Za-z0-9_-]{16,128})(?:\?edit_token=[A-Za-z0-9_-]{16,128})?$")


class QuotaExceeded(OSError):
    pass


class FileStorage:
    """Single-process JSON storage; use ONE uvicorn worker only."""

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
    def _serialize(data: dict[str, Any]) -> bytes:
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(payload) > MAX_PROJECT_BYTES:
            raise QuotaExceeded("Слишком большой проект")
        return payload

    @staticmethod
    def _write(path: Path, data: dict[str, Any]) -> None:
        # Atomic replace; temporary filename is unique for one-process serialized writes.
        payload = FileStorage._serialize(data)
        temp = path.with_suffix(".tmp")
        try:
            temp.write_bytes(payload)
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)

    def _metadata_size(self) -> int:
        return sum(p.stat().st_size for folder in (self.projects, self.cards, self.meta)
                   for p in folder.glob("*.json"))

    def _check_metadata(self, new_size: int, old_size: int = 0) -> None:
        if self._metadata_size() + new_size - old_size > MAX_METADATA_TOTAL_BYTES:
            raise QuotaExceeded("Общая квота проектов исчерпана")

    def create_project(self, token: str, project: dict[str, Any]) -> None:
        with self._lock:
            data = {"project": project, "createdAt": self.now()}
            size = len(self._serialize(data))
            if sum(1 for _ in self.projects.glob("*.json")) >= MAX_PROJECTS:
                raise QuotaExceeded("Достигнут лимит количества проектов")
            self._check_metadata(size)
            self._write(self.projects / f"{token}.json", data)

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
            self._check_metadata(len(self._serialize(data)), path.stat().st_size)
            self._write(path, data)
            return True

    def save_asset(self, asset_id: str, content: bytes, filename: str, media_type: str, owner: str | None = None) -> None:
        with self._lock:
            used = sum(item.stat().st_size for item in self.assets.iterdir() if item.is_file())
            if used + len(content) > MAX_ASSETS_TOTAL_BYTES:
                raise QuotaExceeded("Достигнута квота загрузок")
            metadata = {"filename": filename[:255], "mediaType": media_type, "createdAt": self.now(),
                        **({"owner": owner} if owner else {})}
            self._check_metadata(len(self._serialize(metadata)))
            path = self.assets / asset_id
            try:
                path.write_bytes(content)
                self._write(self.meta / f"{asset_id}.json", metadata)
            except Exception:
                path.unlink(missing_ok=True)
                (self.meta / f"{asset_id}.json").unlink(missing_ok=True)
                raise

    def get_asset(self, asset_id: str) -> tuple[Path, dict[str, Any]] | None:
        metadata = self._read(self.meta / f"{asset_id}.json")
        path = self.assets / asset_id
        return (path, metadata) if metadata and path.is_file() else None

    def allowed_assets(self, token: str, project: dict[str, Any], previous: dict[str, Any] | None = None) -> bool:
        """Legacy unowned assets allowed only when *already* referenced by this exact project.
        This avoids allowing other editors to newly claim unowned uploaded media IDs.
        """
        previous_ids = project_asset_ids(previous) if previous else set()
        for asset_id in project_asset_ids(project):
            asset = self.get_asset(asset_id)
            if asset is None:
                return False
            owner = asset[1].get("owner")
            if owner != token and (owner is not None or asset_id not in previous_ids):
                return False
        return True

    def publish(self, token: str, public_id: str, opens_at: datetime | None) -> bool:
        with self._lock:
            project = self.get_project(token)
            if project is None:
                return False
            if not self.allowed_assets(token, project, project):
                return False
            if sum(1 for _ in self.cards.glob("*.json")) >= MAX_CARDS:
                raise QuotaExceeded("Достигнут лимит опубликованных открыток")
            data = {"project": copy.deepcopy(project), "editOwner": token,
                    "opensAt": opens_at.isoformat() if opens_at else None, "createdAt": self.now()}
            self._check_metadata(len(self._serialize(data)))
            self._write(self.cards / f"{public_id}.json", data)
            return True

    def delete_project(self, token: str) -> bool:
        """Revoke editing, remove associated new-format publications and owned media.

        Legacy cards without editOwner cannot be reliably associated with their editor;
        see migration notes in INSTALL_RU.md.
        """
        with self._lock:
            project_path = self.projects / f"{token}.json"
            if not project_path.exists():
                return False
            for path in self.cards.glob("*.json"):
                obj = self._read(path)
                if obj and obj.get("editOwner") == token:
                    path.unlink(missing_ok=True)
            for path in self.meta.glob("*.json"):
                obj = self._read(path)
                if obj and obj.get("owner") == token:
                    (self.assets / path.stem).unlink(missing_ok=True)
                    path.unlink(missing_ok=True)
            project_path.unlink(missing_ok=True)
            return True

    def get_card(self, public_id: str) -> dict[str, Any] | None:
        return self._read(self.cards / f"{public_id}.json")

    @staticmethod
    def now() -> str:
        return datetime.now(UTC).isoformat()


def project_asset_ids(value: Any) -> set[str]:
    if isinstance(value, str):
        match = ASSET_URL.fullmatch(value)
        return {match.group(1)} if match else set()
    if isinstance(value, list):
        return set().union(*(project_asset_ids(item) for item in value)) if value else set()
    if isinstance(value, dict):
        return set().union(*(project_asset_ids(item) for item in value.values())) if value else set()
    return set()


def public_media_urls(value: Any, public_id: str) -> Any:
    if isinstance(value, str):
        match = ASSET_URL.fullmatch(value)
        return f"/api/media/cards/{public_id}/{match.group(1)}" if match else value
    if isinstance(value, list):
        return [public_media_urls(item, public_id) for item in value]
    if isinstance(value, dict):
        return {key: public_media_urls(item, public_id) for key, item in value.items()}
    return value


def private_media_urls(value: Any, edit_token: str = "") -> Any:
    """Remove legacy edit-token query parameters from API data returned to editors."""
    if isinstance(value, str):
        match = ASSET_URL.fullmatch(value)
        return f"/api/media/draft/{match.group(1)}" if match else value
    if isinstance(value, list):
        return [private_media_urls(item, edit_token) for item in value]
    if isinstance(value, dict):
        return {key: private_media_urls(item, edit_token) for key, item in value.items()}
    return value
