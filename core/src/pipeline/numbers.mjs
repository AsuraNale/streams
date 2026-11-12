// homeNumbers(libraryDir, { now }) -> { caught, inbox, inboxOldestDays, later, kept, dismissed, lastRound, noOutputStreak, sources:{ level, lines } }
// Every number is recomputed from the ledger, fetch_log and rounds.jsonl (mockup S2): nothing is cached.
//   caught   items still at stage seen (fetched, not yet in the inbox nor decided)
//   inbox    items at stage inbox; inboxOldestDays = the longest wait among them. Redesign R2: an item put aside with 稍后处理
//            (later.mjs) is not counted here but in `later` — 「n 条待看」 is the list the page shows
//   kept / dismissed  terminal counts
//   lastRound  the last rounds.jsonl record (id, startedAt, finishedAt, counts, calls, stoppedAt) or null
//   noOutputStreak  from the newest rounds.jsonl record back: how many rounds in a row put nothing into the inbox
//              (counts.inbox 0, missing, or not a number); the first round that did stops the count (plan C8: 今日 says so
//              from NO_OUTPUT_ROUNDS on)
//   sources    sourceHealth(lastRoundStatus)
// constantScoreWarning(scored, { min }) -> '' | one line   (toolkit F3: one source, >= min items, all the same score)
import { replayLedger } from '../library/ledger.mjs';
import { lastRoundStatus } from '../fetch/log.mjs';
import { sourceHealth } from '../fetch/health.mjs';
import { readRounds } from './rounds-log.mjs';
import { readLater } from './later.mjs';

export const MIN_CONSTANT_RUN = 5;
// 今日's banner 「连续 N 轮没有产出」 shows from this many rounds in a row without output (plan C8)
export const NO_OUTPUT_ROUNDS = 3;

function days(fromIso, now) {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function homeNumbers(libraryDir, { now = () => new Date() } = {}) {
  const { states } = replayLedger(libraryDir);
  const later = readLater(libraryDir);
  const clock = now();
  const out = { caught: 0, inbox: 0, inboxOldestDays: 0, later: 0, kept: 0, dismissed: 0, lastRound: null, noOutputStreak: 0, sources: null };
  for (const s of states.values()) {
    if (s.stage === 'seen') out.caught += 1;
    else if (s.stage === 'inbox' && later.has(s.url)) out.later += 1;
    else if (s.stage === 'inbox') {
      out.inbox += 1;
      out.inboxOldestDays = Math.max(out.inboxOldestDays, days(s.lastTs, clock));
    } else if (s.stage === 'kept') out.kept += 1;
    else if (s.stage === 'dismissed') out.dismissed += 1;
  }
  const rounds = readRounds(libraryDir).reverse();
  const last = rounds[0];
  out.noOutputStreak = noOutputStreak(rounds);
  if (last) out.lastRound = { id: last.id, startedAt: last.startedAt, finishedAt: last.finishedAt, counts: last.counts, gates: last.gates, calls: last.calls, stoppedAt: last.stoppedAt ?? null, ...(last.callsBy ? { callsBy: last.callsBy } : {}) };
  out.sources = sourceHealth(lastRoundStatus(libraryDir));
  return out;
}

// rounds newest first: the rounds in a row, from the first, whose counts.inbox is 0 (or missing, or not a number)
export function noOutputStreak(rounds) {
  let n = 0;
  for (const r of Array.isArray(rounds) ? rounds : []) {
    const inbox = r?.counts?.inbox;
    if (typeof inbox === 'number' && Number.isFinite(inbox) && inbox > 0) break;
    n += 1;
  }
  return n;
}

// scored: [{ url, source, score }] of one round. A warning, never a rejection: a machine cannot tell a
// lazy blanket score from a correct one (52 issue-index pages at 0.15 were right), so it reports and
// a person decides. Sources are listed in alphabetical order so the line is stable.
export function constantScoreWarning(scored, { min = MIN_CONSTANT_RUN } = {}) {
  const bySource = new Map();
  for (const s of Array.isArray(scored) ? scored : []) {
    if (!s || typeof s.score !== 'number' || !Number.isFinite(s.score)) continue;
    const src = typeof s.source === 'string' && s.source !== '' ? s.source : '?';
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src).push(s.score);
  }
  const flagged = [];
  for (const [src, scores] of bySource) {
    if (scores.length >= min && new Set(scores).size === 1) flagged.push(`${src} (${scores.length} items all at ${scores[0]})`);
  }
  if (flagged.length === 0) return '';
  flagged.sort();
  return `constant-score: ${flagged.join('; ')}`;
}
