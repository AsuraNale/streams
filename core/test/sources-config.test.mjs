import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourcesView, guessSource, addSource, updateSource, removeSource, setSourcePaused, addTopic, updateTopic, removeTopic } from '../src/library/sources.mjs';
import { appendFetchLog } from '../src/fetch/log.mjs';
import { rebuildIndex } from '../src/library/index.mjs';
import { caseDir } from './support/tmp.mjs';
import { createLibrary } from '../src/library/create.mjs';
import { keepNote } from './support/fixtures.mjs';

const SOURCES = [
  { name: 'letta-blog', kind: 'rss', url: 'https://letta.test/rss', topic: 'agent 记忆' },
  { name: 'hn-mcp', kind: 'hn', query: 'MCP', min_points: 50, topic: 'MCP' },
];

// A library made by createLibrary (so streams.json is in its own format), with two topics, two sources
// and one key the core never reads: every write must keep it.
function library(name) {
  const dir = caseDir(name);
  createLibrary(dir, { name });
  const path = join(dir, 'streams.json');
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  cfg.topics = [{ name: 'agent 记忆', keywords: ['agent memory'] }, { name: 'MCP', keywords: ['MCP'] }];
  cfg.sources = structuredClone(SOURCES);
  cfg.x_future = { keep: ['me', 1] };
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return dir;
}

function config(dir) {
  return JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'));
}

function raw(dir) {
  return readFileSync(join(dir, 'streams.json'), 'utf8');
}

test('guessSource: http(s) -> rss, arxiv: prefix or quotes / OR -> arxiv, anything else -> hn; empty -> bad-input', () => {
  assert.deepEqual(guessSource(' https://blog.langchain.dev/rss/ '), { kind: 'rss', url: 'https://blog.langchain.dev/rss/', name: 'blog-langchain-dev' });
  assert.equal(guessSource('HTTP://x.test/feed').kind, 'rss');
  assert.deepEqual(guessSource('arxiv: agent memory'), { kind: 'arxiv', query: 'agent memory', name: 'arxiv-agent-memory' });
  assert.equal(guessSource('"agent memory" OR "memory for LLM agents"').kind, 'arxiv');
  assert.equal(guessSource('memory OR retrieval').kind, 'arxiv');
  assert.deepEqual(guessSource('MCP'), { kind: 'hn', query: 'MCP', name: 'hn-mcp' });
  assert.equal(guessSource('order of things').kind, 'hn', '"or" inside a word or lower case is not the OR operator');
  assert.equal(guessSource('ftp://x.test').kind, 'hn');
  for (const bad of ['', '   ', null, 42, 'arxiv:   ']) assert.throws(() => guessSource(bad), (e) => e.code === 'bad-input', String(bad));
});

test('addSource: checks the shape first, appends, and keeps every other key of streams.json', () => {
  const dir = library('src-add');
  const before = config(dir);
  const r = addSource(dir, { name: 'langchain-blog', kind: 'RSS', url: ' https://blog.langchain.dev/rss/ ', topic: 'agent 记忆' });
  assert.deepEqual(r.source, { name: 'langchain-blog', kind: 'rss', url: 'https://blog.langchain.dev/rss/', topic: 'agent 记忆' });
  const after = config(dir);
  assert.deepEqual(after.sources, [...SOURCES, r.source]);
  for (const k of Object.keys(before)) if (k !== 'sources') assert.deepEqual(after[k], before[k], k);
  assert.deepEqual(Object.keys(after), Object.keys(before), 'key order unchanged');
  assert.equal(raw(dir), JSON.stringify(after, null, 2) + '\n', '2-space JSON with a final newline');
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'no temporary file left');
  // a topic-less hn source is fine
  addSource(dir, { name: 'hn-evals', kind: 'hn', query: 'agent benchmark', topic: '' });
  assert.equal(config(dir).sources.at(-1).topic, undefined);
});

test('addSource refuses bad shapes (bad-source) and repeated names (duplicate-source) without writing', () => {
  const dir = library('src-add-bad');
  const before = raw(dir);
  const bad = [
    null,
    { name: 'x', kind: 'atom', url: 'https://x.test' },
    { name: 'Has Caps', kind: 'rss', url: 'https://x.test' },
    { name: 'a'.repeat(41), kind: 'rss', url: 'https://x.test' },
    { name: '', kind: 'rss', url: 'https://x.test' },
    { name: 'no-url', kind: 'rss' },
    { name: 'ftp', kind: 'rss', url: 'ftp://x.test/feed' },
    { name: 'no-query', kind: 'arxiv' },
    { name: 'empty-query', kind: 'hn', query: '  ' },
    { name: 'bad-topic', kind: 'hn', query: 'x', topic: 'not a topic' },
    { name: 'bad-points', kind: 'hn', query: 'x', min_points: -1 },
    { name: 'bad-paused', kind: 'hn', query: 'x', paused: 'yes' },
  ];
  for (const s of bad) assert.throws(() => addSource(dir, s), (e) => e.code === 'bad-source', JSON.stringify(s));
  assert.throws(() => addSource(dir, { name: 'hn-mcp', kind: 'hn', query: 'again' }), (e) => e.code === 'duplicate-source');
  assert.equal(raw(dir), before);
  // the sentinel: a well-formed source with a fresh name does go in
  addSource(dir, { name: 'ok-one', kind: 'arxiv', query: 'agent memory' });
  assert.notEqual(raw(dir), before);
});

test('updateSource: changes url / query / topic / min_points / name; rename may not collide; other keys refused', () => {
  const dir = library('src-update');
  assert.deepEqual(updateSource(dir, 'hn-mcp', { query: 'Model Context Protocol', min_points: 20 }).source, { name: 'hn-mcp', kind: 'hn', query: 'Model Context Protocol', min_points: 20, topic: 'MCP' });
  updateSource(dir, 'hn-mcp', { topic: null, min_points: null });
  assert.deepEqual(config(dir).sources[1], { name: 'hn-mcp', kind: 'hn', query: 'Model Context Protocol' });
  updateSource(dir, 'letta-blog', { name: 'letta' });
  assert.deepEqual(config(dir).sources.map((s) => s.name), ['letta', 'hn-mcp'], 'renamed in place, order kept');
  const before = raw(dir);
  assert.throws(() => updateSource(dir, 'letta', { name: 'hn-mcp' }), (e) => e.code === 'duplicate-source');
  assert.throws(() => updateSource(dir, 'letta', { kind: 'hn' }), (e) => e.code === 'bad-source');
  assert.throws(() => updateSource(dir, 'letta', { url: 'not a url' }), (e) => e.code === 'bad-source');
  assert.throws(() => updateSource(dir, 'nope', { url: 'https://x.test' }), (e) => e.code === 'not-found');
  assert.equal(raw(dir), before);
});

test('removeSource and setSourcePaused touch only that source; fetch_log and ledger stay as they were', () => {
  const dir = library('src-remove');
  appendFetchLog(dir, { round: 'r1', source: 'hn-mcp', kind: 'hn', status: 'ok', count: 3, new: 3 });
  const log = readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8');
  assert.deepEqual(setSourcePaused(dir, 'letta-blog', true), { name: 'letta-blog', paused: true });
  assert.equal(config(dir).sources[0].paused, true);
  setSourcePaused(dir, 'letta-blog', false);
  assert.equal('paused' in config(dir).sources[0], false);
  assert.throws(() => setSourcePaused(dir, 'letta-blog', 'yes'), (e) => e.code === 'bad-source');
  assert.throws(() => setSourcePaused(dir, 'nope', true), (e) => e.code === 'not-found');
  assert.deepEqual(removeSource(dir, 'hn-mcp'), { name: 'hn-mcp' });
  assert.deepEqual(config(dir).sources.map((s) => s.name), ['letta-blog']);
  assert.throws(() => removeSource(dir, 'hn-mcp'), (e) => e.code === 'not-found');
  assert.equal(readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8'), log);
  assert.equal(config(dir).x_future.keep[0], 'me');
});

test('topics: add / update keywords / rename (sources follow) / remove (sources cleared, kept entries untouched)', () => {
  const dir = library('src-topics');
  assert.deepEqual(addTopic(dir, { name: ' 评测 ', keywords: ['agent benchmark', ' ', 'agent benchmark', 'eval harness'] }).topic, { name: '评测', keywords: ['agent benchmark', 'eval harness'] });
  assert.throws(() => addTopic(dir, { name: 'mcp' }), (e) => e.code === 'duplicate-topic', 'case-folded duplicate');
  assert.throws(() => addTopic(dir, { name: '  ' }), (e) => e.code === 'bad-topic');
  assert.throws(() => addTopic(dir, { name: 'x', keywords: 'one' }), (e) => e.code === 'bad-topic');
  assert.deepEqual(updateTopic(dir, 'MCP', { keywords: ['MCP', 'MCP server'] }).topic, { name: 'MCP', keywords: ['MCP', 'MCP server'] });
  updateTopic(dir, 'MCP', { name: 'MCP 生态' });
  assert.equal(config(dir).sources[1].topic, 'MCP 生态', 'the source that used the old name follows the rename');
  assert.throws(() => updateTopic(dir, 'MCP 生态', { name: '评测' }), (e) => e.code === 'duplicate-topic');
  assert.throws(() => updateTopic(dir, 'MCP 生态', { color: 'red' }), (e) => e.code === 'bad-topic');
  assert.throws(() => updateTopic(dir, 'gone', { keywords: [] }), (e) => e.code === 'not-found');

  keepNote(dir, 'kept-one', { topics: ['agent 记忆'] });
  rebuildIndex(dir);
  const note = readFileSync(join(dir, 'notes', 'kept-one.md'), 'utf8');
  const r = removeTopic(dir, 'agent 记忆');
  assert.deepEqual(r.sourcesCleared, ['letta-blog']);
  assert.equal(r.topic.name, 'agent 记忆');
  assert.equal('topic' in config(dir).sources[0], false);
  assert.deepEqual(config(dir).topics.map((t) => t.name), ['MCP 生态', '评测']);
  assert.equal(readFileSync(join(dir, 'notes', 'kept-one.md'), 'utf8'), note, 'the kept entry is not rewritten');
  assert.deepEqual(rebuildIndex(dir).entries[0].warnings, ['unknown-topic:agent 记忆']);
  assert.throws(() => removeTopic(dir, 'agent 记忆'), (e) => e.code === 'not-found');
});

test('sourcesView: config + latest fetch state + hint + paused per source; topics with kept counts and source counts', () => {
  const dir = library('src-view');
  appendFetchLog(dir, { ts: '2026-11-01T08:00:00.000Z', round: 'r1', source: 'letta-blog', kind: 'rss', status: 'ok', count: 3, new: 3 });
  appendFetchLog(dir, { ts: '2026-11-02T08:00:00.000Z', round: 'r2', source: 'letta-blog', kind: 'rss', status: 'gap', http: 404, count: 0, new: 0, message: 'HTTP 404' });
  appendFetchLog(dir, { ts: '2026-11-03T08:00:00.000Z', round: 'r3', source: 'letta-blog', kind: 'rss', status: 'gap', http: 404, count: 0, new: 0, message: 'HTTP 404' });
  setSourcePaused(dir, 'hn-mcp', true);
  keepNote(dir, 'k1', { topics: ['MCP'] });
  keepNote(dir, 'k2', { topics: ['MCP', 'agent 记忆'] });
  keepNote(dir, 'a1', { topics: ['MCP'], status: 'authored', kept: undefined });
  rebuildIndex(dir);
  const v = sourcesView(dir);
  assert.deepEqual(v.counts, { sources: 2, topics: 2 });
  const letta = v.sources[0];
  assert.equal(letta.name, 'letta-blog');
  assert.equal(letta.url, 'https://letta.test/rss');
  assert.equal(letta.status, 'gap');
  assert.equal(letta.http, 404);
  assert.equal(letta.hint, 'fix-address-or-remove');
  assert.equal(letta.consecutive, 2);
  assert.equal(letta.lastOkAt, '2026-11-01T08:00:00.000Z');
  assert.equal(letta.paused, false);
  const hn = v.sources[1];
  assert.equal(hn.paused, true);
  assert.equal(hn.status, null, 'never fetched: no status, not "ok"');
  assert.equal(hn.consecutive, 0);
  assert.deepEqual(v.topics, [
    { name: 'agent 记忆', keywords: ['agent memory'], kept: 1, sources: 1 },
    { name: 'MCP', keywords: ['MCP'], kept: 2, sources: 1 },
  ]);
});

test('a streams.json that does not parse is reported, not overwritten', () => {
  const dir = library('src-broken');
  writeFileSync(join(dir, 'streams.json'), '{ "topics": [', 'utf8');
  assert.throws(() => addTopic(dir, { name: 'x' }), (e) => e.code === 'config:invalid-json');
  assert.throws(() => sourcesView(dir), (e) => e.code === 'config:invalid-json');
  assert.equal(raw(dir), '{ "topics": [');
});
