// estimateRound(libraryDir) -> { sources, paused, recentRounds, queued, expectedItems:[lo,hi], expectedCalls:[lo,hi], cap }
// The pre-run estimate (mockup S12): sources from streams.json, the new-item range of the last 7 rounds
// from fetch_log, the items already waiting in the queue from the ledger, the cap from the pipeline config.
// Calls: every item costs at least gate 1 (×1) and at most gate 1 + body gate + summary + its judge (×4).
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { readFetchLog } from '../fetch/log.mjs';
import { pipelineFrom } from './config.mjs';
import { buildQueue } from './queue.mjs';

export const RECENT_ROUNDS = 7;
export const CALLS_PER_ITEM = [1, 4];

export function recentNewCounts(entries, n = RECENT_ROUNDS) {
  const byRound = new Map();
  for (const e of entries) {
    if (typeof e.round !== 'string') continue;
    byRound.set(e.round, (byRound.get(e.round) ?? 0) + (Number.isInteger(e.new) ? e.new : 0));
  }
  return [...byRound.values()].slice(-n);
}

export function estimateRound(libraryDir) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  const cfg = pipelineFrom(r.config);
  const sources = Array.isArray(r.config.sources) ? r.config.sources : [];
  const paused = sources.filter((s) => s && s.paused === true).length;
  const recent = recentNewCounts(readFetchLog(libraryDir).entries);
  const lo = recent.length ? Math.min(...recent) : 0;
  const hi = recent.length ? Math.max(...recent) : 0;
  const q = buildQueue(libraryDir, cfg);
  const queued = Object.values(q.byNode).reduce((n, list) => n + list.length, 0) + q.summary.length;
  return {
    sources: sources.length,
    paused,
    recentRounds: recent.length,
    queued,
    expectedItems: [lo, hi],
    expectedCalls: [(lo + queued) * CALLS_PER_ITEM[0], (hi + queued) * CALLS_PER_ITEM[1]],
    cap: cfg.cap,
  };
}
