// 1.1 W5 (B18, and the routing): a library with a library card is updated by it (services/library-update.mjs → core
// runUpdate), not by v1.0's scoring pipeline; only on Claude Code (W4's live runs, contract C7); the schedule's catch-up
// (services/schedule.mjs, unchanged) sees the update's run record: three slots missed while the app was shut → one update.
// The real library, pipeline and schedule services; the update agent and the readers are stand-ins (no network, no model).
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { createScheduleService } from '../src/main/services/schedule.mjs'
import { createLibraryUpdateService, UPDATE_KINDS } from '../src/main/services/library-update.mjs'
import { listRounds, writeCard } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const until = async (fn, ms = 10_000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await sleep(20) } }

const CARD = {
  name: '测试库',
  definition: { summary: '测试。', purpose: '测试', scope: '对象：测试；行业：测试；地域：本机；规模：小', exclude: '无', trust: '官方', rhythm: '每天一次', language: '中文', hard: '无' },
  decide: [], collect: ['新项目'], skip: ['旧闻'], sources: [{ name: '来源', url: 'http://127.0.0.1:9/list', status: 'ok' }], unreadable: [],
  pick: ['新的先收'], write: ['写清金额'], samples: [{ title: '样例', url: 'http://127.0.0.1:9/a', date: '2026-11-20' }],
}

function fakeClock(start) {
  let t = start.getTime()
  return { now: () => new Date(t), set: d => { t = d.getTime() }, timers: { set: () => ({}), clear: () => {} } }
}

async function setup({ kind = 'claude-code', card = true } = {}) {
  const w = testWorld('st-library-update-')
  worlds.push(w)
  const locale = () => w.locale
  const time = fakeClock(new Date(2026, 10, 4, 9, 0))
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  w.dialogAnswers.push(join(w.root, 'lib'))
  await library.handlers.chooseLibraryFolder()
  await library.handlers.useChosenFolder('lib')
  const dir = join(w.root, 'lib')
  if (card) writeCard(dir, CARD)
  const sessions = []
  const session = () => {
    const s = { calls: 0, async detect() { return { installed: true, loggedIn: true } }, async send() { s.calls++; return { ok: true, json: { items: [] }, text: '{"items":[]}', sessionId: 's1', reads: [], searches: [] } } }
    sessions.push(s)
    return s
  }
  const libraryUpdate = createLibraryUpdateService({
    readPages: () => ({ read: async url => ({ ok: false, url, reason: 'failed' }) }),
    readLinks: () => ({ read: async url => ({ ok: true, url, finalUrl: url, links: ['http://127.0.0.1:9/a'], method: 'direct' }) }),
    session, log: w.log, now: time.now,
  })
  const connections = { devConnection: null, active: () => ({ kind, connection: { kind }, connector: { complete: async () => ({ ok: false, code: 'unused' }) } }), activeKind: () => kind }
  let scheduler = null
  const done = []
  const pipeline = createPipelineService({ library, connections, emit: w.emit, log: w.log, shell: w.shell, locale, now: time.now, fetchContext: { timeoutMs: 2000, sleep: async () => {} }, schedule: () => scheduler?.view() ?? null, onRoundDone: d => { done.push(d); scheduler?.roundDone(d) }, update: () => libraryUpdate })
  scheduler = createScheduleService({ settingsFile: w.settingsFile, library, pipeline, emit: w.emit, log: w.log, now: time.now, timers: time.timers })
  scheduler.handlers.setSchedule({ enabled: true, time: '08:30' })
  return { w, dir, time, library, pipeline, scheduler, done, sessions, id: library.current().libraryId }
}

test('a library with a card: its round is an update (the update agent, a run record of kind update), not v1.0\'s pipeline', async () => {
  const s = await setup()
  const r = await s.pipeline.startRoundIn({ id: s.id, path: s.dir })
  assert.equal(r.started, true)
  assert.match(r.roundId, /^u-/)
  await until(() => s.done.length === 1)
  assert.equal(s.sessions.length, 1, 'the update agent\'s session was made')
  assert.equal(s.sessions[0].calls, 1, 'one run: the agent ran once (the library\'s first update)')
  const [round] = listRounds(s.dir, 5)
  assert.deepEqual([round.kind, round.status, round.id], ['update', 'done', r.roundId])
  const ends = s.w.eventsOf('round-progress').map(e => e.payload)
  assert.ok(ends.some(p => p.phase === 'update' && p.update === true))
  assert.ok(ends.some(p => p.phase === 'done' && p.done === true && p.result?.status === 'done'))
  assert.equal(ends.some(p => p.phase === 'self-check'), false, 'v1.0\'s self-check did not run')
})

test('only Claude Code updates in 1.1: Codex or an API key does not start, and says why', async () => {
  assert.deepEqual(UPDATE_KINDS, ['claude-code'])
  for (const kind of ['codex', 'api']) {
    const s = await setup({ kind })
    const r = await s.pipeline.startRoundIn({ id: s.id, path: s.dir })
    assert.deepEqual(r, { started: false, problems: [{ code: 'update-not-supported', connection: kind }] }, kind)
    assert.equal(s.sessions.length, 0)
    assert.deepEqual(listRounds(s.dir, 5), [])
  }
})

test('a library without a card keeps v1.0\'s round (until W7)', async () => {
  const s = await setup({ card: false })
  await s.pipeline.startRoundIn({ id: s.id, path: s.dir }).catch(() => null)
  assert.ok(s.w.eventsOf('round-progress').some(e => e.payload.phase === 'self-check'), 'v1.0\'s self-check')
  assert.equal(s.sessions.length, 0)
})

test('the catch-up: three slots missed while the app was shut -> one update, only one', async () => {
  const s = await setup()
  const first = await s.scheduler.start()
  assert.deepEqual(first.owed, [s.id], 'never ran: owed')
  await until(() => s.done.length === 1)
  // the app shut for three days: the slots of 11-05, 11-06 and 11-07 at 08:30 went by
  s.time.set(new Date(2026, 10, 7, 12, 0))
  const back = await s.scheduler.resumed()
  assert.deepEqual(back.owed, [s.id])
  await until(() => s.done.length === 2)
  assert.deepEqual((await s.scheduler.resumed()).owed, [], 'caught up once: nothing more owed')
  const rounds = listRounds(s.dir, 10)
  assert.equal(rounds.length, 2)
  assert.ok(rounds.every(r => r.kind === 'update'))
})
