"""Regression: catalog templates must match the strict project API schema."""
from __future__ import annotations

import json
import tempfile
import shutil
import subprocess
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from app import main
from app.storage import FileStorage
from app.schemas import ProjectRequest

ROOT = Path(__file__).resolve().parents[2]
NODE_SCRIPT = r"""
import fs from 'node:fs';
import {applyCatalogTemplate,newProject} from './src/model.js';
const cases = JSON.parse(fs.readFileSync(0,'utf8'));
const result = cases.map(({format,template}) => {
  const p = newProject('Проверка шаблона',format,'blank');
  applyCatalogTemplate(p,template);
  return p;
});
process.stdout.write(JSON.stringify(result));
"""


class TemplateContractTest(unittest.TestCase):
    def test_catalog_variants_match_server_schema(self):
        """Validate catalog data without browser dependencies (always runs)."""
        for item in main.catalog.list_templates():
            for fmt in ("4:5", "1:1", "9:16", "16:9"):
                template = main.catalog.get_template(item["id"], fmt)
                self.assertIsNotNone(template)
                ProjectRequest.model_validate({"project": {
                    "name": "Шаблон", "format": fmt, "bg": template["bg"],
                    "elements": template["elements"], "music": template["defaultMusic"],
                }})

    @unittest.skipUnless(shutil.which("node"), "Для JS-интеграционного теста нужен Node.js")
    def test_real_frontend_template_output_matches_server_schema(self):
        """Calls actual src/model.js and validates every catalog template variant."""
        cases = [
            {"format": fmt, "template": main.catalog.get_template(item["id"], fmt)}
            for item in main.catalog.list_templates()
            for fmt in ("4:5", "1:1", "9:16", "16:9")
        ]
        result = subprocess.run(
            ["node", "--input-type=module", "--eval", NODE_SCRIPT],
            cwd=ROOT, input=json.dumps(cases), text=True, capture_output=True,
            check=True, timeout=30,
        )
        projects = json.loads(result.stdout)
        self.assertEqual(len(projects), len(cases))
        for project in projects:
            ProjectRequest.model_validate({"project": project})
            for element in project["elements"]:
                if element["type"] != "image":
                    self.assertNotIn("isBackground", element)
        # Real API flow: a browser-generated catalog template must be creatable
        # and publishable without changing the backend's strict field policy.
        index = next(i for i, case in enumerate(cases)
                     if case["template"]["id"] == "cheer" and case["format"] == "4:5")
        original_storage = main.storage
        with tempfile.TemporaryDirectory() as folder:
            try:
                main.storage = FileStorage(Path(folder))
                main._requests.clear()
                client = TestClient(main.app)
                created = client.post("/api/projects", json={"project": projects[index]})
                self.assertEqual(created.status_code, 201, created.text)
                token = created.json()["editToken"]
                published = client.post(f"/api/projects/{token}/publish", json={"opensAt": None})
                self.assertEqual(published.status_code, 200, published.text)
                public_id = published.json()["publicId"]
                opened = client.get(f"/api/cards/{public_id}")
                self.assertEqual(opened.status_code, 200, opened.text)
                self.assertEqual(opened.json()["status"], "ready")
            finally:
                main.storage = original_storage

    def test_backend_rejects_background_flag_on_shape(self):
        payload = {
            "project": {"name": "Шаблон", "format": "4:5", "bg": "#dff2e9",
                "elements": [{"id": "cheer-1", "type": "shape", "x": 62,
                              "y": 90, "w": 82, "h": 82, "kind": "star",
                              "color": "#276d60", "isBackground": False}]}
        }
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            ProjectRequest.model_validate(payload)
