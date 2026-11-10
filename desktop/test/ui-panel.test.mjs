// v2 package L (docs/checks/2026-11-10-wp-l/contract.md 「测」) on the running app: the right panel's four tabs, the queue's
// words and the 资料库's two columns. The world: the three libraries of seedShelf (plan B's extras on the current one, 「AI Agent
// 记忆」), 维护者's morning of 11-10 (test/support/queue-world.mjs: 「中国电动车行业」 catching up its missed 08:30 round, its feeds held
// on this machine so it stays in 抓取; 「中国时尚上市公司」 waiting behind it), two proposal cards made at start
// (STREAMS_DEV_PROPOSALS). Each check has its control (the state before the click, the other library, the other screen).
//   - the queue: the sidebar's second lines, 库架's cards, 时尚's 概览 (banner 「排队中 · 第 2 位」, 「已排上」 not pressable); 开始 in a
//     library not in the line → the dialog 「「中国电动车行业」正在补跑错过的那一轮；这个库排在第 3 位…」 (not 「没能开始。」); 进度 lists it;
//   - the panel: four tabs switch; folded / unfolded and the tab are in settings.json and come back after a reload of the page;
//   - 等你决定: the cards and suggestions of every library, as many as the sidebar's badge; a proposal card → 和主 Agent 聊;
//   - 详情: different on 待看, 资料库 (the old third column), 问库, 和主 Agent 聊, 概览 (one sentence);
//   - 文件: notes grouped by their headers' topics (core readIndex), 待看 and 要求与来源 go to their tabs, no program file name, 程序记录
//     folded by default and opened only to 「在资源管理器中显示」; a note → 资料库 with it open; its menu: Obsidian · the file manager;
//   - 资料库: two columns (list · reader), no third column in the main area; its search still works.
// Mutants (scripts/mutation-check.mjs l-panel-not-saved, l-records-open) must make the matching test red.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { PANEL, QUEUE } from '../src/renderer/texts/panel.js'
import { RUN } from '../src/renderer/texts/run.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { seedPlanB, seedShelf, worldSession } from './support/seed.mjs'
import { seedQueue, startHoldingFeed } from './support/queue-world.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const wording = await import(pathToFileURL(join(REPO_DIR, 'wording', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const W = {}
const s = worldSession({
  kind: 'seeded',
  waitFor: 'shelf',
  prepare: async world => {
    await seedPlanB(world)
    W.shelf = await seedShelf(world)
    W.feed = await startHoldingFeed({ holdMs: 18_000 })
    W.q = await seedQueue(world, W.shelf, W.feed, { sources: 10 })
    const cards = join(world.root, 'cards.json')
    writeFileSync(cards, JSON.stringify([
      { kind: 'edit_brief', params: { brief: '只追 agent 记忆的评测' }, why: '界面测试用' },
      { kind: 'create_library', params: { name: '面板测试库', brief: '一个新库' }, why: '界面测试用' },
    ]))
    W.cards = cards
    return () => W.feed.close()
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'shelf', STREAMS_DEV_NOW: W.q.now, STREAMS_DEV_PROPOSALS: W.cards, STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs') }),
  settings: { connections: { active: 'claude-code' } },
})
after(() => W.feed?.release())

const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const settingsOnDisk = () => JSON.parse(readFileSync(join(s.world.appData, 'settings.json'), 'utf8'))
const mainLog = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const tabTo = async id => { await s.page.click(`[data-panel-tab="${id}"]`); await until(t => document.querySelector('[data-part="right-panel"]')?.dataset.tab === t, id) }
const open = async (id, screen) => { await s.page.click(`[data-library-row="${id}"]`); await until(([i, sc]) => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="${sc}"][data-state="ready"]`) !== null, [id, screen]) }
const libTab = async (id, screen = id) => { await s.page.click(`.st-lib-tabs [data-tab="${id}"]`); await ready(s.page, screen) }

// ---- the queue ------------------------------------------------------------------------------------------------------------

test('the queue at start: 电动车 runs (its catch-up), 时尚 waits at place 2 — the sidebar\'s second lines and 库架\'s cards say so; the current library says nothing', async () => {
  const { running, waiting, current } = W.q
  const view = (await bridge('getQueue')).data
  assert.equal(view.running?.libraryId, running, JSON.stringify(view))
  assert.equal(view.running.why, 'catch-up')
  assert.deepEqual(view.waiting.map(w => [w.libraryId, w.why]), [[waiting, 'catch-up']])
  await until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`)?.dataset.position === '2', [running, waiting])
  const line = id => s.page.evaluate(i => document.querySelector(`[data-library-row="${i}"] [data-library-queue]`)?.textContent ?? null, id)
  assert.equal(await line(running), QUEUE.running)
  assert.equal(await line(waiting), fmt(QUEUE.queued, { n: 2 }))
  assert.equal(await line(current), null, 'control: the library not in the line has no second line')
  const card = id => s.page.evaluate(i => document.querySelector(`[data-shelf-card="${i}"] [data-part="queue"]`)?.textContent ?? null, id)
  assert.equal(await card(waiting), fmt(QUEUE.queued, { n: 2 }))
  assert.equal(await card(running), QUEUE.running)
  assert.equal(await card(current), null)
})

test('时尚 (waiting) → 概览: the banner 「排队中 · 第 2 位」 names who runs and why; the button is 「已排上」 and cannot be pressed; 看进度 opens 进度', async () => {
  const { running, waiting } = W.q
  await open(waiting, 'inbox')
  await libTab('overview')
  await until(() => document.querySelector('[data-part="queue"][data-position="2"]') !== null)
  const banner = await s.page.evaluate(() => document.querySelector('main [data-part="queue"]').textContent)
  assert.ok(banner.includes(fmt(QUEUE.banner.title, { n: 2 })), banner)
  assert.ok(banner.includes(fmt(QUEUE.banner.text, { name: W.shelf.names[1], doing: QUEUE.doing['catch-up'] })), banner)
  const button = await s.page.evaluate(() => { const b = document.querySelector('[data-action="run"]'); return { state: b.dataset.queueState, text: b.textContent.trim(), disabled: b.querySelector('button').disabled } })
  assert.deepEqual(button, { state: 'queued', text: QUEUE.queuedButton, disabled: true })
  // the bridge's answer to 开始 here (what the dialog would get): already waiting, place 2 — not 「a round is running」
  assert.deepEqual(await bridge('startRound'), { ok: true, data: { started: false, already: 'queued', position: 2 } })
  await s.page.click('[data-action="see-progress"] button')
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab === 'progress')
  const order = await s.page.evaluate(() => [...document.querySelectorAll('[data-queue-row]')].map(r => [r.dataset.queueRow, r.dataset.position, r.dataset.here, r.dataset.why]))
  assert.deepEqual(order, [[running, '1', 'false', 'catch-up'], [waiting, '2', 'true', 'catch-up']])
  const runningPart = await s.page.evaluate(() => { const r = document.querySelector('[data-part="running"]'); return r ? { lib: r.dataset.library, phase: r.dataset.phase, text: r.textContent } : null })
  assert.equal(runningPart.lib, running)
  assert.ok(runningPart.text.includes(W.shelf.names[1]))
  assert.ok(await s.page.evaluate(() => document.querySelectorAll('[data-next-row]').length) >= 2, 'the next timed slots')
  assert.equal(settingsOnDisk().panel.tab, 'progress', 'the tab chosen is kept')
})

test('开始 in a library not in the line (AI Agent 记忆): the dialog says who runs, why, and place 3 — not 「没能开始。」; pressed again: the same place', async () => {
  const { current } = W.q
  await open(current, 'inbox')
  await libTab('overview')
  await until(() => document.querySelector('[data-action="run"] button')?.disabled === false)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="run"]').dataset.queueState), 'idle', 'control: not in the line yet')
  await s.page.click('[data-action="run"] button')
  await until(() => document.querySelector('[data-dialog="run"] [data-action="start"] button')?.disabled === false)
  await s.page.click('[data-dialog="run"] [data-action="start"] button')
  await until(() => document.querySelector('[data-dialog="run"] [data-part="queued"]') !== null)
  const d = await s.page.evaluate(() => { const q = document.querySelector('[data-part="queued"]'); return { kind: q.dataset.queued, n: q.dataset.position, lead: q.querySelector('[data-part="queued-lead"]').textContent, before: q.querySelector('[data-row="before"]')?.textContent ?? null, all: document.querySelector('[data-dialog="run"]').textContent } })
  assert.equal(d.kind, 'queued')
  assert.equal(d.n, '3')
  assert.equal(d.lead, fmt(QUEUE.dialog.queued, { name: W.shelf.names[1], doing: QUEUE.doing['catch-up'], n: 3 }))
  assert.ok(d.before?.includes(W.shelf.names[1]), d.before)
  assert.equal(d.all.includes(RUN.failed), false, 'not the vague 「没能开始。」')
  assert.equal(wording.scanStrings({ a: `${d.all} pending` }).ok, false, 'control: the scanner can fail here')
  assert.deepEqual(wording.scanStrings({ dialog: d.all }).hits, [], 'the dialog\'s words pass the scanner')
  await s.page.click('[data-dialog="run"] [data-action="ok"] button')
  await until(() => document.querySelector('[data-dialog="run"]') === null)
  await until(() => document.querySelector('[data-action="run"]')?.dataset.queueState === 'queued')
  assert.deepEqual(await bridge('startRound'), { ok: true, data: { started: false, already: 'queued', position: 3 } }, 'pressed again: the same place, not queued twice')
  assert.deepEqual((await bridge('getQueue')).data.waiting.map(w => [w.libraryId, w.why]), [[W.q.waiting, 'catch-up'], [current, 'manual']])
})

// ---- the panel: tabs, folded, remembered -----------------------------------------------------------------------------------

test('four tabs switch; folded into the rail and unfolded; open / folded and the tab are in settings.json and come back after a reload', async () => {
  for (const t of ['decide', 'files', 'detail', 'progress']) {
    await tabTo(t)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-pane]')?.dataset.pane), t)
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-panel-tab][aria-current="true"]').length), 1)
  }
  await tabTo('files')
  await s.page.click('[data-action="fold"] button')
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'false')
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-rail-tab]').length), 4, 'the rail: four icons')
  assert.equal(await s.page.evaluate(() => Math.round(document.querySelector('[data-part="right-panel"]').getBoundingClientRect().width)), 52)
  assert.deepEqual(settingsOnDisk().panel, { open: false, tab: 'files' })
  await s.page.reload()
  await until(() => document.querySelector('main[data-state="ready"]') !== null)
  await until(() => document.querySelector('[data-part="right-panel"]') !== null)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="right-panel"]').dataset.open), 'false', 'folded after the reload (read back from settings.json)')
  await s.page.click('[data-rail-tab="decide"]')
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'true')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="right-panel"]').dataset.tab), 'decide', 'a rail icon opens its tab')
  assert.deepEqual(settingsOnDisk().panel, { open: true, tab: 'decide' })
  await s.page.reload()
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'true')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="right-panel"]').dataset.tab), 'decide', 'the tab after the reload')
  // the window at its smallest still has room for the three columns
  const fit = await s.app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setContentSize(1280, 800)
    await new Promise(r => setTimeout(r, 400))
    return w.webContents.executeJavaScript('(() => { const m = document.querySelector("main").getBoundingClientRect(); const p = document.querySelector("[data-part=right-panel]").getBoundingClientRect(); return { main: Math.round(m.width), right: Math.round(p.right), inner: innerWidth, scroll: document.documentElement.scrollWidth } })()')
  })
  assert.ok(fit.main >= 600, JSON.stringify(fit))
  assert.ok(fit.right <= fit.inner && fit.scroll <= fit.inner, JSON.stringify(fit))
  await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 960))
})

// ---- 等你决定 ---------------------------------------------------------------------------------------------------------------

test('等你决定: every library\'s cards, as many as the sidebar\'s badge, each with its library; a proposal card → 和主 Agent 聊 scrolled to it', async () => {
  await tabTo('decide')
  await until(() => document.querySelectorAll('[data-decide]').length >= 2 && document.querySelector('[data-badge="chat"]') !== null)
  const both = await s.page.evaluate(() => ({ list: document.querySelectorAll('[data-decide]').length, pane: Number(document.querySelector('[data-pane="decide"]').dataset.count), badge: Number(document.querySelector('[data-badge="chat"]').textContent), tab: Number(document.querySelector('[data-panel-badge="decide"]')?.textContent ?? -1) }))
  assert.equal(both.list, both.badge, JSON.stringify(both))
  assert.equal(both.pane, both.badge)
  assert.equal(both.tab, both.badge)
  const pending = (await bridge('listProposals', { status: 'pending' })).data
  const suggestions = (await bridge('listSuggestions', null)).data.filter(x => !x.status || x.status === 'open')
  assert.equal(both.badge, pending.length + suggestions.length, 'the same source: pending cards + open suggestions')
  const brief = pending.find(c => c.kind === 'edit_brief')
  assert.equal(await s.page.evaluate(id => document.querySelector(`[data-decide="${id}"]`)?.dataset.library, brief.id), brief.libraryId, 'the card carries its library')
  assert.ok((await s.page.evaluate(id => document.querySelector(`[data-decide="${id}"]`).textContent, brief.id)).includes(W.shelf.names[0]))
  await s.page.click(`[data-decide="${brief.id}"]`)
  await ready(s.page, 'chat')
  await until(id => document.querySelector(`[data-proposal="${id}"]`) !== null, brief.id)
})

// ---- 详情 ------------------------------------------------------------------------------------------------------------------

test('详情 follows the main area: 和主 Agent 聊 (this turn) · 待看 (the current card\'s steps, check, source) · 资料库 (the old third column) · 问库 (the cited notes) · 概览 (one sentence)', async () => {
  await tabTo('detail')
  const detail = () => s.page.evaluate(() => { const p = document.querySelector('[data-pane="detail"]'); return { parts: [...p.querySelectorAll('[data-part]')].map(e => e.dataset.part), text: p.textContent } })
  const chat = await detail()
  assert.ok(chat.parts.includes('detail-chat') || chat.parts.includes('detail-none'), JSON.stringify(chat.parts))
  // 待看 of the current library: the first card, its scores and their reasons
  await open(W.q.current, 'inbox')
  await until(() => document.querySelector('[data-part="detail-inbox"] [data-detail-score]') !== null)
  const card = await s.page.evaluate(() => { const c = document.querySelector('[data-card][data-current="true"]'); return { url: c.dataset.url, title: c.querySelector('[data-action="open"]').textContent } })
  const inbox = await s.page.evaluate(() => ({ url: document.querySelector('[data-part="detail-scores"]').dataset.url, scores: [...document.querySelectorAll('[data-detail-score]')].map(e => e.dataset.detailScore), check: document.querySelector('[data-part="detail-check"]').dataset.verified, ai: document.querySelector('[data-part="detail-check"]').dataset.aiInstruction, source: document.querySelector('[data-part="detail-source"]').textContent, reasons: document.querySelector('[data-pane="detail"] [data-part="reasons"]') !== null }))
  assert.equal(inbox.url, card.url, 'the current card')
  assert.ok(inbox.scores.includes('relevance'), JSON.stringify(inbox))
  assert.ok(['passed', 'failed', 'none'].includes(inbox.check))
  assert.ok(['true', 'false'].includes(inbox.ai))
  assert.equal(inbox.reasons, true, 'the recent reasons for letting go are still there')
  // J moves the current card: 详情 follows
  await s.page.keyboard.press('j')
  await until(u => document.querySelector('[data-part="detail-scores"]')?.dataset.url !== u, card.url)
  // 资料库: the note's panel, in 详情 — and only there
  await libTab('library')
  const id = s.world.planB.memgpt.id
  await s.page.click(`[data-part="list"] [data-row="${id}"] a`)
  await until(i => document.querySelector(`[data-pane="detail"] [data-part="note-panel"][data-id="${i}"]`) !== null, id)
  const lib = await s.page.evaluate(() => ({ backlinks: document.querySelector('[data-pane="detail"] [data-part="backlinks"]') !== null, same: document.querySelector('[data-pane="detail"] [data-part="same-source"]') !== null, topics: document.querySelector('[data-panel-row="topics"]')?.textContent, inMain: document.querySelector('main [data-part="note-panel"], main .st-panel, .lib-page .st-panel') !== null }))
  assert.deepEqual(lib, { backlinks: true, same: true, topics: lib.topics, inMain: false })
  assert.ok(lib.topics.includes('agent 记忆'))
  // 问库: the notes the answer cites
  await libTab('ask')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="detail-cites"]')?.dataset.n), '0', 'control: nothing asked yet')
  await s.page.fill('textarea[data-field="question"]', s.world.planB.demandQuestion)
  await s.page.click('main[data-screen="ask"] [data-action="send"] button')
  await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done')
  const answerIds = await s.page.evaluate(() => [...document.querySelectorAll('[data-turn="0"] [data-source-n]')].map(e => e.dataset.id))
  const cited = await s.page.evaluate(() => [...document.querySelectorAll('[data-detail-cite]')].map(e => e.dataset.id))
  assert.deepEqual(cited, answerIds, 'the answer\'s sources, in 详情')
  if (cited.length) {
    await s.page.click(`[data-detail-cite="1"]`)
    await until(i => document.querySelector(`main[data-screen="library"] [data-reader="${i}"]`) !== null, cited[0])
  }
  // 概览: nothing chosen — one sentence
  await libTab('overview')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-pane="detail"] [data-part="detail-none"]')?.textContent), PANEL.detail.none)
})

// ---- 文件 ------------------------------------------------------------------------------------------------------------------

test('文件: the notes by their headers\' topics; 待看 and 要求与来源 lead to their tabs; no program file\'s name; 程序记录 folded by default, opened only to the file manager', async () => {
  // on a page of the current library (this test alone starts on 库架)
  await s.page.click(`[data-library-row="${W.q.current}"]`)
  await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-state="ready"]`) !== null, W.q.current)
  await libTab('inbox')
  await tabTo('files')
  await until(() => document.querySelector('[data-tree="notes"]') !== null)
  // the groups: what the index (the notes' headers) says, a note in each of its topics
  const index = core.readIndex(s.world.library).filter(e => e.status === 'kept' || e.status === 'authored')
  const want = {}
  for (const e of index) for (const t of (e.topics?.length ? e.topics : [''])) (want[t] ??= []).push(e.id)
  const groups = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-tree-topic]')].map(g => [g.dataset.treeTopic, g.querySelector('button').textContent])))
  assert.deepEqual(Object.keys(groups).sort(), Object.keys(want).sort())
  for (const [t, ids] of Object.entries(want)) assert.ok(groups[t].includes(`${ids.length}`), `${t}: ${groups[t]}`)
  // open every group: each note under the topics its header names
  for (const t of Object.keys(want)) {
    if (await s.page.evaluate(x => document.querySelector(`[data-tree-topic="${CSS.escape(x)}"]`).dataset.open === 'false', t)) await s.page.click(`[data-tree-topic="${t}"] > button`)
    const shown = await s.page.evaluate(x => [...document.querySelectorAll(`[data-tree-topic="${CSS.escape(x)}"] [data-tree-note]`)].map(n => n.dataset.treeNote).sort(), t)
    assert.deepEqual(shown, [...want[t]].sort(), t)
  }
  // 程序记录: folded at first; opened, only a sentence and 「在资源管理器中显示」
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-tree="records"]').dataset.open), 'false', '程序记录 is folded by default')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="reveal-records"]')), null)
  const text = await s.page.evaluate(() => document.querySelector('[data-pane="files"]').textContent)
  for (const name of ['streams.json', '_pipeline', 'index.jsonl', 'index.meta.json', 'ledger', '.jsonl', 'notes/']) assert.equal(text.includes(name), false, `${name} is not shown`)
  assert.deepEqual(wording.scanStrings({ files: text }).hits, [], 'the words pass the scanner')
  await s.page.click('[data-tree="records"] > button')
  await until(() => document.querySelector('[data-tree="records"]').dataset.open === 'true')
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-tree="records"] [data-action]')].map(a => a.dataset.action)), ['reveal-records'])
  assert.equal((await s.page.evaluate(() => document.querySelector('[data-tree="records"]').textContent)).includes('_pipeline'), false)
  await s.page.click('[data-action="reveal-records"] button')
  const reveal = join(s.world.library, '_pipeline')
  for (let i = 0; i < 50 && !mainLog().includes(`not opened in a test run: folder ${reveal}`); i++) await new Promise(r => setTimeout(r, 100))
  assert.ok(mainLog().includes(`not opened in a test run: folder ${reveal}`), 'the program records folder, in the file manager (a test run: the log)')
  // 要求与来源 → 来源与要求 (no way to open streams.json itself); 待看 → 待看
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-tree="requirements"] [data-action], [data-tree="requirements"] a').length), 0, 'nothing that opens the file')
  await s.page.click('[data-tree="requirements"] button')
  await ready(s.page, 'sources')
  await s.page.click('[data-tree="inbox"] button')
  await ready(s.page, 'inbox')
  // a note: 资料库 with it open; its menu: Obsidian · the file manager
  const note = s.world.planB.evals.id
  await s.page.click(`[data-tree-note="${note}"] .st-rp-tree__row`)
  await until(i => document.querySelector(`main[data-screen="library"] [data-reader="${i}"]`) !== null, note)
  await tabTo('files')
  await until(i => document.querySelector(`[data-tree-note="${i}"]`) !== null, note)
  await s.page.click(`[data-tree-note="${note}"] .st-rp-tree__row`, { button: 'right' })
  await until(() => document.querySelector('[data-menu]') !== null)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-menu] [data-menu-item]')].map(e => e.dataset.menuItem)), ['obsidian', 'folder'])
  await s.page.click('[data-menu-item="folder"]')
  await until(() => document.querySelector('[data-menu]') === null)
  for (let i = 0; i < 50 && !mainLog().includes(`not opened in a test run: folder ${join(s.world.library, 'notes')}`); i++) await new Promise(r => setTimeout(r, 100))
  assert.ok(mainLog().includes(`not opened in a test run: folder ${join(s.world.library, 'notes')}`), 'showNoteInFolder ran for the note')
  // control: 库架 has no library of its own → 「先选一个库」
  await s.page.click('[data-nav="shelf"]')
  await ready(s.page, 'shelf')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-pane="files"] [data-part="no-library"]')?.textContent), PANEL.files.noLibrary)
})

// ---- 资料库 two columns ----------------------------------------------------------------------------------------------------

test('资料库 is two columns — the list and the reader — and its search, views and graph switch still work', async () => {
  await s.page.click(`[data-library-row="${W.q.current}"]`)
  await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-state="ready"]`) !== null, W.q.current)
  await libTab('library')
  const cols = await s.page.evaluate(() => [...document.querySelector('.lib-body').children].map(c => c.dataset.part))
  assert.deepEqual(cols, ['list', 'reader'])
  assert.equal(await s.page.evaluate(() => document.querySelector('.lib-page .st-panel, .lib-page [data-part="note-panel"]')), null, 'no third column inside the page')
  await s.page.fill('input[data-field="search"]', 'MemGPT')
  await until(() => document.querySelector('[data-part="search-count"]') !== null)
  await s.page.fill('input[data-field="search"]', '')
  await s.page.click('[data-view="authored"]')
  await until(() => document.querySelector('[data-view="authored"]')?.getAttribute('aria-current') === 'true')
  await s.page.click('[data-mode="graph"]')
  await ready(s.page, 'graph')
  assert.deepEqual(s.errors, [])
})
