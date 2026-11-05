/**
 * The timed rounds and the queue (plan A2; v2 package A; docs/desktop.md §4.3–4.4, docs/core-api.md 5.10). Every library the
 * app knows (services/library.mjs entries: the registered ones, and the development one while it lasts) whose folder is
 * there and readable has its own schedule in its streams.json (core ensureLibrarySchedule: a library without one gets
 * v1.0's settings.json schedule, or the default, written in the first time it is read here). A library that cannot be
 * read is skipped (said in the log once) and the others go on.
 *
 * One round at a time for the whole app: a library whose slot came, or whose catch-up is owed, goes into one queue, in the
 * order its slot came; the next one starts when the round before it ended. A library already in the queue, or the one
 * whose round runs, is not queued again. The page's 「现在跑一轮」 (startCurrent, through services/pipeline.mjs roundGate) and
 * the tray's (startOne) go through the same queue: idle, the current library's round starts at once; busy (a round runs,
 * or one waits), the page gets v1.0's 「a round is running」 (bad_arguments) and the tray only a line in the log — a manual
 * round is refused, never queued behind the others.
 *
 * The catch-up, at start and on waking from sleep: for each library on its own, core missedRun against the start of the
 * last round in its rounds.jsonl says whether one round is owed, and one is queued, never more (three missed days still
 * give one); several libraries owing one are queued one after the other (oldest slot first). After every round that wrote
 * something into 待看, one notification 「<库名>：这一轮进来 n 条待看」 (none for 0).
 *
 * The timer never waits longer than MAX_WAIT_MS at a time: on each tick it looks at the clock again, so a changed system
 * time or a late timer cannot skip a slot or run one twice; each library's slot that has fired is remembered and not
 * fired again. One timer, for the soonest slot of all the libraries.
 * Pure Node apart from what is injected (the clock, the timers, the notifier), so the rules run in plain Node
 * (test/services-schedule.test.mjs, test/services-queue.test.mjs) with a fake clock.
 * @module desktop/main/services/schedule
 */

import { BridgeError } from '../bridge-methods.mjs'
import { ensureLibrarySchedule, isSchedule, lastDueAt, listRounds, missedRun, nextRunAt, saveLibrarySchedule } from '../core.mjs'
import { readSettings } from '../settings.mjs'

export const MAX_WAIT_MS = 10 * 60_000

/**
 * @param {object} o
 * @param {string} o.settingsFile - v1.0's schedule (read only: what a library without its own gets)
 * @param {{entries: () => object[], find: (id: string) => object|null, entryOf: (id: string) => object, current: () => {libraryId: string}|null, usable: (path: string) => boolean}} o.library - services/library.mjs
 * @param {{startRoundIn: (entry: {id: string, path: string}) => Promise<object>, isRunning: () => boolean}} o.pipeline - services/pipeline.mjs
 * @param {{notice: (n: {kind: string, values?: object, screen: string}) => boolean}|null} [o.notifier] - services/notify.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 * @param {{set: (fn: Function, ms: number) => unknown, clear: (handle: unknown) => void}} [o.timers]
 */
export function createScheduleService({ settingsFile, library, pipeline, notifier = null, emit, log, now = () => new Date(), timers = { set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h) } }) {
  let timer = null
  let armed = new Map() // library id → the slot the timer waits for (a Date)
  const fired = new Map() // library id → the last slot of it that fired (ms): never fired again
  const queue = [] // [{ id, why }]: the libraries waiting for their round, first come first
  let runningId = null // the library whose round runs (or is being started) through the queue, or null
  const skipped = new Set() // libraries said in the log as skipped (said again only after they came back)

  /** v1.0's one schedule (settings.json): what a library without its own takes. */
  const fallback = () => readSettings(settingsFile).schedule

  /** A library's schedule (the migration on the first read), or null when its streams.json cannot be read or written. */
  const scheduleOf = entry => {
    try {
      const r = ensureLibrarySchedule(entry.path, fallback())
      if (r.migrated) log(`schedule: ${entry.id}: no schedule in streams.json yet, settings.json's written in (${r.schedule.enabled ? `every day at ${r.schedule.time}` : 'off'})`)
      return r.schedule
    } catch (err) {
      log(`schedule: ${entry.id}: the schedule unreadable: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
      return null
    }
  }

  /** The libraries the schedule works on, each with its schedule; the others skipped (said once). */
  const libraries = () => {
    const out = []
    for (const e of library.entries()) {
      const s = library.usable(e.path) ? scheduleOf(e) : null
      if (!s) {
        if (!skipped.has(e.id)) { skipped.add(e.id); log(`schedule: ${e.id} skipped: ${e.path} is not a readable library (the others go on)`) }
        continue
      }
      skipped.delete(e.id)
      out.push({ ...e, schedule: s })
    }
    return out
  }

  const lastRoundAt = dir => {
    try { return listRounds(dir, 1)[0]?.startedAt ?? null } catch (err) { log(`schedule: rounds unreadable: ${String(err?.message ?? err)}`); return null }
  }

  /** What getSchedule / getLibrarySchedule give for one library (null: no library — v1.0's setting, nothing owed). */
  function viewOf(entry) {
    const t = now()
    const usable = entry ? library.usable(entry.path) : false
    const s = (usable ? scheduleOf(entry) : null) ?? fallback()
    const last = usable ? lastRoundAt(entry.path) : null
    const next = nextRunAt(s, t)
    return { libraryId: entry?.id ?? null, enabled: s.enabled, time: s.time, nextRunAt: next ? next.toISOString() : null, lastRoundAt: last, missed: usable ? missedRun(s, { lastRoundAt: last, now: t }) : false }
  }

  const currentEntry = () => {
    const c = library.current()
    return c ? library.find(c.libraryId) : null
  }

  /** Busy: a round runs, or is being started, or waits in the queue. */
  const busy = () => runningId !== null || queue.length > 0 || pipeline.isRunning()

  /** The next library of the queue, when nothing runs: its round started; one that did not start lets the next one go. */
  async function pump() {
    if (runningId !== null || pipeline.isRunning() || queue.length === 0) return null
    const { id, why } = queue.shift()
    const e = library.find(id)
    if (!e || !library.usable(e.path)) { log(`schedule: ${why}: ${id} is not a readable library any more, skipped`); return pump() }
    runningId = id
    let r
    try {
      r = await pipeline.startRoundIn(e)
    } catch (err) {
      log(`schedule: ${why}: ${id}: ${String(err?.stack ?? err)}`)
      r = { started: false, reason: 'error' }
    }
    log(`schedule: ${why}: ${id}: ${r.started ? `round ${r.roundId} started` : `the round did not start (${JSON.stringify(r.problems ?? r.reason ?? [])})`}`)
    if (!r.started) { runningId = null; void pump() }
    return r
  }

  /** Put a library in the queue (not when it is in it already, or its round runs). */
  function enqueue(entry, why) {
    if (runningId === entry.id || pipeline.runningLibrary?.() === entry.id) {
      log(`schedule: ${why}: ${entry.id}: a round of this library is running, no second one`)
      return { queued: false, reason: 'running' }
    }
    if (queue.some(q => q.id === entry.id)) {
      log(`schedule: ${why}: ${entry.id} is in the queue already`)
      return { queued: false, reason: 'queued' }
    }
    queue.push({ id: entry.id, why })
    log(`schedule: ${why}: ${entry.id} queued (${queue.length} waiting${runningId ? `, ${runningId} running` : ''})`)
    void pump()
    return { queued: true }
  }

  /** The current library's round now, if the queue is idle (the page and the tray: v1.0's rule, refused when busy). */
  async function startCurrent(why = 'the page') {
    const e = currentEntry()
    if (!e) { log(`schedule: ${why}: no library open, no round`); return { started: false, reason: 'no-library' } }
    if (busy()) { log(`schedule: ${why}: a round is running, no second one`); return { started: false, reason: 'running' } }
    runningId = e.id
    let r
    try {
      r = await pipeline.startRoundIn(e)
    } catch (err) {
      runningId = null
      void pump()
      throw err
    }
    log(`schedule: ${why}: ${e.id}: ${r.started ? `round ${r.roundId} started` : `the round did not start (${JSON.stringify(r.problems ?? [])})`}`)
    if (!r.started) { runningId = null; void pump() }
    return r
  }

  /** The tray's 「现在跑一轮」: startCurrent, every failure in the log only. */
  async function startOne(why) {
    try { return await startCurrent(why) } catch (err) {
      log(`schedule: ${why}: ${String(err?.stack ?? err)}`)
      return { started: false, reason: 'error' }
    }
  }

  /** The catch-up: every library whose schedule is on and which owes a round (core missedRun) is queued, oldest slot first. */
  function catchUp(why) {
    const t = now()
    const owed = []
    for (const l of libraries()) {
      if (!l.schedule.enabled) continue
      const last = lastRoundAt(l.path)
      if (!missedRun(l.schedule, { lastRoundAt: last, now: t })) { log(`schedule: ${why}: nothing missed (${l.id}: last round ${last ?? 'never'})`); continue }
      owed.push({ l, due: lastDueAt(l.schedule, t).getTime(), last })
    }
    owed.sort((a, b) => a.due - b.due)
    const queued = []
    for (const { l, last } of owed) if (enqueue(l, `catch-up at ${why} (last round ${last ?? 'never'})`).queued) queued.push(l.id)
    return { owed: owed.map(o => o.l.id), queued }
  }

  function clear() {
    if (timer !== null) timers.clear(timer)
    timer = null
    armed = new Map()
  }

  /** The timer for the soonest slot of all the libraries (from their schedules as they are now); none on → no timer. */
  function arm() {
    clear()
    const t = now()
    let soonest = null
    for (const l of libraries()) {
      // a slot of this library that has fired already is not its next one, even if the clock reads it again
      const next = nextRunAt(l.schedule, new Date(Math.max(t.getTime(), fired.get(l.id) ?? 0)))
      if (!next) continue
      armed.set(l.id, next)
      if (!soonest || next.getTime() < soonest.getTime()) soonest = next
    }
    if (!soonest) { log('schedule: off for every library, no timer'); return null }
    const wait = Math.max(0, Math.min(soonest.getTime() - t.getTime(), MAX_WAIT_MS))
    timer = timers.set(tick, wait)
    return soonest
  }

  function tick() {
    timer = null
    const t = now().getTime()
    const due = [...armed].filter(([, slot]) => t >= slot.getTime()).sort((a, b) => a[1].getTime() - b[1].getTime())
    for (const [id, slot] of due) {
      fired.set(id, slot.getTime())
      log(`schedule: ${id}: the slot ${slot.toISOString()} came`)
      const e = library.find(id)
      if (e) enqueue(e, 'scheduled')
    }
    arm()
  }

  /** Write one library's schedule (a bad one: bad_arguments, nothing written), then the timer again. */
  function setFor(entry, s) {
    if (!isSchedule(s)) throw new BridgeError('bad_arguments', "schedule must be { enabled: boolean, time: 'HH:MM' } (00:00–23:59)")
    if (!library.usable(entry.path)) throw new BridgeError('open_failed', `${entry.path} is not a readable library`)
    try { saveLibrarySchedule(entry.path, s) } catch (err) { log(`schedule: ${entry.id}: not saved: ${String(err?.message ?? err)}`); throw new BridgeError('internal', String(err?.message ?? err)) }
    const next = arm()
    log(`schedule: ${entry.id}: set to ${s.enabled ? `every day at ${s.time}` : 'off'}; next slot ${next ? next.toISOString() : 'none'}`)
    // the page re-reads what it shows (v1.0's event), told which library's schedule it was
    emit('settings-changed', { libraryId: entry.id })
    return viewOf(entry)
  }

  return {
    /** The current library's schedule as getSchedule gives it. */
    view: () => viewOf(currentEntry()),
    viewOf,
    arm,
    catchUp,
    startCurrent,
    startOne,
    /** At start, once the libraries are known: the timer, then the catch-up. */
    start() {
      const next = arm()
      log(`schedule: next slot ${next ? next.toISOString() : 'none'}`)
      return catchUp('start')
    },
    /** The system woke from sleep (powerMonitor 'resume'): the timer again, then the catch-up. */
    resumed() {
      log('schedule: the system woke up')
      arm()
      return catchUp('resume')
    },
    stop: clear,
    /** The queue as it is: the library whose round runs, those waiting (in order). */
    queue: () => ({ running: runningId, waiting: queue.map(q => q.id) }),
    /**
     * After a round (services/pipeline.mjs onRoundDone): its library is free, one notification when it wrote into 待看
     * (none for 0), then the next one of the queue.
     */
    roundDone({ roundId, libraryId = null, result }) {
      if (runningId !== null && (libraryId === null || libraryId === runningId)) runningId = null
      let shown = false
      const n = result?.started ? Number(result?.counts?.inbox ?? 0) : 0
      if (!(n > 0)) log(`schedule: round ${roundId}: nothing new in the inbox, no notification`)
      else if (notifier) {
        const name = (libraryId ? library.find(libraryId)?.name : null) ?? library.current()?.name ?? ''
        shown = notifier.notice({ kind: 'newItems', values: { n, library: name }, screen: 'inbox' })
        log(`schedule: round ${roundId}: ${n} new in the inbox of ${libraryId ?? 'the library'}, notification ${shown ? 'sent' : 'not needed (the window is in front)'}`)
      }
      void pump()
      return shown
    },
    /** Is the schedule on for any library (the window's close button then hides it to the tray)? */
    enabled: () => libraries().some(l => l.schedule.enabled),
    handlers: {
      getSchedule() {
        return viewOf(currentEntry())
      },
      /** The current library's schedule (no library open: no_library). */
      setSchedule(s) {
        const e = currentEntry()
        if (!e) throw new BridgeError('no_library')
        return setFor(e, s)
      },
      getLibrarySchedule(id) {
        const e = library.entryOf(id)
        if (!library.usable(e.path)) throw new BridgeError('open_failed', `${e.path} is not a readable library`)
        return viewOf(e)
      },
      setLibrarySchedule(id, s) {
        return setFor(library.entryOf(id), s)
      },
    },
  }
}
