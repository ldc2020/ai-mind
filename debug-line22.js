const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const r = window.mindMap.renderer;
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // 1. Add association line
        window.mindMap.associativeLine.addLine(nodes[0], nodes[1]);
        window.mindMap.associativeLine.renderAllLines();

        // 2. Save data
        const data = window.mindMap.getData();

        // 3. Destroy and recreate
        window.mindMap.destroy();
        const container = document.getElementById('mindMapContainer');
        container.innerHTML = '';

        const MindMap = window.simpleMindMap.default;
        const mm2 = new MindMap({
            el: container,
            data: data,
            layout: 'logicalStructure',
            theme: 'default',
            mousewheelAction: 'zoom',
            fit: true,
        });
        window.mindMap = mm2;

        // Wait a bit for render
        return new Promise(resolve => {
            setTimeout(() => {
                const r2 = mm2.renderer;
                const cacheNodes = Object.values(r2.nodeCache);

                // Check node data after reload
                const rootNode = cacheNodes[0];
                const rootData = rootNode ? rootNode.getData() : null;
                results.rootTargets = rootData ? rootData.associativeLineTargets : 'no root';
                results.rootUid = rootData ? rootData.uid : 'no root';

                // Check child nodes and their UIDs
                const childNode = cacheNodes[1];
                results.childUid = childNode ? childNode.getData('uid') : 'no child';

                // Check if the target UID matches
                if (results.rootTargets && results.rootTargets.length > 0) {
                    results.targetUidMatch = results.rootTargets[0] === results.childUid;
                }

                // Try rendering all lines
                if (mm2.associativeLine) {
                    mm2.associativeLine.renderAllLines();
                    results.lineListAfterLoad = mm2.associativeLine.lineList.length;
                }

                resolve(results);
            }, 500);
        });
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
