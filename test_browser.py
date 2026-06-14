import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        page.on("console", lambda msg: print(f"Console: {msg.type} {msg.text}"))
        page.on("pageerror", lambda err: print(f"Error: {err}"))
        
        await page.goto("http://127.0.0.1:8002")
        await asyncio.sleep(2)
        
        html_out = await page.evaluate('''() => {
            openModal('modal-note');
            initNoteEditorIfNeeded();
            wangEditorInstance.setHtml("<p>Hello</p>");
            return wangEditorInstance.getHtml();
        }''')
        print("Editor HTML:", html_out)
        
        await browser.close()

asyncio.run(main())
