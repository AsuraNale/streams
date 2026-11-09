// v2 draft: Claude Code and Codex as the product's connectors see them, without a real CLI and without a model: a stand-in
// for child_process.spawn (the connectors take it as deps.spawnImpl) that records every call (file, argv, working folder,
// what came in on stdin) and answers the way the real CLIs print — Claude Code's one JSON envelope on stdout, Codex's
// JSONL events — with a text the test decides from the call. A folder with an empty claude.exe and codex.exe stands in
// for PATH, so the connectors' own lookup (which.mjs, codexCandidates) finds them; nothing is ever executed.
//
//   const cli = fakeCli({ answer: call => '{"ok":true}' })    answer(call) → the model's text (or a Promise of it), or { fail }
//   cli.spawnImpl · cli.calls · cli.env (PATH etc.) · cli.phase = 'round'   (each call is tagged with the phase at its start)
//   call = { file, args, cwd, input, phase, kind: 'claude' | 'codex', cwdEntries (what was in cwd when it started) }
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { caseDir } from '../../support/paths.mjs'

export function fakeCli({ name = 'cli', answer = () => '{"ok":true}', sessions = new Set() } = {}) {
  const bin = caseDir(`fake-cli-${name}-bin`)
  const empty = caseDir(`fake-cli-${name}-empty`)
  for (const exe of ['claude.exe', 'codex.exe']) writeFileSync(join(bin, exe), '')
  mkdirSync(empty, { recursive: true })
  const cli = {
    calls: [],
    phase: null,
    sessions, // ids a resume may use; anything else is answered as the real CLIs do for a session that is not there
    env: { PATH: bin, Path: bin, PATHEXT: '.EXE;.CMD', LOCALAPPDATA: empty, APPDATA: empty, USERPROFILE: empty, SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' },
  }
  cli.spawnImpl = function spawn(file, args, opts = {}) {
    const kind = /claude/i.test(basename(file)) ? 'claude' : 'codex'
    let cwdEntries = null
    try { cwdEntries = opts.cwd ? readdirSync(opts.cwd) : null } catch { cwdEntries = 'missing' }
    const call = { file, args: [...args], cwd: opts.cwd ?? null, input: '', phase: cli.phase, kind, cwdEntries }
    cli.calls.push(call)
    const child = new EventEmitter()
    child.pid = 4242
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => { setImmediate(() => child.emit('close', null, 'SIGTERM')); return true }
    child.unref = () => {}
    const chunks = []
    let done = false
    const finish = async () => {
      if (done) return
      done = true
      const { stdout, status } = await reply(call)
      child.stdout.end(stdout)
      child.stderr.end()
      setImmediate(() => child.emit('close', status, null))
    }
    child.stdin = new Writable({
      write(chunk, _e, cb) { chunks.push(Buffer.from(chunk)); cb() },
      final(cb) { call.input = Buffer.concat(chunks).toString('utf8'); cb(); setImmediate(finish) },
    })
    setImmediate(() => child.emit('spawn'))
    // a call that never writes stdin (--version, status) answers at once
    if (args[0] === '--version' || args.includes('status')) setImmediate(finish)
    return child
  }

  async function reply(call) {
    const a = call.args
    if (a[0] === '--version') return { stdout: call.kind === 'claude' ? '2.1.287 (Claude Code)\n' : 'codex-cli 0.166.0\n', status: 0 }
    if (a.includes('status')) return { stdout: call.kind === 'claude' ? '{"loggedIn":true}\n' : 'Logged in\n', status: 0 }
    if (call.kind === 'claude') {
      const resume = a.indexOf('--resume')
      const fresh = a.indexOf('--session-id')
      if (resume >= 0 && !cli.sessions.has(a[resume + 1])) {
        return { stdout: `${JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: `No conversation found with session ID: ${a[resume + 1]}` })}\n`, status: 1 }
      }
      const sid = resume >= 0 ? a[resume + 1] : fresh >= 0 ? a[fresh + 1] : randomUUID()
      if (fresh >= 0) cli.sessions.add(sid)
      const text = await answer(call)
      if (text && typeof text === 'object' && text.fail) return { stdout: `${JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'OAuth session expired and could not be refreshed' })}\n`, status: 1 }
      return { stdout: `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: sid, usage: { input_tokens: 5, output_tokens: 3 } })}\n`, status: 0 }
    }
    // codex exec [resume <id>] … -
    const resuming = a[1] === 'resume'
    let thread = randomUUID()
    if (resuming) {
      const id = a.at(-2)
      if (!cli.sessions.has(id)) return { stdout: `${JSON.stringify({ type: 'error', message: `thread/resume failed: no rollout found for thread id ${id}` })}\n`, status: 1 }
      thread = id
    } else cli.sessions.add(thread)
    const text = await answer(call)
    const events = [
      { type: 'thread.started', thread_id: thread },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'i0', type: 'agent_message', text } },
      { type: 'turn.completed', usage: { input_tokens: 9, cached_input_tokens: 0, output_tokens: 2 } },
    ]
    return { stdout: `${events.map(e => JSON.stringify(e)).join('\n')}\n`, status: 0 }
  }
  return cli
}

/** The argv value after a flag, or undefined. */
export const flagValue = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
