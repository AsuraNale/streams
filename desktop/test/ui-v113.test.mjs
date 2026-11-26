// 1.1.3 in the real window (维护者 11-26 「每个库对应一个 session」 and the right-click menus; 赞妮's plan 对话与右键菜单-方案.md and
// her mock; 维护者 「按改后的建议」, 第 5 项第二步 「做，开工」): 维护者's own situation after the upgrade (plan 10.2) — the 新建库
// conversation where the agent only replied is a row of 未建成 with 放弃建库 in its head, his library's conversation takes his
// words at once; the one-time note; 停止处理 gives the words back; another conversation's words wait (等待主 Agent · 第 1 位)
// and start by themselves; the right panel's cards, the one of where you are first; a change whose library's card changed
// since cannot be confirmed; the menus of a conversation, a card, a row of 进度 and a library. The fake connection and a
// scripted main agent, a script per conversation (services/build.mjs devBuildSession: byLibrary, byOpener).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeCard } from '../src/main/core.mjs'
import { worldSession } from './support/seed.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const A = 'https://example-a.test/list'
const B = 'https://example-b.test/samples/1'
const CARD = (name = '中国电动车', o = {}) => ({
  name,
  definition: { summary: '一座测试库。', purpose: '行业研究', scope: '对象：车企；行业：电动车；地域：中国；规模：大中型', exclude: '自媒体', trust: '公司公告为准', rhythm: '每周一次', language: '中文', hard: '一手出处' },
  decide: [], collect: o.collect ?? ['月度销量'], skip: ['传闻'], sources: [{ name: '甲来源', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
})
const reads = [A, B].map(url => ({ url, ok: true }))
const question = (text, extra = {}) => ({ json: { say: '', question: { text, kind: 'input', options: [] } }, ...extra })
const card = (c, extra = {}) => ({ json: { say: '请看卡', card: c }, reads, ...extra })
const OPENER = '一人独立站那个库，我觉得东西不够全，可以多帮我找一点吗？'

let script = null
let world = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: w => {
    world = w
    script = join(w.root, 'build-script.json')
    writeFileSync(script, JSON.stringify({ replies: [question('?')] }))
    writeCard(w.library, CARD('library'))
    const dir = join(w.appData, 'build')
    mkdirSync(dir, { recursive: true })
    // the library's build, as 1.1.2 kept it (found by the folder it made)
    const built = [{ role: 'user', text: '帮我跟踪中国电动车', at: '2026-11-25T17:32:00.000Z' }, { role: 'agent', kind: 'card', say: '请看卡', card: CARD('library'), at: '2026-11-25T17:40:00.000Z' }]
    writeFileSync(join(dir, 'ended-2026-11-25T17-41-00-000Z-built.json'), JSON.stringify({ v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', opener: '帮我跟踪中国电动车', status: 'built', turns: built, asked: [], reads: [], searches: [], calls: 1, card: null, pendingId: null, libraryDir: w.library, edit: null, convert: null } }))
    // 维护者's: a 新建库 conversation of 1.1.1, where the agent only replied, still going (docs/feedback/2026-11-26-maintainer-1.1.3-sessions.md)
    const stuck = [
      { role: 'user', text: OPENER, at: '2026-11-25T19:09:00.000Z' },
      { role: 'agent', kind: 'say', say: '这是新建库的对话，我看不到已有的库。', at: '2026-11-25T19:10:00.000Z' },
      { role: 'user', text: '放弃对话', at: '2026-11-27T02:51:00.000Z' },
      { role: 'agent', kind: 'say', say: '好的，这次就到这里，我什么都没改', at: '2026-11-27T02:51:30.000Z' },
    ]
    writeFileSync(join(dir, 'build.json'), JSON.stringify({ v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', opener: OPENER, sessionId: 'old', status: 'talking', turns: stuck, asked: [], reads: [], searches: [], calls: 2, card: null, pendingId: null, libraryDir: null, edit: null, convert: null, extra: '' }, stopped: null, trouble: null, retry: null }))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: w => ({ STREAMS_DEV_LIBRARY: w.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: script, STREAMS_DEV_LIBRARY_ROOT: join(w.root, 'new-libs'), STREAMS_START_SCREEN: 'inbox' }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const setScript = x => writeFileSync(script, JSON.stringify({ replies: [question('?')], ...x }))
const rows = () => s.page.evaluate(() => [...document.querySelectorAll('nav[data-part="conversations"] [data-conv]')].map(r => ({ id: r.dataset.conv, state: r.dataset.state, group: r.closest('[data-conv-group]')?.dataset.convGroup, title: r.querySelector('b').textContent, line: r.querySelector('[data-part="conv-line"]').textContent, mark: r.querySelector('[data-mark]')?.dataset.mark ?? null, current: r.getAttribute('aria-current') })))
const menuItems = () => s.page.evaluate(() => [...document.querySelectorAll('[data-menu] [data-menu-item]')].map(b => [b.dataset.menuItem, b.textContent, b.disabled]))
const closeMenu = async () => { await s.page.keyboard.press('Escape'); await until(() => document.querySelector('[data-menu]') === null) }
let lib = null

describe('1.1.3 主 Agent 的多段对话与右键菜单', () => {
  test('10.2: 主 Agent opens the one active last — 维护者\'s, a row of 未建成 (主 Agent 已回复), 放弃建库 in its head; his library a row of 我的库; the one-time note', async () => {
    await s.page.click('.st-sidebar [data-nav="chat"]')
    await until(() => document.querySelector('main[data-screen="build"][data-view="talk"][data-conv="new:build"]') !== null)
    const r = await rows()
    const stuck = r.find(x => x.id === 'new:build')
    lib = r.find(x => x.group === 'libraries').id
    assert.deepEqual([stuck.group, stuck.state, stuck.current, stuck.mark], ['unbuilt', 'replied', 'page', null])
    assert.equal(stuck.title, OPENER)
    assert.match(stuck.line, /^主 Agent 已回复 · /)
    assert.match(r.find(x => x.id === lib).line, /^建库 · 已确认 · /)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="drop-open"] button')?.textContent), '放弃建库')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="other-going"], [data-action="to-going"]')), null, '「另一段对话正在进行」 is gone')
    assert.match(await s.page.evaluate(() => document.querySelector('[data-part="organised"]')?.textContent ?? ''), /对话已按库整理：每座库一段。尚未建成库的对话列在「未建成」。/)
    await s.page.click('[data-action="organised-ok"] button')
    await until(() => document.querySelector('[data-part="organised"]') === null)
    assert.equal(existsSync(join(world.appData, 'build', 'organised.json')), true)
  })

  test('10.2: his library\'s conversation takes his words at once — 历史记录 above, no 开始 page; the words open a change with the line that says what the agent was given', async () => {
    setScript({ byLibrary: { [lib.slice(4)]: [question('要多找哪方面的内容？'), question('还有吗？', { holdMs: 60_000 }), question('明白了，再说说？')] } })
    await s.page.click(`nav[data-part="conversations"] [data-conv="${lib}"] .st-conv__main`)
    await until(arg => document.querySelector(`main[data-screen="build"][data-conv="${arg}"][data-conv-state="idle"]`) !== null, lib)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="start"]')), null, 'no 开始 page')
    assert.match(await s.page.evaluate(() => document.querySelector('.st-earlier__head')?.textContent), /^历史记录$/)
    assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="message"]').placeholder), '告诉主 Agent 要修改的内容，例如：内容不够多，请多找一些。')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="drop-open"]')), null, 'nothing open: no 放弃')
    await s.page.fill('textarea[data-field="message"]', '东西不够全，多帮我找一点')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-conv-state="question"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="handed-over"]')?.textContent), '已将建库卡和历史记录的要点交给主 Agent。')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="drop-open"] button')?.textContent), '放弃修改')
  })

  test('停止处理: the agent working, the box can be typed in and only sending waits; stopped, the words are back in the box and the question is open again', async () => {
    await s.page.fill('textarea[data-field="message"]', '主要是选品')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-action="stop-turn"] button') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="message"]').disabled), false, 'the box can be typed in')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="send"] button').disabled), true)
    assert.equal((await rows()).find(x => x.id === lib).state, 'working')
    await s.page.click('[data-action="stop-turn"] button')
    await until(() => document.querySelector('[data-part="gave-back"][data-note="stopped"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="gave-back"]').textContent), '已停止处理。上一条消息未发送，已放回输入框。')
    assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="message"]').value), '主要是选品')
    assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.convState), 'question')
    // sent again: a new session told the record (services); here the next reply comes
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-conv-state="question"]') !== null && document.querySelector('[data-part="gave-back"]') === null)
  })

  test('放弃建库 on 维护者\'s conversation: confirmed in the app\'s dialog, the row leaves the column', async () => {
    await s.page.click('nav[data-part="conversations"] [data-conv="new:build"] .st-conv__main')
    await until(() => document.querySelector('main[data-screen="build"][data-conv="new:build"]') !== null)
    await s.page.click('[data-action="drop-open"] button')
    await until(() => document.querySelector('dialog[data-dialog="drop-open"]') !== null)
    const d = await s.page.evaluate(() => { const x = document.querySelector('dialog[data-dialog="drop-open"]'); return [x.querySelector('h2').textContent, x.querySelector('[data-part="drop-text"]').textContent, x.querySelector('[data-action="drop-confirm"] button').textContent] })
    assert.deepEqual(d, ['放弃建库？', '这段对话将从列表中移除，不会创建任何内容。', '放弃建库'])
    await s.page.click('dialog[data-dialog="drop-open"] [data-action="drop-confirm"] button')
    await until(() => document.querySelector('nav[data-part="conversations"] [data-conv="new:build"]') === null && document.querySelector('[data-conv-group="unbuilt"]') === null)
    assert.ok(readdirSync(join(world.appData, 'build')).some(n => /^ended-.*-dropped\.json$/.test(n)))
  })

  test('one at a time: a new library\'s conversation shows as soon as it starts; the library\'s words then wait (等待主 Agent · 第 1 位) and start by themselves', async () => {
    setScript({ byLibrary: { [lib.slice(4)]: [question('要多找哪方面的内容？'), question('?'), question('?'), card(CARD('library', { collect: ['月度销量', '价格战'] }))] }, byOpener: { 甲: [card(CARD('甲库'), { holdMs: 5000 })], 乙: [card(CARD('乙库'))] } })
    await s.page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="new-hint"]')?.textContent), '要修改已有的库，请在左侧选择该库的对话。')
    await s.page.fill('textarea[data-field="opener"]', '甲：跟踪光伏')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="talk"][data-kind="unbuilt"][data-conv-state="working"]') !== null)
    await s.page.click(`nav[data-part="conversations"] [data-conv="${lib}"] .st-conv__main`)
    await until(arg => document.querySelector(`main[data-screen="build"][data-conv="${arg}"]`) !== null, lib)
    await s.page.fill('textarea[data-field="message"]', '那就加上价格战')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-part="waiting-row"] [data-action="leave-queue"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="waiting"]').textContent.trim().startsWith('等待主 Agent：正在处理其他对话，轮到后自动开始。')), true)
    const w = (await rows()).find(x => x.id === lib)
    assert.deepEqual([w.state, w.line, w.mark], ['waiting', '等待主 Agent · 第 1 位', 'hollow'])
    await until(() => document.querySelector('main[data-screen="build"][data-conv-state="card"]') !== null)
    // the new library's card waits too, and its row says so with the accent mark
    const a = (await rows()).find(x => x.title === '甲库')
    assert.deepEqual([a.state, a.mark], ['card', 'accent'])
    assert.ok(await s.page.evaluate(() => document.querySelector('.st-sidebar [data-attention="chat"]') !== null), 'the sidebar\'s 主 Agent has its dot')
  })

  test('右栏「待确认」: every card, the one of where you are first (当前库), the others the one waiting longest; 「{when} 提交」; 菜单三', async () => {
    await s.page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
    await s.page.fill('textarea[data-field="opener"]', '乙：跟踪储能')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-kind="unbuilt"][data-conv-state="card"]') !== null)
    await s.page.click(`nav[data-part="conversations"] [data-conv="${lib}"] .st-conv__main`)
    await until(arg => document.querySelector(`main[data-screen="build"][data-conv="${arg}"]`) !== null, lib)
    await s.page.click('[data-panel-tab="decide"]')
    await until(() => document.querySelectorAll('article[data-part="build-waiting"]').length === 3)
    const cards = await s.page.evaluate(() => [...document.querySelectorAll('article[data-part="build-waiting"]')].map(a => [a.querySelector('[data-part="sentence"]').textContent, a.dataset.here ?? null, a.querySelector('[data-part="here"]')?.textContent ?? null, Boolean(a.querySelector('[data-part="submitted"]'))]))
    assert.deepEqual(cards.map(c => c.slice(0, 3)), [['修改后的建库卡：library', 'true', '当前库'], ['建库卡：甲库', null, null], ['建库卡：乙库', null, null]])
    assert.ok(cards.every(c => c[3]))
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-panel-badge="decide"]')?.textContent), '3')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="decide-lead"]').textContent), '待确认的建库卡：3 张。确认之前不会创建或修改任何内容。')
    // 菜单三 of a new library's card: no 打开此库
    await s.page.click('article[data-part="build-waiting"]:nth-of-type(2) [data-action="card-more"] button')
    await until(() => document.querySelector('[data-menu]') !== null)
    assert.deepEqual((await menuItems()).map(m => m[0]), ['full', 'drop'])
    await closeMenu()
    await s.page.click('article[data-part="build-waiting"][data-here="true"] [data-action="card-more"] button')
    await until(() => document.querySelector('[data-menu]') !== null)
    assert.deepEqual(await menuItems(), [['full', '查看完整建库卡', false], ['open-library', '打开此库', false], ['drop', '放弃修改', false]])
    await closeMenu()
    assert.equal(await s.page.evaluate(() => document.activeElement?.closest('[data-action="card-more"]') !== null), true, 'the focus is back on 「更多」')
  })

  test('菜单一 / 菜单二 by right click: hidden and greyed as plan 9.2–9.3 say', async () => {
    await s.page.click(`nav[data-part="conversations"] [data-conv="${lib}"]`, { button: 'right' })
    await until(() => document.querySelector('[data-menu]') !== null)
    assert.deepEqual(await menuItems(), [['view-card', '查看建库卡', false], ['open-library', '打开此库', false], ['stop', '停止处理', true], ['drop', '放弃修改', false]])
    await closeMenu()
    const a = (await rows()).find(x => x.title === '甲库')
    await s.page.click(`nav[data-part="conversations"] [data-conv="${a.id}"]`, { button: 'right' })
    await until(() => document.querySelector('[data-menu]') !== null)
    assert.deepEqual(await menuItems(), [['stop', '停止处理', true], ['drop', '放弃建库', false]])
    await closeMenu()
  })

  test('改卡的卡过期: the library\'s step changed after the change started — its card cannot be confirmed, here and on the right', async () => {
    await s.page.click('.st-sidebar [data-library-row]')
    await s.page.click('nav.st-lib-tabs button[data-tab="sources"]')
    await until(() => document.querySelector('section[data-part="volume"] [data-volume="most"]:not([disabled])') !== null)
    await s.page.click('section[data-part="volume"] [data-volume="most"]')
    await until(() => document.querySelector('[data-part="volume-note"][data-kind="saved"]') !== null)
    await until(() => document.querySelector('article[data-part="build-waiting"][data-stale="true"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('article[data-part="build-waiting"][data-stale="true"] [data-action="confirm"] button').disabled), true)
    assert.match(await s.page.evaluate(() => document.querySelector('article[data-part="build-waiting"][data-stale="true"] [data-part="stale"]').textContent), /这座库的建库卡在这次修改开始之后已有改动/)
    await s.page.click('article[data-part="build-waiting"][data-stale="true"] [data-action="full"] button')
    await until(() => document.querySelector('article[data-part="build-card"][data-last="true"] [data-part="card-problems"][data-stale="true"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('article[data-part="build-card"][data-last="true"] [data-action="confirm"]')), null)
    assert.equal((await rows()).find(x => x.id === lib).state, 'card-blocked')
  })

  test('菜单五: a library of the sidebar by right click — 与主 Agent 对话 opens its conversation', async () => {
    await s.page.click('.st-sidebar [data-library-row]', { button: 'right' })
    await until(() => document.querySelector('[data-menu]') !== null)
    const items = (await menuItems()).map(m => m[0])
    assert.deepEqual(items.filter(i => !i.startsWith('schedule')), ['talk', 'run-now', 'reveal', 'remove'])
    await s.page.click('[data-menu] [data-menu-item="talk"]')
    await until(arg => document.querySelector(`main[data-screen="build"][data-conv="${arg}"]`) !== null, lib)
  })

  test('入口: 有新内容 — a reply that came while elsewhere marks its row until it is opened; words brought from 问库 go after what is in the box; 新建库 says how many are not built yet, 查看 opens one', async () => {
    // 有新内容: a new library's reply arrives while the library's conversation is shown
    setScript({ byOpener: { 丙: [question('丙：拿来做什么？', { holdMs: 5000 })] } })
    await s.page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
    await until(() => document.querySelector('[data-part="unbuilt-hint"]') !== null)
    assert.match(await s.page.evaluate(() => document.querySelector('[data-part="unbuilt-hint"]').textContent), /^有 2 段未建成的对话。/)
    await s.page.fill('textarea[data-field="opener"]', '丙：跟踪芯片')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-kind="unbuilt"][data-conv-state="working"]') !== null)
    const c = await s.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.conv)
    await s.page.click(`nav[data-part="conversations"] [data-conv="${lib}"] .st-conv__main`)
    try { await until(arg => document.querySelector(`nav[data-part="conversations"] [data-conv="${arg}"][data-state="question"][data-new="true"]`) !== null, c) } catch (err) { throw new Error(`${err.message} ${c} ${JSON.stringify(await rows())}`) }
    assert.equal((await rows()).find(x => x.id === c).mark, 'accent')
    await s.page.click(`nav[data-part="conversations"] [data-conv="${c}"] .st-conv__main`)
    await until(arg => document.querySelector(`nav[data-part="conversations"] [data-conv="${arg}"]:not([data-new])`) !== null, c)
    // 查看 on the 新建库 page opens the newest one not built yet
    await s.page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
    await until(() => document.querySelector('[data-action="view-unbuilt"] button') !== null)
    await s.page.click('[data-action="view-unbuilt"] button')
    await until(arg => document.querySelector(`main[data-screen="build"][data-conv="${arg}"]`) !== null, c)
    // words brought from 问库 go after what is in the library's box, on a new line (plan 第五节)
    await s.page.click(`nav[data-part="conversations"] [data-conv="${lib}"] .st-conv__main`)
    await until(arg => document.querySelector(`main[data-screen="build"][data-conv="${arg}"]`) !== null, lib)
    await s.page.fill('textarea[data-field="message"]', '先记下这一句')
    await s.page.click('.st-sidebar [data-library-row]')
    await s.page.click('nav.st-lib-tabs button[data-tab="ask"]')
    await until(() => document.querySelector('textarea[data-field="question"]') !== null)
    await s.page.fill('textarea[data-field="question"]', '固态电池最近有什么进展？')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-part="to-agent"] [data-action="to-agent"] button') !== null)
    await s.page.click('[data-part="to-agent"] [data-action="to-agent"] button')
    await until(arg => document.querySelector(`main[data-screen="build"][data-conv="${arg}"] textarea[data-field="message"]`) !== null, lib)
    assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="message"]').value), '先记下这一句\n固态电池最近有什么进展？')
    assert.deepEqual(s.errors, [])
  })
})
