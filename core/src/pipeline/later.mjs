// 稍后处理 (redesign R2, F27): an item of the inbox put aside until the library's next run has ended.
// The record is one small file in the library's program folder, _pipeline/later.json — { "items": [{ "url", "at" }] } —
// never notes/ and never the ledger (the item stays at stage inbox; keep / dismiss on it are what they always were).
//
// markLater(libraryDir, url, { now })  -> { url, at, added }   the url must be at stage inbox (read from the ledger), else
//                                                               not-in-inbox; a second mark keeps the first time
// readLater(libraryDir)                -> Map<url, at>          only the urls still at stage inbox (a kept or dismissed one is
//                                                               not 稍后 any more); a broken file reads as empty
// releaseLater(libraryDir)             -> { released }          the file removed: every item is back in 待看. The desktop calls
//                                                               it when a run of THIS library has ended (services/pipeline.mjs)
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { replayLedger } from '../library/ledger.mjs';

export const LATER_FILE = join('_pipeline', 'later.json');

export function laterPath(libraryDir) {
  return join(libraryDir, LATER_FILE);
}

function readRaw(libraryDir) {
  const path = laterPath(libraryDir);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(data?.items) ? data.items.filter((i) => i && typeof i.url === 'string' && i.url !== '') : [];
  } catch {
    return [];
  }
}

function writeRaw(libraryDir, items) {
  mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
  const path = laterPath(libraryDir);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ items }, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

export function markLater(libraryDir, url, { now = () => new Date() } = {}) {
  if (typeof url !== 'string' || url === '') throw new StreamsError('bad-argument', 'url is required');
  const s = replayLedger(libraryDir).states.get(url);
  if (!s || s.stage !== 'inbox') throw new StreamsError('not-in-inbox', `${url} is not in the inbox (stage: ${s?.stage ?? 'unknown'})`);
  const items = readRaw(libraryDir);
  const had = items.find((i) => i.url === url);
  if (had) return { url, at: had.at, added: false };
  const at = now().toISOString();
  writeRaw(libraryDir, [...items, { url, at }]);
  return { url, at, added: true };
}

export function readLater(libraryDir) {
  const items = readRaw(libraryDir);
  if (items.length === 0) return new Map();
  const { states } = replayLedger(libraryDir);
  const out = new Map();
  for (const i of items) if (states.get(i.url)?.stage === 'inbox' && !out.has(i.url)) out.set(i.url, typeof i.at === 'string' ? i.at : null);
  return out;
}

export function releaseLater(libraryDir) {
  const path = laterPath(libraryDir);
  if (!existsSync(path)) return { released: 0 };
  const released = readLater(libraryDir).size;
  unlinkSync(path);
  return { released };
}
