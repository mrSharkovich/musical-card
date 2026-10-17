"""Новое оформление «Почта»: шрифты, лицензии, отсутствие внешних ресурсов, новые поля проекта.

Эти тесты охраняют три вещи:
1. оформление не ослабляет защиту (CSP, заголовки, обход каталога);
2. каждый встроенный шрифт сопровождается своей лицензией и действительно подключён;
3. новые поля (duckMusic, шрифты hand/script/round) строго проверяются сервером.
"""
from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app import main
from app.schemas import TEXT_FONTS
from app.storage import FileStorage

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / "fonts"
STYLES = (ROOT / "styles.css").read_text(encoding="utf-8")
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
SOURCES = {path.name: path.read_text(encoding="utf-8") for path in (ROOT / "src").glob("*.js")}
EXPECTED_CSP = (
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; "
    "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'"
)


def project(**extra) -> dict:
    data = {"name": "Оформление", "format": "4:5", "bg": "#fffdf7", "elements": [], "voice": None, "music": None,
            "voiceVolume": 1, "musicVolume": 0.35}
    data.update(extra)
    return data


def text(font: str) -> dict:
    return {"id": "t-1", "type": "text", "x": 10, "y": 10, "w": 300, "h": 80, "text": "Привет", "font": font,
            "size": 40, "color": "#1f2a44", "align": "center"}


class DesignAssetsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        main.storage = FileStorage(Path(self.temp.name))
        main._requests.clear()
        self.client = TestClient(main.app)

    def tearDown(self) -> None:
        self.temp.cleanup()

    # --- Шрифты и их лицензии -------------------------------------------------
    def test_fonts_are_served_locally_with_security_headers(self) -> None:
        files = sorted(FONTS.glob("*.woff2"))
        self.assertTrue(files, "в /fonts должны лежать woff2-файлы")
        for path in files:
            response = self.client.get(f"/fonts/{path.name}")
            self.assertEqual(response.status_code, 200, path.name)
            self.assertEqual(response.headers["content-type"], "font/woff2")
            self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")
            self.assertEqual(response.headers["content-security-policy"], EXPECTED_CSP)
            self.assertIn("max-age", response.headers.get("cache-control", ""))
            self.assertTrue(response.content.startswith(b"wOF2"), f"{path.name} не является woff2")

    def test_every_font_file_is_used_and_every_reference_exists(self) -> None:
        referenced = set(re.findall(r"url\(/fonts/([A-Za-z0-9_.-]+\.woff2)\)", STYLES))
        on_disk = {path.name for path in FONTS.glob("*.woff2")}
        self.assertEqual(referenced, on_disk, "styles.css и папка fonts/ должны совпадать")
        for preload in re.findall(r'href="/fonts/([^"]+)"', INDEX):
            self.assertIn(preload, on_disk)

    def test_each_font_family_has_ofl_license_text(self) -> None:
        families = set(re.findall(r"font-family:\s*'([^']+)';", STYLES))
        self.assertEqual(families, {"Caveat", "Nunito", "Pacifico"})
        for family in families:
            licence = FONTS / "licenses" / f"{family}-OFL.txt"
            self.assertTrue(licence.is_file(), f"нет лицензии для {family}")
            body = licence.read_text(encoding="utf-8")
            self.assertIn("SIL OPEN FONT LICENSE Version 1.1", body)
            self.assertIn(f"The {family} Project Authors", body)
            self.assertNotIn("Reserved Font Name", body.splitlines()[0])
            response = self.client.get(f"/fonts/licenses/{family}-OFL.txt")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.headers["content-type"].startswith("text/plain"))

    def test_licenses_register_lists_fonts_and_original_artwork(self) -> None:
        register = (ROOT / "LICENSES.md").read_text(encoding="utf-8")
        for family in ("Caveat", "Nunito", "Pacifico"):
            self.assertIn(family, register)
        self.assertIn("OFL-1.1", register)
        self.assertIn("src/icons.js", register)

    def test_fonts_mount_does_not_allow_path_traversal(self) -> None:
        for path in ("/fonts/../backend/app/main.py", "/fonts/%2e%2e/backend/app/main.py", "/fonts/..%2fLICENSE"):
            response = self.client.get(path)
            self.assertNotEqual(response.status_code, 200, path)
            self.assertNotIn("FastAPI", response.text)

    # --- Нет внешних ресурсов и инлайн-скриптов -------------------------------
    def test_frontend_loads_nothing_from_other_origins(self) -> None:
        self.assertNotRegex(STYLES, r"url\(\s*['\"]?(?:https?:)?//", "CSS не должен грузить внешние файлы")
        self.assertNotIn("@import", STYLES)
        self.assertNotRegex(INDEX, r"(?:src|href)=\"(?:https?:)?//", "index.html только с того же origin")
        for name, source in SOURCES.items():
            self.assertNotRegex(source, r"fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr", name)
            self.assertNotRegex(source, r"import\s+[^;]*['\"]https?://", name)

    def test_no_inline_scripts_or_event_handlers(self) -> None:
        # CSP script-src 'self' блокирует такие конструкции — их не должно быть в разметке.
        self.assertNotRegex(INDEX, r"<script(?![^>]*\bsrc=)[^>]*>")
        for name, source in SOURCES.items():
            self.assertNotRegex(source, r"<[a-z][^>]*\son[a-z]+=\"", f"инлайн-обработчик в {name}")
            self.assertNotIn("javascript:", source, name)
            self.assertNotRegex(source, r"\beval\(|new Function\(", name)

    def test_csp_is_unchanged_on_pages_and_api(self) -> None:
        for path in ("/", "/styles.css", "/src/main.js", "/src/theme.js", "/api/catalog/templates"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertEqual(response.headers["content-security-policy"], EXPECTED_CSP, path)
            self.assertEqual(response.headers.get("x-frame-options"), "DENY", path)

    def test_new_frontend_modules_are_served(self) -> None:
        for name in ("icons.js", "theme.js", "themeToggle.js"):
            response = self.client.get(f"/src/{name}")
            self.assertEqual(response.status_code, 200, name)
            self.assertEqual(response.headers.get("cache-control"), "no-store")

    # --- Новые поля проекта ----------------------------------------------------
    def test_duck_music_defaults_to_false_for_old_projects(self) -> None:
        response = self.client.post("/api/projects", json={"project": project()})
        self.assertEqual(response.status_code, 201, response.text)
        saved = self.client.get(f"/api/projects/{response.json()['editToken']}").json()["project"]
        self.assertIs(saved["duckMusic"], False)

    def test_duck_music_round_trips_and_reaches_public_card(self) -> None:
        token = self.client.post("/api/projects", json={"project": project(duckMusic=True)}).json()["editToken"]
        self.assertIs(self.client.get(f"/api/projects/{token}").json()["project"]["duckMusic"], True)
        public_id = self.client.post(f"/api/projects/{token}/publish", json={"opensAt": None}).json()["publicId"]
        card = self.client.get(f"/api/cards/{public_id}").json()
        self.assertEqual(card["status"], "ready")
        self.assertIs(card["project"]["duckMusic"], True)

    def test_duck_music_must_be_a_real_boolean(self) -> None:
        for value in ("yes", "true", 1, 0, None, [], {}):
            response = self.client.post("/api/projects", json={"project": project(duckMusic=value)})
            self.assertEqual(response.status_code, 422, f"duckMusic={value!r}: {response.text}")

    def test_new_text_fonts_are_accepted(self) -> None:
        self.assertEqual(set(TEXT_FONTS), {"serif", "sans", "mono", "hand", "script", "round"})
        for font in TEXT_FONTS:
            response = self.client.post("/api/projects", json={"project": project(elements=[text(font)])})
            self.assertEqual(response.status_code, 201, f"{font}: {response.text}")

    def test_unknown_or_injected_fonts_are_rejected(self) -> None:
        for font in ("comic", "Caveat", "hand;background:url(//evil)", "serif'", "", 5):
            response = self.client.post("/api/projects", json={"project": project(elements=[text(font)])})
            self.assertEqual(response.status_code, 422, f"font={font!r}")


if __name__ == "__main__":
    unittest.main()
