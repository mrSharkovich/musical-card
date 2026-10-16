from __future__ import annotations

import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from io import BytesIO

from app import main
from app.storage import FileStorage


def project(name: str = "Тестовая открытка", image_url: str | None = None) -> dict:
    elements = []
    if image_url:
        elements.append({"id": "picture-1", "type": "image", "x": 0, "y": 0, "w": 100, "h": 100, "src": image_url})
    return {
        "name": name,
        "format": "4:5",
        "bg": "#fce8f2",
        "elements": elements,
        "voice": None,
        "music": None,
        "voiceVolume": 1,
        "musicVolume": 0.35,
    }


def valid_png():
    buffer = BytesIO()
    Image.new("RGB", (2, 2), "#fa1177").save(buffer, format="PNG")
    return buffer.getvalue()


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        main.storage = FileStorage(Path(self.temp.name))
        main._requests.clear()
        self.client = TestClient(main.app)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def create(self, data: dict) -> str:
        response = self.client.post("/api/projects", json={"project": data})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["editToken"]

    def test_frontend_is_served_by_api_server(self) -> None:
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertIn("Музыкальная открытка", self.client.get("/").text)
        self.assertEqual(self.client.get("/styles.css").status_code, 200)
        self.assertEqual(self.client.get("/src/main.js").status_code, 200)

    def test_catalog_is_available(self) -> None:
        templates = self.client.get("/api/catalog/templates")
        self.assertEqual(templates.status_code, 200)
        self.assertTrue(templates.json()["templates"])
        music = self.client.get("/api/catalog/music")
        self.assertEqual(music.status_code, 200)
        self.assertTrue(music.json()["tracks"])

    def test_project_can_be_created_and_saved(self) -> None:
        token = self.create(project())
        self.assertEqual(self.client.get(f"/api/projects/{token}").json()["project"]["name"], "Тестовая открытка")
        updated = project("Новое имя")
        self.assertEqual(self.client.put(f"/api/projects/{token}", json={"project": updated}).status_code, 200)
        self.assertEqual(self.client.get(f"/api/projects/{token}").json()["project"]["name"], "Новое имя")

    def test_publish_is_snapshot(self) -> None:
        token = self.create(project("До публикации"))
        public_id = self.client.post(f"/api/projects/{token}/publish", json={"opensAt": None}).json()["publicId"]
        self.client.put(f"/api/projects/{token}", json={"project": project("После публикации")})
        card = self.client.get(f"/api/cards/{public_id}").json()
        self.assertEqual(card["status"], "ready")
        self.assertEqual(card["project"]["name"], "До публикации")

    def test_scheduled_card_hides_project_and_media(self) -> None:
        png = valid_png()
        owner = self.create(project())
        upload = self.client.post("/api/assets", data={"edit_token": owner}, files={"file": ("gift.png", png, "image/png")})
        self.assertEqual(upload.status_code, 201, upload.text)
        future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        token = owner
        self.assertEqual(self.client.put(f"/api/projects/{token}", json={"project": project(image_url=upload.json()["url"])}).status_code, 200)
        public_id = self.client.post(f"/api/projects/{token}/publish", json={"opensAt": future}).json()["publicId"]
        card = self.client.get(f"/api/cards/{public_id}")
        self.assertEqual(card.json()["status"], "scheduled")
        asset_id = upload.json()["url"].rsplit("/", 1)[1]
        self.assertEqual(self.client.get(f"/api/media/cards/{public_id}/{asset_id}").status_code, 404)

    def test_ready_card_uses_protected_public_media_url(self) -> None:
        png = valid_png()
        owner = self.create(project())
        asset_url = self.client.post("/api/assets", data={"edit_token": owner}, files={"file": ("gift.png", png, "image/png")}).json()["url"]
        token = owner
        self.assertEqual(self.client.put(f"/api/projects/{token}", json={"project": project(image_url=asset_url)}).status_code, 200)
        public_id = self.client.post(f"/api/projects/{token}/publish", json={"opensAt": None}).json()["publicId"]
        ready = self.client.get(f"/api/cards/{public_id}").json()
        returned_url = ready["project"]["elements"][0]["src"]
        self.assertIn(f"/api/media/cards/{public_id}/", returned_url)
        self.assertEqual(self.client.get(returned_url).status_code, 200)

    def test_draft_media_requires_correct_editor_token(self) -> None:
        owner = self.create(project())
        other = self.create(project())
        upload = self.client.post("/api/assets", data={"edit_token": owner},
                                  files={"file": ("gift.png", valid_png(), "image/png")})
        self.assertEqual(upload.status_code, 201, upload.text)
        url = upload.json()["url"]
        self.assertNotIn("edit_token", url)
        bare = url
        self.assertEqual(self.client.get(bare).status_code, 404)
        self.assertEqual(self.client.get(bare, headers={"X-Edit-Token": other}).status_code, 404)
        self.assertEqual(self.client.get(bare, headers={"X-Edit-Token": owner}).status_code, 200)
        self.assertEqual(self.client.get(f"{bare}?edit_token={owner}").status_code, 404)

    def test_legacy_assets_need_project_edit_token(self) -> None:
        owner = self.create(project())
        other = self.create(project())
        legacy_id = "legacyasset123456789"
        main.storage.save_asset(legacy_id, b"\x89PNG\r\n\x1a\n", "old.png", "image/png")
        legacy_url = f"/api/media/draft/{legacy_id}"
        data = project(image_url=legacy_url)
        # Simulate pre-migration projects already referencing unowned assets.
        main.storage.save_project(owner, data)
        self.assertEqual(self.client.put(f"/api/projects/{owner}", json={"project": data}).status_code, 200)
        self.assertEqual(self.client.get(legacy_url).status_code, 404)
        self.assertEqual(self.client.get(f"{legacy_url}?edit_token={other}").status_code, 404)
        updated = self.client.get(f"/api/projects/{owner}").json()["project"]["elements"][0]["src"]
        self.assertNotIn("edit_token=", updated)
        self.assertEqual(self.client.get(updated, headers={"X-Edit-Token": owner}).status_code, 200)
        public_id = self.client.post(f"/api/projects/{owner}/publish", json={"opensAt": None}).json()["publicId"]
        self.assertEqual(self.client.get(f"/api/media/cards/{public_id}/{legacy_id}").status_code, 200)

    def test_rejects_svg_disguised_as_image(self) -> None:
        owner = self.create(project())
        response = self.client.post("/api/assets", data={"edit_token": owner}, files={"file": ("unsafe.png", b"<svg></svg>", "image/png")})
        self.assertEqual(response.status_code, 415)

    def test_rate_limit_returns_429(self) -> None:
        for _ in range(120):
            self.assertEqual(self.client.get("/api/health").status_code, 200)
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["detail"], "Слишком много запросов. Повторите позднее.")


if __name__ == "__main__":
    unittest.main()
