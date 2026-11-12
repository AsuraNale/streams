// Redesign R1: the look on the page (docs/desktop.md §五「主题」). The first frame comes from the main process (main/theme.mjs
// withTheme: the theme's sheets in <head>, its class, data-theme and data-appearance on <body>, data-theme / data-appearance
// on <html> for the app's own hooks). A change afterwards — 设置, or Windows turning dark under 跟随系统 — comes here:
//   applyLook({ theme, scheme })  → the theme's sheets swapped in the template's order (the new ones loaded first, then the
//                                    old ones removed, so the page never draws without styles), then <body> and <html>.
// Only the four ids of shared/themes.mjs and light / dark are ever written.
import { TEMPLATE_BASE, THEME_TEMPLATE, isScheme, isThemeId } from '../../shared/themes.mjs'

const sheetsNow = () => [...document.querySelectorAll('link[data-theme-sheet]')]
const hrefOf = l => l.getAttribute('href')

/** The theme in force on the page (<html data-theme>), or null. */
export const pageTheme = () => (isThemeId(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : null)

let pending = Promise.resolve()

function setAttributes(theme, scheme) {
  const t = THEME_TEMPLATE[theme]
  const b = document.body
  if (b.className !== t.bodyClass) b.className = t.bodyClass
  b.dataset.theme = t.dataTheme
  b.dataset.appearance = scheme
  b.dataset.product = 'streams'
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.appearance = scheme
}

async function swap(theme, scheme) {
  const want = THEME_TEMPLATE[theme].sheets.map(p => `${TEMPLATE_BASE}${p}`)
  const old = sheetsNow()
  if (old.length === want.length && old.every((l, i) => hrefOf(l) === want[i])) { setAttributes(theme, scheme); return }
  const anchor = document.querySelector('link[href="/styles/app.css"]')
  const added = want.map(href => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.setAttribute('data-theme-sheet', '')
    l.href = href
    return l
  })
  const loaded = added.map(l => new Promise(resolve => { l.onload = resolve; l.onerror = resolve }))
  for (const l of added) document.head.insertBefore(l, anchor)
  await Promise.all(loaded)
  for (const l of old) l.remove()
  setAttributes(theme, scheme)
}

/** The look in force → the page (one change at a time, in the order asked). */
export function applyLook({ theme, scheme }) {
  if (!isThemeId(theme) || !isScheme(scheme)) return pending
  pending = pending.then(() => swap(theme, scheme), () => swap(theme, scheme))
  return pending
}
