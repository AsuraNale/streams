// 来源与要求 (screens/sources.js). Redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-1 / R4b-2 / R4b-3; design 03-页面稿 P14,
// P15, P21; the words of 05-措辞规范), 1.1 (W6a, W7b): a library's card and its sources, or — a library made by the last version —
// its notice, its 追踪要求 and its sources read only; 定时; a line to 高级设置 (变更记录, 库文件夹) with the template dialog of 移除该库.
// The five states' words: texts/common.js FETCH_STATES; what to do: FETCH_HINTS (V3's, as they are); the kinds: SOURCE_KINDS.
// Source names, addresses, search words, topic names, the brief and the library's name are the library's data.

export const SOURCES = Object.freeze({
  eyebrow: '来源与要求 / SOURCES & BRIEF',
  heading: '这个库追踪什么',
  lead: '通常只需要修改这一页；不常用的设置收在最下面的「高级设置」里。',
  // 1.1 W6a (A5): a library with a card: the card, its sources (address or search word, state, 「原文」), a source added
  cardLead: '这座库按它的建库卡更新。要改卡，和主 Agent 说；它提出改前改后，你确认了才算数。',
  card: Object.freeze({
    heading: '建库卡',
    version: '{when} 确认 · 第 {n} 版',
    lines: Object.freeze({ purpose: '用途', scope: '边界', exclude: '不要什么', trust: '多可信才算数', rhythm: '节奏', language: '语言', hard: '硬条件' }),
    restNote: '收什么 · 不收什么 · 每次怎么挑 · 每条怎么写 · 样例：在「建库卡全文」里',
    full: '建库卡全文',
    fold: '收起全文',
    parts: Object.freeze({ collect: '收什么', skip: '不收什么', unreadable: '读不到的来源和原因', pick: '每次怎么挑', write: '每条怎么写', samples: '样例', decide: '要你定的事' }),
    change: '和主 Agent 改卡',
  }),
  cardSources: Object.freeze({
    heading: '来源 · {n} 个',
    placeholder: '输入网址或检索词，按回车添加',
    head: Object.freeze({ source: '来源', state: '状态', original: '原文' }),
    states: Object.freeze({ ok: '正常', never: '尚未读取', search: '检索词', failed: '暂时失败', blocked: '访问被拒', login: '要登录', check: '要人机验证', dead: '地址失效' }),
    originals: Object.freeze({ read: '读得到', pdf: '是 PDF，已取出文字', link: '只有链接', search: '由更新 Agent 搜', unknown: '还不知道' }),
    searchWord: '检索词：{q}',
    unreadable: '卡上写明读不到',
    // 1.1.1 P1 (B19): what Streams got when it read the address itself, the day the card was handed in
    checked: '流息读的结果：{why}',
    checkedOk: '流息读得到',
    confirmLine: '加进建库卡：{what}',
    confirm: '确认',
    drop: '不加',
    badInput: '没加上：请输入网址（http 或 https 开头）或检索词。',
    exists: '建库卡上已有这个来源。',
    failed: '没加上，请再试一次。',
  }),
  // 1.1 W6a (A6): a library built by the last version
  old: Object.freeze({
    heading: '这座库是上一版建的',
    lead: '这座库尚无建库卡：它是按上一版的追踪要求和来源建的，这一版不再按原来的方式更新它。',
    text: '笔记、资料库、问库都照常能用。要继续自动更新，先和主 Agent 把来源重新查一遍：它从这座库原来的追踪要求和来源起头，交一张建库卡给你；你确认之前，库里什么都不改。',
    action: '重新查一遍来源',
    needsClaude: '要先在设置里选一个能建库的连接（「{cc}」「{cx}」，或填了模型 key 的「{api}」）才能重新查。',
  }),
  loadFailed: '未能读取来源与主题。',
  failed: '操作未成功，请重试。',

  // 要求 (F45, N01, N08)
  brief: Object.freeze({
    heading: '追踪要求',
    none: '尚未填写追踪要求。',
  }),

  // 来源 (F48, F49): added in place
  sourcesHeading: '来源 · {n} 个',
  table: Object.freeze({ source: '来源', state: '状态与处理建议' }),
  none: '尚无来源。',
  row: Object.freeze({
    address: '{kind} · {address}',
    count: '{state} · {n} 条',
    streakNoHttp: '{state} · 连续 {n} 次运行',
    lastOk: '上次成功抓取：{when}',
  }),


  // 定时 (F47)
  run: Object.freeze({
    heading: '定时',
    daily: '每天',
    at: '自动运行',
    timeLabel: '每天自动运行的时刻',
    save: '保存',
    saved: '已保存。',
    timeBad: '时刻需在 00:00 到 23:59 之间。',
    next: '下次运行：{when}。',
    off: '未开启定时运行。',
    rule: '需保持流息运行（窗口或托盘）；错过的运行将在下次启动时补上一次，不累加。',
    failed: '未能读取定时设置。',
    // 1.1.1 P11a (A10): how often; and the line when the schedule is not what the card's 「节奏」 says
    often: '多久一次',
    weekdayLabel: '每周哪几天',
    weekdayNone: '每周至少选一天。',
    monthDayLabel: '每月几号',
    monthDayBad: '每月的日子需在 1 到 28 号之间。',
    mismatch: '建库卡上的节奏是「{rhythm}」，按它应当是{want}；现在的定时是{now}。',
    toRhythm: '按节奏设',
    toRhythmDone: '已按节奏设好。',
  }),

  advancedLink: '高级设置：变更记录 · 库文件夹',
})

// 高级设置 (P15, F51–F55): two folds — 变更记录, 库文件夹
export const ADVANCED = Object.freeze({
  back: '返回来源与要求',
  eyebrow: '高级设置 / ADVANCED',
  heading: '高级设置',
  lead: '通常无需修改。此处包含设置的变更记录和库文件夹。',
  changes: '变更记录',
  changesHint: '该库各项设置的修改时间与操作来源',
  folder: '库文件夹',

  // 变更记录 (F54; the setup's record folded in, F55)
  log: Object.freeze({
    time: '时间',
    what: '变更内容',
    by: '操作来源',
    bys: Object.freeze({ you: '手动修改', 'agent-confirmed': '主 Agent 提议 · 已确认', setup: '初始设置' }),
    none: '尚无变更记录。',
    failed: '未能读取变更记录。',
    skipped: '另有 {n} 行记录无法读取，已跳过。',
    fields: Object.freeze({
      name: '库名称：{before} → {after}',
      nameNew: '库名称：{after}',
      brief: '追踪要求：{after}',
      briefNone: '追踪要求：已清空',
      schedule: '定时：{before} → {after}',
      scheduleNew: '定时：{after}',
      scheduleOn: '{when} {time}',
      scheduleOff: '关闭',
      sourcesAdded: '来源：添加 {names}',
      sourcesRemoved: '来源：删除 {names}',
      sourcesPaused: '来源：暂停 {names}',
      sourcesResumed: '来源：恢复 {names}',
      sourcesChanged: '来源：修改 {names}',
      sourcesSet: '来源：{n} 个',
      topicsAdded: '主题：添加「{names}」',
      topicsRemoved: '主题：删除「{names}」',
      topicsKeywords: '主题：修改「{names}」的关键词',
      topicsSet: '主题：{n} 个',
      other: '{field}：已修改',
      join: '、',
      sep: '；',
    }),
    fieldNames: Object.freeze({ name: '库名称', brief: '追踪要求', sources: '来源', topics: '主题', schedule: '定时' }),
    setup: '创建库 · {step}：{by}',
  }),

  // 库文件夹 (F55)
  library: Object.freeze({
    reveal: '在资源管理器中显示',
    revealFailed: '未能打开该文件夹。',
    rebuild: '重建索引',
    rebuilding: '正在重建……',
    rebuilt: '索引 {count} 条 · 缺少文件头 {tidy} 个',
    rebuildFailed: '未能重建索引。',
    remove: '移除该库',
    removeHint: '移除后，该库不再显示在「我的库」中，也不再定时运行；文件夹及其中的文件不会被删除。',
  }),

  // 移除该库 (P21)
  removeDialog: Object.freeze({
    title: '移除「{name}」？',
    text: '仅取消登记：该库将不再显示在「我的库」中，也不再定时运行。',
    kept: '文件夹及其中的文件不会被删除。',
    restore: '文件夹仍在原处。',
    confirm: '移除',
    cancel: '取消',
    close: '关闭',
    failed: '未能移除，请重试。',
  }),
})
