// Shared read-only scan of the note folder: the one place that walks the folder, validates
// every .md, and detects duplicate ids. Used by index rebuild and the pending list,
// so the two can never disagree about which files conform.
//
// notesDir(libraryDir) -> absolute path of the note folder: streams.json `notesDir` (default "notes",
//   "." = the library folder itself, core-api 5.9). Every module that reads or writes notes goes through it.
//   An unusable value (absolute, a drive, "..", outside the library folder) throws config:invalid-shape;
//   no streams.json at all = the default.
// ensureNotesDir(libraryDir) -> makes that folder (createLibrary); creates a folder, never a file.
// scanLibrary(libraryDir) -> { config, valid: [...], pending: [...], skippedDirs: [...] }
//   valid[i]   = { file, path, stat, meta, body, warnings }
//   pending[i] = { file, path, stat, text, meta, body, problems, codes, messages }
//   skippedDirs = the folders inside the note folder, relative to the library folder with "/" (v1.0 reads only the
//                 first level; `_pipeline` and folders whose name starts with "." are not counted)
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { readConfig, notesDirProblem } from './config.mjs';
import { validateNote } from './validate.mjs';

export const NOTES_DIR = 'notes';
// what an imported folder's streams.json says: the folder itself holds the notes
export const IMPORTED_NOTES_DIR = '.';
const NOT_SCANNED = new Set(['_pipeline']);

/** The note folder of a library whose streams.json is `config` (null / no key = the default). */
export function notesDirOf(libraryDir, config) {
  const rel = config?.notesDir ?? NOTES_DIR;
  const problem = notesDirProblem(rel);
  if (problem) throw new StreamsError('config:invalid-shape', problem);
  const dir = join(libraryDir, rel);
  const back = relative(resolve(libraryDir), resolve(dir));
  if (back.startsWith('..') || isAbsolute(back)) throw new StreamsError('config:invalid-shape', `"notesDir" ${JSON.stringify(rel)} is outside the library folder`);
  return dir;
}

export function notesDir(libraryDir) {
  const cfg = readConfig(libraryDir);
  if (!cfg.ok) {
    if (cfg.error.code === 'missing') return join(libraryDir, NOTES_DIR);
    throw new StreamsError(`config:${cfg.error.code}`, cfg.error.message);
  }
  return notesDirOf(libraryDir, cfg.config);
}

export function ensureNotesDir(libraryDir) {
  const dir = notesDir(libraryDir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function noteFilesIn(dir) {
  if (!existsSync(dir)) throw new StreamsError('no-notes-dir', `${dir} does not exist`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.md$/i.test(d.name))
    .map((d) => d.name)
    .sort();
}

export function listNoteFiles(libraryDir) {
  return noteFilesIn(notesDir(libraryDir));
}

function skippedDirsIn(libraryDir, dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NOT_SCANNED.has(d.name) && !d.name.startsWith('.'))
    .map((d) => relative(libraryDir, join(dir, d.name)).replace(/\\/g, '/'))
    .sort();
}

export function scanLibrary(libraryDir) {
  const cfg = readConfig(libraryDir);
  if (!cfg.ok) throw new StreamsError(`config:${cfg.error.code}`, cfg.error.message);
  const config = cfg.config;
  const dir = notesDirOf(libraryDir, config);
  const valid = [];
  const pending = [];
  for (const file of noteFilesIn(dir)) {
    const path = join(dir, file);
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
  return { config, valid: keep, pending, skippedDirs: skippedDirsIn(libraryDir, dir) };
}

function toPending(p) {
  return { ...p, codes: p.problems.map((x) => x.code), messages: p.problems.map((x) => (x.line ? `line ${x.line}: ${x.message}` : x.message)) };
}
