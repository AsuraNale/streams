// One kind of 提议 in words — redesign R5a (01 概念表「提议」, F14–F17; 05-措辞规范 统一用词 · 规则 2 / 9; 维护者 11-11 的动作表、
// 11-12 第 6 条). A source's state is named with the five states' words as the page has them now (common.js FETCH_STATES:
// 地址有问题 · 暂时失败 · 被拒绝; R6 changes those words, not this package). The main process hands the page the keys of these words (services/agent.mjs listToConfirm: each
// action's `label`, a 系统检测's kind and evidence, the status of a handled one, why one expired); R5b draws the card with them.

export const PROPOSALS = Object.freeze({
  // where a proposal comes from (05 第 79–80 行)
  from: Object.freeze({ agent: '主 Agent 提议', system: '系统检测' }),
  // the buttons (the 动作表, the words on them; 修改地址 has no ellipsis: it opens the place to edit, 05 规则 9)
  actions: Object.freeze({
    confirm: '确认',
    create: '创建',
    revise: '提出修改',
    decline: '拒绝',
    pauseSource: '暂停该来源',
    editAddress: '修改地址',
    setStrictness: '将严格程度调整为「{level}」',
    forward: '交由主 Agent 分析',
    draftProposal: '生成修改提议',
    dismiss: '忽略',
  }),
  // under a button that calls the main agent (the others are done by Streams' own code, no model call)
  callsModel: '由主 Agent 处理，将消耗模型调用',
  noModel: '由流息直接执行，不调用模型',
  // the five 系统检测
  kinds: Object.freeze({
    'source-failing-gap': '来源「{subject}」连续 {n} 次地址有问题',
    'source-failing': '来源「{subject}」连续 {n} 次抓取失败',
    'no-output': '连续 {n} 次运行没有新内容进入待看',
    'ai-instruction': '来源「{subject}」的内容中检测到面向 AI 的指令',
    'topic-overlap': '与「{other}」的主题重合 {pct}%',
    'dismiss-reason': '最近 {n} 次放弃均选择「{reason}」',
  }),
  evidence: Object.freeze({
    'source-failing': '暂时失败 {failed} 次 · 被拒绝 {blocked} 次 · 最近一次 {when}',
    'source-failing-gap': '地址有问题 {n} 次 · 最近一次 {when}',
    'no-output': '自 {when} 起',
    'ai-instruction': '{n} 条内容 · 例如「{phrase}」',
    'topic-overlap': '共同的词：{shared}',
    'dismiss-reason': '自 {when} 起',
  }),
  // what became of one
  statuses: Object.freeze({
    pending: '待确认',
    open: '待确认',
    confirmed: '已确认',
    declined: '已拒绝',
    revise: '已提出修改',
    stale: '设置已变更，该提议已失效',
    failed: '未能执行，已撤回',
    dismissed: '已忽略',
    accepted: '已转交主 Agent',
    acted: '已执行',
    expired: '已失效',
  }),
  // why a 系统检测 expired (core staleReason)
  expired: Object.freeze({
    'source-removed': '该来源已移除',
    'source-paused': '该来源已暂停',
    'source-changed': '该来源的地址已修改',
    'strictness-changed': '严格程度已调整',
    'library-removed': '对方库已移除',
    'overlap-gone': '主题已不再重合',
    'brief-changed': '追踪要求已修改',
    // precheck fix 7: rule ① found the other case (地址有问题 ↔ 暂时失败 / 被拒绝): this one gave way to the one that fits now
    'state-changed': '该来源的情况已变化，已换成新的提议',
  }),
  // a 主 Agent 提议 that could not be carried out: what to do (public-data.mjs FAILURE_ADVICE)
  advice: Object.freeze({
    failureRefused: '设置与提议不符，未作修改。可提出修改，或拒绝该提议。',
    failureError: '执行中出现错误，已撤回。可稍后重试；详细信息见「复制诊断信息」。',
  }),
  // 重新评分 (N07)
  rescore: Object.freeze({
    old: '按旧标准评分',
    line: '{n} 条按旧标准评分 · 重新评分（预计 {lo}–{hi} 次模型调用）',
    since: '评分标准修改于 {when}',
  }),
})
