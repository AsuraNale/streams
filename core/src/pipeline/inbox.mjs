// _pipeline/inbox/<sha1(url)>.json: one file per item waiting for the user's decision (product spec 4.5 step 6).
// The ledger's `inbox` event is the truth about the stage; the file holds what the card shows.
//
// writeInboxItem(libraryDir, item) -> { file }
// readInboxItem(libraryDir, url)   -> item | null
// removeInboxItem(libraryDir, url) -> { removed }
// listInbox(libraryDir, { now })   -> cards newest first (1.1 W6a), then by url (1.1 W7b: no score decides an order)
//   [{ url, title, source, date, scores:{ <v1.0 step>:{score,reason} | {value,reason} } ({} for 1.1's items),
//      summary:{ what, points, quote }, verification:{ passed, rounds, failed:[], aiInstruction? }, waitingDays, maybeDuplicateOf?,
//      inboxAt, aiInstruction?, firstSeen, moved?, later?, laterAt? }]   aiInstruction:true = the material had 「写给 AI 的话」
//   (v2 D1; the ledger inbox event says so). Redesign R2: firstSeen (the ledger's first event), moved:'rejected' (moved in
//   from 未通过筛选 by the user), later:true + laterAt (稍后处理, later.mjs) — the list still has them; the page sets them apart.
//   waitingDays is computed from the ledger's inbox event ts, not from the file.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { replayLedger } from '../library/ledger.mjs';
import { readLater } from './later.mjs';
import { readOriginal } from '../read/original.mjs';

// 1.1 W6a: how much of the original's opening a card shows (维护者 11-21: 「一百来字」, then 「打开存下的原文」)
export const OPENING_CHARS = 120;

/** The first OPENING_CHARS characters of an original's text, whitespace run together, ended with … when cut. */
export function openingOf(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length <= OPENING_CHARS ? t : `${chars.slice(0, OPENING_CHARS).join('')}……`;
}

export const INBOX_DIR = join('_pipeline', 'inbox');

export function inboxKey(url) {
  return createHash('sha1').update(String(url)).digest('hex');
}

export function inboxPath(libraryDir, url) {
  return join(libraryDir, INBOX_DIR, `${inboxKey(url)}.json`);
}

export function writeInboxItem(libraryDir, item) {
  if (!item || typeof item.url !== 'string' || item.url === '') throw new StreamsError('bad-argument', 'inbox item needs a url');
  mkdirSync(join(libraryDir, INBOX_DIR), { recursive: true });
  const file = inboxPath(libraryDir, item.url);
  writeFileSync(file, JSON.stringify(item, null, 2) + '\n', 'utf8');
  return { file };
}

export function readInboxItem(libraryDir, url) {
  const file = inboxPath(libraryDir, url);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function removeInboxItem(libraryDir, url) {
  const file = inboxPath(libraryDir, url);
  if (!existsSync(file)) return { removed: false };
  unlinkSync(file);
  return { removed: true };
}

function daysBetween(fromIso, now) {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function listInbox(libraryDir, { now = () => new Date() } = {}) {
  const { states } = replayLedger(libraryDir);
  const later = readLater(libraryDir);
  const clock = now();
  const cards = [];
  for (const s of states.values()) {
    if (s.stage !== 'inbox') continue;
    const item = readInboxItem(libraryDir, s.url) ?? {};
    const scores = {};
    for (const [k, v] of Object.entries(s.scores)) scores[k] = typeof v.score === 'number' ? { score: v.score, reason: v.reason } : { value: v.value, reason: v.reason };
    const card = {
      url: s.url,
      title: item.title ?? s.title ?? '',
      source: item.source ?? s.source ?? '',
      date: item.date ?? s.date ?? '',
      scores,
      summary: item.summary ?? { what: '', points: [], quote: '' },
      verification: item.verification ?? { passed: false, rounds: 0, failed: [] },
      waitingDays: daysBetween(s.lastTs, clock),
      inboxAt: s.lastTs,
      // redesign R2: when it was first fetched (详情 「首次抓取」)
      firstSeen: s.firstSeen ?? null,
    };
    // redesign R2: moved in by the user from 未通过筛选 (N02): no summary, no check — the card says so
    if (s.moved === 'rejected' || item.moved === 'rejected') card.moved = 'rejected';
    // redesign R2: put aside with 稍后处理 until the library's next run has ended (later.mjs)
    if (later.has(s.url)) { card.later = true; card.laterAt = later.get(s.url); }
    if (s.maybeDuplicateOf) card.maybeDuplicateOf = s.maybeDuplicateOf;
    if (item.materials) card.materials = item.materials;
    // 1.1 W5: the original kept or not (「原文没存下来」), a summary that was not written, the deadline and the agent's reason
    if (item.original) card.original = item.original;
    // 1.1 W6a (A3): the opening of the kept original, when and how it was read — what the card shows under the summary
    if (item.original?.saved === true && typeof item.original.id === 'string') {
      const o = readOriginal(libraryDir, item.original.id);
      if (o) {
        card.opening = openingOf(o.text);
        card.originalAt = o.fetchedAt;
        card.originalMethod = o.method;
      }
    }
    if (item.summaryMissing) card.summaryMissing = item.summaryMissing;
    if (typeof item.due === 'string') card.due = item.due;
    if (typeof item.why === 'string') card.why = item.why;
    if (s.aiInstruction === true || item.aiInstruction === true) card.aiInstruction = true;
    if (item.scoreless === true) { card.scoreless = true; card.excerpt = typeof item.excerpt === 'string' ? item.excerpt : ''; }
    if (card.moved === 'rejected') card.excerpt = typeof item.excerpt === 'string' ? item.excerpt : '';
    cards.push(card);
  }
  // 1.1 W6a (E4): newest first — 1.1 keeps no score; 1.1 W7b: v1.0's scores no longer break a tie of the same moment either
  const t = (c) => Date.parse(c.inboxAt ?? '') || 0;
  cards.sort((a, b) => t(b) - t(a) || (a.url < b.url ? -1 : 1));
  return cards;
}
