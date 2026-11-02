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

export const SUMMARY_MAX = 500;

export function truncateText(text, max = SUMMARY_MAX) {
  const cps = Array.from(String(text ?? ''));
  return cps.length <= max ? String(text ?? '') : cps.slice(0, max).join('');
}

export function normalizeTitle(title) {
  return String(title ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
