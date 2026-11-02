import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodexConnector, codexArgv, parseCodexEvents, codeFromText, codexCandidates, chooseCodex, desktopAppCodex, compareVersions, CODEX_FIXED_ARGS, CODEX_LAST_MESSAGE_FILE } from '../src/connect/codex.mjs';
import { createConnector } from '../src/connect/connector.mjs';
import { runProcess } from '../src/connect/process.mjs';
import { fakeSpawn, enoent } from './support/fake-spawn.mjs';
import { caseDir } from './support/tmp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const FAKE_CLI = join(HERE, 'support', 'fake-cli.mjs');
const EXE = process.platform === 'win32' ? 'codex.exe' : 'codex';
const WIN = { PATHEXT: '.EXE;.CMD' };

function fakePath(name) {
  const dir = caseDir(`codex-path-${name}`);
  writeFileSync(join(dir, EXE), '');
  return { PATH: dir, Path: dir, ...WIN };
}

function events(text, { usage = { input_tokens: 40, cached_input_tokens: 10, output_tokens: 9 }, extra = [] } = {}) {
  const list = [
    { type: 'thread.started', thread_id: 't1' },
    { type: 'turn.started' },
    ...(text === undefined ? [] : [{ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text } }]),
    ...extra,
    ...(usage ? [{ type: 'turn.completed', usage }] : []),
  ];
  return list.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

// Every codex connector first asks `--version` (to pick the best candidate); this helper answers that
// and hands everything else to `script`. `exec` returns the exec call (the one the assertions care about).
function connector(script, { connection = {}, deps = {} } = {}) {
  const spawnImpl = fakeSpawn((call) => (call.args[0] === '--version' ? { stdout: 'codex-cli 0.160.1\n' } : typeof script === 'function' ? script(call) : script));
  const name = deps.name || 'default';
  const c = createCodexConnector({ kind: 'codex', ...connection }, { spawnImpl, env: fakePath(name), tmpRoot: caseDir(`codex-tmp-${name}`), ...deps });
  const exec = () => spawnImpl.calls.find((x) => x.args[0] === 'exec');
  return { c, spawnImpl, exec };
}

function isSandboxed(argv) {
  return argv[0] === 'exec' && argv.includes('--json') && argv[argv.indexOf('--sandbox') + 1] === 'read-only'
    && argv.includes('--ephemeral') && argv.includes('--skip-git-repo-check')
    && argv.includes('--ignore-user-config') && argv.includes('--ignore-rules') && argv[argv.length - 1] === '-';
}

test('codexArgv: exec, JSON events, read-only sandbox, -C cwd, -o file, -m only when given, prompt from stdin; no --ask-for-approval', () => {
  const a = codexArgv({ cwd: 'X', lastMessageFile: 'Y' });
  assert.deepEqual(a, [...CODEX_FIXED_ARGS, '-C', 'X', '-o', 'Y', '-']);
  assert.ok(isSandboxed(a));
  assert.ok(!a.includes('-m'));
  assert.ok(!a.includes('--ask-for-approval'), 'codex exec rejects --ask-for-approval (top-level flag only)');
  const b = codexArgv({ cwd: 'X', lastMessageFile: 'Y', model: 'gpt-6-luna' });
  assert.deepEqual(b.slice(-3), ['-m', 'gpt-6-luna', '-']);
});

test('reverse: dropping the sandbox flag turns the predicate red', () => {
  const a = codexArgv({ cwd: 'X', lastMessageFile: 'Y' });
  const i = a.indexOf('--sandbox');
  assert.equal(isSandboxed([...a.slice(0, i), ...a.slice(i + 2)]), false);
  assert.equal(isSandboxed(a.map((x) => (x === 'read-only' ? 'workspace-write' : x))), false);
  assert.equal(isSandboxed(a.filter((x) => x !== '--ephemeral')), false);
  assert.equal(isSandboxed(a.slice(0, -1)), false, 'without the stdin marker');
});

test('real `codex exec --help` (read-only): every long flag we pass exists, --ask-for-approval does not, and our full argv parses', async (t) => {
  const cands = codexCandidates({}, { env: process.env });
  if (cands.length === 0) { t.skip('codex not found on this machine (command, PATH, desktop app): nothing checked'); return; }
  const cmd = cands[0];
  const help = await runProcess({ file: cmd.file, args: ['exec', '--help'], timeoutMs: 20000 });
  assert.equal(help.status, 0, help.stderr);
  const longFlags = [...CODEX_FIXED_ARGS.filter((a) => a.startsWith('--')), '--cd', '--output-last-message', '--model'];
  for (const f of longFlags) assert.ok(new RegExp(`(^|\\s)${f}\\b`).test(help.stdout), `${f} missing from codex exec --help (${cmd.file})`);
  assert.ok(!/--ask-for-approval/.test(help.stdout), '--ask-for-approval must not be in codex exec --help');
  const full = await runProcess({ file: cmd.file, args: [...codexArgv({ cwd: 'x', lastMessageFile: 'y', model: 'z' }), '--help'], timeoutMs: 20000 });
  assert.equal(full.status, 0, `clap rejected our argv: ${full.stderr}`);
  const rejected = await runProcess({ file: cmd.file, args: ['exec', '--ask-for-approval', 'never', '--help'], timeoutMs: 20000 });
  assert.notEqual(rejected.status, 0, 'reverse: the removed flag really is rejected');
  assert.match(rejected.stderr, /unexpected argument '--ask-for-approval'/);
});

test('lookup: connection.command > PATH > desktop app; the highest --version wins; detect reports source and path', async () => {
  const root = caseDir('codex-lookup');
  const pathDir = join(root, 'onpath');
  const local = join(root, 'LocalAppData');
  const home = join(root, 'home');
  const binA = join(local, 'OpenAI', 'Codex', 'bin', '22cfb1d302613eae');
  const binB = join(local, 'OpenAI', 'Codex', 'bin', '57159798136552f4');
  const sandbox = join(home, '.codex', '.sandbox-bin');
  for (const d of [pathDir, binA, binB, sandbox]) mkdirSync(d, { recursive: true });
  writeFileSync(join(pathDir, 'codex.exe'), '');
  writeFileSync(join(binA, 'codex.exe'), '');
  writeFileSync(join(sandbox, 'codex.exe'), '');
  // binB exists but holds no codex.exe (as on the owner's machine)
  const versions = { [join(pathDir, 'codex.exe')]: '0.150.0', [join(binA, 'codex.exe')]: '0.166.0-alpha.5.1', [join(sandbox, 'codex.exe')]: '0.160.1' };
  const spawnImpl = fakeSpawn((call) => (call.args[0] === '--version' ? { stdout: `codex-cli ${versions[call.file]}\n` } : { stdout: 'Logged in using ChatGPT\n' }));
  const deps = { spawnImpl, platform: 'win32' };

  assert.deepEqual(desktopAppCodex({ LOCALAPPDATA: local, USERPROFILE: home }), [join(binA, 'codex.exe'), join(sandbox, 'codex.exe')]);

  // all three sources present -> candidates in order, desktop app's 0.166 wins
  const envAll = { PATH: pathDir, PATHEXT: '.EXE;.CMD', LOCALAPPDATA: local, USERPROFILE: home };
  assert.deepEqual(codexCandidates({}, { env: envAll, platform: 'win32' }).map((c) => [c.source, c.file]), [['path', join(pathDir, 'codex.exe')], ['desktop-app', join(binA, 'codex.exe')], ['desktop-app', join(sandbox, 'codex.exe')]]);
  const all = createCodexConnector({ kind: 'codex' }, { ...deps, env: envAll });
  const dAll = await all.detect();
  assert.equal(dAll.installed, true);
  assert.equal(dAll.source, 'desktop-app');
  assert.equal(dAll.path, join(binA, 'codex.exe'));
  assert.equal(dAll.version, '0.166.0-alpha.5.1');
  assert.equal(dAll.loggedIn, true);

  // PATH only
  const onlyPath = createCodexConnector({ kind: 'codex' }, { ...deps, env: { PATH: pathDir, PATHEXT: '.EXE;.CMD' } });
  const dPath = await onlyPath.detect();
  assert.deepEqual([dPath.source, dPath.path, dPath.version], ['path', join(pathDir, 'codex.exe'), '0.150.0']);

  // desktop app only (sandbox-bin alone)
  const onlySandbox = createCodexConnector({ kind: 'codex' }, { ...deps, env: { PATH: caseDir('codex-lookup-emptypath'), PATHEXT: '.EXE;.CMD', USERPROFILE: home } });
  const dSb = await onlySandbox.detect();
  assert.deepEqual([dSb.source, dSb.path, dSb.version], ['desktop-app', join(sandbox, 'codex.exe'), '0.160.1']);

  // explicit command beats a newer PATH / desktop copy
  const explicit = createCodexConnector({ kind: 'codex', command: join(sandbox, 'codex.exe') }, { ...deps, env: envAll });
  const dCmd = await explicit.detect();
  assert.deepEqual([dCmd.source, dCmd.path, dCmd.version], ['command', join(sandbox, 'codex.exe'), '0.160.1']);
  assert.equal(spawnImpl.calls.filter((x) => x.args[0] === '--version').length > 0, true);

  // reverse: swap the versions and the other desktop copy wins
  versions[join(binA, 'codex.exe')] = '0.100.0';
  const swapped = await createCodexConnector({ kind: 'codex' }, { ...deps, env: envAll }).detect();
  assert.equal(swapped.path, join(sandbox, 'codex.exe'));
  assert.equal(swapped.version, '0.160.1');

  // a candidate that cannot run is skipped, not fatal
  const brokenSpawn = fakeSpawn((call) => (call.file === join(pathDir, 'codex.exe') ? { error: enoent('codex') } : call.args[0] === '--version' ? { stdout: `codex-cli ${versions[call.file]}\n` } : { stdout: 'Logged in using ChatGPT\n' }));
  const skipped = await createCodexConnector({ kind: 'codex' }, { spawnImpl: brokenSpawn, platform: 'win32', env: envAll }).detect();
  assert.equal(skipped.installed, true);
  assert.equal(skipped.path, join(sandbox, 'codex.exe'));

  // nothing anywhere -> not-installed, nothing spawned, complete() counts 0 calls
  const noneSpawn = fakeSpawn({ stdout: 'codex-cli 0.160.1\n' });
  const none = createCodexConnector({ kind: 'codex' }, { spawnImpl: noneSpawn, platform: 'win32', env: { PATH: caseDir('codex-lookup-none'), PATHEXT: '.EXE;.CMD', LOCALAPPDATA: caseDir('codex-lookup-none-local'), USERPROFILE: caseDir('codex-lookup-none-home') } });
  const dNone = await none.detect();
  assert.deepEqual(dNone, { installed: false, loggedIn: null, code: 'not-installed', detail: 'codex not found (command, PATH, desktop app)' });
  const r = await none.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.code, 'not-installed');
  assert.deepEqual(r.usage, { calls: 0 });
  assert.equal(noneSpawn.calls.length, 0);
});

test('compareVersions', () => {
  assert.ok(compareVersions('0.166.0-alpha.5.1', '0.160.1') > 0);
  assert.ok(compareVersions('0.160.1', '0.166.0-alpha.5.1') < 0);
  assert.ok(compareVersions('0.160.1', '0.160.1-rc.1') > 0, 'release beats pre-release of the same number');
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0, 'numeric, not lexical');
  assert.ok(compareVersions(undefined, '0.0.1') < 0, 'unparsable loses');
});

test('complete: success from the event stream; system prompt merged into stdin; usage from turn.completed', async () => {
  const { c, exec } = connector({ stdout: events('{"score":0.5}') }, { connection: { model: 'gpt-6.1-sol' }, deps: { name: 'ok' } });
  const r = await c.complete({ system: 'SYS', prompt: 'PROMPT 中文', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.json, { score: 0.5 });
  assert.deepEqual(r.usage, { calls: 1, inputTokens: 50, outputTokens: 9 });
  assert.equal(r.model, 'gpt-6.1-sol');
  const call = exec();
  assert.ok(isSandboxed(call.args));
  assert.equal(call.args[call.args.indexOf('-m') + 1], 'gpt-6.1-sol');
  assert.equal(call.input, 'SYS\n\nPROMPT 中文');
  assert.ok(!call.args.some((a) => a.includes('PROMPT')), 'prompt not on argv');
  assert.equal(call.args[call.args.indexOf('-C') + 1], call.opts.cwd, '-C is the spawn cwd');
  const o = call.args[call.args.indexOf('-o') + 1];
  assert.equal(dirname(o), dirname(call.opts.cwd), 'the -o file sits next to cwd, not inside it');
  assert.equal(existsSync(call.opts.cwd), false, 'cwd removed afterwards');
});

test('complete: the -o file wins over the event stream when both exist; the -o path is under tmpRoot, never the process cwd', async () => {
  const tmpRoot = caseDir('codex-tmp-ofile');
  let written;
  const { c } = connector((call) => ({
    stdout: events('{"from":"events"}'),
    onSpawn: () => {
      // only the exec call carries -o; writing anywhere else (e.g. a file literally named "--version"
      // in the repo) is the bug this guards against
      assert.ok(call.args.includes('-o'), `no -o in ${call.args.join(' ')}`);
      written = call.args[call.args.indexOf('-o') + 1];
      assert.ok(written.startsWith(tmpRoot + sep), `${written} is not under ${tmpRoot}`);
      assert.ok(!written.startsWith(process.cwd() + sep), '-o must not point into the process cwd');
      writeFileSync(written, '{"from":"file"}', 'utf8');
    },
  }), { deps: { name: 'ofile', tmpRoot } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.deepEqual(r.json, { from: 'file' });
  assert.equal(existsSync(written), false, 'the -o file is removed with the work folder');
  assert.equal(existsSync(join(process.cwd(), '--version')), false);
});

test('complete: cwd is fresh, empty, outside the repo, under the injected tmpRoot', async () => {
  let seen;
  const { c } = connector({ stdout: events('{"ok":true}'), onSpawn: (call) => { seen = { cwd: call.opts.cwd, entries: readdirSync(call.opts.cwd) }; } }, { deps: { name: 'cwd' } });
  await c.complete({ prompt: 'x', format: 'json' });
  assert.deepEqual(seen.entries, []);
  assert.ok(!seen.cwd.startsWith(REPO + sep));
  assert.ok(seen.cwd.includes(`codex-tmp-cwd${sep}`));
  assert.equal(existsSync(seen.cwd), false);
});

test('complete: bad format when the agent message is prose', async () => {
  const { c } = connector({ stdout: events('I think it scores about 0.5.') }, { deps: { name: 'badfmt' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'bad-format');
  assert.match(r.text, /0\.5/);
});

test('complete: not logged in (error event, exit 1) -> not-logged-in', async () => {
  const stdout = events(undefined, { usage: null, extra: [{ type: 'error', message: 'Not logged in. Run `codex login` first.' }] });
  const { c } = connector({ stdout, stderr: 'Error: not logged in\n', status: 1 }, { deps: { name: 'nologin' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not-logged-in');
  assert.match(r.detail, /exit 1/);
  const p = await c.probe();
  assert.equal(p.code, 'not-logged-in');
});

test('complete: turn.failed with a quota message -> rate-limited; plain stderr crash -> unknown', async () => {
  const quota = events(undefined, { usage: null, extra: [{ type: 'turn.failed', error: { message: 'usage limit reached for this plan' } }] });
  const { c } = connector({ stdout: quota, status: 1 }, { deps: { name: 'quota' } });
  assert.equal((await c.complete({ prompt: 'x', format: 'json' })).code, 'rate-limited');
  const { c: c2 } = connector({ stdout: '', stderr: 'thread panicked', status: 101 }, { deps: { name: 'panic' } });
  const r = await c2.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.code, 'unknown');
  assert.match(r.detail, /panicked/);
});

test('codeFromText and parseCodexEvents', () => {
  assert.equal(codeFromText('Not logged in'), 'not-logged-in');
  assert.equal(codeFromText('401 Unauthorized'), 'not-logged-in');
  assert.equal(codeFromText('model gpt-9 not found'), 'bad-model');
  assert.equal(codeFromText('connection reset by peer'), 'network');
  assert.equal(codeFromText('hello'), 'unknown');
  const ev = parseCodexEvents(events('A') + 'garbage line\n' + JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'B' } }) + '\n');
  assert.equal(ev.text, 'B', 'last agent message wins');
  assert.equal(ev.events, 5);
  assert.deepEqual(ev.usage, { inputTokens: 50, outputTokens: 9 });
  assert.deepEqual(parseCodexEvents(''), { text: undefined, usage: {}, errors: [], events: 0 });
});

test('not installed: unknown command -> no spawn, calls 0; ENOENT on the only candidate -> not-installed', async () => {
  const spawnImpl = fakeSpawn({ stdout: events('{"ok":true}') });
  const c = createCodexConnector({ kind: 'codex', command: 'no-such-codex-xyz' }, { spawnImpl, env: { PATH: caseDir('codex-nopath'), PATHEXT: '.EXE' } });
  assert.equal((await c.detect()).installed, false);
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.code, 'not-installed');
  assert.deepEqual(r.usage, { calls: 0 });
  assert.equal(spawnImpl.calls.length, 0);
  const enoentSpawn = fakeSpawn({ error: enoent('codex') });
  const c2 = createCodexConnector({ kind: 'codex' }, { spawnImpl: enoentSpawn, env: fakePath('enoent') });
  const d = await c2.detect();
  assert.equal(d.installed, false);
  assert.equal(d.code, 'not-installed');
  assert.match(d.detail, /ENOENT/);
  assert.deepEqual((await c2.complete({ prompt: 'x', format: 'json' })).usage, { calls: 0 });
});

test('timeout', async () => {
  const { c, exec } = connector({ stdout: events('{"ok":true}'), delayMs: 2000 }, { deps: { name: 'timeout', timeoutMs: 60 } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.equal(r.code, 'timeout');
  assert.equal(r.usage.calls, 1);
  assert.equal(exec().killed, true);
});

test('detect: version and login status (signed in / signed out)', async () => {
  const { c, spawnImpl } = connector({ stdout: 'Logged in using ChatGPT\n' }, { deps: { name: 'detect' } });
  const d = await c.detect();
  assert.equal(d.installed, true);
  assert.equal(d.loggedIn, true);
  assert.equal(d.version, '0.160.1');
  assert.equal(d.source, 'path');
  assert.equal(d.detail, 'Logged in using ChatGPT');
  assert.ok(d.path.endsWith(EXE));
  assert.deepEqual(spawnImpl.calls.map((x) => x.args), [['--version'], ['login', 'status']]);
  const { c: c2 } = connector({ stdout: 'Not logged in\n', status: 1 }, { deps: { name: 'detect-out' } });
  const d2 = await c2.detect();
  assert.equal(d2.loggedIn, false);
  assert.equal(d2.code, 'not-logged-in');
  const { c: c3 } = connector({ stdout: 'Not logged in\n', status: 0 }, { deps: { name: 'detect-out0' } });
  assert.equal((await c3.detect()).loggedIn, false, 'the wording counts even with exit 0');
});

test('real subprocess (fake-cli): runs in an empty temp folder, -o file read, folder removed', async () => {
  const tmpRoot = caseDir('codex-real-tmp');
  const c = createConnector({ kind: 'codex', model: 'gpt-6-luna', command: [process.execPath, FAKE_CLI] }, { tmpRoot, timeoutMs: 20000 });
  const d = await c.detect();
  assert.equal(d.installed, true);
  assert.equal(d.loggedIn, true);
  assert.equal(d.source, 'command');
  assert.equal(d.version, '9.9.9');
  const r = await c.complete({ prompt: 'hi', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.json.cwd.startsWith(tmpRoot + sep));
  assert.deepEqual(r.json.entries, []);
  assert.ok(isSandboxed(r.json.argv));
  assert.equal(r.json.argv[r.json.argv.indexOf('-m') + 1], 'gpt-6-luna');
  assert.equal(r.json.prompt, 'hi');
  assert.ok(r.json.argv[r.json.argv.indexOf('-o') + 1].endsWith(CODEX_LAST_MESSAGE_FILE));
  assert.deepEqual(r.usage, { calls: 1, inputTokens: 10, outputTokens: 2 });
  assert.deepEqual(readdirSync(tmpRoot), [], 'nothing left behind, the -o file included');
});

test('sentinel: a clean event stream must never be reported as not-logged-in', async () => {
  const { c } = connector({ stdout: events('{"ok":true}') }, { deps: { name: 'sentinel' } });
  const r = await c.complete({ prompt: 'x', format: 'json' });
  assert.notEqual(r.code, 'not-logged-in');
  assert.equal(r.ok, true);
});
