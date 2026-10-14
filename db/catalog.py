"""Чтение каталога музыки и шаблонов для бэкенда.

Только стандартная библиотека Python. Базы открываются в режиме «только чтение»:
каталог меняется через seeds/ и build.py, а не через API.

Пример:

    from catalog import Catalog
    catalog = Catalog()                       # базы в папке db/ рядом с этим файлом
    catalog.list_tracks()                     # подборка для панели «Аудио»
    catalog.list_templates()                  # галерея шаблонов
    catalog.get_template("bloom", "9:16")     # шаблон под формат холста
    catalog.list_backgrounds()                # фоны для вкладки «Фоны»
    catalog.list_stickers()                   # картинки и стикеры для вкладки «Элементы»
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any


DB_DIR = Path(__file__).resolve().parent
FORMATS = ("4:5", "1:1", "9:16", "16:9")
# Префикс в src элемента шаблона → таблица и часть URL
MEDIA_TABLES = {"background": "backgrounds", "sticker": "stickers"}


class Catalog:
    def __init__(self, db_dir: Path | str = DB_DIR, media_dir: Path | str | None = None,
                 url_prefix: str = "/api/catalog") -> None:
        self.db_dir = Path(db_dir)
        self.media_dir = Path(media_dir) if media_dir else self.db_dir / "media"
        self.url_prefix = url_prefix.rstrip("/")
        for name in ("music.sqlite", "templates.sqlite"):
            if not (self.db_dir / name).is_file():
                raise FileNotFoundError(f"Нет {self.db_dir / name}. Соберите базы: python db/build.py")

    @contextmanager
    def _connect(self, name: str):
        # Новое соединение на каждый запрос: FastAPI выполняет обработчики в разных потоках.
        conn = sqlite3.connect(f"file:{self.db_dir / name}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _media_path(self, relative: str) -> Path | None:
        """Возвращает файл только если он действительно внутри папки media."""
        path = (self.media_dir / relative).resolve()
        if self.media_dir.resolve() not in path.parents or not path.is_file():
            return None
        return path

    # ----------------------------------------------------------------- музыка

    def _track(self, row: sqlite3.Row) -> dict[str, Any]:
        track = {
            "id": row["id"],
            "name": row["title"],
            "artist": row["artist"],
            "kind": row["kind"],
            "durationSec": row["duration_sec"],
            "moods": json.loads(row["moods"]),
            "occasions": json.loads(row["occasions"]),
            "hasVocals": bool(row["has_vocals"]),
            "credit": row["attribution_text"],
            "license": row["license_code"],
            "licenseUrl": row["license_url"],
            "commercialUse": bool(row["commercial_use"]),
        }
        if row["kind"] == "synth":
            track["notes"] = json.loads(row["notes"])
        else:
            track["src"] = f"{self.url_prefix}/music/{row['id']}/file"
        return track

    _TRACK_SQL = ("SELECT t.*, l.url AS license_url, l.commercial_use FROM tracks t "
                  "JOIN licenses l ON l.code = t.license_code WHERE t.status = 'active'")

    def list_tracks(self) -> list[dict[str, Any]]:
        with self._connect("music.sqlite") as conn:
            rows = conn.execute(self._TRACK_SQL + " ORDER BY t.sort_order, t.title").fetchall()
        return [self._track(row) for row in rows]

    def get_track(self, track_id: str) -> dict[str, Any] | None:
        with self._connect("music.sqlite") as conn:
            row = conn.execute(self._TRACK_SQL + " AND t.id = ?", (track_id,)).fetchone()
        return self._track(row) if row else None

    def track_file(self, track_id: str) -> tuple[Path, str] | None:
        """(путь к файлу, MIME-тип) для активного трека с файлом, иначе None."""
        with self._connect("music.sqlite") as conn:
            row = conn.execute("SELECT media_path, mime_type FROM tracks "
                               "WHERE id = ? AND kind = 'file' AND status = 'active'", (track_id,)).fetchone()
        if not row:
            return None
        path = self._media_path(row["media_path"])
        return (path, row["mime_type"]) if path else None

    @staticmethod
    def project_music(track: dict[str, Any]) -> dict[str, Any]:
        """Значение для project.music, которое понимает src/audio.js."""
        music = {"key": track["id"], "name": track["name"]}
        if "src" in track:
            music["src"] = track["src"]
        return music

    # ---------------------------------------------------------------- шаблоны

    def list_templates(self) -> list[dict[str, Any]]:
        """Галерея: поля id, name, bg, decoration — как массив templates в src/model.js."""
        with self._connect("templates.sqlite") as conn:
            rows = conn.execute(
                "SELECT slug, title, preview_bg, decoration, tags FROM templates "
                "WHERE status = 'active' ORDER BY sort_order, title").fetchall()
        return [{
            "id": row["slug"],
            "name": row["title"],
            "bg": row["preview_bg"],
            "decoration": row["decoration"],
            "tags": json.loads(row["tags"]),
        } for row in rows]

    def get_template(self, slug: str, fmt: str = "4:5") -> dict[str, Any] | None:
        """Оформление под формат: { bg, elements, defaultMusic, credits }.

        Фронтенд кладёт bg и elements в свой проект вместо applyTemplate().
        """
        if fmt not in FORMATS:
            return None
        with self._connect("templates.sqlite") as conn:
            row = conn.execute(
                "SELECT v.bg, v.elements, t.default_track_id FROM template_variants v "
                "JOIN templates t ON t.slug = v.template_slug "
                "WHERE t.slug = ? AND v.format = ? AND t.status = 'active'", (slug, fmt)).fetchone()
            if not row:
                return None
            elements = json.loads(row["elements"])
            # Картинки каталога хранятся как background:<id> / sticker:<id>; наружу отдаём URL,
            # а для картинок, которые требуют указания автора, собираем подписи.
            credits = []
            for element in elements:
                src = element.get("src")
                if not (isinstance(src, str) and ":" in src):
                    continue
                prefix, media_id = src.split(":", 1)
                if prefix not in MEDIA_TABLES:
                    continue
                table = MEDIA_TABLES[prefix]
                element["src"] = f"{self.url_prefix}/{table}/{media_id}/file"
                credit = conn.execute(
                    f"SELECT m.title, m.author, m.attribution_text, l.code AS license_code, l.url AS license_url "
                    f"FROM {table} m JOIN licenses l ON l.code = m.license_code "
                    "WHERE m.id = ? AND l.requires_attribution = 1", (media_id,)).fetchone()
                if credit and dict(credit) not in credits:
                    credits.append(dict(credit))

        track = self.get_track(row["default_track_id"]) if row["default_track_id"] else None
        return {
            "id": slug,
            "format": fmt,
            "bg": row["bg"],
            "elements": elements,
            "defaultMusic": self.project_music(track) if track else None,
            "credits": credits,
        }

    # ------------------------------------------------------- фоны и стикеры

    def _media_item(self, table: str, row: sqlite3.Row) -> dict[str, Any]:
        item = {
            "id": row["id"],
            "name": row["title"],
            "src": f"{self.url_prefix}/{table}/{row['id']}/file",
            "width": row["width"],
            "height": row["height"],
            "tags": json.loads(row["tags"]),
            "occasions": json.loads(row["occasions"]),
            "credit": row["attribution_text"],
            "author": row["author"],
            "license": row["license_code"],
            "licenseUrl": row["license_url"],
            "commercialUse": bool(row["commercial_use"]),
        }
        if table == "backgrounds":
            item["avgColor"] = row["avg_color"]
            item["isDark"] = bool(row["is_dark"])
        else:
            width = row["default_width"]
            item["defaultSize"] = {"w": width, "h": round(width * row["height"] / row["width"])}
            item["hasTransparency"] = bool(row["has_transparency"])
        return item

    def _list_media(self, table: str) -> list[dict[str, Any]]:
        with self._connect("templates.sqlite") as conn:
            rows = conn.execute(
                f"SELECT m.*, l.url AS license_url, l.commercial_use FROM {table} m "
                "JOIN licenses l ON l.code = m.license_code "
                "WHERE m.status = 'active' ORDER BY m.sort_order, m.title").fetchall()
        return [self._media_item(table, row) for row in rows]

    def list_backgrounds(self) -> list[dict[str, Any]]:
        """Фоны для вкладки «Фоны». В редакторе фон — элемент image на весь холст:
        { type: "image", x: 0, y: 0, w: 800, h: <высота формата>, src }."""
        return self._list_media("backgrounds")

    def list_stickers(self) -> list[dict[str, Any]]:
        """Картинки и стикеры для вкладки «Элементы»; defaultSize — размер при добавлении."""
        return self._list_media("stickers")

    def media_file(self, table: str, media_id: str) -> tuple[Path, str] | None:
        """(путь к файлу, MIME-тип) для активного фона или стикера, иначе None."""
        if table not in MEDIA_TABLES.values():
            return None
        with self._connect("templates.sqlite") as conn:
            row = conn.execute(f"SELECT media_path, mime_type FROM {table} "
                               "WHERE id = ? AND status = 'active'", (media_id,)).fetchone()
        if not row:
            return None
        path = self._media_path(row["media_path"])
        return (path, row["mime_type"]) if path else None
