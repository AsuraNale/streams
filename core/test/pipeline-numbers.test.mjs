import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// 1.1 W7b: the libraries here are filled the way v1.0 did it (core/legacy's runRound, its scripted connector) — what an
// existing user's library holds; the numbers, the run records and the inbox list are core/src's. v1.0's estimates, its body
// cache and its constant-score warning left with the scoring pipeline (their cases went with them).
import { runRound } from '../legacy/pipeline/round.mjs';
import { keep, dismiss } from '../src/pipeline/decide.mjs';
import { homeNumbers, noOutputStreak, NO_OUTPUT_ROUNDS } from '../src/pipeline/numbers.mjs';
import * as coreIndex from '../src/index.mjs';
import { roundLog, listRounds } from '../src/pipeline/rounds-log.mjs';
import { listInbox } from '../src/pipeline/inbox.mjs';
import { appendEvent } from '../src/library/ledger.mjs';
import { scriptedConnector } from '../legacy/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, ledgerLines, roundLines, CLOCK } from './support/pipeline.mjs';
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
  // redesign R2 (F27): `later` (items put aside with 稍后处理) is a field of its own, 0 here
  assert.deepEqual(homeNumbers(empty), { caught: 0, inbox: 0, inboxOldestDays: 0, later: 0, kept: 0, dismissed: 0, lastRound: null, noOutputStreak: 0, sources: { level: 'quiet', counts: { ok: 0, empty: 0, gap: 0, failed: 0, blocked: 0, login: 0, paused: 0 }, lines: ['no-fetch-yet'] } });
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
    // redesign R2 (N10): the record carries callsBy (the calls by part) and, for a stopped run, stoppedNode
    assert.deepEqual(Object.keys(log), ['id', 'startedAt', 'finishedAt', 'counts', 'gates', 'calls', 'callsBy', ...(r.stoppedAt ? ['stoppedAt', 'stoppedNode'] : []), 'problems', 'warnings', 'fetch', 'unscored']);
  }
  assert.equal(r1.calls + r2.calls, 4 + 3 + 6, 'four at gate 1, three at gate 2, three summaries with a judge each');
  assert.equal(roundLog(dir, r1.round.id).fetch[0].newCount, 4);
  assert.equal(roundLog(dir, r2.round.id).fetch[0].status, 'empty');
});

// 1.1 W7b: cards of the same moment are in url order — a v1.0 item's scores no longer order the list (they would have put
// Item 2 first: the highest relevance)
test('listInbox: the same moment in url order, not by score; waitingDays from the inbox event, cards carry scores / summary / verification', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 3);
  const dir = libraryWithFeed('numbers-inbox', feedRoute(srv, items));
  const scores = { 'Item 1 about agent memory': [0.8, 0.9], 'Item 2 about agent memory': [0.95, 0.6], 'Item 3 about agent memory': [0.8, 0.7] };
  const conn = scriptedConnector({ score: (key, prompt) => scores[/标题：(.*)/.exec(prompt)[1]][key === 'relevance' ? 0 : 1] });
  const twoDaysAgo = new Date(CLOCK.getTime() - 2 * 86_400_000 - 1000);
  await runRound(dir, { connector: conn, ctx: ctx({ now: () => twoDaysAgo }) });
  const list = listInbox(dir, { now: () => CLOCK });
  assert.deepEqual(list.map((c) => c.title.slice(0, 6)), ['Item 1', 'Item 2', 'Item 3']);
  assert.deepEqual(list.map((c) => c.waitingDays), [2, 2, 2]);
  assert.deepEqual(list[1].scores, { relevance: { score: 0.95, reason: 'scripted answer' }, substance: { score: 0.6, reason: 'scripted answer' }, freshness: { value: 'new', reason: 'scripted answer' } }, 'v1.0 data is shown as it is');
  assert.deepEqual(list[0].summary.points.length, 3);
  assert.equal(list[0].verification.passed, true);
  assert.equal(list[0].inboxAt, twoDaysAgo.toISOString());
  assert.equal(list[0].materials, 'body');
  keep(dir, items[1].url);
  assert.deepEqual(listInbox(dir).map((c) => c.title.slice(0, 6)), ['Item 1', 'Item 3'], 'a kept item leaves the list');
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
