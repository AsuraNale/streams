// 首次设置 (screens/first-run.js) on the running app: no library open (STREAMS_DEV_LIBRARY=''), the three connections faked (STREAMS_DEV_CONNECTION=fake),
// the folder dialog answered by STREAMS_DEV_CHOOSE_FOLDER. Session A walks the four steps: the folder (a library made in it),
// the connection (the recommended one chosen and probed), the pack (every pack source removed and one RSS on this machine
// added, so the round touches no network), the first round to its end, then 今日 with the folder's name in the sidebar.
// On disk after each step: streams.json's topics are the pack's, its sources are the edit, _pipeline/inbox/ holds files.
// Session B: the hook points at a folder holding other things → the first step refuses it and 下一步 stays disabled.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { FIRST_RUN } from '../src/renderer/texts/first-run.js'
import { ready } from './support/app.mjs'
import { startFeed, worldSession } from './support/seed.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const RSS_NAME = 'local-feed'

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
const step = page => page.evaluate(() => document.querySelector('main[data-screen="first-run"] .fr-body')?.dataset.step ?? null)
const config = () => JSON.parse(readFileSync(join(chosenDir(), 'streams.json'), 'utf8'))

test('no library open → the wizard, on its first step, with its own sidebar of five steps (the last one 定时)', async () => {
  assert.equal(await step(a.page), 'folder')
  const steps = await a.page.evaluate(() => [...document.querySelectorAll('.st-sidebar [data-step]')].map(e => [e.dataset.step, e.dataset.stepState]))
  assert.deepEqual(steps, [['folder', 'current'], ['connection', 'todo'], ['pack', 'todo'], ['trial', 'todo'], ['schedule', 'todo']])
  assert.equal(await a.page.evaluate(() => document.querySelectorAll('[data-nav]').length), 0, 'not the usual entries')
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="next"] button').disabled), true, 'nothing chosen yet: no next')
})

test('step 1: the folder chosen through the hook is shown as empty, 下一步 makes the library there and moves on', async () => {
  await click(a.page, '[data-action="choose-folder"]')
  await until(a.page, () => document.querySelector('[data-folder-path]') !== null)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-folder-path]').dataset.folderPath), chosenDir())
  assert.equal(await a.page.evaluate(() => document.querySelector('.fr-folder').dataset.folderState), 'empty')
  assert.equal(await text(a.page, '[data-folder-note]'), FIRST_RUN.folder.empty)
  await click(a.page, '[data-action="next"]')
  await until(a.page, () => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === 'connection')
  assert.ok(existsSync(join(chosenDir(), 'streams.json')), 'the library was made in the folder')
  assert.deepEqual(config().topics, [], 'control: no topics before the pack step')
  assert.equal(await a.page.evaluate(() => document.querySelector('.st-sidebar [data-step="folder"]').dataset.stepState), 'done')
  // the folder's path under the done step wraps: the 232px sidebar does not grow or scroll sideways
  const side = await a.page.evaluate(() => { const el = document.querySelector('.st-sidebar'); return { width: el.getBoundingClientRect().width, overflow: el.scrollWidth - el.clientWidth, sub: el.querySelector('[data-step="folder"] .st-sidebar__step-sub')?.textContent ?? '' } })
  assert.ok(side.sub.length > 30, `control: a long path is shown (${side.sub})`)
  assert.deepEqual([side.width, side.overflow], [232, 0])
})

test('step 2: three cards with the detection, the recommended one tagged; 用这一条 selects it and a probe answers 可用', async () => {
  const cards = await a.page.evaluate(() => [...document.querySelectorAll('[data-connection]')].map(c => [c.dataset.connection, c.dataset.connState, c.querySelector('[data-detect]').textContent]))
  assert.deepEqual(cards.map(c => c[0]), ['claude-code', 'codex', 'api'])
  // the development connection fakes the two tools; the API key is the real key store's (empty in a test world)
  assert.deepEqual(cards.map(c => c[1]), ['usable', 'usable', 'no-key'])
  for (const [kind, , detect] of cards.slice(0, 2)) assert.ok(detect.includes(CONNECTIONS.found) && detect.includes(CONNECTIONS.loggedIn), `${kind}: ${detect}`)
  assert.equal(cards[2][2], CONNECTIONS.keyNone)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-connection="api"] [data-action="use"] button').disabled), true, 'no key: the API card cannot be chosen')
  const names = await a.page.evaluate(() => [...document.querySelectorAll('[data-connection] .st-t-title')].map(e => e.textContent))
  assert.deepEqual(names, Object.values(CONNECTIONS.names))
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-connection="claude-code"] .st-tag--recommend')?.textContent ?? null), CONNECTIONS.recommended)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="next"] button').disabled), true, 'no connection chosen: no next')
  await click(a.page, '[data-connection="claude-code"] [data-action="use"]')
  await until(a.page, () => document.querySelector('[data-connection="claude-code"] [data-probe="ok"]') !== null)
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-connection="claude-code"]').dataset.selected), 'true')
  const conns = await a.page.evaluate(() => window.streams.getConnections())
  assert.equal(conns.data.active, 'claude-code', 'the main process has the choice')
  await click(a.page, '[data-action="next"]')
  await until(a.page, () => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === 'pack')
})

test('step 3: a pack chosen, its sources removed, one RSS on this machine added; 下一步 writes streams.json and tries each source', async () => {
  const packs = (await a.page.evaluate(() => window.streams.getStarterPacks())).data
  assert.ok(packs.length >= 1, 'at least one starter pack')
  const pack = packs[0]
  const ids = await a.page.evaluate(() => [...document.querySelectorAll('[data-pack]')].map(e => e.dataset.pack))
  assert.deepEqual(ids, [...packs.map(p => p.id), 'blank'])
  await a.page.click(`[data-pack="${pack.id}"]`)
  await until(a.page, () => document.querySelector('[data-part="pack-detail"]') !== null)
  assert.equal(await a.page.evaluate(() => document.querySelectorAll('[data-part="pack-detail"] [data-source]').length), pack.sources.length)
  for (let i = 0; i < pack.sources.length; i++) {
    await a.page.click('[data-part="pack-detail"] [data-source] [data-action="remove-source"]')
    await until(a.page, n => document.querySelectorAll('[data-part="pack-detail"] [data-source]').length === n, pack.sources.length - i - 1)
  }
  await a.page.fill('[data-field="rss-name"]', RSS_NAME)
  await a.page.fill('[data-field="rss-url"]', feed.feed)
  await click(a.page, '[data-action="add-rss"]')
  await until(a.page, name => document.querySelector(`[data-part="pack-detail"] [data-source="${name}"]`) !== null, RSS_NAME)
  await click(a.page, '[data-action="apply"]')
  await until(a.page, () => document.querySelector('[data-part="tried"]') !== null)
  const tried = await a.page.evaluate(() => [...document.querySelectorAll('[data-part="tried"] [data-source]')].map(e => [e.dataset.source, e.dataset.fetchState]))
  assert.deepEqual(tried, [[RSS_NAME, 'ok']])
  const cfg = config()
  assert.deepEqual(cfg.topics.map(t => t.name), pack.topics, 'the topics on disk are the pack\'s')
  assert.deepEqual(cfg.sources.map(s => [s.name, s.kind, s.url]), [[RSS_NAME, 'rss', feed.feed]], 'the sources on disk are the edit')
  await click(a.page, '[data-action="continue"]')
  await until(a.page, () => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === 'trial')
})

test('step 4: the estimate, 开始, the progress to done with the counts; _pipeline/inbox/ holds files; 下一步 → 定时, 完成，去今日 ends the wizard', async () => {
  const rows = await a.page.evaluate(() => [...document.querySelectorAll('[data-part="estimate"] [data-row]')].map(e => e.dataset.row))
  assert.deepEqual(rows, ['fetch', 'items', 'calls', 'cap'])
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-no-connection]')), null, 'a connection was chosen: no 「没有连接」 line')
  assert.equal(readdirSync(join(chosenDir(), '_pipeline', 'inbox')).length, 0, 'control: nothing in the inbox before the round')
  await click(a.page, '[data-action="start"]')
  await until(a.page, () => document.querySelector('[data-part="round-progress"]')?.dataset.done === 'true')
  const counts = await a.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-part="result"] [data-count]')].map(e => [e.dataset.count, e.textContent])))
  assert.ok(counts.fetched && counts.inbox, JSON.stringify(counts))
  const inboxFiles = readdirSync(join(chosenDir(), '_pipeline', 'inbox'))
  assert.ok(inboxFiles.length > 0, 'the round wrote inbox files')
  // the last screen, 定时 (test/ui-schedule.test.mjs checks it): 完成，去今日
  await click(a.page, '[data-action="next"]')
  await until(a.page, () => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === 'schedule')
  await click(a.page, '[data-action="go-today"]')
  await ready(a.page, 'today')
  assert.equal(await text(a.page, '.st-sidebar__library-name'), basename(chosenDir()))
  assert.equal(await a.page.evaluate(() => document.querySelector('[data-num="inbox"]').dataset.value), String(inboxFiles.length))
})

test('no page errors (session A)', () => {
  assert.deepEqual(a.errors, [])
})

const b = worldSession({
  kind: 'empty',
  waitFor: 'first-run',
  prepare: world => { mkdirSync(join(world.root, 'full')); writeFileSync(join(world.root, 'full', 'notes.txt'), 'not a library\n') },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'full') }),
})

test('control: a folder holding other things is refused at step 1 and nothing is made in it', async () => {
  await click(b.page, '[data-action="choose-folder"]')
  await until(b.page, () => document.querySelector('[data-folder-path]') !== null)
  assert.equal(await b.page.evaluate(() => document.querySelector('.fr-folder').dataset.folderState), 'other')
  assert.equal(await text(b.page, '[data-folder-note]'), FIRST_RUN.folder.other)
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-action="next"] button').disabled), true)
  assert.deepEqual(readdirSync(join(b.world.root, 'full')), ['notes.txt'])
  assert.equal(await step(b.page), 'folder')
  assert.deepEqual(b.errors, [])
})
