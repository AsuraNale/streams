// The main process's own words outside notifications: today only the title of the terminal window the CLI's login
// opens in (connector.openLogin). The same rules as every text table: the wording scanner, full-width punctuation
// (test/wording.test.mjs).

export const APP = Object.freeze({
  loginWindowTitle: '流息',
  // the tray icon (tray.mjs; docs/desktop.md §4.3): its hint and its menu
  tray: Object.freeze({
    tooltip: '流息 · {n} 条待看',
    open: '打开流息',
    runNow: '立即运行',
    quit: '退出',
  }),
  // the reading window (reader.mjs; docs/desktop.md §4.9): its bar and the reading page it makes
  reader: Object.freeze({
    windowTitle: '流息 · 阅读',
    lang: 'zh-CN',
    // redesign R3 (P20, 05-措辞规范: 回到条目 → 返回条目, 在浏览器里打开 → 在浏览器中打开)
    back: '返回条目',
    address: '地址',
    reading: '阅读模式',
    original: '原网页',
    browser: '在浏览器中打开',
    modes: '显示方式',
    loading: '正在提取正文…',
    fallback: '无法从该网页提取正文，已显示原网页。',
    readingNote: '阅读模式：仅保留正文，已移除导航与广告',
  }),
})
