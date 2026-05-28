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

        // Try 1: execCommand with 2 uid arguments (the handler has length 2)
        try {
            mm.execCommand('ADD_ASSOCIATIVE_LINE', nodes[0].getData('uid'), nodes[1].getData('uid'));
            results.try1 = 'called with 2 uids';
        } catch(e) {
            results.try1 = 'error: ' + e.message;
        }
        results.optAfter1 = (mm.opt.associativeLines || []).length;
        results.optAfter1Data = mm.opt.associativeLines ? JSON.parse(JSON.stringify(mm.opt.associativeLines)) : null;

        // Try 2: execCommand with config object
        try {
            mm.execCommand('ADD_ASSOCIATIVE_LINE', {
                uid: 'assoc_obj',
                startUid: nodes[0].getData('uid'),
                endUid: nodes[1].getData('uid'),
                text: '',
                color: '#5b7aff',
                width: 2,
            });
            results.try2 = 'called with object';
        } catch(e) {
            results.try2 = 'error: ' + e.message;
        }
        results.optAfter2 = (mm.opt.associativeLines || []).length;

        // Try 3: Manually set opt and check SVG for line elements
        mm.opt.associativeLines = [{
            uid: 'assoc_svg',
            startUid: nodes[0].getData('uid'),
            endUid: nodes[1].getData('uid'),
            text: '',
            color: '#5b7aff',
            width: 2,
        }];
        mm.render();

        // Check SVG for line/path elements that might be the association
        const svg = document.querySelector('svg');
        results.svgExists = !!svg;
        if (svg) {
            const paths = Array.from(svg.querySelectorAll('path, line'));
            results.svgPaths = paths.length;
            // Get some info about paths
            results.pathSamples = paths.slice(0, 3).map(p => ({
                d: (p.getAttribute('d') || '').substring(0, 50),
                class: p.getAttribute('class') || '',
                stroke: p.getAttribute('stroke') || '',
                id: p.id || '',
            }));
        }

        // Try 4: Check what the ADD_ASSOCIATIVE_LINE handler actually does
        // by looking at what changes after the command
        const cmd = mm.command;
        const assocHandler = cmd.commands.ADD_ASSOCIATIVE_LINE[0];

        // Try calling with the 2 params (uid, uid) and check SVGs before/after
        const svgBefore = document.querySelector('svg')?.innerHTML?.length || 0;
        // Call command
        assocHandler(nodes[0].getData('uid'), nodes[1].getData('uid'));
        const svgAfter = document.querySelector('svg')?.innerHTML?.length || 0;
        results.svgBeforeLen = svgBefore;
        results.svgAfterLen = svgAfter;
        results.svgChanged = svgBefore !== svgAfter;

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
