// The 来源与要求 service (src/main/services/sources.mjs) in plain Node, on libraries the core itself wrote: every method needs a
// library (no_library); a library made by the last version (test/support/seed.mjs, v1.0's own round via core/legacy) is read
// only — getCardView says it is old and gives its brief, getSources its sources with their last fetch as a state and a hint
// (no fetcher message, no HTTP code); a library with a card gives the card and its sources' rows; a source typed for a card
// library waits until 确认 (nothing written before), 不加 drops it, 确认 writes it into the card and sends library-changed;
// 变更记录 is the core's changeLog.
// 1.1 W7b: v1.0's editing of streams.json (guessSource, trySource, addSource / updateSource / removeSource / setSourcePaused, the
// topics, addManualLink, getBrief / setBrief, the levels) left the service: its tests went with it.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as realCore from '../src/main/core.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createSourcesService } from '../src/main/services/sources.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { seedLibrary } from './support/seed.mjs'
import { quietCard } from './support/card-world.mjs'

const worlds = []
after(async () => {
  for (const w of worlds) removeTree(w.root, { waitMs: 3000 })
})

async function world({ seeded = true, card = false } = {}) {
  const w = testWorld('st-sources-')
  worlds.push(w)
  const dir = join(w.root, 'lib')
  const seed = seeded ? await seedLibrary(dir) : null
  if (card) realCore.writeCard(dir, quietCard('卡片库'))
  const pendingDir = join(w.root, 'pending')
  mkdirSync(pendingDir, { recursive: true })
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, devLibrary: seeded ? dir : null })
  const sources = createSourcesService({ library, emit: w.emit, log: w.log, pendingDir })
  return { w, dir, seed, library, h: sources.handlers }
}
const hashOf = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => join(e.parentPath ?? e.path, e.name)).sort()
  .map(p => `${p.slice(dir.length)}:${createHash('sha256').update(readFileSync(p)).digest('hex')}`).join('\n')

test('without a library every method is no_library', async () => {
  const { h } = await world({ seeded: false })
  for (const [name, args] of [['getCardView', []], ['getSources', []], ['getChangeLog', []], ['proposeCardSource', ['https://x/feed']], ['settleCardSource', ['p-1', false]]]) {
    await assert.rejects(async () => h[name](...args), err => err.code === 'no_library', name)
  }
  // 1.1 W7b: v1.0's editing of streams.json is no handler any more
  for (const gone of ['guessSource', 'trySource', 'addSource', 'updateSource', 'removeSource', 'setSourcePaused', 'addManualLink', 'addTopic', 'updateTopic', 'removeTopic', 'getBrief', 'setBrief', 'getStrictness', 'setStrictness']) {
    assert.equal(h[gone], undefined, gone)
  }
})

test('a library made by the last version: getCardView says old with its brief; getSources lists its sources read only — a state and a hint, no message, no HTTP code', async () => {
  const { dir, seed, h } = await world()
  realCore.saveBrief(dir, '追踪 agent 记忆方案。')
  const before = hashOf(dir)
  const cv = h.getCardView()
  assert.deepEqual(cv, { card: null, rows: [], old: true, brief: '追踪 agent 记忆方案。' })
  const v = h.getSources()
  assert.deepEqual(v.sources.map(s => s.name), seed.sources)
  for (const s of v.sources) {
    assert.ok(typeof s.status === 'string' && typeof s.hint === 'string', `${s.name}: a state and a hint (${s.status} · ${s.hint})`)
    assert.equal(Object.hasOwn(s, 'message'), false, `${s.name}: no fetcher message`)
    assert.equal(Object.hasOwn(s, 'http'), false, `${s.name}: no HTTP code`)
  }
  assert.ok(v.sources.some(s => s.status !== 'ok'), 'control: the seed has a source whose fetch failed')
  assert.equal(hashOf(dir), before, 'reading wrote nothing')
})

test('a library with a card: getCardView is the card and its rows; a typed source waits for 确认 — 不加 drops it, 确认 writes it into the card (library-changed)', async () => {
  const { w, dir, h } = await world({ card: true })
  const cv = h.getCardView()
  assert.equal(cv.old, false)
  assert.equal(cv.card.name, '卡片库')
  assert.deepEqual(cv.rows.map(r => r.name), ['本机'])
  const cardFile = join(dir, '_card', 'card.json')
  const before = readFileSync(cardFile, 'utf8')
  const n = w.events.length
  // 不加: nothing in the card
  const dropped = await h.proposeCardSource('https://example.org/feed')
  assert.match(dropped.id, /^[A-Za-z0-9-]+$/)
  assert.equal(dropped.source.url, 'https://example.org/feed')
  assert.equal(readFileSync(cardFile, 'utf8'), before, 'proposed: nothing written yet')
  assert.deepEqual(await h.settleCardSource(dropped.id, false), { dropped: true })
  assert.equal(readFileSync(cardFile, 'utf8'), before, '不加: the card byte for byte')
  assert.equal(w.events.slice(n).filter(e => e.topic === 'library-changed').length, 0)
  // 确认: in the card, one library-changed
  const kept = await h.proposeCardSource('固态电池 装车')
  assert.equal(kept.source.query, '固态电池 装车')
  await h.settleCardSource(kept.id, true)
  assert.ok(realCore.readCard(dir).sources.some(s => s.query === '固态电池 装车'))
  assert.equal(w.events.slice(n).filter(e => e.topic === 'library-changed').length, 1)
  // refused: an id that is not one of the runner's
  await assert.rejects(async () => h.settleCardSource('../x', true), err => err.code === 'bad_arguments')
})

test('变更记录: the core\'s changeLog of the current library, read only', async () => {
  const { dir, h } = await world()
  realCore.recordChange(dir, { field: 'schedule', by: 'you', before: { enabled: false, time: '08:30' }, after: { enabled: true, time: '07:00' } })
  const before = hashOf(dir)
  const log = h.getChangeLog()
  assert.deepEqual(log.rows.filter(r => r.kind === 'change').map(r => [r.field, r.by]), [['schedule', 'you']])
  assert.equal(hashOf(dir), before, 'reading wrote nothing')
})
