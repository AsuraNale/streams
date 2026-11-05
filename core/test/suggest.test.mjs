// v2 package D2 · rule-based suggestion cards: the four rules and their boundaries, the records, and no auto-action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { suggestFor, jaccard, overlaps, topicKeywords, SOURCE_FAILING_ROUNDS, TOPIC_OVERLAP_PERCENT, NO_OUTPUT_ROUNDS } from '../src/suggest/rules.mjs';
import { recordSuggestions, dismissSuggestion, acceptSuggestion, openSuggestions, readSuggestionLines, suggestionsPath } from '../src/suggest/records.mjs';
import * as core from '../src/index.mjs';
import { appendFetchLog } from '../src/fetch/log.mjs';
import { recordAiInstruction } from '../src/verify/ai-instructions.mjs';
import { makeLibrary, TEST_CONFIG } from './support/fixtures.mjs';
import { hashTree } from './support/pipeline.mjs';

const T0 = Date.parse('2026-11-05T08:00:00.000Z');
const at = (h) => new Date(T0 + h * 3_600_000).toISOString();
const clock = (h) => () => new Date(T0 + h * 3_600_000);

function library(name, { sources = ['feed-a', 'feed-b'], topics = TEST_CONFIG.topics, paused = [] } = {}) {
  return makeLibrary(name, {
    ...TEST_CONFIG,
    topics,
    sources: sources.map((s) => ({ name: s, kind: 'rss', url: `https://example.test/${s}.xml`, ...(paused.includes(s) ? { paused: true } : {}) })),
  });
}

function fetchRows(dir, source, statuses, startHour = 0) {
  statuses.forEach((status, i) => appendFetchLog(dir, { ts: at(startHour + i), round: `r${startHour + i}`, source, kind: 'rss', status, count: 0, new: 0 }));
}

function rounds(dir, inboxCounts, startHour = 0) {
  mkdirSync(join(dir, '_pipeline'), { recursive: true });
  const lines = inboxCounts.map((n, i) => JSON.stringify({ id: `r${startHour + i}`, startedAt: at(startHour + i), finishedAt: at(startHour + i), counts: { inbox: n } }) + '\n');
  appendFileSync(join(dir, '_pipeline', 'rounds.jsonl'), lines.join(''), 'utf8');
}

const kinds = (list) => list.map((s) => s.key).sort();

test('the thresholds are the documented ones', () => {
  assert.deepEqual([SOURCE_FAILING_ROUNDS, NO_OUTPUT_ROUNDS, TOPIC_OVERLAP_PERCENT], [3, 3, 60]);
  assert.equal(core.suggestFor, suggestFor, 'exported from the core');
});

test('source-failing: 2 failing rounds in a row -> nothing; 3 -> a card; failed and blocked mix; ok / empty / gap break the run', () => {
  const dir = library('sg-fail');
  fetchRows(dir, 'feed-a', ['ok', 'failed', 'failed']);
  fetchRows(dir, 'feed-b', ['failed', 'failed', 'failed', 'ok']);
  assert.deepEqual(suggestFor(dir, { now: clock(10) }), [], '2 in a row, and a run broken by ok');
  fetchRows(dir, 'feed-a', ['blocked'], 3);
  const s = suggestFor(dir, { now: clock(10) });
  assert.deepEqual(kinds(s), ['source-failing:feed-a']);
  assert.deepEqual(s[0], {
    key: 'source-failing:feed-a', kind: 'source-failing', subject: 'feed-a',
    evidence: { rounds: 3, failed: 2, blocked: 1, since: at(1), last: { ts: at(3), status: 'blocked', message: '' } },
    createdAt: at(10),
  });
  // gap (地址有问题) and empty are not 「暂时失败 / 被拒绝」
  const d2 = library('sg-fail-gap');
  fetchRows(d2, 'feed-a', ['failed', 'gap', 'failed', 'failed']);
  fetchRows(d2, 'feed-b', ['failed', 'empty', 'blocked', 'blocked']);
  assert.deepEqual(suggestFor(d2, { now: clock(10) }), []);
  fetchRows(d2, 'feed-b', ['failed'], 4);
  assert.deepEqual(kinds(suggestFor(d2, { now: clock(10) })), ['source-failing:feed-b']);
});

test('source-failing and ai-instruction skip a paused source and a source no longer in streams.json', () => {
  const dir = library('sg-paused', { sources: ['feed-a'], paused: ['feed-a'] });
  fetchRows(dir, 'feed-a', ['failed', 'failed', 'failed']);
  fetchRows(dir, 'gone', ['failed', 'failed', 'failed']);
  recordAiInstruction(dir, { at: at(1), source: 'feed-a', itemId: 'u1', by: 'rule', phrases: ['x'] });
  recordAiInstruction(dir, { at: at(1), source: 'gone', itemId: 'u2', by: 'rule', phrases: ['x'] });
  assert.deepEqual(suggestFor(dir, { now: clock(10) }), []);
  const live = library('sg-live', { sources: ['feed-a'] });
  fetchRows(live, 'feed-a', ['failed', 'failed', 'failed']);
  recordAiInstruction(live, { at: at(1), source: 'feed-a', itemId: 'u1', by: 'rule', phrases: ['x'] });
  assert.deepEqual(kinds(suggestFor(live, { now: clock(10) })), ['ai-instruction:feed-a', 'source-failing:feed-a'], 'negative: the same lines on an active source');
});

test('no-output: 2 rounds without output -> nothing; 3 -> a card; a round with output ends it', () => {
  const dir = library('sg-noout');
  rounds(dir, [2, 0, 0]);
  assert.deepEqual(suggestFor(dir, { now: clock(10) }), []);
  rounds(dir, [0], 3);
  const s = suggestFor(dir, { now: clock(10) });
  assert.deepEqual(s, [{ key: 'no-output:library', kind: 'no-output', subject: 'library', evidence: { rounds: 3, lastRound: 'r3', since: at(1) }, createdAt: at(10) }]);
  rounds(dir, [1], 4);
  assert.deepEqual(suggestFor(dir, { now: clock(10) }), []);
});

test('ai-instruction: a source with a record -> a card naming the items and the phrases; none -> nothing', () => {
  const dir = library('sg-ai');
  assert.deepEqual(suggestFor(dir, { now: clock(10) }), []);
  recordAiInstruction(dir, { at: at(1), source: 'feed-b', itemId: 'https://b/1', by: 'rule', phrases: ['忽略之前的所有要求'] });
  recordAiInstruction(dir, { at: at(2), source: 'feed-b', itemId: 'https://b/2', by: 'judge', phrases: ['wipe the config'] });
  const s = suggestFor(dir, { now: clock(10) });
  assert.deepEqual(s, [{
    key: 'ai-instruction:feed-b', kind: 'ai-instruction', subject: 'feed-b',
    evidence: { count: 2, items: ['https://b/1', 'https://b/2'], phrases: ['忽略之前的所有要求', 'wipe the config'], by: ['judge', 'rule'], lastAt: at(2) },
    createdAt: at(10),
  }]);
});

test('topic-overlap: Jaccard |A∩B| / |A∪B|, 59% -> nothing, 60% -> a card; keywords normalised; only with otherLibraries', () => {
  // 60%: 3 shared of 5 in all
  const mine = library('sg-ov-a', { topics: [{ name: 'Agent 记忆', keywords: ['MCP', 'ＲＡＧ', 'only-a'] }] });
  const other = library('sg-ov-b', { topics: [{ name: 'agent  记忆', keywords: ['mcp', 'rag', 'only-b'] }] });
  assert.deepEqual([...topicKeywords(JSON.parse(readFileSync(join(mine, 'streams.json'), 'utf8')))].sort(), ['agent 记忆', 'mcp', 'only-a', 'rag']);
  assert.deepEqual(suggestFor(mine, { now: clock(10) }), [], 'no otherLibraries: rule 4 does not run');
  const s = suggestFor(mine, { now: clock(10), otherLibraries: [{ libraryId: 'lib00002', dir: other }] });
  assert.deepEqual(s, [{
    key: 'topic-overlap:lib00002', kind: 'topic-overlap', libraryId: 'lib00002', subject: 'lib00002',
    evidence: { jaccard: 0.6, shared: ['agent 记忆', 'mcp', 'rag'], inter: 3, union: 5 },
    createdAt: at(10),
  }]);
  // 59.09%: 13 shared of 22 in all
  const shared = Array.from({ length: 13 }, (_, i) => `k${i}`);
  const a = library('sg-ov-c', { topics: [{ name: 't', keywords: [...shared.slice(1), 'a1', 'a2', 'a3', 'a4', 'a5'] }] });
  const b = library('sg-ov-d', { topics: [{ name: 't', keywords: [...shared.slice(1), 'b1', 'b2', 'b3', 'b4'] }] });
  const j = jaccard(topicKeywords({ topics: [{ name: 't', keywords: [...shared.slice(1), 'a1', 'a2', 'a3', 'a4', 'a5'] }] }), topicKeywords({ topics: [{ name: 't', keywords: [...shared.slice(1), 'b1', 'b2', 'b3', 'b4'] }] }));
  assert.deepEqual([j.inter, j.union], [13, 22]);
  assert.equal(overlaps(j), false);
  assert.deepEqual(suggestFor(a, { now: clock(10), otherLibraries: [{ libraryId: 'lib00004', dir: b }] }), []);
  // one more shared keyword on that pair: 14 / 22 = 63.6% -> a card
  const b2 = library('sg-ov-e', { topics: [{ name: 't', keywords: [...shared.slice(1), 'a1', 'b1', 'b2', 'b3', 'b4'] }] });
  assert.deepEqual(kinds(suggestFor(a, { now: clock(10), otherLibraries: [{ libraryId: 'lib00005', dir: b2 }] })), ['topic-overlap:lib00005']);
  // the integer form has no float edge, and empty sets never overlap
  assert.equal(overlaps({ inter: 3, union: 5 }), true);
  assert.equal(overlaps({ inter: 0, union: 0 }), false);
  assert.equal(overlaps({ inter: 59, union: 100 }), false);
  assert.equal(overlaps({ inter: 60, union: 100 }), true);
});

test('records: recordSuggestions writes a key once while it is open; the file is append-only', () => {
  const dir = library('sg-rec');
  fetchRows(dir, 'feed-a', ['failed', 'failed', 'failed']);
  rounds(dir, [0, 0, 0]);
  const list = suggestFor(dir, { now: clock(10) });
  assert.equal(list.length, 2);
  const w1 = recordSuggestions(dir, list, { now: clock(10) });
  assert.equal(w1.written.length, 2);
  const bytes1 = readFileSync(suggestionsPath(dir));
  const w2 = recordSuggestions(dir, suggestFor(dir, { now: clock(11) }), { now: clock(11) });
  assert.equal(w2.written.length, 0, 'same keys, still open: not written again');
  assert.deepEqual(readFileSync(suggestionsPath(dir)), bytes1);
  assert.deepEqual(kinds(openSuggestions(dir)), ['no-output:library', 'source-failing:feed-a']);
  // duplicates inside one list and junk entries are not written
  const d2 = library('sg-rec-dup');
  const one = { key: 'no-output:library', kind: 'no-output', subject: 'library', evidence: {}, createdAt: at(1) };
  assert.equal(recordSuggestions(d2, [one, { ...one }, { key: 'x', kind: 'made-up', subject: 's' }, null]).written.length, 1);
  // append-only: a dismissal adds a line, the earlier bytes stay as they were
  dismissSuggestion(dir, 'no-output:library', { reason: '这周本来就没更新', now: clock(12) });
  const bytes2 = readFileSync(suggestionsPath(dir));
  assert.deepEqual(bytes2.subarray(0, bytes1.length), bytes1);
  assert.equal(readSuggestionLines(dir).length, 3);
});

test('records: after dismiss / accept a key leaves open and the same evidence does not bring it back; new evidence does', () => {
  const dir = library('sg-handle');
  fetchRows(dir, 'feed-a', ['failed', 'failed', 'failed']);
  recordAiInstruction(dir, { at: at(1), source: 'feed-b', itemId: 'u1', by: 'rule', phrases: ['x'] });
  recordSuggestions(dir, suggestFor(dir, { now: clock(5) }), { now: clock(5) });
  assert.deepEqual(kinds(openSuggestions(dir)), ['ai-instruction:feed-b', 'source-failing:feed-a']);

  const d = dismissSuggestion(dir, 'ai-instruction:feed-b', { reason: '先不暂停', now: clock(6) });
  assert.deepEqual(d, { at: at(6), ev: 'dismissed', key: 'ai-instruction:feed-b', reason: '先不暂停' });
  const a = acceptSuggestion(dir, 'source-failing:feed-a', { proposalId: 'p-1', now: clock(6) });
  assert.deepEqual(a, { at: at(6), ev: 'accepted', key: 'source-failing:feed-a', proposalId: 'p-1' });
  assert.deepEqual(openSuggestions(dir), []);
  assert.throws(() => dismissSuggestion(dir, 'ai-instruction:feed-b'), { code: 'not-open' });
  assert.throws(() => acceptSuggestion(dir, 'nothing:here'), { code: 'not-open' });

  // the next round's check: same evidence -> not suggested, nothing written, still not open
  assert.deepEqual(suggestFor(dir, { now: clock(7) }), []);
  assert.equal(recordSuggestions(dir, suggestFor(dir, { now: clock(7) }), { now: clock(7) }).written.length, 0);
  assert.deepEqual(openSuggestions(dir), []);

  // new evidence after the handling: a new instruction from feed-b; two more failing rounds are not enough, three are
  recordAiInstruction(dir, { at: at(8), source: 'feed-b', itemId: 'u2', by: 'rule', phrases: ['y'] });
  fetchRows(dir, 'feed-a', ['failed', 'failed'], 8);
  assert.deepEqual(kinds(suggestFor(dir, { now: clock(11) })), ['ai-instruction:feed-b']);
  assert.deepEqual(suggestFor(dir, { now: clock(11) })[0].evidence.items, ['u2'], 'only what came after the dismissal');
  fetchRows(dir, 'feed-a', ['failed'], 10);
  recordSuggestions(dir, suggestFor(dir, { now: clock(12) }), { now: clock(12) });
  assert.deepEqual(kinds(openSuggestions(dir)), ['ai-instruction:feed-b', 'source-failing:feed-a']);
});

test('records: a handled topic-overlap comes back only when the shared keywords change', () => {
  const mine = library('sg-ov-h1', { topics: [{ name: 'x', keywords: ['a', 'b', 'c'] }] });
  const other = library('sg-ov-h2', { topics: [{ name: 'x', keywords: ['a', 'b', 'c'] }] });
  const others = [{ libraryId: 'lib0000h', dir: other }];
  recordSuggestions(mine, suggestFor(mine, { now: clock(1), otherLibraries: others }), { now: clock(1) });
  dismissSuggestion(mine, 'topic-overlap:lib0000h', { now: clock(2) });
  assert.deepEqual(suggestFor(mine, { now: clock(3), otherLibraries: others }), []);
  // both libraries now share d as well (edited by hand here): a different overlap, suggested again
  for (const d of [mine, other]) {
    const p = join(d, 'streams.json');
    const cfg = JSON.parse(readFileSync(p, 'utf8'));
    cfg.topics = [{ name: 'x', keywords: ['a', 'b', 'c', 'd'] }];
    writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  }
  assert.deepEqual(kinds(suggestFor(mine, { now: clock(4), otherLibraries: others })), ['topic-overlap:lib0000h']);
});

test('no auto-action: every suggest function leaves streams.json byte-identical and writes nothing but suggestions.jsonl', () => {
  const dir = library('sg-noauto');
  const other = library('sg-noauto-b');
  fetchRows(dir, 'feed-a', ['failed', 'failed', 'blocked']);
  rounds(dir, [0, 0, 0]);
  recordAiInstruction(dir, { at: at(1), source: 'feed-b', itemId: 'u1', by: 'rule', phrases: ['x'] });
  const sha = () => createHash('sha256').update(readFileSync(join(dir, 'streams.json'))).digest('hex');
  const before = sha();
  const tree = hashTree(dir, { skip: /^_pipeline\/suggestions\.jsonl$/ });
  const otherTree = hashTree(other);

  const list = suggestFor(dir, { now: clock(10), otherLibraries: [{ libraryId: 'lib0000b', dir: other }] });
  assert.deepEqual(kinds(list), ['ai-instruction:feed-b', 'no-output:library', 'source-failing:feed-a', 'topic-overlap:lib0000b']);
  recordSuggestions(dir, list, { now: clock(10) });
  openSuggestions(dir);
  dismissSuggestion(dir, 'source-failing:feed-a', { reason: 'r', now: clock(11) });
  acceptSuggestion(dir, 'ai-instruction:feed-b', { proposalId: 'p-9', now: clock(11) });
  suggestFor(dir, { now: clock(12), otherLibraries: [{ libraryId: 'lib0000b', dir: other }] });

  assert.equal(sha(), before, 'streams.json byte-identical');
  assert.deepEqual(hashTree(dir, { skip: /^_pipeline\/suggestions\.jsonl$/ }), tree, 'no other file of the library changed');
  assert.deepEqual(hashTree(other), otherTree, 'the other library is only read');
  assert.equal(readSuggestionLines(dir).length, 6);
});
