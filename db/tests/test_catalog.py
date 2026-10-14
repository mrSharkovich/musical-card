"""Проверки каталога. Запуск из корня репозитория:

    python -m unittest discover -s db/tests -v

Тест маршрутов запускается, только если установлен FastAPI (окружение бэкенда).
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


DB_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DB_DIR))

from catalog import Catalog  # noqa: E402


class CatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.temp.name)
        result = subprocess.run([sys.executable, str(DB_DIR / "build.py"), "--out", str(cls.out)],
                                capture_output=True, text=True, encoding="utf-8", errors="replace")
        assert result.returncode == 0, result.stderr
        cls.catalog = Catalog(cls.out, media_dir=DB_DIR / "media")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def writable(self, name: str) -> sqlite3.Connection:
        copy = self.out / f"copy-{self._testMethodName}-{name}"
        shutil.copy(self.out / name, copy)
        conn = sqlite3.connect(copy)
        conn.execute("PRAGMA foreign_keys = ON")
        self.addCleanup(conn.close)
        return conn

    # --- содержимое

    def test_builtin_melodies_are_available(self) -> None:
        tracks = self.catalog.list_tracks()
        self.assertEqual([t["id"] for t in tracks][:3], ["gentle", "festive", "dream"])
        self.assertEqual(self.catalog.project_music(tracks[0]), {"key": "gentle", "name": "Нежная мелодия"})

    def test_file_tracks_have_existing_files_and_credits(self) -> None:
        for track in self.catalog.list_tracks():
            if track["kind"] != "file":
                continue
            path, media_type = self.catalog.track_file(track["id"])
            self.assertTrue(path.is_file())
            self.assertTrue(media_type.startswith("audio/"))
            self.assertEqual(track["src"], f"/api/catalog/music/{track['id']}/file")
            self.assertEqual(self.catalog.project_music(track)["src"], track["src"])
            if track["license"].startswith("CC-BY"):
                self.assertTrue(track["credit"])

    def test_template_for_every_format(self) -> None:
        heights = {"4:5": 1000, "1:1": 800, "9:16": 1422, "16:9": 450}
        for fmt, height in heights.items():
            template = self.catalog.get_template("bloom", fmt)
            self.assertEqual(len(template["elements"]), 5)
            self.assertAlmostEqual(template["elements"][2]["y"], height * 0.26, places=1)
        self.assertEqual(self.catalog.get_template("blank", "1:1")["elements"], [])
        self.assertIsNone(self.catalog.get_template("bloom", "3:2"))
        self.assertIsNone(self.catalog.get_template("missing", "4:5"))

    def test_gallery_matches_frontend_shape(self) -> None:
        gallery = self.catalog.list_templates()
        self.assertEqual([t["id"] for t in gallery][:4], ["blank", "bloom", "love", "cheer"])
        self.assertGreaterEqual(len(gallery), 4)
        self.assertTrue({"id", "name", "bg", "decoration"} <= set(gallery[0]))

    def test_backgrounds_and_stickers(self) -> None:
        backgrounds = self.catalog.list_backgrounds()
        stickers = self.catalog.list_stickers()
        self.assertTrue(backgrounds and stickers)
        for item in backgrounds:
            self.assertEqual(item["src"], f"/api/catalog/backgrounds/{item['id']}/file")
            self.assertRegex(item["avgColor"], r"^#[0-9a-f]{6}$")
            path, media_type = self.catalog.media_file("backgrounds", item["id"])
            self.assertTrue(path.is_file() and media_type.startswith("image/"))
        for item in stickers:
            self.assertEqual(item["src"], f"/api/catalog/stickers/{item['id']}/file")
            self.assertGreater(item["defaultSize"]["h"], 0)
            self.assertIsNotNone(self.catalog.media_file("stickers", item["id"]))
        # фон нельзя запросить как стикер и наоборот
        self.assertIsNone(self.catalog.media_file("stickers", backgrounds[0]["id"]))
        self.assertIsNone(self.catalog.media_file("tracks", backgrounds[0]["id"]))

    def build_with_template(self, elements: list[dict]) -> subprocess.CompletedProcess:
        seeds = Path(tempfile.mkdtemp(dir=self.out))
        shutil.copytree(DB_DIR / "seeds", seeds, dirs_exist_ok=True)
        data = json.loads((seeds / "templates.json").read_text(encoding="utf-8"))
        data["templates"].append({"slug": "space", "title": "Космос", "preview_bg": "#000000",
                                  "bg": "#000000", "status": "active", "elements": elements})
        (seeds / "templates.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        out = Path(tempfile.mkdtemp(dir=self.out))
        result = subprocess.run([sys.executable, str(DB_DIR / "build.py"), "--seeds", str(seeds), "--out", str(out)],
                                capture_output=True, text=True, encoding="utf-8", errors="replace")
        result.out = out
        return result

    def test_template_can_use_catalog_images(self) -> None:
        result = self.build_with_template([
            {"type": "image", "x": 0, "y": 0, "w": 800, "yRatio": 0, "h": 1000, "src": "background:hurricane-isabel"},
            {"type": "image", "x": 190, "yRatio": 0.3, "w": 420, "h": 280, "src": "sticker:happy-new-year-confetti"},
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        template = Catalog(result.out, media_dir=DB_DIR / "media").get_template("space", "9:16")
        self.assertEqual(template["elements"][0]["src"], "/api/catalog/backgrounds/hurricane-isabel/file")
        self.assertEqual(template["elements"][1]["src"], "/api/catalog/stickers/happy-new-year-confetti/file")
        self.assertEqual(template["credits"], [])  # оба материала — общественное достояние / CC0

    def test_template_credits_come_from_its_images(self) -> None:
        result = self.build_with_template([
            {"type": "image", "x": 0, "y": 0, "w": 800, "h": 1000, "src": "background:poppy-field"},
            {"type": "image", "x": 300, "y": 300, "w": 180, "h": 180, "src": "sticker:openmoji-heart"},
            {"type": "image", "x": 500, "y": 300, "w": 180, "h": 180, "src": "sticker:openmoji-heart"},
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        credits = Catalog(result.out, media_dir=DB_DIR / "media").get_template("space", "1:1")["credits"]
        self.assertEqual(sorted(c["license_code"] for c in credits), ["CC-BY-SA-4.0", "CC-BY-SA-4.0"])
        self.assertTrue(all(c["attribution_text"] for c in credits))

    def test_template_with_draft_image_fails(self) -> None:
        result = self.build_with_template([
            {"type": "image", "x": 0, "y": 0, "w": 800, "h": 1000, "src": "background:hubble-ultra-deep-field"}])
        self.assertNotEqual(result.returncode, 0)

    def test_template_with_unknown_image_fails(self) -> None:
        result = self.build_with_template([
            {"type": "image", "x": 0, "y": 0, "w": 100, "h": 100, "src": "sticker:no-such-sticker"}])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no-such-sticker", result.stderr)

    # --- защита лицензий

    def test_unknown_license_is_rejected(self) -> None:
        conn = self.writable("music.sqlite")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO tracks (id, title, artist, kind, notes, license_code, attribution_text, source_name) "
                         "VALUES ('nc', 'NC', 'X', 'synth', '[440]', 'CC-BY-NC-4.0', 'X', 'own')")

    def test_catalog_has_no_noncommercial_material(self) -> None:
        items = self.catalog.list_tracks() + self.catalog.list_backgrounds() + self.catalog.list_stickers()
        self.assertTrue(items)
        self.assertEqual([i["id"] for i in items if not i["commercialUse"]], [])
        with sqlite3.connect(self.out / "music.sqlite") as conn:
            codes = [row[0] for row in conn.execute("SELECT code FROM licenses")]
        conn.close()
        self.assertFalse([code for code in codes if "NC" in code])

    def test_attribution_is_required(self) -> None:
        conn = self.writable("music.sqlite")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "attribution_text"):
            conn.execute("INSERT INTO tracks (id, title, artist, kind, notes, license_code, source_name) "
                         "VALUES ('by', 'BY', 'X', 'synth', '[440]', 'CC-BY-4.0', 'own')")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "attribution_text"):
            conn.execute("UPDATE tracks SET attribution_text = '' WHERE id = 'gentle'")

    def test_external_track_needs_proof_before_active(self) -> None:
        conn = self.writable("music.sqlite")
        sql = ("INSERT INTO tracks (id, title, artist, kind, media_path, mime_type, license_code, "
               "attribution_text, source_name, source_url, verified_at, status, license_proof_path) "
               "VALUES ('ext', 'T', 'A', 'file', 'music/t.mp3', 'audio/mpeg', 'CC0-1.0', NULL, "
               "'Free Music Archive', 'https://example.org/t', '2026-10-14', 'active', ?)")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute(sql, (None,))
        conn.execute(sql, ("licenses/t.png",))

    def test_template_elements_must_be_json_array(self) -> None:
        conn = self.writable("templates.sqlite")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("UPDATE template_variants SET elements = '{\"a\":1}' WHERE template_slug = 'bloom'")

    # --- безопасность файлов

    def test_media_path_cannot_escape_media_dir(self) -> None:
        conn = self.writable("music.sqlite")
        conn.execute("INSERT INTO tracks (id, title, artist, kind, media_path, mime_type, license_code, "
                     "source_name, verified_at, status) VALUES ('evil', 'E', 'E', 'file', '../build.py', "
                     "'audio/mpeg', 'CC0-1.0', 'own', '2026-10-14', 'active')")
        conn.commit()
        conn.close()
        target = self.out / "evil"
        target.mkdir()
        shutil.copy(self.out / "copy-test_media_path_cannot_escape_media_dir-music.sqlite", target / "music.sqlite")
        shutil.copy(self.out / "templates.sqlite", target / "templates.sqlite")
        catalog = Catalog(target, media_dir=DB_DIR / "media")
        self.assertIsNotNone(catalog.get_track("evil"))
        self.assertIsNone(catalog.track_file("evil"))


try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except ImportError:  # окружение без FastAPI
    FastAPI = None


@unittest.skipIf(FastAPI is None, "FastAPI не установлен")
class RoutesTest(unittest.TestCase):
    def test_routes(self) -> None:
        from catalog_routes import create_router
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            result = subprocess.run([sys.executable, str(DB_DIR / "build.py"), "--out", str(out)],
                                    capture_output=True, text=True, encoding="utf-8", errors="replace")
            self.assertEqual(result.returncode, 0, result.stderr)
            router = create_router(out, media_dir=DB_DIR / "media")
            app = FastAPI()
            app.include_router(router)
            client = TestClient(app)
            tracks = client.get("/api/catalog/music").json()["tracks"]
            self.assertGreaterEqual(len(tracks), 3)
            piano = client.get("/api/catalog/music/green-streaks-in-the-sky/file")
            self.assertEqual(piano.status_code, 200)
            self.assertEqual(piano.headers["content-type"], "audio/mpeg")
            self.assertGreaterEqual(len(client.get("/api/catalog/templates").json()["templates"]), 4)
            body = client.get("/api/catalog/templates/cheer", params={"format": "16:9"}).json()["template"]
            self.assertEqual(body["bg"], "#dff2e9")
            self.assertEqual(client.get("/api/catalog/templates/cheer", params={"format": "2:1"}).status_code, 422)
            self.assertEqual(client.get("/api/catalog/music/gentle/file").status_code, 404)
            backgrounds = client.get("/api/catalog/backgrounds").json()["backgrounds"]
            stickers = client.get("/api/catalog/stickers").json()["stickers"]
            image = client.get(backgrounds[0]["src"])
            self.assertEqual(image.status_code, 200)
            self.assertTrue(image.headers["content-type"].startswith("image/"))
            self.assertEqual(client.get(stickers[0]["src"]).status_code, 200)
            self.assertEqual(client.get(f"/api/catalog/stickers/{backgrounds[0]['id']}/file").status_code, 404)


if __name__ == "__main__":
    unittest.main()
