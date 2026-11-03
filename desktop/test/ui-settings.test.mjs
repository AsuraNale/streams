// 设置 (screens/settings.js) on the seeded world opened through settings.json's libraryPath (not the development hook, so a
// library chosen on the page can replace it): the three connection rows with their state, the radio 打分用这一条 → the active
// connection in settings.json, the main model chosen → written, 设置… → a key saved → secrets/key-<vendor>.bin appears and the
// page shows only its last four characters, 删除 → the file is gone; 运行: the cap written; 库: the current path, 新建库 on the
// folder the hook gives → the sidebar carries the new folder's name.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { worldSession } from './support/seed.mjs'

const KEY = 'sk-test-ui-settings-key-0000-ab12'
const s = worldSession({
  kind: 'seeded',
  waitFor: 'settings',
  prepare: world => { mkdirSync(join(world.root, 'another')) },
  settings: world => ({ libraryPath: world.library }),
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'another'), STREAMS_START_SCREEN: 'settings' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const click = sel => s.page.click(`${sel} button`)
const settings = () => JSON.parse(readFileSync(join(s.world.appData, 'settings.json'), 'utf8'))
const rows = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="connections"] [data-connection]')].map(e => [e.dataset.connection, e.dataset.connState, e.dataset.active, e.querySelector('[data-conn-words]').textContent]))

test('three rows, their names the fixed phrases, their states from the detection; the library part shows the current path', async () => {
  // the connection rows come with their own read (getConnections) after the page is ready
  await s.page.waitForFunction(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3, null, POLL)
  const r = await rows()
  assert.deepEqual(r.map(x => x[0]), ['claude-code', 'codex', 'api'])
  assert.deepEqual(r.map(x => x[1]), ['usable', 'usable', 'no-key'], JSON.stringify(r))
  assert.ok(r[0][3].includes(CONNECTIONS.loggedIn), r[0][3])
  assert.ok(r[2][3].includes(CONNECTIONS.keyNone), r[2][3])
  const names = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="connections"] [data-connection] b')].map(e => e.textContent))
  assert.deepEqual(names, Object.values(CONNECTIONS.names))
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="library"] [data-library-path]').dataset.libraryPath), s.world.library)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__library-name').textContent), basename(s.world.library))
})

test('打分用这一条 on codex → settings.json; the main model chosen → written; the page says 当前使用', async () => {
  await s.page.click('#settings-active-codex')
  await s.page.waitForFunction(() => document.querySelector('[data-connection="codex"]')?.dataset.active === 'true', null, POLL)
  assert.ok(JSON.stringify(settings()).includes('"active":"codex"'), JSON.stringify(settings()))
  assert.ok((await rows())[1][3].includes(CONNECTIONS.inUse))
  const conns = (await s.page.evaluate(() => window.streams.getConnections())).data
  const model = conns.kinds.codex.models[1].id
  await s.page.selectOption('#settings-model-codex', model)
  await s.page.waitForFunction(id => document.querySelector('#settings-model-codex')?.value === id, model, POLL)
  await s.page.waitForTimeout(300)
  assert.ok(JSON.stringify(settings()).includes(`"${model}"`), `the model ${model} is in settings.json: ${JSON.stringify(settings())}`)
  assert.equal((await s.page.evaluate(() => window.streams.getConnections())).data.kinds.codex.model, model)
})

test('设置… on the API row: a key saved → secrets/key-<vendor>.bin, the page shows its last four characters only; 删除 removes it', async () => {
  await click('[data-connection="api"] [data-action="setup-key"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="api-key"]') !== null, null, POLL)
  const vendor = await s.page.evaluate(() => document.querySelector('[data-field="vendor"]').value)
  assert.ok(vendor, 'a vendor is chosen')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="save-key"] button').disabled), true, 'no key typed: no save')
  await s.page.fill('[data-field="key"]', KEY)
  await click('[data-action="save-key"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="api-key"]') === null, null, POLL)
  const file = join(s.world.appData, 'secrets', `key-${vendor}.bin`)
  await s.page.waitForFunction(() => document.querySelector('[data-connection="api"]')?.dataset.connState === 'usable', null, POLL)
  assert.ok(existsSync(file), `${file} exists`)
  assert.equal(readFileSync(file, 'utf8').includes(KEY), false, 'not stored in clear')
  const words = (await rows())[2][3]
  assert.ok(words.includes(KEY.slice(-4)) && !words.includes(KEY), words)
  const body = await s.page.evaluate(() => document.body.innerText)
  assert.equal(body.includes(KEY), false, 'the key is nowhere on the page')
  await click('[data-connection="api"] [data-action="setup-key"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="api-key"] [data-has-key]') !== null, null, POLL)
  await click('[data-action="remove-key"]')
  await s.page.waitForFunction(() => document.querySelector('[data-connection="api"]')?.dataset.connState === 'no-key', null, POLL)
  assert.equal(existsSync(file), false, 'the key file is gone')
})

test('运行: the cap written to streams.json; control: 0 refused', async () => {
  await s.page.fill('[data-part="run"] [data-field="cap"]', '0')
  await click('[data-part="run"] [data-action="save-cap"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] .settings__error') !== null, null, POLL)
  assert.equal(JSON.parse(readFileSync(join(s.world.library, 'streams.json'), 'utf8')).pipeline.cap, 120)
  await s.page.fill('[data-part="run"] [data-field="cap"]', '42')
  await click('[data-part="run"] [data-action="save-cap"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] .st-t-done') !== null, null, POLL)
  assert.equal(JSON.parse(readFileSync(join(s.world.library, 'streams.json'), 'utf8')).pipeline.cap, 42)
  assert.ok((await s.page.evaluate(() => document.querySelector('[data-thresholds]').textContent)).includes('0.7'))
})

test('库: 新建库 on the folder the hook gives → the sidebar and the library part carry the new name', async () => {
  const another = join(s.world.root, 'another')
  await click('[data-part="library"] [data-action="new-library"]')
  await s.page.waitForFunction(name => document.querySelector('.st-sidebar__library-name')?.textContent === name, basename(another), POLL)
  assert.ok(existsSync(join(another, 'streams.json')), 'a library was made there')
  assert.equal(settings().libraryPath, another)
  await s.page.waitForFunction(p => document.querySelector('[data-part="library"] [data-library-path]')?.dataset.libraryPath === p, another, POLL)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
