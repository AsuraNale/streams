// 单线黑白（第四套主题）套到新布局上：样式层 + 「新增部件」一张稿。
// 规则抄自 UI设计/流息/css/line.css 与 tools/tokens-data.mjs 的 line 一组（浅色）：
// 只有黑白灰、一种线宽、只有 0 / 90 / 45 度；选中 = 黑白反转；需要确认 = 斜纹，完成 = 实心，没到 = 空框；红蓝只在左上角的标上。
import { B, A, I, RADIO, frame } from './kit.mjs';

const MARK = "M2 0L4.707 0L6.854 2.146L6.146 2.854L4.293 1L1 1ZM1 2L7.707 2L9.854 4.146L9.146 4.854L7.293 3L0 3ZM3 4L13 4L12 5L2 5ZM2 6L7.293 6L9.146 4.146L9.854 4.854L7.707 7L1 7ZM1 8L4.293 8L6.146 6.146L6.854 6.854L4.707 9L0 9Z";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 360"><path transform="scale(40)" fill="#E53935" d="${MARK}"/><path transform="translate(40 0) scale(40)" fill="#1E88E5" d="${MARK}"/><path transform="translate(20 0) scale(40)" d="${MARK}"/></svg>`;
const LOGO = `url("data:image/svg+xml,${encodeURIComponent(SVG)}")`;

export const LINE_CSS = `
/* —— 单线黑白 —— */
.line .frame{background:#F5F5F3;color:#111418;font-variant-numeric:tabular-nums;
  --cut:9px;--hatch:repeating-linear-gradient(135deg,#111418 0 1.5px,transparent 1.5px 5px);
  --chamfer:polygon(0 0,calc(100% - var(--cut)) 0,100% var(--cut),100% 100%,var(--cut) 100%,0 calc(100% - var(--cut)))}
.line .frame *{border-color:#DCDCD8}
.line .frame :is(.sub,.meta,.from,.faint,.cap,.kv dt,th){color:#565C63}
.line .frame :is(.rph small,.lh p,.lh .run,.funnel span,.lib small,.quota span){color:#565C63}
.line .frame input{accent-color:#111418}
/* 结构线 */
.line .rail{background:#EFEFEC;border-right:1px solid #111418}
.line .rp{background:#EFEFEC;border-left:1px solid #111418}
.line .logo{border-bottom:2px solid #111418}
.line .logo i{width:50px;height:38px;font-size:0;background:#fff ${LOGO} center/42px auto no-repeat}
.line .logo b{font-weight:800;letter-spacing:.04em}.line .logo small{letter-spacing:.32em;color:#565C63}
.line .tabs{border-bottom:2px solid #111418}
.line .rpt{border-bottom:2px solid #111418;margin-bottom:12px}
.line .fold{border-top:1px solid #111418}
.line h1,.line h2,.line h4{font-weight:800}
/* 当前所在：黑白反转 + 切角 */
.line :is(.nav.on,.lib.on){background:#111418;color:#fff;clip-path:var(--chamfer);box-shadow:none}
.line .lib{border-bottom:1px solid #DCDCD8}
.line .lib.on small{color:#fff;opacity:.8}
.line .nav{font-weight:600}
.line :is(.tabs a,.rpt a){color:#565C63;font-weight:600;border-bottom:0}
.line :is(.tabs a.on,.rpt a.on){background:#111418;color:#fff;font-weight:800;--cut:8px;clip-path:polygon(0 0,calc(100% - var(--cut)) 0,100% var(--cut),100% 100%,0 100%)}
/* 数字角标：实心黑切角 */
.line :is(.tabs b,.rpt b,.lib em){background:#111418;color:#fff;padding:0 6px;font-weight:800;--cut:5px;clip-path:var(--chamfer)}
.line :is(.tabs a.on b,.rpt a.on b,.lib.on em){background:#fff;color:#111418}
.line :is(.tabs b,.rpt b){margin-left:6px}
/* 库的记号：实心切角 / 灰底切角，不靠颜色 */
.line .ico{background:#111418;color:#fff;--cut:6px;clip-path:var(--chamfer);font-weight:800}
.line .ico.z{background:#DCDCD8;color:#111418}
.line .lib.on .ico{background:#fff;color:#111418}
/* 按钮 */
.line .btn{background:#fff;color:#111418;box-shadow:inset 0 0 0 1px #111418;font-weight:600}
.line .btn.pri{background:#111418;color:#fff;font-weight:700;box-shadow:none;clip-path:var(--chamfer)}
.line .btn.ghost{background:transparent;box-shadow:none;border:0;outline:1px dashed #565C63;outline-offset:-1px;color:#565C63}
.line .btn.busy{background:linear-gradient(90deg,transparent 0 12px,#fff 12px),var(--hatch);padding-left:26px}
.line .btn.sum{box-shadow:none;background:none;font-weight:700}
.line .rpt .btn{box-shadow:inset 0 0 0 1px #DCDCD8}
.line .seg{background:#fff;box-shadow:inset 0 0 0 1px #111418}
.line .seg .btn{box-shadow:none}
.line .seg .btn.on{background:#111418;color:#fff;font-weight:800;box-shadow:none;clip-path:none}
.line .menu{background:#fff;box-shadow:none;outline:1px solid #111418}
.line .menu .btn{box-shadow:none;background:transparent}
.line .lnk{border-bottom:1px solid #111418}
/* 标签与筛选：空框；选中翻黑 */
.line :is(.chip,.btn.chip){background:#fff;color:#111418;box-shadow:inset 0 0 0 1px #111418;font-weight:500}
.line :is(.chip.on,.btn.chip.on){background:#111418;color:#fff;box-shadow:none;font-weight:700;clip-path:none}
/* 状态：完成 = 实心；需要确认或注意 = 左边一条斜纹 + 墨线框 */
.line .ok{background:#111418;color:#fff;font-weight:700;padding:1px 10px;--cut:5px;clip-path:var(--chamfer)}
.line .flag{background:linear-gradient(90deg,transparent 0 7px,#fff 7px),var(--hatch);box-shadow:inset 0 0 0 1px #111418;padding-left:14px;color:#111418;font-weight:600}
.line .banner{background:linear-gradient(90deg,transparent 0 12px,#fff 12px),var(--hatch);box-shadow:inset 0 0 0 1px #111418;border:0;padding-left:28px !important;color:#111418}
.line tr:has(.flag) td:first-child b{text-decoration:underline wavy;text-underline-offset:4px}
.line .dot{width:8px;height:8px;border-radius:0;transform:skewX(-45deg);background:var(--hatch);box-shadow:inset 0 0 0 1px #111418}
/* 卡片与面板：墨线框，不要阴影 */
.line :is(.card,.sec,.dlg,.quota,.rph){background:#fff;box-shadow:inset 0 0 0 1px #111418}
.line .card.sel{background:#E7E7E3;box-shadow:inset 0 0 0 1px #111418,inset 4px 0 #111418}
.line .card[style*="dashed"]{box-shadow:none !important;outline:1px dashed #111418;outline-offset:-1px;border:0 !important}
.line .card b[style*="color"]{color:#111418 !important}
.line .bub{background:#E7E7E3;clip-path:var(--chamfer);padding-inline:20px}
.line :is(input,textarea,select){border:1px solid #111418;background:#fff;color:#111418}
.line table.t :is(td,th){border-bottom:1px solid #DCDCD8}
.line .dim{background:rgb(17 20 24 / .62)}
/* 量条与漏斗：实心 = 做完，斜纹 = 当前或等你，空框 = 没到 */
.line .meter{height:7px;background:transparent;box-shadow:inset 0 -1px #111418}
.line .meter i{height:7px;background:#111418;min-width:9px;clip-path:polygon(0 0,100% 0,calc(100% - 7px) 100%,0 100%)}
.line .funnel{gap:0}
.line .funnel>*{background:#fff;box-shadow:inset 0 0 0 1px #111418;border-right:0;margin-right:-1px;color:#111418}
.line .funnel .dn{background:#111418;color:#fff;box-shadow:inset 0 0 0 1px #111418,inset -2px 0 #fff}.line .funnel .dn span{color:#fff;opacity:.8}
.line .funnel .hit{background:linear-gradient(90deg,transparent 0 10px,#fff 10px),var(--hatch);padding-left:20px}
/* 新增部件页 */
.comps{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:26px 28px}
.comp{background:#fff;padding:16px 18px;box-shadow:inset 0 0 0 1px #111418}
.comp>h3{margin:0 0 4px;font-size:15px}.comp>p.sub{margin-bottom:12px}
.comp .st{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:8px 0}
.comp .st>small{width:92px;color:#565C63;font-size:12px;flex:none}
`;

const st = (label, html) => `<div class="st"><small>${label}</small>${html}</div>`;
const comp = (f, name, why, body) => `<section class="comp" data-comp="${f}"><h3>${name}</h3><p class="sub">${f} · ${why}</p>${body}</section>`;

export const linePage = {
  id: 'L00', name: '新增部件（单线黑白）', file: 'L00-新增部件.html',
  note: `<b>新布局新增或改动的部件，在「单线黑白」下各自长什么样。</b>原来的七张单线黑白设计稿里没有这些部件，玄翎套主题时照这一张做。规则只有四条：选中 = 黑白反转；需要确认或注意 = 左边一条 45° 斜纹 + 墨线框；完成或正常 = 实心黑；没到或排队 = 空框（禁用是虚线框）。每个块的小字是它对应的功能编号。`,
  html: frame(`<div class="comps">
    ${comp('N06 F22 F19 F23', '页头的运行按钮（三种状态）', '按钮本身就是状态；排队时不能再点',
      st('空闲', `<span class="sub">下次运行 明天 08:00<br>预计 2–8 次模型调用</span>${B('F22 N06', '▷ 立即运行', 'pri')}`) +
      st('运行中', `<span class="sub">运行中：相关度<br>模型调用 4 / 上限 120</span>${B('F19', '运行中 · 停止', 'busy')}`) +
      st('排队', `<span class="sub">前面：中国电动车</span>${B('F23', '排队中 · 第 2 位', 'ghost')}`))}
    ${comp('F18 F19 N10', '漏斗条', '一次运行只用这一条讲清；做完的格实心，当前格斜纹，没到的空框',
      st('运行中', `<div class="funnel" style="flex:1"><div class="dn"><b>✓</b><span>自检</span></div><div class="dn"><b>5</b><span>已抓取</span></div><div class="hit"><b>…</b><span>相关度</span></div><div><b>–</b><span>实质</span></div><div><b>–</b><span>进入待看</span></div></div>`) +
      st('已完成', `<div class="funnel" style="flex:1"><div><b>5</b><span>已抓取</span></div><div><b>5</b><span>去重后新增</span></div><div><b>3</b><span>通过相关度</span></div><div><b>2</b><span>通过实质</span></div><div class="hit"><b>2</b><span>进入待看</span></div></div>`) +
      st('没跑完', `<div class="funnel" style="flex:1"><div><b>1</b><span>已抓取</span></div><div class="hit"><b>停</b><span>自检未通过</span></div><div><b>–</b><span>相关度</span></div><div><b>–</b><span>进入待看</span></div></div>`))}
    ${comp('F16 F59', '提议（主 Agent 提的）', '在对话里是整张，在右栏「待确认」里是紧凑版；主按钮实心切角',
      `<div class="card" data-f="F59 F16"><span class="from">主 Agent 提议 · AI Agent 长期记忆</span><p><b>修改追踪要求</b></p><p class="sub">修改后：仅保留评测与对比数据；排除工程笔记与经验分享。</p><div class="row" style="margin-top:8px">${B('F59 F16', '确认', 'pri sm')}${B('F59 F16', '提出修改', 'sm')}${B('F59 F16', '拒绝', 'sm')}</div></div>`)}
    ${comp('N05 F59', '提议（系统检测，自带动作）', '和上面是同一种卡，只有小字不同；第一个动作是推荐的，实心',
      `<div class="card" data-f="F59 F16 N05"><span class="from">系统检测 · 中国电动车</span><p><b>来源「maker-notices」连续 3 次运行抓取失败</b></p><p class="sub">暂时失败 ×3（对方服务器未响应）。</p><div class="row" style="margin-top:8px">${B('F59 F48 N05', '暂停该来源', 'pri sm')}${B('F59 F48 N05', '修改地址', 'sm')}${B('F59 N05', '暂不处理', 'sm')}</div></div>`)}
    ${comp('N03 F26', '放弃后的原因条', '属于「等你」的东西：斜纹 + 墨线框；撤销是虚线框',
      `<div class="banner row" data-f="N03" style="margin:0"><span>已放弃「双十一大促：向量数据库五折」。可选择原因：</span>${B('N03', '营销内容', 'sm')}${B('N03', '不相关', 'sm')}${B('N03', '其他原因…', 'sm')}<span class="sp"></span>${B('N03', '撤销', 'sm ghost')}</div>`)}
    ${comp('F27 F33 N02 N07', '折叠段：稍后处理 / 未通过筛选', '一条墨线分隔；展开后每行一个空框按钮',
      `<div class="fold"><button class="sum" data-f="F27">▸ 稍后处理 · 1 条（下次运行后重新列入待看）</button></div>
       <div class="fold"><button class="sum" data-f="F33">▾ 未通过筛选 · 2 条（不会入库）</button>
       <table class="t" style="margin-top:8px"><tr><td>向量库还是摘要链？</td><td class="meta">未通过实质 0.40</td><td>${B('N02', '移入待看', 'sm')}</td></tr><tr><td>周末菜谱：十五分钟番茄牛腩</td><td class="meta">未通过相关度 0.02</td><td>${B('N02', '移入待看', 'sm')}</td></tr></table></div>`)}
    ${comp('N09 F50', '待评分的占位行', '手动添加的链接，还没评分：空框标签',
      `<div class="card row" data-f="F50 N09" style="margin:0"><span class="chip">待评分</span><span>https://example.org/agent-memory-survey</span><span class="sp"></span><span class="sub">手动添加 · 将在下次运行时评分</span></div>`)}
    ${comp('N01 F45', '严格程度（三档）', '单选；选中的一档由系统控件的实心黑点表示',
      st('默认', `<div data-f="N01">${RADIO('N01', 'cst', ['宽松', '标准', '严格'], 1)}</div><span class="sub">标准：相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过</span>`) +
      st('手动改过', `<span class="chip on">自定义</span><span class="sub">相关度 0.45 · 实质 0.6（在高级设置里改的）</span>`))}
    ${comp('F48 F49', '来源行与五种状态', '正常 = 实心；无更新 = 空框；其余三种要人看 = 斜纹，名字加波浪下划线',
      `<table class="t"><tr><td><b>my-feed</b></td><td><span class="ok">正常 · 5 条</span></td><td>${B('F48', '⋯', 'sm')}</td></tr>
       <tr><td><b>arxiv-agent-memory</b></td><td><span class="chip">无更新</span></td><td>${B('F48', '⋯', 'sm')}</td></tr>
       <tr><td><b>maker-notices</b></td><td><span class="flag">暂时失败</span> <span class="sub">下次运行时自动重试</span></td><td>${B('F48', '⋯', 'sm')}</td></tr>
       <tr><td><b>blog-x</b></td><td><span class="flag">地址无效</span> <span class="sub">请更新订阅地址</span></td><td>${B('F48', '⋯', 'sm')}</td></tr>
       <tr><td><b>paywalled-site</b></td><td><span class="flag">访问被拒</span> <span class="sub">对方拒绝了抓取</span></td><td>${B('F48', '⋯', 'sm')}</td></tr></table>`)}
    ${comp('F20', '连接出问题的横幅', '库页顶上一次最多一条；斜纹 + 墨线框，主动作实心',
      `<div class="banner" data-f="F20" style="margin:0"><p><b>连接你电脑上的 Claude Code 登录已过期，本次运行未完成评分。</b>已抓取的 1 条内容已保留。</p><div class="row" style="margin-top:8px">${B('F20', '前往登录', 'pri')}${B('F20', '已登录，重试')}${A('F20 F63', '更换连接方式')}</div></div>`)}
    ${comp('F10 F23', '左栏的库行（四种状态）', '当前库黑白反转；待看数是实心角标；有问题是斜纹小块',
      `<div style="background:#EFEFEC;padding:8px;max-width:260px">
       <a href="#" class="lib on" data-f="F10"><span class="ico">A</span><span>AI Agent 长期记忆</span><em>2</em></a>
       <a href="#" class="lib" data-f="F10"><span class="ico z">中</span><span>中国电动车</span><span></span><small>运行中 · 抓取</small></a>
       <a href="#" class="lib" data-f="F10"><span class="ico z">R</span><span>Rust 异步生态</span><span></span><small>排队中 · 第 2 位</small></a>
       <a href="#" class="lib" data-f="F10"><span class="ico z">补</span><span>安省中小企业补助</span><span class="dot"></span></a></div>`)}
    ${comp('F54', '变更记录', '一张表，墨线分行；操作来源三种写法',
      `<table class="t"><tr><th>时间</th><th>变更内容</th><th>操作来源</th></tr><tr><td class="meta">今天 20:52</td><td>主题：添加 2 个关键词</td><td>手动修改</td></tr><tr><td class="meta">今天 20:39</td><td>追踪要求：仅保留评测与对比数据</td><td>主 Agent 提议 · 已确认</td></tr><tr><td class="meta">今天 20:35</td><td>评分环节：默认提示词</td><td>初始设置</td></tr></table>`)}
    ${comp('F51', '评分环节条', '固定节点空框，可编辑的评分环节可点；当前在编辑的一格斜纹',
      `<div class="funnel"><div><span>固定</span><b style="font-size:14px">抓取</b></div><div><span>脚本</span><b style="font-size:14px">去重</b></div><a href="#" class="hit" data-f="F51"><span>评分环节 ①</span><b style="font-size:14px">相关度 · 0.5</b></a><a href="#" data-f="F51"><span>评分环节 ②</span><b style="font-size:14px">实质 · 0.6</b></a><a href="#" data-f="F51"><span>模型</span><b style="font-size:14px">摘要</b></a><div><span>固定</span><b style="font-size:14px">人工确认</b></div><div><span>固定</span><b style="font-size:14px">入库</b></div></div>`)}
    ${comp('F59', '右栏标签上的数字角标', '「待确认」后面的数字：未选中时实心黑，选中时反白',
      st('未选中', `<div class="rpt" style="margin:0"><a href="#" data-f="F58">进度</a><a href="#" data-f="F59">待确认<b>4</b></a><a href="#" class="on" data-f="F60">详情</a><a href="#" data-f="F61">文件</a></div>`) +
      st('选中', `<div class="rpt" style="margin:0"><a href="#" data-f="F58">进度</a><a href="#" class="on" data-f="F59">待确认<b>4</b></a><a href="#" data-f="F60">详情</a><a href="#" data-f="F61">文件</a></div>`))}
  </div>`, 'solo'),
};
