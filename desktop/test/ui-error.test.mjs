// The banner of a run that could not start (screens/problem-card.js) on the seeded world with STREAMS_DEV_CONNECTION=login-expired:
// 立即运行 → the self-check fails → the banner on top of the library's page, and on every one of its four tabs; one sentence with
// 没丢 and the number of items still at 「抓到的」, one of what to do, at most three buttons (前往登录 · 已登录，重试 · 更换连接方式);
// the files that hold the library's content are byte for byte what they were; 已登录，重试 asks again (the banner stays while the
// sign-in is still expired); 更换连接方式 goes to 设置. And a library whose source keeps failing, with a working connection: no
// banner on any tab — the finding is a card in the right panel's 待确认.
// Redesign R2 (contract R2-8, P08): was v1.0's S13 card with four controls and the login loop under it (重试打分 · 换连接方式 ·
// 复制诊断信息 · 去登录 · 我登录好了，再试一次); the design's banner has at most three buttons, so this file now asks for those three
// (复制诊断信息 is the third button of a connection problem that is not a sign-in; no fake connection here gives one, so it is
// not clicked here any more) and adds the four tabs and the source finding. V6 (tests/acceptance) keeps its own checks.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { TODAY } from '../src/renderer/texts/today.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const TABS = [['inbox', 'inbox'], ['library', 'library'], ['ask', 'ask'], ['sources', 'sources']]

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

describe('the sign-in expired', () => {
  const s = worldSession({ kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' } }, env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'login-expired' }) })
  const click = sel => s.page.click(`${sel} button`)
  let before = null

  test('立即运行 → the banner: 没丢 with the count, what to do, three buttons (前往登录 · 已登录，重试 · 更换连接方式)', async () => {
    before = contentHashes(s.world.library)
    assert.ok(Object.keys(before).length >= 6, `control: ${Object.keys(before).length} content files hashed`)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'control: no banner before the run')
    await s.page.waitForFunction(() => document.querySelector('[data-part="run-button"][data-run-state="idle"] button')?.disabled === false, null, POLL)
    await click('[data-part="run-button"]')
    await s.page.waitForFunction(() => document.querySelector('.lib-page [data-part="problem"]') !== null, null, POLL)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog]')), null, 'no dialog on the way')
    const card = await s.page.evaluate(() => {
      const c = document.querySelector('[data-part="problem"]')
      return { code: c.dataset.code, connectionCode: c.dataset.connectionCode, kind: c.dataset.kind, text: c.querySelector('.today-problem__text').textContent, fix: c.querySelector('[data-part="problem-fix"]')?.textContent ?? '', actions: [...c.querySelectorAll('[data-action]')].map(e => [e.dataset.action, e.textContent.trim()]) }
    })
    assert.deepEqual([card.code, card.connectionCode, card.kind], ['connection', 'login-expired', 'claude-code'])
    const caught = core.homeNumbers(s.world.library).caught
    assert.ok(caught >= 1, 'control: items at 「抓到的」')
    assert.ok(card.text.includes('没丢') && card.text.includes(`${caught} 条`), card.text)
    assert.ok(card.text.includes(CONNECTIONS.names[card.kind]), card.text)
    assert.equal(card.fix, TODAY.problem.fix.login)
    assert.deepEqual(card.actions, [['login', '前往登录'], ['retry', '已登录，重试'], ['change', '更换连接方式']])
    assert.ok(card.actions.length <= 3)
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('.lib-page [data-part="problem"]').length), 1, 'one banner at most')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run-steps"]')), null, 'no run in progress: it did not start')
  })

  test('the banner is on every one of the four tabs', async () => {
    for (const [tab, screen] of TABS) {
      await s.page.click(`.st-lib-tabs [data-tab="${tab}"]`)
      await ready(s.page, screen)
      assert.equal(await s.page.evaluate(() => document.querySelectorAll('.lib-page [data-part="problem"][data-connection-code="login-expired"]').length), 1, tab)
    }
    await s.page.click('.st-lib-tabs [data-tab="inbox"]')
    await ready(s.page, 'inbox')
  })

  test('the library\'s content files are byte for byte what they were; 已登录，重试 asks again and the banner stays; 更换连接方式 goes to 设置', async () => {
    assert.deepEqual(contentHashes(s.world.library), before)
    const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8').split('\n').filter(l => l.includes('self-check failed')).length
    const n = log()
    await click('[data-part="problem"] [data-action="retry"]')
    const end = Date.now() + 20_000
    while (log() === n) { if (Date.now() > end) throw new Error('no second self-check'); await s.page.waitForTimeout(100) }
    await s.page.waitForFunction(() => document.querySelector('[data-part="problem"][data-connection-code="login-expired"]') !== null && document.querySelector('[data-action="retry"] button')?.disabled === false, null, POLL)
    assert.deepEqual(contentHashes(s.world.library), before, 'still nothing written')
    await click('[data-part="problem"] [data-action="change"]')
    await ready(s.page, 'settings')
    await s.page.waitForFunction(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3, null, POLL)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-connection="claude-code"]').dataset.active), 'true')
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})

describe('a source that keeps failing, with a working connection: no banner, a card in 待确认', () => {
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'decide' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake' }),
    prepare: world => {
      const at = i => new Date(Date.now() - (4 - i) * 3_600_000).toISOString()
      for (const i of [1, 2, 3]) core.appendFetchLog(world.library, { ts: at(i), round: `dry-${i}`, source: 'mcp-news', kind: 'rss', status: 'failed', hint: 'retry-next-round', count: 0, new: 0, message: 'connect ECONNREFUSED' })
      core.recordSuggestions(world.library, core.suggestFor(world.library))
    },
  })

  test('no banner on any tab; 待确认 has the card of the failing source', async () => {
    assert.ok(readFileSync(join(s.world.library, '_pipeline', 'suggestions.jsonl'), 'utf8').includes('source-failing:mcp-news'), 'control: the finding is recorded')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-library-row] [data-problem]') !== null), true, 'control: the sidebar marks a problem')
    for (const [tab, screen] of TABS) {
      await s.page.click(`.st-lib-tabs [data-tab="${tab}"]`)
      await ready(s.page, screen)
      assert.equal(await s.page.evaluate(() => document.querySelector('.lib-page [data-part="problem"], .lib-page .today-banner, .lib-page [data-part="no-output"]')), null, `no banner on ${tab}`)
    }
    // redesign R5b: a 系统检测 in 待确认 is [data-decide][data-from="system"] (was [data-kind="suggestion"]: data-kind is the kind now)
    await s.page.waitForFunction(() => [...document.querySelectorAll('[data-decide][data-from="system"]')].some(e => e.textContent.includes('mcp-news')), null, POLL)
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
