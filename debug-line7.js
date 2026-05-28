const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const mm = window.mindMap;
        const r = mm.renderer;
        const al = mm.associativeLine;
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // 1. Check the addLine source or behavior
        results.addLineLen = al.addLine.length;

        // 2. Check lineList before
        results.lineListBefore = al.lineList.length;

        // 3. Check what addLine returns
        try {
            const returnVal = al.addLine(nodes[0], nodes[1]);
            results.addLineReturn = returnVal;
        } catch(e) {
            results.addLineError = e.message;
        }

        // 4. Check lineList after
        results.lineListAfter = al.lineList.length;
        results.lineListData = al.lineList.length > 0 ?
            JSON.parse(JSON.stringify(al.lineList)) : 'empty';

        // 5. Check node positions (addLine might need valid positions)
        results.node0Pos = nodes[0].getData('uid');
        results.node1Pos = nodes[1].getData('uid');
        results.node0Size = { w: nodes[0].width, h: nodes[0].height, left: nodes[0]._left, top: nodes[0]._top };

        // 6. Try calling addLine again to see if it does something different
        try {
            al.addLine(nodes[1], nodes[2]);
        } catch(e) {}
        results.lineListAfter2 = al.lineList.length;

        // 7. Try renderAllLines
        if (typeof al.renderAllLines === 'function') {
            al.renderAllLines();
            results.renderAllLinesCalled = true;
        }

        // 8. Check SVG
        const svg = document.querySelector('svg');
        results.svgPaths = svg ? svg.querySelectorAll('path').length : 0;

        // 9. Check if nodes have the same uid (are they actually different?)
        results.nodeUids = nodes.slice(0, 3).map(n => n.getData('uid'));

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
