// connector.openLogin(): start the unmodified CLI's own sign-in in a window of its own (spec 4.6
// amendment, 2026-11-02). Streams never pipes, reads or stores anything of that process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnector } from '../src/connect/connector.mjs';
import { createClaudeCodeConnector, CLAUDE_LOGIN_ARGS } from '../src/connect/claude-code.mjs';
import { createCodexConnector, CODEX_LOGIN_ARGS } from '../src/connect/codex.mjs';
import { launchDetached, launchPlan, LAUNCH_STDIO } from '../src/connect/process.mjs';
import { ERROR_CODES, assertCode } from '../src/connect/types.mjs';
import { fakeSpawn, enoent } from './support/fake-spawn.mjs';
import { caseDir } from './support/tmp.mjs';

const WIN = { PATHEXT: '.EXE;.CMD' };

function fakePath(name, exe) {
  const dir = caseDir(`login-path-${name}`);
  const file = join(dir, exe);
  writeFileSync(file, '');
  return { env: { PATH: dir, Path: dir, ...WIN }, file };
}

function codexSpawn(script) {
  return fakeSpawn((call) => (call.args[0] === '--version' ? { stdout: 'codex-cli 0.160.1\n' } : script ? script(call) : {}));
}

test('every connector kind has openLogin; the api kind answers not-applicable without starting anything', async () => {
  const spawnImpl = fakeSpawn(() => { throw new Error('must not spawn'); });
  const api = createConnector({ kind: 'api', api: { vendor: 'deepseek', keyRef: 'k1' } }, { getKey: () => 'x', spawnImpl });
  const r = await api.openLogin();
  assert.deepEqual(r, { ok: false, code: 'not-applicable', detail: 'an API connection uses a key, not a login' });
  assert.equal(spawnImpl.calls.length, 0);
  assert.ok(ERROR_CODES.includes('not-applicable'));
  assert.equal(assertCode('not-applicable'), 'not-applicable');
  for (const kind of ['claude-code', 'codex']) assert.equal(typeof createConnector({ kind }).openLogin, 'function', kind);
});

test('claude-code: exactly `claude auth login`, in its own window via cmd.exe start on win32, detached, nothing piped', async () => {
  assert.deepEqual(CLAUDE_LOGIN_ARGS, ['auth', 'login']);
  const { env, file } = fakePath('claude-win', 'claude.exe');
  const spawnImpl = fakeSpawn({});
  const c = createClaudeCodeConnector({ kind: 'claude-code' }, { spawnImpl, env, platform: 'win32' });
  const r = await c.openLogin({ title: 'Streams' });
  assert.equal(r.ok, true);
  assert.equal(typeof r.pid, 'number');
  assert.deepEqual(r.command, [file, 'auth', 'login']);
  assert.equal(spawnImpl.calls.length, 1);
  const call = spawnImpl.calls[0];
  assert.match(call.file, /cmd(\.exe)?$/i);
  assert.deepEqual(call.args.slice(0, 3), ['/d', '/s', '/c']);
  const line = call.args[3];
  assert.match(line, /^"start /);
  assert.ok(line.includes('Streams'), 'the window title');
  assert.ok(line.includes(file.replace(/\\/g, '\\')), 'the located claude');
  assert.match(line, /auth\^" \^"login\^""$/, 'auth login are the last two words');
  assert.ok(!/--console|--email|--sso|-p\b|--output-format/.test(line), 'no flag of ours');
  assert.equal(call.opts.detached, true);
  assert.equal(call.opts.windowsHide, false);
  assert.equal(call.opts.windowsVerbatimArguments, true);
  assert.deepEqual(call.opts.stdio, ['ignore', 'ignore', 'ignore']);
  assert.equal(call.unref, true, 'the child is let go of');
  assert.equal(call.input, '', 'nothing written to it');
  const text = JSON.stringify(r);
  for (const word of ['stdout', 'stderr', 'token', 'key']) assert.ok(!text.includes(word), word);
});

test('claude-code: off win32 the file itself is started with [auth, login]', async () => {
  const { env, file } = fakePath('claude-posix', 'claude');
  const spawnImpl = fakeSpawn({});
  const c = createClaudeCodeConnector({ kind: 'claude-code' }, { spawnImpl, env, platform: 'linux' });
  const r = await c.openLogin();
  assert.equal(r.ok, true);
  assert.equal(spawnImpl.calls[0].file, file);
  assert.deepEqual(spawnImpl.calls[0].args, ['auth', 'login']);
  assert.deepEqual(spawnImpl.calls[0].opts.stdio, ['ignore', 'ignore', 'ignore']);
});

test('codex: exactly `codex login` with the binary chooseCodex picked (desktop-app fallback when PATH has none)', async () => {
  assert.deepEqual(CODEX_LOGIN_ARGS, ['login']);
  const local = caseDir('login-codex-localappdata');
  const binDir = join(local, 'OpenAI', 'Codex', 'bin', 'abc123');
  mkdirSync(binDir, { recursive: true });
  const exe = join(binDir, 'codex.exe');
  writeFileSync(exe, '');
  const empty = caseDir('login-codex-empty-path');
  const spawnImpl = codexSpawn();
  const c = createCodexConnector({ kind: 'codex' }, { spawnImpl, env: { PATH: empty, Path: empty, LOCALAPPDATA: local, USERPROFILE: caseDir('login-codex-home'), ...WIN }, platform: 'win32' });
  const r = await c.openLogin({ title: 'Streams' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.command, [exe, 'login']);
  const last = spawnImpl.calls[spawnImpl.calls.length - 1];
  assert.match(last.file, /cmd(\.exe)?$/i);
  const line = last.args[3];
  assert.ok(line.includes(exe), 'the desktop app binary');
  assert.match(line, /\^"login\^""$/);
  assert.ok(!/with-api-key|with-access-token|device-auth/.test(line));
  assert.deepEqual(last.opts.stdio, ['ignore', 'ignore', 'ignore']);
  assert.equal(last.opts.detached, true);
  // the version calls before it were the normal detect-style probes, never a login
  for (const call of spawnImpl.calls.slice(0, -1)) assert.equal(call.args[0], '--version');
});

test('codex: off win32 the chosen file is started with [login]', async () => {
  const { env, file } = fakePath('codex-posix', 'codex');
  const spawnImpl = codexSpawn();
  const c = createCodexConnector({ kind: 'codex' }, { spawnImpl, env, platform: 'linux' });
  const r = await c.openLogin();
  assert.equal(r.ok, true);
  const last = spawnImpl.calls[spawnImpl.calls.length - 1];
  assert.equal(last.file, file);
  assert.deepEqual(last.args, ['login']);
});

test('not installed: no executable -> not-installed and no spawn at all', async () => {
  const empty = caseDir('login-none-path');
  const env = { PATH: empty, Path: empty, LOCALAPPDATA: caseDir('login-none-local'), USERPROFILE: caseDir('login-none-home'), ...WIN };
  const spawnImpl = fakeSpawn({});
  const cc = createClaudeCodeConnector({ kind: 'claude-code' }, { spawnImpl, env, platform: 'win32' });
  const cx = createCodexConnector({ kind: 'codex' }, { spawnImpl, env, platform: 'win32' });
  for (const c of [cc, cx]) {
    const r = await c.openLogin();
    assert.equal(r.ok, false);
    assert.equal(r.code, 'not-installed');
  }
  assert.equal(spawnImpl.calls.length, 0);
});

test('not installed: a spawn error (ENOENT) from the launcher maps to not-installed', async () => {
  const { env, file } = fakePath('claude-enoent', 'claude');
  const spawnImpl = fakeSpawn({ error: enoent(file) });
  const c = createClaudeCodeConnector({ kind: 'claude-code' }, { spawnImpl, env, platform: 'linux' });
  const r = await c.openLogin();
  assert.deepEqual(Object.keys(r).sort(), ['code', 'detail', 'ok']);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not-installed');
});

test('launchDetached with the real spawn: a program that is not there is ENOENT; a real one starts and is let go of', async () => {
  const gone = await launchDetached({ file: join(caseDir('login-real-gone'), 'none.exe'), args: ['login'], platform: 'linux' });
  assert.equal(gone.ok, false);
  assert.equal(gone.spawnError.code, 'ENOENT');
  const t0 = Date.now();
  // node itself, sleeping longer than this test: the launcher must not wait for it
  const r = await launchDetached({ file: process.execPath, args: ['-e', 'setTimeout(() => {}, 3000)'], platform: 'linux' });
  assert.equal(r.ok, true);
  assert.equal(typeof r.pid, 'number');
  assert.ok(Date.now() - t0 < 2500, 'returned without waiting for the child');
  assert.deepEqual(r.plan.args, ['-e', 'setTimeout(() => {}, 3000)']);
});

test('launchPlan: win32 goes through start with the title first; stdio is all ignore by definition', () => {
  const p = launchPlan('C:\\Tools\\claude.exe', ['auth', 'login'], { title: 'Streams', platform: 'win32' });
  assert.match(p.file, /cmd(\.exe)?$/i);
  assert.equal(p.args[3], '"start ^"Streams^" ^"C:\\Tools\\claude.exe^" ^"auth^" ^"login^""');
  assert.equal(p.windowsVerbatimArguments, true);
  const q = launchPlan('/usr/bin/codex', ['login'], { platform: 'linux' });
  assert.deepEqual(q, { file: '/usr/bin/codex', args: ['login'], windowsVerbatimArguments: false });
  assert.deepEqual([...LAUNCH_STDIO], ['ignore', 'ignore', 'ignore']);
  assert.ok(Object.isFrozen(LAUNCH_STDIO));
});

test('the connection layer never reads a credential store or passes a credential to a login', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../src/connect/', import.meta.url);
  const bad = [];
  for (const name of readdirSync(dir)) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    for (const re of [/\.credentials/, /auth\.json/, /with-api-key/, /with-access-token/, /device-auth\b(?!.*never)/]) {
      for (const [i, line] of text.split('\n').entries()) {
        if (re.test(line) && !/^\s*\/\//.test(line)) bad.push(`${name}:${i + 1}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
