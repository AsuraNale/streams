/**
 * The reading window (v2 package H; design UC4 step 3; docs/desktop.md §4.9): 「打开原文」 opens the item's address in a window of
 * its own, isolated from the app — not the app's page, not its session, not its bridge.
 *
 *   - Every web contents of it has the webPreferences below: sandbox, context isolation, no Node anywhere, no <webview>, its own
 *     in-memory session partition (READER_PARTITION: no `persist:`, so nothing it is given is kept), and **no preload**: the
 *     object has no `preload` key and the reader never passes one, so the page it shows has no `window.streams`.
 *   - The window is two web contents: the bar (the BrowserWindow's own: 返回条目 · the address · 阅读模式 | 原网页 · 在浏览器中打开)
 *     and the page under it (a WebContentsView). Both are static pages the main process writes (data: URLs, a CSP with no
 *     script at all) or, for 原网页, the address itself. The bar talks to the main process without any bridge: its buttons are
 *     links to https://streams-reader.invalid/<action>, and the bar's `will-navigate` (always refused) reads the action.
 *   - The session (hardenReaderSession): only http(s) and data: requests leave; every permission is refused; downloads are
 *     cancelled. The contents (guardReaderContents): no new window (a link meant for a new tab opens in the system browser),
 *     no <webview>; a link followed in the page is refused there and opened with the system browser (http(s) only, through
 *     `openExternal`); a redirect or a frame may load only http(s); WebRTC sends no UDP of its own.
 *   - The app's own guard (security.mjs guardContents, on every web contents) would keep these on app://ui/: main.mjs leaves
 *     out the contents of the reader's two sessions (isReaderContents) and this module guards them instead.
 *
 * 阅读模式 (extract): the main process fetches the page through the reader's session (http(s), 20 s, 5 MB, html only), then a
 * hidden window of a third partition (EXTRACT_PARTITION, every request of it refused, no preload, sandboxed) parses the text
 * with DOMParser — a document made that way runs none of the page's scripts and loads nothing — and runs
 * @mozilla/readability (Apache-2.0) on it. What comes out is cleaned again (no script, style, frame, form, embed, event
 * attribute, or link that is not http(s)) and written into the reading page under a CSP that allows no script, no frame, no
 * form. Too little text (MIN_TEXT characters) or text that is mostly links → nothing to read: the window shows the original
 * page with the line 「无法从该网页提取正文，已显示原网页。」. Nothing of the page is written into the library.
 *
 * Redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-6; design 03-页面稿 P20, 07-模板版 「阅读窗口」): both pages are drawn with
 * the template's own parts and style sheets — the bar is the template's `reader-header` (返回条目 as `btn quiet`, the address in a
 * `search-field`, 阅读模式 · 原网页 as `filters`, 在浏览器中打开), the reading page its `reader-scroll` › `reader-paper` (the line
 * 「阅读模式：仅保留正文，已移除导航与广告」 as its `eyebrow`, `reader-title`, `reader-meta`, the text in `readable`) — under the
 * theme and the appearance of the main window (the theme's sheets in its order, <body>'s classes and data-appearance). The
 * isolation is as it was: the same webPreferences, sessions, guards and CSP.
 *
 * Electron is given (BrowserWindow, WebContentsView, session, shell), so the pure parts run under plain Node
 * (test/reader.test.mjs); the running windows are checked in test/ui-reader.test.mjs.
 * @module desktop/main/reader
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { themeOf, windowColour } from './theme.mjs'
import { THEME_TEMPLATE, isScheme } from '../shared/themes.mjs'
import { APP } from './texts/app.js'
import { APP as APP_EN } from './texts-en/app.js'

/** The reading window's session: in memory only (no `persist:`), apart from the app's default session. */
export const READER_PARTITION = 'streams-reader'
/** The hidden window that takes the text out: a session of its own where every request is refused. */
export const EXTRACT_PARTITION = 'streams-reader-extract'
export const READER_PARTITIONS = Object.freeze([READER_PARTITION, EXTRACT_PARTITION])

/** webPreferences of both web contents of the reading window. No preload, ever. */
export const READER_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  spellcheck: false,
  safeDialogs: true,
  enableWebSQL: false,
  partition: READER_PARTITION,
})

/** The hidden window of the extraction: the same, in its own session, no images. */
export const EXTRACT_WEB_PREFERENCES = Object.freeze({ ...READER_WEB_PREFERENCES, partition: EXTRACT_PARTITION, images: false })

/** Where the bar's buttons point: never loaded, only read by the bar's will-navigate. */
export const ACTION_ORIGIN = 'https://streams-reader.invalid'
export const READER_ACTIONS = Object.freeze(['back', 'reading', 'stored', 'original', 'browser'])

// redesign R3: the template's reader-header (its buttons and the address field) is 60 px high
export const BAR_HEIGHT = 60
export const MIN_TEXT = 200
export const MAX_LINK_SHARE = 0.5
export const MAX_PAGE_BYTES = 5 * 1024 * 1024
export const FETCH_TIMEOUT_MS = 20_000
export const EXTRACT_TIMEOUT_MS = 15_000
// Chromium refuses a URL longer than 2 MB; a reading page that would need more falls back to the original page
export const MAX_DATA_URL = 2_000_000
// a page that sends the system browser somewhere on its own (a script's redirect) is not a click: only one opening per second,
// and none while the page is still loading or within a second after it finished
const EXTERNAL_GAP_MS = 1000

const TABLES = Object.freeze({ 'zh-CN': APP.reader, en: APP_EN.reader })
/** The reader's words in a language ('zh-CN' | 'en'). */
export const readerWords = lang => TABLES[lang] ?? TABLES['zh-CN']

/** An http(s) address (nothing else is ever loaded, fetched or opened by the reader). */
export function isWebUrl(url) {
  if (typeof url !== 'string' || url.length > 8000) return false
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host !== ''
  } catch {
    return false
  }
}

/** The action a link of the bar names (https://streams-reader.invalid/<action>), or null. */
export function readerActionOf(url) {
  if (typeof url !== 'string' || !url.startsWith(`${ACTION_ORIGIN}/`)) return null
  const name = url.slice(ACTION_ORIGIN.length + 1)
  return READER_ACTIONS.includes(name) ? name : null
}

/** Is this session one of the reader's? (main.mjs: the app's own guard leaves its contents to guardReaderContents.) */
export function isReaderSession(ses, fromPartition) {
  return Boolean(ses) && READER_PARTITIONS.some(p => fromPartition(p) === ses)
}

const short = url => String(url).slice(0, 200)

/**
 * Lock a reader session: only http(s) (and data:) requests leave — or none at all (`requests: false`, the extraction's);
 * every permission refused; downloads cancelled.
 * @param {Electron.Session} ses
 * @param {{requests?: boolean, log?: (line: string) => void}} [opts]
 */
export function hardenReaderSession(ses, { requests = true, log = () => {} } = {}) {
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const ok = requests && (isWebUrl(details.url) || details.url.startsWith('data:'))
    if (!ok) log(`reader: request refused: ${short(details.url)}`)
    callback({ cancel: !ok })
  })
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', (event, item) => {
    event.preventDefault()
    log(`reader: download refused: ${short(item?.getURL?.() ?? '')}`)
  })
}

/**
 * Lock one web contents of the reader.
 *   role 'bar'      never navigates: a link to an action is that action (onAction), anything else is refused
 *   role 'page'     a link followed is refused here and opened with the system browser (http(s) only, openExternal);
 *                   while the page loads, within a second after it finished, or within a second of the last opening, it
 *                   is refused only (a script's redirect, not a click)
 *   role 'extract'  never navigates, opens nothing
 * In all: no new window, no <webview>, redirects and frames only http(s), no UDP of WebRTC's own.
 * @param {Electron.WebContents} contents
 * @param {{role: 'bar'|'page'|'extract', onAction?: (name: string) => void, openExternal?: (url: string) => void, log?: (line: string) => void, now?: () => number}} o
 */
export function guardReaderContents(contents, { role, onAction = () => {}, openExternal = () => {}, log = () => {}, now = Date.now }) {
  let lastOpened = -Infinity
  // when the page's document finished loading (Infinity: a new document is loading). (isLoading() cannot tell: a link's own
  // navigation already counts as loading when will-navigate comes.)
  let loadedAt = Infinity
  contents.on('did-navigate', () => { loadedAt = Infinity })
  contents.on('did-finish-load', () => { loadedAt = now() })
  contents.on('did-fail-load', () => { loadedAt = now() })
  const toBrowser = (url, why) => {
    if (role !== 'page' || !isWebUrl(url)) { log(`reader: ${why} refused: ${short(url)}`); return }
    const t = now()
    if (t - loadedAt < EXTERNAL_GAP_MS || loadedAt === Infinity || t - lastOpened < EXTERNAL_GAP_MS) { log(`reader: ${why} refused (not a click): ${short(url)}`); return }
    lastOpened = t
    openExternal(url)
  }
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  contents.on('will-attach-webview', event => event.preventDefault())
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === 'foreground-tab' || disposition === 'background-tab') toBrowser(url, 'new window')
    else log(`reader: new window refused: ${short(url)}`)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, legacyUrl) => {
    event.preventDefault()
    const url = event?.url ?? legacyUrl
    if (role === 'bar') {
      const action = readerActionOf(url)
      if (action) onAction(action)
      else log(`reader: navigation refused: ${short(url)}`)
      return
    }
    toBrowser(url, 'navigation')
  })
  contents.on('will-redirect', (event, legacyUrl) => {
    const url = event?.url ?? legacyUrl
    if (role !== 'page' || !isWebUrl(url)) { event.preventDefault(); log(`reader: redirect refused: ${short(url)}`) }
  })
  contents.on('will-frame-navigate', details => {
    // the main frame: will-navigate above; a frame inside the page: http(s) only (and its own blank start)
    if (details.isMainFrame !== false) return
    const url = String(details.url ?? '')
    if (role !== 'page' || !(isWebUrl(url) || url === 'about:blank' || url === 'about:srcdoc')) { details.preventDefault(); log(`reader: frame refused: ${short(url)}`) }
  })
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Text for HTML (an element's text or an attribute's value). */
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPES[c])

/** The CSP of the pages the reader writes: no script, no frame, no form; pictures from the web. */
export const READER_PAGE_CSP = "default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'"

// v2 package K2: `look` is { theme, scheme } (main.mjs currentLook): <html> gets data-theme and data-appearance (light | dark),
// both checked, so the reading window is in the same set as the app's. Redesign R1: <body> also gets the theme's template
// classes and data-appearance. Redesign R3: `css` is readerCss(): the sheets of the look's theme, in its order.
function page({ words, look, css, title, bodyClass, lang, dir, body }) {
  const d = dir === 'rtl' ? ' dir="rtl"' : ''
  const scheme = isScheme(look?.scheme) ? look.scheme : 'light'
  const theme = themeOf(look?.theme)
  const t = THEME_TEMPLATE[theme]
  const sheets = typeof css === 'function' ? css(theme) : String(css ?? '')
  return `<!doctype html><html lang="${escapeHtml(lang || words.lang)}"${d} data-theme="${theme}" data-appearance="${scheme}"><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="${READER_PAGE_CSP}">`
    + `<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${sheets}</style></head>`
    + `<body class="${t.bodyClass} ${bodyClass}" data-theme="${t.dataTheme}" data-appearance="${scheme}" data-product="streams">${body}</body></html>`
}

// the two glyphs the bar shows (the template's back and external), drawn as the template draws an icon (svg.ico: a stroke of the
// theme's ink); written out here because the bar's page runs no script
// Redesign R6d (docs/checks/2026-11-15-r6d/对照.md, 阅读窗口): each theme's own back and external — the design's pictures of the
// reading window show 精密国际主义's |←, 澄明玻璃's chevron in a disc, 研究对话's return arrow and 单线黑白's ←; one bent arrow
// was written here for all four. The paths are the template's (template/shared/round9/edition.js, round12/edition.js: the
// edition's layered control symbol for back where it has one — a layer is [path, tone] —, its icon otherwise; external is the
// edition's icon); test/reader.test.mjs holds this table to those files.
const GLYPH = Object.freeze({
  precision: Object.freeze({ back: [['M22 12H6m6-6-6 6 6 6 M3 5v14']], layered: true, external: 'M13 4h7v7 M20 4 10 14 M9 5H4v15h15v-5' }),
  glass: Object.freeze({ back: [['M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z', 'wash'], ['m14 7-5 5 5 5']], layered: true, external: 'M13 4h7v7 M20 4l-9 9 M8 5H4v15h15v-4' }),
  research: Object.freeze({ back: [['M21 6v4q0 4-4 4H4m6-6-6 6 6 6']], layered: true, external: 'M13 4h7v7 M20 4l-9 9 M8 5H4v15h15v-4' }),
  monoline: Object.freeze({ back: [['M21 12H5 M11 6l-6 6 6 6']], layered: false, external: 'M13 4h7v7 M20 4 10 14 M10 6H4v14h14v-6' }),
})
/** An icon of the bar in the look's theme: 'back' (the template's control symbol, layer by layer) or 'external'. */
function glyph(name, look) {
  const g = GLYPH[themeOf(look?.theme)]
  if (name === 'external') return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${g.external}"/></svg>`
  return `<svg class="${g.layered ? 'ico control-symbol' : 'ico'}" viewBox="0 0 24 24" aria-hidden="true">${g.back.map(([d, tone]) => `<path${tone ? ` class="symbol-${tone}"` : ''} d="${d}"/>`).join('')}</svg>`
}

/**
 * The bar's page (the template's reader-header). `mode`: 'loading' | 'reading' | 'original'; `canRead`: the text was taken out
 * (阅读模式 can be chosen); `fallback`: it could not be, so the original page is shown with the line saying so.
 */
export function barPage({ url, mode, canRead, fallback, words, look, css, stored = false }) {
  const action = name => `${ACTION_ORIGIN}/${name}`
  const seg = (name, label, enabled) => {
    const cur = mode === name
    if (cur) return `<span class="filter active rd-seg__item" data-reader-action="${name}" aria-current="true">${escapeHtml(label)}</span>`
    if (!enabled) return `<span class="filter rd-seg__item" data-reader-action="${name}" aria-disabled="true">${escapeHtml(label)}</span>`
    return `<a class="filter rd-seg__item" data-reader-action="${name}" href="${action(name)}">${escapeHtml(label)}</a>`
  }
  const body = `<nav class="reader-header rd-bar" data-reader-bar data-mode="${mode}" data-fallback="${String(Boolean(fallback))}">`
    + `<a class="btn quiet rd-btn" data-reader-action="back" href="${action('back')}">${glyph('back', look)} ${escapeHtml(words.back)}</a>`
    + `<span class="search-field rd-url" role="group" aria-label="${escapeHtml(words.address)}">${glyph('external', look)}<span class="rd-url__text" data-reader-url title="${escapeHtml(url)}">${escapeHtml(url)}</span></span>`
    + (fallback ? `<span class="rd-note" data-reader-note role="status">${escapeHtml(words.fallback)}</span>` : '')
    + `<span class="filters rd-seg" role="group" aria-label="${escapeHtml(words.modes)}">${stored ? seg('stored', words.stored, true) : seg('reading', words.reading, canRead)}${seg('original', words.original, mode !== 'loading')}</span>`
    + `<a class="btn quiet rd-btn" data-reader-action="browser" href="${action('browser')}">${glyph('external', look)} ${escapeHtml(words.browser)}</a>`
    + '</nav>'
  return page({ words, look, css, title: words.windowTitle, bodyClass: 'rd-bar-body', body })
}

/** The page under the bar while the text is being taken out. */
export function waitPage({ words, look, css }) {
  return page({ words, look, css, title: words.windowTitle, bodyClass: 'rd-page', body: `<div class="reader-scroll rd-scroll"><p class="reader-note rd-wait" data-reader-wait>${escapeHtml(words.loading)}</p></div>` })
}

/**
 * The reading page (the template's reader-paper): the line saying what 阅读模式 is, the title, a line (site · byline), the
 * cleaned text in `readable`.
 */
export function readingPage({ article, words, look, css }) {
  const meta = [article.siteName, article.byline].map(s => String(s ?? '').trim()).filter(Boolean)
  const body = '<div class="reader-scroll rd-scroll"><article class="reader-paper rd-article" data-reader-article>'
    + `<span class="eyebrow rd-article__note" data-reader-note-line>${escapeHtml(words.readingNote)}</span>`
    + `<h1 class="reader-title rd-article__title">${escapeHtml(article.title)}</h1>`
    + (meta.length ? `<p class="reader-meta rd-article__meta">${escapeHtml(meta.join(' · '))}</p>` : '')
    + `<div class="readable rd-article__body">${article.content}</div></article></div>`
  return page({ words, look, css, title: article.title || words.windowTitle, bodyClass: 'rd-page', lang: article.lang, dir: article.dir, body })
}

/** 1.1 W6a: the id of the marked sentence (the page is loaded at #MARK_ID, so it opens scrolled to it — no script needed). */
export const MARK_ID = 'streams-mark'
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(v, k) ? String(v[k]) : m))
const localTime = iso => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 1.1 W6a (A4): the page of the original Streams kept (_originals/<id>.md, read by the main process): its text in paragraphs,
 * escaped (it is plain text — nothing of it is markup), and, when `mark` { start, end } is given (offsets in the text: the place
 * of one point of the summary, core verify/original-check.mjs), that stretch wrapped in <mark id=MARK_ID>. `point` (0-based) is
 * the point it was opened from.
 */
export function storedPage({ stored, mark = null, point = null, words, look, css }) {
  const text = String(stored.text ?? '')
  const m = mark && Number.isInteger(mark.start) && Number.isInteger(mark.end) && mark.start >= 0 && mark.end > mark.start && mark.end <= text.length ? mark : null
  const paras = []
  const re = /\n\s*\n/g
  let at = 0
  for (let x = re.exec(text); ; x = re.exec(text)) {
    const end = x ? x.index : text.length
    paras.push([at, end])
    if (!x) break
    at = x.index + x[0].length
  }
  let opened = false
  const body = paras.filter(([a, b]) => text.slice(a, b).trim() !== '').map(([a, b]) => {
    if (!m || m.end <= a || m.start >= b) return `<p>${escapeHtml(text.slice(a, b))}</p>`
    const s = Math.max(a, m.start)
    const e = Math.min(b, m.end)
    const id = opened ? '' : ` id="${MARK_ID}"`
    opened = true
    return `<p>${escapeHtml(text.slice(a, s))}<mark class="rd-mark"${id}>${escapeHtml(text.slice(s, e))}</mark>${escapeHtml(text.slice(e, b))}</p>`
  }).join('')
  const vals = { when: localTime(stored.fetchedAt), method: words.methods?.[stored.method] ?? '', n: Number.isInteger(point) ? point + 1 : '' }
  const note = fill(Number.isInteger(point) ? words.storedNoteFrom : words.storedNote, vals)
  const html = '<style>.rd-mark{background:color-mix(in srgb,var(--accent) 20%,transparent);color:inherit;box-shadow:inset 0 -2px 0 var(--accent);border-radius:2px;padding:1px 0;scroll-margin-top:96px}</style>'
    + '<div class="reader-scroll rd-scroll"><article class="reader-paper rd-article" data-reader-article data-reader-stored>'
    + `<span class="eyebrow rd-article__note" data-reader-note-line>${escapeHtml(note)}</span>`
    + `<h1 class="reader-title rd-article__title">${escapeHtml(stored.title || '')}</h1>`
    + `<div class="readable rd-article__body">${body}</div></article></div>`
  return page({ words, look, css, title: stored.title || words.windowTitle, bodyClass: 'rd-page', body: html })
}

/** A page as a data: URL (base64: Chinese text stays a third larger, not nine times). */
export const dataUrl = html => `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`

/** The charset of a page: the Content-Type's, else a <meta> in its first 2 KB, else UTF-8. */
export function charsetOf(contentType, bytes) {
  const fromType = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType ?? '')?.[1]
  if (fromType) return fromType.toLowerCase()
  const head = Buffer.from(bytes.subarray(0, 2048)).toString('latin1')
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1]
  return fromMeta ? fromMeta.toLowerCase() : 'utf-8'
}

/** Bytes as text in a charset; one the runtime does not know is read as UTF-8. */
export function decodePage(bytes, charset) {
  try { return new TextDecoder(charset).decode(bytes) } catch { return new TextDecoder('utf-8').decode(bytes) }
}

/** The body of a response, up to `max` bytes; null when there is more. */
export async function readCapped(response, max = MAX_PAGE_BYTES) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return null
  if (!response.body) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const parts = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel().catch(() => {}); return null }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out
}

/**
 * Runs in the hidden window (stringified): the page's text parsed by DOMParser (inert: none of its scripts run, nothing is
 * loaded), Readability on it, the result cleaned. Returns { ok: false, why } or { ok: true, title, byline, siteName, content,
 * length, lang, dir }.
 */
/* c8 ignore start */
function extractInPage(Readability, html, base, minText, maxLinkShare) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let href = base
  const own = doc.querySelector('base[href]')?.getAttribute('href')
  try { if (own) href = new URL(own, base).href } catch { href = base }
  for (const el of [...doc.querySelectorAll('base')]) el.remove()
  const baseEl = doc.createElement('base')
  baseEl.setAttribute('href', href)
  ;(doc.head ?? doc.documentElement).prepend(baseEl)
  const DROP = 'script,style,link,meta,iframe,frame,frameset,object,embed,applet,form,input,button,select,textarea,noscript,template,svg,math,canvas,audio,video,source,track,base,dialog,portal'
  const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'cite', 'longdesc', 'data']
  const clean = el => {
    for (const bad of [...el.querySelectorAll(DROP)]) bad.remove()
    for (const node of [...el.querySelectorAll('*')]) {
      for (const a of [...node.attributes]) {
        const name = a.name.toLowerCase()
        const value = a.value.trim()
        if (name.startsWith('on') || name === 'style' || name === 'srcdoc' || name === 'srcset' || name === 'target' || name === 'ping') node.removeAttribute(a.name)
        else if (URL_ATTRS.includes(name)) {
          let ok = false
          try { const u = new URL(value, href); ok = u.protocol === 'http:' || u.protocol === 'https:' || (name === 'src' && /^data:image\//i.test(value)); if (ok && !/^data:/i.test(value)) node.setAttribute(a.name, u.href) } catch { ok = false }
          if (!ok) node.removeAttribute(a.name)
        }
      }
    }
    return el.innerHTML
  }
  let article = null
  try { article = new Readability(doc, { serializer: clean }).parse() } catch (err) { return { ok: false, why: `readability: ${String(err && err.message || err)}` } }
  if (!article || typeof article.content !== 'string') return { ok: false, why: 'nothing' }
  const holder = new DOMParser().parseFromString(`<div>${article.content}</div>`, 'text/html').body
  const text = (holder.textContent || '').replace(/\s+/g, ' ').trim()
  const linkText = [...holder.querySelectorAll('a')].map(a => a.textContent || '').join('').replace(/\s+/g, ' ').trim()
  if (text.length < minText) return { ok: false, why: `too little text (${text.length})` }
  if (linkText.length / text.length > maxLinkShare) return { ok: false, why: 'mostly links' }
  return { ok: true, title: String(article.title || ''), byline: String(article.byline || ''), siteName: String(article.siteName || ''), content: article.content, length: text.length, lang: String(article.lang || ''), dir: String(article.dir || '') }
}
/* c8 ignore stop */

/** The script the hidden window runs: Readability (its own file, unchanged, wrapped so it defines no global) and the call. */
export function extractionScript(readabilitySource, html, base) {
  return `(() => { const Readability = (function () { var module; ${readabilitySource}\n; return Readability })();\n`
    + `return (${extractInPage.toString()})(Readability, ${JSON.stringify(html)}, ${JSON.stringify(base)}, ${MIN_TEXT}, ${MAX_LINK_SHARE}) })()`
}

/** @mozilla/readability's own file, as installed (desktop/node_modules; resources/app/node_modules in an install). */
export function readabilitySource(desktopDir) {
  return readFileSync(join(desktopDir, 'node_modules', '@mozilla', 'readability', 'Readability.js'), 'utf8')
}

/**
 * What the reading pages are styled with (redesign R3): for each theme, the template's own sheets of that theme in its order
 * (shared/themes.mjs THEME_TEMPLATE — the unchanged files of src/renderer/template/, the ones the main window loads), then the
 * reader's own small layer (styles/reader.css: sizes and places only, no colour). The pages are data: URLs under a CSP that
 * loads nothing, so what would be fetched is taken out of the sheets first: the template's @font-face rules (the bundled face
 * cannot load here; the theme's font stack falls back to the system's Chinese UI face) and every url(…) (single-line black and
 * white's brand mark, which these pages do not show). Read once; returns theme id → css.
 */
export function readerCss(rendererDir) {
  const own = readFileSync(join(rendererDir, 'styles', 'reader.css'), 'utf8')
  const tpl = join(rendererDir, 'template')
  const loadless = text => text.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/url\([^)]*\)/g, 'none')
  const byTheme = new Map(Object.entries(THEME_TEMPLATE).map(([id, t]) => [id, [...t.sheets.map(f => loadless(readFileSync(join(tpl, ...f.split('/')), 'utf8'))), own].join('\n')]))
  return theme => byTheme.get(themeOf(theme))
}

const withTimeout = (promise, ms, what) => {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: timed out after ${ms} ms`)), ms) })]).finally(() => clearTimeout(timer))
}

/**
 * The reading window. One at a time: opening another address while it is open shows that one in it.
 * @param {object} o
 * @param {typeof Electron.BrowserWindow} o.BrowserWindow
 * @param {typeof Electron.WebContentsView} o.WebContentsView
 * @param {typeof Electron.session} o.session
 * @param {{openExternal: (url: string) => Promise<void>}} o.shell
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: the window is not shown and the system browser is not opened (the log says so)
 * @param {string} [o.icon]
 * @param {() => string} o.locale - 'zh-CN' | 'en'
 * @param {() => {theme: string, scheme: string}} o.theme - the look in force (main.mjs currentLook; v2 package K2: the theme and
 *   light | dark — it was the theme id alone)
 * @param {string} o.css - readerCss()
 * @param {string} o.readability - readabilitySource()
 * @param {() => void} [o.onBack] - 「回到条目」: the app's window to the front
 */
export function createReader({ BrowserWindow, WebContentsView, session, shell, log, hidden = false, icon, locale, theme, css, readability, onBack = () => {} }) {
  const readerSession = session.fromPartition(READER_PARTITION)
  hardenReaderSession(readerSession, { requests: true, log })
  hardenReaderSession(session.fromPartition(EXTRACT_PARTITION), { requests: false, log })

  let win = null
  let view = null
  let state = null
  let seq = 0
  const words = () => readerWords(locale())

  const openExternal = url => {
    if (!isWebUrl(url)) { log(`reader: not opened (not http(s)): ${short(url)}`); return }
    if (hidden) { log(`not opened in a test run: ${url}`); return }
    shell.openExternal(url).catch(err => log(`reader: openExternal failed: ${String(err?.message ?? err)}`))
  }

  const load = (contents, url) => contents.loadURL(url).catch(err => log(`reader: load of ${short(url.startsWith('data:') ? 'a page of its own' : url)}: ${String(err?.code ?? err?.message ?? err)}`))
  const renderBar = () => {
    if (!win || win.isDestroyed() || !state) return
    load(win.webContents, dataUrl(barPage({ url: state.url, mode: state.mode, canRead: Boolean(state.article), fallback: state.fallback, words: words(), look: theme(), css, stored: Boolean(state.stored) })))
  }
  const showReading = () => {
    const html = readingPage({ article: state.article, words: words(), look: theme(), css })
    const url = dataUrl(html)
    if (url.length > MAX_DATA_URL) { log('reader: the reading page is too large; the original page instead'); state.article = null; showOriginal(true); return }
    state.mode = 'reading'
    state.fallback = false
    renderBar()
    load(view.webContents, url)
  }
  // 1.1 W6a (A4): the kept original, at its marked sentence when opened from a point
  const showStored = () => {
    const html = storedPage({ ...state.stored, words: words(), look: theme(), css })
    const url = dataUrl(html)
    if (url.length > MAX_DATA_URL) { log('reader: the kept original is too large to show; the original page instead'); state.stored = null; showOriginal(true); return }
    state.mode = 'stored'
    state.fallback = false
    renderBar()
    load(view.webContents, `${url}#${MARK_ID}`)
  }
  const showOriginal = fallback => {
    state.mode = 'original'
    state.fallback = fallback
    renderBar()
    load(view.webContents, state.url)
  }
  const layout = () => {
    if (!win || win.isDestroyed() || !view) return
    const [width, height] = win.getContentSize()
    view.setBounds({ x: 0, y: BAR_HEIGHT, width, height: Math.max(0, height - BAR_HEIGHT) })
  }
  const onAction = name => {
    if (!state) return
    log(`reader: ${name}`)
    if (name === 'back') { onBack(); win?.close(); return }
    if (name === 'browser') { openExternal(state.url); return }
    if (name === 'stored' && state.stored) showStored()
    else if (name === 'reading' && state.article) showReading()
    else if (name === 'original' && state.mode !== 'loading') showOriginal(false)
  }

  function ensureWindow() {
    if (win && !win.isDestroyed()) return
    win = new BrowserWindow({
      width: 1100,
      height: 860,
      useContentSize: true,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: words().windowTitle,
      backgroundColor: windowColour(theme().theme, theme().scheme),
      autoHideMenuBar: true,
      ...(icon ? { icon } : {}),
      webPreferences: { ...READER_WEB_PREFERENCES },
    })
    guardReaderContents(win.webContents, { role: 'bar', onAction, log })
    view = new WebContentsView({ webPreferences: { ...READER_WEB_PREFERENCES } })
    guardReaderContents(view.webContents, { role: 'page', openExternal, log })
    win.contentView.addChildView(view)
    layout()
    win.on('resize', layout)
    const closing = view
    win.on('closed', () => {
      seq += 1
      try { if (!closing.webContents.isDestroyed()) closing.webContents.close() } catch { /* already gone */ }
      win = null
      view = null
      state = null
    })
    if (!hidden) win.once('ready-to-show', () => win?.show())
  }

  /** The page's text through the reader's session: { html, url } or null (not html, too large, an error). */
  async function fetchPage(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await readerSession.fetch(url, { signal: controller.signal, redirect: 'follow', headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' } })
      if (!res.ok) { log(`reader: ${short(url)}: HTTP ${res.status}`); return null }
      const type = res.headers.get('content-type') ?? ''
      if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) { log(`reader: ${short(url)}: not a page (${type.slice(0, 60)})`); return null }
      const bytes = await readCapped(res, MAX_PAGE_BYTES)
      if (!bytes) { log(`reader: ${short(url)}: larger than ${MAX_PAGE_BYTES} bytes`); return null }
      return { html: decodePage(bytes, charsetOf(type, bytes)), url: isWebUrl(res.url) ? res.url : url }
    } catch (err) {
      log(`reader: ${short(url)}: not fetched (${String(err?.name ?? '')} ${String(err?.message ?? err)})`)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  /** Readability in a hidden window of its own session: the article, or null. */
  async function extract(html, base) {
    const w = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { ...EXTRACT_WEB_PREFERENCES } })
    guardReaderContents(w.webContents, { role: 'extract', log })
    try {
      await w.loadURL('about:blank')
      const r = await withTimeout(w.webContents.executeJavaScript(extractionScript(readability, html, base), false), EXTRACT_TIMEOUT_MS, 'extract')
      if (!r || r.ok !== true || typeof r.content !== 'string') { log(`reader: no text taken out: ${String(r?.why ?? 'no answer')}`); return null }
      return r
    } catch (err) {
      log(`reader: extraction failed: ${String(err?.message ?? err)}`)
      return null
    } finally {
      if (!w.isDestroyed()) w.destroy()
    }
  }

  return {
    /** Open `url` (http(s)) in the reading window: 阅读模式 when its text can be taken out, else the original page. */
    async open(url, { stored = null, mark = null, point = null } = {}) {
      if (!isWebUrl(url)) throw new Error(`reader: not an http(s) address: ${short(url)}`)
      ensureWindow()
      const token = ++seq
      // 1.1 W6a (A4): an item whose original Streams kept opens on it — nothing is fetched from the web
      if (stored && typeof stored.text === 'string' && stored.text !== '') {
        state = { url, article: null, mode: 'stored', fallback: false, stored: { stored, mark, point } }
        showStored()
        if (!hidden) { win.show(); win.focus() }
        log(`reader: ${short(url)}: stored${Number.isInteger(point) ? ` (point ${point + 1})` : ''}`)
        return { mode: 'stored', fallback: false, marked: Boolean(mark) }
      }
      state = { url, article: null, mode: 'loading', fallback: false, stored: null }
      renderBar()
      load(view.webContents, dataUrl(waitPage({ words: words(), look: theme(), css })))
      if (!hidden) { win.show(); win.focus() }
      const fetched = await fetchPage(url)
      const article = fetched ? await extract(fetched.html, fetched.url) : null
      if (token !== seq || !win || win.isDestroyed()) return { mode: 'closed' }
      state.article = article
      if (article) showReading()
      else showOriginal(true)
      log(`reader: ${short(url)}: ${state.mode}${state.fallback ? ' (no text taken out)' : ''}`)
      return { mode: state.mode, fallback: state.fallback }
    },
    openExternal,
    /**
     * v2 package K2: the look changed (设置, or Windows under 「跟随系统」): the open window's background and its pages drawn
     * again in the set now in force — the bar, and the reading page (or the wait page) under it; the original page is the
     * site's own and is left as it is.
     */
    restyle() {
      if (!win || win.isDestroyed() || !state) return
      const look = theme()
      win.setBackgroundColor(windowColour(look.theme, look.scheme))
      if (state.mode === 'stored' && state.stored) { showStored(); return }
      if (state.mode === 'reading' && state.article) { showReading(); return }
      renderBar()
      if (state.mode === 'loading' && view) load(view.webContents, dataUrl(waitPage({ words: words(), look, css })))
    },
    /** The window, for main.mjs and the tests (null when closed). */
    window: () => (win && !win.isDestroyed() ? win : null),
  }
}
