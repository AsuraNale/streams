// The interface's own words for what the main agent is told and shown (redesign R5a, N11; docs/core-api.md 5.15.9;
// docs/design/redesign/source/05-措辞规范.md 统一用词 「这样写」, 规则 2 / 6 / 8 / 9 / 10).
//
// UI_TERMS            the 统一用词 table's 「这样写」 column, [concept, Chinese, English] — the system prompt lists it
// NOT_IN_LIBRARY      redesign R6a (V9): 问库's answer when the library has nothing on the question, { zh, en } — the page's
//                     sentence word for word (desktop texts/ask.js, texts-en/ask.js; tests/acceptance v09 compares), in UI_TERMS too
// BUTTONS             the words on a proposal's buttons, { id: { zh, en } } (strictness: with the level, {level})
// STATE_WORDS         the five fetch states (and paused / never fetched) as the page says them now — the desktop's
//                     dictionaries' FETCH_STATES (R6 changes those words; until then these are the same: desktop test)
// ADVICE_WORDS        what to do about a state (the core's hint codes, fetch/states.mjs HINTS): the page's own sentences, word
//                     for word — the desktop's FETCH_HINTS (R6 rewrites them in both places; until then the same: desktop test)
// CONNECTION_WORDS    a connection's failure (core connect CONNECTION_CODES, and unknown) as the page says it — the desktop's
//                     CONNECTIONS.codes, word for word (desktop test)
// DROP_WORDS          why a proposal of the main agent could not be made (dropCategory), in words
// dropCategory(err)   → 'format' · 'no-change' · 'no-library' · 'exists' · 'source' · 'refused' · 'error': the kind of failure
//                     of a proposal that was not made (the thrower's code / reason), never its text
// droppedSentence(list, lang)  「有 N 张提议没能生成：添加来源 · 来源填写有误；…」 — the interface's name of each one's action and
//                     its kind of failure; no kind name, no code, no raw text
// connectionSentence(code, lang)  「连接出了问题：网络连不上，这条消息没有回答。」 — the page's words of the code
// LEVEL_WORDS         严格程度's three levels and 自定义 (the desktop's texts/sources.js levels)
// QUICK_WORDS         the 放弃 quick reasons (the core's DISMISS_QUICK; the desktop's texts/inbox.js quick)
// PROPOSAL_STATUS_WORDS  a proposal's status as the page says it
// PROPOSAL_KIND_WORDS the main agent's proposal kinds as the interface names them
// wordsOf(lang)       'en' → the English ones, else the Chinese ones: { states, advice, levels, quick, statuses, kinds, buttons }
// stateWord(status, lang) / adviceOf(status, lang)
// Nothing here is a raw error or an internal code: what the model gets is a state and what to do about it.
import { HINTS } from '../fetch/states.mjs';

/** Redesign R6a (V9): 问库's answer to a question the library has nothing on, as the page says it (zh · en). */
export const NOT_IN_LIBRARY = Object.freeze({ zh: '库内暂无相关内容。', en: 'Nothing in this library on that.' });

export const UI_TERMS = Object.freeze([
  ['one whole fetch → score → summary of a library', '运行（立即运行、运行中、上次运行、本次运行、单次运行上限）', 'run (Run now, running, last run, this run, per-run cap)'],
  ['the model giving an item a score', '评分（待评分、重新评分）', 'scoring (awaiting scoring, re-score)'],
  ['a score reaching what is asked', '通过（通过相关度、未通过筛选、通过阈值）', 'passed (passed relevance, filtered out, pass threshold)'],
  ['one step of the pipeline', '环节（评分环节）', 'step (scoring steps)'],
  ['changing something that exists', '修改（修改地址、修改前 / 修改后、提出修改）', 'edit (Edit address, before / after, Request changes)'],
  ['making something new', '创建（创建库、创建并运行、仅创建）', 'create (create a library, Create and run, Create only)'],
  ['putting something into a list', '添加（添加链接、添加主题）', 'add (Add a link, add a topic)'],
  ['taking it off a list, the files kept', '移除', 'remove'],
  ['deleting it for good', '删除', 'delete'],
  ['what the user has to agree to', '提议（主 Agent 提议、系统检测）', 'proposal (proposed by the main agent, detected by Streams)'],
  ['not agreeing to a proposal', '拒绝', 'decline'],
  ['not dealing with it now', '忽略 / 暂不处理 / 稍后处理', 'dismiss / not now / later'],
  ['who changed a setting', '操作来源（手动修改、主 Agent 提议 · 已确认、初始设置）', 'changed by (edited manually, proposed by the main agent · confirmed, initial setup)'],
  ['the history of a setting', '变更记录', 'change history'],
  ['instructions aimed at AI inside an article', '面向 AI 的指令', 'instructions aimed at AI'],
  ['what a library tracks, in the user\'s words', '追踪要求', 'brief'],
  ['the two pass thresholds of a library', '严格程度（宽松、标准、严格、自定义）', 'strictness (Loose, Standard, Strict, Custom)'],
  ['what passed and waits for the user', '待看', 'inbox (to review)'],
  ['the list of everything to agree to', '待确认', 'to confirm'],
  ['a library\'s sources and brief page', '来源与要求', 'sources and brief'],
  // redesign R6a (维护者 11-11 第 1 条, V9): what 问库 answers when the library has nothing on the question — the sentence on
  // the page (desktop texts/ask.js answer.notInLibrary, texts-en the English one), so the main agent says the same
  ['what 问库 says when the library has nothing on the question', NOT_IN_LIBRARY.zh, NOT_IN_LIBRARY.en],
]);

export const BUTTONS = Object.freeze({
  confirm: Object.freeze({ zh: '确认', en: 'Confirm' }),
  create: Object.freeze({ zh: '创建', en: 'Create' }),
  revise: Object.freeze({ zh: '提出修改', en: 'Request changes' }),
  decline: Object.freeze({ zh: '拒绝', en: 'Decline' }),
  pauseSource: Object.freeze({ zh: '暂停该来源', en: 'Pause this source' }),
  editAddress: Object.freeze({ zh: '修改地址', en: 'Edit address' }),
  forward: Object.freeze({ zh: '交由主 Agent 分析', en: 'Ask the main agent to review' }),
  draftProposal: Object.freeze({ zh: '生成修改提议', en: 'Draft a proposal' }),
  dismiss: Object.freeze({ zh: '忽略', en: 'Dismiss' }),
  setStrictness: Object.freeze({ zh: '将严格程度调整为「{level}」', en: 'Set strictness to "{level}"' }),
});

export const STATE_WORDS = Object.freeze({
  zh: Object.freeze({ ok: '正常', empty: '没新内容', gap: '地址有问题', failed: '暂时失败', blocked: '被拒绝', paused: '已暂停', never: '还没抓过' }),
  en: Object.freeze({ ok: 'OK', empty: 'Nothing new', gap: 'Address problem', failed: 'Failed for now', blocked: 'Blocked by the site', paused: 'Paused', never: 'Not fetched yet' }),
});

export const ADVICE_WORDS = Object.freeze({
  // precheck fix 10 (redesign R5a): the page's FETCH_HINTS as they are (texts/common.js, texts-en/common.js), so the model and
  // the page say the same thing; R6 rewrites these sentences (05 第三节 「五种抓取状态」) in both places at once
  zh: Object.freeze({
    none: '不需要你做什么。',
    'fix-address-or-remove': '这不是临时故障，重试没用：改地址，或删掉这个来源。',
    'retry-next-round': '下一轮会自动再试，不需要你改地址。',
    'blocked-remove-source': '对方不让程序抓，重试没用；换一个来源。',
  }),
  en: Object.freeze({
    none: 'Nothing for you to do.',
    'fix-address-or-remove': 'This is not a passing fault and retrying will not help: change the address, or remove this source.',
    'retry-next-round': 'It is tried again next round by itself; no need to change the address.',
    'blocked-remove-source': 'The site does not let programs read it, and retrying will not help; use another source.',
  }),
});

export const LEVEL_WORDS = Object.freeze({
  zh: Object.freeze({ loose: '宽松', standard: '标准', strict: '严格', custom: '自定义' }),
  en: Object.freeze({ loose: 'Loose', standard: 'Standard', strict: 'Strict', custom: 'Custom' }),
});

export const QUICK_WORDS = Object.freeze({
  zh: Object.freeze({ marketing: '营销内容', irrelevant: '不相关', shallow: '内容过浅', duplicate: '重复' }),
  en: Object.freeze({ marketing: 'Marketing', irrelevant: 'Not relevant', shallow: 'Too shallow', duplicate: 'Duplicate' }),
});

export const PROPOSAL_STATUS_WORDS = Object.freeze({
  zh: Object.freeze({ pending: '待确认', confirmed: '已确认', declined: '已拒绝', revise: '已提出修改', stale: '已失效（设置已变更）', failed: '未能执行（已撤回）' }),
  en: Object.freeze({ pending: 'to confirm', confirmed: 'confirmed', declined: 'declined', revise: 'changes requested', stale: 'no longer valid (the settings changed)', failed: 'could not be carried out (undone)' }),
});

export const PROPOSAL_KIND_WORDS = Object.freeze({
  zh: Object.freeze({
    create_library: '创建库', add_source: '添加来源', remove_source: '移除来源', pause_source: '暂停或恢复来源', edit_topics: '修改主题',
    edit_brief: '修改追踪要求', edit_thresholds: '修改严格程度', edit_schedule: '修改定时运行', edit_cap: '修改单次运行上限', run_round: '立即运行',
  }),
  en: Object.freeze({
    create_library: 'create a library', add_source: 'add a source', remove_source: 'remove a source', pause_source: 'pause or resume a source', edit_topics: 'edit topics',
    edit_brief: 'edit the brief', edit_thresholds: 'edit the strictness', edit_schedule: 'edit the schedule', edit_cap: 'edit the per-run cap', run_round: 'run now',
  }),
});

// precheck fix 2 (redesign R5a): the page's CONNECTIONS.codes, word for word
export const CONNECTION_WORDS = Object.freeze({
  zh: Object.freeze({
    'not-installed': '没有找到它', 'not-logged-in': '还没登录', 'login-expired': '登录过期了', 'bad-key': 'key 不对', 'bad-model': '型号不对',
    'rate-limited': '对方要求放慢', network: '网络连不上', timeout: '等太久没回应', 'bad-format': '回答的格式不对', refused: '被拒绝了', unknown: '出了没见过的错',
  }),
  en: Object.freeze({
    'not-installed': 'it was not found', 'not-logged-in': 'not signed in yet', 'login-expired': 'the sign-in has expired', 'bad-key': 'the key is wrong',
    'bad-model': 'the model name is wrong', 'rate-limited': 'the service asked to slow down', network: 'the network is unreachable', timeout: 'no answer in time',
    'bad-format': 'the answer was not in the expected form', refused: 'the request was declined', unknown: 'an unexpected error',
  }),
});

// precheck fix 2 (redesign R5a): why a proposal of the main agent was not made, by kind of failure
export const DROP_WORDS = Object.freeze({
  zh: Object.freeze({ format: '格式不对', 'no-change': '与现在的设置相同', 'no-library': '找不到这个库', exists: '已经有了', source: '来源填写有误', refused: '与库现在的设置不合', error: '出了没见过的错' }),
  en: Object.freeze({ format: 'wrong format', 'no-change': 'the same as the settings now', 'no-library': 'the library was not found', exists: 'it is there already', source: 'the source is not filled in right', refused: 'it does not fit the library as it is', error: 'an unexpected error' }),
});
export const DROP_CATEGORIES = Object.freeze(Object.keys(DROP_WORDS.zh));

const langOf = (lang) => (lang === 'en' ? 'en' : 'zh');

// the codes / reasons of a refusal (core proposals: bad-proposal and its reason, the REFUSED codes of the real functions)
const EXISTS = ['duplicate-source', 'duplicate-topic', 'exists'];
const REFUSED = ['bad-topic', 'not-found', 'bad-argument', 'bad-config', 'locked-node', 'not-pending'];

export function dropCategory(err) {
  const reason = typeof err?.reason === 'string' ? err.reason : null;
  const code = typeof err?.code === 'string' ? err.code : null;
  const r = reason ?? code;
  if (r === 'shape') return 'format';
  if (r === 'no-change') return 'no-change';
  if (r === 'unknown-library' || r === 'no-library') return 'no-library';
  if (EXISTS.includes(r)) return 'exists';
  if (r === 'bad-source') return 'source';
  if (REFUSED.includes(r)) return 'refused';
  if (code === 'bad-proposal') return 'format';
  return 'error';
}

export function droppedSentence(list, lang) {
  const l = langOf(lang);
  const items = Array.isArray(list) ? list : [];
  const n = items.length;
  // own keys only: a kind the model made up (even one named like a property of every object) is just 「一张提议」
  const own = (o, k) => (typeof k === 'string' && Object.hasOwn(o, k) ? o[k] : undefined);
  const what = (d) => `${own(PROPOSAL_KIND_WORDS[l], d?.kind) ?? (l === 'en' ? 'a proposal' : '一张提议')} · ${own(DROP_WORDS[l], d?.category) ?? DROP_WORDS[l].error}`;
  return l === 'en'
    ? `${n} proposal${n === 1 ? '' : 's'} could not be made: ${items.map(what).join('; ')}`
    : `有 ${n} 张提议没能生成：${items.map(what).join('；')}`;
}

export function connectionSentence(code, lang) {
  const l = langOf(lang);
  const why = typeof code === 'string' && Object.hasOwn(CONNECTION_WORDS[l], code) ? CONNECTION_WORDS[l][code] : CONNECTION_WORDS[l].unknown;
  return l === 'en' ? `The connection had a problem: ${why}; this message got no answer.` : `连接出了问题：${why}，这条消息没有回答。`;
}

export function wordsOf(lang) {
  const l = langOf(lang);
  return {
    states: STATE_WORDS[l], advice: ADVICE_WORDS[l], levels: LEVEL_WORDS[l], quick: QUICK_WORDS[l], statuses: PROPOSAL_STATUS_WORDS[l], kinds: PROPOSAL_KIND_WORDS[l],
    buttons: Object.fromEntries(Object.entries(BUTTONS).map(([k, v]) => [k, v[l]])),
  };
}

export function stateWord(status, lang) {
  return STATE_WORDS[langOf(lang)][status] ?? STATE_WORDS[langOf(lang)].never;
}

export function adviceOf(status, lang) {
  return ADVICE_WORDS[langOf(lang)][Object.hasOwn(HINTS, status) ? HINTS[status] : 'none'];
}
