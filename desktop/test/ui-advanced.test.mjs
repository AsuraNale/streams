// Redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-2, R4b-3, 「测」; design P15, P21): 来源与要求's 高级设置 on the running app —
// the seeded world plus plan B's extras, registered (settings.json libraryPath → the registry), the connections faked.
//   - 「← 返回来源与要求」, 高级设置, three folds open: 01 评分环节 · 02 变更记录 · 03 库文件夹;
//   - 评分环节: the seven nodes in one row (固定 抓取 · 脚本 去重 · 评分环节 ① 相关度 · 评分环节 ② 实质 · 模型 摘要 · 固定 人工确认 · 固定 入库);
//     the tools of a scoring step are none (the page says 无; the core's steps carry no tool); a fixed node shows no settings and
//     the bridge refuses a configuration without it; a built-in rule has no delete and the bridge refuses one without it (nothing
//     written); a threshold changed by hand → 来源与要求's 严格程度 says 自定义 with the new numbers;
//   - 变更记录: the core's changeLog as a table — 时间 · 变更内容 · 操作来源 (手动修改 / 主 Agent 提议 · 已确认 / 初始设置), newest first,
//     the page's own changes there (the threshold above: 手动修改), a confirmed card's, 首次设置's;
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
import { ADVANCED, SOURCES } from '../src/renderer/texts/sources.js'
import { PIPELINE } from '../src/renderer/texts/pipeline.js'
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
const configHash = () => sha(join(dir(), 'streams.json'))
const registry = () => JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8'))
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const advanced = async () => {
  await s.page.click('main[data-screen="sources"] [data-action="go-advanced"]')
  await until(() => document.querySelector('[data-view="advanced"] [data-part="gates"][data-state="ready"]') && document.querySelector('[data-part="changes"][data-state="ready"]'))
}
// each test runs on its own too (a name pattern picks one): it starts on 高级设置 with 相关度 chosen, whatever ran before it
const onAdvanced = async () => {
  if (!(await s.page.evaluate(() => document.querySelector('[data-view="advanced"]') !== null))) await advanced()
  await s.page.click('[data-flow-node="relevance"]')
  await until(() => document.querySelector('[data-part="editor"][data-node-id="relevance"]') !== null)
}
function hashTree(d, base = d, out = {}) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) hashTree(p, base, out)
    else out[p.slice(base.length + 1).replace(/\\/g, '/')] = sha(p)
  }
  return out
}

test('R4b-2 高级设置: back to 来源与要求, the title, three folds open — 评分环节 · 变更记录 · 库文件夹', async () => {
  await advanced()
  const folds = await s.page.evaluate(() => [...document.querySelectorAll('[data-view="advanced"] details.phase-row')].map(d => [d.dataset.part, d.open, d.querySelector('.phase-index').textContent, d.querySelector('.phase-label').firstChild.textContent]))
  assert.deepEqual(folds, [['gates-fold', true, '01', ADVANCED.gates], ['changes-fold', true, '02', ADVANCED.changes], ['folder-fold', true, '03', ADVANCED.folder]])
  assert.equal(await s.page.evaluate(() => document.querySelector('#sources-title').textContent), ADVANCED.heading)
  // back and forth
  await s.page.click('[data-action="back-sources"]')
  await until(() => document.querySelector('[data-view="main"] [data-part="brief"]') !== null)
  await advanced()
})

test('R4b-2 评分环节: seven nodes in one row with their kinds; the scoring steps get no tool; a fixed node shows no settings and cannot go', async () => {
  await onAdvanced()
  const cfg = core.pipelineConfig(dir())
  const nodes = await s.page.evaluate(() => [...document.querySelectorAll('.st-gate-strip [data-flow-node]')].map(e => [e.dataset.flowNode, e.dataset.kind, e.querySelector('small').textContent.trim(), e.querySelector('b').textContent.trim()]))
  assert.equal(nodes.length, 7)
  const kindOf = n => (n.kind === 'gate' ? fmt(PIPELINE.gateKind, { mark: PIPELINE.marks[cfg.nodes.filter(x => x.kind === 'gate').indexOf(n)] }) : PIPELINE.kinds[n.kind])
  assert.deepEqual(nodes.map(n => [n[0], n[1], n[2]]), cfg.nodes.map(n => [n.id, n.kind, kindOf(n)]))
  assert.deepEqual(nodes.filter(n => n[1] === 'fixed').map(n => n[0]), ['fetch', 'decide', 'store'])
  assert.ok(nodes.find(n => n[0] === 'relevance')[3].endsWith(String(cfg.nodes.find(n => n.id === 'relevance').threshold)), 'a scoring step shows its threshold')
  // the tools: none, said on the page; the core's model steps carry no tool at all
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="editor"] [data-part="tools"]').dataset.tools), 'none')
  assert.ok((await s.page.evaluate(() => document.querySelector('[data-part="tools"]').textContent)).includes(PIPELINE.editor.toolsValue))
  for (const n of cfg.nodes) assert.equal(Object.hasOwn(n, 'tools'), false, `${n.id} has no tools`)
  // a fixed node: no settings, said locked; a configuration without it is refused by the bridge, nothing written
  await s.page.click('[data-flow-node="store"]')
  await until(() => document.querySelector('[data-part="locked"][data-node-id="store"]') !== null)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="editor"]')), null)
  const before = configHash()
  const r = await bridge('savePipeline', { ...cfg, nodes: cfg.nodes.filter(n => n.id !== 'store') })
  assert.deepEqual(r, { ok: false, error: { code: 'bad_arguments' } })
  assert.equal(configHash(), before, 'nothing written')
  await s.page.click('[data-flow-node="relevance"]')
  await until(() => document.querySelector('[data-part="editor"][data-node-id="relevance"]') !== null)
})

test('R4b-2 校验规则: a built-in rule has no delete (the user\'s have one); the bridge refuses a configuration without it, nothing written', async () => {
  await onAdvanced()
  const checks = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="editor"] [data-check]')].map(e => [e.dataset.origin, e.querySelector('[data-action="remove-check"]') !== null, e.textContent]))
  const builtin = checks.filter(c => c[0] === 'streams')
  assert.ok(builtin.length >= 1, 'control: the step has built-in rules')
  assert.ok(builtin.every(c => c[1] === false && c[2].includes(PIPELINE.editor.baseline)), 'no delete, said built-in')
  const cfg = core.pipelineConfig(dir())
  const before = configHash()
  const without = { ...cfg, nodes: cfg.nodes.map(n => (n.id === 'relevance' ? { ...n, checklist: n.checklist.filter(c => c.origin !== 'streams') } : n)) }
  assert.deepEqual(await bridge('savePipeline', without), { ok: false, error: { code: 'bad_arguments' } })
  assert.equal(configHash(), before)
})

test('R4b-2 a threshold changed by hand → 来源与要求 says 自定义 with the new numbers; 变更记录 has the line, 手动修改', async () => {
  await onAdvanced()
  await s.page.fill('[data-part="editor"] input[data-field="threshold"]', '0.55')
  await click('[data-part="gates"] [data-action="save"]')
  await until(() => document.querySelector('[data-part="save-note"]')?.dataset.kind === 'saved')
  assert.equal(core.readStrictness(dir()).level, 'custom')
  await until(() => document.querySelector('[data-change-row][data-field="thresholds"]') !== null)
  const row = await s.page.evaluate(() => { const r = document.querySelector('[data-change-row]'); return [r.dataset.field, r.dataset.by, r.querySelector('[data-part="by"]').textContent, r.querySelector('[data-part="what"]').textContent] })
  const t = core.changeLog(dir()).rows[0]
  assert.deepEqual(row, ['thresholds', 'you', ADVANCED.log.bys.you, fmt(ADVANCED.log.fields.thresholds, { r0: t.before.relevance, r1: 0.55, s0: t.before.substance, s1: t.after.substance })])
  await s.page.click('[data-action="back-sources"]')
  await until(() => document.querySelector('[data-part="strictness"]')?.dataset.level === 'custom')
  const shown = await s.page.evaluate(() => ({ custom: document.querySelector('[data-part="strictness"] button[data-level="custom"]')?.getAttribute('aria-pressed'), note: document.querySelector('[data-part="level-note"]').textContent, hint: document.querySelector('[data-part="custom-hint"]') !== null }))
  assert.deepEqual(shown, { custom: 'true', note: fmt(SOURCES.brief.levelNote, { level: SOURCES.brief.levels.custom, relevance: 0.55, substance: t.after.substance }), hint: true })
  // control: a level chosen again and saved → that level, no 自定义
  await s.page.click('[data-part="strictness"] [data-level="strict"]')
  await click('[data-action="save-brief"]')
  await until(() => document.querySelector('[data-part="strictness"]')?.dataset.level === 'strict')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="strictness"] button[data-level="custom"]')), null)
  await advanced()
})

test('R4b-2 变更记录: the core\'s changeLog, newest first — 时间 · 变更内容 · 操作来源: 手动修改, 主 Agent 提议 · 已确认, 初始设置', async () => {
  // a card confirmed (the core's own, as 确认 does) and 首次设置's record, then the page read again
  const card = { id: 'p-r4b-1', kind: 'edit_cap' }
  core.recordChange(dir(), { field: 'cap', by: 'agent-confirmed', proposalId: card.id, before: 120, after: 30 })
  core.recordSetupStep(dir(), 'schedule', { by: 'default' }, { now: () => new Date(Date.now() + 2000) })
  await s.page.evaluate(() => { location.hash = 'sources'; location.reload() })
  await ready(s.page, 'sources')
  await advanced()
  const want = core.changeLog(dir()).rows
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="changes"] [data-change-row]')].map(r => [r.dataset.kind, r.dataset.field, r.dataset.by, r.querySelector('[data-part="by"]').textContent]))
  assert.deepEqual(rows, want.map(r => [r.kind, r.field ?? r.step, r.by, ADVANCED.log.bys[r.by]]))
  assert.deepEqual(rows.slice(0, 2).map(r => [r[1], r[3]]), [['schedule', ADVANCED.log.bys.setup], ['cap', ADVANCED.log.bys['agent-confirmed']]])
  assert.ok(rows.some(r => r[3] === ADVANCED.log.bys.you), 'the page\'s own changes: 手动修改')
  const head = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="changes"] th')].map(e => e.textContent))
  assert.deepEqual(head, [ADVANCED.log.time, ADVANCED.log.what, ADVANCED.log.by])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-change-row][data-field="cap"] [data-part="what"]').textContent), fmt(ADVANCED.log.fields.cap, { before: 120, after: 30 }))
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
