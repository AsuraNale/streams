// The status page (core-api 5.7, mockup S11). Every number is recomputed from the jsonl files.
//
// statusView(libraryDir, { now? }) -> {
//   lastRound       the newest rounds.jsonl line, or null
//   lastRoundItems  ledger `inbox` events carrying that round's id
//   lastDecisionAt  ts of the last `kept` / `dismissed` line of the ledger, or null
//   monthUsage      readUsage(libraryDir, { month: the UTC month of now() })
//   sources         one row per configured source: { name, kind, status, http, message, consecutive, lastOkAt, hint, paused }
//                   (status / hint / http / lastOkAt null and consecutive 0 when it has no fetch on record)
//   health          sourceHealth() over the configured sources' latest fetch_log state
// }
// The connections part is the desktop's (getConnections); the core does not touch it.
import { existsSync, readFileSync } from 'node:fs';
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { ledgerPath } from '../library/ledger.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { lastRoundStatus } from '../fetch/log.mjs';
import { sourceHealth } from '../fetch/health.mjs';
import { readUsage } from '../connect/usage.mjs';
import { latestFetchLines, sourceRow } from '../library/sources.mjs';
import { listRounds } from './rounds-log.mjs';

function ledgerEvents(libraryDir) {
  const path = ledgerPath(libraryDir);
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    try {
      const ev = JSON.parse(raw);
      if (isPlainObject(ev) && typeof ev.ev === 'string') out.push(ev);
    } catch {
      // a broken line is skipped, never fatal (same rule as replayLedger)
    }
  }
  return out;
}

export function statusView(libraryDir, { now = () => new Date() } = {}) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  const config = r.config;
  const clock = now();

  const lastRound = listRounds(libraryDir, 1)[0] ?? null;
  const events = ledgerEvents(libraryDir);
  const lastRoundItems = lastRound ? events.filter((e) => e.ev === 'inbox' && e.round === lastRound.id).length : 0;
  let lastDecisionAt = null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].ev === 'kept' || events[i].ev === 'dismissed') { lastDecisionAt = typeof events[i].ts === 'string' ? events[i].ts : null; break; }
  }

  const configured = (Array.isArray(config.sources) ? config.sources : []).filter((s) => isPlainObject(s) && typeof s.name === 'string' && s.name !== '');
  const lines = latestFetchLines(libraryDir);
  const sources = configured.map((s) => {
    const row = sourceRow(s, lines);
    return { name: s.name, kind: s.kind ?? '', status: row.status, http: row.http, message: row.message, consecutive: row.consecutive, lastOkAt: row.lastOkAt, hint: row.hint, paused: row.paused };
  });
  const all = lastRoundStatus(libraryDir);
  const names = new Set(configured.map((s) => s.name));
  const current = Object.fromEntries(Object.entries(all).filter(([name]) => names.has(name)));

  return {
    lastRound,
    lastRoundItems,
    lastDecisionAt,
    monthUsage: readUsage(libraryDir, { month: clock.toISOString().slice(0, 7) }),
    sources,
    health: sourceHealth(current),
  };
}
