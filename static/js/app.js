/**
 * AI Mind - 思维导图应用
 * 基于 simple-mind-map 库
 */

const MindMap = window.simpleMindMap.default;

// ============ State ============
let mindMap = null;
let currentUid = null;
let isDirty = false;

// 浮动节点（无关联的自由节点）
let floatingNodes = [];
let _floatingNodeEditingUid = null; // 正在内联编辑的浮动节点UID
let _ctrlHeld = false; // 追踪 Ctrl 键是否按下，用于多选逻辑

function undo() {
    if (!mindMap) return;
    mindMap.execCommand('BACK');
    isDirty = true;
    updateStatusBar();
    updateOutline();
}

function redo() {
    if (!mindMap) return;
    mindMap.execCommand('FORWARD');
    isDirty = true;
    updateStatusBar();
    updateOutline();
}

// ============ 浮动节点（自由节点）系统 ============

// 生成唯一ID
function generateFloatUid() {
    return 'float_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 获取 SVG 变换组（库应用 zoom/pan 的 <g> 元素）
function getSvgTransformGroup() {
    const container = document.getElementById('mindMapContainer');
    const svg = container.querySelector('svg');
    if (!svg) return null;
    // 第一个 <g> 是 zoom/pan 变换组
    return svg.querySelector('g');
}

// 在 SVG 中渲染所有浮动节点
function renderFloatingNodes() {
    const container = document.getElementById('mindMapContainer');
    const svg = container.querySelector('svg');
    if (!svg) return;

    // 移除旧的浮动节点元素及其事件监听（保留正在拖拽或编辑中的）
    cleanupFloatingNodeDragListeners();
    svg.querySelectorAll('.floating-node-group').forEach(el => {
        const elUid = el.getAttribute('data-uid');
        const isDragging = floatingNodes.some(fn => fn.data.uid === elUid && fn.data._isDragging);
        const isEditing = _floatingNodeEditingUid === elUid;
        if (!isDragging && !isEditing) {
            el.remove();
        }
    });

    if (!floatingNodes || floatingNodes.length === 0) return;

    const transformGroup = getSvgTransformGroup();
    if (!transformGroup) return;

    floatingNodes.forEach(fn => {
        // 拖拽或编辑中的节点跳过重渲染
        if (fn.data._isDragging) return;
        if (_floatingNodeEditingUid === fn.data.uid) return;
        const x = fn.data.x || 200;
        const y = fn.data.y || 200;
        const text = fn.data.text || '自由节点';
        const uid = fn.data.uid;
        const isActive = fn.data.isActive;
        const textLines = text.split('\n');
        const fontSize = fn.data.fontSize || 14;
        const bgColor = fn.data.fillColor || '#ffffff';
        const textColor = fn.data.color || '#333333';
        const borderColor = fn.data.borderColor || '#cccccc';
        const borderDash = fn.data.borderDasharray || '';
        const borderWidth = fn.data.borderWidth || 1;
        const isBold = fn.data.fontWeight === 'bold';
        const isItalic = fn.data.fontStyle === 'italic';
        const isUnderline = fn.data.textDecoration === 'underline';
        const isLineThrough = fn.data.textDecoration === 'line-through';

        // 计算文本尺寸（中文字符宽度 ≈ fontSize，ASCII ≈ fontSize * 0.6）
        let maxTextWidth = 0;
        textLines.forEach(line => {
            let lineWidth = 0;
            for (const ch of line) {
                if (ch.charCodeAt(0) > 255) {
                    lineWidth += fontSize;
                } else {
                    lineWidth += fontSize * 0.6;
                }
            }
            if (lineWidth > maxTextWidth) maxTextWidth = lineWidth;
        });
        const textWidth = Math.max(maxTextWidth, fontSize * 2) + 24;
        const lineHeight = fontSize * 1.4;
        const textHeight = textLines.length * lineHeight + 12;

        // 计算标签宽度
        const tags = fn.data.tag || [];
        const maxTags = Math.min(tags.length, 4);
        const tagWidths = [];
        tags.slice(0, maxTags).forEach(tag => {
            const tagText = typeof tag === 'string' ? tag : (tag.text || '');
            tagWidths.push(Math.min(tagText.length * 8 + 14, 60));
        });
        const tagsTotalW = tagWidths.reduce((s, w) => s + w + 2, 0); // 含间距

        // 图标宽度
        const note = fn.data.note || '';
        const link = fn.data.hyperlink || '';
        const iconW = 14;
        const iconCount = (note ? 1 : 0) + (link ? 1 : 0);
        const iconsTotalW = iconCount > 0 ? iconCount * iconW + (iconCount - 1) * 3 : 0;

        // 右侧区域（标签+图标）宽度
        const rightGap = (tagsTotalW > 0 || iconsTotalW > 0) ? 8 : 0; // 文字到右侧的间距
        const rightAreaW = tagsTotalW + (tagsTotalW > 0 && iconsTotalW > 0 ? 6 : 0) + iconsTotalW;
        const totalWidth = textWidth + rightGap + rightAreaW;
        const totalHeight = textHeight;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'floating-node-group');
        g.style.userSelect = 'none';
        g.style.webkitUserSelect = 'none';
        g.setAttribute('data-uid', uid);

        // 背景矩形
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const rectLeft = x - totalWidth / 2;
        const rectTop = y - totalHeight / 2;
        rect.setAttribute('x', rectLeft);
        rect.setAttribute('y', rectTop);
        rect.setAttribute('width', totalWidth);
        rect.setAttribute('height', totalHeight);
        rect.setAttribute('rx', '5');
        rect.setAttribute('ry', '5');
        rect.setAttribute('fill', bgColor);
        rect.setAttribute('stroke', isActive ? '#549688' : borderColor);
        rect.setAttribute('stroke-width', isActive ? '2' : String(borderWidth));
        rect.setAttribute('stroke-dasharray', borderDash || 'none');
        rect.setAttribute('class', 'floating-node-rect');
        g.appendChild(rect);

        // 文字（左对齐，垂直居中）
        const textLeft = rectLeft + 12;
        const textCenterY = y + fontSize * 0.35;
        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('fill', textColor);
        textEl.setAttribute('font-size', fontSize);
        textEl.setAttribute('font-family', 'sans-serif');
        if (isBold) textEl.setAttribute('font-weight', 'bold');
        if (isItalic) textEl.setAttribute('font-style', 'italic');
        if (isUnderline) textEl.setAttribute('text-decoration', 'underline');
        if (isLineThrough) textEl.setAttribute('text-decoration', 'line-through');
        textEl.setAttribute('class', 'floating-node-text');
        textEl.setAttribute('y', textCenterY);

        textLines.forEach((line, i) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', textLeft);
            if (i > 0) tspan.setAttribute('dy', lineHeight);
            tspan.textContent = line;
            textEl.appendChild(tspan);
        });
        g.appendChild(textEl);

        // 右侧：标签 + 图标（垂直居中）
        if (rightAreaW > 0) {
            let rx = rectLeft + totalWidth - 12 - rightAreaW; // 右侧起始位置
            const ry = y - 7; // 垂直居中（14px 高）

            // 标签
            tags.slice(0, maxTags).forEach((tag, ti) => {
                const tagText = typeof tag === 'string' ? tag : (tag.text || '');
                const tagColor = typeof tag === 'string' ? autoTagColor(tag) : (tag.color || autoTagColor(tagText));
                const tw = tagWidths[ti];
                const tr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                tr.setAttribute('x', rx); tr.setAttribute('y', ry);
                tr.setAttribute('width', tw); tr.setAttribute('height', '14');
                tr.setAttribute('rx', '3'); tr.setAttribute('fill', tagColor);
                tr.setAttribute('stroke', 'rgba(0,0,0,0.1)'); tr.setAttribute('stroke-width', '0.5');
                g.appendChild(tr);
                const tt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                tt.setAttribute('x', rx + tw / 2); tt.setAttribute('y', ry + 11);
                tt.setAttribute('text-anchor', 'middle');
                tt.setAttribute('fill', '#333'); tt.setAttribute('font-size', '10'); tt.setAttribute('font-family', 'sans-serif');
                tt.textContent = tagText.length > 6 ? tagText.substring(0, 5) + '…' : tagText;
                g.appendChild(tt);
                rx += tw + 2;
            });

            // 图标间距
            if (tagsTotalW > 0 && iconsTotalW > 0) rx += 4;

            // 备注图标（文档）
            if (note) {
                const ig = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                ig.setAttribute('transform', `translate(${rx}, ${ry})`);
                const nr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                nr.setAttribute('x', '1'); nr.setAttribute('y', '1'); nr.setAttribute('width', '12'); nr.setAttribute('height', '12');
                nr.setAttribute('rx', '1'); nr.setAttribute('fill', 'none'); nr.setAttribute('stroke', '#999'); nr.setAttribute('stroke-width', '1');
                ig.appendChild(nr);
                for (let li = 0; li < 3; li++) {
                    const nl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    nl.setAttribute('x1', '3'); nl.setAttribute('y1', 4 + li * 3); nl.setAttribute('x2', '10'); nl.setAttribute('y2', 4 + li * 3);
                    nl.setAttribute('stroke', '#999'); nl.setAttribute('stroke-width', '0.8');
                    ig.appendChild(nl);
                }
                g.appendChild(ig);
                rx += iconW + 3;
            }
            // 链接图标（链条）
            if (link) {
                const ig = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                ig.setAttribute('transform', `translate(${rx}, ${ry + 1})`);
                const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c1.setAttribute('cx', '3'); c1.setAttribute('cy', '3'); c1.setAttribute('r', '2.5');
                c1.setAttribute('fill', 'none'); c1.setAttribute('stroke', '#999'); c1.setAttribute('stroke-width', '1');
                ig.appendChild(c1);
                const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c2.setAttribute('cx', '9'); c2.setAttribute('cy', '9'); c2.setAttribute('r', '2.5');
                c2.setAttribute('fill', 'none'); c2.setAttribute('stroke', '#999'); c2.setAttribute('stroke-width', '1');
                ig.appendChild(c2);
                const cl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                cl.setAttribute('x1', '5'); cl.setAttribute('y1', '2'); cl.setAttribute('x2', '7'); cl.setAttribute('y2', '8');
                cl.setAttribute('stroke', '#999'); cl.setAttribute('stroke-width', '1');
                ig.appendChild(cl);
                g.appendChild(ig);
            }

            // tooltip
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = [note ? '备注: ' + note : '', link ? '链接: ' + link : ''].filter(Boolean).join('\n');
            g.appendChild(title);
        }

        // --- 事件绑定 ---
        g.style.cursor = 'pointer';

        g.addEventListener('click', (e) => {
            e.stopPropagation();

            // Ctrl+点击：多选模式（用于建立关系线），不清除已有选中
            if (e.ctrlKey || e.metaKey) {
                floatingNodes.forEach(n => n.data.isActive = false);
                fn.data.isActive = true;
                window._selectedFloatingNode = fn;
                // 记录选择顺序：float 在前 regular 在后 → 箭头指向 regular
                window._relationFirst = activeNodeCache.length > 0 ? 'regular' : 'float';
                renderFloatingNodes();
                updatePropertyPanelForFloatingNode(fn);

                if (activeNodeCache.length > 0) {
                    showToast('已选中，点击「关系」按钮建立连线');
                } else {
                    showToast('已选中自由节点，请 Ctrl+点击一个普通节点');
                }
                return;
            }

            if (mindMap && mindMap.renderer) {
                mindMap.renderer.clearActiveNodeList();
            }
            activeNodeCache = [];
            window._selectedFloatingNode = null;
            floatingNodes.forEach(n => n.data.isActive = false);
            fn.data.isActive = true;
            renderFloatingNodes();
            updatePropertyPanelForFloatingNode(fn);
        });

        g.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            startFloatingNodeEdit(fn);
        });

        // 拖拽支持（使用移动阈值区分点击和拖拽）
        let _dragStarted = false;
        let _awaitingDrag = false; // 只有 mousedown 后才检测拖拽
        let dragStartX = 0, dragStartY = 0, nodeStartX = 0, nodeStartY = 0;
        let _prevDragX = 0, _prevDragY = 0;
        const DRAG_THRESHOLD = 3; // 移动超过3像素才算拖拽

        g.addEventListener('mousedown', (e) => {
            if (e.detail >= 2) return;
            if (e.button !== 0) return;
            _dragStarted = false;
            _awaitingDrag = true; // 标记：可以开始检测拖拽了
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            nodeStartX = fn.data.x;
            nodeStartY = fn.data.y;
            _prevDragX = fn.data.x;
            _prevDragY = fn.data.y;
            e.stopPropagation();
            // 不调用 preventDefault，否则会阻止 click 事件
        });

        // 指令级拖拽事件（绑定到 document 避免卡顿）
        const onMove = (e) => {
            if (!_awaitingDrag) return; // 没按下鼠标，不处理
            // 先检查是否超过拖拽阈值
            if (!_dragStarted) {
                const dx = Math.abs(e.clientX - dragStartX);
                const dy = Math.abs(e.clientY - dragStartY);
                if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
                _dragStarted = true;
                fn.data._isDragging = true;
                g.style.cursor = 'grabbing';
            }
            const transform = mindMap.view.getTransformData();
            const scale = (transform && transform.state) ? transform.state.scale : 1;
            const dx = (e.clientX - dragStartX) / scale;
            const dy = (e.clientY - dragStartY) / scale;
            const newX = nodeStartX + dx;
            const newY = nodeStartY + dy;
            const deltaX = newX - _prevDragX;
            const deltaY = newY - _prevDragY;
            _prevDragX = newX;
            _prevDragY = newY;

            fn.data.x = newX;
            fn.data.y = newY;

            // 直接更新 DOM 元素位置，避免 renderFloatingNodes 销毁正在拖拽的元素
            const rect = g.querySelector('.floating-node-rect');
            const textEl = g.querySelector('.floating-node-text');
            if (rect) {
                rect.setAttribute('x', parseFloat(rect.getAttribute('x')) + deltaX);
                rect.setAttribute('y', parseFloat(rect.getAttribute('y')) + deltaY);
            }
            if (textEl) {
                textEl.setAttribute('y', (parseFloat(textEl.getAttribute('y')) || 0) + deltaY);
                textEl.querySelectorAll('tspan').forEach(tspan => {
                    tspan.setAttribute('x', parseFloat(tspan.getAttribute('x')) + deltaX);
                });
            }
            // 更新自定义关系线
            renderFloatRelationLines();
        };
        const onUp = () => {
            if (_dragStarted) {
                _dragStarted = false;
                _awaitingDrag = false;
                fn.data._isDragging = false;
                isDirty = true;
                g.style.cursor = 'pointer';
                // 拖拽结束后重渲染一次，刷新显示
                renderFloatingNodes();
                // 更新属性面板位置显示
                if (fn.data.isActive) updatePropertyPanelForFloatingNode(fn);
            }
            _awaitingDrag = false; // 无论如何都要重置
        };
        g._floatDragOff = { onMove, onUp };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);

        transformGroup.appendChild(g);
    });

    // 渲染自定义关系线
    renderFloatRelationLines();
}

// 清理所有浮动节点的拖拽事件（跳过正在拖拽的节点）
function cleanupFloatingNodeDragListeners() {
    const svg = document.querySelector('#mindMapContainer svg');
    if (!svg) return;
    svg.querySelectorAll('.floating-node-group').forEach(g => {
        const elUid = g.getAttribute('data-uid');
        const isDragging = floatingNodes.some(fn => fn.data.uid === elUid && fn.data._isDragging);
        if (!isDragging && g._floatDragOff) {
            document.removeEventListener('mousemove', g._floatDragOff.onMove);
            document.removeEventListener('mouseup', g._floatDragOff.onUp);
            g._floatDragOff = null;
        }
    });
}

// 计算连线从矩形边缘出发的交点（而非中心点）
function edgePoint(cx, cy, w, h, toX, toY) {
    const dx = toX - cx;
    const dy = toY - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return { x: cx, y: cy };
    const nx = dx / len;
    const ny = dy / len;
    const tx = Math.abs(nx) < 0.001 ? Infinity : (w / 2) / Math.abs(nx);
    const ty = Math.abs(ny) < 0.001 ? Infinity : (h / 2) / Math.abs(ny);
    const t = Math.min(tx, ty);
    return { x: cx + nx * t, y: cy + ny * t };
}

// 渲染浮动节点与普通节点的自定义关系线
function renderFloatRelationLines() {
    const container = document.getElementById('mindMapContainer');
    const svg = container.querySelector('svg');
    if (!svg) return;

    // 调试：检查浮动节点关系数据
    const relCount = floatingNodes.reduce((s, fn) => s + (fn.data._relations ? fn.data._relations.length : 0), 0);
    console.log('[DEBUG] renderFloatRelationLines: floatingNodes=' + floatingNodes.length + ', relations=' + relCount,
        floatingNodes.map(fn => ({ uid: fn.data.uid?.substring(0,10), rels: fn.data._relations })));

    // 移除旧的关系线
    svg.querySelectorAll('.float-relation-line-group').forEach(el => el.remove());

    const transformGroup = getSvgTransformGroup();
    if (!transformGroup) return;

    floatingNodes.forEach(fn => {
        if (!fn.data._relations || fn.data._relations.length === 0) return;

        // 计算浮动节点尺寸
        const text = fn.data.text || '';
        const textLines = text.split('\n');
        const fontSize = fn.data.fontSize || 14;
        let maxTextWidth = 0;
        textLines.forEach(line => {
            let lineWidth = 0;
            for (const ch of line) {
                lineWidth += (ch.charCodeAt(0) > 255) ? fontSize : fontSize * 0.6;
            }
            if (lineWidth > maxTextWidth) maxTextWidth = lineWidth;
        });
        const fw = Math.max(maxTextWidth, fontSize * 2) + 24;
        const fh = textLines.length * fontSize * 1.4 + 12;
        const fc = { x: fn.data.x, y: fn.data.y };

        // 清理失效关系（目标节点已被删除），但只在确认不是渲染时序问题时清理
        // 使用 renderer.nodeCache 确认节点确实不存在
        fn.data._relations = fn.data._relations.filter(rel => {
            try {
                const n = mindMap.renderer.findNodeByUid(rel.nodeUid);
                if (n) return true;
                // findNodeByUid 可能因时序问题返回 null，检查 nodeCache 兜底
                const cache = mindMap.renderer.nodeCache;
                if (cache) {
                    return Object.values(cache).some(nd => nd.getData && nd.getData('uid') === rel.nodeUid);
                }
                return true; // 保守起见，保留关系
            } catch (e) { return true; }
        });

        fn.data._relations.forEach((rel, relIdx) => {
            let tc = null, tw = 100, th = 32;
            try {
                const targetNode = mindMap.renderer.findNodeByUid(rel.nodeUid);
                if (targetNode && typeof targetNode.left === 'number') {
                    tc = { x: targetNode.left + (targetNode.width || 100) / 2, y: targetNode.top + (targetNode.height || 32) / 2 };
                    tw = targetNode.width || 100; th = targetNode.height || 32;
                }
            } catch (e) { /* ignore */ }

            if (!tc) {
                const el = svg.querySelector(`[data-uid="${rel.nodeUid}"]`);
                if (el) {
                    const br = el.getBoundingClientRect();
                    const sr = svg.getBoundingClientRect();
                    const t = mindMap.view.getTransformData();
                    const s = (t && t.state) ? t.state.scale : 1;
                    const tx = (t && t.state) ? t.state.x : 0;
                    const ty = (t && t.state) ? t.state.y : 0;
                    tc = { x: (br.left + br.width / 2 - sr.left - tx) / s, y: (br.top + br.height / 2 - sr.top - ty) / s };
                    tw = br.width / s; th = br.height / s;
                }
            }
            if (!tc) return;

            const p1 = edgePoint(fc.x, fc.y, fw, fh, tc.x, tc.y);
            const p2 = edgePoint(tc.x, tc.y, tw, th, fc.x, fc.y);

            const color = rel.color || '#549688';
            const dash = rel.dasharray || '6,4';
            const lineWidth = rel.width || 2;
            const label = rel.label || '';
            const isActive = rel._active;
            const arrowTo = rel.arrowTo || 'float'; // 箭头指向谁

            const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            lineGroup.setAttribute('class', 'float-relation-line-group');
            lineGroup.setAttribute('data-float-uid', fn.data.uid);
            lineGroup.setAttribute('data-rel-idx', relIdx);
            lineGroup.style.cursor = 'pointer';

            // 路径方向：根据箭头指向决定起终点
            let from, to;
            if (arrowTo === 'regular') {
                from = p1; to = p2; // 路径 float→regular，箭头在 regular 端
            } else {
                from = p2; to = p1; // 路径 regular→float，箭头在 float 端
            }
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const d = `M ${from.x} ${from.y} Q ${mx} ${from.y} ${mx} ${my} Q ${mx} ${to.y} ${to.x} ${to.y}`;

            // 确保箭头 marker 存在
            let arrowMarker = svg.querySelector('#float-arrow');
            if (!arrowMarker) {
                const defs = svg.querySelector('defs');
                if (defs) {
                    arrowMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                    arrowMarker.setAttribute('id', 'float-arrow');
                    arrowMarker.setAttribute('viewBox', '0 0 10 10');
                    arrowMarker.setAttribute('refX', '10'); arrowMarker.setAttribute('refY', '5');
                    arrowMarker.setAttribute('markerWidth', '10'); arrowMarker.setAttribute('markerHeight', '10');
                    arrowMarker.setAttribute('orient', 'auto');
                    const ap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    ap.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
                    ap.setAttribute('fill', color);
                    ap.setAttribute('id', 'float-arrow-path');
                    arrowMarker.appendChild(ap);
                    defs.appendChild(arrowMarker);
                }
            }
            // 同步箭头颜色
            const arrowPath = svg.querySelector('#float-arrow-path');
            if (arrowPath) arrowPath.setAttribute('fill', isActive ? '#e55' : color);

            // 宽透明路径（增大点击区域）
            const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hitPath.setAttribute('d', d);
            hitPath.setAttribute('fill', 'none');
            hitPath.setAttribute('stroke', 'transparent');
            hitPath.setAttribute('stroke-width', '12');
            hitPath.setAttribute('class', 'float-relation-hit');
            lineGroup.appendChild(hitPath);

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', isActive ? '#e55' : color);
            path.setAttribute('stroke-width', isActive ? '3' : String(lineWidth));
            path.setAttribute('stroke-dasharray', dash);
            path.setAttribute('class', 'float-relation-line');
            path.setAttribute('marker-end', 'url(#float-arrow)');
            lineGroup.appendChild(path);

            if (label) {
                const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                labelText.setAttribute('x', mx);
                labelText.setAttribute('y', my - 8);
                labelText.setAttribute('text-anchor', 'middle');
                labelText.setAttribute('fill', '#666');
                labelText.setAttribute('font-size', '11');
                labelText.setAttribute('font-family', 'sans-serif');
                labelText.textContent = label;
                labelText.setAttribute('class', 'float-relation-label');
                lineGroup.appendChild(labelText);
            }

            lineGroup.addEventListener('click', (e) => {
                e.stopPropagation();
                floatingNodes.forEach(f => { if (f.data._relations) f.data._relations.forEach(r => r._active = false); });
                rel._active = true;
                isDirty = true;
                renderFloatRelationLines();
                showRelationLinePanel(fn, rel, relIdx);
            });

            lineGroup.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const newLabel = prompt('关系线标签（留空删除）:', label);
                if (newLabel !== null) {
                    rel.label = newLabel.trim() || '';
                    isDirty = true;
                    renderFloatRelationLines();
                }
            });

            transformGroup.appendChild(lineGroup);
        });
    });
}

// 关系线样式面板
function showRelationLinePanel(fn, rel, relIdx) {
    const body = document.getElementById('property-body');
    const color = rel.color || '#549688';
    const dash = rel.dasharray || '6,4';
    const lineWidth = rel.width || 2;
    const label = rel.label || '';

    body.innerHTML = `
        <div class="property-group">
            <div class="property-group-label" style="color:var(--accent);font-weight:600">关系线样式</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
                ${escapeHtml(fn.data.text || '')} → ${escapeHtml(rel.nodeText || '节点')}
            </div>
            <div class="property-group-label">标签文字</div>
            <div class="property-tag-input-wrap">
                <input type="text" class="property-tag-input" id="rel-label-input" value="${escapeHtml(label)}" placeholder="双击连线也可编辑" maxlength="30">
                <button class="property-tag-add-btn" id="rel-label-save">保存</button>
            </div>
            <div class="property-group-label">颜色</div>
            <div class="property-color-wrap">
                <div class="property-color" style="background:${color}">
                    <input type="color" class="property-color-input" id="rel-color" value="${color}">
                </div>
            </div>
            <div class="property-group-label">线型</div>
            <div class="property-row">
                <select class="property-select" id="rel-dash">
                    <option value="none" ${dash === 'none' ? 'selected' : ''}>实线</option>
                    <option value="6,4" ${dash === '6,4' ? 'selected' : ''}>虚线</option>
                    <option value="2,2" ${dash === '2,2' ? 'selected' : ''}>点线</option>
                </select>
            </div>
            <div class="property-row">
                <span style="font-size:11px;color:var(--text-muted)">粗细</span>
                <input type="range" class="property-range" id="rel-width" min="1" max="6" value="${lineWidth}">
                <span class="property-range-value" id="rel-width-val">${lineWidth}</span>
            </div>
            <div style="margin-top:8px">
                <button class="btn btn-sm" id="rel-delete" style="color:#e55">删除关系线</button>
            </div>
        </div>
    `;

    const updateRel = (prop, val) => { rel[prop] = val; isDirty = true; renderFloatRelationLines(); };

    document.getElementById('rel-label-save').addEventListener('click', () => {
        rel.label = document.getElementById('rel-label-input').value.trim();
        updateRel('label', rel.label);
    });
    document.getElementById('rel-label-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { rel.label = e.target.value.trim(); updateRel('label', rel.label); }
    });
    document.getElementById('rel-color').addEventListener('input', (e) => updateRel('color', e.target.value));
    document.getElementById('rel-dash').addEventListener('change', (e) => updateRel('dasharray', e.target.value));
    document.getElementById('rel-width').addEventListener('input', (e) => {
        document.getElementById('rel-width-val').textContent = e.target.value;
    });
    document.getElementById('rel-width').addEventListener('change', (e) => updateRel('width', parseInt(e.target.value)));
    document.getElementById('rel-delete').addEventListener('click', () => {
        fn.data._relations.splice(relIdx, 1);
        isDirty = true;
        renderFloatRelationLines();
        document.getElementById('property-body').innerHTML = '<p class="empty-hint">选中节点查看属性</p>';
    });
}

// 将浮动节点转为普通节点的子节点
function convertFloatingNodeToChild(floatNode, parentNode) {
    if (!mindMap || !floatNode || !parentNode) return;

    // 记录浮动节点数据
    const floatText = floatNode.data.text || '自由节点';
    const floatColor = floatNode.data.color;
    const floatBg = floatNode.data.fillColor;
    const floatFontSize = floatNode.data.fontSize;
    const floatFontWeight = floatNode.data.fontWeight;

    // 激活父节点并插入子节点
    mindMap.execCommand('ACTIVE_NODE', [parentNode.getData('uid')]);
    mindMap.execCommand('INSERT_CHILD_NODE');

    // 获取新创建的子节点（INSERT_CHILD_NODE 会创建节点并激活它）
    setTimeout(() => {
        const newNode = (mindMap.renderer.activeNodeList && mindMap.renderer.activeNodeList.length > 0)
            ? mindMap.renderer.activeNodeList[0] : null;
        if (newNode) {
            const data = {};
            if (floatText) data.text = floatText;
            if (floatColor) { data.color = floatColor; data.fontColor = floatColor; }
            if (floatBg) data.fillColor = floatBg;
            if (floatFontSize) data.fontSize = floatFontSize;
            if (floatFontWeight) data.fontWeight = floatFontWeight;
            mindMap.renderer.setNodeDataRender(newNode, data);
            mindMap.render();
            mindMap.command.addHistory();
        }

        // 从浮动节点列表移除
        const idx = floatingNodes.indexOf(floatNode);
        if (idx !== -1) floatingNodes.splice(idx, 1);
        isDirty = true;
        cleanupFloatingNodeDragListeners();
        renderFloatingNodes();
        updatePropertyPanel();
        showToast('已转为子节点');
    }, 50);
}

// 浮动节点文字编辑（内联编辑，使用 foreignObject + contentEditable）
function startFloatingNodeEdit(fn) {
    if (_floatingNodeEditingUid) return; // 防止重复编辑

    const g = document.querySelector(`.floating-node-group[data-uid="${fn.data.uid}"]`);
    if (!g) return;

    const x = fn.data.x || 200;
    const y = fn.data.y || 200;
    const text = fn.data.text || '自由节点';
    const textLines = text.split('\n');
    const fontSize = fn.data.fontSize || 14;
    const textColor = fn.data.color || '#333333';
    const bgColor = fn.data.fillColor || '#ffffff';
    const borderColor = fn.data.borderColor || '#cccccc';
    const borderDash = fn.data.borderDasharray || 'none';
    const borderW = fn.data.borderWidth || 1;

    // 获取现有点击框的尺寸（复用显示态尺寸）
    const origRect = g.querySelector('.floating-node-rect');
    let editW = parseFloat(origRect?.getAttribute('width')) || 100;
    let editH = parseFloat(origRect?.getAttribute('height')) || 32;
    let editX = parseFloat(origRect?.getAttribute('x')) || (x - editW / 2);
    let editY = parseFloat(origRect?.getAttribute('y')) || (y - editH / 2);

    // 隐藏原始文本
    const textEl = g.querySelector('.floating-node-text');
    if (textEl) textEl.style.visibility = 'hidden';

    // 创建内联编辑器，精确覆盖原框
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', editX);
    fo.setAttribute('y', editY);
    fo.setAttribute('width', editW);
    fo.setAttribute('height', editH);
    fo.setAttribute('class', 'floating-node-edit-fo');

    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.textContent = text;
    div.style.cssText = `
        width:100%;min-height:100%;box-sizing:border-box;
        font-size:${fontSize}px;font-family:sans-serif;
        color:${textColor};background:${bgColor};
        border:${borderW}px ${borderDash === 'none' ? 'solid' : (borderDash === '5,5' ? 'dashed' : 'dotted')} ${borderColor};
        border-radius:5px;padding:6px 8px;outline:none;
        white-space:pre-wrap;word-break:break-all;
        margin:0;
    `;

    fo.appendChild(div);
    g.appendChild(fo);

    _floatingNodeEditingUid = fn.data.uid;

    // 自动聚焦并全选文字
    setTimeout(() => {
        div.focus();
        const range = document.createRange();
        range.selectNodeContents(div);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }, 10);

    // 保存编辑结果
    const save = () => {
        if (_floatingNodeEditingUid !== fn.data.uid) return;
        const newText = div.textContent || '';
        fn.data.text = newText.trim() === '' ? '自由节点' : newText;
        isDirty = true;
        _floatingNodeEditingUid = null;
        fo.remove();
        if (textEl) textEl.style.visibility = '';
        renderFloatingNodes();
        if (fn.data.isActive) updatePropertyPanelForFloatingNode(fn);
    };

    // 取消编辑
    const cancel = () => {
        if (_floatingNodeEditingUid !== fn.data.uid) return;
        _floatingNodeEditingUid = null;
        fo.remove();
        if (textEl) textEl.style.visibility = '';
    };

    // Enter 保存，Alt+Enter/Shift+Enter 换行（库键盘处理器已处理）
    div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            save();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    });

    // 失焦时自动保存
    div.addEventListener('blur', () => {
        setTimeout(() => {
            if (_floatingNodeEditingUid === fn.data.uid && g.querySelector('.floating-node-edit-fo')) {
                save();
            }
        }, 100);
    });
}

// 浮动节点属性面板
function updatePropertyPanelForFloatingNode(fn) {
    _updatingPropertyPanel = true;
    try {
        const body = document.getElementById('property-body');
        const text = fn.data.text || '';
        const bgColor = fn.data.fillColor || '#ffffff';
        const textColor = fn.data.color || '#333333';
        const borderColor = fn.data.borderColor || '#cccccc';
        const rawDash = fn.data.borderDasharray || '';
        const borderStyle = rawDash === '5,5' ? 'dashed' : (rawDash === '2,2' ? 'dotted' : 'solid');
        const bWidth = fn.data.borderWidth || 1;
        const fontSize = fn.data.fontSize || 14;
        const fontWeight = fn.data.fontWeight || 'normal';
        const fontStyle = fn.data.fontStyle || 'normal';
        const textDecoration = fn.data.textDecoration || 'none';
        const tags = fn.data.tag || [];
        const note = fn.data.note || '';
        const hyperlink = fn.data.hyperlink || '';
        const hasNote = !!note;
        const hasLink = !!hyperlink;
        // 标准化标签格式
        const normTags = tags.map(t => typeof t === 'string' ? { text: t, color: autoTagColor(t) } : t);

        body.innerHTML = `
            <div class="property-group">
                <div class="property-group-label" style="color:var(--accent);font-weight:600">自由节点</div>
            </div>

            <!-- 文字颜色 -->
            <div class="property-group">
                <div class="property-group-label">文字颜色</div>
                <div class="property-color-wrap">
                    <div class="property-color" style="background:${textColor || '#2c2c2e'}">
                        <input type="color" class="property-color-input" id="pf-font-color" value="${textColor || '#2c2c2e'}">
                    </div>
                    <button class="btn btn-sm" id="pf-font-color-reset">重置</button>
                </div>
            </div>

            <!-- 背景颜色 -->
            <div class="property-group">
                <div class="property-group-label">背景颜色</div>
                <div class="property-color-wrap">
                    <div class="property-color" style="background:${bgColor || '#ffffff'}">
                        <input type="color" class="property-color-input" id="pf-bg-color" value="${bgColor || '#ffffff'}">
                    </div>
                    <button class="btn btn-sm" id="pf-bg-color-reset">重置</button>
                </div>
            </div>

            <!-- 边框 -->
            <div class="property-group">
                <div class="property-group-label">边框</div>
                <div class="property-row">
                    <div class="property-color" style="background:${borderColor || '#e8e8ed'}">
                        <input type="color" class="property-color-input" id="pf-border-color" value="${borderColor || '#e8e8ed'}">
                    </div>
                    <select class="property-select" id="pf-border-style">
                        <option value="solid" ${borderStyle === 'solid' ? 'selected' : ''}>实线</option>
                        <option value="dashed" ${borderStyle === 'dashed' ? 'selected' : ''}>虚线</option>
                        <option value="dotted" ${borderStyle === 'dotted' ? 'selected' : ''}>点线</option>
                    </select>
                </div>
                <div class="property-row">
                    <span style="font-size:11px;color:var(--text-muted)">粗细</span>
                    <input type="range" class="property-range" id="pf-border-width" min="0" max="8" value="${bWidth}">
                    <span class="property-range-value" id="pf-border-width-val">${bWidth}</span>
                </div>
            </div>

            <!-- 文字样式 -->
            <div class="property-group">
                <div class="property-group-label">文字样式</div>
                <div class="property-row">
                    <button class="btn btn-sm ${fontWeight === 'bold' ? 'btn-primary' : ''}" id="pf-bold" title="粗体">B</button>
                    <button class="btn btn-sm ${fontStyle === 'italic' ? 'btn-primary' : ''}" id="pf-italic" title="斜体"><i>I</i></button>
                    <button class="btn btn-sm ${textDecoration === 'underline' ? 'btn-primary' : ''}" id="pf-underline" title="下划线"><u>U</u></button>
                    <button class="btn btn-sm ${textDecoration === 'line-through' ? 'btn-primary' : ''}" id="pf-strikethrough" title="删除线"><s>S</s></button>
                </div>
                <div class="property-row">
                    <span style="font-size:11px;color:var(--text-muted)">字号</span>
                    <input type="range" class="property-range" id="pf-font-size" min="10" max="72" value="${fontSize}">
                    <span class="property-range-value" id="pf-font-size-val">${fontSize}</span>
                </div>
            </div>

            <!-- 标签 -->
            <div class="property-group">
                <div class="property-group-label">标签</div>
                <div class="property-tags" id="pf-tags-container">
                    ${normTags.map(t => `<span class="property-tag" style="background:${escapeHtml(t.color)};color:#333">${escapeHtml(t.text)}<span class="property-tag-remove" data-tag="${escapeHtml(t.text)}">&times;</span></span>`).join('')}
                </div>
                <div class="property-tag-input-wrap">
                    <input type="text" class="property-tag-input" id="pf-tag-input" placeholder="输入标签后回车" maxlength="20">
                    <button class="property-tag-add-btn" id="pf-tag-add">添加</button>
                </div>
            </div>

            <!-- 备注 -->
            <div class="property-group">
                <div class="property-group-label">备注</div>
                <button class="property-btn ${hasNote ? 'has-content' : ''}" id="pf-edit-note">
                    ${hasNote ? '📝 ' + escapeHtml(note.substring(0, 30)) + (note.length > 30 ? '...' : '') : '📝 添加备注...'}
                </button>
            </div>

            <!-- 超链接 -->
            <div class="property-group">
                <div class="property-group-label">超链接</div>
                <button class="property-btn ${hasLink ? 'has-content' : ''}" id="pf-edit-link">
                    ${hasLink ? '🔗 ' + escapeHtml(hyperlink.substring(0, 30)) + (hyperlink.length > 30 ? '...' : '') : '🔗 添加链接...'}
                </button>
            </div>

            <!-- 删除 -->
            <div class="property-group">
                <button class="btn btn-sm" id="pf-delete" style="color:#e55;width:100%">删除自由节点</button>
            </div>
        `;

        const upd = () => { isDirty = true; renderFloatingNodes(); };

        // 文字颜色
        document.getElementById('pf-font-color').addEventListener('input', (e) => { fn.data.color = e.target.value; fn.data.fontColor = e.target.value; upd(); });
        document.getElementById('pf-font-color-reset').addEventListener('click', () => { fn.data.color = null; fn.data.fontColor = null; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 背景颜色
        document.getElementById('pf-bg-color').addEventListener('input', (e) => { fn.data.fillColor = e.target.value; upd(); });
        document.getElementById('pf-bg-color-reset').addEventListener('click', () => { fn.data.fillColor = '#ffffff'; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 边框颜色
        document.getElementById('pf-border-color').addEventListener('input', (e) => { fn.data.borderColor = e.target.value; upd(); });
        // 边框样式
        document.getElementById('pf-border-style').addEventListener('change', (e) => {
            let dash = '';
            if (e.target.value === 'dashed') dash = '5,5';
            else if (e.target.value === 'dotted') dash = '2,2';
            fn.data.borderDasharray = dash; upd();
        });
        // 边框粗细
        const bwS = document.getElementById('pf-border-width');
        const bwV = document.getElementById('pf-border-width-val');
        bwS.addEventListener('input', () => { bwV.textContent = bwS.value; });
        bwS.addEventListener('change', () => { fn.data.borderWidth = parseInt(bwS.value); upd(); });
        // 粗体
        document.getElementById('pf-bold').addEventListener('click', () => { fn.data.fontWeight = fn.data.fontWeight === 'bold' ? 'normal' : 'bold'; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 斜体
        document.getElementById('pf-italic').addEventListener('click', () => { fn.data.fontStyle = fn.data.fontStyle === 'italic' ? 'normal' : 'italic'; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 下划线
        document.getElementById('pf-underline').addEventListener('click', () => { fn.data.textDecoration = fn.data.textDecoration === 'underline' ? 'none' : 'underline'; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 删除线
        document.getElementById('pf-strikethrough').addEventListener('click', () => { fn.data.textDecoration = fn.data.textDecoration === 'line-through' ? 'none' : 'line-through'; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 字号
        const fsS = document.getElementById('pf-font-size');
        const fsV = document.getElementById('pf-font-size-val');
        fsS.addEventListener('input', () => { fsV.textContent = fsS.value; });
        fsS.addEventListener('change', () => { fn.data.fontSize = parseInt(fsS.value); upd(); updatePropertyPanelForFloatingNode(fn); });
        // 标签
        setupFloatTagEditor(fn);
        // 备注
        document.getElementById('pf-edit-note').addEventListener('click', () => openFloatNoteEditor(fn));
        // 超链接
        document.getElementById('pf-edit-link').addEventListener('click', () => openFloatLinkEditor(fn));
        // 删除
        document.getElementById('pf-delete').addEventListener('click', () => deleteFloatingNodeByUid(fn.data.uid));

    } finally {
        _updatingPropertyPanel = false;
    }
}

// 浮动节点标签编辑器
// 标签自动配色（基于文本 hash）
const TAG_PALETTE = ['#f28b82', '#fbbc04', '#fff475', '#ccff90', '#a7ffeb', '#cbf0f8', '#aecbfa', '#d7aefb', '#fdcfe8', '#a0d2db', '#e8c547', '#c9a0dc'];
function autoTagColor(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

function setupFloatTagEditor(fn) {
    const input = document.getElementById('pf-tag-input');
    const addBtn = document.getElementById('pf-tag-add');
    function addTag() {
        const tagText = input.value.trim();
        if (!tagText) return;
        const tags = (fn.data.tag || []).map(t => typeof t === 'string' ? { text: t, color: autoTagColor(t) } : t);
        if (tags.some(t => t.text === tagText)) { showToast('标签已存在'); return; }
        tags.push({ text: tagText, color: autoTagColor(tagText) });
        fn.data.tag = tags;
        isDirty = true;
        renderFloatingNodes();
        input.value = '';
        updatePropertyPanelForFloatingNode(fn);
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTag(); });
    addBtn.addEventListener('click', addTag);
    document.querySelectorAll('#pf-tags-container .property-tag-remove').forEach(el => {
        el.addEventListener('click', () => {
            const tagText = el.dataset.tag;
            const tags = (fn.data.tag || []).map(t => typeof t === 'string' ? { text: t, color: autoTagColor(t) } : t);
            const idx = tags.findIndex(t => t.text === tagText);
            if (idx > -1) tags.splice(idx, 1);
            fn.data.tag = tags;
            isDirty = true; renderFloatingNodes();
            updatePropertyPanelForFloatingNode(fn);
        });
    });
}

// 浮动节点备注编辑器
function openFloatNoteEditor(fn) {
    const textarea = document.getElementById('note-input');
    textarea.value = fn.data.note || '';
    openModal('modal-note');
    document.getElementById('modal-note-save').onclick = () => {
        const note = textarea.value.trim();
        fn.data.note = note || null;
        isDirty = true;
        renderFloatingNodes();
        closeModal('modal-note');
        updatePropertyPanelForFloatingNode(fn);
        showToast(note ? '备注已保存' : '备注已移除');
    };
}

// 浮动节点超链接编辑器
function openFloatLinkEditor(fn) {
    const linkInput = document.getElementById('link-input');
    const textInput = document.getElementById('link-text-input');
    linkInput.value = fn.data.hyperlink || '';
    textInput.value = '';
    openModal('modal-link');
    document.getElementById('modal-link-save').onclick = () => {
        const url = linkInput.value.trim();
        fn.data.hyperlink = url || null;
        isDirty = true;
        renderFloatingNodes();
        closeModal('modal-link');
        updatePropertyPanelForFloatingNode(fn);
        showToast(url ? '链接已保存' : '链接已移除');
    };
    document.getElementById('modal-link-remove').onclick = () => {
        fn.data.hyperlink = null;
        isDirty = true;
        renderFloatingNodes();
        closeModal('modal-link');
        updatePropertyPanelForFloatingNode(fn);
        showToast('链接已移除');
    };
}

// 删除浮动节点
function deleteFloatingNodeByUid(uid) {
    const idx = floatingNodes.findIndex(n => n.data.uid === uid);
    if (idx !== -1) {
        floatingNodes.splice(idx, 1);
        isDirty = true;
        cleanupFloatingNodeDragListeners();
        renderFloatingNodes();
        document.getElementById('property-body').innerHTML = '<p class="empty-hint">选中节点查看属性</p>';
    }
}

// 删除当前选中的浮动节点（供键盘快捷键调用）
function deleteActiveFloatingNodes() {
    const active = floatingNodes.filter(n => n.data.isActive);
    if (active.length > 0) {
        active.forEach(n => {
            const idx = floatingNodes.indexOf(n);
            if (idx !== -1) floatingNodes.splice(idx, 1);
        });
        isDirty = true;
        cleanupFloatingNodeDragListeners();
        renderFloatingNodes();
        document.getElementById('property-body').innerHTML = '<p class="empty-hint">选中节点查看属性</p>';
        return true;
    }
    return false;
}

// 获取或创建浮动节点数据（过滤瞬态标记）
function getFloatingNodesData() {
    return floatingNodes.map(n => {
        const { _isDragging, ...cleanData } = n.data;
        return {
            data: { ...cleanData },
            children: [],
        };
    });
}

function setFloatingNodesData(data) {
    floatingNodes = (data || []).map(item => ({
        data: {
            // 用 spread 保留所有已存字段（含 _relations 等），再覆盖默认值
            ...item.data,
            uid: item.data.uid || generateFloatUid(),
            text: item.data.text || '自由节点',
            x: item.data.x || 200,
            y: item.data.y || 200,
            isActive: false,
            color: item.data.color || '#333333',
            fillColor: item.data.fillColor || '#ffffff',
            borderColor: item.data.borderColor || '#cccccc',
            borderDasharray: item.data.borderDasharray || '',
            borderWidth: item.data.borderWidth || 1,
            fontSize: item.data.fontSize || 14,
            fontWeight: item.data.fontWeight || 'normal',
            fontStyle: item.data.fontStyle || 'normal',
            textDecoration: item.data.textDecoration || 'none',
            tag: item.data.tag || [],
            note: item.data.note || '',
            hyperlink: item.data.hyperlink || '',
        },
        children: [],
    }));
}

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

// 12套主题完整配色（库的 setTheme 不生效，手动注入 setThemeConfig）
function _makeThemeConfig(main, bg, rootText, nodeText, secondFill, secondBorder) {
    return {
        backgroundColor: bg,
        lineColor: main,
        root: {
            fillColor: main, color: rootText, fontSize: 16, fontWeight: 'bold',
            fontStyle: 'normal', borderColor: 'transparent', borderWidth: 0,
            borderDasharray: 'none', borderRadius: 5, textDecoration: 'none',
            hoverRectColor: '', hoverRectRadius: 5, textAlign: 'left',
        },
        second: {
            fillColor: secondFill, color: '#565656', fontSize: 16,
            borderColor: secondBorder || main, borderWidth: 1,
            borderDasharray: 'none', borderRadius: 5, textDecoration: 'none',
            marginX: 100, marginY: 40,
        },
        node: {
            fillColor: 'transparent', color: nodeText, fontSize: 14,
            borderColor: 'transparent', borderWidth: 0,
            borderDasharray: 'none', borderRadius: 5, textDecoration: 'none',
            marginX: 50, marginY: 0,
        },
        generalization: {
            fillColor: secondFill, color: '#565656', fontSize: 16,
            borderColor: secondBorder || main, borderWidth: 1,
            borderDasharray: 'none', borderRadius: 5, textDecoration: 'none',
            marginX: 100, marginY: 40,
        },
    };
}

const THEME_CONFIGS = {
    default:       _makeThemeConfig('#549688', '#fafafa', '#fff',   '#6a6d6c', '#fff', '#549688'),
    classic:       _makeThemeConfig('#f5a623', '#fdfdf0', '#fff',   '#6a6d6c', '#fff', '#f5a623'),
    blue:          _makeThemeConfig('#4a90d9', '#f6fafe', '#fff',   '#6a6d6c', '#fff', '#4a90d9'),
    green:         _makeThemeConfig('#7ed321', '#f9fdf5', '#fff',   '#6a6d6c', '#fff', '#7ed321'),
    pink:          _makeThemeConfig('#f78da7', '#fefafb', '#fff',   '#6a6d6c', '#fff', '#f78da7'),
    purple:        _makeThemeConfig('#ab8ce4', '#faf7fe', '#fff',   '#6a6d6c', '#fff', '#ab8ce4'),
    dark:          _makeThemeConfig('#2c2c2e', '#1e1e20', '#fff',   '#aaaaaa', '#2c2c2e', '#555'),
    simple:        _makeThemeConfig('#c8c8cc', '#ffffff', '#333',   '#666666', '#ffffff', '#c8c8cc'),
    light:         _makeThemeConfig('#e8a860', '#fffef5', '#fff',   '#6a6d6c', '#fff', '#e8a860'),
    snow:          _makeThemeConfig('#88c8f0', '#f6fbfe', '#333',   '#6a6d6c', '#fff', '#88c8f0'),
    warm:          _makeThemeConfig('#e8a860', '#fffdf5', '#fff',   '#6a6d6c', '#fff', '#e8a860'),
    minions:       _makeThemeConfig('#fcdb03', '#fffef5', '#333',   '#6a6d6c', '#fff', '#fcdb03'),
};

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

    // 恢复浮动节点数据
    if (data && data._floatingNodes) {
        console.log('[DEBUG] initMindMap: loading _floatingNodes', data._floatingNodes.map(fn => ({
            uid: fn.data.uid?.substring(0,10),
            text: fn.data.text,
            rels: fn.data._relations,
        })));
        setFloatingNodesData(data._floatingNodes);
    } else {
        console.log('[DEBUG] initMindMap: no _floatingNodes in data');
        floatingNodes = [];
    }

    const config = {
        el: container,
        data: data || {
            data: { text: '中心主题', expand: true },
            children: [
                { data: { text: '双击编辑', expand: true }, children: [] },
                { data: { text: '按 Tab 添加子节点', expand: true }, children: [] },
            ],
        },
        layout: (data && data.layout) || 'logicalStructure',
        theme: 'default',
        maxTag: 5,
        isShowExpandNum: true,
        mousewheelAction: 'zoom',
        enableDblclickBackToRootNode: false, // 禁用，双击空白改用于创建自由节点
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
        // 渲染浮动节点
        renderFloatingNodes();
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

                // 在捕获阶段记录点击坐标（防止库处理后画布位移导致坐标偏差）
                svgEl.addEventListener('mousedown', (e) => {
                    const tgt = e.target;
                    if (tgt.closest('.floating-node-group') || tgt.closest('foreignObject')) return;
                    const sr = svgEl.getBoundingClientRect();
                    const tgEl = svgEl.querySelector('g');
                    if (tgEl && tgEl.transform.baseVal.length > 0) {
                        const m = tgEl.transform.baseVal.getItem(0).matrix;
                        window._clickMapX = (e.clientX - sr.left - m.e) / m.a;
                        window._clickMapY = (e.clientY - sr.top - m.f) / m.a;
                    }
                }, true); // capture phase - 在库处理之前

                // 双击空白区域创建浮动节点
                svgEl.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // 检查是否点击在节点元素上
                    const target = e.target;
                    const isNodeEl = target.closest('.smm-node') ||
                        target.closest('[data-uid]') ||
                        target.closest('.floating-node-group') ||
                        target.closest('foreignObject');
                    if (isNodeEl) return;

                    // 使用 mousedown 阶段预录的坐标（避免库处理后画布跳变）
                    const mapX = window._clickMapX;
                    const mapY = window._clickMapY;
                    if (mapX == null || mapY == null) return;

                    // 创建浮动节点
                    const floatNode = {
                        data: {
                            uid: generateFloatUid(),
                            text: '自由节点',
                            x: mapX,
                            y: mapY,
                            isActive: false,
                            color: '#333333',
                            fillColor: '#ffffff',
                            borderColor: '#cccccc',
                            borderDasharray: '',
                            borderWidth: 1,
                            fontSize: 14,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            textDecoration: 'none',
                            tag: [],
                            note: '',
                            hyperlink: '',
                        },
                        children: [],
                    };
                    floatingNodes.push(floatNode);
                    isDirty = true;
                    renderFloatingNodes();
                    // 清除双击可能导致的文字选中
                    if (window.getSelection) window.getSelection().removeAllRanges();
                    showToast('已创建自由节点（双击可编辑文字）');
                });
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
        // 取消浮动节点和关系线选中
        floatingNodes.forEach(n => {
            n.data.isActive = false;
            if (n.data._relations) n.data._relations.forEach(r => r._active = false);
        });
        window._selectedFloatingNode = null;
        window._relationFirst = null;
        renderFloatingNodes();
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
        // 浮动节点先选中 + Ctrl+点击普通节点 → 自动建立关系线
        if (_ctrlHeld && window._selectedFloatingNode && activeNodeCache.length > 0) {
            // 确定箭头方向：float先选 → 箭头指向regular
            const arrowTo = (window._relationFirst === 'float') ? 'regular' : 'float';
            createFloatRelation(window._selectedFloatingNode, activeNodeCache[0], arrowTo);
            window._selectedFloatingNode = null;
            window._relationFirst = null;
            return;
        }
        // 取消浮动节点选中（Ctrl+多选时保留）
        if (!_ctrlHeld) {
            floatingNodes.forEach(n => n.data.isActive = false);
            window._selectedFloatingNode = null;
            window._relationFirst = null;
        }
        renderFloatingNodes();
        setTimeout(updatePropertyPanel, 30);
    });
}

// ============ File Operations ============
async function autoSave() {
    if (!isDirty || !mindMap) return;
    const data = mindMap.getData();
    data.layout = mindMap.opt.layout || data.layout; // 确保布局被保存
    data._floatingNodes = getFloatingNodesData();
    console.log('[DEBUG] save: _floatingNodes', data._floatingNodes.map(fn => ({
        uid: fn.data.uid?.substring(0,10), text: fn.data.text, rels: fn.data._relations
    })));
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
    data.layout = mindMap.opt.layout || data.layout; // 确保布局被保存
    data._floatingNodes = getFloatingNodesData();
    console.log('[DEBUG] save: _floatingNodes', data._floatingNodes.map(fn => ({
        uid: fn.data.uid?.substring(0,10), text: fn.data.text, rels: fn.data._relations
    })));
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
        // 先清空 currentUid，避免后续 autoSave 把数据写回已删除的文件
        if (currentUid === uid) {
            currentUid = null;
        }
        loadFileList();
        // 如果删的是当前文件，自动切换到第一个文件或新建
        if (!currentUid) {
            const res = await fetch('/api/mindmaps');
            const data = await res.json();
            if (data.mindmaps && data.mindmaps.length > 0) {
                loadMindMap(data.mindmaps[0].id);
            } else {
                await newMindMap();
            }
        }
    } catch (err) {
        console.error('删除失败:', err);
    }
}

// ============ Node Deletion ============
function deleteActiveNode() {
    if (!mindMap) return;

    // 优先检查浮动节点
    if (deleteActiveFloatingNodes()) {
        showToast('已删除自由节点');
        return;
    }

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
    // 同步工具栏布局按钮高亮
    document.querySelectorAll('[data-layout]').forEach(b => {
        b.classList.toggle('active', b.dataset.layout === layout);
    });
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
                mindMap.renderer.toggleNodeExpand(node);
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

// 创建浮动节点与普通节点的关系线（共用函数）
function createFloatRelation(floatNode, regularNode, arrowTo) {
    if (!floatNode || !regularNode) return;
    const otherUid = regularNode.getData('uid');
    const otherText = regularNode.getData('text') || '';

    if (!floatNode.data._relations) floatNode.data._relations = [];
    if (floatNode.data._relations.some(r => r.nodeUid === otherUid)) {
        showToast('关系线已存在');
        return;
    }
    floatNode.data._relations.push({
        nodeUid: otherUid,
        nodeText: otherText,
        arrowTo: arrowTo || 'float', // 箭头指向：'float' 或 'regular'
        color: window._branchLineGlobalStyle.color || '#549688',
        dasharray: '6,4',
        width: 2,
    });

    window._selectedFloatingNode = null;
    window._relationFirst = null;
    isDirty = true;
    renderFloatingNodes();
    renderFloatRelationLines();
    updatePropertyPanel();
    showToast('关系线已建立');
}

function addAssociation() {
    if (!mindMap) return;
    const activeNodes = activeNodeCache;
    const floatNode = window._selectedFloatingNode;

    // 浮动节点 + 普通节点 → 自定义 SVG 连线
    if (floatNode) {
        if (activeNodes.length < 1) {
            showToast('请先选中一个普通节点，再 Ctrl+点击自由节点来建立关系线');
            return;
        }
        // 箭头方向：谁先选就从谁开始
        const arrowTo = (window._relationFirst === 'float') ? 'regular' : 'float';
        createFloatRelation(floatNode, activeNodes[0], arrowTo);
        return;
    }

    // 两个普通节点 → 库自带关系线
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
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

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

// Add child node
document.getElementById('btn-add-child').addEventListener('click', () => {
    if (!mindMap) return;
    const nodes = activeNodeCache.length > 0 ? activeNodeCache :
        (mindMap.renderer.activeNodeList || []);
    if (nodes.length === 0) {
        showToast('请先选中一个节点');
        return;
    }
    mindMap.execCommand('INSERT_CHILD_NODE');
});

// Add sibling node
document.getElementById('btn-add-sibling').addEventListener('click', () => {
    if (!mindMap) return;
    const nodes = activeNodeCache.length > 0 ? activeNodeCache :
        (mindMap.renderer.activeNodeList || []);
    if (nodes.length === 0) {
        showToast('请先选中一个节点');
        return;
    }
    const node = nodes[0];
    if (!node.parent) {
        showToast('根节点不能添加兄弟节点');
        return;
    }
    mindMap.execCommand('INSERT_NODE');
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
                const cfg = THEME_CONFIGS[theme];
                if (cfg) {
                    mindMap.setThemeConfig(cfg);
                    mindMap.render();
                }
                mindMap.setTheme(theme);
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

// 追踪 Ctrl 键状态（用于浮动节点多选判断）
document.addEventListener('keydown', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') _ctrlHeld = true;
}, true);
document.addEventListener('keyup', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') {
        _ctrlHeld = false;
        // Ctrl 松开时，如果既没有选中普通节点也没有浮动节点，清理状态
        if (activeNodeCache.length === 0 && !floatingNodes.some(n => n.data.isActive)) {
            window._selectedFloatingNode = null;
        }
    }
}, true);

document.addEventListener('keydown', (e) => {
    const target = e.target;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Alt+Enter 换行支持（在 contentEditable 编辑节点文字时）
    if (e.altKey && e.key === 'Enter' && target.isContentEditable) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        return;
    }

    // Ctrl+S or Cmd+S - 保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveMindMap();
        return;
    }

    // Ctrl+Z - 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !isInput) {
        e.preventDefault();
        undo();
        return;
    }

    // Ctrl+Shift+Z or Ctrl+Y - 重做
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !isInput) {
        e.preventDefault();
        redo();
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
        // 优先删除浮动节点
        if (!deleteActiveFloatingNodes()) {
            deleteActiveNode();
        }
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

    // 每5分钟自动保存
    setInterval(() => {
        if (isDirty && mindMap) {
            autoSave();
        }
    }, 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
