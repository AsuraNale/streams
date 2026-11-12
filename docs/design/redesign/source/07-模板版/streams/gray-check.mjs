// 核单线黑白的截图有没有彩色（左上角的标除外）。用法：node streams/gray-check.mjs [主题名，默认 单线黑白]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/you/dev/streams/desktop/package.json');
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const theme = process.argv[2] || '单线黑白';
const list = JSON.parse(fs.readFileSync(path.join(root, '画面清单.json'), 'utf8')).filter(p => p.theme === theme);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(root, list[0].entry)).href);
let bad = 0;
for (const p of list) {
  const b64 = fs.readFileSync(path.join(root, p.png)).toString('base64');
  const r = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, tot = 0;
    for (let y = 0; y < c.height; y++) for (let k = 0; k < c.width; k++) {
      if (k < 260 && y < 110) continue; tot++;
      const i = (y * c.width + k) * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 24) n++;
    }
    return { n, tot };
  }, 'data:image/png;base64,' + b64);
  const pct = r.n / r.tot * 100; if (pct >= 0.05) bad++;
  console.log(theme, p.name, r.n + ' / ' + r.tot, pct.toFixed(4) + '%', pct < 0.05 ? '过' : '有彩色');
}
await browser.close();
process.exit(bad ? 1 : 0);
