/**
 * AI Mind - 思维导图应用
 * 基于 simple-mind-map 库
 */

const MindMap = window.simpleMindMap.default;

// ============ State ============
let mindMap = null;
window.mindMap = null; // expose for testing
let currentUid = null;
let isDirty = false;

// 浮动节点（无关联的自由节点）
let floatingNodes = [];
let _floatingNodeEditingUid = null; // 正在内联编辑的浮动节点UID
let _ctrlHeld = false; // 追踪 Ctrl 键是否按下，用于多选逻辑
let wangEditorInstance = null; // 备注富文本编辑器实例
let _activeGenUid = null; // 当前选中（单击）的摘要节点UID，用于控制+号显示
// 富文本上次使用的文字/背景颜色：全局记忆，跨文档/节点共享，页面加载即从 localStorage 恢复
let _lastUsedTextColor = (() => { try { return localStorage.getItem('wangeditor_last_text_color') || null; } catch (_) { return null; } })();
let _lastUsedBgColor = (() => { try { return localStorage.getItem('wangeditor_last_bg_color') || null; } catch (_) { return null; } })();

// 过滤HTML标签工具函数
function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}

// 清洗备注HTML，只保留富文本编辑器会产生的常用安全标签和样式
function sanitizeNoteHtml(html) {
    if (!html) return '';
    const template = document.createElement('template');
    template.innerHTML = html;

    const allowedTags = new Set([
        'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'H1', 'H2', 'H3',
        'H4', 'H5', 'H6', 'HR', 'I', 'IMG', 'INS', 'LI', 'MARK', 'OL', 'P', 'PRE',
        'S', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH',
        'THEAD', 'TR', 'U', 'UL'
    ]);
    const blockedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META']);
    const globalAttrs = new Set(['align', 'class', 'style', 'title']);
    const tagAttrs = {
        A: new Set(['href', 'rel', 'target']),
        IMG: new Set(['alt', 'height', 'src', 'width']),
        TD: new Set(['colspan', 'rowspan']),
        TH: new Set(['colspan', 'rowspan'])
    };
    const allowedStyles = new Set([
        'background-color', 'border', 'border-bottom', 'border-color', 'border-left',
        'border-right', 'border-top', 'border-width', 'color', 'font-family', 'font-size',
        'font-style', 'font-weight', 'height', 'line-height', 'margin', 'margin-bottom',
        'margin-left', 'margin-right', 'margin-top', 'padding', 'padding-bottom',
        'padding-left', 'padding-right', 'padding-top', 'text-align', 'text-decoration',
        'text-indent', 'vertical-align', 'width'
    ]);

    const isSafeUrl = (value, allowDataImage = false) => {
        const trimmed = (value || '').trim();
        if (!trimmed) return false;
        const lower = trimmed.toLowerCase().replace(/\s/g, '');
        if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) return false;
        if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) return true;
        if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
        try {
            const url = new URL(trimmed, window.location.origin);
            return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
        } catch (err) {
            return false;
        }
    };

    const cleanStyle = (styleText) => {
        return styleText
            .split(';')
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => {
                const index = item.indexOf(':');
                if (index === -1) return '';
                const prop = item.slice(0, index).trim().toLowerCase();
                const value = item.slice(index + 1).trim();
                const unsafeValue = /expression\s*\(|url\s*\(|@import|[<>]/i.test(value);
                if (!allowedStyles.has(prop) || unsafeValue) return '';
                return `${prop}: ${value}`;
            })
            .filter(Boolean)
            .join('; ');
    };

    const cleanNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) {
            node.remove();
            return;
        }

        const tagName = node.tagName.toUpperCase();
        if (blockedTags.has(tagName)) {
            node.remove();
            return;
        }

        Array.from(node.childNodes).forEach(cleanNode);

        if (!allowedTags.has(tagName)) {
            const parent = node.parentNode;
            if (!parent) return;
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            node.remove();
            return;
        }

        Array.from(node.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            const allowedForTag = tagAttrs[tagName] && tagAttrs[tagName].has(name);
            if (name.startsWith('on') || (!globalAttrs.has(name) && !allowedForTag)) {
                node.removeAttribute(attr.name);
                return;
            }
            if (name === 'style') {
                const safeStyle = cleanStyle(attr.value);
                if (safeStyle) node.setAttribute('style', safeStyle);
                else node.removeAttribute('style');
                return;
            }
            if (name === 'href' && !isSafeUrl(attr.value)) {
                node.removeAttribute(attr.name);
                return;
            }
            if (name === 'src' && !isSafeUrl(attr.value, true)) {
                node.removeAttribute(attr.name);
            }
        });

        if (tagName === 'A' && node.getAttribute('href')) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    };

    Array.from(template.content.childNodes).forEach(cleanNode);
    return template.innerHTML.trim();
}

let richNoteTooltipWrapperEl = null;  // 外层包裹（编辑按钮 + 内容区）
let richNoteTooltipEl = null;        // 内容区（原有 div.rich-tooltip）
let richNoteTooltipHideTimer = null;
let isMouseInTooltip = false;
// 当前悬浮层对应的节点来源，供编辑按钮点击时使用
let _noteTooltipSource = null;  // { type: 'regular'|'float', node: obj, uid: string }

// 获取共享备注悬浮层包裹（含编辑按钮 + 内容区）
function getRichNoteTooltipEl() {
    if (richNoteTooltipWrapperEl) return richNoteTooltipWrapperEl;

    // 外层包裹
    richNoteTooltipWrapperEl = document.createElement('div');
    richNoteTooltipWrapperEl.className = 'rich-tooltip-wrapper';
    richNoteTooltipWrapperEl.setAttribute('aria-hidden', 'true');

    // 编辑按钮
    const editBtn = document.createElement('div');
    editBtn.className = 'rich-tooltip-edit-btn';
    editBtn.innerHTML = '✏️ 编辑';
    editBtn.title = '点击修改备注';
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!_noteTooltipSource) return;
        const src = _noteTooltipSource;
        // 点击后立即隐藏备注悬浮层，避免挡住弹出的编辑框
        isMouseInTooltip = false;
        hideRichNoteTooltip(0);
        if (src.type === 'regular' && src.node) {
            // 直接传 node 对象打开备注编辑器（不依赖 activeNodeCache）
            if (src.node.getData) {
                openNoteEditor(src.node);
            } else if (src.uid && mindMap && mindMap.renderer) {
                const found = mindMap.renderer.findNodeByUid(src.uid);
                if (found) openNoteEditor(found);
            }
        } else if (src.type === 'float' && src.node) {
            openFloatNoteEditor(src.node);
        }
    });

    // 内容区
    richNoteTooltipEl = document.createElement('div');
    richNoteTooltipEl.className = 'rich-tooltip';
    richNoteTooltipWrapperEl.appendChild(richNoteTooltipEl);
    // 编辑按钮在内容下方（左下角）
    richNoteTooltipWrapperEl.appendChild(editBtn);

    // 鼠标进入悬浮层时取消隐藏定时器
    richNoteTooltipWrapperEl.addEventListener('mouseenter', () => {
        isMouseInTooltip = true;
        if (richNoteTooltipHideTimer) {
            clearTimeout(richNoteTooltipHideTimer);
            richNoteTooltipHideTimer = null;
        }
    });

    // 鼠标离开悬浮层时立即隐藏
    richNoteTooltipWrapperEl.addEventListener('mouseleave', () => {
        isMouseInTooltip = false;
        hideRichNoteTooltip(0);
    });

    document.body.appendChild(richNoteTooltipWrapperEl);
    return richNoteTooltipWrapperEl;
}

// 设置当前备注悬浮层对应的节点来源（在 showRichNoteTooltip 前调用）
function setNoteTooltipSource(type, node, uid) {
    _noteTooltipSource = node ? { type, node, uid } : null;
}

// 判断清洗后的备注是否还有可展示内容
function hasVisibleNoteContent(html) {
    if (!html) return false;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const hasText = !!tmp.textContent.trim();
    const hasMedia = !!tmp.querySelector('img, table, hr, iframe, video, audio, canvas, svg');
    return hasText || hasMedia;
}

// 定位富文本备注悬浮层，避免贴到窗口边缘外
function positionRichNoteTooltip(left, top, anchorRect) {
    const wrapper = getRichNoteTooltipEl();
    const tooltip = richNoteTooltipEl;
    const gap = 10;
    const margin = 8;

    // 先让 wrapper 可见但透明，以便测量尺寸
    wrapper.style.display = 'flex';
    wrapper.style.visibility = 'hidden';
    wrapper.style.left = '0';
    wrapper.style.top = '0';

    // 限制 tooltip 内容最大高度
    const maxHeight = Math.min(640, window.innerHeight - 2 * margin);
    const editBtnH = 32; // 编辑按钮 + 间距大约占 32px
    tooltip.style.maxHeight = (maxHeight - editBtnH) + 'px';

    const wrapperRect = wrapper.getBoundingClientRect();
    let x = anchorRect ? anchorRect.left : left;
    let y = anchorRect ? anchorRect.bottom + gap : top;

    x = Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - wrapperRect.width - margin));

    // 如果向下展开会超出屏幕，则向上展开
    if (y + wrapperRect.height > window.innerHeight - margin && anchorRect) {
        y = anchorRect.top - wrapperRect.height - gap;
    }

    // 最后确保不超出上下边界
    y = Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - wrapperRect.height - margin));

    wrapper.style.visibility = 'visible';
    wrapper.style.left = x + 'px';
    wrapper.style.top = y + 'px';
}

// 显示共享富文本备注悬浮层
function showRichNoteTooltip(noteHtml, left, top, anchorRect) {
    if (richNoteTooltipHideTimer) {
        clearTimeout(richNoteTooltipHideTimer);
        richNoteTooltipHideTimer = null;
    }
    const safeHtml = sanitizeNoteHtml(noteHtml);
    if (!hasVisibleNoteContent(safeHtml)) {
        hideRichNoteTooltip(0);
        return;
    }
    const wrapper = getRichNoteTooltipEl();
    const tooltip = richNoteTooltipEl;
    tooltip.innerHTML = safeHtml;

    // 动态调整宽度：如果图片宽度大于最长文本，则缩放图片到最长文本宽度
    tooltip.style.width = 'max-content';

    const imgs = tooltip.querySelectorAll('img');
    if (imgs.length > 0) {
        // 先隐藏图片，测量纯文本的宽度
        const originalDisplays = [];
        imgs.forEach((img, i) => {
            originalDisplays.push(img.style.display);
            img.style.display = 'none';
        });

        // 测量文本内容的宽度（包含padding）
        const textWidth = tooltip.getBoundingClientRect().width;

        // 恢复图片显示
        imgs.forEach((img, i) => {
            img.style.display = originalDisplays[i];
            img.style.cursor = 'pointer';
            img.onclick = (e) => {
                e.stopPropagation();
                showImagePreview(img.src);
            };
        });

        if (textWidth > 40) {
            tooltip.style.width = textWidth + 'px';
        }
    }

    wrapper.setAttribute('aria-hidden', 'false');
    positionRichNoteTooltip(left, top, anchorRect);
}

// 隐藏共享富文本备注悬浮层
function hideRichNoteTooltip(delay) {
    if (isMouseInTooltip) return;

    const hideDelay = typeof delay === 'number' ? delay : 300;

    if (richNoteTooltipHideTimer) {
        clearTimeout(richNoteTooltipHideTimer);
    }

    if (hideDelay > 0) {
        richNoteTooltipHideTimer = setTimeout(() => {
            const wrapper = getRichNoteTooltipEl();
            wrapper.style.display = 'none';
            wrapper.setAttribute('aria-hidden', 'true');
            _noteTooltipSource = null;
            richNoteTooltipHideTimer = null;
        }, hideDelay);
    } else {
        const wrapper = getRichNoteTooltipEl();
        wrapper.style.display = 'none';
        wrapper.setAttribute('aria-hidden', 'true');
        _noteTooltipSource = null;
        richNoteTooltipHideTimer = null;
    }
}

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
            centerY = targetNode.top + targetNode.height + 60 + 15;
        } else {
            rightEdge = targetNode.left + targetNode.width + 60 + 40;
            centerY = targetNode.top + targetNode.height / 2;
        }
    } else if (targetNode) {
        if (isVerticalLayout) {
            // 普通节点
            rightEdge = targetNode.left + targetNode.width / 2;
            centerY = targetNode.top + targetNode.height + 60 + 15;
        } else {
            rightEdge = targetNode.left + targetNode.width + 60 + 40;
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
                centerY = parentFloat.data.y + fh/2 + 60 + 15;
            } else {
                rightEdge = parentFloat.data.x + fw/2 + 60 + 40; 
                centerY = parentFloat.data.y;
            }
        }
    }
    
    const uid = generateFloatUid();
    // 默认颜色同 mindMap 连线颜色
    const lineColor = window._branchLineGlobalStyle ? window._branchLineGlobalStyle.color : '#549688';

    const floatNode = {
        data: {
            uid: uid,
            text: '新分支',
            x: rightEdge, 
            y: centerY,
            isActive: false,
            color: '#333333',
            fillColor: '#ffffff',
            fontSize: 14,
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
        floatNode.data._attachedTo.offsetY = 60; // 纯间距
    } else {
        floatNode.data._attachedTo.offsetX = 60; // 纯间距
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
            circle.setAttribute('fill', '#549688');
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
            btnG.addEventListener('mouseleave', () => circle.setAttribute('fill', '#549688'));

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
                fw = Math.max(text.length * fontSize, fontSize * 2) + 24;
                fh = text.split('\n').length * fontSize * 1.4 + 12;
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

            const color = rel.color || '#549688';
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
    const color = rel.color || '#549688';
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
        // 接管库默认备注浮层，使用统一富文本悬浮层显示备注HTML
        customNoteContentShow: {
            show: (note, left, top, node) => {
                const anchorRect = node && node._noteData && node._noteData.node && node._noteData.node.node
                    ? node._noteData.node.node.getBoundingClientRect()
                    : null;
                const uid = node && node.getData ? node.getData('uid') : null;
                setNoteTooltipSource('regular', node, uid);
                showRichNoteTooltip(note, left, top, anchorRect);
            },
            hide: hideRichNoteTooltip,
        },
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

    // 注册自定义快捷键
    if (mindMap.keyCommand && typeof mindMap.keyCommand.addShortcut === 'function') {
        mindMap.keyCommand.addShortcut('Spacebar|Space|space', () => {
            // 检查是否有选中的浮动节点
            const activeFloatingNode = floatingNodes.find(n => n.data.isActive);
            if (activeFloatingNode) {
                startFloatingNodeEdit(activeFloatingNode);
                return;
            }
            if (window._selectedFloatingNode) {
                startFloatingNodeEdit(window._selectedFloatingNode);
                return;
            }
            
            // 检查是否有选中的普通节点
            const activeNodes = mindMap.renderer.activeNodeList;
            if (activeNodes && activeNodes.length > 0) {
                const activeNode = activeNodes[0];
                if (mindMap.core && mindMap.core.textEdit) {
                    mindMap.core.textEdit.show({ node: activeNode });
                } else if (mindMap.renderer && mindMap.renderer.textEdit) {
                    if (typeof mindMap.renderer.textEdit.show === 'function') {
                        mindMap.renderer.textEdit.show({ node: activeNode });
                    } else if (typeof mindMap.renderer.textEdit.showEditTextBox === 'function') {
                        mindMap.renderer.textEdit.showEditTextBox(activeNode);
                    }
                }
            }
        });
    }

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
                // 不要在这里调用 setData 触发 data_change 或历史记录
                // 因为 node.setData 会导致重新渲染和各种事件触发
                // mindMap.associativeLine.isNotRenderAllLines = true;
                // node.setData({ associativeLineStyle: style });
                Object.assign(node.data, { associativeLineStyle: style });
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
        setTimeout(updatePropertyPanel, 0);
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
        // 渲染摘要节点的 + 号按钮
        renderSummaryPlusButtons();
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
        // 如果我们刚刚正在记录历史或者恢复历史，就不触发自动保存标记
        isDirty = true;
        updateStatusBar();
        updateOutline();
        renderFloatingNodes();
    });

    mindMap.on('view_data_change', () => {
        updateZoomText();
        renderFloatingNodes();
    });

    mindMap.on('draw_click', () => {
        activeNodeCache = [];
        // 取消浮动节点和关系线选中
        floatingNodes.forEach(n => {
            n.data.isActive = false;
            if (n.data._relations) n.data._relations.forEach(r => r._active = false);
        });
        // 取消普通节点/摘要节点上的自定义关系线选中
        if (mindMap && mindMap.renderer && mindMap.renderer.nodeCache) {
            Object.values(mindMap.renderer.nodeCache).forEach(n => {
                const r = n.getData('_relations');
                if (r) r.forEach(x => x._active = false);
                
                // 检查其上的摘要节点
                if (n._generalizationList && n._generalizationList.length > 0) {
                    n._generalizationList.forEach(g => {
                        if (g.generalizationNode) {
                            const gr = g.generalizationNode.getData('_relations');
                            if (gr) gr.forEach(x => x._active = false);
                        }
                    });
                }
            });
        }
        window._selectedFloatingNode = null;
        window._relationFirst = null;
        renderFloatingNodes();
        _updatingPropertyPanel = false;
        // 取消摘要节点选中，隐藏+号
        if (_activeGenUid) {
            _activeGenUid = null;
            renderSummaryPlusButtons();
        }
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
        
        // 检查当前选中的是否是摘要节点
        const isGenNodeSelected = activeNodeCache.length > 0 && activeNodeCache[0].isGeneralization;
        
        // 选中普通节点时取消摘要+号
        if (_activeGenUid && activeNodeCache.length > 0 && !isGenNodeSelected) {
            _activeGenUid = null;
            renderSummaryPlusButtons();
        }
        // 浮动节点先选中 + Ctrl+点击普通节点 → 自动建立关系线
        if (_ctrlHeld && window._selectedFloatingNode && activeNodeCache.length > 0) {
            // 确定箭头方向：float先选 → 箭头指向regular，或者 regular先选指向float，或者 regular指向regular
            if (activeNodeCache[0] && activeNodeCache[0].isGeneralization) {
                // 如果是摘要节点
                let arrowTo = 'regular';
                if (window._relationFirst === 'float') arrowTo = 'regular';
                else if (window._relationFirst === 'regular') arrowTo = 'float';
                createFloatRelation(window._selectedFloatingNode, activeNodeCache[0], arrowTo);
            } else {
                const arrowTo = (window._relationFirst === 'float') ? 'regular' : 'float';
                createFloatRelation(window._selectedFloatingNode, activeNodeCache[0], arrowTo);
            }
            window._selectedFloatingNode = null;
            window._relationFirst = null;
            return;
        }
        // 取消浮动节点选中和所有关系线选中（Ctrl+多选时保留）
        if (!_ctrlHeld) {
            floatingNodes.forEach(n => {
                n.data.isActive = false;
                if (n.data._relations) n.data._relations.forEach(r => r._active = false);
            });
            if (mindMap && mindMap.renderer && mindMap.renderer.nodeCache) {
                Object.values(mindMap.renderer.nodeCache).forEach(n => {
                    const r = n.getData('_relations');
                    if (r) r.forEach(x => x._active = false);
                    
                    if (n._generalizationList && n._generalizationList.length > 0) {
                        n._generalizationList.forEach(g => {
                            if (g.generalizationNode) {
                                const gr = g.generalizationNode.getData('_relations');
                                if (gr) gr.forEach(x => x._active = false);
                            }
                        });
                    }
                });
            }
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
        // 侧边栏用树状结构
        const treeRes = await fetch('/api/tree');
        if (!treeRes.ok) {
            console.warn('/api/tree 失败，回退到平铺列表');
            const mapsRes = await fetch('/api/mindmaps');
            const mapsData = await mapsRes.json();
            renderOpenFileList(mapsData.mindmaps);
            // 用平铺列表填充侧边栏
            renderFileListFallback(mapsData.mindmaps);
            return;
        }
        const treeData = await treeRes.json();
        if (!treeData.tree || !Array.isArray(treeData.tree)) {
            console.warn('/api/tree 返回数据异常，回退到平铺列表', treeData);
            const mapsRes = await fetch('/api/mindmaps');
            const mapsData = await mapsRes.json();
            renderOpenFileList(mapsData.mindmaps);
            renderFileListFallback(mapsData.mindmaps);
            return;
        }
        renderFileTree(treeData.tree);
        // 弹出窗用平铺列表（向后兼容）
        const mapsRes = await fetch('/api/mindmaps');
        const mapsData = await mapsRes.json();
        renderOpenFileList(mapsData.mindmaps);
    } catch (err) {
        console.error('加载文件列表失败:', err);
        // 最终回退
        try {
            const mapsRes = await fetch('/api/mindmaps');
            const mapsData = await mapsRes.json();
            renderOpenFileList(mapsData.mindmaps);
            renderFileListFallback(mapsData.mindmaps);
        } catch (e) {
            document.getElementById('file-list').innerHTML = '<p class="empty-hint">加载失败，请刷新重试</p>';
        }
    }
}

// 回退渲染函数（平铺列表样式，用于树API不可用时）
function renderFileListFallback(mindmaps) {
    const list = document.getElementById('file-list');
    if (!mindmaps || mindmaps.length === 0) {
        list.innerHTML = '<p class="empty-hint">暂无文件，点击新建开始</p>';
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

async function newMindMap() {
    await autoSave();
    try {
        const res = await fetch('/api/mindmaps/new', { method: 'POST' });
        const data = await res.json();
        currentUid = data.uid;
        localStorage.setItem('ai_mind_last_opened_uid', currentUid);
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

/**
 * 生成唯一的文件夹 ID
 * @returns {string} 返回生成的唯一文件夹 ID
 */
function makeFolderId() {
    // 首先尝试使用原生加密 API（需要在安全上下文中，如 localhost 或 HTTPS）
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return 'folder-' + crypto.randomUUID();
    }
    // 如果原生 API 不可用，使用 Math.random() 提供后备方案生成 UUID v4
    return 'folder-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function newFolder() {
    const name = prompt('请输入文件夹名称：', '新建文件夹');
    if (!name || !name.trim()) return;

    const folderItem = {
        type: 'folder',
        id: makeFolderId(),
        name: name.trim(),
        isOpen: true,
        children: []
    };

    // 方案A：调用专用API
    try {
        const res = await fetch('/api/folders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
        });
        if (res.ok) {
            loadFileList();
            return;
        }
        console.warn('[newFolder] POST /api/folders 失败 (status=' + res.status + ')，回退到 /api/tree 方案');
    } catch (e) {
        console.warn('[newFolder] POST /api/folders 不可达，回退到 /api/tree 方案:', e.message);
    }

    // 方案B：直接用 /api/tree 操作
    try {
        const treeRes = await fetch('/api/tree');
        if (!treeRes.ok) {
            let detail = 'HTTP ' + treeRes.status;
            try { const e = await treeRes.json(); detail = e.detail || detail; } catch (_) {}
            throw new Error(detail);
        }
        const treeData = await treeRes.json();
        const tree = treeData.tree || [];
        tree.push(folderItem);

        const putRes = await fetch('/api/tree/save', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tree }),
        });
        if (!putRes.ok) {
            let detail = 'HTTP ' + putRes.status;
            try { const e = await putRes.json(); detail = e.detail || detail; } catch (_) {}
            showToast(detail);
            return;
        }
        loadFileList();
    } catch (err) {
        console.error('[newFolder] 回退方案也失败:', err);
        showToast(err.message || '创建文件夹失败');
    }
}

async function saveMindMap() {
    if (!mindMap) return;
    const data = mindMap.getData();
    data.layout = mindMap.opt.layout || data.layout; // 确保布局被保存
    data._floatingNodes = getFloatingNodesData();
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
        localStorage.setItem('ai_mind_last_opened_uid', currentUid);
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

async function deleteItem(id, type) {
    if (type === 'folder') {
        if (!confirm('确定删除此文件夹？')) return;
        // 方案A：调用专用API
        try {
            const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
            if (res.ok) { loadFileList(); return; }
        } catch (e) { /* 回退 */ }

        // 方案B：通过 /api/tree 操作
        try {
            const treeRes = await fetch('/api/tree');
            if (!treeRes.ok) throw new Error('无法获取文件树');
            const treeData = await treeRes.json();
            const tree = treeData.tree || [];

            // 递归删除文件夹
            function removeById(items, targetId) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].id === targetId) {
                        if (items[i].children && items[i].children.length > 0) {
                            showToast('文件夹不为空，无法删除');
                            return false;
                        }
                        items.splice(i, 1);
                        return true;
                    }
                    if (items[i].type === 'folder' && items[i].children) {
                        if (removeById(items[i].children, targetId)) return true;
                    }
                }
                return false;
            }

            if (!removeById(tree, id)) return;
            const putRes = await fetch('/api/tree/save', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree }),
            });
            if (!putRes.ok) throw new Error('保存失败');
            loadFileList();
        } catch (err) {
            console.error('删除文件夹失败:', err);
            showToast('删除文件夹失败');
        }
    } else {
        if (!confirm('确定删除此文件？')) return;
        try {
            await fetch(`/api/mindmaps/${id}`, { method: 'DELETE' });
            if (currentUid === id) {
                currentUid = null;
                localStorage.removeItem('ai_mind_last_opened_uid');
            }
            loadFileList();
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
}

// 保留旧函数名向后兼容
async function deleteMindMap(uid) {
    return deleteItem(uid, 'file');
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

// 拖拽状态
let _dragItemId = null;
let _dragItemType = null;

function renderFileTree(tree) {
    const list = document.getElementById('file-list');
    if (!tree || tree.length === 0) {
        list.innerHTML = '<p class="empty-hint">暂无文件，点击新建开始</p>';
        return;
    }
    list.innerHTML = '<div class="file-tree" id="file-tree-root" style="min-height: 100px;"></div>';
    const root = document.getElementById('file-tree-root');
    renderTreeNodes(tree, root, 0);

    // 允许拖拽到空白区域（根目录）
    root.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (_dragItemId) {
            e.dataTransfer.dropEffect = 'move';
        }
    });

    root.addEventListener('drop', async (e) => {
        // 如果是从条目冒泡上来的事件，或者是放在具体条目上，忽略
        if (e.target.closest('.file-tree-item')) return;
        
        e.preventDefault();
        if (!_dragItemId) return;

        try {
            const res = await fetch('/api/tree/move', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: _dragItemId,
                    new_parent_id: null, // 根级别
                    new_index: 999999, // 放在最后
                }),
            });
            if (res.ok) {
                loadFileList();
            }
        } catch (err) {
            console.error('移动到根目录失败:', err);
        }
    });
}

function renderTreeNodes(nodes, parentEl, depth) {
    nodes.forEach(node => {
        const el = renderTreeNode(node, depth);
        parentEl.appendChild(el);
        
        if (node.type === 'folder') {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'file-tree-children';
            childrenContainer.dataset.parentId = node.id;
            if (node.isOpen === false) {
                childrenContainer.style.display = 'none';
            }
            parentEl.appendChild(childrenContainer);
            
            if (node.children && node.children.length > 0) {
                renderTreeNodes(node.children, childrenContainer, depth + 1);
            }
        }
    });
}

function renderTreeNode(node, depth) {
    const isFolder = node.type === 'folder';
    const isFile = node.type === 'file';
    const itemId = node.id;

    const wrapper = document.createElement('div');
    wrapper.className = 'file-tree-item';
    wrapper.dataset.itemId = itemId;
    wrapper.dataset.itemType = node.type;
    wrapper.style.paddingLeft = (depth * 16 + 6) + 'px';
    wrapper.draggable = true;

    // 当前打开的文件高亮
    if (isFile && itemId === currentUid) {
        wrapper.classList.add('active');
    }

    // --- 展开/折叠三角 ---
    const toggle = document.createElement('span');
    toggle.className = 'file-tree-toggle';
    if (isFolder) {
        toggle.innerHTML = '&#9660;';
        if (node.isOpen !== false) {
            // 默认展开
        } else {
            toggle.classList.add('collapsed');
        }
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFolder(itemId);
        });
    } else {
        toggle.classList.add('placeholder');
    }
    wrapper.appendChild(toggle);

    // --- 图标 ---
    const icon = document.createElement('span');
    icon.className = 'file-tree-icon ' + (isFolder ? 'folder' : 'file');
    if (isFolder) {
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z" fill="currentColor"/></svg>';
    } else {
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" fill="currentColor"/></svg>';
    }
    wrapper.appendChild(icon);

    // --- 名称 ---
    const nameEl = document.createElement('span');
    nameEl.className = 'file-tree-name';
    nameEl.textContent = isFolder ? node.name : (stripHtml(node.title) || node.id);
    wrapper.appendChild(nameEl);

    // 文件夹支持双击名称重命名
    if (isFolder) {
        nameEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            startRenameFolder(wrapper, nameEl, itemId, node.name);
        });
    }

    // --- 删除按钮 ---
    const delBtn = document.createElement('button');
    delBtn.className = 'file-tree-delete';
    delBtn.textContent = '\u00D7';
    delBtn.title = isFolder ? '删除文件夹' : '删除文件';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(itemId, node.type);
    });
    wrapper.appendChild(delBtn);

    // --- 点击事件 ---
    wrapper.addEventListener('click', (e) => {
        if (e.target.closest('.file-tree-delete') || e.target.closest('.file-tree-toggle')) return;
        if (isFile) {
            loadMindMap(itemId);
        } else {
            toggleFolder(itemId);
        }
    });

    // --- 拖拽事件 ---
    wrapper.addEventListener('dragstart', (e) => {
        _dragItemId = itemId;
        _dragItemType = node.type;
        wrapper.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', itemId);
    });

    wrapper.addEventListener('dragend', (e) => {
        wrapper.classList.remove('dragging');
        _dragItemId = null;
        _dragItemType = null;
        // 移除所有高亮
        document.querySelectorAll('.file-tree-item.drag-over, .file-tree-item.drag-before, .file-tree-item.drag-after').forEach(el => {
            el.classList.remove('drag-over', 'drag-before', 'drag-after');
        });
    });

    wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!_dragItemId || _dragItemId === itemId) return;
        e.dataTransfer.dropEffect = 'move';

        // 移除之前的高亮
        document.querySelectorAll('.file-tree-item.drag-over, .file-tree-item.drag-before, .file-tree-item.drag-after').forEach(el => {
            el.classList.remove('drag-over', 'drag-before', 'drag-after');
        });

        const rect = wrapper.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const h = rect.height;

        // 如果是文件夹且鼠标在中部区域（25%-75%），高亮为"拖入文件夹"
        if (isFolder && y > h * 0.25 && y < h * 0.75) {
            wrapper.classList.add('drag-over');
        } else {
            if (y <= h / 2) {
                wrapper.classList.add('drag-before');
            } else {
                wrapper.classList.add('drag-after');
            }
        }
    });

    wrapper.addEventListener('dragleave', (e) => {
        wrapper.classList.remove('drag-over', 'drag-before', 'drag-after');
    });

    wrapper.addEventListener('drop', async (e) => {
        e.preventDefault();
        wrapper.classList.remove('drag-over', 'drag-before', 'drag-after');

        if (!_dragItemId || _dragItemId === itemId) return;

        const rect = wrapper.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const h = rect.height;

        // 判断放置位置
        let targetParentId = null;  // null = 根级别
        let targetIndex = 0;

        // 获取当前条目的父级
        const parentEl = wrapper.parentElement;
        const siblings = Array.from(parentEl.children).filter(c => c.classList.contains('file-tree-item'));

        if (isFolder && y > h * 0.25 && y < h * 0.75) {
            // 拖入文件夹内部
            targetParentId = itemId;
            targetIndex = 0;  // 放在文件夹的第一个位置
        } else {
            // 在同级排序
            // 找到该条目在父级中的索引
            targetIndex = siblings.indexOf(wrapper);
            if (y > h / 2) {
                targetIndex++;  // 放在目标后面
            }
            // 获取父文件夹ID
            if (parentEl.classList.contains('file-tree-children')) {
                targetParentId = parentEl.dataset.parentId;
            } else {
                targetParentId = null;
            }
        }

        try {
            const res = await fetch('/api/tree/move', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: _dragItemId,
                    new_parent_id: targetParentId,
                    new_index: targetIndex,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                showToast(err.detail || '移动失败');
                return;
            }
            loadFileList();
        } catch (err) {
            console.error('移动失败:', err);
            showToast('移动失败');
        }
    });

    // --- 子节点容器（仅文件夹） ---
    // 已移至 renderTreeNodes 中处理，使其成为兄弟节点以修复排版问题

    return wrapper;
}

function toggleFolder(folderId) {
    const item = document.querySelector(`.file-tree-item[data-item-id="${folderId}"]`);
    if (!item) return;
    const toggle = item.querySelector('.file-tree-toggle');
    const children = item.nextElementSibling;
    if (!children || !children.classList.contains('file-tree-children')) return;

    const isCollapsed = toggle.classList.contains('collapsed');
    if (isCollapsed) {
        toggle.classList.remove('collapsed');
        children.style.display = '';
    } else {
        toggle.classList.add('collapsed');
        children.style.display = 'none';
    }
}

/**
 * 进入文件夹重命名编辑态
 * @param {HTMLElement} wrapper 当前文件树条目
 * @param {HTMLElement} nameEl 名称节点（编辑期间被 input 替换）
 * @param {string} folderId 文件夹 ID
 * @param {string} oldName 原文件夹名称
 */
function startRenameFolder(wrapper, nameEl, folderId, oldName) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-tree-name-input';
    input.value = oldName || '';
    input.maxLength = 50;

    wrapper.replaceChild(input, nameEl);
    input.focus();
    input.select();

    let finished = false;

    function restore() {
        wrapper.replaceChild(nameEl, input);
    }

    async function commit() {
        if (finished) return;
        finished = true;
        const newName = input.value.trim();
        if (!newName) {
            restore();
            showToast('文件夹名称不能为空');
            return;
        }
        if (newName === oldName) {
            restore();
            return;
        }
        const ok = await saveRenameFolder(folderId, newName);
        if (!ok) {
            restore();
            return;
        }
        restore();
    }

    function cancel() {
        if (finished) return;
        finished = true;
        restore();
    }

    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    });
}

/**
 * 调用后端接口保存文件夹新名称
 * @param {string} folderId 文件夹 ID
 * @param {string} newName 新名称
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveRenameFolder(folderId, newName) {
    try {
        const res = await fetch(`/api/folders/${folderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
        });
        if (!res.ok) {
            let detail = 'HTTP ' + res.status;
            try { const e = await res.json(); detail = e.detail || detail; } catch (_) {}
            showToast(detail);
            return false;
        }
        loadFileList();
        return true;
    } catch (err) {
        console.error('重命名文件夹失败:', err);
        showToast('重命名文件夹失败');
        return false;
    }
}

// 保留旧函数名向后兼容
function renderFileList(mindmaps) {
    // 不再使用，但保留以避免引用错误
    console.warn('renderFileList is deprecated, use renderFileTree instead');
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
    return (div.textContent || div.innerText || '').trim();
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

// ============ Note Editor ============
let isNoteEditorInitialized = false;

// 清洗备注内容 HTML：去除多层嵌套的 .rich-code-block 和 .w-e-quote-block（通常来自旧版本脏数据）
function dedupeNestedNoteHtml(html) {
    if (!html) return html;
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const body = doc.body;
        // 重复展开多层嵌套直到没有自嵌套
        const BLOCK_SELECTORS = [
            'div.rich-code-block',
            'blockquote.w-e-quote-block',
            'blockquote'
        ];
        let changed = true;
        let safetyCounter = 0;
        while (changed && safetyCounter < 10) {
            changed = false;
            safetyCounter++;
            for (const sel of BLOCK_SELECTORS) {
                const els = body.querySelectorAll(sel);
                for (const el of els) {
                    // 如果父节点也是同类，则把 children 提出来替换父中的自己
                    let parent = el.parentElement;
                    while (parent && parent !== body) {
                        const isParentMatch = (
                            parent.matches &&
                            BLOCK_SELECTORS.some(s => { try { return parent.matches(s); } catch (_) { return false; } })
                        );
                        if (!isParentMatch) break;
                        // 将父节点的所有 children 平铺
                        const frag = document.createDocumentFragment();
                        while (el.firstChild) frag.appendChild(el.firstChild);
                        if (el.parentNode) el.parentNode.replaceChild(frag, el);
                        changed = true;
                        break;
                    }
                }
            }
        }
        return body.innerHTML;
    } catch (_) {
        return html;
    }
}

// 编辑器 setHtml 之后，再对 Slate 模型做一次最终的解嵌套，防止 parseHtml 阶段漏网之鱼
function flattenNoteEditorIfNeeded() {
    if (!wangEditorInstance || !window.wangEditor) return;
    try {
        const { SlateTransforms: ST, SlateEditor: SE, SlateNode: SN } = window.wangEditor;
        const editor = wangEditorInstance;
        const selfTypes = ['rich-code', 'quote-block'];
        // 先解包所有自嵌套的 rich-code 和 quote-block
        for (const t of selfTypes) {
            let safety = 0;
            while (safety++ < 10) {
                const entries = [];
                const iter = SE.nodes(editor, {
                    at: [],
                    match: (n, p) => n && typeof n === 'object' && n.type === t
                });
                let r;
                while ((r = iter.next()) && !r.done) entries.push(r.value);
                let foundNested = false;
                for (const [n, path] of entries) {
                    if (path && path.length > 1) {
                        const parent = SN.get(editor, path.slice(0, -1));
                        if (parent && typeof parent === 'object' && selfTypes.includes(parent.type)) {
                            try { ST.unwrapNodes(editor, { at: path, match: n => n.type === t }); foundNested = true; } catch (_) {}
                        }
                    }
                }
                if (!foundNested) break;
            }
        }
    } catch (_) {}
}

// --- 注册自定义富文本代码块 + 引用块 ---
if (window.wangEditor && window.wangEditor.Boot) {
    const { Boot } = window.wangEditor;

    // ========== 浅色代码块 ==========
    const renderRichCode = (elem, children, editor) => {
        return {
            sel: 'div',
            data: {
                className: 'rich-code-block'
            },
            children: children
        };
    };

    const richCodeToHtml = (elem, childrenHtml) => {
        return `<div class="rich-code-block">${childrenHtml}</div>`;
    };

    const parseHtmlRichCode = (domElem, children, editor) => {
        // 清洗掉多层嵌套：如果子 children 里已经有同类 rich-code，则只保留最内层的 children
        // 避免脏数据导致的多层 rich-code 无限嵌套
        const unwrapped = [];
        const _flatten = (list) => {
            for (const c of list || []) {
                if (c && typeof c === 'object' && c.type === 'rich-code') {
                    _flatten(c.children || []);
                } else {
                    unwrapped.push(c);
                }
            }
        };
        _flatten(children);
        return {
            type: 'rich-code',
            children: unwrapped.length > 0 ? unwrapped : [{ text: '' }]
        };
    };

    class RichCodeMenu {
        constructor() {
            this.title = '浅色富文本代码块';
            this.iconSvg = '<svg viewBox="0 0 1024 1024"><path d="M741.05 450.91l-149.3-149.3c-18.75-18.75-49.14-18.75-67.88 0s-18.75 49.14 0 67.88l115.35 115.35-115.35 115.35c-18.75 18.75-18.75 49.14 0 67.88 9.38 9.38 21.66 14.06 33.94 14.06s24.57-4.69 33.94-14.06l149.3-149.3c18.75-18.74 18.75-49.13 0-67.86zM494.62 301.61c-18.75-18.75-49.14-18.75-67.88 0l-149.3 149.3c-18.75 18.75-18.75 49.14 0 67.88l149.3 149.3c9.38 9.38 21.66 14.06 33.94 14.06s24.57-4.69 33.94-14.06c18.75-18.75 18.75-49.14 0-67.88L379.27 484.85l115.35-115.35c18.75-18.76 18.75-49.15 0-67.89z" fill="currentColor"></path></svg>';
            this.tag = 'button';
        }
        getValue(editor) { return ''; }
        isActive(editor) {
            const { SlateEditor } = window.wangEditor;
            const match = SlateEditor.above(editor, { match: n => n.type === 'rich-code' });
            return !!match;
        }
        isDisabled(editor) { return false; }
        exec(editor, value) {
            const { SlateTransforms, SlateEditor } = window.wangEditor;
            // 点击工具栏按钮时 wangEditor 已自动恢复选区，直接判断光标是否在容器内
            const activeMatch = SlateEditor.above(editor, { match: n => n && n.type === 'rich-code' });
            if (activeMatch) {
                const [container, containerPath] = activeMatch;
                // 手动解包：删除容器节点，将子节点原位置插入（避免 unwrapNodes 在根节点的边界问题）
                const children = [...(container.children || [])];
                if (children.length > 0) {
                    SlateTransforms.removeNodes(editor, { at: containerPath });
                    SlateTransforms.insertNodes(editor, children, { at: containerPath });
                    // 光标定位到解包后第一个子节点末尾
                    try {
                        const firstChildPath = [...containerPath];
                        if (firstChildPath.length > 0) firstChildPath[firstChildPath.length - 1] += children.length - 1;
                        const endPoint = SlateEditor.end(editor, firstChildPath);
                        SlateTransforms.select(editor, { anchor: endPoint, focus: endPoint });
                    } catch (_) {}
                }
                try { editor.onChange(); } catch (_) {}
                return;
            }
            // Wrap：只包裹光标所在的当前块
            const blockMatch = SlateEditor.above(editor, { match: n => SlateEditor.isBlock(editor, n) });
            if (blockMatch) {
                const alreadySpecial = SlateEditor.above(editor, {
                    match: n => n && ['rich-code', 'quote-block', 'pre', 'code-block'].includes(n.type)
                });
                if (alreadySpecial) return;
                SlateTransforms.wrapNodes(editor, { type: 'rich-code', children: [] }, { at: blockMatch[1] });
                try { editor.onChange(); } catch (_) {}
            }
        }
    }

    // ========== 引用块 ==========
    const renderQuote = (elem, children, editor) => {
        return {
            sel: 'blockquote',
            data: {
                className: 'w-e-quote-block'
            },
            children: children
        };
    };

    const quoteToHtml = (elem, childrenHtml) => {
        return `<blockquote class="w-e-quote-block">${childrenHtml}</blockquote>`;
    };

    const parseHtmlQuote = (domElem, children, editor) => {
        // 清洗掉多层嵌套：剥除内部重复的 quote-block / rich-code 自身包裹
        const unwrapped = [];
        const _flatten = (list) => {
            for (const c of list || []) {
                if (c && typeof c === 'object' && (c.type === 'quote-block' || c.type === 'rich-code')) {
                    _flatten(c.children || []);
                } else {
                    unwrapped.push(c);
                }
            }
        };
        _flatten(children);
        return {
            type: 'quote-block',
            children: unwrapped.length > 0 ? unwrapped : [{ text: '' }]
        };
    };

    class QuoteMenu {
        constructor() {
            this.title = '引用';
            this.iconSvg = '<svg viewBox="0 0 1024 1024"><path d="M469.333333 128v298.666667h-149.333333c0-82.56 66.773333-149.333333 149.333333-149.333334V128z m0 213.333334V640H256c0-82.56 66.773333-149.333333 149.333333-149.333333v-149.333333h64zM896 128v298.666667h-149.333333c0-82.56 66.773333-149.333333 149.333333-149.333334V128z m0 213.333334V640H682.666667c0-82.56 66.773333-149.333333 149.333333-149.333333v-149.333333h64z" fill="currentColor"></path></svg>';
            this.tag = 'button';
        }
        getValue(editor) { return ''; }
        isActive(editor) {
            const { SlateEditor } = window.wangEditor;
            const match = SlateEditor.above(editor, { match: n => n.type === 'quote-block' });
            return !!match;
        }
        isDisabled(editor) { return false; }
        exec(editor, value) {
            const { SlateTransforms, SlateEditor } = window.wangEditor;
            const activeMatch = SlateEditor.above(editor, { match: n => n && n.type === 'quote-block' });
            if (activeMatch) {
                const [container, containerPath] = activeMatch;
                const children = [...(container.children || [])];
                if (children.length > 0) {
                    SlateTransforms.removeNodes(editor, { at: containerPath });
                    SlateTransforms.insertNodes(editor, children, { at: containerPath });
                    try {
                        const firstChildPath = [...containerPath];
                        if (firstChildPath.length > 0) firstChildPath[firstChildPath.length - 1] += children.length - 1;
                        const endPoint = SlateEditor.end(editor, firstChildPath);
                        SlateTransforms.select(editor, { anchor: endPoint, focus: endPoint });
                    } catch (_) {}
                }
                try { editor.onChange(); } catch (_) {}
                return;
            }
            const blockMatch = SlateEditor.above(editor, { match: n => SlateEditor.isBlock(editor, n) });
            if (blockMatch) {
                const alreadySpecial = SlateEditor.above(editor, {
                    match: n => n && ['rich-code', 'quote-block', 'pre', 'code-block'].includes(n.type)
                });
                if (alreadySpecial) return;
                SlateTransforms.wrapNodes(editor, { type: 'quote-block', children: [] }, { at: blockMatch[1] });
                try { editor.onChange(); } catch (_) {}
            }
        }
    }

    try {
        Boot.registerModule({
            renderElems: [
                { type: 'rich-code', renderElem: renderRichCode },
                { type: 'quote-block', renderElem: renderQuote }
            ],
            elemsToHtml: [
                { type: 'rich-code', elemToHtml: richCodeToHtml },
                { type: 'quote-block', elemToHtml: quoteToHtml }
            ],
            parseElemsHtml: [
                { selector: 'div.rich-code-block', parseElemHtml: parseHtmlRichCode },
                { selector: 'blockquote.w-e-quote-block, blockquote', parseElemHtml: parseHtmlQuote }
            ],
            menus: [
                { key: 'richCode', factory() { return new RichCodeMenu(); } },
                { key: 'quoteBlock', factory() { return new QuoteMenu(); } }
            ]
        });
    } catch (e) {
        console.warn('richCode/quote module already registered', e.message);
    }
}

// ========== 颜色/背景色按钮的颜色指示 ==========

// 确保文字颜色按钮的下划线已从原 SVG 中拆分为独立 path（用于单独着色显示上次颜色）
function ensureTextColorUnderline() {
    try {
        const btn = document.querySelector('[data-menu-key="color"]');
        if (!btn) return null;
        let underline = btn.querySelector('svg path.text-color-indicator');
        if (underline) return underline;

        const mainSvg = btn.querySelector('svg');
        const originalPath = mainSvg && mainSvg.querySelector('path');
        if (!mainSvg || !originalPath) return null;

        const d = originalPath.getAttribute('d') || '';
        const firstZ = d.indexOf('z');
        if (firstZ === -1) return null;

        // 原 path 第一段子路径即底部下划线，拆出后 A 字母保留在原 path
        const underlineD = d.slice(0, firstZ + 1);
        const aLetterD = d.slice(firstZ + 1);
        originalPath.setAttribute('d', aLetterD);

        underline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        underline.setAttribute('d', underlineD);
        underline.classList.add('text-color-indicator');
        mainSvg.appendChild(underline);
        return underline;
    } catch (_) {
        return null;
    }
}

// 更新文字颜色按钮下划线颜色（无颜色时恢复默认）
function updateTextColorIndicator() {
    const underline = ensureTextColorUnderline();
    if (!underline) return;
    if (_lastUsedTextColor) {
        underline.setAttribute('fill', _lastUsedTextColor);
    } else {
        underline.removeAttribute('fill');
    }
}

// 确保背景色按钮底部存在颜色指示条
function ensureBgColorIndicator() {
    try {
        const btn = document.querySelector('[data-menu-key="bgColor"]');
        if (!btn) return null;
        let indicator = btn.querySelector('.bg-color-indicator');
        if (indicator) return indicator;

        indicator = document.createElement('span');
        indicator.className = 'bg-color-indicator';
        indicator.style.cssText = `
            position: absolute; bottom: 2px; left: 18%; width: 64%; height: 3px;
            border-radius: 1px; pointer-events: none; z-index: 3;
        `;
        btn.appendChild(indicator);
        return indicator;
    } catch (_) {
        return null;
    }
}

// 更新背景色按钮指示条颜色（无颜色时隐藏）
function updateBgColorIndicator() {
    const indicator = ensureBgColorIndicator();
    if (!indicator) return;
    if (_lastUsedBgColor) {
        indicator.style.display = 'block';
        indicator.style.backgroundColor = _lastUsedBgColor;
    } else {
        indicator.style.display = 'none';
        indicator.style.backgroundColor = '';
    }
}

// 统一刷新颜色/背景色指示
function refreshColorIndicators() {
    updateTextColorIndicator();
    updateBgColorIndicator();
}

// 记录文字颜色记忆并刷新下划线指示（value 为 '0' 或空表示清除）
function rememberTextColor(value) {
    if (value && value !== '0') {
        _lastUsedTextColor = value;
        try { localStorage.setItem('wangeditor_last_text_color', value); } catch (_) {}
    } else {
        _lastUsedTextColor = null;
        try { localStorage.removeItem('wangeditor_last_text_color'); } catch (_) {}
    }
    updateTextColorIndicator();
}

// 记录背景色记忆并刷新指示条
function rememberBgColor(value) {
    if (value && value !== '0') {
        _lastUsedBgColor = value;
        try { localStorage.setItem('wangeditor_last_bg_color', value); } catch (_) {}
    } else {
        _lastUsedBgColor = null;
        try { localStorage.removeItem('wangeditor_last_bg_color'); } catch (_) {}
    }
    updateBgColorIndicator();
}

// 监听颜色面板点击，记录用户主动选择的颜色。
// 注意：当前 wangEditor 版本的颜色面板点击只执行 addMark/removeMark，并不调用 MENU_CONF 的 onClick。
function bindColorPanelClickTracking() {
    if (window.__colorPanelTrackingBound) return;
    window.__colorPanelTrackingBound = true;
    document.addEventListener('click', (e) => {
        const li = e.target && e.target.closest ? e.target.closest('li[data-value]') : null;
        if (!li) return;
        const ul = li.parentElement;
        if (!ul || !ul.classList.contains('w-e-panel-content-color')) return;
        const value = li.getAttribute('data-value');
        // 文字颜色与背景色面板的 ul 类名相同，需通过最近的菜单按钮 data-menu-key 区分
        const barItem = ul.closest('.w-e-bar-item');
        const menuBtn = barItem ? barItem.querySelector('[data-menu-key]') : null;
        const menuKey = menuBtn ? menuBtn.getAttribute('data-menu-key') : null;
        if (menuKey === 'color') {
            rememberTextColor(value);
        } else if (menuKey === 'bgColor') {
            rememberBgColor(value);
        }
    });
}

function initNoteEditorIfNeeded() {
    if (isNoteEditorInitialized) return;
    
    if (!window.wangEditor) {
        showToast('编辑器资源加载失败，请检查网络或刷新重试');
        return;
    }

    try {
        const { createEditor, createToolbar, SlateEditor, SlateTransforms, SlateLocation } = window.wangEditor;
        
        const editorConfig = {
        placeholder: '输入备注内容...',
        hoverbarKeys: {
            text: {
                menuKeys: [] // 清空选中文本时弹出的悬浮菜单
            }
        },
        MENU_CONF: {
            uploadImage: {
                base64LimitSize: 10 * 1024 * 1024 // 10MB, convert to base64
            },
            // 颜色选择后记录
            color: {
                colors: [
                    '#000000', '#eeece0', '#1c487f', '#4d80bf',
                    '#c24f4a', '#8baa4a', '#7b5ba1', '#46acc8',
                    '#f9963b', '#ffffff',
                    '#5B7AFF', '#FF6B6B', '#4ECDC4', '#FFD93D',
                    '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3',
                    '#A8D8EA', '#FFE66D'
                ]
            },
            bgColor: {
                colors: [
                    '#ffffff', '#eeece0', '#1c487f', '#4d80bf',
                    '#c24f4a', '#8baa4a', '#7b5ba1', '#46acc8',
                    '#f9963b', '#000000',
                    '#EEF1FF', '#FFE5E5', '#E5F8F5', '#FFF8DC',
                    '#F0FBF7', '#FFE9EA', '#F5F0FF', '#FFEEF6',
                    '#EDF7FC', '#FFFDE0'
                ]
            }
        }
    };
    wangEditorInstance = createEditor({
        selector: '#editor-container',
        html: '<p><br></p>',
        config: editorConfig,
        mode: 'default'
    });

    // 监听颜色面板点击，记录用户主动选择的颜色（用于“上次颜色”记忆与指示）
    bindColorPanelClickTracking();

    // ========== 增强工具栏：拦截文字颜色按钮单击，直接应用上次颜色 ==========
    function enhanceToolbarButtons() {
        const toolbarEl = document.getElementById('editor-toolbar');
        if (!toolbarEl) return;

        // 颜色按钮点击 - 点击图标直接应用上次颜色
        const colorBtnWrapper = toolbarEl.querySelector('[data-menu-key="color"]');
        if (colorBtnWrapper && !colorBtnWrapper.dataset._enhanced) {
            colorBtnWrapper.dataset._enhanced = '1';
            // wangEditor 工具栏中 [data-menu-key="color"] 本身就是 <button> 元素，直接作为触发按钮
            const triggerBtn = colorBtnWrapper;
            if (triggerBtn) {
                // 插入一个覆盖图标区（非下拉箭头部分）的遮罩元素，用于拦截左键点击直接应用上次颜色
                const overlay = document.createElement('span');
                overlay.style.cssText = `
                    position: absolute; left: 0; top: 0; 
                    width: calc(100% - 14px); height: 100%;
                    z-index: 2; cursor: pointer;
                `;
                overlay.title = '应用上次颜色（点击右侧箭头选择颜色）';
                overlay.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (_lastUsedTextColor && wangEditorInstance) {
                        try {
                            wangEditorInstance.focus();
                            // 使用 addMark 直接给当前选区文字上色（本版本无 DomEditor.getMenu / handleCommand）
                            wangEditorInstance.addMark('color', _lastUsedTextColor);
                        } catch (err) {
                            console.warn('apply text color failed:', err);
                        }
                    } else {
                        // 如果没有记录颜色，触发原按钮显示下拉
                        if (triggerBtn) triggerBtn.click();
                    }
                });
                // 阻止 click 冒泡到按钮，避免应用颜色后又触发下拉面板展开
                overlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                });
                if (getComputedStyle(colorBtnWrapper).position === 'static') {
                    colorBtnWrapper.style.position = 'relative';
                }
                colorBtnWrapper.appendChild(overlay);
            }
        }

        // 背景色按钮
        const bgBtnWrapper = toolbarEl.querySelector('[data-menu-key="bgColor"]');
        if (bgBtnWrapper && !bgBtnWrapper.dataset._enhanced) {
            bgBtnWrapper.dataset._enhanced = '1';
            // wangEditor 工具栏中 [data-menu-key="bgColor"] 本身就是 <button> 元素，直接作为触发按钮
            const triggerBtn = bgBtnWrapper;
            if (triggerBtn) {
                const overlay = document.createElement('span');
                overlay.style.cssText = `
                    position: absolute; left: 0; top: 0; 
                    width: calc(100% - 14px); height: 100%;
                    z-index: 2; cursor: pointer;
                `;
                overlay.title = '应用上次背景色（点击右侧箭头选择颜色）';
                overlay.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (_lastUsedBgColor && wangEditorInstance) {
                        try {
                            wangEditorInstance.focus();
                            // 使用 addMark 直接给当前选区上背景色（wangEditor 使用 bgColor 作为 mark key）
                            wangEditorInstance.addMark('bgColor', _lastUsedBgColor);
                        } catch (err) {
                            console.warn('apply bg color failed:', err);
                        }
                    } else {
                        if (triggerBtn) triggerBtn.click();
                    }
                });
                // 阻止 click 冒泡到按钮，避免应用背景色后又触发下拉面板展开
                overlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                });
                if (getComputedStyle(bgBtnWrapper).position === 'static') {
                    bgBtnWrapper.style.position = 'relative';
                }
                bgBtnWrapper.appendChild(overlay);
            }
        }

        // 监听“清除样式”按钮：擦除格式时仅清除当前选区/光标的实际颜色（光标颜色回到默认色），
        // 但保留“上次颜色”记忆（默认色不被擦除），避免用户记忆的颜色被清空。
        const clearBtn = toolbarEl.querySelector('[data-menu-key="clearStyle"]');
        if (clearBtn && !clearBtn.dataset._colorResetBound) {
            clearBtn.dataset._colorResetBound = '1';
            clearBtn.addEventListener('click', () => {
                if (wangEditorInstance) {
                    try {
                        // 显式移除文字颜色与背景色 mark，确保光标/后续输入恢复默认色
                        wangEditorInstance.removeMark('color');
                        wangEditorInstance.removeMark('bgColor');
                    } catch (err) {
                        console.warn('clear color mark failed:', err);
                    }
                }
            });
        }

        // 初始化颜色指示（文字颜色下划线 / 背景色指示条）
        refreshColorIndicators();
    }
    // 延迟增强，因为工具栏需要一点时间渲染
    setTimeout(enhanceToolbarButtons, 300);
    setTimeout(enhanceToolbarButtons, 1000);
    
    // 支持Tab键缩进、回车键逻辑、方向键跳出代码块
    document.getElementById('editor-container').addEventListener('keydown', (e) => {
        if (!wangEditorInstance) return;
        const W = window.wangEditor;
        if (!W) return;
        const { SlateEditor: SE, SlateTransforms: ST, SlatePath: SP } = W;

        if (e.key === 'Tab') {
            e.preventDefault();
            const menuKey = e.shiftKey ? 'delIndent' : 'indent';
            const toolbarEl = document.getElementById('editor-toolbar');
            if (toolbarEl) {
                const item = toolbarEl.querySelector(`[data-menu-key="${menuKey}"]`);
                if (item) {
                    const btn = item.querySelector('button') || item;
                    wangEditorInstance.focus();
                    btn.click();
                    return;
                }
            }
            if (typeof wangEditorInstance.handleCommand === 'function') {
                wangEditorInstance.handleCommand(menuKey);
            }
            return;
        }

        // ========== Backspace：在代码块/引用块开头时解包，恢复为普通段落 ==========
        if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
            try {
                const editor = wangEditorInstance;
                const specialTypes = ['rich-code', 'quote-block', 'pre', 'code-block'];
                const containerMatch = SE.above(editor, {
                    match: n => typeof n === 'object' && n !== null && specialTypes.includes(n.type)
                });
                if (containerMatch) {
                    const [containerNode, containerPath] = containerMatch;
                    const isAtStart = SE.isStart(editor, editor.selection.anchor, containerPath);
                    if (isAtStart) {
                        e.preventDefault();
                        e.stopPropagation();
                        // 解包特殊块外壳（移除容器节点，内部内容提升）
                        ST.unwrapNodes(editor, {
                            match: n => typeof n === 'object' && n !== null && specialTypes.includes(n.type)
                        });
                        // 原生代码块解包后会留下顶级 code 节点，转为普通段落并清理 language 属性
                        if (containerNode.type === 'pre' || containerNode.type === 'code-block') {
                            try {
                                const codeMatch = SE.above(editor, { match: n => n && n.type === 'code' });
                                if (codeMatch) {
                                    ST.setNodes(editor, { type: 'paragraph' }, { at: codeMatch[1] });
                                    ST.unsetNodes(editor, ['language'], { at: codeMatch[1] });
                                }
                            } catch (_) {}
                        }
                        return;
                    }
                }
            } catch (err) {
                console.warn('backspace handler error:', err);
            }
        }

        // ========== 方向键右键：在块级容器最末尾时跳出 ==========
        if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            try {
                // 查找包含当前选区的最外层特殊块容器
                const specialTypes = ['rich-code', 'quote-block', 'pre', 'code-block'];
                const containerMatch = SE.above(wangEditorInstance, {
                    match: n => typeof n === 'object' && n !== null && specialTypes.includes(n.type)
                });
                if (containerMatch) {
                    const [containerNode, containerPath] = containerMatch;
                    const editor = wangEditorInstance;
                    const isAtEnd = SE.isEnd(editor, editor.selection.anchor, containerPath);
                    if (isAtEnd) {
                        e.preventDefault();
                        e.stopPropagation();
                        // 在容器后面插入一个空段落
                        const afterPath = SP.next(containerPath);
                        try {
                            const hasAfter = SE.hasPath(editor, afterPath);
                            if (!hasAfter) {
                                ST.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] }, { at: afterPath });
                            }
                            ST.select(editor, {
                                anchor: { path: afterPath.concat([0]), offset: 0 },
                                focus: { path: afterPath.concat([0]), offset: 0 }
                            });
                        } catch (err) {
                            // fallback：直接移动选区到下一个兄弟节点或末尾
                            try {
                                ST.move(editor, { distance: 1, unit: 'line' });
                            } catch (_) {}
                        }
                        return;
                    }
                }
            } catch (err) {
                // 忽略方向键处理错误
            }
        }

        // ========== Alt+Enter：从代码块/引用块跳出到后面新段落 ==========
        if (e.key === 'Enter' && e.altKey && !e.isComposing) {
            try {
                const editor = wangEditorInstance;
                const specialTypes = ['rich-code', 'quote-block', 'pre', 'code-block'];
                const containerMatch = SE.above(editor, {
                    match: n => typeof n === 'object' && n !== null && specialTypes.includes(n.type)
                });

                if (containerMatch) {
                    const [containerNode, containerPath] = containerMatch;
                    const isAtEnd = SE.isEnd(editor, editor.selection.anchor, containerPath);

                    if (isAtEnd) {
                        e.preventDefault();
                        e.stopPropagation();
                        const afterPath = SP.next(containerPath);
                        try {
                            const hasAfter = SE.hasPath(editor, afterPath);
                            if (!hasAfter) {
                                ST.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] }, { at: afterPath });
                            }
                            ST.select(editor, {
                                anchor: { path: afterPath.concat([0]), offset: 0 },
                                focus: { path: afterPath.concat([0]), offset: 0 }
                            });
                        } catch (err2) {
                            console.warn('alt+enter break out of block error:', err2);
                        }
                        return;
                    }
                }
            } catch (err) {
                console.warn('alt+enter handler error:', err);
            }
            return;
        }

        // ========== Enter键：正常换行（在代码块/引用块内也是换行，不跳出） ==========
        if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
            try {
                const editor = wangEditorInstance;
                const specialTypes = ['rich-code', 'quote-block', 'pre', 'code-block'];
                const containerMatch = SE.above(editor, {
                    match: n => typeof n === 'object' && n !== null && specialTypes.includes(n.type)
                });

                if (containerMatch) {
                    // 在代码块/引用块内部：直接换行，不跳出
                    e.preventDefault();
                    editor.insertBreak();
                    return;
                }

                // 普通段落内换行
                e.preventDefault();
                editor.insertBreak();
                // 段落样式清理，但不要做任何滚动相关操作
                const pMatch = SE.above(editor, {
                    match: n => typeof n === 'object' && n !== null && n.type === 'paragraph'
                });
                if (pMatch) {
                    const [block, path] = pMatch;
                    if (block) {
                        const propsToRemove = Object.keys(block).filter(key => key !== 'type' && key !== 'children');
                        if (propsToRemove.length > 0) {
                            ST.unsetNodes(editor, propsToRemove, { at: path });
                        }
                    }
                }
                return;
            } catch (err) {
                console.warn('enter key handler error:', err);
            }

            // Fallback: 走默认
            e.preventDefault();
            if (wangEditorInstance) {
                wangEditorInstance.insertBreak();
            }
        }
    }, true); // 使用捕获阶段

    const toolbarConfig = {
        toolbarKeys: [
            'headerSelect', '|',
            'bold', 'underline', 'italic', 'through', 'clearStyle',
            'color', 'bgColor', '|',
            'bulletedList', 'numberedList', '|',
            'justifyLeft', 'justifyCenter', 'justifyRight', '|',
            'indent', 'delIndent', '|',
            'quoteBlock', 'richCode', 'divider', 'codeBlock', '|',
            'insertImage', 'uploadImage'
        ]
    };
    createToolbar({
        editor: wangEditorInstance,
        selector: '#editor-toolbar',
        config: toolbarConfig,
        mode: 'default'
    });
    isNoteEditorInitialized = true;
    } catch (e) {
        console.error('初始化编辑器失败:', e);
        showToast('编辑器初始化失败');
    }
}

let initialNoteContentForCompare = '';

function isNoteModified() {
    if (!wangEditorInstance) return false;
    return wangEditorInstance.getHtml() !== initialNoteContentForCompare;
}

function openNoteEditor(node) {
    openModal('modal-note');
    initNoteEditorIfNeeded();

    const note = node.getData('note') || '';
    if (wangEditorInstance) {
        const cleanHtml = dedupeNestedNoteHtml(note);
        wangEditorInstance.setHtml(cleanHtml);
        // 再执行一次 Slate 模型层面解嵌套，彻底消掉 parseHtml 漏网的自嵌套
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
            // 保存前再做一次去嵌套清洗，绝不把脏数据写回
            flattenNoteEditorIfNeeded();
            noteHtml = dedupeNestedNoteHtml(wangEditorInstance.getHtml());
        }
        const finalNote = hasVisibleNoteContent(noteHtml) ? noteHtml : null;
        
        mindMap.execCommand('SET_NODE_NOTE', node, finalNote);
        closeModal('modal-note');
        updatePropertyPanel();
        // 因为可能是摘要节点，需重新绑定事件
        setTimeout(renderSummaryPlusButtons, 50);
        showToast(finalNote ? '备注已保存' : '备注已移除');
    };
}

// AI排版逻辑
document.getElementById('btn-ai-format').addEventListener('click', () => {
    const box = document.getElementById('ai-format-box');
    const input = document.getElementById('ai-format-input');
    if (box.style.display === 'none') {
        box.style.display = 'flex';
        // 读取最后一次保存的排版规则作为默认内容
        const lastRule = localStorage.getItem('ai_format_last_rule');
        if (lastRule && !input.value) {
            input.value = lastRule;
        }
        input.focus();
    } else {
        box.style.display = 'none';
    }
});

document.getElementById('btn-ai-format-submit').addEventListener('click', async () => {
    if (!window.aiService) return;
    
    const input = document.getElementById('ai-format-input');
    const rule = input.value.trim();
    if (!rule) {
        showToast('请输入排版规则');
        return;
    }

    if (!wangEditorInstance || !wangEditorInstance.getText().trim()) {
        showToast('编辑器内容为空');
        return;
    }

    // 记录最后一次使用的排版规则
    localStorage.setItem('ai_format_last_rule', rule);

    const htmlContent = wangEditorInstance.getHtml();
    const btnSubmit = document.getElementById('btn-ai-format-submit');
    
    try {
        btnSubmit.textContent = '处理中...';
        btnSubmit.disabled = true;
        window.isAIGenerating = true;
        window.aiFormatController = new AbortController();

        const systemPrompt = "你是一个专业的排版助手。请根据用户的排版规则，对提供的富文本(HTML格式)进行排版。请只返回排版后的HTML代码，不要包含任何额外的解释、说明或Markdown格式（如```html）。保持原有的内容意义不变，仅调整格式、结构和样式。注意：只能使用基础的 HTML 标签，如 <p>, <h1>-<h5>, <strong>, <b>, <em>, <i>, <u>, <s>, <span>, <ul>, <ol>, <li>, <blockquote> 等，可以通过 style 属性添加基础样式（如 color, background-color, text-align, padding, margin 等）。千万不要使用无法被基础富文本编辑器解析的复杂标签。";
        const userMessage = `排版规则: ${rule}\n\n需要排版的内容:\n${htmlContent}`;

        let result = await window.aiService.chatCompletion(systemPrompt, userMessage, window.aiFormatController.signal);
        
        // 净化 AI 返回的内容，防止包裹在 markdown 代码块中导致 wangEditor 解析崩溃
        result = result.trim();
        if (result.startsWith('```html')) {
            result = result.replace(/^```html\n?/, '').replace(/\n?```$/, '');
        } else if (result.startsWith('```')) {
            result = result.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        try {
            wangEditorInstance.setHtml(result);
        } catch (setHtmlError) {
            console.warn('wangEditor setHtml error, fallback to dangerouslyInsertHtml:', setHtmlError);
            wangEditorInstance.clear();
            wangEditorInstance.dangerouslyInsertHtml(result);
        }
        
        showToast('排版完成');
        document.getElementById('ai-format-box').style.display = 'none';
        // 保留输入内容，以便下次打开时默认显示
    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('已中断 AI 排版');
        } else {
            showToast(error.message || 'AI 排版失败');
        }
    } finally {
        btnSubmit.textContent = '确定';
        btnSubmit.disabled = false;
        window.isAIGenerating = false;
        window.aiFormatController = null;
    }
});

document.getElementById('ai-format-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('btn-ai-format-submit').click();
    }
});

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
        const title = textInput.value.trim();
        mindMap.execCommand('SET_NODE_HYPERLINK', node, url || '', title);
        closeModal('modal-link');
        updatePropertyPanel();
        showToast(url ? '链接已保存' : '链接已移除');
    };

    document.getElementById('modal-link-remove').onclick = () => {
        mindMap.execCommand('SET_NODE_HYPERLINK', node, '', '');
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
            await loadScript('/static/js/jszip.min.js');
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
    
    // 我们还需要在 renderFloatRelationLines 里暴露一种交互，使用户可以通过拖拽控制点来改变曲线形状。
    // 但鉴于目前的要求，所有浮动节点的关系线（非 isAttached 衍生的）将默认采用一个优美的贝塞尔曲线。
    // 如果用户希望像普通节点一样拖动调整形状，可以在未来在选中连线时显示控制手柄。
    // 当前我们已经用偏移算法实现了它自然弯曲，不再是死板的折线或直线。

// 创建浮动节点与普通节点/摘要节点的关系线（共用函数）
function createFloatRelation(fromNode, targetNode, arrowTo) {
    if (!fromNode || !targetNode) return;
    const targetUid = targetNode.getData('uid');
    const targetText = targetNode.getData('text') || '节点';

    let relations = fromNode.data ? fromNode.data._relations : fromNode.getData('_relations');
    if (!relations) relations = [];
    
    if (relations.some(r => r.nodeUid === targetUid)) {
        showToast('关系线已存在');
        return;
    }
    
    relations.push({
        nodeUid: targetUid,
        nodeText: targetText,
        arrowTo: arrowTo || 'float', // 箭头指向：'float' 或 'regular'
        color: window._branchLineGlobalStyle && window._branchLineGlobalStyle.color ? window._branchLineGlobalStyle.color : '#549688',
        dasharray: '6,4',
        width: 2,
    });

    if (fromNode.data) {
        fromNode.data._relations = relations;
    } else {
        fromNode.setData({ _relations: relations });
        mindMap.command.addHistory();
    }

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

    // 浮动节点 + 普通节点/摘要节点 → 自定义 SVG 连线
    if (floatNode) {
        if (activeNodes.length < 1) {
            showToast('请先选中一个普通节点，再 Ctrl+点击自由节点来建立关系线');
            return;
        }
        // 箭头方向：谁先选就从谁开始
        let arrowTo = 'regular';
        if (window._relationFirst === 'float') arrowTo = 'regular';
        else if (window._relationFirst === 'regular') arrowTo = 'float';
        createFloatRelation(floatNode, activeNodes[0], arrowTo);
        return;
    }

    // 两个普通节点/摘要节点 → 判断是否需要自定义连线
    if (activeNodes.length < 2) {
        showToast('请按住 Ctrl 选中两个节点来添加关系线');
        return;
    }

    const fromNode = activeNodes[0];
    const toNode = activeNodes[1];

    // 如果涉及摘要节点，因为核心库 associativeLine 不支持摘要节点，所以我们降级转换为浮动连线
    if (fromNode.isGeneralization || toNode.isGeneralization) {
        // 创建虚拟的浮动节点关系（绑定在起始节点的 _relations 数据上）
        let arrowTo = 'regular'; // 从 fromNode 到 toNode
        createFloatRelation(fromNode, toNode, arrowTo);
        return;
    }

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

// 在摘要/概括节点上渲染 + 号按钮，单击摘要节点后显示，点击+在摘要下方生成子节点
function renderSummaryPlusButtons() {
    if (!mindMap) return;
    const svg = document.querySelector('#mindMapContainer svg');
    if (!svg) return;

    // 清除旧的加号按钮
    svg.querySelectorAll('.gen-plus-btn').forEach(el => el.remove());

    // 查找所有摘要节点 DOM 元素
    const genEls = svg.querySelectorAll('.smm-node[class*="generalization_"]');

    // 第一遍：为所有摘要元素绑定单击事件（仅绑定一次）
    genEls.forEach(genEl => {
        if (genEl._genClickBound) return;
        genEl._genClickBound = true;
        genEl.style.cursor = 'pointer';

        const cls = genEl.getAttribute('class') || '';
        const uidMatch = cls.match(/generalization_(\S+)/);
        const elGenUid = uidMatch ? uidMatch[1] : null;
        if (!elGenUid) return;

        genEl.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            // 支持 Ctrl/Meta 多选建立关系线
            if (e.ctrlKey || e.metaKey) {
                // 获取实际的摘要节点 UID 和实例
                const belongNode = mindMap.renderer.findNodeByUid(elGenUid);
                let actualGenNode = null;
                if (belongNode && belongNode._generalizationList) {
                    const matchedItem = belongNode._generalizationList.find(g => g.generalizationNode && g.generalizationNode.group && g.generalizationNode.group.node === genEl);
                    if (matchedItem) actualGenNode = matchedItem.generalizationNode;
                }

                if (actualGenNode) {
                    if (!activeNodeCache.includes(actualGenNode)) {
                        activeNodeCache.push(actualGenNode);
                        actualGenNode.getData('isActive', true); // 视觉上的假选中，因为核心库可能不认
                    }
                    
                    if (window._selectedFloatingNode && activeNodeCache.length > 0) {
                        const arrowTo = (window._relationFirst === 'float') ? 'regular' : 'float';
                        createFloatRelation(window._selectedFloatingNode, actualGenNode, arrowTo);
                        window._selectedFloatingNode = null;
                        window._relationFirst = null;
                    } else if (activeNodeCache.length >= 2) {
                        showToast('已选中，点击「关系」按钮建立连线');
                    } else {
                        window._relationFirst = 'regular';
                        showToast('已选中摘要节点，请继续 Ctrl+点击其他节点');
                    }
                }
                return;
            }

            // 获取实际的摘要节点
            const belongNode = mindMap.renderer.findNodeByUid(elGenUid);
            let actualGenNode = null;
            if (belongNode && belongNode._generalizationList) {
                const matchedItem = belongNode._generalizationList.find(g => g.generalizationNode && g.generalizationNode.group && g.generalizationNode.group.node === genEl);
                if (matchedItem) actualGenNode = matchedItem.generalizationNode;
            }

            if (!actualGenNode) return;
            const actualGenUid = actualGenNode.getData('uid');

            const prev = _activeGenUid;
            // 切换：点击同一个摘要取消选中，点击其他摘要切换
            _activeGenUid = (prev === actualGenUid) ? null : actualGenUid;
            
            // 我们希望能够显示摘要节点的属性面板，因此将该摘要节点加入 activeNodeCache
            // 而不要清除 activeNodeList，或者只清除但保留该摘要节点。
            if (_activeGenUid) {
                // 让核心库选中该节点（如果它尚未被选中）
                if (mindMap && mindMap.renderer) {
                    try {
                        mindMap.execCommand('ACTIVE_NODE', [actualGenUid]);
                    } catch(e) {}
                }
                activeNodeCache = [actualGenNode];
            } else {
                if (mindMap && mindMap.renderer) mindMap.renderer.clearActiveNodeList();
                activeNodeCache = [];
            }
            
            floatingNodes.forEach(n => n.data.isActive = false);
            renderFloatingNodes();
            updatePropertyPanel();
            renderSummaryPlusButtons();
        });

        // 修复：为摘要节点增加鼠标悬浮事件，显示备注内容
        genEl.addEventListener('mousemove', (e) => {
            const noteIcon = e.target.closest && e.target.closest('.smm-node-note');
            if (noteIcon) {
                const belongNode = mindMap.renderer.findNodeByUid(elGenUid);
                if (belongNode && belongNode._generalizationList) {
                    const matchedItem = belongNode._generalizationList.find(g => g.generalizationNode && g.generalizationNode.group && g.generalizationNode.group.node === genEl);
                    if (matchedItem) {
                        const actualGenNode = matchedItem.generalizationNode;
                        const noteHtml = actualGenNode.getData('note');
                        if (noteHtml) {
                            const uid = actualGenNode.getData('uid');
                            setNoteTooltipSource('regular', actualGenNode, uid);
                            const rect = noteIcon.getBoundingClientRect();
                            showRichNoteTooltip(noteHtml, e.clientX + 12, e.clientY + 12, rect);
                        }
                    }
                }
            } else {
                hideRichNoteTooltip();
            }
        });

        genEl.addEventListener('mouseleave', () => {
            hideRichNoteTooltip();
        });
    });

    // 辅助函数：为指定元素渲染+号
    function renderPlusBtnForElement(el, targetUid, isSummaryNode) {
        const shape = el.querySelector('.smm-node-shape');
        if (!shape) return;

        let shapeW = 135;
        let shapeH = 30;
        try {
            const bb = shape.getBBox();
            if (bb && bb.width > 0 && bb.height > 0) {
                shapeW = bb.width;
                shapeH = bb.height;
            }
        } catch (e) { /* 回退到默认值 */ }

        const shapeTransform = shape.getAttribute('transform') || '';
        const txMatch = shapeTransform.match(/translate\(([^)]+)\)/);
        let sx = 0, sy = 0;
        if (txMatch) {
            const parts = txMatch[1].split(/[\s,]+/).map(parseFloat);
            sx = parts[0] || 0;
            sy = parts[1] || 0;
        }

        const btnG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        btnG.setAttribute('class', 'gen-plus-btn');
        btnG.style.cursor = 'pointer';

        const layout = mindMap && mindMap.opt ? mindMap.opt.layout || 'logicalStructure' : 'logicalStructure';
        const isVerticalLayout = layout.toLowerCase().includes('organization') || layout === 'timeline2';

        if (isSummaryNode) {
            if (isVerticalLayout) {
                // 对于垂直布局，摘要在下方，我们把+号放右侧
                btnG.setAttribute('transform', `translate(${sx + shapeW + 10}, ${sy + shapeH / 2})`);
            } else {
                // 对于水平布局，摘要在右侧，我们把+号放右侧
                btnG.setAttribute('transform', `translate(${sx + shapeW + 10}, ${sy + shapeH / 2})`); 
            }
        } else {
            if (isVerticalLayout) {
                // 普通节点，垂直布局，+号放下方
                btnG.setAttribute('transform', `translate(${sx + shapeW / 2}, ${sy + shapeH + 10})`);
            } else {
                // 普通节点，水平布局，+号放右侧
                btnG.setAttribute('transform', `translate(${sx + shapeW + 10}, ${sy + shapeH / 2})`);
            }
        }

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '0'); circle.setAttribute('cy', '0');
        circle.setAttribute('r', '7');
        circle.setAttribute('fill', '#549688');
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

        if (isSummaryNode) {
            el.querySelectorAll('title').forEach(t => t.remove());
        }

        btnG.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            // 不再尝试通过修改 isGeneralization 使用内置命令，因为底层完全屏蔽
            // 改为通过扩展的浮动节点系统创建“依附型衍生节点”
            createAttachedFloatingNode(targetUid, isSummaryNode);
        });

        btnG.addEventListener('mouseenter', () => circle.setAttribute('fill', '#488075'));
        btnG.addEventListener('mouseleave', () => circle.setAttribute('fill', '#549688'));

        el.appendChild(btnG);
    }

    // 第二遍：只为选中的摘要渲染+号按钮
    if (_activeGenUid) {
        genEls.forEach(genEl => {
            const cls = genEl.getAttribute('class') || '';
            const uidMatch = cls.match(/generalization_(\S+)/);
            const belongUid = uidMatch ? uidMatch[1] : null;
            if (!belongUid) return;
            
            // 获取实际的摘要节点
            const belongNode = mindMap.renderer.findNodeByUid(belongUid);
            let actualGenNode = null;
            if (belongNode && belongNode._generalizationList) {
                const matchedItem = belongNode._generalizationList.find(g => g.generalizationNode && g.generalizationNode.group && g.generalizationNode.group.node === genEl);
                if (matchedItem) actualGenNode = matchedItem.generalizationNode;
            }
            
            if (actualGenNode && actualGenNode.getData('uid') === _activeGenUid) {
                renderPlusBtnForElement(genEl, _activeGenUid, true);
            }
        });
    }

    // 另外，如果当前选中的普通节点是摘要节点的后代，也为其渲染+号
    if (activeNodeCache && activeNodeCache.length === 1) {
        const activeNode = activeNodeCache[0];
        let isDescendant = false;
        let p = activeNode.parent;
        while (p) {
            if (p.isGeneralization) {
                isDescendant = true;
                break;
            }
            p = p.parent;
        }
        if (isDescendant) {
            const el = activeNode.group ? activeNode.group.node : null;
            if (el) {
                renderPlusBtnForElement(el, activeNode.getData('uid'), false);
            }
        }
    }
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
                        mindMap.execCommand('SET_NODE_ICON', node, currentIcons);
                    });
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

// File operations - 新建按钮下拉菜单
(function initNewDropdown() {
    const wrapper = document.getElementById('btn-new-wrapper');
    const btn = document.getElementById('btn-new');
    const dropdown = document.getElementById('new-dropdown');
    if (!wrapper || !btn || !dropdown) return;

    // 点击按钮切换下拉菜单
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });

    // 下拉菜单选项点击
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapper.classList.remove('open');
            const action = item.dataset.action;
            if (action === 'new-mindmap') {
                newMindMap();
            } else if (action === 'new-folder') {
                newFolder();
            }
        });
    });

    // 点击页面其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        wrapper.classList.remove('open');
    });
})();
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

// Settings
document.getElementById('btn-settings').addEventListener('click', () => {
    if (window.aiService) {
        const config = window.aiService.getConfig();
        document.getElementById('ai-base-url-input').value = config.baseUrl;
        document.getElementById('ai-api-key-input').value = config.apiKey;
        document.getElementById('ai-model-input').value = config.model;
    }
    openModal('modal-settings');
});

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
    if (window.mindMap && mindMap.keyCommand && typeof mindMap.keyCommand.pause === 'function') {
        mindMap.keyCommand.pause();
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    const isAnyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(el => el.style.display === 'flex' || el.style.display === 'block');
    if (!isAnyModalOpen && window.mindMap && mindMap.keyCommand && typeof mindMap.keyCommand.recovery === 'function') {
        mindMap.keyCommand.recovery();
    }
}

function handleNoteModalClose(isOverlayClick) {
    if (window.isAIGenerating) {
        if (confirm('AI正在生成排版内容，确定要中断并退出吗？')) {
            if (window.aiFormatController) {
                window.aiFormatController.abort();
            }
            window.isAIGenerating = false;
        } else {
            return false;
        }
    }
    
    if (isNoteModified()) {
        if (isOverlayClick) {
            showToast('备注已修改，请点击保存');
            return false;
        } else {
            if (!confirm('备注有未保存的修改，确定要丢弃吗？')) {
                return false;
            }
        }
    }
    return true;
}

document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
        if (e.target === el || e.target.classList.contains('modal-close')) {
            const overlay = el.closest('.modal-overlay');
            
            // 备注框特殊处理：如果内容被修改，阻止点击空白处(其他地方)关闭
            if (overlay.id === 'modal-note') {
                const isOverlayClick = (e.target === el && el.classList.contains('modal-overlay'));
                if (!handleNoteModalClose(isOverlayClick)) {
                    return;
                }
            }
            
            overlay.style.display = 'none';
        }
    });
});

// 各模态框取消按钮
document.getElementById('modal-open-cancel').addEventListener('click', () => closeModal('modal-open'));
document.getElementById('modal-search-cancel').addEventListener('click', () => closeModal('modal-search'));
document.getElementById('modal-note-cancel').addEventListener('click', () => {
    if (!handleNoteModalClose(false)) {
        return;
    }
    closeModal('modal-note');
});
document.getElementById('modal-link-cancel').addEventListener('click', () => closeModal('modal-link'));
document.getElementById('modal-settings-cancel').addEventListener('click', () => closeModal('modal-settings'));

document.getElementById('modal-settings-save').addEventListener('click', () => {
    if (window.aiService) {
        const baseUrl = document.getElementById('ai-base-url-input').value.trim();
        const apiKey = document.getElementById('ai-api-key-input').value.trim();
        const model = document.getElementById('ai-model-input').value.trim();
        window.aiService.updateConfig(baseUrl, apiKey, model);
        showToast('AI 设置已保存');
    }
    closeModal('modal-settings');
});

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
            if (el.style.display === 'flex') {
                if (id === 'modal-note') {
                    if (!handleNoteModalClose(false)) {
                        return;
                    }
                }
                closeModal(id);
            }
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
    
    // 如果有任何模态框正在打开（或者事件源本身在模态框内），阻止触发底层的全局快捷键（如删除节点、保存、搜索等）
    const isAnyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(el => el.style.display === 'flex' || el.style.display === 'block');
    if (isAnyModalOpen || target.closest('.modal-overlay')) {
        return;
    }

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
}, true);



// ============ Image Preview ============
function showImagePreview(src) {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    
    // 创建图片容器
    const imgContainer = document.createElement('div');
    imgContainer.className = 'image-preview-container';
    
    // 创建图片元素
    const img = document.createElement('img');
    img.src = src;
    img.className = 'image-preview-img';
    
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    // 滚轮缩放事件
    imgContainer.addEventListener('wheel', (e) => {
        e.preventDefault(); // 阻止默认滚动
        
        // 放大/缩小逻辑
        if (e.deltaY < 0) {
            scale *= 1.1; // 放大
        } else {
            scale /= 1.1; // 缩小
        }
        
        // 限制缩放范围 (比如 0.1 到 10)
        scale = Math.max(0.1, Math.min(scale, 10));
        
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }, { passive: false });
    
    // 拖拽逻辑
    img.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        img.style.cursor = 'grabbing';
    });
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };
    
    const onMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            img.style.cursor = 'grab';
        }
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    // 点击遮罩层关闭弹窗
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target === imgContainer) {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.removeChild(overlay);
        }
    });
    
    imgContainer.appendChild(img);
    overlay.appendChild(imgContainer);
    document.body.appendChild(overlay);
}

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
    initRichTooltip();
    try {
        const res = await fetch('/api/mindmaps');
        const data = await res.json();
        if (data.mindmaps && data.mindmaps.length > 0) {
            let targetId = data.mindmaps[0].id;
            const lastOpenedId = localStorage.getItem('ai_mind_last_opened_uid');
            if (lastOpenedId && data.mindmaps.some(m => m.id === lastOpenedId)) {
                targetId = lastOpenedId;
            }
            const mapRes = await fetch(`/api/mindmaps/${targetId}`);
            const mapData = await mapRes.json();
            currentUid = targetId;
            localStorage.setItem('ai_mind_last_opened_uid', currentUid);
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

    // 每1分钟自动保存
    setInterval(() => {
        if (isDirty && mindMap) {
            autoSave();
        }
    }, 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
