const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    // === Step 1: Open app, create association line, save ===
    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const step1 = await page.evaluate(() => {
        const mm = window.mindMap;
        const r = mm.renderer;
        const nodes = Object.values(r.nodeCache);

        // Create association line between nodes[1] and nodes[2]
        mm.associativeLine.addLine(nodes[1], nodes[2]);
        mm.associativeLine.renderAllLines();

        // Save via API
        const data = mm.getData();
        return fetch('/api/mindmaps/current', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data }),
        }).then(r => r.json()).then(() => ({
            lineListLen: mm.associativeLine.lineList.length,
            targetsOnNode: nodes[1].getData('associativeLineTargets'),
            saved: true,
        })).catch(e => ({ saved: false, error: e.message }));
    });

    console.log('Step 1 - Create & Save:', JSON.stringify(step1, null, 2));

    // Since we don't know the currentUid, let's find the saved file
    const fileList = await page.evaluate(async () => {
        const res = await fetch('/api/mindmaps');
        const data = await res.json();
        return data.mindmaps;
    });

    console.log('File list:', JSON.stringify(fileList, null, 2));

    // === Step 2: Reload page completely ===
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const step2 = await page.evaluate(() => {
        const mm = window.mindMap;
        if (!mm) return { error: 'mindMap not found after reload' };

        // Trigger renderAllLines (called in app.js init)
        if (mm.associativeLine) {
            mm.associativeLine.renderAllLines();
        }

        return {
            lineListLen: mm.associativeLine?.lineList?.length || 0,
            pathCount: document.querySelector('svg')?.querySelectorAll('path').length || 0,
            wasRestored: mm.associativeLine?.lineList?.length > 0,
        };
    });

    console.log('Step 2 - After reload:', JSON.stringify(step2, null, 2));

    await browser.close();
})();
