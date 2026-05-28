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

        // 1. Check all properties and methods - avoid circular refs in JSON
        results.methods = [];
        results.properties = {};
        for (const key of Object.getOwnPropertyNames(al)) {
            const val = al[key];
            if (typeof val === 'function') {
                let src = '';
                try { src = val.toString().substring(0, 300); } catch(e) { src = 'cannot stringify'; }
                results.methods.push({
                    key,
                    len: val.length,
                    isNative: src.includes('[native code]'),
                    isBound: /^\s*function\s*\(/.test(src) === false && src.length < 30,
                });
            } else if (key === 'lineList') {
                results.properties[key] = 'Array(' + (val ? val.length : 0) + ')';
            } else if (key === 'creatingLine') {
                results.properties[key] = val ? 'SVGElement' : 'null';
            } else if (key === 'creatingStartNode') {
                results.properties[key] = val ? val.getData('uid') : 'null';
            } else if (typeof val !== 'object' || val === null) {
                results.properties[key] = '' + val;
            } else {
                results.properties[key] = typeof val + '(' + val.constructor.name + ')';
            }
        }

        // 2. Check proto chain
        results.protoMethods = [];
        let proto = Object.getPrototypeOf(al);
        let depth = 0;
        while (proto && depth < 5) {
            const names = Object.getOwnPropertyNames(proto).filter(k => k !== 'constructor' && typeof proto[k] === 'function');
            names.forEach(n => {
                let src = '';
                try { src = proto[n].toString().substring(0, 300); } catch(e) { src = 'error'; }
                results.protoMethods.push({
                    depth,
                    key: n,
                    len: proto[n].length,
                    source: src,
                });
            });
            proto = Object.getPrototypeOf(proto);
            depth++;
        }

        // 3. Check addLine descriptor
        const descriptor = Object.getOwnPropertyDescriptor(al, 'addLine');
        results.addLineDescriptor = descriptor ? {
            hasGetter: !!descriptor.get,
            hasSetter: !!descriptor.set,
            isValue: !!descriptor.value,
            type: typeof descriptor.value,
        } : 'no own descriptor';

        // 4. Check what renderAllLines does
        if (typeof al.renderAllLines === 'function') {
            results.renderAllLinesSource = al.renderAllLines.toString().substring(0, 500);
        }

        // 5. Check addLine from proto chain
        const addLineFromProto = results.protoMethods.find(m => m.key === 'addLine');
        if (addLineFromProto) {
            results.addLineMethod = addLineFromProto;
        }

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
