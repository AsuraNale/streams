// 立即运行 on the seeded world — rewritten for redesign R1 (维护者 11-11 第 6 题, N06, F22; the R1 contract 「立即运行」): the run
// dialog of v1.0 (S12: its estimate rows, 改上限, 开始) is gone, so this file's old checks of it went with it (改上限 lives on
// 来源与要求: test/ui-shell.test.mjs). Held now:
//   - the library head's button is 「立即运行」 with the chip 「下次运行 …」 (1.1 W7b: v1.0's estimate of model calls is gone);
//   - a click starts the run at once: no dialog opens, the button turns 「运行中 · 停止」 while it runs, a new round lands in
//     rounds.jsonl, the panel's 进度 shows the new last round, no 「not started」 card;
//   - 「运行中 · 停止」 stops it: a source of the library is a feed on this machine that holds its answer, so the run is caught
//     while it runs; the click is cancelRound and the button comes back to 「立即运行」;
//   - the tray's 立即运行 is the same rule: its menu item says 立即运行 and calls the schedule's startOne (main.mjs), whose
//     busy-queue answers test/services-queue.test.mjs holds (queued at the end, never twice, never a dialog).
// The reverse of each: the state before the click (idle, the round count), no [data-dialog] at any point.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { SHELL } from '../src/renderer/texts/shell.js'
import { APP } from '../src/main/texts/app.js'
import { APP as APP_EN } from '../src/main/texts-en/app.js'
import { createTray } from '../src/main/tray.mjs'
import { worldSession } from './support/seed.mjs'
import { quietCard } from './support/card-world.mjs'
import { startHoldingFeed } from './support/queue-world.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
let feed = null
// the seed chose no connection: the run uses the fake one, chosen in settings.json as a user would in 设置
const s = worldSession({
  kind: 'seeded',
  waitFor: 'inbox',
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' } },
  // 1.1 W7a: a library without a card is not updated (needs-build); with one, 立即运行 is an update (the development stand-in)
  prepare: async world => { core.writeCard(world.library, quietCard()); feed = await startHoldingFeed({ holdMs: 15_000 }); return () => feed.close() },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake' }),
})
after(() => feed?.release())
const POLL = { polling: 100, timeout: 90_000 }
const R = SHELL.head.run
const button = () => s.page.evaluate(() => { const b = document.querySelector('[data-part="run-button"]'); return b ? { state: b.dataset.runState, text: b.querySelector('button').textContent.trim(), disabled: b.querySelector('button').disabled } : null })
const runState = state => s.page.waitForFunction(st => document.querySelector('[data-part="run-button"]')?.dataset.runState === st, state, POLL)
const rounds = () => core.listRounds(s.world.library, 50)
// a dialog at any point of a run is a failure: watched from the first click on
const watchDialogs = () => s.page.evaluate(() => {
  window.__dialogs = 0
  new MutationObserver(() => { if (document.querySelector('[data-dialog], dialog[open]')) window.__dialogs++ }).observe(document.body, { childList: true, subtree: true })
})

test('the head: 「立即运行」, pressable, with the next run only (1.1 W7b: no estimate of model calls)', async () => {
  await s.page.waitForFunction(() => document.querySelector('[data-part="next-run"]')?.textContent !== '', null, POLL)
  assert.deepEqual(await button(), { state: 'idle', text: R.now, disabled: false })
  const chip = await s.page.evaluate(() => document.querySelector('[data-part="next-run"]').textContent)
  assert.equal(chip, R.nextNone, 'the schedule is off in a test world; nothing after it')
})

test('立即运行: the run starts at once — no dialog; the button is the state while it runs; a new round on disk; 进度 shows it; no 「not started」 card', async () => {
  const before = rounds()
  assert.equal(before.length, 1, 'control: the seed\'s one round')
  await watchDialogs()
  await s.page.click('[data-part="run-button"] button')
  // it ran: a second round on disk, and the button back to 「立即运行」
  for (const end = Date.now() + POLL.timeout; Date.now() < end && !(rounds().length === 2 && rounds()[0].finishedAt); await s.page.waitForTimeout(150));
  assert.equal(rounds().length, 2, 'a second round on disk')
  assert.equal(rounds()[0].kind, 'update', 'an update of the card (1.1), not a round of 1.0')
  await runState('idle')
  assert.equal(await s.page.evaluate(() => window.__dialogs), 0, 'no dialog at any point')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'no 「not started」 card after a run that started')
})

test('运行中 · 停止: a run caught while it runs (a held feed); the click stops it and the button is 「立即运行」 again', async () => {
  // the card's one source is the feed that holds its answer: the update is caught reading it (1.1 W7a: 停止 stops an update)
  core.writeCard(s.world.library, { ...quietCard(), sources: [{ name: 'held', url: feed.url('held'), status: '读得到' }] })
  const n = rounds().length
  // its own watch, so it runs on its own too (--test-name-pattern, the mutants)
  await watchDialogs()
  await s.page.click('[data-part="run-button"] button')
  await runState('running')
  const b = await button()
  assert.deepEqual(b, { state: 'running', text: R.running, disabled: false })
  // the sidebar's line says the same, with the step
  await s.page.waitForFunction(() => document.querySelector('[data-library-row] [data-library-queue="running"]') !== null, null, POLL)
  await s.page.click('[data-part="run-button"] button')
  feed.release()
  await runState('idle')
  for (const end = Date.now() + POLL.timeout; Date.now() < end && !(rounds().length === n + 1 && rounds()[0].finishedAt); await s.page.waitForTimeout(150));
  assert.equal(rounds().length, n + 1)
  assert.equal(rounds()[0].status, 'cancelled', 'the update says it was stopped')
  const state = (await s.page.evaluate(() => window.streams.getRoundState())).data
  assert.equal(state.running, false)
  assert.ok(readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8').includes('cancel asked'), 'cancelRound was called')
  assert.equal(await s.page.evaluate(() => window.__dialogs), 0, 'no dialog at any point')
})

test('the tray\'s 立即运行: the same words and the same rule (the schedule\'s startOne: at once, or at the end of the queue)', () => {
  const calls = []
  const tray = createTray({ Tray: null, Menu: null, icon: '', hidden: true, onOpen: () => {}, onRunNow: () => calls.push('run'), onQuit: () => {} })
  const item = tray.items().find(i => i.id === 'run-now')
  assert.equal(item.label, '立即运行')
  assert.equal(APP.tray.runNow, '立即运行')
  assert.equal(APP_EN.tray.runNow, 'Run now')
  item.click()
  assert.deepEqual(calls, ['run'])
  // main.mjs wires it to the schedule's startOne — the rule of the head's button (startCurrent: idle → now, busy → the end of
  // the queue); nothing else (no window, no dialog)
  const main = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'main.mjs'), 'utf8')
  assert.match(main, /onRunNow: \(\) => \{ void scheduler\.startOne\('the tray menu'\) \}/)
  const sched = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'services', 'schedule.mjs'), 'utf8')
  assert.match(sched, /async function startOne\(why\) \{\n {4}try \{ return await startCurrent\(why\) \}/)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
