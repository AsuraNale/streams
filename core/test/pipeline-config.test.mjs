import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PIPELINE, pipelineConfig, pipelineFrom, savePipelineConfig, cfgOf, lockedChecklist, MAX_GATES } from '../src/pipeline/config.mjs';
import { DEFAULT_REQUIREMENTS } from '../src/pipeline/prompts.mjs';
import { runRound } from '../src/pipeline/round.mjs';
import { replayLedger } from '../src/library/ledger.mjs';
import { readConfig } from '../src/library/config.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { makeLibrary, TEST_CONFIG } from './support/fixtures.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, ledgerLines } from './support/pipeline.mjs';

function edit(cfg, fn) {
  const c = structuredClone(cfg);
  fn(c);
  return c;
}
function node(cfg, id) {
  return cfg.nodes.find((n) => n.id === id);
}

test('pipelineConfig: the W1 placeholder shape and a missing pipeline both resolve to the seven default nodes with baseline checklists', () => {
  const dir = makeLibrary('cfg-defaults');
  const cfg = pipelineConfig(dir);
  assert.deepEqual([cfg.cap, cfg.callGapMs, cfg.maxVerifyRounds, cfg.bodyMaxChars, cfg.cacheDays, cfg.language], [120, 0, 2, 6000, 7, 'zh-CN']);
  assert.deepEqual(cfg.nodes.map((n) => [n.id, n.kind]), [['fetch', 'fixed'], ['dedup', 'script'], ['relevance', 'gate'], ['substance', 'gate'], ['summary', 'summary'], ['decide', 'fixed'], ['store', 'fixed']]);
  assert.deepEqual([node(cfg, 'relevance').threshold, node(cfg, 'relevance').material], [0.7, 'meta']);
  assert.deepEqual([node(cfg, 'substance').threshold, node(cfg, 'substance').material], [0.6, 'body']);
  assert.equal(node(cfg, 'relevance').requirement, DEFAULT_REQUIREMENTS['zh-CN'].relevance);
  assert.deepEqual(node(cfg, 'substance').output, { substance: 'score', freshness: 'enum:new|followup|duplicate', reason: 'text', quote: 'text' });
  assert.deepEqual(node(cfg, 'relevance').checklist.map((c) => [c.id, c.origin]), [['json-keys', 'streams'], ['range-relevance', 'streams'], ['reason-length', 'streams'], ['quote-in-source', 'streams']]);
  assert.deepEqual(node(cfg, 'summary').checklist.map((c) => c.id), ['what-nonempty', 'points-count', 'no-placeholder', 'no-banned-words', 'quote-in-source', 'numbers-in-source']);
  assert.equal(node(cfg, 'fetch').checklist, undefined);
  // the file itself still holds the placeholder: baseline items are never stored
  assert.deepEqual(readConfig(dir).config.pipeline, TEST_CONFIG.pipeline);
  assert.deepEqual(pipelineFrom({}).nodes.map((n) => n.id), DEFAULT_PIPELINE().nodes.map((n) => n.id));
  assert.deepEqual(pipelineFrom({ pipeline: { language: 'en' } }).nodes[2].requirement, DEFAULT_REQUIREMENTS.en.relevance);
  assert.equal(pipelineFrom({ pipeline: { language: 'fr' } }).language, 'zh-CN', 'an unknown language falls back');
  assert.throws(() => pipelineConfig(join(dir, 'nowhere')), (e) => e.code === 'config:missing');
});

test('savePipelineConfig: every refused change has its code; the file is untouched after a refusal', () => {
  const dir = makeLibrary('cfg-locks');
  const cfg = pipelineConfig(dir);
  const before = readFileSync(join(dir, 'streams.json'), 'utf8');
  const cases = [
    ['remove the fetch node', (c) => { c.nodes = c.nodes.filter((n) => n.id !== 'fetch'); }, 'locked-node'],
    ['remove the store node', (c) => { c.nodes = c.nodes.filter((n) => n.id !== 'store'); }, 'locked-node'],
    ['remove the dedup node', (c) => { c.nodes = c.nodes.filter((n) => n.id !== 'dedup'); }, 'locked-node'],
    ['turn decide into a gate', (c) => { node(c, 'decide').kind = 'gate'; }, 'locked-node'],
    ['a new fixed node', (c) => { c.nodes.push({ id: 'archive', kind: 'fixed' }); }, 'locked-node'],
    ['change the output of gate 1', (c) => { node(c, 'relevance').output = { relevance: 'score', reason: 'text' }; }, 'locked-node'],
    ['change the summary output', (c) => { node(c, 'summary').output.points = 'list:5'; }, 'locked-node'],
    ['drop a baseline check', (c) => { node(c, 'relevance').checklist = node(c, 'relevance').checklist.filter((i) => i.id !== 'quote-in-source'); }, 'locked-node'],
    ['drop every check', (c) => { node(c, 'summary').checklist = []; }, 'locked-node'],
    ['a user item taking a baseline id', (c) => { node(c, 'relevance').checklist.push({ id: 'json-keys', desc: 'my own version of it', kind: 'judge' }); }, 'locked-node'],
    ['six gates', (c) => { for (let i = 0; i < 4; i++) c.nodes.splice(4, 0, { id: `extra-${i}`, kind: 'gate', threshold: 0.5, material: 'meta', requirement: 'look at it' }); }, 'bad-config'],
    ['no summary', (c) => { c.nodes = c.nodes.filter((n) => n.id !== 'summary'); }, 'bad-config'],
    ['two summaries', (c) => { c.nodes.push({ id: 'summary-2', kind: 'summary', requirement: 'again' }); }, 'bad-config'],
    ['threshold above 1', (c) => { node(c, 'relevance').threshold = 1.5; }, 'bad-config'],
    ['threshold below 0', (c) => { node(c, 'relevance').threshold = -0.1; }, 'bad-config'],
    ['threshold not a number', (c) => { node(c, 'relevance').threshold = '0.7'; }, 'bad-config'],
    ['unknown kind', (c) => { c.nodes.push({ id: 'magic', kind: 'magic' }); }, 'bad-config'],
    ['material not meta/body', (c) => { node(c, 'substance').material = 'all'; }, 'bad-config'],
    ['empty requirement', (c) => { node(c, 'relevance').requirement = '   '; }, 'bad-config'],
    ['negative cap', (c) => { c.cap = -1; }, 'bad-config'],
    ['fractional maxVerifyRounds', (c) => { c.maxVerifyRounds = 1.5; }, 'bad-config'],
    ['unknown language', (c) => { c.language = 'fr'; }, 'bad-config'],
    ['duplicate node id', (c) => { c.nodes.push({ id: 'relevance', kind: 'gate' }); }, 'bad-config'],
    ['nodes not an array', (c) => { c.nodes = {}; }, 'bad-config'],
  ];
  for (const [name, fn, code] of cases) {
    assert.throws(() => savePipelineConfig(dir, edit(cfg, fn)), (e) => e.code === code, `${name} -> ${code}`);
  }
  assert.throws(() => savePipelineConfig(dir, null), (e) => e.code === 'bad-config');
  assert.equal(readFileSync(join(dir, 'streams.json'), 'utf8'), before, 'a refused save writes nothing');
  assert.equal(MAX_GATES, 5);
});

test('savePipelineConfig: requirement, threshold, material, user checks and a fifth gate are accepted; other keys survive; baseline items are not stored', () => {
  const dir = makeLibrary('cfg-accept', { ...TEST_CONFIG, extra: { keep: 'me' } });
  const cfg = pipelineConfig(dir);
  const edited = edit(cfg, (c) => {
    node(c, 'relevance').requirement = '只看和 agent 记忆直接相关的。';
    node(c, 'relevance').threshold = 0.95;
    node(c, 'relevance').material = 'body';
    node(c, 'relevance').checklist.push({ id: 'names-the-kind', desc: '理由里说明它是什么东西', kind: 'judge' });
    node(c, 'summary').checklist.push({ id: 'no-exclaim', desc: '摘要里没有感叹号', kind: 'rule', rule: 'not_regex:!' });
    c.nodes.splice(4, 0, { id: 'novelty', kind: 'gate', threshold: 0.5, material: 'meta', requirement: '它是不是新东西' });
    c.nodes.splice(4, 0, { id: 'depth', kind: 'gate', threshold: 0.4, material: 'body', requirement: '有没有深度' });
    c.nodes.splice(4, 0, { id: 'style', kind: 'gate', threshold: 0.3, material: 'meta', requirement: '文风' });
    c.cap = 50;
    c.language = 'en';
  });
  const saved = savePipelineConfig(dir, edited);
  assert.deepEqual(saved.nodes.map((n) => n.id), ['fetch', 'dedup', 'relevance', 'substance', 'style', 'depth', 'novelty', 'summary', 'decide', 'store']);
  assert.equal(saved.nodes.filter((n) => n.kind === 'gate').length, 5);
  assert.deepEqual([saved.cap, saved.language], [50, 'en']);
  const raw = JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'));
  assert.deepEqual([raw.name, raw.topics, raw.extra], [TEST_CONFIG.name, TEST_CONFIG.topics, { keep: 'me' }], 'other keys untouched');
  const rel = raw.pipeline.nodes.find((n) => n.id === 'relevance');
  assert.deepEqual([rel.requirement, rel.threshold, rel.material], ['只看和 agent 记忆直接相关的。', 0.95, 'body']);
  assert.deepEqual(rel.checklist, [{ id: 'names-the-kind', desc: '理由里说明它是什么东西', kind: 'judge', origin: 'user' }], 'only the user item is stored');
  assert.deepEqual(raw.pipeline.nodes.find((n) => n.id === 'summary').checklist.map((i) => i.id), ['no-exclaim']);
  assert.deepEqual(raw.pipeline.nodes.find((n) => n.id === 'novelty').output, { novelty: 'score', reason: 'text', quote: 'text' }, 'a new gate gets the generated output');
  const back = pipelineConfig(dir);
  assert.deepEqual(node(back, 'relevance').checklist.map((c) => [c.id, c.origin]), [['names-the-kind', 'user'], ['json-keys', 'streams'], ['range-relevance', 'streams'], ['reason-length', 'streams'], ['quote-in-source', 'streams']]);
  assert.deepEqual(node(back, 'novelty').checklist.map((c) => c.id), ['json-keys', 'range-novelty', 'reason-length', 'quote-in-source']);
  // saving the read-back shape unchanged is a no-op round trip
  savePipelineConfig(dir, back);
  assert.deepEqual(pipelineConfig(dir), back);
  // a sixth gate on top is refused
  assert.throws(() => savePipelineConfig(dir, edit(back, (c) => { c.nodes.splice(4, 0, { id: 'sixth', kind: 'gate', requirement: 'x' }); })), (e) => e.code === 'bad-config');
});

test('cfgOf: changes with requirement / threshold / material / output, not with the checklist or the id order of keys', () => {
  const rel = DEFAULT_PIPELINE().nodes[2];
  const base = cfgOf(rel);
  assert.match(base, /^[0-9a-f]{8}$/);
  assert.equal(cfgOf({ ...rel, checklist: [{ id: 'x', desc: 'something else', kind: 'judge' }] }), base);
  assert.notEqual(cfgOf({ ...rel, threshold: 0.71 }), base);
  assert.notEqual(cfgOf({ ...rel, material: 'body' }), base);
  assert.notEqual(cfgOf({ ...rel, requirement: rel.requirement + ' ' }), base);
  assert.notEqual(cfgOf({ ...rel, output: { ...rel.output, extra: 'text' } }), base);
  assert.equal(cfgOf(DEFAULT_PIPELINE('zh-CN').nodes[2]), base, 'stable across calls');
  assert.notEqual(cfgOf(DEFAULT_PIPELINE('en').nodes[2]), base, 'the English requirement is a different cfg');
  assert.deepEqual(lockedChecklist({ kind: 'summary', checklist: [{ id: 'bad', desc: 'x', kind: 'judge' }] }).map((i) => i.id).includes('bad'), false, 'a too-short desc is dropped by the lock');
});

// 改过的过关线在下一轮生效：0.95 时 0.8 的条目停在关卡①；0.7 时过。
test('threshold in effect: at 0.95 an item scored 0.8 stops at gate 1; at 0.7 it passes; a changed threshold re-scores the item next round', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 1);
  const dir = libraryWithFeed('cfg-threshold', feedRoute(srv, items));
  const strict = edit(pipelineConfig(dir), (c) => { node(c, 'relevance').threshold = 0.95; });
  savePipelineConfig(dir, strict);
  const conn = scriptedConnector({ score: 0.8 });
  const r1 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.deepEqual(r1.counts.gate1, { passed: 0, failed: 1, unscored: 0 });
  assert.deepEqual(r1.counts.gate2, { passed: 0, failed: 0, unscored: 0 });
  assert.equal(r1.calls, 1);
  const s1 = replayLedger(dir).states.get(items[0].url);
  assert.deepEqual([s1.stage, s1.scores.relevance.score, s1.scores.substance], ['seen', 0.8, undefined]);
  // the same configuration again: nothing to do
  assert.equal((await runRound(dir, { connector: conn, ctx: ctx() })).calls, 0);
  // the line moves down to 0.7: a new cfg, the item is scored again and now passes through to the inbox
  savePipelineConfig(dir, edit(pipelineConfig(dir), (c) => { node(c, 'relevance').threshold = 0.7; }));
  const r3 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.deepEqual(r3.counts.gate1, { passed: 1, failed: 0, unscored: 0 });
  assert.equal(r3.calls, 4);
  assert.equal(replayLedger(dir).states.get(items[0].url).stage, 'inbox');
  const rel = ledgerLines(dir).filter((e) => e.ev === 'scored' && e.node === 'relevance');
  assert.equal(rel.length, 2);
  assert.notEqual(rel[0].cfg, rel[1].cfg);
});

test('sentinel: a pipeline whose summary node is missing from the file is restored by pipelineConfig, but a saved config without one is refused', () => {
  const dir = makeLibrary('cfg-nosummary', { ...TEST_CONFIG, pipeline: { nodes: [{ id: 'relevance', kind: 'gate', threshold: 0.7 }] } });
  const cfg = pipelineConfig(dir);
  assert.deepEqual(cfg.nodes.map((n) => n.id), ['fetch', 'dedup', 'relevance', 'substance', 'summary', 'decide', 'store']);
  assert.throws(() => savePipelineConfig(dir, { nodes: cfg.nodes.filter((n) => n.kind !== 'summary') }), (e) => e.code === 'bad-config');
});
