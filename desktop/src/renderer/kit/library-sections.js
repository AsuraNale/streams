// A library's five parts (v2 package F; docs/design/v2/streams-v2-design.html 导航): 概览 · 待看 · 资料库 · 问库 · 来源与要求.
// One component, two layouts (the maintainer 11-05: plan B now, plan A kept):
//   html`<${LibrarySections} layout="tabs" current="inbox" badges=${{ inbox: 7 }} onSelect=${id => …} />`
//     plan B: tabs across the top of the library's page (nav.st-lib-tabs, button[data-tab=<id>][aria-current])
//   html`<${LibrarySections} layout="sidebar" current="inbox" badges=${…} onSelect=${…} />`
//     plan A: the same five as the sidebar's entries (kit/sidebar.js SidebarNav, a[data-nav=<id>]) inside the library
// `current` is the part you are on: a route of LIBRARY_ROUTES is shown as its part (TAB_OF: 资料库's graph view is 资料库).
// And the library's mark: LibraryMark — its one or two characters on a square of its colour (core LIBRARY_COLORS: the token
// --st-lib-<colour>, the words --st-on-lib; docs/tokens.md).
import { html } from '../lib/html.js'
import { fmt } from '../lib/format.js'
import { SHELL } from '../texts/shell.js'
import { Icon } from './icons.js'
import { SidebarNav } from './sidebar.js'

/** The five parts, in order, with their icons (问库: a speech bubble, feedback #1). */
export const LIBRARY_SECTIONS = Object.freeze([['overview', 'chart'], ['inbox', 'inbox'], ['library', 'file'], ['ask', 'chat'], ['sources', 'rss']])
/** route id → the part it belongs to (the graph is a view of 资料库) */
export const TAB_OF = Object.freeze({ overview: 'overview', inbox: 'inbox', library: 'library', graph: 'library', ask: 'ask', sources: 'sources' })
/** every route that is a library's page */
export const LIBRARY_ROUTES = Object.freeze(Object.keys(TAB_OF))
/** the colour names a library may have (core LIBRARY_COLORS) */
export const LIBRARY_COLOR_NAMES = Object.freeze(['river', 'violet', 'green', 'muted'])

const count = n => (typeof n === 'number' && n > 0 ? n : null)

export function LibrarySections({ layout = 'tabs', current, badges = {}, onSelect }) {
  const here = Object.hasOwn(TAB_OF, current) ? TAB_OF[current] : current
  if (layout === 'sidebar') {
    return html`${LIBRARY_SECTIONS.map(([id, icon]) => html`<${SidebarNav} key=${id} id=${id} icon=${icon} isCurrent=${here === id}
      badge=${badges[id] ?? null} badgeLabel=${id === 'inbox' ? fmt(SHELL.sidebar.inboxBadge, { n: badges[id] ?? 0 }) : undefined} onClick=${() => onSelect?.(id)}>${SHELL.tabs[id]}<//>`)}`
  }
  return html`<nav class="st-lib-tabs" aria-label=${SHELL.tabs.label}>
    ${LIBRARY_SECTIONS.map(([id, icon]) => {
      const n = count(badges[id])
      return html`<button type="button" key=${id} class="st-lib-tabs__tab" data-tab=${id} aria-current=${here === id ? 'page' : undefined} onClick=${() => onSelect?.(id)}>
        <${Icon} name=${icon} /><span>${SHELL.tabs[id]}</span>
        ${n !== null ? html`<span class="st-lib-tabs__badge" data-tab-badge=${id} aria-label=${fmt(SHELL.sidebar.inboxBadge, { n })}>${n}</span>` : null}
      </button>`
    })}
  </nav>`
}

/** A library's mark: `size` 's' (the sidebar), 'm' (a library's head), 'l' (a card of the shelf). */
export function LibraryMark({ icon, color, size = 'm' }) {
  const c = LIBRARY_COLOR_NAMES.includes(color) ? color : 'river'
  return html`<span class=${`st-lib-mark st-lib-mark--${size} st-lib-mark--${c}`} data-color=${c} aria-hidden="true">${icon ?? ''}</span>`
}
