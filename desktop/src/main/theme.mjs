/**
 * The app's look (docs/desktop.md §五「主题」; docs/tokens.md): settings.json `theme` is one of the three sets of
 * src/shared/themes.mjs, anything else is DEFAULT_THEME. The first frame is already the set chosen: the window is made with
 * that set's page colour (windowColour) and the app:// handler serves index.html with `data-theme` on <html> (withTheme), so
 * the styles of the set apply before any script runs; Electron's own parts (the title bar, native scrollbars, pop-up menus)
 * follow nativeTheme.themeSource (nativeSource). Pure: main.mjs applies these to Electron.
 * @module desktop/main/theme
 */

import { THEME_IDS, THEME_PAGE, THEME_SCHEME, isThemeId } from '../shared/themes.mjs'

/** The set a new install starts with — the one line the maintainer changes after Friday's side-by-side (plan 5.6 D5). */
export const DEFAULT_THEME = 'river'

export { THEME_IDS, isThemeId }

/** A setting's value as a theme id: one of THEME_IDS, else DEFAULT_THEME. */
export const themeOf = v => (isThemeId(v) ? v : DEFAULT_THEME)

/** BrowserWindow backgroundColor for a theme: its --st-page. */
export const windowColour = id => THEME_PAGE[themeOf(id)]

/** nativeTheme.themeSource for a theme: 'dark' for the dark set, 'light' for the others. */
export const nativeSource = id => THEME_SCHEME[themeOf(id)]

// the one <html …> tag of src/renderer/index.html; withTheme adds the attribute to it and to nothing else
const HTML_TAG = /<html( [^>]*)?>/

/**
 * index.html as served: `data-theme="<id>"` on its <html> tag (the id checked against THEME_IDS, so nothing else can be
 * written into the page). A page without exactly one <html> tag is a defect: thrown.
 * @param {string} text
 * @param {string} id
 */
export function withTheme(text, id) {
  const tags = text.match(new RegExp(HTML_TAG.source, 'g')) ?? []
  if (tags.length !== 1) throw new Error(`index.html must have one <html> tag, it has ${tags.length}`)
  if (/data-theme=/.test(tags[0])) throw new Error('index.html must not set data-theme itself')
  return text.replace(HTML_TAG, (_m, attrs = '') => `<html${attrs} data-theme="${themeOf(id)}">`)
}
