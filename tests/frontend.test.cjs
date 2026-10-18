// 浏览器回归测试：独立端口 + 临时数据目录，不连接用户正在使用的服务。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testApiFailure() {
    const context = vm.createContext({fetch: async () => ({ok: false, status: 500, json: async () => ({detail: '保存失败'})})});
    vm.runInContext(fs.readFileSync(path.join(root, 'static/js/config/app-config.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'static/js/services/api.js'), 'utf8'), context);
    await assert.rejects(vm.runInContext("apiFetch('/mindmaps/test')", context), /保存失败/);
    console.log('API 失败不会被当成成功：通过');
}

async function testAiConfiguration() {
    const values = new Map();
    let sent;
    const context = vm.createContext({window: {}, console,
        localStorage: {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)},
        fetch: async (url, options) => {sent = {url, options}; return {ok: true, json: async () => ({choices: [{message: {content: '模拟回复'}}]})};},
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'static/js/config/app-config.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'static/js/ai.js'), 'utf8'), context);
    await assert.rejects(vm.runInContext("window.aiService.chatCompletion('规则', '内容')", context), /API Key/);
    vm.runInContext("window.aiService.updateConfig('https://example.invalid/v1/', 'test-key', 'test-model')", context);
    assert.equal(await vm.runInContext("window.aiService.chatCompletion('规则', '内容')", context), '模拟回复');
    assert.equal(sent.url, 'https://example.invalid/v1/chat/completions');
    assert.equal(JSON.parse(sent.options.body).model, 'test-model');
    vm.runInContext('window.aiService = new AIService()', context);
    assert.equal(vm.runInContext('window.aiService.model', context), 'test-model');
    console.log('AI 配置持久化与模拟请求：通过（未调用真实服务）');
}

async function main() {
    assert.equal(process.env.AI_MIND_TESTING, '1', '请通过 python scripts/test.py 启动隔离测试');
    await testApiFailure();
    await testAiConfiguration();
    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    // Windows 打包测试提供由真实 EXE 启动的独立服务，复用同一套浏览器回归。
    const base = process.env.AI_MIND_TEST_BASE_URL || `http://127.0.0.1:${port}`;
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, '测试只允许访问本机隔离服务');
    const server = process.env.AI_MIND_TEST_BASE_URL ? null : spawn(process.env.AI_MIND_PYTHON || 'python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'error'],
        {cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let logs = '';
    server?.stdout.on('data', chunk => logs += chunk);
    server?.stderr.on('data', chunk => logs += chunk);
    let browser;
    try {
        let ready = false;
        for (let i = 0; i < 100; i++) {
            try {if ((await fetch(base + '/api/mindmaps')).ok) {ready = true; break;}} catch {}
            if (server && server.exitCode !== null) throw new Error(logs);
            await delay(100);
        }
        assert(ready, '测试服务未就绪：' + logs);
        const puppeteer = await import('puppeteer');
        // 可用 AI_MIND_BROWSER_PATH 指定测试浏览器；Windows 优先使用已安装的 Chrome。
        const systemChrome = path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe');
        const executablePath = process.env.AI_MIND_BROWSER_PATH || (fs.existsSync(systemChrome) ? systemChrome : undefined);
        browser = await puppeteer.default.launch({headless: true, executablePath});
        const page = await browser.newPage();
        await page.setViewport({width: 1440, height: 1000});
        const errors = [];
        page.on('pageerror', error => {errors.push(error.message); console.error('页面异常：', error.stack || error.message);});
        page.on('console', message => {
            if (message.type() === 'error') console.error('浏览器日志：', message.text());
        });
        await page.goto(base, {waitUntil: 'networkidle0'});
        await page.waitForFunction(() => !!window.mindMap?.renderer?.root);
        assert.equal(await page.evaluate(() => stripHtml(mindMap.renderer.root.getData('text'))), '中心主题');
        assert.equal(await page.$eval('#mindMapContainer svg', node => !!node), true);
        console.log('页面加载、默认模板和 SVG 画布：通过');

        // 验证风格差异落实到真实 SVG 路径，并且能保存、刷新恢复。
        const styleSnapshots = {};
        const themeKeys = ['rainbow', 'colorfulBubble', 'organic', 'bubble', 'minimal', 'cards'];
        assert.deepEqual(await page.evaluate(() => THEMES.map(theme => theme.key)), themeKeys);
        for (const key of themeKeys) {
            await page.evaluate(key => {
                renderThemeGrid();
                document.querySelector(`.theme-item[data-theme="${key}"]`).click();
            }, key);
            await page.waitForFunction(key => currentThemeKey === key && !mindMap.renderer.isRendering && mindMap.renderer.root?._lines?.length > 0, {}, key);
            const snapshot = await page.evaluate(() => ({
                lineStyle: mindMap.getThemeConfig('lineStyle'),
                radius: mindMap.getThemeConfig('second').borderRadius,
                underline: mindMap.getThemeConfig('nodeUseLineStyle'),
                paths: mindMap.renderer.root._lines.map(line => line.attr('d')),
            }));
            assert(snapshot.paths.some(d => /[CQ]/i.test(d)), key + ' 必须包含实际曲线或圆角路径');
            assert.equal(snapshot.lineStyle, key === 'cards' ? 'straight' : 'curve');
            styleSnapshots[key] = snapshot;
            const colors = await page.evaluate(() => ({
                lines: mindMap.renderer.root._lines.map(line => line.attr('stroke')),
                fills: mindMap.renderer.root.children.map(node => node.shapeNode.attr('fill')),
                textColors: mindMap.renderer.root.children.map(node => {
                    const html = node.group.node.querySelector('foreignObject')?.firstElementChild;
                    return html ? getComputedStyle(html).color : node.group.node.querySelector('text')?.getAttribute('fill');
                }),
                plugin: !!mindMap.rainbowLines,
            }));
            if (['rainbow', 'colorfulBubble'].includes(key)) {
                assert(colors.plugin, '需要已加载的彩虹连线插件');
                assert(new Set(colors.lines).size >= 3, key + ' 主分支线应至少包含三种颜色：' + JSON.stringify(colors));
                assert.deepEqual(colors.fills, colors.lines, '主节点和连线应同色');
                assert(colors.textColors.every(color => ['rgb(255, 255, 255)', '#ffffff', '#fff'].includes(color)), '主节点实际文字应为白色：' + JSON.stringify(colors.textColors));
            } else {
                assert.equal(new Set(colors.lines).size, 1, '切回单色风格不能残留彩虹连线');
            }
            await page.evaluate(async () => {await saveMindMap();});
            await page.reload({waitUntil: 'networkidle0'});
            await page.waitForFunction(() => !!window.mindMap?.renderer?.root);
            assert.equal(await page.evaluate(() => currentThemeKey), key);
            assert.equal(await page.evaluate(() => mindMap.getThemeConfig('lineStyle')), snapshot.lineStyle);
        }
        assert.notEqual(styleSnapshots.bubble.radius, styleSnapshots.minimal.radius);
        assert.notEqual(styleSnapshots.organic.underline, styleSnapshots.bubble.underline);
        assert.notDeepEqual(styleSnapshots.organic.paths, styleSnapshots.cards.paths);
        // 检查真正绘制的 SVG 节点/连线，而非仅检查主题配置。
        await page.evaluate(() => document.querySelector('.theme-item[data-theme="rainbow"]').click());
        await page.waitForFunction(() => !mindMap.renderer.isRendering && mindMap.renderer.root.children[0].shapeNode.attr('fill') === BRANCH_PALETTE[0].line);
        await page.evaluate(() => mindMap.execCommand('INSERT_CHILD_NODE', false, [mindMap.renderer.root.children[2]], {text: '继承色系测试'}));
        await page.waitForFunction(() => !mindMap.renderer.isRendering && mindMap.renderer.root.children[2].children.length === 1);
        const inherited = await page.evaluate(() => {
            const branches = mindMap.renderer.root.children;
            return branches.map((branch, index) => ({
                lines: branch._lines.map(line => line.attr('stroke')),
                fills: branch.children.map(node => node.shapeNode.attr('fill')),
                expectedLine: BRANCH_PALETTE[index].line, expectedFill: BRANCH_PALETTE[index].surface,
            }));
        });
        for (const branch of inherited) {
            assert(branch.lines.every(color => color === branch.expectedLine), '子分支线应继承色系');
            assert(branch.fills.every(color => color === branch.expectedFill), '新增和已有子节点应使用同色浅底');
        }
        await page.evaluate(async () => {await saveMindMap();});
        assert.equal(await page.evaluate(() => {
            const visit = node => ['lineColor', 'fillColor', 'borderColor', 'color'].some(key => Object.hasOwn(node.data, key)) || (node.children || []).some(visit);
            return visit(serializeCurrentDocument());
        }), false, '主题计算的颜色不能写入节点数据');
        await page.reload({waitUntil: 'networkidle0'});
        await page.waitForFunction(() => mindMap?.renderer?.root?.children[2]?.children[0]?.shapeNode?.attr('fill') === BRANCH_PALETTE[2].surface);
        const themeOutput = path.join(root, 'artifacts/tests');
        fs.mkdirSync(themeOutput, {recursive: true});
        await page.evaluate(() => mindMap.view.fit());
        await page.screenshot({path: path.join(themeOutput, 'rainbow-theme.png')});
        // 手动配色在主题切换、保存和重新载入后仍优先。
        await page.evaluate(() => {
            const node = mindMap.renderer.root.children[0];
            mindMap.renderer.setNodeStyle(node, 'fillColor', '#112233');
            mindMap.renderer.setNodeStyle(node, 'lineColor', '#445566');
        });
        await page.waitForFunction(() => !mindMap.renderer.isRendering && mindMap.renderer.root.children[0].shapeNode.attr('fill') === '#112233');
        for (const key of ['bubble', 'colorfulBubble']) {
            await page.evaluate(key => document.querySelector(`.theme-item[data-theme="${key}"]`).click(), key);
            await page.waitForFunction(() => !mindMap.renderer.isRendering);
            assert.deepEqual(await page.evaluate(() => [mindMap.renderer.root.children[0].shapeNode.attr('fill'), mindMap.renderer.root._lines[0].attr('stroke')]), ['#112233', '#445566']);
        }
        await page.evaluate(async () => {await saveMindMap();});
        await page.reload({waitUntil: 'networkidle0'});
        await page.waitForFunction(() => mindMap?.renderer?.root?.children[0]?.shapeNode?.attr('fill') === '#112233');
        assert.equal(await page.evaluate(() => mindMap.renderer.root._lines[0].attr('stroke')), '#445566');
        console.log('子孙与新增节点继承色系、配色不污染文档、手动颜色优先：通过');
        // 模拟历史文件中的旧主题名，确认经过加载入口而非仅映射函数也能恢复。
        await page.evaluate(async () => {
            const data = serializeCurrentDocument();
            data.theme = 'blue';
            await apiFetch(`/mindmaps/${currentUid}`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data})});
        });
        await page.reload({waitUntil: 'networkidle0'});
        await page.waitForFunction(() => !!window.mindMap?.renderer?.root);
        assert.equal(await page.evaluate(() => currentThemeKey), 'cards');
        assert.equal(await page.$eval('.theme-item[data-theme="cards"]', element => element.getAttribute('aria-pressed')), 'true');
        await page.evaluate(() => {
            document.querySelector('.theme-item[data-theme="organic"]').click();
            mindMap.view.fit();
        });
        await page.screenshot({path: path.join(themeOutput, 'organic-theme.png')});
        await page.evaluate(() => {renderThemeGrid(); openModal('modal-theme');});
        await page.screenshot({path: path.join(themeOutput, 'theme-picker.png')});
        await page.evaluate(() => closeModal('modal-theme'));
        assert.deepEqual(await page.evaluate(() => ['default', 'blue', 'purple', 'simple', 'unknown'].map(resolveThemeKey)),
            ['organic', 'cards', 'bubble', 'minimal', 'organic']);
        console.log('六种风格的真实曲线、彩色连线/节点、旧主题兼容与刷新恢复：通过');

        const uid = await page.evaluate(async () => {
            const rootNode = mindMap.renderer.root;
            mindMap.execCommand('SET_NODE_TEXT', rootNode, '重构回归标题');
            mindMap.execCommand('INSERT_CHILD_NODE', false, [rootNode], {text: '测试子节点'});
            await saveMindMap();
            return currentUid;
        });
        const saved = await (await fetch(base + '/api/mindmaps/' + uid)).json();
        assert.match(saved.mindmap.data.text, /重构回归标题/);
        assert(saved.mindmap.children.some(node => node.data.text.includes('测试子节点')));
        await page.reload({waitUntil: 'networkidle0'});
        await page.waitForFunction(() => window.mindMap?.renderer?.root && stripHtml(mindMap.renderer.root.getData('text')) === '重构回归标题');
        console.log('节点编辑、添加、保存、刷新恢复：通过');

        await page.evaluate(() => {
            openNoteEditor(mindMap.renderer.root);
        });
        await page.waitForFunction(() => !!wangEditorInstance);
        await page.evaluate(() => {
            wangEditorInstance.setHtml('<p>中文备注<strong>加粗内容</strong></p>');
            document.getElementById('modal-note-save').click();
        });
        await page.evaluate(async () => {await saveMindMap();});
        const withNote = await (await fetch(base + '/api/mindmaps/' + uid)).json();
        assert.match(withNote.mindmap.data.note, /中文备注/);
        console.log('富文本编辑器初始化与备注保存：通过');

        await page.evaluate(async () => {
            const folder = (await (await apiFetch('/folders/create', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: '浏览器目录'})})).json()).folder;
            await apiFetch('/tree/move', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({item_id: currentUid, new_parent_id: folder.id})});
            await loadFileList();
        });
        assert.match(await page.$eval('body', node => node.textContent), /浏览器目录/);
        console.log('文件树接口与页面渲染：通过');

        const floatCount = await page.evaluate(async () => {
            createAttachedFloatingNode(mindMap.renderer.root.getData('uid'), false);
            await saveMindMap();
            return floatingNodes.length;
        });
        assert.equal(floatCount, 1);
        await page.reload({waitUntil: 'networkidle0'});
        await page.waitForFunction(() => floatingNodes.length === 1);
        assert.equal(await page.$$eval('.floating-node-group', nodes => nodes.length), 1);
        console.log('依附浮动节点、关联数据保存与恢复：通过');

        assert(await page.evaluate(() => {
            openSearch();
            document.getElementById('search-input').value = '重构回归';
            performSearch();
            const found = searchState.results.length > 0;
            closeModal('modal-search');
            return found;
        }));
        await page.evaluate(async () => {
            mindMap.setLayout('mindMap');
            renderThemeGrid();
            document.querySelector('.theme-item[data-theme="bubble"]').click();
            await saveMindMap();
        });
        await page.reload({waitUntil: 'networkidle0'});
        await page.waitForFunction(() => !!window.mindMap?.renderer?.root);
        assert.equal(await page.evaluate(() => mindMap.opt.layout), 'mindMap');
        assert.equal(await page.evaluate(() => currentThemeKey), 'bubble');
        assert.equal(await page.evaluate(() => mindMap.getThemeConfig('lineColor')), '#7962b4');
        console.log('搜索、布局和主题保存恢复：通过');

        const exports = await page.evaluate(async () => {
            const result = {};
            for (const format of ['png', 'svg', 'pdf']) {
                const content = await exportFromEngine(format);
                result[format] = typeof content === 'string' ? content.length : content.size;
            }
            result.markdown = buildMarkdown(mindMap.getData(), 1);
            return result;
        });
        for (const format of ['png', 'svg', 'pdf']) assert(exports[format] > 100, format + ' 导出内容为空');
        assert.match(exports.markdown, /重构回归标题/);
        console.log('PNG、SVG、PDF 和 Markdown 导出：通过');

        await page.evaluate(async () => {
            await applyImportedData(parseMarkdown('# 导入回归\n- 内容'));
            await saveMindMap();
        });
        await page.reload({waitUntil: 'networkidle0'});
        await page.waitForFunction(() => window.mindMap?.renderer?.root && JSON.stringify(mindMap.getData()).includes('导入回归'));
        console.log('前端导入、首次保存与刷新恢复：通过');

        const retained = await page.evaluate(async () => {
            const originalFetch = window.fetch;
            let release;
            let markReached;
            const reached = new Promise(resolve => {markReached = resolve;});
            window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                if (args[1]?.method === 'PUT' && String(args[0]).includes('/mindmaps/')) {
                    await new Promise(resolve => {release = resolve; markReached();});
                }
                return response;
            };
            try {
                const saving = saveMindMap();
                await reached;
                mindMap.execCommand('SET_NODE_TEXT', mindMap.renderer.root, '请求期间的新修改');
                release();
                await saving;
                return isDirty;
            } finally {
                window.fetch = originalFetch;
            }
        });
        assert.equal(retained, true);
        await page.evaluate(async () => {await saveMindMap();});
        console.log('保存请求期间继续编辑：新修改保持待保存，通过');

        // 模拟服务端拒绝写入，未保存标记必须保持。
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.method() === 'PUT' && request.url().includes('/api/mindmaps/')) {
                request.respond({status: 500, contentType: 'application/json', body: '{"detail":"测试保存失败"}'});
            } else request.continue();
        });
        assert.equal(await page.evaluate(async () => {isDirty = true; await autoSave(); return isDirty;}), true);
        const before = await page.evaluate(() => currentUid);
        await page.evaluate(async () => {await newMindMap();});
        assert.equal(await page.evaluate(() => currentUid), before, '保存失败时不应切换文档');
        await page.setRequestInterception(false);
        page.removeAllListeners('request');
        console.log('自动保存失败保留未保存状态：通过');
        assert.deepEqual(errors, [], '页面出现未捕获脚本错误');
        const output = path.join(root, 'artifacts/tests');
        fs.mkdirSync(output, {recursive: true});
        await page.screenshot({path: path.join(output, 'editor.png'), fullPage: true});
        console.log('浏览器回归全部通过，无未捕获脚本异常');
    } finally {
        if (browser) await browser.close();
        if (server) {
            server.kill();
            await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
        }
    }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
