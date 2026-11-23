// 待看 (screens/inbox.js) — redesign R2 (design 03-页面稿 P05–P08, 07-模板版; words of 05-措辞规范): the list head, the cards,
// the bar after 放弃, 稍后处理, the empty page (the last run: texts/run.js), the run in progress (screens/run-steps.js), the right
// panel's 详情 of the current card.

export const INBOX = Object.freeze({
  title: '待看',
  count: '待看 · {n} 条',
  sorted: '新的在前',
  keys: 'J / K 切换 · C 收藏 · D 放弃 · L 稍后处理',
  loadFailed: '未能读取待看内容。',
  failed: '操作未成功，请重试。',

  card: Object.freeze({
    label: '待看条目',
    // one line under the title: 来源 · 日期
    meta: '{source} · {date}',
    what: '内容概述：',
    keep: '收藏',
    dismiss: '放弃',
    later: '稍后处理',
    waiting: '等了 {n} 天',
    unverified: '未通过核验',
    // 11-18 (proposal D2): a news aggregator's item (Google News): its body cannot be read, it was judged on its title
    titleOnly: '只有标题',
    titleOnlyHint: '这个来源只给标题，读不到正文：概述只依据标题。请打开原文核对。',
    // v2 package H: the material had 「写给 AI 的话」; hovering shows what was found
    aiInstruction: '检测到面向 AI 的指令，已忽略',
    aiInstructionHint: '命中的原句：{phrases}',
    aiInstructionPhrase: '「{phrase}」',
    aiInstructionNoPhrase: '命中的原句见右栏「详情」中的核验记录。',
    // 1.1 W6a (A3, A4): the item's original — kept (its opening under the summary, each point's place in it) or not
    saved: '原文已存',
    published: '发布 {date}',
    pointLink: '原文第 {n} 段 · 看原话',
    opening: '原文开头',
    openingMeta: '{method} · {when} 存下',
    openStored: '打开存下的原文',
    openWeb: '原网页',
    missing: '原文没存下来',
    missingNote: '流息未读到这个网页（{why}），因此没有摘要。可点标题查看原网页，或放弃。',
    missingWhy: Object.freeze({ login: '要登录才能看', check: '网站要人机验证', blocked: '网站不让程序读', dead: '地址已失效', failed: '网站暂时打不开', 'no-article': '读不出正文' }),
    summaryMissing: '摘要没写出来',
    summaryMissingNote: '原文已存，但本次未写出摘要。可打开存下的原文查看。',
    methods: Object.freeze({ direct: '直接取', render: '渲染后取', pdf: 'PDF 取字' }),
  }),

  // N03: 放弃 takes effect at once; the bar under the list (a reason is optional; 撤销 brings it back)
  bar: Object.freeze({
    text: '已放弃「{title}」。可选择原因：',
    label: '放弃原因',
    quick: Object.freeze({ marketing: '营销内容', irrelevant: '不相关', shallow: '内容过浅', duplicate: '重复' }),
    other: '其他原因…',
    otherPlaceholder: '写一句原因',
    otherSave: '保存原因',
    undo: '撤销',
    close: '关闭',
  }),

  // F27
  later: Object.freeze({
    title: '稍后处理',
    count: '{n} 条（下次运行后重新列入待看）',
    line: '{source} · {date}',
  }),



  // N10 · F18: 待看 empty
  empty: Object.freeze({
    title: '暂无待看内容',
    next: '下次运行：{when}。',
    nextNone: '未开启定时运行。',
    recent: '最近收藏',
    recentNone: '暂无收藏。',
    recentLine: '{source} · {when}收藏',
  }),

  // P07: a run of this library in progress
  // 1.1 W6a (B12): the last update did not start, the connection's login ran out
  banner: Object.freeze({
    loginExpired: '连接的登录已过期，这座库本次未更新；已取回的原文均已保留。请在设置中重新登录后再运行。',
    toSettings: '去设置',
  }),
  running: Object.freeze({
    title: '本次运行尚未完成',
    note: '运行完成后，新挑出的内容将显示在这里。运行期间可关闭窗口，任务会在后台继续。',
  }),
})
