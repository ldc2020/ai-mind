// 库版本兼容补丁：动态分支配色、关联线重渲染后恢复自定义箭头。

// 当前引擎的彩虹插件只负责连线；在样式读取层补上节点配色，不修改节点数据/撤销历史。
// 仅覆盖颜色默认值；用户手动设置的 fillColor、borderColor、color 始终优先。
function patchBranchNodeColors(instance) {
    const prototype = instance.renderer.root?.style && Object.getPrototypeOf(instance.renderer.root.style);
    if (!prototype || prototype.merge._branchColorsPatched) return false;
    const original = prototype.merge;
    function merge(prop, useRoot) {
        const node = this.ctx;
        const theme = node.mindMap.themeConfig;
        if (!useRoot && !node.isGeneralization && node.layerIndex > 0 &&
            theme.branchPalette?.length && ['fillColor', 'borderColor', 'color'].includes(prop) &&
            this.getSelfStyle(prop) === undefined) {
            let branch = node;
            while (branch.parent && branch.layerIndex > 1) branch = branch.parent;
            // 文本测量时渲染节点列表尚未完整，必须从数据树查顺序，和彩虹连线插件保持一致。
            const index = branch.parent?.nodeData.children.findIndex(item => item.data.uid === branch.uid) ?? -1;
            const value = getBranchNodeStyle(theme, index, node.layerIndex === 1)[prop];
            if (value !== undefined) {
                this.addToEffectiveStyles({ [prop]: value });
                return value;
            }
        }
        return original.call(this, prop, useRoot);
    }
    merge._branchColorsPatched = true;
    prototype.merge = merge;
    return true;
}

async function exportFromEngine(format) {
    const result = await mindMap.export(format, false, APP_CONFIG.export.filename);
    // 库内部可能捕获错误后返回 undefined，不能据此显示导出成功。
    if (!result) throw new Error('导图引擎未生成导出内容');
    return result;
}

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

