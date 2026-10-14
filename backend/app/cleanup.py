"""Удаление устаревших данных MVP.

Запускается вручную или планировщиком: python -m app.cleanup --days 30
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .storage import FileStorage, project_asset_ids


def created_at(path: Path) -> datetime | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8")).get("createdAt")
        return datetime.fromisoformat(value).astimezone(UTC) if value else None
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def cleanup(root: Path, days: int, dry_run: bool = False) -> list[Path]:
    store = FileStorage(root)
    threshold = datetime.now(UTC) - timedelta(days=days)
    removed: list[Path] = []
    for directory in (store.projects, store.cards):
        for file in directory.glob("*.json"):
            timestamp = created_at(file)
            if timestamp and timestamp < threshold:
                removed.append(file)
                if not dry_run:
                    file.unlink()

    referenced: set[str] = set()
    for directory in (store.projects, store.cards):
        for file in directory.glob("*.json"):
            try:
                referenced.update(project_asset_ids(json.loads(file.read_text(encoding="utf-8")).get("project", {})))
            except (OSError, json.JSONDecodeError):
                continue
    for metadata in store.meta.glob("*.json"):
        asset_id = metadata.stem
        timestamp = created_at(metadata)
        if asset_id not in referenced and timestamp and timestamp < threshold:
            removed.extend([metadata, store.assets / asset_id])
            if not dry_run:
                metadata.unlink(missing_ok=True)
                (store.assets / asset_id).unlink(missing_ok=True)
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description="Очистка устаревших данных музыкальной открытки")
    parser.add_argument("--days", type=int, default=int(os.getenv("RETENTION_DAYS", "30")), help="срок хранения в днях")
    parser.add_argument("--dry-run", action="store_true", help="только показать кандидатов на удаление")
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days должен быть не меньше 1")
    root = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
    candidates = cleanup(root, args.days, args.dry_run)
    print(f"{'Найдено' if args.dry_run else 'Удалено'} объектов: {len(candidates)}")


if __name__ == "__main__":
    main()
