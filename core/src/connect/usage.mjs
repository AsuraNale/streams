// _pipeline/usage.jsonl: one line per model call, append only.
//   { ts, kind, model, calls: 1, inputTokens?, outputTokens?, costUsd?, purpose, ok?, code? }
//
// createUsageCounter(libraryDir, { now }) -> { record(entry), wrap(connector, purpose), path }
// readUsage(libraryDir, { month }) -> { month, calls, inputTokens, outputTokens, costUsd, byKind, byPurpose, byModel, skipped }
// `month` = 'YYYY-MM' of the UTC timestamp; default = the current UTC month. The status page's
// "calls this month" is readUsage(dir).calls.
// usageTotal(libraryDirs, { month }) -> { month, calls, inputTokens, outputTokens, costUsd, byKind, libraries, missing }
//   every library's readUsage added up (v2 package A: the settings page's 「全部库本月用量合计」, 维护者 11-05):
//   byKind = calls per connection (claude-code · codex · api · …), the totals beside it; libraries = [{ dir, calls }] in
//   the order given; a folder that is not there is skipped and listed in `missing` (no error).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';

export const USAGE_FILE = join('_pipeline', 'usage.jsonl');

export function usagePath(libraryDir) {
  return join(libraryDir, USAGE_FILE);
}

export function monthOf(ts) {
  return String(ts).slice(0, 7);
}

export function createUsageCounter(libraryDir, { now = () => new Date() } = {}) {
  if (typeof libraryDir !== 'string' || libraryDir === '') throw new StreamsError('bad-library-dir', 'libraryDir is required');
  const path = usagePath(libraryDir);

  function record(entry) {
    if (!entry || typeof entry !== 'object') throw new StreamsError('bad-usage', 'entry must be an object');
    if (typeof entry.kind !== 'string' || entry.kind === '') throw new StreamsError('bad-usage', 'entry is missing "kind"');
    if (typeof entry.purpose !== 'string' || entry.purpose === '') throw new StreamsError('bad-usage', 'entry is missing "purpose"');
    const line = {
      ts: typeof entry.ts === 'string' && entry.ts !== '' ? entry.ts : now().toISOString(),
      kind: entry.kind,
      model: typeof entry.model === 'string' ? entry.model : 'default',
      // 0 is a real value: a failure that sent no request (not installed, no key) counts as no call. Only an absent calls means 1.
      calls: Number.isInteger(entry.calls) && entry.calls >= 0 ? entry.calls : 1,
    };
    if (typeof entry.inputTokens === 'number') line.inputTokens = entry.inputTokens;
    if (typeof entry.outputTokens === 'number') line.outputTokens = entry.outputTokens;
    if (typeof entry.costUsd === 'number') line.costUsd = entry.costUsd;
    line.purpose = entry.purpose;
    if (typeof entry.ok === 'boolean') line.ok = entry.ok;
    if (typeof entry.code === 'string') line.code = entry.code;
    mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
    appendFileSync(path, JSON.stringify(line) + '\n', 'utf8');
    return line;
  }

  // Same connector; every complete() lands in usage.jsonl under `purpose`, every probe() under 'probe'.
  // (A connector's own probe closes over its inner complete, so probe must be wrapped on its own.)
  function wrap(connector, purpose) {
    if (typeof purpose !== 'string' || purpose === '') throw new StreamsError('bad-usage', 'purpose is required');
    const note = (r, p) => {
      const u = r.usage || {};
      record({ kind: connector.kind, model: r.model, calls: u.calls, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, purpose: p, ok: r.ok, code: r.ok ? undefined : r.code });
    };
    return {
      ...connector,
      async complete(req) {
        const r = await connector.complete(req);
        note(r, purpose);
        return r;
      },
      async probe() {
        const r = await connector.probe();
        note(r, 'probe');
        return r;
      },
    };
  }

  return { path, record, wrap };
}

export function readUsage(libraryDir, { month } = {}) {
  const m = month ?? monthOf(new Date().toISOString());
  const out = { month: m, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byKind: {}, byPurpose: {}, byModel: {}, skipped: [] };
  const path = usagePath(libraryDir);
  if (!existsSync(path)) return out;
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    if (raw.trim() === '') return;
    let e;
    try { e = JSON.parse(raw); } catch { out.skipped.push({ line: i + 1, reason: 'not-json' }); return; }
    if (!e || typeof e !== 'object' || typeof e.ts !== 'string') { out.skipped.push({ line: i + 1, reason: 'bad-shape' }); return; }
    if (monthOf(e.ts) !== m) return;
    const calls = typeof e.calls === 'number' ? e.calls : 1;
    out.calls += calls;
    if (typeof e.inputTokens === 'number') out.inputTokens += e.inputTokens;
    if (typeof e.outputTokens === 'number') out.outputTokens += e.outputTokens;
    if (typeof e.costUsd === 'number') out.costUsd += e.costUsd;
    bump(out.byKind, e.kind, calls);
    bump(out.byPurpose, e.purpose, calls);
    bump(out.byModel, e.model, calls);
  });
  return out;
}

export function usageTotal(libraryDirs, { month } = {}) {
  const m = month ?? monthOf(new Date().toISOString());
  const out = { month: m, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byKind: {}, libraries: [], missing: [] };
  for (const dir of Array.isArray(libraryDirs) ? libraryDirs : []) {
    if (typeof dir !== 'string' || dir === '' || !existsSync(dir)) { out.missing.push(dir); continue; }
    const u = readUsage(dir, { month: m });
    out.calls += u.calls;
    out.inputTokens += u.inputTokens;
    out.outputTokens += u.outputTokens;
    out.costUsd += u.costUsd;
    for (const [kind, n] of Object.entries(u.byKind)) bump(out.byKind, kind, n);
    out.libraries.push({ dir, calls: u.calls });
  }
  return out;
}

function bump(map, key, n) {
  const k = typeof key === 'string' && key !== '' ? key : 'unknown';
  map[k] = (map[k] || 0) + n;
}
