/**
 * The timed rounds and the queue (plan A2; v2 package A; docs/desktop.md §4.3–4.4, docs/core-api.md 5.10). Every library the
 * app knows (services/library.mjs entries: the registered ones, and the development one while it lasts) whose folder is
 * there and readable has its own schedule in its streams.json (core ensureLibrarySchedule: a library without one gets
 * v1.0's settings.json schedule, or the default, written in the first time it is read here). A library that cannot be
 * read is skipped (said in the log once) and the others go on.
 *
 * One round at a time for the whole app: a library whose slot came, or whose catch-up is owed, goes into one queue, in the
 * order its slot came; the next one starts when the round before it ended. A library already in the queue, or the one
 * whose round runs, is not queued again. The page's 「开始」 (startCurrent, through services/pipeline.mjs roundGate) and
 * the tray's 「现在跑一轮」 (startOne) go through the same queue: idle, the current library's round starts at once.
 * v2 package L (维护者 11-10, feedback #1 「没能开始」): busy (another library's round runs, or one waits), the current library
 * is put at the END of the queue and the answer says so — { started: false, queued: true, position, runningLibraryId }
 * (position: 1 is the round that runs, 2 the first waiting, …); a library whose round runs already, or that waits already, is
 * not queued twice — { started: false, already: 'running' | 'queued', position? }. (Until package L a manual round was
 * refused while busy: the page got 「a round is running」.) Still one round at a time, and a catch-up never stacks.
 * Every waiting library carries why it waits ('schedule' | 'catch-up' | 'manual': the page's or the tray's 开始, a confirmed
 * card's round) and since when; getQueue gives the round that runs, the queue and each library's next slot, and every change
 * of the queue sends `queue-changed` { running, waiting } (the ids).
 *
 * The catch-up, at start and on waking from sleep: for each library on its own, core missedRun against the start of the
 * last round in its rounds.jsonl says whether one round is owed, and one is queued, never more (three missed days still
 * give one); several libraries owing one are queued one after the other (oldest slot first). After every round that wrote
 * something into 待看, one notification 「<库名>：这一轮进来 n 条待看」 (none for 0).
 *
 * The timer never waits longer than MAX_WAIT_MS at a time: on each tick it looks at the clock again, so a changed system
 * time or a late timer cannot skip a slot or run one twice; each library's slot that has fired is remembered and not
 * fired again. One timer, for the soonest slot of all the libraries.
 * Redesign R5a (N07): 重新评分 of a library (services/pipeline.mjs startRescoreIn) goes through the same queue as a run — one
 * thing at a time for the whole app: `startRescore(entry)` starts it now when idle, else puts the library at the end (its queue
 * entry has job 'rescore'; a library already running or waiting is not queued twice). Its end frees the queue like a run's
 * (roundDone), without the 「本次运行新增」 notification.
 * Pure Node apart from what is injected (the clock, the timers, the notifier), so the rules run in plain Node
 * (test/services-schedule.test.mjs, test/services-queue.test.mjs) with a fake clock.
 * @module desktop/main/services/schedule
 */

import { BridgeError } from '../bridge-methods.mjs'
import { ensureLibrarySchedule, isSchedule, lastDueAt, listRounds, missedRun, nextRunAt, saveLibrarySchedule } from '../core.mjs'
import { readSettings } from '../settings.mjs'
import { byYou } from './changes.mjs'

export const MAX_WAIT_MS = 10 * 60_000
/**
 * v2 package L: why a library waits — its slot came, a missed slot is caught up, or someone asked (开始 · the tray · a card).
 * Redesign R2 (O7): 'first' — the first run of a library that has never run (建库后的第一轮): what a run someone asked for is
 * called when the library has no run record yet (a confirmed 新建库 card, 新建库's 开始, 立即运行 on a new library).
 */
export const QUEUE_WHY = Object.freeze(['first', 'manual', 'schedule', 'catch-up'])

/** Redesign R2: 'manual' for a library that has never run is its first run ('first'); everything else as it is. */
export function whyOf(entry, kind) {
  if (kind !== 'manual') return kind
  try { return listRounds(entry.path, 1).length === 0 ? 'first' : 'manual' } catch { return 'manual' }
}

/**
 * @param {object} o
 * @param {string} o.settingsFile - v1.0's schedule (read only: what a library without its own gets)
 * @param {{entries: () => object[], find: (id: string) => object|null, entryOf: (id: string) => object, current: () => {libraryId: string}|null, usable: (path: string) => boolean}} o.library - services/library.mjs
 * @param {{startRoundIn: (entry: {id: string, path: string}) => Promise<object>, startRescoreIn?: (entry: {id: string, path: string}) => Promise<object>, isRunning: () => boolean}} o.pipeline - services/pipeline.mjs
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
  const queue = [] // [{ id, why, kind, since, job? }]: the libraries waiting for their round, first come first (kind: QUEUE_WHY;
  // job 'rescore': redesign R5a's 重新评分 instead of a run)
  let runningId = null // the library whose round runs (or is being started) through the queue, or null
  let runningKind = null // v2 package L: why that round runs (QUEUE_WHY), and since when
  let runningSince = null
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

  /** v2 package L: the library whose round runs now (through the queue, or the pipeline's own), or null. */
  const runningLibrary = () => runningId ?? pipeline.runningLibrary?.() ?? null
  /** v2 package L: the place of the queue's i-th waiting library, counting the round that runs as 1. */
  const positionOf = i => i + 1 + (runningId !== null || pipeline.isRunning() ? 1 : 0)

  /** v2 package L: every change of the queue is said to the page (the ids only; getQueue gives the rest). */
  const changed = () => {
    try { emit('queue-changed', { running: runningLibrary(), waiting: queue.map(q => q.id) }) } catch (err) { log(`schedule: queue-changed not sent: ${String(err?.message ?? err)}`) }
  }

  /** The next library of the queue, when nothing runs: its round started; one that did not start lets the next one go. */
  async function pump() {
    if (runningId !== null || pipeline.isRunning() || queue.length === 0) return null
    const { id, why, kind, job } = queue.shift()
    const e = library.find(id)
    if (!e || !library.usable(e.path)) { log(`schedule: ${why}: ${id} is not a readable library any more, skipped`); changed(); return pump() }
    runningId = id
    runningKind = kind
    runningSince = now().toISOString()
    changed()
    let r
    try {
      r = job === 'rescore' ? await pipeline.startRescoreIn(e) : await pipeline.startRoundIn(e)
    } catch (err) {
      log(`schedule: ${why}: ${id}: ${String(err?.stack ?? err)}`)
      r = { started: false, reason: 'error' }
    }
    log(`schedule: ${why}: ${id}: ${r.started ? `round ${r.roundId} started` : `the round did not start (${JSON.stringify(r.problems ?? r.reason ?? [])})`}`)
    if (!r.started) { runningId = null; changed(); void pump() }
    return r
  }

  /**
   * Put a library at the end of the queue (not when it is in it already, or its round runs). `kind`: why it waits
   * (QUEUE_WHY). → { queued: true, position } or { queued: false, reason: 'running' | 'queued' }.
   */
  function enqueue(entry, why, kind = 'schedule', job = 'round') {
    if (runningId === entry.id || pipeline.runningLibrary?.() === entry.id) {
      log(`schedule: ${why}: ${entry.id}: a round of this library is running, no second one`)
      return { queued: false, reason: 'running' }
    }
    if (queue.some(q => q.id === entry.id)) {
      log(`schedule: ${why}: ${entry.id} is in the queue already`)
      return { queued: false, reason: 'queued' }
    }
    queue.push({ id: entry.id, why, kind: QUEUE_WHY.includes(kind) ? whyOf(entry, kind) : 'schedule', since: now().toISOString(), ...(job === 'rescore' ? { job } : {}) })
    const position = positionOf(queue.length - 1)
    log(`schedule: ${why}: ${entry.id} queued (${queue.length} waiting${runningId ? `, ${runningId} running` : ''})`)
    changed()
    void pump()
    return { queued: true, position }
  }

  /**
   * The current library's round (the page's 「开始」 and the tray's 「现在跑一轮」): idle → it starts now (v1.0); busy → v2 package
   * L: this library goes to the end of the queue and the answer says where, or that it runs / waits already (never twice).
   */
  async function startCurrent(why = 'the page') {
    const e = currentEntry()
    if (!e) { log(`schedule: ${why}: no library open, no round`); return { started: false, reason: 'no-library' } }
    if (busy()) {
      const running = runningLibrary()
      if (running === e.id) { log(`schedule: ${why}: ${e.id}: its round runs already, no second one`); return { started: false, already: 'running' } }
      const at = queue.findIndex(q => q.id === e.id)
      if (at >= 0) { log(`schedule: ${why}: ${e.id} waits in the queue already (place ${positionOf(at)})`); return { started: false, already: 'queued', position: positionOf(at) } }
      const q = enqueue(e, why, 'manual')
      // (enqueue says no only for a library that runs or waits: both answered above)
      return { started: false, queued: true, position: q.position, runningLibraryId: runningLibrary() }
    }
    runningId = e.id
    runningKind = whyOf(e, 'manual')
    runningSince = now().toISOString()
    changed()
    let r
    try {
      r = await pipeline.startRoundIn(e)
    } catch (err) {
      runningId = null
      changed()
      void pump()
      throw err
    }
    log(`schedule: ${why}: ${e.id}: ${r.started ? `round ${r.roundId} started` : `the round did not start (${JSON.stringify(r.problems ?? [])})`}`)
    if (!r.started) { runningId = null; changed(); void pump() }
    return r
  }

  /**
   * v2 package L (getQueue): the round that runs — its library, why, the pipeline's phase, calls and cap, when it started —
   * the libraries waiting in order (why, since when), and each library's next timed slot, soonest first.
   */
  function queueView() {
    const rid = runningLibrary()
    let running = null
    if (rid !== null || pipeline.isRunning()) {
      const c = pipeline.current?.() ?? null
      const mine = c && (rid === null || c.libraryId === rid) ? c : null
      running = {
        libraryId: rid ?? mine?.libraryId ?? null, roundId: mine?.roundId ?? null, phase: mine?.phase ?? 'self-check',
        calls: mine?.calls ?? 0, cap: mine?.cap ?? null, startedAt: mine?.startedAt ?? runningSince, why: rid !== null && rid === runningId ? runningKind : null,
      }
    }
    const t = now()
    const next = []
    for (const l of libraries()) {
      const at = nextRunAt(l.schedule, new Date(Math.max(t.getTime(), fired.get(l.id) ?? 0)))
      if (at) next.push({ libraryId: l.id, at: at.toISOString() })
    }
    next.sort((a, b) => a.at.localeCompare(b.at))
    return { running, waiting: queue.map(q => ({ libraryId: q.id, why: q.kind, since: q.since, ...(q.job ? { job: q.job } : {}) })), next }
  }

  /**
   * Redesign R5a (N07): 重新评分 of the library `entry` — idle → started now; busy → at the end of the queue (job 'rescore'), or
   * the answer that it runs / waits already. → startRescoreIn's answer, or { started: false, queued: true, position } / { already }.
   */
  async function startRescore(entry) {
    if (busy()) {
      const running = runningLibrary()
      if (running === entry.id) return { started: false, already: 'running' }
      const at = queue.findIndex(q => q.id === entry.id)
      if (at >= 0) return { started: false, already: 'queued', position: positionOf(at) }
      const q = enqueue(entry, 'rescore', 'manual', 'rescore')
      return { started: false, queued: true, position: q.position, runningLibraryId: runningLibrary(), rescore: true }
    }
    runningId = entry.id
    runningKind = 'manual'
    runningSince = now().toISOString()
    changed()
    let r
    try {
      r = await pipeline.startRescoreIn(entry)
    } catch (err) {
      runningId = null
      changed()
      void pump()
      throw err
    }
    log(`schedule: rescore: ${entry.id}: ${r.started ? `${r.roundId} started` : 'did not start'}`)
    if (!r.started) { runningId = null; changed(); void pump() }
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
    for (const { l, last } of owed) if (enqueue(l, `catch-up at ${why} (last round ${last ?? 'never'})`, 'catch-up').queued) queued.push(l.id)
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
      if (e) enqueue(e, 'scheduled', 'schedule')
    }
    arm()
  }

  /** Write one library's schedule (a bad one: bad_arguments, nothing written), then the timer again. */
  function setFor(entry, s) {
    if (!isSchedule(s)) throw new BridgeError('bad_arguments', "schedule must be { enabled: boolean, time: 'HH:MM' } (00:00–23:59)")
    if (!library.usable(entry.path)) throw new BridgeError('open_failed', `${entry.path} is not a readable library`)
    // 「谁定的」 (v2 package B): a schedule set from the page is the user's own (changes.jsonl, by 'you')
    try { byYou(entry.path, ['schedule'], () => saveLibrarySchedule(entry.path, s), { log, now }) } catch (err) { log(`schedule: ${entry.id}: not saved: ${String(err?.message ?? err)}`); throw new BridgeError('internal', String(err?.message ?? err)) }
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
    startRescore,
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
     * One round of the library `entry` put in the queue, like a slot that came (v2 package B: a confirmed run_round or
     * create_library card) → { queued } or { queued: false, reason: 'running' | 'queued' } (never twice).
     */
    queueRound: (entry, why) => enqueue(entry, why, 'manual'),
    /** v2 package L: what getQueue gives. */
    queueView,
    /**
     * After a round (services/pipeline.mjs onRoundDone): its library is free, one notification when it wrote into 待看
     * (none for 0), then the next one of the queue.
     */
    roundDone({ roundId, libraryId = null, result }) {
      if (runningId !== null && (libraryId === null || libraryId === runningId)) { runningId = null; runningKind = null; runningSince = null }
      changed()
      let shown = false
      // redesign R5a: 重新评分 is not a run: no 「本次运行新增」 notification
      const n = result?.started && !result?.rescore ? Number(result?.counts?.inbox ?? 0) : 0
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
      /** v2 package L: the queue of every library (docs/desktop.md §4.4). */
      getQueue() {
        return queueView()
      },
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
