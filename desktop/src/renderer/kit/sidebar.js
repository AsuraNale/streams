// The left sidebar (on the identity colour). Two layers:
//   - parts (Sidebar, SidebarNav, SidebarLibrary, SidebarGroup, SidebarSpacer, SidebarFooterButton, SidebarNote) — for a
//     screen that needs a sidebar of its own (a first-run wizard, when there is one);
//   - AppSidebar — the usual one: the brand, the library line, the eight entries, 设置 at the foot.
//     `current` is the screen id the user is on (screens/index.js).
import { html } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { fmt } from '../lib/format.js'
import { BRAND, SIDEBAR } from '../texts/common.js'
import { Icon } from './icons.js'

/** The eight entries, in order, with their icons; the screen id is the key (screens/index.js registers each). */
export const NAV_ENTRIES = Object.freeze([
  ['today', 'clock'], ['inbox', 'inbox'], ['library', 'database'], ['graph', 'graph'],
  ['ask', 'search'], ['pipeline', 'flow'], ['sources', 'rss'], ['status', 'info'],
])

const current = on => (on ? 'page' : undefined)
const prevent = fn => event => { event.preventDefault(); fn?.() }

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

/** `badge`: a number shown at the end of the entry (the items waiting in 待看); nothing for null or 0. */
export function SidebarNav({ id, icon, isCurrent, badge, badgeLabel, onClick, children }) {
  const n = typeof badge === 'number' && badge > 0 ? badge : null
  return html`<a href="#" class="st-sidebar__nav" data-nav=${id} aria-current=${current(isCurrent)} onClick=${prevent(onClick)}>
    ${icon ? html`<${Icon} name=${icon} />` : null}<span class="st-sidebar__nav-text">${children}</span>
    ${n !== null ? html`<span class="st-sidebar__badge" data-badge=${id} aria-label=${badgeLabel}>${n}</span>` : null}
  </a>`
}

/** The library the app has open — its folder name — or 「未打开库」 while there is none. */
export function SidebarLibrary({ name }) {
  return html`<div class="st-sidebar__library" data-library=${name ? 'open' : 'none'} aria-label=${SIDEBAR.libraryLabel}>
    <${Icon} name="folder" />
    <span class="st-sidebar__library-name">${name ?? SIDEBAR.noLibrary}</span>
  </div>`
}

export function SidebarGroup({ children }) {
  return html`<div class="st-sidebar__group">${children}</div>`
}

export function SidebarSpacer() {
  return html`<div class="st-sidebar__spacer"></div>`
}

export function SidebarFooterButton({ isCurrent, onClick, children }) {
  return html`<button type="button" class="st-sidebar__footer-button" aria-current=${current(isCurrent)} onClick=${onClick}>${children}</button>`
}

export function SidebarNote({ children }) {
  return html`<div class="st-sidebar__note">${children}</div>`
}

/** The usual sidebar: reads the app state (the library) and the inbox count (the badge after 待看) from the app context. */
export function AppSidebar({ current: where = 'today' }) {
  const { appState, navigate, inboxCount } = useApp()
  const library = appState.data?.library ?? null
  return html`<${Sidebar}>
    <${SidebarLibrary} name=${library?.name ?? null} />
    ${NAV_ENTRIES.map(([id, icon]) => html`<${SidebarNav} key=${id} id=${id} icon=${icon} isCurrent=${where === id}
      badge=${id === 'inbox' ? inboxCount ?? null : null} badgeLabel=${id === 'inbox' ? fmt(SIDEBAR.inboxBadge, { n: inboxCount }) : undefined}
      onClick=${() => navigate(id)}>${SIDEBAR.entries[id]}<//>`)}
    <${SidebarSpacer} />
    <${SidebarFooterButton} isCurrent=${where === 'settings'} onClick=${() => navigate('settings')}>${SIDEBAR.settings}<//>
  <//>`
}
