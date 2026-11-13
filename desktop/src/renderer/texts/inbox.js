// 待看 (screens/inbox.js) — redesign R2 (design 03-页面稿 P05–P08, 07-模板版; words of 05-措辞规范): the list head, the cards,
// the bar after 放弃, 稍后处理, 未通过筛选, 待评分 and 添加链接, the empty page (the last run, screens/run-funnel.js), the run in
// progress (screens/run-steps.js), the right panel's 详情 of the current card. The scores' names: texts/common.js NODE_NAMES.

export const INBOX = Object.freeze({
  title: '待看',
  count: '待看 · {n} 条',
  sorted: '按评分排序',
  keys: 'J / K 切换 · C 收藏 · D 放弃 · L 稍后处理',
  addLink: '添加链接',
  loadFailed: '未能读取待看内容。',
  failed: '操作未成功，请重试。',

  card: Object.freeze({
    label: '待看条目',
    // one line under the title: 来源 · 日期 · 相关度 0.90 · 实质 0.85 · 新 / 后续
    meta: '{source} · {date}',
    score: '{name} {score}',
    freshness: Object.freeze({ new: '新', followup: '后续', duplicate: '重复' }),
    what: '内容概述：',
    excerpt: '来源自带的摘要：',
    keep: '收藏',
    dismiss: '放弃',
    later: '稍后处理',
    waiting: '等了 {n} 天',
    unverified: '未通过核验',
    // a run without a connection: the item came in without a score
    scoreless: '没有打分',
    scorelessNote: '本次运行未连接模型，未评分、未生成摘要。在设置中连接后，新抓取的内容将会评分。',
    maybeDuplicate: '可能重复',
    // N02: moved in by the user from 未通过筛选
    moved: '未通过筛选 · 手动移入',
    movedNote: '这一条未通过筛选，由你手动移入待看：没有生成摘要，也没有核验。',
    // v2 package H: the material had 「写给 AI 的话」; hovering shows what was found
    aiInstruction: '检测到面向 AI 的指令，已忽略',
    aiInstructionHint: '命中的原句：{phrases}',
    aiInstructionPhrase: '「{phrase}」',
    aiInstructionNoPhrase: '命中的原句见右栏「详情」中的核验记录。',
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

  // N02
  rejected: Object.freeze({
    title: '未通过筛选',
    count: '{n} 条（不会入库）',
    shown: '仅列出最新的 {n} 条。',
    below: '未通过{name} {score}',
    move: '移入待看',
    none: '暂无未通过筛选的内容。',
    // redesign R5b (N07, P05): the items judged under the old 评分标准 (getInbox().rescore, core rescoreInfo): which part changed
    // and when, how many, and 重新评分 with the core's estimate (05 规则 8)
    old: '按旧标准评分',
    changed: Object.freeze({ brief: '追踪要求', thresholds: '严格程度', prompts: '评分环节', other: '评分标准' }),
    alert: '{what}已于 {when} 更新，以下 {n} 条按旧标准评分。',
    alertNoTime: '{what}已更新，以下 {n} 条按旧标准评分。',
    rescore: '重新评分（预计 {calls} 次模型调用）',
    calls: '{lo}–{hi}',
    rescoring: '重新评分中…',
    queued: '已加入队列 · 第 {n} 位',
    rescoreFailed: '未能开始重新评分，请重试。',
    rescoreNoConnection: '尚未选择连接方式，无法重新评分。',
  }),

  // N09 · F50
  manual: Object.freeze({
    tag: '待评分',
    note: '手动添加 · 将在下次运行时评分',
  }),
  link: Object.freeze({
    title: '添加链接',
    urlLabel: '网址',
    urlPlaceholder: 'https://…',
    titleLabel: '标题（选填）',
    confirm: '添加',
    cancel: '取消',
    bad: '请输入以 http:// 或 https:// 开头的网址。',
    seen: '这个网址已在该库中，未重复添加。',
    added: '已添加，将在下次运行时评分。',
  }),

  // N10 · F18: 待看 empty
  empty: Object.freeze({
    title: '暂无待看内容',
    next: '下次运行：{when}。',
    nextNone: '未开启定时运行。',
    caughtTitle: '有 {n} 条内容已抓取、尚未评分',
    caughtNote: '重试后将继续处理。',
    recent: '最近收藏',
    recentNone: '暂无收藏。',
    recentLine: '{source} · {when}收藏',
  }),

  // P07: a run of this library in progress
  running: Object.freeze({
    title: '本次运行尚未完成',
    note: '运行完成后，通过筛选的内容将显示在这里。运行期间可关闭窗口，任务会在后台继续。',
  }),
})
