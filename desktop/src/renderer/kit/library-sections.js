// A library's parts — redesign R1 (维护者 11-11 第 1 题, F13): four tabs, 待看 · 资料库 · 问库 ｜ 来源与要求; 概览 is gone and a library
// opens on 待看. The template's big tabs (`nav.panel-tabs.st-libtabs` of `.tab`, the design's streams/app.js libTabs: the
// edition's tab icons when it has them, 待看's count as `st-count`).
//   html`<${LibrarySections} current="inbox" badges=${{ inbox: 7 }} onSelect=${id => …} />`
// `current` is the part you are on: a route of LIBRARY_ROUTES is shown as its part (TAB_OF: 资料库's graph view is 资料库).
// Test hooks: nav.st-lib-tabs (a hook class only) button[data-tab=<id>][aria-current] with [data-tab-badge].
// And the library's mark: LibraryMark — its one or two characters (the sidebar's line, the shelf's card).
import { html } from '../lib/html.js'
import { fmt } from '../lib/format.js'
import { TIcon, hasTabIcons } from '../lib/template-icons.js'
import { SHELL } from '../texts/shell.js'

/** The four parts, in order, with the template's tab icons (streams/app.js libTabs). */
export const LIBRARY_SECTIONS = Object.freeze([['inbox', 'progress'], ['library', 'sources'], ['ask', 'draft'], ['sources', 'files']])
/** route id → the part it belongs to (the graph is a view of 资料库) */
export const TAB_OF = Object.freeze({ inbox: 'inbox', library: 'library', graph: 'library', ask: 'ask', sources: 'sources' })
/** every route that is a library's page */
export const LIBRARY_ROUTES = Object.freeze(Object.keys(TAB_OF))
/** the colour names a library may have (core LIBRARY_COLORS) */
export const LIBRARY_COLOR_NAMES = Object.freeze(['river', 'violet', 'green', 'muted'])

const count = n => (typeof n === 'number' && n > 0 ? n : null)

export function LibrarySections({ current, badges = {}, onSelect }) {
  const here = Object.hasOwn(TAB_OF, current) ? TAB_OF[current] : current
  const icons = hasTabIcons()
  return html`<nav class="panel-tabs st-libtabs st-lib-tabs" aria-label=${SHELL.tabs.label}>
    ${LIBRARY_SECTIONS.map(([id, icon]) => {
      const n = count(badges[id])
      return html`<button type="button" key=${id} class=${`tab${here === id ? ' active' : ''}`} data-tab=${id} aria-current=${here === id ? 'page' : undefined} onClick=${() => onSelect?.(id)}>
        ${icons ? html`<${TIcon} name=${icon} />` : null}${SHELL.tabs[id]}${n !== null ? html` <small class="st-count" data-tab-badge=${id} aria-label=${fmt(SHELL.sidebar.inboxBadge, { n })}>${n}</small>` : null}
      </button>`
    })}
  </nav>`
}

/** A library's mark: its one or two characters. `size` 's' (the sidebar), 'm', 'l' (a card of the shelf). */
export function LibraryMark({ icon, color, size = 'm' }) {
  const c = LIBRARY_COLOR_NAMES.includes(color) ? color : 'river'
  return html`<span class=${`st-lib-mark st-lib-mark--${size}`} data-color=${c} aria-hidden="true">${icon ?? ''}</span>`
}
