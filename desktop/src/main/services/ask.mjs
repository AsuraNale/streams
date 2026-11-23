/**
 * Asking the library (plan S10; docs/desktop.md §四 「问库」, §4.2, §4.7): one question at a time on the active connection (none
 * chosen → `no_connection`), the topics people wished the library had, a note that an answer was wrong. The answer is the
 * core's `ask` as it comes, a connection failure included (`{ ok: false, code }` is data, not a bridge error); its model
 * calls count in the library's usage under `ask`.
 *
 * One question at a time: a second while one runs → `bad_arguments`. 1.1 W7b: 问库 just answers — v2 package E's chat box that
 * routed a sentence to the main agent when it asked for a change (sendLibraryMessage / resolveLibraryMessage) is gone with
 * that agent; a library's card is changed through the build conversation (services/build.mjs).
 *
 * The core's functions are reached by name through `coreCaller` (bridge-methods.mjs): a stand-in core in the tests,
 * `internal` for a function not there yet. Pure Node: test/services-ask.test.mjs.
 * @module desktop/main/services/ask
 */

import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'

/**
 * @param {object} o
 * @param {{require: () => string, current: () => {libraryId: string}|null}} o.library - services/library.mjs
 * @param {{active: () => {kind: string, connector: object}|null}} o.connections - services/connections.mjs
 * @param {(line: string) => void} o.log
 * @param {Record<string, unknown>} [o.core] - the core's exports (tests: a stand-in for what is not there yet)
 * @param {() => Date} [o.now]
 */
export function createAskService({ library, connections, log, core = realCore, now = () => new Date() }) {
  const call = coreCaller(core)
  let asking = false

  /** One question at a time: `job` runs with the slot taken. */
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

  const handlers = {
    askLibrary(question) {
      const dir = library.require()
      return oneAtATime(() => askNow(dir, question.trim()))
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
