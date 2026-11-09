// The main process's own words outside notifications: today only the title of the terminal window the CLI's login
// opens in (connector.openLogin). The same rules as every text table: the wording scanner, full-width punctuation
// (test/wording.test.mjs).

export const APP = Object.freeze({
  loginWindowTitle: '流息',
  // the tray icon (tray.mjs; docs/desktop.md §4.3): its hint and its menu
  tray: Object.freeze({
    tooltip: '流息 · {n} 条待看',
    open: '打开流息',
    runNow: '现在跑一轮',
    quit: '退出',
  }),
  // the reading window (reader.mjs; docs/desktop.md §4.9): its bar and the reading page it makes
  reader: Object.freeze({
    windowTitle: '流息 · 阅读',
    lang: 'zh-CN',
    back: '回到条目',
    reading: '阅读模式',
    original: '原网页',
    browser: '在浏览器里打开',
    modes: '阅读模式或原网页',
    loading: '正在抽正文……',
    fallback: '这一页抽不出正文，显示的是原网页',
    readingNote: '阅读模式：只留正文，去掉了导航和广告',
  }),
})
