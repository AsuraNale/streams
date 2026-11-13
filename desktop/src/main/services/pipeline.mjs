/**
 * The pipeline on the open library (plan C5–C7; docs/desktop.md §四 「今日」「待看」「一轮」, §4.1): the numbers of
 * 「今日」, the estimate, one round at a time in the background (the core's runRound; progress as `round-progress`
 * events, the end as `round-progress { done: true }` and `inbox-changed`), its cancel, the inbox and the three
 * decisions, the starter pack of the first run. Every call checks its arguments against what the library holds: a url
 * must be one the inbox or the index knows before it is kept, dismissed or opened.
 *
 * With no connection chosen (the first run's connection step skipped: plan S1 「没有连接也能抓，只是不打分，全部进待看」) a
 * round still runs, scoreless (core runRound `scoreless: true`): everything fetched goes to the inbox, no model call.
 *
 * v2 package A (docs/desktop.md §4.4): a round runs on one library — the current one for the page's startRound, any
 * registered one for the schedule (`startRoundIn`, not on the bridge). One round at a time for the whole app: with a
 * `roundGate` (services/schedule.mjs: the queue) the page's startRound goes through it. v2 package L: a busy queue no longer
 * answers 「a round is running」 (bad_arguments): the gate's answer comes back as it is — the library queued at the end
 * ({ started: false, queued: true, position, runningLibraryId }) or already running / waiting ({ started: false, already }).
 * Every event of a round, and every `inbox-changed`, carries its `libraryId`.
 *
 * Interface B (plan S4; docs/desktop.md §4.2): the pipeline's nodes as the core configures them with the last round and
 * the recent reasons beside them, the save (the core's locked-node / bad-config → bad_arguments; `library-changed`), one
 * node tried on one item of the ledger (no connection → `no_connection`; its calls count in the usage as `preview:<node>`).
 *
 * v2 package B: the cap (setRoundCap), the gates' thresholds and the cap of a saved configuration (savePipeline) and the
 * sources and topics of a starter pack (applyStarterPack) are the user's own: one line by 'you' in the library's
 * changes.jsonl for each of those fields that changed (services/changes.mjs byYou).
 *
 * Redesign R2 (docs/checks/2026-11-11-r2/contract.md; docs/desktop.md §4.14): 待看 and the run.
 *   - 放弃 is held, not written (N03): `dismissItem(url)` takes the card off the list at once and keeps it here; the ledger gets
 *     its `dismissed` event only when the bar under the list closes — `settleDismiss(reason, quick)` (a reason chosen, the bar
 *     closed), the next decision on another item (keep · dismiss · later · 移入待看), the library left (another library current),
 *     and the app quitting (`settlePending('quit')`, main.mjs before-quit). `undoDismiss()` drops it: nothing is written. One at
 *     a time: a second 放弃 writes the first one. kept / dismissed stay terminal (the core's ledger).
 *   - 稍后处理 (F27): the core's later (_pipeline/later.json); a run of THIS library that ended (started) gives them back
 *     (releaseLater) — another library's run does not.
 *   - getInbox gives the cards (not the held one, not the later ones), the later ones, 未通过筛选 (the core's listRejected, at most
 *     50, newest first), 待评分 (listManualWaiting), the held one; moveToInbox (N02) is the core's — the note folder untouched.
 *   - getHome gives the last run as a funnel (core runFunnel; a self-check that failed: failedStart, kept in memory only — the
 *     core writes nothing then), what became of its items (roundOutcome), the five most recently kept.
 *   - the first self-check's probe answers the run's own (withFirstProbe) with its real calls, so the run record's 运行前自检 is
 *     the probe the usage file has.
 * Redesign R5a (docs/desktop.md §4.19; docs/core-api.md 4.6):
 *   - 重新评分 (N07): the 评分标准 changed → the items already judged stay where they are (core queue.mjs: the next run does not
 *     score them again). getInbox's `rejected` items carry `old`, and `rescore` says how many are old, since when the standard
 *     changed and the estimate; `getRescore(libraryId)` the same for any library; `startRescore(libraryId)` puts 重新评分 of that
 *     library into the app's one queue (`rescoreGate`: services/schedule.mjs startRescore — one at a time with the runs) and
 *     `startRescoreIn` runs it in the background (core rescoreRejected: under the 单次运行上限; what passes goes into 待看; never
 *     the note folder), with `round-progress { rescore: true }` events and, at the end, `inbox-changed` and onRoundDone.
 *   - a 放弃 written (settlePending) is told to `afterDismiss` (services/agent.mjs: 系统检测 rule ⑤ is checked right then).
 *   - O9: round-progress's and getRoundState's problems carry the code (and the connection's code), not the detail; the
 *     starter pack's tries the state and the hint, not the fetcher's message — the raw texts go to raw-errors.mjs.
 * Pure Node apart from what is injected (`shell`), so the rules run in plain Node (test/services-pipeline.test.mjs).
 * @module desktop/main/services/pipeline
 */

import { randomBytes } from 'node:crypto'
import { BridgeError, bridgeErrorOf } from '../bridge-methods.mjs'
import {
  STARTER_PACK_IDS, applyStarterPackToLibrary, createUsageCounter, dismiss, estimateRound, fetchSource, gateNodes,
  homeNumbers, keep, later, listInbox, listRounds, listStarterPacks, makeContext, pipelineConfig, previewNode, readIndex, recentDismissReasons,
  recentVerdictFailures, replayLedger, runRound, savePipelineConfig, selfCheck, DEFAULT_PIPELINE, NO_OUTPUT_ROUNDS, pipelineFrom,
  DISMISS_QUICK, buildQueue, failedStart, listManualWaiting, listRejected, moveToInbox, releaseLater, roundOutcome, runFunnel,
  rescoreInfo, rescoreRejected,
} from '../core.mjs'
import { byYou } from './changes.mjs'
import { publicProblems, publicResult, publicTrial } from '../public-data.mjs'

const HTTP_URL = /^https?:\/\/\S+$/i

/** A connector whose first probe answers with `result` (the self-check already ran it); every later probe is the real one. */
export function withFirstProbe(connector, result) {
  let used = false
  return {
    ...connector,
    async probe() {
      if (used) return connector.probe()
      used = true
      return result
    },
  }
}

/**
 * @param {object} o
 * @param {{dir: () => string|null, require: () => string, current: () => {path: string, name: string}|null}} o.library - services/library.mjs
 * @param {{active: () => object|null, probeConnector: Function}} o.connections - services/connections.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: nothing is opened outside the app
 * @param {{openExternal: (url: string) => Promise<void>}} o.shell
 * @param {() => {resolved: string}} o.locale - the language the starter packs are named in
 * @param {() => Date} [o.now]
 * @param {object} [o.fetchContext] - overrides for the core's fetch context (tests: fetchImpl, timeoutMs)
 * @param {() => {enabled: boolean, time: string, nextRunAt: string|null}|null} [o.schedule] - the schedule as getSchedule gives it
 *   (services/schedule.mjs): getHome's nextRun, getPipelineSettings' schedule; none given: null
 * @param {(done: {roundId: string, libraryId: string|null, result: object|null}) => void} [o.onRoundDone] - after every round
 *   that ran in the background, once it ended (services/schedule.mjs: the notification, the next one in the queue)
 * @param {(() => Promise<object>)|null} [o.roundGate] - the page's startRound goes through this when given
 *   (services/schedule.mjs startCurrent: v2 package L — queued at the end while the queue is busy)
 * @param {(r: {dir: string, libraryId: string|null, roundId: string}) => void} [o.afterRound] - after every round that ran in
 *   the background, before inbox-changed (v2 package C: services/agent.mjs records the library's rule-based suggestion cards)
 * @param {(r: {dir: string, libraryId: string|null}) => void} [o.afterDismiss] - redesign R5a: right after a 放弃 is written
 * @param {((entry: {id: string, path: string}) => Promise<object>)|null} [o.rescoreGate] - redesign R5a: startRescore goes through
 *   this when given (services/schedule.mjs startRescore: the queue)
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs
 */
export function createPipelineService({ library, connections, emit, log, hidden = false, shell, locale, now = () => new Date(), fetchContext = {}, schedule = () => null, onRoundDone = () => {}, roundGate = null, afterRound = () => {}, afterDismiss = () => {}, rescoreGate = null, rawErrors = null }) {
  // the round in the background, if one runs; what the last one gave; the problems the last self-check found
  let running = null
  let last = null
  let lastProblems = null
  let lastProgress = null
  // v2 package L: a round being started (its self-check), before it runs in the background
  let starting = null
  // redesign R2: the 放弃 held until the bar closes — { dir, libraryId, url, title } — and the last self-check that failed
  // ({ libraryId, dir, at, problems }: the funnel's 「停 · 自检未通过」; memory only, the core writes nothing then)
  let held = null
  let failedAt = null

  // 「n 条待看」: the cards the page lists — not the ones put aside (稍后处理), not the one held by 放弃
  const inboxCount = dir => {
    try { return listInbox(dir).filter(c => !c.later && !(held && held.dir === dir && held.url === c.url)).length } catch { return 0 }
  }
  const indexOf = dir => { try { return readIndex(dir) } catch (err) { log(`pipeline: index unreadable: ${String(err?.message ?? err)}`); return [] } }
  const inboxUrls = dir => new Set(listInbox(dir, { now }).map(i => i.url))

  const roundState = () => ({
    running: Boolean(running),
    roundId: running?.roundId ?? last?.roundId ?? null,
    // the library of that round (v2: the one round of the app may be another library's than the current one)
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
    const where = `${payload.rescore ? 'rescore' : 'run'} ${payload.roundId ?? ''} of ${payload.libraryId ?? '?'}`
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
    // redesign R5a (N04): 系统检测 rule ⑤ is checked as soon as the 放弃 is in the ledger, not at the end of a run
    try { afterDismiss({ dir: h.dir, libraryId: h.libraryId }) } catch (err) { log(`pipeline: after the dismissal of ${h.url}, the suggestion check failed: ${String(err?.stack ?? err)}`) }
    return { url: h.url }
  }
  /** A decision on the library `dir` (keep · dismiss · later · 移入待看), or another library opened: the held one goes in first. */
  const settleBefore = (dir, url, why) => { if (held && (held.dir !== dir || held.url !== url)) settlePending(why) }

  /** The round in the background: the core's runRound, then the two events. `cap` and the connector were fixed at start. */
  const runInBackground = async ({ dir, libraryId, roundId, connector, cap, controller, scoreless = false }) => {
    const base = { roundId, libraryId, cap }
    try {
      progress({ ...base, phase: 'fetch', counts: null, calls: 0, done: false })
      const result = await runRound(dir, {
        connector, ...(scoreless ? { scoreless: true } : {}), cap, ctx: makeContext({ ...fetchContext, now }), signal: controller.signal,
        // a scoreless round's cards go to the inbox straight after the fetch (core stage 'inbox'): still phase 'fetch'
        onProgress: p => progress({ ...base, phase: p.stage === 'gate' ? `gate:${p.node}` : p.stage === 'inbox' ? 'fetch' : 'summary', counts: p.counts, calls: p.calls, done: false }),
      })
      last = { roundId, libraryId, result }
      if (!result.started) lastProblems = result.problems
      // redesign R2 (F27): a run of this library that ended gives 稍后处理 back to 待看 (another library's run does not)
      if (result.started) {
        try { const r = releaseLater(dir); if (r.released) log(`pipeline: round ${roundId}: ${r.released} item(s) back from later`) } catch (err) { log(`pipeline: round ${roundId}: the later items not given back: ${String(err?.message ?? err)}`) }
      }
      log(`pipeline: round ${roundId} ${result.started ? `done: calls ${result.calls}${result.scoreless ? ' (scoreless)' : ''}${result.stoppedAt ? ` stopped at ${result.stoppedAt}` : ''}` : 'did not start'} (core ${result.round?.id ?? '-'})`)
      running = null
      progress({ ...base, phase: 'done', counts: result.counts ?? null, calls: result.calls ?? 0, done: true, result, ...(result.started ? {} : { problems: result.problems }) })
    } catch (err) {
      const problems = [{ code: 'internal', detail: String(err?.message ?? err).slice(0, 300) }]
      log(`pipeline: round ${roundId} failed: ${String(err?.stack ?? err)}`)
      last = { roundId, libraryId, result: { ok: false, started: true, problems } }
      lastProblems = problems
      running = null
      progress({ ...base, phase: 'done', counts: null, calls: 0, done: true, result: null, problems })
    }
    // the rule-based suggestion check of architecture 2.4 (「规则型建议检查」), whatever the round came to
    try { afterRound({ dir, libraryId, roundId }) } catch (err) { log(`pipeline: after round ${roundId}, the suggestion check failed: ${String(err?.stack ?? err)}`) }
    emit('inbox-changed', { libraryId, count: inboxCount(dir) })
    try { onRoundDone({ roundId, libraryId, result: last?.roundId === roundId ? last.result : null }) } catch (err) { log(`pipeline: after round ${roundId}: ${String(err?.stack ?? err)}`) }
  }

  /**
   * One round on the library `{ id, path }` (the current one, or the schedule's): the self-check now (a failure comes back
   * in the answer, S13), the rest in the background. A round already running: bad_arguments (v1.0's rule).
   */
  async function startRoundIn({ id: libraryId = null, path: dir }) {
    if (running) throw new BridgeError('bad_arguments', 'a round is running')
    const a = connections.active()
    const roundId = `d-${now().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${randomBytes(3).toString('hex')}`
    const cap = pipelineConfig(dir).cap
    // step 0 here, so a failure comes back in the answer (S13); the probe counts in the library's usage. No connection
    // chosen: a scoreless round (no probe, no model call; everything fetched goes to the inbox)
    const scoreless = !a
    const probed = a ? createUsageCounter(dir, { now }).wrap(a.connector, 'probe') : null
    progress({ roundId, libraryId, cap, phase: 'self-check', counts: null, calls: 0, done: false })
    starting = { roundId, libraryId, cap, startedAt: now().toISOString() }
    let check
    try { check = await selfCheck(dir, scoreless ? { connector: null, scoreless: true } : { connector: probed }) } finally { starting = null }
    if (!check.ok) {
      lastProblems = check.problems
      failedAt = { libraryId, dir, at: now().toISOString(), problems: check.problems }
      log(`pipeline: self-check failed${libraryId ? ` (${libraryId})` : ''}: ${JSON.stringify(check.problems)}`)
      progress({ roundId, libraryId, cap, phase: 'done', counts: null, calls: 0, done: true, result: null, problems: check.problems })
      // redesign R5a (O9): startRound's own answer (and the queue's: schedule.mjs startCurrent / pump pass it on) carries the
      // problems' codes, not their details — the details went to the log and the diagnostics with the progress event above
      return { started: false, problems: publicProblems(check.problems, { raw: rawErrors, where: `self-check ${roundId} of ${libraryId ?? '?'}` }) }
    }
    lastProblems = null
    if (failedAt?.dir === dir) failedAt = null
    const controller = new AbortController()
    running = { roundId, libraryId, controller, cap, startedAt: now().toISOString() }
    // runRound runs the self-check again: its probe is the one just made, not a second call. Redesign R2: it answers with that
    // probe's calls, so the run record's 运行前自检 is the call the usage file has (the probe through `probed` above)
    const connector = scoreless ? null : withFirstProbe(a.connector, { ok: true, latencyMs: check.probe?.latencyMs ?? 0, model: check.probe?.model, usage: { calls: check.probe?.calls ?? 1 } })
    void runInBackground({ dir, libraryId, roundId, connector, cap, controller, scoreless })
    return { started: true, roundId }
  }

  /** Redesign R5a (N07): what getInbox / getRescore say of 重新评分 (core rescoreInfo). */
  function rescoreView(dir, { items = false } = {}) {
    try {
      const r = rescoreInfo(dir)
      return { total: r.total, changedAt: r.changedAt, changedField: r.changedField ?? null, expectedCalls: r.expectedCalls, cap: r.cap, ...(items ? { items: r.items } : {}) }
    } catch (err) {
      log(`pipeline: the old verdicts not read: ${String(err?.message ?? err)}`)
      return { total: 0, changedAt: null, changedField: null, expectedCalls: [0, 0], cap: null, ...(items ? { items: [] } : {}) }
    }
  }

  /**
   * Redesign R5a (N07): 重新评分 of the library `{ id, path }` in the background (core rescoreRejected): its calls in the
   * library's usage file, under the 单次运行上限; one at a time with the runs (`running`). → { started: true, roundId } or, with
   * a run going, bad_arguments (the queue — services/schedule.mjs — never starts one then).
   */
  async function startRescoreIn({ id: libraryId = null, path: dir }) {
    if (running) throw new BridgeError('bad_arguments', 'a round is running')
    const a = connections.active()
    if (!a) throw new BridgeError('no_connection')
    const roundId = `rs-${now().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${randomBytes(3).toString('hex')}`
    const cap = pipelineConfig(dir).cap
    const controller = new AbortController()
    running = { roundId, libraryId, controller, cap, startedAt: now().toISOString(), rescore: true }
    const base = { roundId, libraryId, cap, rescore: true }
    progress({ ...base, phase: 'self-check', counts: null, calls: 0, done: false })
    void (async () => {
      let result = null
      try {
        const counter = createUsageCounter(dir, { now })
        result = await rescoreRejected(dir, {
          connector: { ...a.connector, probe: counter.wrap(a.connector, 'probe').probe }, cap, ctx: makeContext({ ...fetchContext, now }), signal: controller.signal,
          onProgress: p => progress({ ...base, phase: `rescore:${p.node}`, counts: p.counts, calls: p.calls, done: false }),
        })
        log(`pipeline: rescore ${roundId} of ${libraryId ?? dir}: ${result.started ? `${result.counts.rescored} of ${result.targets} scored again, ${result.counts.inbox} into the inbox, calls ${result.calls}${result.stoppedAt ? `, stopped at ${result.stoppedAt}` : ''}, ${result.remaining} left` : 'did not start'}`)
      } catch (err) {
        log(`pipeline: rescore ${roundId} failed: ${String(err?.stack ?? err)}`)
        result = { ok: false, started: false, rescore: true, problems: [{ code: 'internal', detail: String(err?.message ?? err).slice(0, 300) }] }
      }
      running = null
      progress({ ...base, phase: 'done', counts: result?.counts ?? null, calls: result?.calls ?? 0, done: true, result, ...(result?.started ? {} : { problems: result?.problems ?? [] }) })
      emit('inbox-changed', { libraryId, count: inboxCount(dir) })
      try { onRoundDone({ roundId, libraryId, result: publicResult(result) }) } catch (err) { log(`pipeline: after rescore ${roundId}: ${String(err?.stack ?? err)}`) }
    })()
    return { started: true, roundId, rescore: true }
  }

  const handlers = {
    /** Redesign R5a (N07): the old verdicts of any library — { total, items, changedAt, expectedCalls, cap }. */
    getRescore(libraryId) {
      const e = library.entryOf(libraryId)
      if (!library.usable(e.path)) throw new BridgeError('open_failed', `${e.path} is not a readable library`)
      return rescoreView(e.path, { items: true })
    },
    /** Redesign R5a (N07): 重新评分 of any library, through the queue (started now, or queued at the end). */
    async startRescore(libraryId) {
      const e = library.entryOf(libraryId)
      if (!library.usable(e.path)) throw new BridgeError('open_failed', `${e.path} is not a readable library`)
      if (!connections.active()) throw new BridgeError('no_connection')
      if (rescoreView(e.path).total === 0) return { started: false, nothing: true }
      if (rescoreGate) return rescoreGate({ id: e.id, path: e.path })
      return startRescoreIn({ id: e.id, path: e.path })
    },
    getHome() {
      const dir = library.require()
      const index = indexOf(dir)
      const numbers = homeNumbers(dir, { now })
      const kept = index.filter(e => e.status === 'kept').sort((a, b) => String(b.kept ?? '').localeCompare(String(a.kept ?? '')) || String(b.date ?? '').localeCompare(String(a.date ?? '')))
      const a = connections.active()
      const p = lastProblems?.[0] ?? null
      return {
        library: { ...library.current(), count: index.length },
        numbers,
        // plan C8: the page shows 「连续 N 轮没有产出」 from this many (numbers.noOutputStreak); the threshold is the core's
        noOutputRounds: NO_OUTPUT_ROUNDS,
        // redesign R5a (O9): the run record's problems without their details
        lastRound: publicResult(listRounds(dir, 1)[0] ?? null, { raw: rawErrors, where: 'last run' }),
        // redesign R2 (N10): the last run as one funnel, and what became of its items
        lastRun: lastRunOf(dir),
        // redesign R2 (P08): the items fetched and not scored yet (waiting at a step of the pipeline) — 「有 n 条内容已抓取、尚未评分」
        toScore: toScoreOf(dir),
        roundState: roundState(),
        recentKept: kept.slice(0, 5).map(e => ({ id: e.id, title: e.title, source: e.source ?? null, source_name: e.source_name ?? null, date: e.date, kept: e.kept ?? null })),
        connection: connectionView(),
        nextRun: schedule()?.nextRunAt ?? null,
        problem: p ? { code: p.code, connectionCode: p.connectionCode ?? null, kind: a?.kind ?? null, caughtKept: numbers.caught, at: failedAt?.at ?? null } : null,
      }
    },
    estimateRound() {
      const dir = library.require()
      const a = connections.active()
      return { ...estimateRound(dir), connection: a ? { kind: a.kind, model: a.model, verifyModel: a.verifyModel } : null }
    },
    setRoundCap(cap) {
      const dir = library.require()
      const cfg = pipelineConfig(dir)
      const saved = byYou(dir, ['cap'], () => savePipelineConfig(dir, { ...cfg, cap }), { log, now })
      return { cap: saved.cap }
    },
    async startRound() {
      const dir = library.require()
      if (!roundGate) return startRoundIn({ id: library.current()?.libraryId ?? null, path: dir })
      // v2 package L: the queue's answer as it is — started, or queued at the end, or already running / waiting (no longer
      // v1.0's 「a round is running」 for a busy queue)
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
     * Redesign R2: { items, later, rejected: { total, items }, manual, held, recentDismissReasons } — `items` the cards to
     * decide (not put aside, not held), `later` the ones put aside, `rejected` 未通过筛选 (at most 50, newest first), `manual`
     * the links added by hand still 待评分, `held` the 放弃 waiting for its bar ({ url, title } or null).
     */
    getInbox() {
      const dir = library.require()
      if (held && held.dir !== dir) settlePending('another library is open')
      const all = listInbox(dir, { now })
      const h = held && held.dir === dir ? held : null
      return {
        items: all.filter(i => !i.later && i.url !== h?.url),
        later: all.filter(i => i.later && i.url !== h?.url),
        rejected: listRejected(dir, { limit: 50 }),
        // redesign R5a (N07): the ones judged under the old standard — how many, since when, the estimate of 重新评分
        rescore: rescoreView(dir),
        manual: listManualWaiting(dir),
        held: h ? { url: h.url, title: h.title } : null,
        recentDismissReasons: recentDismissReasons(dir),
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
    /** Redesign R2 (N02): 移入待看 — an item below a gate into 待看 as it is (the core's moveToInbox: never the note folder). */
    moveToInbox(url) {
      const dir = library.require()
      settleBefore(dir, url, 'the next decision')
      try { moveToInbox(dir, url, { now }) } catch (err) {
        if (err?.code === 'not-rejected') throw new BridgeError('bad_arguments', 'not an item that did not pass')
        throw err
      }
      log(`pipeline: ${url} moved into the inbox from the filtered-out list`)
      emit('inbox-changed', { libraryId: library.current()?.libraryId ?? null, count: inboxCount(dir) })
      return { url }
    },
    async openItemUrl(url) {
      const dir = library.require()
      const known = inboxUrls(dir).has(url) || indexOf(dir).some(e => e.source === url)
      if (!known || !HTTP_URL.test(url)) throw new BridgeError('bad_arguments', 'not an item of the library')
      if (hidden) { log(`not opened in a test run: ${url}`); return null }
      await shell.openExternal(url)
      return null
    },
    getPipelineSettings() {
      const dir = library.require()
      const cfg = pipelineConfig(dir)
      const gates = gateNodes(cfg)
      const threshold = (id, i) => (gates.find(g => g.id === id) ?? gates[i])?.threshold ?? null
      return { cap: cfg.cap, thresholds: { relevance: threshold('relevance', 0), substance: threshold('substance', 1) }, schedule: schedule() }
    },
    async applyStarterPack(packId, edits) {
      const dir = library.require()
      if (!STARTER_PACK_IDS.includes(packId)) throw new BridgeError('bad_arguments')
      let config
      try {
        config = byYou(dir, ['sources', 'topics'], () => applyStarterPackToLibrary(dir, packId, edits), { log, now }).config
      } catch (err) {
        if (['bad-edits', 'bad-url', 'duplicate-source', 'unknown-pack'].includes(err?.code)) throw new BridgeError('bad_arguments', err.message)
        throw err
      }
      // one try of every source, nothing written: the same context for all so arXiv's spacing holds
      const ctx = makeContext({ ...fetchContext, now })
      const sources = []
      for (const s of config.sources) {
        const r = await fetchSource(s, ctx)
        // redesign R5a (O9): the state and the hint, not the fetcher's message
        sources.push(publicTrial({ name: s.name, kind: s.kind, url: s.url ?? null, status: r.status, hint: r.hint, count: r.items.length, message: r.message, http: r.http }, { raw: rawErrors, where: `starter pack ${packId} ${s.name}` }))
      }
      log(`pipeline: starter pack ${packId}: ${sources.map(s => `${s.name} ${s.status}`).join(', ') || 'no sources'}`)
      return { topics: config.topics.map(t => t.name), sources }
    },
    getStarterPacks() {
      return listStarterPacks(locale().resolved)
    },
    // interface B: S4
    getPipeline() {
      const dir = library.require()
      const config = pipelineConfig(dir)
      const checked = config.nodes.filter(n => n.kind === 'gate' || n.kind === 'summary')
      return {
        config,
        // 「恢复默认」: the default pipeline in the library's language, resolved the same way (locked checklists included)
        defaults: pipelineFrom({ pipeline: DEFAULT_PIPELINE(config.language) }),
        lastRound: publicResult(listRounds(dir, 1)[0] ?? null, { raw: rawErrors, where: 'last run' }),
        dismissReasons: recentDismissReasons(dir, 10),
        verdictFailures: Object.fromEntries(checked.map(n => [n.id, recentVerdictFailures(dir, n.id, 5)])),
      }
    },
    savePipeline(cfg) {
      const dir = library.require()
      try { byYou(dir, ['thresholds', 'cap', 'prompts'], () => savePipelineConfig(dir, cfg), { log, now }) } catch (err) { throw bridgeErrorOf(err) }
      log('pipeline: configuration saved')
      emit('library-changed', library.current())
      return { config: pipelineConfig(dir) }
    },
    /** `draft`: the node as edited on the page and not saved yet, or null for the saved one (product spec C3). */
    async previewNode(nodeId, url, draft) {
      const dir = library.require()
      const node = pipelineConfig(dir).nodes.find(n => n.id === nodeId)
      if (!node || (node.kind !== 'gate' && node.kind !== 'summary')) throw new BridgeError('bad_arguments', `no gate or summary ${nodeId}`)
      if (!replayLedger(dir).states.has(url)) throw new BridgeError('bad_arguments', 'not in the ledger')
      const a = connections.active()
      if (!a) throw new BridgeError('no_connection')
      const connector = createUsageCounter(dir, { now }).wrap(a.connector, `preview:${nodeId}`)
      const r = await previewNode(dir, { connector, nodeId, url, draft: draft ?? undefined, ctx: { ...fetchContext, now } })
      // a draft the core refuses (a locked field changed, a threshold out of range) is the page's to fix
      if (r.ok === false && draft && ['bad-node', 'bad-config', 'locked-node'].includes(r.code)) throw new BridgeError('bad_arguments', `previewNode draft: ${r.code}`)
      // the node and the url were checked above: a refusal of the core here would be a defect, not the page's
      if (r.ok === false && ['bad-node', 'unknown-url', 'bad-argument'].includes(r.code)) throw new BridgeError('internal', `previewNode: ${r.code}`)
      log(`pipeline: preview ${nodeId}: ${r.ok ? `${r.status} · calls ${r.calls}` : `connection ${r.code}`}`)
      return r
    },
  }

  /**
   * v2 package L (getQueue's `running`): the round being started or running — { roundId, libraryId, phase, calls, cap,
   * startedAt } (phase and calls from its last round-progress), or null.
   */
  const current = () => {
    const r = running ?? starting
    if (!r) return null
    const p = lastProgress && lastProgress.roundId === r.roundId ? lastProgress : null
    return { roundId: r.roundId, libraryId: r.libraryId ?? null, phase: running ? (p?.phase ?? 'fetch') : 'self-check', calls: p?.calls ?? 0, cap: r.cap ?? p?.cap ?? null, startedAt: r.startedAt }
  }

  /** Redesign R2: how many items wait at a step of the pipeline (the core's queue, rebuilt from the ledger). */
  function toScoreOf(dir) {
    try { const q = buildQueue(dir, pipelineConfig(dir)); return Object.values(q.byNode).reduce((n, l) => n + l.length, 0) + q.summary.length } catch { return 0 }
  }

  /** Redesign R2: getHome's lastRun — the funnel of the newest run record (or of a failed self-check newer than it), its outcome. */
  function lastRunOf(dir) {
    const rec = listRounds(dir, 1)[0] ?? null
    const failed = failedAt && failedAt.dir === dir && (!rec || String(failedAt.at) > String(rec.startedAt ?? '')) ? failedAt : null
    if (failed) {
      const gates = gateNodes(pipelineConfig(dir)).map(g => g.id)
      return { funnel: failedStart({ at: failed.at, problems: failed.problems, gates }), outcome: null }
    }
    if (!rec) return null
    return { funnel: runFunnel(rec), outcome: roundOutcome(dir, rec.id) }
  }

  return {
    handlers, roundState, startRoundIn, startRescoreIn, current, isRunning: () => Boolean(running), runningLibrary: () => running?.libraryId ?? starting?.libraryId ?? null,
    // redesign R2: the held 放弃 written now (main.mjs: before-quit, another library opened); what it is, for 「n 条待看」
    settlePending, held: () => (held ? { dir: held.dir, url: held.url } : null),
  }
}
