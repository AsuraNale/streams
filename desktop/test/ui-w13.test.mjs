// 1.1 W13 in the real window (docs/checks/2026-11-20-1.1/w13/scorecard.json; 维护者 11-23「发之前先补」, the two things W12
// reported): (1) 「打开已有的库」 on 首次打开's footer, the shelf's toolbar and the shelf with no library — the system's folder
// dialog (answered here by replacing dialog.showOpenDialog in the main process); a library → registered once, current, its
// 待看; cancelled → nothing; an empty folder, a folder of .md files, any other folder → the line, nothing registered, nothing
// written in it. (2) 资料库's 查看原文 on a note whose original was kept: the reading window on the kept one (stored), the site
// not asked for the page. The library is one 1.1 made, by the core's own updates from a site on 127.0.0.1
// (support/card-world.mjs). With STREAMS_W13_SHOTS=<folder> the window is shown and the pictures are saved there.
// Each check first holds the state that would make it fail where it could already be true.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { READER_PARTITION } from '../src/main/reader.mjs'
import * as core from '../src/main/core.mjs'
import { SHELL } from '../src/renderer/texts/shell.js'
import { worldSession } from './support/seed.mjs'
import { seedCardLibrary, startCardSite } from './support/card-world.mjs'

const SHOTS = process.env.STREAMS_W13_SHOTS && isAbsolute(process.env.STREAMS_W13_SHOTS) ? process.env.STREAMS_W13_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
const W = SHELL.openExisting

let site = null
let seeded = null
const F = {}
const s = worldSession({
  kind: 'empty',
  waitFor: 'load',
  prepare: async world => {
    F.lib = join(world.root, 'old-lib')
    F.empty = join(world.root, 'empty-folder')
    F.md = join(world.root, 'md-folder')
    F.other = join(world.root, 'other-folder')
    for (const d of [F.empty, F.md, F.other]) mkdirSync(d, { recursive: true })
    writeFileSync(join(F.md, 'a note.md'), '# a note\n\nwords\n')
    writeFileSync(join(F.other, 'a.txt'), 'not markdown\n')
    site = await startCardSite()
    seeded = await seedCardLibrary(F.lib, site)
    return () => site.close()
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`) }) } }
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const libraries = async () => (await s.page.evaluate(() => window.streams.listLibraries())).data
const listing = dir => readdirSync(dir).sort()
/** The folder dialog's next answer (null: cancelled), and how many times it was asked so far. */
async function answer(path) {
  await s.app.evaluate(({ dialog }, p) => {
    globalThis.__w13Asked = globalThis.__w13Asked ?? 0
    dialog.showOpenDialog = async () => { globalThis.__w13Asked += 1; return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] } }
  }, path)
}
const asked = () => s.app.evaluate(() => globalThis.__w13Asked ?? 0)
const note = () => s.page.evaluate(() => { const n = document.querySelector('[data-part="open-existing-note"]'); return n ? { kind: n.dataset.note, text: n.textContent } : null })
async function clickOpen(scope = '') {
  const before = await asked()
  await s.page.click(`${scope} [data-action="open-existing"] button`.trim())
  // the dialog was asked once more, and the button is enabled again (the flow ended)
  for (let i = 0; i < 200 && (await asked()) === before; i++) await s.page.waitForTimeout(50)
  assert.equal(await asked(), before + 1, 'the folder dialog was asked once')
  await until(sc => { const b = document.querySelector(`${sc} [data-action="open-existing"] button`.trim()); return !b || !b.disabled }, scope)
}

/** The reading window's page, read in the main process (its page runs no script of its own). */
async function readerPage(script) {
  return s.app.evaluate(async ({ BrowserWindow, session }, { partition, script }) => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses && w.contentView.children.length > 0)
    if (!win) return null
    const view = win.contentView.children[0].webContents
    if (view.isLoading() || win.webContents.isLoading()) return null
    const page = await view.executeJavaScript(script).catch(() => null)
    const bar = await win.webContents.executeJavaScript('JSON.stringify({ mode: document.querySelector("[data-reader-bar]")?.dataset.mode })').catch(() => null)
    return page === null || bar === null ? null : { page: JSON.parse(page), bar: JSON.parse(bar) }
  }, { partition: READER_PARTITION, script })
}
async function readerShot(name) {
  if (!SHOTS) return
  const png = await s.app.evaluate(async ({ BrowserWindow, session }, partition) => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses && w.contentView.children.length > 0)
    if (!win.isVisible()) win.showInactive()
    await new Promise(r => setTimeout(r, 900))
    const size = win.getContentBounds()
    const bar = await win.webContents.capturePage({ x: 0, y: 0, width: size.width, height: size.height })
    const page = await win.contentView.children[0].webContents.capturePage()
    return [bar.toPNG().toString('base64'), page.toPNG().toString('base64')]
  }, READER_PARTITION)
  writeFileSync(join(SHOTS, `${name}-bar.png`), Buffer.from(png[0], 'base64'))
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png[1], 'base64'))
}

describe('W13: 打开已有的库, 查看原文 on a kept note', () => {
  test('首次打开: 「打开已有的库」 in the footer, between 手动创建 and 暂不创建; cancelled → nothing; an empty folder → the line, nothing registered or written', async () => {
    await until(() => document.querySelector('main[data-screen="first-run"] [data-part="track"]') !== null)
    assert.deepEqual(await libraries(), [], 'nothing registered at the start')
    const footer = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="track"] .form-footer [data-action]')].map(e => [e.dataset.action, e.textContent.trim()]))
    assert.deepEqual(footer.map(f => f[0]), ['send', 'manual-new', 'open-existing', 'skip-create'])
    assert.equal(footer[2][1], W.button)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="open-existing"] button').className), await s.page.evaluate(() => document.querySelector('[data-action="manual-new"] button').className), 'the same look as 手动创建')
    await shot('first-run')
    // cancelled
    await answer(null)
    await clickOpen()
    assert.equal(await note(), null, 'cancelled: no line')
    assert.deepEqual(await libraries(), [])
    assert.ok(await s.page.evaluate(() => document.querySelector('main[data-screen="first-run"]') !== null), 'still 首次打开')
    // an empty folder: the line; the folder stays empty (no library made in it), nothing registered
    await answer(F.empty)
    await clickOpen()
    await until(() => document.querySelector('[data-part="open-existing-note"]') !== null)
    assert.deepEqual(await note(), { kind: 'not-library', text: W.notLibrary })
    assert.deepEqual(listing(F.empty), [], 'nothing written in the empty folder')
    assert.deepEqual(await libraries(), [])
    assert.ok(await s.page.evaluate(() => document.querySelector('main[data-screen="first-run"]') !== null), 'still 首次打开')
    await shot('first-run-not-library')
  })

  test('首次打开: a folder holding a library → registered, current, its 待看 with its cards', async () => {
    const lib = listing(F.lib)
    assert.ok(lib.includes('streams.json') && lib.includes('_originals'), 'control: the folder is a 1.1 library with its originals')
    await answer(F.lib)
    await clickOpen()
    await until(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]') !== null)
    await until(n => document.querySelectorAll('[data-card]').length === n, seeded.items.length + 1)
    const reg = await libraries()
    assert.equal(reg.length, 1)
    assert.equal(reg[0].path.toLowerCase(), F.lib.toLowerCase())
    assert.equal(reg[0].active, true, 'and current')
    assert.ok(log().includes(`library: opened ${F.lib}`), 'opened as a library (no import, no new library)')
    // opening rebuilds the library's index (services/library.mjs open); nothing else is added at its top level
    assert.deepEqual(listing(F.lib).filter(n => !n.startsWith('index.')), lib, 'nothing else added to the library folder at its top level')
  })

  test('库架: 「打开已有的库」 beside 新建库; a folder of .md files and any other folder → the line, nothing written; the same library again → not registered twice', async () => {
    await s.page.click('.st-sidebar [data-nav="shelf"]')
    await until(() => document.querySelector('main[data-screen="shelf"][data-state="ready"] [data-shelf-card]') !== null)
    const bar = await s.page.evaluate(() => [...document.querySelectorAll('.home-toolbar [data-action]')].map(e => [e.dataset.action, e.textContent.trim()]))
    assert.deepEqual(bar, [['new-library', SHELL.shelf.newButton], ['open-existing', W.button]])
    await shot('shelf')
    const md = listing(F.md)
    await answer(F.md)
    await clickOpen('.home-toolbar')
    await until(() => document.querySelector('[data-part="open-existing-note"]') !== null)
    assert.deepEqual(await note(), { kind: 'not-library', text: W.notLibrary })
    assert.deepEqual(listing(F.md), md, 'a folder of .md files: not imported, nothing written (no streams.json)')
    assert.equal((await libraries()).length, 1)
    const other = listing(F.other)
    await answer(F.other)
    await clickOpen('.home-toolbar')
    await until(() => document.querySelector('[data-part="open-existing-note"]') !== null)
    assert.equal((await note()).kind, 'not-library')
    assert.deepEqual(listing(F.other), other)
    // the same library again: no second entry; its 待看
    await answer(F.lib)
    await clickOpen('.home-toolbar')
    await until(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]') !== null)
    const reg = await libraries()
    assert.equal(reg.length, 1, 'registered once')
    assert.equal(reg[0].active, true)
  })

  test('库架 with no library: 「打开已有的库」 beside 手动创建 in the empty state; a library → registered again', async () => {
    const [entry] = await libraries()
    const removed = await s.page.evaluate(id => window.streams.removeLibrary(id), entry.id)
    assert.equal(removed.error ?? null, null, JSON.stringify(removed))
    assert.ok(existsSync(join(F.lib, 'streams.json')), 'the folder untouched')
    await s.page.click('.st-sidebar [data-nav="shelf"]')
    await until(() => document.querySelector('[data-part="shelf-empty"]') !== null)
    const acts = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="shelf-empty"] [data-action]')].map(e => e.dataset.action))
    assert.deepEqual(acts, ['empty-chat', 'empty-manual', 'open-existing'])
    assert.equal(await s.page.evaluate(() => document.querySelector('.home-toolbar [data-action="open-existing"]')), null, 'the toolbar has none when the empty state has it')
    await shot('shelf-empty')
    await answer(F.lib)
    await clickOpen('[data-part="shelf-empty"]')
    await until(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]') !== null)
    assert.equal((await libraries()).length, 1)
  })

  test('资料库: 查看原文 on a note kept from 待看 → the reading window on the kept original (stored), the site not asked for the page', async () => {
    const [a1] = seeded.items
    await until(u => document.querySelector(`[data-card][data-url="${u}"]`) !== null, a1.url)
    const kept = core.readOriginal(F.lib, core.originalId(a1.url))
    assert.ok(kept && kept.text.length > 0, 'control: the update kept the page\'s original')
    await s.page.click(`[data-card][data-url="${a1.url}"] [data-action="keep"] button`)
    for (let i = 0; i < 200 && core.listLibrary(F.lib, { view: 'all' }).items.length === 0; i++) await s.page.waitForTimeout(100)
    const id = core.listLibrary(F.lib, { view: 'all' }).items[0].id
    assert.equal(core.readInboxItem(F.lib, a1.url), null, 'control: no longer an item of 待看 (where W6a looked for the original)')
    await s.page.click('nav.st-lib-tabs button[data-tab="library"]')
    await until(i => document.querySelector(`[data-part="list"] [data-row="${i}"]`) !== null, id)
    await s.page.click(`[data-part="list"] [data-row="${id}"]`)
    await until(i => document.querySelector(`[data-reader="${i}"]`) !== null && document.querySelector('[data-part="item-actions"] [data-action="source"] button') !== null, id)
    await shot('library-note')
    const hits = site.hits.filter(p => p === '/a/1').length
    await s.page.click('[data-part="item-actions"] [data-action="source"] button')
    let r = null
    for (let i = 0; i < 200 && !(r?.page?.stored); i++) { await s.page.waitForTimeout(100); r = await readerPage('JSON.stringify({ stored: Boolean(document.querySelector("[data-reader-stored]")), title: document.querySelector("h1")?.textContent ?? "", text: document.querySelector("[data-reader-article]")?.textContent ?? "" })') }
    await readerShot('reader-from-library')
    assert.equal(r?.bar?.mode, 'stored', `the bar in stored mode: ${JSON.stringify(r?.bar)}`)
    assert.equal(r.page.stored, true)
    assert.equal(r.page.title, kept.title)
    assert.ok(r.page.text.includes(kept.text.split('\n')[0].slice(0, 20)), 'the kept words are on the page')
    assert.ok(log().includes(`reader: ${a1.url}: stored`), 'the reader logs the kept original')
    assert.equal(site.hits.filter(p => p === '/a/1').length, hits, 'the site was not asked for the page')
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
