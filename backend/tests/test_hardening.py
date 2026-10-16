"""Security regressions for post re-audit changes."""
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.cleanup import cleanup
from app.storage import FileStorage


def project(src=None, element=None):
    return {"name":"Проверка", "format":"4:5", "bg":"#ffffff", "elements":
            ([element] if element else ([{"id":"img1","type":"image","x":0,"y":0,"w":100,"h":100,"src":src}] if src else []))}


def png():
    io = BytesIO()
    Image.new("RGB", (2, 2), "white").save(io, format="PNG")
    return io.getvalue()


class HardeningTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        main.storage = FileStorage(Path(self.tmp.name))
        main._requests.clear()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.tmp.cleanup()

    def create(self, body=None):
        response = self.client.post("/api/projects", json={"project":body or project()})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["editToken"]

    def upload(self, owner, data=None):
        response = self.client.post("/api/assets", data={"edit_token":owner},
                                    files={"file":("picture.png", data if data is not None else png(), "image/png")})
        return response

    def test_cannot_create_or_save_cross_owner_media(self):
        token_a = self.create()
        token_b = self.create()
        url = self.upload(token_a).json()["url"]
        self.assertEqual(self.client.post("/api/projects", json={"project":project(url)}).status_code, 422)
        self.assertEqual(self.client.put(f"/api/projects/{token_b}", json={"project":project(url)}).status_code, 422)
        self.assertEqual(self.client.put(f"/api/projects/{token_a}", json={"project":project(url)}).status_code, 200)
        public_id = self.client.post(f"/api/projects/{token_a}/publish", json={"opensAt":None}).json()["publicId"]
        self.assertEqual(self.client.get(f"/api/media/cards/{public_id}/{url.rsplit('/',1)[1]}").status_code, 200)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(url, headers={"X-Edit-Token":token_b}).status_code, 404)
        self.assertEqual(self.client.get(url, headers={"X-Edit-Token":token_a}).status_code, 200)
        self.assertEqual(self.client.get(url+f"?edit_token={token_a}").status_code, 404)

    def test_card_cannot_expose_other_owner_even_with_corrupt_legacy_snapshot(self):
        a=self.create(); b=self.create()
        url=self.upload(a).json()["url"]
        pid="testcardowner000000001"
        main.storage._write(main.storage.cards / f"{pid}.json", {
            "editOwner":b, "project":project(url), "createdAt":datetime.now(UTC).isoformat(), "opensAt":None})
        self.assertEqual(self.client.get(f"/api/media/cards/{pid}/{url.rsplit('/',1)[1]}").status_code, 404)

    def test_bad_png_signature_is_not_enough(self):
        owner=self.create()
        r=self.upload(owner,b"\x89PNG\r\n\x1a\n"+b"fake")
        self.assertEqual(r.status_code, 415, r.text)

    def test_unknown_json_fields_are_rejected(self):
        owner=self.create()
        for field in ("evil", "children", "innerHTML"):
            item={"id":"x", "type":"text", "x":0,"y":0,"w":100,"h":30,"text":"safe", field:"X"*20000}
            r=self.client.put(f"/api/projects/{owner}", json={"project":project(element=item)})
            self.assertEqual(r.status_code, 422, r.text)
        audio=project()
        audio["music"]={"name":"x", "src":"/api/catalog/music/abc/file", "payload":"huge"}
        self.assertEqual(self.client.put(f"/api/projects/{owner}", json={"project":audio}).status_code, 422)

    def test_host_rejection_and_bounded_limit_keys(self):
        self.assertEqual(self.client.get("/api/health",headers={"Host":"evil.example"}).status_code,400)
        for i in range(40):
            self.client.get(f"/api/unmatched-{i}")
        self.assertLessEqual(len(main._requests), 3)

    def test_rate_limit_counts_upload_by_asgi_path(self):
        for i in range(7):
            r=self.client.post("/api/assets", data={})
            if i<5: self.assertEqual(r.status_code, 422)
            else: self.assertEqual(r.status_code, 429)
        self.assertEqual(len(main._requests), 2)

    def test_project_count_quota(self):
        self.create()
        with patch('app.storage.MAX_PROJECTS', 1):
            r=self.client.post('/api/projects',json={'project':project()})
            self.assertEqual(r.status_code,507, r.text)

    def test_project_size_quota(self):
        owner=self.create()
        data=project(element={"type":"text","id":"x","x":0,"y":0,"w":200,"h":100,"text":"a"*2000})
        with patch('app.storage.MAX_PROJECT_BYTES',1024):
            r=self.client.put(f'/api/projects/{owner}',json={'project':data})
            self.assertEqual(r.status_code,507, r.text)

    def test_scheduled_card_survives_cleanup(self):
        root=Path(self.tmp.name)
        owner=self.create()
        asset_url=self.upload(owner).json()['url']
        self.client.put(f'/api/projects/{owner}',json={'project':project(asset_url)})
        future=(datetime.now(UTC)+timedelta(days=60)).isoformat()
        cardid=self.client.post(f'/api/projects/{owner}/publish',json={'opensAt':future}).json()['publicId']
        card_path=root/'cards'/f'{cardid}.json'
        editor_path=root/'projects'/f'{owner}.json'
        for path in (card_path,editor_path):
            data=json.loads(path.read_text(encoding='utf8'))
            data['createdAt']=(datetime.now(UTC)-timedelta(days=50)).isoformat()
            path.write_text(json.dumps(data),encoding='utf8')
        removed=cleanup(root, days=30, dry_run=False)
        self.assertNotIn(card_path,removed)
        self.assertTrue(card_path.exists())
        self.assertTrue(editor_path.exists())
        self.assertEqual(self.client.get(f'/api/cards/{cardid}').json()['status'],'scheduled')

    def test_public_attribution_and_notices(self):
        owner=self.create()
        backgrounds=main.catalog.list_backgrounds()
        cc=next(b for b in backgrounds if b['license']=='CC-BY-4.0')
        element={"id":"bg1","type":"image","x":0,"y":0,"w":800,"h":1000,"src":cc['src'], "isBackground":True}
        self.assertEqual(self.client.put(f'/api/projects/{owner}',json={'project':project(element=element)}).status_code,200)
        cid=self.client.post(f'/api/projects/{owner}/publish',json={'opensAt':None}).json()['publicId']
        response=self.client.get(f'/api/cards/{cid}').json()
        self.assertTrue(any('CC BY' in c['text'] for c in response['credits']))
        self.assertEqual(self.client.get('/LICENSES.md').status_code,200)
        self.assertEqual(self.client.get('/LICENSE').status_code,200)

    def test_secret_not_in_media_location(self):
        owner=self.create()
        url=self.upload(owner).json()['url']
        self.assertNotIn(owner,url)
        self.assertNotIn('?edit_token=',url)
        self.assertEqual(self.client.put(f'/api/projects/{owner}',json={'project':project(url)}).status_code,200)
        stored=self.client.get(f'/api/projects/{owner}').json()['project']['elements'][0]['src']
        self.assertEqual(stored,url)


if __name__=='__main__':
    unittest.main()

class DeleteTest(unittest.TestCase):
    def test_editor_can_revoke_projects_and_public_cards(self):
        with tempfile.TemporaryDirectory() as directory:
            main.storage=FileStorage(Path(directory))
            main._requests.clear()
            client=TestClient(main.app)
            owner=client.post('/api/projects',json={'project':project()}).json()['editToken']
            upload=client.post('/api/assets',data={'edit_token':owner},
                        files={'file':('photo.png',png(),'image/png')}).json()['url']
            self.assertEqual(client.put(f'/api/projects/{owner}',json={'project':project(upload)}).status_code,200)
            publicid=client.post(f'/api/projects/{owner}/publish',json={'opensAt':None}).json()['publicId']
            self.assertEqual(client.delete(f'/api/projects/{owner}').status_code,200)
            self.assertEqual(client.get(f'/api/projects/{owner}').status_code,404)
            self.assertEqual(client.get(f'/api/cards/{publicid}').status_code,404)
            self.assertEqual(client.get(upload,headers={'X-Edit-Token':owner}).status_code,404)
            self.assertEqual(client.delete(f'/api/projects/{owner}').status_code,404)
