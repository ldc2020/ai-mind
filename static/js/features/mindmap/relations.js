// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
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

