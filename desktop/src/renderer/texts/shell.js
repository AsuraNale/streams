// The v2 shell (package F; docs/design/v2/streams-v2-design.html 导航, P1, P3, P7, P9): the sidebar of plan B (库架 · 和主
// Agent 聊 · 我的库 · 新建库 · 设置), the shelf, a library's page (its head, the five tabs, the list / graph switch), 「新建库」
// (和主 Agent 聊's words are package G's: texts/agent.js), 「谁定的」, 「要求」, 关卡 and this library's schedule on 来源与要求,
// the schedules and the month's use of every library on 设置. Placeholders: {name}, filled by fmt (lib/format.js).

export const SHELL = Object.freeze({
  // (its two entries and 设置: texts/common.js SIDEBAR)
  sidebar: Object.freeze({
    mine: '我的库',
    newLibrary: '新建库',
    // the amber dot after a library's name
    problem: '该库存在异常',
    inboxBadge: '{n} 条待看',
    // redesign R1 (F10): the line under a library's name — its place in the queue (texts/panel.js QUEUE), else its problem,
    // else its 待看, else this
    inboxLine: '{n} 条待看',
    idle: '暂无待看',
    problems: Object.freeze({
      missing: '文件夹无法读取',
      sources: '来源异常',
      'no-output': '连续 {n} 次运行无新内容',
    }),
    // v2 package M (kit/sidebar.js SidebarQuota): the corner above 设置 — the current connection's plan windows (Claude Code,
    // Codex) or its API balance; nothing at all when there is none. {span}: hours / days / minutes below; {when} of `window`:
    // `resets` (lib/format.js nextText); {when} of `asOf`: WHEN of texts/common.js
    quota: Object.freeze({
      label: '余量',
      // redesign R1 (05-措辞规范): 「套餐已用」 → 「套餐用量」 (the corner shows the used per cent)
      plan: '套餐用量',
      balance: 'API 余额',
      window: '{span} 已用 {pct}% · {when} 重置',
      resets: Object.freeze({ today: '{hm}', tomorrow: '明天 {hm}', date: '{m}-{d} {hm}' }),
      hours: '{n} 小时',
      days: '{n} 天',
      minutes: '{n} 分钟',
      amount: '{amount} {currency}',
      asOf: '截至 {when}',
      // v2 package K2: the corner drawn as the K1 draft has it — under each window's bar, when it resets
      resetsAt: '{when} 重置',
    }),
  }),

  // a library's page: its head and the four tabs (redesign R1, 维护者 11-11 第 1 题: 概览 is gone, a library opens on 待看)
  tabs: Object.freeze({
    label: '库内导航',
    inbox: '待看',
    library: '资料库',
    ask: '问库',
    sources: '来源与要求',
  }),
  head: Object.freeze({
    tracking: '追踪范围：{what}',
    trackingNone: '尚未填写追踪要求和主题',
    loadFailed: '未能读取该库。',
    // redesign R1 (N06): the head's run button is the state itself; the small line beside it
    run: Object.freeze({
      now: '立即运行',
      running: '运行中 · 停止',
      stopping: '正在停止',
      queued: '排队中 · 第 {n} 位',
      next: '下次运行 {when}',
      nextNone: '未开启定时运行',
      calls: '预计 {lo}–{hi} 次模型调用',
      callsOne: '预计 {n} 次模型调用',
      failed: '未能开始运行，请重试。',
      stopFailed: '未能停止运行，请重试。',
    }),
  }),
  // 资料库's two views
  view: Object.freeze({ label: '视图', list: '列表', graph: '图谱' }),

  // 库架 (redesign R1: the template's home-content and project-tile, design P23)
  shelf: Object.freeze({
    title: '库架',
    subtitle: '共 {n} 个库 · 各库按各自的定时运行',
    eyebrow: '我的库 / LIBRARIES',
    lead: '每天看新来的，存下值得的。',
    text: '每个库盯一组来源，按自己的定时运行。通过筛选的内容进入待看，由你决定是否收藏。',
    search: '搜索库',
    searchNone: '没有名称或追踪范围包含「{q}」的库。',
    newButton: '新建库',
    newCard: '新建库 · 由主 Agent 生成',
    inboxLabel: '条待看',
    inboxLine: '{n} 条待看',
    enter: '进入待看',
    updated: '上次运行 {when}',
    updatedNever: '尚未运行',
    sources: '{n} 个来源',
    fine: '来源正常',
    problems: Object.freeze({
      missing: '文件夹无法读取',
      sources: '来源异常',
      'no-output': '连续 {n} 次运行无新内容',
    }),
    emptyText: '暂无库。向主 Agent 描述想追踪的内容即可生成建库提议，也可以手动创建。',
    emptyChat: '由主 Agent 生成',
    emptyManual: '手动创建',
    loadFailed: '未能读取库列表。',
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

  // redesign R1: what 概览 had — the last run, its numbers, the sources' state — sits in the right panel's 进度 under this (until
  // R2 gives each its place)
  lastRun: Object.freeze({
    title: '当前库 · 上次运行',
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
