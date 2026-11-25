// The left sidebar — redesign R1: the template's parts, as the design's streams/app.js builds it (07-模板版/说明.md 「用了模板
// 的哪些部件」: brand · navitem · project-item · side-footer, plus streams.css's st-quota):
//   brand (流息's mark — the new logo's 五流 in the theme's ink, lib/brand-mark.js — · 流息 · 个人资料库) · 「新建库」 (navitem.new) · 库架 (with how many libraries) · 主 Agent (no number: what
//   waits for you is counted on the right panel's 待确认 only, F10; 1.1 W7b: it opens the build conversation, the route 'build' —
//   marked while that page shows a conversation, `current` 'chat'; 「新建库」 is marked while it shows its one sentence) · 「我的库」 · one project-item per library — its icon, its
//   name, its 待看 count or an amber dot, one line under it: 运行中 · <当前环节> / 排队中 · 第 n 位 / 来源异常 / n 条待看 —
//   then at the foot the current connection's 套餐用量 (v2 package M; nothing at all when there is none) and 设置.
//   Everything comes from the app context (useApp: libraries, openLibrary, newLibrary, queue; app.js).
// `Sidebar` (the frame with the brand) is the one sidebar; redesign R4a removed the wizards' own (首次打开 and 新建库 use AppSidebar).
// Test hooks (the st- classes are hooks only, no style): aside.st-sidebar, a[data-nav=shelf|chat] (.st-sidebar__nav-text),
// [data-nav-count=shelf], .st-sidebar__group, [data-library-row=<id>][data-active][aria-current] with .st-sidebar__lib-name,
// [data-library-badge], [data-problem=<problem>], [data-library-line] and [data-library-queue=running|queued]
// [data-position]; [data-action="add-library"]; .st-sidebar__footer-button (设置); [data-part="quota"] (SidebarQuota).
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { fmt } from '../lib/format.js'
import { SidebarIcon, TIcon } from '../lib/template-icons.js'
import { BrandMark } from '../lib/brand-mark.js'
import { BRAND, SIDEBAR } from '../texts/common.js'
import { SHELL } from '../texts/shell.js'
import { LIBRARY_ROUTES } from './library-sections.js'
// v2 package M: the corner above 设置
import { useQuota } from '../lib/quota.js'
// v2 package L: a library's place in the queue (its line under the name)
import { queueStateOf, queueWords } from '../lib/queue.js'

/** The two entries under 「新建库」, in order, with the template's icons; the route id is the key (screens/index.js: 'chat' is the
 * build conversation's alias). */
export const NAV_ENTRIES = Object.freeze([['shelf', 'allProjects'], ['chat', 'note']])

const current = on => (on ? 'page' : undefined)
const prevent = fn => event => { event.preventDefault(); fn?.() }
const count = n => (typeof n === 'number' && n > 0 ? n : null)

/** The sidebar's frame: the brand on top, then what it is given. */
export function Sidebar({ label, children }) {
  return html`<aside class="sidebar st-sidebar" aria-label=${label ?? SIDEBAR.label}>
    <a href="#" class="brand" aria-label=${BRAND.name} onClick=${prevent(null)}>
      <span class="brandmark"><${BrandMark} /></span>
      <span><span class="brandname">${BRAND.name}</span><small>${BRAND.tagline}</small></span>
    </a>
    ${children}
  </aside>`
}

/** An entry of the sidebar (the template's navitem). `n`: a small number at its end (库架: how many libraries). */
export function SidebarNav({ id, icon, isCurrent, n = null, onClick, children }) {
  const icn = icon === 'allProjects' ? html`<${SidebarIcon} role="allProjects" fallback="home" />` : html`<${TIcon} name=${icon} />`
  return html`<a href="#" class=${`navitem${isCurrent ? ' active' : ''}`} data-nav=${id} aria-current=${current(isCurrent)} onClick=${prevent(onClick)}>
    ${icn}<span class="st-sidebar__nav-text">${children}</span>
    ${n !== null ? html`<span class="spacer"></span><small data-nav-count=${id}>${n}</small>` : null}
  </a>`
}

/** The line under a library's name (F10): where it is in the queue, else a problem, else its 待看, else nothing. */
export function libraryLine(row, place, phase) {
  if (place?.state === 'running') return { kind: 'running', text: queueWords(place, phase) }
  if (place?.state === 'queued') return { kind: 'queued', text: queueWords(place) }
  if (row.problem) return { kind: 'problem', text: fmt(SHELL.sidebar.problems[row.problem] ?? SHELL.sidebar.problem, { n: row.noOutputStreak ?? 0 }) }
  const n = count(row.inbox)
  return n !== null ? { kind: 'inbox', text: fmt(SHELL.sidebar.inboxLine, { n }) } : { kind: 'none', text: SHELL.sidebar.idle }
}

/**
 * One library of 「我的库」 (the template's project-item): its name, the line under it, its 待看 count — or an amber dot when it
 * has a problem. 1.1.2 (维护者 11-25 第 1 件): no mark before the name; what the library is doing stands at the head of the line
 * under it — the turning ring while it runs (st-mo-ring, data-mo=sidebar), the hollow dot while it waits, the dot otherwise. `row`: lib/libraries.js; `isCurrent`: you are on its page; `place`: its place in the
 * queue (lib/queue.js queueStateOf); `phase`: the step its round is at (running only).
 */
export function SidebarLibraryItem({ row, isCurrent, place = null, phase = null, onClick }) {
  const n = count(row.inbox)
  const line = libraryLine(row, place, phase)
  // 1.1.1 P14 (M3, M6): the count pops when it grew (a run put items in 待看) — keyed by the number, so each growth plays once
  const before = useRef(n)
  const [pops, setPops] = useState(0)
  useEffect(() => {
    if (n !== null && before.current !== null && n > before.current) setPops(k => k + 1)
    before.current = n
  }, [n])
  const popKey = { current: pops }
  const running = place?.state === 'running'
  return html`<a href="#" class=${`project-item${isCurrent ? ' active' : ''}`} data-library-row=${row.id} data-active=${String(row.active === true)} aria-current=${current(isCurrent)} onClick=${prevent(onClick)}>
    <span class="project-name"><span class="st-sidebar__lib-name">${row.name}</span></span>
    <span class="project-meta" data-library-line=${line.kind}>
      ${running ? html`<span class="st-mo-ring" data-mo="sidebar" aria-hidden="true"></span>` : place?.state === 'queued' ? html`<span class="st-mo-queued" data-mo="queued" aria-hidden="true"></span>` : html`<span class="dot"></span>`}
      ${place ? html`<span data-library-queue=${place.state} data-position=${place.position ?? 1}>${line.text}</span>` : html`<span>${line.text}</span>`}
      <span class="spacer"></span>
      ${row.problem ? html`<span class="st-sidebar__dot" data-problem=${row.problem} role="img" aria-label=${SHELL.sidebar.problem} title=${SHELL.sidebar.problem}></span>` : null}
      ${n !== null ? html`<span key=${`b${popKey.current}`} class=${popKey.current ? 'st-mo-pop' : undefined} data-badge=${row.id} data-library-badge=${row.id} aria-label=${fmt(SHELL.sidebar.inboxBadge, { n })}>${n}</span>` : null}
    </span>
  </a>`
}

/** 「我的库」 above the libraries (the template's side-section: an eyebrow and the sidebar's second icon). */
export function SidebarGroup({ children }) {
  return html`<div class="side-section"><span class="eyebrow st-sidebar__group">${children}</span><${SidebarIcon} role="researchProjects" fallback="book" /></div>`
}

/** 「新建库」 (the template's dark navitem.new, first in the sidebar). */
export function SidebarAdd({ name, onClick, isCurrent = false, children }) {
  return html`<a href="#" class=${`navitem new${isCurrent ? ' active' : ''}`} data-action=${name} onClick=${prevent(onClick)}><${TIcon} name="newProject" fallback="plus" />${children}</a>`
}

export function SidebarSpacer() {
  return html`<div class="spacer"></div>`
}

/** 设置 at the foot (the template's side-footer navitem). */
export function SidebarFooterButton({ isCurrent, icon = 'settings', onClick, children }) {
  return html`<button type="button" class=${`navitem st-sidebar__footer-button${isCurrent ? ' active' : ''}`} aria-current=${current(isCurrent)} onClick=${onClick}><${TIcon} name=${icon} />${children}</button>`
}

export function SidebarNote({ children }) {
  return html`<div class="limit-note">${children}</div>`
}

/**
 * v2 package M: the corner above 设置 — `view` from lib/quota.js quotaView (the plan's windows, one line each, or the API
 * balance), its time as the hover text; nothing at all for null. Redesign R1: the template's st-quota — a section-label (套餐用量 ·
 * 截至 …) and a mini-chart, one chart-row per window (its span, the bar, the per cent; the row's whole sentence, with when it
 * resets, is its accessible name and hover text). Test hooks: [data-part="quota"][data-quota-kind=plan|balance],
 * [data-quota-row=<id>], .st-sidebar__quota-title / -span / -pct / -fill, [data-quota-as-of].
 */
export function SidebarQuota({ view }) {
  if (!view) return null
  const Q = SHELL.sidebar.quota
  const asOf = view.asOf ? fmt(Q.asOf, { when: view.asOf }) : null
  return html`<section class="st-quota" data-part="quota" data-quota-kind=${view.kind} aria-label=${Q.label} title=${asOf ?? undefined}>
    <div class="section-label"><span class="st-sidebar__quota-title">${view.title}</span>${asOf ? html`<small class="muted" data-quota-as-of>${asOf}</small>` : null}</div>
    <div class="mini-chart">
      ${view.rows.map(r => (r.span
        ? html`<div key=${r.id} class="chart-row" data-quota-row=${r.id} role="group" aria-label=${r.text} title=${r.text}>
            <span class="st-sidebar__quota-span">${r.span}</span>
            <div class="chart-track" aria-hidden="true"><div class="chart-bar st-sidebar__quota-fill" style=${{ '--value': `${r.used}%`, width: `${r.used}%` }}></div></div>
            <b class="st-sidebar__quota-pct">${r.pct}%</b>
          </div>`
        : html`<div key=${r.id} class="chart-row" data-quota-row=${r.id} aria-label=${r.text}><span class="st-sidebar__quota-money">${r.text}</span></div>`))}
    </div>
  </section>`
}

/** The usual sidebar. `current`: the screen id you are on (default: the route's). */
export function AppSidebar({ current: where }) {
  const { route, navigate, libraries, openLibrary, newLibrary, queue } = useApp()
  const here = where ?? route?.screen ?? null
  const onLibrary = LIBRARY_ROUTES.includes(here)
  const rows = Array.isArray(libraries?.data) ? libraries.data : []
  const q = queue?.data ?? null
  // v2 package M: the current connection's quota, above 设置
  const quota = useQuota()
  return html`<${Sidebar}>
    <nav class="side-nav" aria-label=${SIDEBAR.label}>
      <${SidebarAdd} name="add-library" isCurrent=${here === 'build'} onClick=${() => newLibrary?.()}>${SHELL.sidebar.newLibrary}<//>
      ${NAV_ENTRIES.map(([id, icon]) => html`<${SidebarNav} key=${id} id=${id} icon=${icon} isCurrent=${here === id}
        n=${id === 'shelf' && libraries?.data ? rows.length : null} onClick=${() => navigate(id)}>${SIDEBAR.entries[id]}<//>`)}
    </nav>
    <${SidebarGroup}>${SHELL.sidebar.mine}<//>
    <nav class="project-list st-sidebar__libs" aria-label=${SHELL.sidebar.mine}>
      ${rows.map(r => {
        const place = queueStateOf(q, r.id)
        return html`<${SidebarLibraryItem} key=${r.id} row=${r} isCurrent=${onLibrary && r.active} place=${place}
          phase=${place?.state === 'running' ? q?.running?.phase ?? null : null} onClick=${() => openLibrary?.(r.id)} />`
      })}
    </nav>
    <div class="side-footer">
      <${SidebarQuota} view=${quota} />
      <${SidebarFooterButton} isCurrent=${here === 'settings'} onClick=${() => navigate('settings')}>${SIDEBAR.settings}<//>
    </div>
  <//>`
}
