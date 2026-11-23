// 运行状态 (screens/status.js) on two seeded worlds with plan B's extras. With the fake connection chosen: the numbers are the
// core's statusView (the next run is 「定时没开」 while the schedule is off), the source rows are statusView's (the 404 one
// four rounds in a row, with 「去处理」 that goes to 来源与主题), 「现在试一次」 answers, no row offers a sign-in (control),
// 「复制诊断信息」 and 「打开运行记录文件夹」 go through the bridge. With the sign-in expired (STREAMS_DEV_CONNECTION=login-expired):
// the two command-line rows are the fourth place with 「前往登录」, the line under it and 「已登录，重新检测」, which detects again (redesign R6b-2: 05's words for the two buttons).
//
// v2 package F: 运行状态 is no screen of its own any more but the 「运行状态」 part of a library's 概览 ([data-part="run"];
// STREAMS_START_SCREEN 'status' is v1.0's id and leads there): its numbers are [data-stat] (v1.0 [data-num]: 概览 has its own four
// [data-num] above), the next run is in the library's head ([data-part="next-run"]), the source rows are under
// [data-part="source-status"], the copy button is [data-action="copy-diagnostics"] (概览's problem card has a 「复制」 of its own).
// The three connections are not a library's: they are checked here on 设置, the page that has kept them (the same pieces:
// the state, 「现在试一次」, the login loop). The assertions are v1.0's.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { SHELL } from '../src/renderer/texts/shell.js'
import { ready } from './support/app.mjs'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
// redesign R1: 概览 is gone; 运行状态 sits in the right panel's 进度 under 「当前库 · 上次运行」 until R2 (screens/last-run.js) — this
// file opens the app with the panel on 进度 (the start screen 'status' is v1.0's id and leads to 待看); the next run is the head's
// chip, in its words (SHELL.head.run.nextNone, was TODAY.nextRun.none). The assertions are the ones of before.
const session = mode => worldSession({
  kind: 'seeded',
  waitFor: 'inbox',
  prepare: async world => { await seedPlanB(world) },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' } },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: mode, STREAMS_START_SCREEN: 'status' }),
})
const s = session('fake')
const e = session('login-expired')
const POLL = { polling: 100, timeout: 60_000 }
const log = w => readFileSync(join(w.world.appData, 'logs', 'main.log'), 'utf8')
async function waitFor(fn, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (fn()) return; await new Promise(r => setTimeout(r, 100)) }
  assert.fail('timed out')
}
const toSettings = async w => {
  await w.page.click('.st-sidebar__footer-button')
  await ready(w.page, 'settings')
  await w.page.waitForFunction(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3, null, POLL)
}

// redesign R2 (contract R2-6: 「四个数字方块、运行状态块不再单独存在」): the 运行状态 part (screens/status.js: its numbers, the
// sources of the last round, 复制诊断信息 / 打开运行记录文件夹) is gone from the right panel — the last run is the funnel
// (1.1 W7b: one line, test/ui-inbox.test.mjs), the sources' state is on 来源与要求's rows (test/ui-sources.test.mjs), the
// diagnostics are the banner's third button and the program records are 文件's 「在资源管理器中显示」 (test/ui-panel.test.mjs). The
// three tests of that part are replaced by this one: none of it is drawn any more, on any tab.
test('redesign R2: no 运行状态 block and no four number tiles in the right panel\'s 进度 (the last run\'s one line is there instead)', async () => {
  await s.page.click('[data-panel-tab="progress"]').catch(() => {})
  await s.page.waitForFunction(() => document.querySelector('[data-part="right-panel"] [data-part="last-run"][data-state="ready"]') !== null, null, POLL)
  const gone = await s.page.evaluate(() => ['[data-part="run"]', '[data-stat]', '[data-num]', '[data-part="numbers"]', '[data-part="source-status"]', '.today-numbers', '.stat-kv'].filter(sel => document.querySelector(sel) !== null))
  assert.deepEqual(gone, [])
  // 1.1 W7b: the last run is one line (when it ended, how many it put into 待看); v1.0's funnel is gone
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-part="right-panel"] [data-funnel-cell]').length), 0)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="right-panel"] [data-part="last-run-here"] [data-part="last-run"]')?.dataset.added), String(core.listRounds(s.world.library, 1)[0].counts.inbox), 'the one line instead')
})

test('fake connection (设置): three rows, the chosen one in use, 现在试一次 answers; no row offers a sign-in (control)', async () => {
  await toSettings(s)
  const conns = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="connections"] [data-connection]')].map(r => [r.dataset.connection, r.dataset.connState, r.dataset.active]))
  assert.deepEqual(conns.map(c => c[0]), ['claude-code', 'codex', 'api'])
  assert.deepEqual(conns[0], ['claude-code', 'usable', 'true'])
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-part="login"]').length), 0)
  await s.page.click('[data-connection="claude-code"] [data-action="probe"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-connection="claude-code"] [data-probe="ok"]') !== null, null, POLL)
})

test('sign-in expired (设置): the two tools\' rows carry 前往登录, the line under it and 已登录，重新检测', async () => {
  await toSettings(e)
  const loops = await e.page.evaluate(() => [...document.querySelectorAll('[data-part="login"]')].map(l => [l.dataset.kind, l.closest('[data-connection]').dataset.connState, l.querySelector('[data-action="login"]') !== null, l.querySelector('[data-action="login-again"]')?.textContent, l.textContent]))
  assert.deepEqual(loops.map(l => l.slice(0, 4)), [['claude-code', 'not-logged-in', true, CONNECTIONS.login.again], ['codex', 'not-logged-in', true, CONNECTIONS.login.again]])
  for (const l of loops) assert.ok(l[4].includes(CONNECTIONS.login.note), 'the line under the button')
  assert.equal(await e.page.evaluate(() => document.querySelector('[data-connection="api"] [data-part="login"]')), null, 'an API key has no sign-in')
  await e.page.click('[data-connection="claude-code"] [data-action="login"] button')
  await waitFor(() => log(e).includes('connections: login for claude-code not opened'))
  const detections = () => (log(e).match(/connections: detected /g) ?? []).length
  const before = detections()
  await e.page.click('[data-connection="claude-code"] [data-action="login-again"] button')
  await waitFor(() => detections() > before)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
  assert.deepEqual(e.errors, [])
})
