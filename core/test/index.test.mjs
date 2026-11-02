import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { rebuildIndex, readIndex, formatIndexLine, INDEX_KEYS, summaryOf, countWords, flattenScores } from '../src/library/index.mjs';
import { makeLibrary, keepNote, SPEC_ID, SPEC_META, SPEC_BODY } from './support/fixtures.mjs';
import { writeRawNote, readRawNote, hashNotes } from './support/raw-notes.mjs';
import { writeNoteFile } from '../src/library/write-note.mjs';
import { caseDir } from './support/tmp.mjs';

// 对照 test_pipeline.py::test_index: build the index over a folder holding good notes,
// a note with wikilinks, and check title / links / counts. Stricter here: a file that
// does not conform is refused (pending), and the files on disk are never modified.

function readLines(dir) {
  return readFileSync(join(dir, 'index.jsonl'), 'utf8').split('\n').filter(Boolean);
}

function metaSansTime(dir) {
  const m = JSON.parse(readFileSync(join(dir, 'index.meta.json'), 'utf8'));
  delete m.rebuilt_at;
  return m;
}

// A library with: 3 conforming notes (one linking by id, by title and to nothing),
// 1 with warnings, and 3 non-conforming files (missing source, no front matter, id mismatch).
function fixtureLibrary(name) {
  const dir = makeLibrary(name);
  const spec = { ...SPEC_META };
  delete spec.id;
  writeNoteFile(dir, { id: SPEC_ID, header: spec, body: SPEC_BODY }, { by: 'keep' });
  keepNote(dir, 'alpha', { title: 'Alpha Note' }, 'About alpha.\n\nLinks [[beta]] and [[Gamma Title|the gamma one]] and [[nope#x]] and [[beta]].\n');
  keepNote(dir, 'beta', { title: 'Beta', status: 'archived' }, '# Beta heading\n\n> quoted **first** paragraph with `code` and [md](http://x) link\ncontinues here\n\nsecond paragraph\n');
  keepNote(dir, 'gamma', { title: 'Gamma Title', status: 'authored', source_name: undefined, collected: undefined, kept: undefined }, '');
  keepNote(dir, 'warned', { topics: ['agent 记忆', '未知主题'], scores: { relevance: { score: 0.5, reason: 'r' }, oldgate: { value: 'x', reason: 'r' } } });
  writeRawNote(dir, 'broken-no-source.md', '---\nid: broken-no-source\ntitle: Broken\ndate: 2026-10-01\nstatus: kept\ntopics: [MCP]\n---\nbody\n');
  writeRawNote(dir, 'plain.md', '# Plain file\n\nNo header at all.\n');
  writeRawNote(dir, 'b.md', '---\nid: alpha\ntitle: Pretends to be alpha\nsource: x\ndate: 2026-10-01\nstatus: kept\ntopics: [MCP]\n---\n');
  return dir;
}

test('rebuildIndex: conforming notes in, non-conforming refused and listed, files untouched', () => {
  const dir = fixtureLibrary('index-basic');
  const before = hashNotes(dir);
  const { entries, pending, meta } = rebuildIndex(dir);
  assert.deepEqual(hashNotes(dir), before, 'rebuild must not modify any .md, including the broken ones');

  assert.deepEqual(entries.map((e) => e.id), [SPEC_ID, 'alpha', 'beta', 'gamma', 'warned']);
  assert.deepEqual(pending.map((p) => [p.file, p.codes]), [
    ['b.md', ['id-mismatch']],
    ['broken-no-source.md', ['missing:source']],
    ['plain.md', ['no-frontmatter']],
  ]);
  assert.ok(pending[2].messages[0].startsWith('line 1: '));
  assert.equal(meta.count, 5);
  assert.equal(meta.pending_count, 3);
  assert.equal(meta.warnings_count, 2);
  assert.deepEqual(meta.problems, pending.map((p) => ({ file: p.file, codes: p.codes })));
  assert.match(meta.rebuilt_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  // the refused files are not in index.jsonl under any key
  const text = readFileSync(join(dir, 'index.jsonl'), 'utf8');
  assert.ok(!text.includes('broken-no-source'));
  assert.ok(!text.includes('Pretends to be alpha'));
  assert.ok(!text.includes('Plain file'));
});

test('index line: fixed key order, flattened scores, optional keys omitted, links resolved', () => {
  const dir = fixtureLibrary('index-line');
  const { entries } = rebuildIndex(dir);
  const lines = readLines(dir);
  assert.equal(lines.length, 5);
  assert.equal(readFileSync(join(dir, 'index.jsonl'), 'utf8'), entries.map(formatIndexLine).join(''));
  assert.ok(readFileSync(join(dir, 'index.jsonl'), 'utf8').endsWith('\n'));
  for (const line of lines) {
    assert.ok(!line.includes(': '), 'no spaces after colons');
    const keys = Object.keys(JSON.parse(line));
    assert.deepEqual(keys, INDEX_KEYS.filter((k) => keys.includes(k)), line);
  }

  const spec = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(spec), INDEX_KEYS);
  assert.deepEqual(spec.scores, { relevance: 0.86, substance: 0.72, freshness: 'new' });
  assert.deepEqual(spec.links, []);
  assert.deepEqual(spec.links_unresolved, ['MemGPT 论文']);
  assert.equal(spec.summary, '这是什么：一家 agent 框架公司的产品发布…… 和 MemGPT 论文 是同一条线的产品化');
  assert.equal(spec.words, 29); // 27 CJK characters + agent + MemGPT, counted by hand
  assert.match(spec.mtime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.deepEqual(spec.warnings, []);

  const alpha = entries[1];
  assert.deepEqual(alpha.links, ['beta', 'gamma']);
  assert.deepEqual(alpha.links_unresolved, ['nope']);
  assert.equal(alpha.summary, 'About alpha.');

  const beta = entries[2];
  assert.equal(beta.summary, 'quoted first paragraph with code and md link continues here');
  assert.equal(beta.status, 'archived');

  const gamma = entries[3];
  assert.deepEqual(Object.keys(gamma), INDEX_KEYS.filter((k) => !['source_name', 'collected', 'kept'].includes(k)));
  assert.deepEqual(gamma.scores, {});
  assert.equal(gamma.summary, '');
  assert.equal(gamma.words, 0);
  assert.ok(!lines[3].includes('null'), 'absent fields are omitted, never written as null');

  const warned = entries[4];
  assert.deepEqual(warned.warnings, ['unknown-topic:未知主题', 'unknown-score:oldgate']);
  assert.deepEqual(warned.scores, { relevance: 0.5, oldgate: 'x' });
});

test('rebuild twice: index.jsonl byte-identical, meta identical except rebuilt_at', () => {
  const dir = fixtureLibrary('index-twice');
  rebuildIndex(dir);
  const bytes1 = readFileSync(join(dir, 'index.jsonl'));
  const meta1 = metaSansTime(dir);
  rebuildIndex(dir);
  const bytes2 = readFileSync(join(dir, 'index.jsonl'));
  assert.equal(bytes1.equals(bytes2), true);
  assert.deepEqual(metaSansTime(dir), meta1);
  assert.ok(bytes1.length > 0);
});

test('change one note, rebuild: exactly that line changes', () => {
  const dir = fixtureLibrary('index-oneline');
  rebuildIndex(dir);
  const before = readLines(dir);
  const edited = readRawNote(dir, 'beta.md').replace('title: Beta', 'title: Beta (edited)');
  assert.notEqual(edited, readRawNote(dir, 'beta.md'));
  writeRawNote(dir, 'beta.md', edited); // simulates a hand edit in Obsidian
  rebuildIndex(dir);
  const after = readLines(dir);
  assert.equal(after.length, before.length);
  const changed = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i !== null);
  assert.deepEqual(changed, [2]);
  assert.equal(JSON.parse(after[2]).title, 'Beta (edited)');
});

test('mtime is the file mtime in UTC seconds', () => {
  const dir = makeLibrary('index-mtime');
  const { path } = keepNote(dir, 'a');
  const when = new Date('2026-11-01T09:12:00.789Z');
  utimesSync(path, when, when);
  const { entries } = rebuildIndex(dir);
  assert.equal(entries[0].mtime, '2026-11-01T09:12:00Z');
});

test('readIndex: round-trips entries, [] when absent, refuses a corrupt line', () => {
  const dir = fixtureLibrary('index-read');
  assert.deepEqual(readIndex(dir), []);
  const { entries } = rebuildIndex(dir);
  assert.deepEqual(readIndex(dir), entries);
  writeFileSync(join(dir, 'index.jsonl'), readFileSync(join(dir, 'index.jsonl'), 'utf8') + '{not json\n', 'utf8');
  assert.throws(() => readIndex(dir), (e) => e.code === 'bad-index-line' && e.line === 6);
});

test('formatIndexLine: reorders keys, drops undefined, requires id', () => {
  const line = formatIndexLine({ words: 1, title: 't', id: 'x', extra: undefined, warnings: [] });
  assert.equal(line, '{"id":"x","title":"t","words":1,"warnings":[]}\n');
  assert.throws(() => formatIndexLine({ title: 'no id' }), TypeError);
});

test('summaryOf / countWords / flattenScores', () => {
  assert.equal(summaryOf('\n\n## heading\n\n- **bold** item [[x|X]] and [[y]]\n* second\n\nnext para'), 'bold item X and y second');
  assert.equal(summaryOf('1. numbered ![img](a.png) text'), 'numbered img text');
  const long = '字'.repeat(300);
  assert.equal(Array.from(summaryOf(long)).length, 240);
  assert.equal(summaryOf(''), '');
  // 3 CJK characters (中 文 和) + 6 Latin words (English, words, 42, numbers, don't, split-this)
  assert.equal(countWords('中文 和 English words, 42 numbers; don\'t split-this'), 3 + 6);
  assert.equal(countWords(''), 0);
  assert.deepEqual(flattenScores({ a: { score: 0.1, reason: 'r' }, b: { value: 'v' } }), { a: 0.1, b: 'v' });
  assert.deepEqual(flattenScores(undefined), {});
});

test('rebuildIndex refuses to run without a readable config, and says why', () => {
  const dir = caseDir('index-noconfig');
  assert.throws(() => rebuildIndex(dir), (e) => e.code === 'config:missing' && /streams\.json/.test(e.message));
  assert.equal(existsSync(join(dir, 'index.jsonl')), false);
  writeFileSync(join(dir, 'streams.json'), '{bad', 'utf8');
  assert.throws(() => rebuildIndex(dir), (e) => e.code === 'config:invalid-json');
  writeFileSync(join(dir, 'streams.json'), '{"name":"x"}', 'utf8');
  assert.throws(() => rebuildIndex(dir), (e) => e.code === 'no-notes-dir');
});

test('sentinel: a deliberately broken note (missing source) never enters the index and keeps its bytes', () => {
  const dir = makeLibrary('index-sentinel');
  keepNote(dir, 'good');
  const bad = '---\nid: bad\ntitle: Bad\ndate: 2026-10-01\nstatus: kept\ntopics: [MCP]\n---\nno source here\n';
  writeRawNote(dir, 'bad.md', bad);
  const before = hashNotes(dir);
  const { entries, pending } = rebuildIndex(dir);
  assert.deepEqual(entries.map((e) => e.id), ['good']);
  assert.deepEqual(pending, [{ file: 'bad.md', codes: ['missing:source'], messages: ['required field "source" is missing or empty'] }]);
  assert.deepEqual(hashNotes(dir), before);
  assert.equal(readRawNote(dir, 'bad.md'), bad);
});

// 验方 2026-11-02 报的测试缺口 B1：文件名顺序 ≠ id 顺序（"-" 排在 "." 前）时，索引仍按 id 排序。
test('index is sorted by id, not by file name ("zz" before "zz-b")', () => {
  const dir = makeLibrary('index-id-order');
  keepNote(dir, 'zz-b');
  keepNote(dir, 'zz');
  keepNote(dir, 'aa');
  const { entries } = rebuildIndex(dir);
  assert.deepEqual(entries.map((e) => e.id), ['aa', 'zz', 'zz-b']);
  assert.deepEqual(readLines(dir).map((l) => JSON.parse(l).id), ['aa', 'zz', 'zz-b']);
  // sentinel: the file-name order really is different, else this test proves nothing
  const byName = ['zz-b.md', 'zz.md', 'aa.md'].sort();
  assert.deepEqual(byName, ['aa.md', 'zz-b.md', 'zz.md']);
});
