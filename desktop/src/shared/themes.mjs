// The looks of the app (docs/desktop.md §五「主题」; docs/tokens.md). v2 package K2 (维护者 11-10, #6 「定」): the three
// themes of the approved design draft (docs/design/next/themes/) replace v1.0's river / paper / night — 精密国际主义
// precision (the default), 澄明玻璃 glass, 研究对话 research — and the light / dark choice is a setting of its own,
// the appearance: light · dark · system (follow Windows). A theme and the appearance in force (light or dark) make one of
// six sets; this module says what each window paints before the page draws (the set's --st-page, the same value as
// styles/tokens.css: test/theme.test.mjs reads both) and its color-scheme.
// Pure: no Node, no DOM — the main process (main/theme.mjs) and the settings page (screens/settings.js) read it.
// The defaults are not here: main/theme.mjs DEFAULT_THEME and DEFAULT_APPEARANCE, one line each.

export const THEME_IDS = Object.freeze(['precision', 'glass', 'research'])

/** The appearance setting: a fixed light or dark set, or the one Windows uses now (system). */
export const APPEARANCES = Object.freeze(['light', 'dark', 'system'])

/** What an appearance resolves to: the set actually drawn. */
export const SCHEMES = Object.freeze(['light', 'dark'])

/** The window's background before the first frame: each set's --st-page (K1 tokens-data.mjs: the prototype's --bench). */
export const THEME_PAGE = Object.freeze({
  precision: Object.freeze({ light: '#F6F6F3', dark: '#151515' }),
  glass: Object.freeze({ light: '#F6F8FC', dark: '#16191F' }),
  research: Object.freeze({ light: '#F7F7F3', dark: '#161A19' }),
})

export const isThemeId = v => typeof v === 'string' && THEME_IDS.includes(v)
export const isAppearance = v => typeof v === 'string' && APPEARANCES.includes(v)
export const isScheme = v => typeof v === 'string' && SCHEMES.includes(v)
