const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const al = window.mindMap.associativeLine;
        const r = window.mindMap.renderer;
        const nodes = Object.values(r.nodeCache);
        const results = {};

        if (nodes.length < 2) {
            results.error = 'Need at least 2 nodes';
            return results;
        }

        // 1. Call addLine directly
        al.lineList = [];
        try {
            al.addLine(nodes[0], nodes[1]);
            results.addLineCalled = true;
        } catch(e) {
            results.addLineError = e.message;
        }

        // 2. Check node data
        results.fromNodeData = {
            uid: nodes[0].getData('uid'),
            text: nodes[0].getData('text'),
            associativeLineTargets: nodes[0].getData('associativeLineTargets'),
        };

        // 3. Render to trigger renderAllLines
        window.mindMap.render();
        results.renderCalled = true;
        results.lineListAfterRender = al.lineList.length;

        // 4. Check SVG for paths
        const svg = document.querySelector('svg');
        const paths = svg ? svg.querySelectorAll('path') : [];
        results.pathCount = paths.length;

        // 5. Check lineList entries
        if (al.lineList.length > 0) {
            results.lineInfo = al.lineList.map((line, i) => ({
                index: i,
                hasPath: !!line[0],
                hasClickPath: !!line[1],
                hasText: !!line[2],
                fromUid: line[3]?.getData?.('uid'),
                toUid: line[4]?.getData?.('uid'),
            }));
        }

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
