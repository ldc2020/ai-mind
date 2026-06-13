"""
API 测试脚本 —— 验证所有新路由是否正常工作
用法: python test_api.py
"""
import json
import urllib.request
import urllib.error

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
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
    except Exception as e:
        return None, str(e)

def test(name, path, method="GET", data=None, expect=200):
    code, body = fetch(path, method, data)
    ok = code == expect
    print(f"  {'✓' if ok else '✗'} {name} → HTTP {code}")
    if not ok:
        print(f"    预期 {expect}, 实际 {code}: {json.dumps(body, ensure_ascii=False)[:200]}")
    return ok

print("=== AI Mind API 测试 ===\n")

# 基础 API
test("文件列表  ", "/api/mindmaps")
test("新建导图  ", "/api/mindmaps/new", "POST")

# 文件树 API（新增）
test("获取文件树", "/api/tree")
test("保存文件树", "/api/tree/save", "PUT", {"tree": []})
test("新建文件夹", "/api/folders/create", "POST", {"name": "测试文件夹"})
test("移动条目  ", "/api/tree/move", "PUT", {"item_id": "test", "new_index": 0})

# 验证文件夹是否创建成功
code, body = fetch("/api/tree")
if code == 200:
    folders = [i for i in body.get("tree", []) if i.get("type") == "folder"]
    print(f"\n  当前文件夹: {len(folders)} 个")
    for f in folders:
        print(f"    📁 {f.get('name', '?')} ({f.get('id', '?')})")

print("\n=== 完成 ===")
print("如果看到 ✗，说明该路由未注册或返回了错误。")
print("通常重启服务器并清除缓存即可解决。")
