// _pipeline/fetch_log.jsonl: one line per source per round, append-only. The health record.
//
//   { ts, round, source, kind, status, hint, http?, count, new, message, retry_after_seconds? }
//     status  ok | empty | gap | failed | blocked | paused
//     count   items the fetch parsed (0 when nothing was fetched)
//     new     items that were not yet in the ledger
//
// appendFetchLog(libraryDir, entry) -> the written line (ts filled in); refuses malformed entries
// readFetchLog(libraryDir)          -> { entries, skipped: [{ line, reason }] }
// lastRoundStatus(libraryDir)       -> { [source]: { status, hint, consecutive, lastTs, lastOkAt, kind, http?, message } }
//     consecutive = how many trailing rounds in a row this source has had this same status
//     lastOkAt    = ts of the latest ok OR empty line (a successful fetch, with or without new items), or null
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { LOG_STATES, hintOf } from './states.mjs';

export const FETCH_LOG_FILE = join('_pipeline', 'fetch_log.jsonl');

export function fetchLogPath(libraryDir) {
  return join(libraryDir, FETCH_LOG_FILE);
}

function checkEntry(entry) {
  if (!isPlainObject(entry)) throw new StreamsError('bad-log-entry', 'entry must be a plain object');
  if (typeof entry.source !== 'string' || entry.source === '') throw new StreamsError('bad-log-entry', 'entry is missing "source"');
  if (typeof entry.status !== 'string' || !LOG_STATES.includes(entry.status)) {
    throw new StreamsError('bad-log-entry', `unknown status "${String(entry.status)}" (valid: ${LOG_STATES.join(' / ')})`);
  }
  if (!Number.isInteger(entry.count) || entry.count < 0) throw new StreamsError('bad-log-entry', '"count" must be a non-negative integer');
  if (!Number.isInteger(entry.new) || entry.new < 0) throw new StreamsError('bad-log-entry', '"new" must be a non-negative integer');
}

export function appendFetchLog(libraryDir, entry) {
  checkEntry(entry);
  const ts = typeof entry.ts === 'string' && entry.ts !== '' ? entry.ts : new Date().toISOString();
  const row = {
    ts,
    round: entry.round,
    source: entry.source,
    kind: entry.kind ?? '',
    status: entry.status,
    hint: entry.hint ?? hintOf(entry.status),
    http: entry.http,
    count: entry.count,
    new: entry.new,
    message: entry.message ?? '',
    retry_after_seconds: entry.retry_after_seconds,
  };
  const line = JSON.stringify(row) + '\n';
  mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
  const path = fetchLogPath(libraryDir);
  const prefix = endsWithoutNewline(path) ? '\n' : '';
  appendFileSync(path, prefix + line, { encoding: 'utf8', flag: 'a' });
  return JSON.parse(line);
}

function endsWithoutNewline(path) {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size === 0) return false;
  const fd = openSync(path, 'r');
  try {
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

export function readFetchLog(libraryDir) {
  const entries = [];
  const skipped = [];
  const path = fetchLogPath(libraryDir);
  if (!existsSync(path)) return { entries, skipped };
  readFileSync(path, 'utf8').split('\n').forEach((raw, i) => {
    const lineNo = i + 1;
    if (raw.trim() === '') return;
    let e;
    try {
      e = JSON.parse(raw);
    } catch {
      skipped.push({ line: lineNo, reason: 'not-json' });
      return;
    }
    if (!isPlainObject(e)) { skipped.push({ line: lineNo, reason: 'not-an-object' }); return; }
    if (typeof e.source !== 'string' || e.source === '') { skipped.push({ line: lineNo, reason: 'missing-source' }); return; }
    if (typeof e.status !== 'string' || !LOG_STATES.includes(e.status)) { skipped.push({ line: lineNo, reason: `unknown-status:${String(e.status)}` }); return; }
    entries.push(e);
  });
  return { entries, skipped };
}

export function lastRoundStatus(libraryDir) {
  const { entries } = readFetchLog(libraryDir);
  const bySource = new Map();
  for (const e of entries) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source).push(e);
  }
  const out = {};
  for (const [source, rows] of bySource) {
    const last = rows[rows.length - 1];
    let consecutive = 0;
    for (let i = rows.length - 1; i >= 0 && rows[i].status === last.status; i -= 1) consecutive += 1;
    let lastOkAt = null;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].status === 'ok' || rows[i].status === 'empty') { lastOkAt = rows[i].ts ?? null; break; }
    }
    const s = {
      status: last.status,
      hint: typeof last.hint === 'string' ? last.hint : hintOf(last.status),
      consecutive,
      lastTs: last.ts ?? null,
      lastOkAt,
      kind: last.kind ?? '',
      message: last.message ?? '',
    };
    if (last.http !== undefined) s.http = last.http;
    if (last.retry_after_seconds !== undefined) s.retryAfterSeconds = last.retry_after_seconds;
    out[source] = s;
  }
  return out;
}
