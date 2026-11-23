// The banner of a run that could not start (screens/problem-card.js) is not drawn for a source that keeps failing while the
// connection works: no banner on any of the library's four tabs (the sidebar marks the problem; 来源与要求's row says what to do).
// History: v1.0's S13 card, redesign R2 / R6a's banner of a failed self-check (gone with v1.0's round in 1.1 W7a), and v2's
// 系统检测 card in 待确认 (gone in 1.1 W7b).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const TABS = [['inbox', 'inbox'], ['library', 'library'], ['ask', 'ask'], ['sources', 'sources']]

// 1.1 W7a: 「the sign-in expired」 (立即运行 → 1.0's self-check failed → the banner on every tab) is gone with 1.0's round: a library
// without a card is not updated (needs-build, test/ui-w7a.test.mjs), and an update of a card library whose sign-in ran out says
// so at the top of 待看 (B12, test/ui-w6a.test.mjs). 1.1 W7b: and v2's 系统检测 card in 待确认 is gone with v2's main agent — a
// failing source is said on 来源与要求's row and by the sidebar's mark; still no banner.

describe('a source that keeps failing, with a working connection: no banner', () => {
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'decide' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake' }),
    prepare: world => {
      const at = i => new Date(Date.now() - (4 - i) * 3_600_000).toISOString()
      for (const i of [1, 2, 3]) core.appendFetchLog(world.library, { ts: at(i), round: `dry-${i}`, source: 'mcp-news', kind: 'rss', status: 'failed', hint: 'retry-next-round', count: 0, new: 0, message: 'connect ECONNREFUSED' })
    },
  })

  test('no banner on any tab; 待确认 has nothing of it (v2 系统检测 cards are gone)', async () => {
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-library-row] [data-problem]') !== null), true, 'control: the sidebar marks a problem')
    for (const [tab, screen] of TABS) {
      await s.page.click(`.st-lib-tabs [data-tab="${tab}"]`)
      await ready(s.page, screen)
      assert.equal(await s.page.evaluate(() => document.querySelector('.lib-page [data-part="problem"], .lib-page .today-banner, .lib-page [data-part="no-output"]')), null, `no banner on ${tab}`)
    }
    assert.deepEqual(await s.page.evaluate(() => [document.querySelector('[data-pane="decide"]')?.dataset.count, document.querySelectorAll('[data-decide], [data-pane="decide"] article').length]), ['0', 0])
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
