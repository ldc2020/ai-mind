const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
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
                window.editor = createEditor({
                    selector: '#editor-container',
                    html: '<p>hello</p>',
                    mode: 'default'
                });
            </script>
        </body>
        </html>
    `);
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Focus and select all
    await page.evaluate(() => {
        window.editor.focus();
        window.editor.select({
            anchor: { path: [0, 0], offset: 5 },
            focus: { path: [0, 0], offset: 5 }
        });
    });
    
    // Indent by directly setting node props
    await page.evaluate(() => {
        const { SlateTransforms } = window.wangEditor;
        SlateTransforms.setNodes(window.editor, { indent: '2em' });
    });
    
    // Get JSON
    let json = await page.evaluate(() => {
        return window.editor.children;
    });
    console.log('After indent:', JSON.stringify(json, null, 2));
    
    // Press Enter
    await page.evaluate(() => {
        window.editor.insertBreak();
    });
    
    // Get JSON
    json = await page.evaluate(() => {
        return window.editor.children;
    });
    console.log('After insertBreak:', JSON.stringify(json, null, 2));

    await page.evaluate(() => {
        const { SlateTransforms, SlateEditor } = window.wangEditor;
        const match = SlateEditor.above(window.editor, {
            match: n => SlateEditor.isBlock(window.editor, n)
        });
        if (match) {
            const [block, path] = match;
            if (block && block.type === 'paragraph') {
                const propsToRemove = Object.keys(block).filter(key => key !== 'type' && key !== 'children');
                if (propsToRemove.length > 0) {
                    SlateTransforms.unsetNodes(window.editor, propsToRemove, { at: path });
                }
            }
        }
    });

    json = await page.evaluate(() => {
        return window.editor.children;
    });
    console.log('After unsetNodes:', JSON.stringify(json, null, 2));

    await browser.close();
})();
