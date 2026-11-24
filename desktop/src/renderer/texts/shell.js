// The v2 shell (package F; docs/design/v2/streams-v2-design.html 导航, P1, P3, P7, P9): the sidebar of plan B (库架 · 和主
// Agent 聊 · 我的库 · 新建库 · 设置), the shelf, a library's page (its head, the five tabs, the list / graph switch), 「新建库」
// (1.1 W7b: 主 Agent is the build conversation, texts/build.js), 「谁定的」, 「要求」 and this library's schedule on 来源与要求,
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
    emptyText: '暂无库。向主 Agent 描述想追踪的内容，它会写一张建库卡给你确认。',
    emptyChat: '由主 Agent 生成',
    emptyManual: '手动创建',
    loadFailed: '未能读取库列表。',
    // 1.1.1 P11a (A11): each card's 「更多」
    more: Object.freeze({ button: '更多', label: '这座库的更多操作', reveal: '在资源管理器中显示', scheduleOff: '关掉定时', scheduleOn: '打开定时', remove: '移除该库', failed: '未能完成，请重试。' }),
  }),

  // 1.1 W13: 「打开已有的库」 on the shelf (its toolbar and its empty state) and on 首次打开 (lib/open-existing.js)
  openExisting: Object.freeze({
    button: '打开已有的库',
    notLibrary: '这个文件夹不是流息的库。请选建库时的那个文件夹（里面有 notes 文件夹）。',
    failed: '未能打开这个库。',
  }),




  // who changed a setting is 高级设置's 变更记录 (texts/sources.js ADVANCED.log)


  // redesign R4b: 「这个库」 (thisLibrary), 来源与要求's v2 words (sources) and 设置's 定时一览 / 用量 (settings) went with their
  // parts: texts/sources.js and texts/settings.js have the new pages' words
})
