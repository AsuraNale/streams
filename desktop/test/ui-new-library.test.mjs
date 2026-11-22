// 新建库 as one page (redesign R4a, contract R4a-3 / R4a-4; design P04; F56, F57, F45–F49, N01) on the running app. v2 package I's
// four steps (库放在哪 → 主题与来源 → 试跑一轮 → 定时) and the starter-pack step are gone; their checks that still mean something
// are here, on the form (a folder of .md files opened as a library with every file as it was; a folder holding other things
// refused and nothing made in it). Every connection is the fake one; new libraries go to a folder of the world
// (STREAMS_DEV_LIBRARY_ROOT: never the real Documents); the sources tried are a server on this machine (the preset pack's rows
// are never fetched here: they are not tried until asked).
// Session N (the shelf's three libraries; 新建库 opened from the sidebar): the one page in the usual frame (sidebar, right panel),
// no step of a wizard; the defaults (标准, the app's schedule, the cap 120, <root>\<name>); 追踪要求 empty → both create buttons
// off and the bridge refuses it, nothing made; five sources typed, each tried where it was typed — 正常 · 2 条 with its latest
// title, 无更新, 地址无效, 暂时失败, 访问被拒 — each in V3's words with V3's 「怎么办」, never the server's own message; a row
// removed; the preset pack's line → its sources (not fetched) and topics, each removable; 严格程度 switched and back; 仅创建 → the
// library made, current, 标准 0.5 / 0.6, nothing queued and no round, the app on its 待看.
// Session R (one source on this machine): 创建并运行 → its first run goes (rounds.jsonl gets it), the app on its 待看.
// Session F (更改… chose a folder of the user's .md files): it says how many and that nothing is moved; 仅创建 opens it as a library,
// every file byte for byte. Session O (更改… chose a folder holding other things): it says so, the create buttons stay off.
// redesign R6b-1: the comments / test names / expected words here name the fetch states with 05 第三节's words (无更新 · 地址无效 ·
// 访问被拒; they said the v1 words) — the page's dictionaries changed; what is checked did not. 「创建库后的首次运行」 is how the queue says
// a first run now (R6b-2).
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { FETCH_HINTS, FETCH_STATES } from '../src/renderer/texts/common.js'
import { NEW_LIBRARY as T, HOW_IT_WORKS } from '../src/renderer/texts/first-run.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready, openForm } from './support/app.mjs'
import { seedImportFolder, seedShelf, worldSession } from './support/seed.mjs'
import { startFakeServer } from '../../core/test/support/fake-server.mjs'
import { EMPTY_RSS, rssWith } from '../../core/test/support/feeds.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const srv = await startFakeServer()
after(() => srv.close())
const URLS = {
  ok: srv.route('/ev.xml', { body: rssWith([{ title: '10 月乘用车零售数据', url: 'https://ev.test/1' }, { title: '动力电池 10 月装车量', url: 'https://ev.test/2' }]) }),
  empty: srv.route('/empty.xml', { body: EMPTY_RSS }),
  gap: srv.route('/gone.xml', { status: 404, body: 'HTTP 404 page not here' }),
  failed: srv.route('/busy.xml', { status: 503, body: 'upstream busy 503' }),
  blocked: srv.route('/blocked.xml', { status: 403, body: 'forbidden 403' }),
}
const BRIEF = '追踪中国新能源车的月度数据：乘用车零售与批发、渗透率。不要车型评测和软文。'
const until = (page, fn, arg) => page.waitForFunction(fn, arg, POLL)
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent ?? null, sel)
const disabled = (page, name) => page.evaluate(n => document.querySelector(`[data-action="${n}"] button`)?.disabled ?? null, name)
const config = dir => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'))
const formReady = page => until(page, () => document.querySelector('main[data-screen="new-library"][data-state="ready"] [data-part="folder-state"]')?.dataset.state !== '')
function tree(dir) {
  const out = {}
  const walk = d => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) walk(p)
      else out[relative(dir, p).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir)
  return out
}
async function addSource(page, url) {
  const n = await page.evaluate(() => document.querySelectorAll('[data-part="sources"] [data-source]').length)
  await page.fill('[data-field="source"]', url)
  await page.press('[data-field="source"]', 'Enter')
  await until(page, k => document.querySelectorAll('[data-part="sources"] [data-source]').length === k + 1
    && ![...document.querySelectorAll('[data-part="sources"] [data-source]')].some(r => r.dataset.fetchState === 'trying'), n)
}

// ---- N: the one page ----
const n = worldSession({
  kind: 'seeded',
  waitFor: 'inbox',
  prepare: async world => { await seedShelf(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs') }),
})
const root = () => join(n.world.root, 'new-libs')
/** The form open with the name typed (each test can also run on its own: --test-name-pattern, the mutants). */
async function onForm() {
  if (await n.page.evaluate(() => document.querySelector('main[data-screen="new-library"]') === null)) {
    await openForm(n.app, n.page)
  }
  await formReady(n.page)
  if (await n.page.evaluate(() => document.querySelector('[data-field="name"]').value === '')) await n.page.fill('[data-field="name"]', '中国电动车')
}

test('R4a-3 新建库 is one page in the usual frame: the sidebar and the right panel stay, no step of a wizard; the defaults', async () => {
  await openForm(n.app, n.page)
  await formReady(n.page)
  assert.equal(await n.page.evaluate(() => document.querySelectorAll('aside.sidebar [data-library-row]').length), 3, 'the sidebar with its libraries')
  assert.equal(await n.page.evaluate(() => document.querySelector('[data-part="right-panel"]') !== null), true, 'the right panel')
  assert.equal(await text(n.page, '[data-part="how-it-works"] h3'), HOW_IT_WORKS.titleNew)
  assert.equal(await n.page.evaluate(() => document.querySelectorAll('.fr-body, [data-step], [data-pack="blank"], [data-action="next"]').length), 0, 'no wizard, no pack step')
  // the order of the page
  const order = await n.page.evaluate(() => ['[data-field="name"]', '[data-field="brief"]', '[data-part="strictness"]', '[data-field="source"]', '[data-part="pack-line"]', '[data-part="topics"]', '[data-part="location"]', '[data-part="schedule"]', '[data-action="create-run"]']
    .map(s => document.querySelector(s)).map((el, i, all) => (i === 0 ? true : Boolean(all[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))))
  assert.deepEqual(order, Array(9).fill(true), '库名称 · 追踪要求 · 严格程度 · 来源 · 预设来源包 · 主题 · 存储位置 · 定时 · the buttons, in that order')
  // 由主 Agent 生成 · 手动填写, the second chosen
  assert.deepEqual(await n.page.evaluate(() => [...document.querySelectorAll('[data-action^="mode-"]')].map(b => [b.textContent, b.classList.contains('active')])), [[T.modes.agent, false], [T.modes.manual, true]])
  // 严格程度: three, 标准 chosen, its numbers said
  assert.deepEqual(await n.page.evaluate(() => [...document.querySelectorAll('[data-part="strictness"] [data-level]')].map(b => [b.dataset.level, b.textContent, b.getAttribute('aria-pressed')])),
    [['loose', T.levels.loose, 'false'], ['standard', T.levels.standard, 'true'], ['strict', T.levels.strict, 'false']])
  assert.equal(await text(n.page, '[data-part="level-note"]'), fmt(T.levelNote, { level: T.levelNames.standard, relevance: 0.5, substance: 0.6 }))
  // the schedule and the cap: the app's (the test world's settings: 08:30, off) and the pipeline's
  assert.deepEqual(await n.page.evaluate(() => [document.querySelector('[data-field="daily"]').checked, document.querySelector('[data-field="time"]').value, document.querySelector('[data-field="cap"]').value]), [false, '08:30', '120'])
  // 存储位置: <root>\<name>, an empty folder
  await n.page.fill('[data-field="name"]', '中国电动车')
  await until(n.page, p => document.querySelector('[data-part="location"]')?.dataset.path === p, join(root(), '中国电动车'))
  assert.equal(await text(n.page, '[data-part="folder-state"]'), T.folderStates.empty)
  assert.equal(await text(n.page, '[data-part="estimate"]'), fmt(T.estimate, { lo: 1, hi: 1 }), 'nothing tried yet: the self-check only')
})

test('R4a-3 追踪要求 is required: empty → both create buttons off and the line says so; the bridge refuses it too; nothing made', async () => {
  await onForm()
  await until(n.page, () => document.querySelector('[data-part="folder-state"]')?.dataset.state === 'empty')
  assert.equal(await n.page.evaluate(() => document.querySelector('[data-field="brief"]').value), '')
  assert.deepEqual([await disabled(n.page, 'create-only'), await disabled(n.page, 'create-run')], [true, true])
  assert.equal(await text(n.page, '[data-part="brief-required"]'), T.briefRequired)
  const r = await n.page.evaluate(() => window.streams.createNewLibrary({ name: '中国电动车', brief: '', strictness: 'standard', topics: [], sources: [], packId: null, schedule: { enabled: false, time: '08:30' }, cap: 120, run: false }))
  assert.deepEqual(r, { ok: false, error: { code: 'bad_arguments' } })
  assert.equal(existsSync(root()), false, 'nothing made')
  await n.page.fill('[data-field="brief"]', '   ')
  assert.deepEqual([await disabled(n.page, 'create-only'), await disabled(n.page, 'create-run')], [true, true], 'spaces are no brief')
  await n.page.fill('[data-field="brief"]', BRIEF)
  await until(n.page, () => document.querySelector('[data-action="create-only"] button')?.disabled === false)
  assert.equal(await n.page.evaluate(() => document.querySelector('[data-part="brief-required"]')), null)
})

test('R4a-3 来源: typed and Enter → tried where it was typed, one row each, in V3\'s words with V3\'s 怎么办 — never the server\'s message; a row removed', async () => {
  await onForm()
  for (const s of ['ok', 'empty', 'gap', 'failed', 'blocked']) await addSource(n.page, URLS[s])
  const rows = await n.page.evaluate(() => [...document.querySelectorAll('[data-part="sources"] [data-source]')].map(r => ({ state: r.dataset.fetchState, from: r.dataset.from, chip: r.querySelector('.status-chip').textContent.trim(), hint: r.querySelector('[data-part="source-hint"]')?.textContent ?? null, all: r.textContent })))
  assert.deepEqual(rows.map(r => r.state), ['ok', 'empty', 'gap', 'failed', 'blocked'])
  assert.ok(rows.every(r => r.from === 'typed'))
  assert.equal(rows[0].chip, fmt(T.okCount, { state: FETCH_STATES.ok, n: 2 }))
  assert.equal(rows[0].hint, fmt(T.latest, { title: '10 月乘用车零售数据' }))
  for (const [i, s] of ['empty', 'gap', 'failed', 'blocked'].entries()) {
    assert.equal(rows[i + 1].chip, FETCH_STATES[s], s)
    assert.equal(rows[i + 1].hint, FETCH_HINTS[core.hintOf(s)], `${s}: V3's 怎么办`)
  }
  for (const r of rows) for (const raw of ['HTTP 404', 'upstream busy', 'forbidden', '503', '403']) assert.equal(r.all.includes(raw), false, `「${raw}」 is not shown`)
  // the estimate follows what the tries found: 2 items → 3–9
  await until(n.page, () => document.querySelector('[data-part="estimate"]')?.dataset.hi === '9')
  assert.equal(await text(n.page, '[data-part="estimate"]'), fmt(T.estimate, { lo: 3, hi: 9 }))
  // the same address again: said, not added
  await n.page.fill('[data-field="source"]', URLS.ok)
  await n.page.press('[data-field="source"]', 'Enter')
  await until(n.page, () => document.querySelector('[data-part="source-error"]') !== null)
  assert.equal(await text(n.page, '[data-part="source-error"]'), T.duplicate)
  // removed: gone from the form
  const names = await n.page.evaluate(() => [...document.querySelectorAll('[data-part="sources"] [data-source]')].map(r => r.dataset.source))
  for (const name of names.slice(1)) {
    await n.page.click(`[data-source="${name}"] [data-action="remove-source"] button`)
    await until(n.page, x => document.querySelector(`[data-source="${x}"]`) === null, name)
  }
  assert.deepEqual(await n.page.evaluate(() => [...document.querySelectorAll('[data-part="sources"] [data-source]')].map(r => r.dataset.fetchState)), ['ok'])
})

test('R4a-3 预设来源包: one line under the sources; added → its sources (not fetched) and topics, each removable', async () => {
  const packs = core.listStarterPacks('zh-CN')
  const pack = packs[0]
  assert.equal(await n.page.evaluate(() => document.querySelector('[data-part="pack-line"] span').textContent), fmt(T.pack, { name: pack.name }))
  assert.equal(await n.page.evaluate(() => document.querySelector('[data-part="pack-line"] small').textContent), fmt(T.packCounts, { topics: pack.topics.length, sources: pack.sources.length }))
  await n.page.click('[data-part="pack-line"]')
  await until(n.page, k => document.querySelectorAll('[data-part="sources"] [data-from="pack"]').length === k, pack.sources.length)
  assert.deepEqual(await n.page.evaluate(() => [...document.querySelectorAll('[data-part="sources"] [data-from="pack"]')].map(r => [r.dataset.source, r.dataset.fetchState])), pack.sources.map(s => [s.name, 'untried']))
  assert.deepEqual(await n.page.evaluate(() => [...document.querySelectorAll('[data-part="topics"] [data-topic]')].map(t => t.dataset.topic)), pack.topics)
  assert.equal(await n.page.evaluate(() => document.querySelector('[data-part="pack-line"]').disabled), true, 'added once')
  assert.ok((await text(n.page, '[data-part="estimate"]')).endsWith(T.estimateUntried), 'the rows not fetched are said not to count')
  // each removable: every pack source, then its topics (a topic a source still names cannot go)
  for (const s of pack.sources) {
    await n.page.click(`[data-source="${s.name}"] [data-action="remove-source"] button`)
    await until(n.page, x => document.querySelector(`[data-source="${x}"]`) === null, s.name)
  }
  for (const t of pack.topics) {
    await n.page.click(`[data-topic="${t}"] [data-action="remove-topic"]`)
    await until(n.page, x => document.querySelector(`[data-topic="${x}"]`) === null, t)
  }
  // a topic of your own
  await n.page.fill('[data-field="topic"]', '月度数据')
  await n.page.press('[data-field="topic"]', 'Enter')
  await until(n.page, () => document.querySelector('[data-topic="月度数据"]') !== null)
})

test('R4a-4 严格程度 switched: its numbers said; back to 标准', async () => {
  await n.page.click('[data-part="strictness"] [data-level="strict"]')
  await until(n.page, () => document.querySelector('[data-level="strict"]').getAttribute('aria-pressed') === 'true')
  assert.equal(await text(n.page, '[data-part="level-note"]'), fmt(T.levelNote, { level: T.levelNames.strict, relevance: 0.7, substance: 0.7 }))
  await n.page.click('[data-part="strictness"] [data-level="standard"]')
  await until(n.page, () => document.querySelector('[data-level="standard"]').getAttribute('aria-pressed') === 'true')
})

test('R4a-3 仅创建: the library made, current, 标准 0.5 / 0.6, the form\'s brief, source and topic; nothing queued, no round; the app on its 待看', async () => {
  await n.page.click('[data-action="create-only"] button')
  await ready(n.page, 'inbox')
  const dir = join(root(), '中国电动车')
  const state = (await n.page.evaluate(() => window.streams.getAppState())).data
  assert.equal(state.library.path, dir, 'the current library')
  const c = config(dir)
  assert.equal(c.brief, BRIEF)
  assert.deepEqual(c.topics.map(t => t.name), ['月度数据'])
  assert.deepEqual(c.sources.map(s => s.url), [URLS.ok])
  assert.deepEqual(core.readStrictness(dir), { level: 'standard', thresholds: { relevance: 0.5, substance: 0.6 } })
  await n.page.waitForTimeout(800)
  const q = (await n.page.evaluate(() => window.streams.getQueue())).data
  assert.equal(q.running, null, 'nothing runs')
  assert.equal(q.waiting.some(x => x.libraryId === state.library.libraryId), false, 'nothing waits')
  assert.deepEqual(core.listRounds(dir, 5), [], 'no round')
  assert.deepEqual(n.errors, [])
})

// ---- R: 创建并运行 ----
const r = worldSession({
  kind: 'seeded',
  waitFor: 'new-library',
  prepare: async world => { await seedShelf(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), STREAMS_START_SCREEN: 'new-library' }),
})

// 1.1 W7a: 「创建并运行」 is gone with 1.0's round — a library this form makes has no card, so it is not updated (needs-build);
// the form itself has no way in since W6b and goes in W7b.

// ---- F: a folder of the user's .md files ----
let vault = null
let before = null
const f = worldSession({
  kind: 'seeded',
  waitFor: 'new-library',
  prepare: async world => {
    await seedShelf(world)
    vault = join(world.root, 'vault')
    seedImportFolder(vault)
    before = tree(vault)
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: vault ?? join(world.root, 'vault'), STREAMS_START_SCREEN: 'new-library', STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs') }),
})

test('R4a-3 F57: 更改… → a folder of .md files: it says how many and that nothing is moved; 仅创建 opens it as a library, every file byte for byte', async () => {
  await formReady(f.page)
  await f.page.click('[data-action="change-folder"] button')
  await until(f.page, p => document.querySelector('[data-part="location"]')?.dataset.path === p, vault)
  assert.equal(await f.page.evaluate(() => document.querySelector('[data-part="location"]').dataset.chosen), 'true')
  assert.equal(await text(f.page, '[data-part="folder-state"]'), fmt(T.folderStates.importable, { n: 6 }))
  assert.equal(existsSync(join(vault, 'streams.json')), false, 'only said, nothing written yet')
  await f.page.fill('[data-field="name"]', '我的笔记')
  await f.page.fill('[data-field="brief"]', '我自己的笔记，追踪 agent 记忆。')
  await f.page.click('[data-action="create-only"] button')
  await ready(f.page, 'inbox')
  assert.equal((await f.page.evaluate(() => window.streams.getAppState())).data.library.path, vault)
  const now = tree(vault)
  for (const [rel, h] of Object.entries(before)) assert.equal(now[rel], h, `${rel} byte for byte`)
  assert.equal(config(vault).notesDir, '.')
  assert.deepEqual(f.errors, [])
})

// ---- O: a folder holding other things ----
const o = worldSession({
  kind: 'seeded',
  waitFor: 'new-library',
  prepare: world => { mkdirSync(join(world.root, 'full')); writeFileSync(join(world.root, 'full', 'notes.txt'), 'not a library\n') },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'full'), STREAMS_START_SCREEN: 'new-library', STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs') }),
})

test('control: 更改… → a folder holding other things: it says so, the create buttons stay off, nothing is made in it', async () => {
  await formReady(o.page)
  await o.page.fill('[data-field="name"]', 'x')
  await o.page.fill('[data-field="brief"]', '追踪电池。')
  await o.page.click('[data-action="change-folder"] button')
  await until(o.page, () => document.querySelector('[data-part="folder-state"]')?.dataset.state === 'other')
  assert.equal(await text(o.page, '[data-part="folder-state"]'), T.folderStates.other)
  assert.deepEqual([await disabled(o.page, 'create-only'), await disabled(o.page, 'create-run')], [true, true])
  assert.deepEqual(readdirSync(join(o.world.root, 'full')), ['notes.txt'])
  assert.deepEqual(o.errors, [])
})
