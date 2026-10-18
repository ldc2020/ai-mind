"""唯一的 JSON 持久化入口；保留导图中的未知字段，兼容历史扩展数据。"""
import json
import os
import re
import uuid
import tempfile
from pathlib import Path
from datetime import datetime
from config.settings import settings, default_document_path

DATA_DIR = settings["data_dir"]
TREE_FILE = DATA_DIR / "_tree.json"


def document_path(uid):
    """文档标识只能是文件名，禁止访问目录外文件及文件树元数据。"""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", uid):
        raise ValueError("无效的文档标识")
    return DATA_DIR / f"{uid}.json"


def _atomic_write(path, value):
    """先写同目录临时文件，再原子替换，避免中断留下半份 JSON。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=DATA_DIR,
                                         suffix=".tmp", delete=False) as stream:
            name = stream.name
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


def _read_tree():
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.exists(TREE_FILE):
        try:
            with open(TREE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def _write_tree(tree):
    os.makedirs(DATA_DIR, exist_ok=True)
    _atomic_write(TREE_FILE, tree)

def _scan_files():
    result = []
    os.makedirs(DATA_DIR, exist_ok=True)
    for fname in os.listdir(DATA_DIR):
        if fname.endswith(".json") and not fname.startswith("_"):
            uid = fname.replace(".json", "")
            filepath = os.path.join(DATA_DIR, fname)
            title = uid
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                title = re.sub(r'<[^>]+>', '', data.get("data", {}).get("text", "")).strip() or uid
            except Exception:
                pass
            result.append({
                "id": uid,
                "title": title,
                "updated_at": datetime.fromtimestamp(os.path.getmtime(filepath)).isoformat(),
                "created_at": datetime.fromtimestamp(os.path.getctime(filepath)).isoformat(),
            })
    return result

def _load_mindmap(uid):
    filepath = document_path(uid)
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_mindmap(data, uid=None):
    os.makedirs(DATA_DIR, exist_ok=True)
    if uid is None:
        uid = str(uuid.uuid4())
    filepath = document_path(uid)
    _atomic_write(filepath, data)
    return uid

def _delete_mindmap(uid):
    filepath = document_path(uid)
    if os.path.exists(filepath):
        os.remove(filepath)
        return True
    return False

def _create_default_mindmap():
    # 每次新建都读取模板，避免不同文档共享可变数据。
    default = json.loads(default_document_path().read_text(encoding="utf-8"))
    return _save_mindmap(default)
