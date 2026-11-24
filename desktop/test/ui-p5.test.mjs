// 1.1.1 P5 in the real window (维护者 11-24 evening: 「甲」, DeepSeek's search API first; acceptance A3, V7's exception for the
// settings page): 设置's row 「搜索」 —
//   another vendor's model, no search key: says building and updating with an API key cannot search; a key typed in is stored
//     (safeStorage, apart from the model's key), the row then shows its last four characters only, never the key; 删除 clears it
//   a DeepSeek model with its key: searches with it, nothing to fill in
//   the key is nowhere in main.log, the page's text or the settings file
// With STREAMS_P5_SHOTS=<folder> the window is shown and the pictures (light, dark) are saved there, the paths masked.
// Each check holds first the state that would make it fail.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'

const SHOTS = process.env.STREAMS_P5_SHOTS && isAbsolute(process.env.STREAMS_P5_SHOTS) ? process.env.STREAMS_P5_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
const SEARCH_KEY = 'sk-p5-search-not-real-9q8w'
const MODEL_KEY = 'sk-p5-model-not-real-4t5y'

const s = worldSession({
  kind: 'empty',
  waitFor: 'load',
  settings: { connections: { active: 'claude-code' }, panel: { open: false }, theme: 'research', appearance: 'light' },
  env: () => ({ STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'settings', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [s.page.locator('.st-path'), s.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }
const row = () => s.page.evaluate(() => { const r = document.querySelector('[data-part="search-row"]'); return r ? { from: r.dataset.from, words: r.querySelector('[data-part="search-words"]').textContent, input: Boolean(r.querySelector('[data-field="search-key"]')), remove: Boolean(r.querySelector('[data-action="remove-search-key"]')) } : null })
const looks = async name => {
  for (const look of ['light', 'dark']) {
    assert.ok((await s.page.evaluate(a => window.streams.setAppearance(a), look)).ok)
    await until(a => document.body.dataset.appearance === a, look)
    await s.page.locator('[data-part="search-row"]').scrollIntoViewIfNeeded()
    await shot(`${name}-${look}`)
  }
  await s.page.evaluate(() => window.streams.setAppearance('light'))
}
const filesUnder = dir => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])) : [])

describe('P5: 设置\'s 搜索 row', () => {
  test('another vendor\'s model, no search key: the row says there is no search, with a box for a DeepSeek key', async () => {
    assert.ok((await s.page.evaluate(() => window.streams.setApiVendor('anthropic', null))).ok)
    await until(() => document.querySelector('[data-part="search-row"]') !== null)
    const r = await row()
    assert.deepEqual(r, { from: 'none', words: SETTINGS.search.none, input: true, remove: false })
    await looks('search-none')
  })

  test('a search key typed in: stored, shown by its last four characters only, the model\'s key untouched; 删除 clears it', async () => {
    await s.page.fill('[data-field="search-key"]', SEARCH_KEY)
    await s.page.click('[data-action="save-search-key"] button')
    await until(() => document.querySelector('[data-part="search-row"]')?.dataset.from === 'search-key')
    const r = await row()
    const conns = (await s.page.evaluate(() => window.streams.getConnections())).data
    const hint = conns.search.keyHint
    assert.ok(hint.endsWith(SEARCH_KEY.slice(-4)) && !hint.includes(SEARCH_KEY.slice(3, -4)), `the hint shows the last four only: ${hint}`)
    assert.deepEqual([r.from, r.words, r.remove], ['search-key', fmt(SETTINGS.search.hasKey, { hint }), true])
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-field="search-key"]').value), '', 'the box is emptied')
    assert.equal(conns.kinds.api.hasKey, false, 'the model\'s key: still none (stored apart)')
    assert.equal(JSON.stringify(conns).includes(SEARCH_KEY), false, 'the page never gets the key back')
    assert.equal((await s.page.evaluate(() => document.body.innerText)).includes(SEARCH_KEY), false)
    assert.ok(existsSync(join(s.world.appData, 'secrets', 'key-search-deepseek.bin')), 'its own secret file')
    assert.equal(readFileSync(join(s.world.appData, 'secrets', 'key-search-deepseek.bin')).includes(Buffer.from(SEARCH_KEY)), false, 'encrypted, not plain')
    await looks('search-key')
    await s.page.click('[data-action="remove-search-key"] button')
    await until(() => document.querySelector('[data-part="search-row"]')?.dataset.from === 'none')
    assert.equal(existsSync(join(s.world.appData, 'secrets', 'key-search-deepseek.bin')), false)
  })

  test('a DeepSeek model with its key: searches with it, nothing to fill in', async () => {
    assert.ok((await s.page.evaluate(() => window.streams.setApiVendor('deepseek', null))).ok)
    assert.ok((await s.page.evaluate(k => window.streams.setApiKey('deepseek', k), MODEL_KEY)).ok)
    await until(() => document.querySelector('[data-part="search-row"]')?.dataset.from === 'model')
    assert.deepEqual(await row(), { from: 'model', words: SETTINGS.search.fromModel, input: false, remove: false })
    await looks('search-model')
  })

  test('the keys are nowhere in main.log, the settings file or any other plain file of the app\'s data', () => {
    const read = []
    for (const f of filesUnder(s.world.appData)) {
      if (f.endsWith('.bin')) continue
      let text
      try { text = readFileSync(f) } catch (err) { if (err.code === 'EBUSY' || err.code === 'EPERM') continue; throw err } // the running browser's own files
      read.push(f)
      assert.equal(text.includes(Buffer.from(SEARCH_KEY)) || text.includes(Buffer.from(MODEL_KEY)), false, f)
    }
    assert.ok(read.some(f => f.endsWith('main.log')) && read.some(f => f.endsWith('settings.json')), `main.log and settings.json were read: ${read.length} files`)
  })

  test('no page errors', () => { assert.deepEqual(s.errors, []) })
})
