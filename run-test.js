const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on("console", msg => console.log("BROWSER:", msg.text()));
  await page.goto("http://localhost:3000");
  await page.waitForSelector("input[type=file]");
  const input = await page.$("input[type=file]");
  // We need a dummy pdf file
  const fs = require('fs');
  fs.writeFileSync('dummy.pdf', '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000213 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n264\n%%EOF');
  await input.uploadFile("dummy.pdf");
  
  // Wait for it to load
  await new Promise(r => setTimeout(r, 2000));
  
  // Add a text block
  const btn = await page.$("button[title='Add Text (T)']");
  if (btn) await btn.click();
  
  // Click on the page to place text
  await page.mouse.click(100, 100);
  
  // Type something
  await page.keyboard.type("Hello");
  
  // Select the block (it should be focused)
  // Wait for toolbar to appear
  await new Promise(r => setTimeout(r, 1000));
  
  // Select all text
  await page.keyboard.down("Meta");
  await page.keyboard.press("a");
  await page.keyboard.up("Meta");
  
  // Change font to Permanent Marker
  await page.evaluate(() => {
    document.execCommand('fontName', false, 'Permanent Marker');
  });
  
  // Save
  const saveBtn = await page.$("button[title='Save changes (Ctrl+S)']");
  if (saveBtn) await saveBtn.click();
  
  await new Promise(r => setTimeout(r, 4000));
  await browser.close();
})();
