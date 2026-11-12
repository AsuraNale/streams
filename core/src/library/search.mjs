// Search over the library (core-api 5.3, mockup S6) and the one scoring routine that ask's candidate
// pick reuses (core-api 5.5 step 1, product spec 4.7). Read only.
//
// textTokens(text)  -> tokens with repeats: Latin / digit words lower-cased with punctuation dropped
//                      (NFKC first; one-letter Latin words dropped), Han text cut into adjacent pairs
//                      (a lone Han character is its own token)
// queryTokens(q)    -> the distinct tokens of a query, in first-appearance order
// scoreEntry(tokens, fields) -> integer: for each query token, its count in each field times the weight
//                      title x3 · topics x2 · summary x1 · body x1
// rankEntries(entries, q, { bodyOf? }) -> [{ entry, score, body }] score > 0 only; highest first, then
//                      date newest first, then id. Without bodyOf the body field is not scored.
// search(libraryDir, q, { view: 'kept'|'authored'|'all', topics?, days?, limit = 50, now? })
//   -> [{ id, title, date, source_name, status, topics, score, snippet }]
//   snippet = at most 80 characters of the body around its first hit (whitespace collapsed; redesign R3: of the body's plain
//   text — each line without its Markdown marks, as summaries are made — so a snippet shows no ** [[ ]] # and the like); when the
//   body has no hit, the first 80 characters of the index summary. Empty query -> [].
import { StreamsError } from '../errors.mjs';
import { plainText, readIndex } from './index.mjs';
import { cmp, entryFilter, noteBodyOf } from './browse.mjs';

export const WEIGHTS = Object.freeze({ title: 3, topics: 2, summary: 1, body: 1 });
export const SEARCH_VIEWS = ['kept', 'authored', 'all'];
export const SEARCH_LIMIT = 50;
export const SNIPPET_CHARS = 80;

const HAN_RUN = /\p{Script=Han}+/gu;
const WORD_RUN = /[\p{L}\p{N}]+/gu;

export function textTokens(text) {
  const s = String(text ?? '').normalize('NFKC').toLowerCase();
  const out = [];
  for (const m of s.replace(HAN_RUN, ' ').matchAll(WORD_RUN)) {
    if (Array.from(m[0]).length > 1 || /\p{N}/u.test(m[0])) out.push(m[0]);
  }
  for (const m of s.matchAll(HAN_RUN)) {
    const chars = Array.from(m[0]);
    if (chars.length === 1) out.push(chars[0]);
    for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1]);
  }
  return out;
}

export function queryTokens(q) {
  return [...new Set(textTokens(q))];
}

function counts(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

// fields: { title, topics, summary, body } as strings (topics may be an array)
export function scoreEntry(tokens, fields) {
  const parts = {
    title: counts(textTokens(fields.title)),
    topics: counts(textTokens(Array.isArray(fields.topics) ? fields.topics.join(' \n ') : fields.topics)),
    summary: counts(textTokens(fields.summary)),
    body: counts(textTokens(fields.body)),
  };
  let score = 0;
  for (const t of tokens) {
    for (const [k, w] of Object.entries(WEIGHTS)) score += w * (parts[k].get(t) ?? 0);
  }
  return score;
}

export function rankEntries(entries, q, { bodyOf } = {}) {
  const tokens = queryTokens(q);
  if (tokens.length === 0) return [];
  const out = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.id !== 'string') continue;
    const body = typeof bodyOf === 'function' ? (bodyOf(entry) ?? '') : '';
    const score = scoreEntry(tokens, { title: entry.title, topics: entry.topics, summary: entry.summary, body });
    if (score > 0) out.push({ entry, score, body });
  }
  out.sort((a, b) => b.score - a.score || cmp(b.entry.date, a.entry.date) || cmp(a.entry.id, b.entry.id));
  return out;
}

// One code point per position, lower-cased where that keeps the length (so indexes map back).
function foldChars(chars) {
  return chars.map((c) => {
    const l = c.normalize('NFKC').toLowerCase();
    return Array.from(l).length === 1 ? l : c;
  });
}

export function snippetOf(body, tokens, fallback = '') {
  const chars = Array.from(String(body ?? ''));
  const folded = foldChars(chars);
  const hay = folded.join('');
  let best = -1;
  let bestLen = 0;
  for (const t of tokens) {
    const at = hay.indexOf(t);
    if (at < 0) continue;
    const pos = Array.from(hay.slice(0, at)).length;
    if (best < 0 || pos < best) { best = pos; bestLen = Array.from(t).length; }
  }
  if (best < 0) return collapse(Array.from(String(fallback ?? '')).slice(0, SNIPPET_CHARS).join(''));
  let start = Math.max(0, best - Math.floor((SNIPPET_CHARS - bestLen) / 2));
  const end = Math.min(chars.length, start + SNIPPET_CHARS);
  start = Math.max(0, end - SNIPPET_CHARS);
  return collapse(chars.slice(start, end).join(''));
}

/** A body as plain text (redesign R3, 资料库's search 「片段不露 Markdown 记号」): each line without its heading marks and plainText's. */
export function plainBody(body) {
  return String(body ?? '').split(/\r?\n/).map((line) => plainText(line.trim().replace(/^#{1,6}(?:\s+|$)/, ''))).join('\n');
}

function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}

export function search(libraryDir, q, { view = 'all', topics, days, limit = SEARCH_LIMIT, now } = {}) {
  if (typeof q !== 'string') throw new StreamsError('bad-query', 'the query must be a string');
  if (!SEARCH_VIEWS.includes(view)) throw new StreamsError('bad-view', `view must be one of ${SEARCH_VIEWS.join(' | ')}, got ${JSON.stringify(view)}`);
  const tokens = queryTokens(q);
  if (tokens.length === 0) return [];
  const keep = entryFilter({ topics, days, now });
  const entries = readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e));
  const ranked = rankEntries(entries, q, { bodyOf: (e) => noteBodyOf(libraryDir, e.id) });
  const n = Number.isInteger(limit) && limit >= 0 ? limit : SEARCH_LIMIT;
  return ranked.slice(0, n).map(({ entry, score, body }) => ({
    id: entry.id,
    title: entry.title,
    date: entry.date,
    source_name: entry.source_name ?? null,
    status: entry.status,
    topics: Array.isArray(entry.topics) ? [...entry.topics] : [],
    score,
    snippet: snippetOf(plainBody(body), tokens, entry.summary),
  }));
}
