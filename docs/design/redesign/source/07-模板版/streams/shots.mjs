// 截图：四套主题 × 八个画面 → 截图/<主题>/<画面>.png；另截丽芙四个原模板 → 参考/。用法：node streams/shots.mjs [画面…]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/you/dev/streams/desktop/package.json');
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEMES = [['精密国际主义', '精密国际主义-第十一轮'], ['澄明玻璃', '澄明玻璃-第十一轮'], ['研究对话', '研究对话-第十一轮'], ['单线黑白', '单线黑白-第十二轮']];
const SCREENS = [['firstrun', '首次打开'], ['connect', '连接选择'], ['shelf', '库架'], ['agent', '主Agent'], ['new', '新建库'], ['inbox', '待看'], ['empty', '待看空着时'], ['run', '运行与排队'], ['expired', '连接出问题'], ['library', '资料库'], ['graph', '图谱'], ['edit', '编辑笔记'], ['header', '缺少文件头'], ['ask', '问库'], ['sources', '来源与要求'], ['advanced', '高级设置'], ['remove', '移除该库'], ['settings', '设置'], ['apikey', '输入API-key'], ['licenses', '许可证与致谢'], ['reader', '阅读窗口']];
const only = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-lcd-text'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1 });
const list = [];
for (const [name, folder] of THEMES) {
  fs.mkdirSync(path.join(root, '截图', name), { recursive: true });
  for (const [id, cn] of SCREENS) {
    const rel = '截图/' + name + '/' + cn + '.png';
    list.push({ theme: name, entry: 'templates/' + folder + '/index.html', screen: id, name: cn === '输入API-key' ? '输入 API key' : cn, png: rel });
    if (only.length && !only.includes(id)) continue;
    await page.goto(pathToFileURL(path.join(root, 'templates', folder, 'index.html')).href + '?screen=' + id);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(root, rel), clip: await page.locator('.app').boundingBox() }); // 用整页截再裁：对话框在最上层，也要截进来
  }
}
fs.writeFileSync(path.join(root, '画面清单.json'), JSON.stringify(list, null, 2));
if (!only.length || only.includes('ref')) {
  const ref = 'C:/Users/you/Desktop/独立Agent-赞妮/UI设计/工作台/templates';
  fs.mkdirSync(path.join(root, '参考'), { recursive: true });
  for (const [name, folder] of THEMES) {
    await page.goto(pathToFileURL(path.join(ref, folder, 'index.html')).href);
    await page.waitForTimeout(400);
    await page.locator('.app').screenshot({ path: path.join(root, '参考', '丽芙原模板-' + name + '.png') });
  }
}
await browser.close();
console.log('截了', only.length ? only.join(' ') : '全部');
