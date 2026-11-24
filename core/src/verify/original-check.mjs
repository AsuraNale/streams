// Checking a summary against the original kept in the library (1.1 W3, acceptance B14; the places are A4's data).
// Deterministic, zero model calls. The original is the text of _originals/<id>.md (read/original.mjs), never what the
// model hands back.
//
// locateQuote(text, quote)        -> { start, end, paragraph } | null
//   The first place in `text` where `quote` is, word for word. Only these may differ: spacing (all whitespace is left
//   out on both sides), full-width / half-width forms (NFKC), curly / straight quotes, zero-width characters. start / end
//   are offsets in `text` itself (text.slice(start, end) is the original's own words); paragraph counts from 0, paragraphs
//   being split by a blank line. A quote shorter than QUOTE_MIN_CHARS characters (after folding) is never located.
// numbersIn(text)                 -> [{ raw, value, unit }]   every number with the unit right after it (%, 万, 亿, million …)
// missingNumbers(summary, original) -> ['20%', '1.2亿', …]    the summary's numbers that are not in the original: the same
//   value with the same unit (a number without a unit matches the value with any unit); 1,200 = 1200, 12.0 = 12, ％ = %
export const QUOTE_MIN_CHARS = 6;

const DROP = /[\s​-‍⁠﻿]/gu;

function foldChar(ch) {
  return ch.normalize('NFKC')
    .replace(/[“”„‟″〝〞]/g, '"')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(DROP, '');
}

// the folded text, and for each of its UTF-16 units the original offsets it came from
function fold(text) {
  let out = '';
  const from = [];
  const to = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i);
    const width = cp > 0xffff ? 2 : 1;
    const f = foldChar(text.slice(i, i + width));
    for (let k = 0; k < f.length; k++) { from.push(i); to.push(i + width); }
    out += f;
    i += width;
  }
  return { out, from, to };
}

export function foldedLength(quote) {
  return [...fold(String(quote ?? '')).out].length;
}

export function locateQuote(text, quote) {
  if (typeof text !== 'string' || typeof quote !== 'string') return null;
  const q = fold(quote).out;
  if ([...q].length < QUOTE_MIN_CHARS) return null;
  const t = fold(text);
  const at = t.out.indexOf(q);
  if (at < 0) return null;
  const start = t.from[at];
  const end = t.to[at + q.length - 1];
  const paragraph = text.slice(0, start).split(/\n\s*\n/).length - 1;
  return { start, end, paragraph };
}

// 1.1.1 P2: K / M / B / bn / mn / tn right after the digits (no space: "161M", "$2.5bn") are scale words too
const NUMBER = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s*(万亿|千亿|百亿|千万|百万|亿|万|千|百|倍|%|per\s?cent\b|percent\b|trillion\b|billion\b|million\b|thousand\b)|(bn|mn|tn|[KkMB]|[x×])(?![A-Za-z]))?/gu;
const UNIT = (u) => {
  if (!u) return '';
  const l = u.toLowerCase().replace(/\s/g, '');
  return l === 'percent' ? '%' : l;
};
// the scale words and what they multiply by (1.1.1 P2: a number is compared by its amount — 161M and 1.61亿 are one number)
const SCALE = Object.freeze({
  百: 1e2, 千: 1e3, 万: 1e4, 百万: 1e6, 千万: 1e7, 亿: 1e8, 百亿: 1e10, 千亿: 1e11, 万亿: 1e12,
  thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12,
  k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, tn: 1e12,
});
// the suffix letters read as their word ("161M" is 161 million)
const SUFFIX = Object.freeze({ k: 'thousand', m: 'million', mn: 'million', b: 'billion', bn: 'billion', tn: 'trillion', x: '倍', '×': '倍' });
// 1.1.1 P2: an English month name in the original stands for its number (「12 月 31 日」 is in "December 31")
const MONTHS = Object.freeze({ Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Sept: 9, Oct: 10, Nov: 11, Dec: 12 });
const MONTH = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\b/g;

export function numbersIn(text) {
  if (typeof text !== 'string' || text === '') return [];
  const t = text.normalize('NFKC');
  const out = [];
  for (const m of t.matchAll(NUMBER)) {
    const int = m[1].replace(/,/g, '');
    const value = Number(m[2] ? `${int}.${m[2]}` : int);
    if (!Number.isFinite(value)) continue;
    const word = m[3] ? UNIT(m[3]) : '';
    const unit = word || (m[4] ? SUFFIX[m[4].toLowerCase()] : '');
    const scale = SCALE[unit] ?? null;
    out.push({ raw: `${m[1]}${m[2] ? `.${m[2]}` : ''}${m[4] && !m[3] ? m[4] : unit}`, value, unit, amount: scale ? value * scale : value });
  }
  return out;
}

/** The months an original names in English words, as numbers (1.1.1 P2). */
export function monthsIn(text) {
  if (typeof text !== 'string' || text === '') return [];
  return [...text.normalize('NFKC').matchAll(MONTH)].map((m) => MONTHS[m[1].slice(0, m[1] === 'Sept' ? 4 : 3)] ?? null).filter((n) => n !== null);
}

const same = (a, b) => a === b || Math.abs(a - b) <= Math.abs(b) * 1e-9;
const STRICT = new Set(['%', '倍']);

export function missingNumbers(summary, original) {
  const have = [...numbersIn(original), ...monthsIn(original).map((v) => ({ raw: String(v), value: v, unit: '', amount: v }))];
  const missing = [];
  for (const n of numbersIn(summary)) {
    let found;
    if (STRICT.has(n.unit)) found = have.some((o) => o.unit === n.unit && same(o.value, n.value));
    // a number without a unit matches that value with any unit, or that amount (summary 161000000 · original 161M)
    else if (n.unit === '') found = have.some((o) => same(o.value, n.value) || (!STRICT.has(o.unit) && same(o.amount, n.value)));
    // a scaled number matches the same amount however the original writes it (1.61亿 · 161M · 161,000,000); a wrong
    // conversion (16.1亿 for 161M) is a different amount and stays missing
    else found = have.some((o) => !STRICT.has(o.unit) && same(o.amount, n.amount));
    if (!found && !missing.includes(n.raw)) missing.push(n.raw);
  }
  return missing;
}
