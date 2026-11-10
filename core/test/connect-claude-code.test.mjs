import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeCodeConnector, claudeArgv, parseClaudeOutput, codeFromText, CLAUDE_FIXED_ARGS } from '../src/connect/claude-code.mjs';
import { createConnector } from '../src/connect/connector.mjs';
import { fakeSpawn, enoent } from './support/fake-spawn.mjs';
import { caseDir } from './support/tmp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const FAKE_CLI = join(HERE, 'support', 'fake-cli.mjs');

// A PATH that holds a fake `claude` so findExecutable succeeds without the real tool.
function fakePath(name) {
  const dir = caseDir(`claude-path-${name}`);
  const file = process.platform === 'win32' ? join(dir, 'claude.exe') : join(dir, 'claude');
  writeFileSync(file, '');
  return { PATH: dir, PATHEXT: '.EXE;.CMD', Path: dir };
}

// Verbatim stdout of `claude -p --output-format json` on this machine when the CLI is not signed in
// (2026-11-02, Claude Code 2.1.287; exit code 1; stderr empty).
const REAL_LOGIN_EXPIRED_STDOUT = JSON.stringify({
  duration_api_ms: 0, stop_reason: 'stop_sequence', session_id: '00000000-0000-0000-0000-000000000000', total_cost_usd: 0,
  usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 },
  modelUsage: {}, permission_denials: [], terminal_reason: 'api_error', is_error: true, num_turns: 1, subtype: 'success',
  api_error_status: null, result: 'Failed to authenticate: OAuth session expired and could not be refreshed', type: 'result',
  duration_ms: 155, uuid: '00000000-0000-0000-0000-000000000000', queued_turn_count: 0, result_index: 0,
}) + '\n';

function envelope(result, extra = {}) {
  return JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, num_turns: 1, result,
    usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 7 },
    total_cost_usd: 0.0042, modelUsage: { 'claude-opus-5-5': { inputTokens: 150, outputTokens: 7 } }, ...extra,
  }) + '\n';
}

function connector(script, { connection = {}, deps = {} } = {}) {
  const spawnImpl = fakeSpawn(script);
  const c = createClaudeCodeConnector({ kind: 'claude-code', ...connection }, { spawnImpl, env: fakePath(deps.name || 'default'), tmpRoot: caseDir(`claude-tmp-${deps.name || 'default'}`), ...deps });
  return { c, spawnImpl };
}

// The isolation predicate the argv tests and the reverse tests share.
function isIsolated(argv) {
  const toolsAt = argv.indexOf('--tools');
  return argv.includes('-p') && toolsAt >= 0 && argv[toolsAt + 1] === '' && argv.includes('--safe-mode') && argv.includes('--restricted')
    && argv.includes('--strict-mcp-config') && argv.includes('--no-session-persistence') && argv.includes('--disable-slash-commands')
    // v2 package M: stream-json + --verbose (was json)
    && argv[argv.indexOf('--output-format') + 1] === 'stream-json' && argv.includes('--verbose') && argv[argv.indexOf('--permission-prompts') + 1] === 'none';
}

// v2 package M: v1.0's fixed argv as it was before the package (git show HEAD~:core/src/connect/claude-code.mjs)
const V1_FIXED_ARGS = ['-p', '--output-format', 'json', '--safe-mode', '--restricted', '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--permission-prompts', 'none'];
/** v1.0's argv with only the output format swapped: what package M may change and nothing more. */
const swapFormat = (argv) => { const i = argv.indexOf('json'); return [...argv.slice(0, i), 'stream-json', '--verbose', ...argv.slice(i + 1)]; };

test('v2 package M: the fixed argv is v1.0\'s with only `json` → `stream-json --verbose`; reverse: a dropped or added flag is not', () => {
  assert.deepEqual(CLAUDE_FIXED_ARGS, swapFormat(V1_FIXED_ARGS));
  // reverse: the same comparison catches one flag less and one flag more
  assert.notDeepEqual(CLAUDE_FIXED_ARGS.filter((a) => a !== '--restricted'), swapFormat(V1_FIXED_ARGS));
  assert.notDeepEqual([...CLAUDE_FIXED_ARGS, '--include-partial-messages'], swapFormat(V1_FIXED_ARGS));
  assert.equal(isIsolated(V1_FIXED_ARGS), false, 'the old json argv no longer counts: the predicate can fail');
});

test('claudeArgv: no tools, no settings, single JSON result; model and system only when given', () => {
  const base = claudeArgv();
  assert.deepEqual(base, CLAUDE_FIXED_ARGS);
  assert.ok(isIsolated(base));
  assert.ok(!base.includes('--model'));
  assert.ok(!base.includes('--system-prompt'));
  const full = claudeArgv({ model: 'claude-haiku-5-5', system: 'JSON only' });
  assert.deepEqual(full.slice(-4), ['--model', 'claude-haiku-5-5', '--system-prompt', 'JSON only']);
  assert.ok(isIsolated(full));
});

test('reverse: dropping any isolation flag turns the predicate red', () => {
  const base = claudeArgv();
  for (const flag of ['--tools', '--safe-mode', '--restricted', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '-p']) {
    const i = base.indexOf(flag);
    const mutated = flag === '--tools' ? [...base.slice(0, i), ...base.slice(i + 2)] : [...base.slice(0, i), ...base.slice(i + 1)];
    assert.equal(isIsolated(mutated), false, `without ${flag}`);
  }
  const toolsDefault = base.map((a, i) => (base[i - 1] === '--tools' ? 'default' : a));
  assert.equal(isIsolated(toolsDefault), false, '--tools default is not isolated');
});

test('complete: success — JSON parsed, usage and cost carried, model from modelUsage; prompt on stdin, not argv', async () => {
  const { c, spawnImpl } = connector({ stdout: envelope('{"score":0.8,"reason":"direct"}') }, { connection: { model: 'claude-opus-5-5' }, deps: { name: 'ok' } });
  const r = await c.complete({ system: 'Score it.', prompt: 'ARTICLE TEXT with "quotes" and 中文', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.json, { score: 0.8, reason: 'direct' });
  assert.deepEqual(r.usage, { calls: 1, inputTokens: 150, outputTokens: 7, costUsd: 0.0042 });
  assert.equal(r.model, 'claude-opus-5-5');
  assert.equal(spawnImpl.calls.length, 1);
  const call = spawnImpl.calls[0];
  assert.ok(isIsolated(call.args), call.args.join(' '));
  assert.ok(call.args.includes('claude-opus-5-5'));
  assert.equal(call.args[call.args.indexOf('--system-prompt') + 1], 'Score it.');
  assert.equal(call.input, 'ARTICLE TEXT with "quotes" and 中文');
  assert.ok(!call.args.some((a) => a.includes('ARTICLE TEXT')), 'prompt must not be on argv');
  assert.ok(call.file.toLowerCase().includes('claude'));
});

test('complete: cwd is a fresh empty folder outside the repo, gone afterwards', async () => {
  let seen;
  const { c } = connector({
    stdout: envelope('{"ok":true}'),
    onSpawn: (call) => { seen = { cwd: call.opts.cwd, exists: existsSync(call.opts.cwd), entries: existsSync(call.opts.cwd) ? readdirSync(call.opts.cwd) : null }; },
  }, { deps: { name: 'cwd' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, true);
  assert.ok(seen && seen.exists, 'cwd existed at spawn time');
  assert.deepEqual(seen.entries, [], 'cwd was empty');
  assert.ok(!seen.cwd.startsWith(REPO + sep), 'cwd is not inside the repository');
  assert.ok(seen.cwd.includes(`claude-tmp-cwd${sep}`), 'cwd is under the injected tmpRoot');
  assert.equal(existsSync(seen.cwd), false, 'cwd removed after the call');
  assert.equal(existsSync(dirname(seen.cwd)), false, 'its parent removed too');
});

test('complete: model slots — verify falls back to main; "default" when no model at all', async () => {
  const { c, spawnImpl } = connector({ stdout: envelope('{"ok":true}', { modelUsage: {} }) }, { connection: { model: 'claude-opus-5-5', verifyModel: 'claude-haiku-5-5' }, deps: { name: 'slots' } });
  await c.complete({ prompt: 'x', format: 'json', model: 'verify' });
  assert.equal(spawnImpl.calls[0].args[spawnImpl.calls[0].args.indexOf('--model') + 1], 'claude-haiku-5-5');
  await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(spawnImpl.calls[1].args[spawnImpl.calls[1].args.indexOf('--model') + 1], 'claude-opus-5-5');
  const { c: c2, spawnImpl: s2 } = connector({ stdout: envelope('{"ok":true}', { modelUsage: {} }) }, { deps: { name: 'nomodel' } });
  const r = await c2.complete({ prompt: 'x', format: 'json', model: 'verify' });
  assert.ok(!s2.calls[0].args.includes('--model'), 'no model configured -> no --model flag');
  assert.equal(r.model, 'default');
});

test('complete: bad format — prose answer comes back as bad-format with the text', async () => {
  const { c } = connector({ stdout: envelope('Sure! I would rate this about 0.8 out of 1.') }, { deps: { name: 'badfmt' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'bad-format');
  assert.match(r.text, /rate this/);
  assert.equal(r.usage.calls, 1);
});

test('complete: the real signed-out stdout maps to login-expired (exit 1, stderr empty)', async () => {
  const { c } = connector({ stdout: REAL_LOGIN_EXPIRED_STDOUT, stderr: '', status: 1 }, { deps: { name: 'expired' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'login-expired');
  assert.match(r.detail, /OAuth session expired/);
  assert.equal(r.usage.calls, 1);
  const p = await c.probe();
  assert.equal(p.ok, false);
  assert.equal(p.code, 'login-expired');
  assert.equal(typeof p.latencyMs, 'number');
});

test('complete: is_error:true with exit code 0 is still a failure (the envelope decides, not the exit code)', async () => {
  const { c } = connector({ stdout: envelope('API Error: 429 rate limit exceeded', { is_error: true }), status: 0 }, { deps: { name: 'iserror0' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'rate-limited');
  assert.equal(r.usage.calls, 1);
  const parsed = parseClaudeOutput({ stdout: envelope('Failed to authenticate: no credentials', { is_error: true }), stderr: '', status: 0 });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, 'not-logged-in');
});

test('complete: failures before any model call carry usage.calls 0', async () => {
  const spawnImpl = fakeSpawn({ stdout: envelope('{"ok":true}') });
  const c = createClaudeCodeConnector({ kind: 'claude-code', command: 'no-such-cli-streams-xyz' }, { spawnImpl, env: { PATH: caseDir('claude-calls0'), PATHEXT: '.EXE' } });
  assert.deepEqual((await c.complete({ prompt: 'x', format: 'json' })).usage, { calls: 0 });
  const { c: c2 } = connector({ error: enoent('claude') }, { deps: { name: 'calls0-enoent' } });
  assert.deepEqual((await c2.complete({ prompt: 'x', format: 'json' })).usage, { calls: 0 });
  const { c: c3 } = connector({ stdout: REAL_LOGIN_EXPIRED_STDOUT, status: 1 }, { deps: { name: 'calls1-expired' } });
  assert.equal((await c3.complete({ prompt: 'x', format: 'json' })).usage.calls, 1, 'a call that reached the tool counts 1');
});

test('codeFromText: the wording decides the code (reverse: a different sentence gives a different code)', () => {
  assert.equal(codeFromText('Failed to authenticate: OAuth session expired and could not be refreshed'), 'login-expired');
  assert.equal(codeFromText('Failed to authenticate: no credentials found'), 'not-logged-in');
  assert.equal(codeFromText('Not logged in. Please run /login'), 'not-logged-in');
  assert.equal(codeFromText('API Error: 429 rate limit exceeded'), 'rate-limited');
  assert.equal(codeFromText('model: claude-nope-9 not found'), 'bad-model');
  assert.equal(codeFromText('fetch failed: ECONNREFUSED'), 'network');
  assert.equal(codeFromText('something else entirely'), 'unknown');
});

test('parseClaudeOutput: envelope after a warning line; refusal; non-JSON stdout', () => {
  const r = parseClaudeOutput({ stdout: '[claude-code:unrecognized_model] {"model":"x"}\n' + envelope('{"ok":true}'), stderr: '', status: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.text, '{"ok":true}');
  const refused = parseClaudeOutput({ stdout: envelope('', { stop_reason: 'refusal' }), stderr: '', status: 0 });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'refused');
  const junk = parseClaudeOutput({ stdout: 'not json at all', stderr: '', status: 0 });
  assert.equal(junk.ok, false);
  assert.equal(junk.code, 'bad-format');
  const crash = parseClaudeOutput({ stdout: '', stderr: 'TypeError: boom', status: 1 });
  assert.equal(crash.ok, false);
  assert.equal(crash.code, 'unknown');
  assert.match(crash.detail, /boom/);
});

test('not installed: unknown command name -> detect installed:false and complete not-installed without spawning', async () => {
  const spawnImpl = fakeSpawn({ stdout: envelope('{"ok":true}') });
  const c = createClaudeCodeConnector({ kind: 'claude-code', command: 'no-such-cli-streams-xyz' }, { spawnImpl, env: { PATH: caseDir('claude-nopath'), PATHEXT: '.EXE' } });
  assert.deepEqual(await c.detect(), { installed: false, loggedIn: null, code: 'not-installed', detail: 'claude not found on PATH' });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.code, 'not-installed');
  assert.equal(spawnImpl.calls.length, 0);
});

test('not installed: spawn ENOENT maps to not-installed too', async () => {
  const { c } = connector({ error: enoent('claude') }, { deps: { name: 'enoent' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not-installed');
  const d = await c.detect();
  assert.equal(d.installed, false);
  assert.equal(d.code, 'not-installed');
});

test('timeout: a child that never answers is killed and reported as timeout', async () => {
  const { c, spawnImpl } = connector({ stdout: envelope('{"ok":true}'), delayMs: 2000 }, { deps: { name: 'timeout', timeoutMs: 60 } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'timeout');
  assert.equal(spawnImpl.calls[0].killed, true);
});

test('detect: --version then auth status --json; signed-out status gives loggedIn:false', async () => {
  const { c, spawnImpl } = connector((call) => (call.args.includes('--version')
    ? { stdout: '2.1.287 (Claude Code)\n' }
    : { stdout: JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' }), status: 1 }), { deps: { name: 'detect' } });
  const d = await c.detect();
  assert.deepEqual(d, { installed: true, loggedIn: false, version: '2.1.287', code: 'not-logged-in', detail: 'authMethod=none' });
  assert.deepEqual(spawnImpl.calls.map((x) => x.args), [['--version'], ['auth', 'status', '--json']]);
  const { c: c2 } = connector((call) => (call.args.includes('--version') ? { stdout: '2.1.287 (Claude Code)\n' } : { stdout: '{"loggedIn":true,"authMethod":"claude.ai"}' }), { deps: { name: 'detect-in' } });
  assert.deepEqual(await c2.detect(), { installed: true, loggedIn: true, version: '2.1.287', detail: 'authMethod=claude.ai' });
});

test('real subprocess (fake-cli): the child really runs in an empty temp folder with the isolation argv', async () => {
  const tmpRoot = caseDir('claude-real-tmp');
  const c = createConnector({ kind: 'claude-code', model: 'claude-opus-5-5', command: [process.execPath, FAKE_CLI] }, { tmpRoot, timeoutMs: 20000 });
  const d = await c.detect();
  assert.equal(d.installed, true);
  assert.equal(d.loggedIn, true);
  assert.equal(d.version, '9.9.9');
  const r = await c.complete({ system: 'sys', prompt: 'hello 中文 "q"', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.json.ok, true);
  assert.ok(r.json.cwd.startsWith(tmpRoot + sep), `${r.json.cwd} under ${tmpRoot}`);
  assert.deepEqual(r.json.entries, [], 'the child saw an empty folder');
  assert.equal(r.json.prompt, 'hello 中文 "q"');
  assert.ok(isIsolated(r.json.argv));
  assert.equal(r.json.argv[r.json.argv.indexOf('--system-prompt') + 1], 'sys');
  assert.equal(existsSync(r.json.cwd), false, 'folder removed after the call');
  assert.deepEqual(readdirSync(tmpRoot), [], 'nothing left under tmpRoot');
  assert.deepEqual(r.usage, { calls: 1, inputTokens: 15, outputTokens: 5, costUsd: 0.0012 });
  assert.equal(r.model, 'fake-model');
  // v2 package M: the fake CLI's stream carries the rate_limit_event of 11-10
  assert.deepEqual(r.quota?.windows, [{ id: 'five_hour', usedPercent: 5, resetsAt: 1794339000 }, { id: 'seven_day', usedPercent: 11, resetsAt: 1794603600 }]);
  const p = await c.probe();
  assert.equal(p.ok, true);
});

test('real subprocess (fake-cli): exit 1 with the signed-out envelope -> login-expired', async () => {
  const c = createConnector({ kind: 'claude-code', command: [process.execPath, FAKE_CLI] }, { tmpRoot: caseDir('claude-real-expired'), timeoutMs: 20000, env: { ...process.env, FAKE_CLI_EXIT: '1', FAKE_CLI_STDOUT: REAL_LOGIN_EXPIRED_STDOUT } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'login-expired');
});

test('bad requests are refused before anything is spawned', async () => {
  const { c, spawnImpl } = connector({ stdout: envelope('{"ok":true}') }, { deps: { name: 'badreq' } });
  await assert.rejects(() => c.complete({ format: 'json' }), (e) => e.code === 'bad-request');
  await assert.rejects(() => c.complete({ prompt: 'x', format: 'xml' }), (e) => e.code === 'bad-request');
  await assert.rejects(() => c.complete({ prompt: 'x', model: '' }), (e) => e.code === 'bad-request');
  assert.equal(spawnImpl.calls.length, 0);
});

test('sentinel: a success envelope must never be reported as login-expired', async () => {
  const { c } = connector({ stdout: envelope('{"ok":true}') }, { deps: { name: 'sentinel' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.notEqual(r.code, 'login-expired');
  assert.equal(r.ok, true);
  // and the tmp root is clean (no leaked work folders)
  mkdirSync(caseDir('claude-tmp-sentinel'), { recursive: true });
  assert.deepEqual(readdirSync(caseDir('claude-tmp-sentinel')), []);
  rmSync(caseDir('claude-tmp-sentinel'), { recursive: true, force: true });
});
