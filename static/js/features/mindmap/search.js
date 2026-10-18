// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
// ============ Search & Replace ============
function openSearch() {
    searchState.results = [];
    searchState.currentIndex = -1;
    searchState.keyword = '';
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-count').textContent = '0/0';
    openModal('modal-search');
    setTimeout(() => document.getElementById('search-input').focus(), 100);
}

function performSearch() {
    const keyword = document.getElementById('search-input').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('search-results');
    const countEl = document.getElementById('search-count');

    if (!keyword || !mindMap) {
        resultsContainer.innerHTML = '';
        countEl.textContent = '0/0';
        searchState.results = [];
        searchState.currentIndex = -1;
        return;
    }

    searchState.keyword = keyword;
    const allNodes = getAllNodes();
    const results = [];

    // 构建路径映射
    function buildPath(node, pathMap) {
        const children = node.children || [];
        children.forEach(child => {
            pathMap[child.getData('uid')] = pathMap[node.getData('uid')] || [];
            pathMap[child.getData('uid')] = [...pathMap[child.getData('uid')], node.getData('text') || ''];
            buildPath(child, pathMap);
        });
    }

    const pathMap = {};
    const rootUids = [];
    allNodes.forEach(n => {
        const parent = n.parent;
        if (!parent) rootUids.push(n.getData('uid'));
    });
    rootUids.forEach(uid => { pathMap[uid] = []; });

    // 只从根节点构建路径
    allNodes.forEach(n => {
        const uid = n.getData('uid');
        if (!pathMap[uid]) {
            const parent = n.parent;
            if (parent) {
                const parentUid = parent.getData('uid');
                pathMap[uid] = [...(pathMap[parentUid] || []), parent.getData('text') || ''];
            } else {
                pathMap[uid] = [];
            }
        }
        const children = n.children || [];
        children.forEach(child => {
            const childUid = child.getData('uid');
            pathMap[childUid] = [...(pathMap[uid] || []), n.getData('text') || ''];
        });
    });

    allNodes.forEach(node => {
        const text = (node.getData('text') || '').toLowerCase();
        const note = (node.getData('note') || '').toLowerCase();
        if (text.includes(keyword) || note.includes(keyword)) {
            const uid = node.getData('uid');
            results.push({
                uid,
                text: node.getData('text') || '',
                note: node.getData('note') || '',
                path: pathMap[uid] || [],
            });
        }
    });

    searchState.results = results;
    searchState.currentIndex = results.length > 0 ? 0 : -1;
    countEl.textContent = `${results.length > 0 ? 1 : 0}/${results.length}`;

    renderSearchResults();

    if (results.length > 0) {
        highlightSearchResult(0);
    }
}

function renderSearchResults() {
    const container = document.getElementById('search-results');
    if (searchState.results.length === 0) {
        container.innerHTML = '<p class="empty-hint">未找到匹配节点</p>';
        return;
    }
    container.innerHTML = searchState.results.map((r, i) => {
        const pathStr = r.path.length > 0 ? r.path.join(' > ') : '根节点';
        const highlightedText = highlightKeyword(escapeHtml(r.text), searchState.keyword);
        return `<div class="search-result-item ${i === searchState.currentIndex ? 'active' : ''}" data-index="${i}">
            <div>${highlightedText}</div>
            <div class="search-result-path">${escapeHtml(pathStr)}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.index);
            searchState.currentIndex = idx;
            highlightSearchResult(idx);
        });
    });
}

function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="search-result-match">$1</span>');
}

function highlightSearchResult(index) {
    if (index < 0 || index >= searchState.results.length) return;
    const result = searchState.results[index];
    const node = getAllNodes().find(n => n.getData('uid') === result.uid);
    if (node) {
        mindMap.execCommand('ACTIVE_NODE', [result.uid]);
        mindMap.renderer.moveNodeToCenter(node);
        isDirty = true;
    }
    document.getElementById('search-count').textContent = `${index + 1}/${searchState.results.length}`;

    // 高亮搜索结果项
    document.querySelectorAll('.search-result-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.index) === index);
    });
    // 滚动到可见
    const activeEl = document.querySelector('.search-result-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function searchPrev() {
    if (searchState.results.length === 0) return;
    searchState.currentIndex = (searchState.currentIndex - 1 + searchState.results.length) % searchState.results.length;
    highlightSearchResult(searchState.currentIndex);
}

function searchNext() {
    if (searchState.results.length === 0) return;
    searchState.currentIndex = (searchState.currentIndex + 1) % searchState.results.length;
    highlightSearchResult(searchState.currentIndex);
}

