// Redesign R2 (docs/checks/2026-11-11-r2/contract.md): what the core gives 待看 and the run funnel.
//   R2-2  dismiss without a reason (no reason field, no placeholder), a quick reason beside the words; terminal as ever
//   R2-3  稍后处理: _pipeline/later.json only; released when the library's next run has ended (the desktop calls releaseLater)
//   R2-4  未通过筛选: listRejected (gate, score, threshold, reason; newest first; at most 50); moveToInbox never writes the note
//         folder, the card says moved:'rejected', and a keep after it writes a conforming note that the index lists
//   R2-5  待评分: a link added by hand is listed until the next run scores it, then goes the ordinary way
//   R2-6  the run record's calls by part (callsBy) add up to every call the connector got (the probe included); runFunnel
//         reads the five cells and the stop from the record; roundOutcome is what became of the run's items
// Every check first built so it can fail: each test has its reverse (the state before, a wrong input) asserted too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRound, selfCheck } from '../src/pipeline/round.mjs';
import { keep, dismiss, later, recentDismissReasons, moveToInbox, listRejected, listManualWaiting, roundOutcome, DISMISS_QUICK } from '../src/pipeline/decide.mjs';
import { readLater, releaseLater, laterPath } from '../src/pipeline/later.mjs';
import { runFunnel, failedStart, callsAddUp } from '../src/pipeline/funnel.mjs';
import { listInbox, inboxPath } from '../src/pipeline/inbox.mjs';
import { roundLog, listRounds } from '../src/pipeline/rounds-log.mjs';
import { homeNumbers } from '../src/pipeline/numbers.mjs';
import { replayLedger, appendEvent } from '../src/library/ledger.mjs';
import { readIndex } from '../src/library/index.mjs';
import { validateNote } from '../src/library/validate.mjs';
import { parseFrontmatter } from '../src/library/frontmatter.mjs';
import { addManual } from '../src/fetch/manual.mjs';
import { createUsageCounter, readUsage } from '../src/connect/usage.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, ledgerLines, hashTree, CLOCK } from './support/pipeline.mjs';

const notesOf = (dir) => Object.fromEntries(Object.entries(hashTree(dir)).filter(([k]) => k.startsWith('notes/')));

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

test('R2-4 listRejected: the items below a gate — gate, score, threshold, reason — newest first, at most the limit; the others are not there', async (t) => {
  const { dir, urls } = await library(t, 'r2-rejected', { n: 4, fail: [2, 4] });
  const r = listRejected(dir);
  assert.equal(r.total, 2);
  assert.deepEqual(r.items.map((i) => i.url).sort(), [urls[1], urls[3]].sort());
  for (const i of r.items) {
    assert.equal(i.gate, 'relevance');
    assert.equal(i.score, 0.1);
    assert.equal(typeof i.threshold, 'number');
    assert.ok(i.score < i.threshold);
    assert.equal(i.reason, 'scripted answer');
  }
  assert.deepEqual(listRejected(dir, { limit: 1 }).items.length, 1);
  assert.equal(listRejected(dir, { limit: 1 }).total, 2, 'the total is all of them');
  // newest first: the later verdict is listed first
  appendEvent(dir, { ts: new Date(Date.now() + 60_000).toISOString(), ev: 'scored', url: urls[1], node: 'relevance', score: 0.05, reason: 'later verdict', cfg: replayLedger(dir).states.get(urls[1]).cfg.relevance });
  assert.equal(listRejected(dir).items[0].url, urls[1]);
  assert.equal(listRejected(dir).items[0].reason, 'later verdict');
});

test('R2-4 moveToInbox: the card is in 待看 with moved:rejected, the note folder untouched; keep afterwards writes a conforming note the index lists; anything not below a gate is refused', async (t) => {
  const { dir, urls } = await library(t, 'r2-move', { n: 3, fail: [2] });
  const notesBefore = notesOf(dir);
  assert.throws(() => moveToInbox(dir, urls[0]), (e) => e.code === 'not-rejected', 'an inbox item');
  assert.throws(() => moveToInbox(dir, 'https://never/seen'), (e) => e.code === 'not-rejected');
  assert.equal(existsSync(inboxPath(dir, urls[1])), false, 'control: no card for the rejected item before');
  moveToInbox(dir, urls[1], { now: () => CLOCK });
  assert.deepEqual(notesOf(dir), notesBefore, 'the note folder byte for byte');
  const ev = ledgerLines(dir).filter((e) => e.ev === 'inbox' && e.url === urls[1]);
  assert.deepEqual(ev.map((e) => [e.moved, e.from]), [['rejected', 'relevance']]);
  const card = listInbox(dir).find((c) => c.url === urls[1]);
  assert.equal(card.moved, 'rejected');
  assert.equal(card.scores.relevance.score, 0.1);
  assert.equal(listRejected(dir).total, 0, 'not in 未通过筛选 any more');
  assert.throws(() => moveToInbox(dir, urls[1]), (e) => e.code === 'not-rejected', 'not twice');
  const { id, file } = keep(dir, urls[1], { now: () => CLOCK });
  const text = readFileSync(join(dir, 'notes', file), 'utf8');
  const v = validateNote({ fileName: file, text });
  assert.deepEqual(v.problems, [], 'the header conforms');
  assert.equal(v.ok, true);
  assert.equal(parseFrontmatter(text).meta.scores.relevance.score, 0.1, 'its scores are the ones it had');
  assert.ok(readIndex(dir).some((e) => e.id === id && e.status === 'kept'), 'the index lists it');
  // a dismissed item cannot be moved back (terminal)
  const { dir: d2, urls: u2 } = await library(t, 'r2-move-terminal', { n: 2, fail: [2] });
  appendEvent(d2, { ev: 'dismissed', url: u2[1] });
  assert.throws(() => moveToInbox(d2, u2[1]), (e) => e.code === 'not-rejected');
});

// ---- R2-5 ------------------------------------------------------------------------------------------------------------

test('R2-5 a link added by hand is 待评分 until the next run, which scores it the ordinary way (into the inbox, or below a gate)', async (t) => {
  const { dir, srv } = await library(t, 'r2-manual', { n: 1 });
  srv.route('/manual/good', { status: 200, body: '<html><body><p>A good manual page about agent memory.</p></body></html>', contentType: 'text/html' });
  srv.route('/manual/bad', { status: 200, body: '<html><body><p>Off topic.</p></body></html>', contentType: 'text/html' });
  assert.deepEqual(listManualWaiting(dir), []);
  addManual(dir, { url: `${srv.base}/manual/good`, title: 'Manual good one' });
  addManual(dir, { url: `${srv.base}/manual/bad`, title: 'Manual bad one' });
  assert.deepEqual(listManualWaiting(dir).map((m) => m.title), ['Manual good one', 'Manual bad one']);
  const conn = scriptedConnector({ score: (key, prompt) => (prompt.includes('Manual bad one') ? 0.1 : 0.9) });
  await runRound(dir, { connector: conn, ctx: ctx() });
  assert.deepEqual(listManualWaiting(dir), [], 'scored: no longer 待评分');
  assert.ok(listInbox(dir).some((c) => c.url === `${srv.base}/manual/good`), 'passed → 待看');
  assert.ok(listRejected(dir).items.some((i) => i.url === `${srv.base}/manual/bad`), 'below → 未通过筛选');
});

// ---- R2-6 ------------------------------------------------------------------------------------------------------------

test('R2-6 callsBy: self-check + relevance + substance + summary + verify = every call the connector got (probe included) = the usage file of the run', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 4, (i) => ({ title: `Agent memory note ${i}` }));
  const dir = libraryWithFeed('r2-calls', feedRoute(srv, items));
  const conn = scriptedConnector({ score: (key, prompt) => (key === 'relevance' && prompt.includes('Agent memory note 3') ? 0.1 : 0.86) });
  // the desktop's way (services/pipeline.mjs startRoundIn): the self-check first with the probe counted in the usage file,
  // then the run, whose own self-check is answered with that probe (no second call)
  const check = await selfCheck(dir, { connector: createUsageCounter(dir, { now: () => CLOCK }).wrap(conn, 'probe') });
  assert.equal(check.ok, true);
  const answered = { ...conn, probe: async () => ({ ok: true, latencyMs: 0, usage: { calls: check.probe.calls } }) };
  const r = await runRound(dir, { connector: answered, ctx: ctx() });
  const rec = roundLog(dir, r.round.id);
  assert.deepEqual(Object.keys(rec.callsBy), ['selfCheck', 'gates', 'summary', 'verify']);
  assert.equal(rec.callsBy.selfCheck, 1);
  assert.deepEqual(Object.keys(rec.callsBy.gates), ['relevance', 'substance']);
  const f = runFunnel(rec);
  const sum = f.calls.parts.reduce((a, p) => a + p.n, 0);
  assert.equal(sum, f.calls.total, 'the parts add up');
  assert.equal(callsAddUp(f), true);
  assert.equal(f.calls.total, conn.calls.length, 'every call the connector got, probe included');
  assert.equal(f.calls.total, rec.calls + 1, 'the cap sees the calls after the self-check');
  assert.equal(readUsage(dir, { month: CLOCK.toISOString().slice(0, 7) }).calls, conn.calls.length, 'the usage file says the same number');
  // the parts, recomputed from the prompts the connector got
  const kinds = conn.calls.map((c) => (c.model === 'verify' ? 'verify' : /"points": \[/.test(c.prompt) ? 'summary' : /"relevance": /.test(c.prompt) ? 'relevance' : /"substance": /.test(c.prompt) ? 'substance' : 'probe'));
  const count = (k) => kinds.filter((x) => x === k).length;
  assert.deepEqual(f.calls.parts.map((p) => [p.id, p.n]), [['self-check', count('probe')], ['gate:relevance', count('relevance')], ['gate:substance', count('substance')], ['summary', count('summary')], ['verify', count('verify')]]);
  // reverse: one part off by one no longer adds up
  const broken = structuredClone(f);
  broken.calls.parts[1].n += 1;
  assert.equal(callsAddUp(broken), false);
});

test('R2-6 runFunnel: the five cells from the record; a stopped run stops at its step; scoreless skips the gates; an old record has no parts; failedStart', async (t) => {
  const { dir, r } = await library(t, 'r2-funnel', { n: 4, fail: [3] });
  const rec = roundLog(dir, r.round.id);
  const f = runFunnel(rec);
  assert.deepEqual(f.cells.map((c) => [c.id, c.n]), [['fetched', rec.counts.fetched], ['new', rec.counts.new], ['gate:relevance', rec.gates.relevance.passed], ['gate:substance', rec.gates.substance.passed], ['inbox', rec.counts.inbox]]);
  assert.deepEqual(f.cells.map((c) => c.n), [4, 4, 3, 3, 3]);
  assert.equal(f.complete, true);
  assert.equal(f.stop, null);
  assert.equal(f.sources, 1);
  // a run stopped at the cap during relevance: that cell stops, the later ones are empty
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 5);
  const d2 = libraryWithFeed('r2-funnel-cap', feedRoute(srv, items));
  const r2 = await runRound(d2, { connector: scriptedConnector({ score: 0.9 }), cap: 2, ctx: ctx() });
  const rec2 = roundLog(d2, r2.round.id);
  assert.equal(rec2.stoppedAt, 'cap');
  assert.equal(rec2.stoppedNode, 'relevance');
  const f2 = runFunnel(rec2);
  assert.deepEqual(f2.cells.map((c) => [c.id, c.n, c.stop ?? false]), [['fetched', 5, false], ['new', 5, false], ['gate:relevance', null, true], ['gate:substance', null, false], ['inbox', null, false]]);
  assert.deepEqual([f2.stop.cell, f2.stop.why, f2.complete], [2, 'cap', false]);
  // a connection failure mid-run: its code
  const f3 = runFunnel({ ...rec, stoppedAt: 'connection', stoppedNode: 'substance', problems: [{ code: 'connection', connectionCode: 'login-expired', node: 'substance' }] });
  assert.deepEqual([f3.stop.cell, f3.stop.connectionCode], [3, 'login-expired']);
  // scoreless: the gate cells are skipped
  const f4 = runFunnel({ ...rec, scoreless: true });
  assert.deepEqual(f4.cells.filter((c) => c.skipped).map((c) => c.id), ['gate:relevance', 'gate:substance']);
  // an old record without callsBy: only the total, no parts made up
  const { callsBy, ...old } = rec;
  assert.ok(callsBy);
  const f5 = runFunnel(old);
  assert.deepEqual(f5.calls, { total: rec.calls, parts: null });
  // a run that did not start
  const f6 = failedStart({ at: CLOCK.toISOString(), problems: [{ code: 'connection', connectionCode: 'login-expired' }] });
  assert.deepEqual([f6.stop.cell, f6.stop.why, f6.stop.connectionCode, f6.cells.every((c) => c.n === null), f6.calls], [0, 'self-check', 'login-expired', true, null]);
});

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
