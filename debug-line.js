const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 1. List ALL renderer methods to find the one that handles lines
    console.log('=== ALL RENDERER METHODS ===');
    const methods = await page.evaluate(() => {
        const r = window.mindMap.renderer;
        const all = [];
        let obj = r;
        const seen = new Set();
        while (obj && obj !== Object.prototype) {
            Object.getOwnPropertyNames(obj).forEach(p => {
                if (typeof obj[p] === 'function' && !seen.has(p)) {
                    seen.add(p);
                    const str = obj[p].toString();
                    all.push({
                        name: p,
                        len: obj[p].length,
                        native: str.includes('[native code]'),
                        // Get first 100 chars of source if not native
                        src: str.includes('[native code]') ? null : str.substring(0, 200)
                    });
                }
            });
            obj = Object.getPrototypeOf(obj);
        }
        // Find all line-related and assoc-related methods
        const lineMethods = all.filter(m =>
            m.name.toLowerCase().includes('line') ||
            m.name.toLowerCase().includes('assoc') ||
            m.name.toLowerCase().includes('relat')
        );
        return { total: all.length, lineMethods };
    });
    console.log(JSON.stringify(methods, null, 2));

    // 2. Try addLine with different parameter combinations
    console.log('\n=== TRY addLine ===');
    const addLineTest = await page.evaluate(() => {
        const r = window.mindMap.renderer;
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // Check if addLine exists
        if (typeof r.addLine === 'function') {
            results.addLineExists = true;
            results.addLineLen = r.addLine.length;

            // Try with 2 args: startNode, endNode
            try {
                r.addLine(nodes[0], nodes[1]);
                results.addLineNodes = 'called';
            } catch(e) { results.addLineNodesErr = e.message; }

            // Check opt after
            results.optLinesAfterNodes = (window.mindMap.opt.associativeLines || []).length;

            // Try with 2 args: startUid, endUid
            try {
                r.addLine(nodes[0].getData('uid'), nodes[1].getData('uid'));
                results.addLineUids = 'called';
            } catch(e) { results.addLineUidsErr = e.message; }

            results.optLinesAfterUids = (window.mindMap.opt.associativeLines || []).length;
        } else {
            results.addLineExists = false;
        }
        return results;
    });
    console.log(JSON.stringify(addLineTest, null, 2));

    await browser.close();
})();
