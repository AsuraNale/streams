// redesign R6b: 「next round」 reads 「next run」 here (comments, test names, the text of an assertion's message; in
// fetch-round.test and the r5a fixtures also the fetch log's message, which core fetch/states.mjs now writes as 'retry next
// run') — 05 统一用词 says 运行 / run, and the contract (R6b-1) wants the v1 处理建议's fragment 'next round' gone from the repository.
// Nothing else that is checked changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions, assertAllowed } from '../src/pipeline/invariants.mjs';
import { nextStep, buildQueue } from '../src/pipeline/queue.mjs';
import { DEFAULT_PIPELINE, cfgOf, pipelineFrom, pipelineConfig } from '../src/pipeline/config.mjs';
import { appendEvent, replayLedger } from '../src/library/ledger.mjs';
import { keep } from '../src/pipeline/decide.mjs';
import { runRound } from '../src/pipeline/round.mjs';
import { scriptedConnector, titleOf, scoreKeyOf, promptKind } from '../src/pipeline/fake.mjs';
import { makeLibrary } from './support/fixtures.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, hashTree } from './support/pipeline.mjs';

const cfg = pipelineFrom({ pipeline: DEFAULT_PIPELINE('zh-CN') });
const REL = cfg.nodes.find((n) => n.id === 'relevance');
const SUB = cfg.nodes.find((n) => n.id === 'substance');
const SUM = cfg.nodes.find((n) => n.id === 'summary');

function state(over = {}) {
  return { url: 'https://u/1', stage: 'seen', scores: {}, unscored: {}, ...over };
}
function scored(node, score, { cfg: stamp = cfgOf(node) } = {}) {
  return { scores: { [node.id]: { score, reason: 'r' } }, cfg: { [node.id]: stamp } };
}

// 不变量①：阶段 → 允许动作表
test('invariant 1: stage -> allowed actions, each stage checked with its allowed and its refused action', () => {
  assert.deepEqual(allowedActions(state(), cfg), ['gate:relevance']);
  assert.throws(() => assertAllowed(state(), 'gate:substance', cfg), (e) => e.code === 'not-allowed' && /seen/.test(e.message));
  assert.throws(() => assertAllowed(state(), 'body', cfg), (e) => e.code === 'not-allowed');
  assert.throws(() => assertAllowed(state(), 'summary', cfg), (e) => e.code === 'not-allowed');
  assert.throws(() => assertAllowed(state(), 'keep', cfg), (e) => e.code === 'not-allowed');
  assert.equal(assertAllowed(state(), 'gate:relevance', cfg), true);

  const passed1 = state(scored(REL, 0.8));
  assert.deepEqual(allowedActions(passed1, cfg), ['body', 'gate:substance']);
  assert.throws(() => assertAllowed(passed1, 'summary', cfg), (e) => e.code === 'not-allowed');
  assert.throws(() => assertAllowed(passed1, 'keep', cfg), (e) => e.code === 'not-allowed');

  const failed1 = state(scored(REL, 0.5));
  assert.deepEqual(allowedActions(failed1, cfg), [], 'below the line: nothing, it stays caught');
  assert.throws(() => assertAllowed(failed1, 'gate:substance', cfg), (e) => e.code === 'not-allowed');

  const passed2 = state({ scores: { relevance: { score: 0.8 }, substance: { score: 0.7 } }, cfg: { relevance: cfgOf(REL), substance: cfgOf(SUB) } });
  assert.deepEqual(allowedActions(passed2, cfg), ['summary']);
  assert.throws(() => assertAllowed(passed2, 'keep', cfg), (e) => e.code === 'not-allowed');
  const failed2 = state({ scores: { relevance: { score: 0.8 }, substance: { score: 0.2 } }, cfg: { relevance: cfgOf(REL), substance: cfgOf(SUB) } });
  assert.deepEqual(allowedActions(failed2, cfg), []);

  const inbox = state({ ...passed2, stage: 'inbox' });
  assert.deepEqual(allowedActions(inbox, cfg), ['keep', 'dismiss', 'later']);
  assert.throws(() => assertAllowed(inbox, 'gate:relevance', cfg), (e) => e.code === 'not-allowed');
  assert.throws(() => assertAllowed(inbox, 'summary', cfg), (e) => e.code === 'not-allowed');

  for (const stage of ['kept', 'dismissed']) {
    const terminal = state({ ...passed2, stage });
    assert.deepEqual(allowedActions(terminal, cfg), [], stage);
    for (const a of ['gate:relevance', 'body', 'gate:substance', 'summary', 'keep', 'dismiss', 'later']) {
      assert.throws(() => assertAllowed(terminal, a, cfg), (e) => e.code === 'not-allowed', `${stage} ${a}`);
    }
  }
  assert.deepEqual(allowedActions(null, cfg), []);
  assert.throws(() => assertAllowed(state(), '', cfg), (e) => e.code === 'not-allowed');
  // the default config is used when none is passed
  assert.deepEqual(allowedActions(state()), ['gate:relevance']);
});

// 不变量②：前提按账本真实状态查，不按本轮内存
test('invariant 2: keep reads the stage from the ledger it replays, not from what the caller thinks', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 1);
  const dir = libraryWithFeed('inv-real-state', feedRoute(srv, items));
  const conn = scriptedConnector();
  await runRound(dir, { connector: conn, ctx: ctx() });
  const url = items[0].url;
  const memory = replayLedger(dir).states.get(url);
  assert.equal(memory.stage, 'inbox');
  // the ledger moves on behind the caller's back: a dismissed event lands
  appendEvent(dir, { ev: 'dismissed', url, reason: 'changed my mind' });
  const before = hashTree(dir);
  assert.throws(() => keep(dir, url), (e) => e.code === 'not-in-inbox' && /dismissed/.test(e.message));
  assert.deepEqual(hashTree(dir), before);
  // and the queue is built from the ledger: a url that is terminal there is not queued even if just fetched
  const q = buildQueue(dir, pipelineConfig(dir));
  assert.deepEqual([q.byNode.relevance, q.byNode.substance, q.summary], [[], [], []]);
  assert.deepEqual(nextStep(replayLedger(dir).states.get(url), pipelineConfig(dir)), { kind: 'done', why: 'terminal' });
});

// 不变量③：同一动作同样参数不做第二次 —— 同一 url 同一关卡同一 cfg 不再调用；cfg 变了才会。
// redesign R5a (N07, 维护者 11-12 第 5 条): a different cfg no longer reopens a gate that was SCORED — the old verdict stands
// where it was (judged against the threshold it was given), and only 重新评分 ({ rescore: true }) reopens it. This test used
// to assert that a different cfg reopens it; the unscored / connection half is unchanged.
test('invariant 3: a gate scored under the current cfg is not an allowed action again; a different cfg keeps the old verdict (only 重新评分 reopens it); unscored under the same cfg stays closed except connection failures', () => {
  const done = state(scored(REL, 0.8));
  assert.equal(allowedActions(done, cfg).includes('gate:relevance'), false);
  assert.throws(() => assertAllowed(done, 'gate:relevance', cfg), (e) => e.code === 'not-allowed');
  assert.deepEqual(nextStep(done, cfg), { kind: 'gate', node: SUB });
  const stale = state(scored(REL, 0.8, { cfg: 'deadbeef' }));
  // redesign R5a (precheck fix 4): a stamp that gives no threshold is no longer judged against the threshold of now (that let a
  // loosened 严格程度 move old 未通过筛选 items on, and the next run called the model for them): the ledger's record of where
  // the item went decides — no later step recorded → it stopped here; a later step scored → it had passed
  assert.deepEqual(allowedActions(stale, cfg), [], 'an old cfg whose threshold is unknown, nothing after it: it stays below, old');
  assert.deepEqual(nextStep(stale, cfg), { kind: 'done', why: 'below:relevance', old: true });
  const staleOn = state({ scores: { relevance: { score: 0.3, reason: 'r' }, substance: { score: 0.7, reason: 'r' } }, cfg: { relevance: 'deadbeef', substance: cfgOf(SUB) } });
  assert.deepEqual(nextStep(staleOn, cfg), { kind: 'summary', node: SUM }, 'an old cfg whose threshold is unknown, a later step scored: it had passed (whatever 0.3 is against now)');
  assert.deepEqual(nextStep(stale, cfg, { rescore: true }), { kind: 'gate', node: REL }, '重新评分 reopens it');
  const changed = { ...cfg, nodes: cfg.nodes.map((n) => (n.id === 'relevance' ? { ...n, threshold: 0.95 } : n)) };
  assert.notEqual(cfgOf(changed.nodes[2]), cfgOf(REL));
  assert.deepEqual(allowedActions(done, changed), ['body', 'gate:substance'], 'a threshold change is a new cfg, but the old verdict (0.8 ≥ the 0.7 it was judged against) stands');
  const low = state(scored(REL, 0.6));
  const looser = { ...cfg, nodes: cfg.nodes.map((n) => (n.id === 'relevance' ? { ...n, threshold: 0.5 } : n)) };
  assert.deepEqual(nextStep(low, looser), { kind: 'done', why: 'below:relevance', old: true }, 'below the 0.7 it was judged against: still below under 0.5');
  assert.deepEqual(nextStep(low, looser, { rescore: true }), { kind: 'gate', node: looser.nodes[2] });
  const stuck = state({ unscored: { relevance: 'bad-format' }, cfg: { relevance: cfgOf(REL) } });
  assert.deepEqual(allowedActions(stuck, cfg), []);
  assert.deepEqual(nextStep(stuck, cfg), { kind: 'done', why: 'stuck:relevance' });
  const conn = state({ unscored: { relevance: 'connection:login-expired' }, cfg: { relevance: cfgOf(REL) } });
  assert.deepEqual(allowedActions(conn, cfg), ['gate:relevance'], 'no answer came back: try again next run');
  const stuckSummary = state({ scores: { relevance: { score: 0.8 }, substance: { score: 0.7 } }, unscored: { summary: 'bad-format' }, cfg: { relevance: cfgOf(REL), substance: cfgOf(SUB), summary: cfgOf(SUM) } });
  assert.deepEqual(nextStep(stuckSummary, cfg), { kind: 'done', why: 'stuck:summary' });
  assert.deepEqual(allowedActions(stuckSummary, cfg), []);
});

test('invariant 3 on disk: two rounds over the same items never send the same (item, gate) prompt twice; a config change does', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 3);
  const dir = libraryWithFeed('inv-no-repeat', feedRoute(srv, items));
  const conn = scriptedConnector();
  await runRound(dir, { connector: conn, cap: 4, ctx: ctx() });
  await runRound(dir, { connector: conn, ctx: ctx() });
  const pairs = conn.calls.filter((c) => promptKind(c) === 'gate').map((c) => `${titleOf(c.prompt)}|${scoreKeyOf(c.prompt)}`);
  assert.equal(pairs.length, 6);
  assert.equal(new Set(pairs).size, 6);
  const dirLib = makeLibrary('inv-ledger-shape');
  appendEvent(dirLib, { ev: 'seen', url: 'https://u/1', source: 's', title: 't' });
  appendEvent(dirLib, { ev: 'scored', url: 'https://u/1', node: 'relevance', score: 0.9, reason: 'r', cfg: cfgOf(REL) });
  assert.deepEqual(replayLedger(dirLib).states.get('https://u/1').cfg, { relevance: cfgOf(REL) }, 'replay keeps the cfg stamp per node');
});
