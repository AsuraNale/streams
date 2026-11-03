// The ask-the-library service (src/main/services/ask.mjs) in plain Node, on a library the core itself wrote
// (test/support/seed.mjs): every method needs a library (no_library); no connection chosen → no_connection and the core is
// not asked; one question at a time (a second while the first runs → bad_arguments; after it ends, or fails, the next is
// taken); the core's answer comes back as it is, a connection failure included; the model calls count in usage.jsonl under
// `ask`; demands and feedback go through the core, empty ones refused. The real core's ask runs when it is there
// (core/src/ask/), and is skipped otherwise.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as realCore from '../src/main/core.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createAskService } from '../src/main/services/ask.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { seedLibrary } from './support/seed.mjs'

const W5 = ['ask', 'demands', 'addDemand', 'answerFeedback'].every(n => typeof realCore[n] === 'function')
const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })

/** A connector that answers every complete() with `json`, counting the calls. */
function fixedConnector(json) {
  const c = { kind: 'api', calls: 0 }
  c.complete = async () => { c.calls++; return { ok: true, json, text: JSON.stringify(json), usage: { calls: 1, inputTokens: 10, outputTokens: 5 }, model: 'test-model' } }
  c.probe = async () => ({ ok: true, latencyMs: 1 })
  c.detect = async () => ({ installed: true, loggedIn: true })
  return c
}

async function world({ seeded = true, active = null, core } = {}) {
  const w = testWorld('st-ask-')
  worlds.push(w)
  const dir = join(w.root, 'lib')
  const seed = seeded ? await seedLibrary(dir) : null
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, devLibrary: seeded ? dir : null })
  const state = { active }
  const connections = { active: () => state.active }
  const svc = createAskService({ library, connections, log: w.log, ...(core ? { core } : {}) })
  return { w, dir, seed, h: svc.handlers, svc, state }
}
const usageOf = dir => {
  const p = join(dir, '_pipeline', 'usage.jsonl')
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
}

test('without a library every method is no_library; without a connection askLibrary is no_connection and the core is not asked', async () => {
  const none = await world({ seeded: false, active: { kind: 'api', connector: fixedConnector({}) } })
  for (const [name, args] of [['askLibrary', ['q']], ['getDemands', []], ['addDemand', ['t', '']], ['answerFeedback', ['q', 'n']]]) {
    await assert.rejects(async () => none.h[name](...args), err => err.code === 'no_library', name)
  }
  let asked = 0
  const { h } = await world({ core: { ...realCore, ask: async () => { asked++; return {} } } })
  await assert.rejects(async () => h.askLibrary('库里有什么？'), err => err.code === 'no_connection')
  assert.equal(asked, 0)
})

test('one question at a time; the answer as the core gives it (a connection failure is data); the calls count under ask', async () => {
  let release
  const seen = []
  const core = {
    ...realCore,
    ask: async (dir, question, o) => {
      seen.push({ dir, question, o })
      if (question === 'fails') throw new realCore.StreamsError('EIO', 'disk')
      if (question === 'expired') return { ok: false, code: 'login-expired', calls: 1 }
      await o.connector.complete({ prompt: 'x', format: 'json', model: 'main' })
      if (question === 'slow') await new Promise(r => { release = r })
      return { answer: [{ text: 'a', cites: [1] }], sources: [], notInLibrary: false, calls: 1 }
    },
  }
  const connector = fixedConnector({ ok: 1 })
  const { dir, h, svc } = await world({ core, active: { kind: 'api', connector } })
  const first = h.askLibrary('  slow  ')
  await new Promise(r => setImmediate(r))
  assert.equal(svc.isAsking(), true)
  await assert.rejects(async () => h.askLibrary('second'), err => err.code === 'bad_arguments', 'a second question while one runs')
  release()
  const r = await first
  assert.deepEqual(r.answer, [{ text: 'a', cites: [1] }])
  assert.equal(seen[0].question, 'slow', 'trimmed')
  assert.equal(typeof seen[0].o.now, 'function')
  assert.equal(svc.isAsking(), false)
  assert.deepEqual(usageOf(dir).filter(u => u.purpose === 'ask').map(u => [u.kind, u.model, u.calls]), [['api', 'test-model', 1]], 'the model call is in the usage under ask')
  assert.equal(connector.calls, 1)
  assert.deepEqual(await h.askLibrary('expired'), { ok: false, code: 'login-expired', calls: 1 })
  await assert.rejects(async () => h.askLibrary('fails'), err => err.code === 'internal')
  assert.equal(svc.isAsking(), false, 'a failure frees the slot')
  assert.ok((await h.askLibrary('again')).answer)
})

test('demands and feedback through the core: trimmed, the clock passed; empty topic or note → bad_arguments', async () => {
  const calls = []
  const core = {
    ...realCore,
    demands: () => [{ topic: 't', count: 3, last: 'x', suggest: true }],
    addDemand: (dir, topic, o) => { calls.push(['addDemand', topic, o]); if (topic === '') throw new realCore.StreamsError('bad-topic', 'x'); return { topic, count: 1 } },
    answerFeedback: (dir, row, o) => { calls.push(['answerFeedback', row, typeof o.now]); if (!row.note) throw new realCore.StreamsError('bad-feedback', 'x'); return { ok: true } },
  }
  const { h } = await world({ core })
  assert.deepEqual(h.getDemands(), [{ topic: 't', count: 3, last: 'x', suggest: true }])
  assert.deepEqual(h.addDemand('  agent 记忆 ', ' 问的是什么 '), { topic: 'agent 记忆', count: 1 })
  assert.equal(h.addDemand('MCP', '  ').topic, 'MCP')
  assert.deepEqual([calls[0][2].question, typeof calls[0][2].now, 'question' in calls[1][2]], ['问的是什么', 'function', false])
  assert.throws(() => h.addDemand('  ', ''), err => err.code === 'bad_arguments')
  assert.deepEqual(h.answerFeedback(' q ', ' 第二句不对 '), { ok: true })
  assert.deepEqual(calls.at(-1), ['answerFeedback', { question: 'q', note: '第二句不对' }, 'function'])
  assert.throws(() => h.answerFeedback('q', '   '), err => err.code === 'bad_arguments')
})

test('the real core: nothing in the library on it → notInLibrary with 0 calls; a hit → an answer on the connection, its calls in the usage; demands and feedback on disk', { skip: W5 ? false : 'core W5 (ask/) not landed yet' }, async () => {
  const connector = fixedConnector({ answer: [{ text: '库里有一条讲记忆块的。', cites: [1] }], notInLibrary: false, missing: '', claimed: [], items: [] })
  const { dir, seed, h } = await world({ active: { kind: 'api', connector } })
  const miss = await h.askLibrary('zzqx 完全不相干的词 qqzz')
  assert.equal(miss.notInLibrary, true)
  assert.equal(miss.calls, 0)
  assert.equal(connector.calls, 0)
  const hit = await h.askLibrary(seed.kept.title)
  assert.ok(Array.isArray(hit.answer))
  assert.ok(hit.calls >= 1)
  assert.equal(usageOf(dir).filter(u => u.purpose === 'ask').length, connector.calls, 'every model call of the question is in the usage')
  const added = h.addDemand('agent 评测基准', '有没有评测基准？')
  assert.equal(added.topic, 'agent 评测基准')
  assert.ok(h.getDemands().some(d => d.topic === 'agent 评测基准'))
  assert.deepEqual(h.answerFeedback('有没有评测基准？', '漏了一条'), { ok: true })
  assert.ok(existsSync(join(dir, '_pipeline', 'feedback.jsonl')))
  assert.throws(() => h.addDemand('   ', ''), err => err.code === 'bad_arguments')
})
