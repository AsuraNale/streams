// The v2 shell (package F; docs/checks/2026-11-05-wp-f/contract.md F1–F4; docs/desktop.md §五「界面结构」) on the running app,
// three registered libraries (test/support/seed.mjs seedShelf: the seeded one current, 「电动车」 with a brief, 「时尚」 with three
// rounds without output; all three made as v1.0 made them — core/legacy — so they have no library card):
//   - the sidebar of plan B: 库架 · 和主 Agent 聊 (its badge = the pending card) · 我的库 (each library's name — 1.1.2: no mark —, 待看
//     count from the core, the amber dot of its problem, the current one highlighted) · 新建库 · 设置; an inbox-changed of one
//     library changes that line only (control: the others keep theirs);
//   - a click on a library makes it the current one (libraries.json) and opens its 待看; the five tabs, each on that library;
//     资料库's graph view; going back to a library brings back its tab and its scroll (each library its own);
//   - 库架: one card per library with what the overview gives, the problem line, a click opens that library; the new card;
//     with no library registered, one line and two buttons;
//   - 来源与要求: this library's schedule here, who changed it in 高级设置's 变更记录;
//   - 设置: no schedule or cap to change; 「定时一览」 (each library, a click goes to its 来源与要求) and the month's use.
// Each check first shows the input that makes it fail.
// Redesign R1 (维护者 11-11 第 1、2、13 题; F10, F13; the R1 contract R1-3): the shell is the template's now — the sidebar's
// second entry is 「主 Agent」 with no number (what waits for you is counted on the right panel's 待确认 tab: the badge read here
// is [data-panel-badge="decide"], was [data-badge="chat"]); each library's line has a line under its name ([data-library-line]);
// a library's page has four tabs, 概览 is gone and a library opens on 待看 (the app too: the waits that were 'overview' are
// 'inbox'); the tabs carry the template's icons (问库's speech bubble of feedback #1 is the template's own drawing now).
// 1.1 W7b: v2's proposal cards, v1.0's brief editing, its cap and its 评分环节 are gone: nothing waits in 待确认 here (the badge
// counts only the build conversation's card), the sidebar's 主 Agent and 库架's new card open the build conversation ('build'),
// a library of the last version's 来源与要求 is read only (its notice, its brief, its sources) with its schedule.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { EVENT_CHANNEL } from '../src/main/events.mjs'
import { SHELL } from '../src/renderer/texts/shell.js'
import { SIDEBAR } from '../src/renderer/texts/common.js'
import { fmt } from '../src/renderer/lib/format.js'
import { firstSentence } from '../src/renderer/lib/libraries.js'
import { ready } from './support/app.mjs'
import { SHELF, seedShelf, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
let shelf = null
const s = worldSession({
  kind: 'seeded',
  waitFor: 'inbox',
  prepare: async world => { shelf = await seedShelf(world) },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const send = (topic, payload) => s.app.evaluate(({ BrowserWindow }, [channel, m]) => { BrowserWindow.getAllWindows()[0].webContents.send(channel, m) }, [EVENT_CHANNEL, { topic, payload }])
const rows = () => s.page.evaluate(() => [...document.querySelectorAll('[data-library-row]')].map(r => ({
  id: r.dataset.libraryRow, name: r.querySelector('.st-sidebar__lib-name')?.textContent, mark: r.querySelector('.st-lib-mark')?.textContent, color: r.querySelector('.st-lib-mark')?.dataset.color,
  badge: r.querySelector('[data-library-badge]')?.textContent ?? null, problem: r.querySelector('[data-problem]')?.dataset.problem ?? null,
  active: r.dataset.active, current: r.getAttribute('aria-current'),
})))
const badgeOf = id => s.page.evaluate(i => document.querySelector(`[data-library-row="${i}"] [data-library-badge]`)?.textContent ?? null, id)
const registryActive = () => JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8')).active
const onPage = async (screen, id) => {
  await ready(s.page, screen)
  await until(([sc, i]) => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="${sc}"][data-state="ready"]`) !== null, [screen, id])
}
const openRow = async id => s.page.click(`[data-library-row="${id}"]`)
const tab = async id => s.page.click(`.st-lib-tabs [data-tab="${id}"]`)

test('the sidebar: 新建库 · 库架 · 主 Agent (no number) · 我的库 (three lines from the registry and the core, a line under each) · 设置', async () => {
  await until(() => document.querySelectorAll('[data-library-row]').length === 3)
  const [seeded, ev, fashion] = shelf.ids
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('.st-sidebar [data-nav]')].map(a => [a.dataset.nav, a.querySelector('.st-sidebar__nav-text').textContent])),
    [['shelf', SIDEBAR.entries.shelf], ['chat', SIDEBAR.entries.chat]], 'two entries above 我的库; none of v1.0\'s nine')
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__group')?.textContent), SHELL.sidebar.mine)
  // 待看 and the problem: the core's numbers of each folder (recomputed here)
  const n = shelf.dirs.map(d => core.homeNumbers(d))
  assert.deepEqual(n.map(x => x.inbox), [4, 0, 0], 'control: only the seeded library has cards waiting')
  const got = await rows()
  assert.deepEqual(got.map(r => [r.id, r.name]), shelf.ids.map((id, i) => [id, SHELF.names[i]]))
  // 1.1.2 (维护者 11-25 第 1 件): no mark before a library's name (it had the seed's icons, SHELF.icons)
  assert.deepEqual(got.map(r => r.mark ?? null), [null, null, null], 'no library mark in the sidebar')
  assert.deepEqual(got.map(r => r.badge), ['4', null, null], 'a count only where there is one')
  assert.deepEqual(got.map(r => r.problem), ['sources', null, 'no-output'], 'the seed\'s dead source; three rounds without output')
  assert.deepEqual(got.map(r => [r.active, r.current]), [['true', 'page'], ['false', null], ['false', null]], 'the current library is highlighted on its page')
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar [data-action="add-library"]')?.textContent.trim()), SHELL.sidebar.newLibrary)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__footer-button')?.textContent.trim()), SIDEBAR.settings)
  // nothing waits for you to confirm (no build conversation going): no number on the right panel's 待确认 tab, none after 主 Agent
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-panel-badge="decide"]')), null)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-nav="chat"]').textContent.trim()), SIDEBAR.entries.chat, '主 Agent: no number after it')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-nav-count="shelf"]')?.textContent), '3', '库架: how many libraries')
  // the line under each library's name (F10): its problem, else its 待看, else 暂无待看
  const lines = await s.page.evaluate(() => [...document.querySelectorAll('[data-library-row] [data-library-line]')].map(l => [l.dataset.libraryLine, l.textContent.trim()]))
  assert.deepEqual(lines.map(l => l[0]), ['problem', 'none', 'problem'])
  assert.ok(lines[0][1].startsWith(SHELL.sidebar.problems.sources), lines[0][1])
  assert.ok(lines[1][1].startsWith(SHELL.sidebar.idle), lines[1][1])
  assert.ok(lines[2][1].startsWith(fmt(SHELL.sidebar.problems['no-output'], { n: 3 })), lines[2][1])
  assert.ok(seeded && ev && fashion)
})

test('inbox-changed with a libraryId changes that library\'s line only; the current library\'s tab badge follows its own', async () => {
  const [seeded, ev, fashion] = shelf.ids
  assert.equal(await badgeOf(ev), null, 'control: 电动车 has no count before')
  await send('inbox-changed', { libraryId: ev, count: 9 })
  await until(i => document.querySelector(`[data-library-row="${i}"] [data-library-badge]`)?.textContent === '9', ev)
  assert.equal(await badgeOf(seeded), '4', 'the current library keeps its count')
  assert.equal(await badgeOf(fashion), null, 'the third keeps none')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-tab-badge="inbox"]')?.textContent), '4', 'the tab shows the current library\'s')
  await send('inbox-changed', { libraryId: seeded, count: 2 })
  await until(i => document.querySelector(`[data-library-row="${i}"] [data-library-badge]`)?.textContent === '2', seeded)
  await until(() => document.querySelector('[data-tab-badge="inbox"]')?.textContent === '2')
  assert.equal(await badgeOf(ev), '9', 'another library\'s event did not touch this line')
  // the lines read again from the folders (an event without a libraryId): the core's numbers again
  await send('inbox-changed', { count: 1 })
  await until(i => document.querySelector(`[data-library-row="${i}"] [data-library-badge]`)?.textContent === '4', seeded)
  await until(i => document.querySelector(`[data-library-row="${i}"] [data-library-badge]`) === null, ev)
})

test('a click on a library: it becomes the current one (libraries.json) and its 待看 opens; its head says what it follows', async () => {
  const [seeded, ev] = shelf.ids
  assert.equal(registryActive(), seeded, 'control: the seeded one is current at start')
  await openRow(ev)
  await onPage('inbox', ev)
  assert.equal(registryActive(), ev)
  assert.equal((await s.page.evaluate(() => window.streams.getAppState())).data.library.libraryId, ev)
  assert.equal(await s.page.evaluate(() => document.querySelector('#lib-head-name').textContent), SHELF.names[1])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="tracking"]').textContent), fmt(SHELL.head.tracking, { what: firstSentence(SHELF.briefs[1]) }))
  assert.equal(firstSentence(SHELF.briefs[1]), '追踪中国电动车行业：整车销量、电池和充电。', 'control: the first sentence, not the whole brief')
  const r = await rows()
  assert.deepEqual(r.map(x => [x.active, x.current]), [['false', null], ['true', 'page'], ['false', null]])
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-lib-tabs [aria-current]')?.dataset.tab), 'inbox')
})

test('the four tabs each open on the current library (no 概览); 资料库 has its graph view; v1.0\'s nine entries are gone from the sidebar', async () => {
  const ev = shelf.ids[1]
  const tabs = await s.page.evaluate(() => [...document.querySelectorAll('.st-lib-tabs [data-tab]')].map(b => [b.dataset.tab, b.textContent.replace(/\s*\d+$/, '').trim()]))
  assert.deepEqual(tabs.map(t => t[0]), ['inbox', 'library', 'ask', 'sources'])
  assert.deepEqual(tabs.map(t => t[1]), [SHELL.tabs.inbox, SHELL.tabs.library, SHELL.tabs.ask, SHELL.tabs.sources])
  // the template's tab icons (streams/app.js libTabs: 待看 progress · 资料库 sources · 问库 draft · 来源与要求 files)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('.st-lib-tabs [data-tab] svg')].map(i => i.dataset.glyph)), ['progress', 'sources', 'draft', 'files'])
  // 概览 is gone: no tab, and its id opens nothing of its own (the page loaded on #overview opens on 待看)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-lib-tabs [data-tab="overview"]')), null)
  for (const id of ['library', 'ask', 'sources', 'inbox']) {
    await tab(id)
    await onPage(id, ev)
    assert.equal(await s.page.evaluate(() => document.querySelector('.st-lib-tabs [aria-current]')?.dataset.tab), id)
  }
  await tab('library')
  await onPage('library', ev)
  await s.page.click('[data-mode="graph"]')
  await onPage('graph', ev)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-lib-tabs [aria-current]')?.dataset.tab), 'library', 'the graph is a view of 资料库')
  await s.page.click('[data-mode="list"]')
  await onPage('library', ev)
  for (const old of ['today', 'pipeline', 'status', 'graph', 'library', 'inbox', 'ask', 'sources']) {
    assert.equal(await s.page.evaluate(id => document.querySelector(`.st-sidebar [data-nav="${id}"]`), old), null, `no sidebar entry ${old}`)
  }
  // the page loaded on 概览's old id: no such screen, the library opens on its 待看 (and nothing named overview is on the page)
  await s.page.evaluate(() => { location.hash = 'overview'; location.reload() })
  await onPage('inbox', ev)
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="overview"], [data-tab="overview"]')), null)
})

test('each library remembers its tab and its scroll: back to one, back where it was; a library opened for the first time: 待看', async () => {
  const [seeded, ev, fashion] = shelf.ids
  const body = () => 'main[data-screen="sources"] .st-main__body'
  // 电动车 on 问库
  await tab('ask')
  await onPage('ask', ev)
  // the seeded library: back where it was left, 待看 (redesign R1: the app starts there); then its 来源与要求, scrolled down
  await openRow(seeded)
  await onPage('inbox', seeded)
  await tab('sources')
  await onPage('sources', seeded)
  // 1.1 W7b: a library of the last version — the page has its data once its sources and 定时 have theirs
  await until(() => document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule !== 'unknown' && document.querySelector('[data-part="old-sources"]') !== null)
  const room = await s.page.evaluate(sel => { const b = document.querySelector(sel); return b.scrollHeight - b.clientHeight }, body())
  assert.ok(room > 40, `control: 来源与要求 can scroll (${room}px)`)
  const AT = Math.min(300, room)
  await s.page.evaluate(([sel, at]) => { document.querySelector(sel).scrollTop = at }, [body(), AT])
  await until(([sel, at]) => document.querySelector(sel).scrollTop === at, [body(), AT])
  await s.page.waitForTimeout(300)
  await openRow(ev)
  await onPage('ask', ev)
  await openRow(seeded)
  await onPage('sources', seeded)
  await until(([sel, at]) => document.querySelector(sel).scrollTop === at, [body(), AT])
  // another library's 来源与要求 starts at its own place (its own memory, none yet). 1.1 W7b: its page is read only now and would
  // be too short to scroll — it gets sources of its own for this check (taken off again after), so a memory shared by every
  // library would show here as a scrolled page
  const evDir = shelf.dirs[1]
  const added = Array.from({ length: 10 }, (_, i) => `scroll-${i}`)
  for (const name of added) core.addSource(evDir, { name, kind: 'rss', url: `https://example.test/${name}.xml` })
  await openRow(ev)
  await onPage('ask', ev)
  await tab('sources')
  await onPage('sources', ev)
  await until(() => document.querySelectorAll('[data-part="old-sources"] [data-row]').length >= 10)
  const evRoom = await s.page.evaluate(sel => { const b = document.querySelector(sel); return b.scrollHeight - b.clientHeight }, body())
  assert.ok(evRoom > 40, `control: 电动车's 来源与要求 can scroll too (${evRoom}px)`)
  await s.page.waitForTimeout(500)
  assert.equal(await s.page.evaluate(sel => document.querySelector(sel).scrollTop, body()), 0)
  for (const name of added) core.removeSource(evDir, name)
  // a library opened for the first time: its 待看
  await openRow(fashion)
  await onPage('inbox', fashion)
  await openRow(ev)
  await onPage('sources', ev)
  await openRow(seeded)
  await onPage('sources', seeded)
  await tab('inbox')
  await onPage('inbox', seeded)
})

test('库架: a card per library (what it follows, last update, sources, 待看, the problem line); a click opens it; the new card goes to the build conversation', async () => {
  const [seeded, ev, fashion] = shelf.ids
  await s.page.click('[data-nav="shelf"]')
  await ready(s.page, 'shelf')
  const o = (await s.page.evaluate(() => window.streams.getLibrariesOverview())).data
  const cards = await s.page.evaluate(() => [...document.querySelectorAll('[data-shelf-card]')].map(c => ({
    id: c.dataset.shelfCard, name: c.querySelector('[data-part="name"]').textContent, tracking: c.querySelector('[data-part="tracking"]').textContent,
    updated: c.querySelector('[data-part="updated"]').textContent, inbox: c.querySelector('[data-part="inbox"]').dataset.value,
    problem: c.querySelector('[data-part="problem"]').dataset.problem, problemText: c.querySelector('[data-part="problem"]').textContent,
  })))
  assert.deepEqual(cards.map(c => c.id), shelf.ids)
  assert.deepEqual(cards.map(c => c.name), [...SHELF.names])
  assert.deepEqual(cards.map(c => c.inbox), o.map(x => String(x.inbox)))
  assert.deepEqual(cards.map(c => c.problem), ['sources', 'none', 'no-output'])
  assert.deepEqual(cards.map(c => c.problemText), [SHELL.shelf.problems.sources, SHELL.shelf.fine, fmt(SHELL.shelf.problems['no-output'], { n: 3 })])
  assert.equal(cards[0].tracking, fmt(SHELL.head.tracking, { what: firstSentence(SHELF.briefs[0]) }))
  assert.equal(cards[2].tracking, SHELL.head.trackingNone, 'no brief and no topics')
  assert.ok(cards[1].updated.startsWith(SHELL.shelf.updatedNever) && cards[1].updated.includes(fmt(SHELL.shelf.sources, { n: 0 })), cards[1].updated)
  assert.ok(cards[0].updated.includes(fmt(SHELL.shelf.sources, { n: o[0].sources })), cards[0].updated)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-library-row][aria-current]')), null, 'on the shelf no library line is the current place')
  await s.page.click(`[data-shelf-card="${fashion}"]`)
  await onPage('inbox', fashion)
  await s.page.click('[data-nav="shelf"]')
  await ready(s.page, 'shelf')
  // 1.1 W7b: the new card opens the build conversation; with none going, its one sentence — the sidebar marks 新建库, not 主 Agent
  await s.page.click('[data-action="new-card"]')
  await ready(s.page, 'build')
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.view), 'start')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-nav="chat"]').getAttribute('aria-current')), null)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar [data-action="add-library"]').classList.contains('active')), true)
  await openRow(seeded)
  await onPage('inbox', seeded)
  assert.ok(ev)
})

// redesign R4b: 定时 is one line with one 保存 (save-run; its note [data-part="run-note"]); who changed it is 变更记录. 1.1 W7b: v1.0's
// cap and 评分环节 are gone; the old library's 来源与要求 shows its brief and sources read only.
test('来源与要求: this library\'s schedule is changed here (streams.json, 变更记录 = 手动修改); its brief and sources are read only', async () => {
  const seeded = shelf.ids[0]
  const dir = shelf.dirs[0]
  const cfg = () => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'))
  await tab('sources')
  await onPage('sources', seeded)
  await until(() => document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule !== 'unknown' && document.querySelector('[data-part="old-sources"]') !== null)
  // read only: the notice, its brief as written, its sources; nothing to type into but the schedule
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="old-library"]') !== null), true)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="old-brief"] .intro-copy')?.textContent), SHELF.briefs[0])
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="old-sources"] [data-row]')].map(r => r.dataset.row)), cfg().sources.map(x => x.name))
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('main[data-screen="sources"] textarea, main[data-screen="sources"] input[data-field="cap"], main[data-screen="sources"] input[data-field="source"], [data-action="row-more"], [data-part="strictness"]').length), 0)
  assert.notEqual(cfg().schedule?.enabled, true, 'control: off before')
  await s.page.click('[data-part="run"] input[data-field="schedule-on"]')
  await s.page.click('[data-part="run"] [data-action="save-run"] button')
  await until(() => document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule === 'on')
  assert.deepEqual(cfg().schedule, { enabled: true, time: '08:30' })
  assert.equal((await s.page.evaluate(id => window.streams.getLibrarySchedule(id), seeded)).data.enabled, true)
  // a bad time is said and not written
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '25:00')
  await s.page.click('[data-part="run"] [data-action="save-run"] button')
  await until(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'bad')
  assert.deepEqual(cfg().schedule, { enabled: true, time: '08:30' })
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '08:30')
  // 高级设置: 变更记录 has it, 手动修改; two folds, no 评分环节
  await s.page.click('[data-action="go-advanced"]')
  await until(() => document.querySelector('[data-part="changes"][data-state="ready"] [data-change-row][data-field="schedule"]') !== null)
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-change-row]')].map(r => [r.dataset.field, r.dataset.by]))
  assert.deepEqual(rows[0], ['schedule', 'you'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="gates"], [data-part="gates-fold"]')), null)
  await s.page.click('[data-action="back-sources"]')
})

// redesign R4b: 设置's 「定时一览」 is gone (维护者 第 10 题): each library's next run is in the right panel's 进度 (「下次运行时间」, getQueue's
// next — only the libraries whose schedule is on); the month's use is 库与用量's sum. The rest of the test is as before.
test('设置: no schedule or cap to change; no 「定时一览」 (redesign R4b: the next runs are the right panel\'s 进度); the month\'s use of all of them', async () => {
  const [seeded, ev] = shelf.ids
  await s.page.click('.st-sidebar__footer-button')
  await ready(s.page, 'settings')
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="settings"] [data-field="schedule-on"], main[data-screen="settings"] [data-field="cap"], main[data-screen="settings"] [data-part="run"]')), null)
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="settings"] [data-part="schedules"], main[data-screen="settings"] [data-schedule-row]')), null, 'no 定时一览')
  // the queue's next slots (getQueue().next: what the right panel's 「下次运行时间」 lists)
  const next = (await s.page.evaluate(() => window.streams.getQueue())).data.next.map(n => n.libraryId)
  assert.deepEqual(next, [seeded], 'the seeded one was turned on on its own page; the others are off')
  assert.ok(ev)
  const u = core.usageTotal(shelf.dirs, { month: new Date().toISOString().slice(0, 7) })
  assert.ok(u.calls > 0, 'control: the seed\'s round made calls')
  await until(n => document.querySelector('[data-part="usage"]')?.dataset.calls === String(n), u.calls)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-usage-library]')].map(l => [l.dataset.usageLibrary, Number(l.dataset.calls)])), shelf.ids.map((id, i) => [id, u.libraries.find(x => x.dir === shelf.dirs[i])?.calls ?? 0]))
})

test('库架 with no library registered: one line and three buttons (the files of the three folders untouched)', async () => {
  const before = shelf.dirs.map(d => readFileSync(join(d, 'streams.json'), 'utf8'))
  for (const id of shelf.ids) assert.equal((await s.page.evaluate(i => window.streams.removeLibrary(i), id)).ok, true)
  await s.page.click('[data-nav="shelf"]')
  await ready(s.page, 'shelf')
  await until(() => document.querySelector('[data-part="shelf-empty"]') !== null)
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-shelf-card], [data-library-row]').length), 0)
  // 1.1 W13: 「打开已有的库」 too (test/ui-w13.test.mjs)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="shelf-empty"] [data-action]')].map(a => a.dataset.action)), ['empty-chat', 'empty-manual', 'open-existing'])
  assert.deepEqual(shelf.dirs.map(d => readFileSync(join(d, 'streams.json'), 'utf8')), before)
  // 1.1 W6b: 手动新建 is 新建库 — the one-sentence page of the build conversation (screens/build.js); 取消 comes back to 库架
  await s.page.click('[data-action="empty-manual"] button')
  await ready(s.page, 'build')
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.view === 'start' && document.querySelector('textarea[data-field="opener"]') !== null), true)
  await s.page.click('[data-action="cancel-build"] button')
  await ready(s.page, 'shelf')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
