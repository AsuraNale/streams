// Words the page writes itself that more than one screen uses. Every user-visible word the page writes lives
// in src/renderer/texts/ — test/wording.test.mjs scans all of it (banned terms: 0 hits; full-width punctuation
// next to Chinese) and fails when Chinese text appears in a string anywhere else in src/renderer/ or src/shared/.
// Placeholders are {name}, filled by fmt() (lib/format.js). Wording follows the product plan (方案 §1.7 对照表).

export const BRAND = Object.freeze({
  mark: '流',
  name: '流息',
  tagline: 'STREAMS',
  // <html lang> (app.js sets it from here; the English table says 'en', and the dates follow it: lib/format.js)
  htmlLang: 'zh-CN',
})

// the sidebar: the nine entries (plan 4.9; their screens: screens/index.js), the library line, the settings button
export const SIDEBAR = Object.freeze({
  label: '导航',
  entries: Object.freeze({
    today: '今日',
    inbox: '待看',
    library: '资料库',
    graph: '图谱',
    ask: '问库',
    pipeline: '流水线',
    sources: '来源与主题',
    status: '运行状态',
  }),
  settings: '设置',
  // the library the app has open: its folder name, or this while none is
  noLibrary: '未打开库',
  libraryLabel: '当前的库',
})

export const SEP = ' · '

// a moment with its time (lib/format.js whenText) and just the day (dayText)
export const WHEN = Object.freeze({ today: '今天 {hm}', yesterday: '昨天 {hm}', date: '{m}-{d} {hm}' })
export const DAY = Object.freeze({ today: '今天', yesterday: '昨天', date: '{m}-{d}' })

// what the page says when a bridge call fails (codes: src/main/bridge-methods.mjs ERROR_CODES)
export const ERRORS = Object.freeze({
  retry: '重试',
  failed: '没有成功，可以再试一次。',
})

// the five fetch states of a source (src/shared/fetch-states.mjs; plan §1.7)
export const FETCH_STATES = Object.freeze({
  ok: '正常',
  empty: '没新内容',
  gap: '地址有问题',
  failed: '暂时失败',
  blocked: '被拒绝',
})
