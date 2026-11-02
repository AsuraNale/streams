import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendEvent, replayLedger, recordSeen, isSeen, ledgerPath, LEDGER_EVENTS } from '../src/library/ledger.mjs';
import { makeLibrary } from './support/fixtures.mjs';
import { caseDir } from './support/tmp.mjs';

function ledgerText(dir) {
  return readFileSync(ledgerPath(dir), 'utf8');
}

function lineCount(dir) {
  return ledgerText(dir).split('\n').filter(Boolean).length;
}

test('appendEvent: one JSON line per call, ts first and auto-filled, file only ever grows', () => {
  const dir = makeLibrary('ledger-append');
  assert.equal(ledgerText(dir), '');
  const e1 = appendEvent(dir, { ev: 'seen', url: 'https://u/1', source: 's', title: 'T', date: '2026-10-31' });
  assert.match(e1.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const after1 = ledgerText(dir);
  assert.equal(after1, JSON.stringify({ ts: e1.ts, ev: 'seen', url: 'https://u/1', source: 's', title: 'T', date: '2026-10-31' }) + '\n');
  assert.ok(after1.startsWith('{"ts":"'));
  const e2 = appendEvent(dir, { ts: '2026-11-02T00:00:00.000Z', ev: 'scored', url: 'https://u/1', node: 'relevance', score: 0.9, reason: 'r' });
  assert.equal(e2.ts, '2026-11-02T00:00:00.000Z', 'a provided ts is kept');
  const after2 = ledgerText(dir);
  assert.ok(after2.startsWith(after1), 'append only: earlier bytes untouched');
  assert.equal(lineCount(dir), 2);
});

test('appendEvent refuses malformed events and writes nothing', () => {
  const dir = makeLibrary('ledger-refuse');
  const bad = [
    [{ url: 'https://u/1' }, /missing "ev"/],
    [{ ev: 'seen' }, /missing "url"/],
    [{ ev: 'seen', url: '' }, /missing "url"/],
    [{ ev: 'teleported', url: 'https://u/1' }, /unknown event kind "teleported"/],
    [{ ev: 'scored', url: 'https://u/1', score: 1 }, /missing "node"/],
    [{ ev: 'unscored', url: 'https://u/1' }, /missing "node"/],
    [{ ev: 'kept', url: 'https://u/1' }, /missing "id"/],
    ['seen https://u/1', /plain object/],
    [null, /plain object/],
  ];
  for (const [ev, re] of bad) {
    assert.throws(() => appendEvent(dir, ev), (e) => e.code === 'bad-event' && re.test(e.message), JSON.stringify(ev));
  }
  assert.equal(ledgerText(dir), '');
});

test('replay: seen -> scored -> inbox -> kept builds the documented state', () => {
  const dir = makeLibrary('ledger-flow');
  const url = 'https://letta.com/blog/memory-blocks';
  appendEvent(dir, { ts: '2026-11-01T01:00:00.000Z', ev: 'seen', url, source: 'letta-blog', title: 'Letta', date: '2026-10-31' });
  appendEvent(dir, { ts: '2026-11-01T01:01:00.000Z', ev: 'scored', url, node: 'relevance', score: 0.86, reason: 'direct' });
  appendEvent(dir, { ts: '2026-11-01T01:02:00.000Z', ev: 'unscored', url, node: 'substance', reason: 'bad format twice' });
  appendEvent(dir, { ts: '2026-11-01T01:03:00.000Z', ev: 'scored', url, node: 'freshness', value: 'new', reason: 'progress' });
  appendEvent(dir, { ts: '2026-11-01T01:04:00.000Z', ev: 'inbox', url });
  let { states, skipped } = replayLedger(dir);
  assert.deepEqual(skipped, []);
  assert.deepEqual(states.get(url), {
    url, source: 'letta-blog', title: 'Letta', date: '2026-10-31',
    firstSeen: '2026-11-01T01:00:00.000Z', stage: 'inbox',
    scores: { relevance: { score: 0.86, reason: 'direct' }, freshness: { value: 'new', reason: 'progress' } },
    unscored: { substance: 'bad format twice' },
    lastTs: '2026-11-01T01:04:00.000Z',
  });
  // a later successful score clears the unscored entry
  appendEvent(dir, { ts: '2026-11-01T01:05:00.000Z', ev: 'scored', url, node: 'substance', score: 0.7, reason: 'ok now' });
  appendEvent(dir, { ts: '2026-11-01T01:06:00.000Z', ev: 'kept', url, id: '2026-10-31-letta-memory-blocks' });
  ({ states } = replayLedger(dir));
  const s = states.get(url);
  assert.equal(s.stage, 'kept');
  assert.equal(s.keptId, '2026-10-31-letta-memory-blocks');
  assert.deepEqual(s.unscored, {});
  assert.equal(s.scores.substance.score, 0.7);
  assert.equal(s.lastTs, '2026-11-01T01:06:00.000Z');
});

// 对照 test_pipeline.py::test_pipeline_flow "re-fetch: seen still 2 (url dedup)"
test('seen twice: second seen changes nothing, firstSeen and title are not reset', () => {
  const dir = makeLibrary('ledger-seen-twice');
  appendEvent(dir, { ts: '2026-11-01T00:00:00.000Z', ev: 'seen', url: 'https://u/1', source: 'a', title: 'First title', date: '2026-10-01' });
  appendEvent(dir, { ts: '2026-11-02T00:00:00.000Z', ev: 'seen', url: 'https://u/1', source: 'mirror', title: 'Second title', date: '2026-10-02' });
  const { states } = replayLedger(dir);
  assert.equal(states.size, 1);
  const s = states.get('https://u/1');
  assert.equal(s.firstSeen, '2026-11-01T00:00:00.000Z');
  assert.equal(s.title, 'First title');
  assert.equal(s.source, 'a');
  assert.equal(s.lastTs, '2026-11-01T00:00:00.000Z');
});

// 对照 test_pipeline.py::test_pipeline_flow "re-fetch: seen still 2" and test_manual_add
// "re-adding the same url is deduped by the ledger"; this is the ledger half of V4.
test('recordSeen is idempotent: a second round over the same items adds zero lines', () => {
  const dir = makeLibrary('ledger-record-seen');
  const items = [
    { url: 'https://u/1', source: 'feed-a', title: 'Alpha story', date: '2026-10-01' },
    { url: 'https://u/2', source: 'feed-a', title: 'Beta story', date: '2026-10-02' },
  ];
  const r1 = items.map((i) => recordSeen(dir, i));
  assert.deepEqual(r1, [{ added: true }, { added: true }]);
  assert.equal(lineCount(dir), 2);
  const bytes = ledgerText(dir);
  const r2 = items.map((i) => recordSeen(dir, i));
  assert.deepEqual(r2, [{ added: false }, { added: false }]);
  assert.equal(ledgerText(dir), bytes, 'zero changes on the second round');
  assert.equal(isSeen(dir, 'https://u/1'), true);
  assert.equal(isSeen(dir, 'https://u/3'), false);
  // a genuinely new url still gets through (the dedup is per url, not a global lock)
  assert.deepEqual(recordSeen(dir, { url: 'https://u/3', source: 'feed-a', title: 'Gamma story' }), { added: true });
  assert.equal(lineCount(dir), 3);
  assert.throws(() => recordSeen(dir, { title: 'no url' }), (e) => e.code === 'bad-event');
});

// 对照 test_pipeline.py::test_dismissed_status_one_way
test('dismissed is one-way: later seen / scored / inbox / kept do not flip it back', () => {
  const dir = makeLibrary('ledger-dismissed');
  const url = 'https://d/1';
  appendEvent(dir, { ts: '2026-11-01T00:00:00.000Z', ev: 'seen', url, source: 'feed-a', title: 'Rejected' });
  appendEvent(dir, { ts: '2026-11-01T00:01:00.000Z', ev: 'scored', url, node: 'relevance', score: 0.9, reason: 'x' });
  appendEvent(dir, { ts: '2026-11-01T00:02:00.000Z', ev: 'inbox', url });
  appendEvent(dir, { ts: '2026-11-01T00:03:00.000Z', ev: 'dismissed', url, reason: 'nope' });
  let s = replayLedger(dir).states.get(url);
  assert.equal(s.stage, 'dismissed');
  assert.equal(s.dismissReason, 'nope');
  // re-judged high, re-seen, re-inboxed, even "kept": status STAYS dismissed
  appendEvent(dir, { ts: '2026-11-02T00:00:00.000Z', ev: 'scored', url, node: 'relevance', score: 0.95, reason: 'y' });
  appendEvent(dir, { ts: '2026-11-02T00:01:00.000Z', ev: 'seen', url, source: 'feed-a', title: 'Rejected again' });
  appendEvent(dir, { ts: '2026-11-02T00:02:00.000Z', ev: 'inbox', url });
  appendEvent(dir, { ts: '2026-11-02T00:03:00.000Z', ev: 'kept', url, id: 'd-1' });
  s = replayLedger(dir).states.get(url);
  assert.equal(s.stage, 'dismissed');
  assert.equal(s.keptId, undefined);
  assert.equal(s.scores.relevance.score, 0.9, 'post-dismissal events are ignored entirely');
  assert.equal(s.lastTs, '2026-11-01T00:03:00.000Z');
  assert.equal(isSeen(dir, url), true, 'dismissed urls still count as seen (never re-fetched)');
});

test('kept is terminal too: a later dismissed does not undo it', () => {
  const dir = makeLibrary('ledger-kept-terminal');
  const url = 'https://k/1';
  appendEvent(dir, { ev: 'seen', url, source: 's', title: 't' });
  appendEvent(dir, { ev: 'kept', url, id: 'k-1' });
  appendEvent(dir, { ev: 'dismissed', url, reason: 'changed my mind' });
  const s = replayLedger(dir).states.get(url);
  assert.equal(s.stage, 'kept');
  assert.equal(s.keptId, 'k-1');
  assert.equal(s.dismissReason, undefined);
});

test('events for a url never seen still produce a state (nothing is lost)', () => {
  const dir = makeLibrary('ledger-unseen');
  appendEvent(dir, { ts: '2026-11-01T00:00:00.000Z', ev: 'inbox', url: 'https://x/1' });
  const s = replayLedger(dir).states.get('https://x/1');
  assert.equal(s.stage, 'inbox');
  assert.equal(s.firstSeen, '2026-11-01T00:00:00.000Z');
  assert.equal(s.source, undefined);
});

test('replay: malformed lines are skipped with line numbers and reasons, the rest still applies', () => {
  const dir = makeLibrary('ledger-bad-lines');
  const good1 = JSON.stringify({ ts: '2026-11-01T00:00:00.000Z', ev: 'seen', url: 'https://g/1', source: 's', title: 'ok' });
  const good2 = JSON.stringify({ ts: '2026-11-01T00:05:00.000Z', ev: 'inbox', url: 'https://g/1' });
  writeFileSync(ledgerPath(dir), [
    good1,                                                          // 1 ok
    '{not json at all',                                             // 2 not-json
    JSON.stringify({ ts: 'x', url: 'https://g/2' }),                // 3 missing-ev
    JSON.stringify({ ts: 'x', ev: 'seen' }),                        // 4 missing-url
    JSON.stringify({ ts: 'x', ev: 'exploded', url: 'https://g/3' }), // 5 unknown-ev
    '',                                                             // 6 blank: ignored silently
    '[1,2,3]',                                                      // 7 not-an-object
    JSON.stringify({ ts: 'x', ev: 'scored', url: 'https://g/1', score: 1 }), // 8 missing-node
    good2,                                                          // 9 ok
    '   ',                                                          // 10 blank
  ].join('\n') + '\n', 'utf8');
  const { states, skipped } = replayLedger(dir);
  assert.deepEqual(skipped, [
    { line: 2, reason: 'not-json' },
    { line: 3, reason: 'missing-ev' },
    { line: 4, reason: 'missing-url' },
    { line: 5, reason: 'unknown-ev:exploded' },
    { line: 7, reason: 'not-an-object' },
    { line: 8, reason: 'missing-node' },
  ]);
  assert.equal(states.size, 1);
  assert.equal(states.get('https://g/1').stage, 'inbox');
  assert.equal(states.has('https://g/2'), false);
  assert.equal(states.has('https://g/3'), false);
});

test('replay on a library with no ledger yet -> empty, not an error', () => {
  const dir = caseDir('ledger-none');
  const { states, skipped } = replayLedger(dir);
  assert.equal(states.size, 0);
  assert.deepEqual(skipped, []);
});

test('sentinel: the number of skipped lines equals exactly the number planted', () => {
  const dir = makeLibrary('ledger-sentinel');
  appendEvent(dir, { ev: 'seen', url: 'https://s/1', source: 's', title: 't' });
  appendFileSync(ledgerPath(dir), 'garbage one\ngarbage two\n', 'utf8');
  appendEvent(dir, { ev: 'seen', url: 'https://s/2', source: 's', title: 't' });
  const { states, skipped } = replayLedger(dir);
  assert.equal(skipped.length, 2);
  assert.deepEqual(skipped.map((s) => s.line), [2, 3]);
  assert.equal(states.size, 2);
  assert.deepEqual(LEDGER_EVENTS, ['seen', 'scored', 'unscored', 'inbox', 'kept', 'dismissed']);
});

// 验方 2026-11-02 报的缺陷 S1：账本末尾没有换行（手改、写到一半断电）时，append 不能把新事件粘到上一行。
test('appendEvent: a ledger whose last line lost its newline gets a fresh line, both events survive replay', () => {
  const dir = makeLibrary('ledger-no-trailing-newline');
  const first = { ts: '2026-11-01T10:00:00.000Z', ev: 'seen', url: 'https://a/1', source: 's', title: 'A', date: '2026-10-31' };
  writeFileSync(ledgerPath(dir), JSON.stringify(first), 'utf8'); // no trailing newline, on purpose
  const r = recordSeen(dir, { url: 'https://b/2', source: 's', title: 'B', date: '2026-10-31' });
  assert.equal(r.added, true);
  const lines = ledgerText(dir).split('\n').filter(Boolean);
  assert.equal(lines.length, 2, 'two separate lines');
  assert.deepEqual(JSON.parse(lines[0]), first, 'the earlier event is intact');
  assert.equal(JSON.parse(lines[1]).url, 'https://b/2');
  const { states, skipped } = replayLedger(dir);
  assert.deepEqual(skipped, []);
  assert.deepEqual([...states.keys()].sort(), ['https://a/1', 'https://b/2']);
  // sentinel: gluing them would have made line 1 unparseable — prove the replay does flag that shape
  const glued = makeLibrary('ledger-glued-sentinel');
  writeFileSync(ledgerPath(glued), JSON.stringify(first) + JSON.stringify({ ...first, url: 'https://b/2' }) + '\n', 'utf8');
  assert.equal(replayLedger(glued).skipped.length, 1, 'a glued line is skipped as not-json');
});

// W2 抓取第二层去重：seen 事件可带 maybe_duplicate_of；重放要带进 state（maybeDuplicateOf），没有它时不多出键。
test('replay: seen.maybe_duplicate_of surfaces as maybeDuplicateOf; absent, empty or non-string adds no key', () => {
  const dir = makeLibrary('ledger-maybe-dup');
  appendEvent(dir, { ts: '2026-11-01T00:00:00.000Z', ev: 'seen', url: 'https://u/1', source: 'feed-a', title: 'Alpha story', date: '2026-10-01' });
  appendEvent(dir, { ts: '2026-11-02T00:00:00.000Z', ev: 'seen', url: 'https://mirror/1', source: 'feed-a', title: 'Alpha  STORY', date: '2026-10-02', maybe_duplicate_of: 'https://u/1' });
  appendEvent(dir, { ts: '2026-11-02T00:00:00.000Z', ev: 'seen', url: 'https://u/2', source: 'feed-a', title: 'Beta', maybe_duplicate_of: '' });
  appendEvent(dir, { ts: '2026-11-02T00:00:00.000Z', ev: 'seen', url: 'https://u/3', source: 'feed-a', title: 'Gamma', maybe_duplicate_of: 7 });
  const { states, skipped } = replayLedger(dir);
  assert.deepEqual(skipped, []);
  assert.equal(states.get('https://mirror/1').maybeDuplicateOf, 'https://u/1');
  assert.equal(states.get('https://mirror/1').stage, 'seen', 'a hint is not a verdict: the item is still an ordinary seen item');
  assert.equal('maybeDuplicateOf' in states.get('https://u/1'), false);
  assert.equal('maybeDuplicateOf' in states.get('https://u/2'), false);
  assert.equal('maybeDuplicateOf' in states.get('https://u/3'), false);
  // a later seen with a hint for an already-known url changes nothing (first seen wins)
  appendEvent(dir, { ts: '2026-11-03T00:00:00.000Z', ev: 'seen', url: 'https://u/1', source: 'x', title: 'Alpha story', maybe_duplicate_of: 'https://mirror/1' });
  assert.equal('maybeDuplicateOf' in replayLedger(dir).states.get('https://u/1'), false);
  // the hint survives later events (scored / inbox), since it lives on the state, not the stage
  appendEvent(dir, { ts: '2026-11-03T00:00:00.000Z', ev: 'inbox', url: 'https://mirror/1' });
  const s = replayLedger(dir).states.get('https://mirror/1');
  assert.equal(s.stage, 'inbox');
  assert.equal(s.maybeDuplicateOf, 'https://u/1');
});

test('appendEvent: a ledger that already ends with a newline gets no blank line inserted', () => {
  const dir = makeLibrary('ledger-trailing-newline-ok');
  appendEvent(dir, { ev: 'seen', url: 'https://a/1', source: 's', title: 'A', date: '2026-10-31' });
  appendEvent(dir, { ev: 'seen', url: 'https://b/2', source: 's', title: 'B', date: '2026-10-31' });
  assert.ok(!ledgerText(dir).includes('\n\n'), 'no empty line between events');
  assert.equal(lineCount(dir), 2);
});
