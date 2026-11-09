// The v2 shell (package F; docs/design/v2/streams-v2-design.html 导航, P1, P3, P7, P9): the sidebar of plan B (库架 · 和主
// Agent 聊 · 我的库 · 新建库 · 设置), the shelf, a library's page (its head, the five tabs, the list / graph switch), the empty
// page of 和主 Agent 聊 (package G fills it), 「新建库」, 「谁定的」, 「要求」, 关卡 and this library's schedule on 来源与要求,
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

  chat: Object.freeze({
    title: '和主 Agent 聊',
    subtitle: '所有库的事都可以在这里说',
    waiting: '等你定的事：{n} 件',
    shell: '这一页还在做：下一步，主 Agent 会在这里和你聊，把要改库的提议放在这里等你确认。',
  }),

  // 「新建库」 (the sidebar, the shelf): v1.0's two ways — a new library in an empty folder, or a folder that already holds
  // one (or your own .md files)
  newLibrary: Object.freeze({
    title: '新建库',
    text: '选一个空文件夹新建一个库，或者打开一个已经有库（或你自己的 .md 笔记）的文件夹。建好后它会出现在「我的库」里。',
    name: '库名',
    namePlaceholder: '不填就用文件夹名',
    chooseEmpty: '选一个空文件夹新建',
    chooseExisting: '打开已有文件夹',
    chosen: '选的文件夹：{path}',
    importable: '这个文件夹里有 {n} 个 .md，流息会把它当库打开，不搬、不改你的文件。',
    importNow: '当库打开',
    other: '这个文件夹里有别的东西，换一个。',
    notEmpty: '新建库要一个空文件夹。',
    failed: '没能打开这个文件夹。',
    cancel: '取消',
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
    suggestions: '主 Agent 给这个库的建议',
    suggestionKinds: Object.freeze({
      'source-failing': '来源「{subject}」连续几轮没抓到',
      'no-output': '这个库连续几轮没有产出',
      'ai-instruction': '来源「{subject}」的文章里有写给 AI 的话',
      'topic-overlap': '和另一个库的主题重合很多',
    }),
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
