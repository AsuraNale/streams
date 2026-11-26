// The right panel of the main window (v2 package L; redesign R1 — the template's context-panel, as the design's streams/app.js
// builds it): four tabs — 进度 · 待确认 · 详情 · 文件 (维护者 11-11 第 13 题: 「等你决定」 is 「待确认」) — on the template's
// `nav.panel-tabs` of `.tab` (the edition's tab icons, 待确认's number as `st-count`), and a button that folds it into a 52px
// rail (its four icons, 待确认's number; a click opens that tab). Open or folded, and the tab, are kept in settings.json
// (app.js setPanel → the bridge's setPanel; getAppState().panel), so the next start opens it the same way.
//   进度      every library (the template's panel-summary, phase-row, mini-chart, activity-row): how many run and wait, the round
//             that runs (its library, why, the step it is at, calls / cap, when it started), the queue in order with why each
//             waits, each library's next timed slot (getQueue, app.js useQueue; names from the libraries) — the one place the
//             queue is told in full (F23). Redesign R2 (P07 · P16): the round that runs says why (创建库后的首次运行 · 手动触发 · 定时 ·
//             补跑), when it started, its step, its calls and has 停止; each one waiting why, since when and 「前一任务完成后
//             自动开始」; the rule 「需保持流息运行…」; nothing running: 「当前无运行任务」. On a library's page, last: that
//             library's last run in one line, the same line 待看 shows when empty (screens/run-steps.js LastRun,
//             getHome().lastRound: when it ended, how many it put into 待看).
//   待确认    1.1 (W6b, W7b): what waits for you to confirm is a library card of a conversation with the main agent:
//             BuildWaiting below — 放弃 · 查看完整建库卡 · 确认 — with the head 「全部库 · 待确认 / n 项」 (the template's panel-summary).
//             1.1.3 (plan 第八节): every conversation's card (listConversations().cards) — the one of the library or the
//             conversation you are on first, marked 当前库 / 当前对话, the others the one waiting longest first; each with
//             「{when} 提交」; a change whose library's card changed since cannot be confirmed (its line says why); 「更多」 and a
//             right click open 菜单三 (查看完整建库卡 · 打开此库 · 放弃). Nothing waits: one sentence. The tab's number is the
//             number of cards. (v2's 主 Agent 提议 and redesign
//             R5a's 系统检测 are gone with v2's main agent and v1.0's scoring pipeline.)
//   详情      follows the main area: the screen gives it (`detail`); a screen with nothing chosen: one sentence
//   文件      the current library told as a structure (getLibraryOutline; read only). Redesign R4b (P14 · P16): 「文件 · 库的文件
//             结构」, its name and folder, 在资源管理器中显示 (revealLibrary), then four heads: ▾ 笔记（n）· 按主题 (its notes grouped by
//             the topics of their headers), ▸ 待看（n）· 尚未生成文件 (→ 待看), ▸ 该库的来源与要求 (→ 来源与要求; never streams.json
//             itself), ▸ 程序记录（无需修改） folded by default, opened only to 「在资源管理器中显示」 (revealProgramRecords). A note:
//             click → read it in 资料库; right click or 「更多」 → 在 Obsidian 中打开 (openInObsidian) · 在资源管理器中显示
//             (showNoteInFolder). No program file's name shows.
//             A page with no library of its own (库架, 主 Agent, 设置): one sentence.
// Words: texts/panel.js PANEL / QUEUE. Test hooks: aside[data-part="right-panel"][data-open][data-tab],
// [data-panel-tab=<id>][aria-current] with [data-panel-badge], [data-action="fold"|"unfold"], [data-rail-tab=<id>],
// [data-pane=progress|decide|detail|files]; 进度: [data-part=progress-summary|running|order|next|last-run-here|keep-running], [data-queue-row=<id>]
// [data-position][data-here][data-why], [data-part="running-phase"], [data-calls], [data-next-row=<id>][data-at],
// [data-action="panel-stop"];
// 待确认: [data-pane="decide"][data-count] with [data-part="decide-summary"] [data-part="decide-title"][data-count] [data-part="decide-lead"] (only with something in the list: precheck fix 9), [data-part="decide-none"],
// the build's card article[data-part="build-waiting"][data-mode][data-conv][data-here][data-stale] (BuildWaiting) with
// [data-part=submitted], [data-action=card-more]; 进度's rows: [data-action=row-more] (菜单四: [data-menu-item=open|run-now|
// schedule|stop]);
// 详情: [data-part="detail-none"]; 文件: [data-part=files-head|no-library], [data-tree=notes|inbox|requirements|records][data-open],
// [data-tree-topic=<topic | "">], [data-tree-note=<id>] (.st-rp-tree__row), [data-action=reveal-library|reveal-records|
// note-more], the menu's [data-menu-item=obsidian|folder].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { doingOf, queueWords } from '../lib/queue.js'
import { LastRun, UPDATE_STEPS, stepOf, stepNumbers } from './run-steps.js'
import { RUN } from '../texts/run.js'
import { phaseWords } from '../lib/phase.js'
import { TIcon, hasTabIcons } from '../lib/template-icons.js'
import { LIBRARY_ROUTES, Menu } from '../kit/index.js'
import { NEXT_WHEN, SEP, WHEN } from '../texts/common.js'
import { PANEL as T, QUEUE } from '../texts/panel.js'
import { BUILD } from '../texts/build.js'
import { confirmAndOpen } from '../lib/build.js'
import { DropDialog, dropWords } from './conversations.js'

export { phaseWords }

/** The four tabs, in order, with the template's tab icons (streams/app.js TABS). */
export const PANEL_TABS = Object.freeze([['progress', 'progress'], ['decide', 'sources'], ['detail', 'draft'], ['files', 'files']])
const TAB_IDS = PANEL_TABS.map(([id]) => id)

const pad = n => String(n).padStart(2, '0')

/** The panel's head block (the template's panel-summary): a small line, a title, then what it is given. */
export function PanelSummary({ eyebrow, title, part, children }) {
  return html`<section class="panel-summary" data-part=${part}>
    ${eyebrow ? html`<span class="eyebrow">${eyebrow}</span>` : null}
    ${title ? html`<h2>${title}</h2>` : null}
    ${children}
  </section>`
}

function useNames() {
  const { libraries } = useApp()
  const rows = Array.isArray(libraries?.data) ? libraries.data : []
  return { rows, rowOf: id => rows.find(r => r.id === id) ?? null }
}

// ---- 进度 ---------------------------------------------------------------------------------------------------------------

/** One library of the queue (the template's phase-row): its place, its name and its state; open shows why and since when. */
function QueueRow({ o, i, here, name, running, r, onStop, stopping, onMenu }) {
  const P = T.progress
  const why = doingOf(o.why, QUEUE.why)
  // 1.1.1 P10 (A8): the step it is at, with its numbers (as 待看 shows them)
  const live = r?.live ?? null
  const nowStep = UPDATE_STEPS[Math.min(stepOf(r?.phase, live), UPDATE_STEPS.length - 1)]
  const nowNums = stepNumbers(nowStep, live)
  const steps = running
    ? [['check', fmt(P.runningDetail, { why, when: whenText(r?.startedAt, WHEN) ?? '', phase: phaseWords(r?.phase) || phaseWords('update') })],
       ...(live ? [['spark', `${RUN.steps[nowStep]}${nowNums ? ` · ${nowNums}` : ''}`]] : [])]
    : [['clock', fmt(P.waitingDetail, { why, since: whenText(o.since, WHEN) ?? '' })]]
  const state = running ? queueWords({ state: 'running' }, r?.phase) : queueWords({ state: 'queued', position: i + 1 })
  const at = running ? stepOf(r?.phase, live) : -1
  // redesign R6d (对照.md, 运行与排队): the step dots sit beside the state, in the heading's small line — the design's
  // streams/app.js moves them there (「把进度点放到阶段状态旁」) and the template styles them only there (round11/workbench.css
  // .phase-label .step-dots; 单线黑白's line.css .phase-heading .step-dots). They were left in the details, where they lay
  // across the lower edge of the heading. The one waiting has its dots too, none marked, as the design's picture has.
  const dots = html`<span class="step-dots" aria-hidden="true">${UPDATE_STEPS.map((id, k) => html`<i key=${id} class=${k < at ? 'complete' : k === at ? 'wait' : ''}></i>`)}</span>`
  const more = useRef(null)
  // 1.1.3 (菜单四): 「更多」 outside the summary (a click on it does not open or fold the row), and a right click on the row
  return html`<div class="st-rp-rowwrap" onContextMenu=${e => { e.preventDefault(); onMenu?.({ kind: running ? 'running' : 'queued', libraryId: o.libraryId }, e.clientX, e.clientY, more.current) }}>
  <span class="st-act st-rp-rowmore" data-action="row-more"><button type="button" class="icon-btn" ref=${more} aria-label=${`${T.progress.menu.more} · ${name}`} aria-haspopup="menu"
    onClick=${() => { const b = more.current?.getBoundingClientRect(); onMenu?.({ kind: running ? 'running' : 'queued', libraryId: o.libraryId }, b ? b.right - 190 : 0, b ? b.bottom + 4 : 0, more.current) }}><${TIcon} name="down" /></button></span>
  <details class=${`phase-row${running ? ' current' : ''}`} open=${running} data-part=${running ? 'running' : undefined}
    data-library=${o.libraryId ?? ''} data-phase=${running ? r?.phase ?? '' : undefined}
    data-queue-row=${o.libraryId ?? ''} data-position=${i + 1} data-here=${String(o.libraryId === here)} data-why=${o.why ?? ''}>
    <summary class="phase-heading">
      <span class="phase-index">${pad(i + 1)}</span>
      ${running ? html`<span class="st-mo-breathe" data-mo="panel" aria-hidden="true"></span>` : null}
      <span class="phase-label">${running ? fmt(P.runningTitle, { name }) : name}<small>${state}${o.libraryId === here ? `${SEP}${P.here}` : ''}${dots}</small></span>
      <${TIcon} name="down" />
    </summary>
    <div class="phase-details">
      ${steps.map(([ic, t], k) => html`<div key=${k} class="step-line" data-part=${running && k === 0 ? 'running-phase' : undefined}><${TIcon} name=${ic} /><span>${t}</span></div>`)}
      ${running ? html`<div class="mini-chart" data-part="running-calls"><div class="chart-row"><span>${P.calls}</span>
        <b data-calls=${r?.calls ?? 0}>${fmt(P.callsNoCap, { calls: r?.calls ?? 0 })}</b></div></div>
        <span class="st-act" data-action="panel-stop"><button type="button" class="btn" disabled=${stopping} onClick=${onStop}><${TIcon} name="stop" /> ${stopping ? P.stopping : P.stop}</button></span>` : null}
    </div>
  </details></div>`
}

/** The current library's last run in one line (getHome().lastRound): the line 待看 shows when empty, the same data. */
function LastRunHere({ libraryId }) {
  const home = useLoad(() => call('getHome'), [libraryId])
  useEvent('inbox-changed', () => home.reload(), [libraryId])
  useEvent('library-changed', () => home.reload(), [libraryId])
  useEvent('round-progress', p => { if (p?.done) home.reload() }, [libraryId])
  return html`<div class="panel-section" data-part="last-run-here">
    ${home.data ? html`<${LastRun} record=${home.data.lastRound} here=${true} />` : null}
  </div>`
}

/** 菜单四 (plan 9.5): 打开此库 (every row) · 立即运行 · 修改定时 (a row of the next runs) · 停止运行 (the one running). */
export function progressMenuItems(kind, libraryId, q) {
  const M = T.progress.menu
  const busy = q?.running?.libraryId === libraryId || (q?.waiting ?? []).some(w => w.libraryId === libraryId)
  if (kind === 'running') return [{ id: 'open', label: M.open }, { id: 'stop', label: M.stop }]
  if (kind === 'next') return [{ id: 'open', label: M.open }, { id: 'run-now', label: M.runNow, disabled: busy }, { id: 'schedule', label: M.schedule }]
  return [{ id: 'open', label: M.open }]
}

function ProgressPane() {
  const { queue, appState, route, openLibrary } = useApp()
  const { rowOf } = useNames()
  const [menu, setMenu] = useState(null)
  const [menuFailed, setMenuFailed] = useState(false)
  const onMenu = (row, x, y, back) => setMenu({ row, x, y, back })
  const here = appState?.data?.library?.libraryId ?? null
  const onLibrary = LIBRARY_ROUTES.includes(route?.screen) && here !== null
  const [stopping, setStopping] = useState(null)
  const q = queue?.data ?? null
  const P = T.progress
  if (!q) {
    return html`<div class="st-rp-pane" data-pane="progress">
      <p class="muted" role=${queue?.status === 'error' ? 'alert' : undefined}>${queue?.status === 'error' ? P.loadFailed : ''}</p>
      ${onLibrary ? html`<${LastRunHere} libraryId=${here} />` : null}
    </div>`
  }
  const name = id => rowOf(id)?.name ?? P.unknownLibrary
  const now = new Date()
  const r = q.running
  const waiting = Array.isArray(q.waiting) ? q.waiting : []
  const next = Array.isArray(q.next) ? q.next : []
  const busy = Boolean(r) || waiting.length > 0
  const order = [...(r ? [{ libraryId: r.libraryId, running: true, why: r.why }] : []), ...waiting]
  const withAfter = order.map((o, i) => (i > 0 && !o.running ? { ...o, after: name(order[i - 1].libraryId) } : o))
  const stop = async () => {
    setStopping(r?.roundId ?? 'x')
    try { await call('cancelRound') } catch { setStopping(null) }
  }
  return html`<div class="st-rp-pane" data-pane="progress">
    <${PanelSummary} part="progress-summary" eyebrow=${P.eyebrow} title=${busy ? fmt(P.summary, { running: r ? 1 : 0, waiting: waiting.length }) : P.idle}>
      <p>${P.rule}</p>
      <div class="progress-line" aria-hidden="true"><span class=${busy ? 'now' : 'done'}></span><span></span></div>
      <div class="progress-caption"><span>${busy ? fmt(P.queueSize, { n: order.length }) : fmt(P.asOf, { hm: `${pad(now.getHours())}:${pad(now.getMinutes())}` })}</span><span>${r ? doingOf(r.why, QUEUE.why) : ''}</span></div>
    <//>
    <div class="st-rp-order" data-part="order" data-empty=${String(order.length === 0)}>
      ${withAfter.map((o, i) => html`${i === (r ? 1 : 0) && !o.running ? html`<div class="section-label" key="order-label"><span>${P.order}</span></div>` : null}
        <${QueueRow} key=${`${o.libraryId}:${i}`} o=${o} i=${i} here=${here} name=${name(o.libraryId)} running=${Boolean(o.running)} r=${r}
          onStop=${stop} stopping=${Boolean(stopping) && stopping === (r?.roundId ?? 'x')} onMenu=${onMenu} />`)}
      ${order.length ? null : html`<p class="limit-note">${P.orderNone}</p>`}
    </div>
    <div class="panel-section" data-part="next" data-empty=${String(next.length === 0)}>
      <div class="section-label"><span>${P.next}</span></div>
      ${next.length ? next.map(n => html`<${NextRow} key=${n.libraryId} n=${n} name=${name(n.libraryId)} onMenu=${onMenu} />`)
        : html`<p class="limit-note">${P.nextNone}</p>`}
      <p class="limit-note" data-part="keep-running">${P.keepRunning}</p>
    </div>
    ${onLibrary ? html`<${LastRunHere} libraryId=${here} />` : null}
    ${menuFailed ? html`<p class="progress-alert" role="alert" data-part="row-menu-failed">${T.progress.menu.failed}</p>` : null}
    ${menu ? html`<${Menu} label=${T.progress.menu.label} x=${menu.x} y=${menu.y} items=${progressMenuItems(menu.row.kind, menu.row.libraryId, q)}
      onSelect=${async id => {
        const { row, back } = menu
        setMenu(null)
        back?.focus?.()
        setMenuFailed(false)
        try {
          if (id === 'open') await openLibrary(row.libraryId, { screen: 'inbox', params: {} })
          else if (id === 'run-now') await call('runLibrary', row.libraryId)
          else if (id === 'schedule') await openLibrary(row.libraryId, { screen: 'sources', params: { section: 'run' } })
          else if (id === 'stop') await stop()
        } catch { setMenuFailed(true) }
      }}
      onClose=${({ restoreFocus }) => { const b = menu.back; setMenu(null); if (restoreFocus) b?.focus?.() }} />` : null}
  </div>`
}

/** A library of 下次运行 (the template's activity-row) with its 「更多」 (菜单四). */
function NextRow({ n, name, onMenu }) {
  const more = useRef(null)
  const open = (x, y) => onMenu({ kind: 'next', libraryId: n.libraryId }, x, y, more.current)
  return html`<div class="activity-row st-rp-next" data-next-row=${n.libraryId} data-at=${n.at} onContextMenu=${e => { e.preventDefault(); open(e.clientX, e.clientY) }}>
    <span class="st-rp-next__name">${name}</span><small>${nextText(n.at, NEXT_WHEN) ?? ''}</small>
    <span class="st-act st-rp-rowmore" data-action="row-more"><button type="button" class="icon-btn" ref=${more} aria-label=${`${T.progress.menu.more} · ${name}`} aria-haspopup="menu"
      onClick=${() => { const b = more.current?.getBoundingClientRect(); open(b ? b.right - 190 : 0, b ? b.bottom + 4 : 0) }}><${TIcon} name="down" /></button></span>
  </div>`
}

// ---- 待确认 -------------------------------------------------------------------------------------------------------------

/**
 * A library card waiting for 确认 (1.1 W6b; 1.1.3: one of many — x: a card of listConversations: { conv, mode, library, name,
 * urls, sources, at, stale, busy }) — 放弃 (confirmed: plan 6.3), 查看完整建库卡 (its conversation, at the card), 确认 (as the
 * card's own in the conversation; not while its library's card changed since, nor while its conversation's agent works).
 */
function BuildWaiting({ x, here }) {
  const app = useApp()
  const [acting, setActing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [asking, setAsking] = useState(false)
  const [menu, setMenu] = useState(null)
  const more = useRef(null)
  const edit = x.mode === 'edit'
  const cv = x.mode === 'convert' ? BUILD.convert : null
  const D = T.decide
  const act = async fn => {
    if (acting) return
    setActing(true)
    setFailed(false)
    try { await fn() } catch { setFailed(true) } finally { setActing(false) }
  }
  const drop = async () => { await call('dropBuild', x.conv); app?.conversations?.reload?.() }
  const full = () => app?.openConversation?.(x.conv, { card: true })
  const items = [
    { id: 'full', label: BUILD.full },
    ...(x.mode === 'create' ? [] : [{ id: 'open-library', label: BUILD.menu.openLibrary }]),
    { id: 'drop', label: dropWords(x.mode), danger: true },
  ]
  const pick = id => {
    if (id === 'full') full()
    else if (id === 'open-library' && x.library?.id) void act(() => app.openLibrary(x.library.id, { screen: 'inbox', params: {} }))
    else if (id === 'drop') setAsking(true)
  }
  const atButton = () => { const r = more.current?.getBoundingClientRect(); setMenu({ x: r ? r.right - 190 : 0, y: r ? r.bottom + 4 : 0 }) }
  return html`<article class="confirmation st-rp-decide" data-part="build-waiting" data-mode=${x.mode} data-conv=${x.conv} data-here=${here ? 'true' : undefined} data-stale=${String(x.stale === true)} data-size="compact"
    onContextMenu=${e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}>
    <div class="card-body">
      <div class="st-rp-decide__top"><span class="eyebrow" data-part="from">${cv?.panelEyebrow ?? (edit ? BUILD.panelEditEyebrow : BUILD.panelEyebrow)}</span>
        ${here ? html`<span class="st-rp-decide__here" data-part="here">${x.mode === 'create' ? D.hereConv : D.here}</span>` : null}
        <span class="st-act st-rp-decide__more" data-action="card-more"><button type="button" class="icon-btn" ref=${more} aria-label=${BUILD.menu.cardLabel} aria-haspopup="menu" onClick=${atButton}><${TIcon} name="down" /></button></span></div>
      <h3 data-part="sentence">${fmt(cv?.cardTitle ?? (edit ? BUILD.editCardTitle : BUILD.cardTitle), { name: x.name ?? '' })}</h3>
      <p class="muted" data-part="evidence">${fmt(BUILD.panelLine, { urls: x.urls ?? 0, sources: x.sources ?? 0 })}</p>
      ${x.at ? html`<p class="muted st-rp-decide__at" data-part="submitted">${fmt(D.at, { when: whenText(x.at, WHEN) ?? '' })}</p>` : null}
      ${x.stale ? html`<p class="limit-note" role="note" data-part="stale">${fmt(BUILD.notWhole, { what: BUILD.stale })}</p>` : null}
    </div>
    <div class="confirm-footer" data-busy=${String(acting)}><div class="row">
      <span class="st-act" data-action="drop"><button type="button" class="btn quiet" disabled=${acting} onClick=${() => setAsking(true)}>${dropWords(x.mode)}</button></span>
      <span class="st-act" data-action="full"><button type="button" class="btn" onClick=${full}>${BUILD.full}</button></span>
      <span class="st-act" data-action="confirm"><button type="button" class="btn primary" disabled=${acting || x.busy || x.stale} onClick=${() => act(() => confirmAndOpen(app, x.conv))}><${TIcon} name="approve" fallback="check" /> ${cv?.confirm ?? (edit ? BUILD.confirmEdit : BUILD.confirm)}</button></span>
    </div></div>
    ${failed ? html`<p class="limit-note" role="alert" data-part="call-failed">${BUILD.failedCall}</p>` : null}
    ${menu ? html`<${Menu} label=${BUILD.menu.cardLabel} x=${menu.x} y=${menu.y} items=${items}
      onSelect=${id => { setMenu(null); more.current?.focus(); pick(id) }} onClose=${({ restoreFocus }) => { setMenu(null); if (restoreFocus) more.current?.focus() }} />` : null}
    ${asking ? html`<${DropDialog} mode=${x.mode} name=${x.library?.name ?? x.name ?? ''} onConfirm=${drop} onClose=${() => setAsking(false)} />` : null}
  </article>`
}

/** The cards in their order (plan 第八节): the one of where you are first, then the one waiting longest. */
export function cardsInOrder(cards, { libraryId = null, conv = null } = {}) {
  const list = Array.isArray(cards) ? [...cards] : []
  const isHere = c => (conv && c.conv === conv) || (libraryId && c.library?.id === libraryId)
  list.sort((p, q) => (isHere(q) ? 1 : 0) - (isHere(p) ? 1 : 0) || String(p.at ?? '').localeCompare(String(q.at ?? '')))
  return list.map(c => ({ c, here: Boolean(isHere(c)) }))
}

/** Where you are, for the order of the cards: the conversation shown on 主 Agent's page, else the library of its page. */
function useWhere() {
  const { route, appState } = useApp()
  const params = route?.screen === 'build' ? route.params ?? {} : {}
  const conv = typeof params.conv === 'string' ? params.conv : typeof params.edit === 'string' ? `lib:${params.edit}` : typeof params.from === 'string' ? `lib:${params.from}` : null
  const libraryId = conv?.startsWith('lib:') ? conv.slice(4) : LIBRARY_ROUTES.includes(route?.screen) ? appState?.data?.library?.libraryId ?? null : null
  return { conv, libraryId }
}

/** 待确认: every card waiting for 确认 (1.1.3); the head says how many (the tab's number). */
function DecidePane() {
  const { conversations } = useApp()
  const L = T.decide
  const where = useWhere()
  const cards = cardsInOrder(conversations?.data?.cards, where)
  const n = cards.length
  return html`<div class="st-rp-pane" data-pane="decide" data-count=${n}>
    <${PanelSummary} part="decide-summary" eyebrow=${L.eyebrow} title=${n ? html`<span data-part="decide-title" data-count=${n}>${fmt(L.title, { n })}</span>` : html`<span data-part="decide-none">${L.none}</span>`}>
      ${n ? html`<p data-part="decide-lead">${fmt(L.lead, { n })}</p>` : null}
    <//>
    ${conversations?.status === 'error' && !n ? html`<p class="progress-alert" role="alert">${L.loadFailed}</p>` : null}
    ${n ? html`<div class="st-stack" data-part="decide-list">${cards.map(({ c, here }) => html`<${BuildWaiting} key=${c.conv} x=${c} here=${here} />`)}</div>` : null}
  </div>`
}

// ---- 详情 ---------------------------------------------------------------------------------------------------------------

/** 详情's frame for a screen that has something chosen: the head (where · the title · a line under it), then what the screen gives. */
export function DetailBlock({ where, title, lead = null, part, children }) {
  return html`<div class="st-rp-detail" data-part=${part}>
    <${PanelSummary} part="detail-head" eyebrow=${fmt(T.detail.eyebrow, { where })} title=${title}>${lead ? html`<p data-part="detail-lead">${lead}</p>` : null}<//>
    ${children}
  </div>`
}

function DetailPane({ detail }) {
  return html`<div class="st-rp-pane" data-pane="detail">
    ${detail ?? html`<div class="panel-summary"><span class="eyebrow">${T.tabs.detail}</span><p class="st-rp-none" data-part="detail-none">${T.detail.none}</p></div>`}
  </div>`
}

// ---- 文件 ---------------------------------------------------------------------------------------------------------------

function NoteLeaf({ note, topic, onOpen, onMenu }) {
  const more = useRef(null)
  return html`<div class="st-rp-tree__leaf" data-tree-note=${note.id}>
    <button type="button" class="file-row st-rp-tree__row" onClick=${() => onOpen(note.id)}
      onContextMenu=${e => { e.preventDefault(); onMenu(note, e.clientX, e.clientY, null) }}>
      <span class="file-icon"><${TIcon} name="file" /></span><span class="file-text">${note.title}<small>${topic}</small></span>
    </button>
    <span class="st-act" data-action="note-more">
      <button type="button" class="icon-btn" ref=${more} aria-label=${`${T.files.more}${SEP}${note.title}`} aria-haspopup="menu"
        onClick=${() => { const r = more.current?.getBoundingClientRect(); onMenu(note, r ? r.left : 0, r ? r.bottom + 4 : 0, more.current) }}><${TIcon} name="down" /></button>
    </span>
  </div>`
}

/** A heading that folds what is under it (the template's section-label as a button). */
function FoldRow({ open, onToggle, label, hint }) {
  return html`<button type="button" class="section-label st-rp-fold" aria-expanded=${String(open)} onClick=${onToggle}>
    <span>${label}</span><small class="muted">${hint ?? ''} <${TIcon} name="down" /></small>
  </button>`
}

function TopicGroup({ group, first, onOpen, onMenu }) {
  const [open, setOpen] = useState(first)
  const label = fmt(T.files.topic, { topic: group.topic ?? T.files.untopiced, n: group.count })
  return html`<div class="st-rp-tree__topic" data-tree-topic=${group.topic ?? ''} data-open=${String(open)}>
    <${FoldRow} open=${open} onToggle=${() => setOpen(o => !o)} label=${label} />
    ${open ? group.notes.map(n => html`<${NoteLeaf} key=${n.id} note=${n} topic=${group.topic ?? T.files.untopiced} onOpen=${onOpen} onMenu=${onMenu} />`) : null}
  </div>`
}

function FilesPane() {
  const { appState, navigate, route } = useApp()
  const F = T.files
  const current = appState?.data?.library ?? null
  const id = current?.libraryId ?? null
  // a page of a library has one; 库架, 主 Agent, 设置 do not (contract L2)
  const onLibrary = LIBRARY_ROUTES.includes(route?.screen) && id !== null
  const outline = useLoad(() => (onLibrary ? call('getLibraryOutline') : null), [onLibrary, id])
  useEvent('library-changed', () => { if (onLibrary) outline.reload() }, [onLibrary, id])
  useEvent('inbox-changed', p => { if (onLibrary && (!p?.libraryId || p.libraryId === id)) outline.reload() }, [onLibrary, id])
  const [notesOpen, setNotesOpen] = useState(true)
  // 程序记录（无需修改）: folded until you open it (contract L2)
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const [error, setError] = useState(null)
  if (!onLibrary) return html`<div class="st-rp-pane" data-pane="files"><div class="panel-summary"><span class="eyebrow">${F.eyebrow}</span><p class="st-rp-none" data-part="no-library">${F.noLibrary}</p></div></div>`
  const o = outline.data
  const doCall = async (name, ...args) => {
    setError(null)
    try { await call(name, ...args) } catch { setError(F.failed) }
  }
  const openNote = noteId => navigate('library', { id: noteId })
  const onMenu = (note, x, y, back) => setMenu({ note, x, y, back })
  const groups = o?.notes?.groups ?? []
  // redesign R4b (P14 · P16): 「文件 · 库的文件结构」, the library's name and folder, 在资源管理器中显示 on top, then four heads —
  // ▾ 笔记（n）· 按主题 · ▸ 待看（n）· 尚未生成文件 · ▸ 该库的来源与要求 · ▸ 程序记录（无需修改） — the template's section-label
  // as a head (FoldRow), file-row under it
  return html`<div class="st-rp-pane" data-pane="files">
    <${PanelSummary} part="files-head" eyebrow=${F.eyebrow} title=${o?.name ?? current?.name ?? ''}>
      <p data-part="files-path">${current?.path ?? ''}</p>
    <//>
    <span class="st-act st-rp-reveal" data-action="reveal-library"><button type="button" class="btn" onClick=${() => doCall('revealLibrary')}><${TIcon} name="external" /> ${F.reveal}</button></span>
    ${error ? html`<p class="progress-alert" role="alert">${error}</p>` : null}
    ${outline.status === 'error' && !o ? html`<p class="progress-alert" role="alert">${F.loadFailed}</p>` : null}
    ${o ? html`<div class="st-rp-tree" aria-label=${F.eyebrow}>
      <div class="st-rp-tree__node" data-tree="notes" data-open=${String(notesOpen)}>
        <${FoldRow} open=${notesOpen} onToggle=${() => setNotesOpen(v => !v)} label=${fmt(F.notes, { n: o.notes.count })} />
        ${notesOpen ? html`<p class="limit-note st-rp-lead">${F.lead}</p>` : null}
        ${notesOpen ? (groups.length === 1 && groups[0].topic === null
          // 1.1.1 P11b (场景四②): no note has a topic (a library made by a card): the notes themselves, no lone 「未分主题」 group
          ? html`<div class="st-rp-tree__flat" data-tree-flat="true">${groups[0].notes.map(n => html`<${NoteLeaf} key=${n.id} note=${n} topic="" onOpen=${openNote} onMenu=${onMenu} />`)}</div>`
          : groups.length ? groups.map((g, i) => html`<${TopicGroup} key=${g.topic ?? ''} group=${g} first=${i === 0} onOpen=${openNote} onMenu=${onMenu} />`)
          : html`<p class="limit-note">${F.notesNone}</p>`) : null}
      </div>
      <div class="st-rp-tree__node" data-tree="inbox">
        <button type="button" class="section-label st-rp-fold st-rp-go" title=${F.inboxHint} onClick=${() => navigate('inbox')}>
          <span>${fmt(F.inbox, { n: o.inbox.count })}</span><small class="muted"><${TIcon} name="arrow" /></small>
        </button>
      </div>
      <div class="st-rp-tree__node" data-tree="requirements">
        <button type="button" class="section-label st-rp-fold st-rp-go" title=${fmt(F.requirementsHint, { sources: o.requirements?.sources ?? 0, topics: o.requirements?.topics ?? 0 })} onClick=${() => navigate('sources')}>
          <span>${F.requirements}</span><small class="muted"><${TIcon} name="arrow" /></small>
        </button>
      </div>
      <div class="st-rp-tree__node" data-tree="records" data-open=${String(recordsOpen)}>
        <${FoldRow} open=${recordsOpen} onToggle=${() => setRecordsOpen(v => !v)} label=${F.records} />
        ${recordsOpen ? html`<div class="st-rp-tree__records">
          <p class="limit-note">${F.recordsText}</p>
          <span class="st-act" data-action="reveal-records"><button type="button" class="btn" onClick=${() => doCall('revealProgramRecords')}><${TIcon} name="external" /> ${F.reveal}</button></span>
        </div>` : null}
      </div>
    </div>` : null}
    ${menu ? html`<${Menu} label=${F.moreLabel} x=${menu.x} y=${menu.y} items=${[{ id: 'obsidian', label: F.obsidian }, { id: 'folder', label: F.folder }]}
      onSelect=${choice => { const n = menu.note; setMenu(null); doCall(choice === 'obsidian' ? 'openInObsidian' : 'showNoteInFolder', n.id) }}
      onClose=${({ restoreFocus }) => { const b = menu.back; setMenu(null); if (restoreFocus) b?.focus() }} />` : null}
  </div>`
}

// ---- the panel --------------------------------------------------------------------------------------------------------

/** The panel itself. `detail`: what the screen shows in 详情 (null: one sentence). */
export function RightPanel({ detail = null }) {
  const { appState, setPanel, conversations } = useApp()
  const panel = appState?.data?.panel ?? null
  const open = panel?.open !== false
  const tab = TAB_IDS.includes(panel?.tab) ? panel.tab : 'detail'
  // redesign R5b (O5): the number is the list's length, the same list 待确认 shows (1.1.3: every conversation's card)
  const n = Array.isArray(conversations?.data?.cards) ? conversations.data.cards.length : 0
  const icons = hasTabIcons()
  const badge = id => (id === 'decide' && n > 0 ? html` <small class="st-count" data-panel-badge=${id} aria-label=${fmt(T.decideBadge, { n })}>${n}</small>` : null)
  if (!open) {
    return html`<aside class="context-panel st-rail" data-part="right-panel" data-open="false" data-tab=${tab} aria-label=${T.label}>
      <span class="st-act" data-action="unfold"><button type="button" class="icon-btn" aria-label=${T.unfold} title=${T.unfold} onClick=${() => setPanel({ open: true })}><${TIcon} name="back" /></button></span>
      ${PANEL_TABS.map(([id, icon]) => html`<button type="button" key=${id} class=${`icon-btn st-rail__tab${id === tab ? ' active' : ''}`} data-rail-tab=${id} aria-label=${T.tabs[id]} title=${T.tabs[id]}
        onClick=${() => setPanel({ open: true, tab: id })}><${TIcon} name=${icon} />${badge(id)}</button>`)}
    </aside>`
  }
  let pane
  if (tab === 'progress') pane = html`<${ProgressPane} />`
  else if (tab === 'decide') pane = html`<${DecidePane} />`
  else if (tab === 'files') pane = html`<${FilesPane} />`
  else pane = html`<${DetailPane} detail=${detail} />`
  return html`<aside class="context-panel" data-part="right-panel" data-open="true" data-tab=${tab} aria-label=${T.label}>
    <nav class="panel-tabs st-rp-tabs" role="tablist" aria-label=${T.tabsLabel}>
      ${PANEL_TABS.map(([id, icon]) => html`<button type="button" key=${id} role="tab" class=${`tab${id === tab ? ' active' : ''}`} data-panel-tab=${id}
        aria-selected=${String(id === tab)} aria-current=${id === tab ? 'true' : undefined} onClick=${() => { if (id !== tab) setPanel({ tab: id }) }}>
        ${icons ? html`<${TIcon} name=${icon} />` : null}${T.tabs[id]}${badge(id)}
      </button>`)}
      <span class="st-act st-rp-fold-button" data-action="fold"><button type="button" class="icon-btn" aria-label=${T.fold} title=${T.fold} onClick=${() => setPanel({ open: false })}><${TIcon} name="arrow" /></button></span>
    </nav>
    <div class="panel-scroll" id="panel" role="tabpanel">${pane}</div>
  </aside>`
}
