// N5（草案，待 维护者 定）· 主 Agent 会话缓存丢失（删掉 session.json）后，对话能从正本接着进行
//
// How it is checked: the desktop's agent service (services/agent.mjs, as main.mjs wires it) with the real session
// connector of the core (connect/session.mjs) for Claude Code and for Codex, on a stand-in for spawn
// (./support/fake-cli.mjs: no CLI runs, no model is called; it keeps the session ids it handed out, as the CLIs do). What
// the model would be given is what the stand-in read on stdin.
//   1. six long turns push the conversation over the compression threshold: one summary row (the one-off call's answer,
//      with a mark SUMMARY-N5) is in the transcript and the session is let go;
//   2. the next turn opens a new session (--session-id / a first `codex exec`) and its prompt carries the summary and the
//      recent turns; the turn after resumes it (--resume / `exec resume`) and its prompt does NOT carry them (control: the
//      check can tell the two apart);
//   3. session.json deleted → the next turn: a new session with a new id, its prompt carrying the summary and the
//      sentence of the turn before; the reply is recorded; the turns go on numbering; session.json is written again;
//   4. (also) the CLI no longer knows the session (session.json still names it) → the resume fails, the turn says so once
//      and goes on in a new session with the summary.
// Reverse: a mutant of the core whose new session is opened without the transcript's context → red at 「summary in the
// prompt」; and the step-2 control above (a resumed turn has no summary in its prompt).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { caseDir } from '../support/paths.mjs'
import { mutantApp, realApp } from './support/mutant-app.mjs'
import { servicesWorld } from './support/services.mjs'
import { fakeCli } from './support/fake-cli.mjs'

const MARK = 'SUMMARY-N5'
const long = (n, word) => `第 ${n} 句：${word.repeat(Math.floor(3800 / word.length))}`

async function scenario(app, label, kind) {
  const problems = []
  const want = (ok, what) => { if (!ok) problems.push(what) }
  const core = await app.core()
  let replyN = 0
  const cli = fakeCli({
    name: `n05-${label}-${kind}`,
    answer: call => {
      const oneOff = call.args.includes('--no-session-persistence') || call.args.includes('--ephemeral')
      if (oneOff) return JSON.stringify({ summary: `${MARK}：用户要建电动车行业的库，问过港股要不要算，答了要。` })
      replyN += 1
      return JSON.stringify({ reply: replyN <= 6 ? `回答 ${replyN}：${'好'.repeat(3700)}` : `回答 ${replyN}` })
    },
  })
  const deps = { spawnImpl: cli.spawnImpl, env: cli.env, tmpRoot: caseDir(`n05-${label}-${kind}-tmp`), timeoutMs: 20_000 }
  const w = await servicesWorld(app, {
    name: `n05-${label}-${kind}`, kind, libraries: [{ key: 'ev', name: '中国电动车行业' }],
    connector: (k, o) => core.createSessionConnector({ kind: k }, deps, { cwd: o.cwd }),
  })
  const agentDir = join(w.appData, core.AGENT_DIR)
  const sessionFile = join(agentDir, core.SESSION_FILE)
  const rows = () => core.readTranscript(agentDir).rows
  const isNew = c => (kind === 'claude-code' ? c.args.includes('--session-id') : c.args[0] === 'exec' && c.args[1] !== 'resume')
  const isResume = c => (kind === 'claude-code' ? c.args.includes('--resume') : c.args[1] === 'resume')
  const idOf = c => (kind === 'claude-code' ? c.args[c.args.indexOf(isNew(c) ? '--session-id' : '--resume') + 1] : null)
  const sessionCalls = () => cli.calls.filter(c => !c.args.includes('--no-session-persistence') && !c.args.includes('--ephemeral') && c.args[0] !== '--version' && !c.args.includes('status'))
  const say = async text => { const before = sessionCalls().length; const r = await w.agent.handlers.agentSend(text); return { r, calls: sessionCalls().slice(before) } }

  // 1. six long turns: compression
  for (let n = 1; n <= 6; n++) await say(long(n, '电动车销量和电池'))
  const summaries = rows().filter(r => r.role === 'summary')
  want(summaries.length === 1 && summaries[0].text.includes(MARK), `compression: one summary row with the mark (${summaries.length})`)
  // 2. a new session with the context, then a resume without it
  const t7 = await say('第 7 句：港股公告也追踪吗？')
  want(t7.calls.length === 1 && isNew(t7.calls[0]), `after compression: a new session (${JSON.stringify(t7.calls.map(c => c.args.slice(0, 3)))})`)
  want(t7.calls[0]?.input.includes(MARK), 'summary in the prompt of the new session after compression')
  const t8 = await say('第 8 句：那就先这样。')
  want(t8.calls.length === 1 && isResume(t8.calls[0]), 'the turn after: a resume')
  want(t8.calls[0] && !t8.calls[0].input.includes(MARK), 'control: a resumed turn carries no summary (the session holds it)')
  const idBefore = kind === 'claude-code' ? idOf(t7.calls[0]) : JSON.parse(readFileSync(sessionFile, 'utf8'))?.[kind]?.sessionId ?? JSON.stringify(JSON.parse(readFileSync(sessionFile, 'utf8')))
  // 3. session.json deleted
  want(existsSync(sessionFile), 'control: session.json was there')
  rmSync(sessionFile)
  const turnsBefore = rows().filter(r => r.role === 'you').length
  const t9 = await say('第 9 句：接着说。')
  want(t9.r?.reply === `回答 ${replyN}`, `the turn after the loss has its reply (${JSON.stringify(t9.r?.reply)})`)
  want(t9.calls.length === 1 && isNew(t9.calls[0]), `session.json gone: a new session (${JSON.stringify(t9.calls.map(c => c.args.slice(0, 3)))})`)
  if (kind === 'claude-code') want(idOf(t9.calls[0]) !== idBefore, 'session.json gone: a new session id')
  want(t9.calls[0]?.input.includes(MARK), 'summary in the prompt after session.json was deleted')
  want(t9.calls[0]?.input.includes('第 8 句：那就先这样。'), 'the turn before in the prompt after session.json was deleted')
  const you = rows().filter(r => r.role === 'you')
  want(you.length === turnsBefore + 1 && you.at(-1).turn === 9, `the transcript goes on (${you.at(-1)?.turn})`)
  want(existsSync(sessionFile), 'session.json written again')
  // 4. the CLI forgot the session
  cli.sessions.clear()
  const t10 = await say('第 10 句：还在吗？')
  want(t10.calls.length === 2 && isResume(t10.calls[0]) && isNew(t10.calls[1]), `a session the CLI forgot: resume, then a new one (${JSON.stringify(t10.calls.map(c => c.args.slice(0, 3)))})`)
  want(t10.calls[1]?.input.includes(MARK), 'summary in the prompt after the CLI lost the session')
  want((t10.r?.notice ?? []).some(n => n.code === 'session-rebuilt'), `the turn says the session was rebuilt (${JSON.stringify(t10.r?.notice)})`)
  return problems
}

for (const kind of ['claude-code', 'codex']) {
  test(`N5 · ${kind}: session.json deleted → the conversation goes on from the transcript (a new session, the summary and the last turns in its prompt)`, async () => {
    assert.deepEqual(await scenario(realApp(), 'real', kind), [])
  })
}

test('N5 reverse: a new session opened without the transcript\'s context (mutant) → red at 「summary in the prompt」', async () => {
  const app = await mutantApp('n05-no-history', [{ file: 'core/src/agent/turn.mjs', from: '  const fullPrompt = (instr) => [history, sit, thisTurn, ...pieces, instr].filter(nonEmpty).join(\'\\n\\n\');', to: '  const fullPrompt = (instr) => [sit, thisTurn, ...pieces, instr].filter(nonEmpty).join(\'\\n\\n\');' }])
  const problems = await scenario(app, 'mutant', 'claude-code')
  assert.ok(problems.some(p => p.startsWith('summary in the prompt after session.json was deleted')), JSON.stringify(problems))
  assert.equal(app.untouched(), true)
})
