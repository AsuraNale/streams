// redesign R1: 概览 is gone and the app opens on a library's 待看 — the screen this file waits for is 'inbox' (was 'overview'); nothing else changed
// 首次设置's record of who decided each step (plan A1; docs/desktop.md §4.1「首次设置」), on the running app, read back from the
// library's streams.json.
// v2 package I rewrote session A and moved where the record is shown: v1.0's wizard is now 首次打开 (the connection, recorded in
// settings.json while there is no library) and 新建库 (the rest); the record is shown on 来源与要求's 「这个库」, not on 设置.
// Session A walks the other way from ui-first-run.test.mjs: the connection skipped at 首次打开 (settings.json setupConnection),
// 新建库 from the chat's guide: the folder, the blank pack left as it is (sources: default), walked back from the round and the
// pack chosen again (the record replaced, the others untouched), the round not run (trial: skipped), 完成 (schedule: default);
// the connection's record is 首次打开's, copied with its time. 「这个库」 then says the six. Session B: a library made before (the
// seeded world, no record) → 「没有记录」; a record written by the core into it, the page read again → it shows.
// Redesign R4a: 首次打开 is one screen and 新建库 one page (docs/checks/2026-11-12-r4a/contract.md R4a-1 … R4a-3), so session A walks
// them: nothing found (STREAMS_DEV_DETECT) → 连接选择 → 暂时跳过 (settings.json skipped) → 手动创建 → 新建库 → 更改… (the hook's folder)
// → a name and 追踪要求 → 仅创建. The form writes the records when it creates the library (there are no steps to walk back to any
// more, so v2 package I's check of a record replaced on going back is gone with them): library (chose: 更改… chose it), the
// connection copied with its time, pack (skipped: no preset pack), sources (default: none added or removed), trial (skipped: 仅创建),
// schedule (default: the app's). The six records and how 「这个库」 shows them are as before.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const STEPS = ['library', 'connection', 'pack', 'sources', 'trial', 'schedule']

const a = worldSession({
  kind: 'empty',
  waitFor: 'first-run',
  prepare: world => {
    mkdirSync(join(world.root, 'chosen'))
    writeFileSync(join(world.root, 'detect.json'), JSON.stringify({ 'claude-code': { installed: false }, codex: { installed: false } }))
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'chosen'), STREAMS_DEV_DETECT: join(world.root, 'detect.json') }),
})
const lib = () => join(a.world.root, 'chosen')
const setup = () => JSON.parse(readFileSync(join(lib(), 'streams.json'), 'utf8')).setup ?? {}
const click = sel => a.page.click(`${sel} button`)
const viewIs = v => a.page.waitForFunction(x => document.querySelector('main[data-screen="first-run"][data-state="ready"] [data-part="first-run"]')?.dataset.view === x, v, POLL)

test("首次打开 (redesign R4a): nothing found → 连接选择 → 暂时跳过 → settings.json skipped; 手动创建 → 新建库 → 更改… · a name · 追踪要求 · 仅创建 → the library's six records, 首次打开's connection with its time", async () => {
  await viewIs('pick')
  await click('[data-action="skip-connection"]')
  await viewIs('home')
  const rec = JSON.parse(readFileSync(join(a.world.appData, 'settings.json'), 'utf8')).setupConnection
  assert.equal(rec.by, 'skipped')
  await click('[data-action="manual-new"]')
  await ready(a.page, 'new-library')
  await a.page.waitForFunction(() => document.querySelector('[data-part="folder-state"]')?.dataset.state !== '', null, POLL)
  await click('[data-action="change-folder"]')
  await a.page.waitForFunction(p => document.querySelector('[data-part="location"]')?.dataset.path === p, lib(), POLL)
  assert.equal(existsSync(join(lib(), 'streams.json')), false, 'control: nothing recorded before the library is made')
  await a.page.fill('[data-field="name"]', 'chosen')
  await a.page.fill('[data-field="brief"]', '追踪电池价格。')
  await click('[data-action="create-only"]')
  await ready(a.page, 'inbox')
  const s = setup()
  assert.deepEqual(Object.keys(s).sort(), [...STEPS].sort())
  assert.deepEqual(s.connection, { by: 'skipped', at: rec.at }, 'copied from settings.json, its time kept, no detail')
  assert.deepEqual(STEPS.map(k => s[k].by), ['chose', 'skipped', 'skipped', 'default', 'skipped', 'default'])
  assert.equal(s.library.detail, 'empty')
  assert.equal(Object.hasOwn(s.sources, 'detail'), false)
  assert.deepEqual(s.schedule.detail, { enabled: false, time: '08:30' })
  for (const k of STEPS) assert.equal(s[k].at, new Date(s[k].at).toISOString(), `${k}.at is an ISO time`)
  assert.deepEqual((await a.page.evaluate(() => window.streams.getSetup())).data, core.readSetup(lib()), 'getSetup is the core\'s readSetup')
})

test('来源与要求 「这个库」 · 首次设置: the six steps, each with who decided it (v2 package I: was on 设置)', async () => {
  await a.page.click('.st-lib-tabs [data-tab="sources"]')
  await ready(a.page, 'sources')
  await a.page.waitForFunction(() => document.querySelector('[data-part="this-library"] [data-part="setup"]')?.dataset.setup === 'recorded', null, POLL)
  const rows = await a.page.evaluate(() => [...document.querySelectorAll('[data-part="this-library"] [data-setup-step]')].map(e => [e.dataset.setupStep, e.dataset.by, e.textContent]))
  // redesign R4a: no preset pack chosen on the form → pack skipped (v2 package I's wizard recorded the blank pack as chosen)
  const want = { library: 'chose', connection: 'skipped', pack: 'skipped', sources: 'default', trial: 'skipped', schedule: 'default' }
  assert.deepEqual(rows, STEPS.map(k => [k, want[k], fmt(SETTINGS.setupLine, { step: SETTINGS.setupSteps[k], by: SETTINGS.setupBy[want[k]] })]))
  assert.ok((await a.page.evaluate(() => document.querySelector('[data-part="this-library"]').textContent)).includes(SETTINGS.setup))
})

test('the bridge: an unknown step or by → bad_arguments and nothing written', async () => {
  const before = readFileSync(join(lib(), 'streams.json'), 'utf8')
  for (const [step, entry] of [['folder', { by: 'chose' }], ['trial', { by: 'maybe' }], ['trial', { by: 'chose', when: 1 }], ['trial', 'chose']]) {
    assert.deepEqual(await a.page.evaluate(([x, y]) => window.streams.recordSetupStep(x, y), [step, entry]), { ok: false, error: { code: 'bad_arguments' } }, `${step} ${JSON.stringify(entry)}`)
  }
  assert.equal(readFileSync(join(lib(), 'streams.json'), 'utf8'), before)
  assert.deepEqual(a.errors, [])
})

const b = worldSession({ kind: 'seeded', waitFor: 'sources', env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }) })

test('a library made before (no record) → 「没有记录」; a record written into it and the page read again → shown', async () => {
  await b.page.waitForFunction(() => document.querySelector('[data-part="this-library"] [data-part="setup"]')?.dataset.setup === 'none', null, POLL)
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-part="this-library"] [data-part="setup"]').textContent), SETTINGS.setupNone)
  assert.deepEqual(core.readSetup(b.world.library), {}, 'control: the seeded library has no record')
  core.recordSetupStep(b.world.library, 'connection', { by: 'skipped' })
  await b.page.evaluate(() => { location.hash = 'sources'; location.reload() })
  await ready(b.page, 'sources')
  await b.page.waitForFunction(() => document.querySelector('[data-part="this-library"] [data-part="setup"]')?.dataset.setup === 'recorded', null, POLL)
  const rows = await b.page.evaluate(() => [...document.querySelectorAll('[data-part="this-library"] [data-setup-step]')].map(e => [e.dataset.setupStep, e.dataset.by]))
  assert.deepEqual(rows, STEPS.map(k => [k, k === 'connection' ? 'skipped' : '']), 'one step recorded, the others 「没有记录」')
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-setup-step="trial"]').textContent), fmt(SETTINGS.setupLine, { step: SETTINGS.setupSteps.trial, by: SETTINGS.setupNone }))
  assert.deepEqual(b.errors, [])
})
