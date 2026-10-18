"""导图增删改查与导入导出接口。"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from backend.repository import (
    _scan_files,
    _load_mindmap, _save_mindmap, _delete_mindmap, _create_default_mindmap,
)
from backend.schemas import MindMapData
from backend.importers import _xmind_to_mindmap, _freemind_to_mindmap, _markdown_to_mindmap

from routes.tree import router as tree_router

router = APIRouter()
router.include_router(tree_router)

@router.get("/mindmaps")
def api_list_mindmaps():
    return {"mindmaps": _scan_files()}

@router.post("/mindmaps/new")
def api_new_mindmap(body: MindMapData | None = None):
    # 导入或恢复后首次保存可以携带正文；普通新建继续使用默认模板。
    uid = _save_mindmap(body.data) if body is not None else _create_default_mindmap()
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
