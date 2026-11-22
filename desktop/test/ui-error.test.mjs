// The banner of a run that could not start (screens/problem-card.js) on the seeded world with STREAMS_DEV_CONNECTION=login-expired:
// 立即运行 → the self-check fails → the banner on top of the library's page, and on every one of its four tabs; one sentence with
// 本次运行未开始 and the number of items kept (those still at 「抓到的」), one of what to do, at most three buttons (前往登录 · 已登录，重试 · 更换连接方式);
// the files that hold the library's content are byte for byte what they were; 已登录，重试 asks again (the banner stays while the
// sign-in is still expired); 更换连接方式 goes to 设置. And a library whose source keeps failing, with a working connection: no
// banner on any tab — the finding is a card in the right panel's 待确认.
// Redesign R2 (contract R2-8, P08): was v1.0's S13 card with four controls and the login loop under it (重试打分 · 换连接方式 ·
// 复制诊断信息 · 去登录 · 我登录好了，再试一次); the design's banner has at most three buttons, so this file now asks for those three
// (复制诊断信息 is the third button of a connection problem that is not a sign-in; no fake connection here gives one, so it is
// not clicked here any more) and adds the four tabs and the source finding. V6 (tests/acceptance) keeps its own checks.
// Redesign R6a (contract R6a-2; 维护者 11-11 第 1 条): the banner's sentence is V6's new one — 「… 登录已过期，本次运行未开始。已抓取的 n 条内容
// 已保留。」 (was 「… 登录过期，这一轮没有打分。抓到的 n 条都在，没丢。」) — so the first test reads 本次运行未开始 and 已抓取的 n 条内容已保留 where
// it read 没丢 and 「n 条」; what it checks (the count, the connection's name, the fix line, the three buttons) is the same.
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

// 1.1 W7a: 「the sign-in expired」 (立即运行 → 1.0's self-check failed → the banner on every tab) is gone with 1.0's round: a library
// without a card is not updated (needs-build, test/ui-w7a.test.mjs), and an update of a card library whose sign-in ran out says
// so at the top of 待看 (B12, test/ui-w6a.test.mjs).

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
