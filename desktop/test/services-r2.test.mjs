// Redesign R2 (docs/checks/2026-11-11-r2/contract.md; docs/desktop.md §4.14) — the pipeline service's part of 待看 and the
// run, in plain Node on real libraries the library service made, with the fake connection and feeds on a local server:
//   R2-2  放弃 is held (nothing in the ledger) until its bar closes: 撤销 leaves no `dismissed` at all; a reason chosen, no
//         reason, the next decision, another library opened, the app quitting (settlePending — main.mjs before-quit) write it,
//         each with the right reason (none → no reason field); one at a time
//   R2-3  稍后处理: getInbox's `later`, in _pipeline/later.json; back in `items` when a run of this library has ended, not when
//         another library's run has
//   R2-4  未通过筛选 in getInbox; 移入待看 puts it in `items` as moved:'rejected' with the note folder untouched
//   R2-5  a link added by hand is in `manual` at once
//   R2-6  getHome().lastRun: the funnel of the run record; its 模型调用 N = the parts = this library's calls in 设置
//         (getUsageTotal, the usage file) — one number everywhere; a self-check that failed: the funnel stops at its first cell
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { startFakeServer } from '../../core/test/support/fake-server.mjs'
import { feedRoute, serveItems } from '../../core/test/support/pipeline.mjs'

const worlds = []
const servers = []
after(async () => {
  for (const srv of servers) await srv.close()
  for (const w of worlds) removeTree(w.root, { waitMs: 3000 })
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check, { timeoutMs = 20_000 } = {}) => {
  const t0 = Date.now()
  while (!check()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timed out waiting')
    await sleep(50)
  }
}
const ledger = dir => { const p = join(dir, '_pipeline', 'ledger.jsonl'); return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [] }
const dismissed = dir => ledger(dir).filter(e => e.ev === 'dismissed')
const notesHash = dir => { const d = join(dir, 'notes'); return existsSync(d) ? readdirSync(d).sort().map(f => `${f}:${createHash('sha256').update(readFileSync(join(d, f))).digest('hex')}`).join('|') : '' }

/** A world with two libraries (A current), the fake connection chosen; `score(title)` decides each item's relevance. */
async function setup({ items = 4, score = () => 0.9, devConnection = 'fake' } = {}) {
  const w = testWorld('st-r2-')
  worlds.push(w)
  const locale = () => w.locale
  let pipeline = null
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale, held: () => pipeline?.held() ?? null })
  const connections = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale, devConnection, connectorDeps: { env: { PATH: '', PATHEXT: '.EXE' } } })
  pipeline = createPipelineService({ library, connections, emit: w.emit, log: w.log, shell: w.shell, locale, fetchContext: { timeoutMs: 2000, sleep: async () => {} } })
  const open = async name => {
    w.dialogAnswers.push(join(w.root, name))
    await library.handlers.chooseLibraryFolder()
    await library.handlers.useChosenFolder(name)
    return { id: library.current().libraryId, path: join(w.root, name) }
  }
  const srv = await startFakeServer()
  servers.push(srv)
  const b = await open('B')
  await pipeline.handlers.applyStarterPack('blank', { addRss: [{ name: 'feed-b', url: feedRoute(srv, serveItems(srv, 2, i => ({ url: `${srv.base}/b/${i}`, title: `B item ${i}` })), '/feed-b') }] })
  const a = await open('A')
  await pipeline.handlers.applyStarterPack('blank', { addRss: [{ name: 'feed-a', url: feedRoute(srv, serveItems(srv, items, i => ({ title: `A item ${i}` })), '/feed-a') }] })
  connections.handlers.setActiveConnection('claude-code')
  return { w, srv, library, connections, pipeline, h: pipeline.handlers, a, b }
}

/** One run of the current library (A), to its end. */
async function runCurrent(s) {
  const r = await s.h.startRound()
  assert.equal(r.started, true, JSON.stringify(r))
  await until(() => s.w.eventsOf('round-progress').some(e => e.payload.roundId === r.roundId && e.payload.done === true))
  return r
}

test('R2-2 放弃 is held: off the list, nothing in the ledger; 撤销 → back where it was, no dismissed at all', async () => {
  const s = await setup()
  await runCurrent(s)
  const urls = s.h.getInbox().items.map(i => i.url)
  assert.equal(urls.length, 4, 'control: four cards')
  const before = readFileSync(join(s.a.path, '_pipeline', 'ledger.jsonl'), 'utf8')
  assert.deepEqual(s.h.dismissItem(urls[1]), { url: urls[1], held: true })
  const inbox = s.h.getInbox()
  assert.deepEqual(inbox.items.map(i => i.url), [urls[0], urls[2], urls[3]], 'off the list at once')
  assert.equal(inbox.held.url, urls[1])
  assert.equal(readFileSync(join(s.a.path, '_pipeline', 'ledger.jsonl'), 'utf8'), before, 'nothing written while held')
  assert.equal(s.library.handlers.getLibrariesOverview().find(o => o.id === s.a.id).inbox, 3, '「n 条待看」 leaves the held one out')
  assert.deepEqual(s.h.undoDismiss(), { undone: true, url: urls[1] })
  assert.deepEqual(s.h.getInbox().items.map(i => i.url), urls, 'back where it was')
  assert.equal(s.h.getInbox().held, null)
  assert.equal(readFileSync(join(s.a.path, '_pipeline', 'ledger.jsonl'), 'utf8'), before, 'undone: the ledger byte for byte')
  assert.deepEqual(dismissed(s.a.path), [])
  assert.deepEqual(s.h.settleDismiss(null, null), { settled: false }, 'nothing held: nothing to write')
})

test('R2-2 the bar closes: a quick reason, written words, no reason (no field), the next decision, a second 放弃 — each written once with its reason', async () => {
  const s = await setup({ items: 6 })
  await runCurrent(s)
  const urls = s.h.getInbox().items.map(i => i.url)
  // a quick reason
  s.h.dismissItem(urls[0])
  assert.deepEqual(s.h.settleDismiss('营销内容', 'marketing'), { settled: true, url: urls[0] })
  // words written in 「其他原因…」
  s.h.dismissItem(urls[1])
  s.h.settleDismiss('  只是转述  ', null)
  // closed without a reason
  s.h.dismissItem(urls[2])
  s.h.settleDismiss(null, null)
  // the next decision on another item: keep → the held one goes in first, without a reason
  s.h.dismissItem(urls[3])
  s.h.keepItem(urls[4])
  // a second 放弃 while one is held: the first goes in, the second is held
  s.h.dismissItem(urls[5])
  const d = dismissed(s.a.path)
  assert.deepEqual(d.map(e => e.url), [urls[0], urls[1], urls[2], urls[3]])
  assert.deepEqual(d.map(e => [Object.hasOwn(e, 'reason') ? e.reason : '-', e.quick ?? '-']), [['营销内容', 'marketing'], ['只是转述', '-'], ['-', '-'], ['-', '-']])
  assert.equal(s.h.getInbox().held.url, urls[5])
  assert.deepEqual(s.h.getInbox().recentDismissReasons.map(r => r.reason), ['只是转述', '营销内容'], 'only the ones with a reason')
})

test('R2-2 quitting and opening another library write the held 放弃 (settlePending; getInbox of another library)', async () => {
  const s = await setup()
  await runCurrent(s)
  const urls = s.h.getInbox().items.map(i => i.url)
  s.h.dismissItem(urls[0])
  assert.deepEqual(dismissed(s.a.path), [], 'control: held')
  assert.deepEqual(s.pipeline.settlePending('the app quits'), { url: urls[0] })
  assert.deepEqual(dismissed(s.a.path).map(e => [e.url, Object.hasOwn(e, 'reason')]), [[urls[0], false]])
  assert.equal(s.pipeline.settlePending('the app quits'), null, 'once')
  // another library opened while one is held
  s.h.dismissItem(urls[1])
  s.library.handlers.setActiveLibrary(s.b.id)
  s.h.getInbox()
  assert.deepEqual(dismissed(s.a.path).map(e => e.url), [urls[0], urls[1]])
})

test('R2-3 稍后处理: getInbox later (in _pipeline/later.json); another library\'s run leaves it; a run of this library gives it back', async () => {
  const s = await setup()
  await runCurrent(s)
  const urls = s.h.getInbox().items.map(i => i.url)
  s.h.laterItem(urls[0])
  s.h.laterItem(urls[1])
  let inbox = s.h.getInbox()
  assert.deepEqual(inbox.later.map(i => i.url), [urls[0], urls[1]])
  assert.deepEqual(inbox.items.map(i => i.url), [urls[2], urls[3]])
  assert.ok(existsSync(join(s.a.path, '_pipeline', 'later.json')))
  assert.equal(s.library.handlers.getLibrariesOverview().find(o => o.id === s.a.id).inbox, 2)
  // another library's run (B, from the schedule's way in)
  const rb = await s.pipeline.startRoundIn({ id: s.b.id, path: s.b.path })
  await until(() => s.w.eventsOf('round-progress').some(e => e.payload.roundId === rb.roundId && e.payload.done === true))
  assert.deepEqual(s.h.getInbox().later.map(i => i.url), [urls[0], urls[1]], 'B ran: A\'s 稍后处理 stays')
  // a run of A itself ends: back in 待看
  await runCurrent(s)
  inbox = s.h.getInbox()
  assert.deepEqual(inbox.later, [])
  assert.deepEqual(inbox.items.map(i => i.url).sort(), urls.slice().sort())
  assert.equal(existsSync(join(s.a.path, '_pipeline', 'later.json')), false)
})

test('R2-4 / R2-5 未通过筛选 and 移入待看 (the note folder untouched); a link added by hand is 待评分 at once', async () => {
  const s = await setup({ items: 4 })
  // the dev fake scores every item the same: the relevance threshold is raised above that score, so every item is below it
  const { pipelineConfig, savePipelineConfig } = await import('../src/main/core.mjs')
  const high = structuredClone(pipelineConfig(s.a.path))
  high.nodes.find(n => n.id === 'relevance').threshold = 0.99
  savePipelineConfig(s.a.path, high)
  await runCurrent(s)
  let inbox = s.h.getInbox()
  assert.equal(inbox.items.length, 0, 'control: nothing passed')
  assert.equal(inbox.rejected.total, 4)
  const r = inbox.rejected.items[0]
  assert.deepEqual([r.gate, r.threshold, typeof r.score, typeof r.reason], ['relevance', 0.99, 'number', 'string'])
  const notes = notesHash(s.a.path)
  await assert.rejects(async () => s.h.moveToInbox('https://never/seen'), err => err.code === 'bad_arguments')
  assert.deepEqual(s.h.moveToInbox(r.url), { url: r.url })
  assert.equal(notesHash(s.a.path), notes, 'the note folder byte for byte')
  inbox = s.h.getInbox()
  assert.deepEqual(inbox.items.map(i => [i.url, i.moved]), [[r.url, 'rejected']])
  assert.equal(inbox.rejected.total, 3)
  // keep it: a note the index lists
  const kept = s.h.keepItem(r.url)
  assert.ok(existsSync(join(s.a.path, 'notes', kept.file)))
  // a link by hand (the sources service's addManualLink writes through the core's addManual; here the core directly)
  const { addManual } = await import('../src/main/core.mjs')
  addManual(s.a.path, { url: `${s.srv.base}/by-hand`, title: '手动添加的一条' })
  assert.deepEqual(s.h.getInbox().manual.map(m => [m.url, m.title]), [[`${s.srv.base}/by-hand`, '手动添加的一条']])
})

test('R2-6 getHome().lastRun: the funnel of the run record, N = the parts = this library\'s calls in 设置 (the usage file); a failed self-check stops at the first cell', async () => {
  const s = await setup({ items: 3 })
  await runCurrent(s)
  const home = s.h.getHome()
  const f = home.lastRun.funnel
  const rec = home.lastRound
  assert.deepEqual(f.cells.map(c => [c.id, c.n]), [['fetched', rec.counts.fetched], ['new', rec.counts.new], ['gate:relevance', rec.gates.relevance.passed], ['gate:substance', rec.gates.substance.passed], ['inbox', rec.counts.inbox]])
  assert.equal(f.calls.parts.reduce((a, p) => a + p.n, 0), f.calls.total, 'the parts add up')
  assert.equal(f.calls.parts[0].n, 1, '运行前自检 1')
  const usage = s.library.handlers.getUsageTotal().libraries.find(l => l.id === s.a.id)
  assert.equal(usage.calls, f.calls.total, '设置 says the same number for this library')
  assert.deepEqual(home.lastRun.outcome, { inbox: 3, kept: 0, dismissed: 0, later: 0, waiting: 3 })
  // a self-check that failed (the sign-in expired): the funnel of that attempt, stopped at its first cell
  const t = await setup({ items: 1, devConnection: 'login-expired' })
  const r = await t.h.startRound()
  assert.equal(r.started, false)
  const lr = t.h.getHome().lastRun
  assert.deepEqual([lr.funnel.stop.cell, lr.funnel.stop.why, lr.funnel.stop.connectionCode, lr.funnel.complete], [0, 'self-check', 'login-expired', false])
})

test('without a library the R2 methods are no_library', async () => {
  const w = testWorld('st-r2-none-')
  worlds.push(w)
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  const connections = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale, devConnection: 'fake' })
  const p = createPipelineService({ library, connections, emit: w.emit, log: w.log, shell: w.shell, locale })
  for (const [name, args] of [['dismissItem', ['https://x/1']], ['settleDismiss', [null, null]], ['undoDismiss', []], ['moveToInbox', ['https://x/1']]]) {
    await assert.rejects(async () => p.handlers[name](...args), err => err.code === 'no_library', name)
  }
})

test('R2-7 why a run starts, the four said as they are: 创建库后的首次运行 (a library that never ran, asked for) · 手动触发 · 定时 · 补跑', async () => {
  const { whyOf, QUEUE_WHY } = await import('../src/main/services/schedule.mjs')
  const { QUEUE } = await import('../src/renderer/texts/panel.js')
  const { QUEUE: QUEUE_EN } = await import('../src/renderer/texts-en/panel.js')
  assert.deepEqual([...QUEUE_WHY].sort(), ['catch-up', 'first', 'manual', 'schedule'])
  // redesign R6b-2: 'first' reads 「创建库后的首次运行」 (05 统一用词: 创建 · 运行; it said 建库 and 第一轮) — only the expected words changed
  assert.deepEqual(QUEUE.why, { first: '创建库后的首次运行', manual: '手动触发', schedule: '定时', 'catch-up': '补跑' })
  assert.deepEqual(Object.keys(QUEUE_EN.why).sort(), Object.keys(QUEUE.why).sort())
  const s = await setup({ items: 1 })
  // B has never run: a run asked for is its first; A once it has run: manual; a slot and a catch-up stay what they are
  assert.equal(whyOf(s.b, 'manual'), 'first')
  await runCurrent(s)
  assert.equal(whyOf(s.a, 'manual'), 'manual')
  assert.equal(whyOf(s.b, 'schedule'), 'schedule')
  assert.equal(whyOf(s.b, 'catch-up'), 'catch-up')
})
