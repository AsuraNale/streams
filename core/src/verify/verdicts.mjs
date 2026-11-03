// _pipeline/verdicts.jsonl: one line per checklist item per round, append-only (product spec 4.11
// "记录与反馈": the collected failures are the signal of where a requirement is weak).
//
// appendVerdict(libraryDir, { node, url, round, items, ts? }) -> written lines
//   each item -> { ts, node, url, item, kind, passed, evidence, round, claimed }
// readVerdicts(libraryDir)                       -> [line, ...]   (malformed lines skipped)
// recentVerdictFailures(libraryDir, nodeId, n)   -> [{ ts, url, item, evidence, round }] newest first
// verdictsFor(libraryDir, url)                   -> one url's lines grouped by node + round (see below)
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';

export const VERDICTS_FILE = '_pipeline/verdicts.jsonl';

export function verdictsPath(libraryDir) {
  return join(libraryDir, VERDICTS_FILE);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
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

export function appendVerdict(libraryDir, { node, url, round, items, ts } = {}) {
  if (typeof node !== 'string' || node === '') throw new StreamsError('bad-verdict', 'verdict is missing "node"');
  if (typeof url !== 'string' || url === '') throw new StreamsError('bad-verdict', 'verdict is missing "url"');
  if (!Array.isArray(items)) throw new StreamsError('bad-verdict', 'verdict "items" must be an array');
  const stamp = typeof ts === 'string' && ts !== '' ? ts : new Date().toISOString();
  const lines = items.map((it) => {
    if (!isPlainObject(it) || typeof it.id !== 'string' || it.id === '') throw new StreamsError('bad-verdict', 'verdict item is missing "id"');
    return {
      ts: stamp,
      node,
      url,
      item: it.id,
      kind: it.kind === 'judge' ? 'judge' : 'rule',
      passed: it.passed === true,
      evidence: typeof it.evidence === 'string' ? it.evidence : '',
      round: typeof round === 'number' ? round : null,
      claimed: it.claimed === true,
    };
  });
  if (lines.length === 0) return [];
  mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
  const path = verdictsPath(libraryDir);
  // never glue onto a last line that lost its newline (same rule as the ledger)
  const prefix = endsWithoutNewline(path) ? '\n' : '';
  appendFileSync(path, prefix + lines.map((l) => JSON.stringify(l) + '\n').join(''), { encoding: 'utf8', flag: 'a' });
  return lines;
}

export function readVerdicts(libraryDir) {
  const path = verdictsPath(libraryDir);
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    let v;
    try {
      v = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isPlainObject(v) || typeof v.node !== 'string' || typeof v.item !== 'string') continue;
    out.push(v);
  }
  return out;
}

export function recentVerdictFailures(libraryDir, nodeId, n = 10) {
  const limit = Number.isInteger(n) && n >= 0 ? n : 10;
  return readVerdicts(libraryDir)
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.node === nodeId && v.passed === false)
    .sort((a, b) => {
      const ta = typeof a.v.ts === 'string' ? a.v.ts : '';
      const tb = typeof b.v.ts === 'string' ? b.v.ts : '';
      if (ta !== tb) return ta < tb ? 1 : -1;
      return b.i - a.i; // same ts: the later line is the newer one
    })
    .slice(0, limit)
    .map(({ v }) => ({ ts: v.ts, url: v.url, item: v.item, evidence: v.evidence, round: v.round }));
}

// verdictsFor(libraryDir, url) -> [{ node, round, ts, items:[{ item, kind, passed, evidence, claimed, claimedNotDone }], claimsNotFound }]
// Every verification line of one url (S15), grouped by node + round (+ ts, so a later re-run of the same
// node is its own group), groups in the order they were first written. claimedNotDone / claimsNotFound =
// the producing model said it did the item, and the item did not pass ("说做了其实没做").
export function verdictsFor(libraryDir, url) {
  const groups = [];
  const byKey = new Map();
  for (const v of readVerdicts(libraryDir)) {
    if (v.url !== url) continue;
    const round = typeof v.round === 'number' ? v.round : null;
    const ts = typeof v.ts === 'string' ? v.ts : null;
    const key = JSON.stringify([v.node, round, ts]);
    let g = byKey.get(key);
    if (!g) {
      g = { node: v.node, round, ts, items: [], claimsNotFound: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    const passed = v.passed === true;
    const claimed = v.claimed === true;
    g.items.push({ item: v.item, kind: v.kind === 'judge' ? 'judge' : 'rule', passed, evidence: typeof v.evidence === 'string' ? v.evidence : '', claimed, claimedNotDone: claimed && !passed });
    if (claimed && !passed) g.claimsNotFound.push(v.item);
  }
  return groups;
}
