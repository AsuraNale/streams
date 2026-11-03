// _pipeline/inbox/<sha1(url)>.json: one file per item waiting for the user's decision (product spec 4.5 step 6).
// The ledger's `inbox` event is the truth about the stage; the file holds what the card shows.
//
// writeInboxItem(libraryDir, item) -> { file }
// readInboxItem(libraryDir, url)   -> item | null
// removeInboxItem(libraryDir, url) -> { removed }
// listInbox(libraryDir, { now })   -> cards sorted by relevance score desc, then substance desc
//   [{ url, title, source, date, scores:{ relevance:{score,reason}, substance:{…}, freshness:{value,reason} },
//      summary:{ what, points, quote }, verification:{ passed, rounds, failed:[] }, waitingDays, maybeDuplicateOf?, inboxAt }]
//   waitingDays is computed from the ledger's inbox event ts, not from the file.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { replayLedger } from '../library/ledger.mjs';

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
    };
    if (s.maybeDuplicateOf) card.maybeDuplicateOf = s.maybeDuplicateOf;
    if (item.materials) card.materials = item.materials;
    if (item.scoreless === true) { card.scoreless = true; card.excerpt = typeof item.excerpt === 'string' ? item.excerpt : ''; }
    cards.push(card);
  }
  const score = (c, k) => (typeof c.scores[k]?.score === 'number' ? c.scores[k].score : -1);
  cards.sort((a, b) => score(b, 'relevance') - score(a, 'relevance') || score(b, 'substance') - score(a, 'substance') || (a.url < b.url ? -1 : 1));
  return cards;
}
