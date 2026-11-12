// 把四份 md 各出一份能直接在浏览器里看的网页版，并重出 总览.html（用普通链接）。
// 用法：node tools/docs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = [['00-设计说明', '00 设计说明'], ['01-功能地图', '01 功能地图'], ['02-主要流程', '02 主要流程'], ['04-要维护者定的事', '04 要 维护者 定的事'], ['05-措辞规范', '05 措辞规范'], ['06-单线黑白融合说明', '06 单线黑白融合']];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

function md2html(md) {
  const L = md.split(/\r?\n/), out = [];
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (l.startsWith('```')) { const buf = []; i++; while (i < L.length && !L[i].startsWith('```')) buf.push(esc(L[i++])); i++; out.push(`<pre>${buf.join('\n')}</pre>`); continue; }
    if (l.startsWith('|')) {
      const rows = []; while (i < L.length && L[i].startsWith('|')) rows.push(L[i++]);
      const cells = r => r.replace(/^\||\|\s*$/g, '').split('|').map(c => inline(c.trim()));
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      out.push(`<div class="tw"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^- /.test(l)) {
      const items = [];
      while (i < L.length && (/^- /.test(L[i]) || /^\s{2,}\S/.test(L[i]))) {
        if (/^- /.test(L[i])) items.push(inline(L[i].slice(2))); else items[items.length - 1] += '<br><span class="cont">' + inline(L[i].trim()) + '</span>';
        i++;
      }
      out.push(`<ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>`); continue;
    }
    if (!l.trim()) { i++; continue; }
    const p = []; while (i < L.length && L[i].trim() && !/^(#|\||- |```|---)/.test(L[i])) p.push(inline(L[i++]));
    out.push(`<p>${p.join('<br>')}</p>`);
  }
  return out.join('\n');
}

const CSS = `*{box-sizing:border-box}body{margin:0;background:#f1f0ea;color:#23282c;font:15px/1.75 "Noto Sans SC","Microsoft YaHei UI","PingFang SC",sans-serif}
nav{position:sticky;top:0;background:#23282c;padding:10px 24px;display:flex;gap:8px;flex-wrap:wrap;z-index:2}
nav a{color:#f3f2ec;text-decoration:none;padding:4px 12px;border:1px solid #6a7076;font-size:13px}nav a.on{background:#f3f2ec;color:#23282c}
main{max-width:1180px;margin:0 auto;padding:28px 24px 80px}
h1{font-size:28px;line-height:1.3;margin:0 0 14px}h2{font-size:21px;margin:34px 0 10px;padding-top:14px;border-top:1px solid #dcdad2}h3{font-size:16px;margin:22px 0 6px}
p{margin:8px 0}ul{margin:8px 0;padding-left:22px}li{margin:5px 0}.cont{color:#5d6368}
code{font:13px Consolas,"Noto Sans SC",monospace;background:#e6e5df;padding:1px 5px}pre{background:#fdfdfb;padding:14px 16px;overflow:auto;font:13px/1.6 Consolas,"Noto Sans SC",monospace}
hr{border:0;border-top:1px solid #dcdad2;margin:26px 0}
.tw{overflow-x:auto;margin:12px 0;background:#fdfdfb;box-shadow:0 1px 3px rgba(0,0,0,.06)}
table{border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.6}th,td{border-bottom:1px solid #e3e1d9;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#e6e5df;font-weight:600;white-space:nowrap}td:first-child{white-space:nowrap}a{color:#24708f}`;

const N = JSON.parse(fs.readFileSync(path.join(root, '03-页面稿', 'pages.json'), 'utf8')).length;
const navHtml = on => `<nav><a href="${encodeURI('总览.html')}"${on === '总览' ? ' class="on"' : ''}>总览（${N} 张稿）</a>${DOCS.map(([f, t]) => `<a href="${encodeURI(f + '.html')}"${on === f ? ' class="on"' : ''}>${t}</a>`).join('')}</nav>`;

for (const [f, t] of DOCS) {
  const md = fs.readFileSync(path.join(root, f + '.md'), 'utf8');
  fs.writeFileSync(path.join(root, f + '.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t} · 流息 UX 重设计</title><style>${CSS}</style></head><body>${navHtml(f)}<main>${md2html(md)}</main></body></html>`);
}

const pages = JSON.parse(fs.readFileSync(path.join(root, '03-页面稿', 'pages.json'), 'utf8'));
const lineJson = path.join(root, '06-单线黑白融合稿', 'pages.json');
const linePages = fs.existsSync(lineJson) ? JSON.parse(fs.readFileSync(lineJson, 'utf8')) : [];
const lineCard = p => `<a href="${encodeURI('06-单线黑白融合稿/' + p.html)}"><img src="${encodeURI('06-单线黑白融合稿/' + p.png.replace('截图/', '截图-无编号/'))}" alt="${p.name}"><b>${p.id} · ${p.name}</b></a>`;
// 模板版（07）：新布局做进丽芙的模板里，四套主题
const tplJson = path.join(root, '07-模板版', '画面清单.json');
const tplShots = fs.existsSync(tplJson) ? JSON.parse(fs.readFileSync(tplJson, 'utf8')) : [];
const TPL_DEFAULT = '研究对话'; // 维护者 11-11 定的默认主题
const tplThemes = [...new Set(tplShots.map(s => s.theme))].sort((a, b) => (b === TPL_DEFAULT) - (a === TPL_DEFAULT));
const tplScreens = new Set(tplShots.map(s => s.screen)).size;
const tplSection = tplShots.length ? `<h2>模板版：新布局做进丽芙的模板里（外观以这一版为准）</h2>
<p>底是丽芙的模板代码（四套主题），内容是流息的新布局，共 ${tplScreens} 个画面。维护者 11-11 定：应用里原有的三套主题不再保留，只留这四套；默认主题为「${TPL_DEFAULT}」；新布局与模板合成一个包交给玄翎。点下面任一套进去，顶上的切换条可以换主题、换画面，界面本身也能点。说明见 <a href="${encodeURI('07-模板版/说明.html')}">07 模板版说明</a>。</p>
<div class="g">${tplThemes.map(t => { const s = tplShots.find(x => x.theme === t && x.screen === 'inbox'); return `<a href="${encodeURI('07-模板版/' + s.entry)}?screen=inbox"><img src="${encodeURI('07-模板版/' + s.png)}" alt="${t}"><b>${t}${t === TPL_DEFAULT ? '（默认）' : ''} · 进入（从「待看」开始）</b></a>`; }).join('')}</div>
<h2>布局线框稿（内容与功能编号的依据，样子不作数）</h2>` : '';
const lineSection = linePages.length ? `<h2>（不再作数）线框版的单线黑白融合稿</h2>
<p>同一份页面内容，换成「单线黑白」的画法：只有黑白灰，状态靠形状（斜纹 = 需要确认，实心 = 完成，空框 = 没到）。先看「新增部件」和四张代表性页面；说明在最上面一排的「06 单线黑白融合」。</p>
<div class="g">${linePages.filter(p => p.checked).map(lineCard).join('')}</div>
<h3>其余 ${linePages.filter(p => !p.checked).length} 张（自动套的样式，没有逐张看）</h3>
<div class="g">${linePages.filter(p => !p.checked).map(lineCard).join('')}</div>` : '';
fs.writeFileSync(path.join(root, '总览.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>流息 UX 重设计 · 总览</title><style>${CSS}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;margin-top:18px}
.g a{display:block;background:#fdfdfb;padding:10px;box-shadow:0 1px 4px rgba(0,0,0,.1);color:inherit;text-decoration:none}
.g img{width:100%;display:block;border:1px solid #dcdad2;aspect-ratio:3/2;object-fit:cover;object-position:top}.g b{display:block;margin-top:8px}</style></head>
<body>${navHtml('总览')}<main><h1>流息 UX 重设计 · 总览</h1>
${tplSection}
<p>${N} 张页面稿（默认主题「精密国际主义」浅色 · 中文）。点缩略图打开那一张：页面上的小红标签是功能地图里的编号，右上角可以隐藏；每张顶上有「← 上一张 / 下一张 →」。文字部分在最上面那一排。</p>
<div class="g">${pages.map(p => `<a href="${encodeURI('03-页面稿/' + p.html)}"><img src="${encodeURI('03-页面稿/' + p.png.replace('截图/', '截图-无编号/'))}" alt="${p.name}"><b>${p.id} · ${p.name}</b></a>`).join('')}</div>
${lineSection}</main></body></html>`);
console.log('网页版：', DOCS.map(d => d[0] + '.html').join('、'), '、总览.html');

// 07 模板版的说明：单独出一份网页版（在子目录里，导航只留回总览）
const tplMd = path.join(root, '07-模板版', '说明.md');
if (fs.existsSync(tplMd)) {
  fs.writeFileSync(path.join(root, '07-模板版', '说明.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>07 模板版说明 · 流息 UX 重设计</title><style>${CSS}</style></head><body><nav><a href="../${encodeURI('总览.html')}">总览</a><a class="on" href="${encodeURI('说明.html')}">07 模板版说明</a></nav><main>${md2html(fs.readFileSync(tplMd, 'utf8'))}</main></body></html>`);
}
