// 设置 (screens/settings.js): the language, the developer switch, the diagnostics, 「关于」 with the update. The connections
// (plan C2: 连接你电脑上的 Claude Code / Codex, an API key) come with their own screen later, not here yet.

export const SETTINGS = Object.freeze({
  title: '设置',
  subtitle: '对这台电脑上的流息都有效',

  // the language of the app's own words (docs/desktop.md��)
  language: '语言',
  languageHint: '流息自己写的字用哪种语言',
  languageGroup: '选择语言',
  languages: Object.freeze({ auto: '跟随系统', 'zh-CN': '中文', en: 'English' }),
  languageNow: '（当前：{name}）',
  languageNote: '只改流息自己写的字；库里的文件和模型写的内容不受影响。',
  languageReload: '切换后这一页会重新载入。',

  advanced: '高级',
  advancedHint: '给排查问题用，平时不用管',
  devInfo: '显示开发者信息',
  devInfoText: '打开后，页面上多显示一些给排查问题用的细节。默认关闭。',
  copyDiagnostics: '复制诊断信息',
  diagnosticsText: '出了问题、需要我们帮忙时，复制后发给我们。里面有原始出错记录和文件位置，没有你的 key。',
  copied: '已复制到剪贴板。',

  about: '关于',
  version: '流息 {version}（Windows 版）',
  // a development run (npm start): the version is release.json's, it checks but does not update
  versionDev: '流息 {version} 开发版（Windows 版）',
  madeBy: '由 Starry Digital 开发',

  // 检查版本 + 更新版本 (docs/desktop.md��). Sizes come as 「37.2 MB」, the date as the page's language writes a date,
  // {at} as WHEN (texts/common.js) writes a time
  update: Object.freeze({
    check: '检查更新',
    checking: '正在检查……',
    upToDate: '已是最新版本 · 刚刚检查',
    upToDateAt: '已是最新版本 · {at} 检查',
    available: '有新版本：{version}',
    released: '{date} 发布',
    fullNotes: '查看完整说明 ↗',
    download: '下载并更新',
    size: '安装包约 {size}',
    devCannot: '开发版不能自动更新，请到发布页下载安装包。',
    manual: '有新版本 {version}，但这一版没法校验，请到发布页手动下载。',
    manualUnknown: '发布页上的新版本没法校验，请到发布页手动下载。',
    openPage: '打开发布页 ↗',
    checkFailed: '没能检查更新：连不上更新服务器，可能是网络的问题。',
    checkTooOften: '没能检查更新：检查得太频繁了，过一会儿再试。',
    checkOdd: '没能检查更新：更新服务器这次的回答不对，过一会儿再试。',
    retry: '重试',
    downloading: '已下载 {got} / {total}',
    progressLabel: '下载进度',
    cancel: '取消',
    downloadFailed: '下载中断了，可能是网络的问题。',
    redownload: '重新下载',
    verifyFailed: '下载的文件和发布的不一致，已经删掉，没有安装。',
    readyTitle: '新版本 {version} 已经下载好。',
    readyText: '流息会关闭并自动安装，装完自动重新打开，你的库和设置都会保留。',
    start: '开始更新',
    later: '稍后',
    turnRunning: '流水线正在跑：等这一轮跑完再更新。',
    deferred: '新版本 {version} 已经下载好，随时可以更新。',
    now: '现在更新',
    launching: '正在启动安装……流息马上会关闭。',
    launchFailed: '安装程序没能启动。',
  }),
})
