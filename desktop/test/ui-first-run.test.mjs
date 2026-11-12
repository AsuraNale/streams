// redesign R1: 概览 is gone and the app opens on a library's 待看 — the screen this file waits for is 'inbox' (was 'overview'); nothing else changed
// 首次打开 (v2 package I, contract I1; screens/first-run.js, screens/chat.js's guide, screens/new-library.js) on the running app.
// v2 package I rewrote this file: v1.0's 首次设置 was five steps in one wizard, shown while no library was open; 首次打开 is
// shown while the app knows no library at all and is two steps — 连接方式, then 和主 Agent 聊 with a guide — and v1.0's other
// steps are 新建库 (the manual way), a flow of its own. v1.0's checks of those steps (the folder, the pack with every source
// removed and one RSS on this machine added, the round to its end, the six records) are kept, on 新建库.
// Session A (no library registered, the connections faked, the folder dialog answered by STREAMS_DEV_CHOOSE_FOLDER): the two-step
// sidebar; the connection chosen → settings.json setupConnection (no library yet), then 和主 Agent 聊 with the guide; an example
// only fills the input (nothing sent: no line in the agent's record); 「也可以手动新建」 → 新建库: folder → pack → round → schedule;
// the new library is registered and current, its setup has six records, the connection's copied from setupConnection (its time).
// Session B: the connection skipped → setupConnection skipped; the guide says 「还没有连接，主 Agent 用不了」 with 「去设置」;
// 「也可以手动新建」 then 「取消」 comes back. Session C (the reverse): a library registered but none current (active null) → not
// 首次打开 but 库架 — v1.0's trigger (「no library open」) would show 首次打开 here. The core's registry reads `active: null` as its
// first library (core registry: an active id not in the list is the first one's), so the main process never sends that state
// on its own: the test registers one library, then answers getAppState itself in the main process with that library's
// state and `library: null`, and loads the page again — the page's own rule is what is checked. Session D: a folder holding
// other things is refused at 新建库's first step and nothing is made in it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { FIRST_RUN } from '../src/renderer/texts/first-run.js'
import { AGENT } from '../src/renderer/texts/agent.js'
import { ready } from './support/app.mjs'
import { startFeed, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const RSS_NAME = 'local-feed'
const G = AGENT.guide

let feed = null
const a = worldSession({
  kind: 'empty',
  waitFor: 'first-run',
  prepare: async world => {
    mkdirSync(join(world.root, 'chosen'))
    feed = await startFeed()
    return () => feed.close()
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'chosen') }),
})
const chosenDir = () => join(a.world.root, 'chosen')
const click = (page, sel) => page.click(`${sel} button`)
const until = (page, fn, arg) => page.waitForFunction(fn, arg, POLL)
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent ?? null, sel)
const step = (page, screen = 'new-library') => page.evaluate(s => document.querySelector(`main[data-screen="${s}"] .fr-body`)?.dataset.step ?? null, screen)
const stepIs = (page, id) => until(page, i => document.querySelector('main[data-screen="new-library"][data-state="ready"] .fr-body')?.dataset.step === i, id)
const settingsOf = w => JSON.parse(readFileSync(join(w.appData, 'settings.json'), 'utf8'))
const registryOf = w => (existsSync(join(w.appData, 'libraries.json')) ? JSON.parse(readFileSync(join(w.appData, 'libraries.json'), 'utf8')) : null)
const config = () => JSON.parse(readFileSync(join(chosenDir(), 'streams.json'), 'utf8'))
const transcriptOf = w => join(w.appData, core.AGENT_DIR, core.TRANSCRIPT_FILE)
/** streams.json's setup without the times (each record's `at` is checked to be an ISO time). */
const setupOnDisk = () => {
  const setup = config().setup ?? {}
  for (const [s, r] of Object.entries(setup)) assert.ok(r.at === new Date(r.at).toISOString(), `${s}.at ${r.at}`)
  return Object.fromEntries(Object.entries(setup).map(([s, { at, ...rest }]) => [s, rest]))
}

test('no library registered → 首次打开 on its first step, with its own sidebar of two steps (连接方式, 想追踪什么)', async () => {
  assert.deepEqual(registryOf(a.world).libraries, [], 'control: the registry is empty (the world\'s library folder is not registered)')
  assert.equal(await step(a.page, 'first-run'), 'connection')
  const steps = await a.page.evaluate(() => [...document.querySelectorAll('.st-sidebar [data-step]')].map(e => [e.dataset.step, e.dataset.stepState, e.querySelector('.st-sidebar__step-name').textContent]))
  assert.deepEqual(steps, [['connection', 'current', FIRST_RUN.steps.connection], ['track', 'todo', FIRST_RUN.steps.track]])
  assert.equal(await a.page.evaluate(() => document.querySelectorAll('[data-nav]').length), 0, 'not the usual entries')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="back"]')), null, 'nothing before the first step')
  assert.equal((await a.page.evaluate(() => window.streams.getAppState())).data.libraryCount, 0)
})

test('step 1: three cards, the recommended one tagged; 用这一条 + 下一步 → settings.json setupConnection (no library yet) → 和主 Agent 聊 with the guide', async () => {
  const cards = await a.page.evaluate(() => [...document.querySelectorAll('[data-connection]')].map(c => [c.dataset.connection, c.dataset.connState]))
  assert.deepEqual(cards, [['claude-code', 'usable'], ['codex', 'usable'], ['api', 'no-key']])
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-connection="claude-code"] .st-tag--recommend')?.textContent ?? null), CONNECTIONS.recommended)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="next"] button').disabled), true, 'no connection chosen: no next')
  await click(a.page, '[data-connection="claude-code"] [data-action="use"]')
  await until(a.page, () => document.querySelector('[data-connection="claude-code"] [data-probe="ok"]') !== null)
  assert.equal(settingsOf(a.world).setupConnection ?? null, null, 'control: nothing recorded before the step is walked through')
  const t0 = Date.now()
  await click(a.page, '[data-action="next"]')
  await ready(a.page, 'chat')
  const rec = settingsOf(a.world).setupConnection
  assert.deepEqual([rec.by, rec.detail], ['chose', 'claude-code'])
  assert.ok(Date.parse(rec.at) >= t0 - 2000 && rec.at === new Date(rec.at).toISOString(), rec.at)
  assert.deepEqual(registryOf(a.world).libraries, [], 'still no library')
  // the second step: the guide above the conversation, three examples, the manual way; a connection is chosen: no 「还没有连接」
  await until(a.page, () => document.querySelector('[data-part="first-guide"]') !== null)
  assert.equal(await text(a.page, '[data-part="first-guide"] .chat-guide__text'), G.text)
  assert.deepEqual(await a.page.evaluate(() => [...document.querySelectorAll('[data-action="example"]')].map(e => e.textContent.trim())), [...G.examples])
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="manual-new"]')?.textContent.trim()), G.manual)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-part="guide-no-connection"]')), null)
  // now the app's own sidebar
  assert.ok(await a.page.evaluate(() => document.querySelector('[data-nav="chat"]') !== null))
})

test('an example only fills the input: nothing is sent (no line in the main agent\'s record), the input is focused and can be changed', async () => {
  const lines = () => (existsSync(transcriptOf(a.world)) ? readFileSync(transcriptOf(a.world), 'utf8').split('\n').filter(Boolean).length : 0)
  const before = lines()
  assert.equal(await a.page.evaluate(() => document.querySelector('textarea[data-field="message"]').value), '', 'control: the input is empty')
  await a.page.click('[data-action="example"][data-example="1"] button')
  await until(a.page, t => document.querySelector('textarea[data-field="message"]')?.value === t, G.examples[1])
  await until(a.page, () => document.activeElement?.matches('textarea[data-field="message"]') === true)
  await a.page.waitForTimeout(500)
  assert.equal(lines(), before, 'nothing written to the record')
  assert.equal(await a.page.evaluate(() => document.querySelectorAll('[data-part="conversation"] [data-row="you"]').length), 0, 'no sentence of yours on the page')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-part="compose"]').dataset.busy), 'false')
  await a.page.click('[data-action="example"][data-example="0"] button')
  await until(a.page, t => document.querySelector('textarea[data-field="message"]')?.value === t, G.examples[0])
  await a.page.fill('textarea[data-field="message"]', '')
})

test('「也可以手动新建」 → 新建库 (four steps, no connection); the folder: a library is made there, registered and current', async () => {
  await click(a.page, '[data-action="manual-new"]')
  await ready(a.page, 'new-library')
  const steps = await a.page.evaluate(() => [...document.querySelectorAll('.st-sidebar [data-step]')].map(e => [e.dataset.step, e.dataset.stepState]))
  assert.deepEqual(steps, [['folder', 'current'], ['pack', 'todo'], ['trial', 'todo'], ['schedule', 'todo']], 'v1.0\'s steps without the connection')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="next"] button').disabled), true, 'nothing chosen yet: no next')
  await click(a.page, '[data-action="choose-folder"]')
  await until(a.page, () => document.querySelector('[data-folder-path]') !== null)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-folder-path]').dataset.folderPath), chosenDir())
  assert.equal(await text(a.page, '[data-folder-note]'), FIRST_RUN.folder.empty)
  assert.equal(existsSync(join(chosenDir(), 'streams.json')), false, 'control: nothing made before 下一步')
  await click(a.page, '[data-action="next"]')
  await stepIs(a.page, 'pack')
  const reg = registryOf(a.world)
  assert.deepEqual(reg.libraries.map(l => l.path), [chosenDir()], 'registered')
  assert.equal(reg.libraries[0].id, reg.active, 'and current')
  const rec = settingsOf(a.world).setupConnection
  assert.deepEqual(setupOnDisk(), { connection: { by: 'chose', detail: 'claude-code' }, library: { by: 'chose', detail: 'empty' } })
  assert.equal(config().setup.connection.at, rec.at, 'the connection\'s record is 首次打开\'s, its time kept')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="cancel-new"]')), null, 'no 取消 once the library is made')
})

test('the pack (its sources removed, one RSS on this machine added) → the round to its end → 定时 → 完成: six records; the new library\'s 待看', async () => {
  const packs = (await a.page.evaluate(() => window.streams.getStarterPacks())).data
  const pack = packs[0]
  await a.page.click(`[data-pack="${pack.id}"]`)
  await until(a.page, () => document.querySelector('[data-part="pack-detail"]') !== null)
  for (let i = 0; i < pack.sources.length; i++) {
    await a.page.click('[data-part="pack-detail"] [data-source] [data-action="remove-source"]')
    await until(a.page, n => document.querySelectorAll('[data-part="pack-detail"] [data-source]').length === n, pack.sources.length - i - 1)
  }
  await a.page.fill('[data-field="rss-name"]', RSS_NAME)
  await a.page.fill('[data-field="rss-url"]', feed.feed)
  await click(a.page, '[data-action="add-rss"]')
  await click(a.page, '[data-action="apply"]')
  await until(a.page, () => document.querySelector('[data-part="tried"]') !== null)
  assert.deepEqual(await a.page.evaluate(() => [...document.querySelectorAll('[data-part="tried"] [data-source]')].map(e => [e.dataset.source, e.dataset.fetchState])), [[RSS_NAME, 'ok']])
  assert.deepEqual(config().topics.map(t => t.name), pack.topics)
  assert.deepEqual(config().sources.map(s => [s.name, s.kind, s.url]), [[RSS_NAME, 'rss', feed.feed]])
  await click(a.page, '[data-action="continue"]')
  await stepIs(a.page, 'trial')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-no-connection]')), null, 'a connection was chosen: no 「没有连接」 line')
  assert.equal(readdirSync(join(chosenDir(), '_pipeline', 'inbox')).length, 0, 'control: nothing in the inbox before the round')
  await click(a.page, '[data-action="start"]')
  await until(a.page, () => document.querySelector('[data-part="round-progress"]')?.dataset.done === 'true')
  const inboxFiles = readdirSync(join(chosenDir(), '_pipeline', 'inbox'))
  assert.ok(inboxFiles.length > 0, 'the round wrote inbox files')
  await click(a.page, '[data-action="next"]')
  await stepIs(a.page, 'schedule')
  await click(a.page, '[data-action="go-inbox"]')
  await ready(a.page, 'inbox')
  assert.deepEqual(setupOnDisk(), {
    connection: { by: 'chose', detail: 'claude-code' },
    library: { by: 'chose', detail: 'empty' },
    pack: { by: 'chose', detail: pack.id },
    sources: { by: 'wrote', detail: { removed: pack.sources.length, added: 1 } },
    trial: { by: 'chose' },
    schedule: { by: 'default', detail: { enabled: true, time: '08:30' } },
  }, 'six records, the connection from 首次打开')
  await until(a.page, n => document.querySelector('[data-library-row][data-active="true"] .st-sidebar__lib-name')?.textContent === n, basename(chosenDir()))
  // a library now: the guide is gone from 和主 Agent 聊
  await a.page.click('[data-nav="chat"]')
  await ready(a.page, 'chat')
  await a.page.waitForTimeout(300)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-part="first-guide"]')), null)
})

test('no page errors (session A)', () => {
  assert.deepEqual(a.errors, [])
})

const b = worldSession({
  kind: 'empty',
  waitFor: 'first-run',
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake' }),
})

test('the connection skipped → setupConnection skipped; the guide says 还没有连接 with 去设置; 也可以手动新建 still works, 取消 comes back', async () => {
  await b.page.waitForFunction(() => document.querySelectorAll('[data-connection]').length === 3, null, POLL)
  await click(b.page, '[data-action="skip"]')
  await ready(b.page, 'chat')
  const rec = settingsOf(b.world).setupConnection
  assert.equal(rec.by, 'skipped')
  assert.equal(Object.hasOwn(rec, 'detail'), false)
  assert.equal(settingsOf(b.world).connections?.active ?? null, null, 'no connection chosen')
  await until(b.page, () => document.querySelector('[data-part="guide-no-connection"]') !== null)
  assert.equal(await text(b.page, '[data-part="guide-no-connection"] .st-t-wait'), G.noConnection)
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-part="guide-no-connection"] [data-action="go-settings"]')?.textContent.trim()), G.goSettings)
  assert.equal(await b.page.evaluate(() => document.querySelectorAll('[data-part="no-connection"]').length), 0, 'the line is said once')
  await click(b.page, '[data-action="manual-new"]')
  await ready(b.page, 'new-library')
  await click(b.page, '[data-action="cancel-new"]')
  await ready(b.page, 'chat')
  assert.deepEqual(registryOf(b.world).libraries, [], 'nothing made')
  await click(b.page, '[data-part="guide-no-connection"] [data-action="go-settings"]')
  await ready(b.page, 'settings')
  assert.deepEqual(b.errors, [])
})

// the reverse: a library registered, none current
const c = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: world => {
    const r = core.withLibrary(core.emptyRegistry(), world.library, { name: 'kept-but-not-current' })
    core.writeRegistry(join(world.appData, 'libraries.json'), r.registry)
  },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake' }),
})

test('a library registered but none current (active null) → not 首次打开: 库架, with that library on it', async () => {
  const real = (await c.page.evaluate(() => window.streams.getAppState())).data
  assert.deepEqual([real.libraryCount, real.library?.path], [1, c.world.library], 'control: one library, registered and current')
  // the state the page is asked to decide on: the same, with no current library
  await c.app.evaluate(({ ipcMain }, state) => {
    ipcMain.removeHandler('streams:getAppState')
    ipcMain.handle('streams:getAppState', async () => ({ ok: true, data: state }))
  }, { ...real, library: null })
  const stubbed = (await c.page.evaluate(() => window.streams.getAppState())).data
  assert.deepEqual([stubbed.library, stubbed.libraryCount], [null, 1])
  await c.page.evaluate(() => { location.hash = ''; location.reload() })
  await c.page.waitForFunction(() => document.querySelector('main[data-screen][data-state="ready"]') !== null, null, { polling: 100, timeout: 90_000 })
  const screen = await c.page.evaluate(() => document.querySelector('main[data-screen][data-state="ready"]').dataset.screen)
  assert.equal(screen, 'shelf', `the app opened on ${screen}`)
  assert.equal(await c.page.evaluate(() => document.querySelector('main[data-screen="first-run"]')), null)
  await c.page.waitForFunction(() => document.querySelectorAll('[data-shelf-card]').length === 1, null, POLL)
  assert.deepEqual(c.errors, [])
})

const d = worldSession({
  kind: 'empty',
  waitFor: 'new-library',
  prepare: world => { mkdirSync(join(world.root, 'full')); writeFileSync(join(world.root, 'full', 'notes.txt'), 'not a library\n') },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'full'), STREAMS_START_SCREEN: 'new-library' }),
})

test('control: a folder holding other things is refused at 新建库\'s first step and nothing is made in it', async () => {
  await click(d.page, '[data-action="choose-folder"]')
  await until(d.page, () => document.querySelector('[data-folder-path]') !== null)
  assert.equal(await d.page.evaluate(() => document.querySelector('.fr-folder').dataset.folderState), 'other')
  assert.equal(await text(d.page, '[data-folder-note]'), FIRST_RUN.folder.other)
  assert.equal(await d.page.evaluate(() => document.querySelector('[data-action="next"] button').disabled), true)
  assert.deepEqual(readdirSync(join(d.world.root, 'full')), ['notes.txt'])
  assert.equal(await step(d.page), 'folder')
  assert.deepEqual(d.errors, [])
})
