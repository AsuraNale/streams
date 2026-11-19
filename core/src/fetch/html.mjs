// Text helpers for feed content.
//   decodeEntities(s)      XML + the common HTML named entities, numeric &#NN; / &#xHH;
//   stripHtml(text)        drop tags (and script/style bodies), decode entities, collapse whitespace
//   truncateText(text, n)  cut to n code points (never splits a surrogate pair)
//   normalizeTitle(title)  second-layer dedup key: NFKC (full-width -> half-width), lower-case,
//                          keep letters and digits only
const NAMED = {
  lt: '<', gt: '>', amp: '&', quot: '"', apos: "'",
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  middot: '·', bull: '•', deg: '°', times: '×', euro: '€', pound: '£', yen: '¥',
};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const key = body.toLowerCase();
    return Object.hasOwn(NAMED, key) ? NAMED[key] : whole;
  });
}

export function stripHtml(text) {
  let t = String(text ?? '');
  t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = t.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t);
  return t.replace(/\s+/g, ' ').trim();
}

// extractArticle(html) -> the article's own words, not the page around it (11-18 proposal P1: a page whose
// navigation comes first gave the gates nothing but the menu). In this order, the first that gives enough text:
//   1. JSON-LD articleBody (the longest one on the page)
//   2. the paragraphs of the largest <article> element (or its whole text when it has no <p>)
//   3. the page's paragraphs of at least PARAGRAPH_MIN characters, outside <nav> <header> <footer> <aside> <form>
//   4. the whole page through stripHtml (what 1.0.1 did for every page)
// "Enough" is ARTICLE_MIN characters. Never throws.
export const ARTICLE_MIN = 200;
export const PARAGRAPH_MIN = 40;

function jsonLdBodies(html) {
  const out = [];
  const visit = (v, depth) => {
    if (depth > 8 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    if (typeof v.articleBody === 'string') out.push(v.articleBody);
    for (const k of Object.keys(v)) if (k !== 'articleBody') visit(v[k], depth + 1);
  };
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      visit(JSON.parse(m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()), 0);
    } catch {
      // a broken block is skipped
    }
  }
  return out.map((b) => stripHtml(b)).filter((b) => b !== '');
}

function paragraphs(html) {
  const out = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const t = stripHtml(m[1]);
    if (Array.from(t).length >= PARAGRAPH_MIN) out.push(t);
  }
  return out.join(' ');
}

const enough = (t) => Array.from(t).length >= ARTICLE_MIN;

export function extractArticle(html) {
  const raw = String(html ?? '');
  try {
    const ld = jsonLdBodies(raw).sort((a, b) => b.length - a.length)[0];
    if (ld && enough(ld)) return ld;
    const page = raw
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    let best = '';
    const are = /<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi;
    for (let m = are.exec(page); m; m = are.exec(page)) {
      const inner = m[1];
      const ps = paragraphs(inner);
      const t = enough(ps) ? ps : stripHtml(inner);
      if (t.length > best.length) best = t;
    }
    if (enough(best)) return best;
    const body = page.replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    const ps = paragraphs(body);
    if (enough(ps)) return ps;
  } catch {
    // fall through to the whole page
  }
  return stripHtml(raw);
}

// News aggregators whose item links lead to a page of their own, not to the article: the address of the article is not
// in that page (Google News: only an id, a time and a signature that the page's script exchanges with Google itself).
// Streams does not try to get around that; an item from there is judged on its title (11-18 proposal D2, recommended
// option) and its card says so. titleOnlyHost(url) -> the host when it is one of these, else null.
export const TITLE_ONLY_HOSTS = Object.freeze(['news.google.com']);

export function titleOnlyHost(url) {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    return TITLE_ONLY_HOSTS.find((h) => host === h || host.endsWith(`.${h}`)) ?? null;
  } catch {
    return null;
  }
}

export const SUMMARY_MAX = 500;

export function truncateText(text, max = SUMMARY_MAX) {
  const cps = Array.from(String(text ?? ''));
  return cps.length <= max ? String(text ?? '') : cps.slice(0, max).join('');
}

export function normalizeTitle(title) {
  return String(title ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
