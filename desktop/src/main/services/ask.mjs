/**
 * Asking the library (plan S10; docs/desktop.md §四 「问库」, §4.2): one question at a time on the active connection (none
 * chosen → `no_connection`), the topics people wished the library had, a note that an answer was wrong. The answer is the
 * core's `ask` as it comes, a connection failure included (`{ ok: false, code }` is data, not a bridge error); its model
 * calls count in the library's usage under `ask`.
 *
 * The core's W5 functions are reached by name through `coreCaller` (bridge-methods.mjs): a stand-in core in the tests,
 * `internal` for a function not there yet. Pure Node: test/services-ask.test.mjs.
 * @module desktop/main/services/ask
 */

import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'

/**
 * @param {object} o
 * @param {{require: () => string}} o.library - services/library.mjs
 * @param {{active: () => {kind: string, connector: object}|null}} o.connections - services/connections.mjs
 * @param {(line: string) => void} o.log
 * @param {Record<string, unknown>} [o.core] - the core's exports (tests: a stand-in for what is not there yet)
 * @param {() => Date} [o.now]
 */
export function createAskService({ library, connections, log, core = realCore, now = () => new Date() }) {
  const call = coreCaller(core)
  let asking = false

  const handlers = {
    async askLibrary(question) {
      const dir = library.require()
      if (asking) throw new BridgeError('bad_arguments', 'a question is running')
      const a = connections.active()
      if (!a) throw new BridgeError('no_connection')
      asking = true
      try {
        const connector = call('createUsageCounter', dir, { now }).wrap(a.connector, 'ask')
        const r = await call('ask', dir, question.trim(), { connector, now })
        log(`ask: ${r?.ok === false ? `connection ${r.code}` : `calls ${r?.calls ?? '?'} · used ${r?.used?.length ?? '?'} · notInLibrary ${r?.notInLibrary}`}`)
        return r
      } finally {
        asking = false
      }
    },
    getDemands() {
      return call('demands', library.require())
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
