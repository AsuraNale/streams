// The bridge, without Electron: the preload, the main process's tables and docs/desktop.md §四 name the same
// methods and the same event topics; the preload exposes one object and nothing of electron itself; every call
// answers with an envelope. (The running page is checked in security.test.mjs and events.test.mjs.)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRIDGE_METHODS, BridgeError, ERROR_CODES, assertHandlers, channelOf, checkArgs, methodNames, runHandler } from '../src/main/bridge-methods.mjs'
import { EVENT_CHANNEL, EVENT_TOPICS } from '../src/main/events.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { bridgeTable, eventsTable } from './support/docs.mjs'

const PRELOAD = readFileSync(join(DESKTOP_DIR, 'src', 'preload', 'preload.cjs'), 'utf8')

/** A `const NAME = ['a', 'b']` list of the preload, read from its source (it cannot be loaded outside Electron). */
function preloadList(source, name) {
  const m = new RegExp(`^const ${name} = \\[([^\\]]*)\\]$`, 'm').exec(source)
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null
}

test('methods: the preload, BRIDGE_METHODS and docs/desktop.md §四 agree (the table also lists onEvent)', () => {
  const methods = methodNames().slice().sort()
  assert.ok(methods.length > 0)
  assert.deepEqual(preloadList(PRELOAD, 'METHODS')?.slice().sort(), methods, 'preload.cjs METHODS')
  assert.deepEqual(bridgeTable().slice().sort(), [...methods, 'onEvent'].sort(), 'docs/desktop.md bridge table')
  // the readers can fail: another name is told apart
  assert.notDeepEqual(bridgeTable('<!-- bridge:begin -->\n| `readFile(path)` | x |\n<!-- bridge:end -->'), methods)
  assert.deepEqual(preloadList("const METHODS = ['a', 'b']", 'METHODS'), ['a', 'b'])
})

test('event topics: the preload, events.mjs and docs/desktop.md §四 agree; one channel', () => {
  const topics = Object.keys(EVENT_TOPICS).sort()
  assert.ok(topics.length > 0)
  assert.deepEqual(preloadList(PRELOAD, 'EVENT_TOPICS')?.slice().sort(), topics, 'preload.cjs EVENT_TOPICS')
  assert.deepEqual(eventsTable().slice().sort(), topics, 'docs/desktop.md events table')
  assert.equal(EVENT_CHANNEL, 'streams:event')
  assert.match(PRELOAD, /^const EVENT_CHANNEL = 'streams:event'$/m)
  assert.throws(() => eventsTable('<!-- events:begin -->\n| `Bad Topic` | x |\n<!-- events:end -->'))
})

test('the preload exposes exactly one object and hands out nothing of electron', () => {
  const code = PRELOAD.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n')
  assert.equal((code.match(/exposeInMainWorld\(/g) ?? []).length, 1, 'one exposeInMainWorld')
  assert.match(code, /contextBridge\.exposeInMainWorld\('streams', Object\.freeze\(bridge\)\)/)
  assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['electron'], 'requires only electron')
  // ipcRenderer: taken from electron, invoked for the methods, listened on for the one event channel — never handed on
  assert.deepEqual([...code.matchAll(/ipcRenderer\.(\w+)/g)].map(m => m[1]), ['invoke', 'on'])
  assert.equal((code.match(/\bipcRenderer\b/g) ?? []).length, 3)
  assert.match(code, /bridge\[name\] = \(\.\.\.args\) => ipcRenderer\.invoke\(channel, \.\.\.\(prepare \? prepare\(\.\.\.args\) : args\)\)/)
  // nothing of webUtils today (a method taking dropped files would read their paths there, never in the page)
  assert.deepEqual([...code.matchAll(/webUtils\.(\w+)/g)].map(m => m[1]), [])
  assert.match(code, /ipcRenderer\.on\(EVENT_CHANNEL, \(_event, message\) =>/)
  assert.match(code, /callback\(message\.payload\)/, 'the page gets the payload, never the IPC event')
})

test('channels and argument checks', () => {
  assert.equal(channelOf('getAppState'), 'streams:getAppState')
  for (const name of methodNames()) assert.equal(typeof BRIDGE_METHODS[name].args, 'number')
  assert.doesNotThrow(() => checkArgs('getAppState', []))
  assert.throws(() => checkArgs('getAppState', ['C:\\']), err => err instanceof BridgeError && err.code === 'bad_arguments')
  assert.doesNotThrow(() => checkArgs('setLanguage', ['en']))
  assert.throws(() => checkArgs('setLanguage', ['fr']), err => err.code === 'bad_arguments')
  assert.throws(() => checkArgs('readFile', []), err => err.code === 'internal')
})

test('every call answers with an envelope: data, or an error code (never a stack)', async () => {
  const log = []
  assert.deepEqual(await runHandler('getAppState', async () => ({ x: 1 }), [], l => log.push(l)), { ok: true, data: { x: 1 } })
  assert.deepEqual(await runHandler('getAppState', () => 1, ['extra'], l => log.push(l)), { ok: false, error: { code: 'bad_arguments' } })
  assert.deepEqual(await runHandler('getAppState', () => { throw new Error('C:\\secret\\path') }, [], l => log.push(l)), { ok: false, error: { code: 'internal' } })
  assert.deepEqual(await runHandler('copyDiagnostics', () => { throw new BridgeError('open_failed') }, [], l => log.push(l)), { ok: false, error: { code: 'open_failed' } })
  assert.equal(new BridgeError('made_up').code, 'internal', 'only known codes go out')
  assert.ok(ERROR_CODES.includes('refused'))
  assert.ok(log.some(l => l.includes('C:\\secret\\path')), 'the details go to the app log')
})

test('the main process refuses to start with a handler missing or extra', () => {
  const handlers = Object.fromEntries(methodNames().map(n => [n, () => null]))
  assert.doesNotThrow(() => assertHandlers(handlers))
  const missing = { ...handlers }
  delete missing[methodNames()[0]]
  assert.throws(() => assertHandlers(missing))
  assert.throws(() => assertHandlers({ ...handlers, readFile: () => null }))
  assert.throws(() => assertHandlers({ ...handlers, [methodNames()[0]]: 'not a function' }))
})
