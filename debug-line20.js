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

        // 1. Call addLine
        al.lineList = [];
        try {
            al.addLine(nodes[0], nodes[1]);
            results.addLineOk = true;
        } catch(e) {
            results.addLineError = e.message;
        }

        results.lineListBeforeRenderAll = al.lineList.length;

        // 2. Call renderAllLines directly - this should populate lineList
        try {
            al.renderAllLines();
            results.renderAllLinesOk = true;
        } catch(e) {
            results.renderAllLinesError = e.message;
        }

        results.lineListAfterRenderAll = al.lineList.length;

        // 3. Check lineList entries
        if (al.lineList.length > 0) {
            results.lineInfo = al.lineList.map((line, i) => ({
                hasPath: !!line[0],
                fromUid: line[3]?.getData?.('uid'),
                toUid: line[4]?.getData?.('uid'),
            }));
        }

        // 4. Check SVG paths
        const svg = document.querySelector('svg');
        results.totalPathCount = svg ? svg.querySelectorAll('path').length : 0;

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
