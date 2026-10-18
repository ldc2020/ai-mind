// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
/**
 * AI Mind - 思维导图应用
 * 基于 simple-mind-map 库
 */

const MindMap = window.simpleMindMap.default;

// ============ State ============
let mindMap = null;
window.mindMap = null; // expose for testing
let currentUid = null;
let currentThemeKey = APP_CONFIG.editor.theme; // 应用主题名与库内置主题名分开保存
let isDirty = false;

// 浮动节点（无关联的自由节点）
let floatingNodes = [];
let _floatingNodeEditingUid = null; // 正在内联编辑的浮动节点UID
let _ctrlHeld = false; // 追踪 Ctrl 键是否按下，用于多选逻辑
let wangEditorInstance = null; // 备注富文本编辑器实例
let _activeGenUid = null; // 当前选中（单击）的摘要节点UID，用于控制+号显示
// 富文本上次使用的文字/背景颜色：全局记忆，跨文档/节点共享，页面加载即从 localStorage 恢复
let _lastUsedTextColor = (() => { try { return localStorage.getItem(APP_CONFIG.storageKeys.textColor) || null; } catch (_) { return null; } })();
let _lastUsedBgColor = (() => { try { return localStorage.getItem(APP_CONFIG.storageKeys.backgroundColor) || null; } catch (_) { return null; } })();

// 过滤HTML标签工具函数

// 启动时从共享模板接口加载，初始化失败时不伪造空白文档。
let DEFAULT_DOCUMENT = null;
