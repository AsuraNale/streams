// Redesign R6d-4 (docs/checks/2026-11-15-r6d/contract.md 「三处应用小问题」), the two that live in the core:
//   1. a note's `collected` is the LOCAL calendar day the item was first seen — the same algorithm as `kept` and the `date`
//      fallback (localIsoDate). Before, it was the first ten characters of the ledger's UTC instant: collected and kept in
//      one Eastern-time evening, a note said collected 11-15, kept 11-14.
//   2. validateNote knows the core's own fallback topic (FALLBACK_TOPIC: 未分类 / uncategorized) — a library made from the
//      form has no topics, so every note kept in it carried `unknown-topic:未分类`. Any other unknown topic still warns.
//
// The time zone: this file runs in its own process (node --test), and the assignment below puts that process in
// Eastern time, whatever the machine is set to (Node re-reads process.env.TZ when it is assigned; the imports are
// evaluated before it, and nothing they compute at load time is used for a date here). Each test that depends
// on it first checks that the zone took: on a machine where it did not, the test fails instead of passing by accident.
process.env.TZ = 'America/Toronto';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRound } from '../src/pipeline/round.mjs';
import { keep, FALLBACK_TOPIC } from '../src/pipeline/decide.mjs';
import { FALLBACK_TOPIC as FALLBACK_IN_CONFIG } from '../src/library/config.mjs';
import { validateNote } from '../src/library/validate.mjs';
import { readIndex } from '../src/library/index.mjs';
import { parseFrontmatter, serializeFrontmatter } from '../src/library/frontmatter.mjs';
import { replayLedger } from '../src/library/ledger.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx } from './support/pipeline.mjs';
import { readRawNote } from './support/raw-notes.mjs';
import { SPEC_META, SPEC_ID, SPEC_BODY, TEST_CONFIG } from './support/fixtures.mjs';

// 2026-11-14 20:30 in Toronto (EST = UTC-5) is 2026-11-15 01:30 UTC: the local day and the UTC day differ
const EVENING = new Date('2026-11-15T01:30:00.000Z');

function easternOrFail() {
  assert.deepEqual(
    [EVENING.getFullYear(), EVENING.getMonth() + 1, EVENING.getDate(), EVENING.getHours(), EVENING.getUTCDate()],
    [2026, 11, 14, 20, 15],
    'this process is in Eastern time (process.env.TZ took): the instant is the evening of the 14th here, the 15th in UTC',
  );
}

// a library the way the 新建库 form makes it: no topics, a source without a topic
async function formLikeLibrary(t, name, { language } = {}) {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 1, () => ({ title: 'Evening item', date: undefined }));
  const feed = feedRoute(srv, items);
  const dir = libraryWithFeed(name, feed, {
    sources: [{ name: 'feed-a', kind: 'rss', url: feed, max_results: 100 }],
    config: { topics: [], ...(language ? { pipeline: { ...TEST_CONFIG.pipeline, language } } : {}) },
  });
  const r = await runRound(dir, { connector: scriptedConnector({ score: 0.86 }), ctx: ctx({ now: () => EVENING }) });
  assert.equal(r.counts.inbox, 1);
  return { dir, url: items[0].url };
}

test('R6d-4 collected: an item first seen and kept in one Eastern-time evening has collected = kept = that local day, not the UTC day', async (t) => {
  easternOrFail();
  const { dir, url } = await formLikeLibrary(t, 'r6d-collected');
  const firstSeen = replayLedger(dir).states.get(url).firstSeen;
  assert.equal(firstSeen.slice(0, 10), '2026-11-15', 'the ledger keeps the UTC instant (its day is the 15th): the input the old code got wrong');
  const r = keep(dir, url, { now: () => EVENING });
  const { meta } = parseFrontmatter(readRawNote(dir, r.file));
  assert.equal(meta.kept, '2026-11-14');
  assert.equal(meta.collected, '2026-11-14', 'collected is the local day, like kept');
  assert.match(meta.collected, /^\d{4}-\d{2}-\d{2}$/, 'the format of the note file is unchanged');
  // first seen one local day, kept the next: the two days differ, each its own local day
  const { dir: dir2, url: url2 } = await formLikeLibrary(t, 'r6d-collected-next-day');
  const r2 = keep(dir2, url2, { now: () => new Date('2026-11-15T15:00:00.000Z') });
  const meta2 = parseFrontmatter(readRawNote(dir2, r2.file)).meta;
  assert.deepEqual([meta2.collected, meta2.kept], ['2026-11-14', '2026-11-15']);
});

test('R6d-4 fallback topic: a note kept in a library without topics carries 未分类 and no unknown-topic warning', async (t) => {
  const { dir, url } = await formLikeLibrary(t, 'r6d-fallback-kept');
  const r = keep(dir, url, { now: () => EVENING });
  assert.deepEqual(parseFrontmatter(readRawNote(dir, r.file)).meta.topics, ['未分类']);
  const entry = readIndex(dir).find((e) => e.id === r.id);
  assert.deepEqual(entry.warnings, [], 'the index lists the note without a warning');
});

test('R6d-4 validateNote: the fallback topic is known under both its names; any other unknown topic still warns', () => {
  assert.equal(FALLBACK_TOPIC, FALLBACK_IN_CONFIG, 'one constant: decide.mjs re-exports the one in library/config.mjs');
  assert.deepEqual(FALLBACK_TOPIC, { 'zh-CN': '未分类', en: 'uncategorized' });
  const text = (topics) => serializeFrontmatter({ ...SPEC_META, topics }) + SPEC_BODY;
  const check = (topics, config) => validateNote({ fileName: `${SPEC_ID}.md`, text: text(topics), config }).warnings.map((w) => w.code);
  const NO_TOPICS = { ...TEST_CONFIG, topics: [] };
  // positive: each name, in a library with topics and in one without, whatever the library's language
  for (const config of [TEST_CONFIG, NO_TOPICS, { ...NO_TOPICS, pipeline: { ...TEST_CONFIG.pipeline, language: 'en' } }]) {
    assert.deepEqual(check(['未分类'], config), []);
    assert.deepEqual(check(['uncategorized'], config), []);
    assert.deepEqual(check(['未分类', 'uncategorized'], config), []);
  }
  // negative: the check still fires on everything else — beside the fallback, alone, and for look-alikes
  assert.deepEqual(check(['未分类', '不存在的主题'], TEST_CONFIG), ['unknown-topic:不存在的主题']);
  assert.deepEqual(check(['agent 记忆'], NO_TOPICS), ['unknown-topic:agent 记忆']);
  assert.deepEqual(check(['Uncategorized', '未分类 ', 'zh-CN', 'en'], NO_TOPICS), ['unknown-topic:Uncategorized', 'unknown-topic:未分类 ', 'unknown-topic:zh-CN', 'unknown-topic:en']);
});
