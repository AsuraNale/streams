import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graph } from '../src/graph/graph.mjs';
import { rebuildIndex } from '../src/library/index.mjs';
import { makeLibrary, keepNote, TEST_CONFIG } from './support/fixtures.mjs';

const CONFIG = {
  ...TEST_CONFIG,
  topics: [{ name: 'agent 记忆' }, { name: 'MCP' }, { name: '评测' }],
  sources: [{ name: 'letta-blog', kind: 'rss', url: 'https://l.test' }, { name: 'hn-mcp', kind: 'hn', query: 'MCP' }, { name: 'quiet', kind: 'rss', url: 'https://q.test' }],
};

function library(name) {
  const dir = makeLibrary(name, CONFIG);
  keepNote(dir, 'm1', { title: 'Memory blocks', date: '2026-10-31', topics: ['agent 记忆'], source_name: 'letta-blog' }, 'see [[m2]] and [[p1]]\n');
  keepNote(dir, 'm2', { title: 'MemGPT', date: '2023-10-12', topics: ['agent 记忆'], source_name: 'letta-blog' });
  keepNote(dir, 'p1', { title: 'Registry poisoning', date: '2026-10-28', topics: ['MCP'], source_name: 'hn-mcp' });
  keepNote(dir, 'x1', { title: 'Odd one', date: '2026-10-29', topics: ['旧主题', 'MCP'], source_name: 'manual' });
  keepNote(dir, 'a1', { title: 'My note', date: '2026-10-20', topics: ['agent 记忆'], status: 'authored', kept: undefined, source_name: undefined, source: 'file:a1.md' }, 'about [[m1]]\n');
  rebuildIndex(dir);
  return dir;
}

test('graph: three rows, counts, unknown topics flagged, configured sources listed even with no items', () => {
  const dir = library('graph-rows');
  const g = graph(dir);
  const row = (r) => g.nodes.filter((n) => n.row === r).map((n) => [n.id, n.count, n.col]);
  assert.deepEqual(row(0), [['topic:agent 记忆', 3, 0], ['topic:MCP', 2, 1], ['topic:旧主题', 1, 2], ['topic:评测', 0, 3]]);
  assert.equal(g.nodes.find((n) => n.id === 'topic:旧主题').unknown, true);
  assert.equal(g.nodes.find((n) => n.id === 'topic:MCP').unknown, undefined);
  assert.deepEqual(row(1), [['source:letta-blog', 2, 0], ['source:hn-mcp', 1, 1], ['source:manual', 1, 2], ['source:quiet', 0, 3]]);
  // items sit under their first topic's column, newest first inside it
  assert.deepEqual(row(2), [['item:m1', 1, 0], ['item:a1', 1, 1], ['item:m2', 1, 2], ['item:p1', 1, 3], ['item:x1', 1, 4]]);
  assert.deepEqual(g.nodes[0], { id: 'topic:agent 记忆', kind: 'topic', label: 'agent 记忆', count: 3, row: 0, col: 0 });
  assert.equal(g.nodes.find((n) => n.id === 'item:m1').label, 'Memory blocks');
});

test('graph: edges topic -> item, source -> item, item -> item for links; links=false drops the link edges', () => {
  const dir = library('graph-edges');
  const g = graph(dir);
  const kinds = (k) => g.edges.filter((e) => e.kind === k).map((e) => `${e.from}>${e.to}`);
  assert.deepEqual(kinds('link'), ['item:m1>item:m2', 'item:m1>item:p1', 'item:a1>item:m1']);
  assert.ok(kinds('topic').includes('topic:旧主题>item:x1') && kinds('topic').includes('topic:MCP>item:x1'));
  assert.equal(kinds('topic').length, 6);
  assert.deepEqual(kinds('source'), ['source:letta-blog>item:m1', 'source:letta-blog>item:m2', 'source:hn-mcp>item:p1', 'source:manual>item:x1']);
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) assert.ok(ids.has(e.from) && ids.has(e.to), `${e.from} -> ${e.to} points at drawn nodes`);
  const off = graph(dir, { links: false });
  assert.equal(off.edges.filter((e) => e.kind === 'link').length, 0);
  assert.equal(off.edges.length, g.edges.length - 3);
  assert.equal(off.filters.links, false);
});

test('graph: filters status / topics / days; links to filtered-out items are not drawn', () => {
  const dir = library('graph-filters');
  const kept = graph(dir, { status: 'kept' });
  assert.ok(!kept.nodes.some((n) => n.id === 'item:a1'));
  assert.ok(!kept.edges.some((e) => e.from === 'item:a1'), 'the authored note and its link are gone');
  assert.equal(kept.nodes.find((n) => n.id === 'topic:agent 记忆').count, 2);
  const mcp = graph(dir, { topics: ['MCP'] });
  assert.deepEqual(mcp.nodes.filter((n) => n.kind === 'item').map((n) => n.id), ['item:p1', 'item:x1']);
  assert.equal(mcp.edges.filter((e) => e.kind === 'link').length, 0, 'm1 -> p1 is not drawn when m1 is filtered out');
  const mem = graph(dir, { topics: ['agent 记忆'] });
  assert.deepEqual(mem.edges.filter((e) => e.kind === 'link').map((e) => `${e.from}>${e.to}`), ['item:m1>item:m2', 'item:a1>item:m1'], 'm1 is drawn, p1 is not: no edge to p1');
  const recent = graph(dir, { days: 30, now: () => new Date(2026, 10, 3, 12) });
  assert.ok(!recent.nodes.some((n) => n.id === 'item:m2'), '2023 item is out of the last 30 days');
  assert.deepEqual(recent.filters, { days: 30, status: 'all', topics: [], links: true });
  assert.throws(() => graph(dir, { status: 'authored' }), (e) => e.code === 'bad-argument');
});

test('graph: the same input gives byte-identical JSON twice, and the order does not depend on insertion order', () => {
  const dir = library('graph-stable');
  const a = JSON.stringify(graph(dir));
  const b = JSON.stringify(graph(dir));
  assert.equal(a, b);
  // the same notes written in another order give the same graph
  const dir2 = makeLibrary('graph-stable-2', CONFIG);
  keepNote(dir2, 'a1', { title: 'My note', date: '2026-10-20', topics: ['agent 记忆'], status: 'authored', kept: undefined, source_name: undefined, source: 'file:a1.md' }, 'about [[m1]]\n');
  keepNote(dir2, 'x1', { title: 'Odd one', date: '2026-10-29', topics: ['旧主题', 'MCP'], source_name: 'manual' });
  keepNote(dir2, 'p1', { title: 'Registry poisoning', date: '2026-10-28', topics: ['MCP'], source_name: 'hn-mcp' });
  keepNote(dir2, 'm2', { title: 'MemGPT', date: '2023-10-12', topics: ['agent 记忆'], source_name: 'letta-blog' });
  keepNote(dir2, 'm1', { title: 'Memory blocks', date: '2026-10-31', topics: ['agent 记忆'], source_name: 'letta-blog' }, 'see [[m2]] and [[p1]]\n');
  rebuildIndex(dir2);
  assert.equal(JSON.stringify(graph(dir2)), a);
});
