// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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

