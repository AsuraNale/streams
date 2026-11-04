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
})
