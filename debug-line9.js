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

        // 1. Try different node combinations
        results.nodeCombos = [];

        // Root + child1
        try {
            al.addLine(nodes[0], nodes[1]);
            results.nodeCombos.push({ combo: 'root+child1', listLen: al.lineList.length });
        } catch(e) {
            results.nodeCombos.push({ combo: 'root+child1', error: e.message });
        }

        // Child2 + child3 (siblings)
        if (nodes.length >= 3) {
            try {
                al.addLine(nodes[1], nodes[2]);
                results.nodeCombos.push({ combo: 'child1+child2', listLen: al.lineList.length });
            } catch(e) {
                results.nodeCombos.push({ combo: 'child1+child2', error: e.message });
            }
        }

        // 2. Check what nodes are NOT null
        const validNodes = nodes.filter(n => n && n.getData);
        results.validNodeCount = validNodes.length;

        // 3. Check if the problem is that nodes need to have proper positions
        // Look at the SVG transform
        const svg = document.querySelector('svg');
        const mainG = svg ? svg.querySelector('g') : null;
        results.svgTransform = mainG ? mainG.getAttribute('transform') : 'no group';

        // 4. Check drawLine - maybe it directly draws without lineList
        if (typeof al.drawLine === 'function') {
            results.drawLineLen = al.drawLine.length;
            try {
                // drawLine likely takes lineData object
                const lineData = {
                    uid: 'direct_line',
                    startUid: nodes[0].getData('uid'),
                    endUid: nodes[1].getData('uid'),
                    fromNode: nodes[0],
                    toNode: nodes[1],
                    color: '#5b7aff',
                    width: 2,
                };
                const result = al.drawLine(lineData);
                results.drawLineResult = typeof result;
                results.drawLineListAfter = al.lineList.length;
            } catch(e) {
                results.drawLineError = e.message;
            }
        }

        // 5. Check completeCreateLine
        if (typeof al.completeCreateLine === 'function') {
            results.completeCreateLineLen = al.completeCreateLine.length;
            // Set up the state for completeCreateLine
            al.creatingStartNode = nodes[0];
            al.isCreatingLine = true;
            // completeCreateLine takes the end position/node
            try {
                al.completeCreateLine(nodes[1]);
                results.completeCreateLineCalled = true;
            } catch(e) {
                results.completeCreateLineError = e.message;
            }
            results.lineListAfterComplete = al.lineList.length;
        }

        // 6. Check getNodePos
        if (typeof al.getNodePos === 'function') {
            try {
                const pos0 = al.getNodePos(nodes[0]);
                const pos1 = al.getNodePos(nodes[1]);
                results.nodePositions = { node0: pos0, node1: pos1 };
            } catch(e) {
                results.nodePosError = e.message;
            }
        }

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
