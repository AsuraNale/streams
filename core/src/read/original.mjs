// The originals (1.1 W2, acceptance B6 / B7): every item read keeps the page's own words in the library folder,
// `_originals/<id>.md` — never in notes/ (only writeNoteFile writes there), and in a folder whose name begins with _, which
// importing a folder and the 待规范 check leave alone. The id is the item's: a short hash of its address, so the ledger
// (keyed by address) and the file meet without a table between them.
//
// The file: a header between --- lines (url, title, fetched_at, method: direct | render | pdf, sha256 of the text), then
// the text in paragraphs. The text is what extractOriginal / the PDF reader gave; nothing is added to it.
//   originalId(url)                                   -> 16 hex characters
//   saveOriginal(libraryDir, { url, title, text, method, fetchedAt }) -> { id, path, sha256 }
//   originalFor(read)                                 -> what an item records about its original from a read: { saved: false,
//                                                         missing: 'original-not-saved', reason } when the page could not be
//                                                         read (the item then says 「原文没存下来」 and gets no summary)
//   readOriginal(libraryDir, id)                      -> { id, url, title, fetchedAt, method, sha256, text } | null
// Keeping them (B7): an item kept (收藏) keeps its original for good; one dismissed (放弃) loses it RETAIN_DISMISSED_DAYS
// days after it was dismissed; one still in 待看 (or 稍后) keeps it. An original whose address the ledger does not know is
// kept (nothing is removed on a guess).
//   pruneOriginals(libraryDir, { now }) -> { removed: [id], kept: [id] }
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { replayLedger } from '../library/ledger.mjs';

export const ORIGINALS_DIR = '_originals';
export const ORIGINAL_METHODS = Object.freeze(['direct', 'render', 'pdf']);
export const RETAIN_DISMISSED_DAYS = 7;
export const ORIGINAL_MISSING = 'original-not-saved';
const DAY_MS = 24 * 60 * 60 * 1000;
const ID = /^[0-9a-f]{16}$/;

export const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
export const originalId = (url) => sha256(String(url).trim()).slice(0, 16);
export const originalPath = (libraryDir, id) => join(libraryDir, ORIGINALS_DIR, `${id}.md`);

// a header value on one line, quoted as JSON so any title reads back as it was
const field = (v) => JSON.stringify(String(v ?? ''));

export function saveOriginal(libraryDir, { url, title = '', text, method, fetchedAt }) {
  if (typeof url !== 'string' || url.trim() === '') throw new StreamsError('bad-argument', 'an original needs its url');
  if (!ORIGINAL_METHODS.includes(method)) throw new StreamsError('bad-argument', `an original's method is ${ORIGINAL_METHODS.join(' / ')}`);
  if (typeof text !== 'string' || text.trim() === '') throw new StreamsError('bad-argument', 'an original needs text: a page that could not be read has no original (originalFor)');
  const at = fetchedAt instanceof Date ? fetchedAt.toISOString() : String(fetchedAt ?? '');
  if (!at || Number.isNaN(Date.parse(at))) throw new StreamsError('bad-argument', 'an original needs the time it was fetched');
  const id = originalId(url);
  const hash = sha256(text);
  const body = ['---', `url: ${field(url.trim())}`, `title: ${field(title)}`, `fetched_at: ${field(at)}`, `method: ${field(method)}`, `sha256: ${field(hash)}`, '---', '', text, ''].join('\n');
  const dir = join(libraryDir, ORIGINALS_DIR);
  mkdirSync(dir, { recursive: true });
  const path = originalPath(libraryDir, id);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, path);
  return { id, path, sha256: hash };
}

export function originalFor(read) {
  if (read?.ok && typeof read.text === 'string' && read.text.trim() !== '') return { saved: true, method: read.method };
  return { saved: false, missing: ORIGINAL_MISSING, reason: read?.reason ?? 'no-article' };
}

export function readOriginal(libraryDir, id) {
  if (!ID.test(String(id))) return null;
  const path = originalPath(libraryDir, id);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/.exec(raw);
  if (!m) return null;
  const head = {};
  for (const line of m[1].split('\n')) {
    const k = /^([a-z_0-9]+): (.*)$/.exec(line);
    if (!k) continue;
    try { head[k[1]] = JSON.parse(k[2]); } catch { head[k[1]] = k[2]; }
  }
  const text = m[2].replace(/\n$/, '');
  return { id, url: head.url ?? '', title: head.title ?? '', fetchedAt: head.fetched_at ?? '', method: head.method ?? '', sha256: head.sha256 ?? '', text };
}

export function pruneOriginals(libraryDir, { now = () => new Date() } = {}) {
  const dir = join(libraryDir, ORIGINALS_DIR);
  const out = { removed: [], kept: [] };
  if (!existsSync(dir)) return out;
  const states = replayLedger(libraryDir).states;
  const t = (now() instanceof Date ? now() : new Date(now())).getTime();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    const id = f.slice(0, -3);
    const o = readOriginal(libraryDir, id);
    const s = o ? states.get(o.url) : undefined;
    const since = s?.lastTs ? Date.parse(s.lastTs) : NaN;
    if (s?.stage === 'dismissed' && Number.isFinite(since) && t - since >= RETAIN_DISMISSED_DAYS * DAY_MS) {
      unlinkSync(join(dir, f));
      out.removed.push(id);
    } else {
      out.kept.push(id);
    }
  }
  return out;
}
