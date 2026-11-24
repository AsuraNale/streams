// The reading window's rules in plain Node (src/main/reader.mjs, src/main/services/reader.mjs; v2 package H): its webPreferences
// (no preload, no Node, its own in-memory partition), the session lock (only http(s) leaves, no permission, no download), the
// guard of each web contents (the bar never navigates and only names actions; a link in the page goes to the system browser
// and only when it is http(s) and not a script's doing; redirects and frames only http(s); no new window), the two pages it
// writes (escaped, a CSP with no script, the fallback line), the charset and size limits, and openReader's check that the
// address is an item of the library. Every rule has its failing input next to its passing one. The running windows:
// test/ui-reader.test.mjs.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import {
  ACTION_ORIGIN, EXTRACT_PARTITION, EXTRACT_WEB_PREFERENCES, READER_PAGE_CSP, READER_PARTITION, READER_WEB_PREFERENCES,
  barPage, charsetOf, dataUrl, decodePage, escapeHtml, extractionScript, guardReaderContents, hardenReaderSession, isReaderSession,
  isWebUrl, readCapped, readabilitySource, readerActionOf, readerCss, readerWords, readingPage,
} from '../src/main/reader.mjs'
import { createReaderService } from '../src/main/services/reader.mjs'
import * as realCore from '../src/main/core.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { THEME_IDS, TEMPLATE_SCRIPTS } from '../src/shared/themes.mjs'

const made = []
after(() => { for (const d of made) removeTree(d, { waitMs: 3000 }) })

test('webPreferences: sandbox, context isolation, no Node anywhere, no <webview>, its own in-memory partition — and no preload key at all', () => {
  for (const [p, partition] of [[READER_WEB_PREFERENCES, READER_PARTITION], [EXTRACT_WEB_PREFERENCES, EXTRACT_PARTITION]]) {
    assert.equal(p.sandbox, true)
    assert.equal(p.contextIsolation, true)
    assert.equal(p.nodeIntegration, false)
    assert.equal(p.nodeIntegrationInWorker, false)
    assert.equal(p.nodeIntegrationInSubFrames, false)
    assert.equal(p.webviewTag, false)
    assert.equal(p.webSecurity, true)
    assert.equal(p.allowRunningInsecureContent, false)
    assert.equal(p.partition, partition)
    assert.equal(Object.hasOwn(p, 'preload'), false, 'no preload')
    assert.ok(Object.isFrozen(p))
  }
  assert.ok(!READER_PARTITION.startsWith('persist:') && !EXTRACT_PARTITION.startsWith('persist:'), 'in memory: nothing it is given is kept')
  assert.notEqual(READER_PARTITION, EXTRACT_PARTITION)
  assert.equal(EXTRACT_WEB_PREFERENCES.images, false)
})

test('isWebUrl: http(s) only; readerActionOf: only the four actions of the bar\'s own origin', () => {
  for (const ok of ['http://127.0.0.1:8080/a', 'https://example.org/x?y=1']) assert.equal(isWebUrl(ok), true, ok)
  for (const no of ['file:///C:/Windows/win.ini', 'app://ui/index.html', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x/y', 'obsidian://open', 'not a url', '', null, 'http://']) assert.equal(isWebUrl(no), false, String(no))
  assert.deepEqual(['back', 'reading', 'original', 'browser'].map(a => readerActionOf(`${ACTION_ORIGIN}/${a}`)), ['back', 'reading', 'original', 'browser'])
  for (const no of [`${ACTION_ORIGIN}/delete`, `${ACTION_ORIGIN}`, 'https://streams-reader.invalid.evil/back', 'https://example.org/back', `${ACTION_ORIGIN}/back/x`]) assert.equal(readerActionOf(no), null, no)
})

test('isReaderSession: the two partitions\' sessions, nothing else', () => {
  const sessions = new Map([[READER_PARTITION, { id: 'r' }], [EXTRACT_PARTITION, { id: 'e' }], ['', { id: 'default' }]])
  const from = p => sessions.get(p) ?? { id: p }
  assert.equal(isReaderSession(sessions.get(READER_PARTITION), from), true)
  assert.equal(isReaderSession(sessions.get(EXTRACT_PARTITION), from), true)
  assert.equal(isReaderSession(sessions.get(''), from), false)
  assert.equal(isReaderSession(null, from), false)
})

function fakeSession() {
  const s = new EventEmitter()
  s.webRequest = { onBeforeRequest: (_filter, fn) => { s.request = fn } }
  s.setPermissionRequestHandler = fn => { s.permissionRequest = fn }
  s.setPermissionCheckHandler = fn => { s.permissionCheck = fn }
  s.setDevicePermissionHandler = fn => { s.devicePermission = fn }
  s.ask = url => { let answer; s.request({ url }, a => { answer = a }); return answer }
  return s
}

test('hardenReaderSession: only http(s) (and data:) requests leave; the extraction\'s lets none; no permission; downloads cancelled', () => {
  const lines = []
  const s = fakeSession()
  hardenReaderSession(s, { log: l => lines.push(l) })
  assert.deepEqual(s.ask('https://example.org/a'), { cancel: false })
  assert.deepEqual(s.ask('http://127.0.0.1:1/b'), { cancel: false })
  assert.deepEqual(s.ask('data:image/png;base64,AA=='), { cancel: false })
  for (const no of ['file:///C:/Windows/win.ini', 'app://ui/index.html', 'ws://127.0.0.1:1/', 'chrome://gpu']) assert.deepEqual(s.ask(no), { cancel: true }, no)
  let granted = null
  s.permissionRequest(null, 'geolocation', v => { granted = v })
  assert.equal(granted, false)
  assert.equal(s.permissionCheck(), false)
  assert.equal(s.devicePermission(), false)
  let prevented = false
  s.emit('will-download', { preventDefault: () => { prevented = true } }, { getURL: () => 'http://x/data.bin' })
  assert.equal(prevented, true)
  assert.ok(lines.some(l => l.includes('download refused: http://x/data.bin')))
  const e = fakeSession()
  hardenReaderSession(e, { requests: false })
  assert.deepEqual(e.ask('https://example.org/a'), { cancel: true }, 'the extraction session lets nothing out')
})

function fakeContents({ loading = false } = {}) {
  const c = new EventEmitter()
  c.loading = loading
  c.isLoading = () => c.loading
  c.setWebRTCIPHandlingPolicy = p => { c.webrtc = p }
  c.setWindowOpenHandler = fn => { c.openHandler = fn }
  c.nav = (event, url) => { let prevented = false; c.emit(event, { url, preventDefault: () => { prevented = true } }, url); return prevented }
  c.frame = (url, isMainFrame) => { let prevented = false; c.emit('will-frame-navigate', { url, isMainFrame, preventDefault: () => { prevented = true } }); return prevented }
  return c
}

test('guardReaderContents · page: a link followed → refused here, the system browser for http(s) only; not while loading, not twice within a second', () => {
  let t = 10_000
  const opened = []
  const lines = []
  const c = fakeContents()
  guardReaderContents(c, { role: 'page', openExternal: u => opened.push(u), log: l => lines.push(l), now: () => t })
  assert.equal(c.webrtc, 'disable_non_proxied_udp')
  // before the page finished loading, and within a second after: a script's doing, not a click
  c.nav('will-navigate', 'https://example.org/before-load')
  c.emit('did-finish-load')
  t += 300
  c.nav('will-navigate', 'https://example.org/just-loaded')
  assert.deepEqual(opened, [], 'not while loading, not right after')
  t += 2000
  assert.equal(c.nav('will-navigate', 'https://example.org/next'), true, 'never loaded in the window')
  assert.deepEqual(opened, ['https://example.org/next'])
  t += 200
  assert.equal(c.nav('will-navigate', 'https://example.org/again'), true)
  assert.deepEqual(opened, ['https://example.org/next'], 'a second one within a second is not a click')
  t += 2000
  for (const no of ['file:///C:/Windows/win.ini', 'app://ui/index.html', 'javascript:alert(1)']) assert.equal(c.nav('will-navigate', no), true, no)
  assert.deepEqual(opened, ['https://example.org/next'], 'non-http(s): refused, not opened')
  c.emit('did-navigate')
  c.nav('will-navigate', 'https://example.org/while-loading')
  assert.deepEqual(opened, ['https://example.org/next'], 'while a new document loads: a script, not a click')
  c.emit('did-finish-load')
  t += 2000
  // new windows: always denied; a link meant for a new tab goes to the system browser, a pop-up nowhere
  assert.deepEqual(c.openHandler({ url: 'https://example.org/tab', disposition: 'foreground-tab' }), { action: 'deny' })
  assert.deepEqual(opened.at(-1), 'https://example.org/tab')
  t += 2000
  assert.deepEqual(c.openHandler({ url: 'https://example.org/popup', disposition: 'new-window' }), { action: 'deny' })
  assert.notEqual(opened.at(-1), 'https://example.org/popup')
  // redirects and frames: http(s) only
  assert.equal(c.nav('will-redirect', 'https://example.org/moved'), false)
  assert.equal(c.nav('will-redirect', 'file:///C:/x'), true)
  assert.equal(c.frame('https://video.example.org/embed', false), false)
  assert.equal(c.frame('about:blank', false), false)
  assert.equal(c.frame('file:///C:/x', false), true)
  assert.equal(c.frame('app://ui/index.html', false), true)
  assert.equal(c.frame('https://example.org/main', true), false, 'the main frame is will-navigate\'s')
  let webview = false
  c.emit('will-attach-webview', { preventDefault: () => { webview = true } })
  assert.equal(webview, true)
})

test('guardReaderContents · bar: never navigates; only its own actions mean something; it opens nothing', () => {
  const actions = []
  const opened = []
  const c = fakeContents()
  guardReaderContents(c, { role: 'bar', onAction: a => actions.push(a), openExternal: u => opened.push(u) })
  assert.equal(c.nav('will-navigate', `${ACTION_ORIGIN}/original`), true)
  assert.equal(c.nav('will-navigate', `${ACTION_ORIGIN}/back`), true)
  assert.equal(c.nav('will-navigate', 'https://example.org/'), true)
  assert.deepEqual(actions, ['original', 'back'])
  assert.deepEqual(opened, [])
  assert.equal(c.nav('will-redirect', 'https://example.org/'), true, 'the bar is not redirected anywhere either')
  c.openHandler({ url: 'https://example.org/', disposition: 'foreground-tab' })
  assert.deepEqual(opened, [])
  const x = fakeContents()
  const xOpened = []
  guardReaderContents(x, { role: 'extract', openExternal: u => xOpened.push(u) })
  assert.equal(x.nav('will-navigate', 'https://example.org/'), true)
  assert.equal(x.frame('https://example.org/', false), true)
  assert.deepEqual(xOpened, [])
})

const WORDS = readerWords('zh-CN')
const CSS = 'body{}'

test('the bar: the address escaped; 阅读模式 only when there is text; the fallback line only when it fell back; links only to its own actions', () => {
  const url = 'https://example.org/a?x="><script>alert(1)</script>'
  const reading = barPage({ url, mode: 'reading', canRead: true, fallback: false, words: WORDS, look: { theme: 'precision', scheme: 'light' }, css: CSS })
  assert.ok(!reading.includes('<script>'), 'escaped')
  assert.ok(reading.includes('&lt;script&gt;'))
  assert.ok(!reading.includes(WORDS.fallback))
  assert.match(reading, /data-reader-action="reading" aria-current="true"/)
  assert.match(reading, new RegExp(`data-reader-action="original" href="${ACTION_ORIGIN}/original"`))
  const fell = barPage({ url, mode: 'original', canRead: false, fallback: true, words: WORDS, look: { theme: 'glass', scheme: 'dark' }, css: CSS })
  assert.ok(fell.includes(`data-reader-note role="status">${WORDS.fallback}<`))
  assert.match(fell, /data-reader-action="reading" aria-disabled="true"/)
  // v2 package K2: the look is the theme and the appearance in force (was the theme id alone): both on <html>, both checked
  assert.match(fell, /data-theme="glass" data-appearance="dark"/)
  // redesign R1: the default theme is research (was precision); <body> carries the theme's template class and data-appearance
  assert.match(barPage({ url, mode: 'original', canRead: true, fallback: false, words: WORDS, look: { theme: 'night', scheme: '"><b>' }, css: CSS }), /data-theme="research" data-appearance="light"/, 'an unknown theme and scheme are the defaults')
  // redesign R3: <body> is the template's as the main window has it (class, data-theme, data-appearance)
  assert.match(fell, /<body class="theme-glass r9 r9-glass r10-glass r11 r11-glass rd-bar-body" data-theme="glass11" data-appearance="dark"/)
  for (const page of [reading, fell]) for (const href of page.matchAll(/href="([^"]*)"/g)) assert.ok(href[1].startsWith(`${ACTION_ORIGIN}/`), href[1])
  // redesign R3 (P20, 05-措辞规范): the bar is the template's reader-header — 返回条目 · the address · 阅读模式 | 原网页 · 在浏览器中打开 —
  // with its parts' classes; the words are the design's (the fallback line said formally)
  assert.match(reading, /<nav class="reader-header rd-bar" data-reader-bar data-mode="reading"/)
  assert.match(reading, /class="btn quiet rd-btn" data-reader-action="back"[^>]*>[^<]*<svg[^>]*>.*?<\/svg> 返回条目</)
  assert.match(reading, /class="search-field rd-url"/)
  assert.match(reading, /class="filters rd-seg"/)
  assert.match(reading, /class="filter active rd-seg__item" data-reader-action="reading" aria-current="true">阅读模式</)
  assert.match(reading, /data-reader-action="browser"[^>]*>.*? 在浏览器中打开</)
  assert.deepEqual([WORDS.back, WORDS.browser, WORDS.readingNote], ['返回条目', '在浏览器中打开', '阅读模式：仅保留正文，已移除导航与广告'])
  assert.equal(WORDS.fallback, '无法从该网页提取正文，已显示原网页。')
  assert.equal(readerWords('en').fallback.length > 0, true)
  assert.equal(readerWords('xx'), WORDS)
})

test('the reading page: a CSP with no script, frame or form; the title escaped; the article as cleaned; a data: URL in base64', () => {
  const html = readingPage({ article: { title: '<b>标题</b>', byline: '作者', siteName: '站', content: '<p>正文</p>', lang: 'zh-CN', dir: '' }, words: WORDS, look: { theme: 'research', scheme: 'light' }, css: CSS })
  assert.ok(html.includes(`content="${READER_PAGE_CSP}"`))
  assert.match(READER_PAGE_CSP, /default-src 'none'/)
  assert.doesNotMatch(READER_PAGE_CSP, /script-src/, 'no script source at all (default-src none)')
  assert.match(READER_PAGE_CSP, /frame-src 'none'/)
  assert.match(READER_PAGE_CSP, /form-action 'none'/)
  assert.ok(html.includes('&lt;b&gt;标题&lt;/b&gt;'))
  assert.ok(html.includes('<p>正文</p>'))
  // redesign R3: the template's reading paper — the line of 阅读模式 its eyebrow, the title, site · byline, the text in `readable`
  assert.ok(html.includes(`<span class="eyebrow rd-article__note" data-reader-note-line>${WORDS.readingNote}</span>`))
  assert.ok(html.includes('<p class="reader-meta rd-article__meta">站 · 作者</p>'))
  assert.match(html, /<article class="reader-paper rd-article" data-reader-article>/)
  assert.match(html, /<h1 class="reader-title rd-article__title">/)
  assert.match(html, /<div class="readable rd-article__body"><p>正文<\/p><\/div>/)
  assert.match(html, /data-theme="research" data-appearance="light"/)
  const url = dataUrl(html)
  assert.ok(url.startsWith('data:text/html;charset=utf-8;base64,'))
  assert.equal(Buffer.from(url.split(',')[1], 'base64').toString('utf8'), html)
  assert.equal(escapeHtml(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;')
})

// redesign R3: each theme's own template sheets (THEME_TEMPLATE, in order) and the reader's layer — no interim names any more;
// what would load something (the bundled face's @font-face, url(…)) is taken out of a page that may load nothing
test('the styles: each theme\'s template sheets and the reader\'s file, nothing that loads; Readability\'s own file wrapped into the extraction script', () => {
  const css = readerCss(join(DESKTOP_DIR, 'src', 'renderer'))
  assert.equal(typeof css, 'function')
  assert.match(css('research'), /\.r11-research\.r11 \{--paper:/)
  assert.doesNotMatch(css('research'), /\.r12-line\.r11\.r11 \{/, 'research has no 单线黑白 sheet')
  assert.match(css('monoline'), /\.r12-line\.r11\.r11 \{/)
  assert.match(css('glass'), /r10-glass/)
  for (const id of ['precision', 'glass', 'research', 'monoline']) {
    assert.match(css(id), /\.rd-bar\b/)
    assert.match(css(id), /\.reader-paper\b/)
    assert.doesNotMatch(css(id), /--st-page/, `${id}: no interim names`)
    assert.doesNotMatch(css(id), /@font-face|url\(/, `${id}: nothing that would load`)
  }
  assert.equal(css('night'), css('research'), 'an unknown theme: the default')
  const src = readabilitySource(DESKTOP_DIR)
  assert.match(src, /function Readability\(doc, options\)/)
  const script = extractionScript(src, '<p>x</p>', 'https://example.org/')
  assert.ok(script.includes('new DOMParser().parseFromString(html'), 'parsed by DOMParser: no script of the page runs')
  assert.ok(script.includes(JSON.stringify('<p>x</p>')))
  assert.ok(script.includes('var module;'), 'module is local: Readability defines no global')
})

test('charset: the header\'s, else a <meta>, else UTF-8; GBK is read as GBK', () => {
  const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]) // 中文 in GBK
  assert.equal(charsetOf('text/html; charset=GBK', gbk), 'gbk')
  assert.equal(charsetOf('text/html', Buffer.from('<meta charset="gb2312"><p>')), 'gb2312')
  assert.equal(charsetOf('text/html', Buffer.from('<p>none</p>')), 'utf-8')
  assert.equal(decodePage(gbk, 'gbk'), '中文')
  assert.equal(decodePage(Buffer.from('中文'), 'no-such-charset'), '中文')
})

test('readCapped: the body up to the limit; more → null, by its header or by what arrives', async () => {
  const ok = await readCapped(new Response('abcdef'), 10)
  assert.equal(Buffer.from(ok).toString(), 'abcdef')
  assert.equal(await readCapped(new Response('abcdefghijkl'), 10), null)
  assert.equal(await readCapped(new Response('ab', { headers: { 'content-length': '999' } }), 10), null)
})

function readerWorld() {
  const root = tempDir('st-reader-')
  made.push(root)
  const dir = join(root, 'lib')
  realCore.createLibrary(dir, { name: 'lib' })
  realCore.appendEvent(dir, { ev: 'seen', url: 'https://example.org/caught', source: 's', title: 't', date: '2026-11-01' })
  return { dir, library: { require: () => dir } }
}

test('openReader: only an http(s) item of the library (its record or a note\'s source); reader → the window, browser → the system browser', async () => {
  const { dir, library } = readerWorld()
  const calls = []
  const reader = { open: async url => { calls.push(['open', url]); return { mode: 'reading' } }, openExternal: url => { calls.push(['external', url]) } }
  const h = createReaderService({ library, reader, log: () => {} }).handlers
  assert.deepEqual(await h.openReader('https://example.org/caught', 'reader'), { mode: 'reading' })
  assert.equal(await h.openReader('https://example.org/caught', 'browser'), null)
  assert.deepEqual(calls, [['open', 'https://example.org/caught'], ['external', 'https://example.org/caught']])
  for (const bad of ['https://example.org/not-in-the-library', 'file:///C:/Windows/win.ini', 'app://ui/index.html']) {
    await assert.rejects(async () => h.openReader(bad, 'reader'), err => err.code === 'bad_arguments', bad)
  }
  assert.equal(calls.length, 2, 'nothing else was opened')
  // a note's source counts too (the index); the stand-in index names it
  const core = { ...realCore, readIndex: () => [{ id: 'n', source: 'https://example.org/kept' }] }
  const h2 = createReaderService({ library, reader, log: () => {}, core }).handlers
  await h2.openReader('https://example.org/kept', 'reader')
  assert.deepEqual(calls.at(-1), ['open', 'https://example.org/kept'])
  // no library open: no_library, nothing opened
  const none = createReaderService({ library: { require: () => { throw Object.assign(new Error('x'), { code: 'no_library' }) } }, reader, log: () => {} }).handlers
  await assert.rejects(async () => none.openReader('https://example.org/caught', 'reader'), err => err.code === 'no_library')
  void dir
})

// 1.1 W13 (维护者 11-23「发之前先补」): 资料库's 查看原文 (and 问库's) on a note whose original the library kept opened the page as it
// is today; now the kept one. The real core: the original is saved where an update saves it (_originals/<originalId(url)>.md).
test('W13 openReader: a note\'s source whose original was kept → the kept one (stored, no mark); none kept → the page; not in the library → refused even with a file', async () => {
  const { dir, library } = readerWorld()
  const NOTE = 'https://example.org/kept-note'
  const BARE = 'https://example.org/note-without-original'
  const STRANGER = 'https://example.org/not-in-the-library-at-all'
  realCore.saveOriginal(dir, { url: NOTE, title: 'The kept words', text: 'First paragraph.\n\nSecond paragraph.', method: 'direct', fetchedAt: '2026-11-20T10:00:00.000Z' })
  realCore.saveOriginal(dir, { url: STRANGER, title: 'x', text: 'y', method: 'direct', fetchedAt: '2026-11-20T10:00:00.000Z' })
  const calls = []
  const reader = { open: async (url, o) => { calls.push([url, o ?? null]); return { mode: o?.stored ? 'stored' : 'reading' } }, openExternal: () => { throw new Error('not the browser') } }
  const core = { ...realCore, readIndex: () => [{ id: 'a', source: NOTE }, { id: 'b', source: BARE }] }
  const h = createReaderService({ library, reader, log: () => {}, core }).handlers
  // the failing state first: the note is in no 待看 (where 1.1 W6a looked) — so before W13 this opened the page
  assert.equal(realCore.readInboxItem(dir, NOTE), null)
  assert.deepEqual(await h.openReader(NOTE, 'reader'), { mode: 'stored' })
  const [url, o] = calls.at(-1)
  assert.equal(url, NOTE)
  assert.deepEqual(o.stored, { title: 'The kept words', text: 'First paragraph.\n\nSecond paragraph.', fetchedAt: '2026-11-20T10:00:00.000Z', method: 'direct' })
  assert.equal(o.mark, null, 'a note has no point to mark')
  assert.equal(o.point, null)
  // a point asked for on a note: still no mark (only 待看's summaries have anchors)
  await h.openReader(NOTE, 'reader', 1)
  assert.equal(calls.at(-1)[1].mark, null)
  // no original kept: the page, as before
  assert.deepEqual(await h.openReader(BARE, 'reader'), { mode: 'reading' })
  assert.deepEqual(calls.at(-1), [BARE, null])
  // an address the library does not know: refused, though a file for it is there
  await assert.rejects(async () => h.openReader(STRANGER, 'reader'), err => err.code === 'bad_arguments')
  assert.equal(calls.length, 3, 'nothing else was opened')
})

test('W13 openReader: an item of 待看 is as in W6a — its own original with the point marked; one whose page was not read opens the page', async () => {
  const { dir, library } = readerWorld()
  const URL_A = 'https://example.org/in-inbox'
  const URL_B = 'https://example.org/in-inbox-unread'
  const text = 'Alpha sentence here.\n\nBeta sentence there.'
  const { id } = realCore.saveOriginal(dir, { url: URL_A, title: 'A', text, method: 'direct', fetchedAt: '2026-11-20T10:00:00.000Z' })
  const start = text.indexOf('Beta')
  const core = {
    ...realCore,
    readIndex: () => [],
    readInboxItem: (_d, u) => (u === URL_A ? { url: URL_A, title: 'A', original: { saved: true, id }, summary: { anchors: [{ point: 1, start, end: start + 4 }] } }
      : u === URL_B ? { url: URL_B, title: 'B', original: { saved: false, missing: 'original-not-saved' } } : null),
    replayLedger: () => ({ states: new Map([[URL_A, {}], [URL_B, {}]]) }),
  }
  const calls = []
  const reader = { open: async (url, o) => { calls.push([url, o ?? null]); return null }, openExternal: () => {} }
  const h = createReaderService({ library, reader, log: () => {}, core }).handlers
  await h.openReader(URL_A, 'reader', 1)
  assert.deepEqual(calls.at(-1)[1].mark, { start, end: start + 4 })
  assert.equal(calls.at(-1)[1].point, 1)
  await h.openReader(URL_B, 'reader')
  assert.deepEqual(calls.at(-1), [URL_B, null])
})

// redesign R6d (docs/checks/2026-11-15-r6d/对照.md, 阅读窗口): the bar's 返回条目 was one bent arrow in all four themes; the design's
// pictures show each theme's own back (精密国际主义 |←, 澄明玻璃 a chevron in a disc, 研究对话 the return key's arrow, 单线黑白 ←).
// The bar's page runs no script, so reader.mjs holds the paths; here they are held to the template's own icon data, read
// the way index.html loads it (shared/themes.mjs TEMPLATE_SCRIPTS) and drawn the way the template draws an icon (the layered
// control symbol when the edition has one, else the edition's path — lib/template-icons.js TIcon).
test("redesign R6d: the bar draws the look's own back and external — the paths of the theme's edition of the template, not one shape for all four", () => {
  const window = {}
  const ctx = vm.createContext({ window, document: { body: { dataset: { theme: 'research11' }, classList: { add() {}, contains: () => false } }, documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} } })
  for (const file of TEMPLATE_SCRIPTS) vm.runInContext(readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'template', ...file.split('/')), 'utf8'), ctx, { filename: file })
  const line = window.yunzhiVisualEdition
  const edition = theme => (theme === 'monoline' ? line : window.yunzhiRound11Edition(`${theme}11`))
  // the last script leaves 单线黑白's edition; the round 11 line above set it first for the stub's body — it must be the line edition now
  assert.equal(line?.controlArt?.back ?? null, null, "单线黑白's edition has no layered back")
  const backs = new Map()
  for (const theme of THEME_IDS) {
    const e = edition(theme)
    assert.ok(e?.icons?.back && e?.icons?.external, `${theme}: the template's edition was read`)
    const html = barPage({ url: 'https://example.org/a', mode: 'reading', canRead: true, fallback: false, words: readerWords('zh-CN'), look: { theme, scheme: 'light' }, css: '' })
    const back = /data-reader-action="back"[^>]*>(<svg.*?<\/svg>)/.exec(html)?.[1] ?? ''
    const layers = e.controlArt?.back ?? [{ d: e.icons.back }]
    assert.deepEqual([...back.matchAll(/<path(?: class="([^"]*)")? d="([^"]*)"/g)].map(m => [m[2], m[1] ?? null]), [...layers].map(l => [l.d, l.tone ? `symbol-${l.tone}` : null]), `${theme}: 返回条目's icon`)
    assert.equal(/class="ico control-symbol"/.test(back), Boolean(e.controlArt?.back), `${theme}: a layered symbol is marked as one`)
    assert.equal(html.split(`d="${e.icons.external}"`).length - 1, 2, `${theme}: the address and 在浏览器中打开 draw the theme's external`)
    backs.set(theme, back)
  }
  assert.equal(new Set(backs.values()).size, THEME_IDS.length, 'the four themes do not share one back')
})
