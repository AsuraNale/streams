// v2 package M (docs/checks/2026-11-10-wp-m/contract.md M4; docs/desktop.md §4.11): the quota service in plain Node.
//   - getQuota gives the current connection's only, through the allowlist; null with none chosen;
//   - Claude Code: a real call through the connections service (a stand-in for spawn printing the 11-10 stream) records the
//     plan's windows and sends quota-changed; a call without the event changes nothing;
//   - Codex: read at start, every 10 minutes, after a round / a turn — only while Codex is the current connection;
//   - the API: read at start and after a round, only for a vendor with a balance endpoint; the key from the secret store, never
//     in a log line; another vendor → null; a vendor without an endpoint → null and no request;
//   - a failed read forgets the old numbers; the development file; nothing real read with it;
//   - nothing written to disk; main.mjs wires it; the bridge and event tables carry getQuota / quota-changed.
// Each check first shows the input that makes it fail.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { CODEX_EVERY_MS, createQuotaService } from '../src/main/services/quota.mjs'
import { BRIDGE_METHODS } from '../src/main/bridge-methods.mjs'
import { EVENT_TOPICS } from '../src/main/events.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
const world = () => { const w = testWorld('st-quota-'); worlds.push(w); return w }
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })

const AT = '2026-11-10T15:00:00.000Z'
const CLAUDE_Q = { source: 'claude-code', at: AT, windows: [{ id: 'five_hour', usedPercent: 5, resetsAt: 1794339000 }, { id: 'seven_day', usedPercent: 11, resetsAt: 1794603600 }] }
const CODEX_Q = { source: 'codex', at: AT, plan: 'prolite', windows: [{ id: 'primary', usedPercent: 28, windowMins: 10080, resetsAt: 1794417106 }] }
const DS_Q = { source: 'api', at: AT, vendor: 'deepseek', balance: [{ currency: 'CNY', amount: 110 }], available: true }
const KEY = 'sk-deepseek-test-0123456789abcdef'

/** A stand-in for spawn: `claude` prints the stream it is given (with or without the rate_limit_event). */
function streamSpawn(withEvent) {
  const lines = [
    { type: 'system', subtype: 'init', tools: [] },
    ...(withEvent ? [{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.05, resetsAt: 1794339000 }, seven_day: { utilization: 0.11, resetsAt: 1794603600 } } } }] : []),
    { type: 'result', subtype: 'success', is_error: false, result: '{"ok":true}', usage: { input_tokens: 1, output_tokens: 1 } },
  ]
  return (_file, args) => {
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => true
    child.stdin = new Writable({ write(_c, _e, cb) { cb() }, final(cb) { cb(); setImmediate(() => { child.stdout.end(args[0] === '--version' ? '2.1.287\n' : `${lines.map(l => JSON.stringify(l)).join('\n')}\n`); child.stderr.end(); setImmediate(() => child.emit('close', 0, null)) }) } })
    setImmediate(() => child.emit('spawn'))
    return child
  }
}

function setup(w, { readCodex, readBalance, connectorDeps = {}, devQuotaFile = null, devConnection = null } = {}) {
  const timers = { fns: [], set(fn, ms) { this.fns.push({ fn, ms }); return { unref() {} } }, clear() { this.fns = [] } }
  let quota = null
  const connections = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale: () => w.locale, connectorDeps, onQuota: (kind, q) => quota.record(kind, q) })
  quota = createQuotaService({ connections, activeKind: () => connections.activeKind(), secrets: w.secrets, emit: w.emit, log: w.log, readCodex, readBalance, timers, devQuotaFile, devConnection })
  return { connections, quota, timers }
}

test('getQuota: null with no connection chosen; the current connection\'s only; quota-changed on every change', () => {
  const w = world()
  const { connections, quota } = setup(w)
  assert.equal(quota.record('claude-code', CLAUDE_Q), true)
  assert.equal(quota.handlers.getQuota(), null, 'none chosen: nothing, even with numbers kept')
  connections.handlers.setActiveConnection('claude-code')
  assert.deepEqual(quota.handlers.getQuota(), CLAUDE_Q)
  connections.handlers.setActiveConnection('codex')
  assert.equal(quota.handlers.getQuota(), null, 'another current connection: not Claude Code\'s numbers')
  assert.deepEqual(w.eventsOf('quota-changed').map(e => e.payload), [{ kind: 'claude-code' }])
  // the allowlist: a kind that does not match, a broken shape, extra keys
  assert.equal(quota.record('codex', CLAUDE_Q), false)
  assert.equal(quota.record('codex', { ...CODEX_Q, windows: [{ id: 'primary', usedPercent: 'many', windowMins: 1, resetsAt: 1 }] }), false)
  assert.equal(quota.record('codex', { ...CODEX_Q, accountId: 'acct-1', credits: { balance: '9' } }), true)
  assert.deepEqual(quota.handlers.getQuota(), CODEX_Q, 'only the allowlisted fields')
})

test('Claude Code: a real call through the connections service records the stream\'s windows; one without the event does not', async () => {
  const w = world()
  const bin = join(w.root, 'bin')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'claude.exe'), '')
  const env = { PATH: bin, Path: bin, PATHEXT: '.EXE' }
  const tmpRoot = join(w.root, 'tmp')
  const without = setup(w, { connectorDeps: { env, tmpRoot, spawnImpl: streamSpawn(false) } })
  without.connections.handlers.setActiveConnection('claude-code')
  const r0 = await without.connections.connector('claude-code').complete({ prompt: 'x', format: 'json' })
  assert.equal(r0.ok, true, JSON.stringify(r0))
  assert.equal(without.quota.handlers.getQuota(), null, 'reverse: no event, nothing recorded')
  const withEv = setup(w, { connectorDeps: { env, tmpRoot, spawnImpl: streamSpawn(true) } })
  const r = await withEv.connections.connector('claude-code').complete({ prompt: 'x', format: 'json' })
  assert.equal(r.ok, true)
  assert.deepEqual(withEv.quota.handlers.getQuota().windows, CLAUDE_Q.windows)
  assert.equal(w.eventsOf('quota-changed').length, 1)
  // the main agent's session connector carries it too
  w.events.length = 0
  const cwd = join(w.root, 'agent-cwd')
  const t = await withEv.connections.sessionConnector('claude-code', { cwd }).send({ prompt: 'hi', format: 'json' })
  assert.equal(t.ok, true)
  assert.equal(w.eventsOf('quota-changed').length, 1)
})

test('Codex: read at start, every 10 minutes and after a round or a turn — only while Codex is the current connection', async () => {
  const w = world()
  const reads = []
  const readCodex = async (conn) => { reads.push(conn.kind); return { ok: true, quota: CODEX_Q } }
  const { connections, quota, timers } = setup(w, { readCodex, readBalance: async () => { throw new Error('not for codex') } })
  connections.handlers.setActiveConnection('claude-code')
  quota.start()
  await quota.afterTurn('a round ended')
  assert.equal(timers.fns.length, 1)
  assert.equal(timers.fns[0].ms, CODEX_EVERY_MS)
  assert.equal(CODEX_EVERY_MS, 600_000)
  timers.fns[0].fn()
  assert.deepEqual(reads, [], 'reverse: Claude Code current — no codex is started')
  connections.handlers.setActiveConnection('codex')
  await quota.connectionsChanged()
  assert.deepEqual(reads, ['codex'], 'the current connection changed to Codex: read')
  assert.deepEqual(quota.handlers.getQuota(), CODEX_Q)
  timers.fns[0].fn()
  await new Promise(r => setImmediate(r))
  await quota.afterTurn('a round ended')
  await quota.afterTurn('a turn of the main agent ended')
  assert.deepEqual(reads, ['codex', 'codex', 'codex', 'codex'], 'every 10 minutes, after a round, after a turn')
  quota.stop()
  assert.equal(timers.fns.length, 0)
  // a second start reads at start
  const w2 = world()
  const reads2 = []
  const two = setup(w2, { readCodex: async () => { reads2.push(1); return { ok: true, quota: CODEX_Q } } })
  two.connections.handlers.setActiveConnection('codex')
  two.quota.start()
  await new Promise(r => setTimeout(r, 20))
  assert.equal(reads2.length, 1, 'read at start')
})

test('a failed read forgets the old numbers (quota-changed), and its detail is not logged', async () => {
  const w = world()
  let answer = { ok: true, quota: CODEX_Q }
  const { connections, quota } = setup(w, { readCodex: async () => answer })
  connections.handlers.setActiveConnection('codex')
  await quota.refresh('test')
  assert.deepEqual(quota.handlers.getQuota(), CODEX_Q)
  w.events.length = 0
  answer = { ok: false, code: 'timeout', detail: 'server said SECRET-DETAIL' }
  await quota.refresh('test')
  assert.equal(quota.handlers.getQuota(), null)
  assert.deepEqual(w.eventsOf('quota-changed').map(e => e.payload), [{ kind: 'codex' }])
  assert.ok(w.lines.some(l => l.includes('quota: codex not read (test): timeout')))
  assert.ok(!w.lines.some(l => l.includes('SECRET-DETAIL')))
})

test('API: a vendor with a balance endpoint is read with the stored key (never logged); another vendor or one without an endpoint shows nothing', async () => {
  const w = world()
  const calls = []
  const readBalance = async (conn, deps) => { calls.push({ vendor: conn.api.vendor, key: deps.getKey(conn.api.keyRef) }); return { ok: true, quota: { ...DS_Q, vendor: conn.api.vendor } } }
  const { connections, quota } = setup(w, { readBalance, readCodex: async () => { throw new Error('not for the API') } })
  connections.handlers.setActiveConnection('api')
  // the default vendor is anthropic: no endpoint, no request, nothing shown even with a balance kept
  await quota.refresh('start')
  assert.deepEqual(calls, [])
  quota.record('api', { ...DS_Q, vendor: 'anthropic' })
  assert.equal(quota.handlers.getQuota(), null, 'no endpoint for the vendor: nothing (the "no interface" state)')
  connections.handlers.setApiVendor('deepseek', null)
  connections.handlers.setApiKey('deepseek', KEY)
  await quota.connectionsChanged()
  assert.deepEqual(calls, [{ vendor: 'deepseek', key: KEY }], 'the key from the secret store')
  assert.deepEqual(quota.handlers.getQuota(), DS_Q)
  await quota.afterTurn('a round ended')
  assert.equal(calls.length, 2, 'after a round')
  // another vendor chosen: the kept deepseek balance is not shown for it
  connections.handlers.setApiVendor('openai', null)
  assert.equal(quota.handlers.getQuota(), null)
  assert.ok(!w.lines.join('\n').includes(KEY), 'the key in no log line')
  assert.ok(!JSON.stringify(w.events).includes(KEY), 'nor in an event')
})

test('the development file: taken as read (each through the allowlist); with it nothing real is read', async () => {
  const w = world()
  const file = join(w.root, 'quota.json')
  writeFileSync(file, JSON.stringify({ 'claude-code': CLAUDE_Q, codex: { source: 'codex', at: AT, windows: 'broken' }, api: DS_Q }))
  let reads = 0
  const { connections, quota } = setup(w, { devQuotaFile: file, readCodex: async () => { reads++; return { ok: true, quota: CODEX_Q } }, readBalance: async () => { reads++; return { ok: true, quota: DS_Q } } })
  quota.start()
  connections.handlers.setActiveConnection('claude-code')
  assert.deepEqual(quota.handlers.getQuota(), CLAUDE_Q)
  connections.handlers.setActiveConnection('codex')
  await quota.refresh('test')
  assert.equal(quota.handlers.getQuota(), null, 'the broken entry was not taken')
  assert.equal(reads, 0, 'no real read with the development file')
  assert.ok(w.lines.some(l => l.includes('development codex not in the shape')))
  quota.stop()
})

test('nothing is written to disk: the service has no write call, and the world\'s files are the same after its work', async () => {
  const src = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'services', 'quota.mjs'), 'utf8')
  const WRITES = /\b(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|createWriteStream|rename|renameSync|copyFile|cpSync|rmSync|unlink)\b/
  assert.ok(WRITES.test('import { writeFileSync } from "node:fs"'), 'control: the pattern finds a write')
  assert.ok(!WRITES.test(src.replace(/^\s*(\*|\/\/).*$/gm, '')), 'no write in services/quota.mjs')
  const w = world()
  const { connections, quota } = setup(w, { readCodex: async () => ({ ok: true, quota: CODEX_Q }) })
  connections.handlers.setActiveConnection('codex')
  const list = dir => readdirSync(dir, { recursive: true }).map(String).sort().map(f => `${f}:${statSync(join(dir, f)).size}`)
  const before = list(w.root)
  quota.start()
  await quota.refresh('test')
  quota.record('claude-code', CLAUDE_Q)
  quota.handlers.getQuota()
  quota.stop()
  assert.deepEqual(list(w.root), before)
})

test('main.mjs wires it: the connections hand it every call\'s quota, the events after a round / a turn / a settings change, the bridge, the guarded development file', () => {
  const main = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'main.mjs'), 'utf8')
  assert.match(main, /onQuota: \(kind, q\) => quota\?\.record\(kind, q\)/)
  assert.match(main, /createQuotaService\(\{[^}]*devQuotaFile: DEV_QUOTA[^}]*\}\)/)
  assert.match(main, /\.\.\.quota\.handlers/)
  assert.match(main, /topic === 'round-progress' && payload\?\.done === true\) void quota\.afterTurn/)
  assert.match(main, /topic === 'agent-changed' && payload\?\.phase === 'done'\) void quota\.afterTurn/)
  assert.match(main, /topic === 'connections-changed'\) void quota\.connectionsChanged/)
  assert.match(main, /quota\.start\(\)/)
  const guarded = (src, name, env) => new RegExp(`^const ${name} = !app\\.isPackaged && [^\\n]*process\\.env\\.${env}`, 'm').test(src)
  assert.ok(guarded(main, 'DEV_QUOTA', 'STREAMS_DEV_QUOTA'))
  assert.ok(!guarded(main.replace('const DEV_QUOTA = !app.isPackaged && ', 'const DEV_QUOTA = '), 'DEV_QUOTA', 'STREAMS_DEV_QUOTA'), 'reverse: without the guard the check fails')
  assert.deepEqual(BRIDGE_METHODS.getQuota, { args: 0 })
  assert.ok(Object.hasOwn(EVENT_TOPICS, 'quota-changed'))
})
