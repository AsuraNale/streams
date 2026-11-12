// 自查：13 个补的画面各自该有的字是不是都在（按单线黑白入口取 body 的文字，含对话框）。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/you/dev/streams/desktop/package.json');
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEED = {
  firstrun: ['你想追踪什么内容？', '更换连接', '手动创建'],
  connect: ['连接你电脑上的 Claude Code', '连接你电脑上的 Codex', '输入 API key', '前往登录', '使用此连接'],
  new: ['库名称', '追踪要求', '严格程度', '使用预设来源包', '仅创建', '创建并运行'],
  empty: ['暂无待看内容', '上次运行', '最近收藏'],
  expired: ['登录已过期', '前往登录', '已登录，重试', '更换连接方式'],
  graph: ['图谱', '记忆评测'],
  edit: ['编辑笔记', '插入链接', '保存'],
  header: ['缺少文件头', '全部写入', '建议的文件头'],
  advanced: ['评分环节', '提示词', '通过阈值', '校验规则', '单条测试', '变更记录', '操作来源', '重建索引', '移除该库'],
  apikey: ['接口地址', '删除 API key'],
  licenses: ['MIT', 'Noto Sans SC', 'Noto Serif SC'],
  reader: ['返回条目', '阅读模式', '原网页', '在浏览器中打开'],
  remove: ['文件夹及其中的文件不会被删除'],
};
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 1440, height: 940 } });
let bad = 0;
for (const [id, list] of Object.entries(NEED)) {
  await p.goto(pathToFileURL(path.join(root, 'templates/单线黑白-第十二轮/index.html')).href + '?screen=' + id);
  const t = await p.evaluate(() => document.body.innerText);
  const miss = list.filter(w => !t.includes(w));
  if (miss.length) { bad++; console.log(id, '缺：', miss.join(' ｜ ')); }
}
await b.close();
console.log(bad ? '有缺' : '13 个画面的字都在');
process.exit(bad ? 1 : 0);
