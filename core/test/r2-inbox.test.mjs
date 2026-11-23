// Redesign R2 (docs/checks/2026-11-11-r2/contract.md): what the core gives 待看 and the run funnel.
//   R2-2  dismiss without a reason (no reason field, no placeholder), a quick reason beside the words; terminal as ever
//   R2-3  稍后处理: _pipeline/later.json only; released when the library's next run has ended (the desktop calls releaseLater)
//   R2-6  roundOutcome is what became of the run's items
// 1.1 W7b: R2-4 (未通过筛选), R2-5 (待评分) and the rest of R2-6 (the run's calls by scoring step, the funnel) were about v1.0's
// scoring pipeline and left with it; the libraries here are still filled the way v1.0 did it (core/legacy's runRound).
// Every check first built so it can fail: each test has its reverse (the state before, a wrong input) asserted too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runRound } from '../legacy/pipeline/round.mjs';
import { keep, dismiss, later, recentDismissReasons, roundOutcome, DISMISS_QUICK } from '../src/pipeline/decide.mjs';
import { readLater, releaseLater, laterPath } from '../src/pipeline/later.mjs';
import { listInbox } from '../src/pipeline/inbox.mjs';
import { listRounds } from '../src/pipeline/rounds-log.mjs';
import { homeNumbers } from '../src/pipeline/numbers.mjs';
import { replayLedger, appendEvent } from '../src/library/ledger.mjs';
import { scriptedConnector } from '../legacy/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, ledgerLines, CLOCK } from './support/pipeline.mjs';

/** A library whose round put `n` items in the inbox; `fail` (1-based item numbers) fall below relevance. */
async function library(t, name, { n = 3, fail = [] } = {}) {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, n, (i) => ({ title: `Agent memory note ${i}`, date: 'Thu, 02 Jul 2026 08:00:00 GMT' }));
  const dir = libraryWithFeed(name, feedRoute(srv, items));
  const conn = scriptedConnector({ score: (key, prompt) => (key === 'relevance' && fail.some((k) => prompt.includes(`Agent memory note ${k}\n`) || prompt.endsWith(`Agent memory note ${k}`)) ? 0.1 : 0.86) });
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  return { dir, srv, items, urls: items.map((i) => i.url), conn, r };
}

// ---- R2-2 ------------------------------------------------------------------------------------------------------------

test('R2-2 dismiss with no reason: the event has no reason field (no placeholder); recentDismissReasons skips it; a quick reason is kept beside the words', async (t) => {
  const { dir, urls } = await library(t, 'r2-dismiss', { n: 3 });
  for (const none of [undefined, null, '', '   ']) assert.ok(none === undefined || none === null || none.trim() === '');
  dismiss(dir, urls[0], undefined, { now: () => CLOCK });
  dismiss(dir, urls[1], '   ', { now: () => CLOCK });
  dismiss(dir, urls[2], '营销内容', { quick: 'marketing', now: () => CLOCK });
  const d = ledgerLines(dir).filter((e) => e.ev === 'dismissed');
  assert.equal(d.length, 3);
  assert.equal(Object.hasOwn(d[0], 'reason'), false, 'no reason given → no reason field');
  assert.equal(Object.hasOwn(d[1], 'reason'), false, 'blanks are no reason');
  assert.equal(Object.hasOwn(d[0], 'quick'), false);
  assert.deepEqual([d[2].reason, d[2].quick], ['营销内容', 'marketing']);
  assert.deepEqual(recentDismissReasons(dir).map((r) => [r.url, r.reason, r.quick]), [[urls[2], '营销内容', 'marketing']]);
  assert.deepEqual(DISMISS_QUICK, ['marketing', 'irrelevant', 'shallow', 'duplicate']);
  // terminal as ever: an inbox event after it changes nothing; a second dismiss is refused
  appendEvent(dir, { ev: 'inbox', url: urls[0], round: 'r-late' });
  assert.equal(replayLedger(dir).states.get(urls[0]).stage, 'dismissed');
  assert.throws(() => dismiss(dir, urls[0]), (e) => e.code === 'not-in-inbox');
  assert.throws(() => keep(dir, urls[0]), (e) => e.code === 'not-in-inbox');
});

// ---- R2-3 ------------------------------------------------------------------------------------------------------------

test('R2-3 later: marked in _pipeline/later.json (survives a re-read), listed with later:true, released by releaseLater; a kept or dismissed item is not 稍后', async (t) => {
  const { dir, urls } = await library(t, 'r2-later', { n: 3 });
  assert.equal(existsSync(laterPath(dir)), false, 'control: no file before');
  assert.equal(listInbox(dir).filter((c) => c.later).length, 0);
  later(dir, urls[0], { now: () => CLOCK });
  later(dir, urls[1], { now: () => CLOCK });
  later(dir, urls[1], { now: () => new Date(CLOCK.getTime() + 1000) });
  assert.deepEqual([...readLater(dir).keys()], [urls[0], urls[1]], 'once each, in order');
  assert.deepEqual(JSON.parse(readFileSync(laterPath(dir), 'utf8')).items.map((i) => i.at), [CLOCK.toISOString(), CLOCK.toISOString()], 'a second mark keeps the first time');
  assert.deepEqual(listInbox(dir).filter((c) => c.later).map((c) => c.url).sort(), [urls[0], urls[1]].sort());
  assert.deepEqual([homeNumbers(dir).inbox, homeNumbers(dir).later], [1, 2], '「n 条待看」 counts what is not put aside');
  keep(dir, urls[0], { now: () => CLOCK });
  assert.deepEqual([...readLater(dir).keys()], [urls[1]], 'a kept item is not 稍后 any more');
  assert.equal(replayLedger(dir).states.get(urls[1]).stage, 'inbox', 'the ledger is untouched by 稍后');
  assert.deepEqual(releaseLater(dir), { released: 1 });
  assert.equal(existsSync(laterPath(dir)), false);
  assert.equal(listInbox(dir).some((c) => c.later), false, 'every item back in 待看');
  assert.deepEqual(releaseLater(dir), { released: 0 });
  // a broken file reads as empty, never fatal
  writeFileSync(laterPath(dir), '{ not json', 'utf8');
  assert.equal(readLater(dir).size, 0);
});

// ---- R2-4 ------------------------------------------------------------------------------------------------------------

// ---- R2-5 ------------------------------------------------------------------------------------------------------------

// ---- R2-6 ------------------------------------------------------------------------------------------------------------

test('R2-6 roundOutcome: what became of the items the run put in 待看 — kept, dismissed, later, waiting; another run\'s items do not count', async (t) => {
  const { dir, urls, r } = await library(t, 'r2-outcome', { n: 4 });
  assert.deepEqual(roundOutcome(dir, r.round.id), { inbox: 4, kept: 0, dismissed: 0, later: 0, waiting: 4 });
  keep(dir, urls[0], { now: () => CLOCK });
  dismiss(dir, urls[1], undefined, { now: () => CLOCK });
  later(dir, urls[2], { now: () => CLOCK });
  assert.deepEqual(roundOutcome(dir, r.round.id), { inbox: 4, kept: 1, dismissed: 1, later: 1, waiting: 1 });
  assert.deepEqual(roundOutcome(dir, 'r-other'), { inbox: 0, kept: 0, dismissed: 0, later: 0, waiting: 0 });
  assert.equal(listRounds(dir, 1)[0].id, r.round.id);
});
