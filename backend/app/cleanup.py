"""Safe opt-in data cleanup. Dry-run is mandatory before scheduling deletion.

python -m backend.app.cleanup --days 30 --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .storage import FileStorage, project_asset_ids


def _read(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        return None


def _date(value: str | None) -> datetime | None:
    try:
        value = datetime.fromisoformat(value) if value else None
        return value.astimezone(UTC) if value else None
    except (TypeError, ValueError):
        return None


def cleanup(root: Path, days: int, dry_run: bool = False) -> list[Path]:
    if days < 1:
        raise ValueError("Период должен быть не менее одного дня")
    store = FileStorage(root)
    now = datetime.now(UTC)
    threshold = now - timedelta(days=days)
    removed = []
    protected_editors = set()
    card_candidates = set()
    for path in store.cards.glob("*.json"):
        obj = _read(path)
        if obj is None:  # Never delete malformed data automatically.
            continue
        created = _date(obj.get("createdAt"))
        opens = _date(obj.get("opensAt"))
        # Do not delete BEFORE scheduled reveal, even for a 1+ year wait.
        expiry_base = max((d for d in (created, opens) if d), default=None)
        if expiry_base and expiry_base < threshold:
            card_candidates.add(path)
        else:
            if obj.get("editOwner"):
                protected_editors.add(obj["editOwner"])
    for path in card_candidates:
        removed.append(path)
        if not dry_run:
            path.unlink(missing_ok=True)
    for path in store.projects.glob("*.json"):
        obj = _read(path)
        if not obj or path.stem in protected_editors:
            continue
        created = _date(obj.get("createdAt"))
        if created and created < threshold:
            removed.append(path)
            if not dry_run:
                path.unlink(missing_ok=True)

    referenced: set[str] = set()
    for directory in (store.projects, store.cards):
        for path in directory.glob("*.json"):
            if path in removed:
                continue
            obj = _read(path)
            if obj is None:
                # Invalid JSON => stop asset GC; don't accidentally delete files.
                return removed
            referenced.update(project_asset_ids(obj.get("project", {})))
    for path in store.meta.glob("*.json"):
        obj = _read(path)
        if obj is None:
            continue
        created = _date(obj.get("createdAt"))
        if path.stem not in referenced and created and created < threshold:
            removed.extend((path, store.assets / path.stem))
            if not dry_run:
                path.unlink(missing_ok=True)
                (store.assets / path.stem).unlink(missing_ok=True)
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description="Очистка старых проектов и файлов")
    parser.add_argument("--days", type=int, default=int(os.getenv("RETENTION_DAYS", "30")))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
    result = cleanup(root, args.days, args.dry_run)
    print(f"{'Найдено' if args.dry_run else 'Удалено'} объектов: {len(result)}")


if __name__ == "__main__":
    main()
