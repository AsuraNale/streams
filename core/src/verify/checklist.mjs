// The built-in checklist of a summary (product spec 4.11, core-api 4.3; 1.1 W3).
//
// A checklist item: { id, desc, kind: 'rule' | 'judge', rule?, origin: 'streams' }
//   rule  -> checked by code (rules.mjs), zero model calls
//   judge -> checked by one independent model call (judge.mjs)
//
// originalChecklist(language) -> the items a summary is checked by against the original kept in the library (B14)
// BANNED_WORDS                -> the internal terms no summary may use (V7)
// 1.1 W7b: v1.0's checklists of the scoring steps (lockChecklist, gateBaseline, summaryBaseline, describeChecklist) left
// core/src with the scoring pipeline (core/legacy/verify/checklist.mjs).

// The same word list as wording/'s hard list, kept here so the core has no dependency on it (V7).
export const BANNED_WORDS = ['Bronze', 'Silver', 'Gold', 'Medallion', 'judge', 'keeper', 'gate', 'pending', 'ledger'];

// The words of the built-in items. The Chinese ones are what a check runs with and what the verifier is told.
const WORDS = {
  'zh-CN': {
    'what-nonempty': '有「这是什么」一句',
    'points-count': '要点恰好三行',
    'no-placeholder': '没有 TODO / TBD / FIXME 占位',
    'no-banned-words': '没有内部用词',
    'numbers-in-source': '摘要里的每个数字和断言都能在材料里找到，目标 / 预计 / 已完成这类状态词没被升级',
    'point-quotes': '每个要点带一句原文原话，逐字在存下的原文里',
    'numbers-found': '摘要里的数字在存下的原文里都找得到，单位也一样',
    'title-same-thing': '标题、「这是什么」和三个要点说的是同一件事；标题里的数字和断言也能在材料里找到',
  },
  en: {
    'what-nonempty': 'There is a one-line overview',
    'points-count': 'There are exactly three points',
    'no-placeholder': 'No TODO / TBD / FIXME left in',
    'no-banned-words': 'No internal terms',
    'numbers-in-source': 'Every number and claim in the summary can be found in the material, and words such as target / expected / done are not upgraded',
    'point-quotes': 'Each point carries one sentence of the original, word for word as it is in the stored original',
    'numbers-found': 'Every number in the summary is in the stored original, with the same unit',
    'title-same-thing': 'The title, the overview and the three points are about one and the same thing; the numbers and claims in the title can be found in the material too',
  },
};

function wordsOf(language) {
  return WORDS[Object.hasOwn(WORDS, language) ? language : 'zh-CN'];
}

function rule(id, desc, r) {
  return { id, desc, kind: 'rule', rule: r, origin: 'streams' };
}

// 1.1 W3: the summary checked against the original kept in the library (B14). Each point is { text, quote }: quote is one
// sentence of the original; the code finds where it is (verify/original-check.mjs), the model does not count characters.
// The judge item is the same independent judgment as before, reading the stored original.
export function originalChecklist(language = 'zh-CN') {
  const w = wordsOf(language);
  return [
    rule('what-nonempty', w['what-nonempty'], 'json_nonempty:what'),
    rule('points-count', w['points-count'], 'json_count:points,3'),
    rule('point-quotes', w['point-quotes'], 'points_quoted:points'),
    rule('numbers-found', w['numbers-found'], 'numbers_in_original:what,points'),
    rule('no-placeholder', w['no-placeholder'], 'not_regex:\\b(TODO|TBD|FIXME)\\b'),
    rule('no-banned-words', w['no-banned-words'], `not_regex:\\b(${BANNED_WORDS.join('|')})\\b`),
    { id: 'numbers-in-source', desc: w['numbers-in-source'], kind: 'judge', origin: 'streams' },
    // 1.1 W11 (Codex's install test, B4): a page about several things gave an item the title of one and the summary of
    // another; both were in the original, so nothing else caught it. In the same judge call, no call more.
    { id: 'title-same-thing', desc: w['title-same-thing'], kind: 'judge', origin: 'streams' },
  ];
}
