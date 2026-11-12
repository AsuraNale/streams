'use strict';
// 流息 · 新布局，搭在丽芙的模板上（云织第十一轮 + 单线黑白第十二轮）。
// 这个文件顶替模板里的 shared/round8/app.js：外壳的结构、部件的 class 都照它的写法，只把内容换成流息的八个画面。
// 样式全部来自 shared/ 下丽芙的样式表；streams.css 里只有四个模板没有的小部件（都以 st- 开头）。
const visualEdition = window.yunzhiVisualEdition;
const themes = visualEdition.choices;
const theme = document.body.dataset.theme;
document.body.dataset.product = 'streams';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

// —— 图标：照模板的取法（各主题自己的一套） ——
const paths = { plus: 'M12 5v14M5 12h14', file: 'M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6' };
function layeredIcon(layers, className, name) {
  return '<svg class="ico ' + className + '" data-glyph="' + name + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + layers.map(({ d, tone }) => '<path' + (tone ? ' class="symbol-' + tone + '"' : '') + ' d="' + d + '"/>').join('') + '</svg>';
}
function icon(name, fallback = name) {
  const layers = visualEdition.controlArt?.[name];
  if (layers) return layeredIcon(layers, 'control-symbol', name);
  const path = visualEdition.icons[fallback] ?? paths[fallback] ?? paths.file;
  return '<svg class="ico" data-glyph="' + name + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
}
function sidebarIcon(role, fallback) {
  const layers = visualEdition.sidebarIcons?.[role];
  return layers ? layeredIcon(layers, 'sidebar-symbol', role) : icon(fallback);
}

// —— 示例数据 ——
const LIBS = {
  mem: { title: 'AI Agent 长期记忆', brief: '追踪 AI agent 长期记忆的评测与对比数据。', meta: ['2 个来源', '2 个主题', '每天 08:00', '严格程度：标准'] },
  ev: { title: '中国电动车', brief: '追踪中国新能源车的月度数据：乘用车零售与批发、渗透率、动力电池装车量。', meta: ['2 个来源', '1 个主题', '每天 08:30', '严格程度：严格'] },
};
const T1 = '长期运行的 agent 怎么记住用户：三种记忆方案的对比评测';
const T2 = 'MemBench 第二轮结果：开源 agent 记忆方案在「隔天回来」上普遍失分';
const SCREENS = [['firstrun', '首次打开'], ['connect', '连接选择'], ['shelf', '库架'], ['agent', '主 Agent'], ['new', '新建库'], ['inbox', '待看'], ['empty', '待看空着时'], ['run', '运行与排队'], ['expired', '连接出问题'], ['library', '资料库'], ['graph', '图谱'], ['edit', '编辑笔记'], ['header', '缺少文件头'], ['ask', '问库'], ['sources', '来源与要求'], ['advanced', '高级设置'], ['remove', '移除该库'], ['settings', '设置'], ['apikey', '输入 API key'], ['licenses', '许可证与致谢'], ['reader', '阅读窗口']];
const DEFAULT_TAB = { firstrun: 'progress', connect: 'progress', shelf: 'progress', agent: 'decide', new: 'progress', inbox: 'detail', empty: 'progress', run: 'progress', expired: 'decide', library: 'detail', graph: 'detail', edit: 'detail', header: 'files', ask: 'detail', sources: 'files', advanced: 'detail', remove: 'detail', settings: 'progress', apikey: 'progress', licenses: 'progress', reader: 'detail' };
const LIB_OF = { inbox: 'mem', empty: 'mem', run: 'ev', expired: 'ev', library: 'mem', graph: 'mem', header: 'mem', ask: 'mem', sources: 'mem', advanced: 'mem' };
const BASE = { edit: 'library', apikey: 'settings', licenses: 'settings', remove: 'advanced' }; // 对话框画面：底下垫着哪一页
let screen = new URLSearchParams(location.search).get('screen');
if (!SCREENS.some(s => s[0] === screen)) screen = 'inbox';
let view = BASE[screen] || screen;
let tab = DEFAULT_TAB[screen];

// —— 外壳：和模板一样的三栏，右栏换成流息的四个标签 ——
const TABS = [['progress', '进度', 'progress'], ['decide', '待确认', 'sources'], ['detail', '详情', 'draft'], ['files', '文件', 'files']];
document.body.innerHTML = '<div class="prototype-bar"><a href="../../../' + encodeURI('总览.html') + '">' + icon('back') + ' 总览</a><b>' + themes.find(t => t[0] === theme)[1] + '</b><span>流息 · 新布局 · 方向稿</span><span class="spacer"></span><label>视觉 <select id="themeSelect">' + themes.map(t => '<option value="' + t[2] + '" ' + (t[0] === theme ? 'selected' : '') + '>' + t[1] + '</option>').join('') + '</select></label><label>画面 <select id="scenario">' + SCREENS.map(s => '<option value="' + s[0] + '">' + s[1] + '</option>').join('') + '</select></label><button id="simulate">下一个画面</button></div><div class="app"><aside class="sidebar" id="sidebar"></aside><main class="workspace"><header class="work-header" id="header"></header><section class="center" id="center"></section></main><aside class="context-panel"><div class="resize-handle" tabindex="0" role="separator" aria-label="调整右侧栏宽度" aria-orientation="vertical"></div><nav class="panel-tabs" role="tablist" aria-label="右栏">' + TABS.map(([id, n, ic]) => '<button class="tab" role="tab" id="tab-' + id + '" aria-controls="panel" data-tab="' + id + '">' + (visualEdition.tabIcons ? icon(ic) : '') + n + (id === 'decide' ? ' <small class="st-count">4</small>' : '') + '</button>').join('') + '</nav><div class="panel-scroll" id="panel" role="tabpanel"></div></aside></div><dialog class="dialog" id="dialog" aria-labelledby="dialogTitle"><div class="dialog-head"><h2 id="dialogTitle"></h2><button class="icon-btn" data-action="closeDialog" aria-label="关闭对话框">' + icon('close') + '</button></div><div class="dialog-body" id="dialogBody"></div></dialog><div id="toast" class="toast" role="status" aria-live="polite"></div>';

// —— 小零件（都是模板的部件）——
const sep = '<i class="sep"></i>';
const points = rows => '<dl class="decision-points">' + rows.map(([label, text], i) => '<div><dt><span class="point-index">' + String(i + 1).padStart(2, '0') + '</span>' + label + '</dt><dd>' + text + '</dd></div>').join('') + '</dl>';
const speaker = (name, role) => '<div class="speaker"><span class="avatar">' + icon('weave') + '</span>' + name + ' <small>' + role + '</small></div>';
const fileRow = (ic, text, small, tail = icon('arrow'), attr = '') => '<button class="file-row" ' + attr + '><span class="file-icon">' + icon(ic) + '</span><span class="file-text">' + text + '<small>' + small + '</small></span>' + tail + '</button>';
const chip = (t, dot) => '<span class="status-chip">' + (dot ? '<span class="dot"></span> ' : '') + t + '</span>';
const label = (t, action = '') => '<div class="section-label"><span>' + t + '</span>' + action + '</div>';
const filters = (items, on = -1, cls = '') => '<div class="filters ' + cls + '">' + items.map((n, i) => n === '|' ? '<span class="spacer"></span>' : '<button class="filter ' + (i === on ? 'active' : '') + '" data-go="' + n.replace(/<.*$/, '').trim() + '">' + n + '</button>').join('') + '</div>';
const chart = rows => '<div class="mini-chart">' + rows.map(([n, v, show]) => '<div class="chart-row"><span>' + n + '</span><div class="chart-track"><div class="chart-bar" style="--value:' + v + '%"></div></div><b>' + show + '</b></div>').join('') + '</div>';
const fold = (index, name, small, body, open) => '<details class="phase-row" ' + (open ? 'open' : '') + '><summary class="phase-heading"><span class="phase-index">' + index + '</span><span class="phase-label">' + name + '<small>' + small + '</small></span>' + icon('down') + '</summary><div class="phase-details">' + body + '</div></details>';
// 提议：就是模板的确认卡
function proposal({ title, sub, number, body, note, buttons }) {
  return '<article class="confirmation"><div class="confirm-top"><div class="confirm-title">' + icon('file') + '<div><h2>' + title + '</h2><small>' + sub + '</small></div></div>' + (number ? '<span class="confirm-number">' + number + '</span>' : '') + '</div><div class="card-body">' + body + '</div><div class="confirm-footer"><span class="muted">' + (note || '') + '</span><div class="row">' + buttons + '</div></div></article>';
}
const THREE = '<button class="btn quiet">拒绝</button><button class="btn">提出修改</button>';
const composer = (ph, who, help) => '<div class="composer-wrap"><form class="composer" onsubmit="return false"><textarea aria-label="' + who + '" placeholder="' + ph + '"></textarea><div class="composer-tools"><span class="chip">' + icon('spark') + ' ' + who + '</span><small>Shift + Enter 换行</small><button class="send-btn" type="submit" aria-label="发送">' + icon('send') + '</button></div></form><div class="compose-help">' + help + '</div></div>';
const libTabs = on => '<nav class="panel-tabs st-libtabs" aria-label="库内导航">' + [['待看', 'progress', view === 'run' ? '0' : '2'], ['资料库', 'sources'], ['问库', 'draft'], ['来源与要求', 'files']].map(([n, ic, count], i) => '<button class="tab ' + (i === on ? 'active' : '') + '" data-go="' + n + '">' + (visualEdition.tabIcons ? icon(ic) : '') + n + (count ? ' <small class="st-count">' + count + '</small>' : '') + '</button>').join('') + '</nav>';

// —— 左栏 ——
function sidebar() {
  const lib = LIB_OF[view];
  const running = view === 'run' || view === 'shelf';
  const state = { mem: running ? ['排队中 · 第 2 位', ''] : ['2 条待看', '2'], ev: running ? ['运行中 · 抓取', ''] : ['来源异常', ''] };
  $('#sidebar').innerHTML = '<a href="#shelf" class="brand" data-go="库架"><span class="brandmark">' + icon('weave') + '</span><span><span class="brandname">流息</span><small>个人资料库</small></span></a><nav class="side-nav"><a class="navitem new ' + (view === 'new' ? 'active' : '') + '" href="#new" data-go="新建库">' + icon('newProject', 'plus') + ' 新建库</a><a class="navitem ' + (view === 'shelf' ? 'active' : '') + '" href="#shelf" data-go="库架">' + sidebarIcon('allProjects', 'home') + ' 库架 <span class="spacer"></span><small>' + (view === 'firstrun' || view === 'connect' ? 0 : 2) + '</small></a><a class="navitem ' + (view === 'agent' ? 'active' : '') + '" href="#agent" data-go="主 Agent">' + icon('note') + ' 主 Agent</a></nav><div class="side-section"><span class="eyebrow">我的库</span>' + sidebarIcon('researchProjects', 'book') + '</div><div class="project-list">' + (view === 'firstrun' || view === 'connect' ? [] : Object.entries(LIBS)).map(([id, o]) => '<button class="project-item ' + (lib === id ? 'active' : '') + '" data-lib="' + id + '"><span class="project-name">' + o.title + '</span><span class="project-meta"><span class="dot"></span>' + state[id][0] + '<span class="spacer"></span><span data-badge="' + id + '">' + state[id][1] + '</span></span></button>').join('') + '</div><div class="side-footer"><div class="st-quota"><div class="section-label"><span>套餐用量</span><small class="muted">截至 20:36</small></div>' + chart([['5 小时', 8, '8%'], ['7 天', 26, '26%']]) + '</div><button class="navitem ' + (view === 'settings' ? 'active' : '') + '" data-go="设置">' + icon('settings') + ' 设置</button></div><div class="resize-handle" tabindex="0" role="separator" aria-label="调整左侧栏宽度" aria-orientation="vertical"></div>';
}

// —— 页头：库页常驻运行状态与运行按钮 ——
function header() {
  const lib = LIBS[LIB_OF[view]];
  let h1, meta, actions;
  if (lib) {
    h1 = lib.title; meta = lib.meta.map(m => '<span>' + m + '</span>').join(sep);
    actions = view === 'run'
      ? chip('运行中：抓取 · 模型调用 0 / 120', true) + '<button class="btn">' + icon('stop') + ' 停止</button>'
      : chip('下次运行 明天 08:00 · 预计 2–8 次模型调用') + '<button class="btn primary">' + icon('arrow') + ' 立即运行</button>';
  } else {
    h1 = { firstrun: '欢迎使用流息', connect: '连接模型', new: '新建库', shelf: '库架', agent: '主 Agent', settings: '设置', reader: '流息 · 阅读' }[view];
    meta = '<span>' + { firstrun: '说一句想追踪的内容，主 Agent 会生成建库提议，确认后才会创建。', connect: '流息通过该连接完成评分、摘要与问答。之后可在设置中更改。', new: '由主 Agent 生成，或手动填写。两种方式的默认值相同。', shelf: '共 2 个库 · 各库按各自的定时运行', agent: '创建库、调整库设置、查询各库情况。所有改动均以提议形式提交，确认后生效。', settings: '以下设置对本机的流息及全部库生效。', reader: '独立窗口 · 默认只保留正文' }[view] + '</span>';
    actions = view === 'shelf' ? chip('1 个运行中 · 1 个排队中', true) : view === 'agent' ? chip('1 项待确认', true) : view === 'settings' ? '<span class="chip">流息 1.0.0</span>' : view === 'reader' ? '' : chip('当前连接：连接你电脑上的 Claude Code');
  }
  $('#header').innerHTML = '<div class="project-heading"><h1>' + h1 + '</h1><div class="header-meta">' + meta + '</div></div><div class="header-actions">' + actions + '</div>';
}

// —— 主区的八个画面 ——
const inboxItem = (title, meta, score, what, pts, flag) => proposal({
  title, sub: meta, number: score,
  body: '<p class="intro-copy"><b>内容概述：</b>' + what + '</p>' + points(pts.map(p => ['', p])),
  note: flag ? chip(flag, true) : 'J / K 切换 · C 收藏 · D 放弃 · L 稍后处理',
  buttons: '<button class="btn quiet">稍后处理</button><button class="btn">放弃</button><button class="btn primary">' + icon('approve', 'check') + '收藏</button>',
});
const VIEWS = {
  shelf: () => '<div class="home-content"><span class="eyebrow">我的库 / LIBRARIES</span><h2 class="home-title">每天看新来的，存下值得的。</h2><p>每个库盯一组来源，按自己的定时运行。<br>通过筛选的内容进入待看，由你决定是否收藏。</p><div class="home-toolbar"><label class="search-field">' + icon('search') + '<input aria-label="搜索库" placeholder="搜索库"></label><a class="btn primary" href="#new">' + icon('newProject', 'plus') + ' 新建库</a></div><div id="projectTiles">'
    + [['mem', '排队中 · 第 2 位', '2 条待看 · 2 个来源正常', '上次运行 今天 20:35'], ['ev', '运行中 · 抓取', '0 条待看 · 1 个来源异常', '上次运行 今天 20:58']].map(([id, st, a, b]) => '<button class="project-tile" data-lib="' + id + '"><div class="row"><span class="eyebrow">' + b + '</span><span class="spacer"></span>' + chip(st, true) + '</div><h3>' + LIBS[id].title + '</h3><p>' + LIBS[id].brief + '</p><div class="project-tile-footer"><span>' + a + '</span><span>进入待看 ' + icon('arrow') + '</span></div></button>').join('') + '</div></div>',

  agent: () => '<div class="thread-scroll"><div class="thread"><div class="date-line">主 Agent · 今天</div><div class="user-message">我想追 AI agent 的长期记忆方案和评测，不要营销稿。来源先只用我常看的这个订阅：http://127.0.0.1:47831/feed.xml</div><div class="assistant-message">' + speaker('主 Agent', '管理全部库') + '<p class="intro-copy">已生成建库提议。来源仅包含你提供的这一个（试抓结果：正常 · 5 条）；严格程度暂定为「标准」，营销内容主要由「实质」环节过滤。点击「创建」后由流息创建该库，并立即开始首次运行。</p>'
    + proposal({ title: '创建库：AI Agent 长期记忆', sub: '主 Agent 提议 · 确认后生效', number: '1 项待确认',
      body: points([['追踪要求', '追踪 AI agent 的长期记忆方案与评测。只要有技术细节或数据的内容；不要营销稿、产品通稿、无数据的观点。'], ['严格程度', '标准（相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过）'], ['主题与来源', '记忆方案 · 记忆评测；来源 my-feed（试抓结果：正常 · 5 条）'], ['定时与上限', '每天 08:00 自动运行 · 单次运行最多 120 次模型调用']]),
      note: '存储位置：文档\\流息\\AI Agent 长期记忆', buttons: THREE + '<button class="btn primary">' + icon('approve', 'check') + '创建</button>' })
    + '</div></div></div>' + composer('向主 Agent 描述需求：创建库、调整设置、查询各库情况', '主 Agent', '每条消息消耗 1–2 次模型调用'),

  inbox: () => libTabs(0) + '<div class="thread-scroll"><div class="thread">' + label('待看 · 2 条 · 按评分排序', '<button>' + icon('plus') + ' 添加链接</button>')
    + '<div class="st-stack">' + inboxItem(T1, 'my-feed · 2026-11-10', '相关度 0.90 · 实质 0.85 · 新', '记忆工程周刊的一篇对比评测：用同一组 200 个多轮任务，在用户改口、隔天回来继续、同时开两件事三种情形下比较三种 agent 记忆方案。', ['摘要链每 6 轮压缩一次，平均每个任务多花 9% 的 token，但 200 个任务里有 31 个在第二天回来时用了已经作废的偏好。', '向量检索召回率最高，偏好类问题答对 87%，但不懂时间先后。', '分块记忆作废的偏好只出现了 4 次，总成本是摘要链的 1.6 倍。'])
    + inboxItem(T2, 'my-feed · 2026-11-09', '相关度 0.85 · 实质 0.80 · 后续', '公开 agent 记忆评测 MemBench 第二轮结果的报道，新增的「隔天回来」测试组暴露了开源方案的短板。', ['12 个参评开源方案里只有 3 个超过 60 分。', '成本和分数不成正比：分数最高的方案每个任务平均调用模型 22 次，第二名只要 9 次。'], '检测到面向 AI 的指令，已忽略') + '</div>'
    + fileRow('clip', 'https://example.org/agent-memory-survey', '手动添加 · 将在下次运行时评分', chip('待评分'))
    + '<div class="progress-alert">已放弃「双十一大促：向量数据库五折」。可选择原因：' + filters(['营销内容', '不相关', '内容过浅', '重复', '其他原因…']) + '<button class="btn quiet">撤销</button></div>'
    + fold('01', '稍后处理', '1 条 · 下次运行后重新列入待看', '')
    + fold('02', '未通过筛选', '3 条 · 不会入库', '<div class="progress-alert">追踪要求已于今天 20:39 更新，以下 2 条按旧要求评分。<button class="btn">重新评分（约 2 次模型调用）</button></div>'
      + [['向量库还是摘要链？一线团队的选型经验谈', '未通过实质 0.40 · 经验分享，缺少可核对的数据'], ['双十一大促：向量数据库五折', '未通过相关度 0.05 · 促销广告'], ['周末菜谱：十五分钟番茄牛腩', '未通过相关度 0.02 · 与该库无关']].map(([t, s]) => fileRow('file', t, s, '<span class="btn">移入待看</span>')).join(''), true)
    + '</div></div>',

  run: () => libTabs(0) + '<div class="thread-scroll"><div class="thread">' + label('待看 · 0 条') + '<div class="empty-state">' + icon('clock') + '<b>本次运行尚未完成</b>运行完成后，通过筛选的内容将显示在这里。运行期间可关闭窗口，任务会在后台继续。</div>'
    + label('本次运行 · 今天 20:56 开始 · 手动触发', '<button>' + icon('stop') + ' 停止</button>')
    + '<div class="progress-line"><span class="done"></span><span class="now"></span><span></span><span></span><span></span><span></span></div><div class="progress-caption"><span>1 / 6 个环节已完成</span><span>当前步骤：抓取</span></div>'
    + [['check', '运行前自检已通过'], ['clock', '正在抓取 2 个来源'], ['clock', '去重'], ['clock', '相关度评分'], ['clock', '实质评分'], ['clock', '摘要与核验']].map(([i, t]) => '<div class="step-line">' + icon(i) + '<span>' + t + '</span></div>').join('')
    + '</div></div>',

  library: () => libTabs(1) + '<div class="st-split"><div class="st-list"><label class="search-field">' + icon('search') + '<input aria-label="搜索资料库" placeholder="搜索标题、主题、正文…"></label>' + filters(['全部 3', '已收藏 2', '我的笔记 1'], 0) + filters(['记忆方案', '记忆评测', '最近 30 天', '图谱'])
    + '<div class="progress-alert">1 个文件缺少文件头，尚未入库。<button class="btn quiet" data-go="去处理">去处理</button></div>'
    + [[T1, '2026-11-10 / my-feed', '用同一组 200 个多轮任务对比三种记忆方案。', 1], [T2, '2026-11-09 / my-feed', '「隔天回来」测试组暴露了开源方案的短板。', 0], ['关于「隔天回来」的几点想法', '2026-11-10 / 我的笔记', '隔天回来这一组最接近真实使用。', 0]].map(([t, e, s, on]) => '<button class="source-card ' + (on ? 'selected' : '') + '" ' + (on ? 'aria-current="true"' : '') + '><div class="eyebrow"><span>' + e + '</span>' + icon('arrow') + '</div><h3>' + t + '</h3><p>' + s + '</p></button>').join('')
    + '</div><div class="reader"><div class="reader-header">' + chip('已收藏') + '<span class="spacer"></span><button class="btn quiet" data-go="编辑">编辑</button><button class="btn quiet" data-go="查看原文">' + icon('external') + ' 查看原文</button><button class="icon-btn" aria-label="更多">' + icon('down') + '</button></div><div class="reader-scroll"><article class="reader-paper"><span class="eyebrow">my-feed / 记忆评测</span><h2 class="reader-title">' + T1 + '</h2><div class="reader-meta">发布 2026-11-10 · 收藏 2026-11-10</div><div class="readable"><p><b>内容概述：</b>记忆工程周刊的一篇对比评测：用同一组 200 个多轮任务（平均 14 轮），在用户改口、隔天回来继续、同时开两件事三种情形下，比较了摘要链、向量检索、分块记忆三种 agent 记忆方案，并附评测脚本和全部任务可以复现。</p><ul><li>摘要链每 6 轮压缩一次，平均每个任务多花 9% 的 token，但 200 个任务里有 31 个在第二天回来时用了已经作废的偏好。</li><li>向量检索每次取最相近的 8 段，召回率在三种里最高，偏好类问题答对 87%，但它不懂时间先后。</li><li>分块记忆按身份、偏好、进行中的事分块，作废的偏好只出现了 4 次，代价是总成本为摘要链的 1.6 倍。</li></ul></div></article></div></div></div>',

  ask: () => libTabs(2) + '<div class="thread-scroll"><div class="thread"><div class="date-line">仅基于库内内容回答 · 范围：已收藏 2 条 · 我的笔记 1 条 · 不联网</div><div class="user-message">用户隔天回来继续任务时，哪种记忆方案表现最好？代价是什么？</div><div class="assistant-message">' + speaker('问库', '库内问答')
    + '<p class="intro-copy">库里的对比评测没有直接给出「隔天回来」情形下三种方案的排名。<span class="cite">2</span> 摘要链在 200 个任务里有 31 个在第二天回来时用了已经作废的偏好；<span class="cite">2</span> 分块记忆作废的偏好只出现了 4 次，代价是总成本为摘要链的 1.6 倍。<span class="cite">2</span> MemBench 第二轮「隔天回来」组，12 个开源方案只有 3 个超过 60 分。<span class="cite">1</span></p>'
    + fileRow('file', '1　' + T2, '2026-11-09 · my-feed') + fileRow('file', '2　' + T1, '2026-11-10 · my-feed')
    + '<div class="after-card"><span>库内缺少：「隔天回来」情形下三种方案的直接排名</span><span>·</span><button>' + icon('check') + ' 已加入待补充主题</button><span>·</span><button>反馈回答问题</button></div></div>'
    + '<div class="user-message">这个库单次运行最多调用 30 次就够了，帮我把上限改成 30。</div><div class="assistant-message">' + speaker('主 Agent', '已转交主 Agent')
    + proposal({ title: '修改单次运行上限', sub: '主 Agent 提议 · 确认后生效', number: 'AI Agent 长期记忆', body: points([['修改前', '单次运行最多 120 次模型调用'], ['修改后', '单次运行最多 30 次模型调用']]), note: '确认后记入变更记录', buttons: THREE + '<button class="btn primary">' + icon('approve', 'check') + '确认</button>' })
    + '</div></div></div>' + composer('提问，或描述希望对该库做出的调整', '问库', '每次提问约 4 次模型调用 · 如需调整来源、主题或要求，可直接描述'),

  sources: () => libTabs(3) + '<div class="thread-scroll"><form class="new-content" onsubmit="return false"><span class="eyebrow">来源与要求 / SOURCES &amp; BRIEF</span><h2>这个库追踪什么</h2><p>通常只需要改这一页；不常用的设置收在最下面的「高级设置」里。</p>'
    + '<label class="field"><span>库名称</span><input value="AI Agent 长期记忆"></label><label class="field"><span>追踪要求</span><textarea>追踪 AI agent 长期记忆的评测与对比数据：基准与评测方法、实验结果与消融、不同记忆方案的对比。框架作者的工程笔记、经验谈不要；营销稿、产品通稿不要。</textarea></label>'
    + label('严格程度', '<small class="muted">标准：相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过</small>') + filters(['宽松', '标准', '严格'], 1)
    + label('来源 · 2 个') + '<label class="search-field">' + icon('plus') + '<input aria-label="添加来源" placeholder="输入 RSS 地址、arXiv 检索词或 Hacker News 关键词，按回车添加"></label>'
    + fileRow('book', 'my-feed', 'RSS · http://127.0.0.1:47831/feed.xml · 上次成功抓取：今天 20:35', chip('正常 · 5 条')) + fileRow('book', 'arxiv-agent-memory', 'arXiv · "agent memory" evaluation · 非故障：本次运行无新内容', chip('无更新')) + fileRow('book', 'maker-notices', 'RSS · 对方服务器未响应，下次运行时自动重试', chip('暂时失败', true))
    + label('主题 · 2 个') + filters(['记忆方案 · 0 篇', '记忆评测 · 2 篇', '＋ 添加主题'])
    + label('定时与上限') + '<div class="form-row"><label class="field"><span>每天自动运行的时间</span><input value="08:00"></label><label class="field"><span>单次运行最多模型调用（次）</span><input value="30"></label></div>'
    + '<div class="form-footer"><button class="btn primary">保存 ' + icon('check') + '</button><small>下次运行：明天 08:00。达到上限后停止，剩余内容留待下次运行处理。</small></div>'
    + '<button class="document-link" data-go="高级设置">' + icon('settings') + '<span>高级设置</span><small>提示词、变更记录、库文件夹 · 通常无需修改</small>' + icon('arrow') + '</button></form></div>',

  settings: () => '<div class="thread-scroll"><form class="new-content" onsubmit="return false"><span class="eyebrow">设置 / SETTINGS</span><h2>连接、外观与用量</h2><p>各库的来源、要求与定时，请在该库的「来源与要求」中设置。</p>'
    + label('连接', '<small class="muted">评分、摘要、问库与主 Agent 均使用当前连接的主模型</small>')
    + fileRow('spark', '连接你电脑上的 Claude Code', '版本 2.1.287 · 已登录 · 主模型 默认 · 核验模型 同主模型', chip('当前使用', true)) + fileRow('spark', '连接你电脑上的 Codex', '版本 0.44 · 已登录 · 主模型 默认 · 核验模型 同主模型', '<span class="btn">设为当前连接</span>') + fileRow('spark', '输入 API key', '未配置 · 按量计费', '<span class="btn">配置</span>')
    + label('外观与语言') + filters(themes.map(t => t[1].split(' · ')[0]), themes.findIndex(t => t[0] === theme))
    + '<div class="form-row"><label class="field"><span>外观</span><select><option>跟随系统</option><option>浅色</option><option>深色</option></select></label><label class="field"><span>语言</span><select><option>跟随系统（当前：中文）</option><option>中文</option><option>English</option></select></label></div>'
    + label('库与用量', '<small class="muted">本月用量合计：23 次模型调用</small>') + chart([['AI Agent 长期记忆', 78, '18'], ['中国电动车', 0, '0'], ['主 Agent', 22, '5']])
    + '<label class="field"><span>新建库默认存储位置</span><input value="C:\\Users\\you\\Documents\\流息"></label>'
    + label('关于') + fileRow('download', '流息 1.0.0（Windows 版）', '由 Starry Digital 开发 · MIT · 许可证与致谢', '<span class="btn">检查更新</span>')
    + '<div class="progress-alert">发现新版本 1.0.1（2026-11-12）。将在当前运行结束后更新。<button class="btn primary">下载并更新</button><button class="btn quiet">稍后提醒</button></div></form></div>',
};

// —— 其余画面（方向定了以后补的）——
const field = (name, control) => '<label class="field"><span>' + name + '</span>' + control + '</label>';
const go2 = (cls, text, to) => '<button class="' + cls + '" data-go="' + (to || text) + '">' + text + '</button>';
const lastRun = (done) => chart(done ? [['已抓取', 100, '5'], ['去重后新增', 100, '5'], ['通过相关度', 60, '3'], ['通过实质', 40, '2'], ['进入待看', 40, '2']] : [['已抓取', 100, '1'], ['去重后新增', 100, '1'], ['通过相关度', 0, '—'], ['进入待看', 0, '—']]);
Object.assign(VIEWS, {
  firstrun: () => '<div class="thread-scroll"><form class="new-content" onsubmit="return false"><span class="eyebrow">首次打开 / WELCOME</span><h2>你想追踪什么内容？</h2><p>用一句话描述需求，主 Agent 将据此生成建库提议（来源、主题、严格程度），确认后才会创建。</p>'
    + fileRow('spark', '当前连接：连接你电脑上的 Claude Code', '版本 2.1.287 · 已登录 · 用量计入你的套餐', go2('btn', '更换连接'))
    + label('示例（点击填入输入框，可修改后发送）')
    + ['帮我建个库，追踪中国电动车行业，重点是整车销量、电池和充电。', '我想跟踪 AI agent 的新工具和评测，不要营销稿。', '帮我盯着几家中国时尚上市公司的财报和新品。'].map(t => fileRow('note', t, '点击填入')).join('')
    + field('想追踪的内容', '<textarea placeholder="描述想追踪的内容、需要排除的内容，以及常用的来源地址"></textarea>')
    + '<div class="form-footer"><button class="btn primary">发送 ' + icon('arrow') + '</button>' + go2('btn quiet', '手动创建') + '<button class="btn quiet">暂不创建，先进入应用</button></div></form></div>',

  connect: () => '<div class="thread-scroll"><form class="new-content" onsubmit="return false"><span class="eyebrow">连接 / CONNECTION</span><h2>选择一种连接方式</h2><p>三种方式任选其一。点击「前往登录」将打开终端窗口，由该工具自行完成登录，流息不接触账号密码。</p>'
    + fileRow('spark', '连接你电脑上的 Claude Code', '推荐 · 已找到 2.1.287 · 未登录 · 用量计入你的套餐', '<span class="btn primary">前往登录</span>') + '<div class="after-card"><button>已登录，重新检测</button></div>'
    + fileRow('spark', '连接你电脑上的 Codex', '已找到 0.44 · 已登录 · 用量计入你的套餐', '<span class="btn">使用此连接</span>')
    + fileRow('spark', '输入 API key', '支持任意厂商 · 按量计费', '<span class="btn">配置</span>')
    + '<div class="form-footer"><button class="btn">重新检测</button><button class="btn quiet">暂时跳过，稍后在设置中连接</button></div></form></div>',

  new: () => '<div class="thread-scroll"><form class="new-content" onsubmit="return false"><span class="eyebrow">新建库 / NEW LIBRARY</span><h2>这个库追踪什么</h2>' + filters(['由主 Agent 生成', '手动填写'], 1)
    + field('库名称', '<input value="中国电动车">') + field('追踪要求', '<textarea>追踪中国新能源车的月度数据：乘用车零售与批发、渗透率、动力电池装车量与技术路线。不要车型评测、促销和软文。</textarea>')
    + label('严格程度', '<small class="muted">标准：相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过</small>') + filters(['宽松', '标准', '严格'], 1)
    + label('来源') + '<label class="search-field">' + icon('plus') + '<input aria-label="添加来源" placeholder="输入 RSS 地址、arXiv 检索词或 Hacker News 关键词，按回车添加"></label>'
    + fileRow('book', 'ev-news', 'RSS · http://127.0.0.1:47831/ev.xml · 最新：「10 月乘用车零售数据」', chip('正常 · 2 条')) + fileRow('book', 'maker-notices', 'RSS · 对方服务器未响应。可先添加，下次运行时将自动重试', chip('暂时失败', true))
    + '<button class="document-link">' + icon('book') + '<span>使用预设来源包：AI Agent 工具</span><small>3 个主题 · 9 个来源 · 添加后可逐个移除</small>' + icon('arrow') + '</button>'
    + label('主题（选填）') + filters(['月度数据', '＋ 添加主题'])
    + '<div class="form-row">' + field('存储位置', '<input value="文档\\流息\\中国电动车">') + field('每天自动运行的时间', '<input value="08:00">') + '</div>'
    + '<div class="form-footer"><button class="btn primary">创建并运行 ' + icon('arrow') + '</button><button class="btn">仅创建</button><button class="btn quiet">取消</button><small>创建后立即开始首次运行，预计 3–9 次模型调用。也可选择已包含 .md 文件的文件夹，流息不移动、不修改原有文件。</small></div></form></div>',

  empty: () => libTabs(0) + '<div class="thread-scroll"><div class="thread">' + label('待看 · 0 条', '<button>' + icon('plus') + ' 添加链接</button>')
    + '<div class="empty-state">' + icon('check') + '<b>暂无待看内容</b>下次运行：明天 08:00。</div>'
    + label('上次运行 · 今天 20:35') + lastRun(true) + '<p class="limit-note">处理情况：收藏 2 · 放弃 0 · 稍后处理 0。模型调用 13 次 = 运行前自检 1 + 相关度 5 + 实质 3 + 摘要 2 + 核验 2。</p>'
    + label('最近收藏') + fileRow('file', T1, 'my-feed · 今天收藏') + fileRow('file', T2, 'my-feed · 今天收藏')
    + fold('01', '未通过筛选', '3 条 · 不会入库', '') + '</div></div>',

  expired: () => libTabs(0) + '<div class="thread-scroll"><div class="thread"><div class="progress-alert"><b>连接你电脑上的 Claude Code 登录已过期，本次运行未完成评分。</b>已抓取的 1 条内容已保留。请点击「前往登录」，在打开的窗口中完成登录后，点击「已登录，重试」。<button class="btn primary">前往登录</button><button class="btn">已登录，重试</button>' + go2('btn quiet', '更换连接方式', '设置') + '</div>'
    + label('待看 · 0 条') + '<div class="empty-state">' + icon('clock') + '<b>有 1 条内容已抓取、尚未评分</b>重试后将继续处理。</div>'
    + label('上次运行 · 今天 21:02 · 未完成') + [['check', '已抓取 1 条（3 个来源），去重后新增 1 条'], ['clock', '自检未通过：登录过期'], ['clock', '评分、摘要与核验未开始']].map(([i, t]) => '<div class="step-line">' + icon(i) + '<span>' + t + '</span></div>').join('') + '</div></div>',

  graph: () => libTabs(1) + '<div class="st-list">' + filters(['列表', '图谱', '|', '最近 30 天', '全部'], 1) + '</div><div class="st-graph"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" vector-effect="non-scaling-stroke">'
    + [[25, 14, 50, 48], [72, 14, 50, 48], [50, 48, 20, 84], [50, 48, 50, 84]].map(([a, b, c, d]) => '<path vector-effect="non-scaling-stroke" d="M' + a + ' ' + b + 'L' + c + ' ' + d + '"/>').join('')
    + '<path vector-effect="non-scaling-stroke" stroke-dasharray="4 4" d="M72 14L80 84"/><path vector-effect="non-scaling-stroke" stroke-dasharray="4 4" d="M20 90Q50 100 80 90"/></g></svg>'
    + [['主题', 4, 14, 'eyebrow'], ['来源', 4, 48, 'eyebrow'], ['条目', 4, 84, 'eyebrow']].map(([t, x, y, c]) => '<span class="' + c + ' st-node" style="left:' + x + '%;top:' + y + '%">' + t + '</span>').join('')
    + [['记忆方案 · 0', 25, 14, 0], ['记忆评测 · 2', 72, 14, 1], ['my-feed · 2', 50, 48, 0], ['三种记忆方案的对比评测', 20, 84, 0], ['MemBench 第二轮结果', 50, 84, 0], ['关于「隔天回来」的几点想法', 80, 84, 0]].map(([t, x, y, on]) => '<button class="filter st-node ' + (on ? 'active' : '') + '" style="left:' + x + '%;top:' + y + '%">' + t + '</button>').join('') + '</div>',

  header: () => libTabs(1) + '<div class="thread-scroll"><div class="thread"><div class="after-card">' + go2('', icon('back') + ' 返回资料库', '资料库') + '</div>' + label('1 个文件缺少文件头', '<button>全部写入</button>')
    + '<p class="intro-copy">这些文件已存在于库文件夹中（例如在 Obsidian 中创建的笔记），流息尚未对其做任何修改。写入文件头后方可入库，正文内容不会被改动。</p>'
    + proposal({ title: '关于隔天回来的几点想法.md', sub: 'notes\\ · 缺少文件头', number: '尚未入库',
      body: field('建议的文件头（可编辑）', '<textarea>id: 2026-11-10-关于隔天回来的几点想法\ntitle: 关于「隔天回来」的几点想法\nsource: 我的笔记\ndate: 2026-11-10\ntopics: [记忆评测]</textarea>'),
      note: '只写入文件头，正文不变', buttons: '<button class="btn quiet">跳过</button><button class="btn primary">' + icon('approve', 'check') + '写入</button>' }) + '</div></div>',

  advanced: () => libTabs(3) + '<div class="thread-scroll"><form class="new-content" onsubmit="return false"><div class="after-card">' + go2('', icon('back') + ' 返回来源与要求', '来源与要求') + '</div><span class="eyebrow">高级设置 / ADVANCED</span><h2>评分环节、变更记录与库文件夹</h2><p>通常无需修改。</p>'
    + fold('01', '评分环节', '各环节的提示词、通过阈值与校验规则', [['file', '抓取 · 固定'], ['file', '去重 · 脚本'], ['spark', '环节 ① 相关度 · 通过阈值 0.5（正在编辑）'], ['spark', '环节 ② 实质 · 通过阈值 0.6'], ['spark', '摘要与核验'], ['check', '人工确认 · 固定'], ['file', '入库 · 固定']].map(([i, t]) => '<div class="step-line">' + icon(i) + '<span>' + t + '</span></div>').join('')
      + '<p class="limit-note">固定节点不可删除或修改；评分环节不向模型提供任何工具。</p>'
      + field('环节 ① 相关度 · 提示词（可编辑）', '<textarea>判断这条资料和这个库的追踪要求有多相关，给 0 到 1 的分数。看实质，不看关键词；拿不准就打低分（不超过 0.5）。</textarea>')
      + '<div class="form-row">' + field('通过阈值', '<input value="0.5">') + field('材料', '<select><option>仅标题、来源、摘要</option><option>读取正文</option></select>') + '</div>'
      + label('校验规则') + '<div class="step-line">' + icon('check') + '<span>理由所引用的原文必须出自材料（内置规则，不可删除）</span></div><div class="step-line">' + icon('check') + '<span>输出格式固定（内置规则，不可删除）</span></div>' + field('添加自定义校验规则', '<input placeholder="输入一条规则，按回车添加">')
      + '<div class="form-footer"><button class="btn primary">保存</button><button class="btn quiet">恢复默认</button><small>手动修改通过阈值后，「严格程度」将显示为「自定义」。</small></div>'
      + label('单条测试') + '<div class="form-row">' + field('选择一条近期抓取的内容', '<select><option>双十一大促：向量数据库五折</option></select>') + field('测试结果', '<input value="相关度 0.05 · 校验全部通过 · 不写入任何记录" readonly>') + '</div><div class="form-footer"><button class="btn">开始测试（1 次模型调用）</button></div>'
      + label('上次运行各环节数据') + lastRun(true), true)
    + fold('02', '变更记录', '该库各项设置的修改时间与操作来源', [['今天 20:52 · 主题：为「记忆评测」添加 2 个关键词', '操作来源：手动修改'], ['今天 20:44 · 单次运行上限 120 → 30', '操作来源：主 Agent 提议 · 已确认'], ['今天 20:39 · 追踪要求：仅保留评测与对比数据', '操作来源：主 Agent 提议 · 已确认'], ['今天 20:35 · 创建库', '操作来源：主 Agent 提议 · 已确认；评分环节为初始设置']].map(([t, s]) => '<div class="activity-row">' + t + '<small>' + s + '</small></div>').join(''), true)
    + fold('03', '库文件夹', 'C:\\Users\\you\\Documents\\流息\\AI Agent 长期记忆', '<div class="form-footer"><button class="btn">' + icon('external') + ' 在资源管理器中显示</button><button class="btn">重建索引</button>' + go2('btn quiet', '移除该库') + '<small>移除后，该库不再显示在「我的库」中，也不再定时运行；文件不会被删除。</small></div>', true)
    + '</form></div>',

  reader: () => '<div class="reader"><div class="reader-header"><button class="btn quiet" data-go="资料库">' + icon('back') + ' 返回条目</button><label class="search-field">' + icon('external') + '<input aria-label="地址" readonly value="http://127.0.0.1:47831/posts/memory-three-ways.html"></label>' + filters(['阅读模式', '原网页'], 0) + '<button class="btn quiet">' + icon('external') + ' 在浏览器中打开</button></div><div class="reader-scroll"><article class="reader-paper"><span class="eyebrow">阅读模式 / 仅保留正文，已移除导航与广告</span><h2 class="reader-title">' + T1 + '</h2><div class="reader-meta">my-feed · 发布 2026-11-10</div><div class="readable"><p>我们用同一组 200 个多轮任务（平均 14 轮），在用户改口、隔天回来继续、同时开两件事三种情形下，比较了摘要链、向量检索、分块记忆三种 agent 记忆方案。</p><p>摘要链每 6 轮压缩一次，平均每个任务多花 9% 的 token，但 200 个任务里有 31 个在第二天回来时用了已经作废的偏好。向量检索每次取最相近的 8 段，召回率在三种里最高，偏好类问题答对 87%，但它不懂时间先后，常把改口前后的两句都取回来。</p><p>分块记忆按身份、偏好、进行中的事分块，作废的偏好只出现了 4 次，代价是每轮多一次模型调用，总成本是摘要链的 1.6 倍。</p></div><div class="reader-note">抽取不出正文时，将显示原网页并说明原因。</div></article></div></div>',
});
const DIALOGS = {
  edit: ['编辑笔记', () => '<form class="new-content" onsubmit="return false">' + field('标题', '<input value="' + T2 + '">') + label('主题') + filters(['记忆评测 ✕', '＋ 添加主题'])
    + field('正文（Markdown）', '<textarea>**内容概述：** 公开 agent 记忆评测 MemBench 第二轮结果的报道……\n\n我的看法：隔天回来这一组最接近真实使用。</textarea>')
    + '<div class="form-footer"><button class="btn primary">保存</button><button class="btn">插入链接</button><button class="btn quiet">取消</button><small>仅可修改标题、主题、正文和链接；来源、日期、评分为记录字段，不可修改。</small></div></form>'],
  apikey: ['输入 API key', () => '<form class="new-content" onsubmit="return false">' + field('厂商', '<select><option>选择预设…</option><option>自定义接口地址</option></select>') + field('接口地址', '<input placeholder="https://…">') + field('API key', '<input type="password" placeholder="请输入 API key">')
    + '<div class="form-footer"><button class="btn primary">保存</button><button class="btn quiet">取消</button><button class="btn quiet">删除 API key</button><small>API key 仅保存在本机的系统凭据保护中，不会写入任何库文件夹。费用按量计入对应账户。</small></div></form>'],
  licenses: ['许可证与致谢', () => '<div class="readable"><p><b>流息本身 · MIT</b></p><p>Copyright (c) 2026 Starry Digital。Permission is hereby granted, free of charge, to any person obtaining a copy of this software……</p></div>'
    + fileRow('file', '界面字体 · Noto Sans SC', 'SIL Open Font License 1.1') + fileRow('file', '标题字体 · Noto Serif SC', 'SIL Open Font License 1.1') + fileRow('file', 'Electron', 'MIT') + fileRow('file', 'better-sqlite3', 'MIT') + fileRow('file', 'fast-xml-parser', 'MIT')
    + '<div class="form-footer"><button class="btn">查看完整第三方声明</button><button class="btn primary">关闭</button></div>'],
  remove: ['移除「AI Agent 长期记忆」？', () => '<div class="readable"><p>仅取消登记：该库将不再显示在「我的库」中，也不再定时运行。</p><p><b>文件夹及其中的文件不会被删除。</b>如需恢复，可在「新建库 → 手动填写 → 存储位置」中选择该文件夹。</p><p>C:\\Users\\you\\Documents\\流息\\AI Agent 长期记忆</p></div><div class="form-footer"><button class="btn primary">移除</button><button class="btn quiet">取消</button></div>'],
};
const homeContext = () => '<div class="home-context"><span class="eyebrow">流息怎样工作</span><h3>' + (view === 'new' ? '把要求写清楚' : '从一句话开始') + '</h3><p>每个库盯一组来源，按自己的定时运行。通过筛选的内容进入待看，由你决定是否收藏。</p><div class="section-label">一次运行做什么</div><ol><li>抓取来源并去重</li><li>按追踪要求评分：相关度、实质</li><li>为通过筛选的内容生成摘要并核验</li><li>进入待看，等你收藏或放弃</li></ol><div class="progress-alert">只有收藏的内容会写成库文件夹里的笔记。所有改动均需确认后才会执行。</div><div class="section-label">用量</div><p>仅在调用模型时消耗用量；抓取、去重、排队不消耗。</p></div>';

// —— 右栏的四个标签 ——
const libRun = (i, name, small, steps, dots, open) => '<details class="phase-row ' + (open ? 'current' : '') + '" ' + (open ? 'open' : '') + '><summary class="phase-heading"><span class="phase-index">' + i + '</span><span class="phase-label">' + name + '<small>' + small + '</small></span>' + icon('down') + '</summary><div class="phase-details"><span class="step-dots">' + dots.map(d => '<i class="' + d + '"></i>').join('') + '</span>' + steps.map(([ic, t]) => '<div class="step-line">' + icon(ic) + '<span>' + t + '</span></div>').join('') + '</div></details>';
const smallCard = (from, title, text, buttons) => '<article class="confirmation"><div class="card-body"><span class="eyebrow">' + from + '</span><h3>' + title + '</h3><p class="muted">' + text + '</p></div><div class="confirm-footer"><div class="row">' + buttons + '</div></div></article>';
const PANELS = {
  progress: () => {
    if (view === 'firstrun' || view === 'connect' || view === 'new') return homeContext();
    const busy = view === 'run' || view === 'shelf';
    return '<div class="panel-summary"><span class="eyebrow">运行进度 / 全部库</span><h2>' + (busy ? '1 个运行中 · 1 个排队中' : '当前无运行任务') + '</h2><p>同一时间仅运行一个库，其余按顺序自动执行。</p><div class="progress-line"><span class="' + (busy ? 'now' : 'done') + '"></span><span></span></div><div class="progress-caption"><span>' + (busy ? '队列里有 2 个库' : '上次运行 今天 20:35') + '</span><span>' + (busy ? '手动触发' : '已完成') + '</span></div></div>'
      + (busy
        ? libRun('01', '中国电动车', '运行中 · 抓取', [['check', '运行前自检已通过'], ['clock', '正在抓取 2 个来源'], ['clock', '评分、摘要与核验尚未开始']], ['complete', 'wait', ''], true) + chart([['模型调用', 0, '0 / 120']])
          + libRun('02', 'AI Agent 长期记忆', '排队中 · 第 2 位', [['clock', '手动触发 · 20:56 加入队列'], ['clock', '前一任务完成后自动开始']], ['', '', ''], false)
        : libRun('01', 'AI Agent 长期记忆', '上次运行 今天 20:35', [['check', '已抓取 5 条，去重后新增 5 条'], ['check', '通过相关度 3 条，通过实质 2 条'], ['check', '进入待看 2 条']], ['complete', 'complete', 'complete'], true)
          + chart([['已抓取', 100, '5'], ['通过相关度', 60, '3'], ['通过实质', 40, '2'], ['进入待看', 40, '2']]) + '<p class="limit-note">模型调用 13 次（含运行前自检 1 次）</p>')
      + '<div class="panel-section">' + label('下次运行时间') + '<div class="activity-row">AI Agent 长期记忆<small>明天 08:00</small></div><div class="activity-row">中国电动车<small>明天 08:30</small></div></div>';
  },
  decide: () => view === 'expired'
    ? '<div class="panel-summary"><span class="eyebrow">待确认 / 全部库</span><h2>2 项</h2><p>以下事项均需确认后才会执行。</p></div><div class="st-stack">'
      + smallCard('系统检测 / 中国电动车', '来源「blog-x」地址无效', '连续 2 次运行无法访问该地址（404）。建议：更新为当前可用的订阅地址，或暂停该来源。', '<button class="btn quiet">忽略</button><button class="btn">暂停该来源</button><button class="btn primary">修改地址</button>')
      + smallCard('系统检测 / 中国电动车', '连续 3 次运行无内容进入待看', '3 次运行共抓取 4 条，相关度最高 0.35（通过阈值 0.7）。', '<button class="btn quiet">忽略</button><button class="btn">交由主 Agent 分析</button><button class="btn primary">将严格程度调整为「标准」</button>') + '</div>'
    : '<div class="panel-summary"><span class="eyebrow">待确认 / 全部库</span><h2>4 项</h2><p>以下事项均需确认后才会执行。</p></div><div class="st-stack">'
    + smallCard('主 Agent 提议 / AI Agent 长期记忆', '修改追踪要求', '修改后：仅保留评测与对比数据；排除工程笔记与经验分享。', '<button class="btn quiet">拒绝</button><button class="btn">提出修改</button><button class="btn primary">确认</button>')
    + smallCard('系统检测 / 中国电动车', '来源「maker-notices」连续 3 次运行抓取失败', '暂时失败 ×3（对方服务器未响应）。', '<button class="btn quiet">暂不处理</button><button class="btn">修改地址</button><button class="btn primary">暂停该来源</button>')
    + smallCard('系统检测 / AI Agent 长期记忆', '近 3 次放弃的原因均为「营销内容」', '是否将其加入该库的追踪要求？主 Agent 将生成修改提议供确认。', '<button class="btn quiet">暂不需要</button><button class="btn primary">生成修改提议</button>')
    + smallCard('系统检测 / AI Agent 长期记忆', '来源「my-feed」的内容中检测到 1 处面向 AI 的指令', '流息已忽略该指令，未执行，设置未被更改。', '<button class="btn quiet">暂停该来源</button><button class="btn primary">知道了</button>') + '</div>',
  detail: () => {
    if (view === 'ask') return '<div class="panel-summary"><span class="eyebrow">详情 / 当前回答</span><h2>引用了 2 篇笔记</h2><p>命中 3 条 · 引用 2 条 · 模型调用 4 次 · 核验 2 轮均通过 · 模型未获得任何工具权限，未联网</p></div><div class="panel-section">' + label('本次回答依据') + fileRow('file', T2, '2026-11-09 · my-feed') + fileRow('file', T1, '2026-11-10 · my-feed') + '</div><div class="panel-section">' + label('待补充主题（1）') + '<div class="activity-row">「隔天回来」情形下三种方案的直接排名<small>已提问 1 次 · 提问达 3 次的内容将建议添加为主题</small></div></div>';
    if (view === 'graph') return '<div class="panel-summary"><span class="eyebrow">详情 / 当前节点</span><h2>主题：记忆评测</h2><p>2 篇 · 关键词 8 个</p></div><div class="panel-section">' + label('该主题下的内容') + fileRow('file', T1, '2026-11-10 · my-feed') + fileRow('note', '关于「隔天回来」的几点想法', '我的笔记') + '</div>';
    if (!LIB_OF[view] || ['sources', 'run', 'advanced', 'header', 'empty', 'expired'].includes(view)) return '<div class="panel-summary"><span class="eyebrow">详情</span><h2>当前页面未选中任何内容</h2><p>在待看、资料库、问库里选中一项，这里显示它的详情。</p></div>';
    const lib = view === 'library';
    return '<div class="panel-summary"><span class="eyebrow">详情 / ' + (lib ? '当前笔记' : '当前条目') + '</span><h2>三种记忆方案的对比评测</h2><p>' + T1 + '<br>my-feed · 发布 2026-11-10 · ' + (lib ? '收藏 2026-11-10' : '首次抓取 今天 20:35') + '</p></div>'
      + '<div class="panel-section">' + label(lib ? '入选理由' : '推荐理由') + points([['相关度 0.90', '一篇评测文章：用同一组 200 个多轮任务对比三种记忆方案的召回率、成本和出错方式，与「记忆方案与评测」高度相关。'], ['实质 0.85', '包含具体数据：摘要链 31 个任务用了作废偏好，向量检索偏好题答对 87%，分块记忆成本为 1.6 倍。'], ['新鲜度', '新：库内没有同一实验的内容。']]) + '</div>'
      + '<div class="panel-section">' + label('核验') + '<div class="step-line">' + icon('check') + '<span>核验通过</span></div><div class="step-line">' + icon('check') + '<span>未检测到面向 AI 的指令</span></div>'
      + '<details class="phase-row"><summary class="phase-heading"><span class="phase-index">' + icon('file') + '</span><span class="phase-label">核验记录<small>相关度 4 项 · 实质 5 项 · 摘要 6 项 · 全部通过</small></span>' + icon('down') + '</summary><div class="phase-details"></div></details></div>'
      + (lib ? '<div class="panel-section">' + label('反向链接') + fileRow('note', '关于「隔天回来」的几点想法', '我的笔记') + label('同来源内容') + fileRow('file', T2, '2026-11-09 · my-feed') + '</div>' : '');
  },
  files: () => '<div class="panel-summary"><span class="eyebrow">文件 / 库的文件结构</span><h2>AI Agent 长期记忆</h2><p>文档\\流息\\AI Agent 长期记忆</p></div>' + label('笔记（3）· 按主题')
    + fileRow('file', T1, '记忆评测 · notes\\2026-11-10-….md') + fileRow('note', '关于「隔天回来」的几点想法', '记忆评测 · 我的笔记') + fileRow('file', T2, '未分类 · notes\\2026-11-09-….md')
    + '<div class="panel-section">' + label('其它') + fileRow('clock', '待看（2）', '尚未生成文件') + fileRow('settings', '该库的来源与要求', 'streams.json') + fileRow('book', '程序记录', '无需修改 · _pipeline') + '</div><button class="btn" style="margin-top:22px;width:100%">' + icon('external') + ' 在资源管理器中显示</button>',
};
function panel() {
  $$('.context-panel .panel-tabs .tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  $('#panel').innerHTML = PANELS[tab]();
  if (document.body.classList.contains('r11')) for (const phase of $$('#panel .phase-row')) {
    const dots = phase.querySelector('.step-dots'), status = phase.querySelector('.phase-label small');
    if (dots && status) status.append(dots); // 和模板一样：把进度点放到阶段状态旁
  }
}

// —— 渲染与切换 ——
function render() {
  view = BASE[screen] || screen;
  document.body.dataset.state = view === 'run' ? 'running' : 'waiting';
  document.body.dataset.screen = screen;
  $('.app').classList.toggle('st-window', view === 'reader');
  sidebar(); header(); $('#center').innerHTML = VIEWS[view](); panel();
  if (view === 'agent' || view === 'ask') { const t = $('.thread-scroll'); t.scrollTop = t.scrollHeight; } // 像真的对话一样停在最新一条
  const dlg = $('#dialog');
  if (dlg.open) dlg.close();
  if (DIALOGS[screen]) { $('#dialogTitle').textContent = DIALOGS[screen][0]; $('#dialogBody').innerHTML = DIALOGS[screen][1](); dlg.showModal(); }
  $('#scenario').value = screen;
  history.replaceState(null, '', '?screen=' + screen);
}
function go(to) { screen = to; tab = DEFAULT_TAB[to]; render(); }
const GO = { '库架': 'shelf', '主 Agent': 'agent', '设置': 'settings', '待看': 'inbox', '资料库': 'library', '问库': 'ask', '来源与要求': 'sources', '新建库': 'new', '图谱': 'graph', '列表': 'library', '高级设置': 'advanced', '编辑': 'edit', '去处理': 'header', '查看原文': 'reader', '手动填写': 'new', '手动创建': 'new', '由主 Agent 生成': 'agent', '更换连接': 'connect', '移除该库': 'remove', '配置': 'apikey', '许可证与致谢': 'licenses' };
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="closeDialog"]')) { go(BASE[screen] || screen); return; }
  const t = e.target.closest('[data-tab],[data-go],[data-lib]');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; panel(); return; }
  if (t.dataset.lib) { e.preventDefault(); go(t.dataset.lib === 'ev' ? 'run' : 'inbox'); return; }
  const to = GO[t.dataset.go]; if (to) { e.preventDefault(); go(to); }
});
$('#scenario').onchange = e => go(e.target.value);
$('#simulate').onclick = () => go(SCREENS[(SCREENS.findIndex(s => s[0] === screen) + 1) % SCREENS.length][0]);
$('#themeSelect').onchange = e => { location.href = '../' + encodeURI(e.target.value) + '/index.html?screen=' + screen; };
window.streamsDesign = { go, screens: SCREENS.map(s => s[0]), setTab: t => { tab = t; panel(); } };
render();
