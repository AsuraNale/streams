// 页面稿的公共部分：样式、外壳（左栏 / 库页头 / 右栏）、小零件。
// 每个可点元素都带 data-f（功能地图里的编号），页面上用小标签显示。

export const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#d9d7cf;color:#23282c;font:14px/1.6 "Noto Sans SC","Microsoft YaHei UI","PingFang SC",sans-serif}
a{color:inherit;text-decoration:none}
button,input,textarea,select{font:inherit;color:inherit}
.bar{display:flex;gap:16px;align-items:center;padding:10px 16px;background:#23282c;color:#f3f2ec;font-size:13px}
.bar b{font-size:15px}.bar .go,.bar .tg{cursor:pointer;border:1px solid #6a7076;padding:2px 10px}
.bar .sp{flex:1}.bar .lg{background:#b3125b;padding:0 5px;font:600 10px/16px Consolas,monospace}
.note{max-width:1440px;margin:10px auto;padding:10px 14px;background:#fffdf3;border-left:4px solid #b3125b;font-size:13px}
.note li{margin-left:18px}
.frame{width:1440px;min-height:960px;margin:14px auto 40px;display:grid;grid-template-columns:232px 1fr 372px;background:#f7f6f1;box-shadow:0 2px 14px rgba(0,0,0,.25);position:relative}
.frame.solo{display:block}
.frame.w1100{width:1100px;min-height:860px;display:block}
/* 左栏 */
.rail{background:#f1f0ea;padding:20px 14px 14px;display:flex;flex-direction:column;gap:6px;border-right:1px solid #e3e1d9}
.logo{display:flex;gap:12px;align-items:center;margin-bottom:14px;padding-bottom:16px;border-bottom:1px solid #dcdad2}
.logo i{width:38px;height:38px;background:#23282c;color:#fff;display:grid;place-items:center;font:700 18px/1 inherit;font-style:normal}
.logo b{font-size:19px;line-height:1.1}.logo small{display:block;font:11px/1 Consolas,monospace;letter-spacing:2px;color:#5d6368;margin-top:4px}
.nav{display:flex;gap:10px;align-items:center;padding:8px 10px;font-weight:500}
.nav.on{background:#e6e5df}
.rail .cap{font-size:11px;color:#5d6368;margin:12px 10px 2px}
.lib{display:grid;grid-template-columns:24px 1fr auto;gap:10px;align-items:center;padding:8px 10px}
.lib.on{background:#e6e5df;box-shadow:inset 3px 0 0 #23282c}
.lib small{grid-column:2/4;font-size:11px;color:#5d6368;margin-top:-6px}
.lib em{font:600 12px Consolas,monospace;font-style:normal;color:#8a5a12}
.ico{width:24px;height:24px;display:grid;place-items:center;color:#fff;font:700 12px/1 inherit;background:#24708f}
.ico.z{background:#5a47a8}.ico.big{width:40px;height:40px;font-size:18px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#8a5a12;margin-right:5px}
.dot.g{background:#1f6b57}
.rail .fill{flex:1}
.quota{background:#fdfdfb;padding:10px 12px;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.quota b{font-size:12px}.quota .r{display:grid;grid-template-columns:42px 1fr 30px;gap:6px;align-items:center;margin-top:5px}
.meter{height:4px;background:#e3e1d9}.meter i{display:block;height:4px;background:#23282c}
/* 主区 */
main{padding:0;min-width:0}
.lh{display:flex;gap:14px;align-items:center;padding:22px 28px 10px}
.lh h1{font-size:23px;line-height:1.2}.lh p{font-size:12px;color:#5d6368;max-width:430px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lh .run{margin-left:auto;display:flex;gap:12px;align-items:center;font-size:12px;color:#5d6368;text-align:right}
.tabs{display:flex;gap:6px;padding:0 28px;border-bottom:1px solid #dcdad2}
.tabs a{padding:8px 14px;font-weight:500;border-bottom:2px solid transparent}
.tabs a.on{background:#e6e5df;border-bottom-color:#23282c}
.tabs b{font:600 11px Consolas,monospace;color:#8a5a12;margin-left:4px}
.tabs .sp{flex:1}
.body{padding:20px 28px 28px}
h2{font-size:18px}h3{font-size:13px;font-weight:600;margin:18px 0 8px}
.sub{font-size:12px;color:#5d6368}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sp{flex:1}
.btn{border:0;background:#e8e7e1;padding:7px 14px;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap}
.btn.pri{background:#2b3035;color:#fff}.btn.sm{padding:3px 9px;font-size:12px}.btn.ghost{background:transparent;border:1px solid #cfcdc4}
.btn.busy{background:#f3e9da;color:#6d4608}
.lnk{border-bottom:1px solid #8b9095;font-size:13px}
.card{background:#fdfdfb;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:12px}
.card.sel{background:#e9e8e3;box-shadow:inset 3px 0 0 #23282c}
.card h4{font-size:16px;line-height:1.4}
.meta{font:12px/1.6 Consolas,"Noto Sans SC",monospace;color:#5d6368}
.flag{display:inline-block;background:#f3e9da;color:#6d4608;font-size:12px;padding:1px 8px}
.ok{display:inline-block;background:#e3efe9;color:#1f6b57;font-size:12px;padding:1px 8px}
.chip{display:inline-block;background:#e8e7e1;font-size:12px;padding:2px 9px;border:0;cursor:pointer}
.chip.on{background:#2b3035;color:#fff}
ul.pt{margin:6px 0 8px 20px}ul.pt li{margin:2px 0}
.inw{display:inline-block}.inw.blk{display:block}
input,textarea,select{border:1px solid #cfcdc4;background:#fdfdfb;padding:6px 9px;font-size:13px}
textarea{width:100%;display:block;resize:vertical}input.w{width:100%}
.inw.blk input{width:100%}
.banner{background:#f3e9da;border:1px solid #d9c3a0;padding:12px 16px;margin-bottom:14px}
.fold{border-top:1px solid #dcdad2;padding:10px 0}
.sum{border:0;background:none;font-weight:600;font-size:13px;cursor:pointer;padding:0;text-align:left}
.kv{display:grid;grid-template-columns:86px 1fr;gap:6px 12px;font-size:13px}
.kv dt{color:#5d6368}
.funnel{display:flex;gap:0;align-items:stretch;margin:10px 0}
.funnel>*{flex:1;display:block;background:#e8e7e1;padding:8px 10px;border-right:2px solid #f7f6f1}
.funnel b{display:block;font:600 20px/1.2 Consolas,monospace}.funnel span{font-size:11px;color:#5d6368}
.funnel .hit{background:#f3e9da}
.bub{background:#e8e7e1;padding:10px 14px;margin:0 0 12px auto;max-width:70%;width:fit-content}
.faint{font-size:12px;color:#8b9095;margin:6px 0}
.sec{background:#fdfdfb;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.sec>h3{margin-top:0}
table.t{width:100%;border-collapse:collapse;font-size:13px}
table.t td,table.t th{border-bottom:1px solid #e3e1d9;padding:7px 6px;text-align:left;vertical-align:top}
table.t th{font-weight:500;color:#5d6368;font-size:12px}
.menu{position:absolute;right:0;top:28px;background:#fdfdfb;box-shadow:0 2px 10px rgba(0,0,0,.2);display:flex;flex-direction:column;z-index:4;min-width:110px}
.menu .btn{background:transparent;text-align:left;font-weight:500}
.seg{display:inline-flex;background:#e8e7e1}.seg .btn.on{background:#fdfdfb;box-shadow:inset 0 0 0 1px #cfcdc4}
/* 右栏 */
.rp{background:#f1f0ea;padding:12px 14px;border-left:1px solid #e3e1d9;font-size:13px}
.rpt{display:flex;gap:2px;align-items:center;margin-bottom:12px}
.rpt a{padding:7px 9px;font-weight:500;font-size:12px;border-bottom:2px solid transparent;white-space:nowrap}
.rpt a.on{background:#e6e5df;border-bottom-color:#23282c}
.rpt b{font:600 11px Consolas,monospace;color:#8a5a12;margin-left:3px}
.rpt .btn{margin-left:auto;background:transparent;padding:4px 6px}
.rph{background:#e6e5df;padding:12px 14px;margin-bottom:12px}
.rph small{font:11px Consolas,"Noto Sans SC",monospace;color:#5d6368}.rph b{display:block;font-size:17px;line-height:1.35}
.rp .card{padding:12px 14px}
.rp h3{font-size:12px;margin:14px 0 6px}
.from{font-size:11px;color:#5d6368}
/* 对话框 */
.dim{position:absolute;inset:0;background:rgba(35,40,44,.45);display:grid;place-items:center;z-index:9}
.dlg{background:#fdfdfb;padding:22px 24px;width:560px;box-shadow:0 8px 30px rgba(0,0,0,.3)}
.dlg h2{margin-bottom:10px}.dlg .row{margin-top:14px}
.center{max-width:720px;margin:0 auto;padding:70px 0}
/* 功能编号小标签 */
.tags [data-f] :is(input,textarea,select)[data-f]::after,.tags [data-f]:has(> label[data-f])::after{display:none}
:where([data-f]){position:relative}
.tags [data-f]::after{content:attr(data-f);position:absolute;right:0;top:-9px;font:600 9px/12px Consolas,monospace;background:#b3125b;color:#fff;padding:0 3px;white-space:nowrap;z-index:6;pointer-events:none;letter-spacing:0;text-transform:none}
`;

// —— 小零件 ——
export const B = (f, t, c = '') => `<button class="btn ${c}" data-f="${f}">${t}</button>`;
export const A = (f, t, c = 'lnk', href = '#') => `<a href="${href}" class="${c}" data-f="${f}">${t}</a>`;
export const I = (f, ph, v = '', c = '', extra = '') => `<span class="inw ${c}" data-f="${f}"><input data-f="${f}" placeholder="${ph}" value="${v}" ${extra}></span>`;
export const TA = (f, ph, v = '', rows = 3) => `<span class="inw blk" data-f="${f}"><textarea data-f="${f}" rows="${rows}" placeholder="${ph}">${v}</textarea></span>`;
export const SEL = (f, opts) => `<span class="inw" data-f="${f}"><select data-f="${f}">${opts.map(o => `<option>${o}</option>`).join('')}</select></span>`;
export const RADIO = (f, name, opts, on = 0) => opts.map((o, i) => `<label class="inw" data-f="${f}" style="margin-right:14px"><input type="radio" name="${name}" data-f="${f}" ${i === on ? 'checked' : ''}> ${o}</label>`).join('');
export const CHK = (f, t, on = true) => `<label class="inw" data-f="${f}"><input type="checkbox" data-f="${f}" ${on ? 'checked' : ''}> ${t}</label>`;

const LIBS = [
  { k: 'a', ico: 'A', cls: '', name: 'AI Agent 长期记忆', brief: '追踪 AI agent 长期记忆的评测与对比数据。' },
  { k: 'z', ico: '中', cls: 'z', name: '中国电动车', brief: '追踪中国新能源车的月度数据：乘用车零售与批发、渗透率、动力电池装车量。' },
];

// 左栏。state: {a:{n:2,line:'在跑 · 打分'}, z:{…}}；active: 'agent' | 'new' | 'set' | 'a' | 'z'
export function rail(active, state = { a: { n: 2 } }, libs = ['a', 'z']) {
  const rows = LIBS.filter(l => libs.includes(l.k)).map(l => {
    const s = state[l.k] || {};
    return `<a href="P05-待看.html" class="lib ${active === l.k ? 'on' : ''}" data-f="F10"><span class="ico ${l.cls}">${l.ico}</span><span>${l.name}</span>${s.n ? `<em>${s.n}</em>` : (s.dot ? '<span class="dot"></span>' : '<span></span>')}${s.line ? `<small>${s.line}</small>` : ''}</a>`;
  }).join('');
  return `<aside class="rail">
  <div class="logo"><i>流</i><div><b>流息</b><small>STREAMS</small></div></div>
  <a href="P23-库架.html" class="nav ${active === 'shelf' ? 'on' : ''}" data-f="F10 F12">▦ 库架</a>
  <a href="P03-和主Agent聊.html" class="nav ${active === 'agent' ? 'on' : ''}" data-f="F10 F14">▭ 主 Agent</a>
  <div class="cap">我的库</div>
  ${rows}
  <a href="P04-新建库-自己填.html" class="nav ${active === 'new' ? 'on' : ''}" data-f="F10 F56">＋ 新建库</a>
  <div class="fill"></div>
  <div class="quota" data-f="F11"><div class="row"><b>套餐用量</b><span class="sp"></span><span>截至 今天 20:36</span></div>
    <div class="r"><span>5 小时</span><div class="meter"><i style="width:8%"></i></div><span>8%</span></div>
    <div class="r"><span>7 天</span><div class="meter"><i style="width:26%"></i></div><span>26%</span></div></div>
  <a href="P17-设置.html" class="nav ${active === 'set' ? 'on' : ''}" data-f="F10" style="border-top:1px solid #dcdad2;margin-top:8px;padding-top:12px">⚙ 设置</a>
</aside>`;
}

// 库页头 + 四个标签。run: 页头右边的运行状态（html）
export function libHead(k, tab, run, n = 2) {
  const l = LIBS.find(x => x.k === k);
  const t = (name, href, extra = '') => `<a href="${href}" class="${tab === name ? 'on' : ''}" data-f="F13">${name}${extra}</a>`;
  return `<header class="lh"><span class="ico big ${l.cls}">${l.ico}</span><div><h1>${l.name}</h1><p>追踪范围：${l.brief}</p></div>
  <div class="run">${run}</div></header>
  <nav class="tabs">${t('待看', 'P05-待看.html', n ? `<b>${n}</b>` : '')}${t('资料库', 'P09-资料库.html')}${t('问库', 'P13-问库.html')}<span class="sp"></span>${t('来源与要求', 'P14-来源与要求.html')}</nav>`;
}
export const RUN_IDLE = `<span data-f="F58">下次运行 明天 08:00<br>预计 2–8 次模型调用</span>${B('F22 N06', '▷ 立即运行', 'pri')}`;

// 右栏。active: 进度 | 待确认 | 详情 | 文件；n: 待确认的数字
export function rp(active, body, n = 0) {
  const t = (name, f, extra = '') => `<a href="P16-右栏四个标签.html" class="${active === name ? 'on' : ''}" data-f="${f}">${name}${extra}</a>`;
  return `<aside class="rp"><div class="rpt">${t('进度', 'F58')}${t('待确认', 'F59', n ? `<b>${n}</b>` : '')}${t('详情', 'F60')}${t('文件', 'F61')}<button class="btn" data-f="F62" title="收起右栏">▯</button></div>${body}</aside>`;
}

export const frame = (inner, cls = '') => `<div class="frame ${cls}">${inner}</div>`;
export const dialog = (html, w = 560) => `<div class="dim"><div class="dlg" style="width:${w}px">${html}</div></div>`;

export function pageHtml(p, prev, next, skin = '', extraCss = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${p.id} · ${p.name} · 流息页面稿</title><style>${CSS}${extraCss}</style></head>
<body class="tags ${skin}">
<div class="bar"><b>${p.id} · ${p.name}</b><span>流息 UX 重设计 · 页面稿（${skin === 'line' ? '单线黑白' : '精密国际主义'} · 浅色 · 中文）</span><span class="sp"></span><span class="lg">F24</span><span>= 功能地图里的编号</span>
<span class="tg" onclick="document.body.classList.toggle('tags')">显示 / 隐藏编号</span>
<span class="go" onclick="location.href='../'+encodeURI('总览.html')">总览</span>
${prev ? `<span class="go" onclick="location.href='${prev.file}'">← ${prev.id}</span>` : ''}${next ? `<span class="go" onclick="location.href='${next.file}'">${next.id} →</span>` : ''}</div>
<div class="note">${p.note}</div>
${p.html}
<script>function fit(){var f=document.querySelector('.frame');var w=f.classList.contains('w1100')?1100:1440;f.style.zoom=Math.min(1,(document.documentElement.clientWidth-16)/w)}addEventListener('resize',fit);fit()</script>
</body></html>`;
}
