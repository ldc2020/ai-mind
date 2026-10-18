// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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

// 解析 SVG 元素的 transform (支持 matrix 和 translate)
function getSvgElementPos(el) {
    const transform = el.getAttribute('transform') || '';
    const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/);
    if (matrixMatch) return { x: parseFloat(matrixMatch[1]), y: parseFloat(matrixMatch[2]) };
    const txMatch = transform.match(/translate\(([^,]+),?\s*([^)]+)?\)/);
    if (txMatch) return { x: parseFloat(txMatch[1]), y: txMatch[2] ? parseFloat(txMatch[2]) : 0 };
    return { x: 0, y: 0 };
}

// 浮动节点在 SVG 中是按其中心点 (x, y) 渲染的
// 原生节点的 left/top 是其左上角，width/height 是宽高
// 在垂直布局中，我们希望浮动节点的中心 X (即 fn.data.x) 对齐目标节点的中心 X (即 targetX + targetW/2)
function updateAttachedFloatingNodesPositions() {
    let changed = false;
    const svg = document.querySelector('#mindMapContainer svg');
    if (!svg) return false;
    
    const layout = mindMap && mindMap.opt ? mindMap.opt.layout || 'logicalStructure' : 'logicalStructure';
    const isVerticalLayout = layout.toLowerCase().includes('organization') || layout === 'timeline2';

    // 多次循环以处理级联依附
    for (let i = 0; i < 3; i++) {
        floatingNodes.forEach(fn => {
            if (!fn.data._attachedTo) return;
            const targetUid = fn.data._attachedTo.uid;
            let targetX = 0, targetY = 0, targetW = 0, targetH = 0;
            
            const targetNode = mindMap && mindMap.renderer ? mindMap.renderer.findNodeByUid(targetUid) : null;
            if (targetNode) {
                if (targetNode.isGeneralization) {
                    const belongUid = targetNode.generalizationBelongNode ? targetNode.generalizationBelongNode.getData('uid') : targetUid;
                    const genEl = svg.querySelector(`.smm-node.generalization_${belongUid}`);
                    if (genEl) {
                        const pos = getSvgElementPos(genEl);
                        const shape = genEl.querySelector('.smm-node-shape');
                        const bb = shape ? shape.getBBox() : { width: 100, height: 30 };
                        targetW = bb.width;
                        targetH = bb.height;
                        
                        // 由于 SVG BBox 获取的 x,y 是相对于 group 的
                        // pos.x/y 在简单场景下可能是准确的，但有时候是 translate(x, y) 加上内部元素的位移
                        // 更保险的方式是直接使用 mindMap 内部的数据
                        targetX = targetNode.left || pos.x;
                        targetY = targetNode.top || pos.y;
                        targetW = targetNode.width || bb.width;
                        targetH = targetNode.height || bb.height;
                    } else {
                        // 降级：如果找不到真正的 DOM，尝试用自身 UID
                        const fallbackEl = svg.querySelector(`.smm-node.generalization_${targetUid}`);
                        if (fallbackEl) {
                            const pos = getSvgElementPos(fallbackEl);
                            const shape = fallbackEl.querySelector('.smm-node-shape');
                            const bb = shape ? shape.getBBox() : { width: 100, height: 30 };
                            targetX = targetNode.left || pos.x;
                            targetY = targetNode.top || pos.y;
                            targetW = targetNode.width || bb.width;
                            targetH = targetNode.height || bb.height;
                        } else {
                            targetX = targetNode.left || 0;
                            targetY = targetNode.top || 0;
                            targetW = targetNode.width || 100;
                            targetH = targetNode.height || 30;
                        }
                    }
                } else {
                    targetX = targetNode.left;
                    targetY = targetNode.top;
                    targetW = targetNode.width;
                    targetH = targetNode.height;
                }
            } else {
                const parentFloat = floatingNodes.find(f => f.data.uid === targetUid);
                if (parentFloat) {
                    // 对于浮动节点，它的 targetX, targetY 实际上是中心点，为了跟原生节点统一，我们把它转为左上角
                    targetW = 80; // 预估
                    targetH = 30; // 预估
                    targetX = parentFloat.data.x - targetW/2; 
                    targetY = parentFloat.data.y - targetH/2;
                }
            }
            
            if (targetW > 0) {
                let newX, newY;
                if (isVerticalLayout) {
                    newX = targetX + targetW / 2 + fn.data._attachedTo.offsetX;
                    // 在垂直布局中，targetX/targetY 已经是根据 targetNode.left/top 取得的。
                    // 摘要节点本身在垂直布局下是放在普通节点下方的。
                    // 我们想要新节点在摘要节点下方。所以我们需要使用 targetH。
                    // 由于新节点的 x, y 是中心点，我们要确保它刚好在目标下方 60px 的位置（顶部对齐目标底部 60px）
                    // 所以：目标底边 = targetY + targetH
                    // 新节点中心 Y = 目标底边 + offsetY(即60) + 新节点自身高度一半(约15)
                    newY = targetY + targetH + fn.data._attachedTo.offsetY + 15; 
                } else {
                    newX = targetX + targetW + fn.data._attachedTo.offsetX + 40; // 目标右边缘 + 偏移量 + 浮动节点宽度的一半(约40)
                    newY = targetY + targetH / 2 + fn.data._attachedTo.offsetY;
                }

                if (Math.abs(fn.data.x - newX) > 1 || Math.abs(fn.data.y - newY) > 1) {
                    fn.data.x = newX;
                    fn.data.y = newY;
                    changed = true;
                }
            }
        });
    }
    return changed;
}

// 创建依附型衍生节点
function createAttachedFloatingNode(targetUid, isGenNode) {
    if (!mindMap) return;
    const targetNode = mindMap.renderer.findNodeByUid(targetUid);
    let rightEdge = 0, centerY = 0;
    
    // 获取当前布局方向 (logicalStructure 逻辑结构、organizationStructure 组织结构等)
    const layout = mindMap.opt.layout || 'logicalStructure';
    const isVerticalLayout = layout.toLowerCase().includes('organization') || layout === 'timeline2';
    
    if (isGenNode && targetNode) {
        if (isVerticalLayout) {
            // 摘要节点本身在垂直结构中可能被渲染成一个横向很宽的块（因为它包裹了多个子节点）
            // 但是在我们的连线逻辑里，如果我们要让新分支挂在它正下方，应该用它的实际渲染宽度的一半
            // 由于 targetNode.left/width 对于包裹型的 isGeneralization 是准确反映其包围盒的
            rightEdge = targetNode.left + targetNode.width / 2;
            centerY = targetNode.top + targetNode.height + APP_CONFIG.floatingNode.attachedGap + 15;
        } else {
            rightEdge = targetNode.left + targetNode.width + APP_CONFIG.floatingNode.attachedGap + 40;
            centerY = targetNode.top + targetNode.height / 2;
        }
    } else if (targetNode) {
        if (isVerticalLayout) {
            // 普通节点
            rightEdge = targetNode.left + targetNode.width / 2;
            centerY = targetNode.top + targetNode.height + APP_CONFIG.floatingNode.attachedGap + 15;
        } else {
            rightEdge = targetNode.left + targetNode.width + APP_CONFIG.floatingNode.attachedGap + 40;
            centerY = targetNode.top + targetNode.height / 2;
        }
    } else {
        const parentFloat = floatingNodes.find(f => f.data.uid === targetUid);
        if (parentFloat) {
            const fw = 80; // 预估文本宽度
            const fh = 30;
            if (isVerticalLayout) {
                // 父节点是浮动节点时，其 data.x 是中心
                rightEdge = parentFloat.data.x; 
                centerY = parentFloat.data.y + fh/2 + APP_CONFIG.floatingNode.attachedGap + 15;
            } else {
                rightEdge = parentFloat.data.x + fw/2 + APP_CONFIG.floatingNode.attachedGap + 40; 
                centerY = parentFloat.data.y;
            }
        }
    }
    
    const uid = generateFloatUid();
    // 默认颜色同 mindMap 连线颜色
    const lineColor = window._branchLineGlobalStyle ? window._branchLineGlobalStyle.color : APP_CONFIG.colors.accent;

    const floatNode = {
        data: {
            uid: uid,
            text: APP_CONFIG.floatingNode.attachedText,
            x: rightEdge, 
            y: centerY,
            isActive: false,
            color: APP_CONFIG.floatingNode.color,
            fillColor: APP_CONFIG.floatingNode.fillColor,
            fontSize: APP_CONFIG.floatingNode.fontSize,
            _relations: [{
                nodeUid: targetUid,
                arrowTo: 'float',
                color: lineColor,
                dasharray: 'none',
                width: 2,
                isAttached: true // 标记为依附连线，将绘制为平滑分支曲线且无箭头
            }],
            _attachedTo: {
                uid: targetUid,
                offsetX: 0, 
                offsetY: 0
            }
        }
    };
    
    if (isVerticalLayout) {
        floatNode.data._attachedTo.offsetX = 0;
        floatNode.data._attachedTo.offsetY = APP_CONFIG.floatingNode.attachedGap; // 纯间距
    } else {
        floatNode.data._attachedTo.offsetX = APP_CONFIG.floatingNode.attachedGap; // 纯间距
        floatNode.data._attachedTo.offsetY = 0;
    }

    floatingNodes.push(floatNode);
    isDirty = true;
    renderFloatingNodes();
    updatePropertyPanel();
    showToast('已添加新分支');
}

// 在 SVG 中渲染所有浮动节点
function renderFloatingNodes() {
    updateAttachedFloatingNodesPositions();

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
        const x = fn.data.x ?? APP_CONFIG.floatingNode.x;
        const y = fn.data.y ?? APP_CONFIG.floatingNode.y;
        const text = fn.data.text || APP_CONFIG.floatingNode.text;
        const uid = fn.data.uid;
        const isActive = fn.data.isActive;
        const textLines = text.split('\n');
        const fontSize = fn.data.fontSize || APP_CONFIG.floatingNode.fontSize;
        const bgColor = fn.data.fillColor || APP_CONFIG.floatingNode.fillColor;
        const textColor = fn.data.color || APP_CONFIG.floatingNode.color;
        const borderColor = fn.data.borderColor || APP_CONFIG.floatingNode.borderColor;
        const borderDash = fn.data.borderDasharray || '';
        const borderWidth = fn.data.borderWidth ?? APP_CONFIG.floatingNode.borderWidth;
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
        const textWidth = Math.max(maxTextWidth, fontSize * 2) + APP_CONFIG.floatingNode.horizontalPadding;
        const lineHeight = fontSize * APP_CONFIG.floatingNode.lineHeight;
        const textHeight = textLines.length * lineHeight + APP_CONFIG.floatingNode.verticalPadding;

        // 计算标签宽度
        const tags = fn.data.tag || [];
        const maxTags = Math.min(tags.length, APP_CONFIG.floatingNode.maxTags);
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
        rect.setAttribute('stroke', isActive ? APP_CONFIG.colors.accent : borderColor);
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
                ig.setAttribute('class', 'floating-node-note-icon');
                ig.setAttribute('data-note-html', note);
                ig.setAttribute('transform', `translate(${rx}, ${ry - 3})`); // 调整Y轴使变大后的图标居中
                
                // 对齐普通节点的原生备注图标（折角文档样式）
                ig.innerHTML = `
                    <svg viewBox="0 0 1024 1024" width="20" height="20" x="0" y="0">
                        <path d="M834.7648 340.992c-15.36-15.1552-30.9248-30.1056-46.2848-45.2608-14.7456-14.5408-29.696-29.0816-44.4416-43.8272-13.7216-13.5168-27.648-26.8288-41.5744-40.1408-11.264-10.8544-22.7328-21.504-34.1504-32.1536-11.8784-11.264-24.5248-21.7088-37.376-31.9488-8.192-6.5536-17.8176-12.288-28.0576-16.384-9.8304-3.6864-20.48-4.9152-31.1296-5.12-16.7936-0.4096-33.5872-0.2048-50.3808-0.2048H325.2224c-53.6576 0-97.0752 43.4176-97.0752 97.0752v579.3792c0 53.6576 43.4176 97.0752 97.0752 97.0752h373.5552c53.6576 0 97.0752-43.4176 97.0752-97.0752V395.264c0-19.456-7.5776-38.0928-21.0944-54.272zM572.2112 203.776c24.3712 23.9616 48.9472 47.7184 73.5232 71.4752 14.1312 13.9264 28.2624 27.648 42.1888 41.3696-1.8432 1.4336-3.8912 2.8672-5.9392 4.096-31.3344 19.8656-68.8128 30.72-106.7008 30.72-1.024 0-2.048 0-3.072 0V203.776zM716.3904 802.4064c0 10.0352-8.192 18.2272-18.2272 18.2272H325.2224c-10.0352 0-18.2272-8.192-18.2272-18.2272V223.0272c0-10.0352 8.192-18.2272 18.2272-18.2272h168.1408v146.6368c1.024 45.4656 22.3232 87.8592 58.7776 115.3024 33.3824 25.1904 74.9568 38.0928 116.736 35.84v300.032h47.5136v-0.2048z" fill="#94a3b8"></path>
                        <path d="M381.1328 472.2688h261.7344c21.7088 0 39.3216-17.6128 39.3216-39.3216s-17.6128-39.3216-39.3216-39.3216H381.1328c-21.7088 0-39.3216 17.6128-39.3216 39.3216s17.6128 39.3216 39.3216 39.3216z" fill="#94a3b8"></path>
                        <path d="M381.1328 629.5552h261.7344c21.7088 0 39.3216-17.6128 39.3216-39.3216s-17.6128-39.3216-39.3216-39.3216H381.1328c-21.7088 0-39.3216 17.6128-39.3216 39.3216s17.6128 39.3216 39.3216 39.3216z" fill="#94a3b8"></path>
                        <path d="M381.1328 786.8416h261.7344c21.7088 0 39.3216-17.6128 39.3216-39.3216s-17.6128-39.3216-39.3216-39.3216H381.1328c-21.7088 0-39.3216 17.6128-39.3216 39.3216s17.6128 39.3216 39.3216 39.3216z" fill="#94a3b8"></path>
                    </svg>
                `;
                g.appendChild(ig);
                rx += 20 + 3;
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

            // tooltip：链接保留原生提示，备注图标使用自定义富文本悬浮层
            if (link && !note) {
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = '链接: ' + link;
                g.appendChild(title);
            }
        }

        g.addEventListener('mouseleave', () => {
            hideRichNoteTooltip();
        });

        g.addEventListener('mousemove', (e) => {
            const noteIcon = e.target.closest && e.target.closest('.floating-node-note-icon');
            if (!noteIcon) return;
            const noteHtml = noteIcon.getAttribute('data-note-html');
            setNoteTooltipSource('float', fn, fn.data.uid);
            showRichNoteTooltip(noteHtml, e.clientX + 12, e.clientY + 12);
        });

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
            window._selectedFloatingNode = fn;
            floatingNodes.forEach(n => n.data.isActive = false);
            fn.data.isActive = true;
            renderFloatingNodes();
            updatePropertyPanelForFloatingNode(fn);
        });

        g.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            startFloatingNodeEdit(fn);
        });

        // 给选中的浮动节点（特别是作为衍生节点的）渲染一个 + 号，以支持继续向后衍生
        if (isActive) {
            const btnG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            btnG.setAttribute('class', 'gen-plus-btn');
            btnG.style.cursor = 'pointer';
            
            const layout = mindMap && mindMap.opt ? mindMap.opt.layout || 'logicalStructure' : 'logicalStructure';
            const isVerticalLayout = layout.toLowerCase().includes('organization') || layout === 'timeline2';

            // +号放在节点右侧或下方
            let px = rectLeft + totalWidth + 10;
            let py = y;
            if (isVerticalLayout) {
                px = x;
                py = rectTop + totalHeight + 10;
            }

            btnG.setAttribute('transform', `translate(${px}, ${py})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '0'); circle.setAttribute('cy', '0');
            circle.setAttribute('r', '7');
            circle.setAttribute('fill', APP_CONFIG.colors.accent);
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '1.5');
            btnG.appendChild(circle);

            const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hLine.setAttribute('x1', '-3.5'); hLine.setAttribute('y1', '0');
            hLine.setAttribute('x2', '3.5');  hLine.setAttribute('y2', '0');
            hLine.setAttribute('stroke', '#fff');
            hLine.setAttribute('stroke-width', '1.5');
            hLine.setAttribute('stroke-linecap', 'round');
            btnG.appendChild(hLine);

            const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vLine.setAttribute('x1', '0'); vLine.setAttribute('y1', '-3.5');
            vLine.setAttribute('x2', '0'); vLine.setAttribute('y2', '3.5');
            vLine.setAttribute('stroke', '#fff');
            vLine.setAttribute('stroke-width', '1.5');
            vLine.setAttribute('stroke-linecap', 'round');
            btnG.appendChild(vLine);

            btnG.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                createAttachedFloatingNode(fn.data.uid, false);
            });
            btnG.addEventListener('mouseenter', () => circle.setAttribute('fill', '#488075'));
            btnG.addEventListener('mouseleave', () => circle.setAttribute('fill', APP_CONFIG.colors.accent));

            g.appendChild(btnG);
        }

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
function edgePoint(cx, cy, w, h, toX, toY, isVerticalLayout = false, isAttached = false) {
    if (isAttached) {
        // 依附连线：如果是垂直布局，起点/终点是上下边缘中点；如果是水平布局，起点/终点是左右边缘中点
        if (isVerticalLayout) {
            // cx, cy 是中心点，我们假设目标在下方，则返回下边缘；在上方则返回上边缘
            // 修改这里，避免返回不确定的值。明确判断方向：
            const y = toY >= cy ? cy + h/2 : cy - h/2;
            return { x: cx, y: y };
        } else {
            const x = toX >= cx ? cx + w/2 : cx - w/2;
            return { x: x, y: cy };
        }
    }

    // 默认的普通关系线
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

    // 为了支持挂载在普通节点（或摘要节点）上的自定义关系线，我们提取所有包含 _relations 数据的节点
    const nodesWithRels = [];
    // 添加浮动节点
    floatingNodes.forEach(fn => {
        if (fn.data._relations && fn.data._relations.length > 0) {
            nodesWithRels.push({ type: 'float', node: fn, rels: fn.data._relations });
        }
    });
    // 添加带有 _relations 的普通节点或摘要节点
    if (mindMap && mindMap.renderer && mindMap.renderer.nodeCache) {
        Object.values(mindMap.renderer.nodeCache).forEach(n => {
            const r = n.getData('_relations');
            if (r && r.length > 0) {
                nodesWithRels.push({ type: 'regular', node: n, rels: r });
            }
            // 同时检查其身上的摘要节点是否有 _relations
            if (n._generalizationList && n._generalizationList.length > 0) {
                n._generalizationList.forEach(g => {
                    if (g.generalizationNode) {
                        const gr = g.generalizationNode.getData('_relations');
                        if (gr && gr.length > 0) {
                            nodesWithRels.push({ type: 'regular', node: g.generalizationNode, rels: gr });
                        }
                    }
                });
            }
        });
    }

    nodesWithRels.forEach(item => {
        const rels = item.rels;
        // 过滤失效关系
        const validRels = rels.filter(rel => {
            try {
                if (floatingNodes.some(f => f.data.uid === rel.nodeUid)) return true;
                const n = mindMap.renderer.findNodeByUid(rel.nodeUid);
                if (n) return true;
                const cache = mindMap.renderer.nodeCache;
                if (cache && Object.values(cache).some(nd => nd.getData && nd.getData('uid') === rel.nodeUid)) return true;
                return true;
            } catch (e) { return true; }
        });
        
        // 更新原数据中的关系
        if (item.type === 'float') {
            item.node.data._relations = validRels;
        } else {
            item.node.setData({ _relations: validRels });
        }

        validRels.forEach((rel, relIdx) => {
            // 获取起点 fc, fw, fh
            let fc = { x: 0, y: 0 }, fw = 100, fh = 32;
            if (item.type === 'float') {
                fc.x = item.node.data.x;
                fc.y = item.node.data.y;
                const text = item.node.data.text || '';
                const fontSize = item.node.data.fontSize || 14;
                fw = Math.max(text.length * fontSize, fontSize * 2) + APP_CONFIG.floatingNode.horizontalPadding;
                fh = text.split('\n').length * fontSize * APP_CONFIG.floatingNode.lineHeight + 12;
            } else {
                const n = item.node;
                // 原生节点 (包括摘要节点，因为 simple-mind-map 内部也给它计算了 left/top)
                fc.x = n.left + n.width / 2;
                fc.y = n.top + n.height / 2;
                fw = n.width;
                fh = n.height;
            }

            // 获取终点 tc, tw, th
            let tc = null, tw = 100, th = 32;
            try {
                const targetFloat = floatingNodes.find(f => f.data.uid === rel.nodeUid);
                if (targetFloat) {
                    tc = { x: targetFloat.data.x, y: targetFloat.data.y };
                    tw = 80; th = 30; // 预估宽高
                } else {
                    const targetNode = mindMap.renderer.findNodeByUid(rel.nodeUid);
                    if (targetNode && typeof targetNode.left === 'number') {
                        tc = { x: targetNode.left + (targetNode.width || 100) / 2, y: targetNode.top + (targetNode.height || 32) / 2 };
                        tw = targetNode.width || 100; th = targetNode.height || 32;
                    }
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

            const isAttached = rel.isAttached; // 是否为依附衍生节点生成的连线
            const layout = mindMap.opt.layout || 'logicalStructure';
            const isVerticalLayout = layout.toLowerCase().includes('organization') || layout === 'timeline2';

            const p1 = edgePoint(fc.x, fc.y, fw, fh, tc.x, tc.y, isVerticalLayout, isAttached);
            const p2 = edgePoint(tc.x, tc.y, tw, th, fc.x, fc.y, isVerticalLayout, isAttached);

            const color = rel.color || APP_CONFIG.colors.accent;
            const dash = rel.dasharray || '6,4';
            const lineWidth = rel.width || 2;
            const label = rel.label || '';
            const isActive = rel._active;
            const arrowTo = rel.arrowTo || 'float'; // 箭头指向谁

            const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            lineGroup.setAttribute('class', 'float-relation-line-group');
            lineGroup.setAttribute('data-float-uid', item.type === 'float' ? item.node.data.uid : item.node.getData('uid'));
            lineGroup.setAttribute('data-rel-idx', relIdx);
            lineGroup.style.cursor = 'pointer';

            // 路径方向：根据箭头指向决定起终点
            let from, to;
            if (arrowTo === 'regular') {
                from = p1; to = p2; // 路径 float→regular，箭头在 regular 端
            } else {
                from = p2; to = p1; // 路径 regular→float，箭头在 float 端
            }
            
            // 绘制类似主分支的平滑贝塞尔曲线
            let d = '';
            let mx = (from.x + to.x) / 2;
            let my = (from.y + to.y) / 2;
            let ctrlX = mx, ctrlY = my;

            // 为了让所有关系线都变成“能调整形状”的那种关系线，我们甚至可以把它转换成真正的原生关联线
            // 不过对于 isAttached (分支衍生节点)，依然保留其固定计算的平滑曲线，因为那是模拟子节点结构的。
            // 对于非 isAttached 的关系线，我们将它渲染成带有一点弧度的曲线。
            if (isAttached) {
                // 如果是衍生的节点，我们保持它的结构化排版特征（类似系统原生子节点）
                if (isVerticalLayout) {
                    const midY = (from.y + to.y) / 2;
                    d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
                    mx = (from.x + to.x) / 2;
                    my = midY;
                } else {
                    const midX = (from.x + to.x) / 2;
                    d = `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
                    mx = midX;
                    my = (from.y + to.y) / 2;
                }
            } else {
                // 对于普通关系线，使用带自然弧度的二次贝塞尔曲线
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // 为了让它能像原生关联线那样，我们使用其自身带有的控制点属性（如果有）
                if (rel.controlPoint) {
                    ctrlX = rel.controlPoint.x;
                    ctrlY = rel.controlPoint.y;
                } else {
                    // 默认的弯曲程度
                    const offset = dist * 0.2; 
                    const safeOffset = Math.min(offset, 50);
                    // 根据方向计算法线，使得曲线有一个自然的弧度
                    const nx = dy / dist * safeOffset;
                    const ny = -dx / dist * safeOffset;
                    ctrlX = mx + nx;
                    ctrlY = my + ny;
                }
                
                d = `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`;
                // 对于二次贝塞尔曲线 Q，其中点 t=0.5 的位置：
                mx = 0.25 * from.x + 0.5 * ctrlX + 0.25 * to.x;
                my = 0.25 * from.y + 0.5 * ctrlY + 0.25 * to.y;
            }

            // 确保箭头 marker 存在
            let arrowMarker = svg.querySelector('#float-arrow');
            if (!arrowMarker) {
                const defs = svg.querySelector('defs');
                if (defs) {
                    arrowMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                    arrowMarker.setAttribute('id', 'float-arrow');
                    arrowMarker.setAttribute('viewBox', '0 0 8 8');
                    arrowMarker.setAttribute('refX', '8'); arrowMarker.setAttribute('refY', '4');
                    arrowMarker.setAttribute('markerWidth', '6'); arrowMarker.setAttribute('markerHeight', '6');
                    arrowMarker.setAttribute('orient', 'auto');
                    const ap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    ap.setAttribute('d', 'M 0 0 L 8 4 L 0 8 z');
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
            if (!isAttached && rel.showArrow !== false) {
                path.setAttribute('marker-end', 'url(#float-arrow)');
            }
            lineGroup.appendChild(path);

            let labelTextEl = null;
            if (label) {
                labelTextEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                labelTextEl.setAttribute('x', mx);
                labelTextEl.setAttribute('y', my - 8);
                labelTextEl.setAttribute('text-anchor', 'middle');
                labelTextEl.setAttribute('fill', '#666');
                labelTextEl.setAttribute('font-size', '11');
                labelTextEl.setAttribute('font-family', 'sans-serif');
                labelTextEl.textContent = label;
                labelTextEl.setAttribute('class', 'float-relation-label');
                lineGroup.appendChild(labelTextEl);
            }

            if (isActive && !isAttached) {
                const ctrlGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                ctrlGroup.setAttribute('class', 'float-relation-ctrl');
                ctrlGroup.style.cursor = 'move';
                
                const cpLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                cpLine1.setAttribute('x1', from.x); cpLine1.setAttribute('y1', from.y);
                cpLine1.setAttribute('x2', ctrlX); cpLine1.setAttribute('y2', ctrlY);
                cpLine1.setAttribute('stroke', '#e55'); cpLine1.setAttribute('stroke-width', '1');
                cpLine1.setAttribute('stroke-dasharray', '3,3');
                ctrlGroup.appendChild(cpLine1);

                const cpLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                cpLine2.setAttribute('x1', to.x); cpLine2.setAttribute('y1', to.y);
                cpLine2.setAttribute('x2', ctrlX); cpLine2.setAttribute('y2', ctrlY);
                cpLine2.setAttribute('stroke', '#e55'); cpLine2.setAttribute('stroke-width', '1');
                cpLine2.setAttribute('stroke-dasharray', '3,3');
                ctrlGroup.appendChild(cpLine2);

                const ctrlCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ctrlCircle.setAttribute('cx', ctrlX);
                ctrlCircle.setAttribute('cy', ctrlY);
                ctrlCircle.setAttribute('r', '6');
                ctrlCircle.setAttribute('fill', '#fff');
                ctrlCircle.setAttribute('stroke', '#e55');
                ctrlCircle.setAttribute('stroke-width', '2');
                ctrlGroup.appendChild(ctrlCircle);

                let isDraggingCtrl = false;
                let startX, startY, initCtrlX, initCtrlY;

                const onMove = (e) => {
                    if (!isDraggingCtrl) return;
                    const transform = mindMap.view.getTransformData();
                    const scale = (transform && transform.state) ? transform.state.scale : 1;
                    const dx = (e.clientX - startX) / scale;
                    const dy = (e.clientY - startY) / scale;
                    
                    if (!rel.controlPoint) rel.controlPoint = {};
                    rel.controlPoint.x = initCtrlX + dx;
                    rel.controlPoint.y = initCtrlY + dy;
                    
                    ctrlCircle.setAttribute('cx', rel.controlPoint.x);
                    ctrlCircle.setAttribute('cy', rel.controlPoint.y);
                    cpLine1.setAttribute('x2', rel.controlPoint.x);
                    cpLine1.setAttribute('y2', rel.controlPoint.y);
                    cpLine2.setAttribute('x2', rel.controlPoint.x);
                    cpLine2.setAttribute('y2', rel.controlPoint.y);
                    
                    const newD = `M ${from.x} ${from.y} Q ${rel.controlPoint.x} ${rel.controlPoint.y} ${to.x} ${to.y}`;
                    path.setAttribute('d', newD);
                    hitPath.setAttribute('d', newD);
                    
                    if (labelTextEl) {
                        const newMx = 0.25 * from.x + 0.5 * rel.controlPoint.x + 0.25 * to.x;
                        const newMy = 0.25 * from.y + 0.5 * rel.controlPoint.y + 0.25 * to.y;
                        labelTextEl.setAttribute('x', newMx);
                        labelTextEl.setAttribute('y', newMy - 8);
                    }
                };
                
                const onUp = () => {
                    if (isDraggingCtrl) {
                        isDraggingCtrl = false;
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        isDirty = true;
                        if (item.type === 'regular') item.node.setData({ _relations: validRels });
                    }
                };

                ctrlGroup.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    isDraggingCtrl = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    initCtrlX = ctrlX;
                    initCtrlY = ctrlY;
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });

                lineGroup.appendChild(ctrlGroup);
            }

            lineGroup.addEventListener('click', (e) => {
                e.stopPropagation();
                floatingNodes.forEach(f => { if (f.data._relations) f.data._relations.forEach(r => r._active = false); });
                if (mindMap && mindMap.renderer && mindMap.renderer.nodeCache) {
                    Object.values(mindMap.renderer.nodeCache).forEach(n => {
                        const r = n.getData('_relations');
                        if (r) r.forEach(x => x._active = false);
                    });
                }
                rel._active = true;
                isDirty = true;
                renderFloatRelationLines();
                // 如果是挂在普通节点上，我们也可以给它一个面板，但面板目前只接受浮动节点格式
                // 暂时用 item 包装传入
                showRelationLinePanel(item, rel, relIdx);
            });

            lineGroup.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const newLabel = prompt('关系线标签（留空删除）:', label);
                if (newLabel !== null) {
                    rel.label = newLabel.trim() || '';
                    isDirty = true;
                    if (item.type === 'regular') item.node.setData({ _relations: validRels });
                    renderFloatRelationLines();
                }
            });

            transformGroup.appendChild(lineGroup);
        });
    });
}

// 关系线样式面板
function showRelationLinePanel(item, rel, relIdx) {
    const body = document.getElementById('property-body');
    const color = rel.color || APP_CONFIG.colors.accent;
    const dash = rel.dasharray || '6,4';
    const lineWidth = rel.width || 2;
    const label = rel.label || '';
    const showArrow = rel.showArrow !== false; // 默认显示
    
    const nodeText = item.type === 'float' ? (item.node.data.text || '') : (item.node.getData('text') || '');

    body.innerHTML = `
        <div class="property-group">
            <div class="property-group-label" style="color:var(--accent);font-weight:600">关系线样式</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
                ${escapeHtml(nodeText)} → ${escapeHtml(rel.nodeText || '节点')}
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
            ${!rel.isAttached ? `
            <div class="property-row" style="margin-top: 8px;">
                <label style="display:flex;align-items:center;font-size:12px;color:var(--text);cursor:pointer;">
                    <input type="checkbox" id="rel-show-arrow" ${showArrow ? 'checked' : ''} style="margin-right:6px;">
                    显示箭头
                </label>
            </div>
            ` : ''}
            <div style="margin-top:8px">
                <button class="btn btn-sm" id="rel-delete" style="color:#e55">删除关系线</button>
            </div>
        </div>
    `;

    const updateRel = (prop, val) => { 
        rel[prop] = val; 
        isDirty = true; 
        if (item.type === 'regular') item.node.setData({ _relations: item.rels });
        renderFloatRelationLines(); 
    };

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
    
    const showArrowCb = document.getElementById('rel-show-arrow');
    if (showArrowCb) {
        showArrowCb.addEventListener('change', (e) => updateRel('showArrow', e.target.checked));
    }

    document.getElementById('rel-delete').addEventListener('click', () => {
        if (item.type === 'float') {
            item.node.data._relations.splice(relIdx, 1);
        } else {
            item.rels.splice(relIdx, 1);
            item.node.setData({ _relations: item.rels });
        }
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

    const x = fn.data.x ?? APP_CONFIG.floatingNode.x;
    const y = fn.data.y ?? APP_CONFIG.floatingNode.y;
    const text = fn.data.text || APP_CONFIG.floatingNode.text;
    const textLines = text.split('\n');
    const fontSize = fn.data.fontSize || APP_CONFIG.floatingNode.fontSize;
    const textColor = fn.data.color || APP_CONFIG.floatingNode.color;
    const bgColor = fn.data.fillColor || APP_CONFIG.floatingNode.fillColor;
    const borderColor = fn.data.borderColor || APP_CONFIG.floatingNode.borderColor;
    const borderDash = fn.data.borderDasharray || 'none';
    const borderW = fn.data.borderWidth ?? APP_CONFIG.floatingNode.borderWidth;

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
        const bgColor = fn.data.fillColor || APP_CONFIG.floatingNode.fillColor;
        const textColor = fn.data.color || APP_CONFIG.floatingNode.color;
        const borderColor = fn.data.borderColor || APP_CONFIG.floatingNode.borderColor;
        const rawDash = fn.data.borderDasharray || '';
        const borderStyle = rawDash === '5,5' ? 'dashed' : (rawDash === '2,2' ? 'dotted' : 'solid');
        const bWidth = fn.data.borderWidth ?? APP_CONFIG.floatingNode.borderWidth;
        const fontSize = fn.data.fontSize || APP_CONFIG.floatingNode.fontSize;
        const fontWeight = fn.data.fontWeight || 'normal';
        const fontStyle = fn.data.fontStyle || 'normal';
        const textDecoration = fn.data.textDecoration || 'none';
        const tags = fn.data.tag || [];
        const note = fn.data.note || '';
        const hyperlink = fn.data.hyperlink || '';
        const plainNote = note ? stripHtml(note).trim() : '';
        const hasNote = hasVisibleNoteContent(note);
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
                    ${hasNote ? '📝 ' + (plainNote ? escapeHtml(plainNote.substring(0, 30)) + (plainNote.length > 30 ? '...' : '') : '[图片/富文本]') : '📝 添加备注...'}
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
        document.getElementById('pf-font-color').addEventListener('change', (e) => { updatePropertyPanelForFloatingNode(fn); });
        document.getElementById('pf-font-color-reset').addEventListener('click', () => { fn.data.color = null; fn.data.fontColor = null; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 背景颜色
        document.getElementById('pf-bg-color').addEventListener('input', (e) => { fn.data.fillColor = e.target.value; upd(); });
        document.getElementById('pf-bg-color').addEventListener('change', (e) => { updatePropertyPanelForFloatingNode(fn); });
        document.getElementById('pf-bg-color-reset').addEventListener('click', () => { fn.data.fillColor = '#ffffff'; upd(); updatePropertyPanelForFloatingNode(fn); });
        // 边框颜色
        document.getElementById('pf-border-color').addEventListener('input', (e) => { fn.data.borderColor = e.target.value; upd(); });
        document.getElementById('pf-border-color').addEventListener('change', (e) => { updatePropertyPanelForFloatingNode(fn); });
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
    openModal('modal-note');
    initNoteEditorIfNeeded();

    const note = fn.data.note || '';
    if (wangEditorInstance) {
        const cleanHtml = dedupeNestedNoteHtml(note);
        wangEditorInstance.setHtml(cleanHtml);
        setTimeout(() => {
            flattenNoteEditorIfNeeded();
            initialNoteContentForCompare = wangEditorInstance.getHtml();
        }, 120);
    }
    document.getElementById('modal-note-save').onclick = () => {
        if (window.isAIGenerating) {
            if (confirm('AI正在生成排版内容，确定要中断并保存当前内容吗？')) {
                if (window.aiFormatController) {
                    window.aiFormatController.abort();
                }
                window.isAIGenerating = false;
            } else {
                return;
            }
        }
        
        let noteHtml = '';
        if (wangEditorInstance) {
            // 保存前清洗，不把嵌套脏数据写回
            flattenNoteEditorIfNeeded();
            noteHtml = dedupeNestedNoteHtml(wangEditorInstance.getHtml());
        }
        const finalNote = hasVisibleNoteContent(noteHtml) ? noteHtml : null;
        
        fn.data.note = finalNote;
        isDirty = true;
        renderFloatingNodes();
        closeModal('modal-note');
        updatePropertyPanelForFloatingNode(fn);
        showToast(finalNote ? '备注已保存' : '备注已移除');
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
            text: item.data.text || APP_CONFIG.floatingNode.text,
            x: item.data.x ?? APP_CONFIG.floatingNode.x,
            y: item.data.y ?? APP_CONFIG.floatingNode.y,
            isActive: false,
            color: item.data.color || APP_CONFIG.floatingNode.color,
            fillColor: item.data.fillColor || APP_CONFIG.floatingNode.fillColor,
            borderColor: item.data.borderColor || APP_CONFIG.floatingNode.borderColor,
            borderDasharray: item.data.borderDasharray || '',
            borderWidth: item.data.borderWidth ?? APP_CONFIG.floatingNode.borderWidth,
            fontSize: item.data.fontSize || APP_CONFIG.floatingNode.fontSize,
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

