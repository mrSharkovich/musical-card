"""Собирает две базы каталога из файлов в db/seeds:

    db/music.sqlite      — музыкальная подборка
    db/templates.sqlite  — шаблоны открыток, фоны и стикеры

Запуск из корня репозитория:

    python db/build.py

Нужен только Python 3.11+ — сторонние библиотеки не используются.
Базы каждый раз пересобираются с нуля, поэтому правки вносятся
в seeds/*.csv и seeds/templates.json, а не в сами .sqlite-файлы.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path


DB_DIR = Path(__file__).resolve().parent
SCHEMA_DIR = DB_DIR / "schema"
SEEDS_DIR = DB_DIR / "seeds"
MEDIA_DIR = DB_DIR / "media"

# Совпадает с formats из src/model.js: ширина холста всегда 800.
CANVAS_WIDTH = 800
FORMATS = {"4:5": 1000, "1:1": 800, "9:16": 1422, "16:9": 450}
ELEMENT_TYPES = {"text", "shape", "image", "draw"}

LICENSE_INT_FIELDS = {"requires_attribution", "commercial_use"}
TRACK_INT_FIELDS = {"duration_sec", "has_vocals", "sort_order"}
BACKGROUND_INT_FIELDS = {"width", "height", "is_dark", "sort_order"}
STICKER_INT_FIELDS = {"width", "height", "has_transparency", "default_width", "sort_order"}
# Как картинка из каталога записывается в элементе шаблона: "src": "<префикс>:<id>"
MEDIA_PREFIXES = {"background": "backgrounds", "sticker": "stickers"}


class BuildError(Exception):
    pass


def read_csv(name: str, int_fields: set[str] = frozenset()) -> list[dict]:
    """Читает CSV; пустые ячейки превращаются в NULL, числовые — в int."""
    rows = []
    with open(SEEDS_DIR / name, encoding="utf-8-sig", newline="") as file:
        for line_no, row in enumerate(csv.DictReader(file), start=2):
            clean = {}
            for key, value in row.items():
                value = (value or "").strip()
                if value == "":
                    clean[key] = None
                elif key in int_fields:
                    try:
                        clean[key] = int(value)
                    except ValueError as error:
                        raise BuildError(f"{name}, строка {line_no}: поле {key} должно быть числом") from error
                else:
                    clean[key] = value
            clean["_line"] = line_no
            rows.append(clean)
    return rows


def insert(conn: sqlite3.Connection, table: str, row: dict, where: str) -> None:
    data = {key: value for key, value in row.items() if not key.startswith("_") and value is not None}
    columns = ", ".join(data)
    marks = ", ".join("?" for _ in data)
    try:
        conn.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", list(data.values()))
    except sqlite3.DatabaseError as error:
        raise BuildError(f"{where}: {error}") from error


def media_file(relative: str | None, where: str) -> None:
    """Проверяет, что файл лежит внутри db/media и существует."""
    if relative is None:
        return
    path = (MEDIA_DIR / relative).resolve()
    if MEDIA_DIR.resolve() not in path.parents:
        raise BuildError(f"{where}: путь {relative!r} выходит за пределы db/media")
    if not path.is_file():
        raise BuildError(f"{where}: файл db/media/{relative} не найден")


def new_database(path: Path, schema_files: list[str]) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    for name in schema_files:
        conn.executescript((SCHEMA_DIR / name).read_text(encoding="utf-8"))
    for row in read_csv("licenses.csv", LICENSE_INT_FIELDS):
        insert(conn, "licenses", row, f"licenses.csv, строка {row['_line']}")
    return conn


def noncommercial_licenses() -> set[str]:
    return {row["code"] for row in read_csv("licenses.csv", LICENSE_INT_FIELDS) if row["commercial_use"] == 0}


def build_music(path: Path, skip_licenses: set[str]) -> set[str]:
    conn = new_database(path, ["common.sql", "music.sql"])
    track_ids = set()
    for row in read_csv("tracks.csv", TRACK_INT_FIELDS):
        where = f"tracks.csv, строка {row['_line']} ({row.get('id')})"
        if row.get("license_code") in skip_licenses:
            print(f"  пропущен (некоммерческая лицензия): {row.get('id')}")
            continue
        media_file(row.get("media_path"), where)
        media_file(row.get("license_proof_path"), where)
        insert(conn, "tracks", row, where)
        track_ids.add(row["id"])
    finish(conn)
    return track_ids


def number(value, where: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BuildError(f"{where}: ожидается число, получено {value!r}")
    return value


def layout_elements(slug: str, elements: list[dict], height: int) -> list[dict]:
    """Переводит yRatio/hRatio (доли высоты холста) в пиксели для конкретного формата,
    как applyTemplate во фронтенде. Фон на весь холст: "yRatio": 0, "hRatio": 1."""
    result = []
    for index, source in enumerate(elements, start=1):
        where = f"templates.json, шаблон {slug}, элемент {index}"
        element = dict(source)
        if element.get("type") not in ELEMENT_TYPES:
            raise BuildError(f"{where}: неизвестный type {element.get('type')!r}")
        element.setdefault("id", f"{slug}-{index}")
        if "yRatio" in element:
            element["y"] = round(number(element.pop("yRatio"), where) * height, 2)
        if "hRatio" in element:
            element["h"] = round(number(element.pop("hRatio"), where) * height, 2)
        if element["type"] == "text" and "h" not in element:
            element["h"] = number(element.get("size"), where) * 2
        for field in ("x", "y", "w", "h"):
            number(element.get(field), f"{where}, поле {field}")
        if element["x"] + element["w"] > CANVAS_WIDTH or element["y"] > height:
            print(f"  предупреждение: {where} выходит за край холста в формате высотой {height}")
        # Порядок ключей как во фронтенде: id и type первыми — так удобнее читать JSON.
        result.append({"id": element.pop("id"), "type": element.pop("type"), **element})
    return result


def build_templates(path: Path, track_ids: set[str], skip_licenses: set[str]) -> None:
    conn = new_database(path, ["common.sql", "templates.sql"])
    data = json.loads((SEEDS_DIR / "templates.json").read_text(encoding="utf-8"))

    media_ids: dict[str, set[str]] = {}      # все картинки из CSV
    active_ids: dict[str, set[str]] = {}     # только проверенные (status = active)
    for table, int_fields in (("backgrounds", BACKGROUND_INT_FIELDS), ("stickers", STICKER_INT_FIELDS)):
        media_ids[table], active_ids[table] = set(), set()
        for row in read_csv(f"{table}.csv", int_fields):
            where = f"{table}.csv, строка {row['_line']} ({row.get('id')})"
            if row.get("license_code") in skip_licenses:
                print(f"  пропущена (некоммерческая лицензия): {row.get('id')}")
                continue
            media_file(row.get("media_path"), where)
            media_file(row.get("license_proof_path"), where)
            insert(conn, table, row, where)
            media_ids[table].add(row["id"])
            if row.get("status") == "active":
                active_ids[table].add(row["id"])

    for template in data["templates"]:
        slug = template.get("slug")
        where = f"templates.json, шаблон {slug}"
        track = template.get("default_track_id")
        if track is not None and track not in track_ids:
            raise BuildError(f"{where}: трек {track!r} не найден в tracks.csv")
        row = {key: template.get(key) for key in (
            "slug", "title", "preview_bg", "decoration",
            "default_track_id", "author", "license_code", "status", "sort_order")}
        row["tags"] = json.dumps(template.get("tags", []), ensure_ascii=False)
        insert(conn, "templates", row, where)

        for fmt, height in FORMATS.items():
            # "layouts": {"16:9": [...]} — своя раскладка для формата, где общая не помещается
            source = template.get("layouts", {}).get(fmt, template.get("elements", []))
            elements = layout_elements(slug, source, height)
            insert(conn, "template_variants", {
                "template_slug": slug,
                "format": fmt,
                "bg": template.get("bg", template.get("preview_bg")),
                "elements": json.dumps(elements, ensure_ascii=False, separators=(",", ":")),
            }, f"{where}, формат {fmt}")

        # Картинки каталога в элементах шаблона ("src": "background:<id>" / "sticker:<id>"):
        # картинка должна быть в CSV, а у активного шаблона — ещё и проверена.
        all_elements = list(template.get("elements", []))
        for extra in template.get("layouts", {}).values():
            all_elements += extra
        for element in all_elements:
            src = element.get("src")
            if not (isinstance(src, str) and ":" in src):
                continue
            prefix, media_id = src.split(":", 1)
            table = MEDIA_PREFIXES.get(prefix)
            if table is None:
                continue
            if media_id not in media_ids[table]:
                raise BuildError(f"{where}: {prefix} {media_id!r} не найден в {table}.csv")
            if template.get("status") == "active" and media_id not in active_ids[table]:
                raise BuildError(f"{where}: активный шаблон использует непроверенные картинки: {prefix} {media_id!r}")

    finish(conn)


def finish(conn: sqlite3.Connection) -> None:
    broken = conn.execute("PRAGMA foreign_key_check").fetchall()
    if broken:
        raise BuildError(f"Нарушены внешние ключи: {broken}")
    conn.commit()
    conn.execute("VACUUM")
    conn.close()


def main() -> int:
    global SEEDS_DIR
    parser = argparse.ArgumentParser(description="Собрать music.sqlite и templates.sqlite")
    parser.add_argument("--out", type=Path, default=DB_DIR, help="папка для готовых баз (по умолчанию db/)")
    parser.add_argument("--seeds", type=Path, default=SEEDS_DIR, help="папка с данными (по умолчанию db/seeds/)")
    parser.add_argument("--commercial-only", action="store_true",
                        help="не включать материалы с некоммерческими (NC) лицензиями")
    args = parser.parse_args()
    SEEDS_DIR = args.seeds
    args.out.mkdir(parents=True, exist_ok=True)

    # Собираем во временные файлы и заменяем готовые базы, только если всё прошло без ошибок.
    with tempfile.TemporaryDirectory(dir=args.out) as temp:
        music_tmp, templates_tmp = Path(temp) / "music.sqlite", Path(temp) / "templates.sqlite"
        try:
            skip = noncommercial_licenses() if args.commercial_only else set()
            track_ids = build_music(music_tmp, skip)
            build_templates(templates_tmp, track_ids, skip)
        except (BuildError, json.JSONDecodeError, KeyError) as error:
            print(f"Ошибка: {error}", file=sys.stderr)
            return 1
        os.replace(music_tmp, args.out / "music.sqlite")
        os.replace(templates_tmp, args.out / "templates.sqlite")

    for name in ("music.sqlite", "templates.sqlite"):
        conn = sqlite3.connect(args.out / name)
        tables = [row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        counts = ", ".join(f"{t}: {conn.execute(f'SELECT count(*) FROM {t}').fetchone()[0]}" for t in tables)
        conn.close()
        print(f"{name} — {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
