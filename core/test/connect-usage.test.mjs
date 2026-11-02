import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createUsageCounter, readUsage, usagePath, monthOf } from '../src/connect/usage.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { caseDir } from './support/tmp.mjs';

const T = (iso) => () => new Date(iso);

test('record: one JSON line per call, ts auto-filled, append only, key order documented', () => {
  const dir = caseDir('usage-record');
  const u = createUsageCounter(dir, { now: T('2026-11-02T15:00:00.000Z') });
  const line = u.record({ kind: 'claude-code', model: 'claude-opus-5-5', inputTokens: 100, outputTokens: 7, costUsd: 0.004, purpose: 'score:relevance' });
  assert.deepEqual(line, { ts: '2026-11-02T15:00:00.000Z', kind: 'claude-code', model: 'claude-opus-5-5', calls: 1, inputTokens: 100, outputTokens: 7, costUsd: 0.004, purpose: 'score:relevance' });
  const text = readFileSync(usagePath(dir), 'utf8');
  assert.equal(text, JSON.stringify(line) + '\n');
  u.record({ ts: '2026-10-31T00:00:00.000Z', kind: 'api', purpose: 'ask', ok: false, code: 'rate-limited' });
  const after = readFileSync(usagePath(dir), 'utf8');
  assert.ok(after.startsWith(text));
  assert.equal(after.split('\n').filter(Boolean).length, 2);
  assert.match(after, /"model":"default"/);
  assert.match(after, /"code":"rate-limited"/);
});

test('record refuses malformed entries and writes nothing', () => {
  const dir = caseDir('usage-refuse');
  const u = createUsageCounter(dir);
  assert.throws(() => u.record({ purpose: 'x' }), (e) => e.code === 'bad-usage');
  assert.throws(() => u.record({ kind: 'api' }), (e) => e.code === 'bad-usage');
  assert.throws(() => u.record(null), (e) => e.code === 'bad-usage');
  assert.equal(existsSync(usagePath(dir)), false);
  assert.throws(() => createUsageCounter(''), (e) => e.code === 'bad-library-dir');
});

test('readUsage: sums the month asked for, groups by kind / purpose / model, skips bad lines', () => {
  const dir = caseDir('usage-read');
  const u = createUsageCounter(dir);
  u.record({ ts: '2026-11-01T10:00:00.000Z', kind: 'claude-code', model: 'a', inputTokens: 10, outputTokens: 1, costUsd: 0.1, purpose: 'score' });
  u.record({ ts: '2026-11-02T10:00:00.000Z', kind: 'claude-code', model: 'a', inputTokens: 20, outputTokens: 2, purpose: 'score', calls: 2 });
  u.record({ ts: '2026-11-30T23:59:59.000Z', kind: 'api', model: 'b', purpose: 'ask' });
  u.record({ ts: '2026-10-31T23:59:59.000Z', kind: 'api', model: 'b', inputTokens: 999, purpose: 'ask' });
  u.record({ ts: '2026-12-01T00:00:00.000Z', kind: 'codex', model: 'c', purpose: 'ask' });
  appendFileSync(usagePath(dir), 'not json\n{"no":"ts"}\n\n');
  const r = readUsage(dir, { month: '2026-11' });
  assert.deepEqual(r, { month: '2026-11', calls: 4, inputTokens: 30, outputTokens: 3, costUsd: 0.1, byKind: { 'claude-code': 3, api: 1 }, byPurpose: { score: 3, ask: 1 }, byModel: { a: 3, b: 1 }, skipped: [{ line: 6, reason: 'not-json' }, { line: 7, reason: 'bad-shape' }] });
  assert.equal(readUsage(dir, { month: '2026-10' }).inputTokens, 999);
  assert.equal(readUsage(dir, { month: '2025-01' }).calls, 0);
  assert.equal(readUsage(caseDir('usage-empty')).calls, 0, 'no file -> zeros');
  assert.equal(monthOf('2026-11-02T15:00:00.000Z'), '2026-11');
});

test('readUsage defaults to the current UTC month', () => {
  const dir = caseDir('usage-now');
  const u = createUsageCounter(dir);
  u.record({ kind: 'api', purpose: 'ask' });
  const r = readUsage(dir);
  assert.equal(r.month, new Date().toISOString().slice(0, 7));
  assert.equal(r.calls, 1);
});

test('wrap: every complete() of the wrapped connector lands in usage.jsonl, probe included, failures with their code', async () => {
  const dir = caseDir('usage-wrap');
  const u = createUsageCounter(dir, { now: T('2026-11-02T16:00:00.000Z') });
  const inner = fakeConnector({ mode: 'bad-format-once', json: { ok: true }, usage: { inputTokens: 5, outputTokens: 1 } });
  const c = u.wrap(inner, 'score:relevance');
  assert.equal(c.kind, inner.kind);
  const r1 = await c.complete({ prompt: 'p', format: 'json' });
  assert.equal(r1.code, 'bad-format');
  const r2 = await c.complete({ prompt: 'p', format: 'json' });
  assert.equal(r2.ok, true);
  const lines = readFileSync(usagePath(dir), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], { ts: '2026-11-02T16:00:00.000Z', kind: 'fake', model: 'fake-model', calls: 1, inputTokens: 5, outputTokens: 1, purpose: 'score:relevance', ok: false, code: 'bad-format' });
  assert.deepEqual(lines[1], { ts: '2026-11-02T16:00:00.000Z', kind: 'fake', model: 'fake-model', calls: 1, inputTokens: 5, outputTokens: 1, purpose: 'score:relevance', ok: true });
  assert.equal(readUsage(dir, { month: '2026-11' }).calls, 2);
  assert.throws(() => u.wrap(inner, ''), (e) => e.code === 'bad-usage');
});

test('wrap: probe() is counted too, under purpose "probe"', async () => {
  const dir = caseDir('usage-wrap-probe');
  const u = createUsageCounter(dir, { now: T('2026-11-02T17:00:00.000Z') });
  const inner = fakeConnector({ mode: 'fixed' });
  const c = u.wrap(inner, 'score');
  const p1 = await c.probe();
  const p2 = await c.probe();
  assert.equal(p1.ok, true);
  assert.equal(p2.ok, true);
  assert.equal(readUsage(dir, { month: '2026-11' }).calls, 2);
  assert.deepEqual(readUsage(dir, { month: '2026-11' }).byPurpose, { probe: 2 });
  const lines = readFileSync(usagePath(dir), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { ts: '2026-11-02T17:00:00.000Z', kind: 'fake', model: 'fake-model', calls: 1, purpose: 'probe', ok: true });
  const failing = u.wrap(fakeConnector({ mode: 'login-expired' }), 'score');
  await failing.probe();
  assert.equal(readUsage(dir, { month: '2026-11' }).calls, 3);
  assert.equal(JSON.parse(readFileSync(usagePath(dir), 'utf8').trim().split('\n').at(-1)).code, 'login-expired');
});

test('sentinel: a call in another month must not count toward this month', () => {
  const dir = caseDir('usage-sentinel');
  const u = createUsageCounter(dir);
  u.record({ ts: '2026-10-15T00:00:00.000Z', kind: 'api', purpose: 'ask' });
  assert.notEqual(readUsage(dir, { month: '2026-11' }).calls, 1);
  assert.equal(readUsage(dir, { month: '2026-11' }).calls, 0);
});
