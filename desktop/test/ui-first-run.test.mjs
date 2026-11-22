// redesign R4a: this file is rewritten for 首次打开 as one screen (docs/checks/2026-11-12-r4a/contract.md R4a-1, R4a-2; design P01,
// P02; 维护者 11-11 第 4 题): v2 package I's two-step 首次打开 (its own sidebar 连接方式 · 想追踪什么, 「用这一条」 with a probe, 「下一步」)
// is gone — and with it v2 package I's checks of those steps, the guide of 和主 Agent 聊 as 首次打开's second step, and 新建库's four
// steps (folder → pack → round → schedule: their checks are in ui-new-library.test.mjs, on the one-page form). What stays: a
// library registered but none current opens on 库架, not 首次打开 (session D, unchanged).
// The connection detection is stood in for with STREAMS_DEV_DETECT (a JSON file the test rewrites: found or not, signed in or
// not, the version); every connection is the fake one (STREAMS_DEV_CONNECTION=fake: nothing real runs, no login window opens).
// Session A (Claude Code and Codex found and signed in): one screen at once — no 连接选择, Claude Code chosen without asking
// (settings.json: connections.active, setupConnection by default), the line on top says it (version, signed in, whose bill),
// no separate 试一次 (no probe in the log); an example only fills the box (nothing sent: the agent's record does not exist);
// 更换连接 → 连接选择 → 使用此连接 on Codex → back, Codex on top; 发送 → 主 Agent with that sentence sent (the record has it).
// Session B (Claude Code found, not signed in; Codex not found; no key): 连接选择 at once (one of the three cases); 前往登录 asks the
// main process (a test run opens nothing; the log says so); the CLI signs in (the file rewritten) → 已登录，重新检测 → 使用此连接 →
// the one screen with it. 输入 API key opens the key dialog.
// Session C (nothing found): 连接选择 at once; 暂时跳过 → the one screen with 未连接 (发送 off), setupConnection skipped; 手动创建 →
// 新建库, 取消 back; 暂不创建，先进入应用 → 库架.
// Session D: a library registered but none current (active null) → 库架, not 首次打开.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { FIRST_RUN as T, HOW_IT_WORKS } from '../src/renderer/texts/first-run.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'
import { markIn, markOfFile } from './support/brand.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const C = T.connect
const until = (page, fn, arg) => page.waitForFunction(fn, arg, POLL)
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent ?? null, sel)
const view = page => page.evaluate(() => document.querySelector('[data-part="first-run"]')?.dataset.view ?? null)
const viewIs = (page, v) => until(page, x => document.querySelector('main[data-screen="first-run"][data-state="ready"] [data-part="first-run"]')?.dataset.view === x, v)
const settingsOf = w => JSON.parse(readFileSync(join(w.appData, 'settings.json'), 'utf8'))
const registryOf = w => (existsSync(join(w.appData, 'libraries.json')) ? JSON.parse(readFileSync(join(w.appData, 'libraries.json'), 'utf8')) : null)
const transcriptOf = w => join(w.appData, core.AGENT_DIR, core.TRANSCRIPT_FILE)
const mainLog = w => readFileSync(join(w.appData, 'logs', 'main.log'), 'utf8')
const detectFile = w => join(w.root, 'detect.json')
const writeDetect = (w, d) => writeFileSync(detectFile(w), JSON.stringify(d), 'utf8')
const session = detect => worldSession({
  kind: 'empty',
  waitFor: 'first-run',
  prepare: world => { writeDetect(world, detect) },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_DETECT: detectFile(world), STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs') }),
})

// ---- A: found and signed in ----
const a = session({ 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } })

test('R4a-1 signed in → one screen at once: Claude Code chosen without asking, the line on top, no 连接选择 and no 试一次', async () => {
  assert.deepEqual(registryOf(a.world).libraries, [], 'control: no library at all')
  await viewIs(a.page, 'home')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-part="connect-cards"]')), null, 'no 连接选择')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-part="current-connection"]')?.dataset.kind), 'claude-code')
  assert.equal(await text(a.page, '[data-part="current-connection"] .file-text'), `${fmt(T.current, { name: CONNECTIONS.names['claude-code'] })}版本 2.1.287 · ${T.loggedIn} · ${T.billing['claude-code']}`)
  assert.equal((await text(a.page, '[data-part="current-connection"] [data-part="connected"]')).trim(), T.connected)
  assert.equal((await text(a.page, '[data-action="change-connection"]')).trim(), T.change)
  assert.equal(await text(a.page, '[data-part="head-connection"]'), fmt(T.headChip, { name: CONNECTIONS.names['claude-code'] }))
  const s = settingsOf(a.world)
  assert.equal(s.connections.active, 'claude-code', 'the recommended one is in use')
  assert.deepEqual([s.setupConnection.by, s.setupConnection.detail], ['default', 'claude-code'])
  // one screen: what to track, its line, three examples, the box, the three ways out
  assert.equal(await text(a.page, '[data-part="track"] h2'), T.heading)
  assert.equal(await text(a.page, '[data-part="track"] h2 + p'), T.lead)
  assert.deepEqual(await a.page.evaluate(() => [...document.querySelectorAll('[data-part="examples"] [data-example] .file-text')].map(e => e.firstChild.textContent)), [...T.examples])
  assert.equal(await a.page.evaluate(() => document.querySelector('textarea[data-field="track"]')?.placeholder), T.placeholder)
  assert.deepEqual(await a.page.evaluate(() => ['send', 'manual-new', 'skip-create'].map(n => document.querySelector(`[data-action="${n}"] button`)?.textContent.trim())), [T.send, T.manual, T.skip])
  // no separate 试一次: no such words on the page, no probe made
  const body = await a.page.evaluate(() => document.body.innerText)
  for (const w of ['试一次', CONNECTIONS.probe.trying, '测试连接']) assert.equal(body.includes(w), false, `「${w}」 is not on the page`)
  assert.equal(/connections: probe /.test(mainLog(a.world)), false, 'no probe in the log')
  // the usual frame: the sidebar and the right panel (its 详情: 流息怎样工作)
  assert.equal(await a.page.evaluate(() => document.querySelector('aside.sidebar [data-action="add-library"]') !== null), true)
  assert.equal(await text(a.page, '[data-part="how-it-works"] h3'), HOW_IT_WORKS.titleFirst)
})

// logo (docs/checks/2026-11-12-logo/contract.md L-3, 2026-11-12): a check added — 首次打开's sidebar shows the new mark too
test('logo: 首次打开\'s brand is 流息\'s mark — mark-black.svg\'s one path in currentColor, the theme\'s ink (not the template\'s weave)', async () => {
  const file = markOfFile()
  const got = await markIn(a.page, '.st-sidebar .brand .brandmark svg')
  assert.deepEqual([got.viewBox, got.paths.length, got.paths[0].transform, got.paths[0].d, got.paths[0].fill, got.glyph], [file.viewBox, 1, file.transform, file.d, 'currentColor', null])
  const ink = await a.page.evaluate(() => getComputedStyle(document.body).color)
  assert.equal(got.paths[0].computedFill, ink)
  assert.equal(got.shown, true)
})

test('R4a-1 an example only fills the box: nothing is sent (no record of the main agent), the page stays', async () => {
  await a.page.click('[data-part="examples"] [data-example="1"]')
  await until(a.page, t => document.querySelector('textarea[data-field="track"]')?.value === t, T.examples[1])
  await until(a.page, () => document.activeElement?.matches('textarea[data-field="track"]') === true)
  await a.page.waitForTimeout(400)
  assert.equal(existsSync(transcriptOf(a.world)), false, 'nothing went to the main agent')
  assert.equal(await view(a.page), 'home')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="send"] button').disabled), false)
})

test('R4a-2 更换连接 → 连接选择 (Claude Code is the current one) → 使用此连接 on Codex → back to the one screen, Codex on top', async () => {
  await a.page.click('[data-action="change-connection"] button')
  await viewIs(a.page, 'pick')
  const cards = await a.page.evaluate(() => [...document.querySelectorAll('[data-connection]')].map(c => [c.dataset.connection, c.dataset.connState, c.dataset.selected]))
  assert.deepEqual(cards, [['claude-code', 'usable', 'true'], ['codex', 'usable', 'false'], ['api', 'no-key', 'false']])
  assert.equal(await text(a.page, '[data-connection="codex"] [data-detect]'), `已找到 0.44 · ${C.loggedIn} · ${T.billing.codex}`)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-connection="claude-code"] [data-chosen]')?.textContent.trim()), C.inUse)
  await a.page.click('[data-connection="codex"] [data-action="use"] button')
  await viewIs(a.page, 'home')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-part="current-connection"]')?.dataset.kind), 'codex')
  const s = settingsOf(a.world)
  assert.equal(s.connections.active, 'codex')
  assert.deepEqual([s.setupConnection.by, s.setupConnection.detail], ['chose', 'codex'])
})

// 1.1 W6b: 发送 goes to 新建库 (screens/build.js) with the sentence — no longer v1.0's main agent page. This session's connection
// is Codex (the step above chose it), and in 1.1 only Claude Code builds: the page keeps the sentence, says why it cannot start
// and sends nothing. (On Claude Code the sentence starts the conversation at once: test/ui-w6b.test.mjs.)
test('R4a-1 发送 → 新建库 with the sentence; on Codex it says why it cannot start and nothing is sent; nothing to the main agent, nothing made', async () => {
  const sentence = '我想跟踪 AI agent 的新工具和评测，不要营销稿。'
  await a.page.fill('textarea[data-field="track"]', sentence)
  await a.page.click('[data-action="send"] button')
  await ready(a.page, 'build')
  assert.equal((await a.page.evaluate(() => window.streams.getAppState())).data.activeConnection, 'codex', 'control: the connection of this session')
  const p = await a.page.evaluate(() => ({ view: document.querySelector('main[data-screen="build"]').dataset.view, box: document.querySelector('textarea[data-field="opener"]').value, why: Boolean(document.querySelector('[data-part="start-why"]')), start: document.querySelector('[data-action="start"] button').disabled }))
  assert.deepEqual(p, { view: 'start', box: sentence, why: true, start: true })
  assert.equal((await a.page.evaluate(() => window.streams.getBuild())).data, null, 'nothing sent')
  assert.equal(existsSync(transcriptOf(a.world)), false, 'nothing went to the main agent')
  assert.deepEqual(registryOf(a.world)?.libraries ?? [], [], 'nothing made')
  assert.deepEqual(a.errors, [])
})

// ---- B: found, not signed in ----
const b = session({ 'claude-code': { installed: true, loggedIn: false, version: '2.1.287' }, codex: { installed: false } })

test('R4a-2 found but not signed in → 连接选择 at once: three cards, found / version / signed in / whose bill, 前往登录 + 已登录，重新检测, 输入 API key', async () => {
  await viewIs(b.page, 'pick')
  assert.equal(await text(b.page, '#fr-title'), C.title)
  assert.equal(await text(b.page, '[data-part="connect"] h2'), C.heading)
  const cards = await b.page.evaluate(() => [...document.querySelectorAll('[data-connection]')].map(c => [c.dataset.connection, c.dataset.connState, c.querySelector('.file-text').firstChild.textContent, c.querySelector('[data-detect]').textContent]))
  assert.deepEqual(cards, [
    ['claude-code', 'not-logged-in', CONNECTIONS.names['claude-code'], `${C.recommended} · 已找到 2.1.287 · ${C.notLoggedIn} · ${T.billing['claude-code']}`],
    ['codex', 'not-installed', CONNECTIONS.names.codex, `${C.notFound} · ${T.billing.codex}`],
    ['api', 'no-key', CONNECTIONS.names.api, `${C.anyVendor} · ${T.billing.api}`],
  ])
  assert.equal((await text(b.page, '[data-connection="claude-code"] [data-action="login"] button')).trim(), C.login)
  assert.equal((await text(b.page, '[data-login-for="claude-code"] [data-action="login-again"] button')).trim(), C.loginAgain)
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-connection="codex"] button')), null, 'nothing to do on one not found')
  assert.equal((await text(b.page, '[data-connection="api"] [data-action="set-key"] button')).trim(), C.setKey)
  assert.deepEqual(await b.page.evaluate(() => ['redetect', 'skip-connection'].map(n => document.querySelector(`[data-action="${n}"] button`)?.textContent.trim())), [C.redetect, C.skip])
  assert.equal(settingsOf(b.world).connections?.active ?? null, null, 'nothing chosen')
})

test('R4a-2 输入 API key opens the key dialog (its look is R4b\'s); 前往登录 asks the main process (a test run opens nothing)', async () => {
  await b.page.click('[data-connection="api"] [data-action="set-key"] button')
  await until(b.page, () => document.querySelector('[data-dialog="api-key"]') !== null)
  await b.page.keyboard.press('Escape')
  await until(b.page, () => document.querySelector('[data-dialog="api-key"]') === null)
  await b.page.click('[data-connection="claude-code"] [data-action="login"] button')
  await until(b.page, () => true)
  const deadline = Date.now() + 10_000
  while (!mainLog(b.world).includes('connections: login for claude-code not opened') && Date.now() < deadline) await b.page.waitForTimeout(100)
  assert.ok(mainLog(b.world).includes('connections: login for claude-code not opened'), 'openLogin was asked for Claude Code')
})

test('R4a-2 the CLI signed in → 已登录，重新检测 → 使用此连接 → the one screen with Claude Code on top', async () => {
  writeDetect(b.world, { 'claude-code': { installed: true, loggedIn: true, version: '2.1.288' }, codex: { installed: false } })
  await b.page.click('[data-login-for="claude-code"] [data-action="login-again"] button')
  await until(b.page, () => document.querySelector('[data-connection="claude-code"]')?.dataset.connState === 'usable')
  assert.equal(await view(b.page), 'pick', 'still the cards: the choice is yours')
  await b.page.click('[data-connection="claude-code"] [data-action="use"] button')
  await viewIs(b.page, 'home')
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-part="current-connection"]')?.dataset.kind), 'claude-code')
  assert.ok((await text(b.page, '[data-part="current-connection"] small')).startsWith('版本 2.1.288'))
  assert.deepEqual([settingsOf(b.world).setupConnection.by, settingsOf(b.world).setupConnection.detail], ['chose', 'claude-code'])
  assert.deepEqual(b.errors, [])
})

// ---- C: nothing found ----
const c = session({ 'claude-code': { installed: false }, codex: { installed: false } })

test('R4a-2 nothing found → 连接选择; 暂时跳过 → the one screen says 未连接 and 发送 stays off; setupConnection skipped', async () => {
  await viewIs(c.page, 'pick')
  await c.page.click('[data-action="skip-connection"] button')
  await viewIs(c.page, 'home')
  assert.equal(await c.page.evaluate(() => document.querySelector('[data-part="current-connection"]')), null)
  assert.ok((await text(c.page, '[data-part="no-connection"] .file-text')).startsWith(T.none))
  assert.equal(await text(c.page, '[data-part="head-connection"]'), T.headChipNone)
  await c.page.fill('textarea[data-field="track"]', '追踪电池价格')
  assert.equal(await c.page.evaluate(() => document.querySelector('[data-action="send"] button').disabled), true, 'no connection: nothing to send to')
  const s = settingsOf(c.world)
  assert.equal(s.setupConnection.by, 'skipped')
  assert.equal(s.connections?.active ?? null, null)
  // 选择连接 brings the cards back
  await c.page.click('[data-action="pick-connection"] button')
  await viewIs(c.page, 'pick')
  await c.page.click('[data-action="skip-connection"] button')
  await viewIs(c.page, 'home')
})

test('R4a-1 the ways out: 手动创建 → 新建库 (1.1 W6b: the one-sentence page; 取消 comes back to 首次打开); 暂不创建，先进入应用 → 库架; nothing made', async () => {
  await c.page.click('[data-action="manual-new"] button')
  await ready(c.page, 'build')
  assert.equal(await c.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.view), 'start')
  await c.page.click('[data-action="cancel-build"] button')
  await ready(c.page, 'first-run')
  await viewIs(c.page, 'home')
  await c.page.click('[data-action="skip-create"] button')
  await ready(c.page, 'shelf')
  assert.deepEqual(registryOf(c.world).libraries, [], 'nothing made')
  assert.deepEqual(c.errors, [])
})

// ---- D: the reverse of the trigger — a library registered, none current ----
const d = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: world => {
    const r = core.withLibrary(core.emptyRegistry(), world.library, { name: 'kept-but-not-current' })
    core.writeRegistry(join(world.appData, 'libraries.json'), r.registry)
  },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake' }),
})

test('a library registered but none current (active null) → not 首次打开: 库架, with that library on it', async () => {
  const real = (await d.page.evaluate(() => window.streams.getAppState())).data
  assert.deepEqual([real.libraryCount, real.library?.path], [1, d.world.library], 'control: one library, registered and current')
  // the state the page is asked to decide on: the same, with no current library
  await d.app.evaluate(({ ipcMain }, state) => {
    ipcMain.removeHandler('streams:getAppState')
    ipcMain.handle('streams:getAppState', async () => ({ ok: true, data: state }))
  }, { ...real, library: null })
  const stubbed = (await d.page.evaluate(() => window.streams.getAppState())).data
  assert.deepEqual([stubbed.library, stubbed.libraryCount], [null, 1])
  await d.page.evaluate(() => { location.hash = ''; location.reload() })
  await d.page.waitForFunction(() => document.querySelector('main[data-screen][data-state="ready"]') !== null, null, { polling: 100, timeout: 90_000 })
  const screen = await d.page.evaluate(() => document.querySelector('main[data-screen][data-state="ready"]').dataset.screen)
  assert.equal(screen, 'shelf', `the app opened on ${screen}`)
  assert.equal(await d.page.evaluate(() => document.querySelector('main[data-screen="first-run"]')), null)
  await d.page.waitForFunction(() => document.querySelectorAll('[data-shelf-card]').length === 1, null, POLL)
  assert.deepEqual(d.errors, [])
})
