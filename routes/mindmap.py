import io
import json
import os
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

# ===== 内联树操作（不依赖 storage.py，摆脱缓存问题） =====

DATA_DIR = "data"
TREE_FILE = os.path.join(DATA_DIR, "_tree.json")

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
    with open(TREE_FILE, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)

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
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_mindmap(data, uid=None):
    os.makedirs(DATA_DIR, exist_ok=True)
    if uid is None:
        uid = str(uuid.uuid4())
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return uid

def _delete_mindmap(uid):
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    if os.path.exists(filepath):
        os.remove(filepath)
        return True
    return False

def _create_default_mindmap():
    default = {
        "data": {"text": "中心主题", "expand": True},
        "children": [
            {"data": {"text": "分支主题1", "expand": True}, "children": [
                {"data": {"text": "子主题1.1"}, "children": []},
                {"data": {"text": "子主题1.2"}, "children": []}
            ]},
            {"data": {"text": "分支主题2", "expand": True}, "children": [
                {"data": {"text": "子主题2.1"}, "children": []}
            ]},
            {"data": {"text": "分支主题3", "expand": True}, "children": []},
        ],
    }
    return _save_mindmap(default)


router = APIRouter()

# ===== Pydantic 模型 =====

class MindMapData(BaseModel):
    data: dict
    uid: Optional[str] = None

class TreeBody(BaseModel):
    tree: list

class FolderBody(BaseModel):
    name: str

class MoveItemBody(BaseModel):
    item_id: str
    new_parent_id: Optional[str] = None
    new_index: int = 0


# ===== 原有 mindmap API =====

@router.get("/mindmaps")
def api_list_mindmaps():
    return {"mindmaps": _scan_files()}

@router.post("/mindmaps/new")
def api_new_mindmap():
    uid = _create_default_mindmap()
    return {"uid": uid, "mindmap": _load_mindmap(uid)}

@router.get("/mindmaps/{uid}")
def api_get_mindmap(uid: str):
    data = _load_mindmap(uid)
    if data is None:
        raise HTTPException(status_code=404, detail="Mind map not found")
    return {"uid": uid, "mindmap": data}

@router.put("/mindmaps/{uid}")
def api_save_mindmap(uid: str, body: MindMapData):
    _save_mindmap(body.data, uid)
    return {"uid": uid, "success": True}

@router.delete("/mindmaps/{uid}")
def api_delete_mindmap(uid: str):
    if not _delete_mindmap(uid):
        raise HTTPException(status_code=404, detail="Mind map not found")
    return {"success": True}


# ===== 文件树 API =====

@router.get("/tree")
def api_get_tree():
    tree = _read_tree()
    # 递归收集所有文件ID（包括嵌套文件夹内的）
    def _collect_ids(items):
        ids = set()
        for it in items:
            if isinstance(it, dict):
                if it.get("type") == "file":
                    ids.add(it.get("id"))
                kids = it.get("children")
                if isinstance(kids, list):
                    ids |= _collect_ids(kids)
        return ids
    existing = _collect_ids(tree)
    for f in _scan_files():
        if f["id"] not in existing:
            tree.append({"type": "file", "id": f["id"], "title": f["title"]})
    tree = [item for item in tree if not (
        isinstance(item, dict) and item.get("type") == "file" and
        not os.path.exists(os.path.join(DATA_DIR, f"{item.get('id', '')}.json"))
    )]
    _write_tree(tree)
    return {"tree": tree}

@router.put("/tree/save")
def api_save_tree(body: TreeBody):
    _write_tree(body.tree)
    return {"success": True}

@router.post("/folders/create")
def api_create_folder(body: FolderBody):
    tree = _read_tree()
    folder = {
        "type": "folder",
        "id": "folder-" + str(uuid.uuid4()),
        "name": body.name,
        "isOpen": True,
        "children": []
    }
    tree.append(folder)
    _write_tree(tree)
    return {"folder": folder, "success": True}

@router.delete("/folders/{folder_id}")
def api_delete_folder(folder_id: str):
    tree = _read_tree()
    ok, msg = _remove_folder(tree, folder_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    _write_tree(tree)
    return {"success": True}

def _remove_folder(items, target_id):
    for i, item in enumerate(items):
        if isinstance(item, dict) and item.get("id") == target_id:
            if item.get("type") != "folder":
                return False, "不是文件夹"
            if item.get("children") and len(item["children"]) > 0:
                return False, "文件夹不为空，无法删除"
            items.pop(i)
            return True, "删除成功"
        if isinstance(item, dict) and item.get("type") == "folder":
            kids = item.get("children")
            if isinstance(kids, list):
                ok, msg = _remove_folder(kids, target_id)
                if ok:
                    return True, msg
    return False, "文件夹不存在"

@router.put("/tree/move")
def api_move_item(body: MoveItemBody):
    tree = _read_tree()

    def find_and_remove(items, target_id):
        for i, item in enumerate(items):
            if isinstance(item, dict) and item.get("id") == target_id:
                return items.pop(i)
            if isinstance(item, dict) and item.get("type") == "folder":
                kids = item.get("children")
                if isinstance(kids, list):
                    found = find_and_remove(kids, target_id)
                    if found:
                        return found
        return None

    item = find_and_remove(tree, body.item_id)
    if item is None:
        raise HTTPException(status_code=400, detail="条目不存在")

    if item.get("type") == "folder" and body.new_parent_id:
        def contains(items, tid):
            for it in items:
                if isinstance(it, dict) and it.get("id") == tid:
                    return True
                if isinstance(it, dict) and it.get("type") == "folder":
                    kids = it.get("children")
                    if isinstance(kids, list) and contains(kids, tid):
                        return True
            return False
        if body.new_parent_id == item.get("id") or contains(item.get("children", []), body.new_parent_id):
            raise HTTPException(status_code=400, detail="不能将文件夹移入自己或自己的子文件夹")

    target_list = tree
    if body.new_parent_id:
        def find_folder(items, fid):
            for it in items:
                if isinstance(it, dict) and it.get("id") == fid and it.get("type") == "folder":
                    return it
                if isinstance(it, dict) and it.get("type") == "folder":
                    kids = it.get("children")
                    if isinstance(kids, list):
                        found = find_folder(kids, fid)
                        if found:
                            return found
            return None
        parent_folder = find_folder(tree, body.new_parent_id)
        if parent_folder:
            if "children" not in parent_folder:
                parent_folder["children"] = []
            target_list = parent_folder["children"]

    new_index = max(0, min(body.new_index, len(target_list)))
    target_list.insert(new_index, item)
    _write_tree(tree)
    return {"success": True}


# ===== 导入功能 =====

def _xmind_json_to_tree(topic, parent):
    title = topic.get("title", "")
    parent["data"]["text"] = title or "未命名"
    children = topic.get("children", {}).get("attached", [])
    if not children:
        parent["children"] = []
        return
    parent["children"] = []
    for child in children:
        node = {"data": {"text": ""}, "children": []}
        notes = child.get("notes", {}).get("plain", {}).get("content", "")
        if notes: node["data"]["note"] = notes
        hyperlink = child.get("hyperlink", "")
        if hyperlink: node["data"]["hyperlink"] = hyperlink
        labels = child.get("labels", [])
        if labels: node["data"]["tag"] = labels
        _xmind_json_to_tree(child, node)
        parent["children"].append(node)

def _xmind_xml_to_tree(topic_el, parent):
    text = topic_el.get("text", "") or (topic_el.find("title").text if topic_el.find("title") is not None else "")
    parent["data"]["text"] = text or "未命名"
    children_el = topic_el.find("children")
    if children_el is None:
        parent["children"] = []
        return
    parent["children"] = []
    for child_el in children_el.findall("topic"):
        node = {"data": {"text": ""}, "children": []}
        _xmind_xml_to_tree(child_el, node)
        parent["children"].append(node)

def _xmind_to_mindmap(file_bytes):
    mindmap_data = {"data": {"text": "导入的导图", "expand": True}, "children": []}
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        if "content.json" in zf.namelist():
            content = json.loads(zf.read("content.json"))
            root_topic = content.get("rootTopic") or content.get("sheet", {}).get("rootTopic") or content
            _xmind_json_to_tree(root_topic, mindmap_data)
            return mindmap_data
        if "content.xml" in zf.namelist():
            xml_str = zf.read("content.xml").decode("utf-8", errors="replace")
            root = ET.fromstring(xml_str)
            topic_el = root.find(".//topic[@id='0']") or root.find(".//topic")
            if topic_el is not None:
                _xmind_xml_to_tree(topic_el, mindmap_data)
                return mindmap_data
    raise HTTPException(status_code=400, detail="无法解析 XMind 文件")

def _mm_node_to_tree(node_el, parent):
    text = node_el.get("TEXT", "")
    parent["data"]["text"] = text or "未命名"
    parent["children"] = []
    for child_el in node_el.findall("node"):
        node = {"data": {"text": ""}, "children": []}
        _mm_node_to_tree(child_el, node)
        parent["children"].append(node)

def _freemind_to_mindmap(xml_str):
    root = ET.fromstring(xml_str)
    map_el = root if root.tag == "map" else root.find("map")
    if map_el is None:
        raise HTTPException(status_code=400, detail="无法解析 FreeMind 文件")
    first_node = map_el.find("node")
    if first_node is None:
        raise HTTPException(status_code=400, detail="FreeMind 文件没有节点")
    result = {"data": {"text": ""}, "children": []}
    _mm_node_to_tree(first_node, result)
    return result

def _markdown_to_mindmap(text):
    root = {"data": {"text": "导入文档"}, "children": []}
    stack = [{"node": root, "level": 0}]
    for line in text.split("\n"):
        heading_match = re.match(r"^(#{1,6})\s+(.+)", line)
        if heading_match:
            level = len(heading_match.group(1))
            text_content = heading_match.group(2).strip()
            node = {"data": {"text": text_content}, "children": []}
            while len(stack) > 1 and stack[-1]["level"] >= level:
                stack.pop()
            stack[-1]["node"]["children"].append(node)
            stack.append({"node": node, "level": level})
            continue
        list_match = re.match(r"^(\s*)[-*+]\s+(.+)", line)
        if list_match:
            indent = len(list_match.group(1))
            text_content = list_match.group(2).strip()
            node = {"data": {"text": text_content}, "children": []}
            list_level = indent // 2 + 1
            while len(stack) > 1 and stack[-1]["level"] >= list_level:
                stack.pop()
            stack[-1]["node"]["children"].append(node)
            stack.append({"node": node, "level": list_level})
            continue
        if line.strip():
            node = {"data": {"text": line.strip()}, "children": []}
            stack[-1]["node"]["children"].append(node)
    return root

@router.post("/mindmaps/export")
def api_export_mindmap(body: MindMapData):
    return body.data

@router.post("/mindmaps/import/file")
async def api_import_file(file: UploadFile = File(...)):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    file_bytes = await file.read()
    try:
        if ext == "xmind":
            mindmap_data = _xmind_to_mindmap(file_bytes)
        elif ext == "mm":
            xml_str = file_bytes.decode("utf-8", errors="replace")
            mindmap_data = _freemind_to_mindmap(xml_str)
        elif ext in ("md", "markdown"):
            text = file_bytes.decode("utf-8", errors="replace")
            mindmap_data = _markdown_to_mindmap(text)
        else:
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: .{ext}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"导入失败: {str(e)}")
    uid = _save_mindmap(mindmap_data)
    return {"uid": uid, "mindmap": mindmap_data, "success": True}

@router.post("/mindmaps/import/markdown")
def api_import_markdown(body: MindMapData):
    text = body.data.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Markdown 内容为空")
    mindmap_data = _markdown_to_mindmap(text)
    uid = _save_mindmap(mindmap_data)
    return {"uid": uid, "mindmap": mindmap_data, "success": True}
