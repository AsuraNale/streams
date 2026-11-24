// The timed round (src/main/services/schedule.mjs) and the tray (src/main/tray.mjs) in plain Node, with a fake clock and
// fake timers: getSchedule's view; setSchedule writes settings.json and refuses 25:00 (nothing written); the catch-up runs
// one round when the last one started before the last slot, none when it started after, none while one runs, and only
// one however many days were missed (the real pipeline service on a real library: the round it runs is the one
// rounds.jsonl then holds); the timer fires at the slot once, never early, never twice; after a round with n > 0 new
// cards one notification, none for 0; the pipeline's getHome().nextRun is the schedule's; the tray's hint and menu.
//
// v2 package A: these are v1.0's cases on one library, kept. What changed with the package (each marked `v2:` below):
// the schedule is the library's own, in its streams.json (setSchedule writes it there, not settings.json; settings.json's
// is only what a library without one gets the first time); the library is a real library service (here the development
// library, id `dev`) and the pipeline stand-in has startRoundIn and says when a round ended (roundDone), as the real one
// does; getSchedule's view carries `libraryId`; start / resumed / catchUp answer { owed, queued } (the libraries owing a
// round, those put in the queue) instead of one round's answer; the notification names the library. Several libraries,
// the queue, a library whose folder is gone: test/services-queue.test.mjs.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createScheduleService, MAX_WAIT_MS } from '../src/main/services/schedule.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { createNotifier } from '../src/main/services/notify.mjs'
import { createTray } from '../src/main/tray.mjs'
import { APP } from '../src/main/texts/app.js'
import { APP as APP_EN } from '../src/main/texts-en/app.js'
import { NOTIFY } from '../src/main/texts/notify.js'
import { createLibrary, listRounds, saveLibrarySchedule } from '../src/main/core.mjs'
import { checkArgs } from '../src/main/bridge-methods.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check, { timeoutMs = 20_000 } = {}) => {
  const t0 = Date.now()
  while (!check()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timed out waiting')
    await sleep(25)
  }
}
// local time, as the app's clock reads it
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0)

/** A clock the test moves, and timers that run only when the test says so. */
function fakeTime(start) {
  let t = start.getTime()
  const pending = new Map()
  let next = 1
  return {
    now: () => new Date(t),
    set: time => { t = time.getTime() },
    timers: { set: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id }, clear: id => { pending.delete(id) } },
    pending: () => [...pending.values()],
    /** Run the one waiting timer (there is at most one). */
    fire() { const [[id, p]] = [...pending.entries()]; pending.delete(id); p.fn() },
  }
}

/** A library folder with rounds.jsonl lines started at these times (newest last). */
function libraryWithRounds(w, starts) {
  const dir = join(w.root, 'lib')
  mkdirSync(dir, { recursive: true })
  createLibrary(dir, { name: 'lib' })
  mkdirSync(join(dir, '_pipeline'), { recursive: true })
  writeFileSync(join(dir, '_pipeline', 'rounds.jsonl'), starts.map((s, i) => `${JSON.stringify({ id: `r${i}`, startedAt: s.toISOString(), finishedAt: s.toISOString() })}\n`).join(''))
  return dir
}

/**
 * A pipeline stand-in: counts the rounds asked for; each one adds its line to rounds.jsonl as the core would.
 * v2: startRoundIn(library) instead of handlers.startRound(), and the end of each round told to the schedule (roundDone),
 * as the real pipeline's onRoundDone does — at once, or when the test says (`hold`).
 */
function fakePipeline(dir, now) {
  const p = { started: 0, running: false, runningLib: null, schedule: null, hold: false, held: [] }
  p.isRunning = () => p.running
  p.runningLibrary = () => p.runningLib
  p.startRoundIn = async entry => {
    p.started++
    if (dir) writeFileSync(join(entry.path, '_pipeline', 'rounds.jsonl'), `${JSON.stringify({ id: `s${p.started}`, startedAt: now().toISOString() })}\n`, { flag: 'a' })
    const done = { roundId: `d-${p.started}`, libraryId: entry.id, result: { started: true, counts: { inbox: 0 } } }
    if (p.hold) p.held.push(done)
    else queueMicrotask(() => p.schedule?.roundDone(done))
    return { started: true, roundId: done.roundId }
  }
  return p
}

function service({ w, dir, time, pipeline, notifier = null, schedule = { enabled: true, time: '08:30' } }) {
  writeFileSync(w.settingsFile, `${JSON.stringify({ schedule })}\n`)
  // v2: the real library service, `dir` as the development library (or no library at all)
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, devLibrary: dir })
  const s = createScheduleService({ settingsFile: w.settingsFile, library, pipeline, notifier, emit: w.emit, log: w.log, now: time.now, timers: time.timers })
  pipeline.schedule = s
  return s
}

test('getSchedule: the setting, the next slot, the last round, whether one is owed; off → no next slot, nothing owed', () => {
  const w = testWorld('st-schedule-'); worlds.push(w)
  const time = fakeTime(at(2026, 11, 4, 9, 0))
  const dir = libraryWithRounds(w, [at(2026, 11, 3, 9, 0)])
  const s = service({ w, dir, time, pipeline: fakePipeline(dir, time.now) })
  assert.deepEqual(s.handlers.getSchedule(), { libraryId: 'dev', enabled: true, time: '08:30', rhythm: null, nextRunAt: at(2026, 11, 5, 8, 30).toISOString(), lastRoundAt: at(2026, 11, 3, 9, 0).toISOString(), missed: true })
  time.set(at(2026, 11, 4, 7, 0))
  assert.deepEqual(s.handlers.getSchedule(), { libraryId: 'dev', enabled: true, time: '08:30', rhythm: null, nextRunAt: at(2026, 11, 4, 8, 30).toISOString(), lastRoundAt: at(2026, 11, 3, 9, 0).toISOString(), missed: false }, 'before today\'s slot: yesterday\'s round after its slot covers it')
  // v2: the library's own schedule (its streams.json), not settings.json's
  saveLibrarySchedule(dir, { enabled: false, time: '08:30' })
  assert.deepEqual(s.handlers.getSchedule(), { libraryId: 'dev', enabled: false, time: '08:30', rhythm: null, nextRunAt: null, lastRoundAt: at(2026, 11, 3, 9, 0).toISOString(), missed: false })
  // no library open: nothing owed, no last round
  const none = service({ w, dir: null, time, pipeline: fakePipeline(null, time.now) })
  assert.deepEqual(none.handlers.getSchedule(), { libraryId: null, enabled: true, time: '08:30', rhythm: null, nextRunAt: at(2026, 11, 4, 8, 30).toISOString(), lastRoundAt: null, missed: false })
})

test('setSchedule: writes the library\'s streams.json (v2; v1.0 wrote settings.json), says settings-changed, sets the timer again; 25:00 is refused and nothing is written', () => {
  const w = testWorld('st-schedule-'); worlds.push(w)
  const time = fakeTime(at(2026, 11, 4, 9, 0))
  const dir = libraryWithRounds(w, [at(2026, 11, 4, 9, 0)])
  const s = service({ w, dir, time, pipeline: fakePipeline(dir, time.now) })
  const settingsBefore = readFileSync(w.settingsFile, 'utf8')
  const r = s.handlers.setSchedule({ enabled: true, time: '21:15' })
  assert.equal(r.nextRunAt, at(2026, 11, 4, 21, 15).toISOString())
  // v2: written into the library's streams.json; settings.json is not written any more
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8')).schedule, { enabled: true, time: '21:15' })
  assert.equal(readFileSync(w.settingsFile, 'utf8'), settingsBefore, 'settings.json untouched')
  assert.equal(w.eventsOf('settings-changed').length, 1)
  assert.deepEqual(w.eventsOf('settings-changed')[0].payload, { libraryId: 'dev' })
  assert.equal(time.pending().length, 1, 'one timer')
  const before = readFileSync(join(dir, 'streams.json'), 'utf8')
  assert.throws(() => s.handlers.setSchedule({ enabled: true, time: '25:00' }), err => err.code === 'bad_arguments')
  assert.equal(readFileSync(join(dir, 'streams.json'), 'utf8'), before, 'nothing written')
  assert.equal(w.eventsOf('settings-changed').length, 1, 'no event for a refused value')
  const off = s.handlers.setSchedule({ enabled: false, time: '21:15' })
  assert.equal(off.nextRunAt, null)
  assert.equal(time.pending().length, 0, 'off: no timer')
  assert.equal(s.enabled(), false)
})

test('the catch-up: the last round before the last slot → one round; started after it → none; three days missed → still one', async () => {
  const w = testWorld('st-schedule-'); worlds.push(w)
  const time = fakeTime(at(2026, 11, 7, 10, 0))
  const dir = libraryWithRounds(w, [at(2026, 11, 4, 9, 0)])
  const p = fakePipeline(dir, time.now)
  const s = service({ w, dir, time, pipeline: p })
  // v2: { owed, queued } — the library owing one, put in the queue, its round started at once (the queue was empty)
  const r = await s.start()
  assert.deepEqual(r, { owed: ['dev'], queued: ['dev'] })
  assert.equal(p.started, 1, 'three days away: one round')
  await sleep(0)
  // the round it ran is in rounds.jsonl now: the next look (another start, a wake from sleep) owes nothing
  assert.deepEqual(await s.resumed(), { owed: [], queued: [] })
  assert.deepEqual(await s.catchUp('again'), { owed: [], queued: [] })
  assert.equal(p.started, 1, 'still one')
  // control: the next morning after its slot, one more is owed
  time.set(at(2026, 11, 8, 9, 0))
  await s.resumed()
  assert.equal(p.started, 2)
})

test('the catch-up: none when the last round started after today\'s slot, none while a round runs, none when off, none without a library', async () => {
  const w = testWorld('st-schedule-'); worlds.push(w)
  const time = fakeTime(at(2026, 11, 4, 12, 0))
  const dir = libraryWithRounds(w, [at(2026, 11, 4, 8, 45)])
  const p = fakePipeline(dir, time.now)
  const s = service({ w, dir, time, pipeline: p })
  assert.deepEqual((await s.start()).owed, [])
  assert.equal(p.started, 0)
  // a round before the slot: owed — but not while one of this library runs (v2: owed, not queued)
  writeFileSync(join(dir, '_pipeline', 'rounds.jsonl'), `${JSON.stringify({ id: 'old', startedAt: at(2026, 11, 4, 8, 0).toISOString() })}\n`)
  p.running = true
  p.runningLib = 'dev'
  assert.deepEqual(await s.catchUp('test'), { owed: ['dev'], queued: [] })
  p.running = false
  p.runningLib = null
  // v2: off in the library's own schedule
  saveLibrarySchedule(dir, { enabled: false, time: '08:30' })
  assert.deepEqual(await s.catchUp('test'), { owed: [], queued: [] })
  assert.equal(p.started, 0)
  const none = service({ w, dir: null, time, pipeline: p })
  assert.deepEqual(await none.catchUp('test'), { owed: [], queued: [] })
  // control: on again, the same file owes one
  saveLibrarySchedule(dir, { enabled: true, time: '08:30' })
  assert.deepEqual((await s.catchUp('test')).queued, ['dev'])
  assert.equal(p.started, 1)
})

test('the timer: waits at most MAX_WAIT_MS at a time, fires at the slot once, not before, not twice; then the next day', async () => {
  const w = testWorld('st-schedule-'); worlds.push(w)
  const time = fakeTime(at(2026, 11, 4, 8, 0))
  const dir = libraryWithRounds(w, [at(2026, 11, 3, 9, 0)])
  const p = fakePipeline(dir, time.now)
  const s = service({ w, dir, time, pipeline: p })
  assert.equal(s.arm().getTime(), at(2026, 11, 4, 8, 30).getTime())
  assert.equal(time.pending()[0].ms, MAX_WAIT_MS, '30 minutes away: a 10-minute tick')
  time.set(at(2026, 11, 4, 8, 10))
  time.fire()
  assert.equal(p.started, 0, 'a tick before the slot starts nothing')
  assert.equal(time.pending()[0].ms, MAX_WAIT_MS, 'still 20 minutes away: another 10-minute tick')
  time.set(at(2026, 11, 4, 8, 25))
  time.fire()
  assert.equal(time.pending()[0].ms, 5 * 60_000, '5 minutes away: a 5-minute wait')
  time.set(new Date(at(2026, 11, 4, 8, 30).getTime() - 5))
  time.fire()
  assert.equal(p.started, 0, '5 ms early: nothing')
  time.set(at(2026, 11, 4, 8, 30))
  time.fire()
  await sleep(0)
  assert.equal(p.started, 1, 'at the slot: one round')
  // the clock has not moved: the same slot is not fired again
  time.fire()
  await sleep(0)
  assert.equal(p.started, 1, 'not twice')
  assert.equal(s.view().nextRunAt, at(2026, 11, 5, 8, 30).toISOString())
  // a round running at the slot: none started on top of it (v2: a round of this library)
  p.running = true
  p.runningLib = 'dev'
  time.set(at(2026, 11, 5, 8, 30))
  time.fire()
  await sleep(0)
  assert.equal(p.started, 1, 'a round was running: no second one')
  assert.ok(w.lines.some(l => l.includes('a round of this library is running, no second one')))
})

test('after a round: n > 0 new cards → one notification 「本次运行新增 n 条待看」 (written to notifications.jsonl in a test run); 0 → none', () => {
  const w = testWorld('st-schedule-'); worlds.push(w)
  const time = fakeTime(at(2026, 11, 4, 9, 0))
  const logFile = join(w.root, 'logs', 'notifications.jsonl')
  const notifier = createNotifier({ Notification: null, windows: () => [], bringToFront: () => true, emit: w.emit, log: w.log, logFile, clock: time.now })
  // v2: a library, so the notification can name it
  const dir = libraryWithRounds(w, [])
  const s = service({ w, dir, time, pipeline: fakePipeline(dir, time.now), notifier })
  assert.equal(s.roundDone({ roundId: 'd-1', libraryId: 'dev', result: { started: true, counts: { inbox: 0 } } }), false)
  assert.equal(s.roundDone({ roundId: 'd-2', libraryId: 'dev', result: { started: false, problems: [] } }), false)
  assert.equal(s.roundDone({ roundId: 'd-3', libraryId: 'dev', result: null }), false)
  assert.equal(s.roundDone({ roundId: 'd-4', libraryId: 'dev', result: { started: true, counts: { inbox: 3 } } }), true)
  const lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.equal(lines.length, 1, 'one notification, for the round with 3')
  // v2: 「<库名>：…」; redesign R6b-2: the sentence is 05 第 173 行's (本次运行新增 n 条待看) — only the expected words changed
  assert.deepEqual([lines[0].kind, lines[0].screen, lines[0].body], ['newItems', 'inbox', NOTIFY.kinds.newItems.replace('{n}', '3').replace('{library}', 'lib')])
  assert.equal(lines[0].body, 'lib：本次运行新增 3 条待看。')
})

test('the pipeline service: getHome().nextRun is the schedule\'s; a run in the background reports its end', async () => {
  const w = testWorld('st-schedule-'); worlds.push(w)
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  const connections = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale, devConnection: 'fake', connectorDeps: { env: { PATH: '', PATHEXT: '.EXE' } } })
  const time = fakeTime(at(2026, 11, 4, 9, 0))
  let scheduler = null
  const done = []
  // v2: the end of a run goes to the schedule too (main.mjs wires onRoundDone the same way). 1.1 W7b: a run is the update of a
  // library with a card — a stand-in of services/library-update.mjs that writes its run record (kind 'update') on the app's clock
  const update = {
    applies: () => true,
    problemFor: () => null,
    async run(dir, _a, { round }) {
      const record = { id: round, kind: 'update', startedAt: time.now().toISOString(), finishedAt: time.now().toISOString(), status: 'done', counts: { inbox: 0 }, calls: 0 }
      writeFileSync(join(dir, '_pipeline', 'rounds.jsonl'), `${JSON.stringify(record)}\n`, { flag: 'a' })
      return { started: true, status: 'done', record }
    },
  }
  const pipeline = createPipelineService({ library, connections, emit: w.emit, log: w.log, shell: w.shell, now: time.now, schedule: () => scheduler?.view() ?? null, onRoundDone: d => { done.push(d); scheduler?.roundDone(d) }, update: () => update })
  w.dialogAnswers.push(join(w.root, 'lib'))
  await library.handlers.chooseLibraryFolder()
  await library.handlers.useChosenFolder('lib')
  scheduler = createScheduleService({ settingsFile: w.settingsFile, library, pipeline, emit: w.emit, log: w.log, now: time.now, timers: time.timers })
  assert.equal(pipeline.handlers.getHome().nextRun, at(2026, 11, 5, 8, 30).toISOString())
  assert.equal(pipeline.handlers.getPipelineSettings, undefined, '1.1 W7b: v1.0\'s pipeline settings are gone')
  scheduler.handlers.setSchedule({ enabled: false, time: '08:30' })
  assert.equal(pipeline.handlers.getHome().nextRun, null, 'off: none')
  scheduler.handlers.setSchedule({ enabled: true, time: '08:30' })
  // the real catch-up on a library that never ran: one run, its start in rounds.jsonl at the app's clock, then none owed
  const id = library.current().libraryId
  const r = await scheduler.start()
  assert.deepEqual(r, { owed: [id], queued: [id] })
  await until(() => done.length === 1)
  assert.equal(done[0].libraryId, id)
  assert.equal(done[0].result.started, true)
  const rounds = listRounds(join(w.root, 'lib'), 5)
  assert.equal(rounds.length, 1)
  assert.equal(rounds[0].startedAt, at(2026, 11, 4, 9, 0).toISOString(), 'the round ran on the app\'s clock')
  assert.deepEqual((await scheduler.resumed()).owed, [])
  assert.equal(listRounds(join(w.root, 'lib'), 5).length, 1, 'only one')
})

test('the tray: no icon in a test run (the log says what it would show); with Electron\'s Tray its hint follows the count, its menu opens, runs, quits', () => {
  const lines = []
  const calls = []
  const hidden = createTray({ Tray: null, Menu: null, icon: 'x.ico', hidden: true, log: l => lines.push(l), onOpen: () => {}, onRunNow: () => {}, onQuit: () => {} })
  hidden.setCount(3)
  assert.ok(lines.some(l => l.startsWith('tray: ') && l.includes(APP.tray.tooltip.replace('{n}', '3'))), lines.join('\n'))
  const made = []
  class FakeTray {
    constructor(icon) { this.icon = icon; this.handlers = {}; made.push(this) }
    on(ev, fn) { this.handlers[ev] = fn }
    setToolTip(t) { this.tip = t }
    setContextMenu(m) { this.menu = m }
    destroy() { this.destroyed = true }
  }
  const Menu = { buildFromTemplate: items => items }
  let lang = 'zh-CN'
  const tray = createTray({ Tray: FakeTray, Menu, icon: 'C:\\icon.ico', locale: () => lang, onOpen: () => calls.push('open'), onRunNow: () => calls.push('run'), onQuit: () => calls.push('quit') })
  assert.equal(made.length, 1)
  assert.equal(made[0].icon, 'C:\\icon.ico')
  assert.equal(made[0].tip, '流息 · 0 条待看')
  tray.setCount(12)
  assert.equal(made[0].tip, '流息 · 12 条待看')
  assert.deepEqual(made[0].menu.filter(i => i.label).map(i => i.label), [APP.tray.open, APP.tray.runNow, APP.tray.quit])
  for (const i of made[0].menu.filter(m => m.click)) i.click()
  made[0].handlers.click()
  assert.deepEqual(calls, ['open', 'run', 'quit', 'open'])
  lang = 'en'
  tray.refresh()
  assert.equal(made[0].tip, APP_EN.tray.tooltip.replace('{n}', '12'))
  assert.deepEqual(made[0].menu.filter(i => i.label).map(i => i.label), [APP_EN.tray.open, APP_EN.tray.runNow, APP_EN.tray.quit])
  tray.destroy()
  assert.equal(made[0].destroyed, true)
})

test('the bridge: setSchedule takes { enabled: boolean, time: HH:MM } (00:00–23:59) and nothing else; getSchedule takes nothing', () => {
  for (const good of [{ enabled: true, time: '08:30' }, { enabled: false, time: '00:00' }, { enabled: true, time: '23:59' }]) checkArgs('setSchedule', [good])
  for (const bad of [{ enabled: true, time: '25:00' }, { enabled: true, time: '24:00' }, { enabled: true, time: '8:30' }, { enabled: 'yes', time: '08:30' }, { time: '08:30' }, { enabled: true, time: '08:30', every: 2 }, null, 'daily']) {
    assert.throws(() => checkArgs('setSchedule', [bad]), err => err.code === 'bad_arguments', JSON.stringify(bad))
  }
  assert.throws(() => checkArgs('setSchedule', []), err => err.code === 'bad_arguments')
  checkArgs('getSchedule', [])
  assert.throws(() => checkArgs('getSchedule', [1]), err => err.code === 'bad_arguments')
})
