// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
// ============ Export Functions ============
async function exportMindMap(format) {
    if (!mindMap) return false;
    closeModal('modal-export');
    try {
        if (format === 'markdown') {
            exportMarkdown();
        } else {
            // 当前库返回异步数据 URL，而不是包含 png()/svg() 的对象。
            const result = await exportFromEngine(format);
            const isBlob = result instanceof Blob;
            const url = isBlob ? URL.createObjectURL(result) : result;
            const link = document.createElement('a');
            link.href = url;
            link.download = APP_CONFIG.export.filename + '.' + format;
            link.click();
            if (isBlob) URL.revokeObjectURL(url);
            showToast(format.toUpperCase() + ' 导出成功');
        }
        return true;
    } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败');
        return false;
    }
}

function exportMarkdown() {
    const data = mindMap.getData();
    const md = buildMarkdown(data, 1);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = APP_CONFIG.export.filename + '.md';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Markdown 导出成功');
}

function buildMarkdown(data, level) {
    if (!data || !data.data) return '';
    const text = data.data.text || '';
    const prefix = '#'.repeat(level);
    let md = `${prefix} ${text}\n\n`;
    if (data.children) {
        data.children.forEach(child => {
            md += buildMarkdown(child, level + 1);
        });
    }
    return md;
}

// ============ Import Functions ============
function openImportDialog() {
    openModal('modal-import');
    // 重置状态
    document.getElementById('import-status').textContent = '';
    document.getElementById('import-file-input').value = '';
    document.getElementById('import-markdown-input').value = '';
    // 切换到文件tab
    document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.import-pane').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-import-type="file"]').classList.add('active');
    document.getElementById('import-file-pane').classList.add('active');
}

function handleImportFile(file) {
    const status = document.getElementById('import-status');
    const ext = file.name.split('.').pop().toLowerCase();

    status.textContent = `正在导入 ${file.name}...`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            let mindmapData;
            const content = e.target.result;

            if (ext === 'md' || ext === 'markdown') {
                mindmapData = parseMarkdown(content);
            } else if (ext === 'xmind') {
                mindmapData = await parseXMind(content);
            } else if (ext === 'mm') {
                mindmapData = parseFreeMind(content);
            } else {
                status.textContent = '不支持的文件格式';
                return;
            }

            if (mindmapData) {
                await applyImportedData(mindmapData);
                status.textContent = '导入成功！';
                closeModal('modal-import');
                showToast('导入成功');
            } else {
                status.textContent = '解析失败，请检查文件格式';
            }
        } catch (err) {
            console.error('导入出错:', err);
            status.textContent = '导入出错: ' + err.message;
        }
    };

    if (ext === 'xmind') {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file, 'UTF-8');
    }
}

async function parseXMind(buffer) {
    // XMind 文件是 ZIP 格式，包含 content.xml 或 content.json
    // 使用 JSZip 解析
    try {
        const JSZip = window.JSZip;
        if (!JSZip) {
            // 动态加载 JSZip
            await loadScript('/static/vendor/jszip.min.js');
        }
        const zip = await JSZip.loadAsync(buffer);

        // 新版 XMind (2020+) 使用 content.json
        let contentFile = zip.file('content.json');
        if (contentFile) {
            const jsonStr = await contentFile.async('text');
            const data = JSON.parse(jsonStr);
            return convertXMindJSON(data);
        }

        // 旧版 XMind 使用 content.xml
        contentFile = zip.file('content.xml');
        if (contentFile) {
            const xmlStr = await contentFile.async('text');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
            return convertXMindXML(xmlDoc);
        }

        throw new Error('无法找到 mind map 数据');
    } catch (err) {
        console.error('解析 XMind 失败:', err);
        throw new Error('XMind 解析失败: ' + err.message);
    }
}

function convertXMindJSON(data) {
    // XMind 2020+ JSON 格式
    const rootTopic = data.rootTopic || data.sheet?.rootTopic || data;
    if (!rootTopic) return null;

    function convertTopic(topic) {
        const title = topic.title || topic.topic?.title || '';
        const children = topic.children?.attached || [];
        const notes = topic.notes?.plain?.content || '';
        const hyperlink = topic.hyperlink || '';
        const labels = topic.labels || [];

        const result = {
            data: { text: title },
            children: children.map(child => convertTopic(child)),
        };

        if (notes) result.data.note = notes;
        if (hyperlink) result.data.hyperlink = hyperlink;
        if (labels.length > 0) result.data.tag = labels;

        return result;
    }

    return convertTopic(rootTopic);
}

function convertXMindXML(xmlDoc) {
    // 旧版 XMind XML 格式
    const rootTopic = xmlDoc.querySelector('topic[id="0"]') || xmlDoc.querySelector('topic');
    if (!rootTopic) return null;

    function convertXMLTopic(topicEl) {
        const title = topicEl.getAttribute('text') ||
            (topicEl.querySelector('title')?.textContent) ||
            topicEl.textContent?.split('\n')[0]?.trim() || '';
        const children = [];
        const childTopics = topicEl.querySelectorAll(':scope > children > topic');
        childTopics.forEach(child => children.push(convertXMLTopic(child)));

        return {
            data: { text: title },
            children: children,
        };
    }

    return convertXMLTopic(rootTopic);
}

function parseFreeMind(xmlStr) {
    // FreeMind .mm 格式
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

    function convertMMTopic(topicEl) {
        const text = topicEl.getAttribute('TEXT') || '';
        const children = [];
        const childTopics = topicEl.querySelectorAll(':scope > node');
        childTopics.forEach(child => children.push(convertMMTopic(child)));

        return {
            data: { text },
            children: children,
        };
    }

    const root = xmlDoc.querySelector('map > node') || xmlDoc.querySelector('node');
    if (!root) throw new Error('无法解析 FreeMind 文件');
    return convertMMTopic(root);
}

function parseMarkdown(text) {
    const lines = text.split('\n');
    const root = { data: { text: '导入文档' }, children: [] };
    const stack = [{ node: root, level: 0 }];

    let inList = false;
    let currentListParent = null;

    lines.forEach(line => {
        // 标题
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();
            const newNode = { data: { text }, children: [] };

            // 找到合适的父节点
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            stack[stack.length - 1].node.children.push(newNode);
            stack.push({ node: newNode, level });
            inList = false;
            return;
        }

        // 列表项
        const listMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
        if (listMatch) {
            const indent = listMatch[1].length;
            const text = listMatch[2].trim();
            const newNode = { data: { text }, children: [] };

            if (!inList) {
                // 直接添加到当前顶层
                const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
                parent.children.push(newNode);
                currentListParent = newNode;
                inList = true;
            } else {
                currentListParent.children.push(newNode);
                currentListParent = newNode;
            }

            // 列表项的缩进层级
            const level = Math.floor(indent / 2) + (stack.length > 0 ? stack[stack.length - 1].level : 0) + 1;
            stack.push({ node: newNode, level });
            return;
        }

        // 普通文本
        if (line.trim()) {
            const text = line.trim();
            const newNode = { data: { text }, children: [] };
            const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
            parent.children.push(newNode);
            inList = false;
        }
    });

    return root;
}

async function applyImportedData(data) {
    if (!await saveBeforeSwitch()) throw new Error('当前文档未保存，已取消导入');
    if (mindMap) {
        mindMap.destroy();
    }
    currentUid = null;
    isDirty = true; // 导入结果尚未落盘，自动保存或手动保存都会创建新文档。
    initMindMap(data);
    updatePropertyPanel();
}

