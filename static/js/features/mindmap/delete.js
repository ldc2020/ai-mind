// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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

