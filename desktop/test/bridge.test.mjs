// The bridge, without Electron: the preload, the main process's tables and docs/desktop.md §四 name the same
// methods and the same event topics; the preload exposes one object and nothing of electron itself; every call
// answers with an envelope. (The running page is checked in security.test.mjs and events.test.mjs.)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRIDGE_METHODS, BridgeError, CORE_BAD_ARGUMENT_CODES, ERROR_CODES, assertHandlers, bridgeErrorOf, channelOf, checkArgs, coreCaller, methodNames, runHandler } from '../src/main/bridge-methods.mjs'
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
  // the library, the connections, the pipeline: what the page may send, and what it may not
  const ok = (name, args) => assert.doesNotThrow(() => checkArgs(name, args), `${name}(${JSON.stringify(args)})`)
  const bad = (name, args) => assert.throws(() => checkArgs(name, args), err => err.code === 'bad_arguments', `${name}(${JSON.stringify(args)}) accepted`)
  ok('useChosenFolder', ['']); bad('useChosenFolder', [null]); bad('useChosenFolder', ['a', 'b'])
  ok('openRecentLibrary', ['C:\\lib']); bad('openRecentLibrary', ['']); bad('openRecentLibrary', [])
  ok('probeConnection', ['api']); bad('probeConnection', ['ollama'])
  ok('openLogin', ['codex']); bad('openLogin', ['api'])
  ok('setActiveConnection', [null]); ok('setActiveConnection', ['claude-code']); bad('setActiveConnection', ['x'])
  ok('setConnectionModels', ['codex', { model: 'm', verifyModel: null }]); bad('setConnectionModels', ['codex', { model: 1, verifyModel: null }]); bad('setConnectionModels', ['codex', null]); bad('setConnectionModels', ['codex', []])
  ok('setApiVendor', ['custom', 'https://x/v1']); ok('setApiVendor', ['openai', null]); bad('setApiVendor', ['openai', 7]); bad('setApiVendor', ['', null])
  ok('setApiKey', ['anthropic', 'sk-x']); bad('setApiKey', ['anthropic', '']); bad('setApiKey', ['anthropic', 5]); bad('setApiKey', ['anthropic'])
  ok('removeApiKey', ['anthropic']); bad('removeApiKey', [''])
  ok('keepItem', ['https://x/1']); bad('keepItem', [''])
  // redesign R2 (N03): 放弃 is held, its reason comes when the bar closes (settleDismiss) — dismissItem takes the url alone
  ok('dismissItem', ['https://x/1']); bad('dismissItem', ['https://x/1', 'why']); bad('dismissItem', [''])
  ok('settleDismiss', [null, null]); ok('settleDismiss', ['写一句', null]); ok('settleDismiss', ['营销内容', 'marketing']); bad('settleDismiss', [null, 'made-up']); bad('settleDismiss', ['x'.repeat(301), null]); bad('settleDismiss', [7, null]); bad('settleDismiss', [null])
  ok('undoDismiss', []); bad('undoDismiss', ['x'])
  ok('laterItem', ['https://x/1']); bad('laterItem', [1])
  ok('openItemUrl', ['https://x/1']); bad('openItemUrl', [''])
  for (const name of ['chooseLibraryFolder', 'rebuildIndex', 'revealLibrary', 'getConnections', 'detectConnections', 'getHome', 'startRound', 'cancelRound', 'getRoundState', 'getInbox']) { ok(name, []); bad(name, ['x']) }
  // 1.1 W7b: v1.0's scoring pipeline, v2's main agent, its cards and 系统检测 are gone from the bridge: such a name is no method
  for (const name of ['applyStarterPack', 'estimateRound', 'setRoundCap', 'moveToInbox', 'getPipelineSettings', 'createNewLibrary', 'getStrictness', 'setStrictness',
    'listProposals', 'confirmProposal', 'agentSend', 'listToConfirm', 'actOnSuggestion', 'startRescore', 'trySource', 'addSource', 'addManualLink', 'setBrief',
    'getPipeline', 'savePipeline', 'previewNode', 'getStatus', 'sendLibraryMessage', 'resolveLibraryMessage']) {
    assert.throws(() => checkArgs(name, []), err => err.code === 'internal', `${name} is still a bridge method`)
  }
})

test('interface B: what the page may send to the new methods, and what it may not', () => {
  const ok = (name, args) => assert.doesNotThrow(() => checkArgs(name, args), `${name}(${JSON.stringify(args)})`)
  const bad = (name, args) => assert.throws(() => checkArgs(name, args), err => err.code === 'bad_arguments', `${name}(${JSON.stringify(args)}) accepted`)
  const long = n => 'x'.repeat(n)
  // the library and reading
  ok('getLibrary', ['kept', { topics: ['a'], days: 30 }]); ok('getLibrary', ['pending', null]); ok('getLibrary', ['authored', {}])
  // 1.1 W7b: v1.0's 'caught' (fetched, not past its gates) went with the scoring pipeline
  bad('getLibrary', ['caught', { topics: [], days: null }])
  // redesign R3: 'all' is a view now (资料库 「全部」: every file of the library)
  ok('getLibrary', ['all', {}]); bad('getLibrary', ['everything', {}]); bad('getLibrary', ['kept']); bad('getLibrary', ['kept', { topics: 'a' }]); bad('getLibrary', ['kept', { days: 0 }]); bad('getLibrary', ['kept', { days: 1.5 }])
  bad('getLibrary', ['kept', { topics: [1] }]); bad('getLibrary', ['kept', { path: 'C:\\' }]); bad('getLibrary', ['kept', { topics: Array(51).fill('a') }])
  ok('searchLibrary', ['记忆', { view: 'all', topics: [], days: null }]); ok('searchLibrary', ['', null]); ok('searchLibrary', [long(200), {}])
  bad('searchLibrary', [long(201), {}]); bad('searchLibrary', ['q', { view: 'caught' }]); bad('searchLibrary', [7, {}]); bad('searchLibrary', ['q'])
  ok('readNote', ['2026-11-01-a']); bad('readNote', ['']); bad('readNote', [long(201)]); bad('readNote', [3])
  ok('editNote', ['id', { title: 't' }]); ok('editNote', ['id', { topics: ['a', 'b'], body: '' }]); ok('editNote', ['id', { title: 't', topics: ['a'], body: 'x' }])
  bad('editNote', ['id', {}]); bad('editNote', ['id', { source: 'https://x' }]); bad('editNote', ['id', { title: ' ' }]); bad('editNote', ['id', { topics: [''] }])
  bad('editNote', ['id', { topics: 'a' }]); bad('editNote', ['id', { body: 1 }]); bad('editNote', ['id', null]); bad('editNote', ['', { title: 't' }]); bad('editNote', ['id', { title: long(301) }])
  ok('openInObsidian', ['id']); bad('openInObsidian', ['']); bad('openInObsidian', [])
  // a card library's source typed in (1.1 W6a), held until 确认
  ok('proposeCardSource', ['https://x/feed']); ok('proposeCardSource', ['agent memory']); bad('proposeCardSource', ['']); bad('proposeCardSource', ['  ']); bad('proposeCardSource', [long(2001)]); bad('proposeCardSource', [{}])
  ok('settleCardSource', ['p-1', true]); ok('settleCardSource', ['p-1', false]); bad('settleCardSource', ['p-1', 'yes']); bad('settleCardSource', ['p-1']); bad('settleCardSource', [long(81), true])
  // the run-log folder, the graph, the verdicts
  // redesign R3 (F40): the graph's one filter is the time range — status, topics and links are refused
  ok('getGraph', [{ days: 30 }]); ok('getGraph', [{ days: null }]); ok('getGraph', [{}]); ok('getGraph', [null])
  bad('getGraph', [{ days: 30, status: 'kept' }]); bad('getGraph', [{ links: false }]); bad('getGraph', [{ topics: ['a'] }]); bad('getGraph', [{ status: 'caught' }]); bad('getGraph', [{ links: 'yes' }]); bad('getGraph', [{ days: -1 }]); bad('getGraph', [{ layout: 'force' }]); bad('getGraph', ['all']); bad('getGraph', [])
  ok('getVerdicts', ['https://x/1']); bad('getVerdicts', ['']); bad('getVerdicts', [long(2001)])
  // asking the library
  ok('askLibrary', ['库里有什么讲 agent 记忆的？']); ok('askLibrary', [long(500)]); ok('askLibrary', [`  ${long(500)}  `])
  bad('askLibrary', ['']); bad('askLibrary', ['   ']); bad('askLibrary', [long(501)]); bad('askLibrary', [null]); bad('askLibrary', ['a', 'b'])
  ok('addDemand', ['agent 记忆', '']); ok('addDemand', ['agent 记忆', 'q']); bad('addDemand', ['', 'q']); bad('addDemand', ['t', null]); bad('addDemand', ['t'])
  ok('answerFeedback', ['q', 'the second sentence is wrong']); bad('answerFeedback', ['q', '']); bad('answerFeedback', ['', 'n']); bad('answerFeedback', ['q', long(2001)])
  for (const name of ['getChangeLog', 'openLogsFolder', 'getDemands']) { ok(name, []); bad(name, ['x']) }
  // 1.1.3: another library's (主 Agent's page brings a library of the last version over from its column): a library id, nothing else
  for (const name of ['getSources', 'getCardView']) { ok(name, []); ok(name, ['a1b2c3d4']); bad(name, ['']); bad(name, [7]); bad(name, ['a1b2c3d4', 'x']) }
})

test('core errors become bridge codes: shape errors → bad_arguments, the rest → internal; a missing core function → internal', async () => {
  assert.ok(ERROR_CODES.includes('no_connection'))
  assert.equal(new BridgeError('no_connection').code, 'no_connection')
  const coded = code => Object.assign(new Error(`core says ${code}`), { code })
  for (const code of ['bad-edit', 'invalid-note', 'bad-source', 'duplicate-source', 'duplicate-topic', 'bad-topic', 'not-found', 'bad-url', 'bad-input', 'bad-feedback']) {
    assert.equal(bridgeErrorOf(coded(code)).code, 'bad_arguments', code)
  }
  // 1.1 W7b: the codes of v1.0's pipeline configuration and of v2's cards are no longer the page's to fix
  for (const code of ['id-conflict', 'config:invalid-json', 'EACCES', 'bad-by', 'locked-node', 'bad-config', 'bad-proposal', 'not-pending', 'not-open']) assert.equal(bridgeErrorOf(coded(code)).code, 'internal', code)
  assert.equal(bridgeErrorOf(new Error('no code')).code, 'internal')
  assert.equal(bridgeErrorOf(new BridgeError('no_library')).code, 'no_library', 'a bridge error stays itself')
  assert.match(bridgeErrorOf(coded('bad-edit')).message, /bad-edit/, 'the core code reaches the log')
  assert.ok(CORE_BAD_ARGUMENT_CODES.every(c => typeof c === 'string'))
  const call = coreCaller({
    sync: x => x + 1,
    throws: () => { throw coded('duplicate-source') },
    async rejects() { throw coded('not-found') },
    async failsInside() { throw coded('id-conflict') },
  })
  assert.equal(call('sync', 1), 2)
  assert.throws(() => call('throws'), err => err instanceof BridgeError && err.code === 'bad_arguments')
  await assert.rejects(call('rejects'), err => err instanceof BridgeError && err.code === 'bad_arguments')
  await assert.rejects(call('failsInside'), err => err instanceof BridgeError && err.code === 'internal')
  assert.throws(() => call('listLibrary'), err => err.code === 'internal' && /listLibrary/.test(err.message))
  // through the envelope: the page sees the code only
  const log = []
  assert.deepEqual(await runHandler('getSources', () => call('throws'), [], l => log.push(l)), { ok: false, error: { code: 'bad_arguments' } })
  assert.deepEqual(await runHandler('askLibrary', () => { throw new BridgeError('no_connection') }, ['q'], l => log.push(l)), { ok: false, error: { code: 'no_connection' } })
  assert.ok(log.some(l => l.includes('duplicate-source')))
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
