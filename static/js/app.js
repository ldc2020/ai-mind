// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
// ============ Init ============

function initRichTooltip() {
    // 初始化共享富文本备注悬浮层，并在离开画布时统一隐藏
    getRichNoteTooltipEl();
    const container = document.getElementById('mindMapContainer');
    if (!container || container.dataset.richTooltipBound === 'true') return;
    container.dataset.richTooltipBound = 'true';
    container.addEventListener('mouseleave', hideRichNoteTooltip);
    window.addEventListener('blur', hideRichNoteTooltip);
}

async function init() {
    // 设置表单提示与运行默认值保持一致。
    document.getElementById('ai-base-url-input').placeholder = APP_CONFIG.ai.baseUrl;
    document.getElementById('ai-model-input').placeholder = APP_CONFIG.ai.model;
    initRichTooltip();
    // 显示实际服务版本，便于确认 Windows 启动器是否已更新。
    apiFetch('/health').then(response => response.json()).then(info => {
        document.getElementById('status-version').textContent = info.version ? `v${info.version}` : '';
    }).catch(() => {});
    try {
        DEFAULT_DOCUMENT = await (await apiFetch('/default-document')).json();
        const res = await apiFetch('/mindmaps');
        const data = await res.json();
        if (data.mindmaps && data.mindmaps.length > 0) {
            let targetId = data.mindmaps[0].id;
            const lastOpenedId = localStorage.getItem(APP_CONFIG.storageKeys.lastDocument);
            if (lastOpenedId && data.mindmaps.some(m => m.id === lastOpenedId)) {
                targetId = lastOpenedId;
            }
            const mapRes = await apiFetch(`/mindmaps/${targetId}`);
            const mapData = await mapRes.json();
            currentUid = targetId;
            localStorage.setItem(APP_CONFIG.storageKeys.lastDocument, currentUid);
            initMindMap(mapData.mindmap);
            // 恢复关系线渲染
            if (mindMap && mindMap.associativeLine) {
                mindMap.associativeLine.renderAllLines();
            }
        } else {
            await newMindMap();
        }
        loadFileList();
    } catch (err) {
        console.error('Init failed:', err);
        showToast('初始化失败，请检查服务连接后刷新页面');
        return;
    }

    initIconsPanel();
    renderThemeGrid();

    // 按配置周期自动保存；失败时保持未保存状态，下一周期可重试。
    setInterval(() => {
        if (isDirty && mindMap) {
            autoSave();
        }
    }, APP_CONFIG.behavior.autoSaveIntervalMs);
}

document.addEventListener('DOMContentLoaded', init);
