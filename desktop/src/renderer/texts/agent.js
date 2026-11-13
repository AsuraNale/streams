// 主 Agent (screens/chat.js) — redesign R5b (docs/checks/2026-11-12-r5b/contract.md R5b-2; design 03-页面稿 P03, 07-模板版
// streams/app.js 「主 Agent」; 05-措辞规范): the page on the template's conversation parts. The proposals in the conversation are
// the one card of screens/proposal.js (words: texts/proposals.js PROPOSALS); 「等你定的事」 and the suggestion card of v2
// package G are gone (F15: what waits is the right panel's 待确认). 维护者 11-05: the main Agent is given no standing permission —
// no card has a switch that does a kind of change by itself from then on. Placeholders: {name}, filled by fmt (lib/format.js).

export const AGENT = Object.freeze({
  name: '主 Agent',
  // the speaker's small line (P03 · 07 streams/app.js speaker('主 Agent', '管理全部库'))
  role: '管理全部库',

  chat: Object.freeze({
    // redesign R1 (05-措辞规范): the page's name is 「主 Agent」 (was 「和主 Agent 聊」)
    title: '主 Agent',
    subtitle: '创建库、调整库设置、查询各库情况。所有改动均以提议形式提交，确认后生效。',
    // the first words of the conversation (the start of the record: nothing earlier)
    intro: '主 Agent 管理全部库：创建库、调整库设置、查询各库情况。所有改动均以提议形式提交，确认后由流息执行。',
    // the date line on top of each day of the conversation
    dateLine: '主 Agent · {day}',
    inputLabel: '向主 Agent 描述需求',
    placeholder: '向主 Agent 描述需求：创建库、调整设置、查询各库情况',
    who: '主 Agent',
    newline: 'Shift + Enter 换行',
    // the line under the box (05 规则 8): usually one call for the answer and one more for each round of lookups (core
    // agent/turn.mjs: at most MAX_LOOKUP_ROUNDS rounds); redesign R5b precheck fix 3: more when an answer is retried, a session
    // is opened again or the conversation is summarized — at most {max} (core TURN_CALLS; screens/proposal.js AGENT_CALLS)
    calls: '每条消息通常 {lo}–{hi} 次模型调用；回答需要重试或整理对话记录时会更多，最多 {max} 次模型调用',
    send: '发送',
    thinking: '主 Agent 在想…',
    tooLong: '每条消息最多 4000 个字。',
    failed: '消息未能发送，请重试。',
    busy: '主 Agent 正在回复上一条消息，请稍候再发送。',
    loadMore: '加载更早的对话',
    loadingMore: '正在加载…',
    loadFailed: '未能读取对话记录。',
    retry: '重试',
    fromLibrary: '转自「{name}」的问库',
  }),

  // v2 package I: 首次打开's second step — above the conversation while the app knows no library. An example fills the input
  // (it is not sent); 「手动创建」 opens 新建库 (the manual way)
  guide: Object.freeze({
    title: '你想追踪什么内容？',
    text: '向主 Agent 描述想持续追踪的内容，主 Agent 会生成建库提议：主题、来源与严格程度，确认后才会创建。',
    examplesLabel: '可参考以下说法（点击后填入输入框，修改后再发送）：',
    examples: Object.freeze([
      '帮我建个库，追踪中国电动车行业，重点是整车销量、电池和充电。',
      '我想跟踪 AI agent 的新工具和评测，不要营销稿。',
      '帮我盯着几家中国时尚上市公司的财报和新品。',
    ]),
    manual: '手动创建',
    manualHint: '在一页表单里填写追踪要求、来源和存储位置，不经过主 Agent',
    noConnection: '尚未连接模型，主 Agent 暂不可用。',
    goSettings: '前往设置',
  }),

  // the lines of the record that are not words of yours or of the main Agent: one faint line each, never their text
  rows: Object.freeze({
    lookup: Object.freeze({
      library: '已查询：{name} 的概况',
      source_log: '已查询：{name} 的来源「{source}」的抓取记录',
      proposals: '已查询：各库的提议',
      proposalsOf: '已查询：{name} 的提议',
      suggestions: '已查询：各库的系统检测',
      suggestionsOf: '已查询：{name} 的系统检测',
      notes_search: '已查询：{name} 已收藏内容的标题',
      other: '已查询',
    }),
    note: '已记录一条备注',
    handed: '流息已将一项系统检测交由主 Agent 分析',
    summary: '较早的对话已压缩为摘要',
    unknownLibrary: '一个库',
  }),

  // what came with a turn (agentSend's notice) — the interface's words, never the connection's own text (O9)
  notices: Object.freeze({
    'not-understood': '未能读取模型的回答。',
    'proposals-dropped': '有 {n} 项提议未能生成。',
    'session-rebuilt': '会话已中断，已从对话记录恢复。',
    connection: '本条消息未获回答：{reason}',
    connectionOther: '本条消息未获回答：连接出现问题',
  }),
})
