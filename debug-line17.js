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

        // Get full renderAllLines source
        if (typeof proto.renderAllLines === 'function') {
            results.renderAllLines = proto.renderAllLines.toString();
        }

        // Get the removeLine method too (for understanding how to remove/update lines)
        if (typeof proto.removeLine === 'function') {
            results.removeLine = proto.removeLine.toString();
        }

        return results;
    });

    console.log('=== renderAllLines ===');
    console.log(result.renderAllLines);
    console.log('=== removeLine ===');
    console.log(result.removeLine);
    await browser.close();
})();
