import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRound } from '../src/pipeline/round.mjs';
import { readInboxItem, listInbox } from '../src/pipeline/inbox.mjs';
import { replayLedger } from '../src/library/ledger.mjs';
import { scriptedConnector, titleOf, promptKind } from '../src/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, ledgerLines, verdictLines, setPipeline } from './support/pipeline.mjs';

const BODY = '<html><body><p>Memory blocks cut latency by +6% (target) in the benchmark.</p></body></html>';

function judgeCalls(conn) {
  return conn.calls.filter((c) => c.model === 'verify');
}
function summaryPrompts(conn) {
  return conn.calls.filter((c) => promptKind(c) === 'summary').map((c) => c.prompt);
}
const ALL = ['what-nonempty', 'points-count', 'no-placeholder', 'no-banned-words', 'quote-in-source', 'numbers-in-source'];

async function oneItemLibrary(t, name) {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 1, () => ({ title: 'Memory blocks benchmark', body: BODY }));
  const feed = feedRoute(srv, items);
  const dir = libraryWithFeed(name, feed);
  return { dir, url: items[0].url, srv };
}

// 4.11：数字不在材料 → 判定没过 → 第二轮只改那几项 → 过：verification.passed:true rounds:2；每项每轮一行 verdicts。
test('numbers not in the material: judge fails round 1, only the failed item is sent back, round 2 passes -> inbox verification passed:true rounds:2', async (t) => {
  const { dir, url } = await oneItemLibrary(t, 'summary-numbers');
  let summaries = 0;
  const conn = scriptedConnector({
    summary: (prompt) => {
      summaries += 1;
      const title = titleOf(prompt);
      return summaries === 1
        ? { what: `A benchmark post: ${title}`, points: ['性能提升 20–30%', 'second point', 'third point'], quote: title, claimed: ALL }
        : { what: `A benchmark post: ${title}`, points: ['latency cut by +6% (target)', 'second point', 'third point'], quote: title, claimed: ALL };
    },
    judgePassed: (ids, prompt) => !/20–30%/.test(prompt),
  });
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.deepEqual([r.counts.summarized, r.counts.inbox, r.counts.verifyRejected], [1, 1, 0]);
  assert.equal(r.calls, 2 + 4, 'two gates, then summary + judge twice');
  assert.equal(judgeCalls(conn).length, 2);
  const card = readInboxItem(dir, url);
  assert.equal(card.verification.passed, true);
  assert.equal(card.verification.rounds, 2);
  assert.deepEqual(card.verification.failed, []);
  assert.deepEqual(card.summary.points[0], 'latency cut by +6% (target)');
  // the second summary prompt carries the prior output and only the failed item
  const ps = summaryPrompts(conn);
  assert.equal(ps.length, 2);
  assert.ok(ps[1].includes('上一版输出：'));
  assert.ok(ps[1].includes('性能提升 20–30%'));
  assert.ok(ps[1].includes('- [numbers-in-source]'));
  assert.equal(ps[1].includes('- [what-nonempty]'), false, 'passed items are not sent back');
  assert.equal(ps[0].includes('上一版输出'), false);
  // verdicts: every item every round, with node / item / passed / evidence / round / claimed
  const v = verdictLines(dir).filter((l) => l.node === 'summary');
  assert.equal(v.length, 12);
  assert.deepEqual(v.filter((l) => l.round === 1).map((l) => l.item), ALL);
  assert.deepEqual(v.filter((l) => l.round === 2).map((l) => l.item), ALL);
  const n1 = v.find((l) => l.round === 1 && l.item === 'numbers-in-source');
  assert.deepEqual([n1.kind, n1.passed, n1.claimed, n1.url], ['judge', false, true, url]);
  assert.equal(typeof n1.evidence, 'string');
  assert.equal(v.find((l) => l.round === 2 && l.item === 'numbers-in-source').passed, true);
  for (const l of v) assert.deepEqual(Object.keys(l), ['ts', 'node', 'url', 'item', 'kind', 'passed', 'evidence', 'round', 'claimed']);
  assert.equal(ledgerLines(dir).find((e) => e.ev === 'inbox').verified, true);
});

test('a rule failure (TODO in the points) costs no judge call; round 2 is clean and passes with rounds:2', async (t) => {
  const { dir, url } = await oneItemLibrary(t, 'summary-todo');
  let n = 0;
  const conn = scriptedConnector({
    summary: (prompt) => {
      n += 1;
      const title = titleOf(prompt);
      return { what: `A post: ${title}`, points: n === 1 ? ['TODO fill in', 'b', 'c'] : ['a', 'b', 'c'], quote: title, claimed: ALL };
    },
  });
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.calls, 2 + 1 + 2, 'gates, summary round 1 (no judge), summary round 2 + judge');
  assert.equal(judgeCalls(conn).length, 1, 'the judge is not called while a rule fails');
  const v = verdictLines(dir).filter((l) => l.node === 'summary');
  assert.deepEqual(v.filter((l) => l.round === 1).map((l) => l.item), ALL.slice(0, 5), 'round 1: rule verdicts only, no judge line');
  assert.equal(v.find((l) => l.round === 1 && l.item === 'no-placeholder').passed, false);
  assert.equal(v.filter((l) => l.round === 2).length, 6);
  assert.deepEqual(readInboxItem(dir, url).verification, { passed: true, rounds: 2, failed: [], claimsNotFound: [], forgot: [] });
});

test('two rounds failing: the inbox card is still written with verification.passed:false, the failed items, claimsNotFound and forgot', async (t) => {
  const { dir, url } = await oneItemLibrary(t, 'summary-twice');
  const conn = scriptedConnector({
    summary: (prompt) => ({ what: `A post: ${titleOf(prompt)}`, points: ['性能提升 20–30%', 'b', 'c'], quote: titleOf(prompt), claimed: ['numbers-in-source'] }),
    judgePassed: false,
  });
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.deepEqual([r.counts.inbox, r.counts.verifyRejected], [1, 1]);
  assert.equal(judgeCalls(conn).length, 2);
  const card = readInboxItem(dir, url);
  assert.equal(card.verification.passed, false);
  assert.equal(card.verification.rounds, 2);
  assert.deepEqual(card.verification.failed.map((f) => f.id), ['numbers-in-source']);
  assert.deepEqual(card.verification.claimsNotFound, ['numbers-in-source'], 'claimed but not found');
  assert.deepEqual(card.verification.forgot, []);
  assert.equal(replayLedger(dir).states.get(url).stage, 'inbox');
  assert.equal(ledgerLines(dir).find((e) => e.ev === 'inbox').verified, false);
  assert.equal(listInbox(dir)[0].verification.passed, false);
  assert.equal(verdictLines(dir).filter((l) => l.node === 'summary' && l.item === 'numbers-in-source' && l.claimed).length, 2);
  // an item not claimed and failed lands in `forgot`
  const { dir: d2, url: u2 } = await oneItemLibrary(t, 'summary-forgot');
  const c2 = scriptedConnector({ summary: (p) => ({ what: `A post: ${titleOf(p)}`, points: ['x', 'y', 'z'], quote: titleOf(p), claimed: [] }), judgePassed: false });
  await runRound(d2, { connector: c2, ctx: ctx() });
  assert.deepEqual(readInboxItem(d2, u2).verification.forgot, ['numbers-in-source']);
  assert.deepEqual(readInboxItem(d2, u2).verification.claimsNotFound, []);
});

test('a compliant first summary: rounds 1, the judge called exactly once (negative of the loop cases); maxVerifyRounds is honoured', async (t) => {
  const { dir, url } = await oneItemLibrary(t, 'summary-clean');
  const conn = scriptedConnector();
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.calls, 4);
  assert.equal(judgeCalls(conn).length, 1);
  assert.equal(readInboxItem(dir, url).verification.rounds, 1);
  assert.equal(verdictLines(dir).filter((l) => l.node === 'summary').length, 6);
  // maxVerifyRounds 3 with a judge that never passes: three rounds, three judge calls
  const { dir: d3 } = await oneItemLibrary(t, 'summary-three');
  setPipeline(d3, { maxVerifyRounds: 3 });
  const c3 = scriptedConnector({ judgePassed: false });
  const r3 = await runRound(d3, { connector: c3, ctx: ctx() });
  assert.equal(judgeCalls(c3).length, 3);
  assert.equal(r3.calls, 2 + 6);
  assert.equal(listInbox(d3)[0].verification.rounds, 3);
});

test('summary unreadable in every round (bad format twice per round): unscored summary bad-format, no inbox card', async (t) => {
  const { dir, url } = await oneItemLibrary(t, 'summary-unreadable');
  const good = scriptedConnector();
  const conn = { ...good, complete: async (req) => (promptKind(req) === 'summary' ? { ok: false, code: 'bad-format', detail: 'no json', text: 'nope', usage: { calls: 1 } } : good.complete(req)) };
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.counts.inbox, 0);
  assert.equal(r.counts.summarized, 0);
  assert.equal(r.calls, 2 + 4, 'two attempts per loop round, two loop rounds, no judge');
  assert.equal(readInboxItem(dir, url), null);
  const un = ledgerLines(dir).filter((e) => e.ev === 'unscored');
  assert.deepEqual([un[0].node, un[0].reason], ['summary', 'bad-format']);
  assert.equal(replayLedger(dir).states.get(url).stage, 'seen');
  const r2 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r2.calls, 0, 'not retried under the same configuration');
});

test('sentinel: a judge call that fails with a connection code stops the round as a connection failure', async (t) => {
  const { dir, url } = await oneItemLibrary(t, 'summary-judgedown');
  const good = scriptedConnector();
  const conn = { ...good, complete: async (req) => (req.model === 'verify' ? { ok: false, code: 'login-expired', detail: 'expired', usage: { calls: 1 } } : good.complete(req)) };
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.stoppedAt, 'connection');
  assert.equal(r.problems[0].connectionCode, 'login-expired');
  assert.equal(readInboxItem(dir, url), null);
  assert.equal(ledgerLines(dir).find((e) => e.ev === 'unscored').reason, 'connection:login-expired');
});
