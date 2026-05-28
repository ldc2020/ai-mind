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

        // 1. Check beforeAssociativeLineConnection
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

        // 2. Get addLine SOURCE to see what it does
        results.addLineSource = '';
        if (typeof al.addLine === 'function') {
            try {
                results.addLineSource = al.addLine.toString();
            } catch(e) {
                results.addLineSource = 'error: ' + e.message;
            }
        }

        // 3. Reset lineList and try addLine
        al.lineList = [];
        try {
            const ret = al.addLine(nodes[0], nodes[1]);
            results.addLineReturn = ret;
        } catch(e) {
            results.addLineError = e.message;
        }
        results.lineListAfterAddLine = al.lineList?.length || 0;
        if (al.lineList && al.lineList.length > 0) {
            results.lineListData = al.lineList.map(l => ({
                uid: l.uid,
                fromUid: l.fromNode?.getData?.('uid'),
                toUid: l.toNode?.getData?.('uid'),
                type: typeof l,
                keys: Object.keys(l),
            }));
        }

        // 4. Try using createLine + completeCreateLine flow
        al.lineList = [];
        al.isCreatingLine = false;
        al.creatingStartNode = null;
        al.creatingLine = null;

        al.createLine(nodes[0]);
        results.afterCreateLine = {
            isCreating: al.isCreatingLine,
            startNode: !!al.creatingStartNode,
            creatingLine: !!al.creatingLine,
        };

        try {
            al.completeCreateLine(nodes[1]);
            results.completeCreateLineResult = 'called';
        } catch(e) {
            results.completeCreateLineResult = 'error: ' + e.message;
        }

        results.lineListAfterComplete = al.lineList?.length || 0;

        // 5. Check opt for associative lines config
        results.optAssociativeLines = mm.opt?.associativeLines;
        results.optAssociativeLineInit = mm.opt?.associativeLineInitPointsPosition;

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
