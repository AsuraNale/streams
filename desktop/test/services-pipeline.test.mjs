// The run service (src/main/services/pipeline.mjs) in plain Node, on a real library the library service made, with the fake
// connection: every method needs a library (no_library); a library made by the last version (no card) is not updated — its
// run answers needs-build at once, nothing fetched and no model called (1.1 W7a / W7b); a library with a card is updated by the
// update service in the background (round-progress 'update' → done:true, inbox-changed; one at a time; 停止); keep / dismiss
// / later / openItemUrl accept only urls the library knows.
// 1.1 W7b: v1.0's scoring pipeline left the service (the self-check, the round, the starter pack, the cap, the estimate,
// 评分环节's configuration and its single test): those tests went with it. The inbox here is filled by v1.0's own round
// (core/legacy, tests only), as a library of the last version has it.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { readIndex } from '../src/main/core.mjs'
import { makeContext, runRound, scriptedConnector } from '../../core/legacy/index.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
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

/**
 * A world with its three services; `devConnection` picks the fake; a library is opened when `open` is true. `update`: a
 * stand-in of services/library-update.mjs (none: every library is one of the last version).
 */
async function setup({ devConnection = 'fake', open = true, hidden = false, update = null } = {}) {
  const w = testWorld('st-pipeline-')
  worlds.push(w)
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  const connections = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale, devConnection, connectorDeps: { env: { PATH: '', PATHEXT: '.EXE' } } })
  const pipeline = createPipelineService({ library, connections, emit: w.emit, log: w.log, hidden, shell: w.shell, update: () => update })
  if (open) {
    w.dialogAnswers.push(join(w.root, 'lib'))
    await library.handlers.chooseLibraryFolder()
    await library.handlers.useChosenFolder('test lib')
    // v2 package A: the registry id of the library, carried by every event about it
    w.libraryId = library.current().libraryId
  }
  return { w, library, connections, pipeline, dir: join(w.root, 'lib') }
}

/** n items into the library's 待看 the way v1.0 put them there: its own round over a local feed (core/legacy; tests only). */
async function inboxOf(dir, n) {
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, n))
  const cfgFile = join(dir, 'streams.json')
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'))
  writeFileSync(cfgFile, `${JSON.stringify({ ...cfg, sources: [{ name: 'local', kind: 'rss', url: feed }] }, null, 2)}\n`)
  const r = await runRound(dir, { connector: scriptedConnector(), ctx: makeContext({ timeoutMs: 2000, sleep: async () => {} }) })
  assert.ok(r.started, `control: v1.0's round ran (${JSON.stringify(r.problems)})`)
  return srv
}

test('without a library every pipeline method is no_library', async () => {
  const { pipeline } = await setup({ open: false })
  const h = pipeline.handlers
  for (const [name, args] of [['getHome', []], ['startRound', []], ['cancelRound', []], ['getRoundState', []], ['getInbox', []], ['keepItem', ['https://x/1']], ['dismissItem', ['https://x/1']], ['settleDismiss', [null, null]], ['undoDismiss', []], ['laterItem', ['https://x/1']], ['openItemUrl', ['https://x/1']]]) {
    await assert.rejects(async () => h[name](...args), err => err.code === 'no_library', name)
  }
  // 1.1 W7b: v1.0's methods are no handlers any more
  for (const gone of ['estimateRound', 'setRoundCap', 'getPipelineSettings', 'applyStarterPack', 'getStarterPacks', 'moveToInbox', 'getRescore', 'startRescore', 'getPipeline', 'savePipeline', 'previewNode']) assert.equal(h[gone], undefined, gone)
})

test('a library made by the last version (no card): startRound answers needs-build at once — nothing fetched, no model call, the problem in getHome', async () => {
  const { w, connections, pipeline, dir } = await setup()
  connections.handlers.setActiveConnection('claude-code')
  const before = existsSync(join(dir, '_pipeline', 'rounds.jsonl')) ? readFileSync(join(dir, '_pipeline', 'rounds.jsonl'), 'utf8') : ''
  const r = await pipeline.handlers.startRound()
  assert.deepEqual(r, { started: false, problems: [{ code: 'needs-build' }] })
  assert.equal(pipeline.handlers.getRoundState().running, false)
  const done = w.eventsOf('round-progress').at(-1).payload
  assert.deepEqual([done.phase, done.done, done.calls, done.problems], ['done', true, 0, [{ code: 'needs-build' }]])
  assert.equal(existsSync(join(dir, '_pipeline', 'usage.jsonl')), false, 'no model call')
  assert.equal(existsSync(join(dir, '_pipeline', 'rounds.jsonl')) ? readFileSync(join(dir, '_pipeline', 'rounds.jsonl'), 'utf8') : '', before, 'no run record')
  const home = pipeline.handlers.getHome()
  assert.equal(home.problem.code, 'needs-build')
  assert.ok(!Number.isNaN(Date.parse(home.problem.at)), String(home.problem.at))
  assert.deepEqual([home.lastRound, home.roundState.lastProblems], [null, [{ code: 'needs-build' }]])
  for (const gone of ['lastRun', 'toScore']) assert.equal(Object.hasOwn(home, gone), false, `getHome has no ${gone} of v1.0`)
})

test('a library with a card: the update runs in the background (round-progress update → done, inbox-changed); one at a time; 停止 reaches it', async () => {
  let release
  const calls = []
  const update = {
    applies: () => true,
    problemFor: a => (a ? null : { code: 'no_connection' }),
    async run(dir, active, { round, signal }) {
      calls.push({ dir, kind: active.kind, round })
      await new Promise(resolve => { release = resolve; signal?.addEventListener('abort', resolve) })
      const record = { id: round, kind: 'update', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: signal?.aborted ? 'cancelled' : 'done', counts: { inbox: 2 }, calls: 3 }
      return { started: true, status: record.status, record }
    },
  }
  const { w, connections, pipeline, dir } = await setup({ update })
  // no connection: not started, the problem's code in the answer
  assert.deepEqual(await pipeline.handlers.startRound(), { started: false, problems: [{ code: 'no_connection' }] })
  assert.equal(calls.length, 0)
  connections.handlers.setActiveConnection('claude-code')
  const started = await pipeline.handlers.startRound()
  assert.equal(started.started, true)
  assert.match(started.roundId, /^u-/)
  await until(() => calls.length === 1)
  assert.deepEqual([calls[0].dir, calls[0].kind, calls[0].round], [dir, 'claude-code', started.roundId])
  assert.equal(pipeline.handlers.getRoundState().running, true)
  assert.equal(pipeline.current().phase, 'update')
  await assert.rejects(async () => pipeline.handlers.startRound(), err => err.code === 'bad_arguments', 'one run at a time')
  release()
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && e.payload.done === true))
  const events = w.eventsOf('round-progress').filter(e => e.payload.roundId === started.roundId).map(e => e.payload)
  assert.deepEqual(events.map(e => e.phase), ['update', 'done'])
  assert.deepEqual([events[1].counts, events[1].calls, events[1].cap], [{ inbox: 2 }, 3, null])
  assert.deepEqual(w.eventsOf('inbox-changed').at(-1).payload, { libraryId: w.libraryId, count: 0 })
  assert.equal(pipeline.handlers.getRoundState().running, false)
  // 停止: the update's signal is aborted
  const again = await pipeline.handlers.startRound()
  await until(() => calls.length === 2)
  assert.deepEqual(pipeline.handlers.cancelRound(), { cancelled: true })
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === again.roundId && e.payload.done === true))
  assert.equal(w.eventsOf('round-progress').filter(e => e.payload.roundId === again.roundId).at(-1).payload.result.status, 'cancelled')
  assert.deepEqual(pipeline.handlers.cancelRound(), { cancelled: false })
})

test('the inbox and the decisions: only a url in the inbox can be kept or dismissed; keep writes a note and rebuilds; open only a known url', async () => {
  const { w, connections, pipeline, dir } = await setup()
  const srv = await inboxOf(dir, 2)
  const h = pipeline.handlers
  connections.handlers.setActiveConnection('codex')
  const inbox = h.getInbox()
  assert.equal(inbox.items.length, 2)
  assert.deepEqual(inbox.recentDismissReasons, [])
  for (const gone of ['rejected', 'rescore', 'manual']) assert.equal(Object.hasOwn(inbox, gone), false, `getInbox has no ${gone} of v1.0`)
  const [a, b] = inbox.items.map(i => i.url)
  assert.ok(a.startsWith(srv.base))
  // refused: not in the inbox
  await assert.rejects(async () => h.keepItem('https://example.org/not-there'), err => err.code === 'bad_arguments')
  await assert.rejects(async () => h.dismissItem('https://example.org/not-there'), err => err.code === 'bad_arguments')
  await assert.rejects(async () => h.openItemUrl('https://example.org/not-there'), err => err.code === 'bad_arguments')
  assert.deepEqual(w.opened, [])
  // later: the ledger unchanged
  const before = readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8')
  assert.deepEqual(h.laterItem(a), { url: a })
  assert.equal(readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8'), before)
  // keep: a note, the index, two events
  const eventsBefore = w.events.length
  const kept = h.keepItem(a)
  assert.equal(kept.file, `${kept.id}.md`, 'the file name in notes/, as the core gives it')
  assert.ok(existsSync(join(dir, 'notes', kept.file)))
  assert.equal(readIndex(dir).length, 1)
  assert.deepEqual(w.events.slice(eventsBefore).map(e => e.topic), ['inbox-changed', 'library-changed'])
  assert.deepEqual(w.events.at(-2).payload, { libraryId: w.libraryId, count: 1 })
  assert.deepEqual(w.events.at(-1).payload, { libraryId: w.libraryId, path: dir, name: 'lib' })
  await assert.rejects(async () => h.keepItem(a), err => err.code === 'bad_arguments', 'kept: no longer in the inbox')
  const home = h.getHome()
  assert.deepEqual([home.numbers.kept, home.numbers.inbox, home.library.count, home.recentKept.length, home.recentKept[0].id], [1, 1, 1, 1, kept.id])
  assert.equal(home.lastRound.counts.inbox, 2, "getHome's lastRound is the run record (v1.0's round here)")
  // the kept item's source can still be opened (it is in the index); the inbox item too
  assert.equal(await h.openItemUrl(a), null)
  assert.equal(await h.openItemUrl(b), null)
  assert.deepEqual(w.opened, [a, b])
  // dismiss — redesign R2 (N03): held first (off the list, nothing written), written when the bar closes with its reason
  const ledgerBefore = readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8')
  assert.deepEqual(h.dismissItem(b), { url: b, held: true })
  assert.equal(readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8'), ledgerBefore, 'held: nothing written yet')
  assert.deepEqual(h.settleDismiss('  not relevant  ', null), { settled: true, url: b })
  assert.equal(h.getInbox().items.length, 0)
  assert.deepEqual(h.getInbox().recentDismissReasons.map(r => r.reason), ['not relevant'])
  assert.deepEqual(w.events.at(-1), { topic: 'inbox-changed', payload: { libraryId: w.libraryId, count: 0 } })
  await assert.rejects(async () => h.openItemUrl(b), err => err.code === 'bad_arguments', 'dismissed: gone from the inbox, never in the index')
  // hidden: a known url is only logged
  const quiet = createPipelineService({ library: { require: () => dir, current: () => ({ path: dir, name: 'lib' }), dir: () => dir }, connections, emit: w.emit, log: w.log, hidden: true, shell: w.shell })
  assert.equal(await quiet.handlers.openItemUrl(a), null)
  assert.deepEqual(w.opened, [a, b], 'not opened again')
  assert.ok(w.lines.some(l => l.startsWith('not opened in a test run')))
})

// 1.1 W11 (Codex's install test, B3): after an upgrade the catch-up runs the libraries of the last version at start; their
// 「needs-build」 was getHome's problem for whatever library was open — a new library showed 「这座库是上一版建的…」 while its
// first update ran. Now getHome gives the open library's own problem only.
test('W11: getHome shows the open library\'s own problem — not the needs-build of another library\'s run', async () => {
  const fresh = new Set()
  const update = { applies: d => fresh.has(d), problemFor: a => (a ? null : { code: 'no_connection' }), async run() { return { started: true, status: 'done', record: { counts: { inbox: 0 }, calls: 0 } } } }
  const { w, library, connections, pipeline, dir: oldDir } = await setup({ update })
  connections.handlers.setActiveConnection('claude-code')
  const oldId = library.current().libraryId
  // a library with a card, opened
  const newDir = join(w.root, 'new')
  fresh.add(newDir)
  w.dialogAnswers.push(newDir)
  await library.handlers.chooseLibraryFolder()
  await library.handlers.useChosenFolder('new lib')
  const newId = library.current().libraryId
  assert.notEqual(newId, oldId)
  // the catch-up runs the old library (not the open one): needs-build
  const r = await pipeline.startRoundIn({ id: oldId, path: oldDir })
  assert.deepEqual(r.problems, [{ code: 'needs-build' }])
  assert.equal(pipeline.handlers.getHome().problem, null, 'the open (new) library has no problem of its own')
  assert.deepEqual(pipeline.handlers.getRoundState().lastProblems, [{ code: 'needs-build' }], 'the run state still says what the last run gave')
  // the old library, opened: its own problem is there
  library.handlers.setActiveLibrary(oldId)
  assert.equal(pipeline.handlers.getHome().problem?.code, 'needs-build')
  // back on the new one: an update that could not start (no connection) is its own problem; one that starts clears it
  library.handlers.setActiveLibrary(newId)
  connections.handlers.setActiveConnection(null)
  await pipeline.startRoundIn({ id: newId, path: newDir })
  assert.equal(pipeline.handlers.getHome().problem?.code, 'no_connection')
  connections.handlers.setActiveConnection('claude-code')
  await pipeline.startRoundIn({ id: newId, path: newDir })
  await until(() => !pipeline.handlers.getRoundState().running)
  assert.equal(pipeline.handlers.getHome().problem, null, 'cleared by an update of it that ran')
})
