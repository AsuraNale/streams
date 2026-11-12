// 核「界面里没有彩色」：把无编号截图画到 canvas，数明显带彩的像素（标的区域除外）。
// 用法：node tools/gray-check.mjs [目录，默认 06-单线黑白融合稿] [页面编号…，默认 pages.json 里 checked 的]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/you/dev/streams/desktop/package.json');
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, process.argv[2] || '06-单线黑白融合稿');
const all = JSON.parse(fs.readFileSync(path.join(dir, 'pages.json'), 'utf8'));
const want = process.argv.slice(3);
const list = all.filter(p => want.length ? want.includes(p.id) : (p.checked ?? true));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(dir, list[0].html)).href);
let bad = 0;
for (const p of list) {
  const file = path.join(dir, p.png.replace('截图/', '截图-无编号/'));
  const b64 = fs.readFileSync(file).toString('base64');
  const r = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, tot = 0;
    for (let y = 0; y < c.height; y++) for (let k = 0; k < c.width; k++) {
      if (k < 240 && y < 100) continue; tot++;
      const i = (y * c.width + k) * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 24) n++;
    }
    return { n, tot };
  }, 'data:image/png;base64,' + b64);
  const pct = r.n / r.tot * 100; if (pct >= 0.05) bad++;
  console.log(p.id, r.n + ' / ' + r.tot, pct.toFixed(4) + '%', pct < 0.05 ? '过' : '有彩色');
}
await browser.close();
process.exit(bad ? 1 : 0);
