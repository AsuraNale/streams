// The proposal cards in the main process (v2 package B; src/main/services/proposals.mjs; docs/desktop.md §4.5) in plain Node,
// on real libraries the library service registered, the real schedule service with a pipeline stand-in that only records
// which library's round it was asked to start, and the trials on a local fake server: every library kind made by
// createProposal and confirmed through the bridge handler changes the library's streams.json as the kind says; decline,
// revise, a stale card, a second confirm and an unknown id change nothing (N1: only confirmProposal of a pending card does);
// create_library goes to libraryRoot\<name>, is registered, made the current library and its first round queued, and is
// undone when its registration fails; the record (the app's proposals.jsonl and the library's) is read back at start;
// 「谁定的」 tells the user's own changes (the v1.0 bridge methods) from the confirmed cards; the development hook makes cards
// by 'dev'. Each rule first gets the input made to break it. Nothing here touches the real app data or Documents folder.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createProposalsService } from '../src/main/services/proposals.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createScheduleService } from '../src/main/services/schedule.mjs'
import { createSourcesService } from '../src/main/services/sources.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { PROPOSAL_STATUSES as BRIDGE_STATUSES, checkArgs } from '../src/main/bridge-methods.mjs'
import { PROPOSAL_STATUSES, createLibrary } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { startFakeServer } from '../../core/test/support/fake-server.mjs'
import { rssWith } from '../../core/test/support/feeds.mjs'

const worlds = []
const srv = await startFakeServer()
after(async () => {
  await srv.close()
  for (const w of worlds) removeTree(w.root, { waitMs: 3000 })
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const FEED_OK = srv.route('/ok', { body: rssWith([{ title: 'One', url: 'https://x.test/1' }]) })
const FEED_BLOCKED = srv.route('/blocked', { status: 403, body: 'no' })
const CLOCK = new Date(Date.UTC(2026, 10, 5, 16, 0, 0))
const now = () => CLOCK

/** sha256 of every file under dir (relative path → hash). */
function tree(dir) {
  const out = {}
  const walk = d => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) walk(p)
      else out[relative(dir, p).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir)
  return out
}
const config = dir => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'))
const lines = path => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(l => l.trim() !== '').map(l => JSON.parse(l)) : [])

/** A pipeline stand-in: records every round it is asked to start (the schedule's queue decides when). */
function recordingPipeline() {
  const p = { order: [], running: null }
  p.isRunning = () => p.running !== null
  p.runningLibrary = () => p.running
  p.startRoundIn = async entry => { p.order.push(entry.id); p.running = entry.id; return { started: true, roundId: `d-${p.order.length}` } }
  return p
}

/**
 * Two registered libraries (a current, b), each with a topic and two sources; the library, schedule, sources, pipeline and
 * proposals services on them; the app data in a temporary folder; libraryRoot a folder of the world.
 */
async function setup({ libraryOverride, schedulerOverride, devProposals = null } = {}) {
  const w = testWorld('st-proposals-')
  worlds.push(w)
  writeFileSync(w.settingsFile, `${JSON.stringify({ schedule: { enabled: false, time: '09:15' } })}\n`)
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now })
  const ids = {}
  for (const name of ['b', 'a']) {
    const dir = join(w.root, name)
    createLibrary(dir, { name })
    const cfg = config(dir)
    cfg.topics = [{ name: 'agent 记忆', keywords: ['agent memory'] }]
    cfg.sources = [{ name: 'feed-a', kind: 'rss', url: FEED_OK, topic: 'agent 记忆' }, { name: 'hn-agents', kind: 'hn', query: 'agent' }]
    cfg.x_future = { keep: true }
    writeFileSync(join(dir, 'streams.json'), `${JSON.stringify(cfg, null, 2)}\n`)
    w.dialogAnswers.push(dir)
    await library.handlers.chooseLibraryFolder()
    ids[name] = (await library.handlers.useChosenFolder('')).libraryId
  }
  const pipelineStub = recordingPipeline()
  const schedule = createScheduleService({ settingsFile: w.settingsFile, library, pipeline: pipelineStub, emit: w.emit, log: w.log, now, timers: { set: () => 0, clear: () => {} } })
  const lib = libraryOverride ? libraryOverride(library) : library
  const sched = schedulerOverride ? schedulerOverride(schedule) : schedule
  const libraryRoot = join(w.root, 'libs')
  const make = () => createProposalsService({
    appDataDir: w.root, library: lib, scheduler: () => sched, emit: w.emit, log: w.log, now, fetchContext: { timeoutMs: 1500, sleep: async () => {} },
    libraryRoot: () => libraryRoot, fallbackSchedule: () => ({ enabled: false, time: '09:15' }), locale: () => w.locale, devProposals,
  })
  const proposals = make()
  const sources = createSourcesService({ library, emit: w.emit, log: w.log, now })
  const pipeline = createPipelineService({ library, connections: { active: () => null }, emit: w.emit, log: w.log, shell: w.shell, locale: () => w.locale, now })
  return { w, library, schedule, pipelineStub, proposals, h: proposals.handlers, make, sources: sources.handlers, pipeline: pipeline.handlers, ids, dir: name => join(w.root, name), libraryRoot }
}

const WHY = '你说过想追 agent 记忆'
const GOOD = {
  add_source: [{ source: { name: 'feed-b', kind: 'rss', url: FEED_OK } }, c => assert.deepEqual(c.sources.map(s => s.name), ['feed-a', 'hn-agents', 'feed-b'])],
  remove_source: [{ name: 'hn-agents' }, c => assert.deepEqual(c.sources.map(s => s.name), ['feed-a'])],
  pause_source: [{ name: 'hn-agents', paused: true }, c => assert.equal(c.sources[1].paused, true)],
  edit_topics: [{ ops: [{ op: 'add_topic', name: 'RAG', keywords: ['retrieval'] }, { op: 'add_keywords', topic: 'agent 记忆', keywords: ['memory blocks'] }] }, c => assert.deepEqual(c.topics, [{ name: 'agent 记忆', keywords: ['agent memory', 'memory blocks'] }, { name: 'RAG', keywords: ['retrieval'] }])],
  edit_brief: [{ brief: '只要工程实践' }, c => assert.equal(c.brief, '只要工程实践')],
  edit_thresholds: [{ substance: 0.75 }, c => assert.equal(c.pipeline.nodes.find(n => n.id === 'substance').threshold, 0.75)],
  edit_schedule: [{ enabled: true, time: '06:45' }, c => assert.deepEqual(c.schedule, { enabled: true, time: '06:45' })],
  edit_cap: [{ cap: 25 }, c => assert.equal(c.pipeline.cap, 25)],
}

test('the statuses of the bridge are the core\'s; the bridge checks the arguments of the five methods', () => {
  assert.deepEqual([...BRIDGE_STATUSES], [...PROPOSAL_STATUSES])
  for (const ok of [['listProposals', [null]], ['listProposals', [{ status: 'pending' }]], ['listProposals', [{ libraryId: null }]], ['confirmProposal', ['p-1']], ['reviseProposal', ['p-1', '换一个']], ['getWhoDecided', []]]) checkArgs(...ok)
  for (const bad of [['listProposals', [{ status: 'done' }]], ['listProposals', [{ kind: 'x' }]], ['listProposals', []], ['confirmProposal', ['']], ['confirmProposal', ['p-1', true]], ['reviseProposal', ['p-1', '']], ['reviseProposal', ['p-1', 'x'.repeat(2001)]], ['declineProposal', [42]]]) {
    assert.throws(() => checkArgs(...bad), err => err.code === 'bad_arguments', JSON.stringify(bad))
  }
})

for (const [kind, [params, check]] of Object.entries(GOOD)) {
  test(`${kind}: made by createProposal (pending, on the record, an event), confirmed through the bridge → the library changed; agent-confirmed in 「谁定的」`, async () => {
    const { w, h, proposals, ids, dir, library } = await setup()
    const n = w.events.length
    const card = await proposals.createProposal(kind, { libraryId: ids.b, ...params }, WHY)
    assert.equal(card.status, 'pending')
    assert.deepEqual(h.listProposals({ status: 'pending' }).map(c => c.id), [card.id])
    assert.deepEqual(w.events.slice(n).filter(e => e.topic === 'proposals-changed').map(e => e.payload), [{ libraryId: ids.b, id: card.id, status: 'pending' }])
    const done = h.confirmProposal(card.id)
    assert.equal(done.status, 'confirmed', JSON.stringify(done.failure ?? done.reason))
    check(config(dir('b')))
    assert.deepEqual(config(dir('b')).x_future, { keep: true })
    // the record: the app's and the library's, two lines each (made, confirmed)
    assert.deepEqual(lines(join(w.root, 'proposals.jsonl')).map(c => c.status), ['pending', 'confirmed'])
    assert.deepEqual(lines(join(dir('b'), '_pipeline', 'proposals.jsonl')).map(c => c.status), ['pending', 'confirmed'])
    assert.equal(existsSync(join(dir('a'), '_pipeline', 'proposals.jsonl')), false, 'not in the other library')
    // 「谁定的」 of library b, through the bridge (b made the current library)
    const changed = done.result.changed
    assert.ok(changed.length >= 1)
    library.handlers.setActiveLibrary(ids.b)
    const who = h.getWhoDecided()
    for (const f of changed) assert.deepEqual([who[f].by, who[f].proposalId], ['agent-confirmed', card.id], f)
  })
}

test('edit_schedule confirmed: the timer armed again, settings-changed { libraryId }; a change of the current library sends library-changed', async () => {
  let armed = 0
  const { w, h, proposals, ids, schedule } = await setup({ schedulerOverride: s => ({ ...s, arm: () => { armed += 1; return s.arm() } }) })
  const card = await proposals.createProposal('edit_schedule', { libraryId: ids.b, enabled: true, time: '06:45' }, WHY)
  const n = w.events.length
  assert.equal(armed, 0)
  h.confirmProposal(card.id)
  assert.equal(armed, 1, 'the timer armed again')
  assert.deepEqual(w.events.slice(n).filter(e => e.topic === 'settings-changed').map(e => e.payload), [{ libraryId: ids.b }])
  assert.equal(schedule.viewOf({ id: ids.b, path: join(w.root, 'b') }).time, '06:45')
  const c2 = await proposals.createProposal('edit_cap', { libraryId: ids.a, cap: 9 }, WHY)
  const m = w.events.length
  h.confirmProposal(c2.id)
  assert.deepEqual(w.events.slice(m).filter(e => e.topic === 'library-changed').map(e => e.payload?.libraryId), [ids.a], 'a is the current library')
})

test('run_round confirmed: one round of that library put in the app\'s queue (package A); not twice while it runs', async () => {
  const { h, proposals, ids, pipelineStub, schedule } = await setup()
  const card = await proposals.createProposal('run_round', { libraryId: ids.b }, WHY)
  const done = h.confirmProposal(card.id)
  assert.equal(done.status, 'confirmed')
  await sleep(0)
  assert.deepEqual(pipelineStub.order, [ids.b])
  assert.equal(schedule.queue().running, ids.b)
  const again = await proposals.createProposal('run_round', { libraryId: ids.b }, WHY)
  const r = h.confirmProposal(again.id)
  assert.deepEqual([r.status, r.result.queued, r.result.queueReason], ['confirmed', false, 'running'])
  await sleep(0)
  assert.deepEqual(pipelineStub.order, [ids.b], 'not a second round')
})

test('N1: decline, revise, a confirm of a card that is not pending, an unknown id — bad_arguments where it says, the library byte for byte', async () => {
  for (const [kind, [params]] of Object.entries(GOOD)) {
    const { w, h, proposals, ids, dir, pipelineStub } = await setup()
    const a = await proposals.createProposal(kind, { libraryId: ids.b, ...params }, WHY)
    const b = await proposals.createProposal(kind, { libraryId: ids.b, ...params }, WHY)
    const before = tree(dir('b'))
    const recordOf = () => Object.fromEntries(Object.entries(tree(dir('b'))).filter(([k]) => k !== '_pipeline/proposals.jsonl'))
    const libOnly = Object.fromEntries(Object.entries(before).filter(([k]) => k !== '_pipeline/proposals.jsonl'))
    assert.equal(h.declineProposal(a.id).status, 'declined')
    assert.deepEqual(h.reviseProposal(b.id, '换一个更窄的').reviseText, '换一个更窄的')
    assert.deepEqual(recordOf(), libOnly, `${kind}: decline and revise changed nothing of the library`)
    for (const id of [a.id, b.id]) {
      assert.throws(() => h.confirmProposal(id), err => err.code === 'bad_arguments', `${kind}: confirm after ${h.listProposals(null).find(c => c.id === id).status}`)
      assert.throws(() => h.declineProposal(id), err => err.code === 'bad_arguments')
      assert.throws(() => h.reviseProposal(id, 'x'), err => err.code === 'bad_arguments')
    }
    assert.throws(() => h.confirmProposal('p-not-a-card'), err => err.code === 'bad_arguments')
    assert.deepEqual(recordOf(), libOnly, `${kind}: the refused calls changed nothing`)
    assert.equal(h.listProposals(null).find(c => c.id === a.id).status, 'declined', 'the refused confirm left the card as it was')
    // control: a third card of the same, confirmed, does change the library; then never again
    const c = await proposals.createProposal(kind, { libraryId: ids.b, ...params }, WHY)
    assert.equal(h.confirmProposal(c.id).status, 'confirmed')
    const after1 = recordOf()
    assert.notDeepEqual(after1, libOnly)
    const records = lines(join(w.root, 'proposals.jsonl')).length
    assert.throws(() => h.confirmProposal(c.id), err => err.code === 'bad_arguments')
    assert.deepEqual(recordOf(), after1, `${kind}: a second confirm changed nothing (changes.jsonl included)`)
    assert.equal(lines(join(w.root, 'proposals.jsonl')).length, records, 'nor wrote a line')
    assert.equal(h.listProposals(null).find(x => x.id === c.id).status, 'confirmed')
    assert.deepEqual(pipelineStub.order, [])
  }
})

test('stale: the user changed the same part through the v1.0 bridge after the card was made → confirm gives stale, nothing changed; 「谁定的」 says you', async () => {
  const { h, proposals, ids, dir, sources, pipeline, library } = await setup()
  library.handlers.setActiveLibrary(ids.b)
  const add = await proposals.createProposal('add_source', { libraryId: ids.b, source: { name: 'feed-b', kind: 'rss', url: FEED_OK } }, WHY)
  const thr = await proposals.createProposal('edit_thresholds', { libraryId: ids.b, relevance: 0.5 }, WHY)
  sources.removeSource('hn-agents')
  const cfg = pipeline.getPipeline().config
  pipeline.savePipeline({ ...cfg, nodes: cfg.nodes.map(n => (n.id === 'relevance' ? { ...n, threshold: 0.6 } : n)) })
  const t = tree(dir('b'))
  for (const c of [add, thr]) assert.deepEqual([h.confirmProposal(c.id).status, h.listProposals(null).find(x => x.id === c.id).reason], ['stale', 'changed'])
  const t2 = tree(dir('b'))
  delete t['_pipeline/proposals.jsonl']
  delete t2['_pipeline/proposals.jsonl']
  assert.deepEqual(t2, t, 'nothing of the library changed')
  const who = h.getWhoDecided()
  assert.deepEqual([who.sources.by, who.thresholds.by, who.brief], ['you', 'you', null])
  // control: a card made now (after the changes) goes through, and 「谁定的」 then says agent-confirmed
  const add2 = await proposals.createProposal('add_source', { libraryId: ids.b, source: { name: 'feed-b', kind: 'rss', url: FEED_OK } }, WHY)
  assert.equal(h.confirmProposal(add2.id).status, 'confirmed')
  assert.deepEqual([h.getWhoDecided().sources.by, h.getWhoDecided().sources.proposalId], ['agent-confirmed', add2.id])
})

test('「谁定的」 by you: every v1.0 bridge method that changes sources, topics, thresholds, schedule or cap writes its line; a refused one none', async () => {
  const { w, ids, dir, sources, pipeline, schedule, library, h } = await setup()
  library.handlers.setActiveLibrary(ids.b)
  const changes = () => lines(join(dir('b'), '_pipeline', 'changes.jsonl'))
  sources.addSource({ name: 'feed-c', kind: 'rss', url: FEED_OK })
  sources.updateSource('feed-c', { url: `${FEED_OK}?v=2` })
  sources.setSourcePaused('feed-c', true)
  sources.removeSource('feed-c')
  sources.addTopic({ name: 'RAG' })
  sources.updateTopic('RAG', { keywords: ['retrieval'] })
  sources.removeTopic('RAG')
  pipeline.setRoundCap(33)
  const cfg = pipeline.getPipeline().config
  pipeline.savePipeline({ ...cfg, nodes: cfg.nodes.map(n => (n.id === 'substance' ? { ...n, threshold: 0.65 } : n)) })
  schedule.handlers.setSchedule({ enabled: false, time: '22:00' })
  assert.deepEqual(changes().map(l => [l.field, l.by]), [['sources', 'you'], ['sources', 'you'], ['sources', 'you'], ['sources', 'you'], ['topics', 'you'], ['topics', 'you'], ['topics', 'you'], ['cap', 'you'], ['thresholds', 'you'], ['schedule', 'you']])
  assert.deepEqual(changes()[7].before, 120)
  assert.deepEqual(changes()[7].after, 33)
  // a refused change: no line
  const n = changes().length
  assert.throws(() => sources.addSource({ name: 'feed-a', kind: 'rss', url: FEED_OK }), err => err.code === 'bad_arguments')
  assert.throws(() => pipeline.savePipeline({ ...cfg, nodes: cfg.nodes.map(x => (x.id === 'substance' ? { ...x, threshold: 7 } : x)) }), err => err.code === 'bad_arguments')
  // and a save that changes neither the thresholds nor the cap: no line either
  pipeline.savePipeline(pipeline.getPipeline().config)
  assert.equal(changes().length, n)
  const who = h.getWhoDecided()
  for (const f of ['sources', 'topics', 'thresholds', 'schedule', 'cap']) assert.equal(who[f].by, 'you', f)
  assert.equal(who.brief, null)
  assert.equal(w.events.length > 0, true)
  // the first run's starter pack (its sources tried against a stand-in fetch that answers 404: no network)
  library.handlers.setActiveLibrary(ids.a)
  const first = createPipelineService({ library, connections: { active: () => null }, emit: w.emit, log: w.log, shell: w.shell, locale: () => w.locale, now, fetchContext: { fetchImpl: async () => new Response('none', { status: 404 }), timeoutMs: 1000, sleep: async () => {} } })
  await first.handlers.applyStarterPack('ai-agent-tools', null)
  assert.deepEqual(lines(join(dir('a'), '_pipeline', 'changes.jsonl')).map(l => [l.field, l.by]), [['sources', 'you'], ['topics', 'you']])
})

test('create_library: libraryRoot\\<name> on the card, the blocked source unticked; confirmed → made, registered, the current library, its round queued', async () => {
  const { w, h, proposals, library, pipelineStub, libraryRoot } = await setup()
  const n = w.events.length
  const card = await proposals.createProposal('create_library', {
    name: 'MCP 安全?', brief: '追 MCP 安全事件', topics: [{ name: 'MCP', keywords: ['mcp'] }],
    sources: [{ name: 'feed-ok', kind: 'rss', url: FEED_OK, topic: 'MCP' }, { name: 'feed-blocked', kind: 'rss', url: FEED_BLOCKED }],
  }, WHY)
  assert.equal(card.params.folder, join(libraryRoot, 'MCP 安全-'))
  assert.deepEqual(card.trial.map(t => [t.name, t.include]), [['feed-ok', true], ['feed-blocked', false]])
  assert.deepEqual(card.params.schedule, { enabled: false, time: '09:15' }, 'no schedule given: settings.json\'s')
  assert.equal(existsSync(card.params.folder), false, 'nothing made yet')
  assert.deepEqual(w.events.slice(n).filter(e => e.topic === 'proposals-changed').map(e => e.payload.libraryId), [null])
  const done = h.confirmProposal(card.id)
  assert.equal(done.status, 'confirmed', JSON.stringify(done.failure))
  const id = done.result.libraryId
  const listed = library.handlers.listLibraries().find(l => l.id === id)
  assert.deepEqual([listed.path, listed.name, listed.active], [card.params.folder, 'MCP 安全?', true], 'registered, under the card\'s name, the current library')
  assert.deepEqual(config(card.params.folder).sources.map(s => s.name), ['feed-ok'])
  assert.equal(config(card.params.folder).brief, '追 MCP 安全事件')
  await sleep(0)
  assert.deepEqual(pipelineStub.order, [id], 'its first round in the queue')
  assert.deepEqual(lines(join(card.params.folder, '_pipeline', 'proposals.jsonl')).map(c => [c.id, c.status]), [[card.id, 'confirmed']])
  assert.deepEqual(w.events.slice(n).filter(e => e.topic === 'proposals-changed').map(e => e.payload), [{ libraryId: null, id: card.id, status: 'pending' }, { libraryId: null, id: card.id, status: 'confirmed' }])
  assert.equal(h.getWhoDecided().brief.by, 'agent-confirmed', '「谁定的」 of the new (current) library')
})

test('create_library: a folder that is not empty is refused; the registration failing undoes the library; the queue failing leaves it, said', async () => {
  // not empty
  {
    const { proposals, libraryRoot } = await setup()
    mkdirSync(join(libraryRoot, 'busy'), { recursive: true })
    writeFileSync(join(libraryRoot, 'busy', 'mine.md'), '# mine\n')
    await assert.rejects(proposals.createProposal('create_library', { name: 'busy', brief: 'b' }, WHY), err => err.code === 'bad-proposal' && err.reason === 'folder_not_empty')
    assert.deepEqual(readdirSync(join(libraryRoot, 'busy')), ['mine.md'])
  }
  // the registry refusing
  {
    const { h, proposals, library, ids } = await setup({ libraryOverride: l => ({ ...l, adopt: () => { throw new Error('registry not writable') } }) })
    const card = await proposals.createProposal('create_library', { name: 'n1', brief: 'b' }, WHY)
    const r = h.confirmProposal(card.id)
    assert.deepEqual([r.status, r.failure.step, r.failure.rolledBack], ['failed', 'register', true])
    assert.equal(existsSync(card.params.folder), false, 'no half library left')
    assert.equal(library.handlers.listLibraries().length, 2)
    assert.equal(library.current().libraryId, ids.a, 'the current library as it was')
  }
  // the queue refusing, after the registration
  {
    const { h, proposals, library } = await setup({ schedulerOverride: s => ({ ...s, queueRound: () => { throw new Error('queue broke') } }) })
    const card = await proposals.createProposal('create_library', { name: 'n2', brief: 'b' }, WHY)
    const r = h.confirmProposal(card.id)
    assert.deepEqual([r.status, r.failure.step, r.failure.rolledBack], ['failed', 'queue', false])
    assert.equal(library.current().libraryId, r.result.libraryId, 'the library stays, registered and current')
    assert.equal(config(card.params.folder).brief, 'b')
  }
})

test('the registration undone when a step after it fails: forget drops it and the current library is the one before', async () => {
  const { library, ids, w } = await setup()
  const dir = join(w.root, 'c')
  createLibrary(dir, { name: 'c' })
  const r = library.adopt(dir, { name: '库 C' })
  assert.equal(library.current().libraryId, r.libraryId)
  library.forget(r.libraryId, ids.a)
  assert.equal(library.current().libraryId, ids.a)
  assert.ok(!library.handlers.listLibraries().some(l => l.id === r.libraryId))
  assert.ok(existsSync(join(dir, 'streams.json')), 'forget touches nothing on disk')
})

test('unknown or unreadable library, bad params: bad-proposal, no card, nothing on the record', async () => {
  const { w, proposals, ids, h } = await setup()
  await assert.rejects(proposals.createProposal('edit_cap', { libraryId: 'zzzzzzzz', cap: 3 }, WHY), err => err.code === 'bad-proposal' && err.reason === 'unknown-library')
  await assert.rejects(proposals.createProposal('edit_cap', { libraryId: ids.b, cap: -1 }, WHY), err => err.code === 'bad-proposal')
  await assert.rejects(proposals.createProposal('edit_cap', { libraryId: ids.b, cap: 3 }, ''), err => err.code === 'bad-proposal')
  assert.deepEqual(h.listProposals(null), [])
  assert.equal(existsSync(join(w.root, 'proposals.jsonl')), false)
})

test('at start the cards are read back from the app\'s proposals.jsonl: the last line of each, a bad line skipped; a pending one can still be confirmed', async () => {
  const { w, h, proposals, ids, make, dir } = await setup()
  const a = await proposals.createProposal('edit_brief', { libraryId: ids.b, brief: '第一版要求' }, WHY)
  const b = await proposals.createProposal('edit_cap', { libraryId: ids.b, cap: 7 }, WHY)
  h.declineProposal(a.id)
  writeFileSync(join(w.root, 'proposals.jsonl'), `${readFileSync(join(w.root, 'proposals.jsonl'), 'utf8')}{broken\n`)
  const again = make().handlers
  assert.deepEqual(again.listProposals(null).map(c => [c.id, c.status]), [[b.id, 'pending'], [a.id, 'declined']])
  assert.ok(w.lines.some(l => /1 bad lines skipped/.test(l)))
  assert.throws(() => again.confirmProposal(a.id), err => err.code === 'bad_arguments')
  assert.equal(again.confirmProposal(b.id).status, 'confirmed')
  assert.equal(config(dir('b')).pipeline.cap, 7)
  assert.deepEqual(again.listProposals({ status: 'confirmed', libraryId: ids.b }).map(c => c.id), [b.id])
  assert.deepEqual(again.listProposals({ libraryId: null }), [])
})

test('the development hook: the file\'s cards made by dev (a library card without libraryId takes the current library); a bad one skipped and said', async () => {
  const file = join(testWorld('st-proposals-dev-').root, 'cards.json')
  worlds.push({ root: join(file, '..') })
  writeFileSync(file, JSON.stringify([
    { kind: 'edit_brief', params: { brief: '开发卡' }, why: '给界面测试' },
    { kind: 'edit_cap', params: { cap: 0 }, why: '坏的' },
    { kind: 'create_library', params: { name: '开发库', brief: 'x' }, why: '建库卡' },
  ]))
  const { h, proposals, ids, w } = await setup({ devProposals: file })
  const made = await proposals.loadDev()
  assert.deepEqual(made.map(c => [c.kind, c.by, c.libraryId]), [['edit_brief', 'dev', ids.a], ['create_library', 'dev', null]])
  assert.equal(h.listProposals({ status: 'pending' }).length, 2)
  assert.ok(w.lines.some(l => /development card 1 not made: bad-proposal/.test(l)))
  // no file: nothing
  const none = await setup()
  assert.deepEqual(await none.proposals.loadDev(), [])
})
