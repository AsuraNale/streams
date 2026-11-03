// homeNumbers(libraryDir, { now }) -> { caught, inbox, inboxOldestDays, kept, dismissed, lastRound, sources:{ level, lines } }
// Every number is recomputed from the ledger, fetch_log and rounds.jsonl (mockup S2): nothing is cached.
//   caught   items still at stage seen (fetched, not yet in the inbox nor decided)
//   inbox    items at stage inbox; inboxOldestDays = the longest wait among them
//   kept / dismissed  terminal counts
//   lastRound  the last rounds.jsonl record (id, startedAt, finishedAt, counts, calls, stoppedAt) or null
//   sources    sourceHealth(lastRoundStatus)
// constantScoreWarning(scored, { min }) -> '' | one line   (toolkit F3: one source, >= min items, all the same score)
import { replayLedger } from '../library/ledger.mjs';
import { lastRoundStatus } from '../fetch/log.mjs';
import { sourceHealth } from '../fetch/health.mjs';
import { listRounds } from './rounds-log.mjs';

export const MIN_CONSTANT_RUN = 5;

function days(fromIso, now) {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function homeNumbers(libraryDir, { now = () => new Date() } = {}) {
  const { states } = replayLedger(libraryDir);
  const clock = now();
  const out = { caught: 0, inbox: 0, inboxOldestDays: 0, kept: 0, dismissed: 0, lastRound: null, sources: null };
  for (const s of states.values()) {
    if (s.stage === 'seen') out.caught += 1;
    else if (s.stage === 'inbox') {
      out.inbox += 1;
      out.inboxOldestDays = Math.max(out.inboxOldestDays, days(s.lastTs, clock));
    } else if (s.stage === 'kept') out.kept += 1;
    else if (s.stage === 'dismissed') out.dismissed += 1;
  }
  const last = listRounds(libraryDir, 1)[0];
  if (last) out.lastRound = { id: last.id, startedAt: last.startedAt, finishedAt: last.finishedAt, counts: last.counts, gates: last.gates, calls: last.calls, stoppedAt: last.stoppedAt ?? null };
  out.sources = sourceHealth(lastRoundStatus(libraryDir));
  return out;
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
