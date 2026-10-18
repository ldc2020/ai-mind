/**
 * 前端运行配置：修改后刷新页面即可生效，不要在此填写 API Key。
 * 外观变量在 static/css/tokens.css；主题/布局/图标在 catalogs.js。
 * API 路径相对于当前站点，无须重复填写后端端口。
 */
const APP_CONFIG = {
    api: { basePath: '/api' },
    behavior: {
        autoSaveIntervalMs: 60_000, // 自动保存周期，单位毫秒，必须大于 0
        toastDurationMs: 2000, // 提示消息停留时间
        toastFadeMs: 300, // 提示消息淡出时间，与 CSS 动画协调
        tooltipHideDelayMs: 300, // 鼠标离开备注后延迟隐藏，便于移入浮层
        toolbarEnhanceDelaysMs: [300, 1000], // 富文本工具栏异步创建后的增强时机
    },
    ai: {
        baseUrl: 'https://api.openai.com/v1', // 用户设置优先于这里的默认值
        model: 'gpt-3.5-turbo',
        temperature: 0.7, // 生成随机程度，具体取值须符合所用模型要求
    },
    floatingNode: {
        text: '自由节点', attachedText: '新分支',
        x: 200, y: 200, // 未记录坐标时的默认位置；坐标 0 是有效值
        fontSize: 14, fillColor: '#ffffff', color: '#333333',
        borderColor: '#cccccc', borderWidth: 1,
        attachedGap: 60, // 依附节点与父节点的间距
        lineHeight: 1.4, horizontalPadding: 24, verticalPadding: 12,
        maxTags: 4,
    },
    colors: { accent: '#549688' }, // 自定义节点选中框、关联线等扩展控件默认强调色
    tooltip: { gap: 10, viewportMargin: 8, maxHeight: 640, editButtonHeight: 32 },
    export: { filename: 'mindmap' }, // 不含扩展名
    editor: {
        layout: 'logicalStructure', // 默认布局；已有文档优先使用自身布局
        theme: 'rainbow', // 新文档默认彩虹弧线；全部可选主题在 catalogs.js 的 THEMES 中
        maxTag: 5,
        isShowExpandNum: true,
        mousewheelAction: 'zoom',
        enableDblclickBackToRootNode: false, // 双击空白已用于创建自由节点
        enableNodeDrag: true,
        enableUml: false,
        fit: true,
        minZoomRatio: 10, // 百分比
        maxZoomRatio: 500,
    },
    // localStorage 的历史键名集中保留，避免升级后丢失用户偏好。
    storageKeys: {
        aiBaseUrl: 'ai_base_url', aiApiKey: 'ai_api_key', aiModel: 'ai_model',
        lastDocument: 'ai_mind_last_opened_uid', formatRule: 'ai_format_last_rule',
        textColor: 'wangeditor_last_text_color', backgroundColor: 'wangeditor_last_bg_color',
    },
};

if (!Number.isFinite(APP_CONFIG.behavior.autoSaveIntervalMs) || APP_CONFIG.behavior.autoSaveIntervalMs <= 0) {
    throw new Error('自动保存间隔必须为大于 0 的毫秒数');
}
