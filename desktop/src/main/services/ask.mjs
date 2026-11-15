/**
 * Asking the library (plan S10; docs/desktop.md §四 「问库」, §4.2, §4.7): one question at a time on the active connection (none
 * chosen → `no_connection`), the topics people wished the library had, a note that an answer was wrong. The answer is the
 * core's `ask` as it comes, a connection failure included (`{ ok: false, code }` is data, not a bridge error); its model
 * calls count in the library's usage under `ask`.
 *
 * v2 package E (contract E2): the library's chat box sends `sendLibraryMessage(text)` instead. The core's `routeMessage`
 * (rules, then one no-tools, no-session call on the active connection, counted in the usage under `route`) says question,
 * change or unsure:
 *   question → the same path as askLibrary (the core's ask on the current library), its answer as it comes;
 *   change   → the main agent: `agentSend(text, { libraryId: the current library })` (package C), its turn as it comes;
 *   unsure   → nothing more is asked of anyone: `{ route: 'unsure', by, confidence, text }` (the page asks you).
 * `resolveLibraryMessage(text, route)` is your answer to 「这是要改这个库吗？」: the route you chose, no routing.
 * Each one writes a line in the library's _pipeline/routes.jsonl (core appendRouteLine, append only). One sentence at a
 * time, shared with askLibrary: a second while one runs → `bad_arguments`. The routing itself changes nothing.
 *
 * The core's functions are reached by name through `coreCaller` (bridge-methods.mjs): a stand-in core in the tests,
 * `internal` for a function not there yet. Pure Node: test/services-ask.test.mjs, test/services-route.test.mjs.
 * @module desktop/main/services/ask
 */

import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'

/** The routes your answer to 「这是要改这个库吗？」 may take. */
export const RESOLVE_ROUTES = Object.freeze(['question', 'change'])

/**
 * @param {object} o
 * @param {{require: () => string, current: () => {libraryId: string}|null}} o.library - services/library.mjs
 * @param {{active: () => {kind: string, connector: object}|null}} o.connections - services/connections.mjs
 * @param {(line: string) => void} o.log
 * @param {(text: string, options: {libraryId: string|null}) => Promise<unknown>} [o.agentSend] - the main agent's agentSend
 *   (services/agent.mjs); without it a change is `internal`
 * @param {Record<string, unknown>} [o.core] - the core's exports (tests: a stand-in for what is not there yet)
 * @param {() => Date} [o.now]
 */
export function createAskService({ library, connections, log, agentSend = null, core = realCore, now = () => new Date() }) {
  const call = coreCaller(core)
  let asking = false

  /** One sentence at a time (askLibrary and the chat box's alike): `job` runs with the slot taken. */
  async function oneAtATime(job) {
    if (asking) throw new BridgeError('bad_arguments', 'a question is running')
    asking = true
    try { return await job() } finally { asking = false }
  }

  /** The askLibrary path: the core's ask on the current library, on the active connection, counted under `ask`. */
  async function askNow(dir, question) {
    const a = connections.active()
    if (!a) throw new BridgeError('no_connection')
    const connector = call('createUsageCounter', dir, { now }).wrap(a.connector, 'ask')
    const r = await call('ask', dir, question, { connector, now })
    log(`ask: ${r?.ok === false ? `connection ${r.code}` : `calls ${r?.calls ?? '?'} · used ${r?.used?.length ?? '?'} · notInLibrary ${r?.notInLibrary}`}`)
    return r
  }

  /** The main agent, with the current library's id. */
  async function toAgent(text) {
    if (typeof agentSend !== 'function') throw new BridgeError('internal', 'no main agent wired')
    return agentSend(text, { libraryId: library.current()?.libraryId ?? null })
  }

  /** Where a routed sentence goes: question → ask, change → the main agent. */
  const dispatch = (dir, route, text) => (route === 'question' ? askNow(dir, text) : toAgent(text))

  const record = (dir, row) => {
    try { call('appendRouteLine', dir, row, { now }) } catch (err) { log(`route: routes.jsonl not written: ${String(err?.message ?? err)}`) }
  }

  const handlers = {
    askLibrary(question) {
      const dir = library.require()
      return oneAtATime(() => askNow(dir, question.trim()))
    },
    /** The library's chat box: routed, then asked or handed to the main agent; unsure → back to the page, nobody asked. */
    sendLibraryMessage(text) {
      const dir = library.require()
      const t = text.trim()
      return oneAtATime(async () => {
        const a = connections.active()
        const connector = a ? call('createUsageCounter', dir, { now }).wrap(a.connector, 'route') : undefined
        const r = await call('routeMessage', t, { connector })
        record(dir, { text: t, route: r.route, by: r.by, confidence: r.confidence })
        log(`route: ${r.route} by ${r.by} at ${r.confidence} (${r.reason})`)
        if (r.route === 'unsure') return { route: 'unsure', by: r.by, confidence: r.confidence, text: t }
        const result = await dispatch(dir, r.route, t)
        return { route: r.route, by: r.by, confidence: r.confidence, result }
      })
    },
    /** Your answer to 「这是要改这个库吗？」: the route you chose, as it is (no routing). */
    resolveLibraryMessage(text, route) {
      const dir = library.require()
      if (!RESOLVE_ROUTES.includes(route)) throw new BridgeError('bad_arguments', `route ${String(route)}`)
      const t = text.trim()
      return oneAtATime(async () => {
        record(dir, { text: t, route, by: 'you', confidence: 1, resolvedBy: 'you' })
        log(`route: ${route} chosen by you`)
        const result = await dispatch(dir, route, t)
        return { route, by: 'you', confidence: 1, result }
      })
    },
    // redesign R3 (问库 「已加入待补充主题」): each topic also says for which questions you pressed 「加入待补充主题」 (`added`: the
    // questions, null for one without), so an answer drawn again — the page opened again — still says it was added
    getDemands() {
      const dir = library.require()
      const added = call('demandsAdded', dir)
      const key = t => call('topicKey', t)
      return call('demands', dir).map(d => ({ ...d, added: added.filter(a => key(a.topic) === key(d.topic)).map(a => a.question) }))
    },
    addDemand(topic, question) {
      const dir = library.require()
      return call('addDemand', dir, topic.trim(), { ...(question.trim() ? { question: question.trim() } : {}), now })
    },
    answerFeedback(question, note) {
      const dir = library.require()
      call('answerFeedback', dir, { question: question.trim(), note: note.trim() }, { now })
      return { ok: true }
    },
  }

  return { handlers, isAsking: () => asking }
}
