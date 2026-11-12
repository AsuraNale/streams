// The looks of the app (docs/desktop.md §五「主题」). Redesign R1 (维护者 11-11, 04-要维护者定的事 第 19–21 题): the four themes of
// 丽芙's template — 精密国际主义 precision, 澄明玻璃 glass, 研究对话 research (the default), 单线黑白 monoline — used as they are:
// each theme is the template's own style sheets and body classes, copied byte for byte into src/renderer/template/ (see
// template/manifest.json; the design's 07-模板版/templates/<主题>/index.html says which sheets, in which order, and which body
// class). v2 package K2's three token sets (styles/tokens.css) are gone. The light / dark choice is the appearance: light ·
// dark · system (follow Windows); dark is the template's own `data-appearance="dark"` on <body>.
// Pure: no Node, no DOM — the main process (main/theme.mjs: the first frame) and the page (lib/theme.js: a change in 设置)
// read it. The defaults are not here: main/theme.mjs DEFAULT_THEME and DEFAULT_APPEARANCE.

export const THEME_IDS = Object.freeze(['precision', 'glass', 'research', 'monoline'])

/** The appearance setting: a fixed light or dark set, or the one Windows uses now (system). */
export const APPEARANCES = Object.freeze(['light', 'dark', 'system'])

/** What an appearance resolves to: the set actually drawn. */
export const SCHEMES = Object.freeze(['light', 'dark'])

/** Where the template's files are served (app://ui/template/…, src/renderer/template/). */
export const TEMPLATE_BASE = '/template/'

// the sheets every theme ends with: the template's workbench (round 11) and the design's Streams additions (streams.css)
const WORKBENCH = 'shared/round11/workbench.css'
const STREAMS = 'streams/streams.css'
// 精密国际主义's own stack (the design's templates/精密国际主义-第十一轮/index.html); 单线黑白 is the same plus round 12's line.css
const PRECISION_SHEETS = Object.freeze([
  'shared/round6/base.css', 'shared/round7/heritage/swiss.css', 'shared/round6/design.css', 'shared/round7/swiss.css',
  'shared/round8/common.css', 'shared/round8/precision.css', 'templates/precision-detail/precision.css',
  'shared/round9/system.css', 'shared/round9/precision.css', WORKBENCH,
])

/**
 * Each theme as the template draws it: its style sheets in order (paths under TEMPLATE_BASE), the class and data-theme of
 * <body>. `templates/precision-detail/` is the design's `templates/精密国际主义-精修/` (the folder renamed so the app's code
 * holds no Chinese outside its text tables; the files in it are the same bytes).
 */
export const THEME_TEMPLATE = Object.freeze({
  precision: Object.freeze({
    sheets: Object.freeze([...PRECISION_SHEETS, STREAMS]),
    bodyClass: 'theme-swiss r9 precision-detail r9-precision r11 r11-precision',
    dataTheme: 'precision11',
  }),
  glass: Object.freeze({
    sheets: Object.freeze([
      'shared/round6/base.css', 'shared/round6/design.css', 'shared/round3/themes/glass.css', 'shared/round9/system.css',
      'shared/round9/glass.css', 'shared/round10/glass.css', WORKBENCH, STREAMS,
    ]),
    bodyClass: 'theme-glass r9 r9-glass r10-glass r11 r11-glass',
    dataTheme: 'glass11',
  }),
  research: Object.freeze({
    sheets: Object.freeze([
      'shared/round6/base.css', 'shared/round6/design.css', 'shared/round3/themes/research.css', 'shared/round9/system.css',
      'shared/round9/research.css', WORKBENCH, STREAMS,
    ]),
    bodyClass: 'theme-research r9 r9-research r11 r11-research',
    dataTheme: 'research11',
  }),
  monoline: Object.freeze({
    sheets: Object.freeze([...PRECISION_SHEETS, 'shared/round12/line.css', STREAMS]),
    bodyClass: 'theme-swiss r9 precision-detail r9-precision r11 r11-precision r12-line',
    dataTheme: 'line12',
  }),
})

/**
 * The template's icon data, loaded once by index.html in this order (classic scripts, before the page's module): each
 * defines window.yunzhiRound9Edition / yunzhiRound10Edition / yunzhiRound11Edition or, last, 单线黑白's edition
 * (lib/template-icons.js picks the theme's). The order is the templates' own: 精修 first, so round 9's precision icons are its.
 */
export const TEMPLATE_SCRIPTS = Object.freeze([
  'templates/precision-detail/edition.js', 'shared/round9/edition.js', 'shared/round10/edition.js',
  'shared/round11/edition.js', 'shared/round12/edition.js',
])

/**
 * The window's background before the first frame: the page colour each theme × appearance draws (the template's --bench on
 * <body>), read off the real window (scripts/theme-colours.mjs writes nothing; test/ui-theme.test.mjs compares every one).
 */
export const THEME_PAGE = Object.freeze({
  precision: Object.freeze({ light: '#F6F6F3', dark: '#151515' }),
  glass: Object.freeze({ light: '#F6F8FC', dark: '#16191F' }),
  research: Object.freeze({ light: '#F7F7F3', dark: '#161A19' }),
  monoline: Object.freeze({ light: '#F5F5F3', dark: '#0F1113' }),
})

export const isThemeId = v => typeof v === 'string' && THEME_IDS.includes(v)
export const isAppearance = v => typeof v === 'string' && APPEARANCES.includes(v)
export const isScheme = v => typeof v === 'string' && SCHEMES.includes(v)
