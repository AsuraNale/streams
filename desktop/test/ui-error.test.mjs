// S13 (screens/today.js ProblemCard) on the seeded world with STREAMS_DEV_CONNECTION=login-expired: 开始 in the dialog → the
// self-check fails → the card with its four controls (重试打分 · 换连接方式 · 复制诊断信息 · 去登录 with the line under it and
// 我登录好了，再试一次), its sentence says 没丢 with the number of items still at 「抓到的」; the files that hold the library's
// content (streams.json, the ledger, the inbox files, notes/) are byte for byte what they were; 复制诊断信息 writes the file a
// test run uses instead of the clipboard, without a key in it; 换连接方式 goes to 设置.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'
// v2 package F: 今日 is the 概览 tab of a library's page now (screen 'overview', the screen the app opens on); this file's assertions are v1.0's, only the screen id changed

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({ kind: 'seeded', waitFor: 'overview', settings: { connections: { active: 'claude-code' } }, env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'login-expired' }) })
const POLL = { polling: 100, timeout: 60_000 }
const click = sel => s.page.click(`${sel} button`)

/** sha256 of the files that hold the library's content (not the logs the self-check and the usage counter append to). */
function contentHashes(dir) {
  const out = {}
  const walk = d => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      const rel = relative(dir, p).replace(/\\/g, '/')
      if (statSync(p).isDirectory()) { if (rel === '_pipeline/logs' || rel === '_pipeline/cache') continue; walk(p); continue }
      if (rel === 'streams.json' || rel.startsWith('notes/') || rel === '_pipeline/ledger.jsonl' || rel.startsWith('_pipeline/inbox/')) out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  walk(dir)
  return out
}

let before = null

test('开始 with an expired sign-in → the card: the sentence with 没丢 and the count, the four controls, the login line', async () => {
  before = contentHashes(s.world.library)
  assert.ok(Object.keys(before).length >= 6, `control: ${Object.keys(before).length} content files hashed`)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'control: no card before the round')
  await click('[data-action="run"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="run"] [data-row="cap"]') !== null, null, POLL)
  await click('[data-dialog="run"] [data-action="start"]')
  await s.page.waitForFunction(() => document.querySelector('main[data-screen="overview"] [data-part="problem"]') !== null, null, POLL)
  const card = await s.page.evaluate(() => {
    const c = document.querySelector('[data-part="problem"]')
    return { code: c.dataset.code, connectionCode: c.dataset.connectionCode, kind: c.dataset.kind, text: c.querySelector('.today-problem__text').textContent, actions: [...c.querySelectorAll('[data-action]')].map(e => e.dataset.action), login: c.querySelector('[data-part="login"]')?.textContent ?? null }
  })
  assert.equal(card.code, 'connection')
  assert.equal(card.connectionCode, 'login-expired')
  assert.equal(card.kind, 'claude-code', 'the connection chosen in settings.json')
  const caught = core.homeNumbers(s.world.library).caught
  assert.ok(card.text.includes('没丢') && card.text.includes(`${caught} 条`), card.text)
  assert.ok(card.text.includes(CONNECTIONS.names[card.kind]), card.text)
  assert.deepEqual(card.actions, ['retry', 'change', 'copy', 'login', 'login-again'])
  assert.ok(card.login.includes(CONNECTIONS.login.note) && card.login.includes(CONNECTIONS.login.again), card.login)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="progress"]')), null, 'no progress box: the round did not start')
})

test('the library\'s content files are byte for byte what they were; 复制诊断信息 writes the test file without any key', async () => {
  assert.deepEqual(contentHashes(s.world.library), before)
  await click('[data-part="problem"] [data-action="copy"]')
  const file = join(s.world.appData, 'logs', 'clipboard.txt')
  await s.page.waitForFunction(() => document.querySelector('[data-part="problem"] .st-t-done') !== null, null, POLL)
  assert.ok(existsSync(file), 'the diagnostics went to logs/clipboard.txt in a test run')
  const text = readFileSync(file, 'utf8')
  assert.ok(text.length > 100 && !/sk-[A-Za-z0-9]{8,}/.test(text), 'diagnostics with no key-shaped text')
})

test('重试打分 asks again and the card stays (the sign-in is still expired); 换连接方式 goes to 设置', async () => {
  await click('[data-part="problem"] [data-action="retry"]')
  await s.page.waitForTimeout(800)
  await s.page.waitForFunction(() => document.querySelector('[data-part="problem"][data-connection-code="login-expired"]') !== null && document.querySelector('[data-action="retry"] button')?.disabled === false, null, POLL)
  assert.deepEqual(contentHashes(s.world.library), before, 'still nothing written')
  await click('[data-part="problem"] [data-action="change"]')
  await ready(s.page, 'settings')
  // the connection rows come with their own read (getConnections) after the page is ready
  await s.page.waitForFunction(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-connection="claude-code"]').dataset.active), 'true')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
