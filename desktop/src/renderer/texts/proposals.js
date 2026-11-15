// One kind of 提议 in words — redesign R5a (01 概念表「提议」, F14–F17; 05-措辞规范 统一用词 · 规则 2 / 9; 维护者 11-11 的动作表、
// 11-12 第 6 条). A source's state is named with the five states' words as the page has them now (common.js FETCH_STATES:
// 地址无效 · 暂时失败 · 访问被拒 — redesign R6b-1 changed those words here too). The main process hands the page the keys of these words (services/agent.mjs listToConfirm: each
// action's `label`, a 系统检测's kind and evidence, the status of a handled one, why one expired).
// Redesign R5b (docs/checks/2026-11-12-r5b/contract.md R5b-1, R5b-3): the one card (screens/proposal.js) — its title by kind
// (动作 + 对象), its points (decision-points), its states, the right panel's list (待确认) — is drawn with these words. The
// card never shows a threshold's number (严格程度 is the level's name and one sentence), a kind's name or a raw error.

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
  // under a button that calls the main agent (the others are done by Streams' own code, no model call); {lo}–{hi} and {max}:
  // one message of the main agent, the same words as the 主 Agent page's line (screens/proposal.js AGENT_CALLS, 05 规则 8;
  // redesign R5b precheck fix 3: the most too, not only the usual)
  callsModel: '由主 Agent 处理，通常 {lo}–{hi} 次模型调用，需要重试或整理对话记录时最多 {max} 次模型调用',
  callsModelOf: '「{action}」由主 Agent 处理，通常 {lo}–{hi} 次模型调用，需要重试或整理对话记录时最多 {max} 次模型调用',
  noModel: '由流息直接执行，不调用模型',
  // the five 系统检测
  kinds: Object.freeze({
    'source-failing-gap': '来源「{subject}」连续 {n} 次地址无效',
    'source-failing': '来源「{subject}」连续 {n} 次抓取失败',
    'no-output': '连续 {n} 次运行没有新内容进入待看',
    'ai-instruction': '来源「{subject}」的内容中检测到面向 AI 的指令',
    'topic-overlap': '与「{other}」的主题重合 {pct}%',
    'dismiss-reason': '最近 {n} 次放弃均选择「{reason}」',
    other: '系统检测到一项需要确认的事项',
  }),
  // redesign R5b precheck fix 8: a time stands after a colon (「最近一次：今天 09:33」), never spliced into a sentence with spaces
  // round it (was 「自 今天 09:33 起」)
  evidence: Object.freeze({
    'source-failing': '暂时失败 {failed} 次 · 访问被拒 {blocked} 次 · 最近一次：{when}',
    'source-failing-gap': '地址无效 {n} 次 · 最近一次：{when}',
    'no-output': '首次出现：{when}',
    'ai-instruction': '{n} 条内容 · 例如「{phrase}」',
    'topic-overlap': '共同的词：{shared}',
    'dismiss-reason': '首次出现：{when}',
    // redesign R5b: the lines of the small card when a value is missing
    'ai-instruction-plain': '{n} 条内容 · 流息已忽略该指令，未执行，设置未被更改',
    'dismiss-reason-plain': '是否将其写入该库的追踪要求？主 Agent 将生成修改提议供确认。',
    none: '尚无记录',
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
    // precheck fix 7: rule ① found the other case (地址无效 ↔ 暂时失败 / 访问被拒): this one gave way to the one that fits now
    'state-changed': '该来源的情况已变化，已换成新的提议',
  }),
  // a 主 Agent 提议 that could not be carried out: what to do (public-data.mjs FAILURE_ADVICE)
  advice: Object.freeze({
    failureRefused: '设置与提议不符，未作修改。可提出修改，或拒绝该提议。',
    failureError: '执行中出现错误，已撤回。可稍后重试；详细信息见「复制诊断信息」。',
    // redesign R5b: an error whose steps could not all be undone (failure.rolledBack false) — the advice does not say 已撤回
    failureNotRolledBack: '执行中出现错误，部分修改可能未撤回，请在「来源与要求」中核对；详细信息见「复制诊断信息」。',
  }),
  // 重新评分 (N07)
  rescore: Object.freeze({
    old: '按旧标准评分',
    line: '{n} 条按旧标准评分 · 重新评分（预计 {lo}–{hi} 次模型调用）',
    since: '评分标准修改于 {when}',
  }),

  // ---- redesign R5b: the card (screens/proposal.js) ------------------------------------------------------------------
  card: Object.freeze({
    // the full card's line under its title (05 第 79 行)
    sub: '主 Agent 提议 · 确认后生效',
    // the small card's line on top: where from · which library
    eyebrow: '{from} · {library}',
    newLibrary: '新库',
    unknownLibrary: '未登记的库',
    // 动作 + 对象
    titles: Object.freeze({
      create_library: '创建库：{name}',
      add_source: '添加来源：{name}',
      remove_source: '移除来源：{name}',
      pause_source: '暂停来源：{name}',
      resume_source: '恢复来源：{name}',
      edit_topics: '修改主题',
      edit_brief: '修改追踪要求',
      edit_thresholds: '修改严格程度',
      edit_schedule: '修改定时运行',
      edit_cap: '修改单次运行上限',
      run_round: '立即运行',
      other: '修改库设置',
    }),
    // the numbered points (decision-points)
    points: Object.freeze({
      brief: '追踪要求',
      strictness: '严格程度',
      topicsSources: '主题与来源',
      scheduleCap: '定时与上限',
      before: '修改前',
      after: '修改后',
      trial: '测试抓取',
    }),
    // 严格程度: the level's name and one sentence (R4a's three levels; never the numbers)
    levelNames: Object.freeze({ loose: '宽松', standard: '标准', strict: '严格', custom: '自定义' }),
    levels: Object.freeze({
      loose: '宽松（收录更多，相关度要求较低）',
      standard: '标准（相关度与实质均达到中等要求即通过）',
      strict: '严格（仅收录高度相关的内容）',
    }),
    // 自定义 (precheck fix 1): a main agent's proposal was edited by no one, so the card says where the pair stands against the
    // three levels, judged on both thresholds (screens/proposal.js customText; lib/strictness.js placeOf) — never a number
    customLevel: '自定义 · {where}',
    customWhere: Object.freeze({
      between: '介于{lo}与{hi}之间',
      above: '比{level}更严',
      below: '比{level}更宽',
      apart: '相关度与实质一项严于三档、一项宽于三档',
    }),
    // 修改前 and 修改后 that read the same (自定义 to 自定义): which requirement changed, no number
    delta: Object.freeze({
      sep: '；',
      line: '与修改前相比，{parts}',
      join: '，',
      stricter: '{name}要求更严',
      looser: '{name}要求更宽',
      names: Object.freeze({ relevance: '相关度', substance: '实质' }),
    }),
    briefNone: '尚未填写追踪要求',
    topicsNone: '暂无主题',
    sourcesNone: '暂无来源',
    keywordsNone: '暂无关键词',
    topicsLine: '主题：{topics}',
    sourcesLine: '来源 {n} 个：{names}',
    pausedMark: '（已暂停）',
    trialChip: '{state} · {n} 条',
    unticked: '不添加',
    scheduleOn: '每天 {time} 自动运行',
    scheduleOff: '未开启定时运行',
    capLine: '单次运行最多 {n} 次模型调用',
    capDefault: '单次运行上限按默认值',
    runBefore: '上次运行：{when}',
    runNever: '尚未运行',
    runAfter: '加入运行队列 · 单次运行最多 {n} 次模型调用',
    folder: '存储位置：{path}',
    recorded: '确认后记入变更记录',
    // the small card's one line
    createSummary: '{sources} 个来源 · {topics} 个主题 · {schedule}',
    changedSummary: '修改后：{after}',
    runSummary: '加入运行队列',
    // 提出修改: one line to write in, then it goes to the main agent's conversation
    reviseLabel: '修改意见（发送后由主 Agent 重新生成提议）',
    revisePlaceholder: '例如：不添加该来源，改为其他来源',
    reviseSend: '发送',
    reviseCancel: '取消',
    reviseEmpty: '请填写修改意见。',
    working: '正在处理…',
    callFailed: '操作未成功，请重试。',
    noConnection: '尚未选择连接方式，主 Agent 无法处理。',
    forwardFailed: '未能交由主 Agent 处理：{reason}。可稍后重试。',
    gone: '设置已变更，该提议已失效。',
    // a proposal that left the list without being confirmed or declined (it no longer fits, it could not be carried out)
    saidLine: '「{title}」：{state}',
    notQueued: '首次运行未能加入队列，可在该库页头点击「立即运行」',
  }),
  // a decided one in the conversation: one line (R5b-1)
  states: Object.freeze({
    confirmed: '已生效 · {when}',
    declined: '已拒绝',
    revise: '已提出修改',
    stale: '设置已变更，该提议已失效',
    staleGone: '该库已移除，该提议已失效',
    staleFolder: '存储位置已有文件，该提议已失效',
    failed: '未能执行',
    dismissed: '已忽略',
    accepted: '已转交主 Agent',
    acted: '已生效 · {when}',
    expired: '设置已变更，该提议已失效',
  }),
  // the right panel's 待确认 (P16): every library's, one list
  list: Object.freeze({
    eyebrow: '全部库 · 待确认',
    title: '{n} 项',
    none: '暂无待确认事项。',
    lead: '以下事项均需确认后才会执行。',
    loadFailed: '未能读取待确认事项。',
  }),
  // the 主 Agent page's head (P03): the number of the list, a click opens the right panel's 待确认
  chip: '{n} 项待确认',
})
