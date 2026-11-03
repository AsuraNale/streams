import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editNote } from '../src/library/edit.mjs';
import { rebuildIndex, readIndex } from '../src/library/index.mjs';
import { parseFrontmatter } from '../src/library/frontmatter.mjs';
import { makeLibrary, keepNote, SPEC_META, SPEC_ID, SPEC_BODY } from './support/fixtures.mjs';
import { readRawNote, writeRawNote, hashNotes } from './support/raw-notes.mjs';
import { writeNoteFile } from '../src/library/write-note.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function specLibrary(name) {
  const dir = makeLibrary(name);
  const h = { ...SPEC_META, x_extra: 'kept as is' };
  delete h.id;
  writeNoteFile(dir, { id: SPEC_ID, header: h, body: SPEC_BODY }, { by: 'keep' });
  keepNote(dir, 'memgpt', { title: 'MemGPT 论文' });
  rebuildIndex(dir);
  return dir;
}

test('editNote changes title / topics / body and keeps every other header field and the key order', () => {
  const dir = specLibrary('edit-ok');
  const r = editNote(dir, SPEC_ID, { title: '  新标题  ', topics: ['agent 记忆', 'MCP', 'MCP', ' '], body: '改过的正文，链到 [[MemGPT 论文]]。\n' });
  assert.equal(r.id, SPEC_ID);
  assert.equal(r.file, `${SPEC_ID}.md`);
  const text = readRawNote(dir, r.file);
  const meta = parseFrontmatter(text).meta;
  assert.equal(meta.title, '新标题');
  assert.deepEqual(meta.topics, ['agent 记忆', 'MCP'], 'trimmed, blanks and repeats dropped');
  for (const k of ['source', 'source_name', 'date', 'collected', 'kept', 'status', 'scores', 'x_extra']) assert.deepEqual(meta[k], { ...SPEC_META, x_extra: 'kept as is' }[k], k);
  assert.deepEqual(Object.keys(meta), ['id', 'title', 'source', 'source_name', 'date', 'collected', 'kept', 'status', 'topics', 'scores', 'x_extra']);
  assert.ok(text.endsWith('---\n改过的正文，链到 [[MemGPT 论文]]。\n'));
  // the index was rebuilt: the entry carries the new title and the new link
  assert.equal(r.entry.title, '新标题');
  assert.deepEqual(r.entry.links, ['memgpt']);
  assert.equal(readIndex(dir).find((e) => e.id === SPEC_ID).title, '新标题');
});

test('editNote with only some keys leaves the others untouched (body stays byte for byte)', () => {
  const dir = specLibrary('edit-partial');
  editNote(dir, SPEC_ID, { title: 'only the title' });
  const text = readRawNote(dir, `${SPEC_ID}.md`);
  assert.ok(text.endsWith('---\n' + SPEC_BODY));
  assert.deepEqual(parseFrontmatter(text).meta.topics, SPEC_META.topics);
});

test('editNote refuses any key that is not title / topics / body (bad-edit) and writes nothing', () => {
  const dir = specLibrary('edit-badkey');
  const before = hashNotes(dir);
  for (const changes of [{ source: 'https://elsewhere' }, { date: '2020-01-01' }, { status: 'archived' }, { scores: {} }, { kept: '2026-01-01' }, { collected: '2026-01-01' }, { title: 'x', id: 'other' }]) {
    assert.throws(() => editNote(dir, SPEC_ID, changes), (e) => e.code === 'bad-edit', JSON.stringify(changes));
  }
  for (const changes of [null, 'title', [], { title: 3 }, { topics: 'one' }, { topics: [1] }, { body: null }]) {
    assert.throws(() => editNote(dir, SPEC_ID, changes), (e) => e.code === 'bad-edit', JSON.stringify(changes));
  }
  assert.deepEqual(hashNotes(dir), before);
});

test('editNote: empty topics fails spec v0 (invalid-note); an unknown topic is only a warning', () => {
  const dir = specLibrary('edit-topics');
  const before = hashNotes(dir);
  assert.throws(() => editNote(dir, SPEC_ID, { topics: [] }), (e) => e.code === 'invalid-note');
  assert.throws(() => editNote(dir, SPEC_ID, { topics: ['  '] }), (e) => e.code === 'invalid-note');
  assert.throws(() => editNote(dir, SPEC_ID, { title: '   ' }), (e) => e.code === 'invalid-note');
  assert.deepEqual(hashNotes(dir), before);
  const r = editNote(dir, SPEC_ID, { topics: ['没在配置里的主题'] });
  assert.deepEqual(r.entry.warnings, ['unknown-topic:没在配置里的主题']);
});

test('editNote: no file -> not-found; a non-conforming file -> not-editable; nothing is created or changed', () => {
  const dir = specLibrary('edit-missing');
  writeRawNote(dir, 'raw.md', '# no header\ntext\n');
  const before = hashNotes(dir);
  assert.throws(() => editNote(dir, 'does-not-exist', { title: 'x' }), (e) => e.code === 'not-found');
  assert.throws(() => editNote(dir, '../streams', { title: 'x' }), (e) => e.code === 'not-found');
  assert.throws(() => editNote(dir, 'raw', { title: 'x' }), (e) => e.code === 'not-editable');
  assert.deepEqual(hashNotes(dir), before);
  assert.ok(!readdirSync(join(dir, 'notes')).includes('does-not-exist.md'));
});

test('edit.mjs has no write call of its own: the disk write goes through writeNoteFile by:edit', () => {
  const src = readFileSync(join(SRC, 'library', 'edit.mjs'), 'utf8');
  assert.doesNotMatch(src, /writeFile|appendFile|createWriteStream|openSync|renameSync|copyFile/);
  assert.match(src, /writeNoteFile\([^)]*\{ by: 'edit' \}\)/);
});
