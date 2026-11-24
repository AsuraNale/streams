// 库架 (v2 package F; redesign R1 — 维护者 11-11 第 2 题 B: kept, the sidebar's first entry; design P23, the template's
// home-content / project-tile as the design's streams/app.js builds it): the eyebrow, the line, a search over the libraries'
// names and what they follow, 「新建库」, then one card per library — when it last ran and how many sources it has, its state
// chip (运行中 · <当前环节> / 排队中 · 第 n 位 — the same words as the sidebar and the panel — or its problem), its name, what it
// follows (lib/libraries.js tracking), and at its foot its 待看 and its sources' state, 「进入待看」 — and last a card 「新建库 ·
// 由主 Agent 生成」 (→ 主 Agent). A click on a card is a click on that library in the sidebar (openLibrary). No library: one line
// and two buttons (由主 Agent 生成 / 手动创建). The data is the app context's libraries (listLibraries + getLibrariesOverview)
// and its queue (getQueue); words: texts/shell.js SHELL.shelf.
// Test hooks: main[data-screen="shelf"][data-state], [data-shelf-card=<id>] with [data-part=name|tracking|updated|inbox|problem]
// ([data-problem=<problem>|"none"]) and [data-part="queue"][data-queue-state=running|queued][data-position];
// [data-field="shelf-search"]; [data-action=new-card|new-library|empty-chat|empty-manual], [data-part="shelf-empty"]; 1.1 W13: [data-action="open-existing"]
// (「打开已有的库」 beside 「新建库」 when there are libraries, in the empty state when there are none) and its line (lib/open-existing.js).
import { html, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { fmt, whenText } from '../lib/format.js'
import { tracking } from '../lib/libraries.js'
import { queueStateOf, queueWords } from '../lib/queue.js'
import { TIcon } from '../lib/template-icons.js'
import { RightPanel } from './right-panel.js'
import { Act } from '../lib/action.js'
import { OpenExistingNote, useOpenExisting } from '../lib/open-existing.js'
import { AppFrame, AppSidebar, LinkButton, Main, TopBar } from '../kit/index.js'
import { ERRORS, SEP, WHEN } from '../texts/common.js'
import { SHELL } from '../texts/shell.js'
import { PANEL } from '../texts/panel.js'

const T = SHELL.shelf

function problemLine(row) {
  if (row.problem === 'missing') return T.problems.missing
  if (row.problem === 'sources') return T.problems.sources
  if (row.problem === 'no-output') return fmt(T.problems['no-output'], { n: row.noOutputStreak ?? 0 })
  return null
}

function Card({ row, queue, onOpen }) {
  const what = tracking(row, SEP)
  const problem = problemLine(row)
  const updated = row.lastRoundAt ? fmt(T.updated, { when: whenText(row.lastRoundAt, WHEN) ?? row.lastRoundAt }) : T.updatedNever
  const place = queueStateOf(queue, row.id)
  const words = queueWords(place, place?.state === 'running' ? queue?.running?.phase ?? null : null)
  return html`<button type="button" class="project-tile" data-shelf-card=${row.id} data-active=${String(row.active)} onClick=${onOpen}>
    <div class="row">
      <span class="eyebrow" data-part="updated">${updated}${SEP}${fmt(T.sources, { n: row.sources ?? 0 })}</span>
      <span class="spacer"></span>
      ${place ? html`<span class="status-chip" data-part="queue" data-queue-state=${place.state} data-position=${place.position ?? 1}><span class="dot"></span> ${words}</span>`
        : problem ? html`<span class="status-chip" data-part="chip"><span class="dot"></span> ${problem}</span>` : null}
    </div>
    <h3 data-part="name">${row.name}</h3>
    <p data-part="tracking">${what ? fmt(SHELL.head.tracking, { what }) : SHELL.head.trackingNone}</p>
    <div class="project-tile-footer">
      <span><span data-part="inbox" data-value=${row.inbox ?? 0}>${fmt(T.inboxLine, { n: row.inbox ?? 0 })}</span>${SEP}<span data-part="problem" data-problem=${row.problem ?? 'none'}>${problem ?? T.fine}</span></span>
      <span>${T.enter} <${TIcon} name="arrow" /></span>
    </div>
  </button>`
}

export function ShelfScreen() {
  const { libraries, openLibrary, navigate, newLibrary, queue } = useApp()
  const [q, setQ] = useState('')
  // 1.1 W13: 「打开已有的库」 — the toolbar's (with libraries) or the empty state's
  const existing = useOpenExisting()
  const rows =Array.isArray(libraries?.data) ? libraries.data : null
  const state = rows ? 'ready' : libraries?.status ?? 'loading'
  const needle = q.trim().toLowerCase()
  const shown = rows ? rows.filter(r => !needle || `${r.name} ${tracking(r, SEP) ?? ''}`.toLowerCase().includes(needle)) : []
  const qd = queue?.data ?? null
  const running = qd?.running ? 1 : 0
  const waiting = Array.isArray(qd?.waiting) ? qd.waiting.length : 0
  const chip = running || waiting ? html`<span class="status-chip" data-part="shelf-queue"><span class="dot"></span> ${fmt(PANEL.progress.summary, { running, waiting })}</span>` : null
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="shelf" />`} panel=${html`<${RightPanel} />`}>
    <${Main} screen="shelf" state=${state} labelledby="shelf-title">
      <${TopBar} title=${T.title} subtitle=${rows ? fmt(T.subtitle, { n: rows.length }) : null} titleTag="h1" titleId="shelf-title" actions=${chip} />
      <div class="center">
        <div class="home-content st-main__body shelf-body">
          <span class="eyebrow">${T.eyebrow}</span>
          <h2 class="home-title">${T.lead}</h2>
          <p>${T.text}</p>
          <div class="home-toolbar">
            <label class="search-field"><${TIcon} name="search" /><input aria-label=${T.search} placeholder=${T.search} data-field="shelf-search" value=${q} onInput=${e => setQ(e.currentTarget.value)} /></label>
            <span class="st-act" data-action="new-library"><button type="button" class="btn primary" onClick=${() => newLibrary()}><${TIcon} name="newProject" fallback="plus" /> ${T.newButton}</button></span>
            ${rows && rows.length ? html`<${Act} name="open-existing" disabled=${existing.busy} onClick=${existing.open}>${SHELL.openExisting.button}<//>` : null}
          </div>
          <${OpenExistingNote} note=${existing.note} />
          ${libraries?.status === 'error' && !rows ? html`<div class="progress-alert" role="alert">${T.loadFailed} <${LinkButton} onClick=${() => libraries.reload()}>${ERRORS.retry}<//></div>` : null}
          ${rows && rows.length === 0 ? html`<div class="empty-state" data-part="shelf-empty">
            <b>${T.emptyText}</b>
            <div class="row st-empty-actions">
              <${Act} name="empty-chat" variant="primary" onClick=${() => navigate('chat')}>${T.emptyChat}<//>
              <${Act} name="empty-manual" onClick=${() => newLibrary()}>${T.emptyManual}<//>
              <${Act} name="open-existing" disabled=${existing.busy} onClick=${existing.open}>${SHELL.openExisting.button}<//>
            </div>
          </div>` : null}
          ${rows && rows.length ? html`<div id="projectTiles">
            ${shown.map(r => html`<${Card} key=${r.id} row=${r} queue=${qd} onOpen=${() => openLibrary(r.id)} />`)}
            ${needle && shown.length === 0 ? html`<p class="limit-note" data-part="search-none">${fmt(T.searchNone, { q: q.trim() })}</p>` : null}
            <button type="button" class="document-link" data-action="new-card" onClick=${() => navigate('chat')}>
              <${TIcon} name="plus" /><span>${T.newCard}</span>
            </button>
          </div>` : null}
        </div>
      </div>
    <//>
  <//>`
}

