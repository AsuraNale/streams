import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRound } from '../legacy/pipeline/round.mjs';
import { keep, dismiss, later, recentDismissReasons, slugOf } from '../src/pipeline/decide.mjs';
import { inboxPath, listInbox } from '../src/pipeline/inbox.mjs';
import { buildQueue } from '../legacy/pipeline/queue.mjs';
import { pipelineConfig } from '../legacy/pipeline/config.mjs';
import { replayLedger } from '../src/library/ledger.mjs';
import { readIndex } from '../src/library/index.mjs';
import { parseFrontmatter } from '../src/library/frontmatter.mjs';
import { scriptedConnector } from '../legacy/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, ledgerLines, hashTree, CLOCK } from './support/pipeline.mjs';
import { keepNote } from './support/fixtures.mjs';
import { hashNotes, readRawNote } from './support/raw-notes.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

async function inboxLibrary(t, name, n = 2) {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, n, (i) => ({ title: `Letta ships Memory Blocks ${i}`, date: 'Thu, 02 Jul 2026 08:00:00 GMT' }));
  const feed = feedRoute(srv, items);
  const dir = libraryWithFeed(name, feed);
  const conn = scriptedConnector({ score: 0.86 });
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.counts.inbox, n);
  return { dir, srv, items, urls: items.map((i) => i.url), conn };
}

// 4.5 第 8 步 / V2：收藏 = 唯一经 writeNoteFile 写一个 .md，账本 kept，删 inbox 文件，重建索引。
test('keep: writes one conforming note with the full header, ledger kept with the id, inbox file removed, index lists it', async (t) => {
  const { dir, urls } = await inboxLibrary(t, 'decide-keep');
  const now = () => CLOCK;
  const r = keep(dir, urls[0], { now });
  assert.equal(r.id, '2026-07-02-letta-ships-memory-blocks-1');
  assert.equal(r.file, `${r.id}.md`);
  const files = readdirSync(join(dir, 'notes'));
  assert.deepEqual(files, [r.file], 'exactly one note written');
  const text = readRawNote(dir, r.file);
  const { meta, body } = parseFrontmatter(text);
  assert.deepEqual(meta, {
    id: r.id,
    title: 'Letta ships Memory Blocks 1',
    source: urls[0],
    source_name: 'feed-a',
    date: '2026-07-02',
    collected: '2026-11-03',
    kept: '2026-11-03',
    status: 'kept',
    topics: ['agent 记忆'],
    scores: {
      relevance: { score: 0.86, reason: 'scripted answer' },
      substance: { score: 0.86, reason: 'scripted answer' },
      freshness: { value: 'new', reason: 'scripted answer' },
    },
  });
  assert.ok(body.startsWith('**这是什么：**a fake item for tests: Letta ships Memory Blocks 1\n- point one\n- point two\n- point three\n'));
  assert.equal(text.includes('Body of item'), false, 'the fetched body never enters the note');
  const kept = ledgerLines(dir).filter((e) => e.ev === 'kept');
  assert.deepEqual([kept.length, kept[0].url, kept[0].id], [1, urls[0], r.id]);
  assert.equal(existsSync(inboxPath(dir, urls[0])), false, 'inbox file removed');
  assert.equal(existsSync(inboxPath(dir, urls[1])), true, 'the other card stays');
  assert.deepEqual(readIndex(dir).map((e) => e.id), [r.id], 'index rebuilt');
  assert.deepEqual(readIndex(dir)[0].scores, { relevance: 0.86, substance: 0.86, freshness: 'new' });
  assert.deepEqual(readIndex(dir)[0].warnings, [], 'freshness is a known score key');
  assert.equal(listInbox(dir).length, 1);
  assert.equal(replayLedger(dir).states.get(urls[0]).stage, 'kept');
  // explicit topics override the source topic
  const r2 = keep(dir, urls[1], { topics: ['MCP'], now });
  assert.deepEqual(parseFrontmatter(readRawNote(dir, r2.file)).meta.topics, ['MCP']);
  // kept is terminal: keeping again, dismissing, are refused (not-in-inbox) and nothing changes
  const before = hashTree(dir);
  assert.throws(() => keep(dir, urls[0], { now }), (e) => e.code === 'not-in-inbox');
  assert.throws(() => dismiss(dir, urls[0], 'late'), (e) => e.code === 'not-in-inbox');
  assert.deepEqual(hashTree(dir), before);
});

test('keep: the precondition is the ledger stage, not the caller\'s belief: a seen item and an unknown url are not-in-inbox', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 1);
  const dir = libraryWithFeed('decide-notinbox', feedRoute(srv, items));
  await runRound(dir, { connector: scriptedConnector(), cap: 0, ctx: ctx() });
  assert.equal(replayLedger(dir).states.get(items[0].url).stage, 'seen');
  const before = hashTree(dir);
  assert.throws(() => keep(dir, items[0].url), (e) => e.code === 'not-in-inbox' && /seen/.test(e.message));
  assert.throws(() => keep(dir, 'https://never/seen'), (e) => e.code === 'not-in-inbox');
  assert.throws(() => keep(dir, ''), (e) => e.code === 'bad-argument');
  assert.deepEqual(hashTree(dir), before);
  assert.deepEqual(readdirSync(join(dir, 'notes')), []);
});

// 放弃：账本 dismissed；删 inbox 文件；同 url 再抓再高分永不回队列或 inbox。
// redesign R2 (N03, contract R2-2): the reason is optional now — this test no longer asks for reason-required on an empty
// reason (that case is the next test: no reason field at all); a reason that is not a string is still refused, and
// everything about the terminal state below is as it was.
test('dismiss: ledger dismissed with the reason; inbox file removed; the url never comes back even when fetched again with a high score', async (t) => {
  const { dir, urls, srv, items } = await inboxLibrary(t, 'decide-dismiss');
  for (const bad of [42, {}, ['x']]) {
    assert.throws(() => dismiss(dir, urls[1], bad), (e) => e.code === 'bad-argument', String(bad));
  }
  assert.throws(() => dismiss(dir, urls[1], 'x', { quick: 'made-up' }), (e) => e.code === 'bad-argument');
  assert.equal(existsSync(inboxPath(dir, urls[1])), true, 'a refused dismiss leaves the card');
  const r = dismiss(dir, urls[1], '  off topic: a sales page  ', { now: () => CLOCK });
  assert.deepEqual(r, { url: urls[1] });
  const d = ledgerLines(dir).filter((e) => e.ev === 'dismissed');
  assert.deepEqual([d.length, d[0].url, d[0].reason], [1, urls[1], 'off topic: a sales page']);
  assert.equal(existsSync(inboxPath(dir, urls[1])), false);
  assert.equal(replayLedger(dir).states.get(urls[1]).stage, 'dismissed');
  assert.deepEqual(listInbox(dir).map((c) => c.url), [urls[0]]);
  assert.throws(() => dismiss(dir, urls[1], 'again'), (e) => e.code === 'not-in-inbox');
  // the feed serves the same urls again, the connector scores everything 0.99: the dismissed url stays out
  feedRoute(srv, items);
  const loud = scriptedConnector({ score: 0.99 });
  const r2 = await runRound(dir, { connector: loud, ctx: ctx() });
  assert.equal(r2.calls, 0, 'nothing to score: one item is in the inbox, the other is dismissed');
  const q = buildQueue(dir, pipelineConfig(dir));
  assert.deepEqual([q.byNode.relevance, q.byNode.substance, q.summary], [[], [], []]);
  assert.equal(existsSync(inboxPath(dir, urls[1])), false);
  assert.equal(replayLedger(dir).states.get(urls[1]).stage, 'dismissed');
  assert.deepEqual(recentDismissReasons(dir), [{ ts: CLOCK.toISOString(), reason: 'off topic: a sales page', title: 'Letta ships Memory Blocks 2', url: urls[1] }]);
  assert.deepEqual(recentDismissReasons(dir, 0), []);
});

// redesign R2 (F27, contract R2-3): 稍后处理 is recorded now — one file, _pipeline/later.json, and nothing else (was: zero
// disk changes). An url not in the inbox still writes nothing.
test('later: an inbox item is marked in _pipeline/later.json only (not the ledger, not the note folder); anything else writes nothing', async (t) => {
  const { dir, urls } = await inboxLibrary(t, 'decide-later', 1);
  const before = hashTree(dir);
  assert.deepEqual(later(dir, 'https://never/seen'), { url: 'https://never/seen', stage: null });
  assert.deepEqual(hashTree(dir), before, 'an url not in the inbox: nothing written');
  assert.deepEqual(later(dir, urls[0], { now: () => CLOCK }), { url: urls[0], stage: 'inbox', at: CLOCK.toISOString() });
  const after = hashTree(dir);
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  assert.deepEqual(changed, ['_pipeline/later.json'], 'only the later file is new');
  assert.equal(listInbox(dir)[0].later, true);
  assert.equal(replayLedger(dir).states.get(urls[0]).stage, 'inbox', 'still in the inbox: keep / dismiss as ever');
  assert.equal(listInbox(dir).length, 1);
});

test('id-conflict: an existing note with the same id is never overwritten; no kept event, the card stays', async (t) => {
  const { dir, urls } = await inboxLibrary(t, 'decide-conflict', 1);
  const id = '2026-07-02-letta-ships-memory-blocks-1';
  keepNote(dir, id, { title: 'the original' }, 'original body\n');
  const notesBefore = hashNotes(dir);
  const before = hashTree(dir);
  assert.throws(() => keep(dir, urls[0], { now: () => CLOCK }), (e) => e.code === 'id-conflict');
  assert.deepEqual(hashNotes(dir), notesBefore, 'the original file is byte-identical');
  assert.deepEqual(hashTree(dir), before, 'no ledger event, inbox card still there');
  assert.ok(readRawNote(dir, `${id}.md`).includes('title: the original'));
  assert.equal(replayLedger(dir).states.get(urls[0]).stage, 'inbox');
});

test('slugOf: NFKC, lower-case, letters / digits / Han kept, runs of other characters collapse to one dash, cut at 60, empty falls back to a url hash', () => {
  assert.equal(slugOf('Letta 发布 Memory Blocks API!', 'u'), 'letta-发布-memory-blocks-api');
  assert.equal(slugOf('ＦＵＬＬ width', 'u'), 'full-width');
  assert.equal(Array.from(slugOf('a'.repeat(100), 'u')).length, 60);
  assert.match(slugOf('', 'https://x/1'), /^[0-9a-f]{8}$/);
  assert.match(slugOf('!!!', 'https://x/1'), /^[0-9a-f]{8}$/);
  assert.notEqual(slugOf('', 'https://x/1'), slugOf('', 'https://x/2'));
});

// V2: decide.mjs reaches the note folder only through writeNoteFile — the guard in write-note.test.mjs must keep
// listing write-note.mjs alone; here the direct sentinel on the file.
test('V2 sentinel: decide.mjs has no raw file write and does not name the note folder', () => {
  const text = readFileSync(join(SRC, 'pipeline', 'decide.mjs'), 'utf8');
  assert.equal(/writeFileSync|appendFileSync|createWriteStream|openSync/.test(text), false);
  assert.equal(/\bnotes\b/.test(text), false);
  const code = text.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  assert.equal((code.match(/writeNoteFile\(/g) ?? []).length, 1, 'exactly one call site');
  assert.ok(text.includes("{ by: 'keep' }"));
  // nothing else under src/pipeline calls writeNoteFile
  for (const f of readdirSync(join(SRC, 'pipeline'))) {
    if (f === 'decide.mjs') continue;
    assert.equal(readFileSync(join(SRC, 'pipeline', f), 'utf8').includes('writeNoteFile'), false, f);
  }
});
