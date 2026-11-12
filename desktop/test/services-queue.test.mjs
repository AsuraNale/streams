// The timed rounds of several libraries and the one queue (v2 package A; src/main/services/schedule.mjs; docs/desktop.md
// §4.3–4.4) in plain Node, with a fake clock and fake timers, on real libraries the library service registered and a
// pipeline stand-in that holds each round until the test ends it: three libraries at three times run one after the other,
// never two at once; two at the same time are queued, in order; a library in the queue or running is not queued again; the
// catch-up owes at most one round per library however long the app was closed, oldest slot first; a library whose folder
// is gone is skipped and said, the others still run; a library without its own schedule gets settings.json's written into
// its streams.json (the other keys deep-equal); the close button goes to the tray when any library's schedule is on; the
// page's 「开始」 starts at once when the queue is idle and — v2 package L (维护者 11-10, feedback #1) — puts the library at the end
// of the queue when it is busy (it was refused with bad_arguments until then), never twice, the tray the same; the maintainer's own
// morning (「流息Test」 catching up, 「安省中小企业补助」 waiting, 开始 pressed in 安省) answers 「排在第 2 位」; getQueue and
// queue-changed say the round that runs, the queue and the next slots; the notification names the library. Each rule first
// gets the input that would break it.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createScheduleService } from '../src/main/services/schedule.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { createNotifier } from '../src/main/services/notify.mjs'
import { createLibrary, saveLibrarySchedule } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0)

function fakeTime(start) {
  let t = start.getTime()
  const pending = new Map()
  let next = 1
  return {
    now: () => new Date(t),
    set: time => { t = time.getTime() },
    timers: { set: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id }, clear: id => { pending.delete(id) } },
    pending: () => [...pending.values()],
    fire() { const [[id, p]] = [...pending.entries()]; pending.delete(id); p.fn() },
  }
}

/**
 * A pipeline stand-in that runs one round per startRoundIn and keeps it running until finish(): it counts how many run at
 * once (the one-at-a-time rule is the schedule's to keep, not this stand-in's), writes each round's start into the
 * library's rounds.jsonl as the core would, and tells the schedule when a round ended (as the real onRoundDone does).
 */
function holdingPipeline(now) {
  const p = { order: [], active: [], maxActive: 0, schedule: null }
  p.isRunning = () => p.active.length > 0
  p.runningLibrary = () => p.active[0]?.libraryId ?? null
  // v2 package L: what getQueue reads of the round that runs (the real pipeline: its last round-progress)
  p.current = () => (p.active[0] ? { roundId: p.active[0].roundId, libraryId: p.active[0].libraryId, phase: 'gate:relevance', calls: 7, cap: 50, startedAt: now().toISOString() } : null)
  p.startRoundIn = async entry => {
    p.order.push(entry.id)
    const roundId = `d-${p.order.length}`
    writeFileSync(join(entry.path, '_pipeline', 'rounds.jsonl'), `${JSON.stringify({ id: roundId, startedAt: now().toISOString() })}\n`, { flag: 'a' })
    p.active.push({ roundId, libraryId: entry.id })
    p.maxActive = Math.max(p.maxActive, p.active.length)
    return { started: true, roundId }
  }
  /** The oldest running round ends, with `inbox` new cards. */
  p.finish = async (inbox = 0) => {
    const r = p.active.shift()
    p.schedule.roundDone({ roundId: r.roundId, libraryId: r.libraryId, result: { started: true, counts: { inbox } } })
    await sleep(0)
    return r
  }
  return p
}

/**
 * A world with libraries registered through the library service (each made by the core, then opened), their schedules as
 * given (null = none written: the migration's case), rounds.jsonl as given; and the schedule service on them.
 */
async function setup(specs, { start = at(2026, 11, 4, 7, 0), settingsSchedule = { enabled: true, time: '08:30' }, notifier = null } = {}) {
  const w = testWorld('st-queue-')
  worlds.push(w)
  writeFileSync(w.settingsFile, `${JSON.stringify({ schedule: settingsSchedule })}\n`)
  const time = fakeTime(start)
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now: time.now })
  const ids = {}
  for (const [name, spec] of Object.entries(specs)) {
    const dir = join(w.root, name)
    createLibrary(dir, { name })
    if (spec.schedule) saveLibrarySchedule(dir, spec.schedule)
    writeFileSync(join(dir, '_pipeline', 'rounds.jsonl'), (spec.rounds ?? []).map((s, i) => `${JSON.stringify({ id: `old${i}`, startedAt: s.toISOString() })}\n`).join(''))
    w.dialogAnswers.push(dir)
    await library.handlers.chooseLibraryFolder()
    ids[name] = (await library.handlers.useChosenFolder('')).libraryId
  }
  const pipeline = holdingPipeline(time.now)
  const schedule = createScheduleService({ settingsFile: w.settingsFile, library, pipeline, notifier, emit: w.emit, log: w.log, now: time.now, timers: time.timers })
  pipeline.schedule = schedule
  return { w, time, library, pipeline, schedule, ids, dir: name => join(w.root, name) }
}

const ON = time => ({ enabled: true, time })
const OFF = time => ({ enabled: false, time })

test('three libraries at three times: each slot starts its own library; one round at a time — the second waits for the first to end', async () => {
  const { time, pipeline: p, schedule: s, ids } = await setup({ a: { schedule: ON('08:00') }, b: { schedule: ON('08:05') }, c: { schedule: ON('08:10') } }, { start: at(2026, 11, 4, 7, 59) })
  assert.equal(s.arm().getTime(), at(2026, 11, 4, 8, 0).getTime(), 'the timer waits for the soonest slot of the three')
  time.set(at(2026, 11, 4, 8, 0))
  time.fire()
  await sleep(0)
  assert.deepEqual(p.order, [ids.a], 'a at its slot, alone')
  // b's slot comes while a still runs: b waits, it does not start on top of a
  time.set(at(2026, 11, 4, 8, 5))
  time.fire()
  await sleep(0)
  assert.deepEqual(p.order, [ids.a], 'b waits')
  assert.deepEqual(s.queue(), { running: ids.a, waiting: [ids.b] })
  time.set(at(2026, 11, 4, 8, 10))
  time.fire()
  await sleep(0)
  assert.deepEqual(s.queue().waiting, [ids.b, ids.c], 'in the order their slots came')
  await p.finish()
  assert.deepEqual(p.order, [ids.a, ids.b], 'a ended: b starts')
  await p.finish()
  assert.deepEqual(p.order, [ids.a, ids.b, ids.c])
  await p.finish()
  assert.equal(p.maxActive, 1, 'never two rounds at once')
  assert.deepEqual(s.queue(), { running: null, waiting: [] })
  // each slot once: the same clock again starts nothing
  time.fire()
  await sleep(0)
  assert.equal(p.order.length, 3)
  assert.equal(s.view().nextRunAt !== null, true)
})

test('two libraries at the same time: both queued, one after the other; a library queued or running is not queued again', async () => {
  const { time, pipeline: p, schedule: s, ids, library } = await setup({ a: { schedule: ON('09:00') }, b: { schedule: ON('09:00') } }, { start: at(2026, 11, 4, 8, 55) })
  s.arm()
  time.set(at(2026, 11, 4, 9, 0))
  time.fire()
  await sleep(0)
  assert.equal(p.order.length, 1, 'one started')
  assert.equal(s.queue().waiting.length, 1, 'the other waits')
  const [first] = p.order
  const second = first === ids.a ? ids.b : ids.a
  // the catch-up at the same moment would owe both: neither is queued a second time
  const r = s.catchUp('test')
  assert.deepEqual(r.queued, [], JSON.stringify(r))
  assert.ok(r.owed.includes(second), 'owed, but in the queue already')
  assert.deepEqual(s.queue(), { running: first, waiting: [second] })
  await p.finish()
  assert.deepEqual(p.order, [first, second])
  await p.finish()
  assert.equal(p.maxActive, 1)
  assert.ok(library.entries().length === 2)
})

test('the catch-up: each library on its own, at most one round each however long it was closed, oldest slot first; one that does not owe none', async () => {
  const { time, pipeline: p, schedule: s, ids } = await setup({
    late: { schedule: ON('09:00'), rounds: [at(2026, 11, 1, 9, 30)] }, // three days without a round
    never: { schedule: ON('08:00') }, // never ran
    fine: { schedule: ON('06:00'), rounds: [at(2026, 11, 4, 6, 30)] }, // ran after today's slot
    off: { schedule: OFF('05:00'), rounds: [at(2026, 10, 1, 5, 0)] }, // off: owes nothing
  }, { start: at(2026, 11, 4, 10, 0) })
  const r = s.start()
  assert.deepEqual(r.owed, [ids.never, ids.late], 'oldest slot first: 08:00 before 09:00')
  assert.deepEqual(p.order, [ids.never], 'one at a time')
  await p.finish()
  assert.deepEqual(p.order, [ids.never, ids.late])
  await p.finish()
  // three days away gave one round, not three; a second look owes nothing
  assert.deepEqual(s.resumed(), { owed: [], queued: [] })
  assert.equal(p.order.length, 2)
  // control: the next day at 08:30, those whose slot passed owe one again (06:00 before 08:00; 09:00 not yet)
  time.set(at(2026, 11, 5, 8, 30))
  assert.deepEqual(s.resumed().owed, [ids.fine, ids.never])
})

test('a library whose folder is gone: skipped and said once; the other libraries still have their timer and catch-up', async () => {
  const { time, pipeline: p, schedule: s, ids, dir, w } = await setup({ gone: { schedule: ON('08:00') }, kept: { schedule: ON('08:30') } }, { start: at(2026, 11, 4, 7, 0) })
  rmSync(dir('gone'), { recursive: true, force: true })
  assert.equal(s.arm().getTime(), at(2026, 11, 4, 8, 30).getTime(), 'the timer is the remaining library\'s')
  const said = w.lines.filter(l => l.includes(`schedule: ${ids.gone} skipped`))
  assert.equal(said.length, 1, w.lines.join('\n'))
  s.arm()
  assert.equal(w.lines.filter(l => l.includes(`schedule: ${ids.gone} skipped`)).length, 1, 'said once, not at every look')
  time.set(at(2026, 11, 4, 8, 30))
  time.fire()
  await sleep(0)
  assert.deepEqual(p.order, [ids.kept])
  await p.finish()
  // the catch-up the next day: the gone one is not there to owe anything
  time.set(at(2026, 11, 5, 9, 0))
  assert.deepEqual(s.resumed().owed, [ids.kept])
  assert.equal(s.handlers.getLibrarySchedule(ids.kept).enabled, true)
  assert.throws(() => s.handlers.getLibrarySchedule(ids.gone), err => err.code === 'open_failed')
})

test('the migration: a library without its own schedule gets settings.json\'s written into its streams.json, the other keys deep-equal; one with its own keeps it', async () => {
  const { schedule: s, ids, dir } = await setup({ old: { schedule: null }, own: { schedule: ON('07:15') } }, { settingsSchedule: { enabled: false, time: '06:40' } })
  const before = JSON.parse(readFileSync(join(dir('old'), 'streams.json'), 'utf8'))
  const ownBefore = readFileSync(join(dir('own'), 'streams.json'), 'utf8')
  assert.equal(Object.hasOwn(before, 'schedule'), false, 'control: no schedule in it yet')
  s.arm()
  const after = JSON.parse(readFileSync(join(dir('old'), 'streams.json'), 'utf8'))
  assert.deepEqual(after, { ...before, schedule: { enabled: false, time: '06:40' } })
  assert.equal(readFileSync(join(dir('own'), 'streams.json'), 'utf8'), ownBefore, 'its own: nothing written')
  assert.deepEqual([s.handlers.getLibrarySchedule(ids.old).enabled, s.handlers.getLibrarySchedule(ids.old).time], [false, '06:40'])
  assert.equal(s.handlers.getLibrarySchedule(ids.own).time, '07:15')
  // read again: the same bytes (written once)
  const text = readFileSync(join(dir('old'), 'streams.json'), 'utf8')
  s.arm()
  assert.equal(readFileSync(join(dir('old'), 'streams.json'), 'utf8'), text)
})

test('the close button into the tray: when any library\'s schedule is on; all off → no; the only one on in a folder that is gone → no', async () => {
  const { schedule: s, ids, dir } = await setup({ a: { schedule: OFF('08:00') }, b: { schedule: OFF('09:00') } })
  assert.equal(s.enabled(), false, 'all off')
  s.handlers.setLibrarySchedule(ids.b, ON('09:00'))
  assert.equal(s.enabled(), true, 'one on')
  rmSync(dir('b'), { recursive: true, force: true })
  assert.equal(s.enabled(), false, 'the one on is gone')
})

// v2 package L: this test replaces package A's 「busy → refused (the page gets bad_arguments), never queued」 — the rule changed
// (维护者 11-10, feedback #1 「没能开始」): busy, the page's and the tray's 开始 put the current library at the END of the queue.
test('「开始」 goes through the queue: idle → the current library at once; busy → queued at the end (not refused), never twice; the tray answers the same; a slot during it waits behind', async () => {
  const { time, pipeline: p, schedule: s, ids, library, w } = await setup({ a: { schedule: ON('08:00') }, b: { schedule: ON('08:05') } }, { start: at(2026, 11, 4, 7, 59) })
  assert.equal(library.current().libraryId, ids.b, 'b, opened last, is the current one')
  const r = await s.startCurrent('the page')
  assert.deepEqual([r.started, p.order], [true, [ids.b]])
  // b runs: its own 开始 again is 「runs already」, from the page and from the tray alike; nothing is queued
  assert.deepEqual(await s.startOne('the tray menu'), { started: false, already: 'running' })
  const page = createPipelineService({ library, connections: { active: () => null }, emit: w.emit, log: w.log, shell: w.shell, locale: () => w.locale, roundGate: () => s.startCurrent('the page') })
  assert.deepEqual(await page.handlers.startRound(), { started: false, already: 'running' }, 'the page through the real pipeline gate: no bad_arguments')
  assert.deepEqual(s.queue(), { running: ids.b, waiting: [] })
  // a is the current library now: busy (b runs) → a goes to the end of the queue, place 2
  library.handlers.setActiveLibrary(ids.a)
  const q = await page.handlers.startRound()
  assert.deepEqual(q, { started: false, queued: true, position: 2, runningLibraryId: ids.b })
  assert.deepEqual(s.queue(), { running: ids.b, waiting: [ids.a] })
  // pressed again (page or tray): the same place, not queued twice
  assert.deepEqual(await page.handlers.startRound(), { started: false, already: 'queued', position: 2 })
  assert.deepEqual(await s.startOne('the tray menu'), { started: false, already: 'queued', position: 2 })
  assert.deepEqual(s.queue().waiting, [ids.a])
  // a's slot comes while it waits: not queued a second time
  s.arm()
  time.set(at(2026, 11, 4, 8, 0))
  time.fire()
  await sleep(0)
  assert.deepEqual(s.queue(), { running: ids.b, waiting: [ids.a] })
  assert.equal(p.maxActive, 1)
  await p.finish()
  assert.deepEqual(p.order, [ids.b, ids.a], 'b ended: a, which waited, starts by itself')
  await p.finish()
  assert.equal(p.maxActive, 1, 'never two rounds at once')
  // control: idle again, the page's 开始 starts at once
  const again = await page.handlers.startRound()
  assert.equal(again.started, true)
  assert.deepEqual(p.order, [ids.b, ids.a, ids.a])
})

// v2 package L: The maintainer's morning of 11-10 (docs/feedback/2026-11-10-maintainer-v2-trial.md #1): the app closed overnight, both libraries'
// 08:30 slots missed; at 09:53 the catch-up runs 「流息Test」 and queues 「安省中小企业补助」; in 安省 he presses 开始. Before package L
// this was bad_arguments (the page said 「没能开始。」 six times); now: 「already waiting, place 2」, and 安省 runs right after.
test('维护者\'s scenario: 流息Test catching up, 安省中小企业补助 waiting behind it, 开始 in 安省 → 「already waiting, place 2」; a third library pressed → place 3', async () => {
  const { pipeline: p, schedule: s, ids, library, w } = await setup({ 流息Test: { schedule: ON('08:30') }, 安省中小企业补助: { schedule: ON('08:30') }, Rust: { schedule: OFF('21:00') } }, { start: at(2026, 11, 10, 9, 53) })
  const liu = ids['流息Test']
  const an = ids['安省中小企业补助']
  const r = s.start()
  await sleep(0)
  assert.deepEqual(r.queued, [liu, an], 'the catch-up queues both, 流息Test first')
  assert.deepEqual(s.queue(), { running: liu, waiting: [an] })
  library.handlers.setActiveLibrary(an)
  const page = createPipelineService({ library, connections: { active: () => null }, emit: w.emit, log: w.log, shell: w.shell, locale: () => w.locale, roundGate: () => s.startCurrent('the page') })
  const answer = await page.handlers.startRound()
  assert.deepEqual(answer, { started: false, already: 'queued', position: 2 }, 'already waiting, place 2 — not 「a round is running」')
  for (let i = 0; i < 5; i++) assert.deepEqual(await page.handlers.startRound(), answer, 'pressed again and again: the same answer, nothing more queued')
  // getQueue: who runs and why, who waits and why, each library's next slot
  const view = s.handlers.getQueue()
  assert.equal(view.running.libraryId, liu)
  assert.equal(view.running.why, 'catch-up')
  assert.deepEqual([view.running.phase, view.running.calls, view.running.cap], ['gate:relevance', 7, 50], 'the pipeline\'s phase, calls and cap')
  assert.deepEqual(view.waiting.map(x => [x.libraryId, x.why]), [[an, 'catch-up']])
  assert.ok(!Number.isNaN(Date.parse(view.waiting[0].since)), 'since when it waits')
  assert.deepEqual(view.next.map(n => n.libraryId).sort(), [liu, an].sort(), 'the next slot of each library whose schedule is on (Rust is off)')
  assert.ok(view.next.every(n => n.at === at(2026, 11, 11, 8, 30).toISOString()))
  // a third library, pressed while two are in the line: the end, place 3, 流息Test named as the one running
  library.handlers.setActiveLibrary(ids.Rust)
  assert.deepEqual(await page.handlers.startRound(), { started: false, queued: true, position: 3, runningLibraryId: liu })
  // redesign R2 (O7): Rust has never run, so the run asked for is its first one (建库后的第一轮), not 'manual'
  assert.deepEqual(s.handlers.getQueue().waiting.map(x => [x.libraryId, x.why]), [[an, 'catch-up'], [ids.Rust, 'first']])
  // every change of the queue was said to the page
  const said = w.eventsOf('queue-changed').map(e => e.payload)
  assert.deepEqual(said.at(-1), { running: liu, waiting: [an, ids.Rust] })
  assert.ok(said.some(x => x.running === liu && x.waiting.length === 1), 'when the catch-up started 流息Test')
  await p.finish()
  await p.finish()
  await p.finish()
  assert.deepEqual(p.order, [liu, an, ids.Rust], 'each once, in the order of the line')
  assert.equal(p.maxActive, 1, 'never two rounds at once')
  assert.deepEqual(s.handlers.getQueue().running, null)
  assert.deepEqual(w.eventsOf('queue-changed').at(-1).payload, { running: null, waiting: [] })
})

test('the notification names the library whose round it was (another one than the current); 0 new cards → none', async () => {
  const w0 = testWorld('st-queue-notify-'); worlds.push(w0)
  const logFile = join(w0.root, 'notifications.jsonl')
  const notifier = createNotifier({ Notification: null, windows: () => [], bringToFront: () => true, emit: w0.emit, log: w0.log, logFile })
  const { time, pipeline: p, schedule: s, ids, library } = await setup({ 论文: { schedule: ON('08:00') }, tools: { schedule: OFF('08:00') } }, { start: at(2026, 11, 4, 7, 59), notifier })
  assert.equal(library.current().libraryId, ids.tools)
  s.arm()
  time.set(at(2026, 11, 4, 8, 0))
  time.fire()
  await sleep(0)
  await p.finish(2)
  const lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.deepEqual(lines.map(l => l.body), ['论文：这一轮进来 2 条待看。'])
  // a round with nothing new: no notification
  await s.startCurrent('the page')
  await p.finish(0)
  assert.equal(readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length, 1)
})
