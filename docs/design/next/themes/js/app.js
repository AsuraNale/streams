'use strict';
// 设计稿的渲染：三栏（左栏方案 B · 主区 · 右栏四个标签），7 个画面。没有演示层：不存 localStorage、没有模拟回复的计时器。
// 外部能设的状态（截图脚本用）：URL 参数 ?screen=&theme=&appearance=&quota=&tab=&panel=&bar=&menu=，
// 或 window.streamsDesign.set({ screen, theme, appearance, quota, tab, panel, menu })，返回渲染后的状态。
(() => {
  const D = window.STREAMS_DATA;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lib = id => D.libraries.find(l => l.id === id);

  const SCREENS = ['shelf', 'chat', 'inbox', 'library', 'ask', 'settings', 'queue'];
  const THEMES = { precision: '精密国际主义', glass: '澄明玻璃', research: '研究对话' };
  const APPEARANCES = ['system', 'light', 'dark'];
  const QUOTAS = ['claude', 'codex', 'api', 'unreadable', 'none'];
  const TABS = ['progress', 'decide', 'detail', 'files'];
  // 每个画面打开时右栏默认停在哪个标签
  const DEFAULT_TAB = { shelf: 'progress', chat: 'detail', inbox: 'detail', library: 'detail', ask: 'detail', settings: 'progress', queue: 'progress' };

  const state = { screen: 'shelf', theme: 'precision', appearance: 'system', quota: 'claude', tab: null, panel: 'open', inboxSel: 0, noteSel: [0, 0], menu: false };

  const icon = (name, cls = '') => {
    const set = window.STREAMS_ICONS[state.theme] || window.STREAMS_ICONS.precision;
    const d = set[name] || set.file;
    return `<svg class="ico ${cls}" data-glyph="${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  };
  const libMark = l => `<span class="lib-mark lib-mark--${l.color}" aria-hidden="true">${esc(l.mark)}</span>`;
  const screenLib = () => (state.screen === 'queue' ? lib('on') : lib('lt'));

  // ---------- 外观 ----------
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function applyLook() {
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    root.dataset.appearancePref = state.appearance;
    root.dataset.appearance = state.appearance === 'system' ? (media.matches ? 'dark' : 'light') : state.appearance;
  }
  media.addEventListener('change', () => { if (state.appearance === 'system') { applyLook(); render(); } });

  // ---------- 左栏 ----------
  function quota() {
    // 只显示「当前连接」的余量。标签不写品牌词；悬停说明是哪条连接，只用「连接你电脑上的 …」原句（V7）。
    const bar = (label, pct, reset) => `<div class="quota-row"><span class="quota-label">${label}</span><span class="quota-track" aria-hidden="true"><i style="width:${pct}%"></i></span><span class="quota-pct">${pct}%</span><small>${reset} 重置</small></div>`;
    switch (state.quota) {
      case 'claude':
        return `<div class="quota" data-quota="claude" title="连接你电脑上的 Claude Code · 上次调用时带回的数" aria-label="套餐余量">
          <div class="quota-head"><span>套餐已用</span><small>截至 ${D.now}</small></div>
          ${bar('5 小时', 5, '14:30')}${bar('7 天', 11, '11-13 16:00')}</div>`;
      case 'codex':
        return `<div class="quota" data-quota="codex" title="连接你电脑上的 Codex · 随时可读，不花额度" aria-label="套餐余量">
          <div class="quota-head"><span>套餐已用</span><small>截至 ${D.now}</small></div>
          ${bar('7 天', 28, '11-11 12:11')}</div>`;
      case 'api':
        return `<div class="quota" data-quota="api" title="输入 API key · 这家厂商有余额接口" aria-label="余额">
          <div class="quota-head"><span>余额</span><small>截至 ${D.now}</small></div>
          <div class="quota-money">¥ 41.20</div></div>`;
      case 'unreadable':
        return `<div class="quota quota--quiet" data-quota="unreadable" title="上次没读到，下次调用时再读；不影响打分和问库">余量暂时读不到</div>`;
      default:
        return ''; // API 无余额接口：整块不显示
    }
  }
  function sidebar() {
    const nav = (go, ic, label, extra = '') => `<button class="navitem${state.screen === go ? ' active' : ''}" data-go="${go}"${state.screen === go ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${extra}</button>`;
    const current = ['inbox', 'library', 'ask', 'queue'].includes(state.screen) ? screenLib().id : null;
    $('#sidebar').innerHTML = `
      <div class="brand"><span class="brandmark">流</span><span class="brandname">流息<small>STREAMS</small></span></div>
      <div class="side-nav">
        ${nav('shelf', 'shelf', '库架')}
        ${nav('chat', 'chat', '和主 Agent 聊', `<span class="badge badge--wait" title="${D.decide.length} 件等你定">${D.decide.length}</span>`)}
      </div>
      <div class="side-section">
        <div class="section-label"><span>我的库</span></div>
        ${D.libraries.map(l => `<button class="project-item${current === l.id ? ' active' : ''}" data-go="${l.id === 'on' ? 'queue' : l.id === 'lt' ? 'inbox' : 'overview-rs'}"${current === l.id ? ' aria-current="page"' : ''}>
          ${libMark(l)}<span class="project-name">${esc(l.name)}<small class="project-meta">${l.state === 'running' ? '<i class="dot dot--run"></i>在跑' : l.state === 'queued' ? '<i class="dot dot--queue"></i>排队中 · 第 2 位' : '<i class="dot dot--wait" title="这个库有问题"></i>有个来源出问题'}</small></span>
          <span class="count" title="${l.inbox} 条待看">${l.inbox}</span></button>`).join('')}
        <button class="navitem new" data-go="new">${icon('plus')}<span>新建库</span></button>
      </div>
      <div class="side-spacer"></div>
      ${quota()}
      <div class="side-footer">${nav('settings', 'settings', '设置')}</div>`;
  }

  // ---------- 主区 ----------
  function libHead(l, tab) {
    const queued = l.state === 'queued';
    const tabs = [['overview', '概览'], ['inbox', '待看', l.inbox], ['library', '资料库'], ['ask', '问库'], ['sources', '来源与要求']];
    return `<header class="work-header lib-head">
        <div class="lib-title">${libMark(l)}<div><h1>${esc(l.name)}</h1><p class="header-meta">在追：${esc(l.tracking)}</p></div></div>
        <div class="header-actions">
          <span class="header-meta">${queued ? '排队中 · 前面是「流息Test」' : l.state === 'running' ? `在跑 · 打分中 · 调用 ${D.run.calls} / ${D.run.cap}` : `下次运行 ${esc(l.next)}`}</span>
          ${queued ? '<button class="btn" disabled aria-disabled="true">已排上</button>' : l.state === 'running' ? '<button class="btn" disabled aria-disabled="true">正在跑</button>' : '<button class="btn primary">现在跑一轮</button>'}
        </div>
      </header>
      <nav class="lib-tabs" role="tablist" aria-label="库内分区">${tabs.map(([id, name, n]) => `<button class="tab${id === tab ? ' active' : ''}" role="tab" aria-selected="${id === tab}" data-libtab="${id}">${name}${n ? `<span class="tab-count">${n}</span>` : ''}</button>`).join('')}</nav>`;
  }
  function shelfView() {
    const cards = D.libraries.map(l => `<article class="project-tile" data-go="${l.id === 'on' ? 'queue' : l.id === 'lt' ? 'inbox' : 'overview-rs'}">
        <div class="tile-top">${libMark(l)}<h3>${esc(l.name)}</h3></div>
        <p class="tile-track">在追：${esc(l.tracking)}</p>
        <p class="tile-meta">上次更新 ${esc(l.updated)} · ${l.sources} 个来源</p>
        <p class="tile-state tile-state--${l.state}">${l.state === 'problem' ? icon('warn') : l.state === 'running' ? icon('progress') : icon('queue')}<span>${esc(l.stateText)}</span></p>
        <div class="project-tile-footer"><b>${l.inbox}</b> 条待看</div>
      </article>`).join('');
    return `<header class="work-header"><div class="project-heading"><h1>库架</h1><p class="header-meta">${D.libraries.length} 个库 · 每个库按自己的时间跑</p></div><div class="header-actions"><button class="btn primary">${icon('plus')}新建库</button></div></header>
      <div class="scroll"><div class="shelf-grid">${cards}
        <article class="project-tile project-tile--new" data-go="chat">${icon('chat')}<b>新建库 · 和主 Agent 聊着建</b><small>说一句想追踪什么，它拟好库，你确认后才建</small></article>
      </div></div>`;
  }
  function chatView() {
    const c = D.chat.card;
    return `<header class="work-header"><div class="project-heading"><h1>和主 Agent 聊</h1><p class="header-meta">管你所有的库：建库、改库，都先出提议卡，你确认才生效</p></div></header>
      <div class="waiting-strip">${icon('decide')}<b>等你定的事 · ${D.decide.length}</b><span>提议卡：改「流息Test」：加 2 个来源（在下面的对话里） · 另有 2 张建议卡</span><button class="btn quiet small" data-tab="decide">看全部</button></div>
      <div class="scroll thread-scroll"><div class="thread">
        <div class="date-line">今天 10:02</div>
        <div class="user-message">${esc(D.chat.you)}</div>
        <div class="assistant-message">
          <div class="speaker"><span class="avatar">主</span>主 Agent</div>
          <div class="looked">${D.chat.looked.map(t => `<div class="looked-row">${icon('search')}${esc(t)}</div>`).join('')}</div>
          <p class="intro-copy">${esc(D.chat.reply)}</p>
          <article class="confirmation" id="proposal">
            <div class="confirm-top"><div class="confirm-title">${icon('sources')}<div><small>提议卡 · 你确认后才生效</small><h2>${esc(c.title)}</h2></div></div><span class="confirm-number">流息Test</span></div>
            <div class="card-body">
              <dl class="decision-points"><div><dt><span class="point-index">为什么</span></dt><dd>${esc(c.why)}</dd></div></dl>
              <div class="before-after">
                <div class="ba-col"><span class="ba-label">改前</span>${c.before.map(t => `<p>${esc(t)}</p>`).join('')}</div>
                <div class="ba-arrow">${icon('arrow')}</div>
                <div class="ba-col ba-col--after"><span class="ba-label">改后</span>${c.after.map(t => `<p${t.startsWith('+') ? ' class="ba-add"' : ''}>${esc(t)}</p>`).join('')}<small>${esc(c.latest)}</small></div>
              </div>
              <p class="ba-note">改前 / 改后由流息的代码按库里现在的配置算出，不是主 Agent 写的。</p>
            </div>
            <div class="confirm-footer"><span class="muted">确认后由流息的代码改，记「主 Agent 提的 · 你确认的」</span><div class="row"><button class="btn quiet">不要</button><button class="btn quiet">改一下</button><button class="btn primary">${icon('check')}确认</button></div></div>
          </article>
        </div>
      </div></div>
      <div class="composer-wrap"><form class="composer" onsubmit="return false"><textarea aria-label="和主 Agent 说" placeholder="和主 Agent 说：建库、改库、问各库的情况……"></textarea><div class="composer-tools"><small>Shift + Enter 换行</small><button class="send-btn" type="button" aria-label="发送">${icon('send')}</button></div></form></div>`;
  }
  function inboxView() {
    const l = lib('lt');
    const cards = D.inbox.map((it, i) => `<article class="source-card${state.inboxSel === i ? ' selected' : ''}" data-inbox="${i}" tabindex="0">
        <div class="card-headline"><h3>${esc(it.title)}</h3><span class="fresh">${it.fresh}</span></div>
        ${it.ai ? `<p class="ai-mark">${icon('warn')}这一条里有写给 AI 的话，已忽略</p>` : ''}
        <p class="card-meta">${esc(it.source)} · ${it.date}</p>
        <p class="card-what"><b>这是什么：</b>${esc(it.what)}</p>
        <p class="card-scores">${it.scores.map(([n, s, why]) => `<span><b>${n} ${s}</b> · ${esc(why)}</span>`).join('')}</p>
        <div class="card-actions"><button class="btn primary small">${icon('bookmark')}收藏</button><button class="btn small">放弃…</button><button class="btn small">稍后</button><button class="link-btn">这一条的记录</button></div>
      </article>`).join('');
    return `${libHead(l, 'inbox')}
      <div class="scroll"><div class="inbox">
        <div class="inbox-head"><h2>待看 · ${l.inbox} 条</h2><span class="header-meta">按分数排 · JK 上下 · C 收藏 · D 放弃 · L 稍后</span></div>
        ${cards}
        <p class="more-line">还有 ${l.inbox - D.inbox.length} 条，往下翻</p>
      </div></div>`;
  }
  function noteAt([t, n]) { return D.topics[t].notes[n]; }
  function libraryView() {
    const l = lib('lt');
    const sel = noteAt(state.noteSel);
    const list = D.topics.map((t, ti) => `<div class="list-group"><div class="section-label"><span>${esc(t.name)}（${t.notes.length}）</span></div>
        ${t.notes.map((n, ni) => `<button class="file-row${ti === state.noteSel[0] && ni === state.noteSel[1] ? '' : ''}" data-note="${ti}-${ni}"${ti === state.noteSel[0] && ni === state.noteSel[1] ? ' aria-current="true"' : ''}><span class="file-text">${esc(n.title)}<small>${esc(n.source)} · ${n.date}</small></span></button>`).join('')}</div>`).join('');
    const r = D.reader;
    return `${libHead(l, 'library')}
      <div class="reader-split">
        <section class="reader-list" aria-label="条目列表">
          <label class="search-field">${icon('search')}<input aria-label="搜索" placeholder="搜索标题、主题、正文……"></label>
          <div class="filters" role="group" aria-label="分页"><button class="filter active" aria-pressed="true">已收藏 8</button><button class="filter">我写的 0</button><button class="filter">抓到的 79</button><button class="filter">待规范 0</button></div>
          <div class="list-tools"><span class="header-meta">按主题 · 最近 30 天</span><span class="seg"><button class="seg-on">列表</button><button>图谱</button></span></div>
          <div class="list-scroll">${list}</div>
        </section>
        <article class="reader-paper" aria-label="阅读">
          <div class="reader-tools"><span class="status-pill status-pill--done">${icon('check')}已收藏</span><span class="grow"></span><button class="btn small">编辑</button><button class="btn small">${icon('external')}打开原文</button><button class="btn small" aria-label="更多">${icon('more')}更多</button></div>
          <div class="reader-scroll">
            <h1 class="reader-title">${esc(sel.title)}</h1>
            <p class="reader-meta">来源 ${esc(sel.source)} · 发布 ${sel.date} · 收藏 ${sel.kept}</p>
            <div class="reader-callout"><b>这是什么：</b>${esc(r.what)}<ul>${r.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
            <section class="reader-section">${r.paras.map(p => `<p>${esc(p)}</p>`).join('')}</section>
          </div>
        </article>
      </div>`;
  }
  function askView() {
    const l = lib('lt');
    const a = D.ask;
    return `${libHead(l, 'ask')}
      <div class="scroll thread-scroll"><div class="thread">
        <p class="ask-scope">${icon('ask')}只用库里的东西回答 · 范围：已收藏 8 条 · 我写的 0 条</p>
        <div class="user-message">${esc(a.q)}</div>
        <div class="assistant-message">
          <div class="speaker"><span class="avatar avatar--ask">${icon('ask')}</span>问库</div>
          <p class="intro-copy answer">${a.a.map(([t, n]) => `${esc(t)}<button class="cite" data-cite="${n}" aria-label="出处 ${n}">${n}</button>`).join('')}</p>
          <div class="cite-list"><span class="section-label"><span>出处</span></span>${a.cites.map(c => `<button class="document-link"><span class="cite cite--static">${c.n}</span><span>《${esc(c.title)}》</span><small>${esc(c.topic)}</small>${icon('arrow')}</button>`).join('')}</div>
          <div class="after-card"><button class="link-btn">记到想补的主题</button><span>·</span><button class="link-btn">这个回答哪里不对</button></div>
        </div>
      </div></div>
      <div class="composer-wrap"><form class="composer" onsubmit="return false"><textarea aria-label="问这个库，或者说说想怎么改它" placeholder="问这个库，或者说说想怎么改它…"></textarea><div class="composer-tools"><small>只用这个库的条目回答 · 想改来源、主题、要求，直接说：会转给主 Agent，出一张提议卡</small><button class="send-btn" type="button" aria-label="发送">${icon('send')}</button></div></form></div>`;
  }
  function settingsView() {
    const preview = id => `<button class="theme-card${state.theme === id ? ' selected' : ''}" data-set-theme="${id}" aria-pressed="${state.theme === id}">
        <span class="theme-preview" data-theme="${id}" data-appearance="${document.documentElement.dataset.appearance}" aria-hidden="true"><i class="tp-side"></i><i class="tp-main"><b></b><b></b><b></b></i><i class="tp-panel"></i><i class="tp-key"></i></span>
        <span class="theme-name">${THEMES[id]}${id === 'precision' ? '<small>默认</small>' : ''}</span></button>`;
    const look = [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']];
    const lic = [
      ['流息', 'v2', 'MIT'], ['Noto Sans SC（界面字体）', '可变字体', 'SIL OFL 1.1'], ['Electron', '44', 'MIT'], ['Preact', '10', 'MIT'],
      ['htm', '3', 'Apache-2.0'], ['@mozilla/readability', '0.6', 'Apache-2.0']
    ];
    const row = (name, val) => `<div class="set-row"><span>${name}</span><span class="set-val">${val}</span></div>`;
    return `<header class="work-header"><div class="project-heading"><h1>设置</h1><p class="header-meta">对这台电脑上的流息、所有的库都有效</p></div></header>
      <div class="scroll"><div class="settings">
        <section class="set-group set-group--folded">
          ${row('连接', '连接你电脑上的 Claude Code · 当前使用 · 主模型 默认 · 核验模型 同主模型')}
          ${row('主 Agent', '接着上一次的会话（12 轮）')}
          ${row('库', '新建库默认放在 文档\\流息 · 3 个库的定时一览 · 本月用量合计')}
        </section>
        <section class="set-group" id="look">
          <h2>外观与语言</h2>
          <div class="set-block"><div class="set-label"><b>主题</b><small>界面用哪一套颜色和形状</small></div>
            <div class="theme-cards" role="group" aria-label="选择主题">${Object.keys(THEMES).map(preview).join('')}</div></div>
          <div class="set-pair">
            <div class="set-block"><div class="set-label"><b>外观</b><small>跟随系统：Windows 换深色，流息跟着换</small></div>
              <div class="seg seg--big" role="group" aria-label="外观">${look.map(([id, n]) => `<button class="${state.appearance === id ? 'seg-on' : ''}" data-set-appearance="${id}" aria-pressed="${state.appearance === id}">${n}</button>`).join('')}</div></div>
            <div class="set-block"><div class="set-label set-label--short"><b>语言</b></div><div class="seg seg--big"><button class="seg-on">中文</button><button>English</button></div></div>
          </div>
          <p class="set-note">选了马上换，下次打开还是它；对话框、图谱和问库都跟着换。</p>
        </section>
        <section class="set-group">
          <h2>软件</h2>
          ${row('关于', '流息 v2（Windows 版） · 由 Starry Digital 开发')}
          <div class="set-block set-block--col"><div class="set-label"><b>许可证与致谢</b><small>随软件带的组件</small></div>
            <table class="reader-table licenses"><thead><tr><th>名字</th><th>版本</th><th>许可证</th></tr></thead><tbody>
            ${lic.map(([n, v, l]) => `<tr${n.startsWith('Noto') ? ' class="lic-noto"' : ''}><td>${n}</td><td>${v}</td><td>${l}</td></tr>`).join('')}
            </tbody></table></div>
        </section>
      </div></div>`;
  }
  function queueView() {
    const l = lib('on');
    return `${libHead(l, 'overview')}
      <div class="scroll"><div class="overview">
        <div class="banner banner--wait" data-place="library-page">${icon('queue')}<div><b>排队中 · 第 2 位</b><p>前面是「流息Test」：它在补跑错过的那一轮（定时 08:30 那一档，开机时已过）。它跑完，这个库自动接着跑，不用再点「开始」。</p></div><button class="btn quiet small" data-tab="progress">看进度</button></div>
        <div class="stat-row"><div class="stat"><b>${l.inbox}</b><span>待看</span></div><div class="stat"><b>0</b><span>上一轮抓到</span></div><div class="stat"><b>0</b><span>上一轮调用</span></div><div class="stat"><b>${l.sources}</b><span>来源 · 都正常</span></div></div>
        <section class="phase-row"><div class="phase-heading"><span class="phase-label">上一轮 · 昨天 22:21<small>跑完一轮 · 0 次调用 · 没有新条目</small></span></div></section>
      </div></div>
      <div class="dialog-layer" data-place="dialog"><div class="dialog" role="dialog" aria-labelledby="dlgTitle">
        <div class="dialog-head"><h2 id="dlgTitle">跑一轮</h2><button class="icon-btn" aria-label="关闭">${icon('close')}</button></div>
        <div class="dialog-body">
          <p class="dialog-lead">「流息Test」正在补跑错过的那一轮；这个库排在它后面，跑完会自动接着跑。</p>
          <dl class="kv"><div><dt>前面</dt><dd>流息Test · 打分中 · 调用 ${D.run.calls} / ${D.run.cap}</dd></div><div><dt>这个库</dt><dd>排在第 2 位 · 不用再点「开始」</dd></div></dl>
        </div>
        <div class="form-footer"><button class="btn quiet" data-tab="progress">看进度</button><button class="btn primary">知道了</button></div>
      </div></div>`;
  }
  function overviewRsView() {
    const l = lib('rs');
    return `${libHead(l, 'overview')}<div class="scroll"><div class="overview"><div class="banner banner--wait">${icon('warn')}<div><b>1 / 5 个来源连续 3 轮没抓到</b><p>「This Week in Rust」暂时失败 3 次。主 Agent 出了一张建议卡，在右栏「等你决定」里。</p></div></div><p class="set-note">设计稿只画了这个库概览的横幅。</p></div></div>`;
  }

  // ---------- 右栏 ----------
  const dots = st => `<span class="step-dots">${st.map(s => `<i class="${s.state === 'done' ? 'complete' : s.state === 'now' ? 'wait' : ''}"></i>`).join('')}</span>`;
  function progressTab() {
    const r = D.run; const rl = lib(r.lib);
    const here = state.screen === 'queue' ? 'on' : null;
    return `<div class="panel-summary"><span class="eyebrow">所有库 / 现在 ${D.now}</span><h2>1 个在跑 · 1 个排队</h2>
        <p>一次只跑一个库；排队的按先后自动接着跑。</p>
        <div class="progress-line">${r.steps.map(s => `<span class="${s.state === 'done' ? 'done' : s.state === 'now' ? 'now' : ''}"></span>`).join('')}</div>
        <div class="progress-caption"><span>${esc(rl.name)} · ${r.steps.filter(s => s.state === 'done').length} / ${r.steps.length} 步</span><span>调用 ${r.calls} / ${r.cap}</span></div></div>
      <details class="phase-row current" open><summary class="phase-heading">${libMark(rl)}<span class="phase-label">${esc(rl.name)} · 在跑<small>${esc(r.why)} · ${r.started} 开始 ${dots(r.steps)}</small></span>${icon('down')}</summary>
        <div class="phase-details">${r.steps.map(s => `<div class="step-line step-line--${s.state}">${icon(s.state === 'done' ? 'check' : s.state === 'now' ? 'progress' : 'later')}<span><b>${s.name}</b> · ${esc(s.note)}</span></div>`).join('')}
        <div class="meter"><span>调用</span><span class="quota-track"><i style="width:${Math.round(r.calls / r.cap * 100)}%"></i></span><b>${r.calls} / 上限 ${r.cap}</b></div></div></details>
      <div class="section-label"><span>排队的先后</span></div>
      <ol class="queue-list">${D.queue.map((q, i) => `<li class="${q.lib === here ? 'is-here' : ''}"><span class="phase-index">${i + 1}</span>${libMark(lib(q.lib))}<span class="file-text">${esc(lib(q.lib).name)}${q.lib === here ? '<em>这个库</em>' : ''}<small>${esc(q.text)}</small></span></li>`).join('')}</ol>
      <div class="section-label"><span>下次定时</span></div>
      ${D.schedule.map(s => `<div class="activity-row">${libMark(lib(s.lib))}<span>${esc(lib(s.lib).name)}</span><small>${esc(s.when)}</small></div>`).join('')}
      <div class="section-label"><span>最近几轮</span></div>
      ${D.recent.map(s => `<div class="activity-row activity-row--stack"><span>${esc(lib(s.lib).name)} · ${esc(s.when)}</span><small>${esc(s.text)}</small></div>`).join('')}`;
  }
  function decideTab() {
    return `<div class="panel-summary"><span class="eyebrow">所有库 / 等你决定</span><h2>${D.decide.length} 件等你定</h2><p>提议卡要你确认才生效；建议卡只是建议，按钮由你点。</p></div>
      ${D.decide.map(d => `<button class="decide-card" data-go="${d.go}"><span class="decide-kind decide-kind--${d.kind === '提议卡' ? 'proposal' : 'suggestion'}">${d.kind}</span><span class="decide-lib">${libMark(lib(d.lib))}${esc(lib(d.lib).name)}</span><b>${esc(d.title)}</b><small>${esc(d.where)} · 点了去那里 ${icon('arrow')}</small></button>`).join('')}`;
  }
  function detailTab() {
    const head = (eyebrow, title, p) => `<div class="panel-summary"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${p ? `<p>${p}</p>` : ''}</div>`;
    switch (state.screen) {
      case 'inbox': {
        const it = D.inbox[state.inboxSel];
        return `${head('详情 / 待看 · 选中的这一条', esc(it.title), `${esc(it.source)} · ${it.date} · 抓于 ${esc(it.fetched)}`)}
          ${it.ai ? `<div class="banner banner--wait banner--small">${icon('warn')}<div><b>这一条里有写给 AI 的话，已忽略</b><p>来源和库的要求都没有被改动。</p></div></div>` : ''}
          <div class="section-label"><span>每道关的分数与理由</span></div>
          ${it.scores.map(([n, s, why]) => `<div class="gate-row"><span class="gate-name">${n}</span><span class="gate-bar"><i style="width:${Math.round(parseFloat(s) * 100)}%"></i></span><b>${s}</b><p>${esc(why)}</p></div>`).join('')}
          <div class="section-label"><span>核验</span></div><p class="detail-p">${esc(it.check)}</p>
          <div class="section-label"><span>来源</span></div><div class="activity-row"><span>${esc(it.source)}</span><small>正常 · 7 天里进了 5 条</small></div>
          <button class="document-link">${icon('file')}<span>这一条的记录</span>${icon('arrow')}</button>`;
      }
      case 'library': {
        const n = noteAt(state.noteSel); const t = D.topics[state.noteSel[0]];
        return `${head('详情 / 资料库 · 这一篇', esc(n.title))}
          <dl class="kv kv--panel"><div><dt>主题</dt><dd>${esc(t.name)}</dd></div><div><dt>来源</dt><dd>${esc(n.source)}</dd></div><div><dt>分数</dt><dd>相关度 ${n.rel} · 实质 ${n.sub}</dd></div><div><dt>文件</dt><dd class="mono">notes/${esc(n.file)}</dd></div></dl>
          <div class="section-label"><span>链到这里的（${D.reader.backlinks.length}）</span></div>${D.reader.backlinks.map(b => `<button class="file-row"><span class="file-icon">${icon('file')}</span><span class="file-text">《${esc(b)}》</span></button>`).join('')}
          <div class="section-label"><span>同一来源的（${D.reader.sameSource.length}）</span></div>${D.reader.sameSource.map(b => `<button class="file-row"><span class="file-icon">${icon('file')}</span><span class="file-text">《${esc(b)}》</span></button>`).join('')}
          <button class="document-link">${icon('file')}<span>这一条的核验记录</span>${icon('arrow')}</button>`;
      }
      case 'ask': {
        const a = D.ask;
        return `${head('详情 / 问库 · 答案引用的笔记', `${a.cites.length} 篇笔记`, '点编号或下面的一篇，在资料库标签里打开。')}
          ${a.cites.map(c => `<button class="source-card cite-card"><span class="cite cite--static">${c.n}</span><span><b>《${esc(c.title)}》</b><small>${esc(c.topic)}</small><q>${esc(c.quote)}</q></span></button>`).join('')}
          <div class="section-label"><span>这次用了什么</span></div>
          <p class="detail-p">先按主题和关键词从库里挑出最多 9 条候选，把它们的正文给模型，模型只能引用这些条。</p>
          <div class="activity-row"><span>${a.used}</span><small>${a.calls}</small></div><div class="activity-row"><span>没给模型任何工具，不联网</span><small>${a.check}</small></div>`;
      }
      case 'chat':
        return `${head('详情 / 和主 Agent 聊 · 这一轮', '它查过的东西与提的卡')}
          <div class="section-label"><span>查过的（${D.chat.looked.length}）</span></div>${D.chat.looked.map(t => `<div class="step-line">${icon('search')}<span>${esc(t)}</span></div>`).join('')}
          <div class="section-label"><span>提的卡（1）</span></div>
          <button class="decide-card" data-scroll="proposal"><span class="decide-kind decide-kind--proposal">提议卡</span><span class="decide-lib">${libMark(lib('lt'))}流息Test</span><b>${esc(D.chat.card.title)}</b><small>等你确认 · 看这张卡 ${icon('arrow')}</small></button>
          <p class="detail-p">主 Agent 读的是各库的配置、概况和摘要，不读抓来的原文；它没有 shell，只能用流息给的工具。</p>`;
      case 'queue':
        return `${head('详情 / 安省中小企业补助 · 概览', '排队中 · 第 2 位', '前面是「流息Test」的补跑。它跑完，这个库自动接着跑。')}
          <dl class="kv kv--panel"><div><dt>为什么排队</dt><dd>一次只跑一个库；「流息Test」开机时补跑错过的 08:30 那一轮，先排上了</dd></div><div><dt>开始按钮</dt><dd>已在队列里，显示「已排上」，不可点</dd></div><div><dt>下次定时</dt><dd>明天 09:00</dd></div></dl>`;
      case 'settings':
        return `${head('详情', '设置页没有要看的详情', '详情随主区变：待看看选中的那一条，资料库看这一篇，问库看引用的笔记，和主 Agent 聊看它这一轮查过的东西。')}`;
      default:
        return `${head('详情 / 库架', '点一张库的卡片', '库架上没有选中的东西。进了库，这里随主区变：待看看选中的那一条，资料库看这一篇，问库看引用的笔记。')}`;
    }
  }
  function filesTab() {
    const l = screenLib();
    const isLt = l.id === 'lt';
    const groups = isLt ? D.topics : [{ name: '补助项目', notes: [{ title: '安省小企业数字化补助 2026 年申请指南' }, { title: '出口市场拓展补助的资格条件' }] }, { name: '税收抵免', notes: [{ title: '安省创新税收抵免怎么算' }] }];
    const total = groups.reduce((s, g) => s + g.notes.length, 0);
    const openGroup = isLt ? state.noteSel[0] : 0;
    return `<div class="panel-summary"><span class="eyebrow">文件 / 这个库是怎么组织的</span><h2>${libMark(l)} ${esc(l.name)}</h2><p>讲给人听的结构，不是原样的文件夹。点一篇在资料库里读；右键可以用 Obsidian 打开。</p>
        <button class="btn quiet small" data-toast="会打开这个库的文件夹">${icon('folder')}在资源管理器中显示</button></div>
      <div class="tree" data-tree="library">
        <details class="tree-node" data-tree="notes" open><summary class="tree-row tree-row--branch">${icon('down', 'tw')}<span class="file-icon">${icon('book')}</span><span class="file-text">笔记（${total}）<small>notes/ · 按主题分组</small></span></summary>
          ${groups.map((g, gi) => `<details class="tree-node tree-node--topic" data-tree="topic"${gi === openGroup ? ' open' : ''}><summary class="tree-row tree-row--branch">${icon('down', 'tw')}<span class="file-text">${esc(g.name)}（${g.notes.length}）</span></summary>
            ${g.notes.map((n, ni) => `<button class="tree-row tree-row--leaf file-row" data-tree="note" data-note="${gi}-${ni}"${isLt && gi === state.noteSel[0] && ni === state.noteSel[1] && state.screen === 'library' ? ' aria-current="true"' : ''}><span class="file-icon">${icon('file')}</span><span class="file-text">${esc(n.title)}</span></button>`).join('')}</details>`).join('')}
        </details>
        <button class="tree-row file-row" data-tree="inbox" data-go="${isLt ? 'inbox' : 'queue'}"><span class="file-icon">${icon('later')}</span><span class="file-text">待看（${l.inbox}）<small>还没成文件 · 点了去待看</small></span>${icon('arrow')}</button>
        <button class="tree-row file-row" data-tree="requirements" data-opens="sources-tab" data-toast="去这个库的「来源与要求」标签"><span class="file-icon">${icon('sources')}</span><span class="file-text">这个库的要求与来源<small>点了去「来源与要求」改，改动有「谁定的」记录</small></span>${icon('arrow')}</button>
        <details class="tree-node tree-node--program" data-tree="program"><summary class="tree-row tree-row--branch">${icon('down', 'tw')}<span class="file-icon">${icon('folder')}</span><span class="file-text">程序记录（不用动）<small>流息自己用的文件</small></span></summary>
          <div class="tree-program"><p>这里是抓取缓存、运行记录和索引，流息自己读写。要看可以在资源管理器里打开，不要手改。</p><button class="btn quiet small" data-toast="会打开程序记录所在的文件夹">${icon('folder')}在资源管理器中显示</button></div>
        </details>
      </div>`;
  }
  function panel() {
    const tabs = [['progress', '进度', 'progress'], ['decide', '等你决定', 'decide', D.decide.length], ['detail', '详情', 'detail'], ['files', '文件', 'files']];
    const tab = state.tab || DEFAULT_TAB[state.screen] || 'progress';
    const p = $('#panel');
    p.classList.toggle('collapsed', state.panel === 'closed');
    if (state.panel === 'closed') {
      p.innerHTML = `<div class="panel-rail"><button class="icon-btn" data-panel="open" aria-label="展开右栏" title="展开右栏">${icon('panel')}</button>${tabs.map(([id, n, ic, b]) => `<button class="icon-btn rail-tab" data-tab="${id}" aria-label="${n}" title="${n}">${icon(ic)}${b ? `<span class="badge badge--wait">${b}</span>` : ''}</button>`).join('')}</div>`;
      return;
    }
    const content = { progress: progressTab, decide: decideTab, detail: detailTab, files: filesTab }[tab]();
    p.innerHTML = `<div class="panel-head"><div class="panel-tabs" role="tablist" aria-label="右栏">${tabs.map(([id, n, ic, b]) => `<button class="tab${id === tab ? ' active' : ''}" role="tab" id="tab-${id}" aria-selected="${id === tab}" data-tab="${id}">${icon(ic)}<span>${n}</span>${b ? `<span class="badge badge--wait">${b}</span>` : ''}</button>`).join('')}</div>
      <button class="icon-btn panel-collapse" data-panel="closed" aria-label="收起右栏" title="收起右栏">${icon('panel')}</button></div>
      <div class="panel-scroll" role="tabpanel" aria-labelledby="tab-${tab}" data-tab-content="${tab}">${content}</div>`;
  }

  // ---------- 渲染 ----------
  function render() {
    applyLook();
    document.body.dataset.screen = state.screen;
    sidebar();
    const views = { shelf: shelfView, chat: chatView, inbox: inboxView, library: libraryView, ask: askView, settings: settingsView, queue: queueView, 'overview-rs': overviewRsView };
    $('#main').innerHTML = views[state.screen]();
    $('#main').dataset.screen = state.screen;
    panel();
    closeMenu();
    if (state.menu) openMenu();
    for (const s of $$('#main .thread-scroll')) s.scrollTop = s.scrollHeight; // 对话停在最新的一条
    syncBar();
  }
  function syncBar() {
    if (!$('#dbTheme')) return;
    $('#dbTheme').value = state.theme; $('#dbAppearance').value = state.appearance;
    $('#dbScreen').value = SCREENS.includes(state.screen) ? state.screen : 'shelf'; $('#dbQuota').value = state.quota;
    $('#dbNow').textContent = `${THEMES[state.theme]} · ${document.documentElement.dataset.appearance === 'dark' ? '深色' : '浅色'}${state.appearance === 'system' ? '（跟随系统）' : ''}`;
  }
  let toastTimer;
  function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200); }

  // 笔记的右键菜单（用 Obsidian 打开 · 在资源管理器中显示）
  function openMenu(target) {
    const row = target || document.querySelector('#panel [data-tree="note"]');
    if (!row) return;
    const m = $('#menu');
    m.innerHTML = `<button role="menuitem" data-toast="会用 Obsidian 打开这一篇">${icon('external')}用 Obsidian 打开</button><button role="menuitem" data-toast="会在资源管理器里选中这个文件">${icon('folder')}在资源管理器中显示</button>`;
    const r = row.getBoundingClientRect();
    m.style.left = `${Math.min(r.left + 40, window.innerWidth - 220)}px`;
    m.style.top = `${r.bottom - 4}px`;
    m.hidden = false;
  }
  function closeMenu() { $('#menu').hidden = true; }

  document.addEventListener('click', e => {
    const el = e.target.closest('button, [data-go], summary');
    if (!el) { closeMenu(); return; }
    if (el.dataset.toast) { toast(`（设计稿）${el.dataset.toast}`); closeMenu(); return; }
    if (el.dataset.go) {
      const go = el.dataset.go;
      if (go === 'new') { toast('（设计稿）会打开「新建库」'); return; }
      state.screen = go; state.tab = null; state.menu = false; render(); return;
    }
    if (el.dataset.tab) { state.tab = el.dataset.tab; state.panel = 'open'; state.menu = false; panel(); return; }
    if (el.dataset.panel) { state.panel = el.dataset.panel; panel(); return; }
    if (el.dataset.libtab) {
      const t = el.dataset.libtab;
      const l = screenLib();
      if (l.id === 'lt' && ['inbox', 'library', 'ask'].includes(t)) { state.screen = t; state.tab = null; render(); return; }
      if (l.id === 'on' && t === 'overview') return;
      toast('（设计稿）这个标签沿用 v2 现有的页面，本稿没画'); return;
    }
    if (el.dataset.note) {
      const [t, n] = el.dataset.note.split('-').map(Number);
      if (screenLib().id === 'lt') { state.noteSel = [t, n]; state.screen = 'library'; state.tab = state.tab === 'files' ? 'files' : null; render(); }
      return;
    }
    if (el.dataset.setTheme) { state.theme = el.dataset.setTheme; render(); return; }
    if (el.dataset.setAppearance) { state.appearance = el.dataset.setAppearance; render(); return; }
    if (el.dataset.scroll) { document.getElementById(el.dataset.scroll)?.scrollIntoView({ block: 'center' }); return; }
    closeMenu();
  });
  document.addEventListener('click', e => {
    const card = e.target.closest('[data-inbox]');
    if (card && !e.target.closest('button')) { state.inboxSel = Number(card.dataset.inbox); render(); }
  });
  document.addEventListener('contextmenu', e => {
    const row = e.target.closest('[data-tree="note"]');
    if (!row) return;
    e.preventDefault(); openMenu(row);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // 切换条
  const bind = (id, key) => $(id).addEventListener('change', e => { state[key] = e.target.value; if (key === 'screen') state.tab = null; render(); });
  bind('#dbTheme', 'theme'); bind('#dbAppearance', 'appearance'); bind('#dbScreen', 'screen'); bind('#dbQuota', 'quota');

  // URL 参数与给脚本用的接口
  function set(opts = {}) {
    if (opts.screen && (SCREENS.includes(opts.screen) || opts.screen === 'overview-rs')) { state.screen = opts.screen; state.tab = null; }
    if (opts.theme && THEMES[opts.theme]) state.theme = opts.theme;
    if (opts.appearance && APPEARANCES.includes(opts.appearance)) state.appearance = opts.appearance;
    if (opts.quota && QUOTAS.includes(opts.quota)) state.quota = opts.quota;
    if (opts.tab && TABS.includes(opts.tab)) state.tab = opts.tab;
    if (opts.panel === 'open' || opts.panel === 'closed') state.panel = opts.panel;
    if ('menu' in opts) state.menu = !!opts.menu;
    if (opts.bar === false || opts.bar === '0') document.documentElement.dataset.bar = 'off';
    if (opts.bar === true || opts.bar === '1') delete document.documentElement.dataset.bar;
    render();
    return snapshot();
  }
  function snapshot() {
    const root = document.documentElement;
    return { screen: state.screen, theme: root.dataset.theme, appearancePref: root.dataset.appearancePref, appearance: root.dataset.appearance, quota: state.quota, tab: $('#panel [data-tab-content]')?.dataset.tabContent ?? null, panel: state.panel };
  }
  window.streamsDesign = { set, get state() { return snapshot(); }, screens: SCREENS.slice(), themes: Object.keys(THEMES), appearances: APPEARANCES.slice(), quotas: QUOTAS.slice(), tabs: TABS.slice() };

  const q = new URLSearchParams(location.search);
  const init = {};
  for (const k of ['screen', 'theme', 'appearance', 'quota', 'tab', 'panel', 'bar']) if (q.has(k)) init[k] = q.get(k);
  if (q.get('menu') === '1') { init.menu = true; init.tab = init.tab || 'files'; }
  set(init);
})();
