const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
            <link href="https://unpkg.com/@wangeditor/editor@latest/dist/css/style.css" rel="stylesheet">
            <script src="https://unpkg.com/@wangeditor/editor@latest/dist/index.js"></script>
        </head>
        <body>
            <div id="editor-container"></div>
            <script>
                const { createEditor } = window.wangEditor;
                const editor = createEditor({
                    selector: '#editor-container',
                    html: '<p>hello</p>',
                    mode: 'default',
                    config: {
                        customKeydown(editor, event) {
                            console.log('customKeydown triggered!');
                        }
                    }
                });
                window.editor = editor;
            </script>
        </body>
        </html>
    `);
    
    await new Promise(r => setTimeout(r, 2000));
    
    await page.evaluate(() => {
        window.editor.focus();
        window.editor.select({
            anchor: { path: [0, 0], offset: 5 },
            focus: { path: [0, 0], offset: 5 }
        });
    });
    
    await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        document.querySelector('#editor-container').dispatchEvent(event);
    });
    
    await browser.close();
})();
