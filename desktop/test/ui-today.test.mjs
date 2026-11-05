// 今日 (screens/today.js) on the seeded world (test/support/seed.mjs): the four numbers are what the core's homeNumbers gives
// for the same folder (recomputed here, not read off the page's words), the banner names the failed source, the last round's
// lines and the recently kept note are there, the sidebar badge after 待看 is the inbox count. Control: a `dismissed` event
// appended to the ledger by hand and the page read again → the inbox number and the badge go down by one. Plan C8: rounds
// without output appended to rounds.jsonl by hand → at two no banner, at three (the core's NO_OUTPUT_ROUNDS) the amber
// 「连续 3 轮没有产出」 with its link to 运行状态; a round with output after them starts the count again.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { TODAY } from '../src/renderer/texts/today.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({ kind: 'seeded', waitFor: 'today', env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake' }) })
const POLL = { polling: 100, timeout: 60_000 }
const numbersOnPage = () => s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-num]')].map(e => [e.dataset.num, Number(e.dataset.value)])))
const expected = () => {
  const n = core.homeNumbers(s.world.library)
  return { inbox: n.inbox, caught: n.caught, passed: n.lastRound?.counts?.inbox ?? 0, kept: n.kept }
}

test('the four numbers are the core\'s homeNumbers for the folder; the oldest wait shows under 待看', async () => {
  const want = expected()
  assert.deepEqual(want, { inbox: 4, caught: 1, passed: 6, kept: 1 }, 'control: the seed is what seed.mjs says')
  assert.deepEqual(await numbersOnPage(), want)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-inbox-oldest]')?.dataset.inboxOldest ?? null), String(s.world.seed.waiting.days))
})

test('the banner names the source that failed; the last round\'s lines; the kept note under 最近收藏; the badge after 待看', async () => {
  const banner = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="sources"] [data-source-state]')].map(e => [e.dataset.sourceState, e.textContent]))
  assert.equal(banner.length, 1, JSON.stringify(banner))
  assert.equal(banner[0][0], 'failed')
  assert.ok(banner[0][1].includes('mcp-news') && !banner[0][1].includes('letta-blog'), banner[0][1])
  const lines = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="round"] [data-line]')].map(e => e.dataset.line))
  assert.deepEqual(lines, ['fetch', 'dedup', 'relevance', 'substance', 'summary', 'inbox', 'calls'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="round"]').dataset.round), s.world.seed.round.id)
  const kept = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="recent"] [data-kept]')].map(e => e.dataset.kept))
  assert.deepEqual(kept, [s.world.seed.kept.id])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-badge="inbox"]')?.textContent ?? null), '4')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'no problem card: nothing failed')
  const subtitle = await s.page.evaluate(() => document.querySelector('.st-topbar__subtitle').textContent)
  assert.ok(subtitle.includes(TODAY.nextRun.none), subtitle)
})

test('control: a dismissed event appended by hand, the page read again → 待看 and the badge are one less', async () => {
  const url = s.world.seed.inbox[0].url
  appendFileSync(join(s.world.library, '_pipeline', 'ledger.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), ev: 'dismissed', url, reason: 'by hand' })}\n`)
  const want = expected()
  assert.equal(want.inbox, 3)
  await s.page.evaluate(() => { location.hash = 'today'; location.reload() })
  await ready(s.page, 'today')
  await s.page.waitForFunction(n => document.querySelector('[data-num="inbox"]')?.dataset.value === String(n), want.inbox, POLL)
  assert.deepEqual(await numbersOnPage(), want)
  await s.page.waitForFunction(() => document.querySelector('[data-badge="inbox"]')?.textContent === '3', null, POLL)
})

// plan C8: rounds appended to rounds.jsonl by hand (the shape runRound writes), the page read again each time
const roundsFile = () => join(s.world.library, '_pipeline', 'rounds.jsonl')
let extra = 0
const appendRound = inbox => {
  extra += 1
  const at = new Date(Date.now() - (10 - extra) * 3_600_000).toISOString()
  appendFileSync(roundsFile(), `${JSON.stringify({ id: `t-${extra}`, startedAt: at, finishedAt: at, counts: { fetched: 3, new: 0, maybeDuplicates: 0, summarized: 0, inbox }, gates: {}, calls: 0 })}\n`)
}
const reloadToday = async () => {
  await s.page.evaluate(() => { location.hash = 'today'; location.reload() })
  await ready(s.page, 'today')
}
const banner = () => s.page.evaluate(() => { const el = document.querySelector('[data-part="no-output"]'); return el ? { streak: el.dataset.streak, text: el.querySelector('[data-no-output-text]')?.textContent ?? null, link: el.querySelector('[data-action="go-status"] button')?.textContent ?? null } : null })

test('「连续 N 轮没有产出」: two rounds without output → no banner; the third → the amber banner with the count and a link to 运行状态', async () => {
  assert.equal(core.homeNumbers(s.world.library).noOutputStreak, 0, 'control: the seed\'s last round had output')
  assert.equal(core.NO_OUTPUT_ROUNDS, 3)
  assert.equal(await banner(), null)
  appendRound(0)
  appendRound(0)
  await reloadToday()
  assert.equal(core.homeNumbers(s.world.library).noOutputStreak, 2)
  assert.equal((await s.page.evaluate(() => window.streams.getHome())).data.numbers.noOutputStreak, 2, 'getHome carries the core\'s number')
  assert.equal(await banner(), null, 'two rounds: under the threshold, nothing shown')
  appendRound(0)
  await reloadToday()
  const home = (await s.page.evaluate(() => window.streams.getHome())).data
  assert.deepEqual([home.numbers.noOutputStreak, home.noOutputRounds], [3, core.NO_OUTPUT_ROUNDS])
  assert.deepEqual(await banner(), { streak: '3', text: fmt(TODAY.noOutput.text, { n: 3 }), link: TODAY.noOutput.go })
  assert.ok((await s.page.evaluate(() => document.querySelector('[data-part="no-output"]').textContent)).includes(TODAY.noOutput.hint), 'where to look')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="no-output"] .st-notice--wait') !== null), true, 'amber')
  await s.page.click('[data-part="no-output"] [data-action="go-status"] button')
  await ready(s.page, 'status')
})

test('a round with output after them → the count starts again and the banner goes', async () => {
  appendRound(2)
  await reloadToday()
  assert.equal(core.homeNumbers(s.world.library).noOutputStreak, 0)
  assert.equal(await banner(), null)
  appendRound(0)
  await reloadToday()
  assert.equal(await banner(), null, 'one round without output since: nothing yet')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
