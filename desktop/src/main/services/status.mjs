/**
 * The run-log folder, the graph and the verdicts (plan S11 / S9 / S15; docs/desktop.md §四, §4.2): the run-log folder in
 * Explorer, the graph under a filter, one item's verification record. A url the page sends must be one the ledger knows.
 * (1.1 W7b: v1.0's run status, getStatus, went with its scoring pipeline: the right panel's 进度 tells the runs.)
 *
 * The core's W5 functions are reached by name through `coreCaller` (bridge-methods.mjs): a stand-in core in the tests,
 * `internal` for a function not there yet. Pure Node apart from what is injected (`shell`): test/services-status.test.mjs.
 * @module desktop/main/services/status
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'

/**
 * @param {object} o
 * @param {{require: () => string}} o.library - services/library.mjs
 * @param {{handlers: {getConnections: () => Promise<object>}}} o.connections - services/connections.mjs
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: nothing is opened outside the app
 * @param {{openPath: (path: string) => Promise<string>}} o.shell
 * @param {Record<string, unknown>} [o.core] - the core's exports (tests: a stand-in for what is not there yet)
 * @param {() => Date} [o.now]
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs — the sources' last fetch messages and the last
 *   run's problem details go there, not to the page
 */
export function createStatusService({ library, connections, log, hidden = false, shell, core = realCore, now = () => new Date(), schedule = () => null, rawErrors = null }) {
  const call = coreCaller(core)

  const handlers = {
    async openLogsFolder() {
      const dir = library.require()
      const logs = join(dir, '_pipeline', 'logs')
      if (hidden) { log(`not opened in a test run: ${logs}`); return null }
      if (!existsSync(logs)) { log(`status: no run-log folder ${logs}`); throw new BridgeError('open_failed') }
      const problem = await shell.openPath(logs)
      if (problem) { log(`status: openPath ${logs}: ${problem}`); throw new BridgeError('open_failed') }
      return null
    },
    // redesign R3 (F40): one filter, the time range; every file of the library is drawn (status 'all': kept and your own) and
    // the [[links]] always (links true). Only files: the core's graph reads the index, never the ledger
    getGraph(filter) {
      const dir = library.require()
      const days = filter?.days ?? null
      return call('graph', dir, { days, status: 'all', topics: [], links: true, now })
    },
    getVerdicts(url) {
      const dir = library.require()
      if (!call('replayLedger', dir).states.has(url)) throw new BridgeError('bad_arguments', 'not in the ledger')
      return call('verdictsFor', dir, url)
    },
  }

  return { handlers }
}
