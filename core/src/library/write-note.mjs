// THE ONLY PLACE THAT WRITES INTO THE NOTE FOLDER (acceptance V2). The folder is notesDir(libraryDir) (scan.mjs):
// notes/ by default, the library folder itself for an imported folder (core-api 5.9).
//
// writeNoteFile(libraryDir, { id, header, body }, { by }) -> { file, path }
//   by: 'keep'          the user kept an inbox item                                   create only
//       'import-header' the user had a header written onto a file already there     non-conforming existing file only
//       'edit'          the user edited a note that is already in the note folder    conforming existing file only (core-api 5.2)
//   Anything else throws code 'bad-by'.
//   keep: an existing <id>.md throws 'id-conflict' and is never overwritten.
//   import-header (core-api 5.9): <id>.md must exist ('not-found' otherwise: import-header never creates a note) and must
//         NOT conform to spec v0 ('already-conforming' otherwise, the file left as it is). `body` is not taken
//         ('bad-argument'): the new file is the serialized header + the old file's body byte for byte (the old file minus
//         its closed front matter, or the whole file when there is none; a UTF-8 byte-order mark stays in front). Nothing
//         is added, no line break, no re-encoding.
//   edit: replaces <id>.md only when it exists AND conforms to spec v0; a missing file throws 'not-found'
//         (edit can never create a note), a non-conforming one throws 'not-editable'.
//   import-header and edit write <id>.md.<pid>.tmp first (not ending in .md, so a scan never reads it as a note) and
//   then rename it over the old file.
//   The new text is validated against spec v0 before writing; a non-conforming one throws 'invalid-note'.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { serializeFrontmatter, isPlainObject, splitNoteBytes } from './frontmatter.mjs';
import { validateNote } from './validate.mjs';
import { notesDir } from './scan.mjs';

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
  const path = join(notesDir(libraryDir), file);
  if (by === 'import-header') {
    if (body !== undefined) throw new StreamsError('bad-argument', 'import-header keeps the file\'s own body: no body is taken');
    return writeHeaderOnto(path, file, { ...header, id });
  }
  const text = serializeFrontmatter({ ...header, id }) + normalizeBody(body ?? '');
  refuseUnlessConforming(file, text);
  if (by === 'edit') return replaceExisting(path, file, text);
  try {
    writeFileSync(path, text, { encoding: 'utf8', flag: 'wx' }); // wx = create only, never overwrite
  } catch (e) {
    if (e.code === 'EEXIST') throw new StreamsError('id-conflict', `${file} already exists in the note folder`);
    throw e;
  }
  return { file, path };
}

function refuseUnlessConforming(file, text) {
  const check = validateNote({ fileName: file, text, config: null });
  if (!check.ok) {
    throw new StreamsError('invalid-note', `refusing to write ${file}: ${check.problems.map((p) => p.code).join(', ')}`, { problems: check.problems });
  }
}

function replaceExisting(path, file, text) {
  if (!existsSync(path)) throw new StreamsError('not-found', `${file} is not in the note folder: edit never creates a note`);
  const current = validateNote({ fileName: file, text: readFileSync(path, 'utf8'), config: null });
  if (!current.ok) {
    throw new StreamsError('not-editable', `${file} does not conform to spec v0 (${current.problems.map((p) => p.code).join(', ')}); it is not edited`, { problems: current.problems });
  }
  replaceThroughTmp(path, text);
  return { file, path };
}

function writeHeaderOnto(path, file, header) {
  if (!existsSync(path)) throw new StreamsError('not-found', `${file} is not in the note folder: import-header never creates a note`);
  const old = readFileSync(path);
  const current = validateNote({ fileName: file, text: old.toString('utf8'), config: null });
  if (current.ok) throw new StreamsError('already-conforming', `${file} already conforms to spec v0; import-header leaves it as it is`);
  const { bom, body } = splitNoteBytes(old);
  const bytes = Buffer.concat([bom, Buffer.from(serializeFrontmatter(header), 'utf8'), body]);
  refuseUnlessConforming(file, bytes.toString('utf8'));
  replaceThroughTmp(path, bytes);
  return { file, path };
}

function replaceThroughTmp(path, data) {
  const tmp = `${path}.${process.pid}.tmp`;
  rmSync(tmp, { force: true }); // a leftover from an interrupted write by a process with the same pid
  writeFileSync(tmp, data, typeof data === 'string' ? { encoding: 'utf8', flag: 'wx' } : { flag: 'wx' });
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

function normalizeBody(body) {
  if (body === '') return '';
  return body.endsWith('\n') ? body : body + '\n';
}
