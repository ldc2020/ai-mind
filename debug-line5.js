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
        const results = {};

        // 1. Check for AssociativeLine plugin
        results.mindMapKeys = Object.keys(mm).filter(k =>
            k.toLowerCase().includes('assoc') ||
            k.toLowerCase().includes('plugin') ||
            k.toLowerCase().includes('line')
        );

        // 2. Check if there's a _plugins or plugins property
        results.hasPlugins = typeof mm._plugins !== 'undefined' || typeof mm.plugins !== 'undefined';
        if (mm._plugins) results.pluginsKeys = Object.keys(mm._plugins);
        if (mm.plugins) results.pluginsKeys2 = Object.keys(mm.plugins);

        // 3. Check opt for plugin config
        const optKeys = Object.keys(mm.opt || {});
        results.optPluginKeys = optKeys.filter(k =>
            k.toLowerCase().includes('plugin') ||
            k.toLowerCase().includes('assoc')
        );

        // 4. Check all renderer plugin-related properties
        const rKeys = Object.keys(r);
        results.rendererPluginKeys = rKeys.filter(k =>
            k.toLowerCase().includes('plugin') ||
            k.toLowerCase().includes('assoc')
        );

        // 5. Check if the AssociativeLine plugin is accessible anywhere
        // Search the window for any assoc-related constructors
        results.windowAssocKeys = [];
        for (const key of Object.keys(window)) {
            if (key.toLowerCase().includes('assoc') || key.toLowerCase().includes('associativeline')) {
                results.windowAssocKeys.push(key);
            }
        }

        // 6. Try to find the addLine function by checking all properties on mindMap recursively
        function findAddLine(obj, path, depth) {
            if (depth > 4) return null;
            if (!obj || typeof obj !== 'object') return null;
            for (const key of Object.keys(obj)) {
                if (key === 'addLine' && typeof obj[key] === 'function') {
                    return path + '.' + key;
                }
                if (key !== 'parent' && !key.startsWith('_')) {
                    const found = findAddLine(obj[key], path + '.' + key, depth + 1);
                    if (found) return found;
                }
            }
            return null;
        }
        results.addLinePath = findAddLine(mm, 'mindMap', 0);

        // 7. Check if ADD_ASSOCIATIVE_LINE command exists and what it requires
        const cmd = mm.command;
        const assocHandler = cmd.commands?.ADD_ASSOCIATIVE_LINE?.[0];
        results.handlerExists = !!assocHandler;
        if (assocHandler) {
            results.handlerName = assocHandler.name;
            // Try calling with no args to see what the default behavior is
            try {
                assocHandler();
                results.handlerNoArgs = 'called';
                results.optAfterNoArgs = mm.opt.associativeLines?.length || 0;
            } catch(e) {
                results.handlerNoArgs = 'error: ' + e.message;
            }
        }

        return results;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
