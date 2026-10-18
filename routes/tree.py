"""文件树与文件夹接口；所有磁盘读写交给 repository。"""
import os
import json
import re
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from backend.repository import (
    document_path, _read_tree, _write_tree, _scan_files,
)
from backend.schemas import TreeBody, FolderBody, MoveItemBody

router = APIRouter()

@router.get("/tree")
def api_get_tree():
    tree = _read_tree()
    if not isinstance(tree, list):
        tree = []

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

    # 将磁盘上存在但树中任何位置都没有的文件追加到根（孤立文件同步）
    for f in _scan_files():
        if f["id"] not in existing:
            tree.append({
                "type": "file",
                "id": f["id"],
                "title": f["title"],
                "updated_at": f.get("updated_at"),
                "created_at": f.get("created_at"),
            })

    # 递归清理：磁盘上不存在的文件条目、以及格式损坏的条目
    def _clean_items(items):
        result = []
        for item in items:
            if not isinstance(item, dict):
                continue
            itype = item.get("type")
            if itype == "file":
                # 检查文件是否真的存在于磁盘上
                fid = item.get("id", "")
                try:
                    fpath = document_path(fid)
                except (ValueError, TypeError):
                    continue
                if not os.path.exists(fpath):
                    continue  # 跳过死文件条目
                # 同步元数据
                try:
                    if os.path.exists(fpath):
                        item["updated_at"] = datetime.fromtimestamp(
                            os.path.getmtime(fpath)
                        ).isoformat()
                        item["created_at"] = datetime.fromtimestamp(
                            os.path.getctime(fpath)
                        ).isoformat()
                        # 如果 title 为空，从文件读取
                        if not item.get("title"):
                            try:
                                with open(fpath, "r", encoding="utf-8") as f:
                                    data = json.load(f)
                                root_text = re.sub(
                                    r'<[^>]+>', '',
                                    data.get("data", {}).get("text", "")
                                ).strip() or fid
                                item["title"] = root_text
                            except Exception:
                                item["title"] = fid
                except Exception:
                    pass
                result.append(item)
            elif itype == "folder":
                kids = item.get("children")
                if not isinstance(kids, list):
                    kids = []
                # 递归清理文件夹内的子项
                item["children"] = _clean_items(kids)
                # 确保 isOpen 字段存在（默认 True）
                if "isOpen" not in item:
                    item["isOpen"] = True
                if "name" not in item or not item["name"]:
                    item["name"] = item.get("id", "未命名文件夹")
                result.append(item)
            else:
                # 未知类型，保留原样
                result.append(item)
        return result

    tree = _clean_items(tree)
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

@router.put("/folders/{folder_id}")
def api_rename_folder(folder_id: str, body: FolderBody):
    tree = _read_tree()
    ok, msg = _rename_folder(tree, folder_id, body.name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    _write_tree(tree)
    return {"success": True}

def _rename_folder(items, target_id, new_name):
    new_name = (new_name or "").strip()
    if not new_name:
        return False, "文件夹名称不能为空"
    for item in items:
        if isinstance(item, dict) and item.get("id") == target_id:
            if item.get("type") != "folder":
                return False, "不是文件夹"
            item["name"] = new_name
            return True, "重命名成功"
        if isinstance(item, dict) and item.get("type") == "folder":
            kids = item.get("children")
            if isinstance(kids, list):
                ok, msg = _rename_folder(kids, target_id, new_name)
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
        if parent_folder is None:
            raise HTTPException(status_code=400, detail="目标文件夹不存在")
        if parent_folder:
            if "children" not in parent_folder:
                parent_folder["children"] = []
            target_list = parent_folder["children"]

    new_index = max(0, min(body.new_index, len(target_list)))
    target_list.insert(new_index, item)
    _write_tree(tree)
    return {"success": True}


