/**
 * AI Mind - 思维导图应用
 * 基于 simple-mind-map 库
 */

const MindMap = window.simpleMindMap.default;

// ============ State ============
let mindMap = null;
let currentUid = null;
let isDirty = false;

// 追踪当前选中节点的引用（直接从库事件获取）
let activeNodeCache = [];
// 暴露给外部（Playwright 测试等），通过 getter 保持引用同步
Object.defineProperty(window, 'activeNodeCache', {
    get() { return activeNodeCache; },
    set(v) { activeNodeCache = v; },
    configurable: true,
    enumerable: true,
});

// 搜索状态
let searchState = {
    results: [],
    currentIndex: -1,
    keyword: '',
};

// 关联线箭头显示状态（独立于节点数据，避免重渲染后丢失）
window._assocLineArrowMap = new Map();

// 获取所有节点（替代 renderer.getNodeList，此版本不存在该方法）
function getAllNodes() {
    if (!mindMap || !mindMap.renderer) return [];
    const cache = mindMap.renderer.nodeCache;
    if (!cache) return [];
    return Object.values(cache);
}

// 在数据树中通过 UID 查找节点（用于 setData 操作）
function findNodeInData(data, uid) {
    if (!data || !data.data) return null;
    if (data.data.uid === uid) return data;
    if (data.children) {
        for (const child of data.children) {
            const found = findNodeInData(child, uid);
            if (found) return found;
        }
    }
    return null;
}

// ============ 分支线全局样式初始化 ============
let _branchLineGlobalStyle = {
    dasharray: '',
    color: '',
    width: 0,
};

function initBranchLineStyle() {
    _branchLineGlobalStyle = {
        dasharray: '',
        color: '',
        width: 0,
    };
}

// 获取分支线样式描述文本
function getBranchLineStyleLabel(dash) {
    if (dash === '5,5') return '虚线';
    if (dash === '2,2') return '点线';
    return '实线';
}

// 获取关联线的默认样式常量
const ASSOC_LINE_DASH_OPTIONS = [
    { value: '6,4', label: '虚线' },
    { value: 'none', label: '实线' },
    { value: '2,2', label: '点线' },
];
const THEMES = [
    { key: 'default', label: '默认', color: '#5b7aff' },
    { key: 'classic', label: '经典', color: '#f5a623' },
    { key: 'blue', label: '清新蓝', color: '#4a90d9' },
    { key: 'green', label: '清新绿', color: '#7ed321' },
    { key: 'pink', label: '粉色', color: '#f78da7' },
    { key: 'purple', label: '紫色', color: '#ab8ce4' },
    { key: 'dark', label: '暗色', color: '#2c2c2e' },
    { key: 'simple', label: '极简', color: '#e8e8ed' },
    { key: 'light', label: '明亮', color: '#fff4e5' },
    { key: 'snow', label: '雪白', color: '#e0f2fe' },
    { key: 'warm', label: '暖阳', color: '#fef3c7' },
    { key: 'minions', label: '小黄人', color: '#fcdb03' },
];

const LAYOUT_LABELS = {
    logicalStructure: '逻辑结构图',
    logicalStructureLeft: '逻辑结构图(左)',
    mindMap: '思维导图',
    organizationStructure: '组织结构图',
    catalogOrganization: '目录组织图',
    timeline: '时间轴',
    timeline2: '交替时间轴',
    verticalTimeline: '垂直时间轴',
    fishbone: '鱼骨图',
    fishbone2: '鱼骨图2',
};

const BORDER_STYLES = [
    { value: 'solid', label: '实线' },
    { value: 'dashed', label: '虚线' },
    { value: 'dotted', label: '点线' },
];

// ============ Icons Data ============
const ICONS_DATA = {
    priority: [
        { name: '优先级1', icon: '⬆️' },
        { name: '优先级2', icon: '🔼' },
        { name: '优先级3', icon: '🔽' },
        { name: '优先级4', icon: '⬇️' },
    ],
    progress: [
        { name: '未开始', icon: '⭕' },
        { name: '进行中', icon: '🔄' },
        { name: '已完成', icon: '✅' },
        { name: '暂停', icon: '⏸️' },
        { name: '取消', icon: '❌' },
    ],
    icon: [
        { name: '星星', icon: '⭐' },
        { name: '心', icon: '❤️' },
        { name: '问号', icon: '❓' },
        { name: '感叹号', icon: '❗' },
        { name: '灯泡', icon: '💡' },
        { name: '提示', icon: '💡' },
        { name: '时钟', icon: '⏰' },
        { name: '日历', icon: '📅' },
        { name: '重要', icon: '🔴' },
        { name: '想法', icon: '💭' },
    ],
};

// ============ Initialize Mind Map ============
function initMindMap(data) {
    const container = document.getElementById('mindMapContainer');
    container.innerHTML = '';

    const config = {
        el: container,
        data: data || {
            data: { text: '中心主题', expand: true },
            children: [
                { data: { text: '双击编辑', expand: true }, children: [] },
                { data: { text: '按 Tab 添加子节点', expand: true }, children: [] },
            ],
        },
        layout: 'logicalStructure',
        theme: 'default',
        maxTag: 5,
        isShowExpandNum: true,
        mousewheelAction: 'zoom',
        enableDblclickBackToRootNode: true,
        enableNodeDrag: true,
        enableUml: false,
        fit: true,
        minZoomRatio: 10,
        maxZoomRatio: 500,
        // 自定义分支线渲染（v0.12.2+）
        customHandleLine: (node, line, { width, color, dasharray }) => {
            const nodeData = node.getData();
            // 记录当前主题的分支线颜色，用作关联线默认颜色
            if (color) {
                window._branchLineGlobalStyle.color = color;
            }
            // 应用节点级分支线样式
            const finalDash = nodeData.lineDasharray !== undefined ? nodeData.lineDasharray : dasharray;
            const finalColor = nodeData.lineColor || color;
            const finalWidth = nodeData.lineWidth || width;
            if (finalDash !== undefined && finalDash !== null) {
                line.attr('stroke-dasharray', finalDash || 'none');
            }
            if (finalColor) {
                line.attr('stroke', finalColor);
            }
            if (finalWidth) {
                line.attr('stroke-width', finalWidth);
            }
        },
    };

    mindMap = new MindMap(config);
    window.mindMap = mindMap;
    // 包裹 renderAllLines 以自动恢复关联线箭头状态
    patchRenderAllLines();

    // ============ 用customHandleLine实现分支线样式 ============
    // 存储当前分支线全局样式设置
    window._branchLineGlobalStyle = {
        dasharray: '',      // ''=实线 '5,5'=虚线 '2,2'=点线
        color: '',
        width: 0,
    };

    // 监听 associative_line_click 事件，用于在属性面板中编辑关联线样式
    mindMap.on('associative_line_click', (path, clickPath, node, toNode) => {
        // 使用 setTimeout 确保在其他事件处理后执行
        setTimeout(() => {
            window._activeAssociativeLine = { node, toNode };
            // 初始化箭头状态到全局 Map（独立于节点数据）
            const mapKey = node.getData('uid') + '->' + toNode.getData('uid');
            if (!window._assocLineArrowMap.has(mapKey)) {
                window._assocLineArrowMap.set(mapKey, true);
            }
            // 首次激活关联线时，保存默认线型和颜色，与分支线保持一致
            const style = node.getData('associativeLineStyle') || {};
            const uid = toNode.getData('uid');
            if (!style[uid] || style[uid].associativeLineDasharray === undefined) {
                if (!style[uid]) style[uid] = {};
                style[uid].associativeLineDasharray = '6,4';
                // 同步分支线颜色作为关联线默认颜色
                if (!style[uid].associativeLineColor) {
                    style[uid].associativeLineColor = window._branchLineGlobalStyle.color || '';
                }
                mindMap.associativeLine.isNotRenderAllLines = true;
                node.setData({ associativeLineStyle: style });
                // 立即更新当前路径的渲染
                const activeLine = mindMap.associativeLine.activeLine;
                if (activeLine && activeLine[0]) {
                    activeLine[0].stroke({ dasharray: '6,4' });
                    if (style[uid].associativeLineColor) {
                        activeLine[0].stroke({ color: style[uid].associativeLineColor });
                    }
                }
            }
            updatePropertyPanel();
        }, 50);
    });
    mindMap.on('associative_line_deactivate', () => {
        window._activeAssociativeLine = null;
        updatePropertyPanel();
    });

    initBranchLineStyle();

    let _svgHandlerAttached = false;

    mindMap.on('node_tree_render_end', () => {
        updateStatusBar();
        updateOutline();
        // 每次关联线渲染完成后重新应用箭头状态（库的 renderAllLines 总会创建箭头）
        setTimeout(applyAssocLineArrowStates, 0);
        if (!_svgHandlerAttached) {
            _svgHandlerAttached = true;
            const svgEl = container.querySelector('svg');
            if (svgEl) {
                svgEl.addEventListener('click', () => {
                    setTimeout(() => {
                        if (activeNodeCache.length === 0) {
                            try {
                                const list = mindMap.renderer.activeNodeList;
                                if (list && list.length > 0) {
                                    activeNodeCache = list;
                                    updatePropertyPanel();
                                }
                            } catch (err) {
                                console.error(err);
                            }
                        }
                    }, 100);
                }, true);
            }
        }
    });

    mindMap.on('data_change', () => {
        isDirty = true;
        updateStatusBar();
        updateOutline();
    });

    mindMap.on('view_data_change', () => {
        updateZoomText();
    });

    mindMap.on('draw_click', () => {
        activeNodeCache = [];
        _updatingPropertyPanel = false;
        updatePropertyPanel();
    });

    // 节点选中事件
    mindMap.on('node_active', (node, activeList) => {
        if (activeList && activeList.length > 0) {
            activeNodeCache = activeList;
        } else if (node && typeof node.getData === 'function') {
            activeNodeCache = [node];
        } else {
            activeNodeCache = [];
        }
        setTimeout(updatePropertyPanel, 30);
    });
}

// ============ File Operations ============
async function autoSave() {
    if (!isDirty || !mindMap) return;
    const data = mindMap.getData();
    if (currentUid) {
        try {
            await fetch(`/api/mindmaps/${currentUid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: data }),
            });
            isDirty = false;
        } catch (err) {
            console.error('自动保存失败:', err);
        }
    }
}

async function loadFileList() {
    try {
        const res = await fetch('/api/mindmaps');
        const data = await res.json();
        renderFileList(data.mindmaps);
        renderOpenFileList(data.mindmaps);
    } catch (err) {
        console.error('加载文件列表失败:', err);
    }
}

async function newMindMap() {
    await autoSave();
    try {
        const res = await fetch('/api/mindmaps/new', { method: 'POST' });
        const data = await res.json();
        currentUid = data.uid;
        isDirty = false;
        if (mindMap) {
            mindMap.destroy();
        }
        initMindMap(data.mindmap);
        loadFileList();
    } catch (err) {
        console.error('创建导图失败:', err);
    }
}

async function saveMindMap() {
    if (!mindMap) return;
    const data = mindMap.getData();
    if (currentUid) {
        try {
            await fetch(`/api/mindmaps/${currentUid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: data }),
            });
            isDirty = false;
            loadFileList();
            showToast('保存成功');
        } catch (err) {
            console.error('保存失败:', err);
            showToast('保存失败');
        }
    } else {
        try {
            const res = await fetch('/api/mindmaps/new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: data }),
            });
            const result = await res.json();
            currentUid = result.uid;
            isDirty = false;
            loadFileList();
            showToast('保存成功');
        } catch (err) {
            console.error('保存失败:', err);
        }
    }
}

async function loadMindMap(uid) {
    await autoSave();
    try {
        const res = await fetch(`/api/mindmaps/${uid}`);
        const data = await res.json();
        currentUid = uid;
        isDirty = false;
        if (mindMap) {
            mindMap.destroy();
        }
        initMindMap(data.mindmap);
        // 恢复关系线渲染
        if (mindMap && mindMap.associativeLine) {
            mindMap.associativeLine.renderAllLines();
        }
        closeModal('modal-open');
        loadFileList();
    } catch (err) {
        console.error('加载导图失败:', err);
    }
}

async function deleteMindMap(uid) {
    if (!confirm('确定删除此文件？')) return;
    try {
        await fetch(`/api/mindmaps/${uid}`, { method: 'DELETE' });
        if (currentUid === uid) {
            currentUid = null;
            newMindMap();
        }
        loadFileList();
    } catch (err) {
        console.error('删除失败:', err);
    }
}

// ============ Node Deletion ============
function deleteActiveNode() {
    if (!mindMap) return;
    const nodes = activeNodeCache.length > 0 ? activeNodeCache :
        (mindMap.renderer.activeNodeList || []);
    if (nodes.length === 0) {
        showToast('请先选中一个节点');
        return;
    }
    const node = nodes[0];
    try {
        mindMap.renderer.removeNode(node, true);
        isDirty = true;
        activeNodeCache = [];
        setTimeout(updatePropertyPanel, 50);
    } catch (e) {
        console.error('删除节点失败:', e);
        showToast('删除节点失败');
    }
}

// ============ Render Functions ============
function renderFileList(mindmaps) {
    const list = document.getElementById('file-list');
    if (!mindmaps || mindmaps.length === 0) {
        list.innerHTML = '<p class="empty-hint">暂无文件</p>';
        return;
    }
    list.innerHTML = mindmaps.map(m => `
        <div class="file-list-item" data-uid="${m.id}">
            <div class="file-icon">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" fill="currentColor"/></svg>
            </div>
            <div class="file-info">
                <div class="file-name">${stripHtml(m.title)}</div>
                <div class="file-date">${new Date(m.updated_at).toLocaleString()}</div>
            </div>
            <button class="file-delete" data-uid="${m.id}" title="删除">&times;</button>
        </div>
    `).join('');

    list.querySelectorAll('.file-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.file-delete')) return;
            loadMindMap(item.dataset.uid);
        });
    });

    list.querySelectorAll('.file-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteMindMap(btn.dataset.uid);
        });
    });
}

function renderOpenFileList(mindmaps) {
    const list = document.getElementById('open-file-list');
    if (!list) return;
    if (!mindmaps || mindmaps.length === 0) {
        list.innerHTML = '<p class="empty-hint">暂无文件，先新建一个吧</p>';
        return;
    }
    list.innerHTML = mindmaps.map(m => `
        <div class="file-list-item" data-uid="${m.id}">
            <div class="file-icon">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" fill="currentColor"/></svg>
            </div>
            <div class="file-info">
                <div class="file-name">${stripHtml(m.title)}</div>
                <div class="file-date">${new Date(m.updated_at).toLocaleString()}</div>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.file-list-item').forEach(item => {
        item.addEventListener('click', () => {
            loadMindMap(item.dataset.uid);
        });
    });
}

function updateStatusBar() {
    if (!mindMap) return;
    const count = getAllNodes().length;
    document.getElementById('status-node-count').textContent = `节点: ${count}`;
    const layout = mindMap.getData().layout || mindMap.opt.layout;
    document.getElementById('status-layout').textContent = LAYOUT_LABELS[layout] || layout;
}

function updateZoomText() {
    if (!mindMap) return;
    const transform = mindMap.view.getTransformData();
    const scale = transform && transform.state ? transform.state.scale : null;
    const pct = (typeof scale === 'number' && !isNaN(scale)) ? Math.round(scale * 100) + '%' : '100%';
    document.getElementById('zoom-text').textContent = pct;
}

function updateOutline() {
    if (!mindMap) return;
    const container = document.getElementById('outline-tree');
    const data = mindMap.getData();
    container.innerHTML = buildOutlineHTML(data);
    container.querySelectorAll('.outline-item').forEach(el => {
        el.addEventListener('click', () => {
            const uid = el.dataset.uid;
            const node = getAllNodes().find(n => n.getData('uid') === uid);
            if (node) {
                mindMap.renderer.moveNodeToCenter(node);
                mindMap.execCommand('ACTIVE_NODE', [uid]);
            }
        });
    });
    container.querySelectorAll('.outline-toggle').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const uid = el.dataset.uid;
            const node = getAllNodes().find(n => n.getData('uid') === uid);
            if (node) {
                const expanded = node.getData('expand');
                mindMap.execCommand('EXPAND_NODE', uid, !expanded);
            }
        });
    });
}

function buildOutlineHTML(data, depth = 0) {
    if (!data) return '';
    const text = data.data && data.data.text ? data.data.text : '';
    const uid = data.data && data.data.uid ? data.data.uid : '';
    const expand = data.data && data.data.expand !== false;
    const hasChildren = data.children && data.children.length > 0;
    let html = `<li>`;
    html += `<div class="outline-item" data-uid="${uid}" style="padding-left:${depth * 16 + 6}px">`;
    if (hasChildren) {
        html += `<span class="outline-toggle" data-uid="${uid}">${expand ? '▼' : '▶'}</span>`;
    } else {
        html += `<span class="outline-toggle" style="visibility:hidden">▶</span>`;
    }
    html += stripHtml(text);
    html += `</div>`;
    if (hasChildren && expand) {
        html += `<ul>`;
        data.children.forEach(child => {
            html += buildOutlineHTML(child, depth + 1);
        });
        html += `</ul>`;
    }
    html += `</li>`;
    return html;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function stripHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerHTML = text;
    return div.textContent.trim();
}

// ============ Property Panel (Style, Tags, Notes, Links) ============
let _updatingPropertyPanel = false;

function updatePropertyPanel() {
    if (_updatingPropertyPanel) return;
    _updatingPropertyPanel = true;
    try {
        const body = document.getElementById('property-body');
        if (!mindMap) {
            body.innerHTML = '<p class="empty-hint">选中节点查看属性</p>';
            return;
        }

        // 关联线样式编辑模式
        if (window._activeAssociativeLine) {
            renderAssociationLinePanel(body);
            return;
        }

        let activeNodes = activeNodeCache;
        if (!activeNodes || activeNodes.length === 0) {
            // 回退：从 renderer 获取
            if (mindMap.renderer && mindMap.renderer.activeNodeList && mindMap.renderer.activeNodeList.length > 0) {
                activeNodes = mindMap.renderer.activeNodeList;
                activeNodeCache = activeNodes;
            } else {
                // 最后回退：扫描所有节点的 isActive 标记
                const allNodes = getAllNodes();
                activeNodes = allNodes.filter(n => n.getData && n.getData('isActive') === true);
                if (activeNodes.length > 0) activeNodeCache = activeNodes;
            }
            if (!activeNodes || activeNodes.length === 0) {
                body.innerHTML = '<p class="empty-hint">选中节点查看属性</p>';
                return;
            }
        }

        const node = activeNodes[0];
    const data = node.getData();
    const fontColor = data.color || data.fontColor || '';
    const bgColor = data.fillColor || data.background || '';
    const borderColor = data.borderColor || '';
    // borderDasharray: ''=实线, '5,5'=虚线, '2,2'=点线
    const rawDash = data.borderDasharray || '';
    const borderStyle = rawDash === '5,5' ? 'dashed' : (rawDash === '2,2' ? 'dotted' : 'solid');
    const borderWidth = data.borderWidth || 2;
    const lineStyle = data.lineDasharray === '5,5' ? 'dashed' : (data.lineDasharray === '2,2' ? 'dotted' : 'solid');
    const lineColor = data.lineColor || '';
    const lineWidth = data.lineWidth || 2;
    const fontWeight = data.fontWeight || 'normal';
    const fontStyle = data.fontStyle || 'normal';
    const textDecoration = data.textDecoration || 'none';
    const fontSize = data.fontSize || 16;
    const tags = data.tag || [];
    const note = data.note || '';
    const hyperlink = data.hyperlink || '';
    const hasNote = !!note;
    const hasLink = !!hyperlink;

    body.innerHTML = `
        <!-- 字体颜色 -->
        <div class="property-group">
            <div class="property-group-label">文字颜色</div>
            <div class="property-color-wrap">
                <div class="property-color" style="background:${fontColor || '#2c2c2e'}">
                    <input type="color" class="property-color-input" id="prop-font-color" value="${fontColor || '#2c2c2e'}">
                </div>
                <button class="btn btn-sm" id="prop-font-color-reset" title="重置">重置</button>
            </div>
        </div>

        <!-- 背景颜色 -->
        <div class="property-group">
            <div class="property-group-label">背景颜色</div>
            <div class="property-color-wrap">
                <div class="property-color" style="background:${bgColor || '#ffffff'}">
                    <input type="color" class="property-color-input" id="prop-bg-color" value="${bgColor || '#ffffff'}">
                </div>
                <button class="btn btn-sm" id="prop-bg-color-reset" title="重置">重置</button>
            </div>
        </div>

        <!-- 边框 -->
        <div class="property-group">
            <div class="property-group-label">边框</div>
            <div class="property-row">
                <div class="property-color" style="background:${borderColor || '#e8e8ed'}">
                    <input type="color" class="property-color-input" id="prop-border-color" value="${borderColor || '#e8e8ed'}">
                </div>
                <select class="property-select" id="prop-border-style">
                    ${BORDER_STYLES.map(s => `<option value="${s.value}" ${s.value === borderStyle ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
            </div>
            <div class="property-row">
                <span style="font-size:11px;color:var(--text-muted)">粗细</span>
                <input type="range" class="property-range" id="prop-border-width" min="0" max="8" value="${borderWidth}">
                <span class="property-range-value" id="prop-border-width-val">${borderWidth}</span>
            </div>
        </div>

        <!-- 分支线 -->
        <div class="property-group">
            <div class="property-group-label">分支线</div>
            <div class="property-row">
                <select class="property-select" id="prop-line-style">
                    ${BORDER_STYLES.map(s => `<option value="${s.value}" ${s.value === lineStyle ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
            </div>
            <div class="property-row">
                <div class="property-color" style="background:${lineColor || '#888'}">
                    <input type="color" class="property-color-input" id="prop-line-color" value="${lineColor || '#888888'}">
                </div>
                <span style="font-size:11px;color:var(--text-muted);margin-left:4px">粗细</span>
                <input type="range" class="property-range" id="prop-line-width" min="0" max="8" value="${lineWidth}">
                <span class="property-range-value" id="prop-line-width-val">${lineWidth}</span>
                <button class="btn btn-sm" id="prop-line-reset" title="重置">重置</button>
            </div>
        </div>

        <!-- 文字样式 -->
        <div class="property-group">
            <div class="property-group-label">文字样式</div>
            <div class="property-row">
                <button class="btn btn-sm ${fontWeight === 'bold' ? 'btn-primary' : ''}" id="prop-bold" title="粗体">B</button>
                <button class="btn btn-sm ${fontStyle === 'italic' ? 'btn-primary' : ''}" id="prop-italic" title="斜体"><i>I</i></button>
                <button class="btn btn-sm ${textDecoration === 'underline' ? 'btn-primary' : ''}" id="prop-underline" title="下划线"><u>U</u></button>
                <button class="btn btn-sm ${textDecoration === 'line-through' ? 'btn-primary' : ''}" id="prop-strikethrough" title="删除线"><s>S</s></button>
            </div>
            <div class="property-row">
                <span style="font-size:11px;color:var(--text-muted)">字号</span>
                <input type="range" class="property-range" id="prop-font-size" min="10" max="72" value="${fontSize}">
                <span class="property-range-value" id="prop-font-size-val">${fontSize}</span>
            </div>
        </div>

        <!-- 标签 -->
        <div class="property-group">
            <div class="property-group-label">标签</div>
            <div class="property-tags" id="prop-tags-container">
                ${tags.map(t => `<span class="property-tag">${escapeHtml(t)}<span class="property-tag-remove" data-tag="${escapeHtml(t)}">&times;</span></span>`).join('')}
            </div>
            <div class="property-tag-input-wrap">
                <input type="text" class="property-tag-input" id="prop-tag-input" placeholder="输入标签后回车" maxlength="20">
                <button class="property-tag-add-btn" id="prop-tag-add">添加</button>
            </div>
        </div>

        <!-- 备注 -->
        <div class="property-group">
            <div class="property-group-label">备注</div>
            <button class="property-btn ${hasNote ? 'has-content' : ''}" id="prop-edit-note">
                ${hasNote ? '📝 ' + escapeHtml(note.substring(0, 30)) + (note.length > 30 ? '...' : '') : '📝 添加备注...'}
            </button>
        </div>

        <!-- 超链接 -->
        <div class="property-group">
            <div class="property-group-label">超链接</div>
            <button class="property-btn ${hasLink ? 'has-content' : ''}" id="prop-edit-link">
                ${hasLink ? '🔗 ' + escapeHtml(hyperlink.substring(0, 30)) + (hyperlink.length > 30 ? '...' : '') : '🔗 添加链接...'}
            </button>
        </div>
    `;

    // --- 事件绑定 ---

    // 字体颜色
    document.getElementById('prop-font-color').addEventListener('input', (e) => {
        node.setData({ color: e.target.value, fontColor: e.target.value });
        mindMap.render();
        mindMap.command.addHistory();
        // 更新显示
        updatePropertyPanel();
    });
    document.getElementById('prop-font-color-reset').addEventListener('click', () => {
        node.setData({ color: null, fontColor: null });
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 背景颜色（库使用 fillColor）
    document.getElementById('prop-bg-color').addEventListener('input', (e) => {
        mindMap.renderer.setNodeStyle(node, 'fillColor', e.target.value);
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });
    document.getElementById('prop-bg-color-reset').addEventListener('click', () => {
        mindMap.renderer.setNodeStyle(node, 'fillColor', null);
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 边框颜色
    document.getElementById('prop-border-color').addEventListener('input', (e) => {
        mindMap.renderer.setNodeStyle(node, 'borderColor', e.target.value);
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 边框样式（库使用 borderDasharray: ''=实线 '5,5'=虚线 '2,2'=点线）
    document.getElementById('prop-border-style').addEventListener('change', (e) => {
        let dash = '';
        if (e.target.value === 'dashed') dash = '5,5';
        else if (e.target.value === 'dotted') dash = '2,2';
        mindMap.renderer.setNodeStyle(node, 'borderDasharray', dash);
        mindMap.render();
        mindMap.command.addHistory();
    });

    // 边框粗细
    const bwSlider = document.getElementById('prop-border-width');
    const bwVal = document.getElementById('prop-border-width-val');
    bwSlider.addEventListener('input', () => {
        bwVal.textContent = bwSlider.value;
    });
    bwSlider.addEventListener('change', () => {
        mindMap.renderer.setNodeStyle(node, 'borderWidth', parseInt(bwSlider.value));
        mindMap.render();
        mindMap.command.addHistory();
    });

    // 分支线样式
    document.getElementById('prop-line-style').addEventListener('change', (e) => {
        let dash = '';
        if (e.target.value === 'dashed') dash = '5,5';
        else if (e.target.value === 'dotted') dash = '2,2';
        node.setData({ lineDasharray: dash });
        mindMap.render();
        mindMap.command.addHistory();
    });

    // 分支线颜色
    document.getElementById('prop-line-color').addEventListener('input', (e) => {
        node.setData({ lineColor: e.target.value });
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 分支线粗细
    const lwSlider = document.getElementById('prop-line-width');
    const lwVal = document.getElementById('prop-line-width-val');
    lwSlider.addEventListener('input', () => {
        lwVal.textContent = lwSlider.value;
    });
    lwSlider.addEventListener('change', () => {
        node.setData({ lineWidth: parseInt(lwSlider.value) || 2 });
        mindMap.render();
        mindMap.command.addHistory();
    });

    // 分支线重置
    document.getElementById('prop-line-reset').addEventListener('click', () => {
        node.setData({ lineDasharray: null, lineColor: null, lineWidth: null });
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 粗体
    document.getElementById('prop-bold').addEventListener('click', () => {
        const current = node.getData('fontWeight');
        node.setData({ fontWeight: current === 'bold' ? 'normal' : 'bold' });
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 斜体
    document.getElementById('prop-italic').addEventListener('click', () => {
        const current = node.getData('fontStyle');
        node.setData({ fontStyle: current === 'italic' ? 'normal' : 'italic' });
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 下划线
    document.getElementById('prop-underline').addEventListener('click', () => {
        const current = node.getData('textDecoration');
        node.setData({ textDecoration: current === 'underline' ? 'none' : 'underline' });
        mindMap.render();
        mindMap.command.addHistory();
    });

    // 删除线
    document.getElementById('prop-strikethrough').addEventListener('click', () => {
        const current = node.getData('textDecoration');
        node.setData({ textDecoration: current === 'line-through' ? 'none' : 'line-through' });
        mindMap.render();
        mindMap.command.addHistory();
        updatePropertyPanel();
    });

    // 标签
    setupTagEditor(node);

    // 备注
    document.getElementById('prop-edit-note').addEventListener('click', () => {
        openNoteEditor(node);
    });

    // 超链接
    document.getElementById('prop-edit-link').addEventListener('click', () => {
        openLinkEditor(node);
    });

    } finally {
        _updatingPropertyPanel = false;
    }
}

// 每次关联线重新渲染后，重新应用箭头隐藏状态
function applyAssocLineArrowStates() {
    try {
        const al = mindMap && mindMap.associativeLine;
        if (!al || !al.lineList) return;
        al.lineList.forEach(([path, , , node, toNode]) => {
            const mapKey = node.getData('uid') + '->' + toNode.getData('uid');
            if (window._assocLineArrowMap.get(mapKey) === false) {
                path.attr('marker-end', '');
            }
        });
    } catch (e) {
        // 忽略错误
    }
}

// 替换库的 renderAllLines 方法，在渲染后自动应用箭头状态
function patchRenderAllLines() {
    if (!mindMap || !mindMap.associativeLine) return;
    const orig = mindMap.associativeLine.renderAllLines;
    if (orig._patched) return; // 避免重复包裹
    const patched = function(...args) {
        const result = orig.apply(this, args);
        setTimeout(applyAssocLineArrowStates, 0);
        return result;
    };
    patched._patched = true;
    mindMap.associativeLine.renderAllLines = patched;
}

// ============ 关联线样式面板 ============
function renderAssociationLinePanel(body) {
    const assoc = window._activeAssociativeLine;
    if (!assoc || !assoc.node || !assoc.toNode) {
        body.innerHTML = '<p class="empty-hint">关联线已失效</p>';
        window._activeAssociativeLine = null;
        return;
    }
    const node = assoc.node;
    const toNode = assoc.toNode;
    const toUid = toNode.getData('uid');

    // 获取当前关联线样式
    const lineStyles = node.getData('associativeLineStyle') || {};
    const currentStyle = lineStyles[toUid] || {};
    // dashValue: '6,4'=虚线, 'none'=实线, '2,2'=点线，默认虚线
    const dashValue = currentStyle.associativeLineDasharray || '6,4';
    const lineColor = currentStyle.associativeLineColor || window._branchLineGlobalStyle.color || '#333';
    const lineWidth = currentStyle.associativeLineWidth || 2;
    // 箭头默认显示（除非显式设为 false）
    const mapKey = node.getData('uid') + '->' + toNode.getData('uid');
    const showArrow = window._assocLineArrowMap.get(mapKey) !== false;

    body.innerHTML = `
        <div class="property-group">
            <div class="property-group-label" style="color:var(--accent);font-weight:600">关联线样式</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
                ${escapeHtml(node.getData('text'))} → ${escapeHtml(toNode.getData('text'))}
            </div>
            <!-- 线型：实线/虚线/点线 -->
            <div class="property-row">
                <select class="property-select" id="assoc-line-style">
                    ${ASSOC_LINE_DASH_OPTIONS.map(s => `<option value="${s.value}" ${s.value === dashValue ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
            </div>
            <!-- 颜色 -->
            <div class="property-row">
                <div class="property-color" style="background:${lineColor}">
                    <input type="color" class="property-color-input" id="assoc-line-color" value="${lineColor}">
                </div>
                <span style="font-size:11px;color:var(--text-muted);margin-left:4px">粗细</span>
                <input type="range" class="property-range" id="assoc-line-width" min="1" max="8" value="${lineWidth}">
                <span class="property-range-value" id="assoc-line-width-val">${lineWidth}</span>
            </div>
            <!-- 箭头开关 -->
            <div class="property-row">
                <label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="assoc-line-arrow" ${showArrow ? 'checked' : ''}> 显示箭头
                </label>
            </div>
            <div class="property-row" style="margin-top:8px">
                <button class="btn btn-sm" id="assoc-line-reset" title="重置样式">重置样式</button>
                <button class="btn btn-sm" id="assoc-line-delete" style="color:#e55" title="删除关联线">删除关联线</button>
            </div>
            <div style="margin-top:8px;text-align:right">
                <button class="btn btn-sm" id="assoc-line-done">完成</button>
            </div>
        </div>
    `;

    // 保存关联线样式数据，同时防止 data_change → renderAllLines 销毁激活状态
    function saveAssocStyle(prop, value) {
        const updated = node.getData('associativeLineStyle') || {};
        if (!updated[toUid]) updated[toUid] = {};
        updated[toUid][prop] = value;
        // 关键：设置标志位阻止 renderAllLines 销毁激活状态
        mindMap.associativeLine.isNotRenderAllLines = true;
        node.setData({ associativeLineStyle: updated });
        // renderAllLines 被跳过，activeLine 仍然有效
    }

    // 保存样式并刷新显示
    function updateStyle(prop, value) {
        saveAssocStyle(prop, value);
        mindMap.associativeLine.updateActiveLineStyle();

        // 恢复箭头（updateActiveLineStyle 设回了 isNotRenderAllLines=true）
        setTimeout(() => {
            const al = mindMap.associativeLine.activeLine;
            if (!al || !al[0]) return;
            if (window._assocLineArrowMap.get(mapKey) === false) {
                al[0].attr('marker-end', '');
            }
        }, 0);
    }

    // 删除关联线
    function deleteAssocLine() {
        mindMap.associativeLine.removeLine();
        window._assocLineArrowMap.delete(mapKey);
        window._activeAssociativeLine = null;
        updatePropertyPanel();
    }

    // 完成
    function doneEditing() {
        window._activeAssociativeLine = null;
        mindMap.associativeLine.clearActiveLine();
        mindMap.associativeLine.renderAllLines();
        updatePropertyPanel();
    }

    // ---- 强制应用初始样式到路径 ----
    // 确保面板打开时路径样式与下拉框选择一致
    setTimeout(() => {
        const ial = mindMap.associativeLine.activeLine;
        if (ial && ial[0]) {
            mindMap.associativeLine.updateActiveLineStyle();
            // 强制设置路径样式以匹配面板显示
            ial[0].stroke({ dasharray: dashValue === 'none' ? 'none' : dashValue });
        }
    }, 0);

    // ---- 事件绑定 ----

    // 线型
    document.getElementById('assoc-line-style').addEventListener('change', (e) => {
        updateStyle('associativeLineDasharray', e.target.value);
    });

    // 颜色
    document.getElementById('assoc-line-color').addEventListener('input', (e) => {
        const c = e.target.value;
        saveAssocStyle('associativeLineColor', c);
        saveAssocStyle('associativeLineActiveColor', c);
        mindMap.associativeLine.updateActiveLineStyle();
        // 同步 markerPath 颜色
        setTimeout(() => {
            const al = mindMap.associativeLine.activeLine;
            if (al && al[5]) {
                al[5].stroke({ color: c }).fill({ color: c });
            }
        }, 0);
        document.querySelector('#assoc-line-color').parentElement.style.background = c;
    });

    // 粗细
    const lwSlider = document.getElementById('assoc-line-width');
    const lwVal = document.getElementById('assoc-line-width-val');
    lwSlider.addEventListener('input', () => { lwVal.textContent = lwSlider.value; });
    lwSlider.addEventListener('change', () => {
        updateStyle('associativeLineWidth', parseInt(lwSlider.value));
    });

    // 箭头切换
    document.getElementById('assoc-line-arrow').addEventListener('change', (e) => {
        const show = e.target.checked;
        window._assocLineArrowMap.set(mapKey, show);

        const al = mindMap.associativeLine.activeLine;
        if (!al || !al[0]) return;

        if (show) {
            const s = node.getData('associativeLineStyle') || {};
            const cur = s[toUid] || {};
            const c = cur.associativeLineColor || window._branchLineGlobalStyle.color || '#333';
            const marker = mindMap.associativeLine.createMarker(p => {
                p.stroke({ color: c }).fill({ color: c });
            });
            al[0].marker('end', marker);
        } else {
            al[0].attr('marker-end', '');
        }
    });

    // 重置
    document.getElementById('assoc-line-reset').addEventListener('click', () => {
        const updated = node.getData('associativeLineStyle') || {};
        delete updated[toUid];
        mindMap.associativeLine.isNotRenderAllLines = true;
        node.setData({ associativeLineStyle: updated });
        window._assocLineArrowMap.set(mapKey, true);
        // 恢复路径颜色到分支线默认色
        const resetColor = window._branchLineGlobalStyle.color || '#333';
        mindMap.associativeLine.updateActiveLineStyle();
        setTimeout(() => {
            const al = mindMap.associativeLine.activeLine;
            if (al && al[0]) {
                al[0].stroke({ color: resetColor });
                const marker = mindMap.associativeLine.createMarker(p => {
                    p.stroke({ color: resetColor }).fill({ color: resetColor });
                });
                al[0].marker('end', marker);
            }
        }, 0);
        renderAssociationLinePanel(body);
    });

    // 删除
    document.getElementById('assoc-line-delete').addEventListener('click', deleteAssocLine);

    // 完成
    document.getElementById('assoc-line-done').addEventListener('click', doneEditing);
}

// ============ Tag Editor ============
function setupTagEditor(node) {
    const input = document.getElementById('prop-tag-input');
    const addBtn = document.getElementById('prop-tag-add');

    function addTag() {
        const tag = input.value.trim();
        if (!tag) return;
        const tags = node.getData('tag') || [];
        if (tags.includes(tag)) {
            showToast('标签已存在');
            return;
        }
        tags.push(tag);
        node.setData({ tag: tags });
        mindMap.render();
        mindMap.command.addHistory();
        input.value = '';
        updatePropertyPanel();
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addTag();
    });
    addBtn.addEventListener('click', addTag);

    // 删除标签
    document.querySelectorAll('.property-tag-remove').forEach(el => {
        el.addEventListener('click', () => {
            const tag = el.dataset.tag;
            const tags = node.getData('tag') || [];
            const idx = tags.indexOf(tag);
            if (idx > -1) tags.splice(idx, 1);
            node.setData({ tag: tags });
            mindMap.render();
            mindMap.command.addHistory();
            updatePropertyPanel();
        });
    });
}

// ============ Note Editor ============
function openNoteEditor(node) {
    const textarea = document.getElementById('note-input');
    textarea.value = node.getData('note') || '';
    openModal('modal-note');

    document.getElementById('modal-note-save').onclick = () => {
        const note = textarea.value.trim();
        node.setData({ note: note || null });
        mindMap.render();
        mindMap.command.addHistory();
        closeModal('modal-note');
        updatePropertyPanel();
        showToast(note ? '备注已保存' : '备注已移除');
    };
}

// ============ Link Editor ============
function openLinkEditor(node) {
    const linkInput = document.getElementById('link-input');
    const textInput = document.getElementById('link-text-input');
    const currentLink = node.getData('hyperlink') || '';
    linkInput.value = currentLink;
    textInput.value = '';
    openModal('modal-link');

    document.getElementById('modal-link-save').onclick = () => {
        const url = linkInput.value.trim();
        node.setData({ hyperlink: url || null });
        if (url && textInput.value.trim()) {
            node.setData({ hyperlinkText: textInput.value.trim() });
        }
        mindMap.render();
        mindMap.command.addHistory();
        closeModal('modal-link');
        updatePropertyPanel();
        showToast(url ? '链接已保存' : '链接已移除');
    };

    document.getElementById('modal-link-remove').onclick = () => {
        node.setData({ hyperlink: null });
        node.setData({ hyperlinkText: null });
        mindMap.render();
        mindMap.command.addHistory();
        closeModal('modal-link');
        updatePropertyPanel();
        showToast('链接已移除');
    };
}

// ============ Search & Replace ============
function openSearch() {
    searchState.results = [];
    searchState.currentIndex = -1;
    searchState.keyword = '';
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-count').textContent = '0/0';
    openModal('modal-search');
    setTimeout(() => document.getElementById('search-input').focus(), 100);
}

function performSearch() {
    const keyword = document.getElementById('search-input').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('search-results');
    const countEl = document.getElementById('search-count');

    if (!keyword || !mindMap) {
        resultsContainer.innerHTML = '';
        countEl.textContent = '0/0';
        searchState.results = [];
        searchState.currentIndex = -1;
        return;
    }

    searchState.keyword = keyword;
    const allNodes = getAllNodes();
    const results = [];

    // 构建路径映射
    function buildPath(node, pathMap) {
        const children = node.children || [];
        children.forEach(child => {
            pathMap[child.getData('uid')] = pathMap[node.getData('uid')] || [];
            pathMap[child.getData('uid')] = [...pathMap[child.getData('uid')], node.getData('text') || ''];
            buildPath(child, pathMap);
        });
    }

    const pathMap = {};
    const rootUids = [];
    allNodes.forEach(n => {
        const parent = n.parent;
        if (!parent) rootUids.push(n.getData('uid'));
    });
    rootUids.forEach(uid => { pathMap[uid] = []; });

    // 只从根节点构建路径
    allNodes.forEach(n => {
        const uid = n.getData('uid');
        if (!pathMap[uid]) {
            const parent = n.parent;
            if (parent) {
                const parentUid = parent.getData('uid');
                pathMap[uid] = [...(pathMap[parentUid] || []), parent.getData('text') || ''];
            } else {
                pathMap[uid] = [];
            }
        }
        const children = n.children || [];
        children.forEach(child => {
            const childUid = child.getData('uid');
            pathMap[childUid] = [...(pathMap[uid] || []), n.getData('text') || ''];
        });
    });

    allNodes.forEach(node => {
        const text = (node.getData('text') || '').toLowerCase();
        const note = (node.getData('note') || '').toLowerCase();
        if (text.includes(keyword) || note.includes(keyword)) {
            const uid = node.getData('uid');
            results.push({
                uid,
                text: node.getData('text') || '',
                note: node.getData('note') || '',
                path: pathMap[uid] || [],
            });
        }
    });

    searchState.results = results;
    searchState.currentIndex = results.length > 0 ? 0 : -1;
    countEl.textContent = `${results.length > 0 ? 1 : 0}/${results.length}`;

    renderSearchResults();

    if (results.length > 0) {
        highlightSearchResult(0);
    }
}

function renderSearchResults() {
    const container = document.getElementById('search-results');
    if (searchState.results.length === 0) {
        container.innerHTML = '<p class="empty-hint">未找到匹配节点</p>';
        return;
    }
    container.innerHTML = searchState.results.map((r, i) => {
        const pathStr = r.path.length > 0 ? r.path.join(' > ') : '根节点';
        const highlightedText = highlightKeyword(escapeHtml(r.text), searchState.keyword);
        return `<div class="search-result-item ${i === searchState.currentIndex ? 'active' : ''}" data-index="${i}">
            <div>${highlightedText}</div>
            <div class="search-result-path">${escapeHtml(pathStr)}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.index);
            searchState.currentIndex = idx;
            highlightSearchResult(idx);
        });
    });
}

function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="search-result-match">$1</span>');
}

function highlightSearchResult(index) {
    if (index < 0 || index >= searchState.results.length) return;
    const result = searchState.results[index];
    const node = getAllNodes().find(n => n.getData('uid') === result.uid);
    if (node) {
        mindMap.execCommand('ACTIVE_NODE', [result.uid]);
        mindMap.renderer.moveNodeToCenter(node);
        isDirty = true;
    }
    document.getElementById('search-count').textContent = `${index + 1}/${searchState.results.length}`;

    // 高亮搜索结果项
    document.querySelectorAll('.search-result-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.index) === index);
    });
    // 滚动到可见
    const activeEl = document.querySelector('.search-result-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function searchPrev() {
    if (searchState.results.length === 0) return;
    searchState.currentIndex = (searchState.currentIndex - 1 + searchState.results.length) % searchState.results.length;
    highlightSearchResult(searchState.currentIndex);
}

function searchNext() {
    if (searchState.results.length === 0) return;
    searchState.currentIndex = (searchState.currentIndex + 1) % searchState.results.length;
    highlightSearchResult(searchState.currentIndex);
}

// ============ Export Functions ============
async function exportMindMap(format) {
    if (!mindMap) return;
    closeModal('modal-export');
    try {
        const exportApi = mindMap.export();
        switch (format) {
            case 'png':
                await exportPNG(exportApi);
                break;
            case 'svg':
                await exportSVG(exportApi);
                break;
            case 'pdf':
                await exportPDF(exportApi);
                break;
            case 'markdown':
                exportMarkdown();
                break;
        }
    } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败');
    }
}

async function exportPNG(exportApi) {
    const url = await exportApi.png();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.png';
    a.click();
    showToast('PNG 导出成功');
}

async function exportSVG(exportApi) {
    const blob = await exportApi.svg();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.svg';
    a.click();
    URL.revokeObjectURL(url);
    showToast('SVG 导出成功');
}

async function exportPDF(exportApi) {
    const blob = await exportApi.pdf();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.pdf';
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF 导出成功');
}

function exportMarkdown() {
    const data = mindMap.getData();
    const md = buildMarkdown(data, 1);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.md';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Markdown 导出成功');
}

function buildMarkdown(data, level) {
    if (!data || !data.data) return '';
    const text = data.data.text || '';
    const prefix = '#'.repeat(level);
    let md = `${prefix} ${text}\n\n`;
    if (data.children) {
        data.children.forEach(child => {
            md += buildMarkdown(child, level + 1);
        });
    }
    return md;
}

// ============ Import Functions ============
function openImportDialog() {
    openModal('modal-import');
    // 重置状态
    document.getElementById('import-status').textContent = '';
    document.getElementById('import-file-input').value = '';
    document.getElementById('import-markdown-input').value = '';
    // 切换到文件tab
    document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.import-pane').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-import-type="file"]').classList.add('active');
    document.getElementById('import-file-pane').classList.add('active');
}

function handleImportFile(file) {
    const status = document.getElementById('import-status');
    const ext = file.name.split('.').pop().toLowerCase();

    status.textContent = `正在导入 ${file.name}...`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            let mindmapData;
            const content = e.target.result;

            if (ext === 'md' || ext === 'markdown') {
                mindmapData = parseMarkdown(content);
            } else if (ext === 'xmind') {
                mindmapData = await parseXMind(content);
            } else if (ext === 'mm') {
                mindmapData = parseFreeMind(content);
            } else {
                status.textContent = '不支持的文件格式';
                return;
            }

            if (mindmapData) {
                await applyImportedData(mindmapData);
                status.textContent = '导入成功！';
                closeModal('modal-import');
                showToast('导入成功');
            } else {
                status.textContent = '解析失败，请检查文件格式';
            }
        } catch (err) {
            console.error('导入出错:', err);
            status.textContent = '导入出错: ' + err.message;
        }
    };

    if (ext === 'xmind') {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file, 'UTF-8');
    }
}

async function parseXMind(buffer) {
    // XMind 文件是 ZIP 格式，包含 content.xml 或 content.json
    // 使用 JSZip 解析
    try {
        const JSZip = window.JSZip;
        if (!JSZip) {
            // 动态加载 JSZip
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        const zip = await JSZip.loadAsync(buffer);

        // 新版 XMind (2020+) 使用 content.json
        let contentFile = zip.file('content.json');
        if (contentFile) {
            const jsonStr = await contentFile.async('text');
            const data = JSON.parse(jsonStr);
            return convertXMindJSON(data);
        }

        // 旧版 XMind 使用 content.xml
        contentFile = zip.file('content.xml');
        if (contentFile) {
            const xmlStr = await contentFile.async('text');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
            return convertXMindXML(xmlDoc);
        }

        throw new Error('无法找到 mind map 数据');
    } catch (err) {
        console.error('解析 XMind 失败:', err);
        throw new Error('XMind 解析失败: ' + err.message);
    }
}

function convertXMindJSON(data) {
    // XMind 2020+ JSON 格式
    const rootTopic = data.rootTopic || data.sheet?.rootTopic || data;
    if (!rootTopic) return null;

    function convertTopic(topic) {
        const title = topic.title || topic.topic?.title || '';
        const children = topic.children?.attached || [];
        const notes = topic.notes?.plain?.content || '';
        const hyperlink = topic.hyperlink || '';
        const labels = topic.labels || [];

        const result = {
            data: { text: title },
            children: children.map(child => convertTopic(child)),
        };

        if (notes) result.data.note = notes;
        if (hyperlink) result.data.hyperlink = hyperlink;
        if (labels.length > 0) result.data.tag = labels;

        return result;
    }

    return convertTopic(rootTopic);
}

function convertXMindXML(xmlDoc) {
    // 旧版 XMind XML 格式
    const rootTopic = xmlDoc.querySelector('topic[id="0"]') || xmlDoc.querySelector('topic');
    if (!rootTopic) return null;

    function convertXMLTopic(topicEl) {
        const title = topicEl.getAttribute('text') ||
            (topicEl.querySelector('title')?.textContent) ||
            topicEl.textContent?.split('\n')[0]?.trim() || '';
        const children = [];
        const childTopics = topicEl.querySelectorAll(':scope > children > topic');
        childTopics.forEach(child => children.push(convertXMLTopic(child)));

        return {
            data: { text: title },
            children: children,
        };
    }

    return convertXMLTopic(rootTopic);
}

function parseFreeMind(xmlStr) {
    // FreeMind .mm 格式
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

    function convertMMTopic(topicEl) {
        const text = topicEl.getAttribute('TEXT') || '';
        const children = [];
        const childTopics = topicEl.querySelectorAll(':scope > node');
        childTopics.forEach(child => children.push(convertMMTopic(child)));

        return {
            data: { text },
            children: children,
        };
    }

    const root = xmlDoc.querySelector('map > node') || xmlDoc.querySelector('node');
    if (!root) throw new Error('无法解析 FreeMind 文件');
    return convertMMTopic(root);
}

function parseMarkdown(text) {
    const lines = text.split('\n');
    const root = { data: { text: '导入文档' }, children: [] };
    const stack = [{ node: root, level: 0 }];

    let inList = false;
    let currentListParent = null;

    lines.forEach(line => {
        // 标题
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();
            const newNode = { data: { text }, children: [] };

            // 找到合适的父节点
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            stack[stack.length - 1].node.children.push(newNode);
            stack.push({ node: newNode, level });
            inList = false;
            return;
        }

        // 列表项
        const listMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
        if (listMatch) {
            const indent = listMatch[1].length;
            const text = listMatch[2].trim();
            const newNode = { data: { text }, children: [] };

            if (!inList) {
                // 直接添加到当前顶层
                const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
                parent.children.push(newNode);
                currentListParent = newNode;
                inList = true;
            } else {
                currentListParent.children.push(newNode);
                currentListParent = newNode;
            }

            // 列表项的缩进层级
            const level = Math.floor(indent / 2) + (stack.length > 0 ? stack[stack.length - 1].level : 0) + 1;
            stack.push({ node: newNode, level });
            return;
        }

        // 普通文本
        if (line.trim()) {
            const text = line.trim();
            const newNode = { data: { text }, children: [] };
            const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
            parent.children.push(newNode);
            inList = false;
        }
    });

    return root;
}

async function applyImportedData(data) {
    await autoSave();
    if (mindMap) {
        mindMap.destroy();
    }
    currentUid = null;
    isDirty = false;
    initMindMap(data);
    updatePropertyPanel();
}

// ============ Relationship & Summary ============
function addAssociation() {
    if (!mindMap) return;
    const activeNodes = activeNodeCache;
    if (activeNodes.length < 2) {
        showToast('请按住 Ctrl 选中两个节点来添加关系线');
        return;
    }

    const fromNode = activeNodes[0];
    const toNode = activeNodes[1];

    // 保存分支线颜色作为关联线初始颜色
    const assocStyle = fromNode.getData('associativeLineStyle') || {};
    const toUid = toNode.getData('uid');
    if (!assocStyle[toUid]) {
        assocStyle[toUid] = {};
    }
    if (!assocStyle[toUid].associativeLineColor) {
        assocStyle[toUid].associativeLineColor = window._branchLineGlobalStyle.color || '';
    }
    if (assocStyle[toUid].associativeLineDasharray === undefined) {
        assocStyle[toUid].associativeLineDasharray = '6,4';
    }
    fromNode.setData({ associativeLineStyle: assocStyle });

    // 使用关联线插件的 addLine 方法，将关系数据存储在起始节点的数据中
    mindMap.associativeLine.addLine(fromNode, toNode);

    // 直接渲染关联线（mindMap.render() 不会自动触发 renderAllLines）
    mindMap.associativeLine.renderAllLines();

    mindMap.command.addHistory();
    showToast('关系线已添加，点击可编辑样式');
}

function addSummary() {
    if (!mindMap) return;
    const activeNodes = activeNodeCache;
    if (!activeNodes || activeNodes.length < 2) {
        showToast('请按住 Ctrl 选中多个节点来添加概要');
        return;
    }

    const uids = activeNodes.map(n => n.getData('uid'));
    mindMap.renderer.addGeneralization({
        uid: 'gen_' + Date.now(),
        nodeUid: uids,
        text: '概要',
        color: '#ff9500',
    });
    mindMap.command.addHistory();
    showToast('概要已添加');
}

// ============ Sidebar Tabs ============
let _tabSwitchTimer = 0;

// 在捕获阶段提前切换标签页，确保先于思维导图库的全局鼠标事件
document.addEventListener('mousedown', (e) => {
    const tab = e.target.closest('.sidebar-tab');
    if (!tab) return;

    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const pane = document.getElementById('pane-' + tab.dataset.tab);
    pane.classList.add('active');

    // 切换后短暂禁用面板内的点击，防止同一鼠标动作误触面板内容
    clearTimeout(_tabSwitchTimer);
    pane.style.pointerEvents = 'none';
    _tabSwitchTimer = setTimeout(() => {
        pane.style.pointerEvents = '';
    }, 350);
}, true);

// ============ Icons Panel ============
function initIconsPanel() {
    Object.entries(ICONS_DATA).forEach(([type, icons]) => {
        const grid = document.querySelector(`.icons-grid[data-type="${type}"]`);
        if (!grid) return;
        grid.innerHTML = icons.map(icon => `
            <button class="icon-btn" data-icon="${icon.icon}" title="${icon.name}">${icon.icon}</button>
        `).join('');

        grid.querySelectorAll('.icon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!mindMap) return;
                const activeNodes = activeNodeCache;
                if (activeNodes && activeNodes.length > 0) {
                    activeNodes.forEach(node => {
                        const currentIcons = node.getData('icon') || [];
                        currentIcons.push('<' + btn.dataset.icon + '>');
                        node.setData({ icon: currentIcons });
                    });
                    mindMap.render();
                    mindMap.command.addHistory();
                } else {
                    showToast('请先选中一个节点');
                }
            });
        });
    });
}

// ============ Toolbar Handlers ============

// Layout buttons
document.querySelectorAll('[data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!mindMap) return;
        const layout = btn.dataset.layout;
        mindMap.setLayout(layout);
        document.querySelectorAll('[data-layout]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateStatusBar();
    });
});

// File operations
document.getElementById('btn-new').addEventListener('click', newMindMap);
document.getElementById('btn-save').addEventListener('click', saveMindMap);
document.getElementById('btn-open').addEventListener('click', () => {
    loadFileList();
    openModal('modal-open');
});

// Undo/Redo
document.getElementById('btn-undo').addEventListener('click', () => {
    if (mindMap) mindMap.execCommand('UNDO');
});
document.getElementById('btn-redo').addEventListener('click', () => {
    if (mindMap) mindMap.execCommand('REDO');
});

// Zoom
document.getElementById('btn-zoom-out').addEventListener('click', () => {
    if (mindMap) mindMap.view.narrow();
});
document.getElementById('btn-zoom-in').addEventListener('click', () => {
    if (mindMap) mindMap.view.enlarge();
});
document.getElementById('btn-fit').addEventListener('click', () => {
    if (!mindMap) return;
    mindMap.view.fit();
});

// Theme
document.getElementById('btn-theme').addEventListener('click', () => {
    renderThemeGrid();
    openModal('modal-theme');
});

// Style toggle - 高亮属性面板并滚动到顶部
document.getElementById('btn-style').addEventListener('click', () => {
    if (!mindMap) return;
    const activeNodes = activeNodeCache;
    if (!activeNodes || activeNodes.length === 0) {
        showToast('请先选中一个节点');
        return;
    }
    const panel = document.querySelector('.property-panel');
    if (panel) {
        panel.scrollTop = 0;
        // 添加高亮闪烁效果
        panel.style.transition = 'box-shadow 0.3s';
        panel.style.boxShadow = 'inset 0 0 0 2px var(--primary, #5b7aff)';
        setTimeout(() => { panel.style.boxShadow = ''; }, 1500);
    }
});

// Add child node - 通过数据树操作添加子节点
document.getElementById('btn-add-child').addEventListener('click', () => {
    if (!mindMap) return;
    const nodes = activeNodeCache.length > 0 ? activeNodeCache :
        (mindMap.renderer.activeNodeList || []);
    if (nodes.length === 0) {
        showToast('请先选中一个节点');
        return;
    }
    const parentNode = nodes[0];
    const parentUid = parentNode.getData('uid');
    const data = mindMap.getData();
    const parentData = findNodeInData(data, parentUid);
    if (!parentData) {
        showToast('找不到父节点');
        return;
    }
    if (!parentData.children) parentData.children = [];
    parentData.children.push({
        data: { text: '新节点', expand: true },
        children: [],
    });
    mindMap.setData(data);
    mindMap.render();
    mindMap.command.addHistory();
    isDirty = true;
});

// Add sibling node - 通过数据树操作添加兄弟节点
document.getElementById('btn-add-sibling').addEventListener('click', () => {
    if (!mindMap) return;
    const nodes = activeNodeCache.length > 0 ? activeNodeCache :
        (mindMap.renderer.activeNodeList || []);
    if (nodes.length === 0) {
        showToast('请先选中一个节点');
        return;
    }
    const node = nodes[0];
    const parent = node.parent;
    if (!parent) {
        showToast('根节点不能添加兄弟节点');
        return;
    }
    const parentUid = parent.getData('uid');
    const data = mindMap.getData();
    const parentData = findNodeInData(data, parentUid);
    if (!parentData) {
        showToast('找不到父节点');
        return;
    }
    if (!parentData.children) parentData.children = [];
    parentData.children.push({
        data: { text: '新节点', expand: true },
        children: [],
    });
    mindMap.setData(data);
    mindMap.render();
    mindMap.command.addHistory();
    isDirty = true;
});

// Delete node
document.getElementById('btn-delete-node').addEventListener('click', deleteActiveNode);

// Search
document.getElementById('btn-search').addEventListener('click', openSearch);

// Export
document.getElementById('btn-export').addEventListener('click', () => {
    openModal('modal-export');
});

// Import
document.getElementById('btn-import').addEventListener('click', openImportDialog);

// Association & Summary
document.getElementById('btn-add-association').addEventListener('click', addAssociation);
document.getElementById('btn-add-summary').addEventListener('click', addSummary);

// ============ Export Modal ============
document.querySelectorAll('.export-item').forEach(item => {
    item.addEventListener('click', () => {
        exportMindMap(item.dataset.format);
    });
});

// ============ Import Modal ============
document.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.import-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('import-' + tab.dataset.importType + '-pane').classList.add('active');
    });
});

document.getElementById('import-file-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImportFile(e.target.files[0]);
    }
});

// 拖拽上传
const dropzone = document.getElementById('import-dropzone');
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleImportFile(e.dataTransfer.files[0]);
    }
});
dropzone.addEventListener('click', () => {
    document.getElementById('import-file-input').click();
});

document.getElementById('import-markdown-btn').addEventListener('click', async () => {
    const text = document.getElementById('import-markdown-input').value.trim();
    if (!text) {
        showToast('请输入 Markdown 内容');
        return;
    }
    const data = parseMarkdown(text);
    if (data) {
        await applyImportedData(data);
        closeModal('modal-import');
        showToast('导入成功');
    }
});

// ============ Search Modal Events ============
document.getElementById('search-input').addEventListener('input', performSearch);
document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.shiftKey ? searchPrev() : searchNext();
    }
});
document.getElementById('search-prev').addEventListener('click', searchPrev);
document.getElementById('search-next').addEventListener('click', searchNext);

// ============ Modal Common Events ============
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
        if (e.target === el || e.target.classList.contains('modal-close')) {
            el.closest('.modal-overlay').style.display = 'none';
        }
    });
});

// 各模态框取消按钮
document.getElementById('modal-open-cancel').addEventListener('click', () => closeModal('modal-open'));
document.getElementById('modal-search-cancel').addEventListener('click', () => closeModal('modal-search'));
document.getElementById('modal-note-cancel').addEventListener('click', () => closeModal('modal-note'));
document.getElementById('modal-link-cancel').addEventListener('click', () => closeModal('modal-link'));

// 模态框关闭时清理状态
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('transitionend', () => {
        if (overlay.style.display === 'none') {
            // 备注模态框关闭时清理事件
            if (overlay.id === 'modal-note') {
                document.getElementById('modal-note-save').onclick = null;
            }
            if (overlay.id === 'modal-link') {
                document.getElementById('modal-link-save').onclick = null;
                document.getElementById('modal-link-remove').onclick = null;
            }
        }
    });
});

// 点击快捷键方式关闭搜索/备注/链接
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ['modal-open', 'modal-search', 'modal-note', 'modal-link', 'modal-theme', 'modal-export', 'modal-import'].forEach(id => {
            const el = document.getElementById(id);
            if (el.style.display === 'flex') closeModal(id);
        });
    }
});

// ============ Toast ============
function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '8px 20px',
        borderRadius: '20px',
        fontSize: '13px',
        zIndex: '99999',
        pointerEvents: 'none',
        transition: 'opacity 0.3s',
    });
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============ Theme ============
function renderThemeGrid() {
    const grid = document.getElementById('theme-grid');
    const currentTheme = mindMap ? (mindMap.opt.theme || mindMap.getData().theme || 'default') : 'default';
    grid.innerHTML = THEMES.map(t => `
        <div class="theme-item ${t.key === currentTheme ? 'active' : ''}" data-theme="${t.key}">
            <div class="theme-preview" style="background:${t.color}"></div>
            <div>${t.label}</div>
        </div>
    `).join('');

    grid.querySelectorAll('.theme-item').forEach(item => {
        item.addEventListener('click', () => {
            const theme = item.dataset.theme;
            if (mindMap) {
                mindMap.setTheme(theme);
                mindMap.render();
            }
            grid.querySelectorAll('.theme-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            closeModal('modal-theme');
        });
    });
}

// ============ Helper: Load Script ============
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ============ Keyboard Shortcuts ============
document.addEventListener('keydown', (e) => {
    const target = e.target;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Ctrl+S or Cmd+S - 保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveMindMap();
        return;
    }

    // Ctrl+Z - 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !isInput) {
        e.preventDefault();
        if (mindMap) mindMap.execCommand('UNDO');
        return;
    }

    // Ctrl+Shift+Z or Ctrl+Y - 重做
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !isInput) {
        e.preventDefault();
        if (mindMap) mindMap.execCommand('REDO');
        return;
    }

    // Ctrl+F - 搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        openSearch();
        return;
    }

    // Delete - 删除节点 (不在输入框中)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        deleteActiveNode();
        return;
    }
});



// ============ Init ============
async function init() {
    try {
        const res = await fetch('/api/mindmaps');
        const data = await res.json();
        if (data.mindmaps && data.mindmaps.length > 0) {
            const first = data.mindmaps[0];
            const mapRes = await fetch(`/api/mindmaps/${first.id}`);
            const mapData = await mapRes.json();
            currentUid = first.id;
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
        initMindMap(null);
    }

    initIconsPanel();
    renderThemeGrid();
}

document.addEventListener('DOMContentLoaded', init);
