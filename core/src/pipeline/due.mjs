// 1.1.1 P8 (acceptance A12, B23; plan 场景三④): 「快到期」. The deadline an item carries (`due`: what the update agent read in
// its original, inbox.mjs) is Streams' to remind of — the update agent never hands an item in again for it (sop/update.md).
//
// parseDue(text) -> 'YYYY-MM-DD' | null
//   The agent writes the date as it read it. Read: 2026-12-31 · 2026/12/31 · 2026.12.31 · 2026年12月31日 ·
//   December 31, 2026 · Dec. 31, 2026 · 31 December 2026. Several dates (a period, 「12 月 1 日至 12 月 31 日」 written in
//   full): the latest — a deadline is where a period ends. No date read: null (the item is not listed; its text stays).
// daysUntil(isoDay, now) -> whole days from today (the local calendar day of `now`) to that day: 0 today, 1 tomorrow, -1
//   yesterday.
// dueSoon(libraryDir, { now, within = 30, hidden = [] }) -> [{ url, title, due, dueText, days, where, id? }]
//   Every item of the library whose deadline is today or in the next `within` days: the ones in 待看 (where 'inbox') and
//   the kept notes (where 'kept', with the note's id). Not listed: a past deadline, a dismissed item (it is not in 待看
//   any more, and it never became a note), one beyond `within`, `hidden` (urls: the dismissal still undoable). Nearest
//   first, then by title. It reads only what is on disk now: nothing depends on today's update having handed anything in.
// DUE_NOTICE_DAYS = [7, 1]: a notification 7 days before and 1 day before (A12, B23).
// dueNotices(libraryDir, { now, hidden }) -> [{ ...item, notice: 7 | 1 }]   what to notify now: an item at 2–7 days whose 7-day
//   notice was never sent, and one at 0–1 day whose 1-day notice was never sent (that one only, when both are owed).
// markDueNotices(libraryDir, notices, { now }) -> records them in _pipeline/due-notices.json, by the item's address and its
//   deadline ({ "<url>": { "due": "2026-12-03", "7": "2026-11-26", "1": "2026-12-02" } }): opening the app twice on one day
//   notifies once; keeping an item after its 7-day notice does not notify again (a note keeps its address in `source`); a
//   deadline that changed starts over.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listInbox } from './inbox.mjs';
import { scanLibrary } from '../library/scan.mjs';
import { localIsoDate } from '../fetch/dates.mjs';

export const DUE_WITHIN_DAYS = 30;
export const DUE_NOTICE_DAYS = Object.freeze([7, 1]);
export const DUE_NOTICES_FILE = join('_pipeline', 'due-notices.json');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthOf = (word) => {
  const w = word.toLowerCase().replace(/\.$/, '');
  const i = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
  return i < 0 ? null : i + 1;
};

function isoOf(y, m, d) {
  const [Y, M, D] = [Number(y), Number(m), Number(d)];
  if (!(Y >= 1900 && Y <= 2999 && M >= 1 && M <= 12 && D >= 1 && D <= 31)) return null;
  const dt = new Date(Date.UTC(Y, M - 1, D));
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null;
  return `${String(Y).padStart(4, '0')}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
}

export function parseDue(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const found = [];
  const s = text;
  for (const m of s.matchAll(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/g)) found.push(isoOf(m[1], m[2], m[3]));
  for (const m of s.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g)) found.push(isoOf(m[1], m[2], m[3]));
  for (const m of s.matchAll(/\b([A-Za-z]{3,9}\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) { const mo = monthOf(m[1]); if (mo) found.push(isoOf(m[3], mo, m[2])); }
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}\.?),?\s+(\d{4})\b/g)) { const mo = monthOf(m[2]); if (mo) found.push(isoOf(m[3], mo, m[1])); }
  const days = found.filter(Boolean).sort();
  return days.length ? days[days.length - 1] : null;
}

export function daysUntil(isoDay, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay ?? '');
  if (!m) return null;
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localIsoDate(now));
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+t[1], +t[2] - 1, +t[3])) / 86_400_000);
}

export function dueSoon(libraryDir, { now = () => new Date(), within = DUE_WITHIN_DAYS, hidden = [] } = {}) {
  const clock = now();
  const hide = new Set(hidden);
  const out = [];
  const seen = new Set();
  const add = (entry) => {
    const due = parseDue(entry.dueText);
    if (!due) return;
    const days = daysUntil(due, clock);
    if (days === null || days < 0 || days > within) return;
    if (seen.has(entry.url)) return;
    seen.add(entry.url);
    out.push({ ...entry, due, days });
  };
  for (const c of listInbox(libraryDir, { now })) {
    if (hide.has(c.url) || typeof c.due !== 'string') continue;
    add({ url: c.url, title: c.title ?? '', dueText: c.due, where: 'inbox' });
  }
  let notes = [];
  try { notes = scanLibrary(libraryDir).valid; } catch { notes = []; }
  for (const n of notes) {
    const d = n.meta?.due;
    if (typeof d !== 'string' || typeof n.meta.source !== 'string') continue;
    add({ url: n.meta.source, title: n.meta.title ?? '', dueText: d, where: 'kept', id: n.meta.id });
  }
  out.sort((a, b) => a.days - b.days || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return out;
}

function readNotices(libraryDir) {
  const file = join(libraryDir, DUE_NOTICES_FILE);
  if (!existsSync(file)) return {};
  try {
    const v = JSON.parse(readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function dueNotices(libraryDir, { now = () => new Date(), hidden = [] } = {}) {
  const sent = readNotices(libraryDir);
  const out = [];
  for (const item of dueSoon(libraryDir, { now, within: Math.max(...DUE_NOTICE_DAYS), hidden })) {
    const rec = sent[item.url]?.due === item.due ? sent[item.url] : {};
    const notice = item.days <= 1 ? 1 : 7;
    if (rec[String(notice)]) continue;
    out.push({ ...item, notice });
  }
  return out;
}

export function markDueNotices(libraryDir, notices, { now = () => new Date() } = {}) {
  if (!Array.isArray(notices) || notices.length === 0) return;
  const sent = readNotices(libraryDir);
  const day = localIsoDate(now());
  for (const n of notices) {
    const rec = sent[n.url]?.due === n.due ? { ...sent[n.url] } : { due: n.due };
    rec[String(n.notice)] = day;
    // the 1-day notice stands for the 7-day one too: it is never sent after it
    if (n.notice === 1 && !rec['7']) rec['7'] = day;
    sent[n.url] = rec;
  }
  const file = join(libraryDir, DUE_NOTICES_FILE);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sent, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}
