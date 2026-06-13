"""测试新建文件夹和文件树"""
import json, urllib.request

BASE = "http://127.0.0.1:8001"

def fetch(path, method="GET", data=None):
    url = f"{BASE}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    if data:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except Exception as e:
        return None, str(e)

# 1. 创建文件夹
print("=== 1. POST /api/folders/create ===")
code, body = fetch("/api/folders/create", "POST", {"name": "我的测试文件夹"})
print(f"  HTTP {code}")
if body:
    print(f"  success: {body.get('success')}")
    folder = body.get("folder", {})
    print(f"  文件夹: {folder.get('name')} ({folder.get('id')})")

# 2. 检查树
print("\n=== 2. GET /api/tree ===")
code, body = fetch("/api/tree")
print(f"  HTTP {code}")
if body:
    tree = body.get("tree", [])
    print(f"  总条目: {len(tree)}")
    for item in tree:
        t = item.get("type", "?")
        name = item.get("name") or item.get("title") or item.get("id")
        kids = len(item.get("children", [])) if t == "folder" else 0
        print(f"  [{t}] {name}{' (子项:' + str(kids) + ')' if kids else ''}")

# 3. 前端会调用的流程模拟
print("\n=== 3. 前端 loadFileList() 流程模拟 ===")
code, tree_data = fetch("/api/tree")
if code == 200:
    tree = tree_data.get("tree", [])
    print(f"  tree 有效: {isinstance(tree, list)}, 长度: {len(tree)}")
    code_maps, maps_data = fetch("/api/mindmaps")
    if code_maps == 200:
        mindmaps = maps_data.get("mindmaps", [])
        print(f"  mindmaps 有效: {isinstance(mindmaps, list)}, 长度: {len(mindmaps)}")
