// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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
        try { localStorage.setItem(APP_CONFIG.storageKeys.textColor, value); } catch (_) {}
    } else {
        _lastUsedTextColor = null;
        try { localStorage.removeItem(APP_CONFIG.storageKeys.textColor); } catch (_) {}
    }
    updateTextColorIndicator();
}

// 记录背景色记忆并刷新指示条
function rememberBgColor(value) {
    if (value && value !== '0') {
        _lastUsedBgColor = value;
        try { localStorage.setItem(APP_CONFIG.storageKeys.backgroundColor, value); } catch (_) {}
    } else {
        _lastUsedBgColor = null;
        try { localStorage.removeItem(APP_CONFIG.storageKeys.backgroundColor); } catch (_) {}
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
    // 编辑器工具栏异步生成，按配置的时机重试增强。
    APP_CONFIG.behavior.toolbarEnhanceDelaysMs.forEach(delay => setTimeout(enhanceToolbarButtons, delay));
    
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
        const lastRule = localStorage.getItem(APP_CONFIG.storageKeys.formatRule);
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
    localStorage.setItem(APP_CONFIG.storageKeys.formatRule, rule);

    const htmlContent = wangEditorInstance.getHtml();
    const btnSubmit = document.getElementById('btn-ai-format-submit');
    
    try {
        btnSubmit.textContent = '处理中...';
        btnSubmit.disabled = true;
        window.isAIGenerating = true;
        window.aiFormatController = new AbortController();

        const systemPrompt = AI_PROMPTS.formatNote;
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

