/**
 * The sources and the topics (plan S5; docs/desktop.md §四 「来源与主题」, §4.2): the list with each source's last round, a
 * guess at what a pasted address or search is, one try of a source (nothing written), the changes to streams.json, a link
 * pasted into the ledger by hand. A name the page sends must be one streams.json already has; the shape of a source or a
 * topic is the core's to judge (its shape errors come back as bad_arguments). Every change to streams.json, and a link
 * that went into the ledger, sends `library-changed`.
 *
 * The core's W5 functions are reached by name through `coreCaller` (bridge-methods.mjs): a stand-in core in the tests,
 * `internal` for a function not there yet. Pure Node: test/services-sources.test.mjs.
 *
 * v2 package B: each change of the sources or the topics is the user's own — one line by 'you' in the library's
 * changes.jsonl for each of the two fields that changed (services/changes.mjs byYou).
 *
 * v2 package F: the library's 「要求」 (streams.json `brief`, core readBrief / saveBrief) on 来源与要求 — `getBrief` reads it,
 * `setBrief` writes what the user typed (the core trims it and refuses an empty or a too long one: bad_arguments) and records
 * it as the user's (one line by 'you' in changes.jsonl when it changed), then sends `library-changed`.
 *
 * Redesign R4b (docs/desktop.md §4.17): 严格程度 on 来源与要求 — `getStrictness` / `setStrictness(level)` (core readStrictness /
 * saveStrictness; the thresholds recorded by 'you') — and 高级设置's 变更记录, `getChangeLog` (core changeLog).
 * Redesign R5a (O9; docs/desktop.md §4.19): `trySource` answers the state (the five fetch states), the hint (what to do: its
 * key) and the count — no longer the fetcher's message or the HTTP code; those go to the log and 「复制诊断信息」 (raw-errors.mjs).
 * @module desktop/main/services/sources
 */

import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'
import { byYou } from './changes.mjs'
import { publicSourceRow } from '../public-data.mjs'

const HTTP_URL = /^https?:\/\/\S+$/i
// what a try may carry of a source (streams.json's keys the fetchers read)
const TRY_KEYS = ['name', 'kind', 'url', 'query', 'topic', 'min_points', 'max_results']
const SAMPLE = 3

/**
 * @param {object} o
 * @param {{require: () => string, current: () => {path: string, name: string}|null}} o.library - services/library.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {Record<string, unknown>} [o.core] - the core's exports (tests: a stand-in for what is not there yet)
 * @param {() => Date} [o.now]
 * @param {object} [o.fetchContext] - overrides for the core's fetch context (tests: fetchImpl, timeoutMs)
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs
 */
export function createSourcesService({ library, emit, log, core = realCore, now = () => new Date(), fetchContext = {}, rawErrors = null }) {
  const call = coreCaller(core)

  const config = dir => {
    const r = call('readConfig', dir)
    if (!r.ok) throw new BridgeError('internal', `streams.json not readable: ${r.error?.code ?? '?'}`)
    return r.config
  }
  const knownSource = (dir, name) => {
    if (!(config(dir).sources ?? []).some(s => s.name === name)) throw new BridgeError('bad_arguments', `no source ${name}`)
  }
  const knownTopic = (dir, name) => {
    if (!(config(dir).topics ?? []).some(t => t.name === name)) throw new BridgeError('bad_arguments', `no topic ${name}`)
  }
  /** The change, recorded as the user's (「谁定的」) for the fields it changed. */
  const yours = (dir, fn) => byYou(dir, ['sources', 'topics'], fn, { log, now })
  /** A change to streams.json went through: say so, then hand the core's answer back. */
  const changed = (what, r) => {
    log(`sources: ${what}`)
    emit('library-changed', library.current())
    return r
  }

  const handlers = {
    getSources() {
      // redesign R5a (O9): each row's last fetch as a state and a hint — the fetcher's message and the HTTP code to the diagnostics
      const v = call('sourcesView', library.require())
      return { ...v, sources: (v.sources ?? []).map(s => publicSourceRow(s, { raw: rawErrors, where: 'source row' })) }
    },
    guessSource(input) {
      return call('guessSource', input)
    },
    async trySource(source) {
      // only the keys a fetcher reads, and an address only over http(s): the main process fetches nothing else for the page
      const s = Object.fromEntries(TRY_KEYS.filter(k => source[k] !== undefined).map(k => [k, source[k]]))
      const kinds = Array.isArray(core.SOURCE_KINDS) ? core.SOURCE_KINDS : []
      if (!kinds.includes(s.kind)) throw new BridgeError('bad_arguments', `no source kind ${String(s.kind)}`)
      if (s.kind === 'rss' && !(typeof s.url === 'string' && HTTP_URL.test(s.url.trim()))) throw new BridgeError('bad_arguments', 'rss needs an http(s) address')
      if (s.kind !== 'rss' && !(typeof s.query === 'string' && s.query.trim() !== '')) throw new BridgeError('bad_arguments', `${s.kind} needs a query`)
      if (s.url !== undefined && !(typeof s.url === 'string' && HTTP_URL.test(s.url.trim()))) throw new BridgeError('bad_arguments', 'not an http(s) address')
      const r = await call('fetchSource', s, call('makeContext', { ...fetchContext, now }))
      const items = Array.isArray(r.items) ? r.items : []
      log(`sources: tried ${s.name ?? s.url ?? s.query}: ${r.status} (${items.length})`)
      // redesign R5a (O9): the fetcher's message and the HTTP code only into the log and the diagnostics
      if (r.status !== 'ok' && (r.message || r.http)) rawErrors?.note(`trySource ${s.name ?? s.url ?? s.query}`, { message: r.message, http: r.http, code: r.status })
      return {
        status: r.status, hint: r.hint ?? null, count: items.length,
        sample: items.slice(0, SAMPLE).map(i => ({ title: i.title ?? '', date: i.date ?? null })),
      }
    },
    addSource(source) {
      const dir = library.require()
      const r = yours(dir, () => call('addSource', dir, source))
      return changed(`added ${r?.source?.name ?? '?'}`, r)
    },
    updateSource(name, patch) {
      const dir = library.require()
      knownSource(dir, name)
      return changed(`updated ${name}`, yours(dir, () => call('updateSource', dir, name, patch)))
    },
    removeSource(name) {
      const dir = library.require()
      knownSource(dir, name)
      return changed(`removed ${name}`, yours(dir, () => call('removeSource', dir, name)))
    },
    setSourcePaused(name, paused) {
      const dir = library.require()
      knownSource(dir, name)
      return changed(`${paused ? 'paused' : 'resumed'} ${name}`, yours(dir, () => call('setSourcePaused', dir, name, paused)))
    },
    addManualLink(url, title) {
      const dir = library.require()
      const r = call('addManual', dir, { url: url.trim(), ...(title.trim() ? { title: title.trim() } : {}) }, { now })
      if (!r.added) return r
      return changed(`a link by hand: ${r.url}`, r)
    },
    addTopic(topic) {
      const dir = library.require()
      return changed(`topic added ${topic.name}`, yours(dir, () => call('addTopic', dir, topic)))
    },
    updateTopic(name, patch) {
      const dir = library.require()
      knownTopic(dir, name)
      return changed(`topic updated ${name}`, yours(dir, () => call('updateTopic', dir, name, patch)))
    },
    removeTopic(name) {
      const dir = library.require()
      knownTopic(dir, name)
      return changed(`topic removed ${name}`, yours(dir, () => call('removeTopic', dir, name)))
    },
    /** 「要求」: { brief } — the text, or null when the library has none. */
    getBrief() {
      return { brief: call('readBrief', library.require()) }
    },
    /** 「要求」 saved from 来源与要求: the user's own words (changes.jsonl by 'you'). */
    setBrief(text) {
      const dir = library.require()
      const r = byYou(dir, ['brief'], () => call('saveBrief', dir, text), { log, now })
      return changed('brief saved', r)
    },
    /**
     * Redesign R4b (N01 on 来源与要求, core readStrictness): { level: loose · standard · strict · custom, thresholds, levels } —
     * `levels` the three levels' two numbers (core STRICTNESS), for the line under the switch.
     */
    getStrictness() {
      const r = call('readStrictness', library.require())
      return { level: r.level, thresholds: r.thresholds, levels: core.STRICTNESS }
    },
    /** Redesign R4b: a level chosen and saved — its two thresholds written (core saveStrictness), recorded as the user's. */
    setStrictness(level) {
      const dir = library.require()
      const r = byYou(dir, ['thresholds'], () => call('saveStrictness', dir, level), { log, now })
      return changed(`strictness ${r.level}`, { level: r.level, thresholds: r.thresholds, levels: core.STRICTNESS })
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
