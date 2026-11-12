/**
 * The app's look (docs/desktop.md §五「主题」). Redesign R1 (维护者 11-11): settings.json has `theme` — one of the four template
 * themes of src/shared/themes.mjs (precision · glass · research · monoline), anything else DEFAULT_THEME — and `appearance` —
 * light · dark · system (follow Windows), anything else DEFAULT_APPEARANCE. The two make the set drawn: the theme with the
 * appearance in force (resolveAppearance: 'system' is what Windows uses now, nativeTheme.shouldUseDarkColors).
 * Older ids are migrated when settings.json is read (migrateLook, the R1 contract's table): no theme, v1.0's river or any
 * other value → research + system; v1.0's paper → research + light; night → research + dark; the four ids of now are kept
 * with their appearance.
 * The first frame is already the set in force: the window is made with that set's page colour (windowColour) and the app://
 * handler serves index.html with the theme's style sheets in <head> and its body class, data-theme and data-appearance on
 * <body> (withTheme: the template keys everything on <body>), so the styles apply before any script runs; Electron's own
 * parts (the title bar, native scrollbars, pop-up menus) follow nativeTheme.themeSource (nativeSource: 'system' for the
 * system appearance, so a change in Windows reaches the app; main.mjs listens to nativeTheme's `updated`). Pure: main.mjs
 * applies these to Electron.
 * @module desktop/main/theme
 */

import { APPEARANCES, TEMPLATE_BASE, THEME_IDS, THEME_PAGE, THEME_TEMPLATE, isAppearance, isScheme, isThemeId } from '../shared/themes.mjs'

/** The theme a new install starts with (维护者 11-11, 04 第 20 题: 研究对话). */
export const DEFAULT_THEME = 'research'
/** The appearance a new install starts with (维护者 11-10: 跟随系统). */
export const DEFAULT_APPEARANCE = 'system'

export { APPEARANCES, THEME_IDS, isAppearance, isThemeId }

/** A setting's value as a theme id: one of THEME_IDS, else DEFAULT_THEME. */
export const themeOf = v => (isThemeId(v) ? v : DEFAULT_THEME)

/** A setting's value as an appearance: one of APPEARANCES, else DEFAULT_APPEARANCE. */
export const appearanceOf = v => (isAppearance(v) ? v : DEFAULT_APPEARANCE)

/** v1.0's ids that stood for a light or a dark set: the appearance each becomes (the theme is DEFAULT_THEME). */
export const LEGACY_THEMES = Object.freeze({ paper: 'light', night: 'dark' })

/**
 * settings.json's `theme` and `appearance` as read → the two fields now (the R1 contract's table). A theme id of now keeps its
 * appearance (checked); v1.0's paper / night are DEFAULT_THEME light / dark; anything else (none, river, an unknown value) is
 * DEFAULT_THEME + DEFAULT_APPEARANCE. Only these two fields: readSettings leaves the others as they are.
 * @returns {{theme: string, appearance: string}}
 */
export function migrateLook(rawTheme, rawAppearance) {
  if (isThemeId(rawTheme)) return { theme: rawTheme, appearance: appearanceOf(rawAppearance) }
  if (typeof rawTheme === 'string' && Object.hasOwn(LEGACY_THEMES, rawTheme)) return { theme: DEFAULT_THEME, appearance: LEGACY_THEMES[rawTheme] }
  return { theme: DEFAULT_THEME, appearance: DEFAULT_APPEARANCE }
}

/** The set drawn for an appearance setting: light or dark ('system': what Windows uses now). */
export const resolveAppearance = (appearance, systemDark) => {
  const a = appearanceOf(appearance)
  return a === 'system' ? (systemDark === true ? 'dark' : 'light') : a
}

/** BrowserWindow backgroundColor of a theme in a scheme (light / dark): the page colour that set draws. */
export const windowColour = (id, scheme) => THEME_PAGE[themeOf(id)][isScheme(scheme) ? scheme : 'light']

/** nativeTheme.themeSource for an appearance setting: 'light', 'dark', or 'system' (Electron then follows Windows). */
export const nativeSource = appearance => appearanceOf(appearance)

// the one <html …> tag, the one bare <body> tag and the one place for the theme's sheets of src/renderer/index.html
const HTML_TAG = /<html( [^>]*)?>/
const BODY_TAG = /<body( [^>]*)?>/
export const SHEETS_MARK = '<!--theme-sheets-->'

/** The <link> tags of a theme's sheets, in the template's order (each marked data-theme-sheet: lib/theme.js swaps them). */
export const sheetLinks = id => THEME_TEMPLATE[themeOf(id)].sheets.map(p => `<link rel="stylesheet" data-theme-sheet href="${TEMPLATE_BASE}${p}">`).join('\n')

/**
 * index.html as served: `data-theme="<id>" data-appearance="<light|dark>"` on its <html> tag (the app's own hooks); the
 * theme's sheets where SHEETS_MARK is; on <body> the template's class, data-theme and data-appearance, and
 * data-product="streams" (the template draws 流息's mark for it). The id is checked against THEME_IDS and the scheme against
 * light / dark, so nothing else can be written into the page. A page without exactly one <html> tag, one mark and one bare
 * <body> tag, or one that sets data-theme / data-appearance itself, is a defect: thrown.
 * @param {string} text
 * @param {string} id - the theme
 * @param {string} scheme - the appearance in force: 'light' | 'dark'
 */
export function withTheme(text, id, scheme) {
  const tags = text.match(new RegExp(HTML_TAG.source, 'g')) ?? []
  if (tags.length !== 1) throw new Error(`index.html must have one <html> tag, it has ${tags.length}`)
  if (/data-theme=|data-appearance=/.test(tags[0])) throw new Error('index.html must not set data-theme or data-appearance itself')
  const bodies = text.match(new RegExp(BODY_TAG.source, 'g')) ?? []
  if (bodies.length !== 1 || bodies[0] !== '<body>') throw new Error('index.html must have one bare <body> tag')
  if (text.split(SHEETS_MARK).length !== 2) throw new Error(`index.html must have one ${SHEETS_MARK}`)
  const theme = themeOf(id)
  const s = isScheme(scheme) ? scheme : 'light'
  const t = THEME_TEMPLATE[theme]
  return text
    .replace(HTML_TAG, (_m, attrs = '') => `<html${attrs} data-theme="${theme}" data-appearance="${s}">`)
    .replace(SHEETS_MARK, sheetLinks(theme))
    .replace(BODY_TAG, `<body class="${t.bodyClass}" data-theme="${t.dataTheme}" data-appearance="${s}" data-product="streams">`)
}
