// A library's parts — redesign R1 (维护者 11-11 第 1 题, F13): four tabs, 待看 · 资料库 · 问库 ｜ 来源与要求; 概览 is gone and a library
// opens on 待看. The template's big tabs (`nav.panel-tabs.st-libtabs` of `.tab`, the design's streams/app.js libTabs: the
// edition's tab icons when it has them, 待看's count as `st-count`).
//   html`<${LibrarySections} current="inbox" badges=${{ inbox: 7 }} onSelect=${id => …} />`
// `current` is the part you are on: a route of LIBRARY_ROUTES is shown as its part (TAB_OF: 资料库's graph view is 资料库).
// Test hooks: nav.st-lib-tabs (a hook class only) button[data-tab=<id>][aria-current] with [data-tab-badge].
// 1.1.2 (维护者 11-25 第 1 件): the library's mark (LibraryMark, its one or two characters before the name in the sidebar) is gone.
import { html, useEffect, useRef, useState } from '../lib/html.js'
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

/** A tab's count; 1.1.1 P14 (M6): it pops once each time it grew (keyed by the growth, so the element is new). */
function TabCount({ id, n }) {
  const before = useRef(n)
  const [pops, setPops] = useState(0)
  useEffect(() => {
    if (before.current !== null && n > before.current) setPops(k => k + 1)
    before.current = n
  }, [n])
  return html`<small key=${`c${pops}`} class=${pops ? 'st-count st-mo-pop' : 'st-count'} data-tab-badge=${id} aria-label=${fmt(SHELL.sidebar.inboxBadge, { n })}>${n}</small>`
}

export function LibrarySections({ current, badges = {}, onSelect }) {
  const here = Object.hasOwn(TAB_OF, current) ? TAB_OF[current] : current
  const icons = hasTabIcons()
  return html`<nav class="panel-tabs st-libtabs st-lib-tabs" aria-label=${SHELL.tabs.label}>
    ${LIBRARY_SECTIONS.map(([id, icon]) => {
      const n = count(badges[id])
      return html`<button type="button" key=${id} class=${`tab${here === id ? ' active' : ''}`} data-tab=${id} aria-current=${here === id ? 'page' : undefined} onClick=${() => onSelect?.(id)}>
        ${icons ? html`<${TIcon} name=${icon} />` : null}${SHELL.tabs[id]}${n !== null ? html` <${TabCount} id=${id} n=${n} />` : null}
      </button>`
    })}
  </nav>`
}
