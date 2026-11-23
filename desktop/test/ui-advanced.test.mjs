// Redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-2, R4b-3, 「测」; design P15, P21): 来源与要求's 高级设置 on the running app —
// the seeded world plus plan B's extras, registered (settings.json libraryPath → the registry), the connections faked.
//   - 「← 返回来源与要求」, 高级设置, two folds open: 01 变更记录 · 02 库文件夹 (1.1 W7b: v1.0's 评分环节 fold is gone with its scoring
//     pipeline, and so are its tests here: the nodes, their checks, a threshold changed by hand);
//   - 变更记录: the core's changeLog as a table — 时间 · 变更内容 · 操作来源 (手动修改 / 主 Agent 提议 · 已确认 / 初始设置), newest first,
//     the page's own change there (the schedule: 手动修改), a confirmed card's line of an old library, 首次设置's;
//   - 库文件夹: the path, 重建索引, 在资源管理器中显示 (a test run only logs);
//   - 移除该库 (the template dialog, P21): what it does, the path; 取消 → nothing changes; 移除 → the registration goes, every file of
//     the folder byte for byte as it was, the app on 库架.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { ADVANCED } from '../src/renderer/texts/sources.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({
  kind: 'seeded',
  waitFor: 'sources',
  prepare: async world => { await seedPlanB(world) },
  settings: world => ({ libraryPath: world.library }),
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const click = sel => s.page.click(`${sel} button`)
const dir = () => s.world.library
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const registry = () => JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8'))
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const advanced = async () => {
  await s.page.click('main[data-screen="sources"] [data-action="go-advanced"]')
  await until(() => document.querySelector('[data-view="advanced"] [data-part="changes"][data-state="ready"]'))
}
// each test runs on its own too (a name pattern picks one): it starts on 高级设置, whatever ran before it
const onAdvanced = async () => {
  if (!(await s.page.evaluate(() => document.querySelector('[data-view="advanced"]') !== null))) await advanced()
}
function hashTree(d, base = d, out = {}) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) hashTree(p, base, out)
    else out[p.slice(base.length + 1).replace(/\\/g, '/')] = sha(p)
  }
  return out
}

test('R4b-2 高级设置: back to 来源与要求, the title, two folds open — 变更记录 · 库文件夹', async () => {
  await until(() => document.querySelector('[data-view="main"] [data-part="old-sources"]') !== null)
  await advanced()
  const folds = await s.page.evaluate(() => [...document.querySelectorAll('[data-view="advanced"] details.phase-row')].map(d => [d.dataset.part, d.open, d.querySelector('.phase-index').textContent, d.querySelector('.phase-label').firstChild.textContent]))
  assert.deepEqual(folds, [['changes-fold', true, '01', ADVANCED.changes], ['folder-fold', true, '02', ADVANCED.folder]])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="gates"], [data-part="gates-fold"], [data-flow-node]')), null, 'no 评分环节')
  assert.equal(await s.page.evaluate(() => document.querySelector('#sources-title').textContent), ADVANCED.heading)
  // back and forth
  await s.page.click('[data-action="back-sources"]')
  await until(() => document.querySelector('[data-view="main"] [data-part="old-sources"]') !== null)
  await advanced()
})

test('R4b-2 变更记录: the core\'s changeLog, newest first — 时间 · 变更内容 · 操作来源: 手动修改, 主 Agent 提议 · 已确认, 初始设置', async () => {
  // the page's own change (the schedule, through the bridge the page uses: 手动修改), a card confirmed by v2 (an old library's line:
  // the core's own record, as its 确认 did) and 首次设置's record, then the page read again
  const id = registry().active
  assert.equal((await bridge('setLibrarySchedule', id, { enabled: true, time: '06:15' })).ok, true)
  const card = { id: 'p-r4b-1', kind: 'edit_brief' }
  core.recordChange(dir(), { field: 'brief', by: 'agent-confirmed', proposalId: card.id, before: null, after: '只追 agent 记忆的评测' })
  core.recordSetupStep(dir(), 'schedule', { by: 'default' }, { now: () => new Date(Date.now() + 2000) })
  await s.page.evaluate(() => { location.hash = 'sources'; location.reload() })
  await ready(s.page, 'sources')
  await advanced()
  const want = core.changeLog(dir()).rows
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="changes"] [data-change-row]')].map(r => [r.dataset.kind, r.dataset.field, r.dataset.by, r.querySelector('[data-part="by"]').textContent]))
  assert.deepEqual(rows, want.map(r => [r.kind, r.field ?? r.step, r.by, ADVANCED.log.bys[r.by]]))
  assert.deepEqual(rows.slice(0, 3).map(r => [r[1], r[3]]), [['schedule', ADVANCED.log.bys.setup], ['brief', ADVANCED.log.bys['agent-confirmed']], ['schedule', ADVANCED.log.bys.you]])
  assert.ok(rows.some(r => r[3] === ADVANCED.log.bys.you), 'the page\'s own changes: 手动修改')
  const head = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="changes"] th')].map(e => e.textContent))
  assert.deepEqual(head, [ADVANCED.log.time, ADVANCED.log.what, ADVANCED.log.by])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-change-row][data-field="brief"] [data-part="what"]').textContent), fmt(ADVANCED.log.fields.brief, { after: '只追 agent 记忆的评测' }))
})

test('R4b-2 库文件夹: the path, 重建索引, 在资源管理器中显示 (a test run only logs)', async () => {
  await onAdvanced()
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="folder-fold"] [data-library-path]').dataset.libraryPath), dir())
  await click('[data-part="this-library"] [data-action="rebuild"]')
  await until(() => document.querySelector('[data-part="this-library"] [data-rebuilt]') !== null)
  const want = `not revealed in a test run: ${dir()}`
  assert.equal(log().includes(want), false, 'control: not asked yet')
  await click('[data-part="this-library"] [data-action="reveal-library"]')
  const end = Date.now() + 20_000
  while (Date.now() < end && !log().includes(want)) await new Promise(r => setTimeout(r, 100))
  assert.ok(log().includes(want))
})

test('R4b-3 移除该库: the template dialog — what it does, the path; 取消 changes nothing; 移除 → only the registration goes, every file byte for byte, 库架', async () => {
  await onAdvanced()
  const id = registry().active
  const files = hashTree(dir())
  assert.ok(Object.keys(files).length > 5, `control: the folder holds files (${Object.keys(files).length})`)
  await click('[data-part="this-library"] [data-action="remove-library"]')
  await until(() => document.querySelector('dialog[data-dialog="remove-library"][open]') !== null)
  const d = await s.page.evaluate(() => { const e = document.querySelector('[data-dialog="remove-library"]'); return { title: e.querySelector('.dialog-head h2').textContent, text: e.querySelector('[data-part="remove-text"]').textContent, kept: e.querySelector('[data-part="remove-kept"]').textContent, path: e.querySelector('[data-part="remove-path"]').textContent, buttons: [...e.querySelectorAll('.form-footer [data-action]')].map(b => b.dataset.action) } })
  const name = registry().libraries.find(l => l.id === id).name
  assert.deepEqual(d, { title: fmt(ADVANCED.removeDialog.title, { name }), text: ADVANCED.removeDialog.text, kept: ADVANCED.removeDialog.kept, path: dir(), buttons: ['cancel-remove', 'confirm-remove'] })
  await click('[data-dialog="remove-library"] [data-action="cancel-remove"]')
  await until(() => document.querySelector('[data-dialog="remove-library"]') === null)
  assert.ok(registry().libraries.some(l => l.id === id), '取消 keeps it')
  assert.deepEqual(hashTree(dir()), files)
  await click('[data-part="this-library"] [data-action="remove-library"]')
  await until(() => document.querySelector('dialog[data-dialog="remove-library"][open]') !== null)
  await click('[data-dialog="remove-library"] [data-action="confirm-remove"]')
  await ready(s.page, 'shelf')
  assert.equal(registry().libraries.some(l => l.id === id), false, 'no longer registered')
  assert.deepEqual(hashTree(dir()), files, 'every file of the folder is still there, byte for byte')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
