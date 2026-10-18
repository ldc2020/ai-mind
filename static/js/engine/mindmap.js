// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
// ============ Initialize Mind Map ============
function initMindMap(data) {
    currentThemeKey = resolveThemeKey((data && data.theme) || APP_CONFIG.editor.theme);
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
        data: data || structuredClone(DEFAULT_DOCUMENT),
        ...APP_CONFIG.editor,
        layout: (data && data.layout) || APP_CONFIG.editor.layout,
        // 本地库只保证 default 存在；应用的其他配色通过 themeConfig 注入。
        theme: 'default',
        themeConfig: structuredClone(THEME_CONFIGS[currentThemeKey]),
        rainbowLinesConfig: getRainbowLinesConfig(THEME_CONFIGS[currentThemeKey]),
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
        // 首次拿到库的样式对象后安装兼容层。延后一次重绘，确保首次打开也呈现彩色节点。
        const instance = mindMap;
        if (patchBranchNodeColors(instance) && instance.themeConfig.branchPalette?.length) {
            setTimeout(() => {
                if (mindMap === instance) instance.setThemeConfig(structuredClone(THEME_CONFIGS[currentThemeKey]));
            }, 0);
        }
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
                            text: APP_CONFIG.floatingNode.text,
                            x: mapX,
                            y: mapY,
                            isActive: false,
                            color: APP_CONFIG.floatingNode.color,
                            fillColor: APP_CONFIG.floatingNode.fillColor,
                            borderColor: APP_CONFIG.floatingNode.borderColor,
                            borderDasharray: '',
                            borderWidth: 1,
                            fontSize: APP_CONFIG.floatingNode.fontSize,
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

