// The code's own checks on what the model hands back (11-19 prototype, docs/feedback/2026-11-19-agentrun-five-rounds.md).
// The model finds and reads; these decide what is kept. Each rule gives a reason code, never a guess:
//   shape:<field>     title, url (http/https), published (YYYY-MM-DD), summary, quote, via (source | search) present
//   out-of-window     published before (today − maxAgeDays) or after today (the same window as the pipeline's M4)
//   not-read          the item's page was not opened with WebFetch in this run
//   quote-too-short   the quote has fewer than QUOTE_MIN letters / digits
//   quote-not-found   the quote is not, letter for letter, in the text this run's WebFetch got for that page
//   repeat            the url or the title is one an earlier round already kept
//   duplicate         the url or the title is one an earlier item of this same answer has
//   aspect            (v2, when an aspects list is given) the item names no aspect, or one not on the list round 1 set
//   over-limit        more than `max` items passed everything else (the first ones are kept)
// cleanAspects(list) -> the round-1 aspects: strings, trimmed, non-empty, unique, at most MAX_ASPECTS
// checkSources: a source is kept only when its address was opened in this run (shape:url | not-read).
// Pure: no disk, no network.
import { normalizeTitle } from '../fetch/html.mjs';
import { ageCutoff, localIsoDate } from '../fetch/dates.mjs';

export const QUOTE_MIN = 12;
export const DEFAULT_MAX_ITEMS = 10;
export const VIA = Object.freeze(['source', 'search']);

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// host (lower case, no www.) + path (no trailing slash) + query without utm_* and Google's oc; no fragment
export function urlKey(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k) || k === 'oc') u.searchParams.delete(k);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    const q = u.searchParams.toString();
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${path}${q ? `?${q}` : ''}`;
  } catch {
    return null;
  }
}

// letters and digits only, NFKC, lower case: a quote matches across spacing, punctuation and markdown the fetch tool adds
export function letters(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// fetches: [{ url, text }] from this run (stream.mjs) -> Map urlKey -> letters of everything fetched there
export function fetchedIndex(fetches = []) {
  const m = new Map();
  for (const f of fetches) {
    const k = urlKey(f?.url);
    if (!k) continue;
    m.set(k, (m.get(k) ?? '') + letters(f.text));
  }
  return m;
}

function seenIndex(seen = []) {
  const urls = new Set();
  const titles = new Set();
  for (const s of seen) {
    const k = urlKey(s?.url);
    if (k) urls.add(k);
    const t = normalizeTitle(s?.title);
    if (t) titles.add(t);
  }
  return { urls, titles };
}

export function windowOf(today, maxAgeDays = 7) {
  const d = today instanceof Date ? today : new Date(today);
  return { from: ageCutoff(d, maxAgeDays), to: localIsoDate(d) };
}

export const MAX_ASPECTS = 10;

export function cleanAspects(list) {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!isText(a)) continue;
    const t = a.trim();
    if (!out.includes(t)) out.push(t);
    if (out.length >= MAX_ASPECTS) break;
  }
  return out;
}

// aspects: undefined = no aspect check (the first version); an array = every item must name one of them
export function checkItems({ items, fetches = [], seen = [], today = new Date(), maxAgeDays = 7, max = DEFAULT_MAX_ITEMS, aspects } = {}) {
  const index = fetchedIndex(fetches);
  const before = seenIndex(seen);
  const { from, to } = windowOf(today, maxAgeDays);
  const thisRound = { urls: new Set(), titles: new Set() };
  const kept = [];
  const dropped = [];
  for (const item of Array.isArray(items) ? items : []) {
    const reasons = [];
    const it = item && typeof item === 'object' ? item : {};
    for (const f of ['title', 'summary', 'quote']) if (!isText(it[f])) reasons.push(`shape:${f}`);
    const key = urlKey(it.url);
    if (!key) reasons.push('shape:url');
    if (!(typeof it.published === 'string' && DAY.test(it.published))) reasons.push('shape:published');
    else if ((from && it.published < from) || it.published > to) reasons.push('out-of-window');
    if (!VIA.includes(it.via)) reasons.push('shape:via');
    if (Array.isArray(aspects) && !(isText(it.aspect) && aspects.includes(it.aspect.trim()))) reasons.push('aspect');
    if (key) {
      const page = index.get(key);
      if (page === undefined) reasons.push('not-read');
      else if (isText(it.quote)) {
        const q = letters(it.quote);
        if (q.length < QUOTE_MIN) reasons.push('quote-too-short');
        else if (!page.includes(q)) reasons.push('quote-not-found');
      }
    }
    const title = normalizeTitle(it.title);
    if ((key && before.urls.has(key)) || (title && before.titles.has(title))) reasons.push('repeat');
    else if ((key && thisRound.urls.has(key)) || (title && thisRound.titles.has(title))) reasons.push('duplicate');
    if (key) thisRound.urls.add(key);
    if (title) thisRound.titles.add(title);
    if (reasons.length === 0 && kept.length >= max) reasons.push('over-limit');
    if (reasons.length) dropped.push({ item, reasons });
    else kept.push(item);
  }
  return { kept, dropped, window: { from, to } };
}

export function checkSources({ sources, fetches = [] } = {}) {
  const index = fetchedIndex(fetches);
  const kept = [];
  const dropped = [];
  const keys = new Set();
  for (const s of Array.isArray(sources) ? sources : []) {
    const key = urlKey(s?.url);
    const reasons = [];
    if (!key) reasons.push('shape:url');
    else if (!index.has(key)) reasons.push('not-read');
    else if (keys.has(key)) reasons.push('duplicate');
    if (key) keys.add(key);
    if (reasons.length) dropped.push({ source: s, reasons });
    else kept.push({ name: isText(s.name) ? s.name.trim() : key, url: String(s.url).trim(), why: isText(s.why) ? s.why.trim() : '' });
  }
  return { kept, dropped };
}
