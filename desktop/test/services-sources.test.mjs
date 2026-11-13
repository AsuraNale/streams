// The sources-and-topics service (src/main/services/sources.mjs) in plain Node, on a library the core itself wrote
// (test/support/seed.mjs): every method but guessSource / trySource needs a library (no_library); a name the page sends must
// be in streams.json before the core is asked; the core's shape errors (bad-source, duplicate-*, bad-topic, not-found,
// bad-input, bad-url) come back as bad_arguments and write nothing; each change sends library-changed; a try fetches once on
// a local server, writes nothing and answers a summary; a pasted link goes into the ledger once. The W5 functions run for
// real when the core has them (core/src/library/sources.mjs), and are skipped otherwise.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as realCore from '../src/main/core.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createSourcesService } from '../src/main/services/sources.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { seedLibrary } from './support/seed.mjs'
import { startFakeServer } from '../../core/test/support/fake-server.mjs'
import { feedRoute, serveItems } from '../../core/test/support/pipeline.mjs'

const W5 = ['sourcesView', 'guessSource', 'addSource', 'updateSource', 'removeSource', 'setSourcePaused', 'addTopic', 'updateTopic', 'removeTopic'].every(n => typeof realCore[n] === 'function')
const SKIP = W5 ? false : 'core W5 (library/sources.mjs) not landed yet'
const worlds = []
const servers = []
after(async () => {
  for (const srv of servers) await srv.close()
  for (const w of worlds) removeTree(w.root, { waitMs: 3000 })
})

async function world({ seeded = true, core } = {}) {
  const w = testWorld('st-sources-')
  worlds.push(w)
  const dir = join(w.root, 'lib')
  const seed = seeded ? await seedLibrary(dir) : null
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, devLibrary: seeded ? dir : null })
  const sources = createSourcesService({ library, emit: w.emit, log: w.log, fetchContext: { timeoutMs: 2000, sleep: async () => {} }, ...(core ? { core } : {}) })
  return { w, dir, seed, library, h: sources.handlers }
}
const configOf = dir => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'))
const changedEvents = (w, from) => w.events.slice(from).filter(e => e.topic === 'library-changed')

test('without a library: every method but guessSource and trySource is no_library', async () => {
  const { h } = await world({ seeded: false })
  for (const [name, args] of [['getSources', []], ['addSource', [{ name: 'a', kind: 'rss', url: 'https://x/f' }]], ['updateSource', ['a', {}]], ['removeSource', ['a']], ['setSourcePaused', ['a', true]], ['addManualLink', ['https://x/1', '']], ['addTopic', [{ name: 't' }]], ['updateTopic', ['t', {}]], ['removeTopic', ['t']]]) {
    await assert.rejects(async () => h[name](...args), err => err.code === 'no_library', name)
  }
})

test('a name the page sends must be in streams.json: the core is not asked otherwise; shape errors → bad_arguments, others → internal', async () => {
  const calls = []
  const rec = name => (...args) => { calls.push(name); return { name: args[1] } }
  const core = { ...realCore }
  for (const n of ['updateSource', 'removeSource', 'setSourcePaused', 'updateTopic', 'removeTopic']) core[n] = rec(n)
  core.addSource = () => { throw new realCore.StreamsError('duplicate-source', 'x') }
  core.addTopic = () => { throw new realCore.StreamsError('EACCES', 'disk') }
  const { w, h } = await world({ core })
  const n = w.events.length
  assert.throws(() => h.updateSource('not-there', { url: 'https://y' }), err => err.code === 'bad_arguments')
  assert.throws(() => h.removeSource('not-there'), err => err.code === 'bad_arguments')
  assert.throws(() => h.setSourcePaused('not-there', true), err => err.code === 'bad_arguments')
  assert.throws(() => h.updateTopic('不在的主题', {}), err => err.code === 'bad_arguments')
  assert.throws(() => h.removeTopic('不在的主题'), err => err.code === 'bad_arguments')
  assert.deepEqual(calls, [], 'the core was never asked')
  assert.throws(() => h.addSource({ name: 'letta-blog', kind: 'rss', url: 'https://x' }), err => err.code === 'bad_arguments')
  assert.throws(() => h.addTopic({ name: 't' }), err => err.code === 'internal')
  assert.equal(w.events.length, n, 'no event for a refusal')
  // a known name reaches it, and sends library-changed
  h.setSourcePaused('letta-blog', true)
  h.removeTopic('评测')
  assert.deepEqual(calls, ['setSourcePaused', 'removeTopic'])
  assert.equal(changedEvents(w, n).length, 2)
})

test('trySource: one fetch on a local server, a summary back (count, the first three as title and date), nothing written; a bad source is not fetched', async () => {
  const { w, dir, h } = await world()
  const srv = await startFakeServer()
  servers.push(srv)
  const feed = feedRoute(srv, serveItems(srv, 5))
  const ledger = readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8')
  const fetchLog = readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8')
  const n = w.events.length
  const r = await h.trySource({ name: 'try', kind: 'rss', url: feed, extra: 'dropped' })
  // redesign R5a (O9): no `http` and no `message` any more — the state, the hint (what to do), the count and the sample
  assert.deepEqual(Object.keys(r).sort(), ['count', 'hint', 'sample', 'status'])
  assert.deepEqual([r.status, r.hint, r.count, r.sample.length], ['ok', 'none', 5, 3])
  assert.ok(r.sample.every(s => Object.keys(s).sort().join() === 'date,title' && typeof s.title === 'string' && s.title !== ''))
  assert.equal(readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8'), ledger, 'no ledger line')
  assert.equal(readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8'), fetchLog, 'no fetch log line')
  assert.equal(w.events.length, n, 'no event')
  const dead = await h.trySource({ name: 'gone', kind: 'rss', url: `${srv.base}/nothing-here` })
  assert.equal(dead.count, 0)
  assert.notEqual(dead.status, 'ok')
  // refused before any request: an unknown kind, rss without an http(s) address, a search without its query
  const before = srv.requests.length
  for (const bad of [{ kind: 'gopher', url: feed }, { kind: 'rss', url: 'file:///C:/Windows/win.ini' }, { kind: 'rss' }, { kind: 'hn' }, { kind: 'arxiv', query: '  ' }, { kind: 'hn', query: 'x', url: 'ftp://x' }]) {
    await assert.rejects(async () => h.trySource(bad), err => err.code === 'bad_arguments', JSON.stringify(bad))
  }
  assert.equal(srv.requests.length, before, 'no request for a refused source')
  // the keys a fetcher reads, nothing else, reach the core
  const seen = []
  const spy = { ...realCore, fetchSource: async s => { seen.push(s); return { status: 'empty', hint: 'none', message: '', items: [] } } }
  const { h: h2 } = await world({ seeded: false, core: spy })
  await h2.trySource({ name: 'q', kind: 'hn', query: 'mcp', min_points: 5, evil: { a: 1 }, __proto__x: 1 })
  assert.deepEqual(seen, [{ name: 'q', kind: 'hn', query: 'mcp', min_points: 5 }])
})

test('addManualLink: a new link into the ledger as manual (library-changed); the same link again changes nothing', async () => {
  const { w, dir, h } = await world()
  const url = 'https://example.org/by-hand'
  const n = w.events.length
  assert.deepEqual(h.addManualLink(`  ${url}  `, '  手动找到的一篇  '), { added: true, url })
  const state = realCore.replayLedger(dir).states.get(url)
  assert.deepEqual([state.source, state.title], ['manual', '手动找到的一篇'])
  assert.equal(changedEvents(w, n).length, 1)
  const ledger = readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8')
  assert.equal(h.addManualLink(url, '').added, false)
  assert.equal(readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8'), ledger)
  assert.equal(changedEvents(w, n).length, 1, 'no second event')
})

test('the real core W5: the view, a guess, a source added / changed / paused / removed, topics, each with library-changed; refusals write nothing', { skip: SKIP }, async () => {
  const { w, dir, seed, h } = await world()
  const view = h.getSources()
  assert.deepEqual(view.sources.map(s => s.name), seed.sources)
  assert.deepEqual(view.topics.map(t => t.name), seed.topics)
  assert.equal(h.guessSource('https://example.org/feed.xml').kind, 'rss')
  assert.equal(h.guessSource('agent memory').kind, 'hn')
  assert.throws(() => h.guessSource('   '), err => err.code === 'bad_arguments')
  let n = w.events.length
  const added = h.addSource({ name: 'new-feed', kind: 'rss', url: 'https://example.org/feed.xml', topic: seed.topics[2] })
  assert.equal(added.source.name, 'new-feed')
  assert.ok(configOf(dir).sources.some(s => s.name === 'new-feed'))
  assert.equal(changedEvents(w, n).length, 1)
  // refused, nothing written, no event
  const disk = readFileSync(join(dir, 'streams.json'), 'utf8')
  n = w.events.length
  assert.throws(() => h.addSource({ name: 'new-feed', kind: 'rss', url: 'https://example.org/other.xml' }), err => err.code === 'bad_arguments', 'duplicate')
  assert.throws(() => h.addSource({ name: 'Bad Name!', kind: 'rss', url: 'https://example.org/x.xml' }), err => err.code === 'bad_arguments', 'bad name')
  assert.throws(() => h.addSource({ name: 'no-url', kind: 'rss' }), err => err.code === 'bad_arguments', 'rss without url')
  assert.throws(() => h.addTopic({ name: seed.topics[0] }), err => err.code === 'bad_arguments', 'duplicate topic')
  assert.equal(readFileSync(join(dir, 'streams.json'), 'utf8'), disk)
  assert.equal(w.events.length, n)
  h.updateSource('new-feed', { url: 'https://example.org/feed2.xml' })
  assert.equal(configOf(dir).sources.find(s => s.name === 'new-feed').url, 'https://example.org/feed2.xml')
  h.setSourcePaused('new-feed', true)
  assert.equal(configOf(dir).sources.find(s => s.name === 'new-feed').paused, true)
  h.removeSource('new-feed')
  assert.ok(!configOf(dir).sources.some(s => s.name === 'new-feed'))
  h.addTopic({ name: '新主题', keywords: ['k1'] })
  h.updateTopic('新主题', { keywords: ['k1', 'k2'] })
  assert.deepEqual(configOf(dir).topics.find(t => t.name === '新主题').keywords, ['k1', 'k2'])
  h.removeTopic('新主题')
  assert.ok(!configOf(dir).topics.some(t => t.name === '新主题'))
  assert.equal(changedEvents(w, n).length, 6, 'one event per change')
  assert.ok(existsSync(join(dir, 'streams.json')))
})

// v2 package F: 「要求」 on 来源与要求 (getBrief / setBrief): the core's readBrief / saveBrief, the user's own (changes.jsonl by 'you')
test('getBrief / setBrief: streams.json\'s brief read and written (trimmed), one changes.jsonl line by you, library-changed; refused → nothing written', async () => {
  const { w, dir, h } = await world()
  const changes = () => (existsSync(join(dir, '_pipeline', 'changes.jsonl')) ? readFileSync(join(dir, '_pipeline', 'changes.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
  assert.deepEqual(h.getBrief(), { brief: null }, 'the seed has none')
  const before = readFileSync(join(dir, 'streams.json'), 'utf8')
  // control: what the core refuses writes nothing and records nothing
  for (const bad of ['   ', 'x'.repeat(2001)]) assert.throws(() => h.setBrief(bad), err => err.code === 'bad_arguments')
  assert.equal(readFileSync(join(dir, 'streams.json'), 'utf8'), before)
  assert.deepEqual(changes(), [])
  const n = w.events.length
  assert.deepEqual(h.setBrief('  追踪 agent 记忆。不要营销稿。 '), { brief: '追踪 agent 记忆。不要营销稿。' })
  assert.equal(configOf(dir).brief, '追踪 agent 记忆。不要营销稿。')
  assert.deepEqual(h.getBrief(), { brief: '追踪 agent 记忆。不要营销稿。' })
  const lines = changes()
  assert.deepEqual(lines.map(l => [l.field, l.by, l.before, l.after]), [['brief', 'you', null, '追踪 agent 记忆。不要营销稿。']])
  assert.equal(changedEvents(w, n).length, 1)
  assert.deepEqual(realCore.whoDecided(dir).brief?.by, 'you')
  // the same text again changes nothing: no second line
  h.setBrief('追踪 agent 记忆。不要营销稿。')
  assert.equal(changes().length, 1)
})
