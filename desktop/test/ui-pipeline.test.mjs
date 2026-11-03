// 流水线 (screens/pipeline.js) on the seeded world plus plan B's extras: the strip is the core's pipelineConfig (the fixed steps
// locked, opening one shows no settings); a scoring step shows its requirement, output form, pass line, material and
// checklist (the baseline items without a remove button); a pass line outside 0–1 is refused before anything is written
// (control, streams.json hashed), one inside lands in streams.json; a requirement and a check item of the user's are saved
// and removed again; a too-short item is refused (control). 「试一条看结果」 with no connection chosen says so and offers 设置;
// with one, it shows a result and writes nothing to the record, the inbox or the checks (hashed). The right panel is the
// core's last round, recent reasons and recent check failures.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { NO_CONNECTION } from '../src/renderer/texts/common.js'
import { PIPELINE } from '../src/renderer/texts/pipeline.js'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({
  kind: 'seeded',
  waitFor: 'pipeline',
  prepare: async world => { await seedPlanB(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'pipeline' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const configHash = () => sha(join(dir(), 'streams.json'))
const written = () => {
  const inbox = join(dir(), '_pipeline', 'inbox')
  return [sha(join(dir(), '_pipeline', 'ledger.jsonl')), sha(join(dir(), '_pipeline', 'verdicts.jsonl')), ...readdirSync(inbox).sort().map(f => `${f}:${sha(join(inbox, f))}`)]
}
const click = sel => s.page.click(`${sel} button`)
const note = () => s.page.waitForFunction(() => document.querySelector('[data-part="save-note"]') !== null, null, POLL).then(() => s.page.evaluate(() => { const n = document.querySelector('[data-part="save-note"]'); return [n.dataset.kind, n.textContent] }))
const settle = () => s.page.waitForFunction(() => document.querySelector('[data-action="save"] button')?.disabled === true && document.querySelector('[data-part="unsaved"]') === null, null, POLL)
const relevance = () => core.pipelineConfig(dir()).nodes.find(n => n.id === 'relevance')

test('the strip is the core\'s steps in order; fixed steps are locked and show no settings (control); relevance opens first', async () => {
  const cfg = core.pipelineConfig(dir())
  const strip = await s.page.evaluate(() => [...document.querySelectorAll('[data-flow-node]')].map(e => [e.dataset.flowNode, e.dataset.kind, e.dataset.locked]))
  assert.deepEqual(strip, cfg.nodes.map(n => [n.id, n.kind, String(n.kind === 'fixed')]))
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="editor"]').dataset.nodeId), 'relevance')
  await s.page.click('[data-flow-node="fetch"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="locked"][data-node-id="fetch"]') !== null, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="editor"]')), null)
  assert.equal(await s.page.evaluate(t => document.querySelector('[data-part="locked"]').textContent.includes(t), PIPELINE.locked), true)
  await s.page.click('[data-flow-node="relevance"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="editor"][data-node-id="relevance"]') !== null, null, POLL)
})

test('a scoring step: requirement, output form (read only), pass line, material, checklist with the baseline items locked', async () => {
  const n = relevance()
  const shown = await s.page.evaluate(() => ({
    requirement: document.querySelector('textarea[data-field="requirement"]').value,
    output: document.querySelector('[data-part="output"]').textContent,
    outputEditable: document.querySelector('[data-part="output"]').isContentEditable,
    threshold: document.querySelector('input[data-field="threshold"]').value,
    material: document.querySelector('input[data-field="material"]:checked').value,
    checks: [...document.querySelectorAll('[data-check]')].map(e => [e.dataset.check, e.dataset.origin, e.querySelector('[data-action="remove-check"]') !== null]),
  }))
  assert.equal(shown.requirement, n.requirement)
  assert.equal(shown.output, JSON.stringify(n.output))
  assert.equal(shown.outputEditable, false)
  assert.equal(shown.threshold, String(n.threshold))
  assert.equal(shown.material, n.material)
  assert.deepEqual(shown.checks, n.checklist.map(c => [c.id, c.origin, c.origin !== 'streams']))
  assert.ok(n.checklist.some(c => c.origin === 'streams'), 'control: there are baseline items')
})

test('the pass line: 1.5 is refused and nothing is written (control); 0.65 lands in streams.json', async () => {
  const before = configHash()
  await s.page.fill('input[data-field="threshold"]', '1.5')
  await click('[data-action="save"]')
  assert.deepEqual(await note(), ['error', PIPELINE.editor.thresholdBad])
  assert.equal(configHash(), before)
  await s.page.fill('input[data-field="threshold"]', '0.65')
  await click('[data-action="save"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="save-note"]')?.dataset.kind === 'saved', null, POLL)
  assert.equal(relevance().threshold, 0.65)
  await settle()
})

test('a requirement and a check item of the user\'s are saved, and removed again; a too-short item is refused (control)', async () => {
  const extra = '公司产品的营销文章，没有技术细节的打 0.3 以下。'
  const req = await s.page.evaluate(() => document.querySelector('textarea[data-field="requirement"]').value)
  await s.page.fill('textarea[data-field="requirement"]', `${req}\n${extra}`)
  await s.page.fill('input[data-field="check-desc"]', '太短')
  await click('[data-action="add-check"]')
  const count = () => s.page.evaluate(() => document.querySelectorAll('[data-check][data-origin="user"]').length)
  assert.equal(await count(), 0, 'a two-character item is not added')
  await s.page.fill('input[data-field="check-desc"]', '理由里点出这是不是营销稿')
  await click('[data-action="add-check"]')
  assert.equal(await count(), 1)
  await click('[data-action="save"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="save-note"]')?.dataset.kind === 'saved', null, POLL)
  await settle()
  const n = relevance()
  assert.ok(n.requirement.endsWith(extra))
  assert.deepEqual(n.checklist.filter(c => c.origin === 'user').map(c => c.desc), ['理由里点出这是不是营销稿'])
  await click('[data-check][data-origin="user"] [data-action="remove-check"]')
  await click('[data-action="save"]')
  await s.page.waitForFunction(() => document.querySelectorAll('[data-check][data-origin="user"]').length === 0 && document.querySelector('[data-action="save"] button').disabled, null, POLL)
  assert.deepEqual(relevance().checklist.filter(c => c.origin === 'user'), [])
  assert.ok(relevance().checklist.some(c => c.origin === 'streams'), 'the baseline stays')
})

test('试一条看结果: no connection → it says so and offers 设置; with one, a result and nothing written to the record, the inbox or the checks', async () => {
  const caught = core.listLibrary(dir(), { view: 'caught' }).items
  const options = await s.page.evaluate(() => [...document.querySelectorAll('select[data-field="preview-url"] option')].map(o => o.value))
  assert.deepEqual(options, caught.map(i => i.url))
  const before = written()
  await click('[data-action="preview"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="preview-result"]')?.dataset.state === 'no-connection', null, POLL)
  assert.equal(await s.page.evaluate(t => document.querySelector('[data-part="preview-result"]').textContent.includes(t), NO_CONNECTION.text), true)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="preview-result"] [data-action="go-settings"]') !== null), true)
  // choose the fake connection the way 设置 does
  await s.page.evaluate(() => window.streams.setActiveConnection('claude-code'))
  await click('[data-action="preview"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="preview-result"]')?.dataset.state === 'done', null, POLL)
  const shown = await s.page.evaluate(() => ({ score: document.querySelector('[data-preview-score]')?.dataset.previewScore ?? null, check: document.querySelector('[data-part="preview-check"]')?.textContent }))
  assert.ok(shown.score !== null && Number(shown.score) >= 0 && Number(shown.score) <= 1, JSON.stringify(shown))
  assert.ok(shown.check)
  assert.deepEqual(written(), before, 'the record, the checks and the inbox are byte for byte what they were')
})

test('the right panel: the last round per step, the recent reasons for letting go, the recent check failures — the core\'s', async () => {
  const round = core.listRounds(dir(), 1)[0]
  const gate = await s.page.evaluate(() => document.querySelector('[data-round-node="relevance"] dd').textContent)
  const g = round.gates.relevance
  assert.equal(gate, (g.unscored ?? 0) > 0 ? `${g.passed} 过关 · ${g.failed} 没过 · ${g.unscored} 没打成分` : `${g.passed} 过关 · ${g.failed} 没过`)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-round-node="decide"] dd').textContent), `${round.counts.inbox} 条进待看`)
  const reasons = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="reasons"] [data-reason]')].map(e => e.dataset.reason))
  assert.deepEqual(reasons, core.recentDismissReasons(dir(), 10).map(r => r.reason))
  assert.ok(reasons.length >= 1, 'control: the seed let one go')
  const failures = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-failures]')].map(e => [e.dataset.failures, e.querySelectorAll('[data-failure]').length])))
  const want = {}
  for (const n of core.pipelineConfig(dir()).nodes.filter(x => x.kind === 'gate' || x.kind === 'summary')) {
    const f = core.recentVerdictFailures(dir(), n.id, 5)
    if (f.length) want[n.id] = f.length
  }
  assert.deepEqual(failures, want)
  assert.ok(Object.keys(want).length >= 1, 'control: the seed has a summary that did not pass')
})

test('恢复默认: enabled once getPipeline brings the defaults; confirmed, the requirement of every model step, pass line and material go back to the defaults in streams.json; cancelled, nothing is written (control)', async () => {
  const defaults = core.pipelineFrom({ pipeline: core.DEFAULT_PIPELINE(core.pipelineConfig(dir()).language) })
  const want = id => defaults.nodes.find(n => n.id === id)
  assert.notEqual(relevance().threshold === want('relevance').threshold && relevance().requirement === want('relevance').requirement, true, 'the earlier tests changed relevance, so a reset has something to undo')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="reset"] button').disabled), false)
  const before = configHash()
  await click('[data-action="reset"]')
  await s.page.waitForSelector('[data-dialog="reset-pipeline"]', { timeout: 30_000 })
  await click('[data-action="cancel-reset"]')
  await s.page.waitForFunction(() => !document.querySelector('[data-dialog="reset-pipeline"]'), null, POLL)
  assert.equal(configHash(), before, 'cancel writes nothing')
  await click('[data-action="reset"]')
  await s.page.waitForSelector('[data-dialog="reset-pipeline"]', { timeout: 30_000 })
  await click('[data-action="confirm-reset"]')
  await s.page.waitForFunction(h => document.querySelector('[data-part="save-note"]') !== null, before, POLL)
  await s.page.waitForFunction(() => document.querySelector('[data-part="save-note"]')?.dataset.kind === 'saved', null, POLL)
  for (const n of core.pipelineConfig(dir()).nodes.filter(x => x.kind === 'gate' || x.kind === 'summary')) {
    for (const k of ['requirement', 'threshold', 'material']) assert.deepEqual(n[k], want(n.id)[k], `${n.id}.${k}`)
    assert.ok(n.checklist.every(i => i.origin === 'streams'), `${n.id}: only the locked checklist items are left`)
  }
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
