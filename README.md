# AI Mind - 思维导图应用

一款基于 Web 的思维导图应用，灵感来源于 XMind。后端使用 Python FastAPI，前端使用 vanilla HTML/CSS/JS，基于 [simple-mind-map](https://github.com/wanglin2/mind-map) (wanglin2/mind-map) 库构建。

## 功能特性

- **多种布局**：逻辑结构图、思维导图、组织结构图、目录组织图、时间轴、鱼骨图等多种布局
- **12 种主题**：默认、经典、清新蓝/绿/粉/紫、暗色、极简、明亮、雪白、暖阳、小黄人
- **节点编辑**：添加子节点/兄弟节点、删除节点、双击编辑文本
- **样式定制**：
  - 字体颜色、背景颜色、边框样式/颜色/粗细
  - 分支线样式/颜色/粗细
  - 粗体、斜体、下划线、删除线
  - 字号（10px ~ 72px）
- **标签系统**：为节点添加自定义标签
- **备注功能**：为节点添加详细备注（已升级为富文本编辑器，支持字体加粗、斜体、颜色更改、列表等富文本排版；支持长文本自适应宽度的阅读悬浮层）
- **超链接**：为节点绑定 URL 链接
- **图标**：优先级、进度、表情图标快速添加
- **关联线**：在任意节点（普通节点、自由节点、摘要节点）之间自由绘制关系线，支持控制点拖拽调整曲线形状、样式编辑和箭头切换
- **浮动节点**：自由浮动节点（无关联节点），支持拖拽、内联编辑、关系线连接
- **无限极衍生节点**：支持从摘要节点或浮动节点向外无限延伸创建依附节点，完美模拟原生的子节点生成效果
- **概要**：为多个节点添加概要总结
- **搜索替换**：全文搜索节点文本和备注，支持路径显示
- **导入**：支持导入 `.xmind` (XMind)、`.mm` (FreeMind)、`.md` (Markdown) 格式
- **导出**：导出为 PNG、SVG、PDF、Markdown 格式
- **文档状态记忆**：自动记录当前打开的文档，刷新或重启后无缝恢复工作状态
- **自动保存**：每分钟后台静默保存，防止数据丢失
- **撤销/重做**：完整的操作历史
- **键盘快捷键**：
  - `Ctrl+S` 保存
  - `Ctrl+Z` 撤销
  - `Ctrl+Shift+Z` / `Ctrl+Y` 重做
  - `Ctrl+F` 搜索
  - `Tab` 添加子节点
  - `Enter` 添加兄弟节点
  - `Delete` 删除节点

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Python FastAPI |
| 前端 | 原生 HTML + CSS + JavaScript |
| 思维导图库 | [simple-mind-map](https://github.com/wanglin2/mind-map) (v0.14.0-fix.2, UMD CDN) |
| 数据存储 | 文件系统 JSON (data/ 目录) |
| 运行服务器 | Uvicorn (热重载) |

## 快速开始

### 环境要求

- Python 3.8+

### 安装与运行

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务（默认 http://127.0.0.1:8001）
python main.py
```

打开浏览器访问 `http://127.0.0.1:8001` 即可使用。

## 项目结构

```
ai-mind/
├── main.py                 # FastAPI 入口、静态文件服务、路由注册、服务启动
├── storage.py              # 文件系统 CRUD，思维导图 JSON 文件的增删改查
├── routes/
│   └── mindmap.py          # REST API：列表/新建/获取/保存/删除/导入/导出
├── static/
│   ├── index.html          # 主页面：工具栏、侧边栏、画布、属性面板、模态框
│   ├── css/style.css       # XMind 风格 UI（CSS 变量、Flex 布局）
│   └── js/app.js           # 核心逻辑：思维导图初始化、工具栏、文件操作、属性编辑
├── data/                   # 保存的思维导图 JSON 文件（自动创建）
├── requirements.txt        # Python 依赖
└── .gitignore
```

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mindmaps` | 获取所有思维导图列表 |
| POST | `/api/mindmaps/new` | 创建默认思维导图 |
| GET | `/api/mindmaps/{uid}` | 获取指定思维导图 |
| PUT | `/api/mindmaps/{uid}` | 保存/更新思维导图 |
| DELETE | `/api/mindmaps/{uid}` | 删除思维导图 |
| POST | `/api/mindmaps/export` | 导出思维导图数据 |
| POST | `/api/mindmaps/import/file` | 上传文件导入 (.xmind/.mm/.md) |
| POST | `/api/mindmaps/import/markdown` | Markdown 文本导入 |

## 支持的布局

| 布局 | 说明 |
|------|------|
| `logicalStructure` | 逻辑结构图（默认） |
| `logicalStructureLeft` | 逻辑结构图（左向） |
| `mindMap` | 思维导图 |
| `organizationStructure` | 组织结构图 |
| `catalogOrganization` | 目录组织图 |
| `timeline` | 时间轴 |
| `timeline2` | 交替时间轴 |
| `verticalTimeline` | 垂直时间轴 |
| `fishbone` | 鱼骨图 |
| `fishbone2` | 鱼骨图2 |

## 许可证

MIT
