const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    // === Step 1: Open app, find currentUid, create assoc, save ===
    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const step1 = await page.evaluate(async () => {
        const mm = window.mindMap;
        const r = mm.renderer;
        const nodes = Object.values(r.nodeCache);
        const uid = window.currentUid;

        // Create association line between nodes[1] and nodes[2]
        mm.associativeLine.addLine(nodes[1], nodes[2]);
        mm.associativeLine.renderAllLines();

        // Save via API
        const data = mm.getData();
        const res = await fetch(`/api/mindmaps/${uid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data }),
        });
        const saveResult = await res.json();

        return {
            uid,
            lineListBeforeSave: mm.associativeLine.lineList.length,
            targetsOnFromNode: nodes[1].getData('associativeLineTargets'),
            saveResult,
            dataHasTargets: JSON.stringify(data).includes('associativeLineTargets'),
        };
    });

    console.log('Step 1:', JSON.stringify(step1, null, 2));

    if (!step1.uid) {
        console.log('No UID, cannot test save/load');
        await browser.close();
        return;
    }

    // === Step 2: Reload ===
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const step2 = await page.evaluate(() => {
        const mm = window.mindMap;
        if (!mm) return { error: 'no mindMap' };

        // Call renderAllLines to render loaded association lines
        if (mm.associativeLine) {
            mm.associativeLine.renderAllLines();
        }

        const r = mm.renderer;
        const nodes = Object.values(r.nodeCache);

        return {
            lineListLen: mm.associativeLine?.lineList?.length || 0,
            rootTargets: nodes[0]?.getData('associativeLineTargets'),
            node1Text: nodes[1]?.getData('text'),
            node2Text: nodes[2]?.getData('text'),
            uid1: nodes[1]?.getData('uid'),
            uid2: nodes[2]?.getData('uid'),
        };
    });

    console.log('Step 2:', JSON.stringify(step2, null, 2));

    await browser.close();
})();
