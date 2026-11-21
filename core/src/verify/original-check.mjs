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

const NUMBER = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s*(万亿|千亿|百亿|千万|百万|亿|万|千|百|倍|%|per\s?cent\b|percent\b|trillion\b|billion\b|million\b|thousand\b))?/giu;
const UNIT = (u) => {
  if (!u) return '';
  const l = u.toLowerCase().replace(/\s/g, '');
  return l === 'percent' ? '%' : l;
};

export function numbersIn(text) {
  if (typeof text !== 'string' || text === '') return [];
  const t = text.normalize('NFKC');
  const out = [];
  for (const m of t.matchAll(NUMBER)) {
    const int = m[1].replace(/,/g, '');
    const value = Number(m[2] ? `${int}.${m[2]}` : int);
    if (!Number.isFinite(value)) continue;
    const unit = UNIT(m[3]);
    out.push({ raw: `${m[1]}${m[2] ? `.${m[2]}` : ''}${unit}`, value, unit });
  }
  return out;
}

export function missingNumbers(summary, original) {
  const have = numbersIn(original);
  const missing = [];
  for (const n of numbersIn(summary)) {
    const found = have.some((o) => o.value === n.value && (n.unit === '' || o.unit === n.unit));
    if (!found && !missing.includes(n.raw)) missing.push(n.raw);
  }
  return missing;
}
