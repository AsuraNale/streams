import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNoteFile, WRITE_NOTE_BY } from '../src/library/write-note.mjs';
import { parseFrontmatter } from '../src/library/frontmatter.mjs';
import { validateNote } from '../src/library/validate.mjs';
import { listNoteFiles } from '../src/library/scan.mjs';
import { listPending } from '../src/library/pending.mjs';
import { makeLibrary, header, SPEC_META, SPEC_ID, SPEC_BODY, SPEC_HEADER, TEST_CONFIG } from './support/fixtures.mjs';
import { readRawNote, hashNotes, writeRawNote } from './support/raw-notes.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

test('writeNoteFile by:keep writes notes/<id>.md = serialized header + body, which conforms', () => {
  const dir = makeLibrary('write-keep');
  const spec = { ...SPEC_META };
  delete spec.id;
  const r = writeNoteFile(dir, { id: SPEC_ID, header: spec, body: SPEC_BODY }, { by: 'keep' });
  assert.equal(r.file, `${SPEC_ID}.md`);
  assert.equal(r.path, join(dir, 'notes', `${SPEC_ID}.md`));
  const text = readRawNote(dir, r.file);
  assert.equal(text, SPEC_HEADER + SPEC_BODY);
  const check = validateNote({ fileName: r.file, text, config: TEST_CONFIG });
  assert.equal(check.ok, true);
  assert.deepEqual(parseFrontmatter(text).meta, SPEC_META);
});

test('writeNoteFile by:import-header works; header.id may be given if it matches', () => {
  const dir = makeLibrary('write-import');
  const r = writeNoteFile(dir, { id: 'imported', header: { id: 'imported', ...header('imported', { status: 'authored' }) }, body: 'no trailing newline' }, { by: 'import-header' });
  const text = readRawNote(dir, r.file);
  assert.ok(text.endsWith('no trailing newline\n'), 'body gets a final newline');
  assert.equal(parseFrontmatter(text).meta.id, 'imported');
  const r2 = writeNoteFile(dir, { id: 'empty-body', header: header('empty-body') }, { by: 'import-header' });
  assert.ok(readRawNote(dir, r2.file).endsWith('---\n'));
});

test('by must be keep | import-header | edit: anything else is refused before touching disk', () => {
  const dir = makeLibrary('write-badby');
  assert.deepEqual(WRITE_NOTE_BY, ['keep', 'import-header', 'edit']);
  for (const by of ['pipeline', 'fetch', 'KEEP', 'EDIT', 'Edit', '', undefined, null, 1]) {
    assert.throws(() => writeNoteFile(dir, { id: 'x', header: header('x'), body: 'b' }, { by }), (e) => e.code === 'bad-by', String(by));
  }
  assert.throws(() => writeNoteFile(dir, { id: 'x', header: header('x'), body: 'b' }), (e) => e.code === 'bad-by');
  assert.deepEqual(readdirSync(join(dir, 'notes')), []);
});

test('id-conflict: an existing note is never overwritten', () => {
  const dir = makeLibrary('write-conflict');
  writeNoteFile(dir, { id: 'dup', header: header('dup', { title: 'original' }), body: 'first\n' }, { by: 'keep' });
  const before = hashNotes(dir);
  assert.throws(() => writeNoteFile(dir, { id: 'dup', header: header('dup', { title: 'replacement' }), body: 'second\n' }, { by: 'keep' }), (e) => e.code === 'id-conflict' && /dup\.md/.test(e.message));
  assert.throws(() => writeNoteFile(dir, { id: 'dup', header: header('dup'), body: 'x' }, { by: 'import-header' }), (e) => e.code === 'id-conflict');
  assert.deepEqual(hashNotes(dir), before);
  assert.ok(readRawNote(dir, 'dup.md').includes('title: original'));
});

test('bad ids and mismatched header.id are refused', () => {
  const dir = makeLibrary('write-badid');
  for (const id of ['', '../escape', 'a/b', 'a\\b', '.hidden', 'has\nnewline', 42, null]) {
    assert.throws(() => writeNoteFile(dir, { id, header: header('x'), body: '' }, { by: 'keep' }), (e) => e.code === 'bad-id', JSON.stringify(id));
  }
  assert.throws(() => writeNoteFile(dir, { id: 'a', header: { id: 'b', ...header('a') }, body: '' }, { by: 'keep' }), (e) => e.code === 'bad-id');
  assert.throws(() => writeNoteFile(dir, { id: 'a', header: 'not an object', body: '' }, { by: 'keep' }), (e) => e.code === 'bad-argument');
  assert.throws(() => writeNoteFile(dir, { id: 'a', header: header('a'), body: 42 }, { by: 'keep' }), (e) => e.code === 'bad-argument');
  assert.deepEqual(readdirSync(join(dir, 'notes')), []);
});

test('a header that does not conform to spec v0 is refused with the problem codes', () => {
  const dir = makeLibrary('write-invalid');
  const cases = [
    [{ ...header('x'), title: undefined }, 'missing:title'],
    [{ ...header('x'), status: 'pending' }, 'bad-status'],
    [{ ...header('x'), date: '2026-02-30' }, 'bad-date:date'],
    [{ ...header('x'), topics: [] }, 'missing:topics'],
  ];
  for (const [h, code] of cases) {
    assert.throws(() => writeNoteFile(dir, { id: 'x', header: h, body: 'b' }, { by: 'keep' }), (e) => e.code === 'invalid-note' && e.problems.some((p) => p.code === code) && e.message.includes(code), code);
  }
  assert.equal(existsSync(join(dir, 'notes', 'x.md')), false);
});

// Acceptance V2: there is exactly one place in src/ that writes into the note folder.
test('V2 guard: only write-note.mjs mentions the notes folder together with a write call', () => {
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.mjs')) {
        const t = readFileSync(p, 'utf8');
        if (/writeFile|appendFile|createWriteStream|openSync/.test(t) && /notes/.test(t)) hits.push(relative(SRC, p).replace(/\\/g, '/'));
      }
    }
  };
  walk(SRC);
  assert.deepEqual(hits, ['library/write-note.mjs']);
  // and that one file uses create-only mode, so it can never clobber an existing note
  assert.match(readFileSync(join(SRC, 'library', 'write-note.mjs'), 'utf8'), /flag: 'wx'/);
});

test('sentinel: by:pipeline must throw (a writer that accepts it would let the pipeline bypass the user)', () => {
  const dir = makeLibrary('write-sentinel');
  assert.throws(() => writeNoteFile(dir, { id: 'auto', header: header('auto'), body: 'machine wrote this' }, { by: 'pipeline' }), (e) => e.code === 'bad-by' && /pipeline/.test(e.message));
  assert.equal(existsSync(join(dir, 'notes', 'auto.md')), false);
});

// ---------------------------------------------------------------- by:'edit' (core-api 5.2)

test("by:'edit' replaces an existing conforming note; the other keys of the header are what the caller passed", () => {
  const dir = makeLibrary('write-edit-ok');
  writeNoteFile(dir, { id: 'e1', header: header('e1', { title: 'before' }), body: 'old body\n' }, { by: 'keep' });
  const r = writeNoteFile(dir, { id: 'e1', header: header('e1', { title: 'after' }), body: 'new body' }, { by: 'edit' });
  assert.equal(r.file, 'e1.md');
  const text = readRawNote(dir, 'e1.md');
  assert.ok(text.includes('title: after') && !text.includes('title: before'));
  assert.ok(text.endsWith('---\nnew body\n'));
  assert.equal(validateNote({ fileName: 'e1.md', text, config: TEST_CONFIG }).ok, true);
  // no temporary file is left behind, and nothing else appeared in notes/
  assert.deepEqual(readdirSync(join(dir, 'notes')), ['e1.md']);
});

test("by:'edit' never creates a file: a missing note throws not-found and the folder stays empty", () => {
  const dir = makeLibrary('write-edit-create');
  assert.throws(() => writeNoteFile(dir, { id: 'fresh', header: header('fresh'), body: 'b\n' }, { by: 'edit' }), (e) => e.code === 'not-found' && /fresh\.md/.test(e.message));
  assert.equal(existsSync(join(dir, 'notes', 'fresh.md')), false);
  assert.deepEqual(readdirSync(join(dir, 'notes')), []);
  // the same call with by:'keep' does create it: the refusal above is edit's, not a broken fixture
  writeNoteFile(dir, { id: 'fresh', header: header('fresh'), body: 'b\n' }, { by: 'keep' });
  assert.deepEqual(readdirSync(join(dir, 'notes')), ['fresh.md']);
});

test("by:'edit' refuses a file that does not conform (not-editable) and leaves its bytes alone", () => {
  const dir = makeLibrary('write-edit-noncon');
  writeRawNote(dir, 'raw.md', '# just a heading\nno front matter\n');
  writeRawNote(dir, 'half.md', '---\nid: half\ntitle: half\n---\nbody\n');
  const before = hashNotes(dir);
  for (const id of ['raw', 'half']) {
    assert.throws(() => writeNoteFile(dir, { id, header: header(id), body: 'replaced\n' }, { by: 'edit' }), (e) => e.code === 'not-editable', id);
  }
  assert.deepEqual(hashNotes(dir), before);
});

test("by:'edit' still validates the new header: a non-conforming one throws invalid-note and the old file stays", () => {
  const dir = makeLibrary('write-edit-invalid');
  writeNoteFile(dir, { id: 'e2', header: header('e2'), body: 'keep me\n' }, { by: 'keep' });
  const before = hashNotes(dir);
  assert.throws(() => writeNoteFile(dir, { id: 'e2', header: header('e2', { topics: [] }), body: 'x' }, { by: 'edit' }), (e) => e.code === 'invalid-note');
  assert.deepEqual(hashNotes(dir), before);
});

test("keep / import-header are still create-only after 'edit' was added", () => {
  const dir = makeLibrary('write-edit-createonly');
  writeNoteFile(dir, { id: 'c1', header: header('c1', { title: 'original' }), body: 'first\n' }, { by: 'keep' });
  const before = hashNotes(dir);
  for (const by of ['keep', 'import-header']) {
    assert.throws(() => writeNoteFile(dir, { id: 'c1', header: header('c1', { title: 'other' }), body: 'second\n' }, { by }), (e) => e.code === 'id-conflict', by);
  }
  assert.deepEqual(hashNotes(dir), before);
});

test('an edit temporary file is not read as a note, and a stale one from the same pid does not block the edit', () => {
  const dir = makeLibrary('write-edit-tmp');
  writeNoteFile(dir, { id: 't1', header: header('t1'), body: 'one\n' }, { by: 'keep' });
  const stale = `t1.md.${process.pid}.tmp`;
  writeRawNote(dir, stale, 'half-written text of an interrupted edit');
  assert.deepEqual(listNoteFiles(dir), ['t1.md'], 'the .tmp file is not listed as a note');
  assert.equal(listPending(dir).length, 0, 'nor reported as a broken note');
  writeNoteFile(dir, { id: 't1', header: header('t1'), body: 'two\n' }, { by: 'edit' });
  assert.deepEqual(readdirSync(join(dir, 'notes')), ['t1.md']);
  assert.ok(readRawNote(dir, 't1.md').endsWith('---\ntwo\n'));
});
