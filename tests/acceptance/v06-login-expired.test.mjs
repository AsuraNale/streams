// V6 · 登录过期时，当轮不开始，首页横幅说明，抓到的条目完整保留
// 怎么核：假连接器返回登录过期文案
//
// Core: a library with items already caught and in the inbox, and a new item waiting on the feed; a round with the core's
// fake connector in mode login-expired returns started:false, asks the feed nothing, and leaves the ledger, the inbox,
// fetch_log, the run records, notes/ and the index byte for byte as they were. Reverse: the same library with a working
// connector starts, fetches the new item and changes the ledger.
// Desktop: the real app (the pinned Electron, test/support/seed.mjs worldSession on the seeded world) with
// STREAMS_DEV_CONNECTION=login-expired; 开始 on 今日 → the card on 今日 ([data-part="problem"]) says the sign-in expired,
// that the fetched items are all there (the count is the core's homeNumbers().caught for the folder), and how to fix it
// (去登录, then 重试打分); the library's content files are unchanged. Reverse: the same world with
// STREAMS_DEV_CONNECTION=fake runs the round to the end and shows no card.
// Redesign R1 (维护者 11-11 第 1、6 题): 概览 and the run dialog are gone — only how this file finds things changed: 「开始」 is the
// library head's 立即运行 ([data-part="run-button"] button, which starts the round at once, no dialog), the screen waited for is
// 待看 ('inbox', was 'overview'), and the card is looked for on the library's page (.lib-page, where it now sits on top of every
// tab; was main[data-screen="overview"]); the right panel is opened on 进度, where the progress box of a run that started would be
// (it was 概览's). The standard (standards.mjs) and every assertion on the card are as they were.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { core } from './support/paths.mjs'
import { feedLibrary, feedRoute, serveItems, fetchCtx, hashes } from './support/library.mjs'
import { worldSession } from '../../desktop/test/support/seed.mjs'
import { TODAY } from '../../desktop/src/renderer/texts/today.js'
import { CONNECTIONS } from '../../desktop/src/renderer/texts/common.js'

const KEPT = rel => rel === 'streams.json' || rel === 'index.jsonl' || rel.startsWith('notes/') || rel.startsWith('_pipeline/inbox/') ||
  ['_pipeline/ledger.jsonl', '_pipeline/fetch_log.jsonl', '_pipeline/rounds.jsonl', '_pipeline/verdicts.jsonl'].includes(rel)

test('V6 core: login expired → the round does not start; nothing fetched, no byte of the library changed; reverse: a working connector starts', async (t) => {
  const { srv, dir, items } = await feedLibrary(t, 'v06-core', 3)
  const good = core.scriptedConnector()
  const r1 = await core.runRound(dir, { connector: good, ctx: fetchCtx() })
  assert.equal(r1.counts.inbox, 3)
  core.keep(dir, items[0].url)
  feedRoute(srv, [...items, ...serveItems(srv, 4).slice(3)]) // a fourth item waits on the feed
  const before = hashes(dir, KEPT)
  const numbers = core.homeNumbers(dir)
  const feedHits = srv.hits('/feed')
  assert.ok(before['_pipeline/ledger.jsonl'] && before['_pipeline/fetch_log.jsonl'] && before['index.jsonl'], 'control: the files compared exist')

  const expired = core.fakeConnector({ mode: 'login-expired' })
  const r = await core.runRound(dir, { connector: expired, ctx: fetchCtx() })
  assert.equal(r.ok, false)
  assert.equal(r.started, false, 'the round did not start')
  assert.deepEqual(r.problems.map(p => [p.code, p.connectionCode]), [['connection', 'login-expired']])
  assert.equal(srv.hits('/feed'), feedHits, 'the feed was not asked: no fetch ran')
  assert.equal(expired.calls.length, 1, 'only the self-check\'s probe reached the connector')
  assert.deepEqual(hashes(dir, KEPT), before, 'ledger, inbox, fetch_log, rounds, verdicts, notes, index: byte for byte')
  assert.deepEqual(core.homeNumbers(dir), numbers, 'every number of 今日 is what it was: nothing lost')
  assert.equal(core.replayLedger(dir).states.size, 3)

  // reverse: the same library with a working connector starts, asks the feed and registers the fourth item
  const r2 = await core.runRound(dir, { connector: good, ctx: fetchCtx() })
  assert.equal(r2.started, true)
  assert.equal(srv.hits('/feed'), feedHits + 1)
  assert.equal(r2.counts.new, 1)
  assert.notDeepEqual(hashes(dir, KEPT), before)
})

const POLL = { polling: 100, timeout: 90_000 }
const CONTENT = rel => rel === 'streams.json' || rel.startsWith('notes/') || rel === '_pipeline/ledger.jsonl' || rel.startsWith('_pipeline/inbox/')

async function startRoundFromToday(page) {
  await page.waitForFunction(() => document.querySelector('[data-part="run-button"][data-run-state="idle"] button')?.disabled === false, null, POLL)
  await page.click('[data-part="run-button"] button')
}

describe('V6 desktop: login expired', () => {
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'login-expired' }),
  })

  test('开始 → the card on 今日 says the sign-in expired, the fetched items are all there, and how to fix it; no byte of the library changed', async () => {
    const dir = s.world.library
    const before = hashes(dir, CONTENT)
    assert.ok(Object.keys(before).length >= 6, 'control: the seeded library has its files')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'no card before the round')
    await startRoundFromToday(s.page)
    await s.page.waitForFunction(() => document.querySelector('.lib-page [data-part="problem"]') !== null, null, POLL)
    const card = await s.page.evaluate(() => {
      const c = document.querySelector('.lib-page [data-part="problem"]')
      return { code: c.dataset.code, connectionCode: c.dataset.connectionCode, text: c.textContent, head: c.querySelector('.today-problem__text')?.textContent ?? '', actions: [...c.querySelectorAll('[data-action]')].map(e => e.dataset.action) }
    })
    assert.equal(card.code, 'connection')
    assert.equal(card.connectionCode, 'login-expired')
    const caught = core.homeNumbers(dir).caught
    assert.ok(caught >= 1, 'control: the seeded library has items at 「抓到的」')
    assert.ok(card.head.includes('登录过期'), `says the sign-in expired: ${card.head}`)
    assert.ok(card.head.includes('这一轮没有打分'), card.head)
    assert.ok(card.head.includes(`抓到的 ${caught} 条都在`) && card.head.includes('没丢'), `says the fetched items are all there: ${card.head}`)
    assert.ok(card.head.includes(CONNECTIONS.names['claude-code']), card.head)
    assert.ok(card.text.includes(TODAY.problem.fix.login), `says how to fix it: ${card.text}`)
    assert.ok(card.text.includes('去登录') && card.text.includes('重试打分'), card.text)
    assert.ok(card.actions.includes('retry') && card.actions.includes('login'), JSON.stringify(card.actions))
    const state = await s.page.evaluate(() => window.streams.getRoundState())
    assert.equal(state.ok, true)
    assert.equal(state.data.running, false, 'no round is running')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="progress"]')), null, 'no progress box: the round did not start')
    assert.deepEqual(hashes(dir, CONTENT), before, 'streams.json, the ledger, the inbox files and notes/ byte for byte')
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})

describe('V6 desktop, reverse: a working (fake) connection', () => {
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake' }),
  })

  test('开始 → the round runs to the end and no card appears on 今日', async () => {
    await startRoundFromToday(s.page)
    let state = null
    for (const until = Date.now() + POLL.timeout; Date.now() < until; await s.page.waitForTimeout(200)) {
      state = await s.page.evaluate(() => window.streams.getRoundState())
      if (state.ok && state.data.running === false && state.data.last !== null) break
    }
    assert.ok(state?.data?.last, `the round finished: ${JSON.stringify(state).slice(0, 300)}`)
    assert.equal(state.data.last.started, true, JSON.stringify(state.data.last).slice(0, 300))
    await s.page.waitForTimeout(500)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'no card after a round that started')
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
