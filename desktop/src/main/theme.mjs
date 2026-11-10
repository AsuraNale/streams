/**
 * The app's look (docs/desktop.md §五「主题」; docs/tokens.md). v2 package K2 (维护者 11-10): settings.json has `theme` — one of
 * the three themes of src/shared/themes.mjs (precision · glass · research), anything else DEFAULT_THEME — and `appearance`
 * — light · dark · system (follow Windows), anything else DEFAULT_APPEARANCE. The two make the set drawn: the theme with
 * the appearance in force (resolveAppearance: 'system' is what Windows uses now, nativeTheme.shouldUseDarkColors).
 * v1.0's ids are migrated when settings.json is read (migrateLook, the maintainer's table in docs/feedback/2026-11-10-maintainer-v2-trial.md):
 * none / river / anything else → precision + system; paper → precision + light; night → precision + dark.
 * The first frame is already the set in force: the window is made with that set's page colour (windowColour) and the app://
 * handler serves index.html with `data-theme` and `data-appearance` on <html> (withTheme), so the styles apply before any
 * script runs; Electron's own parts (the title bar, native scrollbars, pop-up menus) follow nativeTheme.themeSource
 * (nativeSource: 'system' for the system appearance, so a change in Windows reaches the app; main.mjs listens to nativeTheme's
 * `updated`). Pure: main.mjs applies these to Electron.
 * @module desktop/main/theme
 */

import { APPEARANCES, THEME_IDS, THEME_PAGE, isAppearance, isScheme, isThemeId } from '../shared/themes.mjs'

/** The theme a new install starts with (维护者 11-10: 精密国际主义). */
export const DEFAULT_THEME = 'precision'
/** The appearance a new install starts with (维护者 11-10: 跟随系统). */
export const DEFAULT_APPEARANCE = 'system'

export { APPEARANCES, THEME_IDS, isAppearance, isThemeId }

/** A setting's value as a theme id: one of THEME_IDS, else DEFAULT_THEME. */
export const themeOf = v => (isThemeId(v) ? v : DEFAULT_THEME)

/** A setting's value as an appearance: one of APPEARANCES, else DEFAULT_APPEARANCE. */
export const appearanceOf = v => (isAppearance(v) ? v : DEFAULT_APPEARANCE)

/**
 * v1.0's three ids and the appearance each becomes (维护者 11-10「照建议」): river was v1.0's default and every write put it into
 * the file, so it says nothing about a choice — the new default; paper was a light set; night is taken over by dark.
 */
export const LEGACY_THEMES = Object.freeze({ river: 'system', paper: 'light', night: 'dark' })

/**
 * settings.json's `theme` and `appearance` as read → the two fields now. A theme id of now keeps its appearance (checked);
 * anything else is DEFAULT_THEME, with the appearance v1.0's id stands for (paper → light, night → dark) or else the one
 * written (checked; none → DEFAULT_APPEARANCE). Only these two fields: readSettings leaves the others as they are.
 * @returns {{theme: string, appearance: string}}
 */
export function migrateLook(rawTheme, rawAppearance) {
  if (isThemeId(rawTheme)) return { theme: rawTheme, appearance: appearanceOf(rawAppearance) }
  const legacy = typeof rawTheme === 'string' && Object.hasOwn(LEGACY_THEMES, rawTheme) ? LEGACY_THEMES[rawTheme] : null
  if (legacy === 'light' || legacy === 'dark') return { theme: DEFAULT_THEME, appearance: legacy }
  return { theme: DEFAULT_THEME, appearance: appearanceOf(rawAppearance) }
}

/** The set drawn for an appearance setting: light or dark ('system': what Windows uses now). */
export const resolveAppearance = (appearance, systemDark) => {
  const a = appearanceOf(appearance)
  return a === 'system' ? (systemDark === true ? 'dark' : 'light') : a
}

/** BrowserWindow backgroundColor of a theme in a scheme (light / dark): that set's --st-page. */
export const windowColour = (id, scheme) => THEME_PAGE[themeOf(id)][isScheme(scheme) ? scheme : 'light']

/** nativeTheme.themeSource for an appearance setting: 'light', 'dark', or 'system' (Electron then follows Windows). */
export const nativeSource = appearance => appearanceOf(appearance)

// the one <html …> tag of src/renderer/index.html; withTheme adds the attributes to it and to nothing else
const HTML_TAG = /<html( [^>]*)?>/

/**
 * index.html as served: `data-theme="<id>" data-appearance="<light|dark>"` on its <html> tag (the id checked against
 * THEME_IDS and the scheme against light / dark, so nothing else can be written into the page). A page without exactly one
 * <html> tag, or one that sets either attribute itself, is a defect: thrown.
 * @param {string} text
 * @param {string} id - the theme
 * @param {string} scheme - the appearance in force: 'light' | 'dark'
 */
export function withTheme(text, id, scheme) {
  const tags = text.match(new RegExp(HTML_TAG.source, 'g')) ?? []
  if (tags.length !== 1) throw new Error(`index.html must have one <html> tag, it has ${tags.length}`)
  if (/data-theme=|data-appearance=/.test(tags[0])) throw new Error('index.html must not set data-theme or data-appearance itself')
  const s = isScheme(scheme) ? scheme : 'light'
  return text.replace(HTML_TAG, (_m, attrs = '') => `<html${attrs} data-theme="${themeOf(id)}" data-appearance="${s}">`)
}
