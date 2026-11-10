// The right panel of the main window (v2 package L; docs/checks/2026-11-10-wp-l/contract.md L2; design draft
// docs/design/next/themes/ README 第四节): four tabs — 进度 · 等你决定 · 详情 · 文件 — and a button that folds it into a 52px rail
// (its four icons, 等你决定's count; a click opens that tab). Open or folded, and the tab, are kept in settings.json
// (app.js setPanel → the bridge's setPanel; getAppState().panel), so the next start opens it the same way.
//   进度      every library: the round that runs (its library, why, the step it is at, calls / cap, when it started), the queue
//             in order with why each waits, each library's next timed slot (getQueue, app.js useQueue; names from the libraries)
//   等你决定  every library's proposal cards waiting and suggestion cards not handled — the same list the sidebar's badge counts
//             (app.js useWaitingItems): its library and one sentence each; a click goes where the card is (a proposal card:
//             和主 Agent 聊, scrolled to it; a suggestion card: that library's 概览, its suggestions)
//   详情      follows the main area: the screen gives it (`detail`); a screen with nothing chosen: one sentence
//   文件      the current library told as a structure (getLibraryOutline; read only): its notes grouped by the topics of their
//             headers, 待看 (→ 待看), 「这个库的要求与来源」 (→ 来源与要求; never streams.json itself), 「程序记录（不用动）」 folded by
//             default, opened only to 「在资源管理器中显示」 (revealProgramRecords). A note: click → read it in 资料库; right click
//             or 「更多」 → 用 Obsidian 打开 (openInObsidian) · 在资源管理器中显示 (showNoteInFolder). No program file's name shows.
//             A page with no library of its own (库架, 和主 Agent 聊, 设置): 「先选一个库」.
// Words: texts/panel.js PANEL / QUEUE. Test hooks: aside[data-part="right-panel"][data-open][data-tab],
// [data-panel-tab=<id>][aria-current] with [data-panel-badge], [data-action="fold"|"unfold"], [data-rail-tab=<id>],
// [data-pane=progress|decide|detail|files]; 进度: [data-part=progress-summary|running|order|next], [data-queue-row=<id>]
// [data-position][data-here], [data-next-row=<id>]; 等你决定: [data-decide=<proposal id | libraryId:key>][data-kind=proposal|suggestion]
// [data-library]; 详情: [data-part="detail-none"]; 文件: [data-part=files-head|no-library], [data-tree=notes|inbox|requirements|
// records][data-open], [data-tree-topic=<topic | "">], [data-tree-note=<id>], [data-action=reveal-library|reveal-records|
// note-more], the menu's [data-menu-item=obsidian|folder].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { doingOf } from '../lib/queue.js'
import { Icon, LIBRARY_ROUTES, LibraryMark, Menu } from '../kit/index.js'
import { NEXT_WHEN, NODE_NAMES, ROUND_PHASES, SEP, WHEN } from '../texts/common.js'
import { PANEL as T, QUEUE } from '../texts/panel.js'
import { cardTitle } from './proposal-card.js'
import { suggestionSentence } from './suggestion-card.js'

/** The four tabs, in order, with their icons. */
export const PANEL_TABS = Object.freeze([['progress', 'chart'], ['decide', 'checklist'], ['detail', 'info'], ['files', 'folder']])
const TAB_IDS = PANEL_TABS.map(([id]) => id)

const pad = n => String(n).padStart(2, '0')
const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)

/** A round's phase in words: 自检 · 抓取 · 打分 · 相关度 … */
export function phaseWords(phase) {
  if (typeof phase !== 'string') return ''
  if (phase.startsWith('gate:')) return `${ROUND_PHASES.gate}${SEP}${nodeName(phase.slice(5))}`
  return Object.hasOwn(ROUND_PHASES, phase) ? ROUND_PHASES[phase] : phase
}

/** The panel's grey head block (the draft's panel-summary): a small line, a title, a sentence. */
export function PanelSummary({ eyebrow, title, part, children }) {
  return html`<section class="st-rp-summary" data-part=${part}>
    ${eyebrow ? html`<div class="st-rp-eyebrow">${eyebrow}</div>` : null}
    ${title ? html`<h2 class="st-rp-summary__title">${title}</h2>` : null}
    ${children}
  </section>`
}

function useNames() {
  const { libraries } = useApp()
  const rows = Array.isArray(libraries?.data) ? libraries.data : []
  return { rows, rowOf: id => rows.find(r => r.id === id) ?? null }
}

function Mark({ row }) {
  return html`<${LibraryMark} icon=${row?.icon ?? '?'} color=${row?.color} size="s" />`
}

// ---- 进度 ---------------------------------------------------------------------------------------------------------------

function ProgressPane() {
  const { queue, appState } = useApp()
  const { rowOf } = useNames()
  const here = appState?.data?.library?.libraryId ?? null
  const q = queue?.data ?? null
  const P = T.progress
  if (!q) return html`<p class="st-t-small st-t-muted" role=${queue?.status === 'error' ? 'alert' : undefined}>${queue?.status === 'error' ? P.loadFailed : ''}</p>`
  const name = id => rowOf(id)?.name ?? P.unknownLibrary
  const now = new Date()
  const r = q.running
  const waiting = Array.isArray(q.waiting) ? q.waiting : []
  const next = Array.isArray(q.next) ? q.next : []
  const pct = r && r.cap > 0 ? Math.min(100, Math.floor((r.calls / r.cap) * 100)) : 0
  const order = [...(r ? [{ libraryId: r.libraryId, running: true, why: r.why }] : []), ...waiting]
  return html`<div class="st-rp-pane" data-pane="progress">
    <${PanelSummary} part="progress-summary" eyebrow=${fmt(P.eyebrow, { hm: `${pad(now.getHours())}:${pad(now.getMinutes())}` })}
      title=${r || waiting.length ? fmt(P.summary, { running: r ? 1 : 0, waiting: waiting.length }) : P.idle}>
      <p>${P.rule}</p>
    <//>
    ${r ? html`<section class="st-rp-card st-rp-running" data-part="running" data-library=${r.libraryId ?? ''} data-phase=${r.phase ?? ''}>
      <div class="st-rp-running__head">
        <${Mark} row=${rowOf(r.libraryId)} />
        <div class="st-rp-running__text">
          <div class="st-t-strong">${fmt(P.running, { name: name(r.libraryId) })}</div>
          <div class="st-t-small st-t-sub">${[doingOf(r.why, QUEUE.why), r.startedAt ? fmt(P.started, { when: whenText(r.startedAt, WHEN) ?? '' }) : null].filter(Boolean).join(SEP)}</div>
        </div>
      </div>
      <div class="st-t-small" data-part="running-phase">${fmt(P.phase, { phase: phaseWords(r.phase) })}</div>
      <div class="st-rp-meter">
        <span class="st-t-small st-t-sub">${P.calls}</span>
        <span class="st-rp-meter__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}><span class="st-rp-meter__fill" style=${{ width: `${pct}%` }}></span></span>
        <b class="st-rp-meter__value" data-calls=${r.calls ?? 0} data-cap=${r.cap ?? ''}>${r.cap ? fmt(P.callsValue, { calls: r.calls ?? 0, cap: r.cap }) : fmt(P.callsNoCap, { calls: r.calls ?? 0 })}</b>
      </div>
    </section>` : null}
    <h3 class="st-rp-heading">${P.order}</h3>
    ${order.length ? html`<ol class="st-rp-queue" data-part="order">
      ${order.map((o, i) => html`<li key=${`${o.libraryId}:${i}`} class=${`st-rp-queue__row${o.libraryId === here ? ' st-rp-queue__row--here' : ''}`}
        data-queue-row=${o.libraryId ?? ''} data-position=${i + 1} data-here=${String(o.libraryId === here)} data-why=${o.why ?? ''}>
        <span class="st-rp-queue__n">${i + 1}</span>
        <${Mark} row=${rowOf(o.libraryId)} />
        <span class="st-rp-queue__text">
          <span>${name(o.libraryId)}</span>
          ${o.libraryId === here ? html`<span class="st-t-tiny st-t-sub" data-part="here">${P.here}</span>` : null}
          <span class="st-t-tiny st-t-sub">${o.running ? fmt(P.runningLine, { why: doingOf(o.why, QUEUE.why) }) : fmt(P.waitingLine, { why: doingOf(o.why, QUEUE.why), since: whenText(o.since, WHEN) ?? '' })}</span>
          ${!o.running && i > 0 ? html`<span class="st-t-tiny st-t-sub">${fmt(P.after, { name: name(order[i - 1].libraryId) })}</span>` : null}
        </span>
      </li>`)}
    </ol>` : html`<p class="st-t-small st-t-muted" data-part="order" data-empty="true">${P.orderNone}</p>`}
    <h3 class="st-rp-heading">${P.next}</h3>
    ${next.length ? html`<ul class="st-rp-next" data-part="next">
      ${next.map(n => html`<li key=${n.libraryId} class="st-rp-next__row" data-next-row=${n.libraryId} data-at=${n.at}>
        <${Mark} row=${rowOf(n.libraryId)} /><span class="st-rp-next__name">${name(n.libraryId)}</span>
        <span class="st-rp-next__when">${nextText(n.at, NEXT_WHEN) ?? ''}</span>
      </li>`)}
    </ul>` : html`<p class="st-t-small st-t-muted" data-part="next" data-empty="true">${P.nextNone}</p>`}
  </div>`
}

// ---- 等你决定 -----------------------------------------------------------------------------------------------------------

function DecidePane() {
  const { waitingItems, navigate, openLibrary } = useApp()
  const { rowOf } = useNames()
  const D = T.decide
  const cards = waitingItems?.cards ?? []
  const suggestions = waitingItems?.suggestions ?? []
  const n = cards.length + suggestions.length
  const name = id => rowOf(id)?.name ?? null
  return html`<div class="st-rp-pane" data-pane="decide" data-count=${n}>
    <${PanelSummary} part="decide-summary" eyebrow=${D.eyebrow} title=${n ? fmt(D.title, { n }) : D.none}>
      <p>${D.lead}</p>
    <//>
    ${cards.map(c => html`<button type="button" key=${c.id} class="st-rp-decide" data-decide=${c.id} data-kind="proposal" data-library=${c.libraryId ?? ''}
      onClick=${() => navigate('chat', { card: c.id })}>
      <span class="st-rp-decide__kind st-rp-decide__kind--proposal">${D.proposal}</span>
      <span class="st-rp-decide__lib">${c.libraryId ? html`<${Mark} row=${rowOf(c.libraryId)} />` : null}<span>${c.libraryId ? name(c.libraryId) ?? '' : D.newLibrary}</span></span>
      <b class="st-rp-decide__title">${cardTitle(c, name(c.libraryId))}</b>
      <span class="st-rp-decide__where">${D.whereChat}<${Icon} name="chevron-right" /></span>
    </button>`)}
    ${suggestions.map(s => html`<button type="button" key=${`${s.libraryId}:${s.key}`} class="st-rp-decide" data-decide=${`${s.libraryId}:${s.key}`} data-kind="suggestion" data-library=${s.libraryId ?? ''}
      onClick=${() => openLibrary(s.libraryId, { screen: 'overview', params: { section: 'suggestions' } })}>
      <span class="st-rp-decide__kind st-rp-decide__kind--suggestion">${D.suggestion}</span>
      <span class="st-rp-decide__lib"><${Mark} row=${rowOf(s.libraryId)} /><span>${name(s.libraryId) ?? ''}</span></span>
      <b class="st-rp-decide__title">${suggestionSentence(s, name)}</b>
      <span class="st-rp-decide__where">${fmt(D.whereLibrary, { name: name(s.libraryId) ?? '' })}<${Icon} name="chevron-right" /></span>
    </button>`)}
  </div>`
}

// ---- 详情 ---------------------------------------------------------------------------------------------------------------

/** 详情's frame for a screen that has something chosen: the grey head (where · the title), then what the screen gives. */
export function DetailBlock({ where, title, part, children }) {
  return html`<div class="st-rp-detail" data-part=${part}>
    <${PanelSummary} part="detail-head" eyebrow=${fmt(T.detail.eyebrow, { where })} title=${title} />
    ${children}
  </div>`
}

function DetailPane({ detail }) {
  return html`<div class="st-rp-pane" data-pane="detail">
    ${detail ?? html`<p class="st-t-small st-t-sub st-rp-none" data-part="detail-none">${T.detail.none}</p>`}
  </div>`
}

// ---- 文件 ---------------------------------------------------------------------------------------------------------------

function NoteLeaf({ note, onOpen, onMenu }) {
  const more = useRef(null)
  return html`<li class="st-rp-tree__leaf" data-tree-note=${note.id}>
    <button type="button" class="st-rp-tree__row st-rp-tree__row--leaf" onClick=${() => onOpen(note.id)}
      onContextMenu=${e => { e.preventDefault(); onMenu(note, e.clientX, e.clientY, null) }}>
      <${Icon} name="file" /><span class="st-rp-tree__text">${note.title}</span>
    </button>
    <span class="st-act" data-action="note-more">
      <button type="button" class="st-rp-tree__more" ref=${more} aria-label=${`${T.files.more}${SEP}${note.title}`} aria-haspopup="menu"
        onClick=${() => { const r = more.current?.getBoundingClientRect(); onMenu(note, r ? r.left : 0, r ? r.bottom + 4 : 0, more.current) }}><${Icon} name="more" /></button>
    </span>
  </li>`
}

/** A row that folds what is under it: a chevron, an icon, its words and the line under them. */
function FoldRow({ open, onToggle, icon, label, hint }) {
  return html`<button type="button" class="st-rp-tree__row" aria-expanded=${String(open)} onClick=${onToggle}>
    <span class=${`st-rp-tree__chev${open ? ' st-rp-tree__chev--open' : ''}`}><${Icon} name="chevron-down" /></span>
    ${icon ? html`<span class="st-rp-tree__icon"><${Icon} name=${icon} size=${16} /></span>` : null}
    <span class="st-rp-tree__text"><span>${label}</span>${hint ? html`<small>${hint}</small>` : null}</span>
  </button>`
}

function TopicGroup({ group, first, onOpen, onMenu }) {
  const [open, setOpen] = useState(first)
  const label = fmt(T.files.topic, { topic: group.topic ?? T.files.untopiced, n: group.count })
  return html`<li class="st-rp-tree__topic" data-tree-topic=${group.topic ?? ''} data-open=${String(open)}>
    <${FoldRow} open=${open} onToggle=${() => setOpen(o => !o)} label=${label} />
    ${open ? html`<ul class="st-rp-tree__list">${group.notes.map(n => html`<${NoteLeaf} key=${n.id} note=${n} onOpen=${onOpen} onMenu=${onMenu} />`)}</ul>` : null}
  </li>`
}

function FilesPane() {
  const { appState, navigate, route } = useApp()
  const { rowOf } = useNames()
  const F = T.files
  const current = appState?.data?.library ?? null
  const id = current?.libraryId ?? null
  // a page of a library has one; 库架, 和主 Agent 聊, 设置 do not (contract L2)
  const onLibrary = LIBRARY_ROUTES.includes(route?.screen) && id !== null
  const outline = useLoad(() => (onLibrary ? call('getLibraryOutline') : null), [onLibrary, id])
  useEvent('library-changed', () => { if (onLibrary) outline.reload() }, [onLibrary, id])
  useEvent('inbox-changed', p => { if (onLibrary && (!p?.libraryId || p.libraryId === id)) outline.reload() }, [onLibrary, id])
  const [notesOpen, setNotesOpen] = useState(true)
  // 程序记录（不用动）: folded until you open it (contract L2)
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const [error, setError] = useState(null)
  if (!onLibrary) return html`<div class="st-rp-pane" data-pane="files"><p class="st-t-small st-t-sub st-rp-none" data-part="no-library">${F.noLibrary}</p></div>`
  const o = outline.data
  const doCall = async (name, ...args) => {
    setError(null)
    try { await call(name, ...args) } catch { setError(F.failed) }
  }
  const openNote = noteId => navigate('library', { id: noteId })
  const onMenu = (note, x, y, back) => setMenu({ note, x, y, back })
  const groups = o?.notes?.groups ?? []
  return html`<div class="st-rp-pane" data-pane="files">
    <section class="st-rp-summary" data-part="files-head">
      <div class="st-rp-eyebrow">${F.eyebrow}</div>
      <h2 class="st-rp-summary__title"><${Mark} row=${rowOf(id)} /><span>${o?.name ?? current?.name ?? ''}</span></h2>
      <p>${F.lead}</p>
      <span class="st-act" data-action="reveal-library"><button type="button" class="st-button st-rp-small-button" onClick=${() => doCall('revealLibrary')}><${Icon} name="folder" />${F.reveal}</button></span>
    </section>
    ${error ? html`<p class="st-t-small st-t-wait" role="alert">${error}</p>` : null}
    ${outline.status === 'error' && !o ? html`<p class="st-t-small st-t-wait" role="alert">${F.loadFailed}</p>` : null}
    ${o ? html`<ul class="st-rp-tree" aria-label=${F.eyebrow}>
      <li class="st-rp-tree__node" data-tree="notes" data-open=${String(notesOpen)}>
        <${FoldRow} open=${notesOpen} onToggle=${() => setNotesOpen(v => !v)} icon="book" label=${fmt(F.notes, { n: o.notes.count })} hint=${F.notesHint} />
        ${notesOpen ? (groups.length ? html`<ul class="st-rp-tree__list">${groups.map((g, i) => html`<${TopicGroup} key=${g.topic ?? ''} group=${g} first=${i === 0} onOpen=${openNote} onMenu=${onMenu} />`)}</ul>`
          : html`<p class="st-t-small st-t-muted st-rp-tree__empty">${F.notesNone}</p>`) : null}
      </li>
      <li class="st-rp-tree__node" data-tree="inbox">
        <button type="button" class="st-rp-tree__row st-rp-tree__row--go" onClick=${() => navigate('inbox')}>
          <span class="st-rp-tree__icon"><${Icon} name="clock" size=${16} /></span>
          <span class="st-rp-tree__text"><span>${fmt(F.inbox, { n: o.inbox.count })}</span><small>${F.inboxHint}</small></span>
          <${Icon} name="chevron-right" />
        </button>
      </li>
      <li class="st-rp-tree__node" data-tree="requirements">
        <button type="button" class="st-rp-tree__row st-rp-tree__row--go" onClick=${() => navigate('sources')}>
          <span class="st-rp-tree__icon"><${Icon} name="sheet" size=${16} /></span>
          <span class="st-rp-tree__text"><span>${F.requirements}</span><small>${fmt(F.requirementsHint, { sources: o.requirements?.sources ?? 0, topics: o.requirements?.topics ?? 0 })}</small></span>
          <${Icon} name="chevron-right" />
        </button>
      </li>
      <li class="st-rp-tree__node" data-tree="records" data-open=${String(recordsOpen)}>
        <${FoldRow} open=${recordsOpen} onToggle=${() => setRecordsOpen(v => !v)} icon="folder" label=${F.records} hint=${F.recordsHint} />
        ${recordsOpen ? html`<div class="st-rp-tree__records">
          <p>${F.recordsText}</p>
          <span class="st-act" data-action="reveal-records"><button type="button" class="st-button st-rp-small-button" onClick=${() => doCall('revealProgramRecords')}><${Icon} name="folder" />${F.reveal}</button></span>
        </div>` : null}
      </li>
    </ul>` : null}
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
  const badge = id => (id === 'decide' && n > 0 ? html`<span class="st-rp-badge" data-panel-badge=${id} aria-label=${fmt(T.decideBadge, { n })}>${n}</span>` : null)
  if (!open) {
    return html`<aside class="st-rpanel st-rpanel--folded" data-part="right-panel" data-open="false" data-tab=${tab} aria-label=${T.label}>
      <span class="st-act" data-action="unfold"><button type="button" class="st-rp-icon-button" aria-label=${T.unfold} title=${T.unfold} onClick=${() => setPanel({ open: true })}><${Icon} name="panel" size=${16} /></button></span>
      ${PANEL_TABS.map(([id, icon]) => html`<button type="button" key=${id} class="st-rp-icon-button st-rp-rail" data-rail-tab=${id} aria-label=${T.tabs[id]} title=${T.tabs[id]}
        onClick=${() => setPanel({ open: true, tab: id })}><${Icon} name=${icon} size=${16} />${badge(id)}</button>`)}
    </aside>`
  }
  let pane
  if (tab === 'progress') pane = html`<${ProgressPane} />`
  else if (tab === 'decide') pane = html`<${DecidePane} />`
  else if (tab === 'files') pane = html`<${FilesPane} />`
  else pane = html`<${DetailPane} detail=${detail} />`
  return html`<aside class="st-rpanel" data-part="right-panel" data-open="true" data-tab=${tab} aria-label=${T.label}>
    <div class="st-rp-head">
      <nav class="st-tabs st-rp-tabs" aria-label=${T.tabsLabel}>
        ${PANEL_TABS.map(([id, icon]) => html`<button type="button" key=${id} class="st-tabs__tab st-rp-tab" data-panel-tab=${id}
          aria-current=${id === tab ? 'true' : undefined} onClick=${() => { if (id !== tab) setPanel({ tab: id }) }}>
          <${Icon} name=${icon} /><span>${T.tabs[id]}</span>${badge(id)}
        </button>`)}
      </nav>
      <span class="st-act" data-action="fold"><button type="button" class="st-rp-icon-button" aria-label=${T.fold} title=${T.fold} onClick=${() => setPanel({ open: false })}><${Icon} name="panel" size=${16} /></button></span>
    </div>
    <div class="st-rp-body">${pane}</div>
  </aside>`
}
