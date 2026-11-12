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
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, readFileSync } from 'node:fs'
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
  prepare: world => { mkdirSync(join(world.root, 'chosen')) },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'chosen') }),
})
const lib = () => join(a.world.root, 'chosen')
const setup = () => JSON.parse(readFileSync(join(lib(), 'streams.json'), 'utf8')).setup ?? {}
const click = sel => a.page.click(`${sel} button`)
const stepIs = id => a.page.waitForFunction(i => document.querySelector('main[data-screen="new-library"][data-state="ready"] .fr-body')?.dataset.step === i, id, POLL)

test('首次打开: the connection skipped → settings.json skipped; 新建库\'s folder → the library\'s record, with 首次打开\'s connection (its time)', async () => {
  await a.page.waitForFunction(() => document.querySelectorAll('[data-connection]').length === 3, null, POLL)
  await click('[data-action="skip"]')
  await ready(a.page, 'chat')
  const rec = JSON.parse(readFileSync(join(a.world.appData, 'settings.json'), 'utf8')).setupConnection
  assert.equal(rec.by, 'skipped')
  await a.page.click('[data-action="manual-new"] button')
  await ready(a.page, 'new-library')
  await click('[data-action="choose-folder"]')
  await a.page.waitForFunction(() => document.querySelector('[data-folder-path]') !== null, null, POLL)
  await click('[data-action="next"]')
  await stepIs('pack')
  const s = setup()
  assert.deepEqual(Object.keys(s).sort(), ['connection', 'library'])
  assert.deepEqual(s.connection, { by: 'skipped', at: rec.at }, 'copied from settings.json, its time kept, no detail')
  assert.deepEqual([s.library.by, s.library.detail], ['chose', 'empty'])
})

test('the blank pack left as it is → pack chose blank, sources default; back from the round and chosen again → replaced; the round not run → skipped; 完成 → default', async () => {
  await a.page.click('[data-pack="blank"]')
  await a.page.waitForFunction(() => document.querySelector('[data-part="pack-detail"]') !== null, null, POLL)
  await click('[data-action="apply"]')
  await a.page.waitForFunction(() => document.querySelector('[data-part="tried"]') !== null, null, POLL)
  await click('[data-action="continue"]')
  await stepIs('trial')
  assert.deepEqual([setup().pack.by, setup().pack.detail, setup().sources.by], ['chose', 'blank', 'default'])
  assert.equal(Object.hasOwn(setup().sources, 'detail'), false)
  const firstPack = setup().pack.at
  const library = setup().library
  assert.equal(setup().trial, undefined, 'control: no trial record before the step is left')
  await click('[data-action="back"]')
  await stepIs('pack')
  await a.page.click('[data-pack="blank"]')
  await click('[data-action="apply"]')
  await a.page.waitForFunction(() => document.querySelector('[data-part="tried"]') !== null, null, POLL)
  await click('[data-action="continue"]')
  await stepIs('trial')
  assert.ok(setup().pack.at >= firstPack, 'the pack\'s record replaced')
  assert.deepEqual(setup().library, library, 'the other steps untouched')
  await click('[data-action="skip-trial"]')
  await stepIs('schedule')
  assert.equal(setup().trial.by, 'skipped')
  await click('[data-action="go-today"]')
  await ready(a.page, 'inbox')
  const s = setup()
  assert.deepEqual(Object.keys(s).sort(), [...STEPS].sort())
  assert.deepEqual(STEPS.map(k => s[k].by), ['chose', 'skipped', 'chose', 'default', 'skipped', 'default'])
  assert.deepEqual(s.schedule.detail, { enabled: true, time: '08:30' })
  for (const k of STEPS) assert.equal(s[k].at, new Date(s[k].at).toISOString(), `${k}.at is an ISO time`)
  assert.deepEqual((await a.page.evaluate(() => window.streams.getSetup())).data, core.readSetup(lib()), 'getSetup is the core\'s readSetup')
})

test('来源与要求 「这个库」 · 首次设置: the six steps, each with who decided it (v2 package I: was on 设置)', async () => {
  await a.page.click('.st-lib-tabs [data-tab="sources"]')
  await ready(a.page, 'sources')
  await a.page.waitForFunction(() => document.querySelector('[data-part="this-library"] [data-part="setup"]')?.dataset.setup === 'recorded', null, POLL)
  const rows = await a.page.evaluate(() => [...document.querySelectorAll('[data-part="this-library"] [data-setup-step]')].map(e => [e.dataset.setupStep, e.dataset.by, e.textContent]))
  const want = { library: 'chose', connection: 'skipped', pack: 'chose', sources: 'default', trial: 'skipped', schedule: 'default' }
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
