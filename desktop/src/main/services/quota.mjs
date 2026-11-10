/**
 * v2 package M (docs/checks/2026-11-10-wp-m/contract.md M4; docs/desktop.md §4.11): what is left of the plan or the API
 * balance of the current connection, for the corner of the sidebar above 设置. Kept in memory only — nothing is written to
 * disk (not to <appData>, not anywhere): a new start reads again.
 *
 *   Claude Code  every call's stream carries the plan's windows (core connect/claude-code.mjs `quota`): the connections
 *                service hands each one to record() (connectorDeps.onQuota) — 「上次调用时」 numbers, no call of its own
 *   Codex        read from `codex app-server` (core readCodexQuota: three JSON-RPC messages, no model): at start, every
 *                CODEX_EVERY_MS (10 minutes), and after every round and every turn of the main agent — while Codex is the
 *                current connection (no codex is started for a connection not in use)
 *   API          the vendor's balance endpoint where its docs give one (core readApiBalance: deepseek, moonshot): at start and
 *                after every round and turn — while the API is the current connection. The key: the secret store's
 *                (safeStorage), read in the main process at request time, never logged, never in what the page gets
 *   and again whenever the connection settings change (another current connection, another vendor, a key stored).
 *
 * getQuota() → the current connection's { source, at, windows[] | balance[] … } (core checkQuota's allowlist) or null: none
 * chosen, nothing read yet, the read failed, or the vendor has no balance endpoint — the page then shows nothing at all.
 * Every change sends `quota-changed` { kind }.
 *
 * Development and tests only (a packaged app ignores it; main.mjs reads the variable):
 *   STREAMS_DEV_QUOTA=<absolute path of a JSON file>  { "claude-code"?: quota, "codex"?: quota, "api"?: quota } taken as read
 *   at start (each through checkQuota); with it, or with STREAMS_DEV_CONNECTION, nothing real is read (no codex started, no
 *   request sent).
 * @module desktop/main/services/quota
 */

import { readFileSync } from 'node:fs'
import { checkQuota, hasBalanceEndpoint, readApiBalance, readCodexQuota } from '../core.mjs'

export const CODEX_EVERY_MS = 10 * 60_000
const KINDS = Object.freeze(['claude-code', 'codex', 'api'])

/**
 * @param {object} o
 * @param {{ connection(kind: string): object }} o.connections - services/connections.mjs (the core's connection object of a kind)
 * @param {() => string|null} o.activeKind - the current connection (settings.json connections.active)
 * @param {{ get(name: string): string|null }} o.secrets - secrets.mjs: the API key, main process only
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {string|null} [o.devConnection] - STREAMS_DEV_CONNECTION: no real read
 * @param {string|null} [o.devQuotaFile] - STREAMS_DEV_QUOTA
 * @param {object} [o.connectorDeps] - more deps for the core's readers (tests: spawnImpl, fetchImpl, env)
 * @param {Function} [o.readCodex] - core readCodexQuota (tests: a stand-in)
 * @param {Function} [o.readBalance] - core readApiBalance (tests: a stand-in)
 * @param {{ set: typeof setInterval, clear: typeof clearInterval }} [o.timers]
 */
export function createQuotaService({ connections, activeKind, secrets, emit, log, devConnection = null, devQuotaFile = null, connectorDeps = {}, readCodex = readCodexQuota, readBalance = readApiBalance, timers = { set: setInterval, clear: clearInterval } }) {
  const cache = { 'claude-code': null, codex: null, api: null }
  const reading = { codex: null, api: null }
  let timer = null
  const real = devConnection === null && devQuotaFile === null

  const vendorNow = () => { try { return connections.connection('api')?.api?.vendor ?? null } catch { return null } }

  /** A quota of `kind` (from a call, a read, the development file): through the allowlist, kept, told. */
  function record(kind, quota) {
    const q = checkQuota(quota)
    if (!KINDS.includes(kind) || !q || q.source !== kind) return false
    cache[kind] = q
    emit('quota-changed', { kind })
    return true
  }

  function forget(kind) {
    if (cache[kind] === null) return
    cache[kind] = null
    emit('quota-changed', { kind })
  }

  /** The current connection's quota, or null (the corner shows nothing). */
  function current() {
    const kind = activeKind()
    if (!KINDS.includes(kind)) return null
    const q = cache[kind]
    if (!q) return null
    // an API balance is the vendor's: another vendor chosen since, or one without an endpoint, shows nothing
    if (kind === 'api' && (!hasBalanceEndpoint(vendorNow()) || q.vendor !== vendorNow())) return null
    return structuredClone(q)
  }

  async function readOne(kind, why) {
    if (!real) return null
    if (reading[kind]) return reading[kind]
    reading[kind] = (async () => {
      let r
      try {
        if (kind === 'codex') r = await readCodex(connections.connection('codex'), { ...connectorDeps })
        else if (!hasBalanceEndpoint(vendorNow())) r = { ok: false, code: 'not-applicable' }
        else r = await readBalance(connections.connection('api'), { ...connectorDeps, getKey: ref => secrets.get(ref) })
      } catch (err) {
        r = { ok: false, code: 'unknown', detail: String(err?.message ?? err) }
      }
      // the code only: a detail could quote a server's answer
      if (r.ok && record(kind, r.quota)) log(`quota: ${kind} read (${why})`)
      else { log(`quota: ${kind} not read (${why}): ${r.code ?? 'unknown'}`); forget(kind) }
      return r
    })()
    try { return await reading[kind] } finally { reading[kind] = null }
  }

  /** Read again what the current connection reads by itself (Codex, the API); Claude Code's comes with its calls. */
  function refresh(why) {
    const kind = activeKind()
    if (kind === 'codex' || kind === 'api') return readOne(kind, why)
    return Promise.resolve(null)
  }

  function loadDev() {
    if (devQuotaFile === null) return
    let data = null
    try { data = JSON.parse(readFileSync(devQuotaFile, 'utf8')) } catch (err) { log(`quota: development file not read: ${String(err?.code ?? err?.message ?? err)}`); return }
    for (const kind of KINDS) if (data && data[kind] !== undefined && !record(kind, data[kind])) log(`quota: development ${kind} not in the shape (ignored)`)
  }

  return {
    record,
    current,
    refresh,
    /** At start: the development file, then the current connection's read, then the 10-minute timer (Codex only). */
    start() {
      loadDev()
      void refresh('start')
      if (timer === null) {
        timer = timers.set(() => { if (activeKind() === 'codex') void readOne('codex', 'every 10 minutes') }, CODEX_EVERY_MS)
        timer?.unref?.()
      }
    },
    stop() { if (timer !== null) { timers.clear(timer); timer = null } },
    /** A round ended, a turn of the main agent ended: Codex and the API read again. */
    afterTurn: why => refresh(why),
    /** The connection settings changed (another current one, a vendor, a key): read for what is current now. */
    connectionsChanged() { emit('quota-changed', { kind: activeKind() }); return refresh('connections changed') },
    handlers: {
      getQuota: () => current(),
    },
  }
}
