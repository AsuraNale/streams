// usageTotal (v2 package A; docs/core-api.md 三「连接」): every library's month of usage.jsonl added up, by connection and
// in all (the settings page's 「全部库本月用量合计」, 维护者 11-05); a library folder that is not there is skipped, not an error.
// The expected numbers are worked out by hand from the lines written; controls show a wrong sum is told apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createUsageCounter, readUsage, usageTotal } from '../src/connect/usage.mjs';
import * as core from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

function twoLibraries(prefix) {
  const a = caseDir(`${prefix}-a`);
  const b = caseDir(`${prefix}-b`);
  const ua = createUsageCounter(a);
  ua.record({ ts: '2026-11-01T10:00:00.000Z', kind: 'claude-code', inputTokens: 10, outputTokens: 1, costUsd: 0.25, purpose: 'score', calls: 2 });
  ua.record({ ts: '2026-11-02T10:00:00.000Z', kind: 'api', inputTokens: 5, purpose: 'ask' });
  ua.record({ ts: '2026-10-31T10:00:00.000Z', kind: 'api', inputTokens: 999, purpose: 'ask' });
  const ub = createUsageCounter(b);
  ub.record({ ts: '2026-11-03T10:00:00.000Z', kind: 'claude-code', inputTokens: 7, outputTokens: 3, costUsd: 0.5, purpose: 'summary' });
  ub.record({ ts: '2026-11-04T10:00:00.000Z', kind: 'codex', purpose: 'probe', calls: 0 });
  return { a, b };
}

test('usageTotal: two libraries added up, by connection and in all, each library\'s calls beside it', () => {
  assert.equal(core.usageTotal, usageTotal);
  const { a, b } = twoLibraries('usage-total');
  const r = usageTotal([a, b], { month: '2026-11' });
  // by hand: a = 2 + 1 calls, 15 in, 1 out, 0.25; b = 1 + 0 calls, 7 in, 3 out, 0.5 (October's 999 is not November's)
  assert.deepEqual(r, {
    month: '2026-11', calls: 4, inputTokens: 22, outputTokens: 4, costUsd: 0.75,
    byKind: { 'claude-code': 3, api: 1, codex: 0 },
    libraries: [{ dir: a, calls: 3 }, { dir: b, calls: 1 }],
    missing: [],
  });
  // the same as each library's own readUsage added up
  const ra = readUsage(a, { month: '2026-11' });
  const rb = readUsage(b, { month: '2026-11' });
  assert.equal(r.calls, ra.calls + rb.calls);
  assert.equal(r.inputTokens, ra.inputTokens + rb.inputTokens);
  // control: one library alone is not the total
  assert.notEqual(usageTotal([a], { month: '2026-11' }).calls, r.calls);
  assert.equal(usageTotal([a, b], { month: '2026-10' }).inputTokens, 999, 'only the month asked for');
  assert.equal(usageTotal([], { month: '2026-11' }).calls, 0);
});

test('usageTotal: a library folder that is not there is skipped and listed, the others still add up; the default month is now\'s', () => {
  const { a, b } = twoLibraries('usage-total-gone');
  const gone = join(caseDir('usage-total-root'), 'gone');
  const r = usageTotal([a, gone, b], { month: '2026-11' });
  assert.equal(r.calls, 4);
  assert.deepEqual(r.missing, [gone]);
  assert.deepEqual(r.libraries.map((l) => l.dir), [a, b]);
  const fresh = caseDir('usage-total-now');
  createUsageCounter(fresh).record({ kind: 'api', purpose: 'ask' });
  const now = usageTotal([fresh]);
  assert.equal(now.month, new Date().toISOString().slice(0, 7));
  assert.equal(now.calls, 1);
});
