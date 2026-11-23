// toIsoDate(str, { fallback }) -> 'YYYY-MM-DD' | fallback
//   The calendar date as the source wrote it (no time-zone shifting):
//     ISO-ish   2026-07-03T12:00:00Z, 2026-07-03                  -> 2026-07-03
//     RFC 822   Thu, 02 Jul 2026 08:00:00 GMT, 2 Jul 2026 +0000    -> 2026-07-02
//     anything else Date.parse understands                        -> its UTC calendar date
//   Impossible dates (2026-02-30), empty and unparseable strings  -> fallback ('' by default)
// localIsoDate(d) -> the LOCAL calendar day of a Date (used as the "fetched on" fallback)
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function pad(n) {
  return String(n).padStart(2, '0');
}

export function isRealDate(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function localIsoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ageCutoff(now, maxAgeDays) -> the first calendar day (YYYY-MM-DD, local) still taken in, or null for no limit (1.1 W7b: here
// from v1.0's fetch round, which left core/src; the agent run's guards still cut old items by it)
export function ageCutoff(now, maxAgeDays) {
  if (!Number.isInteger(maxAgeDays) || maxAgeDays <= 0) return null;
  const d = now instanceof Date ? now : new Date(now);
  return localIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - maxAgeDays));
}

export function toIsoDate(str, { fallback = '' } = {}) {
  const raw = String(str ?? '').trim();
  if (raw === '') return fallback;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(raw);
  if (m) return isRealDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : fallback;
  m = /(?:^|[\s,])(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})(?!\d)/.exec(raw);
  if (m && Object.hasOwn(MONTHS, m[2].toLowerCase())) {
    const y = +m[3];
    const mo = MONTHS[m[2].toLowerCase()];
    const d = +m[1];
    return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : fallback;
  }
  // Date.parse is lenient to the point of reading "-5" as 2001-05-01: only let it see strings that
  // at least carry a four-digit year.
  if (!/(?:^|\D)\d{4}(?:\D|$)/.test(raw)) return fallback;
  const t = Date.parse(raw);
  if (Number.isFinite(t)) {
    const dt = new Date(t);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  return fallback;
}
