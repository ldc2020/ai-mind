import json
import os
import re
import uuid
from datetime import datetime

DATA_DIR = "data"

def _strip_html(text):
    """去除HTML标签"""
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text).strip()

def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)

def list_mindmaps():
    """List all saved mind map files with metadata."""
    _ensure_data_dir()
    maps = []
    for fname in os.listdir(DATA_DIR):
        if fname.endswith(".json") and not fname.startswith("_"):
            filepath = os.path.join(DATA_DIR, fname)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                uid = fname.replace(".json", "")
                root_text = _strip_html(data.get("data", {}).get("text", ""))
                maps.append({
                    "id": uid,
                    "title": root_text or uid,
                    "updated_at": datetime.fromtimestamp(
                        os.path.getmtime(filepath)
                    ).isoformat(),
                    "created_at": datetime.fromtimestamp(
                        os.path.getctime(filepath)
                    ).isoformat(),
                })
            except Exception:
                continue
    maps.sort(key=lambda m: m["created_at"], reverse=True)
    return maps

def load_mindmap(uid: str):
    """Load a mind map by its UID (filename without extension)."""
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def save_mindmap(data: dict, uid: str = None):
    """Save a mind map. If uid is None, create a new file with a UUID."""
    _ensure_data_dir()
    if uid is None:
        uid = str(uuid.uuid4())
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return uid

def delete_mindmap(uid: str):
    """Delete a mind map file."""
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    if os.path.exists(filepath):
        os.remove(filepath)
        return True
    return False

def create_default_mindmap():
    """Create a default mind map with sample data."""
    default_data = {
        "data": {
            "text": "中心主题",
            "expand": True,
        },
        "children": [
            {
                "data": {"text": "分支主题1", "expand": True},
                "children": [
                    {"data": {"text": "子主题1.1"}, "children": []},
                    {"data": {"text": "子主题1.2"}, "children": []},
                ],
            },
            {
                "data": {"text": "分支主题2", "expand": True},
                "children": [
                    {"data": {"text": "子主题2.1"}, "children": []},
                ],
            },
            {
                "data": {"text": "分支主题3", "expand": True},
                "children": [],
            },
        ],
    }
    return save_mindmap(default_data)
