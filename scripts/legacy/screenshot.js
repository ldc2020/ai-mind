const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8001/');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({path: 'test_screen.png'});
  await browser.close();
})();