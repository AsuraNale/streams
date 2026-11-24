// The connections service (src/main/services/connections.mjs) in plain Node: the page gets detection, the model tables,
// `hasKey` and a hint — never a key; a key goes into the secret store once and the answer carries only its hint; the
// settings take only known kinds, vendors and model ids; the development hook replaces every kind with the core's fake;
// a probe is recorded; the diagnostics lines name no key. Each case first shows the refused input really is refused.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createConnectionsService, keyRefOf } from '../src/main/services/connections.mjs'
import { readSettings } from '../src/main/settings.mjs'
import { VENDOR_IDS } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
const world = () => { const w = testWorld('st-connections-'); worlds.push(w); return w }
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })

// no claude / codex on this PATH (so nothing of the machine is touched), and an API that answers the probe
const NO_TOOLS = { PATH: '', PATHEXT: '.EXE' }
const apiAnswer = { content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 5, output_tokens: 3 }, model: 'claude-test', stop_reason: 'end_turn' }
const fetchImpl = async () => new Response(JSON.stringify(apiAnswer), { status: 200, headers: { 'content-type': 'application/json' } })
const KEY = 'sk-ant-test-0123456789abcdef'

const service = (w, extra = {}) => createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale: () => w.locale, connectorDeps: { env: NO_TOOLS, fetchImpl }, ...extra })

test('getConnections: the documented shape, detection from the core (nothing installed here), tables from the core, no key', async () => {
  const w = world()
  const s = service(w)
  const c = await s.handlers.getConnections()
  assert.deepEqual(Object.keys(c).sort(), ['active', 'kinds', 'probes', 'recommended', 'search'])
  // 1.1.1 P5: the API connection's search — no key at all: none
  assert.deepEqual(c.search, { from: null, modelIsDeepSeek: false, hasKey: false, keyHint: null })
  assert.equal(c.active, null)
  assert.equal(c.recommended, null, 'nothing logged in, no key')
  assert.deepEqual(c.probes, { 'claude-code': null, codex: null, api: null })
  for (const kind of ['claude-code', 'codex']) {
    const k = c.kinds[kind]
    assert.equal(k.installed, false, kind)
    assert.equal(k.loggedIn, false, kind)
    assert.equal(k.code, 'not-installed', kind)
    assert.equal(k.model, null)
    assert.equal(k.verifyModel, null)
    assert.ok(Array.isArray(k.models) && k.models.length > 0 && k.models.some(m => m.recommended), `${kind}: a model table with a recommended entry`)
    assert.ok(k.models.every(m => typeof m.id === 'string' && typeof m.label === 'string'))
  }
  const api = c.kinds.api
  assert.equal(api.installed, true, 'api.installed is always true')
  assert.deepEqual([api.loggedIn, api.hasKey, api.keyHint, api.vendor, api.baseUrl, api.code], [false, false, null, 'anthropic', null, 'bad-key'])
  assert.deepEqual(api.vendors.map(v => v.id), VENDOR_IDS)
  assert.ok(api.vendors.every(v => typeof v.label === 'string'))
  assert.ok(api.models.some(m => m.id === 'claude-opus-5-5'))
  assert.equal(JSON.stringify(c).includes('key-'), false, 'no key reference in the answer either')
  // detection ran once for getConnections and is kept; detectConnections runs it again
  const before = w.lines.filter(l => l.startsWith('connections: detected')).length
  await s.handlers.getConnections()
  assert.equal(w.lines.filter(l => l.startsWith('connections: detected')).length, before)
  await s.handlers.detectConnections()
  assert.equal(w.lines.filter(l => l.startsWith('connections: detected')).length, before + 1)
})

test('setApiKey: stored encrypted under key-<vendor>, the answer is a hint only; hasKey and recommended follow; removeApiKey clears it', async () => {
  const w = world()
  const s = service(w)
  await assert.rejects(async () => s.handlers.setApiKey('nope', KEY), err => err.code === 'bad_arguments')
  await assert.rejects(async () => s.handlers.setApiKey('anthropic', '   '), err => err.code === 'bad_arguments')
  assert.equal(readdirSync(w.root).includes('secrets'), false, 'nothing stored by a refused call')
  const r = s.handlers.setApiKey('anthropic', KEY)
  assert.deepEqual(r, { vendor: 'anthropic', keyHint: `sk-${'•'.repeat(14)}cdef` })
  assert.equal(JSON.stringify(r).includes(KEY), false)
  const file = join(w.root, 'secrets', `${keyRefOf('anthropic')}.bin`)
  assert.ok(existsSync(file))
  assert.equal(readFileSync(file, 'utf8').includes(KEY), false, 'not in plain text on disk')
  assert.equal(existsSync(w.settingsFile) && readFileSync(w.settingsFile, 'utf8').includes(KEY), false, 'never in settings.json')
  assert.ok(w.lines.every(l => !l.includes(KEY)), 'never in the log')
  assert.deepEqual(w.eventsOf('connections-changed').length, 1)
  const c = await s.handlers.getConnections()
  assert.deepEqual([c.kinds.api.hasKey, c.kinds.api.keyHint, c.kinds.api.loggedIn, c.kinds.api.code, c.recommended], [true, r.keyHint, true, null, 'api'])
  // a probe: one real request to the (fake) API, recorded
  const p = await s.handlers.probeConnection('api')
  assert.deepEqual([p.ok, p.model, typeof p.latencyMs], [true, 'claude-test', 'number'])
  assert.equal((await s.handlers.getConnections()).probes.api.ok, true)
  assert.match((await s.handlers.getConnections()).probes.api.at, /^\d{4}-\d{2}-\d{2}T/)
  // the diagnostics name the vendor and that a key is stored, not the key nor its hint
  const lines = s.diagnosticLines().join('\n')
  assert.ok(lines.includes('api: vendor anthropic') && lines.includes('key stored'), lines)
  assert.equal(lines.includes(KEY) || lines.includes('cdef'), false, lines)
  // remove
  assert.deepEqual(s.handlers.removeApiKey('anthropic'), { vendor: 'anthropic', keyHint: null })
  assert.equal(existsSync(file), false)
  const after = await s.handlers.getConnections()
  assert.deepEqual([after.kinds.api.hasKey, after.kinds.api.keyHint, after.probes.api], [false, null, null])
  // safeStorage gone: the key is not stored and the page gets `internal`
  w.safeStorage.available = false
  await assert.rejects(async () => s.handlers.setApiKey('anthropic', KEY), err => err.code === 'internal')
  assert.equal(existsSync(file), false)
})

test('the settings: active kind, model slots, vendor and base address — checked, written, announced', async () => {
  const w = world()
  const s = service(w)
  await assert.rejects(async () => s.handlers.setActiveConnection('ollama'), err => err.code === 'bad_arguments')
  assert.deepEqual(s.handlers.setActiveConnection('codex'), { active: 'codex' })
  assert.equal(readSettings(w.settingsFile).connections.active, 'codex')
  assert.deepEqual(s.handlers.setActiveConnection(null), { active: null })
  await assert.rejects(async () => s.handlers.setConnectionModels('codex', { model: '', verifyModel: null }), err => err.code === 'bad_arguments')
  await assert.rejects(async () => s.handlers.setConnectionModels('codex', { model: 7, verifyModel: null }), err => err.code === 'bad_arguments')
  assert.deepEqual(s.handlers.setConnectionModels('codex', { model: ' gpt-6-luna ', verifyModel: null }), { kind: 'codex', model: 'gpt-6-luna', verifyModel: null })
  assert.deepEqual(readSettings(w.settingsFile).connections.codex, { model: 'gpt-6-luna', verifyModel: null })
  assert.deepEqual((await s.handlers.getConnections()).kinds.codex.model, 'gpt-6-luna')
  await assert.rejects(async () => s.handlers.setApiVendor('nope', null), err => err.code === 'bad_arguments')
  await assert.rejects(async () => s.handlers.setApiVendor('custom', null), err => err.code === 'bad_arguments', 'custom needs an address')
  await assert.rejects(async () => s.handlers.setApiVendor('custom', 'llm.example/v1'), err => err.code === 'bad_arguments', 'http(s) only')
  await assert.rejects(async () => s.handlers.setApiVendor('openai', 'https://x/v1'), err => err.code === 'bad_arguments', 'a preset takes no address')
  assert.deepEqual(s.handlers.setApiVendor('deepseek', null), { vendor: 'deepseek', baseUrl: null })
  assert.deepEqual(s.handlers.setApiVendor('custom', ' https://llm.example/v1 '), { vendor: 'custom', baseUrl: 'https://llm.example/v1' })
  const c = await s.handlers.getConnections()
  assert.deepEqual([c.kinds.api.vendor, c.kinds.api.baseUrl, c.kinds.api.models], ['custom', 'https://llm.example/v1', []])
  assert.equal(w.eventsOf('connections-changed').length, 5, 'one per accepted write, none for a refused one')
  // the connection object the core gets (no key on it, the key reference only)
  assert.deepEqual(s.connection('api'), { kind: 'api', api: { vendor: 'custom', keyRef: 'key-custom', baseUrl: 'https://llm.example/v1' } })
  assert.deepEqual(s.connection('codex'), { kind: 'codex', model: 'gpt-6-luna' })
  assert.equal(s.active(), null)
  s.handlers.setActiveConnection('codex')
  const a = s.active()
  assert.deepEqual([a.kind, a.model, a.verifyModel, typeof a.connector.complete], ['codex', 'gpt-6-luna', 'gpt-6-luna', 'function'])
})

test('openLogin: api is refused; without the tool the core says not-installed; a hidden run only logs', async () => {
  const w = world()
  const s = service(w)
  await assert.rejects(async () => s.handlers.openLogin('api'), err => err.code === 'bad_arguments')
  assert.deepEqual(await s.handlers.openLogin('claude-code'), { ok: false, code: 'not-installed' })
  const hidden = service(w, { hidden: true })
  assert.deepEqual(await hidden.handlers.openLogin('codex'), { ok: true, pid: 0 })
  assert.ok(w.lines.some(l => l.includes('login for codex not opened')))
})

test('STREAMS_DEV_CONNECTION: every kind is the fake; detect says installed and logged in; login-expired fails the probe', async () => {
  const w = world()
  assert.throws(() => service(w, { devConnection: 'made-up' }), TypeError)
  const fake = service(w, { devConnection: 'fake' })
  const c = await fake.handlers.getConnections()
  for (const kind of ['claude-code', 'codex', 'api']) assert.deepEqual([c.kinds[kind].installed, c.kinds[kind].loggedIn, c.kinds[kind].code], [true, true, null], kind)
  assert.equal(c.kinds['claude-code'].version, 'fake')
  assert.equal(c.recommended, 'claude-code')
  assert.equal((await fake.handlers.probeConnection('codex')).ok, true)
  assert.deepEqual(await fake.handlers.openLogin('claude-code'), { ok: true, pid: 0 })
  assert.ok(w.lines.some(l => l.includes('development connection fake')))
  const expired = service(w, { devConnection: 'login-expired' })
  const e = await expired.handlers.detectConnections()
  assert.deepEqual([e.kinds['claude-code'].loggedIn, e.kinds['claude-code'].code, e.recommended], [false, 'login-expired', null])
  const p = await expired.handlers.probeConnection('claude-code')
  assert.deepEqual([p.ok, p.code], [false, 'login-expired'])
  assert.ok(expired.diagnosticLines()[0].includes('development: login-expired'))
  const once = service(w, { devConnection: 'bad-format-once' })
  const r1 = await once.connector('api').complete({ prompt: 'x', format: 'json' })
  assert.equal(r1.code, 'bad-format', 'the first call is bad format')
})
