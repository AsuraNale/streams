/**
 * 来源与要求 (docs/desktop.md §四, §4.2, §4.17): what the page shows of a library's sources and requirements, and the one change
 * made from it to a library's sources.
 *   - A library with a card (1.1 W6a, A5 · B3): its card and its sources' rows (getCardView); a web address or a search word
 *     typed by the user is the definition's add_source, held until 确认 (proposeCardSource / settleCardSource), then written
 *     into the card by core sourceHandlers — `library-changed` after it.
 *   - A library made by the last version (no card, A6): read only — its brief (getCardView) and its old sources with their
 *     last fetch (getSources); 「重新查一遍来源」 brings it over through the build conversation (services/build.mjs). 1.1 W7b:
 *     v1.0's editing of streams.json (sources, topics, the brief, the levels, a link by hand, a source tried) is gone.
 *   - 高级设置's 变更记录 (getChangeLog: core changeLog, read only).
 * The core's functions are reached by name through `coreCaller` (bridge-methods.mjs): a stand-in core in the tests, `internal`
 * for a function not there. Redesign R5a (O9): a source row's last fetch is a state and a hint, never the fetcher's message or
 * the HTTP code (those go to the log and 「复制诊断信息」, raw-errors.mjs). Pure Node: test/services-sources.test.mjs.
 * @module desktop/main/services/sources
 */

import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'
import { publicSourceRow } from '../public-data.mjs'

const HTTP_URL = /^https?:\/\/\S+$/i

/**
 * @param {object} o
 * @param {{require: () => string, current: () => {path: string, name: string}|null}} o.library - services/library.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {Record<string, unknown>} [o.core] - the core's exports (tests: a stand-in for what is not there yet)
 * @param {() => Date} [o.now]
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs
 */
export function createSourcesService({ library, emit, log, core = realCore, now = () => new Date(), rawErrors = null, pendingDir = join(tmpdir(), 'streams-pending') }) {
  const call = coreCaller(core)

  /** A change went through: say so, then hand the core's answer back. */
  const changed = (what, r) => {
    log(`sources: ${what}`)
    emit('library-changed', library.current())
    return r
  }

  // 1.1 W6a (A5 · B3): a source the user adds to a library with a card is the definition's add_source, held until 确认 (inline
  // on 来源与要求), then written into the card by core sourceHandlers. Pending records outside the library folder.
  const cardRunner = () => {
    const dir = library.require()
    return call('createActionRunner', {
      definition: call('loadDefinition'),
      handlers: call('sourceHandlers', { dirOfLibrary: () => dir }),
      pendingDir,
      logFile: () => join(dir, '_actions.jsonl'),
      now,
    })
  }
  const ownPending = id => typeof id === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(id)

  const handlers = {
    /**
     * 1.1 W6a: what 来源与要求 shows of the library — its card and its sources' rows (core sourceRows) when it has a card; when
     * it has none (built by the last version: A6), its brief, so the page can say how to go on.
     */
    getCardView() {
      const dir = library.require()
      const card = call('readCard', dir)
      return card ? { card, rows: call('sourceRows', dir), old: false } : { card: null, rows: [], old: true, brief: call('readBrief', dir) }
    },
    /** 1.1 W6a: a web address or a search word typed on 来源与要求 → the add_source request, pending; nothing is written yet. */
    async proposeCardSource(text) {
      const t = String(text).trim()
      const url = HTTP_URL.test(t) ? t : null
      let name = t
      if (url) { try { name = new URL(url).hostname.replace(/^www\./, '') } catch { throw new BridgeError('bad_arguments', 'not an address') } }
      const r = await cardRunner().request('user', { action: 'add_source', params: { library: library.current()?.libraryId ?? 'current', source: { name: name.slice(0, 200), ...(url ? { url } : { query: t.slice(0, 500) }) } } })
      if (r.status !== 'pending') throw new BridgeError('bad_arguments', (r.errors ?? []).join('; '))
      log(`sources: a source proposed (${url ? 'address' : 'search word'}), waiting for the user to confirm it`)
      return { id: r.pending.id, source: r.pending.params.source }
    },
    /** 1.1 W6a: 确认 (do it: the card gets the source) or 不加 (drop it) of a source proposed above. */
    async settleCardSource(id, confirm) {
      if (!ownPending(id)) throw new BridgeError('bad_arguments')
      const runner = cardRunner()
      if (!confirm) { runner.reject(id); return { dropped: true } }
      const r = await runner.confirm(id)
      if (r.status !== 'done') throw new BridgeError(r.errors?.some(e => /already/.test(e)) ? 'bad_arguments' : 'internal', (r.errors ?? []).join('; '))
      return changed('a source added to the card', { added: r.result.after })
    },
    getSources() {
      // redesign R5a (O9): each row's last fetch as a state and a hint — the fetcher's message and the HTTP code to the diagnostics
      const v = call('sourcesView', library.require())
      return { ...v, sources: (v.sources ?? []).map(s => publicSourceRow(s, { raw: rawErrors, where: 'source row' })) }
    },
    /**
     * Redesign R4b (高级设置「变更记录」, F54 / F55): the library's change history — core changeLog: every line of changes.jsonl
     * (who changed which field, before / after) and 首次设置's record, newest first. Read only.
     */
    getChangeLog() {
      return call('changeLog', library.require())
    },
  }

  return { handlers }
}
