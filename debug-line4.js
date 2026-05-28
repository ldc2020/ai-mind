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
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // The correct way: pass node objects, not uids!
        try {
            mm.execCommand('ADD_ASSOCIATIVE_LINE', nodes[0], nodes[1]);
            results.execWithNodes = 'called';
        } catch(e) {
            results.execWithNodes = 'error: ' + e.message;
        }

        // Check opt.associativeLines
        results.optAfter = mm.opt.associativeLines ?
            mm.opt.associativeLines.length : 0;
        results.optData = mm.opt.associativeLines ?
            JSON.parse(JSON.stringify(mm.opt.associativeLines)) : null;

        // Check SVG for line/path elements (association lines)
        const svg = document.querySelector('svg');
        if (svg) {
            // Check for path elements with markers (association lines use markers)
            const paths = svg.querySelectorAll('path');
            results.totalPaths = paths.length;
            results.pathDetails = Array.from(paths).map((p, i) => ({
                i,
                d: (p.getAttribute('d') || '').substring(0, 60),
                stroke: p.getAttribute('stroke') || '',
                fill: p.getAttribute('fill') || '',
                class: p.getAttribute('class') || '',
                id: p.id || '',
                markerEnd: p.getAttribute('marker-end') || '',
            }));

            // Also check for marker definitions
            const defs = svg.querySelector('defs');
            const markers = defs ? defs.querySelectorAll('marker') : [];
            results.markerCount = markers.length;
        }

        return results;
    });

    console.log(JSON.stringify(result, null, 2));

    // Check if any path looks like an associative line (has marker-end or specific stroke)
    const paths = result.pathDetails || [];
    const assocPaths = paths.filter(p => p.markerEnd || p.class.includes('assoc') || p.stroke === '#5b7aff');
    console.log(`\nAssociation-like paths: ${assocPaths.length}`);
    if (assocPaths.length > 0) {
        console.log('Found!', JSON.stringify(assocPaths));
    }

    console.log(`\n${result.execWithNodes === 'called' && result.optAfter > 0 ? '✅' : '❌'} execCommand with nodes`);
    console.log(`${assocPaths.length > 0 ? '✅' : '❌'} visible SVG elements`);

    await browser.close();
})();
