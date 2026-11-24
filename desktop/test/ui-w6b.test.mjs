// 1.1 W6b in the real window (docs/checks/2026-11-20-1.1/w6b/scorecard.json): 新建库 from one sentence; the build
// conversation — the main agent's questions as buttons, the four kinds of question that break the rules never shown (A1);
// the library card, 确认 only on a whole card whose addresses were read, before / after when a card comes again (A2); nothing
// made before 确认, 不建了 makes nothing (B3); a library's card changed only on 确认; the conversation kept across leaving the
// page and a restart; a failed turn and a stopped build; Codex cannot start; light and dark, a long line (A7); English (E5).
// The main agent is a scripted stand-in (STREAMS_DEV_BUILD: services/build.mjs devBuildSession, the n-th call → the n-th
// reply). With STREAMS_W6B_SHOTS=<folder> the window is shown and the pictures are saved there.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { readCard, writeCard } from '../src/main/core.mjs'
import { BUILD } from '../src/renderer/texts/build.js'
import { worldSession } from './support/seed.mjs'
import { closeApp, launch, ready } from './support/app.mjs'

const SHOTS = process.env.STREAMS_W6B_SHOTS && isAbsolute(process.env.STREAMS_W6B_SHOTS) ? process.env.STREAMS_W6B_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
const range = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`
const CJK = new RegExp(`[${range(0x3400, 0x9FFF)}${range(0x3000, 0x303F)}${range(0xFF00, 0xFFEF)}]`)
const hashOf = p => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'absent')

const A = 'https://example-a.test/list'
const B = 'https://example-b.test/samples/1'
const C = 'https://example-c.test/members'
const U = 'https://example-unread.test/x'
const LONG = '给基金行业研究用的库，每天跟踪中国电动车和动力电池：月度销量和交付、价格战、出海、固态电池进展，以及主要车企和电池厂在海外建厂和销售的动向。只收一手来源，公司公告和行业协会的数据为准。'
const CARD = (o = {}) => ({
  name: o.name ?? '中国电动车',
  definition: { summary: LONG, purpose: '行业研究', scope: '对象：车企和电池厂；行业：电动车；地域：中国和海外；规模：大中型', exclude: '自媒体和营销号', trust: '公司公告、乘联会为准（我替你定的）', rhythm: o.rhythm ?? '每周一次', language: '中文简报（我替你定的）', hard: '每条要有一手出处' },
  decide: [{ what: '零跑、问界只收销量和价格动作', default: '收' }],
  collect: o.collect ?? ['月度销量和交付', '价格战'], skip: ['传闻'],
  sources: [{ name: '甲来源', url: A, status: '读得到' }],
  unreadable: [{ name: '某协会', url: C, reason: '要登录' }],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
})
const q = (text, kind = 'input', options = [], say = '') => ({ json: { say, question: { text, kind, options } } })
const card = (c, reads = [], say = '写好了建库卡，请看一下。') => ({ json: { say, card: c }, reads: reads.map(url => ({ url, ok: true })) })
const without = (c, fn) => { const x = structuredClone(c); fn(x); return x }

let replies = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: world => {
    replies = join(world.root, 'build-replies.json')
    writeFileSync(replies, JSON.stringify({ replies: [] }))
    writeCard(world.library, CARD({ name: '已有的库' }))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: replies, STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), STREAMS_START_SCREEN: 'inbox', STREAMS_DEV_UPDATE_HOLD_MS: '4000', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const setReplies = r => writeFileSync(replies, JSON.stringify({ replies: r }))
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`) }) } }
const talkIdle = () => until(() => document.querySelector('main[data-screen="build"][data-view="talk"]') !== null && document.querySelector('[data-part="thinking"]') === null)
/** What the conversation shows of the questions: n, kind, the options. */
const shownQuestions = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="question"]')].map(e => ({ n: Number(e.dataset.n), kind: e.dataset.kind, options: [...e.querySelectorAll('[data-option]')].map(b => b.dataset.option), other: Boolean(e.querySelector('[data-field="other"]')) })))
const cards = () => s.page.evaluate(() => [...document.querySelectorAll('article[data-part="build-card"]')].map(e => ({ can: e.dataset.canConfirm, last: e.dataset.last, confirm: Boolean(e.querySelector('[data-action="confirm"]')), problems: e.querySelector('[data-part="card-problems"]')?.textContent ?? '', changes: [...e.querySelectorAll('[data-change]')].map(c => c.dataset.change), changeText: e.querySelector('[data-part="card-changes"]')?.textContent ?? '' })))
async function say(text) {
  await s.page.fill('textarea[data-field="message"]', text)
  await s.page.click('[data-action="send"] button')
  await talkIdle()
}
const over = () => s.page.evaluate(() => {
  const bad = []
  for (const el of document.querySelectorAll('main *')) {
    const box = el.closest('article, section, .assistant-message, .user-message, .composer-wrap') ?? el.parentElement
    if (!box || box === el) continue
    const a = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    if (a.width === 0 || getComputedStyle(el).position === 'fixed') continue
    if (a.right > b.right + 1 || a.left < b.left - 1) bad.push(`${el.tagName}.${el.className}`.slice(0, 80))
  }
  const main = document.querySelector('main .thread-scroll') ?? document.querySelector('main .st-main__body') ?? document.querySelector('main')
  if (main.scrollWidth > main.clientWidth + 1) bad.push('the main column scrolls sideways')
  return bad.slice(0, 5)
})
/** A7: the page in light and in dark, nothing over its box; a picture of each. */
async function looks(name) {
  for (const look of ['light', 'dark']) {
    const set = await s.page.evaluate(a => window.streams.setAppearance(a), look)
    assert.ok(set.ok, JSON.stringify(set))
    await until(a => document.body.dataset.appearance === a, look)
    assert.deepEqual(await over(), [], `${name} ${look}`)
    await shot(`${name}-${look}`)
  }
  await s.page.evaluate(() => window.streams.setAppearance('light'))
}

describe('W6b: 新建库 and the build conversation', () => {
  test('the start: 新建库 opens the one-sentence page; 开始 only with words, and only on Claude Code (Codex says why)', async () => {
    await s.page.click('[data-action="add-library"]')
    await ready(s.page, 'build')
    const page = () => s.page.evaluate(() => ({
      view: document.querySelector('main[data-screen="build"]')?.dataset.view,
      start: document.querySelector('[data-action="start"] button')?.disabled,
      why: document.querySelector('[data-part="start-why"]')?.textContent ?? null,
      how: Boolean(document.querySelector('[data-part="how-it-works"]')),
      sidebar: document.querySelector('[data-action="add-library"]')?.classList.contains('active'),
    }))
    let p = await page()
    assert.deepEqual([p.view, p.start, p.why, p.how, p.sidebar], ['start', true, null, true, true], 'empty: 开始 cannot be pressed')
    await s.page.fill('textarea[data-field="opener"]', '帮我跟踪中国电动车行业')
    assert.equal((await page()).start, false)
    // 1.1.1 P3: Codex builds too — 开始 can be pressed, no reason shown
    let set = await s.page.evaluate(() => window.streams.setActiveConnection('codex'))
    assert.ok(set.ok, JSON.stringify(set))
    await until(() => document.querySelector('[data-part="connection-chip"]')?.textContent.includes('Codex'))
    p = await page()
    assert.deepEqual([p.start, p.why], [false, null], 'on Codex 开始 can be pressed')
    // an API key still only asks (P4–P6): 开始 cannot be pressed, and why — naming both connections that build
    set = await s.page.evaluate(() => window.streams.setActiveConnection('api'))
    assert.ok(set.ok, JSON.stringify(set))
    await until(() => document.querySelector('[data-part="start-why"]') !== null)
    p = await page()
    assert.equal(p.start, true, 'on an API key 开始 cannot be pressed')
    assert.ok(p.why.includes('连接你电脑上的 Claude Code') && p.why.includes('连接你电脑上的 Codex'), p.why)
    if (SHOTS) await shot('start-api')
    await s.page.evaluate(() => window.streams.setActiveConnection('claude-code'))
    await until(() => document.querySelector('[data-part="start-why"]') === null)
    assert.equal((await page()).start, false)
    await looks('start')
  })

  test('A1: the questions — buttons, at most 4 and 「其它」; a first question with options, 5 options, a 3rd question with no options and a 6th question are never shown', async () => {
    const Q1 = q('你拿这些信息做什么？最看重哪几样？', 'input', [], '我先看了一眼：几家车企 11 月初都发了 10 月交付。先问你几个问题。')
    setReplies([
      q('你做什么用？', 'single', ['研究', '投资']), Q1, // 0 → back once → 1
      q('还要哪几家？', 'single', ['零跑', '问界', '小鹏', '理想', '蔚来']), q('除了你点名的几家，下面这些也要一起跟吗？', 'multi', ['零跑、问界等其他新势力', '吉利、长安、上汽的新能源', '特斯拉中国', '宁德时代以外的电池厂']), // 2 → 3
      q('地域和规模呢？'), // 4: the 2nd question with no options
      q('还有什么硬条件？'), q('还有什么硬条件？'), // 5, 6: a 3rd one with no options, twice → not shown
      q('不要什么？', 'multi', ['自媒体', '营销号', '传闻']), // 7
      q('多久看一次？', 'single', ['每天', '每周']), // 8
      q('还有吗？', 'single', ['有', '没有']), q('还有吗？', 'single', ['有', '没有']), // 9, 10: a 6th, twice → not shown
    ])
    await s.page.click('[data-action="start"] button')
    await talkIdle()
    assert.deepEqual(await shownQuestions(), [{ n: 1, kind: 'input', options: [], other: false }], 'the first question with options was not shown; its fixed one was')
    await say('我在基金做行业研究，最看重月度销量和价格战。')
    let qs = await shownQuestions()
    assert.deepEqual(qs.at(-1), { n: 2, kind: 'multi', options: ['零跑、问界等其他新势力', '吉利、长安、上汽的新能源', '特斯拉中国', '宁德时代以外的电池厂'], other: true }, 'the 5-option question was not shown')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="progress-chip"]').textContent.includes('第 2 题 · 最多 5 题')), true)
    await looks('question')
    await s.page.click('[data-part="question"][data-n="2"] [data-option="特斯拉中国"]')
    await s.page.click('[data-part="question"][data-n="2"] [data-option="宁德时代以外的电池厂"]')
    await s.page.fill('[data-part="question"][data-n="2"] [data-field="other"]', '电池那块要有宁德时代')
    assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="question"][data-n="2"] [aria-pressed="true"]')].map(b => b.dataset.option)), ['特斯拉中国', '宁德时代以外的电池厂'])
    await s.page.click('[data-part="question"][data-n="2"] [data-action="answer"] button')
    await talkIdle()
    assert.equal(await s.page.evaluate(() => [...document.querySelectorAll('[data-row="you"]')].at(-1).textContent), '我选了：特斯拉中国、宁德时代以外的电池厂；其它：电池那块要有宁德时代')
    assert.deepEqual((await shownQuestions()).at(-1), { n: 3, kind: 'input', options: [], other: false })
    await say('中国市场为主，大中型车企。')
    assert.equal((await shownQuestions()).length, 3, 'the 3rd question with no options was not shown')
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-part="not-shown"]').length), 1)
    await say('没有了')
    assert.deepEqual((await shownQuestions()).at(-1).n, 4)
    await s.page.click('[data-part="question"][data-n="4"] [data-option="自媒体"]')
    await s.page.click('[data-part="question"][data-n="4"] [data-action="answer"] button')
    await talkIdle()
    assert.equal((await shownQuestions()).at(-1).n, 5)
    // single: a second press moves the choice
    await s.page.click('[data-part="question"][data-n="5"] [data-option="每天"]')
    await s.page.click('[data-part="question"][data-n="5"] [data-option="每周"]')
    assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="question"][data-n="5"] [aria-pressed="true"]')].map(b => b.dataset.option)), ['每周'])
    await s.page.click('[data-part="question"][data-n="5"] [data-action="answer"] button')
    await talkIdle()
    qs = await shownQuestions()
    assert.deepEqual(qs.map(x => x.n), [1, 2, 3, 4, 5], 'no 6th question')
    assert.ok(qs.every(x => x.options.length <= 4))
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-part="not-shown"]').length), 2)
    assert.equal(await s.page.evaluate(() => document.body.textContent.includes('第 6 题')), false)
  })

  test('A2 / B3: a card without 「读不到的来源」, without 「语言」, with an address not read — no 确认; a whole one — 确认; sent again — before / after; nothing made until 确认', async () => {
    const whole = CARD()
    setReplies([
      ...Array(11).fill(q('x')),
      card(without(whole, c => { delete c.unreadable })), card(without(whole, c => { delete c.definition.language })), // 11 → 12 shown
      card(without(whole, c => { delete c.unreadable })), card(without(whole, c => { delete c.unreadable })), // 13 → 14 shown
      card(without(whole, c => { c.sources.push({ name: '没读过', url: U, status: '读得到' }) })), card(without(whole, c => { c.sources.push({ name: '没读过', url: U, status: '读得到' }) })), // 15 → 16 shown
      card(whole, [A, B, C]), // 17
      card(CARD({ rhythm: '每天一次' })), // 18
    ])
    await say('写卡吧')
    let cs = await cards()
    assert.deepEqual([cs.length, cs[0].can, cs[0].confirm], [1, 'false', false])
    assert.ok(cs[0].problems.includes('定义缺「语言」一行'), cs[0].problems)
    await say('补上语言')
    cs = await cards()
    assert.deepEqual([cs.at(-1).can, cs.at(-1).confirm], ['false', false])
    assert.ok(cs.at(-1).problems.includes('缺「读不到的来源」'), cs.at(-1).problems)
    await say('补上读不到的来源')
    cs = await cards()
    assert.deepEqual([cs.at(-1).can, cs.at(-1).confirm], ['false', false])
    // 1.1.1 P1 (B19): the addresses neither opened nor read by Streams, one by one (here no reader answers: all three)
    assert.ok(cs.at(-1).problems.includes('个网址流息核不到') && cs.at(-1).problems.includes(U), cs.at(-1).problems)
    await say('去掉没读过的')
    cs = await cards()
    assert.deepEqual([cs.at(-1).can, cs.at(-1).confirm, cs.at(-1).last], ['true', true, 'true'])
    assert.ok(cs.slice(0, -1).every(c => !c.confirm), 'only the last card has 确认')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="progress-chip"]').dataset.waiting), 'true')
    // 看全文: every part
    await s.page.click('article[data-part="build-card"][data-last="true"] [data-action="full"] button')
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('article[data-part="build-card"][data-last="true"] [data-card-part]').length), 8)
    await s.page.click('article[data-part="build-card"][data-last="true"] [data-action="full"] button')
    // sent again with a change: before / after
    await say('改成每天一次')
    cs = await cards()
    assert.deepEqual([cs.at(-1).can, cs.at(-1).changes], ['true', ['rhythm']])
    assert.ok(cs.at(-1).changeText.includes('每周一次') && cs.at(-1).changeText.includes('每天一次'), cs.at(-1).changeText)
    await looks('card')
    // the right panel's 待确认: the card, one
    await s.page.click('[data-panel-tab="decide"]')
    await until(() => document.querySelector('[data-part="build-waiting"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-panel-badge="decide"]')?.textContent.trim()), '1')
    assert.ok((await s.page.evaluate(() => document.querySelector('[data-part="build-waiting"]').textContent)).includes('建库卡：中国电动车'))
    await shot('card-panel')
    // B3: nothing made before 确认
    assert.equal(existsSync(join(s.world.root, 'new-libs')), false)
    await s.page.click('article[data-part="build-card"][data-last="true"] [data-action="confirm"] button')
    await ready(s.page, 'sources')
    const lib = await s.page.evaluate(() => window.streams.getAppState().then(a => a.data.library))
    assert.equal(lib.name, '中国电动车')
    assert.equal(readCard(lib.path).definition.rhythm, '每天一次')
    assert.equal((await s.page.evaluate(() => window.streams.getBuild())).data, null)
    assert.ok(readdirSync(join(s.world.root, 'new-libs')).length === 1)
    // 1.1 W10 (维护者 11-23 「要，建好就跑」): the new library's first update started by itself — its line in rounds.jsonl (an
    // update, the stand-in agent hands in nothing), the queue's why 「first」, and the run button back to 立即运行 once it ended
    // (the stand-in update agent holds its answer STREAMS_DEV_UPDATE_HOLD_MS, so the run is seen while it runs)
    await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'running')
    await shot('after-confirm')
    await s.page.click('[data-panel-tab="progress"]')
    await until(why => document.querySelector('[data-pane="progress"]')?.textContent.includes(why), '创建库后的首次运行')
    await shot('after-confirm-progress')
    const rounds = () => { const f = join(lib.path, '_pipeline', 'rounds.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)) : [] }
    await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'idle')
    for (let i = 0; i < 50 && rounds().length === 0; i++) await s.page.waitForTimeout(100)
    assert.equal(rounds().length, 1, 'the first update ran once')
    assert.equal(rounds()[0].kind, 'update')
    const log = readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
    assert.match(log, /schedule: a confirmed build card: \S+ queued/)
    assert.match(log, /build: first update of \S+: \{"queued":true,"position":1\}/)
    await s.page.waitForTimeout(400)
    await shot('after-confirm-done')
    await s.page.click('[data-panel-tab="decide"]')
  })

  test('A2 / B3: 改建库卡 — before / after against the library\'s card; the card file the same until 确认 (and after 不改了); then the new one with its history', async () => {
    const lib = await s.page.evaluate(() => window.streams.getAppState().then(a => a.data.library))
    const file = join(lib.path, '_card', 'card.json')
    const before = hashOf(file)
    await s.page.click('[data-action="change-card"] button')
    await ready(s.page, 'build')
    assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.mode), 'edit')
    assert.ok((await s.page.evaluate(() => document.querySelector('main h2').textContent)).includes('中国电动车'))
    const changed = CARD({ rhythm: '每天一次', collect: ['月度销量和交付', '价格战', '出海'] })
    setReplies([card(changed)])
    await s.page.fill('textarea[data-field="opener"]', '加上出海')
    await s.page.click('[data-action="start"] button')
    await talkIdle()
    let cs = await cards()
    assert.deepEqual([cs[0].can, cs[0].changes], ['true', ['collect']])
    assert.ok(cs[0].changeText.includes('和这座库现在的卡比'), cs[0].changeText)
    assert.equal(hashOf(file), before, 'not confirmed: the same card file')
    await looks('edit')
    await s.page.click('[data-action="drop"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null)
    assert.equal(hashOf(file), before, '不改了: the same card file')
    setReplies([card(changed)])
    await s.page.fill('textarea[data-field="opener"]', '加上出海')
    await s.page.click('[data-action="start"] button')
    await talkIdle()
    const roundsBefore = readFileSync(join(lib.path, '_pipeline', 'rounds.jsonl'), 'utf8')
    await s.page.click('[data-action="confirm"] button')
    await ready(s.page, 'sources')
    assert.notEqual(hashOf(file), before)
    assert.deepEqual(readCard(lib.path).collect, changed.collect)
    assert.equal(readdirSync(join(lib.path, '_card', 'history')).length, 2)
    // 1.1 W10: a changed card runs no update
    await s.page.waitForTimeout(1500)
    assert.equal(readFileSync(join(lib.path, '_pipeline', 'rounds.jsonl'), 'utf8'), roundsBefore, 'no update after a changed card')
  })

  test('trouble: a failed turn says so with 再试一次 (and 去设置 for the sign-in); a build over its budget, or sent back twice unreadable, stops with 重新开始', async () => {
    setReplies([{ ok: false, code: 'login-expired' }, q('拿来做什么？')])
    await s.page.click('[data-action="add-library"]')
    await ready(s.page, 'build')
    await s.page.fill('textarea[data-field="opener"]', '跟踪储能')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('[data-part="trouble"]') !== null)
    assert.deepEqual(await s.page.evaluate(() => ({ code: document.querySelector('[data-part="trouble"]').dataset.code, retry: Boolean(document.querySelector('[data-part="trouble"] [data-action="retry"]')), settings: Boolean(document.querySelector('[data-part="trouble"] [data-action="go-settings"]')) })), { code: 'login-expired', retry: true, settings: true })
    await shot('trouble')
    await s.page.click('[data-part="trouble"] [data-action="retry"] button')
    await talkIdle()
    assert.equal(await s.page.$('[data-part="trouble"]'), null)
    assert.equal((await shownQuestions()).length, 1)
    await s.page.click('[data-row="agent"] ~ * [data-action="drop"] button').catch(() => {})
    await s.page.evaluate(() => window.streams.dropBuild())
    await s.page.evaluate(() => window.streams.getBuild())
    // over the budget
    setReplies([{ json: { say: '', question: { text: '拿来做什么？', kind: 'input' } }, searches: Array.from({ length: 26 }, (_, i) => `词 ${i}`) }])
    await s.page.click('[data-action="add-library"]')
    await s.page.reload()
    await ready(s.page, 'inbox')
    await s.page.click('[data-action="add-library"]')
    await ready(s.page, 'build')
    await s.page.fill('textarea[data-field="opener"]', '跟踪储能')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('[data-part="stopped"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="stopped"]').dataset.code), 'over-budget')
    assert.equal(await s.page.$('textarea[data-field="message"]'), null, 'nothing more can be said')
    await s.page.click('[data-action="restart"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null)
    assert.equal(await s.page.inputValue('textarea[data-field="opener"]'), '跟踪储能', 'the sentence again, to start over')
    // unreadable twice
    setReplies([{ text: '不是 JSON' }, { text: '还不是' }])
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('[data-part="stopped"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="stopped"]').dataset.code), 'bad-format')
    await s.page.click('[data-action="restart"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null)
  })

  test('keep: the conversation is there after leaving the page, and after the app is shut and opened again; it goes on', async () => {
    setReplies([q('拿来做什么？'), q('多久看一次？', 'single', ['每天', '每周'])])
    await s.page.fill('textarea[data-field="opener"]', '跟踪光伏')
    await s.page.click('[data-action="start"] button')
    await talkIdle()
    await s.page.click('[data-library-row]')
    await until(() => document.querySelector('main[data-screen="build"]') === null)
    await s.page.click('[data-action="add-library"]')
    await talkIdle()
    assert.equal((await shownQuestions()).length, 1, 'back on the page: the conversation')
    await closeApp(s.app, { userDataDir: join(s.world.appData, 'electron') })
    // the test helper writes settings.json at each launch: the same settings again (the app's own state, build.json, is left)
    const again = await launch(s.world, { settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' }, env: { STREAMS_DEV_LIBRARY: s.world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: replies, STREAMS_DEV_LIBRARY_ROOT: join(s.world.root, 'new-libs'), STREAMS_START_SCREEN: 'build', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) } })
    s.app = again.app
    s.page = again.page
    await talkIdle()
    assert.deepEqual((await shownQuestions()).map(x => x.n), [1], 'after a restart: the conversation')
    await say('研究')
    const logTail = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8').split(/\r?\n/).filter(l => /build/.test(l)).slice(-6).join(' | ')
    assert.deepEqual((await shownQuestions()).map(x => x.n), [1, 2], `it went on with the next reply: ${logTail()}`)
    await s.page.evaluate(() => window.streams.dropBuild())
  })

  test('no page error in the run', () => {
    assert.deepEqual(s.errors.filter(e => !/favicon/.test(e)), [])
  })
})

// ---- E5: the app started in English ----
describe('W6b in English (E5)', () => {
  let repliesEn = null
  const e = worldSession({
    kind: 'empty',
    waitFor: 'build',
    prepare: world => {
      repliesEn = join(world.root, 'build-replies.json')
      writeFileSync(repliesEn, JSON.stringify({ replies: [
        q('What will you use it for?', 'input', [], 'I had a look first.'),
        q('Which of these should it follow too?', 'multi', ['Other new makers', 'Battery makers']),
        card({ ...CARD(), name: 'EVs in China', definition: { summary: 'A library for research on electric cars in China.', purpose: 'Research', scope: 'Car and battery makers; EVs; China; large', exclude: 'Blogs', trust: 'Company filings', rhythm: 'Weekly', language: 'English', hard: 'A first-hand source' }, decide: [{ what: 'Take Leapmotor', default: 'yes' }], collect: ['Monthly sales'], skip: ['Rumours'], sources: [{ name: 'Source A', url: A, status: 'readable' }], unreadable: [{ name: 'An association', url: C, reason: 'sign-in' }], pick: ['Newest first'], write: ['Give the numbers'], samples: [{ title: 'A sample', url: B, date: '2026-11-20' }] }, [A, B, C], 'Here is the library card.'),
      ] }))
    },
    settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, language: 'en' },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: repliesEn, STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), STREAMS_START_SCREEN: 'build', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
  })
  const untilE = fn => e.page.waitForFunction(fn, null, POLL)
  const noChinese = async where => {
    const text = await e.page.evaluate(() => {
      const main = document.querySelector('main').cloneNode(true)
      for (const x of main.querySelectorAll('textarea')) x.remove()
      const ph = [...document.querySelectorAll('main [placeholder]')].map(x => x.getAttribute('placeholder')).join(' ')
      return `${main.textContent} ${ph} ${document.querySelector('aside')?.textContent ?? ''}`
    })
    assert.equal(CJK.test(text), false, `${where}: ${text.match(new RegExp(`.{0,20}${CJK.source}.{0,20}`))?.[0]}`)
  }
  test('the start page, a question, a card: no Chinese anywhere', async () => {
    await noChinese('start')
    if (SHOTS) await e.page.screenshot({ path: join(SHOTS, 'en-start.png') })
    await e.page.fill('textarea[data-field="opener"]', 'Follow the EV industry in China')
    await e.page.click('[data-action="start"] button')
    await untilE(() => document.querySelector('[data-part="question"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    await e.page.fill('textarea[data-field="message"]', 'Research')
    await e.page.click('[data-action="send"] button')
    await untilE(() => document.querySelector('[data-part="question"][data-n="2"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    await noChinese('question')
    await e.page.click('[data-option="Battery makers"]')
    await e.page.click('[data-action="answer"] button')
    await untilE(() => document.querySelector('article[data-part="build-card"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    assert.equal(await e.page.evaluate(() => [...document.querySelectorAll('[data-row="you"]')].at(-1).textContent), 'I picked: Battery makers')
    await e.page.click('[data-action="full"] button')
    await noChinese('card')
    if (SHOTS) await e.page.screenshot({ path: join(SHOTS, 'en-card.png') })
  })
})

// the words of the page come from the two tables (a key the English lacks is caught by test/texts-en.test.mjs)
test('BUILD: what the page says of each problem and part is in the table', () => {
  for (const k of ['missing-part', 'missing-line', 'not-read', 'too-many-decisions', 'no-name', 'bad-entry', 'other']) assert.ok(BUILD.problems[k], k)
  for (const k of ['over-budget', 'too-many-turns', 'other-tool', 'session-lost', 'bad-format']) assert.ok(BUILD.stopped[k], k)
})
