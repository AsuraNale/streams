import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusView } from '../src/pipeline/status.mjs';
import { appendRoundRecord } from '../src/pipeline/rounds-log.mjs';
import { appendEvent } from '../src/library/ledger.mjs';
import { appendFetchLog } from '../src/fetch/log.mjs';
import { createUsageCounter } from '../src/connect/usage.mjs';
import { makeLibrary, TEST_CONFIG } from './support/fixtures.mjs';

const CONFIG = {
  ...TEST_CONFIG,
  sources: [
    { name: 'letta-blog', kind: 'rss', url: 'https://l.test' },
    { name: 'arxiv-mem', kind: 'arxiv', query: 'agent memory', paused: true },
    { name: 'never', kind: 'hn', query: 'x' },
  ],
};
const NOW = () => new Date('2026-11-03T15:00:00.000Z');

test('statusView: an empty library -> nulls and zeros, not invented numbers', () => {
  const dir = makeLibrary('status-empty', CONFIG);
  const v = statusView(dir, { now: NOW });
  assert.equal(v.lastRound, null);
  assert.equal(v.lastRoundItems, 0);
  assert.equal(v.lastDecisionAt, null);
  assert.equal(v.monthUsage.month, '2026-11');
  assert.equal(v.monthUsage.calls, 0);
  assert.deepEqual(v.sources.map((s) => [s.name, s.status, s.consecutive, s.paused]), [['letta-blog', null, 0, false], ['arxiv-mem', null, 0, true], ['never', null, 0, false]]);
  assert.deepEqual(v.health.lines, ['no-fetch-yet']);
});

test('statusView: every field recomputed from rounds / ledger / usage / fetch_log', () => {
  const dir = makeLibrary('status-full', CONFIG);
  appendRoundRecord(dir, { id: 'r1', startedAt: '2026-11-02T08:30:00.000Z', finishedAt: '2026-11-02T08:40:00.000Z', counts: { inbox: 1 }, calls: 4 });
  appendRoundRecord(dir, { id: 'r2', startedAt: '2026-11-03T08:30:00.000Z', finishedAt: '2026-11-03T08:41:00.000Z', counts: { inbox: 99 }, calls: 7 });
  for (const [url, round] of [['https://u/1', 'r1'], ['https://u/2', 'r2'], ['https://u/3', 'r2']]) {
    appendEvent(dir, { ev: 'seen', url, source: 'letta-blog', title: url });
    appendEvent(dir, { ev: 'inbox', url, round, verified: true });
  }
  appendEvent(dir, { ts: '2026-11-01T09:00:00.000Z', ev: 'kept', url: 'https://u/1', id: 'one' });
  appendEvent(dir, { ts: '2026-11-02T09:00:00.000Z', ev: 'dismissed', url: 'https://u/2', reason: 'no' });
  appendEvent(dir, { ts: '2026-11-02T10:00:00.000Z', ev: 'seen', url: 'https://u/4', source: 'letta-blog', title: 'later seen' });
  const usage = createUsageCounter(dir);
  usage.record({ ts: '2026-10-31T23:59:59.000Z', kind: 'claude-code', purpose: 'gate:relevance' });
  usage.record({ ts: '2026-11-01T00:00:01.000Z', kind: 'claude-code', purpose: 'gate:relevance' });
  usage.record({ ts: '2026-11-03T08:35:00.000Z', kind: 'claude-code', purpose: 'ask', calls: 2 });
  appendFetchLog(dir, { ts: '2026-11-02T08:30:00.000Z', round: 'r1', source: 'letta-blog', kind: 'rss', status: 'failed', http: 429, count: 0, new: 0, message: 'HTTP 429' });
  appendFetchLog(dir, { ts: '2026-11-03T08:30:00.000Z', round: 'r2', source: 'letta-blog', kind: 'rss', status: 'failed', http: 429, count: 0, new: 0, message: 'HTTP 429' });
  appendFetchLog(dir, { ts: '2026-11-03T08:30:00.000Z', round: 'r2', source: 'arxiv-mem', kind: 'arxiv', status: 'paused', count: 0, new: 0, message: 'paused' });
  // a source removed from streams.json: its history stays in fetch_log but does not count any more
  appendFetchLog(dir, { ts: '2026-11-03T08:30:00.000Z', round: 'r2', source: 'removed-one', kind: 'rss', status: 'blocked', http: 403, count: 0, new: 0, message: 'HTTP 403' });

  const v = statusView(dir, { now: NOW });
  assert.equal(v.lastRound.id, 'r2');
  assert.equal(v.lastRound.calls, 7);
  assert.equal(v.lastRoundItems, 2, 'inbox events of round r2 in the ledger, not the counts field');
  assert.equal(v.lastDecisionAt, '2026-11-02T09:00:00.000Z', 'the last kept / dismissed line; a later seen does not count');
  assert.equal(v.monthUsage.calls, 3, 'November only: 1 + 2');
  const letta = v.sources[0];
  assert.deepEqual(letta, { name: 'letta-blog', kind: 'rss', status: 'failed', http: 429, message: 'HTTP 429', consecutive: 2, lastOkAt: null, hint: 'retry-next-round', paused: false });
  assert.equal(v.sources[1].status, 'paused');
  assert.equal(v.sources[1].paused, true);
  assert.equal(v.health.level, 'warning', 'the removed blocked source does not turn the banner to blocked');
  assert.ok(!v.health.lines.join(' ').includes('removed-one'));
  assert.ok(v.health.lines.some((l) => l.startsWith('failed 1/')));
});

test('statusView: monthUsage follows the injected clock', () => {
  const dir = makeLibrary('status-month', CONFIG);
  createUsageCounter(dir).record({ ts: '2026-10-15T00:00:00.000Z', kind: 'api', purpose: 'ask' });
  assert.equal(statusView(dir, { now: () => new Date('2026-10-20T00:00:00.000Z') }).monthUsage.calls, 1);
  assert.equal(statusView(dir, { now: NOW }).monthUsage.calls, 0);
});
