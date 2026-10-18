// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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
        setTimeout(() => toast.remove(), APP_CONFIG.behavior.toastFadeMs);
    }, APP_CONFIG.behavior.toastDurationMs);
}

// ============ Theme ============
function renderThemePreview(key) {
    // 缩略图直接读取主题参数，展示连线和节点差异，而不是只显示配色色块。
    const theme = THEME_CONFIGS[key];
    const branchColor = index => theme.branchPalette[index % (theme.branchPalette.length || 1)]?.line || theme.lineColor;
    const branchStyle = (index, main) => ({ ...(main ? theme.second : theme.node), ...getBranchNodeStyle(theme, index, main) });
    const curve = theme.lineStyle === 'curve';
    const branch = curve
        ? ['M 91 75 C 117 75 112 38 150 38', 'M 91 75 C 117 75 112 112 150 112']
        : ['M 91 75 H 111 Q 122 75 122 64 V 49 Q 122 38 133 38 H 150',
           'M 91 75 H 111 Q 122 75 122 86 V 101 Q 122 112 133 112 H 150'];
    const node = (x, y, width, style, root = false) => {
        const line = theme.nodeUseLineStyle && !root;
        return `<g>
            ${line ? `<path d="M ${x} ${y + 13} H ${x + width}" stroke="${theme.lineColor}" stroke-width="${theme.lineWidth}"/>`
            : `<rect x="${x}" y="${y}" width="${width}" height="26" rx="${Math.min(style.borderRadius, 13)}" fill="${style.fillColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}"/>`}
            <path d="M ${x + 10} ${y + (line ? 4 : 12)} H ${x + width - 10}" stroke="${style.color}" stroke-width="${root ? 3 : 2}" stroke-linecap="round" opacity=".7"/>
        </g>`;
    };
    return `<svg viewBox="0 0 280 150" aria-hidden="true" focusable="false" style="background:${theme.backgroundColor}">
        <g fill="none" stroke="${theme.lineColor}" stroke-width="${theme.lineWidth}" stroke-linecap="round">
            ${branch.map((d, index) => `<path d="${d}" stroke="${branchColor(index)}"/>`).join('')}
            <path stroke="${branchColor(0)}" d="M 206 38 ${curve ? 'C 224 38 223 24 244 24' : 'H 219 Q 227 38 227 30 Q 227 24 235 24 H 244'}"/>
            <path stroke="${branchColor(1)}" d="M 206 112 ${curve ? 'C 224 112 223 125 244 125' : 'H 219 Q 227 112 227 119 Q 227 125 235 125 H 244'}"/>
        </g>
        ${node(18, 62, 73, theme.root, true)}
        ${node(150, 25, 56, branchStyle(0, true))}${node(150, 99, 56, branchStyle(1, true))}
        ${node(242, 12, 30, branchStyle(0, false))}${node(242, 113, 30, branchStyle(1, false))}
    </svg>`;
}

function renderThemeGrid() {
    const grid = document.getElementById('theme-grid');
    const currentTheme = currentThemeKey;
    grid.innerHTML = THEMES.map(t => `
        <button type="button" class="theme-item ${t.key === currentTheme ? 'active' : ''}" data-theme="${t.key}" aria-pressed="${t.key === currentTheme}">
            <div class="theme-preview">${renderThemePreview(t.key)}</div>
            <span class="theme-name">${t.label}${t.badge ? `<span class="theme-badge">${t.badge}</span>` : ''}</span>
            <span class="theme-description">${t.description}</span>
        </button>
    `).join('');

    grid.querySelectorAll('.theme-item').forEach(item => {
        item.addEventListener('click', () => {
            const theme = item.dataset.theme;
            if (mindMap) {
                const cfg = THEME_CONFIGS[theme];
                if (cfg) {
                    currentThemeKey = theme;
                    // 直接更新插件选项，避免插件的更新方法删除用户手动设置的线条颜色。
                    mindMap.opt.rainbowLinesConfig = getRainbowLinesConfig(cfg);
                    // setThemeConfig 自带重新布局；再次调用 render 会产生并发重绘。
                    mindMap.setThemeConfig(structuredClone(cfg));
                    isDirty = true;
                }
            }
            grid.querySelectorAll('.theme-item').forEach(i => {
                i.classList.remove('active');
                i.setAttribute('aria-pressed', 'false');
            });
            item.classList.add('active');
            item.setAttribute('aria-pressed', 'true');
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

