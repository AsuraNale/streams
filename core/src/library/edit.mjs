// Editing one entry (core-api 5.2, mockup S7): title, topics and body ([[links]] live in the body).
//
// editNote(libraryDir, id, { title?, topics?, body? }) -> { id, file, entry }
//   Any other key -> 'bad-edit' (source, date, collected, kept, status, scores are the record).
//   The current header is read, the given fields replace their own keys, every other key keeps its
//   value (serializeFrontmatter's fixed key order, extra keys after it in their own order).
//   The disk write is writeNoteFile(…, { by: 'edit' }): this module has no write call of its own.
//   No file -> 'not-found'; a file that does not conform to spec v0 -> 'not-editable';
//   a merged header that does not conform (e.g. topics []) -> 'invalid-note'. Then rebuildIndex.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { isPlainObject } from './frontmatter.mjs';
import { validateNote } from './validate.mjs';
import { notesDir } from './scan.mjs';
import { writeNoteFile, isNoteId } from './write-note.mjs';
import { rebuildIndex } from './index.mjs';

export const EDITABLE_KEYS = ['title', 'topics', 'body'];

function checkChanges(changes) {
  if (!isPlainObject(changes)) throw new StreamsError('bad-edit', 'changes must be an object with title / topics / body');
  const extra = Object.keys(changes).filter((k) => !EDITABLE_KEYS.includes(k));
  if (extra.length) throw new StreamsError('bad-edit', `only ${EDITABLE_KEYS.join(' / ')} can be edited, got ${extra.join(', ')}`, { keys: extra });
  const out = {};
  if (changes.title !== undefined) {
    if (typeof changes.title !== 'string') throw new StreamsError('bad-edit', 'title must be a string');
    out.title = changes.title.trim();
  }
  if (changes.topics !== undefined) {
    if (!Array.isArray(changes.topics) || !changes.topics.every((t) => typeof t === 'string')) throw new StreamsError('bad-edit', 'topics must be a list of names');
    out.topics = [...new Set(changes.topics.map((t) => t.trim()).filter((t) => t !== ''))];
  }
  if (changes.body !== undefined) {
    if (typeof changes.body !== 'string') throw new StreamsError('bad-edit', 'body must be a string');
    out.body = changes.body;
  }
  return out;
}

export function editNote(libraryDir, id, changes) {
  const given = checkChanges(changes);
  if (!isNoteId(id)) throw new StreamsError('not-found', `no note with id ${JSON.stringify(id)}`);
  const file = `${id}.md`;
  const path = join(notesDir(libraryDir), file);
  if (!existsSync(path)) throw new StreamsError('not-found', `${file} is not in the note folder`);
  const current = validateNote({ fileName: file, text: readFileSync(path, 'utf8'), config: null });
  if (!current.ok) throw new StreamsError('not-editable', `${file} does not conform to spec v0`, { problems: current.problems });

  const header = { ...current.meta };
  if (given.title !== undefined) header.title = given.title;
  if (given.topics !== undefined) header.topics = given.topics;
  const body = given.body !== undefined ? given.body : current.body;
  const written = writeNoteFile(libraryDir, { id, header, body }, { by: 'edit' });
  const { entries } = rebuildIndex(libraryDir);
  const entry = entries.find((e) => e.id === id) ?? null;
  return { id, file: written.file, entry };
}
