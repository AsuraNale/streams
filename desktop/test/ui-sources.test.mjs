// redesign R4b: rewritten for the new 来源与要求 (docs/checks/2026-11-12-r4b/contract.md R4b-1, 「测」; design P14). 1.1 W7b: a library
// made by the last version (no library card) — the seeded world, made through core/legacy as v1.0 made it — keeps a read-only
// 来源与要求: v1.0's editing (库名称 / 追踪要求 / 严格程度 saved, 测试抓取, 暂停 / 恢复, 修改地址, 删除, a source added in place, the
// topics, the cap) went with the scoring pipeline; the library is brought over by 「重新查一遍来源」 (the build conversation, W7a's tests).
// On the seeded world plus plan B's extras:
//   - the parts in this order — the notice 「这座库是上一版建的」 · 追踪要求 (read only) · 来源 (read only) · 定时 — and the line to
//     高级设置; nothing to type into but the schedule; no 「谁定的」 mark, no 贴一个链接进待看;
//   - 来源: one row per source as the core's sourcesView gives it — the state in FETCH_STATES' words, the runs in a row, what to do
//     (V3's FETCH_HINTS; never an HTTP code), no 「⋯」;
//   - 定时: one 保存 → the schedule in streams.json, one line by you; a bad time said, nothing written.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { FETCH_HINTS, FETCH_STATES } from '../src/renderer/texts/common.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { fmt } from '../src/renderer/lib/format.js'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({
  kind: 'seeded',
  waitFor: 'sources',
  prepare: async world => { await seedPlanB(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }),
  settings: world => ({ libraryPath: world.library }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const dir = () => s.world.library
const file = name => join(dir(), name)
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const config = () => JSON.parse(readFileSync(file('streams.json'), 'utf8'))
const changes = () => (existsSync(file('_pipeline/changes.jsonl')) ? readFileSync(file('_pipeline/changes.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
const rowsShown = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="old-sources"] [data-row]')].map(e => [e.dataset.row, e.dataset.state, e.dataset.paused]))
const click = sel => s.page.click(`${sel} button`)

test('R4b-1 four parts in order (上一版建的库 · 追踪要求 · 来源 · 定时) and the line to 高级设置; read only but the schedule; no 「谁定的」, no 贴一个链接进待看', async () => {
  await until(() => document.querySelector('[data-part="old-sources"]') !== null && document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule !== 'unknown')
  const parts = await s.page.evaluate(() => [...document.querySelectorAll('main[data-screen="sources"] .st-src > [data-part]')].map(e => e.dataset.part))
  // 1.1 W6a (A6): this library has no library card (built by the last version), so the page opens with that notice
  assert.deepEqual(parts, ['old-library', 'old-brief', 'old-sources', 'run'])
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="sources"] [data-action="go-advanced"]')?.textContent.trim()), SOURCES.advancedLink)
  // v1.0's editing is gone: none of these is on the page (control: the same reader finds the schedule's own fields)
  const gone = await s.page.evaluate(() => ['[data-who]', '[data-action="add-link"]', '[data-dialog="add-link"]', '[data-part="gates"]', '[data-part="this-library"]', '.src-who',
    '[data-part="brief"]', '[data-part="strictness"]', '[data-part="topics"]', '[data-part="sources"]', 'textarea', 'input[data-field="library-name"]', 'input[data-field="source"]',
    'input[data-field="cap"]', '[data-action="row-more"]', '[data-action="save-brief"]'].filter(q => document.querySelector(`main[data-screen="sources"] ${q}`) !== null))
  assert.deepEqual(gone, [], 'none of these is on the page')
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('main[data-screen="sources"] input')].map(i => i.dataset.field)), ['schedule-on', 'schedule-time'], 'control: the inputs read are the schedule\'s')
  const text = await s.page.evaluate(() => document.querySelector('main[data-screen="sources"]').textContent)
  for (const word of ['谁定的', '你改的', '首次设置', '贴一个链接']) assert.equal(text.includes(word), false, word)
  // the notice and its way on; the brief as it was written (none in the seeded world: said so)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="old-library"] .section-label').textContent), SOURCES.old.heading)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="old-library"] [data-action="recheck-sources"]') !== null), true)
  const brief = core.readBrief(dir())
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="old-brief"] p').textContent), brief ?? SOURCES.brief.none)
})

test('R4b-1 来源: one row per source as sourcesView gives it — the state, the runs in a row, what to do in words; a source that is fine has no hint (control)', async () => {
  const view = core.sourcesView(dir())
  assert.ok(view.sources.length >= 3, 'control: the seed\'s sources and plan B\'s old one')
  assert.deepEqual(await rowsShown(), view.sources.map(x => [x.name, x.paused ? 'paused' : x.status ?? 'never', String(Boolean(x.paused))]))
  const old = await s.page.evaluate(() => { const r = document.querySelector('[data-row="old-blog"]'); return { n: r.dataset.consecutive, hint: r.querySelector('[data-hint]')?.dataset.hint, words: r.querySelector('[data-hint]')?.textContent, state: r.querySelector('[data-fetch-word]').textContent.trim() } })
  // redesign R5a (O9): getSources no longer hands the page the HTTP code (it goes to 复制诊断信息), so the row says the state and
  // the runs in a row without it
  assert.deepEqual(old, { n: '4', hint: 'fix-address-or-remove', words: FETCH_HINTS['fix-address-or-remove'], state: fmt(SOURCES.row.streakNoHttp, { state: FETCH_STATES.gap, n: 4 }) })
  assert.equal(/(^|[^0-9])404([^0-9]|$)/.test(await s.page.evaluate(() => document.querySelector('[data-part="old-sources"]').textContent)), false, 'no HTTP code on the page')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row="mcp-news"] [data-hint]')?.dataset.hint), 'retry-next-round')
  const fine = view.sources.find(x => x.status === 'ok' && !x.paused)
  if (fine) assert.equal(await s.page.evaluate(n => document.querySelector(`[data-row="${n}"] [data-hint]`), fine.name), null)
  assert.equal(await s.page.evaluate(() => document.querySelector('#src-old-sources-h').textContent), fmt(SOURCES.sourcesHeading, { n: view.sources.length }))
  // the table's two columns
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="old-sources"] .st-src-head span')].map(e => e.textContent).filter(Boolean)), [SOURCES.table.source, SOURCES.table.state])
})

test('R4b-1 定时: one line; 保存 → the schedule in streams.json, one line by you; a bad time said, nothing written', async () => {
  const lines = changes().length
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run"] [data-schedule]').dataset.schedule), 'off', 'control: off in the seeded world')
  const before = sha(file('streams.json'))
  await s.page.click('[data-part="run"] input[data-field="schedule-on"]')
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '25:61')
  await click('[data-part="run"] [data-action="save-run"]')
  await until(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'bad')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run-note"]').textContent), SOURCES.run.timeBad)
  assert.equal(sha(file('streams.json')), before)
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '07:45')
  await click('[data-part="run"] [data-action="save-run"]')
  await until(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'saved' && document.querySelector('[data-part="run"] [data-schedule]').dataset.schedule === 'on')
  assert.deepEqual(config().schedule, { enabled: true, time: '07:45' })
  assert.deepEqual(changes().slice(lines).map(l => [l.field, l.by]), [['schedule', 'you']])
  assert.ok((await s.page.evaluate(() => document.querySelector('[data-part="run"] [data-next-run]').dataset.nextRun)) !== '', 'the next run is said')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
