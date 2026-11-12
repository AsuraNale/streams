// v2 package L (docs/checks/2026-11-10-wp-l/contract.md; design draft docs/design/next/themes/ README 第三、四节): the right
// panel of the main window — its four tabs 进度 · 待确认 · 详情 · 文件 (screens/right-panel.js) — and the queue's words where
// a library's place in it shows (redesign R1, F23): the library head's run button, the sidebar's line, 库架's cards.
// Placeholders: {name}, filled by fmt (lib/format.js).

export const PANEL = Object.freeze({
  label: '右栏',
  tabsLabel: '右栏标签',
  fold: '收起右栏',
  unfold: '展开右栏',
  tabs: Object.freeze({ progress: '进度', decide: '待确认', detail: '详情', files: '文件' }),
  decideBadge: '{n} 项待确认',

  // 进度: every library — the round that runs, the queue in order, each library's next timed slot (redesign R1: the template's
  // panel-summary, phase-row, mini-chart and activity-row; the words of 05-措辞规范)
  progress: Object.freeze({
    eyebrow: '运行进度 / 全部库',
    summary: '{running} 个运行中 · {waiting} 个排队中',
    idle: '当前无运行任务',
    rule: '同一时间仅运行一个库，其余按顺序自动执行。',
    queueSize: '队列中有 {n} 个库',
    asOf: '截至 {hm}',
    running: '{name} · 运行中',
    started: '{when} 开始',
    phase: '当前步骤：{phase}',
    calls: '模型调用',
    callsValue: '{calls} / {cap}',
    callsNoCap: '{calls}',
    order: '队列顺序',
    orderNone: '队列中没有库。',
    here: '当前库',
    runningLine: '运行中 · {why}',
    waitingLine: '{why} · {since} 加入队列',
    after: '「{name}」完成后自动开始',
    next: '下次运行时间',
    nextNone: '没有开启定时运行的库。',
    loadFailed: '未能读取运行队列。',
    unknownLibrary: '（未登记的库）',
    // redesign R2 (P07 · P16): the run that runs, the queue, the rule, the current library's last run
    runningTitle: '{name} · 运行中',
    runningDetail: '{why} · {when} 开始 · 当前步骤：{phase}',
    stop: '停止',
    stopping: '正在停止',
    waitingDetail: '{why} · {since} 加入队列 · 前一任务完成后自动开始',
    keepRunning: '需保持流息运行（窗口或托盘）。错过的运行将在下次启动时补上一次。',
  }),

  // 待确认 (维护者 11-11 第 13 题: was 「等你决定」): every library's proposals waiting and system findings not handled (the same
  // list as the tab's number); the current library's findings can be handled right here
  decide: Object.freeze({
    eyebrow: '待确认 / 全部库',
    title: '{n} 项',
    none: '暂无待确认事项。',
    lead: '以下事项均需确认后才会执行。',
    proposal: '主 Agent 提议',
    suggestion: '系统检测',
    newLibrary: '新库',
    whereChat: '在「主 Agent」中处理',
    whereLibrary: '在「{name}」中处理',
    thisLibrary: '当前库 · 系统检测',
    // redesign R3 (P13 · P16): a proposal is decided here as in the conversation (the same card: confirmProposal · …)
    confirm: '确认',
    create: '创建',
    revise: '提出修改',
    decline: '拒绝',
    failed: '操作未成功，请重试。',
  }),

  // 详情: follows the main area
  detail: Object.freeze({
    eyebrow: '详情 · {where}',
    where: Object.freeze({
      inbox: '待看 · 选中的这一条',
      // redesign R3 (07-模板版 「资料库」 「问库」 「图谱」 详情): the template's words
      library: '当前笔记',
      ask: '当前回答',
      graph: '当前节点',
      chat: '主 Agent · 本次对话',
    }),
    // the other screens: one sentence
    none: '当前页面未选中任何内容。在待看、资料库、问库或主 Agent 中选中一项，这里显示它的详情。',
    // redesign R2 (P05 · P16 详情, F30): the current card — 推荐理由, 核验, 核验记录 (folded; what the record dialog had), 来源
    inbox: Object.freeze({
      eyebrow: '当前条目',
      empty: '暂无待看内容。',
      scores: '推荐理由',
      scoresNone: '这一条没有评分（未连接模型时只抓取不评分）。',
      score: '{name} {score}',
      check: '核验',
      passed: '核验通过',
      failed: '未通过核验',
      unchecked: '未核验',
      aiYes: '检测到面向 AI 的指令，已忽略',
      aiNo: '未检测到面向 AI 的指令',
      record: '核验记录',
      recordParts: '（{parts}）',
      recordPart: '{name} {n} 项',
      recordNone: '（暂无记录）',
      source: '来源',
      sourceLine: '{source} · 发布 {date} · 首次抓取 {when}',
      sourceLineNoSeen: '{source} · 发布 {date}',
      reasons: '最近的放弃原因',
      reasonsNone: '暂无填写了原因的放弃。',
      reasonLine: '{when} · {reason}',
    }),
    ask: Object.freeze({
      cites: '{n} 篇笔记',
      citesNone: '还没有问过，或这一问的回答没有引用笔记。',
      hint: '点一篇，在资料库标签里打开。',
    }),
    chat: Object.freeze({
      title: '它查过的东西与提的卡',
      looked: '查过的（{n}）',
      lookedNone: '这一轮没有查东西。',
      cards: '提的卡（{n}）',
      cardsNone: '这一轮没有提卡。',
      none: '还没有对话。',
      cardState: Object.freeze({ pending: '等你确认', confirmed: '已确认', declined: '不要了', revise: '要改一下', stale: '过时了', failed: '没做成' }),
      see: '看这张卡',
    }),
  }),

  // 文件: the current library as a structure told to a person, not the folder as it is
  files: Object.freeze({
    eyebrow: '文件 / 库的文件结构',
    lead: '按主题列出该库的笔记。点击一篇在资料库中阅读；右键或「更多」可在 Obsidian 中打开。',
    reveal: '在资源管理器中显示',
    notes: '笔记（{n}）',
    notesHint: '按主题分组',
    other: '其它',
    notesNone: '还没有笔记。',
    untopiced: '未分主题',
    topic: '{topic}（{n}）',
    inbox: '待看（{n}）',
    inboxHint: '尚未生成文件 · 点击前往待看',
    requirements: '该库的来源与要求',
    requirementsHint: '{sources} 个来源 · {topics} 个主题 · 点击前往「来源与要求」修改',
    records: '程序记录（无需修改）',
    recordsHint: '流息内部使用的文件',
    recordsText: '流息的内部记录：抓取记录、待看与缓存。无需打开，也请勿手动修改。',
    expand: '展开',
    collapse: '收起',
    more: '更多',
    moreLabel: '该笔记',
    obsidian: '在 Obsidian 中打开',
    folder: '在资源管理器中显示',
    noLibrary: '请先在左栏「我的库」中选择一个库，这里显示它的文件结构。',
    failed: '未能打开。',
    loadFailed: '未能读取该库的文件结构。',
  }),
})

// the queue (v2 package L; redesign R1, N06 · F23): one round at a time; 立即运行 while another library runs or waits puts this
// one at the end. Its place shows in three places only: the library's head button, its line in the sidebar, the panel's 进度.
export const QUEUE = Object.freeze({
  // why a library runs / waits (getQueue's `why`), as a line of the panel's list
  // redesign R2 (O7): the four reasons, said as they are
  why: Object.freeze({ first: '建库后的第一轮', manual: '手动触发', schedule: '定时', 'catch-up': '补跑' }),
  // a library's place (the sidebar's line, 库架's card, the panel)
  running: '运行中',
  runningPhase: '运行中 · {phase}',
  queued: '排队中 · 第 {n} 位',
})
