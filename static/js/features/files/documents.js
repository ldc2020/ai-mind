// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
// ============ File Operations ============
// 同一时间只有一个写入请求；保存过程中发生的新修改继续保持未保存状态。
let pendingDocumentSave = null;

function serializeCurrentDocument() {
    const data = mindMap.getData();
    data.layout = mindMap.opt.layout || data.layout;
    data.theme = currentThemeKey;
    data._floatingNodes = getFloatingNodesData();
    return data;
}

async function persistCurrentDocument() {
    if (!mindMap) return true;
    if (pendingDocumentSave) return pendingDocumentSave;
    const uidAtStart = currentUid;
    const snapshot = JSON.stringify(serializeCurrentDocument());
    pendingDocumentSave = (async () => {
        const response = await apiFetch(uidAtStart ? `/mindmaps/${uidAtStart}` : '/mindmaps/new', {
            method: uidAtStart ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({data: JSON.parse(snapshot)}),
        });
        const result = await response.json();
        // 请求期间若切换了文档，不改变新文档的标识和状态。
        if (currentUid !== uidAtStart) return false;
        currentUid = result.uid;
        localStorage.setItem(APP_CONFIG.storageKeys.lastDocument, currentUid);
        isDirty = JSON.stringify(serializeCurrentDocument()) !== snapshot;
        return !isDirty;
    })();
    try {
        return await pendingDocumentSave;
    } finally {
        pendingDocumentSave = null;
    }
}

async function autoSave() {
    if (!isDirty || !mindMap) return true;
    try {
        return await persistCurrentDocument();
    } catch (err) {
        console.error('自动保存失败:', err);
        return false;
    }
}

async function saveBeforeSwitch() {
    if (await autoSave()) return true;
    showToast('当前文档尚未保存成功，请重试保存后再切换');
    return false;
}

async function loadFileList() {
    try {
        // 侧边栏用树状结构
        const treeRes = await apiFetch('/tree');
        if (!treeRes.ok) {
            console.warn('/api/tree 失败，回退到平铺列表');
            const mapsRes = await apiFetch('/mindmaps');
            const mapsData = await mapsRes.json();
            renderOpenFileList(mapsData.mindmaps);
            // 用平铺列表填充侧边栏
            renderFileListFallback(mapsData.mindmaps);
            return;
        }
        const treeData = await treeRes.json();
        if (!treeData.tree || !Array.isArray(treeData.tree)) {
            console.warn('/api/tree 返回数据异常，回退到平铺列表', treeData);
            const mapsRes = await apiFetch('/mindmaps');
            const mapsData = await mapsRes.json();
            renderOpenFileList(mapsData.mindmaps);
            renderFileListFallback(mapsData.mindmaps);
            return;
        }
        renderFileTree(treeData.tree);
        // 弹出窗用平铺列表（向后兼容）
        const mapsRes = await apiFetch('/mindmaps');
        const mapsData = await mapsRes.json();
        renderOpenFileList(mapsData.mindmaps);
    } catch (err) {
        console.error('加载文件列表失败:', err);
        // 最终回退
        try {
            const mapsRes = await apiFetch('/mindmaps');
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
    if (!await saveBeforeSwitch()) return;
    try {
        const res = await apiFetch('/mindmaps/new', { method: 'POST' });
        const data = await res.json();
        currentUid = data.uid;
        localStorage.setItem(APP_CONFIG.storageKeys.lastDocument, currentUid);
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

async function newFolder() {
    const name = prompt('请输入文件夹名称：', '新建文件夹');
    if (!name || !name.trim()) return;
    try {
        await apiFetch('/folders/create', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: name.trim()}),
        });
        await loadFileList();
    } catch (err) {
        showToast(err.message || '创建文件夹失败');
    }
}

async function saveMindMap() {
    if (!mindMap) return false;
    try {
        const complete = await persistCurrentDocument();
        await loadFileList();
        showToast(complete ? '保存成功' : '保存完成，仍有新修改待保存');
        return complete;
    } catch (err) {
        console.error('保存失败:', err);
        showToast('保存失败，请检查服务连接');
        return false;
    }
}

async function loadMindMap(uid) {
    if (!await saveBeforeSwitch()) return;
    try {
        const res = await apiFetch(`/mindmaps/${uid}`);
        const data = await res.json();
        currentUid = uid;
        localStorage.setItem(APP_CONFIG.storageKeys.lastDocument, currentUid);
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
            const res = await apiFetch(`/folders/${id}`, { method: 'DELETE' });
            if (res.ok) { loadFileList(); return; }
        } catch (e) { /* 回退 */ }

        // 方案B：通过 /api/tree 操作
        try {
            const treeRes = await apiFetch('/tree');
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
            const putRes = await apiFetch('/tree/save', {
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
            await apiFetch(`/mindmaps/${id}`, { method: 'DELETE' });
            if (currentUid === id) {
                currentUid = null;
                localStorage.removeItem(APP_CONFIG.storageKeys.lastDocument);
            }
            loadFileList();
            if (!currentUid) {
                const res = await apiFetch('/mindmaps');
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

