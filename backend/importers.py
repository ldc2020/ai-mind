"""导入格式转换：只转换数据，不写文件，不依赖 HTTP 请求。"""
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET

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
            # XMind 新版以工作表数组保存；旧版对象格式仍然兼容。
            if isinstance(content, list):
                if not content:
                    raise ValueError("XMind 文件没有工作表")
                content = content[0]
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
    raise ValueError("无法解析 XMind 文件")

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
        raise ValueError("无法解析 FreeMind 文件")
    first_node = map_el.find("node")
    if first_node is None:
        raise ValueError("FreeMind 文件没有节点")
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

