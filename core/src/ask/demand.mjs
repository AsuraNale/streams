// What the user asked for and the library did not have (core-api 5.5, product spec 4.7 「想补的主题」).
//
// _pipeline/demand.jsonl    one line per question asked  { ts, question, topic, notInLibrary, used }
//                           and one per click of 「记到想补的主题」 { ts, topic, question, by:'user' }
// _pipeline/feedback.jsonl  one line per 「这个回答哪里不对」 { ts, question, note }
//
// appendDemandLine(libraryDir, row)                -> row (ts filled in)
// demands(libraryDir, { threshold = 3 })            -> [{ topic, count, last, suggest }]
//   grouped by topic with case and whitespace folded (the newest spelling is shown), lines whose topic
//   is null / empty are not grouped; most asked first, then most recent, then topic. Never adds a topic.
// addDemand(libraryDir, topic, { question?, now? }) -> { topic, count }   empty topic -> 'bad-topic'
// demandsAdded(libraryDir) -> [{ topic, question }]  redesign R3 (问库 「已加入待补充主题」, F42): every click of 「记到想补的主题」
//   (the lines by 'user'), in the file's order — so an answer can say, when the page is opened again, that its topic was added
// answerFeedback(libraryDir, { question, note }, { now? }) -> { ok:true }  empty note -> 'bad-feedback'
// Appends never glue onto a last line that lost its newline (same rule as the ledger).
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';

export const DEMAND_FILE = join('_pipeline', 'demand.jsonl');
export const FEEDBACK_FILE = join('_pipeline', 'feedback.jsonl');
export const SUGGEST_THRESHOLD = 3;

function endsWithoutNewline(path) {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size === 0) return false;
  const fd = openSync(path, 'r');
  try {
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

export function appendJsonLine(libraryDir, file, row) {
  mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
  const path = join(libraryDir, file);
  const prefix = endsWithoutNewline(path) ? '\n' : '';
  appendFileSync(path, prefix + JSON.stringify(row) + '\n', { encoding: 'utf8', flag: 'a' });
  return row;
}

export function readJsonLines(libraryDir, file) {
  const path = join(libraryDir, file);
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object' && !Array.isArray(v)) out.push(v);
    } catch {
      // a broken line is skipped, never fatal
    }
  }
  return out;
}

function stamp(now) {
  const v = typeof now === 'function' ? now() : new Date();
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

export function appendDemandLine(libraryDir, row, { now } = {}) {
  return appendJsonLine(libraryDir, DEMAND_FILE, { ts: stamp(now), ...row });
}

export function topicKey(topic) {
  return typeof topic === 'string' ? topic.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

export function demands(libraryDir, { threshold = SUGGEST_THRESHOLD } = {}) {
  const groups = new Map();
  for (const row of readJsonLines(libraryDir, DEMAND_FILE)) {
    const key = topicKey(row.topic);
    if (key === '') continue;
    const ts = typeof row.ts === 'string' ? row.ts : '';
    const g = groups.get(key) ?? { key, topic: '', count: 0, last: '' };
    g.count += 1;
    if (ts >= g.last) { g.last = ts; g.topic = row.topic.trim().replace(/\s+/g, ' '); }
    groups.set(key, g);
  }
  const min = Number.isFinite(threshold) ? threshold : SUGGEST_THRESHOLD;
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((g) => ({ topic: g.topic, count: g.count, last: g.last || null, suggest: g.count >= min }));
}

export function addDemand(libraryDir, topic, { question, now } = {}) {
  if (typeof topic !== 'string' || topic.trim() === '') throw new StreamsError('bad-topic', 'a topic to remember is required');
  const t = topic.trim();
  appendDemandLine(libraryDir, { topic: t, question: typeof question === 'string' && question.trim() !== '' ? question.trim() : null, by: 'user' }, { now });
  const key = topicKey(t);
  const count = demands(libraryDir).find((d) => topicKey(d.topic) === key)?.count ?? 1;
  return { topic: t, count };
}

export function demandsAdded(libraryDir) {
  return readJsonLines(libraryDir, DEMAND_FILE)
    .filter((row) => row.by === 'user' && topicKey(row.topic) !== '')
    .map((row) => ({ topic: row.topic.trim().replace(/\s+/g, ' '), question: typeof row.question === 'string' && row.question.trim() !== '' ? row.question.trim() : null }));
}

export function answerFeedback(libraryDir, { question, note } = {}, { now } = {}) {
  if (typeof note !== 'string' || note.trim() === '') throw new StreamsError('bad-feedback', 'say what is wrong with the answer');
  appendJsonLine(libraryDir, FEEDBACK_FILE, { ts: stamp(now), question: typeof question === 'string' ? question.trim() : null, note: note.trim() });
  return { ok: true };
}
