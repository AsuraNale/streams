// redesign R4a: the test 「库: 新建库 …」 goes through the one-page 新建库 (更改… · 名称 · 追踪要求 · 仅创建) instead of its four old steps.
// redesign R1: 概览 is gone and the app opens on a library's 待看 — the screen this file waits for is 'inbox' (was 'overview'); nothing else changed
// 设置 (screens/settings.js) on the seeded world opened through settings.json's libraryPath (not the development hook, so a
// library chosen on the page can replace it): the three connection rows with their state, the radio 打分用这一条 → the active
// connection in settings.json, the main model chosen → written, 设置… → a key saved → secrets/key-<vendor>.bin appears and the
// page shows only its last four characters, 删除 → the file is gone; 运行: the cap written; 库: the current path, 新建库 on the
// folder the hook gives → the sidebar carries the new folder's name. v2 package A: the library opened is the registry's
// current one (libraries.json `active`), no longer settings.json's libraryPath.
// v2 package F: 设置 has no 「运行」 part any more — the cap (and the schedule) are each library's own, on its 来源与要求: the cap
// test checks that 设置 has nothing to change there, then writes the cap on the library's page (the same hooks, the same
// values); the pass lines are read off 关卡 there (v1.0: 设置 showed them read only). The sidebar has no line with the open
// folder's name any more: the new library is the current line of 「我的库」.
// v2 package I: 设置 has no 「库」 part of the current library any more (its path, 新建库, 打开已有文件夹, 重建索引 moved to 来源与要求's
// 「这个库」 and to 新建库, the manual way): the first test no longer reads the current path here (it checks the part is gone and
// the sidebar's current line instead); the 「新建库 on the folder the hook gives」 test is now the same folder made a library through
// 新建库 (the sidebar's 「+ 新建库」). test/ui-settings-i.test.mjs has the new page (groups, 主 Agent, 新建库默认放在, 这个库).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'

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
// v2: the current library's folder in the registry
const activeLibrary = () => { const r = JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8')); return r.libraries.find(l => l.id === r.active)?.path ?? null }
const rows = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="connections"] [data-connection]')].map(e => [e.dataset.connection, e.dataset.connState, e.dataset.active, e.querySelector('[data-conn-words]').textContent]))

test('three rows, their names the fixed phrases, their states from the detection; no library part (v2 package I), the current library in the sidebar', async () => {
  // the connection rows come with their own read (getConnections) after the page is ready
  await s.page.waitForFunction(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3, null, POLL)
  const r = await rows()
  assert.deepEqual(r.map(x => x[0]), ['claude-code', 'codex', 'api'])
  assert.deepEqual(r.map(x => x[1]), ['usable', 'usable', 'no-key'], JSON.stringify(r))
  assert.ok(r[0][3].includes(CONNECTIONS.loggedIn), r[0][3])
  assert.ok(r[2][3].includes(CONNECTIONS.keyNone), r[2][3])
  const names = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="connections"] [data-connection] b')].map(e => e.textContent))
  assert.deepEqual(names, Object.values(CONNECTIONS.names))
  // v2 package I: was 「[data-part="library"] [data-library-path] is the current path」
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="settings"] [data-part="library"], main[data-screen="settings"] [data-library-path]')), null)
  await s.page.waitForFunction(name => document.querySelector('[data-library-row][data-active="true"] .st-sidebar__lib-name')?.textContent === name, basename(s.world.library), POLL)
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

test('运行 (v2: on the library\'s 来源与要求, not 设置): the cap written to streams.json; control: 0 refused', async () => {
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="settings"] [data-part="run"], main[data-screen="settings"] [data-field="cap"]')), null, '设置 has no cap to change')
  await s.page.click('[data-library-row][data-active="true"]')
  await s.page.waitForFunction(() => document.querySelector('main[data-state="ready"]') !== null && document.querySelector('.st-lib-tabs') !== null, null, POLL)
  await s.page.click('.st-lib-tabs [data-tab="sources"]')
  await ready(s.page, 'sources')
  await s.page.fill('[data-part="run"] [data-field="cap"]', '0')
  await click('[data-part="run"] [data-action="save-cap"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-cap-note].src-error') !== null, null, POLL)
  assert.equal(JSON.parse(readFileSync(join(s.world.library, 'streams.json'), 'utf8')).pipeline.cap, 120)
  await s.page.fill('[data-part="run"] [data-field="cap"]', '42')
  await click('[data-part="run"] [data-action="save-cap"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-cap-note].st-t-done') !== null, null, POLL)
  assert.equal(JSON.parse(readFileSync(join(s.world.library, 'streams.json'), 'utf8')).pipeline.cap, 42)
  await s.page.waitForFunction(() => document.querySelector('[data-part="gates"] input[data-field="threshold"]') !== null, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="gates"] input[data-field="threshold"]').value), '0.7')
  await s.page.click('.st-sidebar__footer-button')
  await ready(s.page, 'settings')
})

// redesign R4a: 新建库 is one page (screens/new-library.js): 更改… takes the folder the hook gives, the name and 追踪要求 are typed,
// 仅创建 makes it and the app goes to its 待看 (v2 package I's four steps — folder → pack → round → 定时 — are gone); what is checked
// is as before: a library was made there, it is the current one, the sidebar carries its name
test("库: 新建库 on the folder the hook gives → the sidebar carries the new name (v2 package I: through 新建库, not a settings part; redesign R4a: the one-page form)", async () => {
  const another = join(s.world.root, 'another')
  await s.page.click('.st-sidebar [data-action="add-library"]')
  await ready(s.page, 'new-library')
  await click('[data-action="change-folder"]')
  await s.page.waitForFunction(p => document.querySelector('[data-part="location"]')?.dataset.path === p, another, POLL)
  await s.page.fill('[data-field="name"]', basename(another))
  await s.page.fill('[data-field="brief"]', '追踪电池价格。')
  await click('[data-action="create-only"]')
  await ready(s.page, 'inbox')
  assert.ok(existsSync(join(another, 'streams.json')), 'a library was made there')
  assert.equal(activeLibrary(), another)
  await s.page.waitForFunction(name => document.querySelector('[data-library-row][data-active="true"] .st-sidebar__lib-name')?.textContent === name, basename(another), POLL)
  // back to 设置 for the next test (新建库 ends on the new library's page)
  await s.page.click('.st-sidebar__footer-button')
  await ready(s.page, 'settings')
})

test('关于: 「由 Starry Digital 开发」 is a link that opens https://starrydigital.ca through the bridge (a test run only writes the log)', async () => {
  const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
  const want = 'not opened in a test run: https://starrydigital.ca'
  assert.ok(!log().includes(want), 'control: nothing opened before the click')
  await s.page.click('[data-part="made-by"] button')
  const end = Date.now() + 20_000
  while (Date.now() < end && !log().includes(want)) await new Promise(r => setTimeout(r, 100))
  assert.ok(log().includes(want), 'the maker page was asked for')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
