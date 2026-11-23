// _pipeline/ledger.jsonl: append-only event log, one JSON object per line.
//
// Events (ev): seen | scored | unscored | inbox | kept | dismissed
// appendEvent(libraryDir, ev)       -> written event (ts filled in). Never rewrites.
// replayLedger(libraryDir)          -> { states: Map<url, state>, skipped: [{ line, reason }] }
// recordSeen(libraryDir, { url, source, title, date }) -> { added }   (idempotent per url)
// isSeen(libraryDir, url)           -> boolean
//
// Replay rules:
//   - first `seen` creates the state; a later `seen` for the same url changes nothing
//   - `kept` and `dismissed` are terminal: once there, every later event for that url is ignored
//   - `scored` / `unscored` fill scores / unscored per gate id; `inbox` moves stage to inbox (redesign R2: it remembers the
//     round that put it there as inboxRound, and moved:'rejected' for an item the user moved in from 未通过筛选)
//   - `dismissed` may carry a reason and a quick reason id, or neither (redesign R2: the reason is optional)
//   - malformed lines are skipped and reported, never fatal
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { isPlainObject } from './frontmatter.mjs';

export const LEDGER_FILE = join('_pipeline', 'ledger.jsonl');
export const LEDGER_EVENTS = ['seen', 'scored', 'unscored', 'inbox', 'kept', 'dismissed'];
export const TERMINAL_STAGES = ['kept', 'dismissed'];

export function ledgerPath(libraryDir) {
  return join(libraryDir, LEDGER_FILE);
}

function checkEvent(ev) {
  if (!isPlainObject(ev)) throw new StreamsError('bad-event', 'event must be a plain object');
  if (typeof ev.ev !== 'string' || ev.ev === '') throw new StreamsError('bad-event', 'event is missing "ev"');
  if (!LEDGER_EVENTS.includes(ev.ev)) throw new StreamsError('bad-event', `unknown event kind "${ev.ev}"`);
  if (typeof ev.url !== 'string' || ev.url === '') throw new StreamsError('bad-event', 'event is missing "url"');
  if ((ev.ev === 'scored' || ev.ev === 'unscored') && (typeof ev.node !== 'string' || ev.node === '')) {
    throw new StreamsError('bad-event', `"${ev.ev}" event is missing "node"`);
  }
  if (ev.ev === 'kept' && (typeof ev.id !== 'string' || ev.id === '')) throw new StreamsError('bad-event', '"kept" event is missing "id"');
}

export function appendEvent(libraryDir, ev) {
  checkEvent(ev);
  const ts = typeof ev.ts === 'string' && ev.ts !== '' ? ev.ts : new Date().toISOString();
  // ts and ev first so the line reads naturally; undefined fields are dropped by JSON.stringify
  const line = JSON.stringify({ ts, ev: ev.ev, ...withoutKeys(ev, ['ts', 'ev']) }) + '\n';
  mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
  const path = ledgerPath(libraryDir);
  // A ledger whose last line lost its newline (a hand edit, an interrupted write) must not swallow
  // the previous event: start on a fresh line, never glue two events into one unparseable line.
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

function withoutKeys(obj, keys) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!keys.includes(k)) out[k] = v;
  return out;
}

export function replayLedger(libraryDir) {
  const states = new Map();
  const skipped = [];
  const path = ledgerPath(libraryDir);
  if (!existsSync(path)) return { states, skipped };
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    if (raw.trim() === '') return;
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      skipped.push({ line: lineNo, reason: 'not-json' });
      return;
    }
    if (!isPlainObject(ev)) { skipped.push({ line: lineNo, reason: 'not-an-object' }); return; }
    if (typeof ev.ev !== 'string' || ev.ev === '') { skipped.push({ line: lineNo, reason: 'missing-ev' }); return; }
    if (typeof ev.url !== 'string' || ev.url === '') { skipped.push({ line: lineNo, reason: 'missing-url' }); return; }
    if (!LEDGER_EVENTS.includes(ev.ev)) { skipped.push({ line: lineNo, reason: `unknown-ev:${ev.ev}` }); return; }
    if ((ev.ev === 'scored' || ev.ev === 'unscored') && typeof ev.node !== 'string') { skipped.push({ line: lineNo, reason: 'missing-node' }); return; }
    apply(states, ev);
  });
  return { states, skipped };
}

function apply(states, ev) {
  const ts = typeof ev.ts === 'string' ? ev.ts : null;
  let s = states.get(ev.url);
  if (ev.ev === 'seen') {
    if (s) return; // first-layer dedup: a second `seen` changes nothing
    states.set(ev.url, {
      url: ev.url, source: ev.source, title: ev.title, date: ev.date,
      firstSeen: ts, stage: 'seen', scores: {}, unscored: {}, lastTs: ts,
      // second-layer dedup hint written by the fetch round; absent on most events
      ...(typeof ev.maybe_duplicate_of === 'string' && ev.maybe_duplicate_of !== '' ? { maybeDuplicateOf: ev.maybe_duplicate_of } : {}),
      // the item's own summary when the seen event carries one (gate 1 material when no body is fetched)
      ...(typeof ev.summary === 'string' && ev.summary !== '' ? { summary: ev.summary } : {}),
    });
    return;
  }
  if (!s) {
    s = { url: ev.url, source: undefined, title: undefined, date: undefined, firstSeen: ts, stage: 'seen', scores: {}, unscored: {}, lastTs: ts };
    states.set(ev.url, s);
  }
  if (TERMINAL_STAGES.includes(s.stage)) return; // one-way: kept / dismissed never change again
  switch (ev.ev) {
    case 'scored':
      s.scores[ev.node] = typeof ev.score === 'number' ? { score: ev.score, reason: ev.reason } : { value: ev.value, reason: ev.reason };
      if (typeof ev.quote === 'string') s.scores[ev.node].quote = ev.quote;
      if (typeof ev.materials === 'string') s.scores[ev.node].materials = ev.materials;
      // redesign R5a: the pass mark the score was judged against (a verdict stays where it was when the standard changes).
      // 1.1 W7b: v1.0's `scored` events are only read back (a 1.0 library's ledger); nothing in core/src writes one any more
      if (typeof ev.threshold === 'number') s.scores[ev.node].threshold = ev.threshold;
      delete s.unscored[ev.node];
      rememberCfg(s, ev);
      break;
    case 'unscored':
      s.unscored[ev.node] = ev.reason;
      delete s.scores[ev.node];
      rememberCfg(s, ev);
      break;
    case 'inbox':
      s.stage = 'inbox';
      // v2 D1: the material had 「写给 AI 的话」 (the event carries aiInstruction:true only then)
      if (ev.aiInstruction === true) s.aiInstruction = true;
      // redesign R2: the round that put it there (处理情况 of a run), and an item the user moved in from 未通过筛选 (N02)
      if (typeof ev.round === 'string' && ev.round !== '') s.inboxRound = ev.round;
      if (ev.moved === 'rejected') s.moved = 'rejected';
      break;
    case 'kept':
      s.stage = 'kept';
      s.keptId = ev.id;
      break;
    case 'dismissed':
      s.stage = 'dismissed';
      // redesign R2: a dismissal may carry no reason (the event then has no reason field)
      if (typeof ev.reason === 'string') s.dismissReason = ev.reason;
      if (typeof ev.quick === 'string') s.dismissQuick = ev.quick;
      break;
  }
  s.lastTs = ts;
}

// Pipeline events carry the gate configuration hash (core-api 4.0 "cfg"); the queue compares it
// with the current one. Kept per node only when an event carries it, so W1-shaped events are unchanged.
function rememberCfg(s, ev) {
  if (typeof ev.cfg !== 'string' || ev.cfg === '') return;
  if (!s.cfg) s.cfg = {};
  s.cfg[ev.node] = ev.cfg;
}

export function isSeen(libraryDir, url) {
  return replayLedger(libraryDir).states.has(url);
}

export function recordSeen(libraryDir, { url, source, title, date } = {}) {
  if (typeof url !== 'string' || url === '') throw new StreamsError('bad-event', 'recordSeen needs a url');
  if (isSeen(libraryDir, url)) return { added: false };
  appendEvent(libraryDir, { ev: 'seen', url, source, title, date });
  return { added: true };
}
