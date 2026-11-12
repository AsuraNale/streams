// 自查：用到的 class 是不是都来自丽芙的模板（或以 st- 开头并在补充样式里有定义）；措辞有没有口语残留。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/you/dev/streams/desktop/package.json');
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const lib = walk(path.join(root, 'shared')).concat(walk(path.join(root, 'templates'))).filter(f => /\.(css|js)$/.test(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const own = fs.readFileSync(path.join(root, 'streams', 'streams.css'), 'utf8');
const list = JSON.parse(fs.readFileSync(path.join(root, '画面清单.json'), 'utf8'));
const BANNED = ['谁定的', '改一下', '拟一下', '不用管', '再等等', '算了', '跑一轮', '在跑', '没过关', '放进待看', '等打分', '你拍板', '去掉', '不用动', '聊着建', '这一轮', '点了才'];
const NEED = ['立即运行', '待确认', '提出修改', '未通过筛选', '追踪要求'];
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const classes = new Set(); let text = ''; const errors = [];
page.on('pageerror', e => errors.push(String(e)));
for (const p of list) {
  await page.goto(pathToFileURL(path.join(root, p.entry)).href + '?screen=' + p.screen);
  const r = await page.evaluate(() => ({ cls: [...new Set([...document.querySelectorAll('.app, .app *')].flatMap(e => [...e.classList]))], text: document.querySelector('.app').innerText }));
  r.cls.forEach(c => classes.add(c)); if (p.theme === '单线黑白') text += r.text + '\n';
}
await browser.close();
const bad = [...classes].filter(c => c.startsWith('st-') ? !own.includes('.' + c) : !lib.includes(c));
console.log('class 共', classes.size, '个；其中 st- 开头', [...classes].filter(c => c.startsWith('st-')).join(' '));
console.log('不在模板里的 class：', bad.length ? bad.join(' ') : '无');
console.log('口语词命中：', BANNED.filter(w => text.includes(w)).join(' ') || '无', '｜新说法缺：', NEED.filter(w => !text.includes(w)).join(' ') || '无');
console.log('补充样式行数：', own.split('\n').length, '｜页面报错：', errors.length ? errors.join(' | ') : '无');
process.exit(bad.length || errors.length ? 1 : 0);
