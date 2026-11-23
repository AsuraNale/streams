/**
 * The run of the open library and its 待看 (docs/desktop.md §四 「待看」, §4.1): one run at a time in the background, its cancel,
 * the inbox and the three decisions, the numbers of the library's page. Every call checks its arguments against what the
 * library holds: a url must be one the inbox or the index knows before it is kept, dismissed or opened.
 *
 * 1.1 (W5, W7a, W7b): a library has a library card and is updated by it — one agent run and one independent check
 * (services/library-update.mjs, core runUpdate). A library made by the last version (no card) is not updated: its run answers
 * `needs-build` at once (nothing fetched, no model called) until 来源与要求's 「重新查一遍来源」 brings it over through the build
 * conversation. v1.0's way of updating a library left the product in W7b (core/legacy, not shipped).
 *
 * v2 package A (docs/desktop.md §4.4): a run is of one library — the current one for the page's startRound, any registered one
 * for the schedule (`startRoundIn`, not on the bridge). One run at a time for the whole app: with a `roundGate`
 * (services/schedule.mjs: the queue) the page's startRound goes through it, and the gate's answer comes back as it is — the
 * library queued at the end ({ started: false, queued: true, position, runningLibraryId }) or already running / waiting
 * ({ started: false, already }). Every event of a run, and every `inbox-changed`, carries its `libraryId`.
 *
 * Redesign R2 (docs/desktop.md §4.14): 待看.
 *   - 放弃 is held, not written (N03): `dismissItem(url)` takes the card off the list at once and keeps it here; the ledger gets
 *     its `dismissed` event only when the bar under the list closes — `settleDismiss(reason, quick)` (a reason chosen, the bar
 *     closed), the next decision on another item (keep · dismiss · later), the library left (another library current), and the
 *     app quitting (`settlePending('quit')`, main.mjs before-quit). `undoDismiss()` drops it: nothing is written. One at a time:
 *     a second 放弃 writes the first one. kept / dismissed stay terminal (the core's ledger).
 *   - 稍后处理 (F27): the core's later (_pipeline/later.json); an update of THIS library that ran gives them back (releaseLater) —
 *     another library's does not.
 *   - getInbox gives the cards (not the held one, not the later ones), the later ones, the held one.
 *   - getHome gives the last run record (when it ended, how many it put into 待看) and the five most recently kept.
 * Redesign R5a (O9): round-progress's and getRoundState's problems carry the code (and the connection's code), not the detail —
 * the raw texts go to raw-errors.mjs.
 * Pure Node apart from what is injected (`shell`), so the rules run in plain Node (test/services-pipeline.test.mjs).
 * @module desktop/main/services/pipeline
 */

import { randomBytes } from 'node:crypto'
import { BridgeError } from '../bridge-methods.mjs'
import {
  dismiss, homeNumbers, keep, later, listInbox, listRounds, readIndex, recentDismissReasons, NO_OUTPUT_ROUNDS, DISMISS_QUICK, releaseLater,
} from '../core.mjs'
import { publicProblems, publicResult } from '../public-data.mjs'

const HTTP_URL = /^https?:\/\/\S+$/i

/**
 * @param {object} o
 * @param {{dir: () => string|null, require: () => string, current: () => {path: string, name: string}|null}} o.library - services/library.mjs
 * @param {{active: () => object|null}} o.connections - services/connections.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: nothing is opened outside the app
 * @param {{openExternal: (url: string) => Promise<void>}} o.shell
 * @param {() => Date} [o.now]
 * @param {() => {enabled: boolean, time: string, nextRunAt: string|null}|null} [o.schedule] - the schedule as getSchedule gives it
 *   (services/schedule.mjs): getHome's nextRun; none given: null
 * @param {(done: {roundId: string, libraryId: string|null, result: object|null}) => void} [o.onRoundDone] - after every run
 *   that ran in the background, once it ended (services/schedule.mjs: the notification, the next one in the queue)
 * @param {(() => Promise<object>)|null} [o.roundGate] - the page's startRound goes through this when given
 *   (services/schedule.mjs startCurrent: v2 package L — queued at the end while the queue is busy)
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs
 * @param {() => ({applies: (dir: string) => boolean, problemFor: Function, run: Function}|null)} [o.update] - 1.1 W5:
 *   services/library-update.mjs (a library with a card is updated by it)
 */
export function createPipelineService({ library, connections, emit, log, hidden = false, shell, now = () => new Date(), schedule = () => null, onRoundDone = () => {}, roundGate = null, rawErrors = null, update = () => null }) {
  // the run in the background, if one runs; what the last one gave; the problems of the last one that did not start
  let running = null
  let last = null
  let lastProblems = null
  let lastProgress = null
  // redesign R2: the 放弃 held until the bar closes — { dir, libraryId, url, title } — and the last run that did not start
  // ({ libraryId, dir, at, problems }; memory only)
  let held = null
  let failedAt = null
  // 1.1 W6a (B12): library folder → { code, at } of an update that did not start for the login (cleared by one that ran)
  const updateProblems = new Map()
  // 1.1 W11: library folder → the problems of its last run that did not start; getHome gives the open library's own (until
  // W11 it gave the app's last ones: after an upgrade the catch-up's 「needs-build」 of a library of the last version showed
  // on a new library while its first update ran). Cleared when a run of that library starts.
  const problemsOf = new Map()

  // 「n 条待看」: the cards the page lists — not the ones put aside (稍后处理), not the one held by 放弃
  const inboxCount = dir => {
    try { return listInbox(dir).filter(c => !c.later && !(held && held.dir === dir && held.url === c.url)).length } catch { return 0 }
  }
  const indexOf = dir => { try { return readIndex(dir) } catch (err) { log(`pipeline: index unreadable: ${String(err?.message ?? err)}`); return [] } }
  const inboxUrls = dir => new Set(listInbox(dir, { now }).map(i => i.url))

  const roundState = () => ({
    running: Boolean(running),
    roundId: running?.roundId ?? last?.roundId ?? null,
    // the library of that run (v2: the one run of the app may be another library's than the current one)
    libraryId: running?.libraryId ?? last?.libraryId ?? null,
    progress: lastProgress,
    // redesign R5a (O9): the problems' codes, not their details
    last: publicResult(last?.result ?? null),
    lastProblems: publicProblems(lastProblems),
  })

  const connectionView = () => {
    const a = connections.active()
    return a ? { kind: a.kind, model: a.model } : null
  }

  // redesign R5a (O9): what the page gets of a run's problems is their code; the details go to the log and the diagnostics
  const progress = (payload) => {
    const where = `run ${payload.roundId ?? ''} of ${payload.libraryId ?? '?'}`
    const shown = {
      ...payload,
      ...(payload.problems ? { problems: publicProblems(payload.problems, { raw: rawErrors, where }) } : {}),
      ...(payload.result ? { result: publicResult(payload.result, { raw: rawErrors, where }) } : {}),
    }
    lastProgress = shown
    emit('round-progress', shown)
  }

  /**
   * Redesign R2: write the held 放弃 into the ledger (the bar closed: a reason chosen, or none). `why` goes to the log only.
   * → { url } or null when nothing was held (or the item is not in the inbox any more).
   */
  const settlePending = (why, choice = null) => {
    const h = held
    if (!h) return null
    held = null
    const reason = typeof choice?.reason === 'string' && choice.reason.trim() !== '' ? choice.reason.trim() : undefined
    const quick = DISMISS_QUICK.includes(choice?.quick) ? choice.quick : undefined
    try {
      dismiss(h.dir, h.url, reason, { quick, now })
    } catch (err) {
      log(`pipeline: the held dismissal of ${h.url} was not written (${why}): ${String(err?.message ?? err)}`)
      emit('inbox-changed', { libraryId: h.libraryId, count: inboxCount(h.dir) })
      return null
    }
    log(`pipeline: dismissed ${h.url} (${why}${reason ? ', with a reason' : ', no reason'}${quick ? ` · ${quick}` : ''})`)
    emit('inbox-changed', { libraryId: h.libraryId, count: inboxCount(h.dir) })
    return { url: h.url }
  }
  /** A decision on the library `dir` (keep · dismiss · later), or another library opened: the held one goes in first. */
  const settleBefore = (dir, url, why) => { if (held && (held.dir !== dir || held.url !== url)) settlePending(why) }

  /**
   * One run on the library `{ id, path }` (the current one, or the schedule's). A library with a card: its update in the
   * background. One without (made by the last version): not updated — `needs-build`, nothing fetched, no model called. A run
   * already going: bad_arguments.
   */
  async function startRoundIn({ id: libraryId = null, path: dir }) {
    if (running) throw new BridgeError('bad_arguments', 'a round is running')
    // 1.1 W5: a library with a library card is updated by it (services/library-update.mjs)
    const u = update()
    if (u && u.applies(dir)) return startUpdateIn({ id: libraryId, path: dir }, u)
    // 1.1 W7a (E3): a library without a card was made by the last version — it is not updated the old way any more (only one
    // kind of library in 1.1, 维护者 11-20); it is brought over by the build conversation first (重新查一遍来源)
    const problem = { code: 'needs-build' }
    lastProblems = [problem]
    problemsOf.set(dir, [problem])
    failedAt = { libraryId, dir, at: now().toISOString(), problems: [problem] }
    log(`pipeline: ${libraryId ?? dir} has no library card: not updated (needs the build conversation)`)
    progress({ roundId: `n-${randomBytes(3).toString('hex')}`, libraryId, cap: null, phase: 'done', counts: null, calls: 0, done: true, result: null, problems: [problem] })
    return { started: false, problems: [problem] }
  }

  /**
   * 1.1 W5: one update of the library `{ id, path }` (it has a card) in the background: `round-progress` (phase 'update', then
   * done with the result), `inbox-changed`, onRoundDone (the queue and the 「本次运行新增」 notification). A connection that
   * cannot update, or none: not started, the problem's code in the answer.
   */
  async function startUpdateIn({ id: libraryId = null, path: dir }, u) {
    const a = connections.active()
    const roundId = `u-${now().toISOString().replace(/[-:]/g, '').replace(/.d{3}Z$/, 'Z')}-${randomBytes(3).toString('hex')}`
    const problem = u.problemFor(a)
    if (problem) {
      lastProblems = [problem]
      problemsOf.set(dir, [problem])
      log(`pipeline: update of ${libraryId ?? dir} not started: ${problem.code}${problem.connection ? ` (${problem.connection})` : ''}`)
      progress({ roundId, libraryId, cap: null, phase: 'done', counts: null, calls: 0, done: true, result: null, problems: [problem] })
      return { started: false, problems: [problem] }
    }
    const controller = new AbortController()
    problemsOf.delete(dir)
    running = { roundId, libraryId, controller, cap: null, startedAt: now().toISOString(), update: true }
    const base = { roundId, libraryId, cap: null, update: true }
    progress({ ...base, phase: 'update', counts: null, calls: 0, done: false })
    void (async () => {
      let result = null
      try {
        result = await u.run(dir, a, { round: roundId, signal: controller.signal })
      } catch (err) {
        log(`pipeline: update ${roundId} failed: ${String(err?.stack ?? err)}`)
        result = { started: false, status: 'internal', problems: [{ code: 'internal', detail: String(err?.message ?? err).slice(0, 300) }] }
      }
      last = { roundId, libraryId, result }
      lastProblems = result.started ? null : result.problems ?? null
      if (result.started) problemsOf.delete(dir)
      else problemsOf.set(dir, result.problems ?? [])
      // 1.1 W7a: this library's 稍后处理 items are back in 待看 once its update has run
      if (result.started) { try { const r = releaseLater(dir); if (r.released) log(`pipeline: update ${roundId}: ${r.released} item(s) back from later`) } catch (err) { log(`pipeline: update ${roundId}: the later items not given back: ${String(err?.message ?? err)}`) } }
      if (result.status === 'login-expired') updateProblems.set(dir, { code: 'login-expired', at: now().toISOString() })
      else if (result.started) updateProblems.delete(dir)
      running = null
      const counts = result.record?.counts ?? null
      progress({ ...base, phase: 'done', counts, calls: result.record?.calls ?? 0, done: true, result, ...(result.started ? {} : { problems: result.problems ?? [] }) })
      emit('inbox-changed', { libraryId, count: inboxCount(dir) })
      try { onRoundDone({ roundId, libraryId, result: { ...result, counts: counts ? { inbox: counts.inbox } : null } }) } catch (err) { log(`pipeline: after update ${roundId}: ${String(err?.stack ?? err)}`) }
    })()
    return { started: true, roundId }
  }

  const handlers = {
    getHome() {
      const dir = library.require()
      const index = indexOf(dir)
      const numbers = homeNumbers(dir, { now })
      const kept = index.filter(e => e.status === 'kept').sort((a, b) => String(b.kept ?? '').localeCompare(String(a.kept ?? '')) || String(b.date ?? '').localeCompare(String(a.date ?? '')))
      const a = connections.active()
      const p = problemsOf.get(dir)?.[0] ?? null
      return {
        library: { ...library.current(), count: index.length },
        numbers,
        // plan C8: the page shows 「连续 N 轮没有产出」 from this many (numbers.noOutputStreak); the number is the core's
        noOutputRounds: NO_OUTPUT_ROUNDS,
        // redesign R5a (O9): the run record's problems without their details; 1.1 W7b: 待看 and 进度 say of the last run when it
        // ended and how many it put into 待看 — this record's, nothing worked out on the page
        lastRound: publicResult(listRounds(dir, 1)[0] ?? null, { raw: rawErrors, where: 'last run' }),
        roundState: roundState(),
        recentKept: kept.slice(0, 5).map(e => ({ id: e.id, title: e.title, source: e.source ?? null, source_name: e.source_name ?? null, date: e.date, kept: e.kept ?? null })),
        connection: connectionView(),
        nextRun: schedule()?.nextRunAt ?? null,
        problem: p ? { code: p.code, connectionCode: p.connectionCode ?? null, kind: a?.kind ?? null, at: failedAt?.dir === dir ? failedAt.at : null } : null,
      }
    },
    async startRound() {
      const dir = library.require()
      if (!roundGate) return startRoundIn({ id: library.current()?.libraryId ?? null, path: dir })
      // v2 package L: the queue's answer as it is — started, or queued at the end, or already running / waiting
      return roundGate()
    },
    cancelRound() {
      library.require()
      if (!running) return { cancelled: false }
      running.controller.abort()
      log(`pipeline: round ${running.roundId} cancel asked`)
      return { cancelled: true }
    },
    getRoundState() {
      library.require()
      return roundState()
    },
    /**
     * Redesign R2: { items, later, held, recentDismissReasons, updateProblem } — `items` the cards to decide (not put aside,
     * not held), `later` the ones put aside, `held` the 放弃 waiting for its bar ({ url, title } or null).
     */
    getInbox() {
      const dir = library.require()
      if (held && held.dir !== dir) settlePending('another library is open')
      const all = listInbox(dir, { now })
      const h = held && held.dir === dir ? held : null
      return {
        items: all.filter(i => !i.later && i.url !== h?.url),
        later: all.filter(i => i.later && i.url !== h?.url),
        held: h ? { url: h.url, title: h.title } : null,
        recentDismissReasons: recentDismissReasons(dir),
        // 1.1 W6a (B12): the last update of this library did not start because the connection's login ran out
        updateProblem: updateProblems.get(dir) ?? null,
      }
    },
    keepItem(url) {
      const dir = library.require()
      if (!inboxUrls(dir).has(url)) throw new BridgeError('bad_arguments', 'not in the inbox')
      settleBefore(dir, url, 'the next decision')
      if (held?.url === url) held = null
      const r = keep(dir, url, { now })
      emit('inbox-changed', { libraryId: library.current()?.libraryId ?? null, count: inboxCount(dir) })
      emit('library-changed', library.current())
      return { id: r.id, file: r.file }
    },
    /** Redesign R2 (N03): 放弃 — the card off the list now, held until its bar closes (one at a time: the one before is written). */
    dismissItem(url) {
      const dir = library.require()
      if (!inboxUrls(dir).has(url)) throw new BridgeError('bad_arguments', 'not in the inbox')
      if (held?.dir === dir && held.url === url) return { url, held: true }
      settleBefore(dir, url, 'the next decision')
      const item = listInbox(dir, { now }).find(i => i.url === url)
      held = { dir, libraryId: library.current()?.libraryId ?? null, url, title: item?.title ?? '' }
      log(`pipeline: dismissal of ${url} held until its bar closes`)
      emit('inbox-changed', { libraryId: held.libraryId, count: inboxCount(dir) })
      return { url, held: true }
    },
    /** The bar closed: the held 放弃 into the ledger, with the reason chosen (words, a quick id) or none. */
    settleDismiss(reason, quick) {
      library.require()
      const r = settlePending('the bar closed', { reason, quick })
      return r ? { settled: true, url: r.url } : { settled: false }
    },
    /** 撤销: the held 放弃 dropped — nothing is written, the card is back where it was. */
    undoDismiss() {
      library.require()
      const h = held
      if (!h) return { undone: false }
      held = null
      log(`pipeline: dismissal of ${h.url} undone, nothing written`)
      emit('inbox-changed', { libraryId: h.libraryId, count: inboxCount(h.dir) })
      return { undone: true, url: h.url }
    },
    laterItem(url) {
      const dir = library.require()
      settleBefore(dir, url, 'the next decision')
      if (held?.url === url) held = null
      const r = later(dir, url, { now })
      if (r.stage === 'inbox') emit('inbox-changed', { libraryId: library.current()?.libraryId ?? null, count: inboxCount(dir) })
      return { url: r.url }
    },
    async openItemUrl(url) {
      const dir = library.require()
      const known = inboxUrls(dir).has(url) || indexOf(dir).some(e => e.source === url)
      if (!known || !HTTP_URL.test(url)) throw new BridgeError('bad_arguments', 'not an item of the library')
      if (hidden) { log(`not opened in a test run: ${url}`); return null }
      await shell.openExternal(url)
      return null
    },
  }

  /**
   * v2 package L (getQueue's `running`): the run going — { roundId, libraryId, phase, calls, cap, startedAt } (phase and calls
   * from its last round-progress), or null.
   */
  const current = () => {
    const r = running
    if (!r) return null
    const p = lastProgress && lastProgress.roundId === r.roundId ? lastProgress : null
    return { roundId: r.roundId, libraryId: r.libraryId ?? null, phase: p?.phase ?? 'update', calls: p?.calls ?? 0, cap: r.cap ?? p?.cap ?? null, startedAt: r.startedAt }
  }

  return {
    handlers, roundState, startRoundIn, current, isRunning: () => Boolean(running), runningLibrary: () => running?.libraryId ?? null,
    // redesign R2: the held 放弃 written now (main.mjs: before-quit, another library opened); what it is, for 「n 条待看」
    settlePending, held: () => (held ? { dir: held.dir, url: held.url } : null),
  }
}
