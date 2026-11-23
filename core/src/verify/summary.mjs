// A summary checked against the original kept in the library (1.1 W3, acceptance B14 and A4's data).
//
// checkSummary({ libraryDir, url, produce, connector, maxRounds = 2, language, judgeMaxChars, title })
//   title (1.1 W11): the item's title; the judge sees it with the summary (title-same-thing: the title, the overview and
//     the points are one and the same thing). No title: the judge sees the summary alone, as before.
//   The original is read from the library (_originals/<id>.md, read/original.mjs). No original: no model call at all,
//     -> { status: 'no-original', missing: 'original-not-saved', original: { id, saved: false }, calls: 0 }   (B6)
//   Otherwise verifyLoop with originalChecklist(): round 1 gets feedback null; a failed round gets the prior output and
//   only the failed items with their reasons. Rules first (each point's sentence and every number against the stored
//   original); the one judge call only when the rules pass, reading the stored original (cut to judgeMaxChars).
//   produce(feedback, prior) -> { output: { what, points: [{ text, quote }] }, claimed, calls } is the caller's model call.
//     -> { status: 'checked', passed, rounds, summary, verification, original: { id, saved: true }, history, calls }
//        summary = { what, points: [text], quote, anchors: [{ point, quote, start, end, paragraph }] }
//          points are the plain lines the 待看 card shows; anchors are the places in the original's text of the points
//          whose sentence was found (a point whose sentence was not found has none); quote is the first point's sentence
//        verification = { passed, rounds, failed: [{ id, evidence }], claimsNotFound, forgot }
//     -> { status: 'bad-format', rounds, history, calls }   no round gave a summary at all (what the update marks 「摘要没写出来」, W5)
//     -> { status: 'connection', code, calls }               the judge could not be reached
// Nothing here writes the library: putting the result in 待看 is update/inbox.mjs.
import { readOriginal, originalId, ORIGINAL_MISSING } from '../read/original.mjs';
import { originalChecklist } from './checklist.mjs';
import { verifyLoop } from './verify.mjs';
import { locateQuote } from './original-check.mjs';

// 1.1 W5's live runs: at 12000 the judge saw long pages cut and called what came after 「not in the material」
export const JUDGE_MAX_CHARS = 40000;

const TASK = {
  'zh-CN': '为一条资料写摘要：一句「这是什么」和三个要点，每个要点带一句原文原话',
  en: 'Write the summary of one item: a one-line overview and three points, each with one sentence of the original',
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export async function checkSummary({ libraryDir, url, produce, connector, maxRounds = 2, language = 'zh-CN', judgeMaxChars = JUDGE_MAX_CHARS, title = '' } = {}) {
  if (typeof produce !== 'function') throw new TypeError('checkSummary needs a produce function');
  const id = originalId(url);
  const stored = readOriginal(libraryDir, id);
  if (!stored || stored.text.trim() === '') return { status: 'no-original', missing: ORIGINAL_MISSING, original: { id, saved: false }, calls: 0 };

  const original = { text: stored.text, title: stored.title };
  const source = stored.text.length > judgeMaxChars ? stored.text.slice(0, judgeMaxChars) : stored.text;
  // 1.1 W11: the title goes with what the judge reads (the rules read what and points only)
  const withTitle = typeof title === 'string' && title.trim() !== ''
    ? async (feedback, prior) => { const r = await produce(feedback, prior); return isObj(r?.output) ? { ...r, output: { title: title.trim(), ...r.output } } : r; }
    : produce;
  const loop = await verifyLoop({
    task: TASK[language] ?? TASK['zh-CN'], checklist: originalChecklist(language), source, original, connector, produce: withTitle, maxRounds,
  });
  if (loop.last?.code && loop.last.code !== 'bad-format') return { status: 'connection', code: loop.last.code, calls: loop.calls };

  const out = loop.output;
  if (!isObj(out) || typeof out.what !== 'string' || out.what.trim() === '') return { status: 'bad-format', rounds: loop.rounds, history: loop.history, calls: loop.calls };

  const points = Array.isArray(out.points) ? out.points : [];
  const anchors = [];
  points.forEach((p, i) => {
    const quote = isObj(p) && typeof p.quote === 'string' ? p.quote : '';
    const at = quote ? locateQuote(stored.text, quote) : null;
    if (at) anchors.push({ point: i, quote, ...at });
  });
  const summary = {
    what: out.what,
    points: points.map((p) => (typeof p === 'string' ? p : isObj(p) && typeof p.text === 'string' ? p.text : '')),
    quote: anchors[0]?.quote ?? '',
    anchors,
  };
  const last = loop.last;
  const verification = {
    passed: loop.passed === true,
    rounds: loop.rounds,
    failed: last.items.filter((it) => !it.passed).map((it) => ({ id: it.id, evidence: it.evidence })),
    claimsNotFound: last.claimsNotFound ?? [],
    forgot: last.forgot ?? [],
  };
  return { status: 'checked', passed: verification.passed, rounds: loop.rounds, summary, verification, original: { id, saved: true }, history: loop.history, calls: loop.calls };
}
