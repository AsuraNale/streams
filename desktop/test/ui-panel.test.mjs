// v2 package L (docs/checks/2026-11-10-wp-l/contract.md 「测」) on the running app: the right panel's four tabs, the queue's
// words and the 资料库's two columns. The world: the three libraries of seedShelf (plan B's extras on the current one, 「AI Agent
// 记忆」), 维护者's morning of 11-10 (test/support/queue-world.mjs: 「中国电动车行业」 catching up its missed 08:30 round, its feeds held
// on this machine so it stays in its update; 「中国时尚上市公司」 waiting behind it). Each check has its control (the state before the click, the other library, the other screen).
//   - the queue: the sidebar's second lines, 库架's cards, 时尚's 概览 (banner 「排队中 · 第 2 位」, 「已排上」 not pressable); 开始 in a
//     library not in the line → the dialog 「「中国电动车行业」正在补跑错过的那一轮；这个库排在第 3 位…」 (not 「没能开始。」); 进度 lists it;
//   - the panel: four tabs switch; folded / unfolded and the tab are in settings.json and come back after a reload of the page;
//   - 等你决定: the cards and suggestions of every library, as many as the sidebar's badge; a proposal card → 和主 Agent 聊;
//   - 详情: different on 待看, 资料库 (the old third column), 问库, 和主 Agent 聊, 概览 (one sentence);
//   - 文件: notes grouped by their headers' topics (core readIndex), 待看 and 要求与来源 go to their tabs, no program file name, 程序记录
//     folded by default and opened only to 「在资源管理器中显示」; a note → 资料库 with it open; its menu: Obsidian · the file manager;
//   - 资料库: two columns (list · reader), no third column in the main area; its search still works.
// Mutants (scripts/mutation-check.mjs l-panel-not-saved, l-records-open) must make the matching test red.
// Redesign R1 (维护者 11-11 第 1、6、13 题; the R1 contract): the panel is the template's context-panel with 进度 · 待确认 · 详情 · 文件
// (「等你决定」 renamed), its number counted on the 待确认 tab only (the sidebar's 主 Agent has none: [data-panel-badge="decide"] is
// read where [data-badge="chat"] was); 概览 and the run dialog are gone — the queue tests below were rewritten for the head's run
// button (no dialog, the button is the state); 详情's 「nothing chosen」 control is on 来源与要求 (was 概览).
// 1.1 W7b: 待确认 holds only the build conversation's card (v2's proposal cards and 系统检测 are gone); the head's chip has no
// estimate of model calls; the last run in 进度 is one line (screens/run-steps.js LastRun); 详情 of a card of a library made by the
// last version has no scores, and 资料库's 详情 no 入选理由.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { PANEL, QUEUE } from '../src/renderer/texts/panel.js'
import { SHELL } from '../src/renderer/texts/shell.js'
import { ROUND_PHASES } from '../src/renderer/texts/common.js'
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
    return () => W.feed.close()
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'shelf', STREAMS_DEV_NOW: W.q.now, STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs') }),
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
// redesign R1 (维护者 11-11 第 6 题, N06, F23; the R1 contract 「立即运行」): no run dialog and no 概览 any more — the head's button
// is the state itself (立即运行 · 运行中 · 停止 · 排队中 · 第 n 位), and the queue shows in three places only: that button, the
// sidebar's line, the panel's 进度. These tests were rewritten for it (the dialog's and the banner's checks went with them).

test('the queue at start: 电动车 runs (its catch-up), 时尚 waits at place 2 — the sidebar\'s lines and 库架\'s cards say so; the current library says nothing', async () => {
  const { running, waiting, current } = W.q
  const view = (await bridge('getQueue')).data
  assert.equal(view.running?.libraryId, running, JSON.stringify(view))
  assert.equal(view.running.why, 'catch-up')
  assert.deepEqual(view.waiting.map(w => [w.libraryId, w.why]), [[waiting, 'catch-up']])
  await until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`)?.dataset.position === '2', [running, waiting])
  const line = id => s.page.evaluate(i => document.querySelector(`[data-library-row="${i}"] [data-library-queue]`)?.textContent ?? null, id)
  // 运行中 · <当前环节> (1.1 W7a: an update is one step, 更新, while its sources are held)
  assert.ok((await line(running)).startsWith(QUEUE.running), await line(running))
  await until(([i, t]) => document.querySelector(`[data-library-row="${i}"] [data-library-queue]`)?.textContent === t, [running, fmt(QUEUE.runningPhase, { phase: ROUND_PHASES.update })])
  assert.equal(await line(waiting), fmt(QUEUE.queued, { n: 2 }))
  assert.equal(await line(current), null, 'control: the library not in the line has no queue line')
  const card = id => s.page.evaluate(i => document.querySelector(`[data-shelf-card="${i}"] [data-part="queue"]`)?.textContent.trim() ?? null, id)
  assert.equal(await card(waiting), fmt(QUEUE.queued, { n: 2 }))
  assert.ok((await card(running)).startsWith(QUEUE.running))
  assert.equal(await card(current), null)
})

test('时尚 (waiting) → its page: the head\'s button is 「排队中 · 第 2 位」 and cannot be pressed; no banner, no dialog; 进度 has the order', async () => {
  const { running, waiting } = W.q
  await open(waiting, 'inbox')
  await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'queued')
  const button = await s.page.evaluate(() => { const b = document.querySelector('[data-part="run-button"]'); return { state: b.dataset.runState, n: b.dataset.position, text: b.querySelector('button').textContent.trim(), disabled: b.querySelector('button').disabled } })
  assert.deepEqual(button, { state: 'queued', n: '2', text: fmt(SHELL.head.run.queued, { n: 2 }), disabled: true })
  assert.equal(await s.page.evaluate(() => document.querySelector('main [data-part="queue"], [data-dialog]')), null, 'no banner, no dialog: the place is said in three places only')
  // the bridge's answer to 立即运行 here: already waiting, place 2 — not 「a round is running」
  assert.deepEqual(await bridge('startRound'), { ok: true, data: { started: false, already: 'queued', position: 2 } })
  await tabTo('progress')
  const order = await s.page.evaluate(() => [...document.querySelectorAll('[data-queue-row]')].map(r => [r.dataset.queueRow, r.dataset.position, r.dataset.here, r.dataset.why]))
  assert.deepEqual(order, [[running, '1', 'false', 'catch-up'], [waiting, '2', 'true', 'catch-up']])
  const runningPart = await s.page.evaluate(() => { const r = document.querySelector('[data-part="running"]'); return r ? { lib: r.dataset.library, phase: r.dataset.phase, text: r.textContent } : null })
  assert.equal(runningPart.lib, running)
  assert.ok(runningPart.text.includes(W.shelf.names[1]))
  assert.ok(await s.page.evaluate(() => document.querySelectorAll('[data-next-row]').length) >= 2, 'the next timed slots')
  assert.equal(settingsOnDisk().panel.tab, 'progress', 'the tab chosen is kept')
  // 电动车 (running) → its button is 「运行中 · 停止」, pressable
  await open(running, 'inbox')
  await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'running')
  assert.deepEqual(await s.page.evaluate(() => { const b = document.querySelector('[data-part="run-button"] button'); return [b.textContent.trim(), b.disabled] }), [SHELL.head.run.running, false])
})

// redesign R2 (contract R2-7, P07 · P16): the running library's 待看 says this run — when it started, why (补跑 here: its catch-up),
// the six steps lit up to where it is — and the head's chip says 「运行中：<环节> · 模型调用 n / 上限 m」; the right panel's 进度: the
// running one with why, when it started, its step and 停止; the one waiting with why, since when and 「前一任务完成后自动开始」; the
// rule 「需保持流息运行…」; the current library's last run in one line.
test('R2 · the running library (its catch-up): 待看 says 本次运行 · … 开始 · 补跑 and six steps; the head\'s chip; 进度 has why, since when, 停止 and the rule', async () => {
  const { running, waiting } = W.q
  await open(running, 'inbox')
  await until(() => document.querySelector('[data-part="run-steps"]') !== null && document.querySelector('[data-part="running-chip"]') !== null)
  const steps = await s.page.evaluate(() => { const r = document.querySelector('[data-part="run-steps"]'); return { why: r.dataset.why, head: r.querySelector('.section-label').textContent, steps: [...r.querySelectorAll('[data-step]')].map(e => [e.dataset.step, e.dataset.done, e.dataset.now]), stop: r.querySelector('[data-action="cancel-run"]') !== null } })
  assert.equal(steps.why, 'catch-up')
  assert.ok(steps.head.includes(QUEUE.why['catch-up']) && steps.head.includes('开始') && !steps.head.includes(QUEUE.why.schedule), steps.head)
  // 1.1.1 P10 (A8): an update's four steps (1.0's six steps are not its own)
  assert.deepEqual(steps.steps.map(x => x[0]), ['sources', 'originals', 'agent', 'check'])
  assert.deepEqual(steps.steps.filter(x => x[2] === 'true').map(x => x[0]), ['sources'], 'held on the slow sources: reading them')
  assert.deepEqual(steps.steps.filter(x => x[1] === 'true').map(x => x[0]), [])
  assert.equal(steps.stop, true)
  assert.ok(await s.page.evaluate(() => document.querySelector('main [data-part="run-pending"]')?.textContent.includes('本次运行尚未完成')), 'nothing in 待看 yet: 本次运行尚未完成')
  const chip = await s.page.evaluate(() => { const c = document.querySelector('[data-part="running-chip"]'); return { text: c.textContent, calls: c.dataset.calls, cap: c.dataset.cap } })
  assert.ok(chip.text.includes('运行中：更新'), chip.text)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="next-run"]')), null, 'the next-run chip gives way while it runs')
  await tabTo('progress')
  const p = await s.page.evaluate(() => ({
    running: document.querySelector('[data-part="running"] [data-part="running-phase"]')?.textContent ?? '',
    stop: document.querySelector('[data-part="running"] [data-action="panel-stop"]') !== null,
    waiting: document.querySelector('[data-queue-row][data-position="2"] .phase-details')?.textContent ?? '',
    rule: document.querySelector('[data-part="keep-running"]')?.textContent ?? '',
    lastRun: document.querySelector('[data-pane="progress"] [data-part="last-run-here"] [data-part="last-run"]')?.dataset.state ?? null,
  }))
  assert.ok(p.running.includes(QUEUE.why['catch-up']) && p.running.includes('开始') && p.running.includes('当前步骤：更新'), p.running)
  assert.equal(p.stop, true)
  assert.ok(p.waiting.includes(QUEUE.why['catch-up']) && p.waiting.includes('加入队列') && p.waiting.includes('前一任务完成后自动开始'), p.waiting)
  assert.equal(p.rule, PANEL.progress.keepRunning)
  assert.equal(p.lastRun, 'none', 'this library has never run: its line says so')
  void waiting
})

test('立即运行 in a library not in the line (AI Agent 记忆): no dialog — it goes to the end of the queue at place 3 and the button says so; pressed again: the same place', async () => {
  const { current } = W.q
  await open(current, 'inbox')
  await until(() => document.querySelector('[data-part="run-button"] button')?.disabled === false)
  const idle = await s.page.evaluate(() => { const b = document.querySelector('[data-part="run-button"]'); return [b.dataset.runState, b.querySelector('button').textContent.trim()] })
  assert.deepEqual(idle, ['idle', SHELL.head.run.now], 'control: not in the line yet')
  // the chip beside it: the next run only (1.1 W7b: no estimate of model calls)
  const chip = await s.page.evaluate(() => document.querySelector('[data-part="next-run"]').textContent)
  assert.ok(chip.length > 0 && !chip.includes('模型调用'), chip)
  await s.page.click('[data-part="run-button"] button')
  await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'queued')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog]')), null, 'no dialog')
  const b = await s.page.evaluate(() => { const x = document.querySelector('[data-part="run-button"]'); return [x.dataset.position, x.querySelector('button').textContent.trim(), x.querySelector('button').disabled] })
  assert.deepEqual(b, ['3', fmt(SHELL.head.run.queued, { n: 3 }), true])
  await until(i => document.querySelector(`[data-library-row="${i}"] [data-library-queue="queued"]`)?.dataset.position === '3', current)
  assert.deepEqual(await bridge('startRound'), { ok: true, data: { started: false, already: 'queued', position: 3 } }, 'pressed again: the same place, not queued twice')
  assert.deepEqual((await bridge('getQueue')).data.waiting.map(w => [w.libraryId, w.why]), [[W.q.waiting, 'catch-up'], [current, 'manual']])
  await tabTo('progress')
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-queue-row]')].map(r => [r.dataset.position, r.dataset.why])), [['1', 'catch-up'], ['2', 'catch-up'], ['3', 'manual']])
  assert.deepEqual(wording.scanStrings({ head: await s.page.evaluate(() => document.querySelector('[data-part="library-head"]').textContent) }).hits, [], 'the head\'s words pass the scanner')
})

// ---- the panel: tabs, folded, remembered -----------------------------------------------------------------------------------

test('four tabs switch; folded into the rail and unfolded; open / folded and the tab are in settings.json and come back after a reload', async () => {
  // the four tabs, in the redesign's words (literal: 待确认 is 维护者's 11-11 name)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-panel-tab]')].map(b => [b.dataset.panelTab, b.textContent.replace(/\s*\d+$/, '').trim()])), [['progress', '进度'], ['decide', '待确认'], ['detail', '详情'], ['files', '文件']])
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
    // the app's own window (1.1 W7a: an update may have made the hidden window that renders pages)
    const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().startsWith('app://'))
    w.setContentSize(1280, 800)
    await new Promise(r => setTimeout(r, 400))
    return w.webContents.executeJavaScript('(() => { const m = document.querySelector("main").getBoundingClientRect(); const p = document.querySelector("[data-part=right-panel]").getBoundingClientRect(); return { main: Math.round(m.width), right: Math.round(p.right), inner: innerWidth, scroll: document.documentElement.scrollWidth } })()')
  })
  assert.ok(fit.main >= 600, JSON.stringify(fit))
  assert.ok(fit.right <= fit.inner && fit.scroll <= fit.inner, JSON.stringify(fit))
  await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(x => x.webContents.getURL().startsWith('app://')).setContentSize(1440, 960))
})

// ---- 等你决定 ---------------------------------------------------------------------------------------------------------------

// 1.1 W7b: what waits for you to confirm is the build conversation's library card (its tests: test/ui-w6b.test.mjs); with no
// conversation going there is nothing — v2's proposal cards and 系统检测 are gone, from the panel and from the bridge.
test('待确认: only the build conversation\'s card — none going, nothing to confirm and no number; v2\'s cards are no bridge method', async () => {
  await tabTo('decide')
  await until(() => document.querySelector('[data-pane="decide"] [data-part="decide-summary"]') !== null)
  const pane = await s.page.evaluate(() => ({ count: document.querySelector('[data-pane="decide"]').dataset.count, none: document.querySelector('[data-part="decide-none"]') !== null, cards: document.querySelectorAll('[data-pane="decide"] article, [data-decide]').length, badge: document.querySelector('[data-panel-badge="decide"]'), chat: document.querySelector('[data-nav="chat"] [data-nav-count], [data-badge="chat"]') }))
  assert.deepEqual(pane, { count: '0', none: true, cards: 0, badge: null, chat: null })
  assert.equal((await bridge('getBuild')).data, null, 'control: no build conversation going')
  assert.equal(await s.page.evaluate(() => ['listProposals', 'listSuggestions', 'listToConfirm'].some(n => typeof window.streams[n] === 'function')), false)
})

// ---- 详情 ------------------------------------------------------------------------------------------------------------------

test('详情 follows the main area: 库架 (one sentence) · 待看 (the current card\'s check, source) · 资料库 (the old third column) · 问库 (the cited notes) · 来源与要求 (one sentence)', async () => {
  await tabTo('detail')
  const detail = () => s.page.evaluate(() => { const p = document.querySelector('[data-pane="detail"]'); return { parts: [...p.querySelectorAll('[data-part]')].map(e => e.dataset.part), text: p.textContent } })
  const first = await detail()
  assert.ok(first.parts.includes('detail-none'), JSON.stringify(first.parts))
  // 待看 of the current library: the first card, its check and its source (1.1 W7b: no scores of v1.0)
  await open(W.q.current, 'inbox')
  await until(() => document.querySelector('[data-part="detail-inbox"] [data-part="detail-check"]') !== null)
  const card = await s.page.evaluate(() => { const c = document.querySelector('[data-card][data-current="true"]'); return { url: c.dataset.url, title: c.querySelector('[data-action="open"]').textContent } })
  const inbox = await s.page.evaluate(() => ({ title: document.querySelector('[data-part="detail-inbox"] h2').textContent, scores: document.querySelectorAll('[data-detail-score], [data-part="detail-scores"]').length, check: document.querySelector('[data-part="detail-check"]').dataset.verified, ai: document.querySelector('[data-part="detail-check"]').dataset.aiInstruction, source: document.querySelector('[data-part="detail-source"]').textContent, reasons: document.querySelector('[data-pane="detail"] [data-part="reasons"]') !== null }))
  assert.equal(inbox.title, card.title, 'the current card')
  assert.equal(inbox.scores, 0, JSON.stringify(inbox))
  assert.ok(['passed', 'failed', 'none'].includes(inbox.check))
  assert.ok(['true', 'false'].includes(inbox.ai))
  assert.equal(inbox.reasons, true, 'the recent reasons for letting go are still there')
  // J moves the current card: 详情 follows
  await s.page.keyboard.press('j')
  await until(t => document.querySelector('[data-part="detail-inbox"] h2')?.textContent !== t, card.title)
  // 资料库: the note's panel, in 详情 — and only there. Redesign R3 (R3-1): only what the reading area has not — 文件 (1.1 W7b: no 入选理由),
  // 反向链接, 同来源内容 (its topics are on the paper now, no 「主题」 row here); the row is a source-card (no <a> in it)
  await libTab('library')
  const id = s.world.planB.memgpt.id
  await s.page.click(`[data-part="list"] [data-row="${id}"]`)
  await until(i => document.querySelector(`[data-pane="detail"] [data-part="note-panel"][data-id="${i}"]`) !== null, id)
  const lib = await s.page.evaluate(() => ({ backlinks: document.querySelector('[data-pane="detail"] [data-part="backlinks"]') !== null, same: document.querySelector('[data-pane="detail"] [data-part="same-source"]') !== null, reasons: document.querySelector('[data-pane="detail"] [data-part="detail-reasons"]') !== null, topicsRow: document.querySelector('[data-panel-row="topics"]') !== null, paperTopics: document.querySelector('main [data-part="reader-source"]')?.textContent, inMain: document.querySelector('main [data-part="note-panel"], main .st-panel, .lib-page .st-panel') !== null }))
  assert.deepEqual(lib, { backlinks: true, same: true, reasons: false, topicsRow: false, paperTopics: lib.paperTopics, inMain: false })
  assert.ok(lib.paperTopics.includes('agent 记忆'))
  // 问库: the notes the answer cites (redesign R3: 详情's 本次回答依据; nothing asked yet → none listed)
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
  // 来源与要求: nothing chosen — one sentence (redesign R1: was 概览, gone)
  await libTab('sources')
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

// redesign R3: the two columns are the template's st-split (was .lib-body); 资料库's views are 全部 · 已收藏 · 我的笔记
test('资料库 is two columns — the list and the reader — and its search, views and graph switch still work', async () => {
  await s.page.click(`[data-library-row="${W.q.current}"]`)
  await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-state="ready"]`) !== null, W.q.current)
  await libTab('library')
  const cols = await s.page.evaluate(() => [...document.querySelector('.st-split').children].map(c => c.dataset.part))
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
