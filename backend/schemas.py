"""请求结构，字段名称保留兼容现有前端。"""
from typing import Optional
from pydantic import BaseModel

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


