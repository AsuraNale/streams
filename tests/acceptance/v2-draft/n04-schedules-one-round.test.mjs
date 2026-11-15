// N4（草案，待 维护者 定）· 三个库各自定时：错过补一轮不叠加；同一时间只跑一轮
//
// How it is checked: the desktop's schedule service (services/schedule.mjs: the timers, the catch-up, the one queue) as
// main.mjs wires it, in plain Node with a fake clock and fake timers, on three libraries the library service registered
// (each with its own schedule in its streams.json). The rounds are a stand-in that never refuses a second round (so the
// one-at-a-time rule can only come from the schedule), holds every round until the test ends it, counts how many run at
// once, and writes each round's start into the library's rounds.jsonl as the core does.
//   1. three libraries at 08:00 / 08:05 / 08:10: each slot starts its own library; a slot that comes while another round
//      runs waits; never two rounds at once; each slot once;
//   2. two libraries at the same minute: both run, one after the other;
//   3. the app closed for three days: at start each library owes one round (not three), queued one after the other,
//      oldest slot first; the wake-up catch-up right after adds nothing; once they ran, nothing is owed;
//   4. 「现在跑一轮」 while the queue is busy is not stacked. v2 package L (维护者 11-10, feedback #1): it is no longer refused —
//      a library already waiting answers 「already queued」 (not queued twice), one not in the line goes to its END; still
//      never a second round at once, and each library runs once.
// Reverse (mutants of a copy of the desktop's main process, ./support/mutant-app.mjs): the queue starts the next run
// while one runs → red at 「two rounds at once」; a library already in the queue is queued again → red at 「owed more than one」.
// redesign R6b: 「next round」 reads 「next run」 here (comments, test names, the text of an assertion's message; in
// fetch-round.test and the r5a fixtures also the fetch log's message, which core fetch/states.mjs now writes as 'retry next
// run') — 05 统一用词 says 运行 / run, and the contract (R6b-1) wants the v1 处理建议's fragment 'next round' gone from the repository.
// redesign R6b-4: the test's name says 立即运行 (was 现在跑一轮), the head's button as it is now.
// redesign R6b precheck: and one run at a time / a missed run (were round: 运行 is run, 05 统一用词) — the name only.
// Nothing else that is checked changed. (Only a comment and a mutant's description; the standard's sentence on line 1 and the
// checks are untouched.)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { caseDir } from '../support/paths.mjs'
import { mutantApp, realApp } from './support/mutant-app.mjs'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const at = (d, h, mi) => new Date(2026, 10, d, h, mi, 0, 0)

function fakeTime(start) {
  let t = start.getTime()
  const pending = new Map()
  let next = 1
  return {
    now: () => new Date(t),
    set: time => { t = time.getTime() },
    timers: { set: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id }, clear: id => { pending.delete(id) } },
    /** The timer that is armed fires (the clock as the test set it). */
    fire() { const first = [...pending.entries()][0]; if (!first) return false; pending.delete(first[0]); first[1].fn(); return true },
  }
}

function holdingRounds(now) {
  const p = { order: [], active: [], maxActive: 0, schedule: null }
  p.isRunning = () => p.active.length > 0
  p.runningLibrary = () => p.active[0]?.libraryId ?? null
  p.startRoundIn = async entry => {
    p.order.push(entry.id)
    const roundId = `n04-${p.order.length}`
    writeFileSync(join(entry.path, '_pipeline', 'rounds.jsonl'), `${JSON.stringify({ id: roundId, startedAt: now().toISOString() })}\n`, { flag: 'a' })
    p.active.push({ roundId, libraryId: entry.id })
    p.maxActive = Math.max(p.maxActive, p.active.length)
    return { started: true, roundId }
  }
  p.finish = async () => {
    const r = p.active.shift()
    if (!r) return null
    p.schedule.roundDone({ roundId: r.roundId, libraryId: r.libraryId, result: { started: true, counts: { inbox: 0 } } })
    await tick()
    return r
  }
  p.finishAll = async () => { for (let i = 0; i < 20 && (p.active.length || p.schedule.queue().waiting.length); i++) await p.finish() }
  return p
}

async function world(app, label, specs, start) {
  const core = await app.core()
  const { createLibraryService } = await app.desktop('services/library.mjs')
  const { createScheduleService } = await app.desktop('services/schedule.mjs')
  const root = caseDir(`n04-${label}`)
  const appData = join(root, 'appData')
  mkdirSync(appData, { recursive: true })
  const settingsFile = join(appData, 'settings.json')
  writeFileSync(settingsFile, `${JSON.stringify({ schedule: { enabled: false, time: '08:30' } })}\n`)
  const time = fakeTime(start)
  const lines = []
  const answers = []
  const dialog = { showOpenDialog: async () => { const a = answers.shift(); return a ? { canceled: false, filePaths: [a] } : { canceled: true, filePaths: [] } } }
  const library = createLibraryService({ settingsFile, emit: () => 1, log: l => lines.push(l), dialog, shell: { showItemInFolder: () => {} }, locale: () => ({ resolved: 'zh-CN' }), now: time.now, hidden: true })
  const ids = {}
  for (const [name, spec] of Object.entries(specs)) {
    const dir = join(root, name)
    core.createLibrary(dir, { name })
    core.saveLibrarySchedule(dir, spec.schedule)
    writeFileSync(join(dir, '_pipeline', 'rounds.jsonl'), (spec.rounds ?? []).map((s, i) => `${JSON.stringify({ id: `old-${i}`, startedAt: s.toISOString() })}\n`).join(''))
    answers.push(dir)
    await library.handlers.chooseLibraryFolder()
    ids[name] = (await library.handlers.useChosenFolder('')).libraryId
  }
  const rounds = holdingRounds(time.now)
  const schedule = createScheduleService({ settingsFile, library, pipeline: rounds, emit: () => 1, log: l => lines.push(l), now: time.now, timers: time.timers })
  rounds.schedule = schedule
  return { time, rounds, schedule, ids, lines }
}

const ON = t => ({ enabled: true, time: t })

/** N4 on `app` → [what went wrong]. */
async function scenario(app, label) {
  const problems = []
  const want = (ok, what) => { if (!ok) problems.push(what) }

  // 1. three at three times
  {
    const { time, rounds: p, schedule: s, ids } = await world(app, `${label}-three`, { a: { schedule: ON('08:00') }, b: { schedule: ON('08:05') }, c: { schedule: ON('08:10') } }, at(9, 7, 59))
    const armed = s.arm()
    want(armed?.getTime() === at(9, 8, 0).getTime(), `three: the timer waits for the soonest slot (${armed?.toISOString()})`)
    for (const [h, m] of [[8, 0], [8, 5], [8, 10]]) { time.set(at(9, h, m)); time.fire(); await tick() }
    want(JSON.stringify(p.order) === JSON.stringify([ids.a]), `three: while a runs, b and c wait (started: ${p.order.join(',')})`)
    await p.finishAll()
    want(JSON.stringify(p.order) === JSON.stringify([ids.a, ids.b, ids.c]), `three: each its own slot, in the order the slots came (${p.order.join(',')})`)
    want(p.maxActive === 1, `two rounds at once (three libraries): at most ${p.maxActive}`)
    time.fire(); await tick()
    want(p.order.length === 3, `three: a slot fired twice (${p.order.length})`)
  }
  // 2. two at the same minute
  {
    const { time, rounds: p, schedule: s, ids } = await world(app, `${label}-same`, { a: { schedule: ON('09:00') }, b: { schedule: ON('09:00') }, c: { schedule: { enabled: false, time: '09:00' } } }, at(9, 8, 55))
    s.arm(); time.set(at(9, 9, 0)); time.fire(); await tick()
    want(p.order.length === 1 && s.queue().waiting.length === 1, `same minute: one runs, one waits (${JSON.stringify(s.queue())})`)
    await p.finishAll()
    want(JSON.stringify([...p.order].sort()) === JSON.stringify([ids.a, ids.b].sort()), `same minute: both ran once, the one switched off not (${p.order.join(',')})`)
    want(p.maxActive === 1, `two rounds at once (same minute): at most ${p.maxActive}`)
  }
  // 3. closed for three days: one round each, not three; the wake-up adds nothing; then nothing owed
  {
    const last = at(6, 8, 1)
    const { rounds: p, schedule: s, ids } = await world(app, `${label}-closed`, { a: { schedule: ON('08:00'), rounds: [last] }, b: { schedule: ON('07:00'), rounds: [at(6, 7, 1)] }, c: { schedule: ON('06:30'), rounds: [at(6, 6, 31)] } }, at(9, 12, 0))
    const r1 = s.start()
    await tick()
    const r2 = s.resumed()
    await tick()
    const r3 = s.catchUp('again')
    await tick()
    want(JSON.stringify([...(r1.owed ?? [])].sort()) === JSON.stringify([ids.a, ids.b, ids.c].sort()), `closed: each library owes a round (${JSON.stringify(r1)})`)
    const queuedCounts = [ids.a, ids.b, ids.c].map(id => p.order.filter(x => x === id).length + s.queue().waiting.filter(x => x === id).length)
    want(queuedCounts.every(n => n === 1), `owed more than one: queued / running per library ${JSON.stringify(queuedCounts)} after start + wake-up + again (${JSON.stringify([r1.queued, r2.queued, r3.queued])})`)
    want(p.order[0] === ids.c, `closed: the oldest slot first (${p.order[0]} vs c ${ids.c})`)
    await p.finishAll()
    want(p.order.length === 3, `closed: three rounds in all, one per library (${p.order.length})`)
    want(p.maxActive === 1, `two rounds at once (catch-up): at most ${p.maxActive}`)
    const after = s.catchUp('after')
    want((after.owed ?? []).length === 0, `closed: after the rounds nothing is owed (${JSON.stringify(after)})`)
  }
  // 4. 现在跑一轮 while busy — v2 package L: the check was 「refused (reason 'running')」; the rule is now 「queued, never stacked」
  // (a waiting library: already queued; the round count per library stays one), so this part checks that instead
  {
    const { time, rounds: p, schedule: s, ids } = await world(app, `${label}-manual`, { a: { schedule: ON('10:00') }, b: { schedule: ON('10:00') } }, at(9, 9, 59))
    s.arm(); time.set(at(9, 10, 0)); time.fire(); await tick()
    const before = p.order.length
    const r = await s.startCurrent('the page')
    want(r.started === false && (r.already === 'queued' || r.already === 'running' || r.queued === true), `manual while busy: ${JSON.stringify(r)}`)
    want(p.order.length === before, 'manual while busy: a round started anyway')
    const again = await s.startCurrent('the page')
    want(again.started === false && again.queued !== true, `owed more than one (manual pressed twice): ${JSON.stringify(again)}`)
    await p.finishAll()
    want(p.maxActive === 1, `two rounds at once (manual): at most ${p.maxActive}`)
    const counts = [ids.a, ids.b].map(id => p.order.filter(x => x === id).length)
    want(counts.every(n => n === 1), `owed more than one (manual): rounds per library ${JSON.stringify(counts)}`)
  }
  return problems
}

test('N4 · three libraries, each on its own schedule: one run at a time; a missed run caught up once, not stacked; 立即运行 while busy queued, not stacked (v2 package L)', async () => {
  assert.deepEqual(await scenario(realApp(), 'real'), [])
})

const MUTANTS = [
  { id: 'N4-a', what: 'the queue starts the next run while one runs', at: 'two rounds at once',
    edits: [{ file: 'desktop/src/main/services/schedule.mjs', from: '    if (runningId !== null || pipeline.isRunning() || queue.length === 0) return null', to: '    if (queue.length === 0) return null' }] },
  { id: 'N4-b', what: 'a library already in the queue is queued again', at: 'owed more than one',
    edits: [{ file: 'desktop/src/main/services/schedule.mjs', from: '    if (queue.some(q => q.id === entry.id)) {', to: '    if (false) {' }] },
]
for (const m of MUTANTS) {
  test(`N4 reverse ${m.id}: ${m.what} → red at「${m.at}」`, async () => {
    const app = await mutantApp(m.id, m.edits)
    const problems = await scenario(app, m.id)
    assert.ok(problems.some(p => p.startsWith(m.at)), `not caught: ${JSON.stringify(problems)}`)
    assert.equal(app.untouched(), true)
  })
}
