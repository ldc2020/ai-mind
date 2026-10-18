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
                const editor = createEditor({
                    selector: '#editor-container',
                    html: '<p>hello</p>',
                    mode: 'default',
                    config: {
                        customKeydown(editor, event) {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                editor.insertBreak();

                                if (window.wangEditor && window.wangEditor.SlateTransforms && window.wangEditor.SlateEditor) {
                                    const { SlateTransforms, SlateEditor } = window.wangEditor;
                                    const match = SlateEditor.above(editor, {
                                        match: n => SlateEditor.isBlock(editor, n)
                                    });
                                    if (match) {
                                        const [block, path] = match;
                                        if (block && block.type === 'paragraph') {
                                            const propsToRemove = Object.keys(block).filter(key => key !== 'type' && key !== 'children');
                                            if (propsToRemove.length > 0) {
                                                SlateTransforms.unsetNodes(editor, propsToRemove, { at: path });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                window.editor = editor;
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
    
    // Indent
    await page.evaluate(() => {
        window.editor.handleCommand('indent');
    });
    
    // Simulate Enter keydown
    await page.evaluate(() => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        document.querySelector('#editor-container').dispatchEvent(event);
    });
    
    let json = await page.evaluate(() => {
        return window.editor.children;
    });
    console.log('After Enter keydown event:', JSON.stringify(json, null, 2));

    await browser.close();
})();
