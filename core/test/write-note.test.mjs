import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeNoteFile, WRITE_NOTE_BY } from '../src/library/write-note.mjs';
import { parseFrontmatter, serializeFrontmatter, splitNoteBytes } from '../src/library/frontmatter.mjs';
import { caseDir } from './support/tmp.mjs';
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

// ---------------------------------------------------------------- by:'import-header' (core-api 5.9)

const rawBytes = (dir, file) => readFileSync(join(dir, 'notes', file));
const plantBytes = (dir, file, bytes) => writeFileSync(join(dir, 'notes', file), bytes);
const authored = (id) => header(id, { status: 'authored', kept: undefined });

test("by:'import-header' puts a header on a file without one: header + the old bytes, not one byte added", () => {
  const dir = makeLibrary('write-import-plain');
  // no final newline, CRLF line breaks, a byte that is not UTF-8: each one is something a normalizing writer would change
  const old = Buffer.concat([Buffer.from('# Heading\r\n\r\nline one\r\nlast line, no newline', 'utf8'), Buffer.from([0xff])]);
  plantBytes(dir, 'plain.md', old);
  const r = writeNoteFile(dir, { id: 'plain', header: { id: 'plain', ...authored('plain') } }, { by: 'import-header' });
  assert.equal(r.path, join(dir, 'notes', 'plain.md'));
  const now = rawBytes(dir, 'plain.md');
  const head = Buffer.from(serializeFrontmatter({ ...authored('plain'), id: 'plain' }), 'utf8');
  assert.ok(now.equals(Buffer.concat([head, old])), 'the file is the serialized header followed by the old file, byte for byte');
  assert.ok(splitNoteBytes(now).body.equals(old));
  assert.equal(validateNote({ fileName: 'plain.md', text: now.toString('utf8'), config: null }).ok, true);
  assert.deepEqual(readdirSync(join(dir, 'notes')), ['plain.md'], 'no temporary file is left');
});

test("by:'import-header' on a file whose header lacks source and date: the old header goes, the body after it stays byte for byte", () => {
  const dir = makeLibrary('write-import-half');
  const oldHead = '---\r\nid: half\r\ntitle: Half\r\nstatus: kept\r\ntopics: [MCP]\r\n---\r\n';
  const oldBody = '\r\nbody line\r\n\r\n\r\n';
  plantBytes(dir, 'half.md', Buffer.from(oldHead + oldBody, 'utf8'));
  writeNoteFile(dir, { id: 'half', header: { title: 'Half', status: 'kept', topics: ['MCP'], source: 'file:half.md', date: '2026-10-20' } }, { by: 'import-header' });
  const now = rawBytes(dir, 'half.md');
  assert.ok(splitNoteBytes(now).body.equals(Buffer.from(oldBody, 'utf8')), 'the body (blank lines and CRLF included) is what it was');
  assert.equal(now.toString('utf8').startsWith('---\nid: half\ntitle: Half\nsource: file:half.md\ndate: 2026-10-20\n'), true);
  assert.equal(validateNote({ fileName: 'half.md', text: now.toString('utf8'), config: null }).ok, true);
});

test("by:'import-header' keeps a UTF-8 byte-order mark in front and the rest of the file after the header", () => {
  const dir = makeLibrary('write-import-bom');
  const text = Buffer.from('plain text\n', 'utf8');
  plantBytes(dir, 'bom.md', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text]));
  writeNoteFile(dir, { id: 'bom', header: authored('bom') }, { by: 'import-header' });
  const now = rawBytes(dir, 'bom.md');
  assert.deepEqual([...now.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(now.subarray(now.length - text.length).equals(text));
  assert.equal(validateNote({ fileName: 'bom.md', text: now.toString('utf8'), config: null }).ok, true);
});

test("by:'import-header' never creates a file: a missing one throws not-found and nothing appears", () => {
  const dir = makeLibrary('write-import-create');
  assert.throws(() => writeNoteFile(dir, { id: 'fresh', header: authored('fresh') }, { by: 'import-header' }), (e) => e.code === 'not-found' && /fresh\.md/.test(e.message));
  assert.deepEqual(readdirSync(join(dir, 'notes')), []);
  // control: keep does create it, so the refusal above is import-header's own
  writeNoteFile(dir, { id: 'fresh', header: header('fresh'), body: 'b\n' }, { by: 'keep' });
  assert.deepEqual(readdirSync(join(dir, 'notes')), ['fresh.md']);
});

test("by:'import-header' leaves a conforming file alone (already-conforming), takes no body, and refuses a header that does not conform", () => {
  const dir = makeLibrary('write-import-refuse');
  writeNoteFile(dir, { id: 'fine', header: header('fine'), body: 'mine\n' }, { by: 'keep' });
  plantBytes(dir, 'raw.md', Buffer.from('raw text\n', 'utf8'));
  const before = hashNotes(dir);
  assert.throws(() => writeNoteFile(dir, { id: 'fine', header: header('fine', { title: 'Other' }) }, { by: 'import-header' }), (e) => e.code === 'already-conforming');
  assert.throws(() => writeNoteFile(dir, { id: 'raw', header: authored('raw'), body: 'replaced\n' }, { by: 'import-header' }), (e) => e.code === 'bad-argument');
  assert.throws(() => writeNoteFile(dir, { id: 'raw', header: authored('raw'), body: '' }, { by: 'import-header' }), (e) => e.code === 'bad-argument', 'an empty body is a body too');
  assert.throws(() => writeNoteFile(dir, { id: 'raw', header: { ...authored('raw'), topics: [] } }, { by: 'import-header' }), (e) => e.code === 'invalid-note' && e.problems.some((p) => p.code === 'missing:topics'));
  assert.deepEqual(hashNotes(dir), before, 'every refusal left the bytes as they were');
  assert.deepEqual(readdirSync(join(dir, 'notes')).sort(), ['fine.md', 'raw.md'], 'and no temporary file');
});

test('a library whose notesDir is "." has its notes in the library folder: keep, import-header and edit write there', () => {
  const dir = caseDir('write-notesdir-dot');
  writeFileSync(join(dir, 'streams.json'), JSON.stringify({ ...TEST_CONFIG, notesDir: '.' }), 'utf8');
  writeFileSync(join(dir, 'mine.md'), 'my own text', 'utf8');
  const k = writeNoteFile(dir, { id: 'kept-here', header: header('kept-here'), body: 'k\n' }, { by: 'keep' });
  assert.equal(k.path, join(dir, 'kept-here.md'));
  writeNoteFile(dir, { id: 'mine', header: authored('mine') }, { by: 'import-header' });
  assert.ok(readFileSync(join(dir, 'mine.md'), 'utf8').endsWith('---\nmy own text'));
  writeNoteFile(dir, { id: 'kept-here', header: header('kept-here', { title: 'Edited' }), body: 'e\n' }, { by: 'edit' });
  assert.ok(readFileSync(join(dir, 'kept-here.md'), 'utf8').includes('title: Edited'));
  assert.deepEqual(readdirSync(dir).sort(), ['kept-here.md', 'mine.md', 'streams.json']);
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
  assert.throws(() => writeNoteFile(dir, { id: 'dup', header: header('dup') }, { by: 'import-header' }), (e) => e.code === 'already-conforming');
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
// A file "mentions the note folder" when its code (comments taken out) names it: a string 'notes' or '…/notes/…', NOTES_DIR,
// notesDir(…), notePath(…), or a config's notesDir key read as `.notesDir` / `['notesDir']`. Since the folder became
// configurable (core-api 5.9) the writer reaches it through notesDir(libraryDir) and no longer spells "notes": the
// planted samples below show that every one of these spellings is still caught.
const WRITE_CALL_RE = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|openSync|renameSync|copyFileSync|cpSync)\s*\(/;
const NOTES_FOLDER_RE = /(['"`])(?:[^'"`\n]*[\/])?notes(?:[\/][^'"`\n]*)?\1|\bNOTES_DIR\b|\bnotesDir\s*\(|\bnotePath\s*\(|\.notesDir\b|\[\s*['"`]notesDir['"`]\s*\]/;
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const writesNotes = (t) => { const c = codeOf(t); return WRITE_CALL_RE.test(c) && NOTES_FOLDER_RE.test(c); };

test('V2 guard: only write-note.mjs mentions the note folder together with a write call', () => {
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.mjs') && writesNotes(readFileSync(p, 'utf8'))) hits.push(relative(SRC, p).replace(/\\/g, '/'));
    }
  };
  walk(SRC);
  assert.deepEqual(hits, ['library/write-note.mjs']);
  // and that one file uses create-only mode for keep, so keep can never clobber an existing note
  assert.match(readFileSync(join(SRC, 'library', 'write-note.mjs'), 'utf8'), /flag: 'wx'/);
});

test('V2 guard, reverse: a write call into the note folder is caught however the folder is named', () => {
  const planted = [
    "import { writeFileSync } from 'node:fs'; writeFileSync(join(dir, 'notes', 'x.md'), s);",
    "import { appendFileSync } from 'node:fs'; appendFileSync(`${dir}/notes/x.md`, s);",
    "import { writeFileSync } from 'node:fs'; import { NOTES_DIR } from './scan.mjs'; writeFileSync(join(dir, NOTES_DIR, 'x.md'), s);",
    "import { writeFileSync } from 'node:fs'; import { notesDir } from './scan.mjs'; const p = join(notesDir(dir), 'x.md'); writeFileSync(p, s);",
    "import { renameSync } from 'node:fs'; renameSync(tmp, notePath(dir, id));",
    "import { writeFileSync } from 'node:fs'; writeFileSync(join(dir, config.notesDir, 'x.md'), s);",
    "import { writeFileSync } from 'node:fs'; writeFileSync(join(dir, cfg['notesDir'], 'x.md'), s);",
  ];
  for (const t of planted) assert.equal(writesNotes(t), true, t);
  // what is not reported: the folder named only in a comment, or a write beside a config that only sets the key
  assert.equal(writesNotes("// writes into notes/\nwriteFileSync(join(dir, 'streams.json'), s);"), false);
  assert.equal(writesNotes("const config = { notesDir: '.' }; writeFileSync(join(dir, 'streams.json'), JSON.stringify(config));"), false);
  assert.equal(writesNotes("writeFileSync(join(dir, 'index.jsonl'), s); return { notes: n };"), false);
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

test("keep is still create-only and import-header still cannot replace a conforming note after 'edit' was added", () => {
  const dir = makeLibrary('write-edit-createonly');
  writeNoteFile(dir, { id: 'c1', header: header('c1', { title: 'original' }), body: 'first\n' }, { by: 'keep' });
  const before = hashNotes(dir);
  assert.throws(() => writeNoteFile(dir, { id: 'c1', header: header('c1', { title: 'other' }), body: 'second\n' }, { by: 'keep' }), (e) => e.code === 'id-conflict');
  assert.throws(() => writeNoteFile(dir, { id: 'c1', header: header('c1', { title: 'other' }) }, { by: 'import-header' }), (e) => e.code === 'already-conforming');
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
