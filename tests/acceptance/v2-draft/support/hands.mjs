// v2 draft N2: 「不能动手」 as a property of an argv, and where in the product a process can be started at all.
//
//   claudeProblems(argv, { mode })    [] when this `claude` argv gives the model no tool, no folder, no permission and no
//                                     config of its own; mode 'once' (v1.0: --no-session-persistence, no session flag) or
//                                     'session' (the main agent: exactly one of --session-id / --resume, nothing kept off disk
//                                     otherwise)
//   codexProblems(argv, { cwd })      [] when this `codex` argv is `exec` in the read-only sandbox (first call: --sandbox
//                                     read-only; a resume: -c sandbox_mode="read-only"), with no flag that would give it a
//                                     tool, the network, a folder or a config of its own; `-C` (when given) is `cwd`
//   codexQuotaProblems(argv, sent)    [] when a `codex app-server` call is the quota read (v2 package M): argv exactly
//                                     ['app-server'], the lines sent exactly initialize · initialized · account/rateLimits/read
//   spawnSites(files)                 every place in the given sources that can start a process: [{ file, line, call, text }]
//
// Both predicates are allowlists: every flag must be one of the ones the product is known to pass, with the value it must
// have; anything else — a flag the CLI added later included — is a problem. So a tool slipped in under a new name is
// reported as well as the known ones (--allowedTools, --dangerously-skip-permissions, --full-auto, …).
import { stripComments } from '../../support/source-scan.mjs'

// claude: flag → null (takes no value) | a check of its value
const CLAUDE_FLAGS = {
  '-p': null,
  // v2 package M: the stream (for the plan's rate_limit_event) instead of one envelope; --verbose goes with it and adds no tool
  '--output-format': v => v === 'stream-json',
  '--verbose': null,
  '--safe-mode': null,
  '--restricted': null,
  '--tools': v => v === '',
  '--strict-mcp-config': null,
  '--disable-slash-commands': null,
  '--no-session-persistence': null,
  '--permission-prompts': v => v === 'none',
  '--model': v => typeof v === 'string' && v !== '' && !v.startsWith('-'),
  '--system-prompt': v => typeof v === 'string',
  '--session-id': v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v ?? ''),
  '--resume': v => /^[A-Za-z0-9._:-]{1,200}$/.test(v ?? ''),
}
const CLAUDE_REQUIRED = ['-p', '--output-format', '--verbose', '--safe-mode', '--restricted', '--tools', '--strict-mcp-config', '--disable-slash-commands', '--permission-prompts']

// v2 package M: Codex's quota is read from `codex app-server` (core connect/codex-quota.mjs) — no thread, no turn, no model.
// The argv is exactly this, and the only messages sent are these three, in this order (anything else is a problem).
export const CODEX_QUOTA_ARGV = Object.freeze(['app-server'])
export const CODEX_QUOTA_SENT = Object.freeze(['initialize', 'initialized', 'account/rateLimits/read'])

/** [] when an app-server call is the quota read and nothing else: its argv, and the methods of the lines it was sent. */
export function codexQuotaProblems(argv, sentLines = []) {
  const problems = []
  if (JSON.stringify(argv) !== JSON.stringify(CODEX_QUOTA_ARGV)) problems.push(`app-server argv ${JSON.stringify(argv)} (want ${JSON.stringify(CODEX_QUOTA_ARGV)})`)
  const methods = []
  for (const line of sentLines) {
    let m = null
    try { m = JSON.parse(line) } catch { problems.push(`a line that is not JSON-RPC: ${JSON.stringify(line).slice(0, 80)}`); continue }
    methods.push(m?.method)
    if (!CODEX_QUOTA_SENT.includes(m?.method)) problems.push(`sent ${JSON.stringify(m?.method)}`)
  }
  if (JSON.stringify(methods) !== JSON.stringify(CODEX_QUOTA_SENT)) problems.push(`sent ${JSON.stringify(methods)} (want exactly ${JSON.stringify(CODEX_QUOTA_SENT)})`)
  return problems
}

export function claudeProblems(argv, { mode = 'once' } = {}) {
  const problems = []
  const seen = new Map()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!Object.hasOwn(CLAUDE_FLAGS, a)) { problems.push(`not allowed: ${JSON.stringify(a)}`); continue }
    seen.set(a, (seen.get(a) ?? 0) + 1)
    const check = CLAUDE_FLAGS[a]
    if (check) {
      const v = argv[i + 1]
      if (!check(v)) problems.push(`${a} ${JSON.stringify(v)}: not the value it must have`)
      i++
    }
  }
  for (const f of CLAUDE_REQUIRED) if (!seen.has(f)) problems.push(`${f} missing`)
  for (const [f, n] of seen) if (n > 1) problems.push(`${f} given ${n} times`)
  const sessionFlags = ['--session-id', '--resume'].filter(f => seen.has(f))
  if (mode === 'once') {
    if (!seen.has('--no-session-persistence')) problems.push('--no-session-persistence missing (a one-off call keeps nothing)')
    if (sessionFlags.length) problems.push(`a one-off call with ${sessionFlags.join(', ')}`)
  } else {
    if (sessionFlags.length !== 1) problems.push(`a session call needs exactly one of --session-id / --resume (${sessionFlags.join(', ') || 'none'})`)
  }
  return problems
}

const READ_ONLY = 'sandbox_mode="read-only"'
// codex exec: flag → null | a check of its value (given the call's working folder)
const CODEX_FLAGS = {
  '--json': null,
  '--sandbox': v => v === 'read-only',
  '--skip-git-repo-check': null,
  '--ephemeral': null,
  '--ignore-user-config': null,
  '--ignore-rules': null,
  '--color': v => v === 'never',
  '-C': (v, { cwd }) => cwd === undefined || v === cwd,
  '-o': (v, { cwd }) => typeof v === 'string' && v !== '' && (cwd === undefined || !v.startsWith(`${cwd}\\`) && !v.startsWith(`${cwd}/`)),
  '-m': v => typeof v === 'string' && v !== '' && !v.startsWith('-'),
  '-c': v => v === READ_ONLY,
}

export function codexProblems(argv, { cwd } = {}) {
  const problems = []
  if (argv[0] !== 'exec') return [`not \`codex exec\` (${JSON.stringify(argv[0])})`]
  const resume = argv[1] === 'resume'
  const rest = argv.slice(resume ? 2 : 1)
  const seen = new Map()
  const positional = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '-') { positional.push(a); continue }
    if (!a.startsWith('-')) { positional.push(a); continue }
    if (!Object.hasOwn(CODEX_FLAGS, a)) { problems.push(`not allowed: ${JSON.stringify(a)}`); continue }
    seen.set(a, (seen.get(a) ?? 0) + 1)
    const check = CODEX_FLAGS[a]
    if (check) {
      const v = rest[i + 1]
      if (!check(v, { cwd })) problems.push(`${a} ${JSON.stringify(v)}: not the value it must have`)
      i++
    }
  }
  for (const [f, n] of seen) if (n > 1) problems.push(`${f} given ${n} times`)
  for (const f of ['--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules']) if (!seen.has(f)) problems.push(`${f} missing`)
  if (resume) {
    if (!seen.has('-c')) problems.push(`a resume without -c ${READ_ONLY}`)
    if (seen.has('--sandbox')) problems.push('a resume with --sandbox (codex exec resume does not take it)')
    if (positional.length !== 2 || positional[1] !== '-' || !/^[A-Za-z0-9._:-]{1,200}$/.test(positional[0])) problems.push(`a resume is <session id> - (got ${JSON.stringify(positional)})`)
  } else {
    if (!seen.has('--sandbox')) problems.push('--sandbox read-only missing')
    if (seen.has('-c')) problems.push('a first call with -c')
    if (JSON.stringify(positional) !== '["-"]') problems.push(`the prompt is read from stdin only (got ${JSON.stringify(positional)})`)
  }
  return problems
}

// ---- where a process can be started --------------------------------------------------------------------------------
// the product's own wrappers and Node's: a call of any of these starts (or would start) another program
// v2 package M: runDialogue (process.mjs; the app-server's line-by-line exchange) is one of them
const SPAWN_CALLS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork', 'runProcess', 'runInEmptyDir', 'runQuick', 'launchDetached', 'openLoginWith', 'runDialogue']
const SPAWN_RE = new RegExp(`(?<![\\w$.])(${SPAWN_CALLS.join('|')}|nodeSpawn|spawnImpl)\\s*\\(`, 'g')

export function spawnSites(files) {
  const out = []
  for (const { rel, text } of files) {
    const code = stripComments(text)
    for (const m of code.matchAll(SPAWN_RE)) {
      const before = code.slice(Math.max(0, m.index - 30), m.index)
      if (/\bfunction\s+$/.test(before) || /\bexport\s+(async\s+)?function\s+$/.test(before)) continue // the definition itself
      const lineStart = code.lastIndexOf('\n', m.index) + 1
      const lineEnd = code.indexOf('\n', m.index)
      out.push({ file: rel, line: code.slice(0, m.index).split('\n').length, call: m[1], text: code.slice(lineStart, lineEnd < 0 ? code.length : lineEnd).trim() })
    }
  }
  return out
}
