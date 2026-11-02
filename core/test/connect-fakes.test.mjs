import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeConnector, FAKE_MODES } from '../src/connect/fakes.mjs';
import { PROBE_PROMPT } from '../src/connect/types.mjs';

test('fixed: same JSON every time, copies not shared, text is the JSON', async () => {
  const c = fakeConnector({ mode: 'fixed', json: { score: 0.7, tags: ['a'] } });
  const a = await c.complete({ prompt: 'p', format: 'json' });
  const b = await c.complete({ prompt: 'q', format: 'json' });
  assert.deepEqual(a.json, { score: 0.7, tags: ['a'] });
  a.json.tags.push('mutated');
  assert.deepEqual(b.json, { score: 0.7, tags: ['a'] });
  assert.equal(a.text, '{"score":0.7,"tags":["a"]}');
  assert.deepEqual(a.usage, { calls: 1 });
  assert.equal(a.model, 'fake-model');
  assert.deepEqual(await c.detect(), { installed: true, loggedIn: true, version: 'fake' });
});

test('json can be a function of the request and call number', async () => {
  const c = fakeConnector({ mode: 'fixed', json: (req, n) => ({ n, len: req.prompt.length }) });
  assert.deepEqual((await c.complete({ prompt: 'abc', format: 'json' })).json, { n: 1, len: 3 });
  assert.deepEqual((await c.complete({ prompt: 'a', format: 'json' })).json, { n: 2, len: 1 });
});

test('bad-format-once then good; bad-format-always', async () => {
  const once = fakeConnector({ mode: 'bad-format-once' });
  const r1 = await once.complete({ prompt: 'p', format: 'json' });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'bad-format');
  assert.equal(typeof r1.text, 'string');
  const r2 = await once.complete({ prompt: 'p', format: 'json' });
  assert.equal(r2.ok, true);
  const always = fakeConnector({ mode: 'bad-format-always' });
  for (let i = 0; i < 3; i++) assert.equal((await always.complete({ prompt: 'p', format: 'json' })).code, 'bad-format');
});

test('login-expired: probe and complete both fail with the code; detect says so', async () => {
  const c = fakeConnector({ mode: 'login-expired' });
  const p = await c.probe();
  assert.equal(p.ok, false);
  assert.equal(p.code, 'login-expired');
  assert.equal(typeof p.latencyMs, 'number');
  const r = await c.complete({ prompt: 'p', format: 'json' });
  assert.equal(r.code, 'login-expired');
  assert.equal(r.usage.calls, 1);
  const d = await c.detect();
  assert.equal(d.loggedIn, false);
  assert.equal(d.code, 'login-expired');
});

test('counting: every call recorded with prompt, system, slot and format', async () => {
  const c = fakeConnector({ mode: 'counting', json: { ok: true } });
  await c.complete({ prompt: 'one', system: 'S', format: 'json', model: 'verify' });
  await c.complete({ prompt: 'two', format: 'json' });
  await c.probe();
  assert.equal(c.calls.length, 3);
  assert.deepEqual(c.calls.map((x) => x.prompt), ['one', 'two', PROBE_PROMPT]);
  assert.equal(c.calls[0].system, 'S');
  assert.equal(c.calls[0].model, 'verify');
  assert.equal(c.calls[1].model, 'main');
  assert.equal(c.calls[0].format, 'json');
  assert.match(c.calls[0].at, /^\d{4}-\d{2}-\d{2}T/);
  c.reset();
  assert.equal(c.calls.length, 0);
});

test('slow: waits the injected delay', async () => {
  const c = fakeConnector({ mode: 'slow', delayMs: 120 });
  const t0 = Date.now();
  const r = await c.complete({ prompt: 'p', format: 'json' });
  assert.ok(Date.now() - t0 >= 100, 'took at least ~the delay');
  assert.equal(r.ok, true);
  const p = await c.probe();
  assert.ok(p.latencyMs >= 100);
});

test('explicit model ids pass through; slots resolve to the fake model', async () => {
  const c = fakeConnector({ mode: 'fixed', model: 'm-main' });
  assert.equal((await c.complete({ prompt: 'p', format: 'json', model: 'verify' })).model, 'm-main');
  assert.equal((await c.complete({ prompt: 'p', format: 'json', model: 'typed' })).model, 'typed');
  assert.equal(c.resolveModel('verify'), 'm-main');
  assert.deepEqual(c.models(), [{ id: 'm-main', label: 'm-main', recommended: true }]);
});

test('bad requests and unknown modes are refused', async () => {
  assert.throws(() => fakeConnector({ mode: 'random' }), (e) => e.code === 'bad-fake-mode');
  const c = fakeConnector();
  await assert.rejects(() => c.complete({ format: 'json' }), (e) => e.code === 'bad-request');
  await assert.rejects(() => c.complete({ prompt: 'p', format: 'yaml' }), (e) => e.code === 'bad-request');
  assert.deepEqual(FAKE_MODES, ['fixed', 'bad-format-once', 'bad-format-always', 'login-expired', 'counting', 'slow']);
});

test('sentinel: fixed must never return bad-format', async () => {
  const c = fakeConnector({ mode: 'fixed' });
  const r = await c.complete({ prompt: 'p', format: 'json' });
  assert.notEqual(r.code, 'bad-format');
  assert.equal(r.ok, true);
});
