import xml.etree.ElementTree as ET
import zipfile
import io
import re

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from storage import (
    list_mindmaps,
    load_mindmap,
    save_mindmap,
    delete_mindmap,
    create_default_mindmap,
)

router = APIRouter()

class MindMapData(BaseModel):
    data: dict
    uid: str = None


@router.get("/mindmaps")
def api_list_mindmaps():
    """List all mind maps."""
    return {"mindmaps": list_mindmaps()}


@router.post("/mindmaps/new")
def api_new_mindmap():
    """Create a new mind map with default data."""
    uid = create_default_mindmap()
    return {"uid": uid, "mindmap": load_mindmap(uid)}


@router.get("/mindmaps/{uid}")
def api_get_mindmap(uid: str):
    """Get a mind map by UID."""
    data = load_mindmap(uid)
    if data is None:
        raise HTTPException(status_code=404, detail="Mind map not found")
    return {"uid": uid, "mindmap": data}


@router.put("/mindmaps/{uid}")
def api_save_mindmap(uid: str, body: MindMapData):
    """Save/update a mind map."""
    save_mindmap(body.data, uid)
    return {"uid": uid, "success": True}


@router.delete("/mindmaps/{uid}")
def api_delete_mindmap(uid: str):
    """Delete a mind map."""
    success = delete_mindmap(uid)
    if not success:
        raise HTTPException(status_code=404, detail="Mind map not found")
    return {"success": True}


@router.post("/mindmaps/export")
def api_export_mindmap(body: MindMapData):
    """Export mind map data as JSON (server-side)."""
    return body.data


def _xmind_to_mindmap(file_bytes):
    """Parse .xmind (ZIP) file content into mind map node tree."""
    mindmap_data = {"data": {"text": "导入的导图", "expand": True}, "children": []}

    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        # 新版 XMind (2020+) content.json
        if "content.json" in zf.namelist():
            import json
            content = json.loads(zf.read("content.json"))
            root_topic = content.get("rootTopic") or content.get("sheet", {}).get("rootTopic") or content
            _xmind_json_to_tree(root_topic, mindmap_data)
            return mindmap_data

        # 旧版 content.xml
        if "content.xml" in zf.namelist():
            xml_str = zf.read("content.xml").decode("utf-8", errors="replace")
            root = ET.fromstring(xml_str)
            topic_el = root.find(".//topic[@id='0']") or root.find(".//topic")
            if topic_el is not None:
                _xmind_xml_to_tree(topic_el, mindmap_data)
                return mindmap_data

    raise HTTPException(status_code=400, detail="无法解析 XMind 文件")


def _xmind_json_to_tree(topic, parent):
    """Convert XMind JSON topic to mind map node tree."""
    title = topic.get("title", "")
    parent["data"]["text"] = title or "未命名"

    children = topic.get("children", {}).get("attached", [])
    if not children:
        parent["children"] = []
        return

    parent["children"] = []
    for child in children:
        node = {"data": {"text": ""}, "children": []}
        # 提取笔记
        notes = child.get("notes", {}).get("plain", {}).get("content", "")
        if notes:
            node["data"]["note"] = notes
        # 提取超链接
        hyperlink = child.get("hyperlink", "")
        if hyperlink:
            node["data"]["hyperlink"] = hyperlink
        # 提取标签
        labels = child.get("labels", [])
        if labels:
            node["data"]["tag"] = labels

        _xmind_json_to_tree(child, node)
        parent["children"].append(node)


def _xmind_xml_to_tree(topic_el, parent):
    """Convert XMind XML topic element to mind map node tree."""
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


def _freemind_to_mindmap(xml_str: str) -> dict:
    """Parse FreeMind .mm XML content into mind map node tree."""
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


def _mm_node_to_tree(node_el, parent):
    """Convert FreeMind node element to mind map node tree."""
    text = node_el.get("TEXT", "")
    parent["data"]["text"] = text or "未命名"

    parent["children"] = []
    for child_el in node_el.findall("node"):
        node = {"data": {"text": ""}, "children": []}
        _mm_node_to_tree(child_el, node)
        parent["children"].append(node)


def _markdown_to_mindmap(text: str) -> dict:
    """Parse Markdown content into mind map node tree."""
    root = {"data": {"text": "导入文档"}, "children": []}
    stack = [{"node": root, "level": 0}]

    for line in text.split("\n"):
        # 标题: # ~ ######
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

        # 列表项: - * +
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

        # 普通文本
        if line.strip():
            node = {"data": {"text": line.strip()}, "children": []}
            stack[-1]["node"]["children"].append(node)

    return root


@router.post("/mindmaps/import/file")
async def api_import_file(file: UploadFile = File(...)):
    """Import mind map from uploaded file (.xmind / .mm / .md)."""
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

    uid = save_mindmap(mindmap_data)
    return {"uid": uid, "mindmap": mindmap_data, "success": True}


@router.post("/mindmaps/import/markdown")
def api_import_markdown(body: MindMapData):
    """Import mind map from Markdown text."""
    text = body.data.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Markdown 内容为空")

    mindmap_data = _markdown_to_mindmap(text)
    uid = save_mindmap(mindmap_data)
    return {"uid": uid, "mindmap": mindmap_data, "success": True}
