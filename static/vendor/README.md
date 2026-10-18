# 本地第三方依赖

本目录中的压缩 JS/CSS 从旧版 `static/js`、`static/css` 原样迁移，没有升级或修改。
`manifest.json` 记录各文件的 SHA256，用于固定当前实际运行的库内容。

- simpleMindMap：思维导图引擎；历史 README 标记为 v0.14.0-fix.2，实际文件以哈希为准。
- wangEditor：备注富文本编辑器。
- highlight.js：代码高亮。
- JSZip：XMind 压缩包读取。

升级时保留上游许可信息，更新哈希，检查 `static/js/engine/compatibility.js` 和自定义节点逻辑，再运行完整测试。
不要直接修改压缩文件来添加业务功能。
