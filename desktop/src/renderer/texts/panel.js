// v2 package L (docs/checks/2026-11-10-wp-l/contract.md; design draft docs/design/next/themes/ README 第三、四节): the right
// panel of the main window — its four tabs 进度 · 等你决定 · 详情 · 文件 (screens/right-panel.js) — and the queue's words where
// a library's place in it shows: the run dialog, 概览's banner and button, 库架's cards, the sidebar's library lines.
// Placeholders: {name}, filled by fmt (lib/format.js).

export const PANEL = Object.freeze({
  label: '右栏',
  tabsLabel: '右栏标签',
  fold: '收起右栏',
  unfold: '展开右栏',
  tabs: Object.freeze({ progress: '进度', decide: '等你决定', detail: '详情', files: '文件' }),
  decideBadge: '{n} 件等你定',

  // 进度: every library — the round that runs, the queue in order, each library's next timed slot
  progress: Object.freeze({
    eyebrow: '所有库 · 现在 {hm}',
    summary: '{running} 个在跑 · {waiting} 个排队',
    idle: '现在没有在跑的',
    rule: '一次只跑一个库；排队的按先后自动接着跑。',
    running: '{name} · 在跑',
    started: '{when} 开始',
    phase: '到了：{phase}',
    calls: '调用',
    callsValue: '{calls} / 上限 {cap}',
    callsNoCap: '{calls}',
    order: '排队的先后',
    orderNone: '没有排队的库。',
    here: '这个库',
    runningLine: '在跑 · {why}',
    waitingLine: '{why} · {since}排上的',
    after: '排在「{name}」后面 · 它跑完自动接着跑',
    next: '下次定时',
    nextNone: '没有开着定时的库。',
    loadFailed: '没能读出排队。',
    unknownLibrary: '（不在登记里的库）',
  }),

  // 等你决定: every library's proposal cards waiting and suggestion cards not handled (the sidebar's badge counts the same)
  decide: Object.freeze({
    eyebrow: '所有库 · 等你决定',
    title: '{n} 件等你定',
    none: '没有等你定的事。',
    lead: '提议卡要你确认才生效；建议卡只是建议，按钮由你点。',
    proposal: '提议卡',
    suggestion: '建议卡',
    newLibrary: '新库',
    whereChat: '在「和主 Agent 聊」里 · 点了去那里',
    whereLibrary: '在「{name}」的概览 · 点了去那里',
  }),

  // 详情: follows the main area
  detail: Object.freeze({
    eyebrow: '详情 · {where}',
    where: Object.freeze({
      inbox: '待看 · 选中的这一条',
      library: '资料库 · 这一篇',
      ask: '问库 · 答案引用的笔记',
      chat: '和主 Agent 聊 · 这一轮',
    }),
    // the other screens: one sentence
    none: '这一页没有选中的东西。在待看、资料库、问库、和主 Agent 聊里，这里显示选中的那一条的细节。',
    inbox: Object.freeze({
      empty: '待看里没有条目。',
      scores: '每道关的分数与理由',
      scoresNone: '这一条没有打分（没有连接时只抓不打分）。',
      check: '核验',
      passed: '核验通过',
      failed: '未通过核验',
      unchecked: '没有核验',
      aiYes: '这一条里有写给 AI 的话，已忽略',
      aiNo: '没有写给 AI 的话',
      source: '来源',
      sourceLine: '{source} · {date}',
      record: '这一条的记录',
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
    eyebrow: '文件 · 这个库是怎么组织的',
    lead: '讲给人听的结构，不是原样的文件夹。点一篇在资料库里读；右键或「更多」可以用 Obsidian 打开。',
    reveal: '在资源管理器中显示',
    notes: '笔记（{n}）',
    notesHint: '按主题分组',
    notesNone: '还没有笔记。',
    untopiced: '未分主题',
    topic: '{topic}（{n}）',
    inbox: '待看（{n}）',
    inboxHint: '还没成文件 · 点了去待看',
    requirements: '这个库的要求与来源',
    requirementsHint: '{sources} 个来源 · {topics} 个主题 · 点了去「来源与要求」改，改动有「谁定的」记录',
    records: '程序记录（不用动）',
    recordsHint: '流息自己用的文件',
    recordsText: '流息自己记的东西：抓取记录、待看、缓存。不用打开，也别手改。',
    expand: '展开',
    collapse: '收起',
    more: '更多',
    moreLabel: '这一篇',
    obsidian: '用 Obsidian 打开',
    folder: '在资源管理器中显示',
    noLibrary: '先选一个库。在左栏「我的库」里点一个，这里显示它是怎么组织的。',
    failed: '没能打开。',
    loadFailed: '没能读出这个库的结构。',
  }),
})

// the queue (v2 package L, feedback #1): one round at a time; 开始 while another library runs or waits puts this one at the end
export const QUEUE = Object.freeze({
  // why a library waits / runs (getQueue's `why`), as 「它在…」
  doing: Object.freeze({ schedule: '跑定时的一轮', 'catch-up': '补跑错过的那一轮', manual: '跑一轮' }),
  // the same, as a line of the panel's list
  why: Object.freeze({ schedule: '定时的一轮', 'catch-up': '补跑错过的那一轮', manual: '你点的「开始」' }),
  // the second line of a library in the sidebar, on 库架's card, in 概览's head
  running: '在跑',
  queued: '排队中 · 第 {n} 位',
  // 概览's button while this library runs or waits
  runningButton: '正在跑',
  queuedButton: '已排上',
  banner: Object.freeze({
    title: '排队中 · 第 {n} 位',
    text: '前面是「{name}」：它在{doing}。它跑完，这个库自动接着跑，不用再点「开始」。',
    textNoName: '轮到了会自动开始，不用再点「开始」。',
    see: '看进度',
  }),
  // the run dialog after 开始
  dialog: Object.freeze({
    queued: '「{name}」正在{doing}；这个库排在第 {n} 位，轮到了会自动开始。',
    queuedNoName: '这个库排在第 {n} 位，轮到了会自动开始。',
    running: '这个库正在跑，不用再点「开始」。',
    before: '前面',
    beforeValue: '{name} · {phase} · 调用 {calls}',
    beforeCap: '{name} · {phase} · 调用 {calls} / {cap}',
    here: '这个库',
    hereValue: '排在第 {n} 位 · 不用再点「开始」',
    ok: '知道了',
    see: '看进度',
  }),
})
