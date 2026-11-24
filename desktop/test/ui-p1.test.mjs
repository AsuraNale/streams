// 1.1.1 P1 in the real window (docs/checks/2026-11-24-1.1.1/handoff/2026-11-24-v1.1.1-acceptance.md B19; plan 场景二③④):
//   ①  an address the main agent did not open, read by Streams itself: the card can be confirmed; a source Streams cannot read
//       the pages of is named on the card before 确认 (「只有链接」)
//   ②  an address with no open and a 404: sent back once; handed in the same again, the card is shown and cannot be confirmed —
//       which address, and why (地址失效); 「请它改好再交」 sends the words asking for it, as the user's message; the card that
//       comes back can be confirmed
//   ③  after 确认, 来源与要求's 「原文」 has a value before any update, and the source the card lists as unreadable has what
//       Streams got beside its reason
// The main agent is a scripted stand-in (STREAMS_DEV_BUILD); Streams' readers answer from a table (STREAMS_DEV_READS: services/
// build.mjs devBuildReaders) — never the network. With STREAMS_P1_SHOTS=<folder> the window is shown and the pictures are saved
// there (paths masked). Each check holds first the state that would make it fail.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { BUILD } from '../src/renderer/texts/build.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'

const SHOTS = process.env.STREAMS_P1_SHOTS && isAbsolute(process.env.STREAMS_P1_SHOTS) ? process.env.STREAMS_P1_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }

const A = 'https://example-a.test/list/'
const A1 = 'https://example-a.test/list/item-1'
const A2 = 'https://example-a.test/news/'
const N = 'https://example-news.test/feed'
const S = 'https://example-b.test/samples/1'
const C = 'https://example-c.test/members'
const CARD = (o = {}) => ({
  name: o.name ?? '补助追踪',
  definition: { summary: '一座帮小企业找补助的库。', purpose: '找补助', scope: '对象：小企业；地域：安省', exclude: '贷款', trust: '官方页为准', rhythm: '每周一次', language: '中文简报', hard: '只要不用还的' },
  collect: ['设备补助'], skip: ['贷款'],
  sources: o.sources ?? [{ name: '甲目录', url: A, status: '读得到' }, { name: '乙新闻', url: N, status: '读得到' }],
  unreadable: o.unreadable ?? [{ name: '某委员会', url: C, reason: '要登录' }],
  pick: ['新的先收'], write: ['写清截止日期'], samples: [{ title: '样例', url: S, date: '2026-11-20' }],
})
const card = (c, opened = [], say = '写好了建库卡，请看一下。') => ({ json: { say, card: c }, reads: opened.map(url => ({ url, ok: true })) })

let replies = null
let reads = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: world => {
    replies = join(world.root, 'build-replies.json')
    reads = join(world.root, 'build-reads.json')
    writeFileSync(replies, JSON.stringify({ replies: [] }))
    // what Streams' own readers get: A a page of links with an article, A1 that article, the sample; N refused; C a sign-in page
    writeFileSync(reads, JSON.stringify({ [A]: { ok: true, links: [A1] }, [A1]: { ok: true }, [S]: { ok: true }, [N]: { ok: false, reason: 'blocked' }, [C]: { ok: false, reason: 'login' } }))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: replies, STREAMS_DEV_READS: reads, STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const setReplies = r => writeFileSync(replies, JSON.stringify({ replies: r }))
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [s.page.locator('.st-path'), s.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }
const talkIdle = () => until(() => document.querySelector('main[data-screen="build"][data-view="talk"]') !== null && document.querySelector('[data-part="thinking"]') === null)
const lastCard = () => s.page.evaluate(() => {
  const e = [...document.querySelectorAll('article[data-part="build-card"]')].at(-1)
  return e ? {
    can: e.dataset.canConfirm, confirm: Boolean(e.querySelector('[data-action="confirm"]')), askFix: Boolean(e.querySelector('[data-action="ask-fix"]')),
    problems: e.querySelector('[data-part="card-problems"]')?.textContent ?? '', unchecked: [...e.querySelectorAll('[data-unchecked]')].map(li => [li.dataset.unchecked, li.dataset.why]),
    linksOnly: e.querySelector('[data-part="card-links-only"]')?.textContent ?? null,
  } : null
})
async function startBuild(text) {
  await s.page.click('[data-action="add-library"]')
  await ready(s.page, 'build')
  await s.page.fill('textarea[data-field="opener"]', text)
  await s.page.click('[data-action="start"] button')
  await talkIdle()
}

describe('P1: the card\'s addresses checked by Streams itself', () => {
  test('B19 ①: A not opened by the agent but read by Streams — 确认 is there; 乙新闻, which Streams cannot read, is named as only links', async () => {
    setReplies([card(CARD(), [N, S])])
    await startBuild('帮我找补助')
    const c = await lastCard()
    assert.equal(c.can, 'true', c.problems)
    assert.equal(c.confirm, true)
    assert.equal(c.askFix, false)
    assert.equal(c.linksOnly, fmt(BUILD.linksOnly, { n: 1, names: '乙新闻' }))
    await shot('card-confirmable')
    await s.page.click('[data-action="drop"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null)
  })

  test('B19 ②: A gone (404), no open — shown after one sending back, no 确认, the address and 地址失效; 「请它改好再交」 sends the ask; the fixed card can be confirmed', async () => {
    const dead = JSON.parse(JSON.stringify(CARD()))
    const fixed = CARD({ sources: [{ name: '甲新目录', url: A2, status: '读得到' }, { name: '乙新闻', url: N, status: '读得到' }], unreadable: [{ name: '某委员会', url: C, reason: '要登录' }, { name: '甲目录', url: A, reason: '地址失效' }] })
    writeFileSync(reads, JSON.stringify({ [A]: { ok: false, reason: 'dead' }, [A2]: { ok: true, links: [A1] }, [A1]: { ok: true }, [S]: { ok: true }, [N]: { ok: false, reason: 'blocked' }, [C]: { ok: false, reason: 'login' } }))
    setReplies([card(dead, [N, S]), card(dead, [N, S], '再交一次。'), card(fixed, [N, S], '改好了。')])
    await startBuild('帮我找补助')
    const c = await lastCard()
    assert.deepEqual([c.can, c.confirm, c.askFix], ['false', false, true], JSON.stringify(c))
    assert.deepEqual(c.unchecked, [[A, 'dead']])
    assert.ok(c.problems.includes(fmt(BUILD.unchecked, { url: A, why: BUILD.readWords.dead })), c.problems)
    assert.ok(!c.problems.includes('重发'), 'no promise that it comes again by itself')
    await shot('card-unchecked')
    await s.page.click('article[data-part="build-card"]:last-of-type [data-action="ask-fix"] button')
    await talkIdle()
    const said = await s.page.evaluate(() => [...document.querySelectorAll('[data-row="you"]')].at(-1)?.textContent ?? '')
    assert.ok(said.startsWith(BUILD.askFixUrls.split('{what}')[0]) && said.includes(A), said)
    const again = await lastCard()
    assert.deepEqual([again.can, again.confirm], ['true', true], JSON.stringify(again))
    await shot('card-fixed')
    assert.equal(existsSync(join(s.world.root, 'new-libs')), false, 'nothing made before 确认')
    await s.page.click('article[data-part="build-card"][data-last="true"] [data-action="confirm"] button')
    await ready(s.page, 'sources')
  })

  test('B19 ③: 来源与要求 the day it is made — 「原文」 from the check, not 还不知道; beside an unreadable source, what Streams got', async () => {
    // (the library's first update starts by itself after 确认 — it only notes the sources' links, so the check's 「原文」 stays)
    await until(() => document.querySelectorAll('[data-card-row]').length === 4)
    const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-card-row]')].map(r => [r.dataset.cardRow, r.dataset.original, r.querySelector('[data-part="source-checked"]')?.textContent ?? null]))
    assert.deepEqual(rows, [
      ['甲新目录', 'read', null],
      ['乙新闻', 'link', null],
      ['某委员会', 'link', fmt(SOURCES.cardSources.checked, { why: SOURCES.cardSources.states.login })],
      ['甲目录', 'link', fmt(SOURCES.cardSources.checked, { why: SOURCES.cardSources.states.dead })],
    ])
    assert.ok(!rows.some(r => r[1] === 'unknown'), 'none 还不知道')
    await shot('sources-original')
  })

  test('no page errors', () => { assert.deepEqual(s.errors, []) })
})
