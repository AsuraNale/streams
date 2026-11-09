// The main agent's session mode (v2 package C, contract C3; src/connect/session.mjs), without a real CLI: the argv of every
// call of the three connections scanned for 「不能动手」 (N2, the main agent's part): Claude Code keeps v1.0's zero-tool set
// minus --no-session-persistence and adds --session-id / --resume; Codex keeps v1.0's read-only first call minus --ephemeral
// and resumes with `exec resume … -c sandbox_mode="read-only"`; the API sends no tools; every CLI call runs in the one
// working folder, empty at spawn. A resume that fails for want of the session is sessionLost; a connection problem is not.
// Each rule first gets the input made to break it. The two real `--help` checks run the installed CLIs read only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSessionConnector, claudeSessionArgv, codexSessionArgv, codexResumeArgv, threadIdOf, emptyFolder,
  CLAUDE_SESSION_ARGS, CODEX_SESSION_ARGS, CODEX_RESUME_ARGS, CODEX_READ_ONLY_CONFIG,
} from '../src/connect/session.mjs';
import { CLAUDE_FIXED_ARGS } from '../src/connect/claude-code.mjs';
import { CODEX_FIXED_ARGS, codexCandidates } from '../src/connect/codex.mjs';
import { findExecutable } from '../src/connect/which.mjs';
import { runProcess } from '../src/connect/process.mjs';
import { fakeSpawn } from './support/fake-spawn.mjs';
import { caseDir } from './support/tmp.mjs';
import { startFakeApi, GOOD_KEY } from './support/fake-api.mjs';

const EXE = process.platform === 'win32' ? '.exe' : '';
function fakePath(name, tool) {
  const dir = caseDir(`session-path-${name}`);
  writeFileSync(join(dir, `${tool}${EXE}`), '');
  return { PATH: dir, Path: dir, PATHEXT: '.EXE;.CMD' };
}
const envelope = (result, extra = {}) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, session_id: extra.session_id, usage: { input_tokens: 5, output_tokens: 3 }, ...extra }) + '\n';
const events = (text, thread = '01a1ad6c-cb49-7cd0-af65-c3ef71d8a68d') => [
  ...(thread ? [{ type: 'thread.started', thread_id: thread }] : []),
  { type: 'turn.started' },
  { type: 'item.completed', item: { id: 'i0', type: 'agent_message', text } },
  { type: 'turn.completed', usage: { input_tokens: 9, cached_input_tokens: 1, output_tokens: 2 } },
].map((e) => JSON.stringify(e)).join('\n') + '\n';

// ---- the 「不能动手」 predicates the scans and their reverse tests share ----
// flags that would give a model a tool, a folder, a permission or a config of its own
const CLAUDE_FORBIDDEN = ['--no-session-persistence', '--allowedTools', '--allowed-tools', '--add-dir', '--dangerously-skip-permissions', '--permission-mode', '--mcp-config', '--plugin-dir', '--settings', '--agents', '--continue', '-c', '--fork-session'];
function claudeHandsOff(argv) {
  const problems = [];
  const at = (f) => argv.indexOf(f);
  if (!argv.includes('-p')) problems.push('no -p');
  if (at('--tools') < 0 || argv[at('--tools') + 1] !== '') problems.push('--tools "" missing');
  if (argv.filter((a) => a === '--tools').length !== 1) problems.push('--tools given more than once');
  for (const f of ['--safe-mode', '--restricted', '--strict-mcp-config', '--disable-slash-commands']) if (!argv.includes(f)) problems.push(`${f} missing`);
  if (argv[at('--permission-prompts') + 1] !== 'none') problems.push('--permission-prompts none missing');
  if (argv[at('--output-format') + 1] !== 'json') problems.push('--output-format json missing');
  for (const f of CLAUDE_FORBIDDEN) if (argv.includes(f)) problems.push(`${f} present`);
  const modes = ['--session-id', '--resume'].filter((f) => argv.includes(f));
  if (modes.length !== 1) problems.push(`session flags: ${modes.join(',') || 'none'}`);
  return problems;
}
const CODEX_FORBIDDEN = ['--dangerously-bypass-approvals-and-sandbox', '--full-auto', '--add-dir', '--approve-for-me', '--enable', '--worktree', '--ephemeral', '--dangerously-bypass-hook-trust'];
function codexHandsOff(argv) {
  const problems = [];
  if (argv[0] !== 'exec') problems.push('not exec');
  if (!argv.includes('--json')) problems.push('--json missing');
  for (const f of ['--skip-git-repo-check', '--ignore-user-config', '--ignore-rules']) if (!argv.includes(f)) problems.push(`${f} missing`);
  for (const f of CODEX_FORBIDDEN) if (argv.includes(f)) problems.push(`${f} present`);
  if (argv.some((a) => /workspace-write|danger-full-access/.test(a))) problems.push('a writable sandbox mode');
  const resume = argv[1] === 'resume';
  const sandboxes = argv.map((a, i) => (a === '--sandbox' || a === '-s' ? argv[i + 1] : null)).filter((x) => x !== null);
  const configs = argv.map((a, i) => (a === '-c' || a === '--config' ? argv[i + 1] : null)).filter((x) => x !== null);
  if (resume) {
    if (sandboxes.length) problems.push('a resume takes no --sandbox');
    if (configs.filter((c) => c === CODEX_READ_ONLY_CONFIG).length !== 1 || configs.length !== 1) problems.push(`config overrides ${JSON.stringify(configs)} (want exactly sandbox_mode="read-only")`);
  } else {
    if (sandboxes.length !== 1 || sandboxes[0] !== 'read-only') problems.push(`sandbox ${JSON.stringify(sandboxes)} (want read-only)`);
    if (configs.length) problems.push('the first call takes no config override');
  }
  if (argv.at(-1) !== '-') problems.push('the prompt is not read from stdin');
  return problems;
}

test('argv: Claude Code is v1.0\'s zero-tool set without --no-session-persistence, plus --session-id or --resume', () => {
  assert.deepEqual([...CLAUDE_SESSION_ARGS], CLAUDE_FIXED_ARGS.filter((a) => a !== '--no-session-persistence'));
  assert.ok(CLAUDE_FIXED_ARGS.includes('--no-session-persistence'), 'v1.0 keeps it (library calls, asking the library)');
  const first = claudeSessionArgv({ sessionId: '11111111-2222-3333-4444-555555555555', system: 'S', model: 'm' });
  const later = claudeSessionArgv({ resume: '11111111-2222-3333-4444-555555555555' });
  assert.deepEqual(claudeHandsOff(first), []);
  assert.deepEqual(claudeHandsOff(later), []);
  assert.equal(first[first.indexOf('--session-id') + 1], '11111111-2222-3333-4444-555555555555');
  assert.equal(later[later.indexOf('--resume') + 1], '11111111-2222-3333-4444-555555555555');
  assert.throws(() => claudeSessionArgv({}), /sessionId or a resume/);
});

test('reverse: the Claude Code predicate turns red without --tools "", with --no-session-persistence, a tool flag, or both session flags', () => {
  const ok = claudeSessionArgv({ sessionId: 'a' });
  const i = ok.indexOf('--tools');
  assert.notDeepEqual(claudeHandsOff([...ok.slice(0, i), ...ok.slice(i + 2)]), [], 'without --tools');
  assert.notDeepEqual(claudeHandsOff(ok.map((a, k) => (k === i + 1 ? 'default' : a))), [], '--tools default');
  for (const f of ['--safe-mode', '--restricted', '--strict-mcp-config', '--disable-slash-commands']) assert.notDeepEqual(claudeHandsOff(ok.filter((a) => a !== f)), [], `without ${f}`);
  assert.notDeepEqual(claudeHandsOff([...ok, '--no-session-persistence']), []);
  assert.notDeepEqual(claudeHandsOff([...ok, '--allowedTools', 'Bash']), []);
  assert.notDeepEqual(claudeHandsOff([...ok, '--dangerously-skip-permissions']), []);
  assert.notDeepEqual(claudeHandsOff([...ok, '--resume', 'b']), [], 'two session flags');
});

test('argv: Codex first call is v1.0\'s read-only exec without --ephemeral; a resume is exec resume with -c sandbox_mode="read-only"', () => {
  assert.deepEqual([...CODEX_SESSION_ARGS], CODEX_FIXED_ARGS.filter((a) => a !== '--ephemeral'));
  assert.ok(CODEX_FIXED_ARGS.includes('--ephemeral'), 'v1.0 keeps it');
  const first = codexSessionArgv({ cwd: 'C:\\agent\\cwd', lastMessageFile: 'C:\\side\\last.txt', model: 'gpt-x' });
  const later = codexResumeArgv({ sessionId: '01a1ad6c-cb49-7cd0-af65-c3ef71d8a68d', lastMessageFile: 'C:\\side\\last.txt' });
  assert.deepEqual(codexHandsOff(first), []);
  assert.deepEqual(codexHandsOff(later), []);
  assert.deepEqual(later.slice(0, CODEX_RESUME_ARGS.length), [...CODEX_RESUME_ARGS]);
  assert.deepEqual(later.slice(-2), ['01a1ad6c-cb49-7cd0-af65-c3ef71d8a68d', '-']);
  assert.ok(!later.includes('-C') && !later.includes('--color'), 'exec resume takes neither');
  assert.throws(() => codexResumeArgv({}), /session id/);
});

test('reverse: the Codex predicate turns red without the read-only sandbox or override, with a writable one, or a bypass flag', () => {
  const first = codexSessionArgv({ cwd: 'x', lastMessageFile: 'y' });
  const later = codexResumeArgv({ sessionId: 's', lastMessageFile: 'y' });
  const s = first.indexOf('--sandbox');
  assert.notDeepEqual(codexHandsOff([...first.slice(0, s), ...first.slice(s + 2)]), [], 'first without --sandbox');
  assert.notDeepEqual(codexHandsOff(first.map((a) => (a === 'read-only' ? 'workspace-write' : a))), []);
  const c = later.indexOf('-c');
  assert.notDeepEqual(codexHandsOff([...later.slice(0, c), ...later.slice(c + 2)]), [], 'resume without the override');
  assert.notDeepEqual(codexHandsOff(later.map((a) => (a === CODEX_READ_ONLY_CONFIG ? 'sandbox_mode="danger-full-access"' : a))), []);
  assert.notDeepEqual(codexHandsOff([...later.slice(0, -1), '--dangerously-bypass-approvals-and-sandbox', '-']), []);
  assert.notDeepEqual(codexHandsOff([...first.slice(0, -1), '--ephemeral', '-']), []);
});

test('scan, Claude Code: every spawn of a conversation (new, resumed, a retry) is hands-off and runs in the agent folder, empty at spawn', async () => {
  const root = caseDir('session-cc-scan');
  const cwd = join(root, 'agent', 'cwd');
  const seen = [];
  const spawnImpl = fakeSpawn((call) => {
    seen.push({ cwd: call.opts.cwd, entries: existsSync(call.opts.cwd) ? readdirSync(call.opts.cwd) : null });
    const resume = call.args.includes('--resume');
    const id = resume ? call.args[call.args.indexOf('--resume') + 1] : call.args[call.args.indexOf('--session-id') + 1];
    return { stdout: envelope('{"reply":"ok"}', { session_id: id }) };
  });
  const c = createSessionConnector({ kind: 'claude-code', model: 'claude-opus-5-5' }, { spawnImpl, env: fakePath('cc-scan', 'claude') }, { cwd });
  assert.equal(c.sessionful, true);
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, 'stray.txt'), 'left by someone');
  const a = await c.send({ system: 'SYS', prompt: 'first', format: 'json' });
  assert.equal(a.ok, true);
  assert.match(a.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(a.resumed, false);
  const b = await c.send({ system: 'SYS', prompt: 'second', format: 'json' }, { sessionId: a.sessionId });
  assert.equal(b.ok, true);
  assert.equal(b.sessionId, a.sessionId);
  assert.equal(b.resumed, true);
  await c.send({ system: 'SYS', prompt: 'third', format: 'json' }, { sessionId: a.sessionId });
  assert.equal(spawnImpl.calls.length, 3);
  for (const call of spawnImpl.calls) {
    assert.deepEqual(claudeHandsOff(call.args), [], call.args.join(' '));
    assert.equal(call.args[call.args.indexOf('--system-prompt') + 1], 'SYS');
    assert.ok(!call.args.some((x) => /first|second|third/.test(x)), 'the prompt is never on argv');
  }
  assert.deepEqual(spawnImpl.calls.map((x) => x.input), ['first', 'second', 'third']);
  assert.equal(spawnImpl.calls[0].args[spawnImpl.calls[0].args.indexOf('--session-id') + 1], a.sessionId);
  assert.deepEqual(seen.map((s) => s.cwd), [cwd, cwd, cwd], 'always the one agent folder (a resume needs the same folder)');
  assert.deepEqual(seen.map((s) => s.entries), [[], [], []], 'empty at spawn: the stray file was removed first');
});

test('scan, Codex: the first call and every resume are hands-off; the session id is the thread id; -o is outside the agent folder', async () => {
  const root = caseDir('session-codex-scan');
  const cwd = join(root, 'agent', 'cwd');
  const seen = [];
  const spawnImpl = fakeSpawn((call) => {
    if (call.args[0] === '--version') return { stdout: 'codex-cli 0.166.0-alpha.6\n' };
    seen.push({ cwd: call.opts.cwd, entries: existsSync(call.opts.cwd) ? readdirSync(call.opts.cwd) : null, out: call.args[call.args.indexOf('-o') + 1] });
    return { stdout: events('{"reply":"ok"}', call.args[1] === 'resume' ? null : '01a1ad6c-cb49-7cd0-af65-c3ef71d8a68d') };
  });
  const c = createSessionConnector({ kind: 'codex' }, { spawnImpl, env: fakePath('codex-scan', 'codex'), tmpRoot: join(root, 'side') }, { cwd });
  const a = await c.send({ system: 'SYS', prompt: 'first', format: 'json' });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.sessionId, '01a1ad6c-cb49-7cd0-af65-c3ef71d8a68d');
  const b = await c.send({ system: 'SYS', prompt: 'second', format: 'json' }, { sessionId: a.sessionId });
  assert.equal(b.ok, true);
  assert.equal(b.sessionId, a.sessionId, 'a resume without a thread.started keeps the id it was given');
  const execs = spawnImpl.calls.filter((x) => x.args[0] === 'exec');
  assert.equal(execs.length, 2);
  for (const call of execs) assert.deepEqual(codexHandsOff(call.args), [], call.args.join(' '));
  assert.equal(execs[0].args[1], '--json', 'the first is a plain exec');
  assert.deepEqual(execs[1].args.slice(0, 2), ['exec', 'resume']);
  assert.equal(execs[0].input, 'SYS\n\nfirst', 'the first call carries the system text (v1.0 way)');
  assert.equal(execs[1].input, 'second', 'a resumed session has it already');
  assert.deepEqual(seen.map((s) => s.cwd), [cwd, cwd]);
  assert.deepEqual(seen.map((s) => s.entries), [[], []]);
  for (const s of seen) assert.ok(!s.out.startsWith(cwd), `-o ${s.out} is not inside the agent folder`);
});

test('scan, API: a send is one Messages / chat request with no tools in it (the conversation is replayed by the caller)', async () => {
  const api = await startFakeApi();
  try {
    for (const vendor of ['anthropic', 'custom']) {
      const c = createSessionConnector({ kind: 'api', model: 'claude-x', api: { vendor, baseUrl: vendor === 'custom' ? `${api.baseUrl}/v1` : api.baseUrl, keyRef: 'k' } }, { getKey: async () => GOOD_KEY }, {});
      assert.equal(c.sessionful, false);
      const r = await c.send({ system: 'SYS', prompt: 'hello', format: 'json' }, { sessionId: 'ignored' });
      assert.equal(r.sessionId, null);
      assert.equal(r.resumed, false);
    }
    assert.equal(api.requests.length, 2);
    for (const req of api.requests) {
      for (const k of ['tools', 'tool_choice', 'functions', 'function_call', 'mcp_servers']) assert.ok(!(k in req.body), `${k} in the request`);
    }
  } finally {
    await api.close();
  }
});

test('a resume that fails for want of the session is sessionLost; a connection problem on a resume is not; a first call never is', async () => {
  const root = caseDir('session-lost');
  const cases = [
    // the wording seen on this machine on 2026-11-05 (docs/design/v2/agent-trial-2026-11-05.md)
    { kind: 'claude-code', out: { stdout: 'No conversation found with session ID: 0f3c', status: 1 }, resume: true, lost: true },
    { kind: 'claude-code', out: { stdout: JSON.stringify({ type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' }), status: 1 }, resume: true, lost: false },
    { kind: 'claude-code', out: { stdout: 'No conversation found with session ID: 0f3c', status: 1 }, resume: false, lost: false },
    { kind: 'codex', out: { stderr: 'Error: thread/resume: thread/resume failed: no rollout found for thread id d25c (code -32600)', status: 1 }, resume: true, lost: true },
    { kind: 'codex', out: { stderr: 'Error: not logged in, run codex login', status: 1 }, resume: true, lost: false },
    { kind: 'codex', out: { stderr: 'stream error: 429 Too Many Requests', status: 1 }, resume: true, lost: false },
  ];
  for (const [i, k] of cases.entries()) {
    const spawnImpl = fakeSpawn((call) => (call.args[0] === '--version' ? { stdout: 'codex-cli 0.166.0\n' } : k.out));
    const c = createSessionConnector({ kind: k.kind }, { spawnImpl, env: fakePath(`lost-${i}`, k.kind === 'codex' ? 'codex' : 'claude'), tmpRoot: join(root, 'side') }, { cwd: join(root, `c${i}`) });
    const r = await c.send({ prompt: 'x', format: 'json' }, k.resume ? { sessionId: '0f3c0f3c-0000-4000-8000-000000000000' } : {});
    assert.equal(r.ok, false, `case ${i}`);
    assert.equal(Boolean(r.sessionLost), k.lost, `case ${i}: ${r.code} ${r.detail}`);
  }
});

test('the agent folder: emptied before a call; something a call leaves there is reported and removed', async () => {
  const root = caseDir('session-leftover');
  const cwd = join(root, 'cwd');
  assert.deepEqual(emptyFolder(cwd), [], 'made when missing');
  writeFileSync(join(cwd, 'a.txt'), 'x');
  mkdirSync(join(cwd, 'sub'));
  assert.deepEqual(emptyFolder(cwd).sort(), ['a.txt', 'sub']);
  assert.deepEqual(readdirSync(cwd), []);
  const lines = [];
  const spawnImpl = fakeSpawn((call) => ({ stdout: envelope('{"reply":"ok"}'), onSpawn: () => writeFileSync(join(call.opts.cwd, 'made-by-the-call.txt'), 'x') }));
  const c = createSessionConnector({ kind: 'claude-code' }, { spawnImpl, env: fakePath('leftover', 'claude'), log: (l) => lines.push(l) }, { cwd });
  const r = await c.send({ prompt: 'x', format: 'json' });
  assert.deepEqual(r.leftover, ['made-by-the-call.txt']);
  assert.deepEqual(readdirSync(cwd), []);
  assert.ok(lines.some((l) => /left 1 entry/.test(l)));
  assert.throws(() => createSessionConnector({ kind: 'claude-code' }, {}, { cwd: 'relative\\cwd' }), /absolute/);
});

test('threadIdOf: the first thread.started event; none → null', () => {
  assert.equal(threadIdOf(events('x', 'abc-1')), 'abc-1');
  assert.equal(threadIdOf(events('x', null)), null);
  assert.equal(threadIdOf('not json\n{"type":"thread.started","thread_id":"bad id with spaces"}\n'), null);
});

test('real `codex exec resume --help` (read-only, no model call): our resume argv parses, -c is taken, --sandbox is not', async (t) => {
  const cands = codexCandidates({}, { env: process.env });
  if (cands.length === 0) { t.skip('codex not found on this machine'); return; }
  const cmd = cands[0];
  const full = await runProcess({ file: cmd.file, args: [...codexResumeArgv({ sessionId: '01a1ad6c-cb49-7cd0-af65-c3ef71d8a68d', lastMessageFile: 'y', model: 'z' }), '--help'], timeoutMs: 20000 });
  assert.equal(full.status, 0, `clap rejected the resume argv: ${full.stderr}`);
  const first = await runProcess({ file: cmd.file, args: [...codexSessionArgv({ cwd: 'x', lastMessageFile: 'y', model: 'z' }), '--help'], timeoutMs: 20000 });
  assert.equal(first.status, 0, `clap rejected the first argv: ${first.stderr}`);
  const rejected = await runProcess({ file: cmd.file, args: ['exec', 'resume', '--sandbox', 'read-only', '--help'], timeoutMs: 20000 });
  assert.notEqual(rejected.status, 0, 'reverse: exec resume really refuses --sandbox (why read-only goes in as -c)');
});

test('real `claude --help` (read-only, no model call): --session-id and --resume exist', async (t) => {
  const file = findExecutable('claude', { env: process.env });
  if (!file) { t.skip('claude not found on this machine'); return; }
  const help = await runProcess({ file, args: ['--help'], timeoutMs: 20000 });
  assert.equal(help.status, 0);
  for (const f of ['--session-id', '--resume', '--tools', '--safe-mode', '--restricted']) assert.ok(help.stdout.includes(f), `${f} in claude --help`);
});
