// Redesign R1: the template's icons, each theme its own set (the design's streams/app.js icon / sidebarIcon, done here as a
// component). index.html loads the template's icon data first (shared/themes.mjs TEMPLATE_SCRIPTS, unchanged files): they
// leave window.yunzhiRound9Edition / 10 / 11 (functions) and, last, 单线黑白's edition as window.yunzhiVisualEdition. This
// module only picks the theme's edition — precision11 · glass11 · research11 through round 11, monoline the line edition —
// and draws an icon the way the template does: a layered control symbol when the edition has one (controlArt), else the
// edition's path, else the two of streams/app.js's own `paths`, else its file.
//   html`<${TIcon} name="arrow" />` · `fallback`: the icon to use when the edition has no such name (app.js icon(name, fallback))
//   html`<${SidebarIcon} role="allProjects" fallback="home" />`
//   hasTabIcons(theme)            → the template draws icons in its tabs for this edition (tabIcons)
import { html } from './html.js'
import { pageTheme } from './theme.js'

// the design's streams/app.js `paths`
const PATHS = Object.freeze({ plus: 'M12 5v14M5 12h14', file: 'M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6' })
// captured once, before anything else could set it: the last of the template's scripts leaves 单线黑白's edition here
const LINE = typeof window !== 'undefined' ? window.yunzhiVisualEdition ?? null : null
const ROUND11 = { precision: 'precision11', glass: 'glass11', research: 'research11' }
const cache = new Map()

/** The template's edition for a theme id of shared/themes.mjs (null when the scripts did not load). */
export function editionOf(theme) {
  if (theme === 'monoline') return LINE
  if (!cache.has(theme)) {
    const make = typeof window !== 'undefined' ? window.yunzhiRound11Edition : null
    cache.set(theme, typeof make === 'function' && Object.hasOwn(ROUND11, theme) ? make(ROUND11[theme]) : null)
  }
  return cache.get(theme)
}

const current = () => editionOf(pageTheme() ?? 'research')

export const hasTabIcons = () => Boolean(current()?.tabIcons)

function Layered({ layers, className, name, size }) {
  return html`<svg class=${`ico ${className}`} data-glyph=${name} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style=${size ? { width: `${size}px`, height: `${size}px` } : undefined}>
    ${layers.map(({ d, tone }, i) => html`<path key=${i} class=${tone ? `symbol-${tone}` : undefined} d=${d} />`)}
  </svg>`
}

export function TIcon({ name, fallback = name, size }) {
  const e = current()
  const layers = e?.controlArt?.[name]
  if (layers) return html`<${Layered} layers=${layers} className="control-symbol" name=${name} size=${size} />`
  const d = e?.icons?.[fallback] ?? PATHS[fallback] ?? PATHS.file
  return html`<svg class="ico" data-glyph=${name} viewBox="0 0 24 24" aria-hidden="true" style=${size ? { width: `${size}px`, height: `${size}px` } : undefined}><path d=${d} /></svg>`
}

export function SidebarIcon({ role, fallback }) {
  const layers = current()?.sidebarIcons?.[role]
  return layers ? html`<${Layered} layers=${layers} className="sidebar-symbol" name=${role} />` : html`<${TIcon} name=${fallback} />`
}
