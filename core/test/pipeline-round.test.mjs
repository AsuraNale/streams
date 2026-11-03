import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runRound } from '../src/pipeline/round.mjs';
import { replayLedger } from '../src/library/ledger.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { scriptedConnector, titleOf, scoreKeyOf, promptKind } from '../src/pipeline/fake.mjs';
import { RETRY_NOTE } from '../src/pipeline/prompts.mjs';
import { PROBE_PROMPT } from '../src/connect/types.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, stateHashes, ledgerLines, fetchLogLines, roundLines, setPipeline } from './support/pipeline.mjs';

// gate prompts the connector received, as (title, node) pairs — the identity of one gate call on one item
function gateCalls(conn) {
  return conn.calls.filter((c) => promptKind(c) === 'gate').map((c) => `${titleOf(c.prompt)}|${scoreKeyOf(c.prompt)}`);
}
function modelCalls(conn) {
  return conn.calls.filter((c) => c.prompt !== PROBE_PROMPT).length;
}
function scoredPairs(dir) {
  return ledgerLines(dir).filter((e) => e.ev === 'scored' && typeof e.score === 'number').map((e) => `${e.url}|${e.node}`);
}

// 方案 4.5 幂等检验：没有新数据时连跑两轮，第二轮必须什么都不改。
test('idempotent: a second round over the same feed changes no state file and makes 0 model calls; a new item makes the third round move', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 2);
  const feed = feedRoute(srv, items);
  const dir = libraryWithFeed('round-idem', feed);
  const conn = scriptedConnector();
  const r1 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r1.ok, true);
  assert.deepEqual([r1.counts.new, r1.counts.inbox, r1.calls, r1.stoppedAt], [2, 2, 8, undefined], JSON.stringify(r1));
  const after1 = stateHashes(dir);
  assert.ok(Object.keys(after1).some((k) => k.startsWith('_pipeline/inbox/')), 'inbox files exist');
  assert.ok(after1['_pipeline/verdicts.jsonl'], 'verdicts written');
  const logs1 = fetchLogLines(dir).length;

  conn.reset();
  const r2 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r2.ok, true);
  assert.equal(r2.calls, 0);
  assert.equal(modelCalls(conn), 0, 'only the probe');
  assert.deepEqual(stateHashes(dir), after1, 'ledger / inbox / notes / index / verdicts byte-identical');
  assert.deepEqual([r2.counts.new, r2.counts.inbox, r2.counts.gate1.passed], [0, 0, 0]);
  assert.equal(fetchLogLines(dir).length, logs1 + 1, 'fetch_log gets one more line');
  assert.equal(fetchLogLines(dir).at(-1).status, 'empty');
  assert.equal(roundLines(dir).length, 2);

  // negative: a third item on the feed must change things and cost calls
  feedRoute(srv, [...items, ...serveItems(srv, 3).slice(2)]);
  conn.reset();
  const r3 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r3.counts.new, 1);
  assert.equal(r3.calls, 4);
  assert.notDeepEqual(stateHashes(dir), after1);
  assert.equal(replayLedger(dir).states.size, 3);
});

// 中断续跑：第 3 次关卡调用时 abort；第二轮跑完；每 (url,node) 最多一条 scored；没有重复调用；url 集合不少。
test('resume after abort: the round stops after the current item, the next round finishes; no (url,node) is scored or called twice', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 6));
  const dir = libraryWithFeed('round-resume', feed);
  const ac = new AbortController();
  let gateCallsSeen = 0;
  const conn = scriptedConnector({ gate: () => { gateCallsSeen += 1; if (gateCallsSeen === 3) ac.abort(); return undefined; } });
  const r1 = await runRound(dir, { connector: conn, ctx: ctx(), signal: ac.signal });
  assert.equal(r1.ok, true);
  assert.equal(r1.stoppedAt, 'aborted');
  assert.equal(r1.calls, 3, 'the third call completes, then the round stops');
  assert.equal(replayLedger(dir).states.size, 6, 'all six urls are registered');
  assert.equal(scoredPairs(dir).length, 3);
  assert.equal(roundLines(dir).at(-1).stoppedAt, 'aborted');

  const r2 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r2.ok, true);
  assert.equal(r2.stoppedAt, undefined);
  assert.equal(r2.calls, 3 + 6 + 12, 'remaining gate 1 + all gate 2 + summary and judge for six');
  const states = replayLedger(dir).states;
  assert.equal(states.size, 6);
  assert.deepEqual([...states.values()].map((s) => s.stage), Array(6).fill('inbox'));
  const pairs = scoredPairs(dir);
  assert.equal(new Set(pairs).size, pairs.length, 'at most one scored per (url, node)');
  assert.equal(pairs.length, 12);
  const calls = gateCalls(conn);
  assert.equal(new Set(calls).size, calls.length, 'the connector never saw the same (item, gate) twice');
  assert.equal(calls.length, 12);
});

test('resume after a connector that throws: the round stops as a connection failure and the next round picks the item up again', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 3));
  const dir = libraryWithFeed('round-throw', feed);
  let n = 0;
  const conn = scriptedConnector({ gate: () => { n += 1; if (n === 2) throw new Error('child process crashed'); return undefined; } });
  const r1 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r1.ok, true);
  assert.equal(r1.stoppedAt, 'connection');
  assert.equal(r1.problems[0].connectionCode, 'unknown');
  assert.match(r1.problems[0].detail, /crashed/);
  const unscored = ledgerLines(dir).filter((e) => e.ev === 'unscored');
  assert.equal(unscored.length, 1);
  assert.equal(unscored[0].reason, 'connection:unknown');
  assert.equal(roundLines(dir).length, 1, 'the round record is still written');
  const r2 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r2.stoppedAt, undefined);
  assert.deepEqual([...replayLedger(dir).states.values()].map((s) => s.stage), ['inbox', 'inbox', 'inbox']);
  const pairs = scoredPairs(dir);
  assert.equal(new Set(pairs).size, pairs.length);
});

// V10：cap=5 恰 5 次（含核验判定），stoppedAt:'cap'；第二轮只跑剩余。
test('cap: exactly cap calls counting judge calls, stoppedAt cap, the rest stays seen; the next round only runs what is left', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 8));
  const dir = libraryWithFeed('round-cap', feed);
  const conn = scriptedConnector();
  const r1 = await runRound(dir, { connector: conn, cap: 5, ctx: ctx() });
  assert.equal(r1.calls, 5);
  assert.equal(r1.stoppedAt, 'cap');
  assert.equal(modelCalls(conn), 5);
  const states = [...replayLedger(dir).states.values()];
  assert.equal(states.filter((s) => s.scores.relevance).length, 5);
  assert.equal(states.filter((s) => !s.scores.relevance && s.stage === 'seen').length, 3, 'three items untouched');
  // a cap that lands inside the summary stage counts the judge call too
  const r2 = await runRound(dir, { connector: conn, cap: 13, ctx: ctx() });
  assert.equal(r2.stoppedAt, 'cap');
  assert.equal(r2.calls, 13, '3 gate 1 + 8 gate 2 + one summary with its judge call');
  assert.equal(r2.counts.inbox, 1);
  const r3 = await runRound(dir, { connector: conn, cap: 100, ctx: ctx() });
  assert.equal(r3.stoppedAt, undefined, 'negative: a wide cap never stops');
  assert.equal(r3.calls, 14, 'seven summaries left, each 1 + 1 judge');
  const calls = gateCalls(conn);
  assert.equal(new Set(calls).size, calls.length, 'already scored (url, gate) pairs are not re-called');
  assert.equal(calls.length, 16);
  assert.equal(r3.counts.inbox, 7);
  // the configured cap is used when the call does not pass one
  setPipeline(dir, { cap: 1 });
  feedRoute(srv, serveItems(srv, 9));
  const r4 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r4.calls, 1);
  assert.equal(r4.stoppedAt, 'cap');
});

// 4.4 输出不对怎么办 / V5：带重试句再试一次；第二次还不对 → unscored，留在抓到的，运行记录写明，下一轮 0 调用。
test('bad-format-always: retried once with the retry note, then unscored bad-format; stage stays seen; logged; never called again', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 1);
  const feed = feedRoute(srv, items);
  const dir = libraryWithFeed('round-badformat', feed);
  const conn = fakeConnector({ mode: 'bad-format-always' });
  // the probe would fail too; give the round a connector whose probe passes but whose answers are unreadable
  const probeOk = { ...conn, probe: async () => ({ ok: true, latencyMs: 1, model: 'fake-model' }) };
  const r1 = await runRound(dir, { connector: probeOk, ctx: ctx() });
  assert.equal(r1.ok, true);
  assert.equal(r1.calls, 2);
  assert.equal(r1.counts.gate1.unscored, 1);
  const prompts = conn.calls.map((c) => c.prompt);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].includes(RETRY_NOTE), false, 'the first prompt carries no retry note');
  assert.ok(prompts[1].includes(RETRY_NOTE), 'the second prompt carries the retry note');
  assert.ok(prompts[1].startsWith(prompts[0]), 'the retry is the same prompt plus the note');
  const un = ledgerLines(dir).filter((e) => e.ev === 'unscored');
  assert.equal(un.length, 1);
  assert.deepEqual([un[0].node, un[0].reason, un[0].round], ['relevance', 'bad-format', r1.round.id]);
  assert.equal(typeof un[0].cfg, 'string');
  const s = replayLedger(dir).states.get(items[0].url);
  assert.equal(s.stage, 'seen');
  assert.equal(s.unscored.relevance, 'bad-format');
  const logs = readdirSync(join(dir, '_pipeline', 'logs'));
  assert.equal(logs.length, 1);
  const md = readFileSync(join(dir, '_pipeline', 'logs', logs[0]), 'utf8');
  assert.ok(md.includes(items[0].url), 'the run record names the item');
  assert.ok(md.includes('unscored relevance bad-format'));
  assert.equal(roundLines(dir)[0].unscored[0].reason, 'bad-format');
  const r2 = await runRound(dir, { connector: probeOk, ctx: ctx() });
  assert.equal(r2.calls, 0, 'not called again under the same configuration');
  assert.equal(conn.calls.length, 2);
  // a configuration change reopens the item
  setPipeline(dir, (p) => ({ ...p, nodes: [{ id: 'relevance', kind: 'gate', threshold: 0.5 }] }));
  const r3 = await runRound(dir, { connector: probeOk, ctx: ctx() });
  assert.equal(r3.calls, 2);
});

test('bad-format-once: the retry succeeds and the item is scored (negative of the always case)', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 1));
  const dir = libraryWithFeed('round-badonce', feed);
  const good = scriptedConnector();
  let n = 0;
  const conn = { ...good, complete: async (req) => { n += 1; if (n === 1) return { ok: false, code: 'bad-format', detail: 'no json', text: 'nope', usage: { calls: 1 } }; return good.complete(req); } };
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.counts.gate1.passed, 1);
  assert.equal(r.counts.gate1.unscored, 0);
  assert.equal(r.calls, 5, 'two gate 1 attempts + gate 2 + summary + judge');
  assert.equal(ledgerLines(dir).filter((e) => e.ev === 'unscored').length, 0);
  assert.ok(good.calls[1].prompt.includes(RETRY_NOTE));
});

test('connection failure mid-round: the current item is recorded unscored connection:<code>, the round stops, the next round retries it', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 3));
  const dir = libraryWithFeed('round-connection', feed);
  const good = scriptedConnector();
  let n = 0;
  const flaky = { ...good, complete: async (req) => { n += 1; if (n === 2) return { ok: false, code: 'login-expired', detail: 'session expired', usage: { calls: 1 } }; return good.complete(req); } };
  const r1 = await runRound(dir, { connector: flaky, ctx: ctx() });
  assert.equal(r1.ok, true);
  assert.equal(r1.stoppedAt, 'connection');
  assert.equal(r1.calls, 2);
  assert.deepEqual(r1.problems.map((p) => [p.code, p.connectionCode]), [['connection', 'login-expired']]);
  const un = ledgerLines(dir).filter((e) => e.ev === 'unscored');
  assert.equal(un.length, 1);
  assert.equal(un[0].reason, 'connection:login-expired');
  assert.equal(replayLedger(dir).states.size, 3, 'nothing lost');
  assert.equal(roundLines(dir)[0].stoppedAt, 'connection');
  const r2 = await runRound(dir, { connector: good, ctx: ctx() });
  assert.equal(r2.stoppedAt, undefined);
  assert.equal(r2.counts.inbox, 3);
  assert.equal(r2.calls, 2 + 3 + 6);
});

test('constant-score warning (toolkit F3): five items of one source all at the same score -> a warning line, never a rejection', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 5));
  const dir = libraryWithFeed('round-constant', feed);
  const r = await runRound(dir, { connector: scriptedConnector({ score: 0.8 }), ctx: ctx() });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /^constant-score: feed-a \(5 items all at 0\.8\)/);
  assert.equal(r.counts.gate1.passed, 5, 'a warning does not block anything');
  assert.deepEqual(roundLines(dir)[0].warnings, r.warnings);
  // negative: varied scores, no warning
  const feed2 = feedRoute(srv, serveItems(srv, 5), '/feed2');
  const dir2 = libraryWithFeed('round-varied', feed2);
  let i = 0;
  const r2 = await runRound(dir2, { connector: scriptedConnector({ score: () => 0.5 + 0.1 * (i++ % 3) }), ctx: ctx() });
  assert.deepEqual(r2.warnings, []);
});

test('callGapMs: the configured gap is slept between model calls, none when 0; onProgress is called per item', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 2));
  const dir = libraryWithFeed('round-gap', feed);
  setPipeline(dir, { callGapMs: 25 });
  const slept = [];
  const events = [];
  const r = await runRound(dir, { connector: scriptedConnector(), ctx: ctx({ sleep: async (ms) => { slept.push(ms); } }), onProgress: (e) => events.push(e) });
  assert.equal(r.calls, 8);
  assert.ok(slept.filter((ms) => ms === 25).length >= 4, `gaps slept: ${JSON.stringify(slept)}`);
  assert.equal(events.length, 6, 'two items at each of gate 1, gate 2, summary');
  assert.deepEqual(events.map((e) => e.stage), ['gate', 'gate', 'gate', 'gate', 'summary', 'summary']);
  assert.equal(events.at(-1).calls, 8);
  const dir2 = libraryWithFeed('round-nogap', feedRoute(srv, serveItems(srv, 2), '/feed2'));
  const slept2 = [];
  await runRound(dir2, { connector: scriptedConnector(), ctx: ctx({ sleep: async (ms) => { slept2.push(ms); } }) });
  assert.deepEqual(slept2, []);
});

test('sentinel: a library whose feed is unreachable still completes a round with zero new items and zero calls', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libraryWithFeed('round-deadfeed', srv.route('/gone', { status: 404, body: 'no' }));
  const r = await runRound(dir, { connector: scriptedConnector(), ctx: ctx() });
  assert.equal(r.ok, true);
  assert.deepEqual([r.counts.new, r.calls], [0, 0]);
  assert.equal(fetchLogLines(dir)[0].status, 'gap');
  assert.equal(existsSync(join(dir, '_pipeline', 'rounds.jsonl')), true);
});
