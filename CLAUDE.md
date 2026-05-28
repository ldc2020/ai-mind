# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Mind - A web-based mind mapping application inspired by XMind. Backend is Python (FastAPI), frontend is vanilla HTML/CSS/JS using the `simple-mind-map` library (wanglin2/mind-map) v0.14.0-fix.2 loaded via unpkg CDN.

## Dev Commands

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务（使用 ai-mind.exe 启动可让任务管理器显示 "ai-mind" 而非 "python"）
ai-mind main.py

# 如果 ai-mind 命令不可用，回退到 python
python main.py

# 浏览器访问
# http://127.0.0.1:8001
```

## Architecture

```
ai-mind/
├── main.py              # FastAPI entry, static serving, root redirect, uvicorn runner
├── storage.py           # File-based CRUD for mind map JSON files in data/
├── routes/
│   └── mindmap.py       # REST API: list/new/get/save/delete mind maps
├── static/
│   ├── index.html       # Main page: toolbar, sidebar, canvas, property panel
│   ├── css/style.css    # XMind-like clean UI (CSS variables, flex layout)
│   └── js/app.js        # Mind map init, toolbar handlers, file ops, sidebars
├── data/                # Saved mind map JSON files (auto-created)
└── requirements.txt
```

## Key Technical Decisions

- **Mind map library**: `simple-mind-map` (wanglin2/mind-map), UMD build via unpkg CDN. Constructor: `window.simpleMindMap.default`
- **Backend**: FastAPI with file-based JSON storage. No database needed.
- **Frontend**: Vanilla HTML+CSS+JS. No framework, no npm.
- **Layouts supported**: logicalStructure, mindMap, organizationStructure, catalogOrganization, timeline, fishbone
- **12 themes**: default, classic, blue, green, pink, purple, dark, simple, light, snow, warm, minions

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/mindmaps | List all mind maps |
| POST | /api/mindmaps/new | Create default mind map |
| GET | /api/mindmaps/{uid} | Get mind map by UID |
| PUT | /api/mindmaps/{uid} | Save mind map |
| DELETE | /api/mindmaps/{uid} | Delete mind map |

## Frontend Architecture (app.js)

The frontend is organized in these functional sections:

- **State**: `mindMap` instance, `currentUid`, `isDirty` flag
- **Init**: Loads first saved mind map on DOMContentLoaded, or creates default
- **File ops**: `newMindMap()`, `saveMindMap()`, `loadMindMap()`, `deleteMindMap()` — all async, talk to /api/*
- **Mind map init**: `initMindMap(data)` — creates MindMap instance, registers event listeners (data_change, node_active, view_data_change, draw_click)
- **UI updates**: `updateStatusBar()`, `updateZoomText()`, `updateOutline()`, `updatePropertyPanel()`
- **Toolbar**: Layout buttons (data-layout), zoom (+/-/fit), undo/redo, theme, style toggle, export PNG
- **Sidebar**: 3 tabs (file list / outline / icons), each with its own pane
- **Icons panel**: Priority, progress, emoji icons that can be added to active nodes
- **Modals**: Open file dialog, theme selector
- **Keyboard shortcuts**: Ctrl+S save, Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
- **Toast notifications**: In-app messages for save/export feedback

## simple-mind-map Library Usage

- Constructor: `new window.simpleMindMap.default(config)`
- Config options: `el`, `data`, `layout`, `theme`, `mousewheelAction`, `fit`, etc.
- Key APIs: `getData()`, `setLayout()`, `setTheme()`, `execCommand()`, `render()`, `export()`, `destroy()`
- View APIs: `view.enlarge()`, `view.narrow()`, `view.resetTransform()`, `view.moveNodeToCenter()`
- Events: `node_tree_render_end`, `data_change`, `node_active`, `view_data_change`, `draw_click`
- Node data: `{ data: { text, uid, expand, icon, tag, note, hyperlink, fontWeight, ... }, children: [] }`
- Export: `mindMap.export()` returns object with `.png()`, `.svg()`, `.pdf()` methods (async)

## Permission Config (Project-local)

Located in `.claude/settings.local.json` (gitignored):
- Bash commands allowed: `pip *`, `python *`, `curl *`
- Web tools: WebSearch, WebFetch for specific domains
- **Full execution permissions**: Claude has all tool permissions, no confirmation prompts needed. Proceed directly.

## Language & Coding Style

- **Code comments**: Use Chinese for all code comments
- **UI/Output**: All user-facing text, UI labels, and terminal output use Chinese
- **No confirmation prompts**: Claude should execute commands and make changes directly without asking "Do you want to proceed?" — just do it

  
