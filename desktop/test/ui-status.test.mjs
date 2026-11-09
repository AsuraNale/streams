// 运行状态 (screens/status.js) on two seeded worlds with plan B's extras. With the fake connection chosen: the numbers are the
// core's statusView (the next run is 「定时没开」 while the schedule is off), the source rows are statusView's (the 404 one
// four rounds in a row, with 「去处理」 that goes to 来源与主题), 「现在试一次」 answers, no row offers a sign-in (control),
// 「复制诊断信息」 and 「打开运行记录文件夹」 go through the bridge. With the sign-in expired (STREAMS_DEV_CONNECTION=login-expired):
// the two command-line rows are the fourth place with 「去登录」, the line under it and 「我登录好了，再试一次」, which detects again.
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
import { STATUS } from '../src/renderer/texts/status.js'
import { TODAY } from '../src/renderer/texts/today.js'
import { ready } from './support/app.mjs'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const session = mode => worldSession({
  kind: 'seeded',
  waitFor: 'overview',
  prepare: async world => { await seedPlanB(world) },
  settings: { connections: { active: 'claude-code' } },
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

test('the numbers are the core\'s statusView; the next run (in the library\'s head) says the schedule is off', async () => {
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-stat]') !== null, null, POLL)
  const v = core.statusView(s.world.library)
  const nums = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-stat]')].map(n => [n.dataset.stat, [n.dataset.value, n.querySelector('.stat-kv__label').textContent]])))
  assert.deepEqual(Object.keys(nums), ['last-run', 'last-decision', 'month-calls'])
  assert.deepEqual(nums['last-run'], [v.lastRound.startedAt, `上次运行 · 产出 ${v.lastRoundItems} 条`])
  assert.equal(nums['last-decision'][0], v.lastDecisionAt)
  assert.equal(nums['month-calls'][0], String(v.monthUsage.calls))
  assert.ok(v.monthUsage.calls > 0, 'control: the seed\'s round made calls')
  const next = await s.page.evaluate(() => { const n = document.querySelector('[data-part="next-run"]'); return [n.dataset.nextRun, n.textContent] })
  assert.equal(next[0], '')
  assert.ok(next[1].startsWith(TODAY.nextRun.none), next[1])
})

test('the sources of the last round: statusView\'s rows; the 404 one four rounds in a row and 去处理 → 来源与要求', async () => {
  const v = core.statusView(s.world.library)
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="source-status"] [data-row]')].map(r => [r.dataset.row, r.dataset.state, r.dataset.consecutive]))
  assert.deepEqual(rows, v.sources.map(x => [x.name, x.paused ? 'paused' : x.status ?? 'never', String(x.consecutive)]))
  const old = await s.page.evaluate(() => { const r = document.querySelector('[data-part="source-status"] [data-row="old-blog"]'); return [r.querySelector('.st-fetch').textContent, r.querySelector('[data-what]').textContent, r.querySelector('[data-action="fix"]') !== null] })
  assert.deepEqual(old, ['地址有问题 · HTTP 404 · 连续 4 轮', STATUS.sources.gap, true])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="source-status"] [data-row="letta-blog"] [data-action="fix"]')), null, 'control: a source that is fine has nothing to do')
})

test('复制诊断信息 and 打开运行记录文件夹 go through the bridge; 去处理 opens 来源与要求', async () => {
  await s.page.click('[data-part="run"] [data-action="copy-diagnostics"] button')
  await waitFor(() => existsSync(join(s.world.appData, 'logs', 'clipboard.txt')))
  await s.page.click('[data-part="run"] [data-action="logs"] button')
  await waitFor(() => log(s).includes(`not opened in a test run: ${join(s.world.library, '_pipeline', 'logs')}`))
  await s.page.click('[data-part="source-status"] [data-row="old-blog"] [data-action="fix"] button')
  await s.page.waitForFunction(() => document.querySelector('main[data-screen="sources"][data-state="ready"]') !== null, null, POLL)
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

test('sign-in expired (设置): the two tools\' rows carry 去登录, the line under it and 我登录好了，再试一次', async () => {
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
