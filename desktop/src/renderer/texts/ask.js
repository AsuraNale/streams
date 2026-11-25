// 问库 (screens/ask.js; redesign R3: design 03-页面稿 P13, 07-模板版 「问库」, F41–F44, the words of 05-措辞规范): the line on top
// (仅基于库内内容回答 · 范围 · 不联网), the conversation (each answer's sentences with their cite numbers, the notes cited, 库内缺少 +
// 加入待补充主题 → 已加入待补充主题, 反馈回答问题), the box with its line of calls (1.1 W7b: 问库 answers; a change of the library
// goes through its card, 来源与要求's 「改建库卡」), and the right panel's 详情 (引用了 n 篇笔记 · 本次回答依据 · 待补充主题).
// 「库内暂无相关内容。」 is V9's own sentence (redesign R6a: 维护者 11-11 第 16 题 and 第 1 条 — it was 「库里没有。」; tests/acceptance/
// v09-ask-citations.test.mjs reads it off the real window).
// The connection's name: texts/common.js CONNECTIONS.names.

export const ASK = Object.freeze({
  title: '仅基于库内内容回答',
  scope: '范围：已收藏 {kept} 条 · 我的笔记 {authored} 条 · 不联网',
  // 1.1.1 P11a / P11b (场景五①): always under the box — 问库 reads only what was kept; and 待看's items not kept, when there are
  reads: '问库只看你收藏的 {n} 条。',
  readsInbox: '待看里还有 {n} 条没收藏。',
  empty: '提问后，回答的每句话都会标注引用编号，点击编号查看出自哪篇笔记。',
  inputLabel: '向该库提问',
  inputPlaceholder: '向该库提问',
  // the box's line (P13): what a question costs
  inputHint: '每次提问约 {n} 次模型调用',
  callsRange: '{lo}–{hi}',
  who: '问库',
  newline: 'Shift + Enter 换行',
  send: '发送',
  asking: '正在检索库内内容…',
  speaker: '问库',
  speakerRole: '库内问答',
  tooLong: '每次提问最多 500 字。',
  busy: '上一个问题仍在处理，请在回答完成后再提问。',
  failed: '本次提问未完成：{reason}',
  failedOther: '本次提问未完成，请重试。',


  answer: Object.freeze({
    citeLabel: '引用 {n}',
    sources: '引用的笔记',
    sourceLine: '{n}  {title}',
    open: '打开',
    original: '查看原文',
    removedCites: '有 {n} 处引用不在库内，已删除。',
    removedSentences: '有 {n} 句未标注引用，已删除。',
    notInLibrary: '库内暂无相关内容。',
    notInLibraryText: '库内笔记中没有可回答该问题的内容，未生成回答。',
    missing: '库内缺少：{missing}',
  }),

  // 加入待补充主题 → 已加入待补充主题 (F42; it stays so when the page is opened again: getDemands' `added`)
  demand: Object.freeze({
    add: '加入待补充主题',
    added: '已加入待补充主题',
    label: '待补充的主题',
    failed: '未能记录，请填写主题。',
  }),

  feedback: Object.freeze({
    open: '反馈回答问题',
    label: '回答存在的问题（将被记录，用于改进问库）',
    placeholder: '请描述问题',
    send: '提交',
    cancel: '取消',
    sent: '已记录，感谢反馈。',
    failed: '未能记录，请填写内容后重新提交。',
  }),

  // the right panel's 详情 of the latest answer
  panel: Object.freeze({
    eyebrow: '当前回答',
    cites: '引用了 {n} 篇笔记',
    citesNone: '尚未提问',
    basis: '本次回答依据',
    basisLine: '命中 {candidates} 条 · 引用 {used} 条 · 模型调用 {calls} 次 · {check} · 模型未获得任何工具权限，未联网',
    check: '核验 {rounds} 轮{passed}',
    checkPassed: '均通过',
    checkFailed: '未全部通过',
    checkNone: '未核验',
    none: '提问后，这里显示本次回答引用的笔记与回答依据。',
    demands: '待补充主题（{n}）',
    demandsNone: '暂无待补充主题。',
    demandLine: '已提问 {n} 次',
    suggest: '建议添加为主题',
    demandsHint: '提问达 3 次的内容将建议添加为主题。',
  }),
})
