import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRound } from '../src/pipeline/round.mjs';
import { keep, dismiss } from '../src/pipeline/decide.mjs';
import { homeNumbers, constantScoreWarning, noOutputStreak, NO_OUTPUT_ROUNDS } from '../src/pipeline/numbers.mjs';
import * as coreIndex from '../src/index.mjs';
import { roundLog, listRounds } from '../src/pipeline/rounds-log.mjs';
import { estimateRound, recentNewCounts } from '../src/pipeline/estimate.mjs';
import { listInbox } from '../src/pipeline/inbox.mjs';
import { cleanCache, cachePath, fetchBody } from '../src/pipeline/cache.mjs';
import { appendEvent } from '../src/library/ledger.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, ledgerLines, fetchLogLines, roundLines, setPipeline, CLOCK } from './support/pipeline.mjs';
import { makeLibrary } from './support/fixtures.mjs';

// The test's own replay: last stage per url straight from the raw ledger lines.
function stagesFromLedger(dir) {
  const stage = new Map();
  for (const e of ledgerLines(dir)) {
    if (e.ev === 'seen' && !stage.has(e.url)) stage.set(e.url, 'seen');
    if (['kept', 'dismissed'].includes(stage.get(e.url))) continue;
    if (e.ev === 'inbox') stage.set(e.url, 'inbox');
    if (e.ev === 'kept') stage.set(e.url, 'kept');
    if (e.ev === 'dismissed') stage.set(e.url, 'dismissed');
  }
  const count = (s) => [...stage.values()].filter((v) => v === s).length;
  return { caught: count('seen'), inbox: count('inbox'), kept: count('kept'), dismissed: count('dismissed') };
}

test('homeNumbers: every number recomputed from the ledger / fetch_log / rounds.jsonl by the test agrees; a dismissal takes one off the inbox', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 5);
  const dir = libraryWithFeed('numbers-home', feedRoute(srv, items));
  let i = 0;
  const conn = scriptedConnector({ score: (key) => (key === 'relevance' ? [0.9, 0.8, 0.3, 0.75, 0.2][i++ % 5] : 0.7) });
  const early = new Date(CLOCK.getTime() - 3 * 86_400_000);
  const r1 = await runRound(dir, { connector: conn, ctx: ctx({ now: () => early }) });
  assert.deepEqual(r1.counts.gate1, { passed: 3, failed: 2, unscored: 0 });
  keep(dir, items[0].url, { now: () => CLOCK });
  const r2 = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r2.calls, 0);
  const n = homeNumbers(dir, { now: () => CLOCK });
  assert.deepEqual({ caught: n.caught, inbox: n.inbox, kept: n.kept, dismissed: n.dismissed }, stagesFromLedger(dir));
  assert.deepEqual([n.caught, n.inbox, n.kept, n.dismissed], [2, 2, 1, 0]);
  assert.equal(n.inboxOldestDays, 3, 'the inbox events are three days old');
  assert.equal(n.lastRound.id, roundLines(dir).at(-1).id);
  assert.equal(n.lastRound.id, r2.round.id);
  assert.deepEqual(n.lastRound.counts, roundLines(dir).at(-1).counts);
  assert.equal(n.lastRound.stoppedAt, null);
  assert.equal(n.sources.level, 'quiet');
  assert.deepEqual(n.sources.lines, ['ok 1/1 feed-a hint=none']);
  // negative: a dismissal moves one item out of the inbox, the ledger says so and homeNumbers follows
  dismiss(dir, items[1].url, 'not for me');
  const n2 = homeNumbers(dir, { now: () => CLOCK });
  assert.deepEqual([n2.inbox, n2.dismissed], [1, 1]);
  assert.deepEqual({ caught: n2.caught, inbox: n2.inbox, kept: n2.kept, dismissed: n2.dismissed }, stagesFromLedger(dir));
  // a seen appended by hand is one more caught; a failed source shows in the health
  appendEvent(dir, { ev: 'seen', url: 'https://manual/1', source: 'manual', title: 'hand-fed' });
  assert.equal(homeNumbers(dir).caught, 3);
  const empty = makeLibrary('numbers-empty');
  assert.deepEqual(homeNumbers(empty), { caught: 0, inbox: 0, inboxOldestDays: 0, kept: 0, dismissed: 0, lastRound: null, noOutputStreak: 0, sources: { level: 'quiet', counts: { ok: 0, empty: 0, gap: 0, failed: 0, blocked: 0, paused: 0 }, lines: ['no-fetch-yet'] } });
});

test('roundLog / listRounds: the structured record of each round, newest first; counts agree with the ledger events of that round', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 4);
  const dir = libraryWithFeed('numbers-rounds', feedRoute(srv, items));
  let i = 0;
  const conn = scriptedConnector({ score: (key) => (key === 'relevance' ? [0.9, 0.1, 0.9, 0.9][i++ % 4] : 0.7) });
  const r1 = await runRound(dir, { connector: conn, cap: 6, ctx: ctx() });
  const r2 = await runRound(dir, { connector: conn, ctx: ctx() });
  const list = listRounds(dir);
  assert.deepEqual(list.map((r) => r.id), [r2.round.id, r1.round.id]);
  assert.deepEqual(listRounds(dir, 1).map((r) => r.id), [r2.round.id]);
  assert.equal(roundLog(dir, r1.round.id).stoppedAt, 'cap');
  assert.equal(roundLog(dir, r2.round.id).stoppedAt, undefined);
  assert.equal(roundLog(dir, 'r-nope'), null);
  for (const r of [r1, r2]) {
    const ev = ledgerLines(dir).filter((e) => e.round === r.round.id);
    const rel = ev.filter((e) => e.ev === 'scored' && e.node === 'relevance');
    const log = roundLog(dir, r.round.id);
    assert.equal(log.gates.relevance.passed, rel.filter((e) => e.score >= 0.7).length, r.round.id);
    assert.equal(log.gates.relevance.failed, rel.filter((e) => e.score < 0.7).length);
    assert.equal(log.gates.substance.passed, ev.filter((e) => e.ev === 'scored' && e.node === 'substance').length);
    assert.equal(log.counts.inbox, ev.filter((e) => e.ev === 'inbox').length);
    assert.equal(log.calls, r.calls);
    assert.deepEqual(log.counts, r.counts);
    assert.deepEqual(Object.keys(log), ['id', 'startedAt', 'finishedAt', 'counts', 'gates', 'calls', ...(r.stoppedAt ? ['stoppedAt'] : []), 'problems', 'warnings', 'fetch', 'unscored']);
  }
  assert.equal(r1.calls + r2.calls, 4 + 3 + 6, 'four at gate 1, three at gate 2, three summaries with a judge each');
  assert.equal(roundLog(dir, r1.round.id).fetch[0].newCount, 4);
  assert.equal(roundLog(dir, r2.round.id).fetch[0].status, 'empty');
});

test('estimateRound: sources / paused from streams.json, the new-item range of the last 7 rounds from fetch_log, queued items, cap from the configuration', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 3);
  const feed = feedRoute(srv, items);
  const dir = libraryWithFeed('numbers-estimate', feed, { sources: [
    { name: 'feed-a', kind: 'rss', url: feed, topic: 'agent 记忆' },
    { name: 'napping', kind: 'rss', url: feed, paused: true },
  ] });
  assert.deepEqual(estimateRound(dir), { sources: 2, paused: 1, recentRounds: 0, queued: 0, expectedItems: [0, 0], expectedCalls: [0, 0], cap: 120 });
  await runRound(dir, { connector: scriptedConnector(), cap: 0, ctx: ctx() }); // 3 new, nothing scored
  const e1 = estimateRound(dir);
  assert.deepEqual([e1.recentRounds, e1.queued, e1.expectedItems, e1.expectedCalls], [1, 3, [3, 3], [6, 24]]);
  await runRound(dir, { connector: scriptedConnector(), cap: 0, ctx: ctx() }); // 0 new
  const e2 = estimateRound(dir);
  assert.deepEqual([e2.recentRounds, e2.expectedItems, e2.expectedCalls], [2, [0, 3], [3, 24]]);
  // the test's own recomputation from fetch_log: new per round
  const byRound = {};
  for (const l of fetchLogLines(dir)) byRound[l.round] = (byRound[l.round] ?? 0) + l.new;
  assert.deepEqual([Math.min(...Object.values(byRound)), Math.max(...Object.values(byRound))], e2.expectedItems);
  setPipeline(dir, { cap: 7 });
  assert.equal(estimateRound(dir).cap, 7, 'cap follows the configuration');
  // only the last seven rounds count
  assert.deepEqual(recentNewCounts([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ round: `r${n}`, new: n }))), [3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(recentNewCounts([{ round: 'r1', new: 2 }, { round: 'r1', new: 3 }, { round: 'r2', new: 0 }]), [5, 0], 'summed per round');
  assert.throws(() => estimateRound(join(dir, 'nowhere')), (e) => e.code === 'config:missing');
});

test('listInbox: relevance desc then substance desc, waitingDays from the inbox event, cards carry scores / summary / verification', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 3);
  const dir = libraryWithFeed('numbers-inbox', feedRoute(srv, items));
  const scores = { 'Item 1 about agent memory': [0.8, 0.9], 'Item 2 about agent memory': [0.95, 0.6], 'Item 3 about agent memory': [0.8, 0.7] };
  const conn = scriptedConnector({ score: (key, prompt) => scores[/标题：(.*)/.exec(prompt)[1]][key === 'relevance' ? 0 : 1] });
  const twoDaysAgo = new Date(CLOCK.getTime() - 2 * 86_400_000 - 1000);
  await runRound(dir, { connector: conn, ctx: ctx({ now: () => twoDaysAgo }) });
  const list = listInbox(dir, { now: () => CLOCK });
  assert.deepEqual(list.map((c) => c.title.slice(0, 6)), ['Item 2', 'Item 1', 'Item 3']);
  assert.deepEqual(list.map((c) => c.waitingDays), [2, 2, 2]);
  assert.deepEqual(list[0].scores, { relevance: { score: 0.95, reason: 'scripted answer' }, substance: { score: 0.6, reason: 'scripted answer' }, freshness: { value: 'new', reason: 'scripted answer' } });
  assert.deepEqual(list[0].summary.points.length, 3);
  assert.equal(list[0].verification.passed, true);
  assert.equal(list[0].inboxAt, twoDaysAgo.toISOString());
  assert.equal(list[0].materials, 'body');
  keep(dir, items[1].url);
  assert.deepEqual(listInbox(dir).map((c) => c.title.slice(0, 6)), ['Item 1', 'Item 3'], 'a kept item leaves the list');
});

test('cleanCache: files older than cacheDays go, newer stay; fetchBody caches and serves from cache', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = makeLibrary('numbers-cache');
  const url = srv.route('/page', { status: 200, body: '<html><body><h1>Title</h1><script>bad()</script><p>Real text here.</p></body></html>', contentType: 'text/html' });
  const b1 = await fetchBody(url, ctx(), { libraryDir: dir, bodyMaxChars: 6000 });
  assert.deepEqual(b1, { ok: true, text: 'Title Real text here.', cached: false });
  const b2 = await fetchBody(url, ctx(), { libraryDir: dir, bodyMaxChars: 10 });
  assert.deepEqual(b2, { ok: true, text: 'Title Real', cached: true });
  assert.equal(srv.hits('/page'), 1);
  assert.deepEqual(await fetchBody(srv.route('/empty', { status: 200, body: '<p></p>', contentType: 'text/html' }), ctx(), { libraryDir: dir }), { ok: false, reason: 'empty' });
  assert.deepEqual((await fetchBody(srv.route('/gone', { status: 404, body: 'x' }), ctx(), { libraryDir: dir })).reason, 'http:404');
  assert.deepEqual((await fetchBody('ftp://x', ctx(), { libraryDir: dir })).reason, 'bad-url');
  const old = cachePath(dir, 'https://old/1');
  mkdirSync(join(dir, '_pipeline', 'cache'), { recursive: true });
  writeFileSync(old, JSON.stringify({ url: 'https://old/1', ts: new Date(CLOCK.getTime() - 8 * 86_400_000).toISOString(), text: 'old' }), 'utf8');
  writeFileSync(join(dir, '_pipeline', 'cache', 'junk.json'), 'not json', 'utf8');
  assert.deepEqual(cleanCache(dir, { days: 7, now: () => CLOCK }), { removed: 2 });
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(cachePath(dir, url)), true, 'the fresh one stays');
  assert.deepEqual(cleanCache(makeLibrary('numbers-nocache'), { days: 7 }), { removed: 0 });
});

test('constantScoreWarning: >= 5 identical scores from one source warn; 4 do not; varied scores do not; non-numbers are ignored', () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ url: `u${i}`, source: 'feed-a', score: 0.15 }));
  assert.equal(constantScoreWarning(five), 'constant-score: feed-a (5 items all at 0.15)');
  assert.equal(constantScoreWarning(five.slice(0, 4)), '');
  assert.equal(constantScoreWarning([...five.slice(0, 4), { url: 'u5', source: 'feed-a', score: 0.16 }]), '');
  assert.equal(constantScoreWarning([...five, ...five.map((s) => ({ ...s, source: 'feed-b', score: 0.5 }))]), 'constant-score: feed-a (5 items all at 0.15); feed-b (5 items all at 0.5)');
  assert.equal(constantScoreWarning([...five.slice(0, 4), { url: 'x', source: 'feed-a', score: 'high' }]), '');
  assert.equal(constantScoreWarning(five, { min: 6 }), '');
  assert.equal(constantScoreWarning(null), '');
});

// rounds.jsonl written by hand, oldest first (each line a round record with counts.inbox as given; null = no counts at all)
function roundsFile(name, inboxes) {
  const dir = makeLibrary(name);
  mkdirSync(join(dir, '_pipeline'), { recursive: true });
  const lines = inboxes.map((n, i) => JSON.stringify({ id: `r${i + 1}`, startedAt: `2026-11-0${(i % 9) + 1}T08:30:00.000Z`, finishedAt: `2026-11-0${(i % 9) + 1}T08:31:00.000Z`, ...(n === null ? {} : { counts: { fetched: 4, new: 2, inbox: n } }), calls: 3 }));
  writeFileSync(join(dir, '_pipeline', 'rounds.jsonl'), lines.map((l) => l + '\n').join(''), 'utf8');
  return dir;
}

test('noOutputStreak: from the newest round back, the rounds in a row with counts.inbox 0 / missing / not a number; a round with output stops it', () => {
  assert.equal(NO_OUTPUT_ROUNDS, 3, 'the threshold of plan C8');
  assert.equal(coreIndex.NO_OUTPUT_ROUNDS, 3, 'exported by the core');
  assert.equal(coreIndex.noOutputStreak, noOutputStreak);
  // control: the newest round had output -> 0, however many empty rounds came before
  assert.equal(homeNumbers(roundsFile('streak-last-ok', [0, 0, 0, 0, 5])).noOutputStreak, 0);
  assert.equal(homeNumbers(roundsFile('streak-two', [5, 0, 0])).noOutputStreak, 2, 'two below the threshold');
  assert.equal(homeNumbers(roundsFile('streak-three', [0, 0, 0])).noOutputStreak, 3, 'three: the threshold');
  assert.equal(homeNumbers(roundsFile('streak-reset', [0, 0, 0, 5, 0, 0])).noOutputStreak, 2, 'output in between starts the count again');
  assert.equal(homeNumbers(roundsFile('streak-missing', [4, null, 0])).noOutputStreak, 2, 'a round without counts counts as no output');
  assert.equal(homeNumbers(roundsFile('streak-none', [])).noOutputStreak, 0, 'no round yet: no streak');
  // the pure function, on the same shapes (newest first)
  assert.equal(noOutputStreak([{ counts: { inbox: 0 } }, { counts: { inbox: '3' } }, { counts: {} }, { counts: { inbox: 1 } }, { counts: { inbox: 0 } }]), 3);
  assert.equal(noOutputStreak(null), 0);
});
