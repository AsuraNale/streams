// A round without a connection (product spec S1: 「这一步先跳过……没有连接也能抓，只是不打分，全部进待看」).
// It is asked for explicitly (scoreless:true); a connector that is merely missing still fails the self-check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runRound, selfCheck } from '../src/pipeline/round.mjs';
import { listInbox } from '../src/pipeline/inbox.mjs';
import { keep } from '../src/pipeline/decide.mjs';
import { readRawNote } from './support/raw-notes.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, stateHashes, ledgerLines, roundLines } from './support/pipeline.mjs';

test('scoreless: the self-check skips the probe only when asked; a missing connector alone still fails', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libraryWithFeed('scoreless-check', feedRoute(srv, serveItems(srv, 1)));
  const asked = await selfCheck(dir, { connector: null, scoreless: true });
  assert.equal(asked.ok, true);
  assert.equal(asked.scoreless, true);
  const missing = await selfCheck(dir, { connector: null });
  assert.equal(missing.ok, false, 'reverse: no connector without scoreless is a failure');
  assert.equal(missing.problems[0].connectionCode, 'not-installed');
});

test('scoreless round: everything fetched goes to the inbox, no model call, cards say scoreless and carry the excerpt', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 3);
  const dir = libraryWithFeed('scoreless-round', feedRoute(srv, items));
  const r = await runRound(dir, { connector: null, scoreless: true, ctx: ctx() });
  assert.equal(r.ok, true);
  assert.equal(r.started, true);
  assert.equal(r.scoreless, true);
  assert.equal(r.calls, 0);
  assert.equal(r.counts.inbox, 3);
  assert.deepEqual(r.gates.relevance, { passed: 0, failed: 0, unscored: 0 });
  const cards = listInbox(dir);
  assert.equal(cards.length, 3);
  for (const card of cards) {
    assert.equal(card.scoreless, true);
    assert.deepEqual(card.scores, {});
    assert.equal(typeof card.excerpt, 'string');
    assert.ok(card.excerpt.length > 0, 'the feed summary rides along');
  }
  assert.equal(ledgerLines(dir).filter((e) => e.ev === 'scored').length, 0, 'no score was invented');
  assert.equal(ledgerLines(dir).filter((e) => e.ev === 'inbox' && e.scoreless === true).length, 3);
  assert.equal(roundLines(dir).at(-1).scoreless, true);
  // a second round with nothing new changes nothing (V4)
  const before = stateHashes(dir);
  const r2 = await runRound(dir, { connector: null, scoreless: true, ctx: ctx() });
  assert.equal(r2.counts.inbox, 0);
  const after = stateHashes(dir);
  assert.ok(Object.keys(before).includes('_pipeline/ledger.jsonl') && Object.keys(before).some((k) => k.startsWith('_pipeline/inbox/')), 'the snapshot covers the ledger and the inbox');
  assert.deepEqual(after, before, 'ledger, inbox, notes, index: byte for byte');
});

test('scoreless: a kept card becomes a conforming note whose 「这是什么」 is the feed excerpt', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libraryWithFeed('scoreless-keep', feedRoute(srv, serveItems(srv, 1)));
  await runRound(dir, { connector: null, scoreless: true, ctx: ctx() });
  const [card] = listInbox(dir);
  const { file } = keep(dir, card.url);
  assert.ok(existsSync(join(dir, 'notes', file)));
  const text = readRawNote(dir, file);
  assert.ok(text.includes(card.excerpt.slice(0, 20)), 'the excerpt is the body');
  assert.ok(!/relevance|substance|freshness/.test(text), 'no score in the header');
  assert.equal(readdirSync(join(dir, '_pipeline', 'inbox')).length, 0);
});
