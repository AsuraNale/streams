// The three looks of the app (plan 5.6 D5; docs/tokens.md): their ids, what each window paints before the page draws
// (the page colour of each set, the same value as --st-page in styles/tokens.css: test/theme.test.mjs reads both), and
// whether it is a dark set (Electron's nativeTheme.themeSource: the title bar, native scrollbars, pop-up menus).
// Pure: no Node, no DOM — the main process (main/theme.mjs) and the settings page (screens/settings.js) read it.
// The default is not here: main/theme.mjs DEFAULT_THEME, one line.

export const THEME_IDS = Object.freeze(['river', 'paper', 'night'])

/** The window's background before the first frame: each set's --st-page. */
export const THEME_PAGE = Object.freeze({ river: '#F2F5F7', paper: '#F2F5F7', night: '#0F161B' })

/** 'dark' for the dark set, 'light' for the others (nativeTheme.themeSource and the page's color-scheme). */
export const THEME_SCHEME = Object.freeze({ river: 'light', paper: 'light', night: 'dark' })

export const isThemeId = v => typeof v === 'string' && THEME_IDS.includes(v)
