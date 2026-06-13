import json
import os
import re
import uuid
from datetime import datetime

DATA_DIR = "data"
TREE_FILE = os.path.join(DATA_DIR, "_tree.json")


def _strip_html(text):
    """去除HTML标签"""
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text).strip()


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


# ============ 树状结构操作 ============

def _load_tree():
    """加载文件树结构。如果不存在则返回空列表。"""
    _ensure_data_dir()
    if os.path.exists(TREE_FILE):
        try:
            with open(TREE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []


def _save_tree(tree):
    """保存文件树结构到 _tree.json。"""
    _ensure_data_dir()
    with open(TREE_FILE, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)


def _find_item_in_tree(tree, item_id):
    """在树中查找指定ID的条目，返回 (parent_list, index, item) 或 (None, -1, None)。"""
    for i, item in enumerate(tree):
        if item.get("id") == item_id:
            return tree, i, item
        if item.get("type") == "folder" and "children" in item:
            parent, idx, found = _find_item_in_tree(item["children"], item_id)
            if found:
                return parent, idx, found
    return None, -1, None


def _collect_files_from_tree(tree):
    """从树结构中提取所有文件条目（平铺）。"""
    files = []
    for item in tree:
        if item.get("type") == "file":
            files.append(item)
        elif item.get("type") == "folder" and "children" in item:
            files.extend(_collect_files_from_tree(item["children"]))
    return files


def _update_file_metadata(item):
    """根据实际磁盘文件更新条目的 updated_at 和 created_at。"""
    if item.get("type") != "file":
        return
    filepath = os.path.join(DATA_DIR, f"{item['id']}.json")
    if os.path.exists(filepath):
        item["updated_at"] = datetime.fromtimestamp(
            os.path.getmtime(filepath)
        ).isoformat()
        item["created_at"] = datetime.fromtimestamp(
            os.path.getctime(filepath)
        ).isoformat()
        # 如果 title 为空，从文件内容中读取根节点文本
        if not item.get("title"):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                item["title"] = _strip_html(data.get("data", {}).get("text", "")) or item["id"]
            except Exception:
                item["title"] = item["id"]


def _sync_orphan_files(tree):
    """将磁盘上存在但不在树中的孤立 .json 文件添加到树的根级别。"""
    existing_ids = set()
    for f in _collect_files_from_tree(tree):
        existing_ids.add(f.get("id"))

    for fname in os.listdir(DATA_DIR):
        if fname.endswith(".json") and not fname.startswith("_"):
            uid = fname.replace(".json", "")
            if uid not in existing_ids:
                filepath = os.path.join(DATA_DIR, fname)
                title = uid
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    title = _strip_html(data.get("data", {}).get("text", "")) or uid
                except Exception:
                    pass
                tree.append({
                    "type": "file",
                    "id": uid,
                    "title": title,
                    "updated_at": datetime.fromtimestamp(os.path.getmtime(filepath)).isoformat(),
                    "created_at": datetime.fromtimestamp(os.path.getctime(filepath)).isoformat(),
                })

    return tree


def get_tree():
    """获取完整的文件树结构（同步孤立文件并更新元数据后返回）。"""
    tree = _load_tree()
    if not isinstance(tree, list):
        tree = []

    # 同步磁盘上的孤立文件到树中
    existing_ids = set()
    for item in tree:
        if isinstance(item, dict) and item.get("type") == "file":
            existing_ids.add(item.get("id"))

    _ensure_data_dir()
    for fname in os.listdir(DATA_DIR):
        if fname.endswith(".json") and not fname.startswith("_"):
            uid = fname.replace(".json", "")
            if uid not in existing_ids:
                title = uid
                try:
                    filepath = os.path.join(DATA_DIR, fname)
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    title = _strip_html(data.get("data", {}).get("text", "")) or uid
                except Exception:
                    pass
                tree.append({"type": "file", "id": uid, "title": title})

    # 更新文件元数据（安全模式，不抛异常）
    for item in tree:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "file":
            continue
        try:
            filepath = os.path.join(DATA_DIR, f"{item['id']}.json")
            if os.path.exists(filepath):
                item["updated_at"] = datetime.fromtimestamp(
                    os.path.getmtime(filepath)
                ).isoformat()
                item["created_at"] = datetime.fromtimestamp(
                    os.path.getctime(filepath)
                ).isoformat()
        except Exception:
            pass

    # 清理死文件（磁盘上不存在的文件条目）
    def _clean(items):
        result = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "file":
                fpath = os.path.join(DATA_DIR, f"{item.get('id', '')}.json")
                if not os.path.exists(fpath):
                    continue
            elif item.get("type") == "folder":
                kids = item.get("children")
                if isinstance(kids, list):
                    item["children"] = _clean(kids)
            result.append(item)
        return result

    tree = _clean(tree)
    _save_tree(tree)
    return tree


def save_tree(tree):
    """保存整个文件树结构（API调用）。"""
    _save_tree(tree)


# ============ 思维导图文件 CRUD ============

def list_mindmaps():
    """列出所有思维导图文件（平铺列表，向后兼容）。"""
    tree = get_tree()
    files = _collect_files_from_tree(tree)
    files.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return files


def load_mindmap(uid: str):
    """加载思维导图数据。"""
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    if not os.path.exists(filepath):
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def save_mindmap(data: dict, uid: str = None):
    """保存思维导图。如果 uid 为 None 则创建新文件。"""
    _ensure_data_dir()
    if uid is None:
        uid = str(uuid.uuid4())

    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 确保文件存在于树中
    tree = _load_tree()
    tree = _sync_orphan_files(tree)

    # 更新树中对应条目的 title
    root_text = _strip_html(data.get("data", {}).get("text", ""))
    parent, idx, item = _find_item_in_tree(tree, uid)
    if item:
        item["title"] = root_text or uid
    _save_tree(tree)

    return uid


def delete_mindmap(uid: str):
    """删除思维导图文件，同时从树中移除。"""
    filepath = os.path.join(DATA_DIR, f"{uid}.json")
    deleted = False
    if os.path.exists(filepath):
        os.remove(filepath)
        deleted = True

    # 从树中移除
    tree = _load_tree()
    parent, idx, item = _find_item_in_tree(tree, uid)
    if parent is not None and idx >= 0:
        parent.pop(idx)
        _save_tree(tree)

    return deleted


def create_default_mindmap():
    """创建默认思维导图并添加到树中。"""
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
    uid = save_mindmap(default_data)
    return uid


# ============ 文件夹操作 ============

def create_folder(name: str, parent_folder_id: str = None):
    """创建新文件夹。

    Args:
        name: 文件夹名称
        parent_folder_id: 父文件夹ID，为 None 则创建在根级别

    Returns:
        新创建的文件夹条目
    """
    tree = _load_tree()
    folder_id = "folder-" + str(uuid.uuid4())
    folder_item = {
        "type": "folder",
        "id": folder_id,
        "name": name,
        "isOpen": True,
        "children": [],
    }

    if parent_folder_id:
        parent, idx, parent_item = _find_item_in_tree(tree, parent_folder_id)
        if parent_item and parent_item.get("type") == "folder":
            if "children" not in parent_item:
                parent_item["children"] = []
            parent_item["children"].append(folder_item)
        else:
            tree.append(folder_item)
    else:
        tree.append(folder_item)

    _save_tree(tree)
    return folder_item


def delete_folder(folder_id: str):
    """删除空文件夹（仅当文件夹没有子项时才能删除）。

    Returns:
        (success: bool, message: str)
    """
    tree = _load_tree()
    parent, idx, item = _find_item_in_tree(tree, folder_id)

    if item is None or item.get("type") != "folder":
        return False, "文件夹不存在"

    if item.get("children") and len(item["children"]) > 0:
        return False, "文件夹不为空，无法删除"

    parent.pop(idx)
    _save_tree(tree)
    return True, "删除成功"


def move_item(item_id: str, new_parent_id: str, new_index: int):
    """移动文件或文件夹到新位置。

    Args:
        item_id: 要移动的条目ID
        new_parent_id: 目标父文件夹ID，None 表示根级别
        new_index: 在目标父级中的位置索引

    Returns:
        (success: bool, message: str)
    """
    tree = _load_tree()

    # 查找要移动的条目
    parent, idx, item = _find_item_in_tree(tree, item_id)
    if item is None:
        return False, "条目不存在"

    # 防止将文件夹移入自己或自己的子文件夹
    if item.get("type") == "folder" and new_parent_id:
        # 检查 new_parent_id 是否是当前文件夹的子项
        def _is_descendant(items, target_id):
            for it in items:
                if it.get("id") == target_id:
                    return True
                if it.get("type") == "folder" and "children" in it:
                    if _is_descendant(it["children"], target_id):
                        return True
            return False

        if new_parent_id == item_id or _is_descendant(item.get("children", []), new_parent_id):
            return False, "不能将文件夹移入自己或自己的子文件夹"

    # 从原位置移除
    parent.pop(idx)

    # 插入到新位置
    if new_parent_id:
        new_parent, _, new_parent_item = _find_item_in_tree(tree, new_parent_id)
        if new_parent_item and new_parent_item.get("type") == "folder":
            if "children" not in new_parent_item:
                new_parent_item["children"] = []
            target_list = new_parent_item["children"]
        else:
            target_list = tree
    else:
        target_list = tree

    # 确保 new_index 在有效范围内
    new_index = max(0, min(new_index, len(target_list)))
    target_list.insert(new_index, item)

    _save_tree(tree)
    return True, "移动成功"


def move_item_to_index(item_id: str, new_index: int):
    """在同一父级内移动条目到新位置（排序）。

    Args:
        item_id: 要移动的条目ID
        new_index: 新的位置索引

    Returns:
        (success: bool, message: str)
    """
    tree = _load_tree()
    parent, idx, item = _find_item_in_tree(tree, item_id)
    if item is None:
        return False, "条目不存在"

    # 从原位置移除
    parent.pop(idx)

    # 插入到新位置（在同一列表中）
    new_index = max(0, min(new_index, len(parent)))
    parent.insert(new_index, item)

    _save_tree(tree)
    return True, "排序成功"
