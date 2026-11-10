// The left sidebar (on the identity colour). Two layers:
//   - parts (Sidebar, SidebarNav, SidebarLibrary, SidebarLibraryItem, SidebarGroup, SidebarSpacer, SidebarAdd,
//     SidebarFooterButton, SidebarNote) — for a screen that needs a sidebar of its own, and for plan A (below);
//   - AppSidebar — the usual one, plan B of v2 (package F; docs/design/v2/streams-v2-design.html 导航): it does not change with
//     the library. The brand, 库架, 和主 Agent 聊 (its badge: the things waiting for you), 「我的库」 with one line per library
//     (its mark, its name, its 待看 count, an amber dot when something is wrong, the current one a white card while you are on
//     its page), 「+ 新建库」, the current connection's plan quota or API balance (v2 package M; only when there is one), 设置 at
//     the foot. Everything comes from the app context (useApp: libraries, waiting,
//     openLibrary, newLibrary; app.js).
//   Plan A (kept, not used: docs/desktop.md §五「侧栏」): the shelf as the home page and, inside a library, its five parts as
//   the sidebar's entries — kit/library-sections.js LibrarySections layout="sidebar" draws them with these same parts.
// Test hooks: a[data-nav=shelf|chat], [data-badge=chat], [data-library-row=<id>][data-active][aria-current] with
// [data-library-badge] and [data-problem=<problem>], [data-action="add-library"], .st-sidebar__footer-button.
import { html } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { fmt } from '../lib/format.js'
import { BRAND, SIDEBAR } from '../texts/common.js'
import { SHELL } from '../texts/shell.js'
import { Icon } from './icons.js'
import { LIBRARY_ROUTES, LibraryMark } from './library-sections.js'
// v2 package M: the corner above 设置
import { useQuota } from '../lib/quota.js'

/** The two entries above 「我的库」, in order, with their icons; the screen id is the key (screens/index.js registers each). */
export const NAV_ENTRIES = Object.freeze([['shelf', 'grid'], ['chat', 'chat']])

const current = on => (on ? 'page' : undefined)
const prevent = fn => event => { event.preventDefault(); fn?.() }
const count = n => (typeof n === 'number' && n > 0 ? n : null)

export function Sidebar({ label, children }) {
  return html`<aside class="st-sidebar" aria-label=${label ?? SIDEBAR.label}>
    <div class="st-sidebar__brand">
      <div class="st-sidebar__mark">${BRAND.mark}</div>
      <div class="st-sidebar__name">${BRAND.name}</div>
      ${BRAND.tagline ? html`<div class="st-sidebar__tagline">${BRAND.tagline}</div>` : null}
    </div>
    ${children}
  </aside>`
}

/** `badge`: a number shown at the end of the entry; nothing for null or 0. */
export function SidebarNav({ id, icon, isCurrent, badge, badgeLabel, onClick, children }) {
  const n = count(badge)
  return html`<a href="#" class="st-sidebar__nav" data-nav=${id} aria-current=${current(isCurrent)} onClick=${prevent(onClick)}>
    ${icon ? html`<${Icon} name=${icon} />` : null}<span class="st-sidebar__nav-text">${children}</span>
    ${n !== null ? html`<span class="st-sidebar__badge" data-badge=${id} aria-label=${badgeLabel}>${n}</span>` : null}
  </a>`
}

/** v1.0's line for the library the app has open — its folder name — or 「未打开库」 while there is none (unused in plan B). */
export function SidebarLibrary({ name }) {
  return html`<div class="st-sidebar__library" data-library=${name ? 'open' : 'none'} aria-label=${SIDEBAR.libraryLabel}>
    <${Icon} name="folder" />
    <span class="st-sidebar__library-name">${name ?? SIDEBAR.noLibrary}</span>
  </div>`
}

/**
 * One library of 「我的库」: its mark, its name, an amber dot when it has a problem, its 待看 count.
 * `row`: lib/libraries.js (id, name, icon, color, active, inbox, problem); `isCurrent`: you are on its page.
 */
export function SidebarLibraryItem({ row, isCurrent, onClick }) {
  const n = count(row.inbox)
  return html`<a href="#" class="st-sidebar__lib" data-library-row=${row.id} data-active=${String(row.active === true)} aria-current=${current(isCurrent)} onClick=${prevent(onClick)}>
    <${LibraryMark} icon=${row.icon} color=${row.color} size="s" />
    <span class="st-sidebar__lib-name">${row.name}</span>
    ${row.problem ? html`<span class="st-sidebar__dot" data-problem=${row.problem} role="img" aria-label=${SHELL.sidebar.problem} title=${SHELL.sidebar.problem}></span>` : null}
    ${n !== null ? html`<span class="st-sidebar__badge" data-library-badge=${row.id} aria-label=${fmt(SHELL.sidebar.inboxBadge, { n })}>${n}</span>` : null}
  </a>`
}

export function SidebarGroup({ children }) {
  return html`<div class="st-sidebar__group">${children}</div>`
}

/** 「+ 新建库」: a quiet line under the libraries. */
export function SidebarAdd({ name, onClick, children }) {
  return html`<a href="#" class="st-sidebar__add" data-action=${name} onClick=${prevent(onClick)}><${Icon} name="plus" />${children}</a>`
}

export function SidebarSpacer() {
  return html`<div class="st-sidebar__spacer"></div>`
}

export function SidebarFooterButton({ isCurrent, icon, onClick, children }) {
  return html`<button type="button" class="st-sidebar__footer-button" aria-current=${current(isCurrent)} onClick=${onClick}>${icon ? html`<${Icon} name=${icon} />` : null}${children}</button>`
}

export function SidebarNote({ children }) {
  return html`<div class="st-sidebar__note">${children}</div>`
}

/**
 * v2 package M: the corner above 设置 — `view` from lib/quota.js quotaView (the plan's windows, one line each, or the API
 * balance), its time as the hover text; nothing at all for null. Test hooks: [data-part="quota"][data-quota-kind=plan|balance],
 * [data-quota-row=<id>].
 */
export function SidebarQuota({ view }) {
  if (!view) return null
  return html`<section class="st-sidebar__quota" data-part="quota" data-quota-kind=${view.kind} aria-label=${SHELL.sidebar.quota.label} title=${view.asOf ? fmt(SHELL.sidebar.quota.asOf, { when: view.asOf }) : undefined}>
    <div class="st-sidebar__quota-title">${view.title}</div>
    ${view.rows.map(r => html`<div key=${r.id} class="st-sidebar__quota-row" data-quota-row=${r.id}>${r.text}</div>`)}
  </section>`
}

/** The usual sidebar, plan B. `current`: the screen id you are on (default: the route's). */
export function AppSidebar({ current: where }) {
  const { route, navigate, libraries, waiting, openLibrary, newLibrary } = useApp()
  const here = where ?? route?.screen ?? null
  const onLibrary = LIBRARY_ROUTES.includes(here)
  const rows = Array.isArray(libraries?.data) ? libraries.data : []
  // v2 package M: the current connection's quota, above 设置
  const quota = useQuota()
  return html`<${Sidebar}>
    ${NAV_ENTRIES.map(([id, icon]) => html`<${SidebarNav} key=${id} id=${id} icon=${icon} isCurrent=${here === id}
      badge=${id === 'chat' ? waiting ?? null : null} badgeLabel=${id === 'chat' ? fmt(SHELL.sidebar.chatBadge, { n: waiting ?? 0 }) : undefined}
      onClick=${() => navigate(id)}>${SIDEBAR.entries[id]}<//>`)}
    <${SidebarGroup}>${SHELL.sidebar.mine}<//>
    <nav class="st-sidebar__libs" aria-label=${SHELL.sidebar.mine}>
      ${rows.map(r => html`<${SidebarLibraryItem} key=${r.id} row=${r} isCurrent=${onLibrary && r.active} onClick=${() => openLibrary?.(r.id)} />`)}
    </nav>
    <${SidebarAdd} name="add-library" onClick=${() => newLibrary?.()}>${SHELL.sidebar.newLibrary}<//>
    <${SidebarSpacer} />
    <${SidebarQuota} view=${quota} />
    <${SidebarFooterButton} icon="gear" isCurrent=${here === 'settings'} onClick=${() => navigate('settings')}>${SIDEBAR.settings}<//>
  <//>`
}
