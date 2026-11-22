// The questions of building a library (1.1 W4, acceptance A1; the maintainer 11-19: at most 5 questions, a choice question at most
// 4 options plus 「其它」, at most 2 questions with no options). The main agent proposes a question; only one that passes
// these checks is handed to the interface. The checks are the code's; how to ask is the SOP's (sop/build.md).
//
// checkQuestion(q, asked, { firstInput }) -> { ok, problems: [code], question }
//   q      what the agent handed in: { text, kind: 'input' | 'single' | 'multi', options? }
//   asked  the questions already shown in this conversation (their `question` objects)
//   firstInput  false when changing a library's card (1.1 W6b): what the library is for is known, so the 1st question may be a choice
//   codes  too-many-questions   a 6th question
//          first-not-input      the 1st question is not a question with no options (it asks what the library is for)
//          too-many-inputs      a 3rd question with no options
//          too-many-options     more than 4 options (「其它」 not counted: the interface adds it)
//          too-few-options      a choice question with fewer than 2 options
//          options-on-input     a question with no options that has some
//          bad-kind · no-text · bad-option (an empty or repeated option)
//   question (when ok) = { n, text, kind, options, other }   other: true for a choice question (the interface shows 「其它」)
// answerText(question, answer, language) -> the line the agent is given for the user's answer
//   answer: a string (a question with no options, or anything typed), or { picked: [option], other }
export const QUESTION_LIMITS = Object.freeze({ questions: 5, options: 4, inputs: 2, minOptions: 2 });
export const QUESTION_KINDS = Object.freeze(['input', 'single', 'multi']);
const OTHER = /^(其它|其他|other|others|something else)[\s:：.。…]*$/i;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function checkQuestion(q, asked = [], { firstInput = true } = {}) {
  const problems = [];
  if (!isObj(q)) return { ok: false, problems: ['bad-kind'] };
  const n = asked.length + 1;
  const text = typeof q.text === 'string' ? q.text.trim() : '';
  const kind = q.kind;
  if (n > QUESTION_LIMITS.questions) problems.push('too-many-questions');
  if (!text) problems.push('no-text');
  if (!QUESTION_KINDS.includes(kind)) problems.push('bad-kind');
  const raw = Array.isArray(q.options) ? q.options : q.options === undefined || q.options === null ? [] : null;
  if (raw === null) problems.push('bad-option');
  const options = (raw ?? []).map((o) => (typeof o === 'string' ? o.trim() : '')).filter((o) => !OTHER.test(o));
  if (options.some((o) => o === '') || new Set(options).size !== options.length) problems.push('bad-option');
  if (kind === 'input') {
    if (options.length > 0) problems.push('options-on-input');
    const inputs = asked.filter((a) => a.kind === 'input').length + 1;
    if (inputs > QUESTION_LIMITS.inputs) problems.push('too-many-inputs');
  } else if (kind === 'single' || kind === 'multi') {
    if (n === 1 && firstInput) problems.push('first-not-input');
    if (options.length > QUESTION_LIMITS.options) problems.push('too-many-options');
    if (options.length < QUESTION_LIMITS.minOptions) problems.push('too-few-options');
  }
  if (problems.length) return { ok: false, problems: [...new Set(problems)] };
  return { ok: true, problems: [], question: { n, text, kind, options, other: kind !== 'input' } };
}

const WORDS = {
  'zh-CN': { picked: '我选了：', none: '我一个都没选', other: '其它：', sep: '、' },
  en: { picked: 'I picked: ', none: 'I picked none of them', other: 'Other: ', sep: ', ' },
};

export function answerText(question, answer, language = 'zh-CN') {
  const w = WORDS[language] ?? WORDS['zh-CN'];
  if (typeof answer === 'string') return answer.trim();
  if (!isObj(answer)) return '';
  const known = new Set(question?.options ?? []);
  const picked = (Array.isArray(answer.picked) ? answer.picked : []).filter((p) => known.has(p));
  const other = typeof answer.other === 'string' ? answer.other.trim() : '';
  const parts = [picked.length ? `${w.picked}${picked.join(w.sep)}` : other ? '' : w.none];
  if (other) parts.push(`${w.other}${other}`);
  return parts.filter(Boolean).join(language === 'en' ? '. ' : '；');
}
