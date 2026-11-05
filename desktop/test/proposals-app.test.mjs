// The proposal cards on the running app (v2 package B; docs/desktop.md §4.5): the development hook STREAMS_DEV_PROPOSALS makes
// its cards at start (by 'dev'; a library card without libraryId takes the current library, here the world's), the page lists
// them through the bridge, a confirm changes the library's streams.json and sends proposals-changed, a decline of the
// create_library card makes nothing in the default place (STREAMS_DEV_LIBRARY_ROOT, a folder of this test), a second confirm
// is bad_arguments. The page has no way to make a card: createProposal is not on the bridge.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appSession } from './support/app.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const here = tempDir('st-proposals-app-')
const cardsFile = join(here, 'cards.json')
const libraryRoot = join(here, 'libs')
mkdirSync(libraryRoot)
writeFileSync(cardsFile, JSON.stringify([
  { kind: 'edit_brief', params: { brief: '开发钩子出的要求' }, why: '界面测试用' },
  { kind: 'create_library', params: { name: '开发库', brief: '一个新库' }, why: '界面测试用' },
]))
const s = appSession({ env: { STREAMS_DEV_PROPOSALS: cardsFile, STREAMS_DEV_LIBRARY_ROOT: libraryRoot } })
// after the app's own after (registered first): the app is closed by then
after(() => removeTree(here, { waitMs: 5000 }))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const call = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])

async function cards() {
  for (let i = 0; i < 100; i++) {
    const r = await call('listProposals', null)
    if (r.ok && r.data.length === 2) return r.data
    await sleep(100)
  }
  throw new Error('the development cards never came')
}

test('the development cards are there, by dev, pending; the page cannot make one', async () => {
  const list = await cards()
  assert.deepEqual(list.map(c => [c.kind, c.by, c.status]), [['create_library', 'dev', 'pending'], ['edit_brief', 'dev', 'pending']])
  assert.equal(list[0].params.folder, join(libraryRoot, '开发库'))
  assert.equal(list[1].libraryId, 'dev', 'the current library (the world\'s, not registered: id dev)')
  const names = await s.page.evaluate(() => Object.keys(window.streams))
  assert.ok(names.includes('confirmProposal'))
  assert.ok(!names.some(n => /^create/i.test(n)), 'no createProposal on the bridge')
})

test('confirm through the bridge: the brief written, proposals-changed sent; a second confirm is bad_arguments; decline makes no library', async () => {
  const list = await cards()
  const brief = list.find(c => c.kind === 'edit_brief')
  await s.page.evaluate(() => { window.__pc = []; window.streams.onEvent('proposals-changed', p => window.__pc.push(p)) })
  const r = await call('confirmProposal', brief.id)
  assert.equal(r.ok, true)
  assert.equal(r.data.status, 'confirmed')
  assert.equal(JSON.parse(readFileSync(join(s.run.library, 'streams.json'), 'utf8')).brief, '开发钩子出的要求')
  await s.page.waitForFunction(() => window.__pc.length > 0, null, { timeout: 10_000, polling: 100 })
  assert.deepEqual(await s.page.evaluate(() => window.__pc[0]), { libraryId: 'dev', id: brief.id, status: 'confirmed' })
  assert.deepEqual(await call('confirmProposal', brief.id), { ok: false, error: { code: 'bad_arguments' } })
  const lib = list.find(c => c.kind === 'create_library')
  assert.equal((await call('declineProposal', lib.id)).data.status, 'declined')
  assert.equal(existsSync(lib.params.folder), false)
  assert.deepEqual(await call('confirmProposal', lib.id), { ok: false, error: { code: 'bad_arguments' } })
  assert.equal(existsSync(lib.params.folder), false)
  // the record in the world's app data, never the real one
  const record = readFileSync(join(s.run.appData, 'proposals.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.deepEqual(record.map(c => c.status), ['pending', 'pending', 'confirmed', 'declined'])
  assert.equal((await call('getWhoDecided')).data.brief.by, 'agent-confirmed')
})
