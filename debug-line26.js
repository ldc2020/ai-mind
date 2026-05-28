const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    // === Step 1: Open app, create association line ===
    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const step1 = await page.evaluate(async () => {
        const mm = window.mindMap;
        const r = mm.renderer;
        const nodes = Object.values(r.nodeCache);
        const targetsKey = 'associativeLineTargets';

        // Use the app's own addAssociation function to create line
        window.activeNodeCache = [nodes[1], nodes[2]];

        if (typeof window.addAssociation === 'function') {
            window.addAssociation();
        } else {
            mm.associativeLine.addLine(nodes[1], nodes[2]);
            mm.associativeLine.renderAllLines();
        }

        const lineListLen = mm.associativeLine.lineList.length;
        const targetsOnNode = nodes[1].getData(targetsKey);

        // Save via the app's save function
        if (typeof window.saveMindMap === 'function') {
            window.saveMindMap();
        }

        return {
            lineListLen,
            targetsOnNode,
            node1Uid: nodes[1].getData('uid'),
            node2Uid: nodes[2].getData('uid'),
        };
    });

    console.log('Step 1:', JSON.stringify(step1, null, 2));

    if (!step1.lineListLen) {
        console.log('FAIL: No line created');
        await browser.close();
        return;
    }

    // === Step 2: Reload (the save should have been called, init loads first file) ===
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const step2 = await page.evaluate(() => {
        const mm = window.mindMap;
        if (!mm) return { error: 'no mindMap after reload' };

        // Render association lines from loaded data
        if (mm.associativeLine) {
            mm.associativeLine.renderAllLines();
        }

        const r = mm.renderer;
        const nodes = Object.values(r.nodeCache);

        return {
            lineListLen: mm.associativeLine?.lineList?.length || 0,
            rootTargets: nodes[0]?.getData('associativeLineTargets'),
            node1Targets: nodes[1]?.getData('associativeLineTargets'),
        };
    });

    console.log('Step 2:', JSON.stringify(step2, null, 2));

    if (step2.lineListLen > 0) {
        console.log('SUCCESS: Association line persisted after reload!');
    } else {
        console.log('FAIL: Association line not found after reload');
    }

    await browser.close();
})();
