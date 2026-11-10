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
 * Pure Node apart from what is injected (`shell`), so the rules run in plain Node (test/services-pipeline.test.mjs).
 * @module desktop/main/services/pipeline
 */

import { randomBytes } from 'node:crypto'
import { BridgeError, bridgeErrorOf } from '../bridge-methods.mjs'
import {
  STARTER_PACK_IDS, applyStarterPackToLibrary, createUsageCounter, dismiss, estimateRound, fetchSource, gateNodes,
  homeNumbers, keep, later, listInbox, listRounds, listStarterPacks, makeContext, pipelineConfig, previewNode, readIndex, recentDismissReasons,
  recentVerdictFailures, replayLedger, runRound, savePipelineConfig, selfCheck, DEFAULT_PIPELINE, NO_OUTPUT_ROUNDS, pipelineFrom,
} from '../core.mjs'
import { byYou } from './changes.mjs'

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
 */
export function createPipelineService({ library, connections, emit, log, hidden = false, shell, locale, now = () => new Date(), fetchContext = {}, schedule = () => null, onRoundDone = () => {}, roundGate = null, afterRound = () => {} }) {
  // the round in the background, if one runs; what the last one gave; the problems the last self-check found
  let running = null
  let last = null
  let lastProblems = null
  let lastProgress = null
  // v2 package L: a round being started (its self-check), before it runs in the background
  let starting = null

  const inboxCount = dir => { try { return listInbox(dir).length } catch { return 0 } }
  const indexOf = dir => { try { return readIndex(dir) } catch (err) { log(`pipeline: index unreadable: ${String(err?.message ?? err)}`); return [] } }
  const inboxUrls = dir => new Set(listInbox(dir, { now }).map(i => i.url))

  const roundState = () => ({
    running: Boolean(running),
    roundId: running?.roundId ?? last?.roundId ?? null,
    // the library of that round (v2: the one round of the app may be another library's than the current one)
    libraryId: running?.libraryId ?? last?.libraryId ?? null,
    progress: lastProgress,
    last: last?.result ?? null,
    lastProblems,
  })

  const connectionView = () => {
    const a = connections.active()
    return a ? { kind: a.kind, model: a.model } : null
  }

  const progress = (payload) => {
    lastProgress = payload
    emit('round-progress', payload)
  }

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
      log(`pipeline: self-check failed${libraryId ? ` (${libraryId})` : ''}: ${JSON.stringify(check.problems)}`)
      progress({ roundId, libraryId, cap, phase: 'done', counts: null, calls: 0, done: true, result: null, problems: check.problems })
      return { started: false, problems: check.problems }
    }
    lastProblems = null
    const controller = new AbortController()
    running = { roundId, libraryId, controller, cap, startedAt: now().toISOString() }
    // runRound runs the self-check again: its probe is the one just made, not a second call
    const connector = scoreless ? null : withFirstProbe(a.connector, { ok: true, latencyMs: check.probe?.latencyMs ?? 0, model: check.probe?.model, usage: { calls: 0 } })
    void runInBackground({ dir, libraryId, roundId, connector, cap, controller, scoreless })
    return { started: true, roundId }
  }

  const handlers = {
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
        lastRound: listRounds(dir, 1)[0] ?? null,
        roundState: roundState(),
        recentKept: kept.slice(0, 3).map(e => ({ id: e.id, title: e.title, source_name: e.source_name ?? null, date: e.date, kept: e.kept ?? null })),
        connection: connectionView(),
        nextRun: schedule()?.nextRunAt ?? null,
        problem: p ? { code: p.code, connectionCode: p.connectionCode ?? null, kind: a?.kind ?? null, caughtKept: numbers.caught } : null,
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
    getInbox() {
      const dir = library.require()
      return { items: listInbox(dir, { now }), recentDismissReasons: recentDismissReasons(dir) }
    },
    keepItem(url) {
      const dir = library.require()
      if (!inboxUrls(dir).has(url)) throw new BridgeError('bad_arguments', 'not in the inbox')
      const r = keep(dir, url, { now })
      emit('inbox-changed', { libraryId: library.current()?.libraryId ?? null, count: inboxCount(dir) })
      emit('library-changed', library.current())
      return { id: r.id, file: r.file }
    },
    dismissItem(url, reason) {
      const dir = library.require()
      if (!inboxUrls(dir).has(url)) throw new BridgeError('bad_arguments', 'not in the inbox')
      const r = dismiss(dir, url, reason, { now })
      emit('inbox-changed', { libraryId: library.current()?.libraryId ?? null, count: inboxCount(dir) })
      return { url: r.url }
    },
    laterItem(url) {
      const dir = library.require()
      return { url: later(dir, url).url }
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
        sources.push({ name: s.name, kind: s.kind, url: s.url ?? null, status: r.status, hint: r.hint, count: r.items.length, message: r.message })
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
        lastRound: listRounds(dir, 1)[0] ?? null,
        dismissReasons: recentDismissReasons(dir, 10),
        verdictFailures: Object.fromEntries(checked.map(n => [n.id, recentVerdictFailures(dir, n.id, 5)])),
      }
    },
    savePipeline(cfg) {
      const dir = library.require()
      try { byYou(dir, ['thresholds', 'cap'], () => savePipelineConfig(dir, cfg), { log, now }) } catch (err) { throw bridgeErrorOf(err) }
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

  return { handlers, roundState, startRoundIn, current, isRunning: () => Boolean(running), runningLibrary: () => running?.libraryId ?? starting?.libraryId ?? null }
}
