const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const mm = window.mindMap;
        const al = mm.associativeLine;
        const r = mm.renderer;
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // Simulate: user selects 2 nodes, clicks "关联" button
        // Step 1: Set active nodes
        r.clearActiveNode();
        r.addNodeToActiveList(nodes[1]);
        r.addNodeToActiveList(nodes[2]);
        window.activeNodeCache = [nodes[1], nodes[2]];

        results.activeCount = window.activeNodeCache.length;
        results.activeNodeTexts = window.activeNodeCache.map(n => n.getData('text'));

        // Step 2: Call addAssociation (app.js function)
        try {
            // This is the global function from app.js
            if (typeof window.addAssociation === 'function') {
                window.addAssociation();
                results.addAssociationCalled = true;
            } else {
                // The function might not be global. Let's call inline
                mm.associativeLine.addLine(nodes[1], nodes[2]);
                mm.associativeLine.renderAllLines();
                results.addAssociationCalled = 'inline';
            }
        } catch(e) {
            results.addAssociationError = e.message;
        }

        results.lineListLength = al.lineList.length;

        // Check SVG paths - count paths that look like associative lines
        const svg = document.querySelector('svg');
        if (svg) {
            const paths = svg.querySelectorAll('path');
            results.pathCount = paths.length;
            // Check for marker (arrow) usage - associative lines have arrow markers
            const pathsWithMarker = Array.from(paths).filter(p => p.hasAttribute('marker-end'));
            results.pathsWithMarker = pathsWithMarker.length;
        }

        // Check node data
        results.fromNodeTargets = nodes[1].getData('associativeLineTargets');

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
