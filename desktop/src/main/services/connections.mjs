/**
 * The three ways to reach a model (plan C2; docs/desktop.md §四 「连接」, §4.1): Claude Code and Codex on this machine,
 * or an API key. The settings hold which one is active and the model slots (settings.mjs `connections`); the key is in
 * the secret store only and is read by the core at request time (`deps.getKey`), never returned to the page — the page
 * sees `hasKey` and `keyHint`. Detection results and the last probe per kind are kept here for `getConnections`.
 *
 * Pure Node apart from what is injected (the secret store, the texts), so the rules run in plain Node
 * (test/services-connections.test.mjs).
 *
 * Development and tests only (a packaged app ignores it; main.mjs reads the variable):
 *   STREAMS_DEV_CONNECTION=fake | login-expired | bad-format-once
 *     every kind is the core's scripted connector (`fake`: answers in the shape each prompt asks for) or the fake
 *     connector in that mode; detect says installed and logged in (login-expired: not logged in, code login-expired);
 *     openLogin opens nothing and answers { ok: true, pid: 0 }.
 *   STREAMS_DEV_ASK_SCRIPT=<json file>   (with fake only; redesign R3, for the page's tests and pictures of 问库) what the scripted
 *     connector answers to 问库's prompt (the core's ask: one answer object { answer: [{ text, cites }], notInLibrary, missing,
 *     claimed }); every other prompt is answered as before. Read once.
 *   STREAMS_DEV_DETECT=<json file>   (redesign R4a, for 首次打开's tests and pictures) what the detection says, laid over what it
 *     found: { "claude-code": { installed, loggedIn, version }, "codex": { … } } — any of the three keys of either kind. Read
 *     again at every detection, so a test can change it and press 「已登录，重新检测」. Not the API key (that is the secret store's).
 * @module desktop/main/services/connections
 */

import { readFileSync } from 'node:fs'
import { BridgeError } from '../bridge-methods.mjs'
import { ASK_PREAMBLE, ASK_PREAMBLE_EN, VENDORS, VENDOR_IDS, createConnector, createSessionConnector, fakeConnector, modelsFor, resolveModel, scriptedConnector } from '../core.mjs'

/** Development only: the scripted connector, with 问库's prompt (the core's ask preamble first) answered by `answer`. */
export function withAskAnswer(inner, answer) {
  const isAsk = req => req.model !== 'verify' && typeof req.prompt === 'string' && (req.prompt.startsWith(ASK_PREAMBLE) || req.prompt.startsWith(ASK_PREAMBLE_EN))
  return {
    ...inner,
    async complete(req) {
      if (!isAsk(req)) return inner.complete(req)
      inner.calls?.push({ prompt: req.prompt, system: req.system, model: req.model ?? 'main', format: req.format ?? 'json', at: new Date().toISOString() })
      return { ok: true, json: structuredClone(answer), text: JSON.stringify(answer), usage: { calls: 1 }, model: inner.connection?.model ?? 'fake-model' }
    },
  }
}
import { keyHint } from '../secrets.mjs'
import { CONNECTION_KINDS, readSettings, writeSettings } from '../settings.mjs'
import { APP } from '../texts/app.js'
import { APP as APP_EN } from '../texts-en/app.js'

export const DEV_CONNECTION_MODES = Object.freeze(['fake', 'login-expired', 'bad-format-once'])
export const LOGIN_KINDS = Object.freeze(['claude-code', 'codex'])
const HTTP_URL = /^https?:\/\/\S+$/i

export const keyRefOf = vendor => `key-${vendor}`

/**
 * @param {object} o
 * @param {string} o.settingsFile - layout.settingsFile
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: no login window is opened
 * @param {{get(name: string): string|null, has(name: string): boolean, set(name: string, value: string): void, remove(name: string): void}} o.secrets - secrets.mjs
 * @param {() => {resolved: string}} o.locale - the language of the login window's title
 * @param {string|null} [o.devConnection] - STREAMS_DEV_CONNECTION
 * @param {object} [o.connectorDeps] - more deps for the core's connectors (tests: spawnImpl, fetchImpl)
 * @param {(connector: object) => object} [o.usageWrap] - what a probe runs on: main.mjs wraps the connector with the open
 *   library's usage counter (core createUsageCounter(dir).wrap, purpose `probe`) so the call is counted there
 * @param {(kind: string, quota: object) => void} [o.onQuota] - v2 package M: the plan's windows a Claude Code call brought
 *   (core deps.onQuota), for the corner of the sidebar (services/quota.mjs record)
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs — a failed probe's own text goes there (the
 *   log, 「复制诊断信息」); the page gets its code only (texts/common.js CONNECTIONS.codes words it)
 */
export function createConnectionsService({ settingsFile, emit, log, hidden = false, secrets, locale, devConnection = null, devAskScript = null, devDetect = null, connectorDeps = {}, usageWrap = c => c, onQuota = () => {}, rawErrors = null }) {
  if (devConnection !== null && !DEV_CONNECTION_MODES.includes(devConnection)) throw new TypeError(`STREAMS_DEV_CONNECTION must be one of ${DEV_CONNECTION_MODES.join(' | ')}`)
  const settings = () => readSettings(settingsFile)
  const devAskAnswer = devConnection === 'fake' && devAskScript ? JSON.parse(readFileSync(devAskScript, 'utf8')) : null
  const detected = { 'claude-code': null, codex: null, api: null }
  const probes = { 'claude-code': null, codex: null, api: null }

  const checkKind = kind => {
    if (!CONNECTION_KINDS.includes(kind)) throw new BridgeError('bad_arguments', `no connection kind ${String(kind)}`)
    return kind
  }

  /** The core's connection object for a kind, from the settings. */
  const connection = kind => {
    const c = settings().connections
    const base = { kind, ...(c[kind].model ? { model: c[kind].model } : {}), ...(c[kind].verifyModel ? { verifyModel: c[kind].verifyModel } : {}) }
    if (kind !== 'api') return base
    const { vendor, baseUrl } = c.api
    return { ...base, api: { vendor, keyRef: keyRefOf(vendor), ...(vendor === 'custom' && baseUrl ? { baseUrl } : {}) } }
  }

  /** The connector for a kind: the core's, or the development stand-in. */
  const connector = kind => {
    checkKind(kind)
    if (devConnection === 'fake') return devAskAnswer ? withAskAnswer(scriptedConnector(), devAskAnswer) : scriptedConnector()
    if (devConnection) return fakeConnector({ mode: devConnection })
    // v2 package M: every call's quota (Claude Code's stream) goes to the corner under this kind
    return createConnector(connection(kind), { ...connectorDeps, getKey: ref => secrets.get(ref), onQuota: q => onQuota(kind, q) })
  }

  /**
   * The main agent's connector for a kind (v2 package C; core createSessionConnector): the same connection and key, in the
   * session mode — Claude Code / Codex keep one conversation and run in `cwd` (still 「不能动手」), the API replays it.
   * The development stand-ins are the agent service's own (services/agent.mjs), not made here.
   */
  const sessionConnector = (kind, { cwd, log: sessionLog = log } = {}) => {
    checkKind(kind)
    // v2 package M: the main agent's turns bring the plan's windows too
    return createSessionConnector(connection(kind), { ...connectorDeps, getKey: ref => secrets.get(ref), log: line => sessionLog(`agent connection: ${line}`), onQuota: q => onQuota(kind, q) }, { cwd })
  }

  const keyState = () => {
    const vendor = settings().connections.api.vendor
    const ref = keyRefOf(vendor)
    let hasKey = false
    let hint = null
    try {
      hasKey = secrets.has(ref)
      if (hasKey) hint = keyHint(secrets.get(ref))
    } catch (err) {
      // the key is there but cannot be read now (safeStorage): the page sees it as held, without a hint
      log(`connections: key ${ref} not readable: ${String(err?.code ?? err?.message ?? err)}`)
    }
    return { hasKey, keyHint: hint }
  }

  /** Redesign R4a, development only: STREAMS_DEV_DETECT's word on one kind ({} when there is none or it cannot be read). */
  const devDetectOf = kind => {
    if (!devDetect || kind === 'api') return {}
    try {
      const o = JSON.parse(readFileSync(devDetect, 'utf8'))?.[kind]
      if (!o || typeof o !== 'object') return {}
      return Object.fromEntries(Object.entries(o).filter(([k, v]) => (k === 'installed' || k === 'loggedIn') ? typeof v === 'boolean' : k === 'version' && (v === null || typeof v === 'string')))
    } catch (err) { log(`connections: STREAMS_DEV_DETECT unreadable: ${String(err?.message ?? err)}`); return {} }
  }

  const detectOne = async kind => {
    try {
      const r = await connector(kind).detect()
      const out = { installed: r.installed === true, loggedIn: r.loggedIn === true, version: r.version ?? null, code: r.code ?? null }
      const over = devDetectOf(kind)
      if (Object.keys(over).length) {
        Object.assign(out, over)
        if (!out.installed) out.loggedIn = false
        out.code = !out.installed ? 'not-installed' : out.loggedIn ? null : 'not-logged-in'
      }
      if (r.source) out.source = r.source
      return out
    } catch (err) {
      log(`connections: detect ${kind} failed: ${String(err?.message ?? err)}`)
      return { installed: false, loggedIn: false, version: null, code: 'unknown' }
    }
  }

  const detectAll = async () => {
    const [cc, cx] = await Promise.all([detectOne('claude-code'), detectOne('codex')])
    detected['claude-code'] = cc
    detected.codex = cx
    // the API connection: a stored key is the whole of "logged in" (under a fake connection the fake's answer)
    detected.api = devConnection ? await detectOne('api') : (() => { const k = keyState(); return { installed: true, loggedIn: k.hasKey, version: null, code: k.hasKey ? null : 'bad-key' } })()
    log(`connections: detected claude-code ${JSON.stringify(cc)} codex ${JSON.stringify(cx)} api loggedIn=${detected.api.loggedIn}`)
  }

  const slots = kind => {
    const c = settings().connections[kind]
    return { model: c.model, verifyModel: c.verifyModel }
  }

  const view = () => {
    const s = settings().connections
    const key = keyState()
    const kinds = {}
    for (const kind of ['claude-code', 'codex']) {
      const d = detected[kind] ?? { installed: false, loggedIn: false, version: null, code: null }
      kinds[kind] = { ...d, ...slots(kind), models: modelsFor(kind) }
    }
    const api = detected.api ?? { installed: true, loggedIn: key.hasKey, version: null, code: key.hasKey ? null : 'bad-key' }
    kinds.api = {
      installed: true, loggedIn: api.loggedIn, code: api.code ?? null,
      hasKey: key.hasKey, keyHint: key.keyHint,
      vendor: s.api.vendor, baseUrl: s.api.baseUrl,
      vendors: VENDOR_IDS.map(id => ({ id, label: VENDORS[id].label })),
      ...slots('api'),
      models: modelsFor('api', s.api.vendor),
    }
    const recommended = CONNECTION_KINDS.find(kind => kinds[kind].loggedIn) ?? null
    return { active: s.active, kinds, probes: { ...probes }, recommended }
  }

  const writeConnections = change => {
    const next = change(structuredClone(settings().connections))
    writeSettings(settingsFile, { connections: next })
    emit('connections-changed', null)
    return next
  }

  const loginTitle = () => (locale().resolved === 'en' ? APP_EN : APP).loginWindowTitle

  const handlers = {
    async getConnections() {
      if (!detected['claude-code']) await detectAll()
      return view()
    },
    async detectConnections() {
      await detectAll()
      return view()
    },
    async probeConnection(kind) {
      checkKind(kind)
      return probeConnector(usageWrap(connector(kind)), kind)
    },
    async openLogin(kind) {
      if (!LOGIN_KINDS.includes(kind)) throw new BridgeError('bad_arguments')
      if (devConnection || hidden) {
        log(`connections: login for ${kind} not opened (${devConnection ? `development connection ${devConnection}` : 'a test run'})`)
        return { ok: true, pid: 0 }
      }
      const r = await connector(kind).openLogin({ title: loginTitle() })
      if (!r.ok) { log(`connections: openLogin ${kind}: ${r.code}: ${r.detail ?? ''}`); return { ok: false, code: r.code } }
      log(`connections: login for ${kind} opened (pid ${r.pid})`)
      return { ok: true, pid: r.pid }
    },
    setActiveConnection(kind) {
      if (kind !== null) checkKind(kind)
      const next = writeConnections(c => ({ ...c, active: kind }))
      return { active: next.active }
    },
    setConnectionModels(kind, models) {
      checkKind(kind)
      const slot = v => {
        if (v === null) return null
        if (typeof v !== 'string' || v.trim() === '') throw new BridgeError('bad_arguments')
        return v.trim()
      }
      const model = slot(models.model)
      const verifyModel = slot(models.verifyModel)
      writeConnections(c => ({ ...c, [kind]: { ...c[kind], model, verifyModel } }))
      return { kind, model, verifyModel }
    },
    setApiVendor(vendor, baseUrl) {
      if (!VENDOR_IDS.includes(vendor)) throw new BridgeError('bad_arguments')
      let url = null
      if (vendor === 'custom') {
        if (typeof baseUrl !== 'string' || !HTTP_URL.test(baseUrl.trim())) throw new BridgeError('bad_arguments', 'custom needs an http(s) base address')
        url = baseUrl.trim()
      } else if (baseUrl !== null) {
        throw new BridgeError('bad_arguments', 'baseUrl is for custom only')
      }
      // another vendor means another key file: the API detection is read again
      detected.api = null
      writeConnections(c => ({ ...c, api: { ...c.api, vendor, baseUrl: url } }))
      return { vendor, baseUrl: url }
    },
    setApiKey(vendor, key) {
      if (!VENDOR_IDS.includes(vendor)) throw new BridgeError('bad_arguments')
      if (typeof key !== 'string' || key.trim() === '') throw new BridgeError('bad_arguments')
      try {
        secrets.set(keyRefOf(vendor), key.trim())
      } catch (err) {
        // no_encryption (safeStorage not available) or a disk error: nothing stored; the page gets `internal`
        log(`connections: key for ${vendor} not stored: ${String(err?.code ?? err?.message ?? err)}`)
        throw new BridgeError('internal')
      }
      detected.api = null
      probes.api = null
      emit('connections-changed', null)
      return { vendor, keyHint: keyHint(key.trim()) }
    },
    removeApiKey(vendor) {
      if (!VENDOR_IDS.includes(vendor)) throw new BridgeError('bad_arguments')
      secrets.remove(keyRefOf(vendor))
      detected.api = null
      probes.api = null
      emit('connections-changed', null)
      return { vendor, keyHint: null }
    },
  }

  /** One probe on `c` (a connector, possibly wrapped by a usage counter), recorded under `kind`. */
  async function probeConnector(c, kind) {
    let r
    try { r = await c.probe() } catch (err) { r = { ok: false, latencyMs: 0, code: 'unknown', detail: String(err?.message ?? err) } }
    const out = { ok: r.ok === true, latencyMs: r.latencyMs ?? 0, model: r.model ?? null }
    // redesign R5a (O9): the page gets the kind of failure (its code), not the connection's own text — that goes to the log and
    // the diagnostics (raw-errors.mjs); the page words the code (texts/common.js CONNECTIONS.codes)
    if (!out.ok) {
      out.code = r.code ?? 'unknown'
      try { rawErrors?.note(`probe ${kind}`, { code: out.code, message: r.detail }) } catch { /* the log is best effort */ }
    }
    probes[kind] = { ...out, at: new Date().toISOString() }
    log(`connections: probe ${kind}: ${out.ok ? `ok ${out.latencyMs} ms` : out.code}`)
    return out
  }

  /** The active connection as the pipeline needs it: `{ kind, connection, connector }`, or null when none is chosen. */
  const active = () => {
    const kind = settings().connections.active
    if (!kind) return null
    const conn = connection(kind)
    let model = null
    try { model = resolveModel(conn, 'main') ?? null } catch { model = null }
    let verifyModel = null
    try { verifyModel = resolveModel(conn, 'verify') ?? null } catch { verifyModel = null }
    return { kind, connection: conn, model, verifyModel, connector: connector(kind) }
  }

  /** Lines for the diagnostics: detection and the active choice, never a key or its hint. */
  const diagnosticLines = () => {
    const s = settings().connections
    const lines = [`connection: active ${s.active ?? 'none'}${devConnection ? ` (development: ${devConnection})` : ''}`]
    for (const kind of ['claude-code', 'codex']) {
      const d = detected[kind]
      const c = s[kind]
      lines.push(`  ${kind}: ${d ? `installed ${d.installed} · loggedIn ${d.loggedIn} · version ${d.version ?? '-'}${d.code ? ` · ${d.code}` : ''}` : 'not detected yet'} · model ${c.model ?? 'default'} · verify ${c.verifyModel ?? 'same'}`)
    }
    lines.push(`  api: vendor ${s.api.vendor} · baseUrl ${s.api.baseUrl ?? '-'} · key ${secrets.has(keyRefOf(s.api.vendor)) ? 'stored' : 'none'} · model ${s.api.model ?? 'default'} · verify ${s.api.verifyModel ?? 'same'}`)
    for (const kind of CONNECTION_KINDS) if (probes[kind]) lines.push(`  probe ${kind}: ${probes[kind].ok ? `ok ${probes[kind].latencyMs} ms` : probes[kind].code} at ${probes[kind].at}`)
    return lines
  }

  // v2 package M: the current connection's kind, for the quota service (services/quota.mjs) — the setting only, no detection
  const activeKind = () => settings().connections.active ?? null

  return { handlers, active, activeKind, connector, sessionConnector, connection, probeConnector, diagnosticLines, devConnection }
}
