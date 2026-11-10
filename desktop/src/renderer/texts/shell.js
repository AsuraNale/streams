// The v2 shell (package F; docs/design/v2/streams-v2-design.html 导航, P1, P3, P7, P9): the sidebar of plan B (库架 · 和主
// Agent 聊 · 我的库 · 新建库 · 设置), the shelf, a library's page (its head, the five tabs, the list / graph switch), 「新建库」
// (和主 Agent 聊's words are package G's: texts/agent.js), 「谁定的」, 「要求」, 关卡 and this library's schedule on 来源与要求,
// the schedules and the month's use of every library on 设置. Placeholders: {name}, filled by fmt (lib/format.js).

export const SHELL = Object.freeze({
  // (its two entries and 设置: texts/common.js SIDEBAR)
  sidebar: Object.freeze({
    // the badge after 和主 Agent 聊: the proposal cards waiting + the suggestion cards not handled
    chatBadge: '{n} 件等你定',
    mine: '我的库',
    newLibrary: '新建库',
    // the amber dot after a library's name
    problem: '这个库有问题',
    inboxBadge: '{n} 条待看',
    // v2 package M (kit/sidebar.js SidebarQuota): the corner above 设置 — the current connection's plan windows (Claude Code,
    // Codex) or its API balance; nothing at all when there is none. {span}: hours / days / minutes below; {when} of `window`:
    // `resets` (lib/format.js nextText); {when} of `asOf`: WHEN of texts/common.js
    quota: Object.freeze({
      label: '余量',
      plan: '套餐余量',
      balance: 'API 余额',
      window: '{span} 已用 {pct}% · {when} 重置',
      resets: Object.freeze({ today: '{hm}', tomorrow: '明天 {hm}', date: '{m}-{d} {hm}' }),
      hours: '{n} 小时',
      days: '{n} 天',
      minutes: '{n} 分钟',
      amount: '{amount} {currency}',
      asOf: '截至 {when}',
    }),
  }),

  // a library's page: its head and the five tabs (plan B; the same five can be the sidebar's entries in plan A)
  tabs: Object.freeze({
    label: '库内分区',
    overview: '概览',
    inbox: '待看',
    library: '资料库',
    ask: '问库',
    sources: '来源与要求',
  }),
  head: Object.freeze({
    tracking: '在追：{what}',
    trackingNone: '还没写要求，也还没有主题',
    loadFailed: '没能读出这个库。',
  }),
  // 资料库's two views
  view: Object.freeze({ label: '视图', list: '列表', graph: '图谱' }),

  shelf: Object.freeze({
    title: '库架',
    subtitle: '{n} 个库 · 每个库按自己的时间跑',
    newButton: '新建库',
    newCard: '新建库 · 和主 Agent 聊着建',
    inboxLabel: '条待看',
    updated: '上次更新 {when}',
    updatedNever: '还没跑过',
    sources: '{n} 个来源',
    fine: '来源都正常',
    problems: Object.freeze({
      missing: '文件夹不在，或读不出',
      sources: '来源出问题',
      'no-output': '连续 {n} 轮没有产出',
    }),
    emptyText: '还没有库。告诉主 Agent 你想追踪什么，它帮你建；也可以自己手动建一个。',
    emptyChat: '和主 Agent 聊',
    emptyManual: '手动新建',
    loadFailed: '没能读出库的列表。',
  }),


  // 「新建库」 (v2 package I: screens/new-library.js, the manual way — the sidebar, the shelf, 首次打开's 「也可以手动新建」): v1.0's
  // 首次设置 without its connection step — 库放在哪 → 主题与来源 → 试跑一轮 → 定时 (the steps' words: texts/first-run.js)
  newLibrary: Object.freeze({
    title: '新建库',
    cancel: '取消',
  }),

  // 「这个库」 at the foot of 来源与要求 (v2 package I: what 设置 had of the current library)
  thisLibrary: Object.freeze({
    title: '这个库',
    hint: '文件夹、索引、登记',
    folder: '文件夹',
    reveal: '在资源管理器中显示',
    revealFailed: '没能打开这个文件夹。',
    remove: '移除这个库',
    removeHint: '只从流息的库列表里去掉，文件夹和里面的文件都不动。',
    removeDialog: Object.freeze({
      title: '移除「{name}」？',
      text: '只去掉登记：它不再出现在「我的库」里，也不再定时跑；文件夹和里面的文件一个都不删。以后用「新建库」选这个文件夹，就能再打开它。',
      confirm: '移除',
      cancel: '取消',
    }),
  }),

  // 「谁定的」 beside each part of 来源与要求 (getWhoDecided)
  who: Object.freeze({
    label: '谁定的',
    you: '你改的 · {date}',
    agent: '主 Agent 提的 · 你确认的 · {date}',
    setup: '首次设置',
  }),

  overview: Object.freeze({
    title: '概览',
    run: '运行状态',
  }),

  // 来源与要求 (P7)
  sources: Object.freeze({
    title: '来源与要求',
    brief: '要求（一段话：追什么、不要什么）',
    briefNone: '还没写要求。写一段话，说清楚这个库追什么、不要什么。',
    briefEdit: '改要求',
    briefSave: '保存',
    briefCancel: '取消',
    briefSaved: '已保存。',
    briefBad: '要求要写 1–2000 个字。',
    briefFailed: '没能保存要求。',
    briefLabel: '这个库的要求',
    gates: '关卡',
    gatesHint: '每道关的要求和过关线；改完可以先试一条看结果，再保存',
    run: '定时与每轮上限',
    runHint: '只管这一个库',
    thresholds: '过关线',
  }),

  // 设置 (P9; v2: the schedule and the cap are each library's own, on its 来源与要求)
  settings: Object.freeze({
    schedules: '定时一览',
    schedulesHint: '每个库按自己的时间跑；点库名去它的「来源与要求」改',
    schedulesNone: '还没有库。',
    schedulesFailed: '没能读出这个库的定时。',
    library: '库',
    on: '每天',
    off: '关',
    next: '下次',
    usage: '全部库本月用量合计',
    usageHint: '所有库加起来，按月算',
    usageLine: '{calls} 次模型调用 · 输入 {input} · 输出 {output}',
    usageLibrary: '{name}：{calls} 次',
    usageMissing: '{name}：文件夹不在',
    usageFailed: '没能读出用量。',
  }),
})
