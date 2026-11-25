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
    waiting: '已等待 {n} 天',
    unverified: '未通过核验',
    // 11-18 (proposal D2): a news aggregator's item (Google News): its body cannot be read, it was judged on its title
    titleOnly: '只有标题',
    titleOnlyHint: '该来源仅提供标题，概述据标题生成。请打开原文核实。',
    // v2 package H: the material had 「写给 AI 的话」; hovering shows what was found
    aiInstruction: '检测到面向 AI 的指令，已忽略',
    aiInstructionHint: '命中的原句：{phrases}',
    aiInstructionPhrase: '「{phrase}」',
    aiInstructionNoPhrase: '命中的原句见右栏「详情」中的核验记录。',
    // 1.1 W6a (A3, A4): the item's original — kept (its opening under the summary, each point's place in it) or not
    saved: '原文已存',
    published: '发布 {date}',
    pointLink: '原文第 {n} 段 · 查看原句',
    opening: '原文开头',
    openingMeta: '{method} · {when} 保存',
    openStored: '打开保存的原文',
    openWeb: '原网页',
    missing: '原文未保存',
    missingNote: '无法读取此网页（{why}），未生成摘要。点击标题可打开原网页。',
    missingWhy: Object.freeze({ login: '需要登录', check: '网站要求人机验证', blocked: '网站拒绝自动访问', dead: '地址已失效', failed: '网站暂时无法访问', 'no-article': '无法提取正文' }),
    // 1.1.1 P9 (B24): a site of 来源授权's list, no contact filled in
    needsContact: '该网站要求提供联系邮箱。请在设置中填写。',
    needsContactGo: '前往设置填写',
    summaryMissing: '未生成摘要',
    summaryMissingNote: '原文已保存，但本次未生成摘要。可打开保存的原文查看。',
    methods: Object.freeze({ direct: '直接获取', render: '渲染后获取', pdf: 'PDF 提取' }),
  }),

  // N03: 放弃 takes effect at once; the bar under the list (a reason is optional; 撤销 brings it back)
  bar: Object.freeze({
    text: '已放弃「{title}」。可选择原因：',
    label: '放弃原因',
    quick: Object.freeze({ marketing: '营销内容', irrelevant: '不相关', shallow: '内容过浅', duplicate: '重复' }),
    other: '其他原因…',
    otherPlaceholder: '输入原因',
    otherSave: '保存原因',
    undo: '撤销',
    close: '关闭',
  }),

  // F27
  // 1.1.1 P8 (A12): 快到期 — the items whose deadline is today or within 30 days, in 待看 and kept, at the top of the page
  due: Object.freeze({
    title: '快到期',
    count: '{n} 条',
    note: '到期日在 30 天内的条目（含待看和已收藏）；到期前 7 天和前 1 天各提醒一次。',
    today: '今天到期',
    tomorrow: '明天到期',
    days: '还有 {n} 天到期',
    date: '{m} 月 {d} 日',
    inbox: '在待看',
    kept: '已收藏',
    line: '{when}（{date}）',
  }),

  later: Object.freeze({
    title: '稍后处理',
    count: '{n} 条（下次运行后重新进入待看）',
    line: '{source} · {date}',
  }),



  // N10 · F18: 待看 empty
  empty: Object.freeze({
    title: '暂无待看内容',
    next: '下次运行：{when}。',
    nextNone: '未开启定时运行。',
    recent: '最近收藏',
    recentNone: '暂无收藏。',
    recentLine: '{source} · {when} 收藏',
  }),

  // P07: a run of this library in progress
  // 1.1 W6a (B12): the last update did not start, the connection's login ran out
  banner: Object.freeze({
    loginExpired: '连接的登录已过期，此库本次未更新；已取回的原文均已保留。请在设置中重新登录后再运行。',
    toSettings: '前往设置',
  }),
  running: Object.freeze({
    title: '本次运行尚未完成',
    note: '运行完成后，新挑出的内容将显示在这里。运行期间可关闭窗口，任务会在后台继续。',
  }),
})

// 1.1.1 P11b (A13): 待看's top — what the last update did, and what the update agent left for the card (its 「卡上哪里不够用」)
export const UPDATE_NOTE = Object.freeze({
  line: '上次更新 {when}：读取 {read} 个来源{bad}，新增 {n} 条',
  bad: '（{n} 个无法读取）',
  nothingNew: '上次更新 {when}：来源没有新链接，未调用更新 Agent',
  failed: '上次更新（{when}）未完成',
  notes: '改卡建议',
  notesN: '{n} 条',
  more: '查看全部 {n} 条',
  hide: '收起',
  toCard: '交给主 Agent',
})
