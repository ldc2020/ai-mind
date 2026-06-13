const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Enable console log capture
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://127.0.0.1:8001');
    
    // Override prompt
    await page.evaluate(() => {
        window.prompt = () => "test-folder-ui";
    });

    console.log("Clicking btn-new...");
    await page.click('#btn-new');
    
    await new Promise(r => setTimeout(r, 500));
    
    console.log("Clicking new-folder...");
    await page.click('[data-action="new-folder"]');
    
    await new Promise(r => setTimeout(r, 1000));
    
    const tree = await page.evaluate(async () => {
        const res = await fetch('/api/tree');
        const data = await res.json();
        return data.tree;
    });
    
    console.log("Tree:", JSON.stringify(tree, null, 2));
    
    await browser.close();
})();
