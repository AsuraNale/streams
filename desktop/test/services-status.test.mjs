// The run-status service (src/main/services/status.mjs) in plain Node, on a library the core itself wrote
// (test/support/seed.mjs): every method needs a library (no_library); getStatus is the core's statusView plus the
// connections as getConnections gives them; the run-log folder opens through shell.openPath (a test run only logs; a
// failure is open_failed); the graph gets the filter and the clock; a url for the verdicts must be in the ledger, and the
// core is not asked otherwise. The real core's statusView / graph / verdictsFor run when they are there, skipped otherwise.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { join } from 'node:path'
import * as realCore from '../src/main/core.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { createStatusService } from '../src/main/services/status.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { seedLibrary } from './support/seed.mjs'

const W5 = ['statusView', 'graph', 'verdictsFor'].every(n => typeof realCore[n] === 'function')
const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })

async function world({ seeded = true, core, hidden = false } = {}) {
  const w = testWorld('st-status-')
  worlds.push(w)
  const dir = join(w.root, 'lib')
  const seed = seeded ? await seedLibrary(dir) : null
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale, devLibrary: seeded ? dir : null })
  const connections = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale, devConnection: 'fake', connectorDeps: { env: { PATH: '', PATHEXT: '.EXE' } } })
  w.paths = []
  w.shell.openPath = async p => { w.paths.push(p); return w.openPathAnswer ?? '' }
  const make = (o = {}) => createStatusService({ library, connections, log: w.log, hidden, shell: w.shell, ...(core ? { core } : {}), ...o }).handlers
  return { w, dir, seed, connections, h: make(), make }
}

let shared
before(async () => { shared = await world() })

test('without a library every method is no_library', async () => {
  const { h } = await world({ seeded: false })
  for (const [name, args] of [['getStatus', []], ['openLogsFolder', []], ['getGraph', [null]], ['getVerdicts', ['https://x/1']]]) {
    await assert.rejects(async () => h[name](...args), err => err.code === 'no_library', name)
  }
})

test('getStatus: the core view plus the connections; getGraph: the filter and the clock reach the core', async () => {
  const seen = []
  const core = {
    ...realCore,
    statusView: (dir, o) => { seen.push(['statusView', dir, typeof o.now]); return { lastRound: null, sources: [], connections: 'overwritten' } },
    graph: (dir, o) => { seen.push(['graph', o]); return { nodes: [], edges: [], filters: {} } },
  }
  const { dir, connections, make } = shared
  const h = make({ core })
  connections.handlers.setActiveConnection('codex')
  const s = await h.getStatus()
  assert.deepEqual(seen[0], ['statusView', dir, 'function'])
  assert.equal(s.lastRound, null)
  assert.deepEqual(s.connections, await connections.handlers.getConnections(), 'the connections as getConnections gives them')
  assert.equal(s.connections.active, 'codex')
  h.getGraph({ days: 30, status: 'kept', topics: ['评测'], links: false })
  const { now, ...rest } = seen[1][1]
  assert.deepEqual([rest, typeof now], [{ days: 30, status: 'kept', topics: ['评测'], links: false }, 'function'])
  h.getGraph(null)
  assert.deepEqual(Object.keys(seen[2][1]), ['now'], 'null filter: the core defaults')
})

test('getStatus.nextRun (plan C8 「下次运行」): the schedule\'s next slot when it is on; null when it is off or there is none', async () => {
  const { make } = shared
  const at = '2026-11-05T13:30:00.000Z'
  assert.equal((await make({ schedule: () => ({ enabled: true, time: '08:30', nextRunAt: at }) }).getStatus()).nextRun, at)
  // reverse: off, or no schedule service at all, says nothing
  assert.equal((await make({ schedule: () => ({ enabled: false, time: '08:30', nextRunAt: at }) }).getStatus()).nextRun, null)
  assert.equal((await make().getStatus()).nextRun, null)
})

test('openLogsFolder: <library>/_pipeline/logs through openPath; its failure, or no folder, → open_failed; a test run only logs', async () => {
  const { w, dir, make } = shared
  const h = make()
  assert.equal(await h.openLogsFolder(), null)
  assert.deepEqual(w.paths, [join(dir, '_pipeline', 'logs')])
  w.openPathAnswer = 'Failed to open'
  await assert.rejects(async () => h.openLogsFolder(), err => err.code === 'open_failed')
  w.openPathAnswer = ''
  const quiet = make({ hidden: true })
  assert.equal(await quiet.openLogsFolder(), null)
  assert.equal(w.paths.length, 2, 'not opened again')
  assert.ok(w.lines.some(l => l === `not opened in a test run: ${join(dir, '_pipeline', 'logs')}`))
  // a library without the folder (nothing ever ran there)
  const fresh = testWorld('st-status-')
  worlds.push(fresh)
  const lib = join(fresh.root, 'lib')
  realCore.createLibrary(lib, { name: 'x' })
  removeTree(join(lib, '_pipeline', 'logs'))
  const h2 = make({ library: { require: () => lib } })
  await assert.rejects(async () => h2.openLogsFolder(), err => err.code === 'open_failed')
})

test('getVerdicts: only a url in the ledger reaches the core', async () => {
  const asked = []
  const core = { ...realCore, verdictsFor: (dir, url) => { asked.push(url); return [] } }
  const { seed, make } = shared
  const h = make({ core })
  assert.deepEqual(h.getVerdicts(seed.urls[0]), [])
  for (const bad of ['https://example.org/never-seen', 'C:\\Windows\\win.ini']) assert.throws(() => h.getVerdicts(bad), err => err.code === 'bad_arguments', bad)
  assert.deepEqual(asked, [seed.urls[0]])
})

test('the real core: statusView, graph, verdictsFor on the seeded library', { skip: W5 ? false : 'core W5 (pipeline/status.mjs, graph/) not landed yet' }, async () => {
  const { seed, make } = shared
  const h = make()
  const s = await h.getStatus()
  assert.equal(s.lastRound.id, seed.round.id)
  assert.deepEqual(s.sources.map(x => x.name), seed.sources)
  assert.equal(typeof s.monthUsage.calls, 'number')
  assert.ok(s.connections.kinds && 'active' in s.connections)
  const g = h.getGraph({ days: null, status: 'all', topics: [], links: true })
  assert.ok(g.nodes.some(n => n.id === `item:${seed.kept.id}`))
  assert.ok(g.nodes.some(n => n.kind === 'topic') && g.nodes.some(n => n.kind === 'source'))
  assert.equal(JSON.stringify(h.getGraph({ days: null, status: 'all', topics: [], links: true })), JSON.stringify(g), 'the same twice')
  const v = h.getVerdicts(seed.waiting.url)
  assert.ok(Array.isArray(v) && v.length > 0)
  assert.ok(v.every(group => typeof group.node === 'string' && Array.isArray(group.items)))
})
