// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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
    const gap = APP_CONFIG.tooltip.gap;
    const margin = APP_CONFIG.tooltip.viewportMargin;

    // 先让 wrapper 可见但透明，以便测量尺寸
    wrapper.style.display = 'flex';
    wrapper.style.visibility = 'hidden';
    wrapper.style.left = '0';
    wrapper.style.top = '0';

    // 限制 tooltip 内容最大高度
    const maxHeight = Math.min(APP_CONFIG.tooltip.maxHeight, window.innerHeight - 2 * margin);
    const editBtnH = APP_CONFIG.tooltip.editButtonHeight; // 编辑按钮 + 间距大约占 32px
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

    const hideDelay = typeof delay === 'number' ? delay : APP_CONFIG.behavior.tooltipHideDelayMs;

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

