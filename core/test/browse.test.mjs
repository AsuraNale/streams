// redesign R6b: 「next round」 reads 「next run」 here (comments, test names, the text of an assertion's message; in
// fetch-round.test and the r5a fixtures also the fetch log's message, which core fetch/states.mjs now writes as 'retry next
// run') — 05 统一用词 says 运行 / run, and the contract (R6b-1) wants the v1 处理建议's fragment 'next round' gone from the repository.
// Nothing else that is checked changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { libraryCounts, listLibrary, readNote, notePath } from '../src/library/browse.mjs';
import { rebuildIndex } from '../src/library/index.mjs';
import { appendEvent } from '../src/library/ledger.mjs';
import { makeLibrary, keepNote, TEST_CONFIG } from './support/fixtures.mjs';
import { writeRawNote } from './support/raw-notes.mjs';

const CONFIG = { ...TEST_CONFIG, sources: [{ name: 'feed-a', kind: 'rss', url: 'https://a.test/feed', topic: 'agent 记忆' }, { name: 'feed-b', kind: 'rss', url: 'https://b.test/feed', topic: 'MCP' }] };
const NOW = () => new Date(2026, 10, 3, 12, 0, 0);

function library(name) {
  const dir = makeLibrary(name, CONFIG);
  keepNote(dir, 'k-old', { title: 'Old kept', date: '2026-09-01', kept: '2026-09-02', source_name: 'feed-a' });
  keepNote(dir, 'k-new', { title: 'New kept', date: '2026-10-30', kept: '2026-11-01', source_name: 'feed-a', topics: ['MCP'] }, 'Links to [[k-old]] and [[Mine]].\n');
  keepNote(dir, 'k-mid', { title: 'Mid kept', date: '2026-10-31', kept: '2026-10-31', source_name: 'feed-a' }, 'See [[k-old]].\n');
  keepNote(dir, 'mine', { title: 'Mine', status: 'authored', date: '2026-10-20', kept: undefined, collected: undefined, source: 'file:mine.md', source_name: undefined });
  keepNote(dir, 'mine-2', { title: 'Mine two', status: 'authored', date: '2026-10-25', kept: undefined, collected: undefined, source: 'file:mine-2.md', source_name: undefined });
  rebuildIndex(dir);
  return dir;
}

// 1.1 W7b: v1.0's 「抓到的」 (caught: the ledger items its scoring steps had seen) left with the scoring pipeline — neither a count
// nor a view of it any more, however many ledger items a v1.0 library has
test('libraryCounts: kept / authored from the index, pending from listPending; no count of ledger items without a file', () => {
  const dir = library('browse-counts');
  appendEvent(dir, { ev: 'seen', url: 'https://u/1', source: 'feed-a', title: 'one' });
  appendEvent(dir, { ev: 'seen', url: 'https://u/2', source: 'feed-a', title: 'two' });
  appendEvent(dir, { ev: 'inbox', url: 'https://u/2', round: 'r1', verified: true });
  appendEvent(dir, { ev: 'seen', url: 'https://u/3', source: 'feed-a', title: 'three' });
  appendEvent(dir, { ev: 'inbox', url: 'https://u/3', round: 'r1', verified: true });
  appendEvent(dir, { ev: 'kept', url: 'https://u/3', id: 'k-new' });
  appendEvent(dir, { ev: 'seen', url: 'https://u/4', source: 'feed-a', title: 'four' });
  appendEvent(dir, { ev: 'inbox', url: 'https://u/4', round: 'r1', verified: true });
  appendEvent(dir, { ev: 'dismissed', url: 'https://u/4', reason: 'no' });
  writeRawNote(dir, 'loose.md', 'no header at all\n');
  // redesign R3: libraryCounts also says how many files the library has (`all`: 资料库 「全部」)
  assert.deepEqual(libraryCounts(dir), { kept: 3, authored: 2, pending: 1, all: 5 });
  assert.throws(() => listLibrary(dir, { view: 'caught' }), (e) => e.code === 'bad-view');
});

test('listLibrary kept: newest kept first; authored: newest date first; total = items after filters', () => {
  const dir = library('browse-list');
  const kept = listLibrary(dir, { view: 'kept' });
  assert.equal(kept.view, 'kept');
  assert.deepEqual(kept.items.map((e) => e.id), ['k-new', 'k-mid', 'k-old']);
  assert.equal(kept.total, 3);
  assert.equal(kept.items[0].title, 'New kept', 'items are index rows');
  const authored = listLibrary(dir, { view: 'authored' });
  assert.deepEqual(authored.items.map((e) => e.id), ['mine-2', 'mine']);
  // topics: any one matches
  assert.deepEqual(listLibrary(dir, { view: 'kept', topics: ['MCP'] }).items.map((e) => e.id), ['k-new']);
  assert.deepEqual(listLibrary(dir, { view: 'kept', topics: ['MCP', 'agent 记忆'] }).items.map((e) => e.id), ['k-new', 'k-mid', 'k-old']);
  assert.equal(listLibrary(dir, { view: 'kept', topics: ['nothing'] }).total, 0);
  // days by date: 2026-11-03 minus 7 days = 2026-10-27 onward
  assert.deepEqual(listLibrary(dir, { view: 'kept', days: 7, now: NOW }).items.map((e) => e.id), ['k-new', 'k-mid']);
  assert.deepEqual(listLibrary(dir, { view: 'kept', days: 3, now: NOW }).items.map((e) => e.id), ['k-mid'], '10-31 is inside 3 days, 10-30 is not');
  assert.throws(() => listLibrary(dir, { view: 'everything' }), (e) => e.code === 'bad-view');
  assert.throws(() => listLibrary(dir, { view: 'kept', days: -1 }), (e) => e.code === 'bad-argument');
});

test('listLibrary pending: the listPending rows', () => {
  const dir = library('browse-pending');
  writeRawNote(dir, 'loose.md', '# Loose\nno header\n');
  const r = listLibrary(dir, { view: 'pending' });
  assert.equal(r.total, 1);
  assert.equal(r.items[0].file, 'loose.md');
  assert.deepEqual(r.items[0].codes, ['no-frontmatter']);
});

test('readNote: index row, body after the front matter, backlinks, same source (not itself, newest first, at most 5)', () => {
  const dir = library('browse-read');
  for (let i = 1; i <= 6; i++) keepNote(dir, `s-${i}`, { title: `Same ${i}`, date: `2026-08-0${i}`, source_name: 'feed-a' });
  rebuildIndex(dir);
  const r = readNote(dir, 'k-old');
  assert.equal(r.entry.id, 'k-old');
  assert.equal(r.file, 'k-old.md');
  assert.equal(r.body, 'Body of k-old.\n');
  // newest date first: k-mid (10-31) before k-new (10-30)
  assert.deepEqual(r.backlinks, [{ id: 'k-mid', title: 'Mid kept' }, { id: 'k-new', title: 'New kept' }]);
  assert.deepEqual(r.sameSource.map((s) => s.id), ['k-mid', 'k-new', 's-6', 's-5', 's-4']);
  assert.ok(!r.sameSource.some((s) => s.id === 'k-old'));
  assert.deepEqual(Object.keys(r.sameSource[0]), ['id', 'title', 'date']);
  // a link by title counts as a backlink too ([[Mine]] in k-new)
  assert.deepEqual(readNote(dir, 'mine').backlinks, [{ id: 'k-new', title: 'New kept' }]);
  assert.deepEqual(readNote(dir, 'mine').sameSource, [], 'no source_name: no same-source list');
  assert.throws(() => readNote(dir, 'nope'), (e) => e.code === 'not-found');
  assert.throws(() => readNote(dir, ''), (e) => e.code === 'not-found');
});

test('notePath: absolute path for an indexed id, not-found otherwise (no path built from an unknown id)', () => {
  const dir = library('browse-path');
  assert.equal(notePath(dir, 'k-old'), join(dir, 'notes', 'k-old.md'));
  for (const id of ['nope', '../streams', '..\\streams.json', undefined]) {
    assert.throws(() => notePath(dir, id), (e) => e.code === 'not-found', String(id));
  }
});

test('readNote scores: each score with its reason from the header (the index keeps only the number)', () => {
  const dir = makeLibrary('browse-scores', CONFIG);
  writeRawNote(dir, '2026-10-31-scored.md', [
    '---', 'id: 2026-10-31-scored', 'title: Scored one', 'source: https://a.test/1', 'source_name: feed-a', 'date: 2026-10-31',
    'status: kept', 'topics: [agent 记忆]', 'scores:', '  relevance: { score: 0.86, reason: 直接讲 agent 记忆的实现 }',
    '  freshness: { value: new, reason: 与库里 3 条相关 }', '---', 'body', '',
  ].join('\n'));
  rebuildIndex(dir);
  const r = readNote(dir, '2026-10-31-scored');
  assert.deepEqual(r.scores, { relevance: { score: 0.86, reason: '直接讲 agent 记忆的实现' }, freshness: { value: 'new', reason: '与库里 3 条相关' } });
  assert.equal(r.entry.scores.relevance, 0.86, 'the index row still holds the flat number');
  // reverse: a note without scores gives {}
  writeRawNote(dir, 'plain.md', ['---', 'id: plain', 'title: Plain', 'source: file:plain.md', 'date: 2026-10-01', 'status: authored', 'topics: [agent 记忆]', '---', 'x', ''].join('\n'));
  rebuildIndex(dir);
  assert.deepEqual(readNote(dir, 'plain').scores, {});
});
