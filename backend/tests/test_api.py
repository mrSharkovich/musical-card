from __future__ import annotations

import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

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


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        main.storage = FileStorage(Path(self.temp.name))
        self.client = TestClient(main.app)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def create(self, data: dict) -> str:
        response = self.client.post("/api/projects", json={"project": data})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["editToken"]

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
        png = b"\x89PNG\r\n\x1a\n" + b"test"
        upload = self.client.post("/api/assets", files={"file": ("gift.png", png, "image/png")})
        self.assertEqual(upload.status_code, 201, upload.text)
        future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        token = self.create(project(image_url=upload.json()["url"]))
        public_id = self.client.post(f"/api/projects/{token}/publish", json={"opensAt": future}).json()["publicId"]
        card = self.client.get(f"/api/cards/{public_id}")
        self.assertEqual(card.json()["status"], "scheduled")
        asset_id = upload.json()["url"].rsplit("/", 1)[1]
        self.assertEqual(self.client.get(f"/api/media/cards/{public_id}/{asset_id}").status_code, 404)

    def test_ready_card_uses_protected_public_media_url(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"test"
        asset_url = self.client.post("/api/assets", files={"file": ("gift.png", png, "image/png")}).json()["url"]
        token = self.create(project(image_url=asset_url))
        public_id = self.client.post(f"/api/projects/{token}/publish", json={"opensAt": None}).json()["publicId"]
        ready = self.client.get(f"/api/cards/{public_id}").json()
        returned_url = ready["project"]["elements"][0]["src"]
        self.assertIn(f"/api/media/cards/{public_id}/", returned_url)
        self.assertEqual(self.client.get(returned_url).status_code, 200)

    def test_rejects_svg_disguised_as_image(self) -> None:
        response = self.client.post("/api/assets", files={"file": ("unsafe.png", b"<svg></svg>", "image/png")})
        self.assertEqual(response.status_code, 415)


if __name__ == "__main__":
    unittest.main()
