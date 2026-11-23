// Redesign R5a (docs/checks/2026-11-12-r5a/contract.md 「测」; docs/desktop.md §4.19), O9 — what of an error reaches the page — in
// plain Node on real libraries the library service registered and the real run, schedule and sources services:
//   R5a-6  a source's row on 来源与要求, a run's problems (getHome's last run, round-progress, getRoundState, startRound's answer
//          through the queue) and 测试连接: a state, a hint or a code — never the fetcher's message, an HTTP code or a problem's
//          detail; those go to the diagnostics (raw-errors.mjs), which never hold an API key
// 1.1 W7b: R5a-1 / R5a-2 (系统检测, listToConfirm, actOnSuggestion, 交由主 Agent 分析), R5a-4 (重新评分) and the words the core
// gave v2's main agent went with v1.0's scoring pipeline and the main agent: their tests with them. A run is the update of a
// library with a card here (a stand-in of services/library-update.mjs); the libraries are made as v1.0 made them (core/legacy
// createLibraryV1) with two sources each, so their rows are v1.0's. Nothing here touches the real app data.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { createScheduleService } from '../src/main/services/schedule.mjs'
import { createSourcesService } from '../src/main/services/sources.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { createRawErrors } from '../src/main/raw-errors.mjs'
import { diagnosticsText } from '../src/main/diagnostics.mjs'
import { publicProblems } from '../src/main/public-data.mjs'
import { addSource, addTopic, appendFetchLog } from '../src/main/core.mjs'
import { createLibraryV1 } from '../../core/legacy/index.mjs'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { CONNECTIONS as CONNECTIONS_EN } from '../src/renderer/texts-en/common.js'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(async () => {
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
const T0 = Date.parse('2026-11-12T08:00:00.000Z')
const at = h => new Date(T0 + h * 3_600_000).toISOString()
const CLOCK = new Date(T0 + 20 * 3_600_000)
const now = () => CLOCK

// redesign R6b (PM): an HTTP code counts only as a number of its own. The temporary folders are named
// <prefix><process id>-<8 random hex> and the fake server's port is random, so a plain includes('503') went red now and then
// on a path or a port that merely contained the digits (seen 11-15: 1 run in the full suite). The control below keeps it able to fail.
const hasCode = (text, code) => new RegExp(`(^|[^0-9A-Za-z])${code}($|[^0-9A-Za-z])`).test(text)
assert.ok(hasCode('HTTP 503: upstream busy', '503') && hasCode('{"http":404}', '404') && hasCode('503', '503'), 'control: a code on its own is found')
assert.ok(!hasCode('st-r5a-50312-a503f00d', '503') && !hasCode('127.0.0.1:64043/feed', '404'), 'control: digits inside a name or a port are not a code')

/**
 * Two registered libraries (a, then b — b is the current one), each with a topic and two sources, made as v1.0 made them; the
 * library, run, schedule and sources services wired as main.mjs wires them. `update`: the stand-in update service (every
 * library has a card) or none (every library is one of the last version).
 */
async function setup({ update = null } = {}) {
  const w = testWorld('st-r5a-')
  worlds.push(w)
  const raw = createRawErrors({ log: w.log, now })
  let pipeline = null
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now, held: () => pipeline?.held() ?? null })
  const dirs = {}
  for (const name of ['a', 'b']) {
    const dir = join(w.root, name)
    dirs[name] = dir
    createLibraryV1(dir, { name })
    addTopic(dir, { name: 'agent 框架', keywords: ['agent framework'] })
    addSource(dir, { name: 'feed-a', kind: 'rss', url: `https://example.test/${name}/a.xml`, topic: 'agent 框架' })
    addSource(dir, { name: 'feed-b', kind: 'rss', url: `https://example.test/${name}/b.xml`, topic: 'agent 框架' })
    w.dialogAnswers.push(dir)
    await library.handlers.chooseLibraryFolder()
    await library.handlers.useChosenFolder(name)
  }
  const [ia, ib] = library.entries().map(l => l.id)
  const connections = { devConnection: null, active: () => ({ kind: 'claude-code', model: 'm', verifyModel: 'm', connector: {} }) }
  let scheduler = null
  pipeline = createPipelineService({
    library, connections, emit: w.emit, log: w.log, shell: w.shell, now,
    onRoundDone: done => scheduler?.roundDone(done), rawErrors: raw, roundGate: () => scheduler.startCurrent('the page'), update: () => update,
  })
  scheduler = createScheduleService({ settingsFile: w.settingsFile, library, pipeline, emit: w.emit, log: w.log, now })
  const sources = createSourcesService({ library, emit: w.emit, log: w.log, now, rawErrors: raw, pendingDir: join(w.root, 'pending') })
  return { w, raw, library, pipeline, scheduler, sources, ids: { a: ia, b: ib }, dirs }
}

// ---- R5a-6 ------------------------------------------------------------------------------------------------------------

test('R5a-6 a run\'s problems: no raw text, no HTTP code to the page; the diagnostics have them, never a key', async () => {
  const s = await setup()
  // a run's problems: the code, not the detail
  assert.deepEqual(publicProblems([{ code: 'connection', connectionCode: 'network', detail: 'getaddrinfo ENOTFOUND api.example.com', node: 'relevance', url: 'u' }], { raw: s.raw }), [{ code: 'connection', connectionCode: 'network', node: 'relevance' }])
  // the diagnostics: the raw texts, never the key
  const text = diagnosticsText({ versions: { app: '1', electron: '1', chrome: '1', node: '1', os: 'x' }, layout: { logsDir: join(s.w.root, 'nologs'), appData: 'a', localData: 'l' }, settings: {}, secrets: ['sk-test-0123456789abcdef'], rawErrors: [...s.raw.lines(), 'leaked sk-test-0123456789abcdef'] })
  assert.ok(text.includes('getaddrinfo ENOTFOUND'), 'the raw text is in the diagnostics')
  assert.ok(!text.includes('sk-test-0123456789abcdef'), 'no API key')
})

test('R5a-6 the sources\' rows (来源与要求) and the last run (getHome): a state and a hint, no message, no HTTP code, no problem detail', async () => {
  const s = await setup()
  const { raw, dirs, sources, pipeline } = s
  appendFetchLog(dirs.b, { ts: at(1), round: 'r1', source: 'feed-a', kind: 'rss', status: 'gap', http: 404, message: 'HTTP 404: check the address', count: 0, new: 0 })
  appendFetchLog(dirs.b, { ts: at(1), round: 'r1', source: 'feed-b', kind: 'rss', status: 'failed', http: 503, message: 'HTTP 503: upstream busy', count: 0, new: 0 })
  writeFileSync(join(dirs.b, '_pipeline', 'rounds.jsonl'), JSON.stringify({ id: 'r1', startedAt: at(1), finishedAt: at(1), counts: { inbox: 0 }, stoppedAt: 'connection', problems: [{ code: 'connection', connectionCode: 'network', detail: 'getaddrinfo ENOTFOUND api.example.com', node: 'relevance', url: 'u' }], warnings: [] }) + '\n')
  const rows = sources.handlers.getSources().sources
  assert.deepEqual(rows.map(r => [r.name, r.status, r.hint]), [['feed-a', 'gap', 'fix-address-or-remove'], ['feed-b', 'failed', 'retry-next-round']], 'control: the states are there')
  assert.ok(rows.every(r => !Object.hasOwn(r, 'http') && !Object.hasOwn(r, 'message')), JSON.stringify(rows))
  const home = pipeline.handlers.getHome()
  const shown = JSON.stringify([rows, home])
  for (const code of ['404', '503']) assert.ok(!hasCode(shown, code), code)
  for (const bit of ['check the address', 'upstream busy', 'ENOTFOUND']) assert.ok(!shown.includes(bit), bit)
  assert.deepEqual(home.lastRound.problems, [{ code: 'connection', connectionCode: 'network', node: 'relevance' }])
  for (const bit of ['HTTP 404: check the address', 'HTTP 503: upstream busy', 'getaddrinfo ENOTFOUND']) assert.ok(raw.lines().some(l => l.includes(bit)), bit)
})

// precheck fix 1 (1.1 W7b: a run is an update): a run that fails — startRound's own answer (through the queue, schedule.mjs
// startCurrent), the run's events and getRoundState carry the problems' codes, never the detail; the detail is in the diagnostics
test('R5a-6 a run that fails: startRound\'s answer (through the queue), its events and getRoundState give codes, no detail; the diagnostics have it', async () => {
  const RAW = 'getaddrinfo ENOTFOUND api.example.com'
  const failing = {
    applies: () => true,
    problemFor: () => null,
    async run() { throw new Error(RAW) },
  }
  const s = await setup({ update: failing })
  const { w, raw, pipeline, scheduler, ids, dirs } = s
  const r = await scheduler.startCurrent('test')
  assert.equal(r.started, true, JSON.stringify(r))
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === r.roundId && e.payload.done === true))
  const done = w.eventsOf('round-progress').filter(e => e.payload.roundId === r.roundId).at(-1).payload
  assert.deepEqual(done.problems, [{ code: 'internal' }], 'control: the problem is there, by its code')
  // a library of the last version through the schedule's way in: its answer is a code too
  const old = await setup()
  const answer = await old.pipeline.startRoundIn({ id: old.ids.a, path: old.dirs.a })
  assert.deepEqual(answer, { started: false, problems: [{ code: 'needs-build' }] })
  const shown = JSON.stringify([r, w.eventsOf('round-progress').map(e => e.payload), pipeline.handlers.getRoundState(), pipeline.handlers.getHome()])
  for (const bit of ['ENOTFOUND', 'api.example.com']) assert.ok(!shown.includes(bit), `${bit} in ${shown}`)
  assert.ok(raw.lines().some(l => l.includes(RAW)), 'the diagnostics have the detail')
  assert.ok(ids.a && dirs.a, 'control: two libraries')
})

// precheck fix 11: 测试连接 (probeConnection, getConnections().probes) — the code, not the connection's own text
test('R5a-6 测试连接: a failed probe gives the page its code (the page words it), not the connection\'s text; the diagnostics have it', async () => {
  const w = testWorld('st-r5a-probe-')
  worlds.push(w)
  const raw = createRawErrors({ log: w.log, now })
  const c = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale: () => w.locale, devConnection: 'login-expired', rawErrors: raw })
  const p = await c.handlers.probeConnection('claude-code')
  assert.deepEqual([p.ok, p.code], [false, 'login-expired'], 'control: the probe failed')
  assert.equal(Object.hasOwn(p, 'detail'), false, JSON.stringify(p))
  const stored = (await c.handlers.getConnections()).probes['claude-code']
  assert.equal(stored.code, 'login-expired')
  assert.equal(Object.hasOwn(stored, 'detail'), false, JSON.stringify(stored))
  assert.ok(!JSON.stringify([p, stored]).includes('session expired'))
  assert.ok(Object.hasOwn(CONNECTIONS.codes, p.code) && Object.hasOwn(CONNECTIONS_EN.codes, p.code), 'the page has words for the code')
  assert.ok(raw.lines().some(l => l.includes('probe claude-code') && l.includes('fake: session expired')), raw.lines().join('\n'))
})
