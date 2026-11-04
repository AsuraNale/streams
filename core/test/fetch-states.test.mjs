import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FETCH_STATES, LOG_STATES, HINTS, classifyHttp, classifyError, hintOf, parseRetryAfter } from '../src/fetch/states.mjs';

test('five states in a fixed order, each with its hint code; paused is a log value, not a fetch state', () => {
  assert.deepEqual(FETCH_STATES, ['ok', 'empty', 'gap', 'failed', 'blocked']);
  assert.deepEqual(LOG_STATES, ['ok', 'empty', 'gap', 'failed', 'blocked', 'paused']);
  assert.deepEqual(HINTS, {
    ok: 'none', empty: 'none', gap: 'fix-address-or-remove', failed: 'retry-next-round', blocked: 'blocked-remove-source', paused: 'none',
  });
  for (const s of LOG_STATES) assert.equal(hintOf(s), HINTS[s]);
  // negative: the three bad states each get a DIFFERENT hint (merging two hands the user an action that cannot work)
  assert.notEqual(hintOf('gap'), hintOf('failed'));
  assert.notEqual(hintOf('failed'), hintOf('blocked'));
  assert.notEqual(hintOf('gap'), hintOf('blocked'));
  for (const bad of ['pending', 'OK', '', undefined, null, 'toString']) {
    assert.throws(() => hintOf(bad), (e) => e.code === 'bad-state', String(bad));
  }
});

// 对照 test_pipeline.py::test_status_classification（HTTP 码部分）：404 gap / 403 blocked / 407 blocked /
// 503 failed / 429 failed / 408 failed；再加方案 1.3 的 410 gap、451 blocked。
test('classifyHttp: the status table', () => {
  const table = [
    [200, 'ok'], [201, 'ok'], [204, 'ok'],
    [301, 'gap'], [302, 'gap'],
    [400, 'gap'], [401, 'gap'], [404, 'gap'], [410, 'gap'], [422, 'gap'],
    [403, 'blocked'], [407, 'blocked'], [451, 'blocked'],
    [408, 'failed'], [429, 'failed'],
    [500, 'failed'], [502, 'failed'], [503, 'failed'], [504, 'failed'],
    [101, 'failed'],
  ];
  for (const [code, want] of table) {
    const r = classifyHttp(code);
    assert.equal(r.state, want, `HTTP ${code}`);
    assert.equal(r.http, code);
    assert.match(r.message, new RegExp(`^HTTP ${code}`));
    assert.equal('retryAfterSeconds' in r, false, 'no Retry-After header -> no retryAfterSeconds key');
  }
  // negative: a 2xx is never one of the three bad states, a 4xx is never ok
  assert.equal(['gap', 'failed', 'blocked'].includes(classifyHttp(200).state), false);
  assert.notEqual(classifyHttp(404).state, 'ok');
  assert.notEqual(classifyHttp(404).state, 'empty', '404 is "did not fetch", never "no new content"');
});

test('classifyHttp: Retry-After as seconds or HTTP-date, string or Headers, ignored when unparseable', () => {
  const r = classifyHttp(503, { 'Retry-After': '120' });
  assert.equal(r.state, 'failed');
  assert.equal(r.retryAfterSeconds, 120);
  assert.match(r.message, /Retry-After: 120s/);
  const now = () => new Date('2026-11-02T12:00:00Z');
  assert.equal(classifyHttp(429, { 'retry-after': 'Mon, 02 Nov 2026 12:01:30 GMT' }, { now }).retryAfterSeconds, 90);
  assert.equal(classifyHttp(429, { 'retry-after': 'Mon, 02 Nov 2026 11:00:00 GMT' }, { now }).retryAfterSeconds, 0, 'a date in the past clamps to 0, never negative');
  assert.equal(classifyHttp(429, new Headers({ 'Retry-After': '7' })).retryAfterSeconds, 7);
  assert.equal(classifyHttp(503, { 'retry-after': 'soon' }).retryAfterSeconds, undefined);
  assert.equal(classifyHttp(503, { 'retry-after': '' }).retryAfterSeconds, undefined);
  assert.equal(parseRetryAfter(undefined), undefined);
  assert.equal(parseRetryAfter('12'), 12);
  assert.equal(parseRetryAfter('-5'), undefined, 'negative seconds are not a number of seconds');
  // the header does not change the state: a 200 with Retry-After is still ok, a 403 still blocked
  assert.equal(classifyHttp(200, { 'retry-after': '5' }).state, 'ok');
  assert.equal(classifyHttp(403, { 'retry-after': '5' }).state, 'blocked');
});

test('sentinel: classifyHttp refuses values that are not HTTP statuses', () => {
  for (const bad of [undefined, null, 'ok', '', 99, 600, 2.5, NaN, -200]) {
    assert.throws(() => classifyHttp(bad), (e) => e.code === 'bad-status', String(bad));
  }
});

// 对照 test_pipeline.py::test_status_classification（连接层部分）：隧道拒绝 / host_not_allowed /
// WinError 10013 -> blocked；普通 Permission denied 仍是 failed（不过度匹配）；超时 -> failed。
test('classifyError: refusals below HTTP are blocked, timeouts and network errors failed, bad urls gap', () => {
  const E = (message, extra = {}) => Object.assign(new Error(message), extra);
  const wrap = (cause) => Object.assign(new TypeError('fetch failed'), { cause });
  const cases = [
    [E('Tunnel connection failed: 403 Forbidden'), 'blocked'],
    [wrap(E('host_not_allowed')), 'blocked'],
    [wrap(E('Proxy Authentication Required', { code: 'UND_ERR_PROXY' })), 'blocked'],
    [wrap(E('connect EACCES 1.2.3.4:443', { code: 'EACCES' })), 'blocked'],
    [wrap(new Error()), 'blocked'],                       // what undici throws for a 407: bare cause, no message, no code
    [wrap(E('', { code: 'ECONNRESET' })), 'failed'],      // a coded cause with an empty message is a network error, not the 407 shape
    [Object.assign(new TypeError('fetch failed'), {}), 'failed'], // no cause at all: unknown -> failed
    [E('[WinError 10013] An attempt was made to access a socket in a way forbidden by its access permissions'), 'blocked'],
    [E('EACCES: permission denied, open x', { code: 'EACCES' }), 'failed'],
    [E('[Errno 13] Permission denied'), 'failed'],
    [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), 'failed'],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'failed'],
    [wrap(E('Connect Timeout Error', { code: 'UND_ERR_CONNECT_TIMEOUT' })), 'failed'],
    [wrap(E('connect ECONNREFUSED 127.0.0.1:1', { code: 'ECONNREFUSED' })), 'failed'],
    [wrap(E('getaddrinfo ENOTFOUND nope.invalid', { code: 'ENOTFOUND' })), 'failed'],
    [wrap(E('read ECONNRESET', { code: 'ECONNRESET' })), 'failed'],
    [E('not a URL: ftp://x', { code: 'bad-url' }), 'gap'],
    [Object.assign(new TypeError('Invalid URL'), { code: 'ERR_INVALID_URL' }), 'gap'],
    [wrap(Object.assign(new TypeError('Invalid URL'), { code: 'ERR_INVALID_URL' })), 'gap'],
    ['a string, not an Error', 'failed'],
    [undefined, 'failed'],
    [null, 'failed'],
  ];
  for (const [err, want] of cases) {
    const r = classifyError(err);
    assert.equal(r.state, want, String(err?.message ?? err));
    assert.equal(['gap', 'failed', 'blocked'].includes(r.state), true, 'an error is never ok / empty');
    assert.equal(typeof r.message, 'string');
  }
  assert.match(classifyError(wrap(E('connect ECONNREFUSED 127.0.0.1:1', { code: 'ECONNREFUSED' }))).message, /ECONNREFUSED/, 'the cause survives into the message');
  // a self-referencing cause chain must not loop forever
  const loop = new Error('loop');
  loop.cause = loop;
  assert.equal(classifyError(loop).state, 'failed');
});

test('classifyError: Node\'s own proxy refusal (AbortError "Proxy response (403|407) !== 200 when HTTP Tunneling") is blocked; a proxy 5xx stays failed', () => {
  const nodeProxy = (status) => {
    const inner = new Error(`Proxy response (${status}) !== 200 when HTTP Tunneling`);
    inner.name = 'AbortError';
    inner.code = 'UND_ERR_ABORTED';
    const outer = new TypeError('fetch failed');
    outer.cause = inner;
    return outer;
  };
  assert.equal(classifyError(nodeProxy(403)).state, 'blocked');
  assert.equal(classifyError(nodeProxy(407)).state, 'blocked');
  // reverse: the proxy failing for now is not a refusal, and a plain abort is still a timeout
  assert.equal(classifyError(nodeProxy(502)).state, 'failed');
  const abort = new Error('This operation was aborted');
  abort.name = 'AbortError';
  assert.equal(classifyError(abort).state, 'failed');
});
