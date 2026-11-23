// 1.1 W7b: v1.0's feed fetchers left core/src for core/legacy/ (not shipped); still tested, since the fixtures of libraries
// 'as 1.0 made them' run them.
// redesign R6b: 「next round」 reads 「next run」 here (comments, test names, the text of an assertion's message; in
// fetch-round.test and the r5a fixtures also the fetch log's message, which core fetch/states.mjs now writes as 'retry next
// run') — 05 统一用词 says 运行 / run, and the contract (R6b-1) wants the v1 处理建议's fragment 'next round' gone from the repository.
// Nothing else that is checked changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fetchRound } from '../legacy/fetch/round.mjs';
import { readFetchLog, fetchLogPath } from '../src/fetch/log.mjs';
import { appendEvent, replayLedger, ledgerPath } from '../src/library/ledger.mjs';
import { makeContext } from '../legacy/fetch/context.mjs';
import { makeLibrary, TEST_CONFIG } from './support/fixtures.mjs';
import { caseDir } from './support/tmp.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { RSS2, ATOM, rssWith } from './support/feeds.mjs';

const CLOCK = new Date(2026, 10, 2, 12, 0, 0);
const ctx = () => makeContext({ timeoutMs: 1500, now: () => CLOCK, sleep: async () => {} });

function ledgerLines(dir) {
  return readFileSync(ledgerPath(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function logLines(dir) {
  return readFetchLog(dir).entries;
}
// every file under dir with its size: the "nothing else changed" snapshot
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else out[relative(dir, p).replace(/\\/g, '/')] = statSync(p).size;
    }
  };
  walk(dir);
  return out;
}
function libWith(name, sources) {
  return makeLibrary(name, { ...TEST_CONFIG, sources });
}

// 对照 test_pipeline.py::test_pipeline_flow（fetch 部分）："fetch exit 0 despite one FAILED source"、
// "pending has 2 items"、"fetch_log has FAILED row for hn-b"
test('round: every source gets one log line, items are registered, one failed source does not sink the others', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-basic', [
    { name: 'feed-a', kind: 'rss', url: srv.route('/a', { body: RSS2 }), topic: 'agent 记忆' },
    { name: 'hn-b', kind: 'hn', query: 'kw', min_points: 50 },
    { name: 'atom-c', kind: 'rss', url: srv.route('/c', { body: ATOM }) },
  ]);
  const hnBase = srv.route('/hn', { status: 503, headers: { 'retry-after': '120' } });
  const r = await fetchRound(dir, { ctx: makeContext({ timeoutMs: 1500, now: () => CLOCK, hnBase }) });
  assert.match(r.round.id, /^r-20261102T\d{6}Z-[0-9a-f]{6}$/);
  assert.equal(r.round.startedAt, CLOCK.toISOString());
  assert.deepEqual(r.perSource.map((p) => [p.name, p.status, p.count, p.newCount]), [
    ['feed-a', 'ok', 2, 2], ['hn-b', 'failed', 0, 0], ['atom-c', 'empty', 1, 0],
  ]);
  assert.equal(r.perSource[1].hint, 'retry-next-round');
  assert.equal(r.perSource[1].http, 503);
  assert.equal(r.perSource[1].retryAfterSeconds, 120);
  assert.deepEqual(r.newItems.map((i) => i.url), ['https://x.com/1', 'https://x.com/2']);
  assert.equal(r.newItems.length, 2, 'atom-c serves the same url as feed-a item 2: layer-1 dedup within the round');
  assert.deepEqual(r.maybeDuplicates, []);
  // ledger: two seen events, both from feed-a, with topic-free spec shape
  const led = ledgerLines(dir);
  assert.deepEqual(led.map((e) => [e.ev, e.url, e.source, e.title, e.date]), [
    ['seen', 'https://x.com/1', 'feed-a', 'Hello World', '2026-07-02'],
    ['seen', 'https://x.com/2', 'feed-a', 'Second & last', '2026-11-02'],
  ]);
  assert.equal(led.some((e) => 'maybe_duplicate_of' in e), false);
  // fetch_log: three lines, same round id, fixed key order, hint attached
  const log = logLines(dir);
  assert.equal(log.length, 3);
  assert.deepEqual(new Set(log.map((l) => l.round)), new Set([r.round.id]));
  assert.deepEqual(Object.keys(log[0]), ['ts', 'round', 'source', 'kind', 'status', 'hint', 'http', 'count', 'new', 'message']);
  assert.deepEqual(log[1], {
    ts: CLOCK.toISOString(), round: r.round.id, source: 'hn-b', kind: 'hn', status: 'failed', hint: 'retry-next-round',
    http: 503, count: 0, new: 0, message: 'HTTP 503: server-side, retry next run (Retry-After: 120s)', retry_after_seconds: 120,
  });
  assert.deepEqual([log[2].status, log[2].count, log[2].new], ['empty', 1, 0], 'atom-c: parsed 1, all already seen this round -> empty');
  assert.equal(srv.hits('/hn'), 1, 'the 503 is not retried in this round');
});

// V4（抓取的一半）：同样内容连跑两轮，账本一个字节不变；fetch_log 每来源多一行，status empty。
test('V4: a second round over identical content adds zero ledger bytes and logs empty with count>0, new=0', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-idempotent', [
    { name: 'feed-a', kind: 'rss', url: srv.route('/a', { body: RSS2 }) },
    { name: 'atom-c', kind: 'rss', url: srv.route('/c', { body: ATOM.replace('https://x.com/2', 'https://x.com/3') }) },
  ]);
  const r1 = await fetchRound(dir, { ctx: ctx() });
  assert.deepEqual(r1.perSource.map((p) => p.status), ['ok', 'ok']);
  assert.equal(r1.newItems.length, 3);
  const ledgerBytes = readFileSync(ledgerPath(dir));
  const logBefore = logLines(dir);
  assert.equal(logBefore.length, 2);
  const r2 = await fetchRound(dir, { ctx: ctx() });
  assert.deepEqual(readFileSync(ledgerPath(dir)), ledgerBytes, 'ledger byte-identical after round 2');
  assert.equal(r2.newItems.length, 0);
  assert.notEqual(r2.round.id, r1.round.id);
  const log = logLines(dir);
  assert.equal(log.length, 4);
  assert.deepEqual(log.slice(2).map((l) => [l.source, l.status, l.count, l.new, l.http]), [
    ['feed-a', 'empty', 2, 0, 200], ['atom-c', 'empty', 1, 0, 200],
  ]);
  assert.match(log[2].message, /all already seen/);
  assert.deepEqual(r2.perSource.map((p) => [p.status, p.count, p.newCount]), [['empty', 2, 0], ['empty', 1, 0]]);
  // negative: round 1 was NOT empty, so the rule is "new = 0", not "the server said 200"
  assert.deepEqual(logBefore.map((l) => l.status), ['ok', 'ok']);
});

test('paused: skipped, logged as paused, never requested', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-paused', [
    { name: 'live', kind: 'rss', url: srv.route('/live', { body: RSS2 }) },
    { name: 'napping', kind: 'rss', url: srv.route('/nap', { body: RSS2 }), paused: true },
    { name: 'not-really', kind: 'rss', url: srv.route('/nr', { body: rssWith([{ title: 'Other', url: 'https://x.com/other' }]) }), paused: 'yes' },
  ]);
  const r = await fetchRound(dir, { ctx: ctx() });
  assert.deepEqual(r.perSource.map((p) => [p.name, p.status, p.hint]), [['live', 'ok', 'none'], ['napping', 'paused', 'none'], ['not-really', 'ok', 'none']]);
  assert.equal(srv.hits('/nap'), 0);
  assert.equal(srv.hits('/nr'), 1, 'only paused: true pauses');
  const log = logLines(dir);
  assert.deepEqual([log[1].source, log[1].status, log[1].count, log[1].new, log[1].message], ['napping', 'paused', 0, 0, 'paused']);
  assert.equal(log[1].round, r.round.id);
});

// 对照 test_pipeline.py::test_pipeline_flow "layer-2 dedup hint on near-duplicate title"
test('layer 2: a new url whose normalized title matches a ledger title is registered with maybe_duplicate_of; replay surfaces it', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-layer2', [
    { name: 'feed-a', kind: 'rss', url: srv.route('/a', { body: rssWith([
      { title: 'Alpha  STORY', url: 'https://mirror/1' },
      { title: 'Different thing', url: 'https://mirror/2' },
      { title: 'Twice in one feed', url: 'https://mirror/3' },
      { title: 'twice-in-one-feed!', url: 'https://mirror/4' },
    ]) }) },
  ]);
  appendEvent(dir, { ts: '2026-11-01T00:00:00.000Z', ev: 'seen', url: 'https://u/1', source: 'feed-a', title: 'Alpha story', date: '2026-10-01' });
  const r = await fetchRound(dir, { ctx: ctx() });
  assert.equal(r.perSource[0].newCount, 4, 'nothing is dropped');
  assert.deepEqual(r.maybeDuplicates, [{ url: 'https://mirror/1', of: 'https://u/1' }, { url: 'https://mirror/4', of: 'https://mirror/3' }]);
  const byUrl = Object.fromEntries(r.newItems.map((i) => [i.url, i]));
  assert.equal(byUrl['https://mirror/1'].maybeDuplicateOf, 'https://u/1');
  assert.equal('maybeDuplicateOf' in byUrl['https://mirror/2'], false);
  assert.equal('maybeDuplicateOf' in byUrl['https://mirror/3'], false, 'the first of a same-round pair is the original');
  assert.equal(byUrl['https://mirror/4'].maybeDuplicateOf, 'https://mirror/3');
  const led = ledgerLines(dir);
  assert.equal(led.length, 5);
  assert.equal(led[1].maybe_duplicate_of, 'https://u/1');
  assert.equal('maybe_duplicate_of' in led[2], false);
  assert.equal(led[4].maybe_duplicate_of, 'https://mirror/3');
  const { states } = replayLedger(dir);
  assert.equal(states.get('https://mirror/1').maybeDuplicateOf, 'https://u/1');
  assert.equal(states.get('https://mirror/1').stage, 'seen');
  assert.equal('maybeDuplicateOf' in states.get('https://mirror/2'), false);
  // a second round: the flagged items are now known urls -> nothing new, no second flag
  const r2 = await fetchRound(dir, { ctx: ctx() });
  assert.deepEqual(r2.maybeDuplicates, []);
  assert.equal(ledgerLines(dir).length, 5);
});

// 对照 test_pipeline.py::test_pipeline_flow "dismissed item never re-enters pending"
test('layer 1: dismissed and kept urls are still seen -> never re-registered', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-terminal', [
    { name: 'feed-a', kind: 'rss', url: srv.route('/a', { body: rssWith([{ title: 'Gamma story', url: 'https://u/3' }, { title: 'Kept one', url: 'https://u/4' }, { title: 'Fresh', url: 'https://u/5' }]) }) },
  ]);
  appendEvent(dir, { ev: 'seen', url: 'https://u/3', source: 'feed-a', title: 'Gamma story' });
  appendEvent(dir, { ev: 'dismissed', url: 'https://u/3', reason: 'too shallow' });
  appendEvent(dir, { ev: 'seen', url: 'https://u/4', source: 'feed-a', title: 'Kept one' });
  appendEvent(dir, { ev: 'kept', url: 'https://u/4', id: 'kept-one' });
  const before = ledgerLines(dir).length;
  const r = await fetchRound(dir, { ctx: ctx() });
  assert.deepEqual(r.newItems.map((i) => i.url), ['https://u/5']);
  assert.equal(ledgerLines(dir).length, before + 1);
  assert.equal(replayLedger(dir).states.get('https://u/3').stage, 'dismissed');
  assert.deepEqual([r.perSource[0].status, r.perSource[0].count, r.perSource[0].newCount], ['ok', 3, 1]);
});

test('config: unknown kind is a gap line; a missing / broken streams.json throws; an inline config wins over disk', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-config', [{ name: 'bogus', kind: 'bogus' }, { name: 'bad-url', kind: 'rss', url: 'not a url' }]);
  const r = await fetchRound(dir, { ctx: ctx() });
  assert.deepEqual(r.perSource.map((p) => [p.name, p.status, p.hint]), [['bogus', 'gap', 'fix-address-or-remove'], ['bad-url', 'gap', 'fix-address-or-remove']]);
  assert.equal(logLines(dir).length, 2);
  assert.equal(srv.requests.length, 0);
  const inline = await fetchRound(dir, { config: { sources: [{ name: 'inline', kind: 'rss', url: srv.route('/i', { body: RSS2 }) }] }, ctx: ctx() });
  assert.deepEqual(inline.perSource.map((p) => [p.name, p.status]), [['inline', 'ok']]);
  assert.equal(srv.hits('/i'), 1);
  const none = caseDir('round-noconfig');
  await assert.rejects(() => fetchRound(none, { ctx: ctx() }), (e) => e.code === 'config-missing');
  await assert.rejects(() => fetchRound(dir, { config: 'nope', ctx: ctx() }), (e) => e.code === 'bad-config');
  await assert.rejects(() => fetchRound('', { ctx: ctx() }), (e) => e.code === 'bad-argument');
  // a config with no sources is a legal, empty round
  const empty = await fetchRound(dir, { config: { sources: [] }, ctx: ctx() });
  assert.deepEqual(empty.perSource, []);
  assert.deepEqual(empty.newItems, []);
});

test('V2: a round touches fetch_log.jsonl and ledger.jsonl and nothing else; the note folder stays empty', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-v2', [
    { name: 'feed-a', kind: 'rss', url: srv.route('/a', { body: RSS2 }) },
    { name: 'blocked-b', kind: 'rss', url: srv.route('/b', { status: 403 }) },
    { name: 'gone-c', kind: 'rss', url: srv.route('/c', { status: 410 }) },
  ]);
  const before = snapshot(dir);
  await fetchRound(dir, { ctx: ctx() });
  const after = snapshot(dir);
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]).sort();
  assert.deepEqual(changed, ['_pipeline/fetch_log.jsonl', '_pipeline/ledger.jsonl']);
  assert.deepEqual(readdirSync(join(dir, 'notes')), []);
  assert.equal(readdirSync(join(dir, '_pipeline', 'inbox')).length, 0);
  assert.equal(readdirSync(join(dir, '_pipeline', 'cache')).length, 0);
});

// 验方退回 1：账本写不进时曾被记成 empty + "all already seen"。账本只读 → 该来源 failed，message 带账本错误。
test('ledger write failure: the source is logged failed with the ledger error, never empty; the next source still runs', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-ledger-readonly', [
    { name: 'feed-a', kind: 'rss', url: srv.route('/a', { body: RSS2 }) },
    { name: 'feed-b', kind: 'rss', url: srv.route('/b', { body: rssWith([{ title: 'B one', url: 'https://b/1' }]) }) },
  ]);
  chmodSync(ledgerPath(dir), 0o444);
  t.after(() => chmodSync(ledgerPath(dir), 0o644));
  assert.throws(() => appendEvent(dir, { ev: 'seen', url: 'https://probe/1', source: 'probe', title: 'p' }), 'precondition: the ledger really is unwritable here');
  const r = await fetchRound(dir, { ctx: ctx() });
  for (const p of r.perSource) {
    assert.equal(p.status, 'failed', p.name);
    assert.notEqual(p.status, 'empty', p.name);
    assert.equal(p.hint, 'retry-next-round', p.name);
    assert.match(p.message, /ledger/i, p.name);
    assert.doesNotMatch(p.message, /all already seen/, p.name);
    assert.equal(p.newCount, 0, p.name);
  }
  assert.equal(r.perSource[0].count, 2, 'what was parsed is still reported');
  assert.equal(r.perSource[1].count, 1, 'the second source was fetched despite the first one failing to register');
  assert.equal(srv.hits('/b'), 1);
  assert.deepEqual(r.newItems, []);
  assert.deepEqual(r.maybeDuplicates, []);
  const log = logLines(dir);
  assert.deepEqual(log.map((l) => [l.source, l.status, l.count, l.new]), [['feed-a', 'failed', 2, 0], ['feed-b', 'failed', 1, 0]]);
  assert.match(log[0].message, /ledger/i);
  assert.equal(readFileSync(ledgerPath(dir), 'utf8'), '', 'nothing reached the ledger');
});

// 验方退回 4：坏来源的异常要真的走到 fetchSource / fetchRound 的 catch。读 source 对象本身就抛的 getter 做得到。
test('a source object that throws while being read is a failed source; the good source in the same round is still ok; the round does not throw', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const good = { name: 'good', kind: 'rss', url: srv.route('/good', { body: RSS2 }) };
  const badPaused = { name: 'bad-paused', kind: 'rss', url: srv.route('/bp', { body: RSS2 }) };
  Object.defineProperty(badPaused, 'paused', { enumerable: true, get() { throw new RangeError('paused getter exploded'); } });
  const badUrl = { name: 'bad-url', kind: 'rss' };
  Object.defineProperty(badUrl, 'url', { enumerable: true, get() { throw new RangeError('url getter exploded'); } });
  const dir = libWith('round-throwing-source', []);
  const r = await fetchRound(dir, { config: { sources: [badPaused, good, badUrl] }, ctx: ctx() });
  assert.deepEqual(r.perSource.map((p) => [p.name, p.status, p.hint]), [
    ['bad-paused', 'failed', 'retry-next-round'], ['good', 'ok', 'none'], ['bad-url', 'failed', 'retry-next-round'],
  ]);
  assert.match(r.perSource[0].message, /paused getter exploded/);
  assert.match(r.perSource[2].message, /url getter exploded/);
  assert.equal(r.newItems.length, 2);
  assert.equal(srv.hits('/bp'), 0);
  assert.deepEqual(logLines(dir).map((l) => [l.source, l.status]), [['bad-paused', 'failed'], ['good', 'ok'], ['bad-url', 'failed']]);
});

test('seen events carry the round clock as ts (same ts as the fetch_log line)', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-seen-ts', [{ name: 'feed-a', kind: 'rss', url: srv.route('/a', { body: RSS2 }) }]);
  await fetchRound(dir, { ctx: ctx() });
  const led = ledgerLines(dir);
  assert.equal(led.length, 2);
  for (const e of led) assert.equal(e.ts, CLOCK.toISOString());
  assert.equal(logLines(dir)[0].ts, CLOCK.toISOString());
  assert.equal(replayLedger(dir).states.get('https://x.com/1').firstSeen, CLOCK.toISOString());
});

test('sentinel: a blocked source is logged blocked (not empty, not ok), asked once, and its body yields no items', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libWith('round-sentinel', [{ name: 'wall', kind: 'rss', url: srv.route('/wall', { status: 403, body: RSS2 }) }]);
  const r = await fetchRound(dir, { ctx: ctx() });
  const line = logLines(dir)[0];
  assert.equal(line.status, 'blocked');
  assert.notEqual(line.status, 'empty');
  assert.equal(line.hint, 'blocked-remove-source');
  assert.equal(line.http, 403);
  assert.equal(line.count, 0);
  assert.equal(line.new, 0);
  assert.equal(srv.hits('/wall'), 1);
  assert.deepEqual(r.newItems, []);
  assert.equal(readFileSync(ledgerPath(dir), 'utf8'), '', 'nothing from a refused response reaches the ledger');
  assert.equal(readFileSync(fetchLogPath(dir), 'utf8').split('\n').filter(Boolean).length, 1);
});
