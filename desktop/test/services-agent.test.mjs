// The main agent in the main process (v2 package C, contract C4; src/main/services/agent.mjs; docs/desktop.md §4.6) in plain
// Node, on real libraries the library service registered and the real proposals service (package B): a sentence becomes a turn
// whose cards are pending cards by 'agent' (nothing of the library changes until a confirm); one turn at a time (a second
// waits); the transcript and the status; the bridge's argument checks; the development hook (STREAMS_DEV_CONNECTION=fake +
// STREAMS_DEV_AGENT_SCRIPT) and that main.mjs honours it only when not packaged; the suggestion cards: recorded after every
// round of the real pipeline service, listed, 「不要」, and 「要」 = recorded + handed to the agent as a note, with the library's
// configuration byte for byte as it was; the agent's calls in getUsageTotal on their own line. Each rule first gets the
// input made to break it. Nothing here touches the real app data, and no model is called (the core's scripted stand-ins).
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { createAgentService } from '../src/main/services/agent.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { createProposalsService } from '../src/main/services/proposals.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { BRIDGE_METHODS, checkArgs } from '../src/main/bridge-methods.mjs'
import { isInside } from '../src/main/layout.mjs'
import { AGENT_CWD, addSource, addTopic, agentPaths, appendFetchLog, createLibrary, readSuggestionLines, readTranscript, scriptedAgentConnector } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { testWorld } from './support/services.mjs'
import { startFakeServer } from '../../core/test/support/fake-server.mjs'
import { feedRoute, serveItems } from '../../core/test/support/pipeline.mjs'

const worlds = []
const servers = []
after(async () => {
  for (const srv of servers) await srv.close()
  for (const w of worlds) removeTree(w.root, { waitMs: 3000 })
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check, { timeoutMs = 20_000 } = {}) => {
  const t0 = Date.now()
  while (!check()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timed out waiting')
    await sleep(50)
  }
}
const CLOCK = new Date('2026-11-05T16:00:00.000Z')
const now = () => CLOCK

/** sha256 of every file under dir, but the two records a card or a suggestion may append to. */
function tree(dir, skip = ['_pipeline/suggestions.jsonl', '_pipeline/proposals.jsonl']) {
  const out = {}
  const walk = d => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      const rel = relative(dir, p).replace(/\\/g, '/')
      if (f.isDirectory()) walk(p)
      else if (!skip.includes(rel)) out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir)
  return out
}
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')

/** A connections stand-in whose agent connector is `c` (or none chosen). */
const connectionsWith = c => ({ devConnection: null, active: () => (c ? { kind: 'claude-code' } : null), sessionConnector: () => c })

/**
 * Two registered libraries (a, the current one b) with a topic and a source each; the library, proposals and agent services;
 * `connections` the stand-in (default: none chosen) or a real connections service.
 */
async function setup({ connector = null, connections, devScript = null } = {}) {
  const w = testWorld('st-agent-')
  worlds.push(w)
  const appData = join(w.root, 'appData')
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now, agentUsageFile: agentPaths(join(appData, 'agent')).usage })
  for (const name of ['a', 'b']) {
    const dir = join(w.root, name)
    createLibrary(dir, { name })
    addTopic(dir, { name: 'agent 框架', keywords: ['agent framework'] })
    addSource(dir, { name: 'feed-a', kind: 'rss', url: 'https://example.com/a.xml', topic: 'agent 框架' })
    w.dialogAnswers.push(dir)
    await library.handlers.chooseLibraryFolder()
    await library.handlers.useChosenFolder(name)
  }
  const [ia, ib] = library.entries().map(l => l.id)
  const proposals = createProposalsService({ appDataDir: appData, library, emit: w.emit, log: w.log, now, scratchRoot: join(w.root, 'scratch') })
  const conns = connections ?? connectionsWith(connector)
  const agent = createAgentService({ appDataDir: appData, library, connections: conns, proposals, emit: w.emit, log: w.log, now, devScript })
  return { w, appData, library, proposals, agent, ids: { a: ia, b: ib }, dirs: { a: join(w.root, 'a'), b: join(w.root, 'b') } }
}

test('the bridge: the six methods and agent-changed are in the tables; what the page may send and what it may not', () => {
  for (const name of ['agentSend', 'getAgentTranscript', 'getAgentStatus', 'listSuggestions', 'dismissSuggestion', 'acceptSuggestion']) assert.ok(Object.hasOwn(BRIDGE_METHODS, name), name)
  const ok = (name, args) => assert.doesNotThrow(() => checkArgs(name, args), `${name}(${JSON.stringify(args)})`)
  const bad = (name, args) => assert.throws(() => checkArgs(name, args), err => err.code === 'bad_arguments', `${name}(${JSON.stringify(args)}) accepted`)
  ok('agentSend', ['你好']); ok('agentSend', ['你好', null]); ok('agentSend', ['你好', undefined]); ok('agentSend', ['你好', { libraryId: 'abcdefgh' }]); ok('agentSend', ['x'.repeat(4000)])
  bad('agentSend', []); bad('agentSend', ['']); bad('agentSend', ['   ']); bad('agentSend', ['x'.repeat(4001)]); bad('agentSend', [5]); bad('agentSend', ['hi', { path: 'C:\\' }]); bad('agentSend', ['hi', 'abcdefgh']); bad('agentSend', ['hi', null, 'extra'])
  ok('getAgentTranscript', []); ok('getAgentTranscript', [null]); ok('getAgentTranscript', [{ limit: 50, before: 3 }]); ok('getAgentTranscript', [{}])
  bad('getAgentTranscript', [{ limit: 0 }]); bad('getAgentTranscript', [{ limit: 501 }]); bad('getAgentTranscript', [{ before: 0 }]); bad('getAgentTranscript', [{ all: true }]); bad('getAgentTranscript', [null, null])
  ok('getAgentStatus', []); bad('getAgentStatus', ['x'])
  ok('listSuggestions', []); ok('listSuggestions', [null]); ok('listSuggestions', [{ libraryId: 'abcdefgh' }]); bad('listSuggestions', [{ kind: 'x' }]); bad('listSuggestions', ['abcdefgh'])
  ok('dismissSuggestion', ['abcdefgh', 'source-failing:feed-a']); ok('dismissSuggestion', ['abcdefgh', 'k', '不需要']); ok('dismissSuggestion', ['abcdefgh', 'k', null])
  bad('dismissSuggestion', ['abcdefgh']); bad('dismissSuggestion', ['', 'k']); bad('dismissSuggestion', ['abcdefgh', '']); bad('dismissSuggestion', ['abcdefgh', 'k', 7]); bad('dismissSuggestion', ['abcdefgh', 'k', 'x'.repeat(501)])
  ok('acceptSuggestion', ['abcdefgh', 'k']); bad('acceptSuggestion', ['abcdefgh']); bad('acceptSuggestion', ['abcdefgh', 'k', 'x']); bad('acceptSuggestion', ['abcdefgh', 'x'.repeat(301)])
  // the optional trailing argument is a property of those methods only: the others still take exactly their count
  bad('getAppState', ['x']); bad('confirmProposal', []); bad('reviseProposal', ['p-1'])
})

test('agentSend: a turn whose card is a pending card by agent through package B; the library stays byte for byte until a confirm', async () => {
  const c = scriptedAgentConnector({ answers: [{ reply: '我提议暂停 feed-a，等你确认。', proposals: [{ kind: 'pause_source', params: { name: 'feed-a', paused: true }, why: '连续失败' }] }] })
  const { w, agent, proposals, ids, dirs } = await setup({ connector: c })
  const before = tree(dirs.a)
  const r = await agent.handlers.agentSend('a 库的 feed-a 老失败，暂停吧', { libraryId: ids.a })
  assert.equal(r.reply, '我提议暂停 feed-a，等你确认。')
  assert.equal(r.proposalIds.length, 1)
  const card = proposals.card(r.proposalIds[0])
  assert.deepEqual([card.kind, card.by, card.status, card.libraryId], ['pause_source', 'agent', 'pending', ids.a], 'from a library\'s dialog: its id filled in')
  assert.deepEqual(tree(dirs.a), before, 'nothing of the library changed')
  assert.deepEqual(w.eventsOf('agent-changed').map(e => e.payload), [{ phase: 'started', turn: 1, libraryId: ids.a }, { phase: 'done', turn: 1, libraryId: ids.a }])
  assert.ok(w.eventsOf('proposals-changed').some(e => e.payload.id === card.id && e.payload.status === 'pending'))
  // the confirm (package B's) is what changes it
  proposals.handlers.confirmProposal(card.id)
  assert.notDeepEqual(tree(dirs.a), before)
  // an unknown library, no connection
  await assert.rejects(async () => agent.handlers.agentSend('hi', { libraryId: 'zzzzzzzz' }), err => err.code === 'bad_arguments')
  const none = await setup()
  await assert.rejects(async () => none.agent.handlers.agentSend('hi'), err => err.code === 'no_connection')
  assert.equal(existsSync(agentPaths(join(none.appData, 'agent')).transcript), false, 'nothing written without a connection')
})

test('one turn at a time: a second sentence waits for the first; replies come back in order', async () => {
  let inFlight = 0
  let most = 0
  const inner = scriptedAgentConnector({ answers: (req, n) => ({ reply: `第 ${n + 1} 个回答` }) })
  const slow = { ...inner, async send(req, o) { inFlight++; most = Math.max(most, inFlight); await sleep(80); try { return await inner.send(req, o) } finally { inFlight-- } } }
  const { agent } = await setup({ connector: slow })
  const p1 = agent.handlers.agentSend('一')
  const p2 = agent.handlers.agentSend('二')
  const p3 = agent.handlers.agentSend('三')
  await sleep(20)
  const mid = agent.handlers.getAgentStatus()
  assert.equal(mid.busy, true)
  assert.equal(mid.waiting, 2)
  const rs = await Promise.all([p1, p2, p3])
  assert.equal(most, 1, 'never two calls at once')
  assert.deepEqual(rs.map(r => [r.turn, r.reply]), [[1, '第 1 个回答'], [2, '第 2 个回答'], [3, '第 3 个回答']])
  const rows = readTranscript(agent.agentDir).rows
  assert.deepEqual(rows.map(x => `${x.turn}${x.role}`), ['1you', '1agent', '2you', '2agent', '3you', '3agent'], 'no interleaving')
  // a failing turn does not stop the queue
  const boom = { ...inner, async send() { throw new Error('boom') } }
  const b = await setup({ connector: boom })
  await assert.rejects(async () => b.agent.handlers.agentSend('一'), err => err.code === 'internal')
  assert.equal(b.agent.handlers.getAgentStatus().busy, false)
})

test('getAgentTranscript and getAgentStatus: the record oldest first, paged by turn; the connection, the live session, the last summary', async () => {
  const c = scriptedAgentConnector({ answers: [{ reply: '一' }, { reply: '二' }, { reply: '三' }] })
  const { agent } = await setup({ connector: c })
  const s0 = agent.handlers.getAgentStatus()
  assert.deepEqual([s0.connection, s0.sessionful, s0.session.live, s0.entries, s0.lastSummaryAt], ['claude-code', true, false, 0, null])
  for (const t of ['一', '二', '三']) await agent.handlers.agentSend(t)
  const all = agent.handlers.getAgentTranscript()
  assert.deepEqual(all.entries.map(e => e.text), ['一', '一', '二', '二', '三', '三'])
  assert.equal(all.hasMore, false)
  const page = agent.handlers.getAgentTranscript({ limit: 2, before: 3 })
  assert.deepEqual(page.entries.map(e => [e.turn, e.role]), [[2, 'you'], [2, 'agent']])
  assert.equal(page.hasMore, true)
  // the stand-in's sessions are cached under the connector's kind ('fake'); the status reads the chosen kind's
  writeFileSync(agentPaths(agent.agentDir).session, JSON.stringify({ 'claude-code': { sessionId: 's-1', startedAt: 'x', turns: 3, summarizedThrough: 0 } }))
  const s1 = agent.handlers.getAgentStatus()
  assert.deepEqual([s1.session.live, s1.session.turns, s1.entries, s1.turns, s1.busy], [true, 3, 6, 3, false])
})

test('the development hook: STREAMS_DEV_CONNECTION=fake answers from STREAMS_DEV_AGENT_SCRIPT; login-expired fails; main.mjs reads both only when not packaged', async () => {
  const w0 = testWorld('st-agent-script-')
  worlds.push(w0)
  const script = join(w0.root, 'script.json')
  writeFileSync(script, JSON.stringify({ answers: [{ reply: '脚本里的第一句', ask: { question: '要吗？', options: ['要', '不要'] } }, { $text: 'not json' }, { $text: 'still not' }] }))
  const fakeConns = mode => createConnectionsService({ settingsFile: join(w0.root, `settings-${mode}.json`), emit: w0.emit, log: w0.log, secrets: w0.secrets, locale: () => w0.locale, devConnection: mode })
  const { agent } = await setup({ connections: fakeConns('fake'), devScript: script })
  const r1 = await agent.handlers.agentSend('你好')
  assert.deepEqual([r1.reply, r1.ask.question], ['脚本里的第一句', '要吗？'])
  const r2 = await agent.handlers.agentSend('再说')
  assert.deepEqual(r2.notice, [{ code: 'not-understood' }], 'the script goes on from turn to turn')
  assert.equal(agent.handlers.getAgentStatus().connection, 'fake')
  const expired = await setup({ connections: fakeConns('login-expired') })
  const r3 = await expired.agent.handlers.agentSend('你好')
  assert.deepEqual([r3.reply, r3.notice], [null, [{ code: 'connection', connection: 'login-expired' }]])
  // main.mjs: the script path and the connection mode are each read only when the app is not packaged
  const main = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'main.mjs'), 'utf8')
  const guarded = (src, name, env) => new RegExp(`^const ${name} = !app\\.isPackaged && [^\\n]*process\\.env\\.${env}`, 'm').test(src)
  assert.ok(guarded(main, 'DEV_AGENT_SCRIPT', 'STREAMS_DEV_AGENT_SCRIPT'))
  assert.ok(guarded(main, 'DEV_CONNECTION', 'STREAMS_DEV_CONNECTION'))
  assert.match(main, /createAgentService\(\{[^}]*devScript: DEV_AGENT_SCRIPT[^}]*\}\)/)
  assert.equal((main.match(/STREAMS_DEV_AGENT_SCRIPT/g) ?? []).length, 3, 'read in that one line only (and named in its comment)')
  assert.ok(!guarded(main.replace('const DEV_AGENT_SCRIPT = !app.isPackaged && ', 'const DEV_AGENT_SCRIPT = '), 'DEV_AGENT_SCRIPT', 'STREAMS_DEV_AGENT_SCRIPT'), 'reverse: without the guard the check fails')
})

test('after every round the library\'s suggestion cards are recorded (the real pipeline service); listed per library', async () => {
  const srv = await startFakeServer()
  servers.push(srv)
  const ok = feedRoute(srv, serveItems(srv, 2))
  const down = srv.route('/down', { status: 503, body: 'down', contentType: 'text/plain' })
  const { w, library, agent, ids, dirs } = await setup({ connector: scriptedAgentConnector() })
  const conns = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale: () => w.locale, connectorDeps: { env: { PATH: '', PATHEXT: '.EXE' } } })
  const pipeline = createPipelineService({ library, connections: conns, emit: w.emit, log: w.log, shell: w.shell, locale: () => w.locale, now, fetchContext: { timeoutMs: 2000, sleep: async () => {} }, afterRound: r => agent.afterRound(r) })
  const cfgFile = join(dirs.a, 'streams.json')
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'))
  cfg.sources = [{ name: 'feed-a', kind: 'rss', url: down, topic: 'agent 框架' }, { name: 'ok-feed', kind: 'rss', url: ok }]
  writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`)
  for (const d of ['02', '03']) appendFetchLog(dirs.a, { ts: `2026-11-${d}T08:30:00.000Z`, round: `r${d}`, source: 'feed-a', kind: 'rss', status: 'failed', http: 503, count: 0, new: 0 })
  assert.deepEqual(agent.handlers.listSuggestions({ libraryId: ids.a }), [], 'two failures are not three: nothing yet')
  const started = await pipeline.startRoundIn({ id: ids.a, path: dirs.a })
  assert.equal(started.started, true, JSON.stringify(started))
  await until(() => w.eventsOf('inbox-changed').some(e => e.payload.libraryId === ids.a))
  const open = agent.handlers.listSuggestions({ libraryId: ids.a })
  // feed-a's third failure in a row; and the two libraries share every topic keyword, so the overlap rule fires against the
  // other one (the service gives the rules the other registered libraries)
  assert.deepEqual(open.map(s => [s.libraryId, s.key]), [[ids.a, 'source-failing:feed-a'], [ids.a, `topic-overlap:${ids.b}`]])
  assert.equal(open[0].evidence.rounds, 3)
  // redesign R5a (precheck fix 3, the 动作表's 「两个库各一张」): a's round records b's overlap card too — b no longer waits for a
  // round of its own (this used to assert that b had none yet)
  assert.deepEqual(agent.handlers.listSuggestions().map(s => s.libraryId), [ids.a, ids.a, ids.b], 'every library: b has its overlap card already (no round of b)')
  agent.afterRound({ dir: dirs.b, libraryId: ids.b })
  assert.deepEqual(agent.handlers.listSuggestions({ libraryId: ids.b }).map(s => [s.key, s.otherLibraryId]), [[`topic-overlap:${ids.a}`, ids.a]])
  await assert.rejects(async () => agent.handlers.listSuggestions({ libraryId: 'zzzzzzzz' }), err => err.code === 'bad_arguments')
})

test('「不要」 records a dismissal and nothing else; 「要」 records the accept and hands the card to the agent as a note — the configuration byte for byte', async () => {
  const c = scriptedAgentConnector({ answers: [{ reply: '我提议暂停 feed-a。', proposals: [{ kind: 'pause_source', params: { name: 'feed-a', paused: true }, why: '建议卡说它连续失败' }] }] })
  const { agent, proposals, ids, dirs } = await setup({ connector: c })
  for (const d of ['02', '03', '04']) appendFetchLog(dirs.a, { ts: `2026-11-${d}T08:30:00.000Z`, round: `r${d}`, source: 'feed-a', kind: 'rss', status: 'blocked', http: 403, count: 0, new: 0 })
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  const keys = agent.handlers.listSuggestions({ libraryId: ids.a }).map(s => s.key)
  assert.deepEqual(keys, ['source-failing:feed-a', `topic-overlap:${ids.b}`])
  const before = tree(dirs.a)
  const config = sha(join(dirs.a, 'streams.json'))
  const r = await agent.handlers.acceptSuggestion(ids.a, 'source-failing:feed-a')
  assert.equal(r.accepted.ev, 'accepted')
  assert.equal(r.turn.proposalIds.length, 1, 'the agent decided: one card')
  assert.equal(proposals.card(r.turn.proposalIds[0]).status, 'pending')
  assert.equal(sha(join(dirs.a, 'streams.json')), config, 'streams.json byte for byte')
  assert.deepEqual(tree(dirs.a), before, 'every file of the library but the two records byte for byte')
  const turnRows = readTranscript(agent.agentDir).rows.filter(x => x.turn === r.turn.turn)
  assert.equal(turnRows[0].role, 'note', 'handed over as a note, not as the user\'s words')
  // redesign R5a (N11): the card is handed over in the interface's words (core handoffText), no longer as `kind · subject` and
  // the evidence JSON — this line used to match /source-failing · feed-a/
  assert.match(turnRows[0].text, /来源「feed-a」连续 3 次运行未能抓取/)
  assert.doesNotMatch(turnRows[0].text, /source-failing|\{|403/)
  assert.match(c.sends()[0].prompt, /流息转来一件事/)
  assert.deepEqual(agent.handlers.listSuggestions({ libraryId: ids.a }).map(s => s.key), [`topic-overlap:${ids.b}`], 'no longer open')
  await assert.rejects(async () => agent.handlers.acceptSuggestion(ids.a, 'source-failing:feed-a'), err => err.code === 'bad_arguments', 'not open any more')
  // 「不要」
  const line = agent.handlers.dismissSuggestion(ids.a, `topic-overlap:${ids.b}`, '两个库本来就该重合')
  assert.deepEqual([line.ev, line.reason], ['dismissed', '两个库本来就该重合'])
  assert.deepEqual(readSuggestionLines(dirs.a).map(l => l.ev), ['suggested', 'suggested', 'accepted', 'dismissed'])
  assert.throws(() => agent.handlers.dismissSuggestion(ids.a, `topic-overlap:${ids.b}`), err => err.code === 'bad_arguments', 'not open')
  assert.deepEqual(tree(dirs.a), before)
  // no connection: 「要」 records nothing
  const none = await setup()
  for (const d of ['02', '03', '04']) appendFetchLog(none.dirs.a, { ts: `2026-11-${d}T08:30:00.000Z`, round: `r${d}`, source: 'feed-a', kind: 'rss', status: 'failed', http: 503, count: 0, new: 0 })
  none.agent.afterRound({ dir: none.dirs.a, libraryId: none.ids.a })
  const sugBefore = readFileSync(join(none.dirs.a, '_pipeline', 'suggestions.jsonl'))
  await assert.rejects(async () => none.agent.handlers.acceptSuggestion(none.ids.a, 'source-failing:feed-a'), err => err.code === 'no_connection')
  assert.ok(readFileSync(join(none.dirs.a, '_pipeline', 'suggestions.jsonl')).equals(sugBefore))
})

test('the CLI connections run in a folder under the system temporary folder, never inside the app data (layout.mjs)', async () => {
  const asked = []
  const c = scriptedAgentConnector({ answers: [{ reply: '好' }] })
  const conns = { devConnection: null, active: () => ({ kind: 'codex' }), sessionConnector: (kind, o) => { asked.push({ kind, cwd: o.cwd }); return c } }
  const { appData, agent } = await setup({ connections: conns })
  assert.equal(AGENT_CWD, join(tmpdir(), 'streams-agent-cwd'))
  assert.equal(agent.cwd, AGENT_CWD, 'the default')
  await agent.handlers.agentSend('你好')
  assert.ok(asked.length >= 1)
  for (const a of asked) {
    assert.equal(a.cwd, AGENT_CWD)
    assert.equal(isInside(a.cwd, appData), false, `${a.cwd} is inside the app data ${appData}`)
    assert.equal(isInside(a.cwd, tmpdir()), true)
  }
  // reverse: a working folder inside the app data (contract C3's first agent/cwd) is refused at start
  const w = testWorld('st-agent-cwd-')
  worlds.push(w)
  const args = { appDataDir: join(w.root, 'appData'), library: {}, connections: conns, proposals: {}, emit: w.emit, log: w.log }
  assert.throws(() => createAgentService({ ...args, cwd: join(w.root, 'appData', 'agent', 'cwd') }), /must not be inside the app data/)
  assert.throws(() => createAgentService({ ...args, cwd: 'relative\\cwd' }), /absolute/)
  assert.doesNotThrow(() => createAgentService({ ...args, cwd: join(w.root, 'elsewhere') }))
})

test('getUsageTotal: the agent\'s calls on their own line and in the total', async () => {
  const c = scriptedAgentConnector({ answers: [{ reply: '', lookups: [{ what: 'suggestions' }] }, { reply: '好' }] })
  const { library, agent } = await setup({ connector: c })
  const t0 = library.handlers.getUsageTotal()
  assert.deepEqual([t0.calls, t0.agent.calls], [0, 0])
  await agent.handlers.agentSend('有什么建议？')
  const t = library.handlers.getUsageTotal()
  assert.equal(t.agent.calls, 2)
  assert.equal(t.calls, 2)
  assert.deepEqual(t.byKind, { fake: 2 })
  assert.ok(t.libraries.every(l => l.calls === 0), 'not counted as a library\'s')
})
