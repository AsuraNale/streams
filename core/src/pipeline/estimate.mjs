// estimateRound(libraryDir) -> { sources, paused, recentRounds, queued, expectedItems:[lo,hi], expectedCalls:[lo,hi], cap }
// The pre-run estimate (mockup S12): sources from streams.json, the new-item range of the last 7 rounds
// from fetch_log, the items already waiting in the queue from the ledger, the cap from the pipeline config.
// Calls: every item costs at least gate 1 (×1) and at most gate 1 + body gate + summary + its judge (×4).
// estimateFirstRound({ items, cap }) -> { expectedCalls:[lo,hi], items, cap }   (redesign R4a, 新建库's 「预计 n–m 次模型调用」)
//   a library that is not made yet has no rounds to go by: `items` is what one try of each of its sources found (the form's
//   rows); the run's self-check call (SELF_CHECK_CALLS) plus the items' calls as above, each side at most `cap`.
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { readFetchLog } from '../fetch/log.mjs';
import { DEFAULTS, pipelineFrom } from './config.mjs';
import { buildQueue } from './queue.mjs';

export const RECENT_ROUNDS = 7;
export const CALLS_PER_ITEM = [1, 4];
// the run's self-check: one call before anything is fetched (round.mjs selfCheck; the funnel's 「运行前自检 1」)
export const SELF_CHECK_CALLS = 1;

export function estimateFirstRound({ items = 0, cap = DEFAULTS.cap } = {}) {
  const n = Number.isInteger(items) && items > 0 ? items : 0;
  const c = Number.isInteger(cap) && cap > 0 ? cap : DEFAULTS.cap;
  return { expectedCalls: [SELF_CHECK_CALLS + Math.min(c, n * CALLS_PER_ITEM[0]), SELF_CHECK_CALLS + Math.min(c, n * CALLS_PER_ITEM[1])], items: n, cap: c };
}

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
