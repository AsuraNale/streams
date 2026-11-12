// Redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-1 … R3-4, 「测」): what the core says the library holds now that 资料库
// only lists what is a file of the library.
//   - listLibrary 'all' (资料库 「全部」) is every index row — kept, authored — and never a ledger item without a file; its count is
//     libraryCounts().all. Control: the same library has caught items (the old 「抓到的」), so a view that took them in would show.
//   - graph (图谱) draws only index entries: its item nodes are exactly the index's ids, the caught urls are none of them.
//   - a header written onto a file that has none (缺少文件头 → 写入): the body after the new header is the old file byte for byte
//     (a BOM and CRLF kept), and before 写入 the file is in no index, graph or search.
//   - 编辑: only title / topics / body; the source or a date cannot be changed; a file that is not there or does not conform
//     cannot be edited and nothing is created (V2: writeNoteFile by 'edit').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { libraryCounts, listLibrary } from '../src/library/browse.mjs';
import { rebuildIndex, readIndex } from '../src/library/index.mjs';
import { appendEvent } from '../src/library/ledger.mjs';
import { graph } from '../src/graph/graph.mjs';
import { applyProposedHeader, listPending } from '../src/library/pending.mjs';
import { search } from '../src/library/search.mjs';
import { editNote } from '../src/library/edit.mjs';
import { addDemand, appendDemandLine, demandsAdded } from '../src/ask/demand.mjs';
import { makeLibrary, keepNote, TEST_CONFIG } from './support/fixtures.mjs';
import { hashNotes, writeRawNote } from './support/raw-notes.mjs';

const CONFIG = { ...TEST_CONFIG, sources: [{ name: 'feed-a', kind: 'rss', url: 'https://a.test/feed', topic: 'agent 记忆' }] };

function world(name) {
  const dir = makeLibrary(name, CONFIG);
  keepNote(dir, 'k-one', { title: 'Kept one', date: '2026-10-30', source_name: 'feed-a' }, 'See [[mine]].\n');
  keepNote(dir, 'k-two', { title: 'Kept two', date: '2026-11-02', source_name: 'feed-a', topics: ['MCP'] });
  keepNote(dir, 'mine', { title: 'Mine', status: 'authored', date: '2026-10-31', kept: undefined, collected: undefined, source: 'file:mine.md', source_name: undefined });
  // caught: one seen only, one waiting in 待看, one below relevance — none of them a file
  appendEvent(dir, { ev: 'seen', url: 'https://u.test/seen', source: 'feed-a', title: 'Only seen', date: '2026-11-01' });
  appendEvent(dir, { ev: 'seen', url: 'https://u.test/inbox', source: 'feed-a', title: 'Waiting in inbox', date: '2026-11-01' });
  appendEvent(dir, { ev: 'scored', url: 'https://u.test/inbox', node: 'relevance', score: 0.9, reason: 'r' });
  appendEvent(dir, { ev: 'inbox', url: 'https://u.test/inbox', round: 'r1', verified: true });
  appendEvent(dir, { ev: 'seen', url: 'https://u.test/below', source: 'feed-a', title: 'Below the line', date: '2026-11-01' });
  appendEvent(dir, { ev: 'scored', url: 'https://u.test/below', node: 'relevance', score: 0.1, reason: 'r' });
  rebuildIndex(dir);
  return dir;
}

test('R3-1 listLibrary all: every index row (kept and authored), newest date first; no ledger item without a file; counts.all = index rows', () => {
  const dir = world('r3-all');
  const caught = listLibrary(dir, { view: 'caught' }).items.map((i) => i.url);
  assert.equal(caught.length, 3, 'control: three caught items a wrong 「全部」 would show');
  const all = listLibrary(dir, { view: 'all' });
  assert.deepEqual(all.items.map((e) => e.id), ['k-two', 'mine', 'k-one']);
  assert.deepEqual(all.items.map((e) => e.status).sort(), ['authored', 'kept', 'kept']);
  for (const it of all.items) assert.equal(typeof it.id, 'string', 'an index row');
  assert.deepEqual(all.items.filter((it) => caught.includes(it.url) || caught.includes(it.source)), []);
  assert.deepEqual(new Set(all.items.map((e) => e.id)), new Set(readIndex(dir).map((e) => e.id)));
  const counts = libraryCounts(dir);
  assert.equal(counts.all, readIndex(dir).length);
  assert.equal(counts.all, counts.kept + counts.authored);
  assert.equal(all.total, counts.all);
  // the filters work on it as on the other index views
  assert.deepEqual(listLibrary(dir, { view: 'all', topics: ['MCP'] }).items.map((e) => e.id), ['k-two']);
});

test('R3-2 graph: the item nodes are exactly the index entries; no caught url is drawn', () => {
  const dir = world('r3-graph');
  const g = graph(dir, { days: null, status: 'all', links: true });
  const items = g.nodes.filter((n) => n.kind === 'item').map((n) => n.id.replace(/^item:/, '')).sort();
  assert.deepEqual(items, readIndex(dir).map((e) => e.id).sort());
  const caught = listLibrary(dir, { view: 'caught' }).items;
  assert.ok(caught.length > 0, 'control: there are caught items');
  for (const c of caught) assert.equal(g.nodes.some((n) => n.label === c.title || n.id === `item:${c.url}`), false, `${c.title} is not drawn`);
  // the [[link]] between two files is an edge of its own kind (drawn dashed)
  assert.deepEqual(g.edges.filter((e) => e.kind === 'link'), [{ from: 'item:k-one', to: 'item:mine', kind: 'link' }]);
});

test('R3-4 a header written onto a file without one: before, in no index / graph / search; after, the body is the old file byte for byte', () => {
  const dir = world('r3-header');
  const body = '﻿隔天回来这一组最接近真实使用。\r\n\r\n- 第二行 **不变**\r\n';
  writeRawNote(dir, 'r3-loose.md', body);
  rebuildIndex(dir);
  assert.ok(listPending(dir).some((p) => p.file === 'r3-loose.md'), 'listed as missing a header');
  assert.equal(readIndex(dir).some((e) => e.id === 'r3-loose'), false, 'not in the index before');
  assert.equal(graph(dir, {}).nodes.some((n) => n.id === 'item:r3-loose'), false, 'not in the graph before');
  assert.deepEqual(search(dir, '隔天回来'), [], 'not found by search before');
  const before = readFileSync(join(dir, 'notes', 'r3-loose.md'));
  const others = hashNotes(dir);
  delete others['r3-loose.md'];
  applyProposedHeader(dir, 'r3-loose.md');
  const after = readFileSync(join(dir, 'notes', 'r3-loose.md'));
  const oldBody = before.subarray(3); // the BOM
  assert.ok(after.subarray(0, 3).equals(before.subarray(0, 3)), 'the BOM stays first');
  const text = after.subarray(3).toString('utf8');
  assert.ok(text.startsWith('---\n'), 'a header now');
  const end = text.indexOf('\n---\n', 4) + 5;
  assert.ok(Buffer.from(text.slice(end), 'utf8').equals(oldBody), 'the body is the old file byte for byte');
  assert.ok(readIndex(dir).some((e) => e.id === 'r3-loose'), 'in the index after');
  const rest = hashNotes(dir);
  delete rest['r3-loose.md'];
  assert.deepEqual(rest, others, 'no other file touched');
});

test('R3-3 编辑: only title / topics / body; no source or date; a file not there or not conforming cannot be edited, nothing is created', () => {
  const dir = world('r3-edit');
  const path = join(dir, 'notes', 'k-one.md');
  const was = readFileSync(path);
  for (const changes of [{ source: 'https://elsewhere.test/' }, { date: '2020-01-01' }, { title: 'x', kept: '2020-01-01' }, { scores: {} }]) {
    assert.throws(() => editNote(dir, 'k-one', changes), (e) => e.code === 'bad-edit', JSON.stringify(changes));
    assert.ok(readFileSync(path).equals(was), `${JSON.stringify(changes)}: the file as it was`);
  }
  assert.throws(() => editNote(dir, 'not-there', { title: 'New' }), (e) => e.code === 'not-found');
  assert.equal(existsSync(join(dir, 'notes', 'not-there.md')), false, 'nothing created');
  writeFileSync(join(dir, 'notes', 'broken.md'), 'no header\n', 'utf8');
  assert.throws(() => editNote(dir, 'broken', { title: 'New' }), (e) => e.code === 'not-editable');
  assert.equal(readFileSync(join(dir, 'notes', 'broken.md'), 'utf8'), 'no header\n');
  // control: the four things do change
  const r = editNote(dir, 'k-one', { title: 'Kept one, renamed' });
  assert.equal(r.entry.title, 'Kept one, renamed');
});

test('R3-5 demandsAdded: only the clicks of 「记到想补的主题」 (by user), with their question; an asked line is not one', () => {
  const dir = world('r3-demand');
  appendDemandLine(dir, { question: '隔天回来哪种最好？', topic: '隔天回来的排名', notInLibrary: true, used: [] });
  assert.deepEqual(demandsAdded(dir), [], 'control: a question asked is not a click');
  addDemand(dir, '  隔天回来的排名 ', { question: '隔天回来哪种最好？' });
  addDemand(dir, 'MCP 安全', {});
  assert.deepEqual(demandsAdded(dir), [{ topic: '隔天回来的排名', question: '隔天回来哪种最好？' }, { topic: 'MCP 安全', question: null }]);
});

test('R3-1 search snippets carry no Markdown marks (** [[ ]] # ` and list marks): the plain text of the body', () => {
  const dir = world('r3-snippet');
  keepNote(dir, 'marked', { title: 'Marked note', date: '2026-11-03', source_name: 'feed-a' }, '## 小标题\n\n**加粗的** 隔天回来 和 [[Kept one]] 以及 `代码`\n\n- 列表项 隔天回来\n');
  rebuildIndex(dir);
  const hits = search(dir, '隔天回来');
  assert.equal(hits.length, 1, 'control: the note is found');
  assert.doesNotMatch(hits[0].snippet, /\*\*|\[\[|\]\]|`|^#|(^|\s)- /, hits[0].snippet);
  assert.match(hits[0].snippet, /加粗的 隔天回来 和 Kept one 以及 代码/);
});
