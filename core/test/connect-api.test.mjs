import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApiConnector, buildRequest, codeFromHttp, parseSuccess, ANTHROPIC_VERSION, DEFAULT_MAX_TOKENS } from '../src/connect/api.mjs';
import { createConnector } from '../src/connect/connector.mjs';
import { scrub } from '../src/connect/types.mjs';
import { startFakeApi, GOOD_KEY } from './support/fake-api.mjs';

let api;
before(async () => { api = await startFakeApi(); });
after(async () => { await api.close(); });

const KEYS = { good: GOOD_KEY, wrong: 'sk-wrong-key-0000000000' };
const getKey = (ref) => KEYS[ref];

function anthropic(model, extra = {}) {
  return createApiConnector({ kind: 'api', model, api: { vendor: 'anthropic', baseUrl: api.baseUrl, keyRef: 'good' } }, { getKey, ...extra });
}
function openai(model, extra = {}) {
  return createApiConnector({ kind: 'api', model, api: { vendor: 'custom', baseUrl: `${api.baseUrl}/v1`, keyRef: 'good' } }, { getKey, ...extra });
}

// Throws when a secret appears anywhere in a result. Used on every result below.
function assertNoSecret(obj, secret) {
  const s = JSON.stringify(obj);
  if (s.includes(secret)) throw new Error(`secret leaked: ${s}`);
}

test('buildRequest: Anthropic Messages API shape (key only in x-api-key)', () => {
  const r = buildRequest({ kind: 'api', api: { vendor: 'anthropic', keyRef: 'k' } }, { model: 'claude-opus-5-5', system: 'S', prompt: 'P' }, 'KEY');
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(r.headers, { 'x-api-key': 'KEY', 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' });
  assert.deepEqual(r.body, { model: 'claude-opus-5-5', max_tokens: DEFAULT_MAX_TOKENS, system: 'S', messages: [{ role: 'user', content: 'P' }] });
  assert.ok(!JSON.stringify(r.body).includes('KEY'));
  const noSys = buildRequest({ kind: 'api', api: { vendor: 'anthropic', keyRef: 'k' } }, { model: 'm', prompt: 'P', maxTokens: 512 }, 'KEY');
  assert.equal(noSys.body.system, undefined);
  assert.equal(noSys.body.max_tokens, 512);
});

test('buildRequest: OpenAI-compatible shape for every other vendor (Bearer)', () => {
  for (const [vendor, url] of [['openai', 'https://api.openai.com/v1/chat/completions'], ['deepseek', 'https://api.deepseek.com/v1/chat/completions'], ['moonshot', 'https://api.moonshot.cn/v1/chat/completions'], ['zhipu', 'https://open.bigmodel.cn/api/paas/v4/chat/completions'], ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions']]) {
    const r = buildRequest({ kind: 'api', api: { vendor, keyRef: 'k' } }, { model: 'm', system: 'S', prompt: 'P' }, 'KEY');
    assert.equal(r.url, url, vendor);
    assert.deepEqual(r.headers, { authorization: 'Bearer KEY', 'content-type': 'application/json' });
    assert.deepEqual(r.body, { model: 'm', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'P' }] });
  }
  const custom = buildRequest({ kind: 'api', api: { vendor: 'custom', baseUrl: 'http://localhost:11434/v1/', keyRef: 'k' } }, { model: 'm', prompt: 'P' }, 'KEY');
  assert.equal(custom.url, 'http://localhost:11434/v1/chat/completions', 'trailing slash trimmed');
  assert.deepEqual(custom.body.messages, [{ role: 'user', content: 'P' }]);
  assert.throws(() => buildRequest({ kind: 'api', api: { vendor: 'custom', keyRef: 'k' } }, { model: 'm', prompt: 'P' }, 'KEY'), (e) => e.code === 'bad-connection');
});

test('complete: Anthropic success — headers, body, usage with cache tokens, model from the response', async () => {
  const c = anthropic('claude-opus-5-5');
  const r = await c.complete({ system: 'S', prompt: 'score this', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.json, { ok: true, echo: 'score this' });
  assert.deepEqual(r.usage, { calls: 1, inputTokens: 14, outputTokens: 6 });
  assert.equal(r.model, 'claude-opus-5-5');
  const req = api.requests.at(-1);
  assert.equal(req.url, '/v1/messages');
  assert.equal(req.headers['x-api-key'], GOOD_KEY);
  assert.equal(req.headers['anthropic-version'], ANTHROPIC_VERSION);
  assert.equal(req.headers.authorization, undefined);
  assert.deepEqual(req.body, { model: 'claude-opus-5-5', max_tokens: DEFAULT_MAX_TOKENS, system: 'S', messages: [{ role: 'user', content: 'score this' }] });
  assertNoSecret(r, GOOD_KEY);
});

test('complete: OpenAI-compatible success — Bearer header, system as first message', async () => {
  const c = openai('any-model');
  const r = await c.complete({ system: 'S', prompt: 'P', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.json, { ok: true, echo: 'P' });
  assert.deepEqual(r.usage, { calls: 1, inputTokens: 14, outputTokens: 6 });
  const req = api.requests.at(-1);
  assert.equal(req.url, '/v1/chat/completions');
  assert.equal(req.headers.authorization, `Bearer ${GOOD_KEY}`);
  assert.equal(req.headers['x-api-key'], undefined);
  assert.deepEqual(req.body, { model: 'any-model', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'P' }] });
  assertNoSecret(r, GOOD_KEY);
});

test('complete: fenced JSON still parses; prose is bad-format; truncated (max_tokens) is bad-format', async () => {
  assert.deepEqual((await anthropic('fence').complete({ prompt: 'x', format: 'json' })).json, { ok: true, fenced: true });
  const bad = await openai('bad').complete({ prompt: 'x', format: 'json' });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'bad-format');
  assert.match(bad.text, /0\.8/);
  const cut = await anthropic('max').complete({ prompt: 'x', format: 'json' });
  assert.equal(cut.code, 'bad-format');
});

test('complete: bad key -> bad-key on both styles, and the key never reaches the result', async () => {
  const bothStyles = [
    createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'anthropic', baseUrl: api.baseUrl, keyRef: 'wrong' } }, { getKey }),
    createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'custom', baseUrl: `${api.baseUrl}/v1`, keyRef: 'wrong' } }, { getKey }),
  ];
  for (const c of bothStyles) {
    const r = await c.complete({ prompt: 'x', format: 'json' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'bad-key');
    assert.match(r.detail, /HTTP 401/);
    assert.match(r.detail, /<key>/, 'the server quoted the key; the detail shows a placeholder');
    assertNoSecret(r, KEYS.wrong);
    assert.equal((await c.detect()).loggedIn, true, 'a stored key counts as present even when the server rejects it');
  }
});

test('complete: 400 quoting the key is scrubbed; reverse: the unscrubbed detail would be caught', async () => {
  const r = await anthropic('echo-key').complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.match(r.detail, /bad request for key <key>/);
  assertNoSecret(r, GOOD_KEY);
  const leaky = { ok: false, code: 'unknown', detail: `bad request for key ${GOOD_KEY}` };
  assert.throws(() => assertNoSecret(leaky, GOOD_KEY), /secret leaked/, 'the sentinel bites on a deliberately leaky result');
  assert.equal(scrub(leaky.detail, GOOD_KEY), 'bad request for key <key>');
  assert.equal(scrub('abc', 'abc'), 'abc', 'secrets shorter than 4 chars are left alone');
});

test('complete: the key is scrubbed on every path — 200 JSON, refusal text, HTML body, 502 text past the clip, thrown fetch error', async () => {
  const okEcho = await anthropic('echo-key-ok').complete({ prompt: 'x', format: 'json' });
  assert.equal(okEcho.ok, true);
  assert.equal(okEcho.json.note, 'your key is <key>');
  assert.match(okEcho.text, /<key>/);
  assertNoSecret(okEcho, GOOD_KEY);

  const refused = await openai('refuse-key').complete({ prompt: 'x', format: 'json' });
  assert.equal(refused.code, 'refused');
  assert.equal(refused.text, 'I will not, <key>');
  assertNoSecret(refused, GOOD_KEY);

  const html = await anthropic('html-key').complete({ prompt: 'x', format: 'json' });
  assert.equal(html.code, 'bad-format');
  assert.match(html.detail, /gateway page for <key>/);
  assertNoSecret(html, GOOD_KEY);

  const boom = await openai('boom-key').complete({ prompt: 'x', format: 'json' });
  assert.equal(boom.code, 'network');
  assert.match(boom.detail, /^HTTP 502: x+<key>/);
  assert.ok(!boom.detail.includes(GOOD_KEY.slice(0, 8)), 'no key prefix survives at the clip edge');
  assertNoSecret(boom, GOOD_KEY);

  const thrower = createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'anthropic', baseUrl: api.baseUrl, keyRef: 'good' } }, { getKey, fetchImpl: async (url, init) => { throw new Error(`proxy rejected header ${init.headers['x-api-key']}`); } });
  const net = await thrower.complete({ prompt: 'x', format: 'json' });
  assert.equal(net.code, 'network');
  assert.equal(net.detail, 'proxy rejected header <key>');
  assertNoSecret(net, GOOD_KEY);
});

test('complete: status alone decides 404 -> bad-model and 429 -> rate-limited (bodies without wording)', async () => {
  for (const make of [anthropic, openai]) {
    const nf = await make('nope-bare').complete({ prompt: 'x', format: 'json' });
    assert.equal(nf.code, 'bad-model', nf.detail);
    const rl = await make('busy-bare').complete({ prompt: 'x', format: 'json' });
    assert.equal(rl.code, 'rate-limited', rl.detail);
  }
  assert.equal(codeFromHttp(404, { message: '' }), 'bad-model');
  assert.equal(codeFromHttp(429, { message: '' }), 'rate-limited');
});

test('complete: custom vendor without a model fails locally as bad-model with calls 0; missing key also calls 0', async () => {
  const before = api.requests.length;
  const noModel = createApiConnector({ kind: 'api', api: { vendor: 'custom', baseUrl: `${api.baseUrl}/v1`, keyRef: 'good' } }, { getKey });
  const r = await noModel.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'bad-model');
  assert.deepEqual(r.usage, { calls: 0 });
  const noKey = createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'custom', baseUrl: `${api.baseUrl}/v1`, keyRef: 'missing' } }, { getKey });
  assert.deepEqual((await noKey.complete({ prompt: 'x', format: 'json' })).usage, { calls: 0 });
  assert.equal(api.requests.length, before, 'nothing was sent');
  const sent = await openai('any').complete({ prompt: 'x', format: 'json' });
  assert.equal(sent.usage.calls, 1, 'a request that left counts 1');
});

test('complete: 404 -> bad-model, 429 -> rate-limited, 500 -> network (both styles)', async () => {
  for (const make of [anthropic, openai]) {
    assert.equal((await make('nope').complete({ prompt: 'x', format: 'json' })).code, 'bad-model');
    assert.equal((await make('busy').complete({ prompt: 'x', format: 'json' })).code, 'rate-limited');
    assert.equal((await make('boom').complete({ prompt: 'x', format: 'json' })).code, 'network');
  }
});

test('complete: refusal -> refused (both styles)', async () => {
  for (const make of [anthropic, openai]) {
    const r = await make('refuse').complete({ prompt: 'x', format: 'json' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'refused');
    assert.equal(r.usage.calls, 1);
  }
});

test('complete: timeout and unreachable host', async () => {
  const slow = await anthropic('slow', { timeoutMs: 80 }).complete({ prompt: 'x', format: 'json' });
  assert.equal(slow.ok, false);
  assert.equal(slow.code, 'timeout');
  const dead = createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'custom', baseUrl: 'http://127.0.0.1:9/v1', keyRef: 'good' } }, { getKey, timeoutMs: 5000 });
  const r = await dead.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'network');
  assertNoSecret(r, GOOD_KEY);
});

test('key handling: missing key -> bad-key before any request; getKey may be async; key never read from env', async () => {
  const before = api.requests.length;
  const none = createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'anthropic', baseUrl: api.baseUrl, keyRef: 'missing' } }, { getKey });
  const r = await none.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.code, 'bad-key');
  assert.deepEqual(await none.detect(), { installed: true, loggedIn: false, vendor: 'anthropic', code: 'bad-key', detail: 'no key stored for this connection' });
  const noGetKey = createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'anthropic', baseUrl: api.baseUrl, keyRef: 'good' } }, {});
  assert.equal((await noGetKey.complete({ prompt: 'x', format: 'json' })).code, 'bad-key');
  assert.equal(api.requests.length, before, 'no request was sent without a key');
  process.env.ANTHROPIC_API_KEY = GOOD_KEY;
  try {
    assert.equal((await noGetKey.complete({ prompt: 'x', format: 'json' })).code, 'bad-key', 'an env var is not a key source');
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
  const asyncKey = createApiConnector({ kind: 'api', model: 'm', api: { vendor: 'anthropic', baseUrl: api.baseUrl, keyRef: 'good' } }, { getKey: async () => GOOD_KEY });
  assert.equal((await asyncKey.complete({ prompt: 'x', format: 'json' })).ok, true);
});

test('model slots: verify falls back to main; vendor default when none configured', async () => {
  const c = createConnector({ kind: 'api', model: 'main-m', verifyModel: 'verify-m', api: { vendor: 'custom', baseUrl: `${api.baseUrl}/v1`, keyRef: 'good' } }, { getKey });
  await c.complete({ prompt: 'x', format: 'json', model: 'verify' });
  assert.equal(api.requests.at(-1).body.model, 'verify-m');
  await c.complete({ prompt: 'x', format: 'json', model: 'typed-by-hand' });
  assert.equal(api.requests.at(-1).body.model, 'typed-by-hand');
  const d = createConnector({ kind: 'api', api: { vendor: 'anthropic', baseUrl: api.baseUrl, keyRef: 'good' } }, { getKey });
  await d.complete({ prompt: 'x', format: 'json', model: 'verify' });
  assert.equal(api.requests.at(-1).body.model, 'claude-opus-5-5');
  assert.equal(d.resolveModel('verify'), 'claude-opus-5-5');
});

test('probe sends the fixed prompt and reports latency', async () => {
  const p = await anthropic('claude-opus-5-5').probe();
  assert.equal(p.ok, true);
  assert.equal(typeof p.latencyMs, 'number');
  assert.equal(api.requests.at(-1).body.messages[0].content, 'Reply with exactly this JSON and nothing else: {"ok":true}');
});

test('codeFromHttp / parseSuccess edge cases', () => {
  assert.equal(codeFromHttp(400, { message: 'The model `x` does not exist' }), 'bad-model');
  assert.equal(codeFromHttp(400, { message: 'bad json' }), 'unknown');
  assert.equal(codeFromHttp(403, { message: '' }), 'bad-key');
  assert.equal(codeFromHttp(503, { message: 'overloaded' }), 'network');
  assert.deepEqual(parseSuccess('openai', { choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, finish_reason: 'stop' }] }), { text: 'ab', usage: { inputTokens: 0, outputTokens: 0 }, stop: 'stop', model: undefined });
  assert.deepEqual(parseSuccess('anthropic', { content: [], usage: {} }).text, '');
});

test('sentinel: a good key on the happy path must not be reported as bad-key', async () => {
  const r = await anthropic('claude-opus-5-5').complete({ prompt: 'x', format: 'json' });
  assert.notEqual(r.code, 'bad-key');
  assert.equal(r.ok, true);
});
