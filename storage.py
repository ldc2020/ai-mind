"""旧模块兼容入口；新代码请使用 backend.repository，避免维护两套存储实现。

历史页面通过 HTTP 接口管理文件夹。此处保留常用的 Python 文档/树读写函数。
"""
from backend.repository import (
    DATA_DIR, TREE_FILE, _read_tree as _load_tree, _write_tree as _save_tree,
    _load_mindmap as load_mindmap, _save_mindmap as save_mindmap,
    _delete_mindmap as delete_mindmap, _create_default_mindmap as create_default_mindmap,
    _scan_files as list_mindmaps, _write_tree as save_tree,
)


def get_tree():
    """沿用接口的递归同步规则，嵌套文件不会重复出现在根目录。"""
    from routes.tree import api_get_tree
    return api_get_tree()["tree"]
