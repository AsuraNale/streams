// 1.1.2 第 4、5 件 in the real window (维护者 11-25; 赞妮's mocks 04, 05, 06): 来源与要求's 「每次更新的量」 (three steps, saved at
// once, the hint when the last update came near its limit — and none when it did not), the card's count line (U3), the head's
// dot when the schedule is not the card's rhythm (U6); 设置's default step; 主 Agent's column of conversations, a library's
// earlier conversations above its box and above the conversation once it goes on, a step proposed on the card shown among the
// changes and written on 确认 only; 问库's 「请主 Agent 补充资料」 (U4) puts the question in the library's box, not sent; with the
// system's reduce-motion on, switching conversations does not animate. The fake connection and a scripted main agent.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readLibraryVolume, writeCard } from '../src/main/core.mjs'
import { worldSession } from './support/seed.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const A = 'https://example-a.test/list'
const B = 'https://example-b.test/samples/1'
const CARD = (o = {}) => ({
  name: '中国电动车',
  definition: { summary: '一座跟踪中国电动车的库。', purpose: '行业研究', scope: '对象：车企；行业：电动车；地域：中国；规模：大中型', exclude: '自媒体', trust: '公司公告为准', rhythm: '每周一次', language: '中文', hard: '一手出处' },
  decide: [], collect: ['月度销量'], skip: ['传闻'], sources: [{ name: '甲来源', url: A, status: '读得到' }], unreadable: [],
  pick: o.pick ?? ['新的先收', '每次控制在 3 到 8 条，宁少勿滥'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }], ...(o.volume ? { volume: o.volume } : {}),
})
// the user case's last update: 19 of 20 reads, one source not read for the limit
const NEAR = { id: 'u-near', kind: 'update', startedAt: '2026-11-25T19:00:47.809Z', finishedAt: '2026-11-25T19:04:21.471Z', status: 'done', volume: 'standard', budget: { sources: 30, newLinks: 20, searches: 8, reads: 20, items: 30 },
  counts: { sources: 1, read: 1, unreadable: 0, newLinks: 0, originals: 0, missing: 0, carried: 0, items: 0, inbox: 0, dropped: 0 }, unfinished: [], calls: 1,
  agent: { searches: 3, reads: 19, sources: [{ url: 'https://example-a.test/editions', status: '这次没读（用量不够）' }], gaps: [] } }
const FAR = { ...NEAR, id: 'u-far', startedAt: '2026-11-25T20:00:00.000Z', agent: { ...NEAR.agent, reads: 5, sources: [{ url: A, status: '读得到但没有新东西' }] } }

let replies = null
let world = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: w => {
    world = w
    replies = join(w.root, 'build-replies.json')
    writeFileSync(replies, JSON.stringify({ replies: [] }))
    writeCard(w.library, CARD())
    mkdirSync(join(w.library, '_pipeline'), { recursive: true })
    appendFileSync(join(w.library, '_pipeline', 'rounds.jsonl'), JSON.stringify(NEAR) + '\n')
    // an earlier conversation of this library (as 1.1.2 keeps one: built, the folder it made)
    mkdirSync(join(w.appData, 'build'), { recursive: true })
    const turns = [{ role: 'user', text: '帮我跟踪中国电动车', at: '2026-11-25T18:32:22.171Z' }, { role: 'agent', kind: 'question', say: '', question: { n: 1, text: '你拿来做什么？', kind: 'input', options: [], other: false }, at: '2026-11-25T18:32:43Z' }, { role: 'user', text: '行业研究', at: '2026-11-25T18:33:00Z' }, { role: 'agent', kind: 'card', say: '请看卡', card: CARD(), at: '2026-11-25T18:40:00Z' }]
    writeFileSync(join(w.appData, 'build', 'ended-2026-11-25T19-00-47-804Z-built.json'), JSON.stringify({ v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', opener: '帮我跟踪中国电动车', status: 'built', turns, asked: [{ n: 1 }], reads: [], searches: [], calls: 2, card: null, pendingId: null, libraryDir: w.library, edit: null, convert: null } }))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: w => ({ STREAMS_DEV_LIBRARY: w.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: replies, STREAMS_DEV_LIBRARY_ROOT: join(w.root, 'new-libs'), STREAMS_START_SCREEN: 'inbox' }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const setReplies = r => writeFileSync(replies, JSON.stringify({ replies: r }))
const toSources = async () => { await s.page.click('nav.st-lib-tabs button[data-tab="sources"]'); await until(() => document.querySelector('section[data-part="volume"] [data-volume="standard"]:not([disabled])') !== null) }
const steps = () => s.page.evaluate(() => [...document.querySelectorAll('section[data-part="volume"] [data-volume]')].map(b => [b.dataset.volume, b.getAttribute('aria-checked')]))

describe('1.1.2 第 4、5 件', () => {
  test('第 4 件: three steps, standard first; the near-limit line with its numbers; a step saved at once (streams.json); far from the limit, no line; the card\'s count line (U3)', async () => {
    await toSources()
    assert.deepEqual(await steps(), [['standard', 'true'], ['more', 'false'], ['most', 'false']])
    const near = await s.page.evaluate(() => { const n = document.querySelector('[data-part="volume-near"]'); return n ? [n.dataset.reads, n.dataset.limit, n.dataset.unread, n.textContent.trim()] : null })
    assert.deepEqual(near.slice(0, 3), ['19', '20', '1'])
    assert.match(near[3], /^上次更新读网页 19 \/ 20 次，已接近上限，有 1 个来源未读取。 调高一档可读取更多来源。$/)
    assert.match(await s.page.evaluate(() => document.querySelector('[data-part="volume-cost"]').textContent), /量越大，单次更新耗时越长/)
    assert.match(await s.page.evaluate(() => document.querySelector('[data-part="card-count-limit"]')?.textContent ?? ''), /「每次控制在 3 到 8 条」/)
    await s.page.click('section[data-part="volume"] [data-volume="more"]')
    await until(() => document.querySelector('[data-part="volume-note"][data-kind="saved"]') !== null)
    assert.deepEqual(await steps(), [['standard', 'false'], ['more', 'true'], ['most', 'false']])
    assert.equal(readLibraryVolume(world.library).volume, 'more')
    const log = readFileSync(join(world.library, '_pipeline', 'changes.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => l.field === 'volume')
    assert.deepEqual(log.map(l => [l.by, l.before, l.after]), [['you', 'standard', 'more']])
    // an update far from its limit: no line (what would fail it: the line shown for any last update)
    appendFileSync(join(world.library, '_pipeline', 'rounds.jsonl'), JSON.stringify(FAR) + '\n')
    await s.page.click('section[data-part="volume"] [data-volume="most"]')
    await until(() => document.querySelector('section[data-part="volume"] [data-volume="most"][aria-checked="true"]') !== null && document.querySelector('[data-part="volume-near"]') === null)
    assert.equal(readLibraryVolume(world.library).volume, 'most')
  })

  test('U6: the head\'s next run has a dot while the schedule is not the card\'s rhythm; 按建库卡设置定时 takes it away', async () => {
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="next-run"]')?.dataset.offRhythm), 'true')
    assert.ok(await s.page.evaluate(() => document.querySelector('[data-part="next-run-dot"]') !== null))
    await s.page.click('[data-part="run-mismatch"] [data-action="to-rhythm"] button')
    await until(() => document.querySelector('[data-part="run-mismatch"]') === null && document.querySelector('[data-part="next-run-dot"]') === null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="next-run"]')?.dataset.offRhythm), 'false')
  })

  test('设置: 新建库的默认更新量 — standard, then 最多 saved to settings.json', async () => {
    await s.page.click('.st-sidebar__footer-button')
    await until(() => document.querySelector('select[data-field="default-volume"]:not([disabled])') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('select[data-field="default-volume"]').value), 'standard')
    await s.page.selectOption('select[data-field="default-volume"]', 'most')
    await until(() => document.querySelector('[data-volume-note="saved"]') !== null)
    const file = JSON.parse(readFileSync(join(world.appData, 'settings.json'), 'utf8'))
    assert.equal(file.defaultVolume, 'most')
  })

  test('第 5 件: 主 Agent\'s column lists the library with its conversation; opened, the earlier one is above the box (folded, opened in place)', async () => {
    await s.page.click('.st-sidebar [data-nav="chat"]')
    await until(() => document.querySelector('nav[data-part="conversations"] [data-conv-library]') !== null)
    const row = await s.page.evaluate(() => { const r = document.querySelector('nav[data-part="conversations"] [data-conv-library]'); return [r.dataset.n, r.textContent] })
    assert.equal(row[0], '1')
    assert.match(row[1], /中国电动车|library/)
    await s.page.click('nav[data-part="conversations"] [data-conv-library]')
    await until(() => document.querySelector('main[data-screen="build"][data-mode="edit"][data-view="start"] [data-part="earlier"] [data-earlier]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('nav[data-part="conversations"] [data-conv-library]').getAttribute('aria-current')), 'page')
    assert.match(await s.page.evaluate(() => document.querySelector('#build-title').textContent), /^与主 Agent 继续对话：/)
    assert.match(await s.page.evaluate(() => document.querySelector('[data-earlier] .st-earlier__line').textContent), /建库 · 1 个问题 · 1 张建库卡 · 已确认/)
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('.st-earlier__turn').length), 0, 'folded at first')
    await s.page.click('[data-earlier] [data-action="earlier-toggle"] button')
    await until(() => document.querySelectorAll('.st-earlier__turn').length > 0)
    assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('.st-earlier__turn[data-row="you"]')].map(t => t.textContent)), ['帮我跟踪中国电动车', '行业研究'])
  })

  test('第 5 件: going on — the earlier one stays above with the line that says what the agent was given; a proposed step among the changes, written on 确认 only', async () => {
    setReplies([{ json: { say: '我看了上次更新：有来源因为用量不够没读。' } }, { json: { say: '改好了，请看改前和改后。', card: CARD({ volume: 'standard', pick: ['新的先收'] }) } }])
    await s.page.fill('textarea[data-field="opener"]', '我觉得东西不够全，可以多帮我找一点吗？')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="talk"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    assert.ok(await s.page.evaluate(() => document.querySelector('[data-part="earlier"] [data-earlier]') !== null))
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="handed-over"]')?.textContent), '已将建库卡和之前对话的要点交给主 Agent，开始新的会话。')
    await until(() => document.querySelector('nav[data-part="conversations"] [data-conv="going"]') !== null)
    await s.page.fill('textarea[data-field="message"]', '那就按你说的改')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('article[data-part="build-card"][data-can-confirm="true"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    const c = await s.page.evaluate(() => { const a = document.querySelector('article[data-part="build-card"][data-last="true"]'); return { changes: [...a.querySelectorAll('[data-change]')].map(x => x.dataset.change), volume: a.querySelector('[data-part="card-volume"]')?.dataset.volume ?? null, text: a.querySelector('[data-change="volume"]')?.textContent ?? '' } })
    assert.ok(c.changes.includes('volume'), JSON.stringify(c))
    assert.match(c.text, /最多[\s\S]*标准/)
    assert.equal(c.volume, 'standard')
    assert.equal(readLibraryVolume(world.library).volume, 'most', 'nothing before 确认')
    await s.page.click('article[data-part="build-card"][data-last="true"] [data-action="confirm"] button')
    await until(() => document.querySelector('main[data-screen="sources"]') !== null)
    assert.equal(readLibraryVolume(world.library).volume, 'standard')
    assert.equal(JSON.parse(readFileSync(join(world.library, '_card', 'card.json'), 'utf8')).volume, undefined, 'the card file has no step')
  })

  test('U4: 问库 with nothing in the library — 「请主 Agent 补充资料」 opens the library\'s conversation with the question in its box, not sent', async () => {
    await s.page.click('nav.st-lib-tabs button[data-tab="ask"]')
    await until(() => document.querySelector('textarea[data-field="question"]') !== null)
    const q = '固态电池最近有什么进展？'
    await s.page.fill('textarea[data-field="question"]', q)
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-part="to-agent"] [data-action="to-agent"] button') !== null)
    await s.page.click('[data-part="to-agent"] [data-action="to-agent"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-mode="edit"][data-view="start"] textarea[data-field="opener"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="opener"]').value), q)
    assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.view), 'start', 'not sent')
    // the build and the change of the card, once the list is read
    await until(() => document.querySelectorAll('[data-part="earlier"] [data-earlier]').length === 2)
  })

  test('reduce motion: switching conversations does not animate; without it, it does', async () => {
    const animating = () => s.page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.classList?.contains('st-agent-switch')).length)
    await s.page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-mode="create"]') !== null)
    assert.ok(await animating() > 0, 'control: the switch animates')
    await s.page.emulateMedia({ reducedMotion: 'reduce' })
    await s.page.click('nav[data-part="conversations"] [data-conv-library]')
    await until(() => document.querySelector('main[data-screen="build"][data-mode="edit"]') !== null)
    assert.equal(await animating(), 0)
    await s.page.emulateMedia({ reducedMotion: 'no-preference' })
    assert.deepEqual(s.errors, [])
  })
})
