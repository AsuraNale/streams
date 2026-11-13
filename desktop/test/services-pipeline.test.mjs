// The pipeline service (src/main/services/pipeline.mjs) in plain Node, on a real library the library service made,
// with the fake connection and a feed on a local server: every method needs a library (no_library); the starter pack
// writes topics and sources and tries each source once; a round runs in the background under the fake connection and
// comes back as round-progress events ending with done:true and inbox-changed; a second start while one runs is refused;
// a self-check failure comes back in the answer; keep / dismiss / later / openItemUrl accept only urls the library knows.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { createPipelineService, withFirstProbe } from '../src/main/services/pipeline.mjs'
import { pipelineConfig, readConfig, readIndex, replayLedger } from '../src/main/core.mjs'
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

/** A world with its three services; `devConnection` picks the fake; a library is opened when `open` is true. */
async function setup({ devConnection = 'fake', open = true, hidden = false } = {}) {
  const w = testWorld('st-pipeline-')
  worlds.push(w)
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  const connections = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale, devConnection, connectorDeps: { env: { PATH: '', PATHEXT: '.EXE' } } })
  const pipeline = createPipelineService({ library, connections, emit: w.emit, log: w.log, hidden, shell: w.shell, locale, fetchContext: { timeoutMs: 2000, sleep: async () => {} } })
  if (open) {
    w.dialogAnswers.push(join(w.root, 'lib'))
    await library.handlers.chooseLibraryFolder()
    await library.handlers.useChosenFolder('test lib')
    // v2 package A: the registry id of the library, carried by every event about it
    w.libraryId = library.current().libraryId
  }
  return { w, library, connections, pipeline, dir: join(w.root, 'lib') }
}

test('without a library every pipeline method is no_library; the starter packs list needs none', async () => {
  const { pipeline } = await setup({ open: false })
  const h = pipeline.handlers
  for (const [name, args] of [['getHome', []], ['estimateRound', []], ['setRoundCap', [10]], ['startRound', []], ['cancelRound', []], ['getRoundState', []], ['getInbox', []], ['keepItem', ['https://x/1']], ['dismissItem', ['https://x/1', 'r']], ['laterItem', ['https://x/1']], ['openItemUrl', ['https://x/1']], ['getPipelineSettings', []], ['applyStarterPack', ['blank', null]]]) {
    await assert.rejects(async () => h[name](...args), err => err.code === 'no_library', name)
  }
  const packs = h.getStarterPacks()
  assert.deepEqual(packs.map(p => p.id), ['ai-agent-tools'])
  assert.equal(packs[0].name, 'AI Agent 工具')
  assert.deepEqual(packs[0].topics, ['agent 记忆', 'MCP 生态', '评测'])
  assert.ok(packs[0].sources.every(s => ['name', 'kind', 'url', 'topic'].every(k => k in s)))
})

test('applyStarterPack: topics and sources into streams.json, one try per source on the local server, bad edits refused', async () => {
  const { w, pipeline, dir } = await setup()
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, 3))
  const dead = srv.route('/gone', { status: 404, body: 'x', contentType: 'text/plain' })
  const h = pipeline.handlers
  await assert.rejects(async () => h.applyStarterPack('made-up', null), err => err.code === 'bad_arguments')
  await assert.rejects(async () => h.applyStarterPack('blank', { addRss: [{ name: 'a', url: 'ftp://x' }] }), err => err.code === 'bad_arguments')
  assert.deepEqual(readConfig(dir).config.sources, [], 'a refused edit wrote nothing')
  const r = await h.applyStarterPack('blank', { addRss: [{ name: 'local', url: feed }, { name: 'gone', url: dead }] })
  assert.deepEqual(r.topics, [])
  assert.deepEqual(r.sources.map(s => [s.name, s.kind, s.url, s.status, s.hint, s.count]), [['local', 'rss', feed, 'ok', 'none', 3], ['gone', 'rss', dead, 'gap', 'fix-address-or-remove', 0]])
  // redesign R5a (O9): the tries carry the state and the hint, no longer the fetcher's message (it goes to the diagnostics);
  // this line used to assert that every source had a message
  assert.ok(r.sources.every(s => !Object.hasOwn(s, 'message') && !Object.hasOwn(s, 'http')))
  assert.deepEqual(readConfig(dir).config.sources.map(s => s.name), ['local', 'gone'])
  assert.equal(readConfig(dir).config.name, 'test lib', 'the library name stays')
  assert.equal(existsSync(join(dir, '_pipeline', 'fetch_log.jsonl')) && readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8'), '', 'a try writes no fetch log')
  assert.deepEqual(replayLedger(dir).states.size, 0, 'a try writes no ledger')
  // the named pack in English, its topics then carried by the sources
  w.locale = { resolved: 'en' }
  assert.deepEqual(h.getStarterPacks()[0].topics, ['agent memory', 'MCP ecosystem', 'evaluation'])
})

test('settings of the pipeline: cap and the two thresholds; setRoundCap writes streams.json through the core', async () => {
  const { pipeline, dir } = await setup()
  const h = pipeline.handlers
  assert.deepEqual(h.getPipelineSettings(), { cap: 120, thresholds: { relevance: 0.7, substance: 0.6 }, schedule: null })
  assert.deepEqual(h.setRoundCap(7), { cap: 7 })
  assert.equal(pipelineConfig(dir).cap, 7)
  assert.equal(h.getPipelineSettings().cap, 7)
  assert.equal(JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8')).name, 'test lib')
  const e = h.estimateRound()
  assert.deepEqual([e.cap, e.sources, e.connection], [7, 0, null], 'no connection chosen yet')
})

test('a round in the background under the fake, with progress, done and inbox-changed', async () => {
  const { w, connections, pipeline, dir } = await setup()
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, 4))
  const h = pipeline.handlers
  await h.applyStarterPack('blank', { addRss: [{ name: 'local', url: feed }] })
  // a connection: the fake, chosen as active
  connections.handlers.setActiveConnection('claude-code')
  const est = h.estimateRound()
  assert.deepEqual([est.sources, est.connection.kind], [1, 'claude-code'])
  const home0 = h.getHome()
  assert.deepEqual([home0.library.name, home0.library.count, home0.numbers.caught, home0.numbers.inbox, home0.lastRound, home0.connection, home0.nextRun], ['lib', 0, 0, 0, null, { kind: 'claude-code', model: null }, null])
  const started = await h.startRound()
  assert.equal(started.started, true)
  assert.match(started.roundId, /^d-\d{8}T\d{6}Z-[0-9a-f]{6}$/)
  assert.equal(h.getRoundState().running, true)
  await assert.rejects(async () => h.startRound(), err => err.code === 'bad_arguments', 'one round at a time')
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && e.payload.done === true))
  const events = w.eventsOf('round-progress').filter(e => e.payload.roundId === started.roundId).map(e => e.payload)
  assert.deepEqual(events.slice(0, 2).map(e => e.phase), ['self-check', 'fetch'])
  assert.ok(events.some(e => e.phase === 'gate:relevance'), 'a gate phase')
  assert.ok(events.some(e => e.phase === 'summary'), 'a summary phase')
  const last = events.at(-1)
  assert.deepEqual([last.phase, last.done, last.cap, last.result.started, last.result.counts.inbox], ['done', true, 120, true, 4])
  assert.ok(events.slice(0, -1).every(e => e.done === false))
  assert.deepEqual(w.eventsOf('inbox-changed').at(-1).payload, { libraryId: w.libraryId, count: 4 })
  const state = h.getRoundState()
  assert.deepEqual([state.running, state.roundId, state.last.counts.inbox, state.lastProblems, state.progress.done], [false, started.roundId, 4, null, true])
  const home = h.getHome()
  assert.deepEqual([home.numbers.inbox, home.lastRound.id, home.problem], [4, state.last.round.id, null])
  assert.equal(home.lastRound.counts.inbox, 4)
  // usage: the probe of the self-check once (not twice), under 'probe'
  const usage = readFileSync(join(dir, '_pipeline', 'usage.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.equal(usage.filter(u => u.purpose === 'probe').length, 1, 'the self-check probe is counted once')
  assert.ok(usage.some(u => u.purpose === 'gate:relevance') && usage.some(u => u.purpose === 'summary'))
  // cancel with nothing running
  assert.deepEqual(h.cancelRound(), { cancelled: false })
})

test('the inbox and the decisions: only a url in the inbox can be kept or dismissed; keep writes a note and rebuilds; open only a known url', async () => {
  const { w, connections, pipeline, dir } = await setup()
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, 2))
  const h = pipeline.handlers
  await h.applyStarterPack('blank', { addRss: [{ name: 'local', url: feed }] })
  connections.handlers.setActiveConnection('codex')
  const started = await h.startRound()
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && e.payload.done === true))
  const inbox = h.getInbox()
  assert.equal(inbox.items.length, 2)
  assert.deepEqual(inbox.recentDismissReasons, [])
  const [a, b] = inbox.items.map(i => i.url)
  assert.ok(a.startsWith(srv.base))
  // refused: not in the inbox, empty reason
  await assert.rejects(async () => h.keepItem('https://example.org/not-there'), err => err.code === 'bad_arguments')
  await assert.rejects(async () => h.dismissItem('https://example.org/not-there', 'r'), err => err.code === 'bad_arguments')
  await assert.rejects(async () => h.openItemUrl('https://example.org/not-there'), err => err.code === 'bad_arguments')
  assert.deepEqual(w.opened, [])
  // later: nothing changes
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
  const quiet = createPipelineService({ library: { require: () => dir, current: () => ({ path: dir, name: 'lib' }), dir: () => dir }, connections, emit: w.emit, log: w.log, hidden: true, shell: w.shell, locale: () => w.locale })
  assert.equal(await quiet.handlers.openItemUrl(a), null)
  assert.deepEqual(w.opened, [a, b], 'not opened again')
  assert.ok(w.lines.some(l => l.startsWith('not opened in a test run')))
})

test('withFirstProbe: the first probe is the given result, later ones reach the connector; a login-expired fake fails the self-check with its code', async () => {
  let real = 0
  const c = withFirstProbe({ kind: 'x', probe: async () => { real++; return { ok: true, latencyMs: 1 } }, complete: async () => ({ ok: true }) }, { ok: true, latencyMs: 99 })
  assert.deepEqual(await c.probe(), { ok: true, latencyMs: 99 })
  assert.equal(real, 0)
  await c.probe()
  assert.equal(real, 1)
  const { connections, pipeline } = await setup({ devConnection: 'login-expired' })
  connections.handlers.setActiveConnection('claude-code')
  const r = await pipeline.handlers.startRound()
  assert.equal(r.started, false)
  assert.deepEqual([r.problems[0].code, r.problems[0].connectionCode], ['connection', 'login-expired'])
  const home = pipeline.handlers.getHome()
  // redesign R2: the problem says when the run did not start (the funnel's 「上次运行 · 时间 · 未完成」)
  assert.ok(!Number.isNaN(Date.parse(home.problem.at)), String(home.problem.at))
  assert.deepEqual(home.problem, { code: 'connection', connectionCode: 'login-expired', kind: 'claude-code', caughtKept: 0, at: home.problem.at })
  assert.equal(pipeline.handlers.getRoundState().lastProblems[0].connectionCode, 'login-expired')
})

const usageLines = dir => {
  const p = join(dir, '_pipeline', 'usage.jsonl')
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
}

test('no connection chosen: startRound runs a scoreless round (everything fetched to the inbox, 0 calls); a chosen but broken connection still fails the self-check', async () => {
  const { w, pipeline, dir } = await setup()
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, 3))
  const h = pipeline.handlers
  await h.applyStarterPack('blank', { addRss: [{ name: 'local', url: feed }] })
  const started = await h.startRound()
  assert.equal(started.started, true, 'no connection is no longer a self-check failure')
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && e.payload.done === true))
  const last = w.eventsOf('round-progress').filter(e => e.payload.roundId === started.roundId).at(-1).payload
  assert.deepEqual([last.result.started, last.result.scoreless, last.result.calls, last.result.counts.inbox, last.calls], [true, true, 0, 3, 0])
  assert.ok(!w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && /^gate:|^summary$/.test(e.payload.phase)), 'no gate, no summary')
  const inbox = h.getInbox().items
  assert.equal(inbox.length, 3)
  assert.ok(inbox.every(i => i.scoreless === true))
  assert.deepEqual(w.eventsOf('inbox-changed').at(-1).payload, { libraryId: w.libraryId, count: 3 })
  assert.equal(usageLines(dir).length, 0, 'no model call, no probe')
  const home = h.getHome()
  assert.deepEqual([home.lastRound.scoreless, home.problem, home.connection], [true, null, null])
  // reverse: a connection chosen whose connector is broken (login expired) still fails the self-check, nothing starts
  const broken = await setup({ devConnection: 'login-expired' })
  await broken.pipeline.handlers.applyStarterPack('blank', { addRss: [{ name: 'local', url: feed }] })
  broken.connections.handlers.setActiveConnection('codex')
  const r = await broken.pipeline.handlers.startRound()
  assert.deepEqual([r.started, r.problems[0].code, r.problems[0].connectionCode], [false, 'connection', 'login-expired'])
  assert.equal(broken.pipeline.handlers.getInbox().items.length, 0)
})

test('S4: getPipeline (config, last round, recent reasons, verdict failures per checked node); savePipeline through the core, locked or bad → bad_arguments', async () => {
  const { w, connections, pipeline, dir } = await setup()
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, 2))
  const h = pipeline.handlers
  await h.applyStarterPack('blank', { addRss: [{ name: 'local', url: feed }] })
  const empty = h.getPipeline()
  assert.deepEqual([empty.lastRound, empty.dismissReasons], [null, []])
  assert.deepEqual(Object.keys(empty.verdictFailures), ['relevance', 'substance', 'summary'])
  assert.deepEqual(empty.config, pipelineConfig(dir))
  connections.handlers.setActiveConnection('claude-code')
  const started = await h.startRound()
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && e.payload.done === true))
  // redesign R2 (N03): held, then written with its reason when the bar closes
  h.dismissItem(h.getInbox().items[0].url)
  h.settleDismiss('不相关', 'irrelevant')
  const p = h.getPipeline()
  assert.equal(p.lastRound.id, h.getRoundState().last.round.id)
  assert.deepEqual(p.dismissReasons.map(r => r.reason), ['不相关'])
  assert.ok(Object.values(p.verdictFailures).every(Array.isArray))
  // save: a threshold changed → written, library-changed, the saved configuration back (baseline items included)
  const cfg = structuredClone(p.config)
  cfg.nodes.find(n => n.id === 'relevance').threshold = 0.5
  const before = w.events.length
  const saved = h.savePipeline(cfg)
  assert.equal(saved.config.nodes.find(n => n.id === 'relevance').threshold, 0.5)
  assert.equal(pipelineConfig(dir).nodes.find(n => n.id === 'relevance').threshold, 0.5)
  assert.ok(saved.config.nodes.find(n => n.id === 'relevance').checklist.some(i => i.origin === 'streams'))
  assert.deepEqual(w.events.slice(before).map(e => e.topic), ['library-changed'])
  assert.deepEqual(w.events.at(-1).payload, { libraryId: w.libraryId, path: dir, name: 'lib' })
  // refused, nothing written, no event: a fixed node changed (locked-node), a threshold out of 0–1 (bad-config)
  const disk = readFileSync(join(dir, 'streams.json'), 'utf8')
  const locked = structuredClone(saved.config)
  locked.nodes.find(n => n.id === 'fetch').kind = 'gate'
  const outOfRange = structuredClone(saved.config)
  outOfRange.nodes.find(n => n.id === 'substance').threshold = 2
  const eventsNow = w.events.length
  assert.throws(() => h.savePipeline(locked), err => err.code === 'bad_arguments')
  assert.throws(() => h.savePipeline(outOfRange), err => err.code === 'bad_arguments')
  assert.equal(readFileSync(join(dir, 'streams.json'), 'utf8'), disk)
  assert.equal(w.events.length, eventsNow)
})

test('S4: previewNode tries one node on one ledger item (nothing written but the usage); unknown node or url → bad_arguments; no connection → no_connection', async () => {
  const { w, connections, pipeline, dir } = await setup()
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, 2))
  const h = pipeline.handlers
  await h.applyStarterPack('blank', { addRss: [{ name: 'local', url: feed }] })
  connections.handlers.setActiveConnection('api')
  const started = await h.startRound()
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && e.payload.done === true))
  const url = [...replayLedger(dir).states.keys()][0]
  const ledger = readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8')
  const verdicts = readFileSync(join(dir, '_pipeline', 'verdicts.jsonl'), 'utf8')
  const usage0 = usageLines(dir).length
  const r = await h.previewNode('relevance', url)
  assert.equal(r.ok, true)
  assert.equal(typeof r.output.relevance, 'number')
  assert.ok(r.calls >= 1)
  assert.equal(readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8'), ledger, 'no ledger line')
  assert.equal(readFileSync(join(dir, '_pipeline', 'verdicts.jsonl'), 'utf8'), verdicts, 'no verdict line')
  const added = usageLines(dir).slice(usage0)
  assert.ok(added.length >= 1 && added.every(u => u.purpose === 'preview:relevance'), JSON.stringify(added))
  await assert.rejects(async () => h.previewNode('fetch', url), err => err.code === 'bad_arguments', 'a fixed node')
  await assert.rejects(async () => h.previewNode('made-up', url), err => err.code === 'bad_arguments')
  await assert.rejects(async () => h.previewNode('relevance', 'https://example.org/never-seen'), err => err.code === 'bad_arguments')
  connections.handlers.setActiveConnection(null)
  await assert.rejects(async () => h.previewNode('relevance', url), err => err.code === 'no_connection')
  const { pipeline: none } = await setup({ open: false })
  for (const [name, args] of [['getPipeline', []], ['savePipeline', [{}]], ['previewNode', ['relevance', url]]]) {
    await assert.rejects(async () => none.handlers[name](...args), err => err.code === 'no_library', name)
  }
})
