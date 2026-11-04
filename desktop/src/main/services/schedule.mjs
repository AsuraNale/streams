/**
 * The timed round (plan A2; docs/desktop.md §4.3, docs/core-api.md 5.10): the schedule in settings.json, one timer for
 * the next time of day (core nextRunAt), a round started when it comes if a library is open and none is running; the
 * catch-up — at start (once the library is open) and on waking from sleep, core missedRun against the start of the last
 * round in rounds.jsonl says whether one round is owed, and one is run, never more (three missed days still give one);
 * after every round that wrote something into 待看, one notification 「这一轮进来 n 条待看」 (none for 0).
 *
 * The timer never waits longer than MAX_WAIT_MS at a time: on each tick it looks at the clock again, so a changed system
 * time or a late timer cannot skip a slot or run one twice (a slot that has fired is remembered and not fired again).
 * Pure Node apart from what is injected (the clock, the timers, the notifier), so the rules run in plain Node
 * (test/services-schedule.test.mjs) with a fake clock.
 * @module desktop/main/services/schedule
 */

import { BridgeError } from '../bridge-methods.mjs'
import { listRounds, missedRun, nextRunAt } from '../core.mjs'
import { readSettings, writeSettings } from '../settings.mjs'

export const MAX_WAIT_MS = 10 * 60_000

/**
 * @param {object} o
 * @param {string} o.settingsFile
 * @param {{dir: () => string|null}} o.library - services/library.mjs
 * @param {{handlers: {startRound: () => Promise<object>}, isRunning: () => boolean}} o.pipeline - services/pipeline.mjs
 * @param {{notice: (n: {kind: string, values?: object, screen: string}) => boolean}|null} [o.notifier] - services/notify.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 * @param {{set: (fn: Function, ms: number) => unknown, clear: (handle: unknown) => void}} [o.timers]
 */
export function createScheduleService({ settingsFile, library, pipeline, notifier = null, emit, log, now = () => new Date(), timers = { set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h) } }) {
  let timer = null
  let armedFor = null // the slot the timer waits for (a Date), or null
  let firedFor = 0 // the last slot that fired (ms): never fired again

  const schedule = () => readSettings(settingsFile).schedule

  const lastRoundAt = () => {
    const dir = library.dir()
    if (!dir) return null
    try { return listRounds(dir, 1)[0]?.startedAt ?? null } catch (err) { log(`schedule: rounds unreadable: ${String(err?.message ?? err)}`); return null }
  }

  /** What getSchedule gives: the setting, the next slot, the last round's start, whether one round is owed now. */
  function view() {
    const s = schedule()
    const t = now()
    const last = lastRoundAt()
    const next = nextRunAt(s, t)
    return { enabled: s.enabled, time: s.time, nextRunAt: next ? next.toISOString() : null, lastRoundAt: last, missed: library.dir() ? missedRun(s, { lastRoundAt: last, now: t }) : false }
  }

  /** One round now, if a library is open and no round runs. `why` goes to the log. */
  async function startOne(why) {
    if (!library.dir()) { log(`schedule: ${why}: no library open, no round`); return { started: false, reason: 'no-library' } }
    if (pipeline.isRunning()) { log(`schedule: ${why}: a round is running, no second one`); return { started: false, reason: 'running' } }
    try {
      const r = await pipeline.handlers.startRound()
      log(`schedule: ${why}: ${r.started ? `round ${r.roundId} started` : `the round did not start (${JSON.stringify(r.problems ?? [])})`}`)
      return r
    } catch (err) {
      log(`schedule: ${why}: ${String(err?.stack ?? err)}`)
      return { started: false, reason: 'error' }
    }
  }

  /** The catch-up: one round when the schedule is on, a library is open, none runs, and core missedRun says one is owed. */
  async function catchUp(why) {
    const s = schedule()
    if (!s.enabled) return { started: false, reason: 'off' }
    if (!library.dir()) return { started: false, reason: 'no-library' }
    if (pipeline.isRunning()) return { started: false, reason: 'running' }
    const last = lastRoundAt()
    if (!missedRun(s, { lastRoundAt: last, now: now() })) { log(`schedule: ${why}: nothing missed (last round ${last ?? 'never'})`); return { started: false, reason: 'not-missed' } }
    return startOne(`catch-up at ${why} (last round ${last ?? 'never'})`)
  }

  function clear() {
    if (timer !== null) timers.clear(timer)
    timer = null
    armedFor = null
  }

  /** The timer for the next slot (from the setting as it is now); off → no timer. */
  function arm() {
    clear()
    const s = schedule()
    const t = now()
    // a slot that has fired already is not the next one, even if the clock reads it again
    const next = nextRunAt(s, new Date(Math.max(t.getTime(), firedFor)))
    if (!next) { log('schedule: off, no timer'); return null }
    armedFor = next
    const wait = Math.max(0, Math.min(next.getTime() - t.getTime(), MAX_WAIT_MS))
    timer = timers.set(tick, wait)
    return next
  }

  function tick() {
    timer = null
    const slot = armedFor
    if (slot && now().getTime() >= slot.getTime()) {
      firedFor = slot.getTime()
      log(`schedule: the slot ${slot.toISOString()} came`)
      void startOne('scheduled')
    }
    arm()
  }

  return {
    view,
    arm,
    catchUp,
    startOne,
    /** At start, once the library is open: the timer, then the catch-up. */
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
    /** After a round (services/pipeline.mjs onRoundDone): one notification when it wrote into 待看, none for 0. */
    roundDone({ roundId, result }) {
      const n = result?.started ? Number(result?.counts?.inbox ?? 0) : 0
      if (!(n > 0)) { log(`schedule: round ${roundId}: nothing new in the inbox, no notification`); return false }
      if (!notifier) return false
      const shown = notifier.notice({ kind: 'newItems', values: { n }, screen: 'inbox' })
      log(`schedule: round ${roundId}: ${n} new in the inbox, notification ${shown ? 'sent' : 'not needed (the window is in front)'}`)
      return shown
    },
    /** Is the schedule on (the window's close button then hides it to the tray)? */
    enabled: () => schedule().enabled,
    handlers: {
      getSchedule() {
        return view()
      },
      setSchedule(s) {
        try { writeSettings(settingsFile, { schedule: s }) } catch (err) { throw new BridgeError('bad_arguments', String(err?.message ?? err)) }
        const next = arm()
        log(`schedule: set to ${s.enabled ? `every day at ${s.time}` : 'off'}; next slot ${next ? next.toISOString() : 'none'}`)
        emit('settings-changed', null)
        return view()
      },
    },
  }
}
