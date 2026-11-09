// The library's chat box routed (v2 package E, contract E2; src/main/services/ask.mjs; docs/desktop.md §4.7) in plain Node, on
// two libraries the library service registered (the current one is b), the real main agent service of package C on the core's
// scripted stand-in (scriptedAgentConnector) and the real proposals service, and a fake connection for the routing call and
// for asking the library (no real model anywhere; nothing under the real app data). Each rule first gets the input made to
// break it: question → the core's ask (same path as askLibrary), the agent not called; change → the agent with the current
// library's id, ask not called; unsure → neither; resolveLibraryMessage takes the route you chose without routing;
// _pipeline/routes.jsonl append only; one sentence at a time (shared with askLibrary); the bridge's three tables; main.mjs.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as realCore from '../src/main/core.mjs'
import { createAskService } from '../src/main/services/ask.mjs'
import { createAgentService } from '../src/main/services/agent.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createProposalsService } from '../src/main/services/proposals.mjs'
import { BRIDGE_METHODS, checkArgs, runHandler } from '../src/main/bridge-methods.mjs'
import { ROUTE_PROMPT_HEAD, addSource, addTopic, agentPaths, createLibrary, readTranscript, scriptedAgentConnector } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { bridgeTable } from './support/docs.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })
const CLOCK = new Date('2026-11-09T16:00:00.000Z')
const now = () => CLOCK

const UC3_CHANGE = '以后也追踪港股服装公司的公告。'
const UC3_QUESTION = '安踏和李宁三季度谁的流水更好？'
const BOTH = '以后会怎样？'

/**
 * The fake connection of the page's choice: a routing prompt is answered from `route` (an object, 'bad', or a function
 * returning a promise), anything else (asking the library) with an empty answer. Counts both kinds of calls.
 */
function askConnection({ route = { route: 'question', confidence: 0.9 } } = {}) {
  const c = { kind: 'api', routeCalls: [], otherCalls: [] }
  c.complete = async req => {
    const routing = req.prompt.startsWith(ROUTE_PROMPT_HEAD)
    ;(routing ? c.routeCalls : c.otherCalls).push(req)
    const a = routing ? (typeof route === 'function' ? await route(req) : route) : { answer: [], notInLibrary: true, missing: '' }
    if (a === 'bad') return { ok: false, code: 'bad-format', text: 'nope', usage: { calls: 1 }, model: 'test-model' }
    return { ok: true, json: a, text: JSON.stringify(a), usage: { calls: 1 }, model: 'test-model' }
  }
  c.probe = async () => ({ ok: true, latencyMs: 1 })
  c.detect = async () => ({ installed: true, loggedIn: true })
  // the session way is the main agent's only: the chat box's routing must never take it
  c.send = async () => { throw new Error('routing used send()') }
  return c
}

/**
 * Libraries a and b (b current), the proposals and agent services (package B, C), the ask service wired to the agent as
 * main.mjs wires it, the core's ask spied on (and slowed when `askGate` is given).
 */
async function setup({ conn = askConnection(), agentAnswers = [{ reply: '收到，我提议了一张卡，等你确认。' }], chosen = true, askGate = null } = {}) {
  const w = testWorld('st-route-e-')
  worlds.push(w)
  const appData = join(w.root, 'appData')
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now, agentUsageFile: agentPaths(join(appData, 'agent')).usage })
  for (const name of ['a', 'b']) {
    const dir = join(w.root, name)
    createLibrary(dir, { name })
    addTopic(dir, { name: '财报', keywords: ['财报'] })
    addSource(dir, { name: 'feed-a', kind: 'rss', url: 'https://example.com/a.xml', topic: '财报' })
    w.dialogAnswers.push(dir)
    await library.handlers.chooseLibraryFolder()
    await library.handlers.useChosenFolder(name)
  }
  const [ia, ib] = library.entries().map(l => l.id)
  const agentConn = scriptedAgentConnector({ answers: agentAnswers })
  const connections = {
    devConnection: null,
    active: () => (chosen ? { kind: 'api', connector: conn } : null),
    sessionConnector: () => agentConn,
  }
  const proposals = createProposalsService({ appDataDir: appData, library, emit: w.emit, log: w.log, now, scratchRoot: join(w.root, 'scratch') })
  // the CLI working folder of this world's own (the stand-in runs no process; nothing shared with another suite)
  const agent = createAgentService({ appDataDir: appData, library, connections, proposals, emit: w.emit, log: w.log, now, cwd: join(w.root, 'agent-cwd') })
  const asked = []
  const core = {
    ...realCore,
    ask: async (dir, question, o) => {
      asked.push({ dir, question })
      if (askGate) await askGate
      return realCore.ask(dir, question, o)
    },
  }
  const svc = createAskService({ library, connections, log: w.log, agentSend: (text, options) => agent.handlers.agentSend(text, options), core, now })
  return { w, appData, library, proposals, agent, agentConn, conn, asked, svc, h: svc.handlers, ids: { a: ia, b: ib }, dirs: { a: join(w.root, 'a'), b: join(w.root, 'b') } }
}
const routesOf = dir => {
  const p = join(dir, '_pipeline', 'routes.jsonl')
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
}
const usageOf = dir => {
  const p = join(dir, '_pipeline', 'usage.jsonl')
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
}
const agentTurns = s => readTranscript(s.agent.agentDir).rows.filter(r => r.role === 'you')

test('the bridge: the two methods in the three tables; what the page may send and what it may not; askLibrary kept', () => {
  for (const name of ['sendLibraryMessage', 'resolveLibraryMessage', 'askLibrary']) {
    assert.ok(Object.hasOwn(BRIDGE_METHODS, name), `${name} in BRIDGE_METHODS`)
    assert.ok(bridgeTable().includes(name), `${name} in docs/desktop.md`)
  }
  const preload = readFileSync(join(DESKTOP_DIR, 'src', 'preload', 'preload.cjs'), 'utf8')
  for (const name of ['sendLibraryMessage', 'resolveLibraryMessage']) assert.match(preload, new RegExp(`^\\s*'${name}',`, 'm'), `${name} in preload METHODS`)
  const ok = (name, args) => assert.doesNotThrow(() => checkArgs(name, args), `${name}(${JSON.stringify(args)})`)
  const bad = (name, args) => assert.throws(() => checkArgs(name, args), err => err.code === 'bad_arguments', `${name}(${JSON.stringify(args)}) accepted`)
  const long = n => '问'.repeat(n)
  ok('sendLibraryMessage', [UC3_CHANGE]); ok('sendLibraryMessage', [long(500)]); ok('sendLibraryMessage', [`  ${long(500)}  `])
  bad('sendLibraryMessage', []); bad('sendLibraryMessage', ['']); bad('sendLibraryMessage', ['   ']); bad('sendLibraryMessage', [long(501)]); bad('sendLibraryMessage', [null]); bad('sendLibraryMessage', ['a', 'b'])
  ok('resolveLibraryMessage', ['x', 'question']); ok('resolveLibraryMessage', ['x', 'change'])
  bad('resolveLibraryMessage', ['x', 'unsure']); bad('resolveLibraryMessage', ['x']); bad('resolveLibraryMessage', ['', 'change']); bad('resolveLibraryMessage', [long(501), 'change']); bad('resolveLibraryMessage', ['x', 'change', 'y']); bad('resolveLibraryMessage', ['x', 'CHANGE'])
})

test('question (the rules): the core\'s ask on the current library as askLibrary does it, its answer as it comes; the agent not called', async () => {
  const s = await setup()
  const r = await s.h.sendLibraryMessage(`  ${UC3_QUESTION} `)
  assert.deepEqual(s.asked, [{ dir: s.dirs.b, question: UC3_QUESTION }], 'asked once, on the current library, the text trimmed')
  assert.deepEqual([r.route, r.by, r.confidence], ['question', 'rule', 0.8])
  assert.deepEqual(r.result, await realCore.ask(s.dirs.b, UC3_QUESTION, { connector: s.conn, now }), 'the answer of ask as it is')
  assert.equal(s.agentConn.calls.length, 0, 'the main agent was not called')
  assert.deepEqual(agentTurns(s), [])
  assert.equal(s.conn.routeCalls.length, 0, 'a rule hit asks no model')
  assert.deepEqual(routesOf(s.dirs.b), [{ at: CLOCK.toISOString(), text: UC3_QUESTION, route: 'question', by: 'rule', confidence: 0.8 }])
  assert.deepEqual(routesOf(s.dirs.a), [], 'only the current library records it')
})

test('change (the rules): the main agent with the current library\'s id, its turn as it comes (its card for that library); ask not called', async () => {
  const s = await setup({ agentAnswers: [{ reply: '我提议暂停 feed-a，等你确认。', proposals: [{ kind: 'pause_source', params: { name: 'feed-a', paused: true }, why: '你说以后不要它' }] }] })
  const r = await s.h.sendLibraryMessage(UC3_CHANGE)
  assert.deepEqual([r.route, r.by, r.confidence], ['change', 'rule', 0.8])
  assert.deepEqual(s.asked, [], 'ask was not called')
  assert.equal(s.conn.otherCalls.length + s.conn.routeCalls.length, 0, 'no call on the page\'s connection')
  assert.equal(s.agentConn.calls.filter(c => c.mode === 'send').length, 1, 'one turn of the agent')
  assert.equal(r.result.reply, '我提议暂停 feed-a，等你确认。')
  assert.deepEqual(Object.keys(r.result).sort(), ['ask', 'proposalIds', 'reply', 'turn'], 'agentSend\'s return as it is')
  const you = agentTurns(s)
  assert.deepEqual([you.length, you[0].text, you[0].data?.libraryId], [1, UC3_CHANGE, s.ids.b], 'the sentence reached the agent from library b')
  assert.deepEqual(s.w.eventsOf('agent-changed').map(e => e.payload.libraryId), [s.ids.b, s.ids.b])
  const card = s.proposals.card(r.result.proposalIds[0])
  assert.deepEqual([card.kind, card.by, card.status, card.libraryId], ['pause_source', 'agent', 'pending', s.ids.b], 'the card is for the current library')
  assert.deepEqual(routesOf(s.dirs.b).map(l => [l.route, l.by, l.confidence, l.text]), [['change', 'rule', 0.8, UC3_CHANGE]])
  // switching the current library sends the next one with that library's id
  await s.library.handlers.setActiveLibrary(s.ids.a)
  await s.h.sendLibraryMessage('从现在起只收中文的。')
  assert.equal(agentTurns(s)[1].data?.libraryId, s.ids.a)
  assert.equal(routesOf(s.dirs.a).length, 1)
})

test('unsure: neither ask nor the agent is called — low confidence, bad format twice, no connection', async () => {
  const low = await setup({ conn: askConnection({ route: { route: 'change', confidence: 0.4 } }) })
  assert.deepEqual(await low.h.sendLibraryMessage(BOTH), { route: 'unsure', by: 'model', confidence: 0.4, text: BOTH })
  assert.equal(low.conn.routeCalls.length, 1)
  assert.deepEqual([low.asked.length, low.agentConn.calls.length, low.conn.otherCalls.length], [0, 0, 0])

  const bad = await setup({ conn: askConnection({ route: 'bad' }) })
  assert.deepEqual(await bad.h.sendLibraryMessage('你好'), { route: 'unsure', by: 'model', confidence: 0, text: '你好' })
  assert.equal(bad.conn.routeCalls.length, 2, 'one retry')
  assert.deepEqual([bad.asked.length, bad.agentConn.calls.length], [0, 0])

  const none = await setup({ chosen: false })
  assert.deepEqual(await none.h.sendLibraryMessage(BOTH), { route: 'unsure', by: 'none', confidence: 0, text: BOTH })
  assert.deepEqual([none.asked.length, none.agentConn.calls.length], [0, 0])
  assert.deepEqual(routesOf(none.dirs.b).map(l => [l.route, l.by, l.confidence]), [['unsure', 'none', 0]])
  // no connection and a rule-routed question / change: the bridge's no_connection, as askLibrary / agentSend say it
  await assert.rejects(async () => none.h.sendLibraryMessage(UC3_QUESTION), err => err.code === 'no_connection')
  await assert.rejects(async () => none.h.sendLibraryMessage(UC3_CHANGE), err => err.code === 'no_connection')
})

test('the model\'s route: one no-tools call on the page\'s connection (complete, never send), counted under route; change → the agent', async () => {
  const s = await setup({ conn: askConnection({ route: { route: 'change', confidence: 0.9 } }) })
  const r = await s.h.sendLibraryMessage(BOTH)
  assert.deepEqual([r.route, r.by, r.confidence], ['change', 'model', 0.9])
  assert.equal(s.conn.routeCalls.length, 1)
  assert.deepEqual(Object.keys(s.conn.routeCalls[0]).sort(), ['format', 'model', 'prompt'])
  assert.deepEqual([s.conn.routeCalls[0].format, s.conn.routeCalls[0].model], ['json', 'main'])
  assert.equal(s.agentConn.calls.filter(c => c.mode === 'send').length, 1, 'then the agent')
  assert.deepEqual(s.asked, [])
  assert.deepEqual(usageOf(s.dirs.b).filter(u => u.purpose === 'route').map(u => [u.kind, u.calls]), [['api', 1]], 'the routing call is in the library\'s usage')
  assert.deepEqual(routesOf(s.dirs.b).map(l => [l.route, l.by, l.confidence]), [['change', 'model', 0.9]])

  const q = await setup({ conn: askConnection({ route: { route: 'question', confidence: 0.7 } }) })
  const rq = await q.h.sendLibraryMessage('你好')
  assert.deepEqual([rq.route, rq.by, q.asked.length, q.agentConn.calls.length], ['question', 'model', 1, 0])
})

test('resolveLibraryMessage: the route you chose, no routing call; routes.jsonl says you; only question or change', async () => {
  const s = await setup()
  // a sentence the rules call a question, which you say is a change: the agent, not ask, and no routing
  const c = await s.h.resolveLibraryMessage(UC3_QUESTION, 'change')
  assert.deepEqual([c.route, c.by, c.confidence], ['change', 'you', 1])
  assert.equal(c.result.reply, '收到，我提议了一张卡，等你确认。')
  assert.deepEqual([s.asked.length, s.conn.routeCalls.length], [0, 0])
  assert.equal(agentTurns(s)[0].data?.libraryId, s.ids.b)
  // and the other way round
  const q = await s.h.resolveLibraryMessage(UC3_CHANGE, 'question')
  assert.deepEqual([q.route, q.by, q.confidence], ['question', 'you', 1])
  assert.deepEqual(s.asked, [{ dir: s.dirs.b, question: UC3_CHANGE }])
  assert.equal(agentTurns(s).length, 1, 'the agent not called again')
  assert.equal(q.result.notInLibrary, true)
  assert.deepEqual(routesOf(s.dirs.b), [
    { at: CLOCK.toISOString(), text: UC3_QUESTION, route: 'change', by: 'you', confidence: 1, resolvedBy: 'you' },
    { at: CLOCK.toISOString(), text: UC3_CHANGE, route: 'question', by: 'you', confidence: 1, resolvedBy: 'you' },
  ])
  await assert.rejects(async () => s.h.resolveLibraryMessage('x', 'unsure'), err => err.code === 'bad_arguments')
  assert.deepEqual(await runHandler('resolveLibraryMessage', s.h.resolveLibraryMessage, ['x', 'unsure']), { ok: false, error: { code: 'bad_arguments' } })
  assert.equal(routesOf(s.dirs.b).length, 2, 'a refused one writes nothing')
})

test('routes.jsonl is append only: every line stays as it was, in order; the text cut at 200 characters', async () => {
  const s = await setup({ conn: askConnection({ route: { route: 'change', confidence: 0.3 } }), agentAnswers: [{ reply: '一' }, { reply: '二' }] })
  const file = join(s.dirs.b, '_pipeline', 'routes.jsonl')
  const long = `${'港'.repeat(300)}？`
  await s.h.sendLibraryMessage(long)
  const first = readFileSync(file, 'utf8')
  await s.h.sendLibraryMessage(UC3_CHANGE)
  const second = readFileSync(file, 'utf8')
  assert.ok(second.startsWith(first))
  await s.h.sendLibraryMessage(BOTH)
  await s.h.resolveLibraryMessage(BOTH, 'change')
  assert.ok(readFileSync(file, 'utf8').startsWith(second))
  const rows = routesOf(s.dirs.b)
  assert.deepEqual(rows.map(l => [l.route, l.by, l.resolvedBy ?? null]), [['question', 'rule', null], ['change', 'rule', null], ['unsure', 'model', null], ['change', 'you', 'you']])
  assert.equal([...rows[0].text].length, 200)
  assert.equal(rows[0].text, '港'.repeat(200))
})

test('one sentence at a time, shared with askLibrary: a second while one runs → bad_arguments; the slot is freed after, a failure too', async () => {
  let release
  const gate = new Promise(r => { release = r })
  const s = await setup({ askGate: gate })
  const first = s.h.sendLibraryMessage(UC3_QUESTION)
  await new Promise(r => setImmediate(r))
  assert.equal(s.svc.isAsking(), true)
  await assert.rejects(async () => s.h.sendLibraryMessage(UC3_CHANGE), err => err.code === 'bad_arguments', 'a second sentence')
  await assert.rejects(async () => s.h.askLibrary('库里有什么？'), err => err.code === 'bad_arguments', 'askLibrary while a sentence runs')
  await assert.rejects(async () => s.h.resolveLibraryMessage(UC3_CHANGE, 'change'), err => err.code === 'bad_arguments', 'an answer while a sentence runs')
  assert.equal(s.agentConn.calls.length, 0, 'the refused change never reached the agent')
  release()
  assert.equal((await first).route, 'question')
  assert.equal(s.svc.isAsking(), false)
  assert.equal(routesOf(s.dirs.b).length, 1, 'the refused ones wrote nothing')

  // a routing call that is slow holds the slot too (from the routing on)
  let go
  const slow = await setup({ conn: askConnection({ route: () => new Promise(r => { go = () => r({ route: 'change', confidence: 0.9 }) }) }) })
  const p = slow.h.sendLibraryMessage(BOTH)
  await new Promise(r => setTimeout(r, 20))
  await assert.rejects(async () => slow.h.sendLibraryMessage(UC3_QUESTION), err => err.code === 'bad_arguments')
  go()
  assert.equal((await p).route, 'change')

  // a failing agent turn frees the slot
  const boom = await setup()
  boom.agentConn.send = async () => { throw new Error('boom') }
  await assert.rejects(async () => boom.h.sendLibraryMessage(UC3_CHANGE), err => err.code === 'internal')
  assert.equal(boom.svc.isAsking(), false)
  assert.equal((await boom.h.sendLibraryMessage(UC3_QUESTION)).route, 'question')
})

test('without a library: no_library and nothing routed; main.mjs hands the agent\'s agentSend to the ask service', async () => {
  const w = testWorld('st-route-e-none-')
  worlds.push(w)
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now })
  let routed = 0
  const svc = createAskService({ library, connections: { active: () => null }, log: w.log, agentSend: async () => { throw new Error('no') }, core: { ...realCore, routeMessage: async () => { routed++; return {} } } })
  for (const [name, args] of [['sendLibraryMessage', ['x']], ['resolveLibraryMessage', ['x', 'change']]]) {
    await assert.rejects(async () => svc.handlers[name](...args), err => err.code === 'no_library', name)
  }
  assert.equal(routed, 0)
  const main = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'main.mjs'), 'utf8')
  assert.match(main, /createAskService\(\{[^}]*agentSend: \(text, options\) => agent\.handlers\.agentSend\(text, options\)[^}]*\}\)/)
  assert.ok(main.indexOf('agent = createAgentService(') > 0, 'the agent is made in main.mjs (the ask service reaches it when a sentence comes)')
})
