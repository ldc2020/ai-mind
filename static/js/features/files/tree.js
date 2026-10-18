// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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
            const res = await apiFetch('/tree/move', {
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
            const res = await apiFetch('/tree/move', {
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
        const res = await apiFetch(`/folders/${folderId}`, {
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

