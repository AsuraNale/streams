/**
 * 1.1 W5: the update of a library that has a library card (core update/run.mjs runUpdate). Not the app's own update to a
 * newer version (that is services/update.mjs). services/pipeline.mjs sends a round of such a library here instead of v1.0's
 * scoring pipeline (which a library without a card keeps until W7 removes it); the queue and the catch-up of
 * services/schedule.mjs stay as they are (runUpdate writes its line in rounds.jsonl).
 *   - Only Claude Code builds and updates in 1.1 (W4's live runs: Codex did not pass, contract C7): another connection
 *     does not start, with the code 'update-not-supported'; none chosen: 'no_connection'.
 *   - The update agent's session has the two web tools (core createSessionConnector … { web: true }) in a working folder of
 *     its own under the system's temporary folder (made with mkdirSync by the core, emptied before and after each call).
 *   - The page reader (direct → the hidden render window → a PDF's text) and the link reader come from main.mjs.
 * @module desktop/main/services/library-update
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLinkReader, createSessionConnector, readCard, runUpdate, saveOriginal } from '../core.mjs'

// 1.1.1 P3 (C8): Codex updates too (its four cards' updates passed the same line as Claude Code's)
export const UPDATE_KINDS = Object.freeze(['claude-code', 'codex', 'api'])
export const UPDATE_CWD = join(tmpdir(), 'streams-update-cwd')

/**
 * @param {object} o
 * @param {() => {read: Function}} o.readPages - a page reader (core createPageReader with the render service and the PDF reader)
 * @param {() => {read: Function}} [o.readLinks] - a link reader (core createLinkReader with the render service)
 * @param {(active: object) => object} [o.session] - the update agent's session for the active connection
 * @param {(active: object, o: {search: Function|null, onPage: Function}) => object} [o.apiSession] - 1.1.1 P6: an API connection's
 *   update agent with Streams' tools (main.mjs: core createApiToolSession, the update's budget as hard numbers); each page it
 *   reads is kept as its original at once (onPage), so what it quotes is what is kept
 * @param {(active: object) => Promise<{search: Function}|null>} [o.apiSearch] - its search (core searchFor), or null
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 */
export function createLibraryUpdateService({ readPages, readLinks = () => createLinkReader(), session = active => createSessionConnector(active.connection, {}, { cwd: UPDATE_CWD, web: true }), log, now = () => new Date(), apiSession = null, apiSearch = async () => null }) {
  return {
    /** The library at `dir` is updated by its card (it has _card/card.json). */
    applies(dir) {
      try { return readCard(dir) !== null } catch { return false }
    },
    /** Why an update cannot start on this connection, or null. */
    problemFor(active) {
      if (!active) return { code: 'no_connection' }
      if (!UPDATE_KINDS.includes(active.kind)) return { code: 'update-not-supported', connection: active.kind }
      return null
    },
    /** One update of the library at `dir` on the active connection (1.1 W7a: `signal` — 停止). */
    async run(dir, active, { round, signal = null } = {}) {
      let connector
      let search = true
      if (active.kind === 'api' && apiSession) {
        const found = await apiSearch(active)
        search = Boolean(found)
        connector = apiSession(active, { search: found?.search ?? null, onPage: (url, page) => saveOriginal(dir, { url, title: page.title ?? '', text: page.text, method: page.method, fetchedAt: now() }) })
      } else connector = session(active)
      const r = await runUpdate(dir, { connector, judge: active.connector, readPage: readPages().read, readLinks: readLinks().read, now, round, signal, kind: active.kind, search })
      log(`update: ${round ?? '-'} of ${dir}: ${r.status}${r.record ? ` · sources ${r.record.counts.read} · new ${r.record.counts.newLinks} · inbox ${r.record.counts.inbox} · calls ${r.record.calls ?? 0}` : ''}`)
      return r
    },
  }
}
