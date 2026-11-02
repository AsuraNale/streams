// Shared read-only scan of notes/: the one place that walks the folder, validates
// every .md, and detects duplicate ids. Used by index rebuild and the pending list,
// so the two can never disagree about which files conform.
//
// scanLibrary(libraryDir) -> { config, valid: [...], pending: [...] }
//   valid[i]   = { file, path, stat, meta, body, warnings }
//   pending[i] = { file, path, stat, text, meta, body, problems, codes, messages }
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { readConfig } from './config.mjs';
import { validateNote } from './validate.mjs';

export const NOTES_DIR = 'notes';

export function notesDir(libraryDir) {
  return join(libraryDir, NOTES_DIR);
}

export function listNoteFiles(libraryDir) {
  const dir = notesDir(libraryDir);
  if (!existsSync(dir)) throw new StreamsError('no-notes-dir', `${dir} does not exist`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.md$/i.test(d.name))
    .map((d) => d.name)
    .sort();
}

export function scanLibrary(libraryDir) {
  const cfg = readConfig(libraryDir);
  if (!cfg.ok) throw new StreamsError(`config:${cfg.error.code}`, cfg.error.message);
  const config = cfg.config;
  const valid = [];
  const pending = [];
  for (const file of listNoteFiles(libraryDir)) {
    const path = join(notesDir(libraryDir), file);
    const text = readFileSync(path, 'utf8');
    const stat = statSync(path);
    const r = validateNote({ fileName: file, text, config });
    if (r.ok) valid.push({ file, path, stat, meta: r.meta, body: r.body, warnings: r.warnings });
    else pending.push(toPending({ file, path, stat, text, meta: r.meta, body: r.body, problems: r.problems }));
  }
  // duplicate ids: every file involved is refused (id-mismatch already caught files whose
  // header id differs from the file name, so this only fires when the file system allows
  // two names that strip to the same id, e.g. case-only differences on a case-sensitive disk)
  const byId = new Map();
  for (const v of valid) {
    if (!byId.has(v.meta.id)) byId.set(v.meta.id, []);
    byId.get(v.meta.id).push(v);
  }
  const keep = [];
  for (const v of valid) {
    const group = byId.get(v.meta.id);
    if (group.length === 1) { keep.push(v); continue; }
    const others = group.filter((g) => g !== v).map((g) => g.file).join(', ');
    pending.push(toPending({ ...v, text: null, problems: [{ code: 'duplicate-id', message: `id "${v.meta.id}" is also used by ${others}` }] }));
  }
  pending.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return { config, valid: keep, pending };
}

function toPending(p) {
  return { ...p, codes: p.problems.map((x) => x.code), messages: p.problems.map((x) => (x.line ? `line ${x.line}: ${x.message}` : x.message)) };
}
