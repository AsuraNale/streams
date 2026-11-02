import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnector, checkConnection } from '../src/connect/connector.mjs';
import { findExecutable } from '../src/connect/which.mjs';
import { createWorkdir, removeWorkdir, withWorkdir } from '../src/connect/workdir.mjs';
import { escapeForCmd, spawnPlan, runProcess } from '../src/connect/process.mjs';
import { failure, scrub, clip } from '../src/connect/types.mjs';
import { finishText } from '../src/connect/command.mjs';
import * as surface from '../src/connect/index.mjs';
import { caseDir } from './support/tmp.mjs';

test('createConnector dispatches on kind and attaches resolveModel / models', () => {
  const cc = createConnector({ kind: 'claude-code', model: 'claude-opus-5-5' });
  assert.equal(cc.kind, 'claude-code');
  assert.equal(cc.resolveModel('verify'), 'claude-opus-5-5');
  assert.equal(cc.models()[0].id, 'claude-fable-5-1');
  const cx = createConnector({ kind: 'codex' });
  assert.equal(cx.kind, 'codex');
  assert.equal(cx.models()[0].id, 'gpt-6.1-sol');
  const api = createConnector({ kind: 'api', api: { vendor: 'deepseek', keyRef: 'k1' } }, { getKey: () => 'x' });
  assert.equal(api.kind, 'api');
  assert.equal(api.resolveModel(), 'deepseek-chat');
  assert.deepEqual(api.models().map((m) => m.id), ['deepseek-chat']);
  for (const c of [cc, cx, api]) for (const fn of ['detect', 'probe', 'complete', 'models', 'resolveModel']) assert.equal(typeof c[fn], 'function', fn);
});

test('checkConnection refuses bad shapes, and a key stored on the connection', () => {
  const bad = [
    [null, /object/],
    [{ kind: 'ollama' }, /unknown connection kind/],
    [{ kind: 'claude-code', model: 5 }, /"model" must be a string/],
    [{ kind: 'api' }, /needs "api"/],
    [{ kind: 'api', api: { vendor: 'nope', keyRef: 'k' } }, /unknown vendor/],
    [{ kind: 'api', api: { vendor: 'custom', keyRef: 'k' } }, /needs "baseUrl"/],
    [{ kind: 'api', api: { vendor: 'openai' } }, /needs "keyRef"/],
    [{ kind: 'api', api: { vendor: 'openai', keyRef: 'k', key: 'sk-live-oops' } }, /never be stored/],
  ];
  for (const [conn, re] of bad) {
    assert.throws(() => createConnector(conn), (e) => e.code === 'bad-connection' && re.test(e.message), JSON.stringify(conn));
  }
  assert.equal(checkConnection({ kind: 'api', api: { vendor: 'custom', baseUrl: 'http://x/v1', keyRef: 'k' } }).kind, 'api');
});

test('findExecutable: PATH lookup with PATHEXT on Windows, explicit paths, misses', () => {
  const dir = caseDir('which');
  writeFileSync(join(dir, 'tool.exe'), '');
  writeFileSync(join(dir, 'plain'), '');
  const win = { env: { PATH: dir, PATHEXT: '.EXE;.CMD' }, platform: 'win32' };
  assert.equal(findExecutable('tool', win), join(dir, 'tool.exe'));
  assert.equal(findExecutable('tool.exe', win), join(dir, 'tool.exe'));
  assert.equal(findExecutable('missing', win), null);
  assert.equal(findExecutable(join(dir, 'tool'), win), join(dir, 'tool.exe'));
  assert.equal(findExecutable(join(dir, 'nothere'), win), null);
  const posix = { env: { PATH: dir }, platform: 'linux' };
  assert.equal(findExecutable('plain', posix), join(dir, 'plain'));
  assert.equal(findExecutable('tool', posix), null, 'no PATHEXT magic outside Windows');
  assert.equal(findExecutable('', win), null);
  assert.equal(findExecutable('tool', { env: { PATH: '' }, platform: 'win32' }), null);
});

test('findExecutable on Windows: npm sh shim next to codex.cmd must lose; a bare file alone is not an executable', () => {
  const dir = caseDir('which-shim');
  writeFileSync(join(dir, 'codex'), '#!/bin/sh\nexec node codex.js "$@"\n');
  writeFileSync(join(dir, 'codex.cmd'), '@echo off\r\nnode codex.js %*\r\n');
  const win = { env: { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' }, platform: 'win32' };
  assert.equal(findExecutable('codex', win), join(dir, 'codex.cmd'), 'reverse of the old behaviour, which picked the bare shim first');
  const bareOnly = caseDir('which-bare');
  writeFileSync(join(bareOnly, 'codex'), '#!/bin/sh\n');
  assert.equal(findExecutable('codex', { env: { PATH: bareOnly, PATHEXT: '.EXE;.CMD' }, platform: 'win32' }), null);
  assert.equal(findExecutable('codex', { env: { PATH: bareOnly }, platform: 'linux' }), join(bareOnly, 'codex'), 'posix still takes the bare file');
  writeFileSync(join(dir, 'codex.exe'), '');
  assert.equal(findExecutable('codex', { env: { PATH: dir, PATHEXT: '.EXE;.CMD' }, platform: 'win32' }), join(dir, 'codex.exe'), 'PATHEXT order: .EXE before .CMD');
  assert.equal(findExecutable('codex', { env: { PATH: dir, PATHEXT: '.CMD;.EXE' }, platform: 'win32' }), join(dir, 'codex.cmd'), 'PATHEXT order: .CMD before .EXE');
});

test('workdir: fresh, empty, random, removed; withWorkdir removes even when fn throws', async () => {
  const root = caseDir('workdir');
  const a = createWorkdir(root);
  const b = createWorkdir(root);
  assert.notEqual(a.root, b.root);
  assert.ok(a.cwd.startsWith(a.root));
  assert.deepEqual(readdirSync(a.cwd), []);
  removeWorkdir(a.root);
  removeWorkdir(b.root);
  assert.deepEqual(readdirSync(root), []);
  let seen;
  await assert.rejects(() => withWorkdir(root, async (d) => { seen = d; throw new Error('boom'); }), /boom/);
  assert.equal(existsSync(seen.root), false);
  const v = await withWorkdir(root, async (d) => { assert.deepEqual(readdirSync(d.cwd), []); return 42; });
  assert.equal(v, 42);
});

test('process: cmd.exe escaping and the spawn plan for .cmd shims', () => {
  // cross-spawn's form: CRT quoting, then every cmd metacharacter (the wrapping quotes included) behind ^
  assert.equal(escapeForCmd('plain'), '^"plain^"');
  assert.equal(escapeForCmd('with space'), '^"with^ space^"');
  assert.equal(escapeForCmd('say "hi"'), '^"say^ \\^"hi\\^"^"');
  assert.equal(escapeForCmd('a&b|c'), '^"a^&b^|c^"');
  assert.equal(escapeForCmd('line1\nline2'), '^"line1^ line2^"', 'newlines become spaces on the shim route');
  assert.equal(escapeForCmd('trail\\'), '^"trail\\\\^"');
  const exe = spawnPlan('C:\\x\\claude.exe', ['-p', ''], 'win32');
  assert.deepEqual(exe, { file: 'C:\\x\\claude.exe', args: ['-p', ''], windowsVerbatimArguments: false });
  const shim = spawnPlan('C:\\x\\codex.cmd', ['exec', '--json'], 'win32');
  assert.ok(/cmd(\.exe)?$/i.test(shim.file));
  assert.deepEqual(shim.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(shim.args[3], '"' + ['C:\\x\\codex.cmd', 'exec', '--json'].map(escapeForCmd).join(' ') + '"');
  assert.equal(shim.windowsVerbatimArguments, true);
  assert.equal(spawnPlan('/usr/bin/codex.cmd', ['x'], 'linux').file, '/usr/bin/codex.cmd', 'only Windows has shims');
});

test('process: a real node child — stdin delivered, stdout collected, exit code, timeout kill', async () => {
  const echo = ['-e', 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write("got:"+s);process.exit(3)})'];
  const r = await runProcess({ file: process.execPath, args: echo, input: 'hello', timeoutMs: 20000 });
  assert.equal(r.stdout, 'got:hello');
  assert.equal(r.status, 3);
  assert.equal(r.timedOut, false);
  const slow = await runProcess({ file: process.execPath, args: ['-e', 'setTimeout(()=>{}, 10000)'], timeoutMs: 100 });
  assert.equal(slow.timedOut, true);
  const missing = await runProcess({ file: join(caseDir('proc-missing'), 'nope.exe'), args: [] });
  assert.ok(missing.spawnError, 'spawn error reported, not thrown');
});

test('types: failure shape, scrub, clip', () => {
  assert.deepEqual(failure('timeout', 'x'), { ok: false, code: 'timeout', detail: 'x', usage: { calls: 1 } });
  assert.throws(() => failure('made-up', 'x'), (e) => e.code === 'bad-error-code');
  assert.equal(scrub('key=sk-abcdef; again sk-abcdef', 'sk-abcdef'), 'key=<key>; again <key>');
  assert.equal(scrub('nothing', ['sk-abcdef', 'zz']), 'nothing');
  assert.equal(scrub(undefined, 'sk-abcdef'), '');
  assert.equal(clip('abc', 2), 'ab…');
  assert.equal(clip('abc', 3), 'abc');
});

test('finishText scrubs secrets out of text and json; without secrets it does not (the parameter is load-bearing)', () => {
  const key = 'sk-unit-key-1234567890';
  const withSecrets = finishText({ text: `{"ok":true,"note":"key ${key}"}`, usage: {}, model: 'm', secrets: [key] });
  assert.equal(withSecrets.ok, true);
  assert.equal(withSecrets.json.note, 'key <key>');
  assert.ok(!JSON.stringify(withSecrets).includes(key));
  const without = finishText({ text: `{"ok":true,"note":"key ${key}"}`, usage: {}, model: 'm' });
  assert.ok(JSON.stringify(without).includes(key), 'reverse: no secrets given, nothing scrubbed');
  const bad = finishText({ text: `prose with ${key}`, usage: {}, model: 'm', secrets: [key] });
  assert.equal(bad.code, 'bad-format');
  assert.equal(bad.text, 'prose with <key>');
});

test('index.mjs exports the documented surface', () => {
  for (const name of ['createConnector', 'completeJson', 'fakeConnector', 'createUsageCounter', 'readUsage', 'extractJson', 'resolveModel', 'VENDORS', 'CLAUDE_CODE_MODELS', 'CODEX_MODELS', 'ERROR_CODES', 'CONNECTION_KINDS', 'claudeArgv', 'codexArgv', 'buildRequest', 'scrub']) {
    assert.ok(name in surface, name);
  }
});

test('sentinel: an api connection with a vendor the table does not know must not be created', () => {
  let made = null;
  try { made = createConnector({ kind: 'api', api: { vendor: 'groq', keyRef: 'k' } }); } catch { /* expected */ }
  assert.equal(made, null);
});
