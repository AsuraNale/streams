// fetchRound(libraryDir, { config?, ctx? })
//   -> { round: { id, startedAt }, perSource: [...], newItems: [...], maybeDuplicates: [{ url, of }] }
//
// One collection round over streams.json `sources[]`:
//   - every source is handled on its own; a bad one never stops the others (the round never throws
//     for a source problem, only for a missing / broken streams.json or an unreadable ledger);
//   - paused sources are skipped and logged with status 'paused';
//   - every source gets one fetch_log line (see log.mjs);
//   - first-layer dedup: an item whose url the ledger already knows is skipped (nothing written);
//   - second-layer dedup: a new item whose normalized title equals that of a ledger entry or of an
//     earlier item in this round is still registered, but its `seen` event carries
//     maybe_duplicate_of: <that url>. Nothing is dropped or merged automatically;
//   - seen events take their ts from ctx.now, the same clock as the fetch_log line;
//   - the logged status is the fetcher's status, except:
//       * an `ok` fetch whose items were all already known is logged as `empty`
//         (count = parsed items, new = 0): "no new content" is what the user needs to hear;
//       * a fetch whose new items could not be written to the ledger is logged as `failed` with the
//         ledger error in the message. It is never `empty`: nothing was recorded, so next run must
//         fetch again.
//
// Disk writes: fetch_log.jsonl (this module, through appendFetchLog) and ledger.jsonl (through
// appendEvent). Nothing else. Never the note folder (V2).
import { randomBytes } from 'node:crypto';
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { appendEvent, replayLedger } from '../library/ledger.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { makeContext } from './context.mjs';
import { normalizeTitle } from './html.mjs';
import { appendFetchLog } from './log.mjs';
import { fetchSource, sourceName } from './source.mjs';
import { PAUSED_STATE, hintOf } from './states.mjs';

function roundId(startedAt) {
  const stamp = startedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `r-${stamp}-${randomBytes(3).toString('hex')}`;
}

function loadConfig(libraryDir, config) {
  if (config !== undefined) {
    if (!isPlainObject(config)) throw new StreamsError('bad-config', 'config must be a plain object');
    return config;
  }
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config-${r.error.code}`, r.error.message);
  return r.config;
}

// Index of what the ledger already holds: urls, and normalized title -> first url with that title.
function knownFromLedger(libraryDir) {
  const { states } = replayLedger(libraryDir);
  const urls = new Set();
  const titles = new Map();
  for (const [url, s] of states) {
    urls.add(url);
    const key = normalizeTitle(s.title);
    if (key !== '' && !titles.has(key)) titles.set(key, url);
  }
  return { urls, titles };
}

function describeError(e) {
  return `unexpected ${e?.name ?? 'Error'}: ${String(e?.message ?? e).slice(0, 160)}`;
}

export async function fetchRound(libraryDir, { config, ctx } = {}) {
  if (typeof libraryDir !== 'string' || libraryDir === '') throw new StreamsError('bad-argument', 'libraryDir is required');
  const cfg = loadConfig(libraryDir, config);
  const sources = Array.isArray(cfg.sources) ? cfg.sources : [];
  const c = makeContext(ctx);
  const startedAt = c.now().toISOString();
  const round = { id: roundId(startedAt), startedAt };
  const known = knownFromLedger(libraryDir);
  const perSource = [];
  const newItems = [];
  const maybeDuplicates = [];

  for (const source of sources) {
    let name = '?';
    let kind = '';
    let r;
    try {
      // Everything that reads the source object happens in here: a getter that throws, a kind that
      // is not a string, a paused flag that explodes — all of it is a failed source, not a dead round.
      name = sourceName(source);
      kind = isPlainObject(source) && typeof source.kind === 'string' ? source.kind.trim().toLowerCase() : '';
      if (isPlainObject(source) && source.paused === true) {
        const line = appendFetchLog(libraryDir, {
          ts: c.now().toISOString(), round: round.id, source: name, kind, status: PAUSED_STATE, hint: hintOf(PAUSED_STATE), count: 0, new: 0, message: 'paused',
        });
        perSource.push({ name, kind, status: PAUSED_STATE, hint: line.hint, count: 0, newCount: 0, message: line.message });
        continue;
      }
      r = await fetchSource(source, c);
    } catch (e) {
      r = { source: name, kind, status: 'failed', hint: hintOf('failed'), message: describeError(e), items: [] };
    }

    const ts = c.now().toISOString();
    let newCount = 0;
    let ledgerError;
    for (const item of r.items) {
      if (typeof item.url !== 'string' || item.url === '' || known.urls.has(item.url)) continue; // layer 1
      const key = normalizeTitle(item.title);
      const dupOf = key !== '' && known.titles.has(key) && known.titles.get(key) !== item.url ? known.titles.get(key) : undefined;
      try {
        // the item's own summary rides along: gate 1 reads it as material when no body is fetched (W4)
        appendEvent(libraryDir, { ts, ev: 'seen', url: item.url, source: item.source, title: item.title, date: item.date, summary: item.summary || undefined, maybe_duplicate_of: dupOf });
      } catch (e) {
        ledgerError = e;
        break; // the rest of this source's items stay unregistered; next run fetches them again
      }
      known.urls.add(item.url);
      if (key !== '' && !known.titles.has(key)) known.titles.set(key, item.url);
      newCount += 1;
      const out = { ...item };
      if (dupOf !== undefined) {
        out.maybeDuplicateOf = dupOf;
        maybeDuplicates.push({ url: item.url, of: dupOf });
      }
      newItems.push(out);
    }

    let status = r.status;
    let message = r.message;
    if (ledgerError) {
      status = 'failed';
      message = `ledger write failed after ${newCount} new item(s): ${String(ledgerError?.message ?? ledgerError).slice(0, 200)}`;
    } else if (r.status === 'ok' && newCount === 0) {
      status = 'empty';
      message = `${r.items.length} item(s), all already seen`;
    }
    const line = appendFetchLog(libraryDir, {
      ts,
      round: round.id,
      source: r.source,
      kind: r.kind,
      status,
      hint: hintOf(status),
      http: r.http,
      count: r.items.length,
      new: newCount,
      message,
      retry_after_seconds: r.retryAfterSeconds,
    });
    const ps = { name: r.source, kind: r.kind, status, hint: line.hint, count: line.count, newCount, message: line.message };
    if (r.http !== undefined) ps.http = r.http;
    if (r.retryAfterSeconds !== undefined) ps.retryAfterSeconds = r.retryAfterSeconds;
    perSource.push(ps);
  }

  return { round, perSource, newItems, maybeDuplicates };
}
