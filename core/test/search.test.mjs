import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, textTokens, queryTokens, scoreEntry, rankEntries, snippetOf, WEIGHTS } from '../src/library/search.mjs';
import { rebuildIndex } from '../src/library/index.mjs';
import { makeLibrary, keepNote } from './support/fixtures.mjs';

test('textTokens: Latin words lower-cased without punctuation, Han text in adjacent pairs, NFKC first', () => {
  assert.deepEqual(textTokens('Agent-Memory, MCP!'), ['agent', 'memory', 'mcp']);
  assert.deepEqual(textTokens('记忆方案'), ['记忆', '忆方', '方案']);
  assert.deepEqual(textTokens('Ｍｅｍｏｒｙ'), ['memory'], 'full-width letters fold to ASCII');
  assert.deepEqual(textTokens('a 记 5'), ['5', '记'], 'one-letter Latin word dropped, digits and a lone Han character kept');
  assert.deepEqual(textTokens('MemGPT论文'), ['memgpt', '论文']);
  assert.deepEqual(queryTokens('memory Memory 记忆 记忆'), ['memory', '记忆']);
  assert.deepEqual(queryTokens('  ?? ！'), []);
});

test('scoreEntry: title x3, topics x2, summary x1, body x1, counting every occurrence', () => {
  assert.deepEqual(WEIGHTS, { title: 3, topics: 2, summary: 1, body: 1 });
  const t = ['memory'];
  assert.equal(scoreEntry(t, { title: 'memory', topics: [], summary: '', body: '' }), 3);
  assert.equal(scoreEntry(t, { title: '', topics: ['memory'], summary: '', body: '' }), 2);
  assert.equal(scoreEntry(t, { title: '', topics: [], summary: 'memory', body: '' }), 1);
  assert.equal(scoreEntry(t, { title: '', topics: [], summary: '', body: 'memory memory' }), 2);
  assert.equal(scoreEntry(t, { title: 'memory', topics: ['memory'], summary: 'memory', body: 'memory' }), 7);
  assert.equal(scoreEntry(t, { title: 'memoryless', topics: [], summary: '', body: '' }), 0, 'a word, not a substring');
  assert.equal(scoreEntry(['记忆'], { title: 'agent 记忆方案', topics: ['agent 记忆'], summary: '', body: '' }), 5);
});

function library(name) {
  const dir = makeLibrary(name);
  keepNote(dir, 'a-title', { title: 'Agent memory blocks', date: '2026-10-01', topics: ['MCP'] }, 'Nothing here.\n');
  keepNote(dir, 'b-topic', { title: 'Something else', date: '2026-10-02', topics: ['agent 记忆'] }, 'Plain body.\n');
  keepNote(dir, 'c-body', { title: 'Third', date: '2026-10-03', topics: ['MCP'] }, `Intro line.\n\n${'filler '.repeat(30)}the memory part is here ${'tail '.repeat(30)}\n`);
  keepNote(dir, 'd-tie-old', { title: 'memory', date: '2026-09-01', topics: ['MCP'] }, 'x\n');
  keepNote(dir, 'e-tie-new', { title: 'memory', date: '2026-09-05', topics: ['MCP'] }, 'x\n');
  keepNote(dir, 'f-authored', { title: 'My memory notes', status: 'authored', kept: undefined, date: '2026-10-04', topics: ['MCP'] }, 'x\n');
  rebuildIndex(dir);
  return dir;
}

test('search: ranked by score, ties by date newest first, then id; empty query gives []', () => {
  const dir = library('search-rank');
  const r = search(dir, 'memory');
  // a-title 3 (title); d / e 3 (title); f 3 (title); c-body 1 (body); b-topic 0
  assert.deepEqual(r.map((x) => [x.id, x.score]), [['f-authored', 3], ['a-title', 3], ['e-tie-new', 3], ['d-tie-old', 3], ['c-body', 1]]);
  assert.deepEqual(Object.keys(r[0]), ['id', 'title', 'date', 'source_name', 'status', 'topics', 'score', 'snippet']);
  assert.deepEqual(search(dir, ''), []);
  assert.deepEqual(search(dir, '   ,, '), []);
  assert.deepEqual(search(dir, 'zzzz-not-there'), []);
  assert.throws(() => search(dir, null), (e) => e.code === 'bad-query');
  assert.throws(() => search(dir, 'x', { view: 'caught' }), (e) => e.code === 'bad-view');
});

test('search: topics weigh x2 and Chinese queries match by pairs', () => {
  const dir = library('search-zh');
  const r = search(dir, '记忆');
  assert.deepEqual(r.map((x) => [x.id, x.score]), [['b-topic', 2]]);
});

test('search: view / topics / days / limit filter before ranking', () => {
  const dir = library('search-filter');
  assert.deepEqual(search(dir, 'memory', { view: 'authored' }).map((x) => x.id), ['f-authored']);
  assert.ok(!search(dir, 'memory', { view: 'kept' }).some((x) => x.id === 'f-authored'));
  assert.deepEqual(search(dir, 'memory', { topics: ['agent 记忆'] }), []);
  const now = () => new Date(2026, 9, 5, 12);
  assert.deepEqual(search(dir, 'memory', { days: 3, now }).map((x) => x.id), ['f-authored', 'c-body'], 'only 10-02 onward');
  assert.equal(search(dir, 'memory', { limit: 2 }).length, 2);
});

test('search: the snippet is at most 80 characters around the first body hit; no body hit -> start of the summary', () => {
  const dir = library('search-snippet');
  const c = search(dir, 'memory').find((x) => x.id === 'c-body');
  assert.ok(Array.from(c.snippet).length <= 80, c.snippet);
  assert.match(c.snippet, /the memory part is here/);
  assert.doesNotMatch(c.snippet, /Intro line/, 'the window is around the hit, not the start of the body');
  const a = search(dir, 'memory').find((x) => x.id === 'a-title');
  assert.equal(a.snippet, 'Nothing here.');
  assert.equal(snippetOf('短短的正文提到记忆。', ['记忆']), '短短的正文提到记忆。');
  assert.equal(snippetOf('', ['x'], 'fallback summary'), 'fallback summary');
});

test('search: the same library and query give byte-identical results twice', () => {
  const dir = library('search-stable');
  const a = JSON.stringify(search(dir, 'memory 记忆 mcp'));
  const b = JSON.stringify(search(dir, 'memory 记忆 mcp'));
  assert.equal(a, b);
  assert.ok(a.length > 2);
});

test('rankEntries without bodyOf scores title, topics and summary only (the ask candidate pick)', () => {
  const entries = [
    { id: 'x', title: 'none', topics: [], summary: '', date: '2026-01-01' },
    { id: 'y', title: 'memory', topics: [], summary: 'memory', date: '2026-01-01' },
  ];
  const r = rankEntries(entries, 'memory');
  assert.deepEqual(r.map((e) => [e.entry.id, e.score]), [['y', 4]]);
  assert.deepEqual(rankEntries(entries, 'memory', { bodyOf: (e) => (e.id === 'x' ? 'memory' : '') }).map((e) => e.entry.id), ['y', 'x']);
});
