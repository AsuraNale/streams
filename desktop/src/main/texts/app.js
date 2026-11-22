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
    // 1.1 W6a (A4): the original Streams kept, opened from 待看 (from one point of the summary: its sentence marked)
    stored: '存下的原文',
    storedNote: '存下的原文 · {when} {method}',
    storedNoteFrom: '存下的原文 · {when} {method} · 从要点 {n} 打开',
    methods: Object.freeze({ direct: '直接取', render: '渲染后取', pdf: 'PDF 取字' }),
  }),
  // 1.1 W1 (C2 / C3): the app's own files (the definition of actions, the two instructions for the agents) are missing or
  // broken; the app does not start on them
  startupBroken: Object.freeze({
    title: '流息无法启动',
    body: '流息自带的文件缺失或已损坏，无法启动。请重新安装流息。\n\n详情：\n{problems}',
  }),
})
