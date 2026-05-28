const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));

    await page.goto('http://127.0.0.1:8001', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
        const results = {};
        const proto = Object.getPrototypeOf(window.mindMap.associativeLine);

        // Get full addLine source
        if (typeof proto.addLine === 'function') {
            results.addLineSource = proto.addLine.toString();
        }

        // Get full completeCreateLine source
        if (typeof proto.completeCreateLine === 'function') {
            results.completeCreateLineSource = proto.completeCreateLine.toString();
        }

        return results;
    });

    console.log(result.addLineSource);
    console.log('=== COMPLETE CREATE LINE ===');
    console.log(result.completeCreateLineSource);
    await browser.close();
})();
