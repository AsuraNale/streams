// 待看 (screens/inbox.js, mockup S3): the cards waiting for a decision, the keys, the dismiss dialog, the panel
// with the recent reasons. The scores' names: texts/common.js NODE_NAMES.

export const INBOX = Object.freeze({
  title: '待看',
  subtitle: '按分数排',
  count: '{n} 条',
  keys: 'JK 上下 · C 收藏 · D 放弃 · L 稍后',
  empty: '没有等你看的条目。',
  loadFailed: '没能读出待看的条目。',

  card: Object.freeze({
    label: '待看的条目',
    what: '这是什么：',
    meta: '{source} · {date}',
    score: '{name} {score}',
    freshness: Object.freeze({ new: '新', followup: '后续', duplicate: '重复' }),
    waiting: '等了 {n} 天',
    unverified: '未通过核验',
    // a round without a connection: the item came in unscored, with the source's own excerpt
    scoreless: '没有打分',
    excerpt: '来源自带的摘要：',
    scorelessNote: '这一轮没有连接模型，所以没打分、没写摘要。在设置里连上之后，新抓到的条目会打分。',
    maybeDuplicate: '可能和一条见过的重复',
    open: '打开原文',
    keep: '收藏',
    dismiss: '放弃…',
    later: '稍后',
    record: '这一条的记录',
    failed: '没有成功，可以再试一次。',
  }),

  dialog: Object.freeze({
    title: '放弃这一条',
    why: '为什么放弃（会存进记录，也会显示在相关度要求旁）',
    placeholder: '写一句理由',
    confirm: '放弃并下一条',
    cancel: '取消',
  }),

  panel: Object.freeze({
    title: '最近的放弃理由',
    none: '还没有放弃过。',
    line: '{when} · {reason}',
    ask: '把这些理由告诉打分要求？',
    adjust: '去调提示词',
  }),
})
