// listPending(libraryDir) -> [{ file, codes, messages, nameOk, bodyHash, proposedHeader? }]
// pendingView(libraryDir) -> { items: listPending's rows, skippedDirs }   (one scan; the 待规范 page)
// applyProposedHeader(libraryDir, file, { header? }) -> { id, file, entry }
//
// Files in the note folder that do not conform to spec v0. listPending is read-only: proposedHeader is a
// suggestion returned to the caller, nothing is written.
//   nameOk    the file name (minus .md) can be a note id (isNoteId); when it cannot, the user renames the file
//             (A3: the files are not renamed)
//   bodyHash  sha256 (hex) of the file's body bytes (splitNoteBytes: the file minus its closed front matter), so a
//             caller can check that writing a header left the body as it was
// proposedHeader is offered only for:
//   - a file with no front matter at all (title from "# heading" or file name,
//     source "file:<name>", date = file mtime (local calendar day), status authored,
//     topics [the library's fallback topic: 未分类 / uncategorized, as keep uses])
//   - a file with front matter whose only problems are missing source and/or date
//     (only the missing ones are filled, everything else is kept as is)
//
// applyProposedHeader (core-api 5.9): the user said 「写入」 for one file of the list. `header` omitted / null = the
// proposed header as it is; given = the user's changes, merged over the proposal (the user's keys win; the id stays the
// file name's). The write is writeNoteFile(…, { by: 'import-header' }): this module has no write call of its own.
//   a file that conforms already -> 'already-conforming'; not in the note folder -> 'not-found';
//   a file name that cannot be an id -> 'bad-file-name'; no proposal (other problems) -> 'not-proposable';
//   a header id other than the file name's -> 'bad-id'; a merged header that does not conform -> 'invalid-note'.
//   Then rebuildIndex.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { StreamsError } from '../errors.mjs';
import { scanLibrary } from './scan.mjs';
import { idFromFileName } from './validate.mjs';
import { isPlainObject, splitNoteBytes } from './frontmatter.mjs';
import { isNoteId, writeNoteFile } from './write-note.mjs';
import { rebuildIndex } from './index.mjs';
import { pipelineFrom } from '../pipeline/config.mjs';
import { FALLBACK_TOPIC } from '../pipeline/decide.mjs';

/** sha256 (hex) of the body bytes of a note file's contents. */
export function bodyHashOf(bytes) {
  return createHash('sha256').update(splitNoteBytes(bytes).body).digest('hex');
}

function rowsOf({ pending, config }) {
  return pending.map((p) => {
    const out = { file: p.file, codes: p.codes, messages: p.messages, nameOk: isNoteId(idFromFileName(p.file)), bodyHash: bodyHashOf(readFileSync(p.path)) };
    const header = proposeHeader(p, config);
    if (header) out.proposedHeader = header;
    return out;
  });
}

export function listPending(libraryDir) {
  return rowsOf(scanLibrary(libraryDir));
}

export function pendingView(libraryDir) {
  const scan = scanLibrary(libraryDir);
  return { items: rowsOf(scan), skippedDirs: scan.skippedDirs };
}

export function localDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fallbackTopic(config) {
  let language = 'zh-CN';
  try { language = pipelineFrom(config ?? {}).language; } catch { /* the default */ }
  return FALLBACK_TOPIC[language] ?? FALLBACK_TOPIC['zh-CN'];
}

export function proposeHeader(p, config = null) {
  const id = idFromFileName(p.file);
  if (p.codes.length === 1 && p.codes[0] === 'no-frontmatter') {
    const text = p.text ?? p.body ?? '';
    const h1 = /^#\s+(.+?)\s*$/m.exec(text);
    return {
      id,
      title: h1 ? h1[1] : id,
      source: `file:${p.file}`,
      date: localDate(p.stat.mtimeMs),
      status: 'authored',
      topics: [fallbackTopic(config)],
    };
  }
  const fixable = new Set(['missing:source', 'missing:date']);
  if (p.meta && p.codes.length > 0 && p.codes.every((c) => fixable.has(c))) {
    const header = { ...p.meta };
    if (p.codes.includes('missing:source')) header.source = `file:${p.file}`;
    if (p.codes.includes('missing:date')) header.date = localDate(p.stat.mtimeMs);
    return header;
  }
  return null;
}

export function applyProposedHeader(libraryDir, file, { header } = {}) {
  if (typeof file !== 'string' || file === '') throw new StreamsError('bad-argument', 'file is required');
  if (header !== undefined && header !== null && !isPlainObject(header)) throw new StreamsError('bad-argument', 'header must be a plain object or null');
  const scan = scanLibrary(libraryDir);
  const p = scan.pending.find((x) => x.file === file);
  if (!p) {
    if (scan.valid.some((v) => v.file === file)) throw new StreamsError('already-conforming', `${file} already conforms to spec v0`);
    throw new StreamsError('not-found', `${file} is not a file of the note folder that needs a header`);
  }
  const id = idFromFileName(file);
  if (!isNoteId(id)) throw new StreamsError('bad-file-name', `"${id}" cannot be a note id; rename the file yourself (the files are not renamed)`);
  const proposed = proposeHeader(p, scan.config);
  if (!proposed) throw new StreamsError('not-proposable', `no header can be proposed for ${file} (${p.codes.join(', ')})`, { codes: p.codes });
  const merged = { ...proposed, ...(header ?? {}) };
  if (merged.id !== id) throw new StreamsError('bad-id', `the id is the file name: "${id}", got ${JSON.stringify(merged.id)}`);
  const written = writeNoteFile(libraryDir, { id, header: merged }, { by: 'import-header' });
  const { entries } = rebuildIndex(libraryDir);
  return { id, file: written.file, entry: entries.find((e) => e.id === id) ?? null };
}
