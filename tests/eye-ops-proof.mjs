import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto('https://minemysol.nahalabs.co.za/eye', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('[data-testid="forecast-card"]', { timeout: 30000 });
const cards = {};
for (const id of ['forecast-card','reports-card','upload-card','board-card','fixes-card']) cards[id] = !!(await page.$(`[data-testid="${id}"]`));
console.log('CARDS', JSON.stringify(cards));
// forecast numbers
const ftxt = await page.$eval('[data-testid="forecast-card"]', el => el.innerText.replace(/\n/g, ' | '));
console.log('FORECAST:', ftxt);
// board rows
const btxt = await page.$eval('[data-testid="board-card"]', el => el.innerText.replace(/\n/g, ' | '));
console.log('BOARD:', btxt.slice(0, 500));
// open the 05:00 handover report
const btns = await page.$$('[data-testid="reports-card"] button');
await btns[0].click();
await new Promise(r => setTimeout(r, 400));
const pre = await page.$eval('[data-testid="reports-card"] pre', el => el.innerText);
console.log('HANDOVER:\n' + pre);
// wa.me link present
const href = await page.$eval('[data-testid="reports-card"] a', el => el.getAttribute('href'));
console.log('WA_LINK:', href.slice(0, 80), '...len', href.length);
// screenshot the reports card area
const rc = await page.$('[data-testid="reports-card"]');
await rc.screenshot({ path: '/downloads/mms-ops-handover.png' });
// log a suggested fix
const fixBtns = await page.$$('[data-testid="fixes-card"] button');
for (const b of fixBtns) { const t = await b.evaluate(e => e.innerText); if (t.includes('Log this fix')) { await b.click(); break; } }
await new Promise(r => setTimeout(r, 300));
const fixTxt = await page.$eval('[data-testid="fixes-card"]', el => el.innerText.replace(/\n/g, ' | '));
console.log('FIXES:', fixTxt.slice(0, 400));
// upload a photo (generate one) into the file input
import { writeFileSync } from 'fs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8z8DwnwEKmBgYGKkAAAbOAgH0vV5YAAAAAElFTkSuQmCC', 'base64');
writeFileSync('/tmp/clip.png', png);
const input = await page.$('[data-testid="upload-card"] input[type=file]');
await input.uploadFile('/tmp/clip.png');
await new Promise(r => setTimeout(r, 500));
const upTxt = await page.$eval('[data-testid="upload-card"]', el => el.innerText.replace(/\n/g, ' | '));
console.log('UPLOAD:', upTxt.slice(0, 300));
const uc = await page.$('[data-testid="upload-card"]');
await uc.screenshot({ path: '/downloads/mms-ops-upload.png' });
// forecast + board screenshots
await (await page.$('[data-testid="forecast-card"]')).screenshot({ path: '/downloads/mms-ops-forecast.png' });
await (await page.$('[data-testid="board-card"]')).screenshot({ path: '/downloads/mms-ops-board.png' });
await (await page.$('[data-testid="fixes-card"]')).screenshot({ path: '/downloads/mms-ops-fixes.png' });
await browser.close();
console.log('DONE');
