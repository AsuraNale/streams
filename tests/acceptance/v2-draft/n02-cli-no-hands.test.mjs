// N2（草案，待 维护者 定）· 库 Agent / 问库 / 主 Agent 的命令行调用一律「不能动手」（Claude Code 零工具；Codex 只读沙箱且不联网）；扫描所有调用参数
//
// How it is checked:
//   1. Where a process can be started at all: every call in core/src and desktop/src/main that starts (or wraps the
//      starting of) a program is one of the places listed below (KNOWN_SITES), each with what it is for. A new place is
//      red until it is looked at and listed; the quick calls (version, sign-in status) may only pass the arguments listed.
//   2. What every model call passes, at run time: the real connectors (v1.0's one question one answer, the main agent's
//      session mode) on a stand-in for spawn (./support/fake-cli.mjs; no CLI runs, no model is called), driven through
//      every path that calls a model — a round of the library Agent (the self-check's probe, the two gates, the summary,
//      the verification's judge), 问库, the routing of 问库's chat box (the model's half), the main Agent's turns (a new
//      session, then a resume) — on both Claude Code and Codex. Every argv of every one of those calls goes through an
//      allowlist (./support/hands.mjs): Claude Code with `--tools ""` and the rest of v1.0's set, nothing else; Codex
//      `exec` in the read-only sandbox (a resume: -c sandbox_mode="read-only"), no flag for the network, a tool, a folder
//      or a config; every call in an empty working folder. Control: each path made at least one call of each kind.
// Reverse:
//   - the allowlists on planted argvs: a tool, a permission bypass, a folder, an MCP config, a writable sandbox, the
//     network, the web search — each one reported;
//   - mutants of the core (a copy, one line changed, ../support/mutant.mjs): Claude Code's one-off set gets a tool; the
//     main agent's Claude Code call gets --allowedTools; Codex's first call gets a writable sandbox; Codex's resume gets a
//     writable sandbox → the run-time scan of that copy is red;
//   - the site scan on a planted new place that starts `claude` with a tool → reported.
// v2 package M: Claude Code's set is `--output-format stream-json --verbose` (was json; the allowlist takes only that, with
// planted json / text / no --verbose reported), and Codex's plan windows are read from `codex app-server`
// (core connect/codex-quota.mjs): a known place (runDialogue), checked at run time — argv exactly ['app-server'], the lines
// sent exactly initialize · initialized · account/rateLimits/read; reverse: planted argvs and a fourth message are reported,
// and two mutants (a fourth message, a feature switched on) turn the run-time scan red.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { REPO_DIR, caseDir, core as realCore, fake as realFake } from '../support/paths.mjs'
import { sourceFiles } from '../support/source-scan.mjs'
import { mutantCore } from '../support/mutant.mjs'
import { claudeProblems, codexProblems, codexQuotaProblems, spawnSites } from './support/hands.mjs'
import { fakeCli, flagValue } from './support/fake-cli.mjs'
import { startSite } from './support/site.mjs'

const site = await startSite()
after(() => site.close())

// ---- 1. the places that can start a process ----
// file → [{ call, count, what, args? (the only argument lists a quick call may pass) }]
const KNOWN_SITES = {
  'core/src/connect/claude-code.mjs': [
    { call: 'runQuick', count: 2, what: 'claude --version · claude auth status --json (no model)', args: [["'--version'"], ["'auth'", "'status'", "'--json'"]] },
    { call: 'runInEmptyDir', count: 1, what: 'v1.0 one question one answer (the gates, the summary, the judge, 问库, the routing, the summary of a long conversation): claudeArgv, checked at run time' },
    { call: 'openLoginWith', count: 1, what: 'the CLI\'s own sign-in window: claude auth login (no model call through Streams)' },
  ],
  'core/src/connect/codex.mjs': [
    { call: 'runQuick', count: 2, what: 'codex --version · codex login status (no model)', args: [["'--version'"], ["'login'", "'status'"]] },
    { call: 'runInEmptyDir', count: 1, what: 'v1.0 one question one answer: codexArgv, checked at run time' },
    { call: 'openLoginWith', count: 1, what: 'the CLI\'s own sign-in window: codex login' },
  ],
  'core/src/connect/command.mjs': [
    { call: 'runProcess', count: 2, what: 'the wrappers runInEmptyDir and runQuick themselves' },
    { call: 'launchDetached', count: 1, what: 'the wrapper openLoginWith itself' },
  ],
  // v2 package M: runDialogue (the app-server's line-by-line exchange) is the third
  'core/src/connect/process.mjs': [{ call: 'spawnImpl', count: 3, what: 'runProcess, launchDetached and runDialogue themselves (child_process.spawn)' }],
  // v2 package M: Codex's plan windows — `codex app-server`, three JSON-RPC messages, no thread or turn; checked at run time
  'core/src/connect/codex-quota.mjs': [{ call: 'runDialogue', count: 1, what: 'codex app-server: initialize · initialized · account/rateLimits/read, nothing else (CODEX_QUOTA_ARGS), checked at run time' }],
  'core/src/connect/session.mjs': [{ call: 'runProcess', count: 1, what: 'the main agent\'s session mode: claudeSessionArgv / codexSessionArgv / codexResumeArgv, checked at run time' }],
  'desktop/src/main/quit.mjs': [{ call: 'spawnSync', count: 1, what: 'taskkill of the app\'s own helper processes at quit (no model)' }],
  'desktop/src/main/services/update.mjs': [{ call: 'spawnImpl', count: 1, what: 'the downloaded setup program of an update (no model)' }],
}

function productFiles() {
  return ['core/src', 'desktop/src/main'].flatMap(d => sourceFiles(join(REPO_DIR, d), ['.mjs', '.js', '.cjs']).map(f => ({ ...f, rel: `${d}/${f.rel}` })))
}

/** What does not fit KNOWN_SITES in these files ([] = every place is known). */
function siteProblems(files) {
  const problems = []
  const sites = spawnSites(files)
  const byFile = Map.groupBy(sites, s => s.file)
  for (const [file, list] of byFile) {
    const known = KNOWN_SITES[file]
    if (!known) { problems.push(`${file}: starts a process and is not a known place: ${list.map(s => `${s.line} ${s.text}`).join(' | ')}`); continue }
    for (const [call, here] of Map.groupBy(list, s => s.call)) {
      const k = known.find(x => x.call === call)
      if (!k) { problems.push(`${file}: ${call} is not known here: ${here.map(s => `${s.line} ${s.text}`).join(' | ')}`); continue }
      if (here.length !== k.count) problems.push(`${file}: ${here.length} × ${call}, ${k.count} known: ${here.map(s => `${s.line} ${s.text}`).join(' | ')}`)
      if (k.args) {
        for (const s of here) {
          const m = /args:\s*\[([^\]]*)\]/.exec(s.text)
          const got = m ? m[1].split(',').map(x => x.trim()).filter(Boolean) : null
          if (!got || !k.args.some(a => JSON.stringify(a) === JSON.stringify(got))) problems.push(`${file}:${s.line}: ${call} with arguments ${m ? m[1] : '(not a literal list)'}: not one of the known quick calls`)
        }
      }
    }
  }
  // and nothing else imports child_process
  for (const f of files) {
    if (/['"](node:)?child_process['"]/.test(f.text) && !['core/src/connect/process.mjs', 'desktop/src/main/quit.mjs', 'desktop/src/main/services/update.mjs'].includes(f.rel)) problems.push(`${f.rel} imports child_process`)
  }
  return problems
}

test('N2 · every place in the core and the main process that can start a program is a known one, and the quick calls pass only their known arguments', () => {
  const files = productFiles()
  assert.ok(files.length > 50, 'control: the scan reads the product')
  assert.deepEqual(siteProblems(files), [])
})

test('N2 reverse: a planted new place that starts claude with a tool, and a quick call with a tool, are reported', () => {
  const files = productFiles()
  const planted = [...files, { rel: 'core/src/pipeline/shortcut.mjs', text: "import { spawn } from 'node:child_process'\nexport const go = () => spawn('claude', ['-p', '--tools', 'Bash'])\n" }]
  const p1 = siteProblems(planted)
  assert.ok(p1.some(p => p.startsWith('core/src/pipeline/shortcut.mjs: starts a process')), p1.join('\n'))
  assert.ok(p1.some(p => p === 'core/src/pipeline/shortcut.mjs imports child_process'), p1.join('\n'))
  const cc = files.find(f => f.rel === 'core/src/connect/claude-code.mjs')
  const changed = files.map(f => (f === cc ? { ...f, text: f.text.replace("args: ['--version']", "args: ['-p', '--tools', 'Bash']") } : f))
  assert.notEqual(changed.find(f => f.rel === cc.rel).text, cc.text, 'control: the plant applied')
  const p2 = siteProblems(changed)
  assert.ok(p2.some(p => p.includes("'-p', '--tools', 'Bash'") && p.includes('not one of the known quick calls')), p2.join('\n'))
  // v2 package M: the app-server entry is a known place; a second dialogue there, or one anywhere else, is reported
  assert.ok(spawnSites(files).some(s => s.file === 'core/src/connect/codex-quota.mjs' && s.call === 'runDialogue'), 'control: the scan sees the app-server entry')
  const cq = files.find(f => f.rel === 'core/src/connect/codex-quota.mjs')
  const twice = files.map(f => (f === cq ? { ...f, text: `${f.text}\nexport const again = () => runDialogue({ file: 'codex', args: ['app-server'] });\n` } : f))
  assert.ok(siteProblems(twice).some(p => p.startsWith('core/src/connect/codex-quota.mjs: 2 × runDialogue')), siteProblems(twice).join('\n'))
  const elsewhere = [...files, { rel: 'desktop/src/main/services/quota-shortcut.mjs', text: "import { runDialogue } from '../core.mjs'\nexport const go = () => runDialogue({ file: 'codex', args: ['app-server'] })\n" }]
  assert.ok(siteProblems(elsewhere).some(p => p.startsWith('desktop/src/main/services/quota-shortcut.mjs: starts a process')), siteProblems(elsewhere).join('\n'))
})

// ---- 2. every model call at run time ----
const HOUR = 3_600_000

/** Every path that calls a model, on Claude Code and on Codex, with the given core → the calls the stand-in saw. */
async function capture(core, fakeMod, label) {
  const sessions = new Set()
  const scripted = fakeMod.scriptedConnector()
  const agentAnswer = JSON.stringify({ reply: '好，记下了。' })
  const cli = fakeCli({
    name: label,
    sessions,
    answer: async call => {
      if (call.phase === 'agent') return agentAnswer
      const model = call.kind === 'claude' ? flagValue(call.args, '--model') : flagValue(call.args, '-m')
      const r = await scripted.complete({ prompt: call.input, model: model === 'm-verify' ? 'verify' : undefined, format: 'json' })
      return r.ok ? (r.text ?? JSON.stringify(r.json)) : '{}'
    },
  })
  const deps = kind => ({ spawnImpl: cli.spawnImpl, env: cli.env, tmpRoot: caseDir(`n02-${label}-${kind}-tmp`), timeoutMs: 20_000 })
  const feed = site.items(`n02-${label}`, [1, 2].map(i => ({ title: `Item ${i} about agent memory`, path: `/n02/${label}/${i}`, body: `<html><body><p>Body of item ${i} about agent memory. The benchmark improved by 6%.</p></body></html>` })))
  for (const kind of ['claude-code', 'codex']) {
    const connection = { kind, model: 'm-main', verifyModel: 'm-verify' }
    const connector = core.createConnector(connection, deps(kind))
    const dir = caseDir(`n02-${label}-${kind}-lib`)
    core.createLibrary(dir, { name: 'n02' })
    core.addTopic(dir, { name: 'agent 记忆', keywords: ['memory'] })
    core.addSource(dir, { name: 'feed-a', kind: 'rss', url: feed, topic: 'agent 记忆', max_results: 10 })
    cli.phase = `round:${kind}`
    const r = await core.runRound(dir, { connector, ctx: { timeoutMs: 3000, now: () => new Date(Date.now()), sleep: async () => {} } })
    if (!r.ok && !r.started) throw new Error(`${label} ${kind}: the round did not start: ${JSON.stringify(r.problems)}`)
    // keep one so 问库 has a candidate
    const card = core.listInbox(dir)[0]
    if (card) core.keep(dir, card.url)
    cli.phase = `ask:${kind}`
    await core.ask(dir, 'agent memory 有什么进展？', { connector })
    cli.phase = `route:${kind}`
    await core.routeMessage('电池那块', { connector }) // no rule signal either way: the model is asked
    // the main agent: a new session, then a resume (its own empty working folder)
    cli.phase = 'agent'
    const agentDir = caseDir(`n02-${label}-${kind}-agent`)
    const cwd = caseDir(`n02-${label}-${kind}-agent-cwd`)
    const sc = core.createSessionConnector(connection, deps(kind), { cwd })
    for (const text of ['你好', '接着说']) await core.agentTurn({ text }, { agentDir, connector: sc, registry: { libraries: [] }, now: () => new Date(Date.now() + HOUR) })
  }
  // v2 package M: Codex's plan windows (the desktop's corner): `codex app-server`, three messages
  cli.phase = 'quota:codex'
  const q = await core.readCodexQuota({ kind: 'codex' }, deps('codex'))
  if (!q.ok) throw new Error(`${label}: the quota read failed on the stand-in: ${JSON.stringify(q)}`)
  return cli.calls
}

/** What is wrong with the captured calls ([] = 「不能动手」 everywhere) + what each phase made, for the controls. */
function callProblems(calls) {
  const problems = []
  const seen = {}
  for (const c of calls) {
    const quick = c.args[0] === '--version' || (c.kind === 'claude' && c.args[0] === 'auth') || (c.kind === 'codex' && c.args[0] === 'login')
    if (quick) continue
    const phase = c.phase ?? 'none'
    const key = `${phase}|${c.kind}`
    seen[key] = (seen[key] ?? 0) + 1
    // v2 package M: an app-server call is the quota read (its own allowlist: the argv and the three messages)
    const ps = c.kind === 'claude' ? claudeProblems(c.args, { mode: phase === 'agent' ? 'session' : 'once' })
      : c.args[0] === 'app-server' ? codexQuotaProblems(c.args, c.sent ?? []) : codexProblems(c.args, { cwd: c.cwd })
    if (Array.isArray(c.cwdEntries) ? c.cwdEntries.length > 0 : true) ps.push(`working folder not empty at start: ${JSON.stringify(c.cwdEntries)}`)
    // the folder is a throw-away one under the system's temporary folder (v1.0: <tmp>/<random>/cwd; the main agent: its own), never a library
    const rel = c.cwd ? relative(tmpdir(), c.cwd) : '..'
    if (rel.startsWith('..') || isAbsolute(rel)) ps.push(`working folder ${c.cwd} is not under the temporary folder`)
    if (c.cwd && existsSync(join(c.cwd, 'streams.json'))) ps.push(`working folder ${c.cwd} is a library`)
    for (const p of ps) problems.push(`${phase} ${c.kind}: ${p} — argv ${JSON.stringify(c.args)}`)
  }
  return { problems, seen }
}

// v2 package M: the quota read of Codex is one of the paths
const PHASES = ['round', 'ask', 'route'].flatMap(p => [[`${p}:claude-code`, 'claude'], [`${p}:codex`, 'codex']]).concat([['agent', 'claude'], ['agent', 'codex'], ['quota:codex', 'codex']])

test('N2 · every model call of a round, 问库, the routing and the main Agent, on Claude Code and Codex: no hands (allowlisted argv, empty folder)', async () => {
  const calls = await capture(realCore, realFake, 'real')
  const { problems, seen } = callProblems(calls)
  for (const [phase, kind] of PHASES) assert.ok((seen[`${phase}|${kind}`] ?? 0) >= 1, `control: ${phase} made a ${kind} call (${JSON.stringify(seen)})`)
  assert.ok(calls.some(c => c.phase === 'agent' && c.kind === 'claude' && c.args.includes('--resume')), 'control: the main Agent resumed its Claude Code session')
  assert.ok(calls.some(c => c.phase === 'agent' && c.kind === 'codex' && c.args[1] === 'resume'), 'control: the main Agent resumed its Codex session')
  assert.ok((seen['round:claude-code|claude'] ?? 0) >= 4, `control: a round is several calls (probe, gates, summary, judge): ${seen['round:claude-code|claude']}`)
  assert.deepEqual(problems, [])
})

test('N2 reverse: the allowlists report every planted tool, permission, folder, config, sandbox and network flag', () => {
  const claudeOnce = realCore.claudeArgv({ model: 'm', system: 's' })
  const claudeSession = realCore.claudeSessionArgv({ sessionId: '01234567-89ab-cdef-0123-456789abcdef' })
  const codexFirst = realCore.codexArgv({ cwd: 'C:\\w\\cwd', lastMessageFile: 'C:\\w\\last.txt', model: 'm' })
  const codexResume = realCore.codexResumeArgv({ sessionId: 'abc-123', lastMessageFile: 'C:\\w\\last.txt' })
  assert.deepEqual([claudeProblems(claudeOnce), claudeProblems(claudeSession, { mode: 'session' }), codexProblems(codexFirst, { cwd: 'C:\\w\\cwd' }), codexProblems(codexResume, { cwd: 'C:\\w\\cwd' })], [[], [], [], []], 'control: the product\'s own argv pass')
  const swap = (argv, from, to) => { const i = argv.indexOf(from); assert.ok(i >= 0, from); return [...argv.slice(0, i), ...to, ...argv.slice(i + 1)] }
  const claudePlants = [
    [...claudeOnce, '--allowedTools', 'Bash'], [...claudeOnce, '--dangerously-skip-permissions'], [...claudeOnce, '--add-dir', 'C:\\'],
    [...claudeOnce, '--mcp-config', 'x.json'], [...claudeOnce, '--permission-mode', 'bypassPermissions'], [...claudeOnce, '--settings', '{}'],
    [...claudeOnce, '--chrome'], [...claudeOnce, '--plugin-dir', 'p'], [...claudeOnce, '--continue'], [...claudeOnce, '--fork-session'],
    swap(claudeOnce, '--restricted', []), swap(claudeOnce, '--safe-mode', []),
    (() => { const a = [...claudeOnce]; a[a.indexOf('--tools') + 1] = 'Bash,Read,Write'; return a })(),
    (() => { const a = [...claudeOnce]; a[a.indexOf('--permission-prompts') + 1] = 'all'; return a })(),
    [...claudeOnce, '--tools', ''], [...claudeOnce, '--resume', 'abc'],
  ]
  for (const argv of claudePlants) assert.notDeepEqual(claudeProblems(argv), [], `not reported: ${JSON.stringify(argv)}`)
  assert.notDeepEqual(claudeProblems(swap(claudeSession, '--session-id', [])), [], 'a session call with no session flag')
  assert.notDeepEqual(claudeProblems([...claudeSession, '--resume', 'x'], { mode: 'session' }), [], 'both session flags')
  const codexPlants = [
    [...codexFirst.slice(0, -1), '--dangerously-bypass-approvals-and-sandbox', '-'], [...codexFirst.slice(0, -1), '--full-auto', '-'],
    [...codexFirst.slice(0, -1), '--add-dir', 'C:\\', '-'], [...codexFirst.slice(0, -1), '--search', '-'],
    [...codexFirst.slice(0, -1), '-c', 'sandbox_workspace_write.network_access=true', '-'], [...codexFirst.slice(0, -1), '--profile', 'p', '-'],
    (() => { const a = [...codexFirst]; a[a.indexOf('--sandbox') + 1] = 'workspace-write'; return a })(),
    (() => { const a = [...codexFirst]; a[a.indexOf('--sandbox') + 1] = 'danger-full-access'; return a })(),
    swap(codexFirst, '--sandbox', []).filter(x => x !== 'read-only'),
    (() => { const a = [...codexFirst]; a[a.indexOf('-C') + 1] = 'C:\\Users\\me'; return a })(),
    [...codexFirst.slice(0, -1), 'do the thing'],
  ]
  for (const argv of codexPlants) assert.notDeepEqual(codexProblems(argv, { cwd: 'C:\\w\\cwd' }), [], `not reported: ${JSON.stringify(argv)}`)
  const resumePlants = [
    (() => { const a = [...codexResume]; a[a.indexOf('-c') + 1] = 'sandbox_mode="workspace-write"'; return a })(),
    swap(codexResume, '-c', []).filter(x => x !== 'sandbox_mode="read-only"'),
    [...codexResume.slice(0, -2), '-c', 'tools.web_search=true', ...codexResume.slice(-2)],
    [...codexResume.slice(0, -2), '--sandbox', 'read-only', ...codexResume.slice(-2)],
  ]
  for (const argv of resumePlants) assert.notDeepEqual(codexProblems(argv, { cwd: 'C:\\w\\cwd' }), [], `not reported: ${JSON.stringify(argv)}`)
  // v2 package M: the stream-json argv — the old json one, --verbose missing or twice, another format: each reported
  assert.ok(claudeOnce.includes('--verbose') && claudeOnce[claudeOnce.indexOf('--output-format') + 1] === 'stream-json', 'control: the product passes stream-json --verbose')
  const formatPlants = [
    (() => { const a = [...claudeOnce]; a[a.indexOf('--output-format') + 1] = 'json'; return a })(),
    (() => { const a = [...claudeOnce]; a[a.indexOf('--output-format') + 1] = 'text'; return a })(),
    swap(claudeOnce, '--verbose', []), [...claudeOnce, '--verbose'], [...claudeOnce, '--include-partial-messages'],
    swap(claudeSession, '--verbose', []),
  ]
  for (const argv of formatPlants) assert.notDeepEqual(claudeProblems(argv, { mode: argv.includes('--session-id') ? 'session' : 'once' }), [], `not reported: ${JSON.stringify(argv)}`)
  // v2 package M: the app-server entry — its argv and what it was sent
  const sent = ['{"id":1,"method":"initialize","params":{"clientInfo":{"name":"streams","version":"2"}}}', '{"method":"initialized"}', '{"id":2,"method":"account/rateLimits/read"}']
  assert.deepEqual(codexQuotaProblems([...realCore.CODEX_QUOTA_ARGS], sent), [], 'control: the product\'s app-server call passes')
  const quotaPlants = [
    [['app-server', '--enable', 'web_search'], sent], [['app-server', '-c', 'sandbox_mode="danger-full-access"'], sent], [['app-server', '--listen', 'ws://0.0.0.0:9'], sent], [['exec', '--json'], sent],
    [['app-server'], [...sent, '{"id":3,"method":"account/rateLimitResetCredit/use"}']], [['app-server'], [...sent, '{"id":3,"method":"thread/start","params":{}}']],
    [['app-server'], [...sent, '{"id":3,"method":"turn/start","params":{}}']], [['app-server'], sent.slice(0, 2)], [['app-server'], [sent[0], sent[2], sent[1]]], [['app-server'], [...sent, 'not json']],
  ]
  for (const [argv, lines] of quotaPlants) assert.notDeepEqual(codexQuotaProblems(argv, lines), [], `not reported: ${JSON.stringify(argv)} ${JSON.stringify(lines.at(-1))}`)
})

const MUTANTS = [
  { id: 'n02-claude-tool', what: 'v1.0\'s Claude Code set gives the model Bash', phase: 'round:claude-code claude', edits: [{ file: 'connect/claude-code.mjs', from: "  '--tools', '',", to: "  '--tools', 'Bash',"  }] },
  { id: 'n02-session-tool', what: 'the main agent\'s Claude Code call gets --allowedTools', phase: 'agent claude', edits: [{ file: 'connect/session.mjs', from: "  if (model) argv.push('--model', model);\n  if (system) argv.push('--system-prompt', system);", to: "  argv.push('--allowedTools', 'Bash');\n  if (model) argv.push('--model', model);\n  if (system) argv.push('--system-prompt', system);" }] },
  { id: 'n02-codex-write', what: 'Codex\'s first call in a writable sandbox', phase: 'round:codex codex', edits: [{ file: 'connect/codex.mjs', from: "  '--sandbox', 'read-only',", to: "  '--sandbox', 'workspace-write',"  }] },
  { id: 'n02-codex-resume-write', what: 'Codex\'s resume in a writable sandbox', phase: 'agent codex', edits: [{ file: 'connect/session.mjs', from: `export const CODEX_READ_ONLY_CONFIG = 'sandbox_mode="read-only"';`, to: `export const CODEX_READ_ONLY_CONFIG = 'sandbox_mode="workspace-write"';` }] },
  // v2 package M: the quota read sends a fourth message (an account action), and Claude Code's set loses --verbose for json
  { id: 'n02-quota-fourth', what: 'the Codex quota read also sends account/rateLimitResetCredit/use', phase: 'quota:codex codex', edits: [{ file: 'connect/codex-quota.mjs', from: '        ctl.send(message(CODEX_QUOTA_METHODS[2], 2));', to: "        ctl.send(message(CODEX_QUOTA_METHODS[2], 2));\n        ctl.send(JSON.stringify({ id: 3, method: 'account/rateLimitResetCredit/use' }));" }] },
  { id: 'n02-quota-argv', what: 'the Codex quota read starts app-server with a feature on', phase: 'quota:codex codex', edits: [{ file: 'connect/codex-quota.mjs', from: "export const CODEX_QUOTA_ARGS = Object.freeze(['app-server']);", to: "export const CODEX_QUOTA_ARGS = Object.freeze(['app-server', '--enable', 'web_search']);" }] },
]

for (const m of MUTANTS) {
  test(`N2 reverse (mutant ${m.id}): ${m.what} → the run-time scan is red at ${m.phase}`, async () => {
    const mc = await mutantCore(m.id, m.edits)
    // the scripted answers come from the real core's stand-in: they do not depend on the line changed
    const { problems } = callProblems(await capture(mc, realFake, m.id))
    assert.ok(problems.some(p => p.startsWith(m.phase)), `not caught at ${m.phase}: ${JSON.stringify(problems.slice(0, 3))}`)
  })
}

