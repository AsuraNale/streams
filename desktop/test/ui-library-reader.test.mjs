// 资料库's reader page (v2 package H, design P5 / UC4; screens/library.js) and 待看's 「写给 AI 的话」 mark (UC5 step 3;
// screens/inbox.js, screens/verdict-dialog.js), on a library with nothing kept yet whose items are pages of a web site on this
// machine (test/support/reader-site.mjs). With a kept note the page opens on 已收藏: test/ui-library.test.mjs (the control).
//   - nothing kept → 抓到的 is the tab; nothing chosen → no button in the head, the reader says 「在左边选一条来读」
//   - a caught item: 收藏 (enabled only for what waits in 待看), 打开原文, 更多 with 在浏览器里打开 — never Obsidian or the
//     file manager
//   - 收藏 → a file in notes/ (read back from the disk), the page on 已收藏 with that note marked 「已收藏 · 进了 notes/」, and
//     only now 更多 has 用 Obsidian 打开 and 在资源管理器中显示 (both reach the main process: a test run logs them); the
//     待看 counts on the tab and in the sidebar go down by one
//   - 待看: the card whose material had words for the AI carries the amber mark, with the sentence on hover and in
//     「这一条的记录」; the cards without have neither
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
const head = () => s.page.evaluate(() => ({
  actions: [...document.querySelectorAll('[data-part="library-head"] [data-action]')].map(e => e.dataset.action),
  more: document.querySelector('[data-part="library-head"] [data-action="more"]')?.dataset.items ?? null,
}))
/** Open 更多 and read its menu (then close it with Esc). */
async function moreMenu() {
  await s.page.click('[data-part="library-head"] [data-action="more"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-menu]') !== null, null, POLL)
  const items = await s.page.evaluate(() => [...document.querySelectorAll('[data-menu] [data-menu-item]')].map(e => [e.dataset.menuItem, e.textContent]))
  return items
}
const closeMenu = async () => { await s.page.keyboard.press('Escape'); await s.page.waitForFunction(() => document.querySelector('[data-menu]') === null, null, POLL) }
const pick = async url => {
  await s.page.click(`[data-part="list"] [data-row="${url}"] a`)
  await s.page.waitForFunction(u => document.querySelector(`[data-reader="${u}"]`) !== null && document.querySelector(`[data-part="item-actions"][data-url="${u}"]`) !== null, url, POLL)
}
const inboxCounts = () => s.page.evaluate(() => ({
  tab: document.querySelector('[data-tab-badge="inbox"]')?.textContent ?? null,
  sidebar: document.querySelector('[data-library-row][aria-current="true"] [data-library-badge], [data-library-row][data-active="true"] [data-library-badge]')?.textContent ?? null,
}))

test('nothing kept: the page opens on 抓到的; nothing chosen: no button in the head, only 「在左边选一条来读」', async () => {
  assert.equal(core.libraryCounts(dir()).kept, 0, 'control: nothing kept in this world')
  await s.page.waitForFunction(() => document.querySelector('[data-view="caught"]')?.getAttribute('aria-current') === 'true', null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-view="kept"]').getAttribute('aria-current')), null)
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="list"] [data-row]')].map(e => e.dataset.row))
  assert.deepEqual(rows.slice().sort(), core.listLibrary(dir(), { view: 'caught' }).items.map(i => i.url).sort())
  assert.deepEqual(await head(), { actions: [], more: null })
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="item-actions"]')), null)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="reader"] [data-part="pick-one"]')?.textContent), LIBRARY.reader.none)
})

test('a caught item that stopped on the way: 收藏 there but disabled (only 待看 can be kept), 打开原文, 更多 = 在浏览器里打开 only', async () => {
  await pick(site.urls.elsewhere)
  const h = await head()
  assert.deepEqual(h.actions, ['keep', 'source', 'more'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="keep"] button').disabled), true)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="keep-only-inbox"]')?.textContent), LIBRARY.actions.keepOnlyInbox)
  assert.deepEqual(await moreMenu(), [['browser', LIBRARY.actions.browser]])
  await closeMenu()
})

test('待看: the card with words for the AI carries the amber mark (the sentence on hover and in 「这一条的记录」); the others have none', async () => {
  await s.page.click('nav.st-lib-tabs button[data-tab="inbox"]')
  await s.page.waitForFunction(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]') !== null && document.querySelectorAll('[data-card]').length === 3, null, POLL)
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
  assert.equal(INBOX.card.aiInstruction, '这一条里有写给 AI 的话，已忽略')
  // 「这一条的记录」 of the marked card: the sentence; of another card: no such part
  const marked = want.find(i => i.aiInstruction).url
  await s.page.click(`[data-card][data-url="${marked}"] [data-action="record"]`)
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="verdicts"] .vd[data-state="ready"]') !== null, null, POLL)
  const rec = await s.page.evaluate(() => ({
    title: document.querySelector('[data-part="ai-instruction"] h3')?.textContent ?? null,
    phrases: [...document.querySelectorAll('[data-part="ai-instruction"] [data-ai-phrase]')].map(e => e.dataset.aiPhrase),
  }))
  assert.deepEqual(rec, { title: VERDICTS.ai.title, phrases: [AI_PHRASE] })
  await s.page.click('[data-action="close-verdicts"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="verdicts"]') === null, null, POLL)
  const other = want.find(i => !i.aiInstruction).url
  await s.page.click(`[data-card][data-url="${other}"] [data-action="record"]`)
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="verdicts"] .vd[data-state="ready"]') !== null, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="ai-instruction"]')), null, 'control: no mark, no part')
  await s.page.click('[data-action="close-verdicts"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="verdicts"]') === null, null, POLL)
  // the mark changes nothing of keep / let go: the marked card has its three buttons enabled
  assert.deepEqual(await s.page.evaluate(u => ['keep', 'dismiss', 'later'].map(a => document.querySelector(`[data-card][data-url="${u}"] [data-action="${a}"] button`)?.disabled), marked), [false, false, false])
})

test('an item waiting in 待看: its summary; 收藏 enabled; 更多 has no Obsidian and no file manager (it has no file)', async () => {
  await s.page.click('nav.st-lib-tabs button[data-tab="library"]')
  await s.page.waitForFunction(() => document.querySelector('[data-view="caught"]')?.getAttribute('aria-current') === 'true', null, POLL)
  await pick(site.urls.article)
  assert.deepEqual((await head()).actions, ['keep', 'source', 'more'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="keep"] button').disabled), false)
  assert.match(await s.page.evaluate(() => document.querySelector('[data-part="summary"]')?.textContent ?? ''), /10 月新能源乘用车批发与零售的周报/)
  const items = await moreMenu()
  assert.deepEqual(items.map(i => i[0]), ['browser'])
  assert.ok(!items.some(([id]) => id === 'obsidian' || id === 'folder'))
  await closeMenu()
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="library-head"] [data-action="edit"]')), null, 'no 编辑 for an item without a file')
})

test('收藏: a file in notes/ (read from the disk), the page on 已收藏 with that note 「已收藏 · 进了 notes/」, 更多 now with Obsidian and the file manager; the 待看 counts go down', async () => {
  const before = await inboxCounts()
  assert.deepEqual(before, { tab: '3', sidebar: '3' })
  const notesBefore = readdirSync(join(dir(), 'notes'))
  await s.page.click('[data-part="library-head"] [data-action="keep"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-view="kept"]')?.getAttribute('aria-current') === 'true' && document.querySelector('[data-kept-now="true"]') !== null, null, POLL)
  const added = readdirSync(join(dir(), 'notes')).filter(f => !notesBefore.includes(f))
  assert.equal(added.length, 1, 'one new file')
  const text = readFileSync(join(dir(), 'notes', added[0]), 'utf8')
  assert.match(text, new RegExp(`title: ${ARTICLE_TITLE}`))
  assert.ok(text.includes(`source: ${site.urls.article}`))
  const kept = core.listLibrary(dir(), { view: 'kept' }).items
  assert.deepEqual(kept.map(i => i.source), [site.urls.article])
  const id = kept[0].id
  assert.equal(added[0], `${id}.md`)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-kept-now="true"]').textContent.trim()), LIBRARY.reader.keptNow)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-reader]')?.dataset.reader), id)
  assert.deepEqual((await head()).actions, ['edit', 'source', 'more'])
  const items = await moreMenu()
  assert.deepEqual(items, [['obsidian', LIBRARY.actions.obsidian], ['folder', LIBRARY.actions.folder], ['browser', LIBRARY.actions.browser]])
  await s.page.click('[data-menu] [data-menu-item="obsidian"]')
  const path = join(dir(), 'notes', `${id}.md`)
  await waitFor(() => log().includes(`not opened in a test run: obsidian ${path}`))
  await moreMenu()
  await s.page.click('[data-menu] [data-menu-item="folder"]')
  await waitFor(() => log().includes(`not opened in a test run: folder ${path}`))
  await s.page.waitForFunction(() => document.querySelector('[data-tab-badge="inbox"]')?.textContent === '2', null, POLL)
  await s.page.waitForFunction(() => document.querySelector('[data-library-row][data-active="true"] [data-library-badge]')?.textContent === '2', null, POLL)
  assert.deepEqual(await inboxCounts(), { tab: '2', sidebar: '2' })
  // the ledger says kept; nothing else was written to notes/
  assert.equal(core.replayLedger(dir()).states.get(site.urls.article).stage, 'kept')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
