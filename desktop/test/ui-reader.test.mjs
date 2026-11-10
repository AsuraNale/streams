// 「打开原文」 and the reading window on the running app (v2 package H; src/main/reader.mjs; docs/desktop.md §4.9), on a library
// whose items are pages of a web site on this machine (test/support/reader-site.mjs: nothing reaches the network).
//   - The window's two web contents as Electron made them: sandbox, context isolation, no Node, no preload (the page has no
//     `window.streams`), the reader's own in-memory session — not the app's.
//   - 阅读模式: the article, in the app's font and theme, without the menu, the ad or what the page's script would have
//     written (and the script's request never arrived); 原网页 in the same window; back again.
//   - A page with nothing to read: the original page, with the line 「这一页抽不出正文，显示的是原网页」 in the bar.
//   - A link in the page: not loaded there, the system browser instead (a test run logs it); a new window, a non-http(s)
//     address, a download: refused. openReader refuses an address that is not an item of the library.
// Each with its control: the other page, the other mode, the other address.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP } from '../src/main/texts/app.js'
import { READER_PARTITION } from '../src/main/reader.mjs'
import { worldSession } from './support/seed.mjs'
import { ARTICLE_TITLE, SCRIPT_MARK, seedReaderLibrary, startReaderSite } from './support/reader-site.mjs'

const W = APP.reader
let site = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'library',
  prepare: async world => { site = await startReaderSite(); world.reader = await seedReaderLibrary(world.library, site); return () => site.close() },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'library' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** The reading window as the main process holds it: its bar and its page, each with what the test asks of it (a script). */
async function reader(barScript = 'null', pageScript = 'null') {
  return s.app.evaluate(async ({ BrowserWindow, session }, { partition, barScript, pageScript }) => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses && w.contentView.children.length > 0)
    if (!win) return null
    const bar = win.webContents
    const page = win.contentView.children[0].webContents
    return {
      barUrl: bar.getURL(), pageUrl: page.getURL(), loading: page.isLoading() || bar.isLoading(),
      bar: await bar.executeJavaScript(barScript).catch(e => `error: ${e.message}`),
      page: await page.executeJavaScript(pageScript).catch(e => `error: ${e.message}`),
    }
  }, { partition: READER_PARTITION, barScript, pageScript })
}
const barMode = () => reader('JSON.stringify({ mode: document.querySelector("[data-reader-bar]")?.dataset.mode ?? null, note: document.querySelector("[data-reader-note]")?.textContent ?? null })')
async function waitMode(mode, { note = null } = {}) {
  const end = Date.now() + 60_000
  let last = null
  while (Date.now() < end) {
    last = await barMode()
    if (last && !last.loading && last.bar) {
      const b = JSON.parse(last.bar)
      if (b.mode === mode && b.note === note) return last
    }
    await sleep(150)
  }
  assert.fail(`the reading window did not come to ${mode}: ${JSON.stringify(last)}`)
}
async function waitFor(fn, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return; await sleep(100) }
  assert.fail('timed out')
}
const clickInBar = action => s.app.evaluate(({ BrowserWindow, session }, { partition, action }) => {
  const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === session.fromPartition(partition))
  // not awaited: 回到条目 closes the window, and with it the script's answer
  win.webContents.executeJavaScript(`document.querySelector('[data-reader-action="${action}"]').click(); true`).catch(() => {})
  return true
}, { partition: READER_PARTITION, action })

test('「打开原文」 on an item of 抓到的 opens the reading window in 阅读模式: the article, its picture, no menu, no ad, nothing the page\'s script would have done', async () => {
  const url = site.urls.article
  await s.page.click(`[data-part="list"] [data-row="${url}"] a`)
  await s.page.waitForFunction(u => document.querySelector(`[data-part="item-actions"][data-url="${u}"] [data-action="source"] button`) !== null, url, POLL)
  await s.page.click('[data-part="item-actions"] [data-action="source"] button')
  const r = await waitMode('reading')
  assert.ok(r.pageUrl.startsWith('data:text/html'), 'a page the reader wrote, not the address')
  const got = JSON.parse((await reader('null', `JSON.stringify({
    title: document.querySelector('[data-reader-article] h1')?.textContent,
    text: document.querySelector('[data-reader-article]')?.textContent ?? '',
    img: [...document.querySelectorAll('[data-reader-article] img')].map(i => i.getAttribute('src')),
    scripts: document.querySelectorAll('script').length,
    theme: document.documentElement.dataset.theme,
    font: getComputedStyle(document.body).fontFamily,
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '',
  })`)).page)
  assert.equal(got.title, ARTICLE_TITLE)
  assert.match(got.text, /批发和零售都比 9 月有所增长/)
  assert.match(got.text, /四季度的增长预期没有变化/)
  for (const gone of ['关于我们', '限时优惠', SCRIPT_MARK, '隐私']) assert.ok(!got.text.includes(gone), `${gone} is not in the reading page`)
  assert.deepEqual(got.img, [site.urls.pic])
  assert.equal(got.scripts, 0)
  // v2 package K2: the default theme is 精密国际主义 (was river); the reading page cannot load the bundled font (a data: page that
  // loads nothing), so styles/reader.css names the system's Chinese UI face — the same family this check always looked for
  assert.equal(got.theme, 'precision', 'the app\'s theme (the default set)')
  assert.match(got.font, /Microsoft YaHei UI/)
  assert.match(got.csp, /default-src 'none'/)
  assert.equal(site.hits('/script-ran'), 0, 'the page\'s script never ran: its request never arrived')
  assert.ok(log().includes(`reader: ${url}: reading`))
})

test('the window\'s web contents: sandbox, context isolation, no Node, no preload, no bridge — and the reader\'s own in-memory session, not the app\'s', async () => {
  const facts = await s.app.evaluate(({ BrowserWindow, session }, partition) => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses)
    const app = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === session.defaultSession)
    const all = [win.webContents, win.contentView.children[0].webContents]
    return {
      prefs: all.map(c => { const p = c.getLastWebPreferences(); return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, nodeIntegrationInSubFrames: p.nodeIntegrationInSubFrames, nodeIntegrationInWorker: p.nodeIntegrationInWorker, webviewTag: p.webviewTag, webSecurity: p.webSecurity, preload: p.preload ?? null, hasPreloadKey: Object.hasOwn(p, 'preload') } }),
      sameSession: all.map(c => c.session === ses),
      notDefault: all.map(c => c.session !== session.defaultSession),
      persistent: ses.isPersistent(),
      sessionPreloads: ses.getPreloadScripts().length,
      appSession: app?.webContents.session === session.defaultSession,
    }
  }, READER_PARTITION)
  for (const p of facts.prefs) assert.deepEqual(p, { sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false, webSecurity: true, preload: null, hasPreloadKey: false })
  assert.deepEqual(facts.sameSession, [true, true])
  assert.deepEqual(facts.notDefault, [true, true])
  assert.equal(facts.persistent, false, 'in memory: no persist: partition')
  assert.equal(facts.sessionPreloads, 0)
  assert.equal(facts.appSession, true, 'control: the app\'s window is on the default session')
  // a preload is seen by what it exposes (getLastWebPreferences does not report one, not even the app's): the app's preload
  // gives `window.streams`; neither of the reader's pages has it, nor anything of Node
  const seen = await reader('JSON.stringify([typeof window.streams, typeof require, typeof process, typeof module, typeof Buffer])', 'JSON.stringify([typeof window.streams, typeof require, typeof process, typeof module, typeof Buffer])')
  assert.deepEqual(JSON.parse(seen.bar), ['undefined', 'undefined', 'undefined', 'undefined', 'undefined'])
  assert.deepEqual(JSON.parse(seen.page), ['undefined', 'undefined', 'undefined', 'undefined', 'undefined'])
  // control: the app's page has the bridge
  assert.equal(await s.page.evaluate(() => typeof window.streams), 'object')
})

test('原网页 in the same window (the address itself), and back to 阅读模式; a link in the reading page goes to the system browser, not into the window', async () => {
  await clickInBar('original')
  const o = await waitMode('original')
  assert.equal(o.pageUrl, site.urls.article, 'the original address, in the reader\'s window')
  await clickInBar('reading')
  const r = await waitMode('reading')
  assert.ok(r.pageUrl.startsWith('data:text/html'))
  const before = site.hits('/elsewhere')
  // a link clicked within a second of the page's load is taken for a script's redirect (reader.mjs): a moment first
  await sleep(1300)
  await reader('null', `document.querySelector('[data-reader-article] a[href$="/elsewhere"]').click(); true`)
  await waitFor(() => log().includes(`not opened in a test run: ${site.urls.elsewhere}`))
  await sleep(500)
  const after = await reader()
  assert.ok(after.pageUrl.startsWith('data:text/html'), 'the window stayed on the reading page')
  assert.equal(site.hits('/elsewhere'), before, 'nothing was loaded from the link\'s address')
  // 在浏览器里打开: the item's own address, in the system browser
  await clickInBar('browser')
  await waitFor(() => log().includes(`not opened in a test run: ${site.urls.article}`))
})

test('refused in the window: a new window, a non-http(s) address, a download', async () => {
  const windowsBefore = await s.app.evaluate(({ webContents }) => webContents.getAllWebContents().length)
  await reader('null', `window.open('${site.base}/popup', '_blank', 'width=300,height=300'); true`)
  await sleep(800)
  assert.equal(await s.app.evaluate(({ webContents }) => webContents.getAllWebContents().length), windowsBefore, 'no new web contents')
  assert.equal(site.hits('/popup'), 0, 'its address was never asked')
  // (Chromium itself stops a page going to file:; the reader's will-navigate refuses the rest — either way the window stays)
  const opened = () => (log().match(/not opened in a test run: /g) ?? []).length
  const openedBefore = opened()
  for (const target of ['file:///C:/Windows/win.ini', 'app://ui/index.html', 'javascript:void(0)', 'obsidian://open?path=x']) {
    await sleep(1100)
    await reader('null', `location.href = ${JSON.stringify(target)}; true`)
    await sleep(800)
    const r = await reader('null', 'location.href')
    assert.ok(r.pageUrl.startsWith('data:text/html'), `${target}: the window stayed where it was`)
    assert.ok(r.page.startsWith('data:text/html'), `${target}: the document is still the reading page`)
  }
  assert.equal(opened(), openedBefore, 'none of them went to the system browser either')
  assert.ok(log().includes('reader: navigation refused: app://ui/index.html'), 'the reader refused app://ui/ itself')
  const download = await s.app.evaluate(({ BrowserWindow, session }, { partition, url }) => new Promise(resolve => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses)
    // after the reader's own handler (registered first): was it refused?
    ses.once('will-download', event => resolve({ prevented: event.defaultPrevented }))
    win.contentView.children[0].webContents.downloadURL(url)
    setTimeout(() => resolve({ prevented: 'no will-download' }), 10_000)
  }), { partition: READER_PARTITION, url: site.urls.download })
  assert.deepEqual(download, { prevented: true })
  await waitFor(() => log().includes(`reader: download refused: ${site.urls.download}`))
})

test('a page with nothing to read: the original page, with 「这一页抽不出正文，显示的是原网页」; 阅读模式 cannot be chosen', async () => {
  const r = await s.page.evaluate(u => window.streams.openReader(u, 'reader'), site.urls.plain)
  assert.deepEqual(r, { ok: true, data: { mode: 'original', fallback: true } })
  const o = await waitMode('original', { note: W.fallback })
  assert.equal(o.pageUrl, site.urls.plain)
  assert.equal(W.fallback, '这一页抽不出正文，显示的是原网页')
  const bar = await reader('document.querySelector(\'[data-reader-action="reading"]\').getAttribute("aria-disabled")')
  assert.equal(bar.bar, 'true')
  assert.ok(log().includes('reader: no text taken out'))
  // control: the article again in the same window — 阅读模式, no line
  const again = await s.page.evaluate(u => window.streams.openReader(u, 'reader'), site.urls.article)
  assert.deepEqual(again.data, { mode: 'reading', fallback: false })
  await waitMode('reading')
})

test('openReader: an address that is not an item of the library, or not http(s), is refused and nothing opens', async () => {
  for (const bad of [`${site.base}/not-an-item`, 'file:///C:/Windows/win.ini', 'https://example.org/']) {
    const r = await s.page.evaluate(u => window.streams.openReader(u, 'reader'), bad)
    assert.equal(r.ok, false, bad)
    assert.equal(r.error.code, 'bad_arguments', bad)
  }
  assert.equal(site.hits('/not-an-item'), 0)
  const r = await s.page.evaluate(u => window.streams.openReader(u, 'elsewhere'), site.urls.article)
  assert.equal(r.error.code, 'bad_arguments', 'how is reader or browser')
})

test('回到条目 closes the reading window', async () => {
  const open = () => s.app.evaluate(({ BrowserWindow, session }, partition) => BrowserWindow.getAllWindows().some(w => !w.isDestroyed() && w.webContents.session === session.fromPartition(partition)), READER_PARTITION)
  assert.equal(await open(), true, 'control: open before')
  await clickInBar('back')
  await waitFor(async () => (await open()) === false)
  assert.ok(log().includes('reader: back'))
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
