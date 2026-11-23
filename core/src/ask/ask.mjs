// 问库 (core-api 5.5, product spec 4.7 + 4.11, mockup S10): answer only from the library.
//
// ask(libraryDir, question, { connector, now?, maxRounds = 2 })
//   1 candidates  index entries with status kept / authored, scored with the search routine on title,
//                 topics and summary (library/search.mjs), the best 9 (ties: date newest first, then id);
//                 their bodies, each cut at 1500 characters, 9000 in all. 0 candidates -> no model call.
//   2 answer      one completeJson call, slot 'main', no tools (prompts.mjs)
//   3 check       verifyLoop with three rule items and one judge item (all judge items in one call, slot
//                 'verify'); a failed round sends back only the failed items
//   4 fallback    after the last round: cite numbers outside 1..n are taken out (removedCites), then every
//                 sentence left without a cite is taken out (removedSentences): no sentence keeps a source
//                 that is not in the library
//   5 record      one line in _pipeline/demand.jsonl; every item of every round in _pipeline/verdicts.jsonl
//                 (node 'ask', url 'ask:<first 12 hex of sha1(question)>')
//   -> { ok:true, answer:[{ text, cites }], sources:[{ n, id, title, date }], notInLibrary, missing,
//        candidates:[{ n, id, title, date }], used:[id], calls, verification:{ passed, rounds, failed,
//        claimsNotFound, forgot }, removedCites, removedSentences }
//   A connection failure (of the answer call or of the judge call) -> { ok:false, code, calls }, nothing written.
//   `sources` lists only the cited entries; notInLibrary is true when the model said so or when nothing
//   cited is left after the fallback.
import { createHash } from 'node:crypto';
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { readIndex } from '../library/index.mjs';
import { noteBodyOf } from '../library/browse.mjs';
import { rankEntries } from '../library/search.mjs';
import { languageOfConfig } from '../library/language.mjs';
import { completeJson } from '../connect/complete-json.mjs';
import { verifyLoop } from '../verify/verify.mjs';
import { appendVerdict } from '../verify/verdicts.mjs';
import { askPrompt, materialsText } from './prompts.mjs';
import { appendDemandLine } from './demand.mjs';

export const ASK_NODE = 'ask';
export const MAX_CANDIDATES = 9;
export const BODY_CHARS = 1500;
export const TOTAL_CHARS = 9000;
export const ASK_STATUSES = ['kept', 'authored'];
const DERIVED = ['cites_all', 'answer_problems'];

const DESCS = {
  'zh-CN': {
    'json-keys': '输出包含 answer 与 notInLibrary 两个字段',
    'cites-in-set': '每个出处编号都在候选条目的编号里',
    'cited-sentences': 'notInLibrary 为 false 时回答非空，且每句至少一个出处',
    'claims-supported': '每句断言都对得上它引的那条材料',
  },
  en: {
    'json-keys': 'the output has both answer and notInLibrary',
    'cites-in-set': 'every cite number is one of the candidate entry numbers',
    'cited-sentences': 'when notInLibrary is false the answer is not empty and every sentence has at least one cite',
    'claims-supported': 'every claim matches the entry it cites',
  },
};

export function askChecklist(language = 'zh-CN') {
  const d = DESCS[language] ?? DESCS['zh-CN'];
  return [
    { id: 'json-keys', desc: d['json-keys'], kind: 'rule', rule: 'json_keys:answer,notInLibrary', origin: 'streams' },
    { id: 'cites-in-set', desc: d['cites-in-set'], kind: 'rule', rule: 'ids_in_set:cites_all', origin: 'streams' },
    { id: 'cited-sentences', desc: d['cited-sentences'], kind: 'rule', rule: 'json_range:answer_problems,0,0', origin: 'streams' },
    { id: 'claims-supported', desc: d['claims-supported'], kind: 'judge', origin: 'streams' },
  ];
}

export function questionKey(question) {
  return `ask:${createHash('sha1').update(String(question)).digest('hex').slice(0, 12)}`;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function citesOf(sentence) {
  if (!isPlainObject(sentence)) return [];
  const c = sentence.cites;
  if (Array.isArray(c)) return c;
  return c === undefined || c === null ? [] : [c];
}

// The model's JSON plus two derived fields the rule operators can read: every cite flattened
// (ids_in_set) and the count of answer problems (json_range ...,0,0). The model's own keys are kept.
export function checkView(json) {
  const raw = isPlainObject(json) ? json : {};
  const answer = Array.isArray(raw.answer) ? raw.answer : [];
  const all = [];
  let uncited = 0;
  for (const s of answer) {
    const c = citesOf(s);
    all.push(...c);
    if (c.length === 0) uncited += 1;
  }
  const problems = raw.notInLibrary === true ? 0 : (answer.length === 0 ? 1 : 0) + uncited;
  return { ...raw, cites_all: all, answer_problems: problems };
}

function withoutDerived(view) {
  if (!isPlainObject(view)) return view;
  const out = { ...view };
  for (const k of DERIVED) delete out[k];
  return out;
}

function toInt(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v);
  return null;
}

// The last line of V9: what is left after numbers outside the candidate set and uncited sentences go.
export function applyFallback(json, n) {
  const raw = isPlainObject(json) ? json : {};
  const removedCites = [];
  let removedSentences = 0;
  const answer = [];
  for (const s of Array.isArray(raw.answer) ? raw.answer : []) {
    const text = isPlainObject(s) && typeof s.text === 'string' ? s.text.trim() : '';
    const kept = [];
    for (const c of citesOf(s)) {
      const k = toInt(c);
      if (k !== null && k >= 1 && k <= n) { if (!kept.includes(k)) kept.push(k); }
      else if (!removedCites.some((r) => String(r) === String(c))) removedCites.push(c);
    }
    if (text === '' || kept.length === 0) { removedSentences += 1; continue; }
    answer.push({ text, cites: kept });
  }
  return { answer, removedCites, removedSentences };
}

class AskStop extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function clockOf(now) {
  return typeof now === 'function' ? now : () => new Date();
}

// The candidate pick of step 1, shared with nothing else on purpose: the scoring is the search one.
export function askCandidates(libraryDir, question) {
  const entries = readIndex(libraryDir).filter((e) => ASK_STATUSES.includes(e.status));
  const ranked = rankEntries(entries, question).slice(0, MAX_CANDIDATES);
  let budget = TOTAL_CHARS;
  return ranked.map(({ entry }, i) => {
    const full = Array.from(noteBodyOf(libraryDir, entry.id) ?? '');
    const take = Math.max(0, Math.min(BODY_CHARS, budget));
    const body = full.slice(0, take).join('');
    budget -= Array.from(body).length;
    return { n: i + 1, id: entry.id, title: entry.title ?? '', date: entry.date ?? '', body };
  });
}

export async function ask(libraryDir, question, { connector, now, maxRounds = 2 } = {}) {
  if (typeof question !== 'string' || question.trim() === '') throw new StreamsError('bad-question', 'a question is required');
  const q = question.trim();
  const clock = clockOf(now);
  const cfgRead = readConfig(libraryDir);
  if (!cfgRead.ok) throw new StreamsError(`config:${cfgRead.error.code}`, cfgRead.error.message);
  const language = languageOfConfig(cfgRead.config);
  const candidates = askCandidates(libraryDir, q);
  const listed = candidates.map(({ n, id, title, date }) => ({ n, id, title, date }));

  if (candidates.length === 0) {
    appendDemandLine(libraryDir, { question: q, topic: null, notInLibrary: true, used: [] }, { now: clock });
    return {
      ok: true, answer: [], sources: [], notInLibrary: true, missing: '', candidates: [], used: [], calls: 0,
      verification: { passed: true, rounds: 0, failed: [], claimsNotFound: [], forgot: [] }, removedCites: [], removedSentences: 0,
    };
  }
  if (!connector || typeof connector.complete !== 'function') throw new StreamsError('bad-argument', 'ask needs a connector');

  let calls = 0;
  const counted = { ...connector, complete: async (req) => { calls += 1; return connector.complete(req); } };
  const checklist = askChecklist(language);
  const source = materialsText(candidates, language);
  const candidateIds = candidates.map((c) => c.n);

  const produce = async (feedback, prior) => {
    const prompt = askPrompt({ question: q, materials: candidates, checklist, feedback, prior: withoutDerived(prior), language });
    const r = await completeJson(counted, { prompt, format: 'json', model: 'main' }, { retries: 1 });
    if (!r.ok) throw new AskStop(r.code);
    const claimed = Array.isArray(r.json?.claimed) ? r.json.claimed.map(String) : [];
    return { output: checkView(r.json), claimed, calls: r.usage?.calls ?? r.attempts ?? 1 };
  };

  let loop;
  try {
    loop = await verifyLoop({ task: `${language === 'en' ? 'Answer from the numbered entries only: ' : '只用编号条目回答问题：'}${q}`, checklist, source, candidateIds, connector: counted, produce, maxRounds });
  } catch (e) {
    if (e instanceof AskStop) return { ok: false, code: e.code, calls };
    throw e;
  }
  if (loop.last.code && loop.last.code !== 'bad-format') return { ok: false, code: loop.last.code, calls };

  const ts = clock().toISOString();
  const url = questionKey(q);
  loop.history.forEach((h, i) => appendVerdict(libraryDir, { node: ASK_NODE, url, round: i + 1, items: h.items, ts }));

  const raw = withoutDerived(loop.output);
  const { answer, removedCites, removedSentences } = applyFallback(raw, candidates.length);
  const citedNs = [...new Set(answer.flatMap((s) => s.cites))].sort((a, b) => a - b);
  const sources = citedNs.map((n) => listed[n - 1]);
  const used = sources.map((s) => s.id);
  const notInLibrary = raw?.notInLibrary === true || answer.length === 0;
  const missing = typeof raw?.missing === 'string' ? raw.missing.trim() : '';
  appendDemandLine(libraryDir, { question: q, topic: missing || null, notInLibrary, used }, { now: clock });

  return {
    ok: true,
    answer,
    sources,
    notInLibrary,
    missing,
    candidates: listed,
    used,
    calls,
    verification: {
      passed: loop.passed,
      rounds: loop.rounds,
      failed: loop.last.items.filter((it) => !it.passed).map((it) => ({ id: it.id, kind: it.kind, evidence: it.evidence })),
      claimsNotFound: loop.last.claimsNotFound,
      forgot: loop.last.forgot,
    },
    removedCites,
    removedSentences,
  };
}
