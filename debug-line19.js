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

        // Get full drawLine source
        if (typeof proto.drawLine === 'function') {
            results.drawLineSource = proto.drawLine.toString();
        }

        return results;
    });

    console.log(result.drawLineSource);
    await browser.close();
})();
