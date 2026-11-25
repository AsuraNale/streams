// 来源与要求 (screens/sources.js). Redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-1 / R4b-2 / R4b-3; design 03-页面稿 P14,
// P15, P21; the words of 05-措辞规范), 1.1 (W6a, W7b): a library's card and its sources, or — a library made by the last version —
// its notice, its 追踪要求 and its sources read only; 定时; a line to 高级设置 (变更记录, 库文件夹) with the template dialog of 移除该库.
// The five states' words: texts/common.js FETCH_STATES; what to do: FETCH_HINTS (V3's, as they are); the kinds: SOURCE_KINDS.
// Source names, addresses, search words, topic names, the brief and the library's name are the library's data.

export const SOURCES = Object.freeze({
  heading: '这个库追踪什么',
  lead: '通常只需在此页修改；不常用的设置位于底部的「高级设置」。',
  // 1.1 W6a (A5): a library with a card: the card, its sources (address or search word, state, 「原文」), a source added
  cardLead: '此库按建库卡更新。如需修改，请与主 Agent 对话；修改在你确认后生效。',
  card: Object.freeze({
    heading: '建库卡',
    version: '{when} 确认 · 第 {n} 版',
    lines: Object.freeze({ purpose: '用途', scope: '边界', exclude: '不要什么', trust: '可信度要求', rhythm: '节奏', language: '语言', hard: '硬条件' }),
    restNote: '收什么 · 不收什么 · 每次怎么挑 · 每条怎么写 · 样例：在「建库卡全文」里',
    full: '查看完整建库卡',
    fold: '收起',
    parts: Object.freeze({ collect: '收什么', skip: '不收什么', unreadable: '读不到的来源和原因', pick: '每次怎么挑', write: '每条怎么写', samples: '样例', decide: '要你定的事' }),
    change: '与主 Agent 继续对话',
    // 1.1.2 (U3): the card names how many items each update takes
    countLimit: '建库卡「每次怎么挑」中写有「{text}」，会限制每次进入待看的条数。每次的条数由「每次更新的量」决定；如需去掉这条限制，请与主 Agent 继续对话。',
  }),
  cardSources: Object.freeze({
    heading: '来源 · {n} 个',
    placeholder: '输入网址或检索词，按 Enter 添加',
    head: Object.freeze({ source: '来源', state: '状态', original: '原文' }),
    states: Object.freeze({ ok: '正常', never: '尚未读取', search: '检索词', failed: '暂时失败', blocked: '访问被拒', login: '要登录', check: '要人机验证', dead: '地址失效' }),
    originals: Object.freeze({ read: '读得到', pdf: 'PDF，已提取文字', link: '只有链接', search: '由更新 Agent 搜索', unknown: '尚不确定' }),
    searchWord: '检索词：{q}',
    unreadable: '卡上写明读不到',
    // 1.1.1 P1 (B19): what Streams got when it read the address itself, the day the card was handed in
    checked: '流息读取结果：{why}',
    checkedOk: '流息可读取',
    confirmLine: '加入建库卡：{what}',
    confirm: '确认',
    drop: '不添加',
    badInput: '无法添加：请输入以 http 或 https 开头的网址，或输入检索词。',
    exists: '建库卡中已有此来源。',
    failed: '添加失败，请重试。',
  }),
  // 1.1 W6a (A6): a library built by the last version
  old: Object.freeze({
    heading: '此库由旧版本创建',
    lead: '此库尚无建库卡：它按旧版本的追踪要求和来源创建，当前版本不再按原方式更新。',
    text: '笔记、资料库和问库均可正常使用。如需继续自动更新，请与主 Agent 重新核查来源：主 Agent 将以此库原有的追踪要求和来源为起点，生成建库卡；确认之前，库内不会有任何改动。',
    action: '重新核查来源',
    needsClaude: '需先在设置中选择可建库的连接（「{cc}」「{cx}」，或已填写模型 key 的「{api}」），才能重新核查。',
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
    timeBad: '时间需在 00:00 至 23:59 之间。',
    next: '下次运行：{when}。',
    off: '未开启定时运行。',
    rule: '需保持流息运行（窗口或托盘）；错过的运行将在下次启动时补运行一次，不累加。',
    failed: '未能读取定时设置。',
    // 1.1.1 P11a (A10): how often; and the line when the schedule is not what the card's 「节奏」 says
    often: '多久一次',
    weekdayLabel: '每周哪几天',
    weekdayNone: '每周至少选一天。',
    monthDayLabel: '每月几号',
    monthDayBad: '日期需在 1 至 28 号之间。',
    mismatch: '建库卡上的节奏为「{rhythm}」，对应{want}；当前定时为{now}。',
    toRhythm: '按建库卡设置定时',
    toRhythmDone: '已按建库卡设置定时。',
    toCard: '改建库卡上的节奏',
    rhythmAsk: '请把建库卡上的节奏改成与当前定时一致：{now}。',
  }),

  // 1.1.2 (第 4 件): 每次更新的量
  volume: Object.freeze({
    heading: '每次更新的量',
    cost: '量越大，单次更新耗时越长，消耗的套餐额度或 API 费用也越多。',
    names: Object.freeze({ standard: '标准', more: '较多', most: '最多' }),
    hints: Object.freeze({ standard: '约 {n} 条候选', more: '约 2 倍', most: '约 3 倍' }),
    near: '上次更新读网页 {reads} / {limit} 次，已接近上限，有 {n} 个来源未读取。',
    nearAll: '上次更新读网页 {reads} / {limit} 次，已接近上限。',
    nearNext: '调高一档可读取更多来源。',
    saved: '已保存，下次更新起生效。',
    failed: '未能保存，请重试。',
    loadFailed: '未能读取每次更新的量。',
  }),

  advancedLink: '高级设置：变更记录 · 库文件夹',
})

// 高级设置 (P15, F51–F55): two folds — 变更记录, 库文件夹
export const ADVANCED = Object.freeze({
  back: '返回来源与要求',
  heading: '高级设置',
  lead: '通常无需修改。包含设置的变更记录和库文件夹。',
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
      volume: '每次更新的量：{before} → {after}',
      other: '{field}：已修改',
      join: '、',
      sep: '；',
    }),
    fieldNames: Object.freeze({ name: '库名称', brief: '追踪要求', sources: '来源', topics: '主题', schedule: '定时', volume: '每次更新的量' }),
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
