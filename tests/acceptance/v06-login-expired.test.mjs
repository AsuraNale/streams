// V6 · 登录过期时，本次运行不开始，库页顶上的横幅说明，已抓取的条目完整保留
// 怎么核：假连接器返回登录过期文案
// (Redesign R6a: the standard's sentence is the one 维护者 saw on 11-11 — was 「登录过期时，当轮不开始，首页横幅说明，抓到的条目完整保留」.
// What the desktop part asserts changed with it, see the last paragraph of this comment; the core part is as it was.)
//
// Core: a library with items already caught and in the inbox, and a new item waiting on the feed; a round with the core's
// fake connector in mode login-expired returns started:false, asks the feed nothing, and leaves the ledger, the inbox,
// fetch_log, the run records, notes/ and the index byte for byte as they were. Reverse: the same library with a working
// connector starts, fetches the new item and changes the ledger.
// Desktop: the real app (the pinned Electron, test/support/seed.mjs worldSession on the seeded world) with
// STREAMS_DEV_CONNECTION=login-expired; 立即运行 → the banner on top of the library's page ([data-part="problem"]) says the sign-in
// expired, that this run did not start, that the fetched items are kept (the count is the core's homeNumbers().caught for the
// folder), and how to fix it (前往登录, then 已登录，重试); the library's content files are unchanged. Reverse: the same world with
// STREAMS_DEV_CONNECTION=fake runs the round to the end and shows no card.
// Redesign R1 (维护者 11-11 第 1、6 题): 概览 and the run dialog are gone — only how this file finds things changed: 「开始」 is the
// library head's 立即运行 ([data-part="run-button"] button, which starts the round at once, no dialog), the screen waited for is
// 待看 ('inbox', was 'overview'), and the card is looked for on the library's page (.lib-page, where it now sits on top of every
// tab; was main[data-screen="overview"]); the right panel is opened on 进度, where the progress box of a run that started would be
// (it was 概览's). The standard (standards.mjs) and every assertion on the card are as they were.
// Redesign R2 (contract R2-8): the card is the banner on top of every tab of the library's page (screens/problem-card.js) — its
// words still carry what this file reads (the design's new sentence waits for the maintainer, R6); the progress box looked for is now
// 待看's run steps or the panel's running row. Only that locator changed.
// Redesign R6a (contract R6a-2; 维护者 11-11 第 1 条): the assertions on the banner follow the new sentence —
//   库页顶上的横幅: the one [data-part="problem"] is inside the library's page, between its tabs and the tab's screen, above the
//     screen on the window, and it is there on another tab of the library too (资料库); there is no other page that carries it;
//   the three things, in the banner's own sentence (texts/today.js): 登录已过期 · 本次运行未开始 · 已抓取的 n 条内容已保留 (n is the
//     core's homeNumbers().caught), the sentence being exactly the dictionary's with the connection's name and n; the words of
//     the sentence before R6a (这一轮没有打分 · 抓到的 n 条都在，没丢) are not on it;
//   how to fix it: the design's line (前往登录 · 已登录，重试) and its buttons; was 去登录 · 重试打分;
//   the English dictionary has the same three things (texts-en/today.js).
// 本次运行不开始 and 已抓取的条目完整保留 themselves are checked as before: no run is running, no progress box, the files byte for
// byte. Shown to fail with the sentence before R6a put back (desktop/scripts/mutation-check.mjs r6a-v6-old-banner).
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { core } from './support/paths.mjs'
import { feedLibrary, feedRoute, serveItems, fetchCtx, hashes } from './support/library.mjs'
import { worldSession } from '../../desktop/test/support/seed.mjs'
import { TODAY } from '../../desktop/src/renderer/texts/today.js'
import { TODAY as TODAY_EN } from '../../desktop/src/renderer/texts-en/today.js'
import { CONNECTIONS } from '../../desktop/src/renderer/texts/common.js'
import { fmt } from '../../desktop/src/renderer/lib/format.js'

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

  test('立即运行 → the banner on top of the library\'s page says the sign-in expired, this run did not start, the fetched items are kept, and how to fix it; no byte of the library changed', async () => {
    const dir = s.world.library
    const before = hashes(dir, CONTENT)
    assert.ok(Object.keys(before).length >= 6, 'control: the seeded library has its files')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="problem"]')), null, 'no card before the round')
    await startRoundFromToday(s.page)
    await s.page.waitForFunction(() => document.querySelector('.lib-page [data-part="problem"]') !== null, null, POLL)
    const card = await s.page.evaluate(() => {
      const c = document.querySelector('.lib-page [data-part="problem"]')
      return { code: c.dataset.code, connectionCode: c.dataset.connectionCode, text: c.textContent, head: c.querySelector('.today-problem__text')?.textContent ?? '', actions: [...c.querySelectorAll('[data-action]')].map(e => e.dataset.action), buttons: Object.fromEntries([...c.querySelectorAll('[data-action]')].map(e => [e.dataset.action, e.textContent.trim()])) }
    })
    assert.equal(card.code, 'connection')
    assert.equal(card.connectionCode, 'login-expired')
    const caught = core.homeNumbers(dir).caught
    assert.ok(caught >= 1, 'control: the seeded library has items at 「抓到的」')
    // redesign R6a: the three things of the new sentence, in the banner's own words
    assert.ok(card.head.includes('登录已过期'), `says the sign-in expired: ${card.head}`)
    assert.ok(card.head.includes('本次运行未开始'), `says this run did not start: ${card.head}`)
    assert.ok(card.head.includes(`已抓取的 ${caught} 条内容已保留`), `says the fetched items are kept: ${card.head}`)
    assert.equal(card.head, fmt(TODAY.problem.connection['login-expired'], { name: CONNECTIONS.names['claude-code'], n: caught }), 'the sentence is the dictionary\'s, with the connection\'s name and the count')
    for (const old of ['这一轮', '没有打分', '都在', '没丢', '当轮', '抓到的']) assert.equal(card.text.includes(old), false, `the words before R6a are gone: ${old}`)
    assert.ok(card.text.includes(TODAY.problem.fix.login), `says how to fix it: ${card.text}`)
    assert.ok(TODAY.problem.fix.login.includes(`「${TODAY.problem.login}」`) && TODAY.problem.fix.login.includes(`「${TODAY.problem.loginAgain}」`), 'the line names the two buttons by their words')
    assert.deepEqual([TODAY.problem.login, TODAY.problem.loginAgain], ['前往登录', '已登录，重试'])
    assert.ok(card.actions.includes('retry') && card.actions.includes('login'), JSON.stringify(card.actions))
    assert.deepEqual(card.buttons, { login: TODAY.problem.login, retry: TODAY.problem.loginAgain, change: TODAY.problem.change })
    // 库页顶上的横幅: one banner, inside the library's page, after its tabs and before the tab's screen, above the screen on the window
    const place = await s.page.evaluate(() => {
      const all = [...document.querySelectorAll('[data-part="problem"]')]
      const c = all[0]
      const pageEl = c.closest('.lib-page')
      const tabs = pageEl?.querySelector('nav.st-libtabs')
      const screen = pageEl?.querySelector('.lib-page__content main[data-screen]')
      const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
      return {
        count: all.length, inLibraryPage: Boolean(pageEl), screen: screen?.dataset.screen ?? null,
        afterTabs: Boolean(tabs) && Boolean(tabs.compareDocumentPosition(c) & FOLLOWING),
        beforeScreen: Boolean(screen) && Boolean(c.compareDocumentPosition(screen) & FOLLOWING),
        above: Boolean(screen) && c.getBoundingClientRect().bottom <= screen.getBoundingClientRect().top + 1,
        shown: c.getBoundingClientRect().height > 0 && c.getBoundingClientRect().top >= 0,
      }
    })
    assert.deepEqual(place, { count: 1, inLibraryPage: true, screen: 'inbox', afterTabs: true, beforeScreen: true, above: true, shown: true }, 'the banner is on top of the library\'s page')
    // … and it is the library page's, not one tab's: on 资料库 it is there too, with the same sentence
    await s.page.click('nav.st-libtabs [data-tab="library"]')
    await s.page.waitForFunction(() => document.querySelector('.lib-page main[data-screen="library"][data-state="ready"]') !== null && document.querySelector('.lib-page [data-part="problem"]') !== null, null, POLL)
    assert.equal(await s.page.evaluate(() => document.querySelector('.lib-page [data-part="problem"] .today-problem__text').textContent), card.head, 'the same banner on another tab')
    await s.page.click('nav.st-libtabs [data-tab="inbox"]')
    await s.page.waitForFunction(() => document.querySelector('.lib-page main[data-screen="inbox"][data-state="ready"]') !== null, null, POLL)
    // the English dictionary says the same three things (the page reads it while the app runs in English)
    const en = fmt(TODAY_EN.problem.connection['login-expired'], { name: 'X', n: caught })
    // redesign R6b-3: the English of 「已抓取的 n 条内容已保留」 is 「The n fetched item(s) is / are retained.」 (was 「All n fetched items are
    // kept」): in the English word list Kept is 已收藏, so 已保留 is retained (docs/checks/2026-11-13-r6b/英文对读.md). The Chinese
    // sentence — the maintainer's, V6 — and what is checked (the three things are said, with the number) did not change.
    const saysAll = t => /sign-in has expired/.test(t) && /this run did not start/.test(t) && t.includes(`The ${caught} fetched item`) && /\b(?:is|are) retained\./.test(t)
    assert.ok(saysAll(en), en)
    assert.equal(saysAll(en.replace(/ The \d+ fetched items? (?:is|are) retained\./, '')), false, 'control: without the third part the check is red')
    assert.equal(saysAll(en.replace('this run did not start', 'this run stopped')), false, 'control: without 「did not start」 the check is red')
    assert.deepEqual(Object.keys(TODAY_EN.problem.connection), Object.keys(TODAY.problem.connection), 'the two dictionaries have the same sentences')
    const state = await s.page.evaluate(() => window.streams.getRoundState())
    assert.equal(state.ok, true)
    assert.equal(state.data.running, false, 'no round is running')
    // redesign R2: the box of a run in progress is 待看's [data-part="run-steps"] and the panel's [data-part="running"] (was 概览's
    // [data-part="progress"]); only the locator changed
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run-steps"], [data-part="right-panel"] [data-part="running"]')), null, 'no progress box: the round did not start')
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
