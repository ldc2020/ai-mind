// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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
    const plainNote = note ? stripHtml(note).trim() : '';
    const hasNote = hasVisibleNoteContent(note);
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
                ${hasNote ? '📝 ' + (plainNote ? escapeHtml(plainNote.substring(0, 30)) + (plainNote.length > 30 ? '...' : '') : '[图片/富文本]') : '📝 添加备注...'}
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
    });
    document.getElementById('prop-font-color').addEventListener('change', (e) => {
        mindMap.command.addHistory();
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
    });
    document.getElementById('prop-bg-color').addEventListener('change', (e) => {
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
    });
    document.getElementById('prop-border-color').addEventListener('change', (e) => {
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
    });
    document.getElementById('prop-line-color').addEventListener('change', (e) => {
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
        mindMap.execCommand('SET_NODE_TAG', node, tags);
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
            mindMap.execCommand('SET_NODE_TAG', node, tags);
            updatePropertyPanel();
        });
    });
}

