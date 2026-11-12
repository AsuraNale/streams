// 给每张页面稿截图：截图/（带功能编号）和 截图-无编号/。同时按现状包第八节的数法数每张稿上能点的东西。
// 用法：node tools/shots.mjs   （需要本机有 Edge；playwright-core 借用流息仓库里装好的那份）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/you/dev/streams/desktop/package.json');
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, process.argv[2] || '03-页面稿');
const pages = JSON.parse(fs.readFileSync(path.join(dir, 'pages.json'), 'utf8'));
for (const d of ['截图', '截图-无编号']) fs.mkdirSync(path.join(dir, d), { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-lcd-text'] }) // 关掉屏幕字体的彩色次像素，截图里的字才是纯灰;
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const counts = [];
for (const p of pages) {
  await page.goto(pathToFileURL(path.join(dir, p.html)).href);
  const frame = page.locator('.frame');
  await frame.screenshot({ path: path.join(dir, p.png) });
  const n = await page.evaluate(() => {
    const sel = 'button,a[href],input,textarea,select';
    const all = [...document.querySelectorAll('.frame ' + sel.split(',').join(',.frame '))];
    const shown = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return shown.filter(e => !e.parentElement.closest(sel)).length;
  });
  const size = await frame.boundingBox();
  counts.push({ id: p.id, name: p.name, clickable: n, height: Math.round(size.height) });
  await page.evaluate(() => document.body.classList.remove('tags'));
  await frame.screenshot({ path: path.join(dir, p.png.replace('截图/', '截图-无编号/')) });
}
await browser.close();
fs.writeFileSync(path.join(dir, 'clickable.json'), JSON.stringify(counts, null, 2));
console.table(counts);
