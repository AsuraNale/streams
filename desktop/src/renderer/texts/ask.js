// 问库 (screens/ask.js, mockup S10): the question, the answer with a numbered source after each sentence, what the check
// took out, 「库里没有」 as a real answer, 「记到想补的主题」, 「这个回答哪里不对」, and the right panel (what was used, the
// topics you want more of). The connection's name: texts/common.js CONNECTIONS.names.

export const ASK = Object.freeze({
  title: '只用库里的东西回答',
  scope: '范围：已收藏 {kept} 条 · 我写的 {authored} 条',
  empty: '问一句库里的东西。答案的每句话后面带编号，点编号看是哪一条。',
  inputLabel: '问库里的东西',
  inputPlaceholder: '问库里的东西…',
  send: '发送',
  asking: '正在查库……',
  you: '你问',
  tooLong: '一次最多 500 个字。',
  busy: '上一个问题还在查，等它答完再问。',
  failed: '这次没问成：{reason}',
  failedOther: '这次没问成，可以再问一次。',

  answer: Object.freeze({
    citeLabel: '出处 {n}',
    sources: '出处',
    open: '打开',
    removedCites: '有 {n} 处出处不在库里，已删掉。',
    removedSentences: '有 {n} 句没有出处，已删掉。',
    notInLibrary: '库里没有。',
    notInLibraryText: '库里的条目回答不了这个问题，所以没有编答案。',
    missing: '库里缺的是：{missing}',
    unverified: '核对没有全过：{n} 项',
  }),

  demand: Object.freeze({
    add: '记到想补的主题',
    label: '想补的主题',
    added: '已记下：{topic}',
    failed: '没能记下，主题不能空。',
  }),

  feedback: Object.freeze({
    open: '这个回答哪里不对',
    label: '哪里不对（会记下来，用来调问库的要求）',
    placeholder: '写一句',
    send: '提交',
    cancel: '取消',
    sent: '收到了，记下来了。',
    failed: '没能记下，写一句再提交。',
  }),

  // the right panel
  panel: Object.freeze({
    used: '这次用了什么',
    how: '先按主题和关键词从库里挑出最多 9 条候选，把它们的正文给模型，模型只能引用这些条。',
    hits: '命中 {candidates} 条 · 用了 {used} 条',
    calls: '调用 {n} 次 · {name}',
    callsNoName: '调用 {n} 次',
    noTools: '没给模型任何工具，不联网',
    check: '核对：{rounds} 轮 · {passed}',
    checkPassed: '全过',
    checkFailed: '没全过',
    none: '问一句之后，这里写这次查了几条、用了几条、调用了几次。',
    demands: '想补的主题（{n}）',
    demandsNone: '还没有记下的主题。',
    demandLine: '{topic} · 问过 {n} 次',
    suggest: '建议加成主题',
    demandsHint: '问过 3 次以上的会建议你加成主题。',
  }),
})
