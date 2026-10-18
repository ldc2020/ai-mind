import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False) # See if there's any visual cue
        page = await browser.new_page()
        
        page.on("console", lambda msg: print(f"Console: {msg.type} {msg.text}"))
        page.on("pageerror", lambda err: print(f"Error: {err}"))
        
        await page.goto("http://127.0.0.1:8002")
        await asyncio.sleep(2)
        
        # Click the center node (assuming there's a node to click)
        # We can just call openNoteEditor with a dummy node
        await page.evaluate('''() => {
            const dummyNode = {
                getData: () => "<p>Existing Note Content</p>"
            };
            // Note: we can't easily call mindMap.execCommand from here if mindMap is not global
            // But we can trigger the UI:
            openModal('modal-note');
            initNoteEditorIfNeeded();
            wangEditorInstance.setHtml("<p>Existing Note Content</p>");
        }''')
        await asyncio.sleep(2)
        
        # Try to click the editor and type
        try:
            await page.click('#editor-container .w-e-text-container')
            await page.keyboard.type(" New Text")
        except Exception as e:
            print("Failed to type:", e)
        
        html_out = await page.evaluate('''() => {
            return wangEditorInstance.getHtml();
        }''')
        print("Editor HTML:", html_out)
        
        await browser.close()

asyncio.run(main())
