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
        const al = mm.associativeLine;  // The plugin instance
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // 1. Explore the associativeLine plugin
        results.associativeLineType = typeof al;
        if (al) {
            results.associativeLineKeys = Object.keys(al);
            // Get all methods
            const methods = [];
            let obj = al;
            while (obj && obj !== Object.prototype) {
                Object.getOwnPropertyNames(obj).forEach(p => {
                    if (typeof obj[p] === 'function' && !methods.includes(p)) {
                        methods.push(p);
                    }
                });
                obj = Object.getPrototypeOf(obj);
            }
            results.associativeLineMethods = methods;
        }

        // 2. Check opt for associativeLines storage
        results.optAssocKeys = Object.keys(mm.opt || {}).filter(k => k.includes('associat'));
        results.optAssociativeLines = mm.opt?.associativeLines || 'not set';

        // 3. Try calling addLine directly with node objects
        if (al && typeof al.addLine === 'function') {
            try {
                al.addLine(nodes[0], nodes[1]);
                results.addLineDirect = 'called ok';
            } catch(e) {
                results.addLineDirect = 'error: ' + e.message;
            }
            // Check where data was stored
            results.addLineOptAfter = mm.opt?.associativeLines?.length || 0;
            // Check if plugin has its own storage
            results.addLinePluginData = al.data || al.lineData || al.lines || 'no storage found';
            // Check all properties on al that look like data storage
            results.pluginDataKeys = Object.keys(al).filter(k =>
                !['mindMap','opt'].includes(k) && typeof al[k] !== 'function'
            );
            results.pluginDataValues = {};
            results.pluginDataKeys.forEach(k => {
                const val = al[k];
                if (Array.isArray(val)) {
                    results.pluginDataValues[k] = `Array(${val.length})`;
                } else if (val && typeof val === 'object') {
                    results.pluginDataValues[k] = 'Object';
                } else {
                    results.pluginDataValues[k] = val;
                }
            });
        }

        // 4. Check SVG for new elements
        const svg = document.querySelector('svg');
        if (svg) {
            const paths = svg.querySelectorAll('path');
            const lines = svg.querySelectorAll('line');
            results.pathCount = paths.length;
            results.lineCount = lines.length;
            // Check all path data
            results.allPaths = Array.from(paths).map(p => ({
                d: (p.getAttribute('d') || '').substring(0, 80),
                stroke: p.getAttribute('stroke') || '',
            }));
        }

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
