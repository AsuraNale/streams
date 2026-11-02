import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNoteFile, WRITE_NOTE_BY } from '../src/library/write-note.mjs';
import { parseFrontmatter } from '../src/library/frontmatter.mjs';
import { validateNote } from '../src/library/validate.mjs';
import { makeLibrary, header, SPEC_META, SPEC_ID, SPEC_BODY, SPEC_HEADER, TEST_CONFIG } from './support/fixtures.mjs';
import { readRawNote, hashNotes } from './support/raw-notes.mjs';

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

test('by must be keep | import-header: anything else is refused before touching disk', () => {
  const dir = makeLibrary('write-badby');
  assert.deepEqual(WRITE_NOTE_BY, ['keep', 'import-header']);
  for (const by of ['pipeline', 'fetch', 'KEEP', '', undefined, null, 1]) {
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
