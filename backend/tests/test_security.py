from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from app import main
from app.storage import FileStorage


class SecurityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        main.storage = FileStorage(Path(self.temp.name))
        main._requests.clear()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.temp.cleanup()

    def test_reject_oversized_upload(self):
        huge = b"ID3" + b"0" * (15 * 1024 * 1024 + 1)
        owner = self.client.post("/api/projects", json={"project": {
            "name": "Test", "format": "4:5", "bg": "#ffffff", "elements": []
        }}).json()["editToken"]
        response = self.client.post("/api/assets", data={"edit_token": owner}, files={"file": ("large.mp3", huge, "audio/mpeg")})
        self.assertEqual(response.status_code, 413)

    def test_reject_oversized_json(self):
        response = self.client.post("/api/projects", content=b" " * (16 * 1024 * 1024), headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)

    def test_rejects_external_and_script_image_sources(self):
        token = self.client.post("/api/projects", json={"project": {"name":"x", "format":"4:5", "bg":"#ffffff", "elements":[]}}).json()["editToken"]
        for value in ("javascript:alert(1)", "https://example.com/p.png", "data:image/svg+xml,<svg/>"):
            image = {"id":"image1", "type":"image", "x":0, "y":0, "w":100, "h":100, "src":value}
            response = self.client.put(f"/api/projects/{token}", json={"project": {"name":"x", "format":"4:5", "bg":"#ffffff", "elements":[image]}})
            self.assertEqual(response.status_code, 422, value)

    def test_rejects_invalid_numbers_and_points(self):
        token = self.client.post("/api/projects", json={"project": {"name":"x", "format":"4:5", "bg":"#ffffff", "elements":[]}}).json()["editToken"]
        objects = [
            {"id":"draw1", "type":"draw", "x":0, "y":0, "w":100, "h":100, "points":[["bad", 1]]},
            {"id":"text1", "type":"text", "x":0, "y":0, "w":-10, "h":100, "text":"hello"},
            {"id":"text1", "type":"text", "x":0, "y":0, "w":100, "h":100, "color":"red;position:absolute", "text":"hello"},
        ]
        for obj in objects:
            response = self.client.put(f"/api/projects/{token}", json={"project": {"name":"x", "format":"4:5", "bg":"#ffffff", "elements":[obj]}})
            self.assertEqual(response.status_code, 422, response.text)

    def test_csp_and_hidden_docs(self):
        response = self.client.get("/")
        self.assertIn("default-src 'self'", response.headers["content-security-policy"])
        self.assertEqual(self.client.get("/docs").status_code, 404)

    def test_security_headers(self):
        response = self.client.get("/")
        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(response.headers.get("referrer-policy"), "no-referrer")
