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
        const al = mm.associativeLine;
        const nodes = Object.values(r.nodeCache);
        const results = {};

        // 1. Try to get addLine source
        try {
            results.addLineSource = al.addLine.toString().substring(0, 2000);
        } catch(e) {
            results.addLineSource = 'error: ' + e.message;
        }

        // 2. Try creating line through the interactive flow
        // First, set isCreatingLine and creatingStartNode
        al.isCreatingLine = true;
        al.creatingStartNode = nodes[0];
        results.isCreating = al.isCreatingLine;
        results.startNode = !!al.creatingStartNode;

        // Now call onNodeClick (simulates clicking the second node)
        if (typeof al.onNodeClick === 'function') {
            try {
                al.onNodeClick(nodes[1]);
                results.onNodeClickCalled = true;
            } catch(e) {
                results.onNodeClickError = e.message;
            }
        }

        results.lineListAfterClick = al.lineList.length;
        results.lineListAfterClickData = al.lineList.length > 0 ?
            JSON.parse(JSON.stringify(al.lineList)) : 'empty';

        // 3. Try createLineFromActiveNode with active nodes set
        r.clearActiveNode();
        r.addNodeToActiveList(nodes[0]);
        r.addNodeToActiveList(nodes[1]);
        results.activeCount = r.activeNodeList.length;

        if (typeof al.createLineFromActiveNode === 'function') {
            try {
                al.createLineFromActiveNode();
                results.createLineFromActive = 'called';
            } catch(e) {
                results.createLineFromActive = 'error: ' + e.message;
            }
        }
        results.lineListAfterCreate = al.lineList.length;

        // 4. Try to see what addLine checks
        // Monkey-patch to see if it's being called
        const origAddLine = al.addLine;
        al.addLine = function(...args) {
            console.log('[DEBUG] addLine called with args:', args.length, typeof args[0], typeof args[1]);
            console.log('[DEBUG] args[0] uid:', args[0]?.getData?.('uid'));
            console.log('[DEBUG] args[1] uid:', args[1]?.getData?.('uid'));
            console.log('[DEBUG] this:', this === al ? 'same context' : 'different');
            const result = origAddLine.apply(this, args);
            console.log('[DEBUG] addLine returned:', result);
            console.log('[DEBUG] lineList after:', this.lineList?.length);
            return result;
        };

        // Now call addLine again
        try {
            al.addLine(nodes[0], nodes[1]);
            results.patchedAddLineCalled = true;
        } catch(e) {
            results.patchedAddLineCalled = 'error: ' + e.message;
        }

        results.lineListAfterPatch = al.lineList.length;

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
