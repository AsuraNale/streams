// 生成：03-页面稿/*.html、页面清单、01-功能地图.md、02-主要流程.md。
// 用法：node tools/build.mjs    （在「流息-UX重设计」文件夹里跑）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageHtml } from './kit.mjs';
import { pagesA } from './pages-a.mjs';
import { pagesB } from './pages-b.mjs';
import { FMAP, NEW, CONCEPTS } from './fmap.mjs';
import { FLOWS } from './flows.mjs';
import { TERMS, formal } from './wording.mjs';
import { LINE_CSS, linePage } from './line.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '03-页面稿');
fs.mkdirSync(out, { recursive: true });
const pages = [...pagesA, ...pagesB];
const problems = [];

// —— 1. 页面稿 ——
const fOnPage = {}; // 编号 → [页面 id]
const frames = {}; // 页面 id → frame 部分的 html
for (const [i, p] of pages.entries()) {
  p.note = formal(p.note);
  const html = pageHtml(p, pages[i - 1], pages[i + 1]);
  frames[p.id] = html.slice(html.indexOf('<div class="frame'), html.lastIndexOf('<script>'));
  fs.writeFileSync(path.join(out, p.file), html);
  const ids = new Set();
  for (const m of html.matchAll(/data-f="([^"]+)"/g)) m[1].split(/\s+/).forEach(x => ids.add(x));
  for (const id of ids) (fOnPage[id] ||= []).push(p.id);
  // 每个可点元素自身带 data-f
  for (const m of html.matchAll(/<(button|a|input|textarea|select)\b[^>]*>/g)) {
    if (m[1] === 'a' && !/\bhref=/.test(m[0])) continue;
    if (!/\bdata-f="/.test(m[0])) problems.push(`${p.id} 有可点元素没标编号：${m[0].slice(0, 80)}`);
  }
}
const known = new Set([...FMAP.map(r => r[0]), ...NEW.map(r => r[0])]);
for (const id of Object.keys(fOnPage)) if (!known.has(id)) problems.push(`页面稿用了功能地图里没有的编号：${id}（${fOnPage[id]}）`);

const listMd = `# 页面清单（${pages.length} 张）

每张两个文件：能单独打开的 HTML（页面上的小标签 = 功能地图里的编号，右上角可以隐藏）和一张 PNG 截图（\`截图/\` 带编号，\`截图-无编号/\` 不带）。
稿子画的是默认主题「精密国际主义」浅色、中文，主窗口 1440×960，阅读窗口 1100×860。

| 编号 | 页面 / 对话框 / 窗口 | HTML | 截图 | 这张稿上的功能编号 |
|---|---|---|---|---|
${pages.map(p => `| ${p.id} | ${p.name} | [${p.file}](${encodeURI(p.file)}) | [截图/${p.file.replace('.html', '.png')}](${encodeURI('截图/' + p.file.replace('.html', '.png'))}) | ${Object.keys(fOnPage).filter(k => fOnPage[k].includes(p.id)).sort().join(' ')} |`).join('\n')}
`;
fs.writeFileSync(path.join(out, '页面清单.md'), listMd);
fs.writeFileSync(path.join(out, 'pages.json'), JSON.stringify(pages.map(p => ({ id: p.id, name: p.name, html: p.file, png: '截图/' + p.file.replace('.html', '.png') })), null, 2));

// —— 2. 功能地图 ——
const where = r => {
  const on = fOnPage[r[0]] || [];
  const kind = r[2].slice(0, 2);
  if (kind === '砍') { if (on.length) problems.push(`${r[0]} 标了砍，却出现在 ${on}`); return '—'; }
  if (r[5]) return '不在窗口里';
  if (!on.length) { if (kind !== '合并') problems.push(`${r[0]} 是「${r[2]}」，但没有一张稿标到它`); return '—'; }
  return on.join(' ');
};
const count = k => FMAP.filter(r => r[2].startsWith(k)).length;
if (FMAP.length !== 70) problems.push(`功能表不是 70 行：${FMAP.length}`);
if (CONCEPTS.length !== 29) problems.push(`概念表不是 29 行：${CONCEPTS.length}`);
const cc = k => CONCEPTS.filter(r => r[1].startsWith(k)).length;

const fmapMd = `# 01 · 新的功能地图

拿现状说明书里的功能清单（F01–F70）逐行标：**保留 / 合并（并进哪一行）/ 砍 / 改**；后面是新增的功能（N01–N${String(NEW.length).padStart(2, '0')}）和概念表。

- 70 行里：保留 ${count('保留')}、改 ${count('改')}、合并 ${count('合并')}、砍 ${count('砍')}。
- 「碰硬约束」一列：**没碰** = 验收标准 V1–V12 和 维护者 明定的事都没动；括号里写的是它动了哪个「维护者 定过的形式」（不是硬约束，但要他再点头）和对应「要 维护者 定的事」的第几条。**碰** 的只有一行（F20 → V6 的措辞）。
- 「在哪张稿」一列：页面稿（\`03-页面稿/\`）里标了这个编号的页面；这一列是脚本按稿子里的标注填的。

## 一、功能表（F01–F70）

| 编号 | 界面说法（现在） | 处置 | 新设计里怎么样 | 碰硬约束 | 在哪张稿 |
|---|---|---|---|---|---|
${FMAP.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${formal(r[3])} | ${r[4]} | ${where(r)} |`).join('\n')}

## 二、新增（N01–N${String(NEW.length).padStart(2, '0')}）

新增的每一条都对着一条观察或一件任务；没有为了「更丰富」加的东西。

| 编号 | 名字 | 做什么 | 针对什么 | 在哪张稿 |
|---|---|---|---|---|
${NEW.map(r => `| ${r[0]} | ${formal(r[1])} | ${formal(r[2])} | ${r[3]} | ${(fOnPage[r[0]] || ['不在窗口里']).join(' ')} |`).join('\n')}

## 三、概念表（29 个）

用户要懂的概念：保留 ${cc('保留')} 个、合并 ${cc('合并')} 个、不再让用户看见 ${cc('不再')} 个。「不再让用户看见」不是删功能，是平时不用懂它。

| 概念（现在的说法） | 处置 | 说明 |
|---|---|---|
${CONCEPTS.map(r => `| ${r[0]} | ${r[1]} | ${formal(r[2] || '—')} |`).join('\n')}

平时用得到的概念剩 14 个：库、来源、要求、严格程度、主题、一轮、定时、待看、收藏 / 放弃 / 稍后、资料库、问库（出处）、主 Agent、提议（等你决定的事）、连接（套餐用量）。其余的要么只在出事时出现（五种抓取状态、未通过核验、面向 AI 的指令、排队），要么在高级设置和设置里（单次运行上限、提示词、核验模型、变更记录），要么只在新建库时出现（预设来源包）。界面上的新说法见 \`05-措辞规范.md\`。

## 四、同一个动作的入口：现在 → 新设计

| 动作 | 现在几处 | 新设计几处 | 新设计的入口 |
|---|---|---|---|
| 跑一轮 | 6 | 4 | 库页头「立即运行」；托盘「立即运行」；横幅「已登录，重试」；定时 / 补运行（自动）。建库后的首次运行自动开始，不算入口 |
| 改要求 | 3 | 2 | 来源与要求的「追踪要求」文本框；说一句（问库输入框或「主 Agent」，出提议确认） |
| 改每轮上限 | 4 | 2 | 来源与要求的「定时与上限」一行；说一句（出提议确认） |
| 新建库 | 6 | 3 | 左栏「＋ 新建库」（进去以后两种做法：「由主 Agent 生成」/「手动填写」）；库架页头「＋ 新建库」和库架最后一张卡（库架照 维护者 11-11 的决定留着）。首次打开那一屏是同一页 |
| 看还有什么等我定 | 5 | 1 | 右栏「等你决定」（标签上的数字是它自己的一部分；提议出生的那段对话里也看得到它） |
| 收藏 | 3 | 2 | 待看卡「收藏」；按 C |
| 打开原文 | 4 | 2 | 标题 /「查看原文」→ 阅读窗口；阅读窗口和「更多」里的「在浏览器中打开」 |
| 在资源管理器中显示 | 3 | 3 | 资料库「更多」；右栏「文件」；来源与要求 · 「高级设置」 |
| 复制诊断信息 | 3 | 1 | 设置 · 关于 · 高级 |

## 五、措辞

界面上的说法已按 维护者 11-11 的要求从口语改成正式行文。行文原则、新旧对照（含英文，要进中英两套字典）见 \`05-措辞规范.md\`。本文「新设计里怎么样」一列引用按钮名、标签名时用的是新说法；「界面说法（现在）」一列是现在应用里的原话，没有动。
`;
fs.writeFileSync(path.join(root, '01-功能地图.md'), fmapMd);

// —— 3. 主要流程 ——
const sum = (f, i) => f.steps.reduce((a, s) => a + s[i], 0);
const tot = f => [f.steps.length, sum(f, 3), sum(f, 4), sum(f, 5), sum(f, 6)];
const flowsMd = `# 02 · 新的主要流程

口径和现状的案例流程一样：**点击** = 鼠标点击，键盘快捷键和回车每按一次也算 1，滚动不算；**输入** = 要打字的地方，每个输入框算 1；**决定** = 要在几个选项里挑一个、或要自己想内容的地方；只是「看一眼、往下走」不算。**模型调用** = 这一步流息真的调了几次模型。
「现在」的数字抄自现状案例流程的 13.1 表；「新设计」的数字是下面每张步骤表逐列相加（脚本算的）。每条流程后面写了它走的是哪几张页面稿。

## 一、并排对照

| 任务 | 现在的步骤号 | 现在 步数 | 现在 点击 | 现在 输入 | 现在 决定 | 新 步数 | 新 点击 | 新 输入 | 新 决定 | 模型调用 现在 → 新 |
|---|---|---|---|---|---|---|---|---|---|---|
${FLOWS.map(f => { const t = tot(f); return `| ${f.title} | ${f.nowSteps} | ${f.now[0]} | ${f.now[1]} | ${f.now[2]} | ${f.now[3]} | ${t[0]} | ${t[1]} | ${t[2]} | ${t[3]} | ${f.now[4]} → ${t[4]} |`; }).join('\n')}
| **十件事合计** | | **${FLOWS.reduce((a, f) => a + f.now[0], 0)}** | **${FLOWS.reduce((a, f) => a + f.now[1], 0)}** | **${FLOWS.reduce((a, f) => a + f.now[2], 0)}** | **${FLOWS.reduce((a, f) => a + f.now[3], 0)}** | **${FLOWS.reduce((a, f) => a + tot(f)[0], 0)}** | **${FLOWS.reduce((a, f) => a + tot(f)[1], 0)}** | **${FLOWS.reduce((a, f) => a + tot(f)[2], 0)}** | **${FLOWS.reduce((a, f) => a + tot(f)[3], 0)}** | ${FLOWS.reduce((a, f) => a + f.now[4], 0)} → ${FLOWS.reduce((a, f) => a + tot(f)[4], 0)} |

说明：
- 要求里点名的八件事——建第一个库、跑第一轮、处理待看、问库、改来源与要求、和主 Agent 聊并确认一张卡、手动建库（手动新建一个库）、两个库排队——都在表里；另加了「放弃一条」和「处理一张流息发现的卡」两件。
- 「和主 Agent 聊并确认一张卡」本来就是 2 步 2 下，没有再短的余地，数字不变。
- 「手动新建一个库」新设计的第一轮调用数按 2 条新条目、都没过相关度算（自检 1 + 相关度 2）；过关的每条还会多 3 次左右（实质、摘要、核验）。
- 右栏的默认标签跟着页面走：进待看 / 资料库 / 问库是「详情」，进和主 Agent 聊是「等你决定」，其余是「进度」；你点过别的标签，在这一页里就停在你点的那个。几条流程里「不用点」的地方靠的是这一条。

${FLOWS.map((f, i) => {
  const t = tot(f);
  return `## ${['二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'][i]}、${f.title}

现在：步骤 ${f.nowSteps}，${f.now[0]} 步 · ${f.now[1]} 次点击 · ${f.now[2]} 处输入 · ${f.now[3]} 个决定。新设计：**${t[0]} 步 · ${t[1]} 次点击 · ${t[2]} 处输入 · ${t[3]} 个决定**。页面稿：${f.pages}。
${f.why}

| 步 | 想做什么 | 做什么 | 看到什么 | 点击 | 输入 | 决定 | 模型调用 |
|---|---|---|---|---|---|---|---|
${f.steps.map((s, j) => `| ${j + 1} | ${s[0]} | ${s[1]} | ${s[2]} | ${s[3]} | ${s[4]} | ${s[5]} | ${s[6]} |`).join('\n')}
`;
}).join('\n')}`;
fs.writeFileSync(path.join(root, '02-主要流程.md'), flowsMd);

// —— 3b. 单线黑白融合稿（同一份内容，换一层样式）——
const lineDir = path.join(root, '06-单线黑白融合稿');
fs.mkdirSync(lineDir, { recursive: true });
const REP = ['L00', 'P05', 'P07', 'P14', 'P16']; // 逐张核过的：新增部件 + 四张代表性页面
linePage.note = formal(linePage.note);
const lineAll = [linePage, ...pages];
for (const [i, p] of lineAll.entries()) {
  const html = pageHtml(p, lineAll[i - 1], lineAll[i + 1], 'line', LINE_CSS);
  fs.writeFileSync(path.join(lineDir, p.file), html);
  if (p === linePage) {
    for (const m of html.matchAll(/data-f="([^"]+)"/g)) for (const id of m[1].split(/\s+/)) if (!known.has(id)) problems.push('新增部件页用了功能地图里没有的编号：' + id);
    for (const m of html.matchAll(/data-comp="([^"]+)"/g)) for (const id of m[1].split(/\s+/)) if (!known.has(id)) problems.push('新增部件页的部件编号不在功能地图里：' + id);
  }
}
fs.writeFileSync(path.join(lineDir, 'pages.json'), JSON.stringify(lineAll.map(p => ({ id: p.id, name: p.name, html: p.file, png: '截图/' + p.file.replace('.html', '.png'), checked: REP.includes(p.id) })), null, 2));

// —— 4. 措辞规范（05）与自查 ——
const strip = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const frameText = Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, strip(v)]));
const elemTexts = {}; // 页面 → button / a / label / h1–h4 的完整文字
for (const [k, v] of Object.entries(frames)) {
  elemTexts[k] = [...v.matchAll(/<(button|a|label|h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => m[2].replace(/<[^>]+>/g, '').replace(/[▷＋▸▾←→✓]/g, '').trim());
}
const termRows = TERMS.map(([oldT, newT, en, kind, manual, noteT]) => {
  const on = Object.keys(frameText).filter(k => frameText[k].includes(newT.replace(/\s+/g, '')));
  if (!on.length && !manual) problems.push(`对照表：新说法「${newT}」在页面稿里找不到，也没写出现位置`);
  if (!(noteT || '').startsWith('硬约束')) for (const [k, arr] of Object.entries(elemTexts)) if (arr.includes(oldT)) problems.push(`旧说法「${oldT}」还是 ${k} 里某个按钮 / 链接 / 标题的完整文字`);
  return `| ${oldT} | ${newT} | ${en} | ${kind} | ${on.length ? on.join(' ') : manual} | ${noteT || '—'} |`;
});
const BANNED = ['谁定的', '改一下', '拟一下', '不用管', '再等等', '算了', '跑一轮', '在跑', '没过关', '放进待看', '等打分', '你拍板', '去掉', '不用动', '聊着建', '这一轮', '点了才'];
for (const [k, t] of Object.entries(frameText)) for (const w of BANNED) if (t.includes(w)) problems.push(`${k} 的稿上还有口语说法「${w}」`);
fs.writeFileSync(path.join(root, '05-措辞规范.md'), fs.readFileSync(path.join(root, 'tools', 'wording-head.md'), 'utf8').replace('{{ROWS}}', termRows.join('\n')).replaceAll('{{N}}', String(TERMS.length)));

console.log(`页面 ${pages.length} 张；功能 ${FMAP.length} 行；新增 ${NEW.length}；概念 ${CONCEPTS.length}`);
console.log(problems.length ? '问题：\n' + problems.join('\n') : '自查：没有问题');
process.exit(problems.length ? 1 : 0);
