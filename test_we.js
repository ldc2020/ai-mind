const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(
        <script src="https://unpkg.com/@wangeditor/editor@latest/dist/index.js"></script>
        <div id="editor"></div>
        <script>
            const { createEditor } = window.wangEditor;
            window.editor = createEditor({ selector: '#editor', html: '<p style="padding-left: 20px;" data-indent="1">hello</p>' });
        </script>
    );
    await new Promise(r => setTimeout(r, 1000));
    const keys = await page.evaluate(() => Object.keys(window.wangEditor));
    const slateKeys = await page.evaluate(() => window.wangEditor.SlateTransforms ? Object.keys(window.wangEditor.SlateTransforms) : 'No SlateTransforms');
    const slateEditorKeys = await page.evaluate(() => window.wangEditor.SlateEditor ? Object.keys(window.wangEditor.SlateEditor) : 'No SlateEditor');
    const editorMethods = await page.evaluate(() => Object.keys(window.editor));
    const nodes = await page.evaluate(() => window.editor.children);
    console.log('wangEditor keys:', keys);
    console.log('SlateTransforms:', slateKeys);
    console.log('SlateEditor:', slateEditorKeys);
    console.log('nodes:', JSON.stringify(nodes, null, 2));
    await browser.close();
})();
