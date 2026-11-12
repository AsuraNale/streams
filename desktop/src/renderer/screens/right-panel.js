// The right panel of the main window (v2 package L; redesign R1 — the template's context-panel, as the design's streams/app.js
// builds it): four tabs — 进度 · 待确认 · 详情 · 文件 (维护者 11-11 第 13 题: 「等你决定」 is 「待确认」) — on the template's
// `nav.panel-tabs` of `.tab` (the edition's tab icons, 待确认's number as `st-count`), and a button that folds it into a 52px
// rail (its four icons, 待确认's number; a click opens that tab). Open or folded, and the tab, are kept in settings.json
// (app.js setPanel → the bridge's setPanel; getAppState().panel), so the next start opens it the same way.
//   进度      every library (the template's panel-summary, phase-row, mini-chart, activity-row): how many run and wait, the round
//             that runs (its library, why, the step it is at, calls / cap, when it started), the queue in order with why each
//             waits, each library's next timed slot (getQueue, app.js useQueue; names from the libraries) — the one place the
//             queue is told in full (F23). Redesign R2 (P07 · P16): the round that runs says why (建库后的第一轮 · 手动触发 · 定时 ·
//             补跑), when it started, its step, calls / cap and has 停止; each one waiting why, since when and 「前一任务完成后
//             自动开始」; the rule 「需保持流息运行…」; nothing running: 「当前无运行任务」. On a library's page, last: that
//             library's last run as the same funnel 待看 shows when empty (screens/run-funnel.js, getHome().lastRun) — not the
//             four numbers, the banners or 运行状态 of R1 any more.
//   待确认    every library's proposals waiting and system findings not handled — the same list the tab's number counts (app.js
//             useWaitingItems): small confirmation cards, its library and one sentence each; a proposal → 主 Agent, scrolled to it;
//             a finding → that library. On a library's page, its findings with their buttons below (screens/suggestion-card.js;
//             the one kind of card is R5's).
//   详情      follows the main area: the screen gives it (`detail`); a screen with nothing chosen: one sentence
//   文件      the current library told as a structure (getLibraryOutline; read only): its notes grouped by the topics of their
//             headers, 待看 (→ 待看), 「该库的来源与要求」 (→ 来源与要求; never streams.json itself), 「程序记录（无需修改）」 folded
//             by default, opened only to 「在资源管理器中显示」 (revealProgramRecords). A note: click → read it in 资料库; right click
//             or 「更多」 → 在 Obsidian 中打开 (openInObsidian) · 在资源管理器中显示 (showNoteInFolder). No program file's name shows.
//             A page with no library of its own (库架, 主 Agent, 设置): one sentence.
// Words: texts/panel.js PANEL / QUEUE. Test hooks: aside[data-part="right-panel"][data-open][data-tab],
// [data-panel-tab=<id>][aria-current] with [data-panel-badge], [data-action="fold"|"unfold"], [data-rail-tab=<id>],
// [data-pane=progress|decide|detail|files]; 进度: [data-part=progress-summary|running|order|next|last-run|keep-running], [data-queue-row=<id>]
// [data-position][data-here][data-why], [data-part="running-phase"], [data-calls][data-cap], [data-next-row=<id>][data-at],
// [data-action="panel-stop"];
// 待确认: [data-decide=<proposal id | libraryId:key>][data-kind=proposal|suggestion][data-library], [data-part="suggestions"];
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
import { RUN_STEPS, stepOf } from './run-steps.js'
import { phaseWords } from '../lib/phase.js'
import { TIcon, hasTabIcons } from '../lib/template-icons.js'
import { LIBRARY_ROUTES, Menu } from '../kit/index.js'
import { NEXT_WHEN, SEP, WHEN } from '../texts/common.js'
import { PANEL as T, QUEUE } from '../texts/panel.js'
import { cardTitle } from './proposal-card.js'
import { LibrarySuggestions, suggestionSentence } from './suggestion-card.js'
import { RunFunnel } from './run-funnel.js'

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
function QueueRow({ o, i, here, name, running, r, onStop, stopping }) {
  const P = T.progress
  const why = doingOf(o.why, QUEUE.why)
  const steps = running
    ? [['check', fmt(P.runningDetail, { why, when: whenText(r?.startedAt, WHEN) ?? '', phase: phaseWords(r?.phase) || phaseWords('self-check') })]]
    : [['clock', fmt(P.waitingDetail, { why, since: whenText(o.since, WHEN) ?? '' })]]
  const state = running ? queueWords({ state: 'running' }, r?.phase) : queueWords({ state: 'queued', position: i + 1 })
  const at = running ? stepOf(r?.phase) : -1
  return html`<details class=${`phase-row${running ? ' current' : ''}`} open=${running} data-part=${running ? 'running' : undefined}
    data-library=${o.libraryId ?? ''} data-phase=${running ? r?.phase ?? '' : undefined}
    data-queue-row=${o.libraryId ?? ''} data-position=${i + 1} data-here=${String(o.libraryId === here)} data-why=${o.why ?? ''}>
    <summary class="phase-heading">
      <span class="phase-index">${pad(i + 1)}</span>
      <span class="phase-label">${running ? fmt(P.runningTitle, { name }) : name}<small>${state}${o.libraryId === here ? `${SEP}${P.here}` : ''}</small></span>
      <${TIcon} name="down" />
    </summary>
    <div class="phase-details">
      ${running ? html`<span class="step-dots" aria-hidden="true">${RUN_STEPS.map((id, k) => html`<i key=${id} class=${k < at ? 'complete' : k === at ? 'wait' : ''}></i>`)}</span>` : null}
      ${steps.map(([ic, t], k) => html`<div key=${k} class="step-line" data-part=${running && k === 0 ? 'running-phase' : undefined}><${TIcon} name=${ic} /><span>${t}</span></div>`)}
      ${running ? html`<div class="mini-chart" data-part="running-calls"><div class="chart-row"><span>${P.calls}</span><div class="chart-track"><div class="chart-bar" style=${{ '--value': `${r && r.cap > 0 ? Math.min(100, Math.floor(((r.calls ?? 0) / r.cap) * 100)) : 0}%` }}></div></div>
        <b data-calls=${r?.calls ?? 0} data-cap=${r?.cap ?? ''}>${r?.cap ? fmt(P.callsValue, { calls: r.calls ?? 0, cap: r.cap }) : fmt(P.callsNoCap, { calls: r?.calls ?? 0 })}</b></div></div>
        <span class="st-act" data-action="panel-stop"><button type="button" class="btn" disabled=${stopping} onClick=${onStop}><${TIcon} name="stop" /> ${stopping ? P.stopping : P.stop}</button></span>` : null}
    </div>
  </details>`
}

/** The current library's last run (getHome().lastRun) as the funnel 待看 shows when empty: the same component, the same data. */
function LastRunHere({ libraryId }) {
  const home = useLoad(() => call('getHome'), [libraryId])
  useEvent('inbox-changed', () => home.reload(), [libraryId])
  useEvent('library-changed', () => home.reload(), [libraryId])
  useEvent('round-progress', p => { if (p?.done) home.reload() }, [libraryId])
  return html`<div class="panel-section" data-part="last-run-here">
    ${home.data ? html`<${RunFunnel} lastRun=${home.data.lastRun} outcome=${false} here=${true} />` : null}
  </div>`
}

function ProgressPane() {
  const { queue, appState, route } = useApp()
  const { rowOf } = useNames()
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
          onStop=${stop} stopping=${Boolean(stopping) && stopping === (r?.roundId ?? 'x')} />`)}
      ${order.length ? null : html`<p class="limit-note">${P.orderNone}</p>`}
    </div>
    <div class="panel-section" data-part="next" data-empty=${String(next.length === 0)}>
      <div class="section-label"><span>${P.next}</span></div>
      ${next.length ? next.map(n => html`<div key=${n.libraryId} class="activity-row" data-next-row=${n.libraryId} data-at=${n.at}>${name(n.libraryId)}<small>${nextText(n.at, NEXT_WHEN) ?? ''}</small></div>`)
        : html`<p class="limit-note">${P.nextNone}</p>`}
      <p class="limit-note" data-part="keep-running">${P.keepRunning}</p>
    </div>
    ${onLibrary ? html`<${LastRunHere} libraryId=${here} />` : null}
  </div>`
}

// ---- 待确认 -------------------------------------------------------------------------------------------------------------

/** One thing waiting (a small confirmation card): where it is from, what it is, where it is handled; a click goes there. */
function DecideCard({ id, kind, libraryId, eyebrow, title, where, onGo, actions = null }) {
  return html`<article class="confirmation st-rp-decide" data-decide=${id} data-kind=${kind} data-library=${libraryId ?? ''} tabindex="0" role="button"
    onClick=${onGo} onKeyDown=${e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onGo() } }}>
    <div class="card-body"><span class="eyebrow">${eyebrow}</span><h3>${title}</h3></div>
    <div class="confirm-footer"><span class="muted">${where}</span>${actions ?? html`<${TIcon} name="arrow" />`}</div>
  </article>`
}

/**
 * Redesign R3 (P13 · P16: 「同一张卡也在右栏『待确认』；在哪边点都一样」): a proposal is decided here with the calls its card in the
 * conversation makes — 确认 (创建 for a new library) → confirmProposal, 拒绝 → declineProposal — and the bridge's
 * proposals-changed reads both places again; 提出修改 needs a sentence: it opens the same card's line where the card is drawn on
 * this page (问库's conversation), else 主 Agent scrolled to the card.
 */
function ProposalActions({ card, onRevise }) {
  const D = T.decide
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const act = name => async e => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    setFailed(false)
    try { await call(name, card.id) } catch { setFailed(true) } finally { setBusy(false) }
  }
  return html`<div class="row" data-part="decide-actions">
    ${failed ? html`<span class="muted" role="alert">${D.failed}</span>` : null}
    <span class="st-act" data-action="decide-decline"><button type="button" class="btn quiet" disabled=${busy} onClick=${act('declineProposal')}>${D.decline}</button></span>
    <span class="st-act" data-action="decide-revise"><button type="button" class="btn" disabled=${busy} onClick=${e => { e.stopPropagation(); onRevise() }}>${D.revise}</button></span>
    <span class="st-act" data-action="decide-confirm"><button type="button" class="btn primary" disabled=${busy} onClick=${act('confirmProposal')}><${TIcon} name="approve" fallback="check" />${card.kind === 'create_library' ? D.create : D.confirm}</button></span>
  </div>`
}

/** 提出修改 from 待确认: the card's own line where the card is on this page, else 主 Agent scrolled to the card. */
function reviseCard(id, navigate) {
  const here = document.querySelector(`.workspace [data-proposal="${id}"]`)
  const button = here?.querySelector('[data-action="revise"] button')
  if (here && button) {
    here.scrollIntoView({ block: 'center' })
    if (!here.querySelector('[data-part="revise"]')) button.click()
    return
  }
  navigate('chat', { card: id })
}

function DecidePane() {
  const { waitingItems, navigate, openLibrary, appState, route } = useApp()
  const { rowOf } = useNames()
  const D = T.decide
  const cards = waitingItems?.cards ?? []
  const suggestions = waitingItems?.suggestions ?? []
  const n = cards.length + suggestions.length
  const name = id => rowOf(id)?.name ?? null
  const here = appState?.data?.library?.libraryId ?? null
  const onLibrary = LIBRARY_ROUTES.includes(route?.screen) && here !== null
  return html`<div class="st-rp-pane" data-pane="decide" data-count=${n}>
    <${PanelSummary} part="decide-summary" eyebrow=${D.eyebrow} title=${n ? fmt(D.title, { n }) : D.none}>
      <p>${D.lead}</p>
    <//>
    <div class="st-stack">
      ${cards.map(c => html`<${DecideCard} key=${c.id} id=${c.id} kind="proposal" libraryId=${c.libraryId}
        eyebrow=${`${D.proposal} / ${c.libraryId ? name(c.libraryId) ?? '' : D.newLibrary}`} title=${cardTitle(c, name(c.libraryId))}
        where=${D.whereChat} onGo=${() => navigate('chat', { card: c.id })}
        actions=${html`<${ProposalActions} card=${c} onRevise=${() => reviseCard(c.id, navigate)} />`} />`)}
      ${suggestions.map(s => html`<${DecideCard} key=${`${s.libraryId}:${s.key}`} id=${`${s.libraryId}:${s.key}`} kind="suggestion" libraryId=${s.libraryId}
        eyebrow=${`${D.suggestion} / ${name(s.libraryId) ?? ''}`} title=${suggestionSentence(s, name)}
        where=${fmt(D.whereLibrary, { name: name(s.libraryId) ?? '' })} onGo=${() => openLibrary(s.libraryId)} />`)}
    </div>
    ${onLibrary ? html`<div class="panel-section st-rp-findings"><div class="section-label"><span>${D.thisLibrary}</span></div><${LibrarySuggestions} libraryId=${here} /></div>` : null}
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
  return html`<div class="st-rp-pane" data-pane="files">
    <${PanelSummary} part="files-head" eyebrow=${F.eyebrow} title=${o?.name ?? current?.name ?? ''}>
      <p>${F.lead}</p>
    <//>
    ${error ? html`<p class="progress-alert" role="alert">${error}</p>` : null}
    ${outline.status === 'error' && !o ? html`<p class="progress-alert" role="alert">${F.loadFailed}</p>` : null}
    ${o ? html`<div class="st-rp-tree" aria-label=${F.eyebrow}>
      <div class="st-rp-tree__node" data-tree="notes" data-open=${String(notesOpen)}>
        <${FoldRow} open=${notesOpen} onToggle=${() => setNotesOpen(v => !v)} label=${fmt(F.notes, { n: o.notes.count })} hint=${F.notesHint} />
        ${notesOpen ? (groups.length ? groups.map((g, i) => html`<${TopicGroup} key=${g.topic ?? ''} group=${g} first=${i === 0} onOpen=${openNote} onMenu=${onMenu} />`)
          : html`<p class="limit-note">${F.notesNone}</p>`) : null}
      </div>
      <div class="panel-section">
        <div class="section-label"><span>${F.other}</span></div>
        <div class="st-rp-tree__node" data-tree="inbox">
          <button type="button" class="file-row" onClick=${() => navigate('inbox')}>
            <span class="file-icon"><${TIcon} name="clock" /></span><span class="file-text">${fmt(F.inbox, { n: o.inbox.count })}<small>${F.inboxHint}</small></span><${TIcon} name="arrow" />
          </button>
        </div>
        <div class="st-rp-tree__node" data-tree="requirements">
          <button type="button" class="file-row" onClick=${() => navigate('sources')}>
            <span class="file-icon"><${TIcon} name="settings" /></span><span class="file-text">${F.requirements}<small>${fmt(F.requirementsHint, { sources: o.requirements?.sources ?? 0, topics: o.requirements?.topics ?? 0 })}</small></span><${TIcon} name="arrow" />
          </button>
        </div>
        <div class="st-rp-tree__node" data-tree="records" data-open=${String(recordsOpen)}>
          <button type="button" class="file-row" aria-expanded=${String(recordsOpen)} onClick=${() => setRecordsOpen(v => !v)}>
            <span class="file-icon"><${TIcon} name="book" /></span><span class="file-text">${F.records}<small>${F.recordsHint}</small></span><${TIcon} name="down" />
          </button>
          ${recordsOpen ? html`<div class="st-rp-tree__records">
            <p class="limit-note">${F.recordsText}</p>
            <span class="st-act" data-action="reveal-records"><button type="button" class="btn" onClick=${() => doCall('revealProgramRecords')}><${TIcon} name="external" /> ${F.reveal}</button></span>
          </div>` : null}
        </div>
      </div>
      <span class="st-act st-rp-reveal" data-action="reveal-library"><button type="button" class="btn" onClick=${() => doCall('revealLibrary')}><${TIcon} name="external" /> ${F.reveal}</button></span>
    </div>` : null}
    ${menu ? html`<${Menu} label=${F.moreLabel} x=${menu.x} y=${menu.y} items=${[{ id: 'obsidian', label: F.obsidian }, { id: 'folder', label: F.folder }]}
      onSelect=${choice => { const n = menu.note; setMenu(null); doCall(choice === 'obsidian' ? 'openInObsidian' : 'showNoteInFolder', n.id) }}
      onClose=${({ restoreFocus }) => { const b = menu.back; setMenu(null); if (restoreFocus) b?.focus() }} />` : null}
  </div>`
}

// ---- the panel --------------------------------------------------------------------------------------------------------

/** The panel itself. `detail`: what the screen shows in 详情 (null: one sentence). */
export function RightPanel({ detail = null }) {
  const { appState, setPanel, waitingItems } = useApp()
  const panel = appState?.data?.panel ?? null
  const open = panel?.open !== false
  const tab = TAB_IDS.includes(panel?.tab) ? panel.tab : 'detail'
  const n = waitingItems?.count ?? 0
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
