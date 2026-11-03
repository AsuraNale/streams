// THE ONLY PLACE THAT WRITES INTO notes/ (acceptance V2).
//
// writeNoteFile(libraryDir, { id, header, body }, { by }) -> { file, path }
//   by: 'keep'          the user kept an inbox item                       create only
//       'import-header' a header was written onto an imported file        create only
//       'edit'          the user edited a note that is already in notes/  replace only (core-api 5.2)
//   Anything else throws code 'bad-by'.
//   keep / import-header: an existing notes/<id>.md throws 'id-conflict' and is never overwritten.
//   edit: replaces notes/<id>.md only when it exists AND conforms to spec v0; a missing file throws
//         'not-found' (edit can never create a note), a non-conforming one throws 'not-editable'.
//         The new text goes to notes/<id>.md.<pid>.tmp first (not ending in .md, so a scan never
//         reads it as a note) and is then renamed over the old file.
//   The header is validated against spec v0 before writing; a non-conforming header throws 'invalid-note'.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { serializeFrontmatter, isPlainObject } from './frontmatter.mjs';
import { validateNote } from './validate.mjs';
import { NOTES_DIR } from './scan.mjs';

export const WRITE_NOTE_BY = ['keep', 'import-header', 'edit'];
const ID_RE = /^[A-Za-z0-9㐀-䶿一-鿿][A-Za-z0-9㐀-䶿一-鿿._ -]*$/;

export function isNoteId(id) {
  return typeof id === 'string' && ID_RE.test(id) && !id.includes('..');
}

export function writeNoteFile(libraryDir, { id, header, body } = {}, { by } = {}) {
  if (!WRITE_NOTE_BY.includes(by)) throw new StreamsError('bad-by', `writeNoteFile: "by" must be one of ${WRITE_NOTE_BY.join(' | ')}, got ${JSON.stringify(by)}`);
  if (typeof libraryDir !== 'string' || libraryDir === '') throw new StreamsError('bad-argument', 'libraryDir is required');
  if (!isNoteId(id)) throw new StreamsError('bad-id', `invalid note id ${JSON.stringify(id)}`);
  if (!isPlainObject(header)) throw new StreamsError('bad-argument', 'header must be a plain object');
  if (header.id !== undefined && header.id !== id) throw new StreamsError('bad-id', `header.id "${header.id}" does not match id "${id}"`);
  if (body !== undefined && typeof body !== 'string') throw new StreamsError('bad-argument', 'body must be a string');

  const file = `${id}.md`;
  const text = serializeFrontmatter({ ...header, id }) + normalizeBody(body ?? '');
  const check = validateNote({ fileName: file, text, config: null });
  if (!check.ok) {
    throw new StreamsError('invalid-note', `refusing to write ${file}: ${check.problems.map((p) => p.code).join(', ')}`, { problems: check.problems });
  }
  const path = join(libraryDir, NOTES_DIR, file);
  if (by === 'edit') return replaceExisting(path, file, text);
  try {
    writeFileSync(path, text, { encoding: 'utf8', flag: 'wx' }); // wx = create only, never overwrite
  } catch (e) {
    if (e.code === 'EEXIST') throw new StreamsError('id-conflict', `${file} already exists in notes/`);
    throw e;
  }
  return { file, path };
}

function replaceExisting(path, file, text) {
  if (!existsSync(path)) throw new StreamsError('not-found', `${file} is not in notes/: edit never creates a note`);
  const current = validateNote({ fileName: file, text: readFileSync(path, 'utf8'), config: null });
  if (!current.ok) {
    throw new StreamsError('not-editable', `${file} does not conform to spec v0 (${current.problems.map((p) => p.code).join(', ')}); it is not edited`, { problems: current.problems });
  }
  const tmp = `${path}.${process.pid}.tmp`;
  rmSync(tmp, { force: true }); // a leftover from an interrupted edit by a process with the same pid
  writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx' });
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return { file, path };
}

function normalizeBody(body) {
  if (body === '') return '';
  return body.endsWith('\n') ? body : body + '\n';
}
