// The library's angle is told to every gate and the summary (prompts.mjs libraryBlock). Found on
// 2026-11-03 with two real models: without it both scored 0.4 and answered that the library's topic
// was not stated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gatePrompt, summaryPrompt, libraryBlock } from '../src/pipeline/prompts.mjs';
import { runRound } from '../src/pipeline/round.mjs';
import { createLibrary } from '../src/library/create.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, ctx, callsOf } from './support/pipeline.mjs';
import { caseDir } from './support/tmp.mjs';

const node = { id: 'relevance', kind: 'gate', requirement: '判断相关性。', threshold: 0.7, material: 'meta', output: { relevance: 'score', reason: 'text', quote: 'text' } };
const summary = { id: 'summary', kind: 'summary', requirement: '写摘要。', output: { what: 'text', points: 'list:3', quote: 'text' } };
const item = { url: 'https://x/1', title: 'T', source: 'https://x/1', date: '2026-11-01', summary: 'S' };

test('libraryBlock: topic names joined, the source topic on its own line, none when the library has no topics', () => {
  assert.equal(libraryBlock({ topics: ['agent 记忆', { name: 'MCP' }], sourceTopic: 'agent 记忆' }), '这个资料库关注的主题：agent 记忆；MCP\n这条来源在库里标的主题：agent 记忆');
  assert.equal(libraryBlock({ topics: [] }), '这个资料库关注的主题：无');
  assert.equal(libraryBlock({ topics: ['a'], sourceTopic: '  ' }), '这个资料库关注的主题：a');
  assert.equal(libraryBlock({ topics: ['memory'], sourceTopic: 'memory', language: 'en' }), 'The topics this library follows: memory\nThe topic this source is filed under: memory');
});

test('gatePrompt and summaryPrompt carry the library block after the requirement and before the material', () => {
  for (const [name, p] of [['gate', gatePrompt({ node, item, topics: ['agent 记忆'], sourceTopic: 'agent 记忆' })], ['summary', summaryPrompt({ node: summary, item, topics: ['agent 记忆'] })]]) {
    const lib = p.indexOf('这个资料库关注的主题：agent 记忆');
    assert.ok(lib > 0, `${name}: the library block is there`);
    assert.ok(lib > p.indexOf(name === 'gate' ? '判断相关性。' : '写摘要。'), `${name}: after the requirement`);
    assert.ok(lib < p.indexOf('\n---\n'), `${name}: before the material`);
  }
  assert.ok(gatePrompt({ node, item, topics: ['agent 记忆'], sourceTopic: 'agent 记忆' }).includes('这条来源在库里标的主题：agent 记忆'));
  assert.ok(gatePrompt({ node, item }).includes('这个资料库关注的主题：无'), 'no topics given: says none rather than omitting the block');
  assert.ok(!gatePrompt({ node, item }).includes('这条来源在库里标的主题'), 'no source topic: no second line');
});

test('runRound: every gate and summary prompt the connector receives names the library topics and the source topic', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 1));
  const dir = caseDir('prompt-topics-lib');
  createLibrary(dir, { name: 'lib', language: 'zh-CN' });
  const p = join(dir, 'streams.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  cfg.topics = [{ name: 'agent 记忆' }, { name: 'MCP' }];
  cfg.sources = [{ name: 'feed', kind: 'rss', url: feed, topic: 'MCP' }];
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  const conn = scriptedConnector();
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.ok, true);
  const model = callsOf(conn).filter((c) => typeof c.prompt === 'string' && c.prompt.includes('这个资料库关注的主题'));
  assert.ok(model.length >= 3, `gate 1, gate 2 and the summary all carry it (got ${model.length})`);
  for (const c of model) {
    assert.ok(c.prompt.includes('这个资料库关注的主题：agent 记忆；MCP'), 'both topic names');
    assert.ok(c.prompt.includes('这条来源在库里标的主题：MCP'), 'the source topic');
  }
  // reverse: a library without topics says none, never the names of another library
  const dir2 = caseDir('prompt-topics-none');
  createLibrary(dir2, { name: 'lib2', language: 'zh-CN' });
  const p2 = join(dir2, 'streams.json');
  const cfg2 = JSON.parse(readFileSync(p2, 'utf8'));
  cfg2.sources = [{ name: 'feed', kind: 'rss', url: feed }];
  writeFileSync(p2, JSON.stringify(cfg2, null, 2) + '\n', 'utf8');
  const conn2 = scriptedConnector();
  await runRound(dir2, { connector: conn2, ctx: ctx() });
  const none = callsOf(conn2).filter((c) => typeof c.prompt === 'string' && c.prompt.includes('这个资料库关注的主题：无'));
  assert.ok(none.length >= 3);
  assert.ok(!callsOf(conn2).some((c) => String(c.prompt).includes('agent 记忆')));
});
