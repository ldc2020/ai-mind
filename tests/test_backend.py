"""使用临时数据目录验证接口、配置覆盖及历史扩展字段，禁止触碰真实文档。"""
import io
import json
import os
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

if os.environ.get("AI_MIND_TESTING") != "1":
    raise RuntimeError("请使用 python scripts/test.py 运行，确保数据目录隔离")

from fastapi.testclient import TestClient
from main import app
from backend import repository
from config.settings import load_settings


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.original = repository.DATA_DIR, repository.TREE_FILE
        repository.DATA_DIR = Path(self.temp.name)
        repository.TREE_FILE = repository.DATA_DIR / '_tree.json'
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        repository.DATA_DIR, repository.TREE_FILE = self.original
        self.temp.cleanup()

    def test_configuration_precedence_and_validation(self):
        local = Path(self.temp.name) / 'local.json'
        local.write_text('{"port": 8100, "reload": false}', encoding='utf-8')
        config = load_settings({'AI_MIND_PORT': '8200'}, local)
        self.assertEqual(config['port'], 8200)
        self.assertFalse(config['reload'])
        self.assertTrue(config['data_dir'].is_absolute())
        for env in ({'AI_MIND_PORT': '0'}, {'AI_MIND_RELOAD': 'maybe'}):
            with self.assertRaises(ValueError):
                load_settings(env, local)

    def test_static_assets_and_default_template(self):
        page = self.client.get('/')
        self.assertEqual(page.status_code, 200)
        self.assertIn('/static/js/config/app-config.js', page.text)
        self.assertEqual(self.client.get('/static/js/app.js').headers['cache-control'], 'no-cache')
        template = self.client.get('/api/default-document').json()
        created = self.client.post('/api/mindmaps/new').json()
        self.assertEqual(created['mindmap'], template)

    def test_document_round_trip_preserves_extensions(self):
        document = {'data': {'text': '中文标题', 'note': '<p>备注</p>', '_relations': [{'to': 'b'}]},
                    'children': [], 'layout': 'mindMap', '_floatingNodes': [{'data': {'uid': 'f1', 'text': '自由节点'}}],
                    'futureField': {'version': 2}}
        result = self.client.post('/api/mindmaps/new', json={'data': document}).json()
        uid = result['uid']
        self.assertEqual(result['mindmap'], document)
        document['children'].append({'data': {'text': '子节点'}, 'children': []})
        self.assertEqual(self.client.put(f'/api/mindmaps/{uid}', json={'data': document}).status_code, 200)
        self.assertEqual(self.client.get(f'/api/mindmaps/{uid}').json()['mindmap'], document)
        self.assertEqual(self.client.post('/api/mindmaps/export', json={'data': document}).json(), document)
        self.assertEqual(self.client.delete(f'/api/mindmaps/{uid}').status_code, 200)
        self.assertEqual(self.client.get(f'/api/mindmaps/{uid}').status_code, 404)

    def test_nested_folders_move_rename_and_no_duplicate(self):
        uid = self.client.post('/api/mindmaps/new').json()['uid']
        parent = self.client.post('/api/folders/create', json={'name': '父目录'}).json()['folder']['id']
        child = self.client.post('/api/folders/create', json={'name': '子目录'}).json()['folder']['id']
        self.client.get('/api/tree')
        for item, folder in ((child, parent), (uid, child)):
            response = self.client.put('/api/tree/move', json={'item_id': item, 'new_parent_id': folder})
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.put(f'/api/folders/{child}', json={'name': '重命名'}).status_code, 200)
        tree = self.client.get('/api/tree').json()['tree']
        self.assertEqual(len(tree), 1)
        self.assertEqual(tree[0]['children'][0]['name'], '重命名')
        self.assertEqual(tree[0]['children'][0]['children'][0]['id'], uid)
        for item, target in ((parent, child), (uid, 'missing')):
            self.assertEqual(self.client.put('/api/tree/move', json={'item_id': item, 'new_parent_id': target}).status_code, 400)
        self.assertEqual(self.client.get('/api/tree').json()['tree'], tree)
        self.assertEqual(self.client.delete(f'/api/folders/{child}').status_code, 400)

    def test_import_formats(self):
        formats = [('md', '# 标题\n- 子节点'.encode()), ('mm', '<map><node TEXT="标题"><node TEXT="子节点"/></node></map>'.encode())]
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('content.json', json.dumps([{'rootTopic': {'title': '标题', 'children': {'attached': [{'title': '子节点'}]}}}]))
        formats.append(('xmind', buffer.getvalue()))
        for extension, content in formats:
            response = self.client.post('/api/mindmaps/import/file', files={'file': (f'sample.{extension}', content)})
            self.assertEqual(response.status_code, 200, response.text)
            imported = response.json()['mindmap']
            if extension == 'md':
                # 保留既有 Markdown 的包装根节点结构。
                self.assertEqual(imported['children'][0]['data']['text'], '标题')
            else:
                self.assertEqual(imported['data']['text'], '标题')
        self.assertEqual(self.client.post('/api/mindmaps/import/markdown', json={'data': {'text': ''}}).status_code, 400)
        self.assertEqual(self.client.post('/api/mindmaps/import/file', files={'file': ('bad.zip', b'bad')}).status_code, 400)

    def test_invalid_ids_and_atomic_write(self):
        for uid in ('../escape', '_tree', 'a/b', ''):
            with self.assertRaises(ValueError):
                repository._save_mindmap({'data': {}}, uid)
        uid = repository._save_mindmap({'data': {'text': '初始'}})
        with self.assertRaises(TypeError):
            repository._save_mindmap({'bad': {1, 2}}, uid)
        self.assertEqual(repository._load_mindmap(uid)['data']['text'], '初始')
        self.assertEqual(list(repository.DATA_DIR.glob('*.tmp')), [])
