// v2 package M (docs/checks/2026-11-10-wp-m/contract.md M1–M3; docs/core-api.md 5.16): the plan's quota and the API balance.
//   M1 Claude Code: the rate_limit_event of a stream-json stdout → quota (an event / none / a broken one / several: the last);
//      the call's result is v1.0's exactly when there is none; the session mode carries it too; deps.onQuota is told.
//   M2 Codex: `codex app-server` on a stand-in (test/support/fake-app-server.mjs): only initialize, initialized,
//      account/rateLimits/read are sent (reverse: a copy of the core that sends a fourth is caught); a normal answer, none, a
//      wrong one, a server that ends, one that cannot start; no account id, credits or reset vouchers in what comes back.
//   M3 API: DeepSeek's and Moonshot's documented balance answers on a local server (127.0.0.1 only); every other vendor
//      not-applicable without a request; the key only in the header, never in what comes back.
// Each check first shows the input that makes it fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { spawn as nodeSpawn } from 'node:child_process';
import { createClaudeCodeConnector, parseClaudeOutput } from '../src/connect/claude-code.mjs';
import { createSessionConnector } from '../src/connect/session.mjs';
import { quotaFromClaudeStream, quotaFromCodexRateLimits, checkQuota, BALANCE_VENDORS } from '../src/connect/quota.mjs';
import { readCodexQuota, CODEX_QUOTA_METHODS, CODEX_QUOTA_ARGS } from '../src/connect/codex-quota.mjs';
import { readApiBalance } from '../src/connect/balance.mjs';
import { VENDOR_IDS } from '../src/connect/models.mjs';
import { fakeSpawn } from './support/fake-spawn.mjs';
import { caseDir } from './support/tmp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'src');
const FAKE_SERVER = join(HERE, 'support', 'fake-app-server.mjs');
const NOW = () => new Date('2026-11-10T15:00:00.000Z');

// ---- M1 · Claude Code ------------------------------------------------------------------------------------------------
const RATE = (five, seven, extra = {}) => ({
  type: 'rate_limit_event',
  rate_limit_info: { status: 'allowed', resetsAt: 1794339000, rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false, ...extra, unifiedWindows: { five_hour: { utilization: five, resetsAt: 1794339000 }, seven_day: { utilization: seven, resetsAt: 1794603600 } } },
});
const RESULT = { type: 'result', subtype: 'success', is_error: false, num_turns: 1, result: '{"ok":true}', session_id: '11111111-2222-3333-4444-555555555555', usage: { input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 5 }, total_cost_usd: 0.0012, modelUsage: { 'claude-opus-5-5': {} } };
const stream = (...lines) => lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n';
const INIT = { type: 'system', subtype: 'init', session_id: RESULT.session_id, tools: [] };
const ASSISTANT = { type: 'assistant', message: { content: [{ type: 'text', text: '{"ok":true}' }] } };
const WINDOWS_11_10 = [{ id: 'five_hour', usedPercent: 5, resetsAt: 1794339000 }, { id: 'seven_day', usedPercent: 11, resetsAt: 1794603600 }];

test('M1 · an event: the two windows as percentages, resetsAt as given, nothing else of rate_limit_info', () => {
  const q = quotaFromClaudeStream(stream(INIT, ASSISTANT, RATE(0.05, 0.11, { overageResetsAt: 1, surpassedThreshold: 0.9 }), RESULT), NOW);
  assert.deepEqual(q, { source: 'claude-code', at: '2026-11-10T15:00:00.000Z', windows: WINDOWS_11_10 });
  // the allowlist: no status, overage or any other key got through
  assert.deepEqual(Object.keys(q.windows[0]).sort(), ['id', 'resetsAt', 'usedPercent']);
});

test('M1 · no event, or a broken one: no quota, and the call\'s answer is v1.0\'s exactly (no `quota` key)', async () => {
  // reverse first: the same stream with the event does carry it (the absence below is not a parser that never finds one)
  assert.ok(parseClaudeOutput({ stdout: stream(INIT, RATE(0.05, 0.11), RESULT), stderr: '', status: 0 }).quota);
  const none = parseClaudeOutput({ stdout: stream(INIT, ASSISTANT, RESULT), stderr: '', status: 0 });
  assert.equal(Object.hasOwn(none, 'quota'), false);
  assert.deepEqual(none, { ok: true, text: '{"ok":true}', usage: { inputTokens: 15, outputTokens: 5, costUsd: 0.0012 }, model: 'claude-opus-5-5' });
  const broken = [
    { ...RATE(0.05, 0.11), rate_limit_info: { unifiedWindows: { five_hour: { utilization: '5%', resetsAt: 1794339000 } } } },
    { ...RATE(0.05, 0.11), rate_limit_info: { unifiedWindows: { five_hour: { utilization: 5, resetsAt: 1794339000 } } } }, // > 1: not a fraction
    { ...RATE(0.05, 0.11), rate_limit_info: { unifiedWindows: { seven_day: { utilization: 0.1, resetsAt: 'tomorrow' } } } },
    { ...RATE(0.05, 0.11), rate_limit_info: { unifiedWindows: [] } },
    { ...RATE(0.05, 0.11), rate_limit_info: { unifiedWindows: { other_window: { utilization: 0.1, resetsAt: 1794339000 } } } },
    { type: 'rate_limit_event' },
    '{"type":"rate_limit_event","rate_limit_info":{',
  ];
  for (const b of broken) {
    const p = parseClaudeOutput({ stdout: stream(INIT, b, RESULT), stderr: '', status: 0 });
    assert.equal(p.ok, true, JSON.stringify(b));
    assert.equal(Object.hasOwn(p, 'quota'), false, `no quota from ${JSON.stringify(b)}`);
  }
});

test('M1 · several events: the last well-formed one', () => {
  const q = quotaFromClaudeStream(stream(INIT, RATE(0.01, 0.02), ASSISTANT, RATE(0.05, 0.11), RESULT));
  assert.deepEqual(q.windows, WINDOWS_11_10);
  // reverse: had the first been taken, the numbers would be 1 and 2
  assert.notDeepEqual(quotaFromClaudeStream(stream(RATE(0.01, 0.02))).windows, WINDOWS_11_10);
  // a broken one after a good one does not erase it
  assert.deepEqual(quotaFromClaudeStream(stream(RATE(0.05, 0.11), { type: 'rate_limit_event', rate_limit_info: {} }, RESULT)).windows, WINDOWS_11_10);
});

test('M1 · the envelope is the stream\'s last result line: failures read as before (login expired in a stream, exit 1)', () => {
  const expired = { ...RESULT, is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' };
  const p = parseClaudeOutput({ stdout: stream(INIT, expired), stderr: '', status: 1 });
  assert.equal(p.ok, false);
  assert.equal(p.code, 'login-expired');
  // an assistant line mentioning "result" before the real result does not pass for the envelope
  const tricky = { type: 'assistant', message: { content: [{ type: 'text', text: '"result": "nope"' }] }, result: 'not me' };
  assert.equal(parseClaudeOutput({ stdout: stream(INIT, tricky, RESULT), stderr: '', status: 0 }).text, '{"ok":true}');
});

function fakePath(name) {
  const dir = caseDir(`quota-path-${name}`);
  writeFileSync(join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude'), '');
  return { PATH: dir, Path: dir, PATHEXT: '.EXE;.CMD' };
}

test('M1 · complete() and the session mode carry the quota and tell deps.onQuota; without an event neither does', async () => {
  const told = [];
  const deps = (name, stdout) => ({ spawnImpl: fakeSpawn({ stdout }), env: fakePath(name), tmpRoot: caseDir(`quota-tmp-${name}`), now: NOW, onQuota: (q) => told.push(q) });
  const c = createClaudeCodeConnector({ kind: 'claude-code' }, deps('with', stream(INIT, RATE(0.05, 0.11), RESULT)));
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.quota.windows, WINDOWS_11_10);
  assert.equal(told.length, 1);
  const c2 = createClaudeCodeConnector({ kind: 'claude-code' }, deps('without', stream(INIT, RESULT)));
  const r2 = await c2.complete({ prompt: 'x', format: 'json' });
  assert.equal(Object.hasOwn(r2, 'quota'), false);
  assert.deepEqual(r2, { ok: true, json: { ok: true }, text: '{"ok":true}', usage: { calls: 1, inputTokens: 15, outputTokens: 5, costUsd: 0.0012 }, model: 'claude-opus-5-5' });
  assert.equal(told.length, 1, 'nothing told without an event');
  // a failing onQuota never fails the call
  const c3 = createClaudeCodeConnector({ kind: 'claude-code' }, { ...deps('throws', stream(RATE(0.05, 0.11), RESULT)), onQuota: () => { throw new Error('boom'); } });
  assert.equal((await c3.complete({ prompt: 'x', format: 'json' })).ok, true);
  // the main agent's session
  const cwd = caseDir('quota-session-cwd');
  const s = createSessionConnector({ kind: 'claude-code' }, deps('session', stream(INIT, RATE(0.05, 0.11), RESULT)), { cwd });
  const t = await s.send({ prompt: 'hi', format: 'json' });
  assert.equal(t.ok, true);
  assert.equal(t.sessionId, RESULT.session_id, 'the session id from the stream\'s result line');
  assert.deepEqual(t.quota.windows, WINDOWS_11_10);
  assert.equal(told.length, 2);
});

// ---- M2 · Codex ------------------------------------------------------------------------------------------------------
const serverConn = { kind: 'codex', command: [process.execPath, FAKE_SERVER] };
// What the reader writes is taken at the pipe (every stdin.write of the real child), not from the server's log: a line written
// after the answer it waits for may never be read by a server that is ended at once — the check is on what was *sent*.
async function runServer(name, mode, { core = { readCodexQuota }, timeoutMs } = {}) {
  const logFile = join(caseDir(`codex-quota-log-${name}`), 'log.jsonl');
  const tmpRoot = caseDir(`codex-quota-tmp-${name}`);
  const written = [];
  const spawnImpl = (file, argv, opts) => {
    const child = nodeSpawn(file, argv, opts);
    const write = child.stdin.write.bind(child.stdin);
    child.stdin.write = (chunk, ...rest) => { written.push(String(chunk)); return write(chunk, ...rest); };
    return child;
  };
  const r = await core.readCodexQuota(serverConn, { tmpRoot, spawnImpl, env: { ...process.env, FAKE_APP_SERVER_MODE: mode, FAKE_APP_SERVER_LOG: logFile }, now: NOW, ...(timeoutMs ? { quotaTimeoutMs: timeoutMs } : {}) });
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const sent = written.join('').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  return { r, log, received: sent, serverGot: log.filter((l) => l.received).map((l) => l.received), start: log.find((l) => l.start), tmpRoot };
}
/** What is wrong with the messages a server received ([] = exactly the three, in order, nothing else). */
function sentProblems(received) {
  const methods = received.map((m) => m.method);
  const problems = [];
  for (const m of methods) if (!CODEX_QUOTA_METHODS.includes(m)) problems.push(`sent ${m}`);
  if (JSON.stringify(methods) !== JSON.stringify(CODEX_QUOTA_METHODS)) problems.push(`sent ${JSON.stringify(methods)}`);
  return problems;
}

test('M2 · the predicate on what was sent: a fourth method, a missing one, the wrong order are each reported', () => {
  const ok = CODEX_QUOTA_METHODS.map((method) => ({ method }));
  assert.deepEqual(sentProblems(ok), []);
  assert.notDeepEqual(sentProblems([...ok, { method: 'account/rateLimitResetCredit/use' }]), []);
  assert.notDeepEqual(sentProblems([...ok, { method: 'thread/start' }]), []);
  assert.notDeepEqual(sentProblems(ok.slice(0, 2)), []);
  assert.notDeepEqual(sentProblems([ok[1], ok[0], ok[2]]), []);
});

test('M2 · a normal answer: the window and the plan, nothing of the account; only the three methods sent; empty folder, removed', async () => {
  const { r, received, serverGot, start, tmpRoot } = await runServer('ok', 'ok');
  assert.deepEqual(sentProblems(serverGot), [], 'and the server got exactly those three');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.quota, { source: 'codex', at: '2026-11-10T15:00:00.000Z', plan: 'prolite', windows: [{ id: 'primary', usedPercent: 28, windowMins: 10080, resetsAt: 1794417106 }] });
  const text = JSON.stringify(r);
  for (const word of ['acct-', 'accountId', 'credits', 'Credit', 'balance', 'limitId']) assert.ok(!text.includes(word), `${word} not copied`);
  assert.deepEqual(sentProblems(received), []);
  assert.deepEqual(received[0].params, { clientInfo: { name: 'streams', version: '2' } });
  assert.deepEqual(start.argv, [...CODEX_QUOTA_ARGS]);
  assert.deepEqual(start.entries, [], 'the app-server ran in an empty folder');
  assert.ok(start.cwd.startsWith(tmpRoot + sep), `${start.cwd} under ${tmpRoot}`);
  assert.deepEqual(readdirSync(tmpRoot), [], 'the folder is removed afterwards');
});

test('M2 reverse (a copy of the core sending a fourth method): the check of what was sent is red', async () => {
  const copy = caseDir('codex-quota-mutant');
  cpSync(SRC, copy, { recursive: true });
  const file = join(copy, 'connect', 'codex-quota.mjs');
  const before = readFileSync(file, 'utf8');
  const from = "        ctl.send(message(CODEX_QUOTA_METHODS[2], 2));";
  assert.ok(before.includes(from), 'control: the line to change is there');
  writeFileSync(file, before.replace(from, `${from}\n        ctl.send(JSON.stringify({ id: 3, method: 'account/rateLimitResetCredit/use' }));`));
  const mutant = await import(pathToFileURL(file).href);
  const { received } = await runServer('mutant', 'ok', { core: mutant });
  assert.ok(received.some((m) => m.method === 'account/rateLimitResetCredit/use'), 'control: the copy did send it');
  assert.notDeepEqual(sentProblems(received), []);
});

test('M2 · no answer (10 s limit, shortened here), a wrong answer, an error, a server that ends, one that cannot start: no quota', async () => {
  const silent = await runServer('silent', 'silent', { timeoutMs: 800 });
  assert.equal(silent.r.ok, false);
  assert.equal(silent.r.code, 'timeout');
  assert.deepEqual(silent.received.map((m) => m.method), ['initialize'], 'nothing more is sent without an answer');
  assert.deepEqual(readdirSync(silent.tmpRoot), [], 'the folder is removed after a timeout too');
  for (const mode of ['bad', 'error', 'exit']) {
    const { r, received } = await runServer(mode, mode);
    assert.equal(r.ok, false, mode);
    assert.equal(r.code, 'bad-format', `${mode}: ${JSON.stringify(r)}`);
    assert.equal(Object.hasOwn(r, 'quota'), false);
    assert.deepEqual(sentProblems(received).filter((p) => p.startsWith('sent ') && !p.startsWith('sent [')), [], `${mode}: no other method`);
  }
  const missing = await readCodexQuota({ kind: 'codex', command: 'no-such-codex-streams-xyz' }, { env: { PATH: caseDir('codex-quota-nopath'), PATHEXT: '.EXE' } });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'not-installed');
});

test('M2 · quotaFromCodexRateLimits: an allowlist; broken windows give nothing', () => {
  const good = { rateLimits: { primary: { usedPercent: 28, windowDurationMins: 10080, resetsAt: 1794417106 }, secondary: { usedPercent: 3, windowDurationMins: 300, resetsAt: 1794339000 }, planType: 'plus' } };
  assert.equal(quotaFromCodexRateLimits(good).windows.length, 2);
  for (const bad of [null, {}, { rateLimits: null }, { rateLimits: { primary: null, secondary: null } }, { rateLimits: { primary: { usedPercent: 140, windowDurationMins: 300, resetsAt: 1 } } }, { rateLimits: { primary: { usedPercent: 3, resetsAt: 1 } } }]) {
    assert.equal(quotaFromCodexRateLimits(bad), null, JSON.stringify(bad));
  }
});

// ---- M3 · API balances -----------------------------------------------------------------------------------------------
const KEY = 'sk-balance-test-key-0123456789';
async function balanceServer(answers) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    const a = answers[req.url] ?? { status: 404, body: { error: 'no route' } };
    if (a.hang) return;
    res.writeHead(a.status ?? 200, { 'content-type': 'application/json' });
    res.end(typeof a.body === 'string' ? a.body : JSON.stringify(a.body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, seen, close: () => new Promise((r) => server.close(r)) };
}
const apiConn = (vendor, baseUrl) => ({ kind: 'api', api: { vendor, keyRef: `key-${vendor}`, ...(baseUrl ? { baseUrl } : {}) } });

test('M3 · DeepSeek GET /user/balance and Moonshot GET /v1/users/me/balance (the documented answers), Bearer key, 127.0.0.1 only', async (t) => {
  const srv = await balanceServer({
    '/user/balance': { body: { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }] } },
    '/v1/users/me/balance': { body: { code: 0, data: { available_balance: 49.58894, voucher_balance: 46.58893, cash_balance: 3.00001 }, scode: '0x0', status: true } },
  });
  t.after(() => srv.close());
  const getKey = (ref) => (ref === 'key-deepseek' || ref === 'key-moonshot' ? KEY : null);
  const ds = await readApiBalance(apiConn('deepseek', `${srv.base}/v1`), { getKey, now: NOW });
  assert.deepEqual(ds, { ok: true, quota: { source: 'api', at: '2026-11-10T15:00:00.000Z', vendor: 'deepseek', balance: [{ currency: 'CNY', amount: 110 }], available: true } });
  const ms = await readApiBalance(apiConn('moonshot', `${srv.base}/v1`), { getKey, now: NOW });
  assert.deepEqual(ms.quota.balance, [{ currency: 'CNY', amount: 49.58894 }]);
  assert.deepEqual(srv.seen.map((s) => [s.method, s.url, s.auth]), [['GET', '/user/balance', `Bearer ${KEY}`], ['GET', '/v1/users/me/balance', `Bearer ${KEY}`]]);
  for (const s of srv.seen) assert.ok(srv.base.startsWith('http://127.0.0.1:'), s.url);
  assert.ok(!JSON.stringify([ds, ms]).includes(KEY), 'the key is in no answer');
});

test('M3 · reverse and the rest: other shapes, 401 quoting the key, no key, a vendor without an endpoint (no request at all)', async (t) => {
  const srv = await balanceServer({
    '/user/balance': { body: { balance_infos: [{ currency: 'CNY', total_balance: 'lots' }] } },
    '/v1/users/me/balance': { status: 401, body: { error: { message: `bad key ${KEY}` } } },
  });
  t.after(() => srv.close());
  const getKey = () => KEY;
  const bad = await readApiBalance(apiConn('deepseek', `${srv.base}/v1`), { getKey });
  assert.equal(bad.code, 'bad-format');
  const denied = await readApiBalance(apiConn('moonshot', `${srv.base}/v1`), { getKey });
  assert.equal(denied.code, 'bad-key');
  assert.ok(!JSON.stringify(denied).includes(KEY));
  const noKey = await readApiBalance(apiConn('deepseek', `${srv.base}/v1`), { getKey: () => null });
  assert.equal(noKey.code, 'bad-key');
  const before = srv.seen.length;
  for (const vendor of VENDOR_IDS.filter((v) => !BALANCE_VENDORS.includes(v))) {
    const r = await readApiBalance(apiConn(vendor, `${srv.base}/v1`), { getKey, fetchImpl: () => { throw new Error(`fetched for ${vendor}`); } });
    assert.equal(r.code, 'not-applicable', vendor);
  }
  assert.equal(srv.seen.length, before, 'no request for a vendor without an endpoint');
  assert.deepEqual([...BALANCE_VENDORS].sort(), ['deepseek', 'moonshot']);
});

test('checkQuota: the desktop\'s second allowlist (a development file or a stand-in goes through it)', () => {
  assert.deepEqual(checkQuota({ source: 'claude-code', at: '2026-11-10T15:00:00.000Z', windows: WINDOWS_11_10, accountId: 'x' }), { source: 'claude-code', at: '2026-11-10T15:00:00.000Z', windows: WINDOWS_11_10 });
  for (const bad of [null, { source: 'x' }, { source: 'claude-code', at: 'soon', windows: WINDOWS_11_10 }, { source: 'claude-code', at: '2026-11-10T15:00:00.000Z', windows: [{ id: 'primary', usedPercent: 1, resetsAt: 1 }] }, { source: 'api', at: '2026-11-10T15:00:00.000Z', vendor: 'deepseek', balance: [{ currency: 'cny', amount: 1 }] }]) {
    assert.equal(checkQuota(bad), null, JSON.stringify(bad));
  }
});
