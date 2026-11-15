// 资料库 and 待看 on a library with nothing kept yet whose items are pages of a web site on this machine
// (test/support/reader-site.mjs). With kept notes and a file without a header: test/ui-library.test.mjs (the control).
// Redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-1, R3-4; design P09, 维护者 11-11 第 9 题) — this file is rewritten from
// v2 package H's: 资料库 holds only what is a file of the library, so its 「抓到的」 tab (with 收藏 · 打开原文 · 更多 for a caught
// item) is gone (R2 moved what did not pass to 待看's 未通过筛选; an item waiting is kept from 待看). What is checked now:
//   - nothing kept: 全部 0 · 已收藏 0 · 我的笔记 0, the list says so, none of the ledger's caught items is listed (control: the core
//     has them) — reverse: a 「全部」 that took the caught items in is red here (mutant r3-all-lists-caught); there is no
//     「抓到的」 / 「待规范」 tab and no 添加链接 on the page; no file lacks a header, so there is no such line (mutant
//     r3-header-hint-always: a line shown anyway is red here)
//   - 待看: the card whose material had words for the AI carries the amber mark, with the sentence on hover and in 核验记录 (R2)
//   - 收藏 in 待看 → a file in notes/ (read back from the disk); 资料库 lists it (全部 and 已收藏); its reading area has 编辑 · 查看原文
//     · 更多 (在 Obsidian 中打开 · 在资源管理器中显示 · 在浏览器中打开: each reaches the main process, a test run logs it); 查看原文
//     opens Streams' reading window in 阅读模式 (not the browser: mutant r3-source-opens-browser is red here)
// redesign R6b-2: a test name or comment here quotes a sentence of the page as 05 has it now
// (docs/checks/2026-11-13-r6b/05-对照.md 附表一); no assertion changed for it unless a line says so.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { LIBRARY, VERDICTS } from '../src/renderer/texts/library.js'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { worldSession } from './support/seed.mjs'
import { AI_PHRASE, ARTICLE_TITLE, seedReaderLibrary, startReaderSite } from './support/reader-site.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
let site = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'library',
  prepare: async world => { site = await startReaderSite(); world.reader = await seedReaderLibrary(world.library, site); return () => site.close() },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'library' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return; await sleep(100) }
  assert.fail('timed out')
}
/** Open 更多 and read its menu (then close it with Esc). */
async function moreMenu() {
  await s.page.click('[data-part="item-actions"] [data-action="more"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-menu]') !== null, null, POLL)
  return s.page.evaluate(() => [...document.querySelectorAll('[data-menu] [data-menu-item]')].map(e => [e.dataset.menuItem, e.textContent]))
}
const closeMenu = async () => { await s.page.keyboard.press('Escape'); await s.page.waitForFunction(() => document.querySelector('[data-menu]') === null, null, POLL) }
const inboxCounts = () => s.page.evaluate(() => ({
  tab: document.querySelector('[data-tab-badge="inbox"]')?.textContent ?? null,
  sidebar: document.querySelector('[data-library-row][aria-current="true"] [data-library-badge], [data-library-row][data-active="true"] [data-library-badge]')?.textContent ?? null,
}))
const toTab = async id => {
  await s.page.click(`nav.st-lib-tabs button[data-tab="${id}"]`)
  await s.page.waitForFunction(i => document.querySelector(`main[data-screen="${i}"][data-state="ready"]`) !== null, id, POLL)
}

test('R3 nothing kept: 全部 0 · 已收藏 0 · 我的笔记 0, no caught item listed, no 抓到的 / 待规范 tab, no 添加链接, no line about files without a header', async () => {
  const counts = core.libraryCounts(dir())
  assert.deepEqual([counts.kept, counts.authored, counts.all, counts.pending], [0, 0, 0, 0], 'control: no file in this world')
  const caught = core.listLibrary(dir(), { view: 'caught' }).items
  assert.ok(caught.length >= 4, 'control: the ledger has caught items a wrong 「全部」 would show')
  await s.page.waitForFunction(() => document.querySelector('[data-view="all"]')?.getAttribute('aria-current') === 'true' && document.querySelector('[data-part="list"] [data-part="empty"]') !== null, null, POLL)
  const shown = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-view]')].map(e => [e.dataset.view, Number(e.dataset.count)])))
  assert.deepEqual(shown, { all: 0, kept: 0, authored: 0 })
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="list"] [data-part="empty"]').textContent), LIBRARY.empty.all)
  const text = await s.page.evaluate(() => document.querySelector('main[data-screen="library"]').textContent)
  for (const c of caught) assert.ok(!text.includes(c.title), `${c.title} is not in 资料库`)
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-part="list"] [data-row]').length), 0)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-view="caught"], [data-view="pending"]')), null, 'no 抓到的 / 待规范 tab')
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="library"] [data-action="add-link"]')), null, 'no 添加链接 here (待看 has it)')
  await s.page.waitForTimeout(500)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="missing-header-hint"]')), null, 'no file lacks a header: no line')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="reader"] [data-part="pick-one"]')?.textContent), LIBRARY.reader.none)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="item-actions"]')), null, 'nothing chosen: no button')
})

test('待看: the card with words for the AI carries the amber mark (the sentence on hover and in 核验记录); the others have none', async () => {
  await toTab('inbox')
  await s.page.waitForFunction(() => document.querySelectorAll('[data-card]').length === 3, null, POLL)
  const marks = await s.page.evaluate(() => [...document.querySelectorAll('[data-card]')].map(c => {
    const m = c.querySelector('[data-ai-instruction]')
    return [c.dataset.url, m ? [m.textContent, m.getAttribute('title')] : null]
  }))
  const want = s.world.reader.items.filter(i => i.inbox)
  assert.equal(marks.length, want.length)
  for (const [url, mark] of marks) {
    const item = want.find(i => i.url === url)
    if (item.aiInstruction) assert.deepEqual(mark, [INBOX.card.aiInstruction, `命中的原句：「${AI_PHRASE}」`], url)
    else assert.equal(mark, null, `${url}: no mark (control)`)
  }
  assert.equal(marks.filter(([, m]) => m).length, 1)
  assert.equal(INBOX.card.aiInstruction, '检测到面向 AI 的指令，已忽略')
  // 核验记录 of the marked card (redesign R2: 详情's 核验记录, unfolded): the sentence; of another card: no such part
  const openRecord = async url => {
    await s.page.click(`[data-card][data-url="${url}"] .card-body`)
    if (await s.page.evaluate(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab !== 'detail')) await s.page.click('[data-panel-tab="detail"]')
    await s.page.waitForFunction(u => document.querySelector('[data-part="detail-scores"]')?.dataset.url === u, url, POLL)
    if (await s.page.evaluate(() => document.querySelector('[data-part="detail-record"]')?.dataset.open !== 'true')) await s.page.click('[data-part="detail-record"] summary')
    await s.page.waitForFunction(() => document.querySelector('[data-part="detail-record"] .vd[data-state="ready"]') !== null, null, POLL)
  }
  const marked = want.find(i => i.aiInstruction).url
  await openRecord(marked)
  const rec = await s.page.evaluate(() => ({
    title: document.querySelector('[data-part="detail-record"] [data-part="ai-instruction"] h3')?.textContent ?? null,
    phrases: [...document.querySelectorAll('[data-part="detail-record"] [data-part="ai-instruction"] [data-ai-phrase]')].map(e => e.dataset.aiPhrase),
  }))
  assert.deepEqual(rec, { title: VERDICTS.ai.title, phrases: [AI_PHRASE] })
  const other = want.find(i => !i.aiInstruction).url
  await openRecord(other)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="detail-record"] [data-part="ai-instruction"]')), null, 'control: no mark, no part')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="verdicts"]')), null, 'no dialog')
  // the mark changes nothing of keep / let go: the marked card has its three buttons enabled
  assert.deepEqual(await s.page.evaluate(u => ['keep', 'dismiss', 'later'].map(a => document.querySelector(`[data-card][data-url="${u}"] [data-action="${a}"] button`)?.disabled), marked), [false, false, false])
})

test('R3 收藏 in 待看: a file in notes/; 资料库 lists it; 编辑 · 查看原文 · 更多 (Obsidian, file manager, browser); 查看原文 opens the reading window; the 待看 counts go down', async () => {
  if (await s.page.evaluate(() => document.querySelector('main[data-screen="inbox"]') === null)) await toTab('inbox')
  await s.page.waitForFunction(u => document.querySelector(`[data-card][data-url="${u}"]`) !== null, site.urls.article, POLL)
  const before = await inboxCounts()
  assert.deepEqual(before, { tab: '3', sidebar: '3' })
  const notesBefore = readdirSync(join(dir(), 'notes'))
  await s.page.click(`[data-card][data-url="${site.urls.article}"] [data-action="keep"] button`)
  await waitFor(() => readdirSync(join(dir(), 'notes')).length === notesBefore.length + 1)
  const added = readdirSync(join(dir(), 'notes')).filter(f => !notesBefore.includes(f))
  assert.equal(added.length, 1, 'one new file')
  const text = readFileSync(join(dir(), 'notes', added[0]), 'utf8')
  assert.match(text, new RegExp(`title: ${ARTICLE_TITLE}`))
  assert.ok(text.includes(`source: ${site.urls.article}`))
  const id = core.listLibrary(dir(), { view: 'all' }).items[0].id
  assert.equal(added[0], `${id}.md`)
  await s.page.waitForFunction(() => document.querySelector('[data-tab-badge="inbox"]')?.textContent === '2', null, POLL)
  await s.page.waitForFunction(() => document.querySelector('[data-library-row][data-active="true"] [data-library-badge]')?.textContent === '2', null, POLL)
  await toTab('library')
  await s.page.waitForFunction(i => document.querySelector(`[data-part="list"] [data-row="${i}"]`) !== null && document.querySelector(`[data-reader="${i}"]`) !== null, id, POLL)
  assert.deepEqual(await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-view]')].map(e => [e.dataset.view, Number(e.dataset.count)]))), { all: 1, kept: 1, authored: 0 })
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="item-actions"] [data-action]')].map(e => e.dataset.action)), ['edit', 'source', 'more'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="item-actions"] [data-part="mark"]').textContent), LIBRARY.reader.status.kept)
  const items = await moreMenu()
  assert.deepEqual(items, [['obsidian', LIBRARY.actions.obsidian], ['folder', LIBRARY.actions.folder], ['browser', LIBRARY.actions.browser]])
  await s.page.click('[data-menu] [data-menu-item="obsidian"]')
  const path = join(dir(), 'notes', `${id}.md`)
  await waitFor(() => log().includes(`not opened in a test run: obsidian ${path}`))
  await moreMenu()
  await s.page.click('[data-menu] [data-menu-item="folder"]')
  await waitFor(() => log().includes(`not opened in a test run: folder ${path}`))
  await moreMenu()
  await s.page.click('[data-menu] [data-menu-item="browser"]')
  await waitFor(() => log().includes(`not opened in a test run: ${site.urls.article}`))
  // 查看原文: Streams' reading window, in 阅读模式 (the reader logs the address and the mode), not the browser
  const browsed = log().split(`not opened in a test run: ${site.urls.article}`).length
  await s.page.click('[data-part="item-actions"] [data-action="source"] button')
  await waitFor(() => log().includes(`reader: ${site.urls.article}: reading`), 60_000)
  assert.equal(log().split(`not opened in a test run: ${site.urls.article}`).length, browsed, 'the browser was not asked again')
  const open = await s.app.evaluate(({ BrowserWindow, session }) => BrowserWindow.getAllWindows().some(w => !w.isDestroyed() && w.webContents.session === session.fromPartition('streams-reader')))
  assert.equal(open, true, 'the reading window is open')
  assert.deepEqual(await inboxCounts(), { tab: '2', sidebar: '2' })
  assert.equal(core.replayLedger(dir()).states.get(site.urls.article).stage, 'kept')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
