const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const info = await page.evaluate(() => {
        const info = {};
        const mm = window.mindMap;
        const r = mm.renderer;
        const node = Object.values(r.nodeCache)[0];

        // 1. Check lineDraw
        info.lineDrawType = typeof node.lineDraw;
        if (node.lineDraw && typeof node.lineDraw === 'object') {
            info.lineDrawKeys = Object.keys(node.lineDraw);
            // Check methods
            const lineMethods = [];
            let obj = node.lineDraw;
            while (obj && obj !== Object.prototype) {
                Object.getOwnPropertyNames(obj).forEach(p => {
                    if (typeof obj[p] === 'function') lineMethods.push(p);
                });
                obj = Object.getPrototypeOf(obj);
            }
            info.lineDrawMethods = lineMethods;
        }

        // 2. Check nodeDraw
        info.nodeDrawType = typeof node.nodeDraw;
        if (node.nodeDraw && typeof node.nodeDraw === 'object') {
            const methods = [];
            let obj = node.nodeDraw;
            while (obj && obj !== Object.prototype) {
                Object.getOwnPropertyNames(obj).forEach(p => {
                    if (typeof obj[p] === 'function') methods.push(p);
                });
                obj = Object.getPrototypeOf(obj);
            }
            info.nodeDrawMethods = methods;
        }

        // 3. Check what draw is
        info.drawType = typeof node.draw;
        if (node.draw && typeof node.draw === 'object') {
            // Check what classes are in the draw hierarchy
            const drawMethods = new Set();
            let obj = node.draw;
            while (obj && obj !== Object.prototype) {
                const names = Object.getOwnPropertyNames(obj);
                names.forEach(n => {
                    if (typeof obj[n] === 'function') drawMethods.add(n);
                });
                obj = Object.getPrototypeOf(obj);
            }
            info.drawMethods = Array.from(drawMethods).filter(m =>
                m.toLowerCase().includes('line') ||
                m.toLowerCase().includes('assoc')
            );
        }

        // 4. Check window.mindMap properties for line-related functions
        info.mindMapLineMethods = [];
        let mmObj = mm;
        while (mmObj && mmObj !== Object.prototype) {
            Object.getOwnPropertyNames(mmObj).forEach(p => {
                if (typeof mmObj[p] === 'function' &&
                    (p.toLowerCase().includes('line') || p.toLowerCase().includes('assoc'))) {
                    info.mindMapLineMethods.push(p);
                }
            });
            mmObj = Object.getPrototypeOf(mmObj);
        }

        // 5. Check the command registration - what is addLine bound to?
        const cmd = mm.command;
        if (cmd.commands && cmd.commands.ADD_ASSOCIATIVE_LINE) {
            info.assocCmdHandlers = cmd.commands.ADD_ASSOCIATIVE_LINE.map(fn => {
                // Check the function name
                return {
                    name: fn.name || 'anonymous',
                    boundTo: fn.bind ? 'has bind' : 'no bind info',
                };
            });
        }

        return info;
    });

    console.log(JSON.stringify(info, null, 2));
    await browser.close();
})();
