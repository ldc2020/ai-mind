const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    console.log('Opening app...');
    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const mm = window.mindMap;
        const r = mm.renderer;
        const al = mm.associativeLine;
        const nodes = Object.values(r.nodeCache);
        const svg = document.querySelector('svg');
        const res = {};

        // Test 1: Create association between child1 and child2 (nodes[1] and nodes[2])
        al.lineList = [];
        al.addLine(nodes[1], nodes[2]);
        al.renderAllLines();
        res.test1_lineCreated = al.lineList.length === 1;
        res.test1_lineList = al.lineList.length;

        // Test 2: Duplicate prevention - adding same line should be no-op
        const listBefore = al.lineList.length;
        al.addLine(nodes[1], nodes[2]);
        al.renderAllLines();
        res.test2_duplicatePrevented = al.lineList.length === listBefore;

        // Test 3: Second line between different nodes
        al.addLine(nodes[1], nodes[0]);
        al.renderAllLines();
        res.test3_secondLine = al.lineList.length === 2;
        res.test3_lineCount = al.lineList.length;

        // Test 4: Line data is in getData()
        const data = mm.getData();
        const rootData = data.data || {};
        const child1Data = (data.children?.[0]?.data) || {};
        res.test4_dataHasTargets = JSON.stringify(data).includes('associativeLineTargets');
        res.test4_child1Targets = child1Data.associativeLineTargets || 'none';

        // Test 5: SVG has path elements
        res.test5_pathCount = svg ? svg.querySelectorAll('path').length : 0;

        return res;
    });

    console.log('Results:');
    console.log(JSON.stringify(result, null, 2));

    const passed = Object.values(result).filter(v => v === true).length;
    console.log(`\n${passed}/5 tests passed`);

    await page.waitForTimeout(3000);
    await browser.close();
})();
