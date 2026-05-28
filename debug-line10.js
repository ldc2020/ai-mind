const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const al = window.mindMap.associativeLine;
        const results = {};

        // 1. Get createLine source
        results.createLineSource = '';
        if (typeof al.createLine === 'function') {
            try {
                results.createLineSource = al.createLine.toString();
                results.createLineLen = al.createLine.length;
            } catch(e) {
                results.createLineSource = 'error: ' + e.message;
            }
        }

        // 2. Check if addLine has any internal validation
        // Create a mock addLine wrapper that records what addLine does step by step
        const origAddLine = al.addLine;
        const calls = [];
        // Override other methods that addLine might call
        const origCreateLine = al.createLine;
        if (typeof origCreateLine === 'function') {
            al.createLine = function(...args) {
                calls.push('createLine called with ' + args.length + ' args');
                const r = origCreateLine.apply(this, args);
                calls.push('createLine returned, lineList now: ' + (this.lineList?.length || 0));
                return r;
            };
        }

        const origDrawLine = al.drawLine;
        if (typeof origDrawLine === 'function') {
            al.drawLine = function(...args) {
                calls.push('drawLine called');
                return origDrawLine.apply(this, args);
            };
        }

        // Call addLine with the wrapper
        const r = window.mindMap.renderer;
        const nodes = Object.values(r.nodeCache);
        al.lineList = []; // ensure clean
        al.addLine(nodes[0], nodes[1]);

        results.calls = calls;

        // Restore
        al.addLine = origAddLine;

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
