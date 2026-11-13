// 问库 (screens/ask.js; redesign R3: design 03-页面稿 P13, 07-模板版 「问库」, F41–F44, the words of 05-措辞规范): the line on top
// (仅基于库内内容回答 · 范围 · 不联网), the conversation (each answer's sentences with their cite numbers, the notes cited, 库内缺少 +
// 记到想补的主题 → 已加入待补充主题, 反馈回答问题), a sentence that asks to change the library 「已转交主 Agent」 with the main Agent's
// proposal, the box with its line of calls, and the right panel's 详情 (引用了 n 篇笔记 · 本次回答依据 · 待补充主题).
// 「库内暂无相关内容。」 is V9's own sentence (redesign R6a: 维护者 11-11 第 16 题 and 第 1 条 — it was 「库里没有。」; tests/acceptance/
// v09-ask-citations.test.mjs reads it off the real window).
// The connection's name: texts/common.js CONNECTIONS.names.

export const ASK = Object.freeze({
  title: '仅基于库内内容回答',
  scope: '范围：已收藏 {kept} 条 · 我的笔记 {authored} 条 · 不联网',
  empty: '提问后，回答的每句话都会标注引用编号，点击编号查看出自哪篇笔记。如需调整该库的来源、主题或要求，也可以直接在这里描述。',
  inputLabel: '提问，或描述希望对该库做出的调整',
  inputPlaceholder: '提问，或描述希望对该库做出的调整',
  // the box's line (P13): what a question costs, and that a change can be asked for here
  inputHint: '每次提问约 {n} 次模型调用 · 如需调整来源、主题或要求，可直接描述',
  callsRange: '{lo}–{hi}',
  who: '问库',
  newline: 'Shift + Enter 换行',
  send: '发送',
  asking: '正在检索库内内容…',
  speaker: '问库',
  speakerRole: '库内问答',
  tooLong: '每次最多 500 个字。',
  busy: '上一个问题仍在处理，请在回答完成后再提问。',
  failed: '本次提问未完成：{reason}',
  failedOther: '本次提问未完成，请重试。',

  // a sentence is routed first (sendLibraryMessage) — a question is answered here, a change goes to the main Agent, which
  // answers with a proposal; when the routing cannot tell, you choose
  route: Object.freeze({
    agent: '主 Agent',
    routed: '已转交主 Agent',
    handing: '正在转交主 Agent…',
    unsure: '这句话是要修改该库吗？',
    yes: '是，修改该库',
    no: '否，作为提问',
  }),

  answer: Object.freeze({
    citeLabel: '引用 {n}',
    sources: '引用的笔记',
    sourceLine: '{n}  {title}',
    open: '打开',
    original: '查看原文',
    removedCites: '有 {n} 处引用不在库内，已删除。',
    removedSentences: '有 {n} 句没有引用，已删除。',
    notInLibrary: '库内暂无相关内容。',
    notInLibraryText: '库内的笔记无法回答这个问题，因此没有生成回答。',
    missing: '库内缺少：{missing}',
  }),

  // 记到想补的主题 → 已加入待补充主题 (F42; it stays so when the page is opened again: getDemands' `added`)
  demand: Object.freeze({
    add: '记到想补的主题',
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
    failed: '未能记录，请填写内容后再提交。',
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
