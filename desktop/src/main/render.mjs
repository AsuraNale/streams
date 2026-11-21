/**
 * The render service (1.1 W2, acceptance B5: the second way of reading a page): a page the direct GET could not read — its
 * text written by a script, or the GET refused — is opened in a hidden browser window and read as the browser made it. The
 * core's page reader (core read/read-page.mjs) calls `render(url, { userAgent, timeoutMs })` and judges what comes back
 * (an article, a human check, a sign-in page, an error page); this module only loads the address and hands the page over.
 *
 * What it never does: show the window; click, type or fill anything; answer a human check; sign in; download; open another
 * window. It reads as Streams (the User-Agent the core gives it, on the session and the load).
 *
 *   - Its own in-memory session (RENDER_PARTITION: no `persist:`, nothing kept between runs), apart from the app's and the
 *     reading window's: only http(s), data: and blob: requests leave; every permission is refused; downloads are cancelled.
 *   - The window: never shown, sandboxed, context isolation, no Node anywhere, no preload, no <webview>, images off, muted.
 *     No new window (window.open is denied); a redirect, a navigation or a frame may load only http(s) (or about:blank).
 *   - One page at a time; each in a new window, destroyed when it is read or when the time runs out (timeoutMs, default
 *     30 s); RENDER_SETTLE_MS after the load for the page's scripts to write their text.
 *   - The app's own guard (security.mjs guardContents) would keep these contents on app://ui/: main.mjs leaves out the
 *     contents of this session (isRenderSession) and this module guards them instead.
 * Electron is given (BrowserWindow, session), so the pure parts run under plain Node; the real window is checked in
 * test/render.test.mjs (a real Electron, a server on 127.0.0.1).
 * @module desktop/main/render
 */

import { isWebUrl } from './reader.mjs'

export const RENDER_PARTITION = 'streams-render'
export const RENDER_SETTLE_MS = 1500
export const RENDER_TIMEOUT_MS = 30_000

/** webPreferences of the render window. No preload, ever. */
export const RENDER_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  javascript: true,
  images: false,
  spellcheck: false,
  backgroundThrottling: false,
})

const short = url => String(url).slice(0, 200)

/** True for the render service's session (main.mjs: these contents are this module's to guard). */
export function isRenderSession(ses, fromPartition) {
  return ses === fromPartition(RENDER_PARTITION)
}

/** Lock the render session: http(s), data: and blob: only; no permission; no download. */
export function hardenRenderSession(ses, { log = () => {} } = {}) {
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const ok = isWebUrl(details.url) || details.url.startsWith('data:') || details.url.startsWith('blob:')
    if (!ok) log(`render: request refused: ${short(details.url)}`)
    callback({ cancel: !ok })
  })
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', (event, item) => {
    event.preventDefault()
    log(`render: download refused: ${short(item?.getURL?.() ?? '')}`)
  })
}

/** Lock one render window's contents: no new window, no <webview>; navigations, redirects and frames http(s) only. */
export function guardRenderContents(contents, { log = () => {} } = {}) {
  contents.setWindowOpenHandler(({ url }) => { log(`render: new window refused: ${short(url)}`); return { action: 'deny' } })
  contents.on('will-attach-webview', event => { event.preventDefault(); log('render: <webview> refused') })
  contents.on('will-navigate', (event, url) => { if (!isWebUrl(url)) { event.preventDefault(); log(`render: navigation refused: ${short(url)}`) } })
  contents.on('will-redirect', (event, url) => { if (!isWebUrl(url)) { event.preventDefault(); log(`render: redirect refused: ${short(url)}`) } })
  contents.on('will-frame-navigate', details => {
    const url = details.url
    if (!(isWebUrl(url) || url === 'about:blank' || url === 'about:srcdoc')) { details.preventDefault(); log(`render: frame refused: ${short(url)}`) }
  })
}

function withTimeout(promise, ms, what) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: no answer within ${ms} ms`)), ms) }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * @param {{BrowserWindow: any, session: any, log?: (line: string) => void, settleMs?: number}} o
 * @returns {{render: (url: string, o?: {userAgent?: string, timeoutMs?: number}) => Promise<{status: number|null, finalUrl: string, title: string, html: string}>}}
 */
export function createRenderService({ BrowserWindow, session, log = () => {}, settleMs = RENDER_SETTLE_MS }) {
  let ses = null
  let chain = Promise.resolve()
  const sessionOf = () => {
    if (!ses) { ses = session.fromPartition(RENDER_PARTITION); hardenRenderSession(ses, { log }) }
    return ses
  }
  async function renderOnce(url, { userAgent, timeoutMs = RENDER_TIMEOUT_MS } = {}) {
    if (!isWebUrl(url)) throw new Error(`render: only http(s) pages are opened: ${short(url)}`)
    const s = sessionOf()
    if (userAgent) s.setUserAgent(userAgent)
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { ...RENDER_WEB_PREFERENCES, session: s } })
    const wc = win.webContents
    guardRenderContents(wc, { log })
    wc.setAudioMuted(true)
    let status = null
    wc.on('did-navigate', (_event, _url, httpResponseCode) => { status = httpResponseCode })
    const started = Date.now()
    try {
      await withTimeout(wc.loadURL(url, userAgent ? { userAgent } : {}), timeoutMs, 'render: loading the page')
      await new Promise(r => setTimeout(r, settleMs))
      const left = Math.max(1000, timeoutMs - (Date.now() - started))
      const html = await withTimeout(wc.executeJavaScript('document.documentElement ? document.documentElement.outerHTML : ""', true), left, 'render: reading the page')
      return { status, finalUrl: wc.getURL(), title: wc.getTitle(), html: String(html ?? '') }
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }
  return {
    render(url, o = {}) {
      const run = chain.catch(() => {}).then(() => renderOnce(url, o))
      chain = run.catch(() => {})
      return run
    },
  }
}
