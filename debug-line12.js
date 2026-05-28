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
        const mm = window.mindMap;
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // 1. Check if beforeAssociativeLineConnection is blocking
        const beforeConn = mm.opt?.beforeAssociativeLineConnection;
        results.beforeConnType = typeof beforeConn;
        if (typeof beforeConn === 'function') {
            try {
                const val = beforeConn(nodes[1]);
                results.beforeConnResult = val;
            } catch(e) {
                results.beforeConnError = e.message;
            }
        }

        // 2. Now let's bypass completeCreateLine and directly inspect
        // what happens inside addLine by checking what it accesses
        // Let's see if addLine looks at anything specific

        // Check if there's a Line class/constructor that addLine creates
        // Check for line-related classes on the associativeLine instance
        results.lineRelatedFields = {};
        for (const key of Object.keys(al)) {
            const val = al[key];
            if (key === 'lineList') {
                results.lineRelatedFields[key] = 'Array(' + val.length + ')';
            } else if (typeof val !== 'function') {
                results.lineRelatedFields[key] = typeof val + ' ' + (val === null ? 'null' : val?.constructor?.name || '');
            }
        }

        // 3. Try to create a line manually by direct lineList manipulation
        // This bypasses addLine entirely
        const uid = 'manual_line_' + Date.now();
        const lineObj = {
            uid,
            fromNode: nodes[0],
            toNode: nodes[1],
            color: '#5b7aff',
            width: 2,
        };
        al.lineList.push(lineObj);
        results.manualPush = al.lineList.length;

        // Try rendering
        if (typeof al.renderAllLines === 'function') {
            al.renderAllLines();
            results.renderAllCalled = true;
        }

        // Check SVG
        const svg = document.querySelector('svg');
        results.pathCount = svg ? svg.querySelectorAll('path').length : 0;

        // 4. Draw a line using drawLine with the right structure
        // drawLine takes (lineData) with 4 params - let me check
        // Looking at drawLine length: 4
        // drawLine(lineData, fromNode, toNode, ???)
        // or drawLine(line, x1, y1, x2, y2)?
        const drawLineSrc = al.drawLine ? al.drawLine.toString() : 'no drawLine';
        results.drawLineSource = drawLineSrc.substring(0, 500);

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
