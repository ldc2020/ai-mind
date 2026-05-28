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

        // 1. Add association line
        al.addLine(nodes[0], nodes[1]);

        // 2. Check getData() - does it include associativeLineTargets?
        const data = window.mindMap.getData();
        results.rootDataKeys = Object.keys(data);
        results.rootNodeDataKeys = Object.keys(data.data);
        results.hasAssociativeLineTargets = data.data.hasOwnProperty('associativeLineTargets');
        results.rootAssociativeLineTargets = data.data.associativeLineTargets;

        // 3. Simulate save: serialize to JSON
        try {
            const json = JSON.stringify(data);
            results.serializable = true;
            results.serializedLength = json.length;
            // Check if associativeLineTargets survived serialization
            results.serializedHasTargets = json.includes('associativeLineTargets');
        } catch(e) {
            results.serializable = false;
            results.serializationError = e.message;
        }

        // 4. Simulate load: parse, create new MindMap, check if lines render
        const parsed = JSON.parse(JSON.stringify(data));
        window.mindMap.destroy();

        const MindMap = window.simpleMindMap.default;
        const container = document.getElementById('mindMapContainer');
        container.innerHTML = '';

        const mm2 = new MindMap({
            el: container,
            data: parsed,
            layout: 'logicalStructure',
            theme: 'default',
            mousewheelAction: 'zoom',
            fit: true,
        });
        window.mindMap = mm2;

        // Check if new associativeLine plugin picks up the data
        results.loadAssociativeLineTargets = mm2.associativeLine?.lineList?.length || 0;

        // Trigger renderAllLines
        if (mm2.associativeLine) {
            mm2.associativeLine.renderAllLines();
            results.loadLineListAfterRender = mm2.associativeLine.lineList.length;
        }

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
