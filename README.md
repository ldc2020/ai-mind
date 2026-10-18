# AI Mind

基于 simple-mind-map 的网页思维导图应用。前端使用原生 HTML/CSS/JavaScript，后端使用 FastAPI，文档以 JSON 保存在本地。

## 启动

Windows 已打包版本：双击 `dist/AI Mind.exe`。若旧版正在运行，先保存导图，从右下角托盘退出旧版，再打开新版；只关闭网页不会退出后台服务。新版页面右下角显示 `v1.2.0`。

`dist/launcher.exe` 已同步为同一份新版程序，原有快捷方式可以继续使用。以后打包会同时更新这两个入口；打包前请先退出运行中的程序，以免文件被占用。

主题菜单新增「彩虹弧线」「缤纷气泡」：每条主分支使用不同颜色，子节点和连线继承同一色系。新文档默认彩虹弧线；已有文档可在主题菜单切换，手动节点颜色优先保留。

EXE 放在本项目的 `dist` 中运行时继续使用原有 `data`。单独复制到其他位置时使用 `%LOCALAPPDATA%\AI Mind` 保存数据。程序自带页面和默认配置，不需要另行安装 Python。

需要 Python 3.10+；Node.js 只用于检查与浏览器测试，运行网页不需要 Node 服务。

```powershell
python -m pip install -r requirements.txt
python main.py
```

默认访问 `http://127.0.0.1:8001`。可将 `config/local.example.json` 复制为 `config/local.json` 后修改端口、数据目录等参数。

## 配置和架构

完整中文说明见 [架构与配置](docs/架构与配置.md)。常用修改位置：

| 需要修改 | 文件 |
| --- | --- |
| 端口、监听地址、数据目录、日志、热重载 | `config/defaults.json` / `config/local.json` |
| 新建导图的默认内容 | `config/default-document.json` |
| 自动保存、AI 默认值、缩放、浮动节点、备注浮层 | `static/js/config/app-config.js` |
| 导图主题、布局名称、图标、标签颜色 | `static/js/config/catalogs.js` |
| AI 排版提示词 | `static/js/config/prompts.js` |
| 页面颜色、面板宽度、圆角等 | `static/css/tokens.css` |

用户在设置窗口填写的 AI 参数优先于默认值。不要把 API Key 写入源码或提交到版本库。

## 检查与测试

```powershell
python -m pip install -r requirements-dev.txt
npm ci
npm run check
npm test
```

`npm test` 等同于 `python scripts/test.py`，覆盖接口、配置、文件夹、导入、浏览器编辑与保存。测试使用临时数据目录和独立端口，不会连接默认运行实例。浏览器截图输出到 `artifacts/tests/`。

Windows 测试优先使用已安装的 Chrome；也可用 `AI_MIND_BROWSER_PATH` 指定浏览器可执行文件。其他环境使用 Puppeteer 安装的浏览器。

Windows 重新打包和验收：

```powershell
python -m pip install -r requirements-launcher.txt
python scripts/build_windows.py
python scripts/test_windows.py
```

打包测试把 EXE 复制到独立临时目录，使用临时文档和独立端口运行完整浏览器回归，避免只测源码而遗漏 EXE 中的资源。

## 目录

```text
config/                 后端默认配置、本地覆盖示例、文档模板
backend/                持久化、导入转换、请求结构
routes/                 导图与文件树 HTTP 接口
static/
  js/config/            前端参数、配色目录、AI 提示词
  js/core/              共享编辑状态及基础访问函数
  js/engine/            引擎初始化与版本兼容补丁
  js/features/          文件、备注、思维导图功能
  js/services/          API 请求封装
  js/ui/                界面事件与弹窗交互
  js/app.js             页面启动入口
  css/                  外观变量与页面样式
  vendor/               原样保留的第三方库及内容校验清单
tests/                  正式回归测试；legacy 为历史实验归档
scripts/                检查与测试入口；legacy 为旧调试脚本
docs/                   架构、配置、历史功能与开发记录
artifacts/              截图与实验产物，legacy 保存历史素材
data/                   用户文档，默认位置，可配置，不提交
main.py                 网页服务启动入口
storage.py              历史 Python 文档读写兼容入口
launcher.py             原有可选托盘启动器，不属于网页必需组件
```

历史功能细节见 [历史功能说明](docs/历史功能说明.md)，历史排查过程见 [历史开发记录](docs/历史开发记录.md)。其中旧目录与启动说明以本 README 为准。
