// 跑一轮 (screens/run-dialog.js) on the seeded world: the dialog's numbers are the core's estimateRound for the folder; 改上限
// 7 → streams.json's pipeline.cap; control: 0 is refused and the cap stays; 开始 → the progress on 今日 to its end → the numbers
// read again (a new last round on the page; the two dead sources failed, nothing reached the network); no problem card after a
// round that started.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
// the seed chose no connection: the round runs on the fake one, chosen in settings.json as a user would in 设置
const s = worldSession({ kind: 'seeded', waitFor: 'today', settings: { connections: { active: 'claude-code' } }, env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake' }) })
const POLL = { polling: 100, timeout: 90_000 }
const click = sel => s.page.click(`${sel} button`)
const cap = () => JSON.parse(readFileSync(join(s.world.library, 'streams.json'), 'utf8')).pipeline.cap
const dialogCap = () => s.page.evaluate(() => Number(document.querySelector('[data-dialog="run"] [data-row="cap"] [data-cap]')?.dataset.cap))

test('现在跑一轮 opens the dialog; its rows carry the core\'s estimate', async () => {
  const est = core.estimateRound(s.world.library)
  await click('[data-action="run"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="run"] [data-row="cap"]') !== null, null, POLL)
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-dialog="run"] [data-row]')].map(e => [e.dataset.row, e.querySelector('dd').textContent]))
  assert.deepEqual(rows.map(r => r[0]), ['fetch', 'items', 'calls', 'using', 'cap'])
  const text = Object.fromEntries(rows)
  assert.ok(text.fetch.includes(`${est.sources} `) && text.fetch.includes(`${est.paused} `), text.fetch)
  assert.ok(text.items.includes(`${est.expectedItems[0]}–${est.expectedItems[1]}`), text.items)
  assert.ok(text.calls.includes(`${est.expectedCalls[0]}–${est.expectedCalls[1]}`), text.calls)
  assert.equal(await dialogCap(), est.cap)
  assert.equal(est.cap, 120, 'control: the default cap')
})

test('改上限: 0 is refused and the cap stays; 7 is written to streams.json and the row shows it', async () => {
  await click('[data-action="change-cap"]')
  await s.page.waitForFunction(() => document.querySelector('[data-field="cap"]') !== null, null, POLL)
  await s.page.fill('[data-field="cap"]', '0')
  await click('[data-action="save-cap"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="run"] .run-error') !== null, null, POLL)
  assert.equal(cap(), 120, 'the cap on disk did not move')
  await s.page.fill('[data-field="cap"]', '7')
  await click('[data-action="save-cap"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="run"] [data-row="cap"] [data-cap]')?.dataset.cap === '7', null, POLL)
  assert.equal(cap(), 7)
  assert.equal(core.estimateRound(s.world.library).cap, 7)
})

test('开始: the dialog closes, the progress shows on 今日, the round ends and the page shows the new last round', async () => {
  const before = await s.page.evaluate(() => document.querySelector('[data-part="round"]').dataset.round)
  assert.equal(before, s.world.seed.round.id)
  await click('[data-dialog="run"] [data-action="start"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="run"]') === null, null, POLL)
  await s.page.waitForFunction(id => { const r = document.querySelector('[data-part="round"]'); return r !== null && r.dataset.round !== id }, before, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="progress"]')), null, 'the progress box is gone once the round is done')
  const rounds = core.listRounds(s.world.library, 2)
  assert.equal(rounds.length, 2, 'a second round on disk')
  assert.deepEqual(rounds[0].fetch.map(f => f.status), ['failed', 'failed'], 'both dead sources failed: nothing left this machine')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="round"]').dataset.round), rounds[0].id)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'no problem card after a round that started')
  const n = core.homeNumbers(s.world.library)
  assert.deepEqual(await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-num]')].map(e => [e.dataset.num, Number(e.dataset.value)]))), { inbox: n.inbox, caught: n.caught, passed: n.lastRound.counts.inbox, kept: n.kept })
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
