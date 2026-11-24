// 设置 (screens/settings.js). Redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-4; design 03-页面稿 P17, P18, P19; F63–F69;
// the words of 05-措辞规范): a line on top, four jumps and four parts — 连接 (the three connections, two model slots each, 测试连接,
// 设为当前连接, 配置 for the API key) · 外观与语言 (the four themes, the appearance, the language) · 库与用量 (新建库默认存储位置, this
// month's calls of every library, the sum written out) · 关于 (the version and the update, Starry Digital, 许可证
// 与致谢, ▾ 高级: 显示开发者信息 · 复制诊断信息 · 打开运行记录文件夹). v2 package I's 主 Agent part and 定时一览 are gone (维护者 第 10 题).
// The connection names and the login loop: texts/common.js CONNECTIONS. 首次设置's step names (setupSteps / setupBy) are read by
// 高级设置's 变更记录 (texts/sources.js ADVANCED).

export const SETTINGS = Object.freeze({
  title: '设置',
  subtitle: '以下设置对本机的流息及全部库生效。各库的来源、要求与定时，请在该库的「来源与要求」中设置。',
  // redesign R4b: the page's four parts, top to bottom (and the four jumps on top)
  groups: Object.freeze({ connection: '连接', look: '外观与语言', library: '库与用量', about: '关于' }),
  jumpsLabel: '跳转到',

  // 连接
  connections: '连接',
  connectionsFailed: '未能读取连接状态。',
  conn: Object.freeze({
    use: '设为当前连接',
    inUse: '当前使用',
    model: '主模型',
    verify: '核验模型',
    setup: '配置',
    probe: '测试连接',
    apiHint: '支持任意厂商；厂商与接口地址在「配置」中设置',
    // the one sentence under the three rows (F63, F64: 主 Agent uses the current connection's main model)
    agentUses: '建库、更新和问库都用当前连接的主模型；核验用核验模型。',
    // 1.1 W6a (A6; W4's live runs, contract C7): with these two, this version only asks the library
    onlyAsk: '这一版用这种连接只能问库；建库和更新要用「{cc}」或「{cx}」。',
  }),

  // 新建库默认存储位置 (getLibraryRoot / chooseLibraryRoot / setLibraryRoot)
  root: Object.freeze({
    label: '新建库默认存储位置',
    isDefault: '默认位置',
    change: '更改…',
    reset: '恢复默认',
    saved: '已保存。',
    bad: '该文件夹不可用：需为完整路径，且不能位于流息自己的应用数据文件夹中。',
    failed: '未能读取该位置。',
  }),

  // 本月用量合计 (getUsageTotal; the same count as each library's run funnel and the right panel)
  usage: Object.freeze({
    total: '本月用量合计：{calls} 次模型调用',
    tokens: '输入 {input} · 输出 {output}',
    library: '{name} {calls}',
    librarySelfCheck: '{name} {calls}（含运行前自检 {n}）',
    missing: '{name} 0（文件夹不存在）',
    sum: '= {parts}',
    plus: ' + ',
    failed: '未能读取用量。',
  }),

  // 输入 API key (P18): the vendor (选择预设… / 自定义接口地址), the address, the key; the key only into the system's protection
  // 1.1.1 P5 (the maintainer 11-24 evening: DeepSeek's search API first): the search of an API connection. The search service's name may
  // appear here (V7's exception for this one place, standards.mjs)
  search: Object.freeze({
    label: '搜索',
    fromModel: '用你模型的 DeepSeek key 搜索：用 API key 建库、更新时可以搜网页。',
    hasKey: '用 API key 建库、更新时，用你填的 DeepSeek key 搜网页（末四位 {hint}）。',
    none: '还没有搜索：用 API key 建库、更新时只能读网页，不能搜。填一个 DeepSeek 的 key 就能搜（按次计费，每 1000 次约 0.75 美元）。',
    placeholder: '粘贴 DeepSeek 的 key',
    save: '保存',
    remove: '删除搜索 key',
    note: '这个 key 只存在这台电脑上（加密），和模型的 key 分开，只发给 DeepSeek 的搜索接口。',
    failed: '没保存上，请再试一次。',
  }),
  apiDialog: Object.freeze({
    title: '输入 API key',
    vendor: '厂商',
    vendorPick: '选择预设…',
    baseUrl: '接口地址',
    baseUrlPlaceholder: 'https://…',
    key: 'key',
    keyPlaceholder: '请输入 API key',
    hasKey: '已有 key（末四位 {hint}）。保存后将替换为新的 key。',
    // 1.1.1 P11a: and that it does not move with the libraries (场景六③)
    note: 'API key 只存在这台电脑上（系统凭据保护中），不会写入任何库文件夹；换电脑要重新输入。费用按量计入对应账户。',
    save: '保存',
    remove: '删除 API key',
    cancel: '取消',
    close: '关闭',
    saved: '已保存。',
    removed: '已删除。',
    failed: '未能保存。',
  }),

  // 首次设置's record (streams.json setup, plan A1): its step names, read by 高级设置's 变更记录
  setup: '初始设置',
  setupNone: '暂无记录',
  setupFailed: '未能读取初始设置的记录。',
  setupLine: '{step}：{by}',
  setupSteps: Object.freeze({
    library: '存储位置',
    connection: '连接方式',
    pack: '预设来源包',
    sources: '来源',
    trial: '首次运行',
    schedule: '定时',
  }),
  setupBy: Object.freeze({ chose: '已选择', wrote: '手动填写', default: '采用默认', skipped: '已跳过' }),

  // the language of the app's own words (docs/desktop.md §六)
  language: '语言',
  languageGroup: '选择语言',
  languages: Object.freeze({ auto: '跟随系统', 'zh-CN': '中文', en: 'English' }),
  languageNow: '（当前：{name}）',
  languageNote: '仅切换流息自身的界面文字；库中的文件和模型生成的内容不受影响。切换后页面将重新载入。',

  // the app's look (docs/desktop.md §五「主题」). Redesign R1 (维护者 11-11): the template's four themes and the appearance —
  // 浅色 · 深色 · 跟随系统
  theme: '主题',
  themeHint: '界面的配色与形状',
  themeGroup: '选择主题',
  themes: Object.freeze({ precision: '精密国际主义', glass: '澄明玻璃', research: '研究对话', monoline: '单线黑白' }),
  themeDefault: '默认',
  appearance: '外观',
  appearanceHint: '跟随系统：Windows 切换深色时，流息随之切换',
  appearanceGroup: '选择外观',
  appearances: Object.freeze({ light: '浅色', dark: '深色', system: '跟随系统' }),
  themeNote: '选择后立即生效，主窗口与阅读窗口同时切换；下次打开保持所选。',
  themeFailed: '未能切换主题。',
  appearanceFailed: '未能切换外观。',

  // 关于 · ▾ 高级 (F69: the only place 复制诊断信息 is)
  advanced: '高级',
  devInfo: '显示开发者信息',
  devInfoText: '开启后，页面上会多显示一些用于排查问题的细节。默认关闭。',
  copyDiagnostics: '复制诊断信息',
  diagnosticsText: '遇到问题需要协助时，可复制后发送给开发者。其中包含原始出错记录和文件位置，不含 API key。',
  copied: '已复制到剪贴板。',
  openLogs: '打开运行记录文件夹',
  openLogsFailed: '未能打开运行记录文件夹。',

  about: '关于',
  version: '流息 {version}（Windows 版）',
  // a development run (npm start): the version is release.json's, it checks but does not update
  versionDev: '流息 {version} 开发版（Windows 版）',
  madeBy: '由 Starry Digital 开发',

  // 许可证与致谢 (P19; V11): Streams' own license, the interface font, the parts that ship with it, the full notices of an install
  licensesOpen: '许可证与致谢',
  licenses: Object.freeze({
    title: '许可证与致谢',
    own: '流息本身 · {license}',
    font: '界面字体 · {name}（{license}）',
    // redesign R6a (P19): the heading font of 研究对话, shipped with the app
    displayFont: '标题字体 · {name}（{license}）',
    fontText: '查看字体许可证全文',
    components: '随附的第三方组件',
    name: '名称',
    version: '版本',
    license: '许可证',
    notices: '查看完整第三方声明',
    noticesNone: '开发版没有该文件：安装后的流息在安装目录中附带 THIRD-PARTY-NOTICES.txt。',
    noticesFailed: '未能打开第三方声明。',
    failed: '未能读取许可证。',
    close: '关闭',
  }),

  // 检查版本 + 更新版本 (docs/desktop.md §四). Sizes come as 「37.2 MB」, the date as the page's language writes a date,
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
    manual: '有新版本 {version}，但该版本无法校验，请到发布页手动下载。',
    manualUnknown: '发布页上的新版本无法校验，请到发布页手动下载。',
    openPage: '打开发布页 ↗',
    checkFailed: '未能检查更新：无法连接更新服务器，可能是网络问题。',
    checkTooOften: '未能检查更新：检查过于频繁，请稍后重试。',
    checkOdd: '未能检查更新：更新服务器的响应异常，请稍后重试。',
    retry: '重试',
    downloading: '已下载 {got} / {total}',
    progressLabel: '下载进度',
    cancel: '取消',
    downloadFailed: '下载已中断，可能是网络问题。',
    redownload: '重新下载',
    verifyFailed: '下载的文件与发布的文件不一致，已删除，未安装。',
    readyTitle: '新版本 {version} 已下载。',
    readyText: '流息将关闭并自动安装，安装完成后自动重新打开，库和设置均会保留。',
    start: '开始更新',
    later: '稍后更新',
    turnRunning: '正在运行：请在本次运行结束后再更新。',
    deferred: '新版本 {version} 已下载，可随时更新。',
    now: '立即更新',
    launching: '正在启动安装程序，流息即将关闭。',
    launchFailed: '安装程序未能启动。',
  }),
})
