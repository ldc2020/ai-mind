const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const al = window.mindMap.associativeLine;
        const results = {};

        // 1. Check all properties and methods
        results.methods = [];
        results.properties = {};
        for (const key of Object.getOwnPropertyNames(al)) {
            const val = al[key];
            if (typeof val === 'function') {
                let src = '';
                try { src = val.toString().substring(0, 200); } catch(e) { src = 'cannot stringify'; }
                results.methods.push({
                    key,
                    len: val.length,
                    src: src,
                    isNative: src.includes('[native code]'),
                    isBound: src.includes('bound'),
                });
            } else {
                results.properties[key] = typeof val + ' -> ' + (val === null ? 'null' : JSON.stringify(val).substring(0, 100));
            }
        }

        // 2. Check proto chain
        results.protoMethods = [];
        let proto = Object.getPrototypeOf(al);
        let depth = 0;
        while (proto && depth < 5) {
            const names = Object.getOwnPropertyNames(proto).filter(k => k !== 'constructor' && typeof proto[k] === 'function');
            names.forEach(n => {
                results.protoMethods.push({
                    depth,
                    key: n,
                    len: proto[n].length,
                    native: proto[n].toString().includes('[native code]'),
                });
            });
            proto = Object.getPrototypeOf(proto);
            depth++;
        }

        // 3. Check if addLine is actually a different function with different name
        // Maybe it's shadowed by a non-function property
        const descriptor = Object.getOwnPropertyDescriptor(al, 'addLine');
        results.addLineDescriptor = descriptor ? {
            hasGetter: !!descriptor.get,
            hasSetter: !!descriptor.set,
            isValue: !!descriptor.value,
            type: typeof descriptor.value,
        } : 'no own descriptor (from proto)';

        // 4. Check what `opt.associativeLineInitPointsPosition` from/to format expects
        results.opt = {
            associativeLineInitPointsPosition: window.mindMap.opt?.associativeLineInitPointsPosition,
            beforeAssociativeLineConnection: typeof window.mindMap.opt?.beforeAssociativeLineConnection,
            beforeAssociativeLineDelete: typeof window.mindMap.opt?.beforeAssociativeLineDelete,
        };

        // 5. Check if the library expects data in a specific format when init
        // Check what associativeLineInit expects
        if (typeof al.associativeLineInit === 'function') {
            results.associativeLineInit = al.associativeLineInit.toString().substring(0, 300);
        } else {
            results.associativeLineInit = 'no method';
        }

        // 6. Check if there's a separate associativeLines container
        // The library might use associativeLines (not associativeLine) as the plugin
        results.allPlugins = Object.keys(window.mindMap).filter(k => k.toLowerCase().includes('assoc') || k.toLowerCase().includes('line'));

        // 7. Try calling renderAllLines with an empty lineList (to see its error handling)
        results.renderAllLinesType = typeof al.renderAllLines;

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
