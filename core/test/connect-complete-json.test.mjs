import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeJson, RETRY_SUFFIX } from '../src/connect/complete-json.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';

test('bad format once: one retry with the reminder appended, then ok; calls accumulate', async () => {
  const c = fakeConnector({ mode: 'bad-format-once', json: { score: 1 }, usage: { inputTokens: 10, outputTokens: 2 } });
  const retries = [];
  const r = await completeJson(c, { system: 'S', prompt: 'P', format: 'json', model: 'verify' }, { retries: 1, onRetry: (x) => retries.push(x) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.json, { score: 1 });
  assert.equal(r.attempts, 2);
  assert.deepEqual(r.usage, { calls: 2, inputTokens: 20, outputTokens: 4 });
  assert.equal(c.calls.length, 2);
  assert.equal(c.calls[0].prompt, 'P');
  assert.equal(c.calls[1].prompt, 'P' + RETRY_SUFFIX);
  assert.equal(c.calls[1].system, 'S', 'system prompt kept on the retry');
  assert.equal(c.calls[1].model, 'verify', 'slot kept on the retry');
  assert.deepEqual(retries.map((x) => x.attempt), [1]);
  assert.match(retries[0].text, /not json/);
});

test('bad format always: second failure comes back as bad-format with attempts 2', async () => {
  const c = fakeConnector({ mode: 'bad-format-always' });
  const r = await completeJson(c, { prompt: 'P', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'bad-format');
  assert.equal(r.attempts, 2);
  assert.equal(r.usage.calls, 2);
  assert.equal(c.calls.length, 2);
  assert.match(r.text, /not json/);
});

test('other failures are not retried', async () => {
  const c = fakeConnector({ mode: 'login-expired' });
  const r = await completeJson(c, { prompt: 'P', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'login-expired');
  assert.equal(r.attempts, 1);
  assert.equal(c.calls.length, 1);
});

test('retries: 0 disables the retry; retries: 2 allows two', async () => {
  const c0 = fakeConnector({ mode: 'bad-format-once' });
  const r0 = await completeJson(c0, { prompt: 'P', format: 'json' }, { retries: 0 });
  assert.equal(r0.ok, false);
  assert.equal(r0.attempts, 1);
  const c2 = fakeConnector({ mode: 'bad-format-always' });
  const r2 = await completeJson(c2, { prompt: 'P', format: 'json' }, { retries: 2 });
  assert.equal(r2.attempts, 3);
  assert.equal(r2.usage.calls, 3);
});

test('happy path: one attempt, usage passed through, cost summed when present', async () => {
  const c = fakeConnector({ mode: 'fixed', json: { a: 1 }, usage: { costUsd: 0.01 } });
  const r = await completeJson(c, { prompt: 'P', format: 'json' });
  assert.equal(r.attempts, 1);
  assert.deepEqual(r.usage, { calls: 1, costUsd: 0.01 });
  assert.deepEqual(r.json, { a: 1 });
});

test('sentinel: a fixed connector must not be asked twice', async () => {
  const c = fakeConnector({ mode: 'fixed' });
  await completeJson(c, { prompt: 'P', format: 'json' });
  assert.notEqual(c.calls.length, 2);
  assert.equal(c.calls.length, 1);
});
