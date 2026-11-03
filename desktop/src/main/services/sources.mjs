/**
 * The sources and the topics (plan S5; docs/desktop.md §四 「来源与主题」, §4.2): the list with each source's last round, a
 * guess at what a pasted address or search is, one try of a source (nothing written), the changes to streams.json, a link
 * pasted into the ledger by hand. A name the page sends must be one streams.json already has; the shape of a source or a
 * topic is the core's to judge (its shape errors come back as bad_arguments). Every change to streams.json, and a link
 * that went into the ledger, sends `library-changed`.
 *
 * The core's W5 functions are reached by name through `coreCaller` (bridge-methods.mjs): a stand-in core in the tests,
 * `internal` for a function not there yet. Pure Node: test/services-sources.test.mjs.
 * @module desktop/main/services/sources
 */

import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'

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
 */
export function createSourcesService({ library, emit, log, core = realCore, now = () => new Date(), fetchContext = {} }) {
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
  /** A change to streams.json went through: say so, then hand the core's answer back. */
  const changed = (what, r) => {
    log(`sources: ${what}`)
    emit('library-changed', library.current())
    return r
  }

  const handlers = {
    getSources() {
      return call('sourcesView', library.require())
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
      return {
        status: r.status, hint: r.hint ?? null, http: r.http ?? null, message: r.message ?? '', count: items.length,
        sample: items.slice(0, SAMPLE).map(i => ({ title: i.title ?? '', date: i.date ?? null })),
      }
    },
    addSource(source) {
      const dir = library.require()
      const r = call('addSource', dir, source)
      return changed(`added ${r?.source?.name ?? '?'}`, r)
    },
    updateSource(name, patch) {
      const dir = library.require()
      knownSource(dir, name)
      return changed(`updated ${name}`, call('updateSource', dir, name, patch))
    },
    removeSource(name) {
      const dir = library.require()
      knownSource(dir, name)
      return changed(`removed ${name}`, call('removeSource', dir, name))
    },
    setSourcePaused(name, paused) {
      const dir = library.require()
      knownSource(dir, name)
      return changed(`${paused ? 'paused' : 'resumed'} ${name}`, call('setSourcePaused', dir, name, paused))
    },
    addManualLink(url, title) {
      const dir = library.require()
      const r = call('addManual', dir, { url: url.trim(), ...(title.trim() ? { title: title.trim() } : {}) }, { now })
      if (!r.added) return r
      return changed(`a link by hand: ${r.url}`, r)
    },
    addTopic(topic) {
      const dir = library.require()
      return changed(`topic added ${topic.name}`, call('addTopic', dir, topic))
    },
    updateTopic(name, patch) {
      const dir = library.require()
      knownTopic(dir, name)
      return changed(`topic updated ${name}`, call('updateTopic', dir, name, patch))
    },
    removeTopic(name) {
      const dir = library.require()
      knownTopic(dir, name)
      return changed(`topic removed ${name}`, call('removeTopic', dir, name))
    },
  }

  return { handlers }
}
