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

        // 1. Get completeCreateLine and createLineFromActiveNode source
        if (typeof al.completeCreateLine === 'function') {
            try {
                results.completeCreateLineSource = al.completeCreateLine.toString();
            } catch(e) {
                results.completeCreateLineSource = 'error';
            }
        }
        if (typeof al.createLineFromActiveNode === 'function') {
            try {
                results.createLineFromActiveNodeSource = al.createLineFromActiveNode.toString();
            } catch(e) {
                results.createLineFromActiveNodeSource = 'error';
            }
        }

        // 2. Try the interactive flow: createLine + completeCreateLine
        // First reset any stale state
        al.isCreatingLine = false;
        al.creatingStartNode = null;
        al.creatingLine = null;
        al.lineList = [];

        // Start line creation
        al.createLine(nodes[0]);
        results.afterCreate = {
            isCreating: al.isCreatingLine,
            startNode: !!al.creatingStartNode,
            creatingLine: !!al.creatingLine,
            lineListLen: al.lineList.length,
        };

        // Complete the line
        try {
            al.completeCreateLine(nodes[1]);
            results.completeCreateLine = 'called';
        } catch(e) {
            results.completeCreateLine = 'error: ' + e.message;
        }

        results.afterComplete = {
            isCreating: al.isCreatingLine,
            startNode: !!al.creatingStartNode,
            lineListLen: al.lineList.length,
        };

        // Check lineList data
        if (al.lineList.length > 0) {
            results.lineData = al.lineList.map(l => ({
                uid: l.uid,
                from: l.fromNode?.getData?.('uid'),
                to: l.toNode?.getData?.('uid'),
                className: l.constructor?.name,
            }));
        } else {
            results.lineData = 'empty';
        }

        // 3. Also check the SVG for drawn elements
        const svg = document.querySelector('svg');
        results.pathCount = svg ? svg.querySelectorAll('path').length : 0;

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
