/**
 * The security baseline (docs/desktop.md §二): what the page may load and run, what its window may do,
 * and what the session lets out. Every part of it is checked by test/security.test.mjs.
 *
 * Layers, outermost first:
 *   1. the page is served only from app://ui/ (protocol.mjs) and its CSP allows nothing else: no other
 *      origin for scripts, styles, images, fonts, frames, connections, forms or workers; no inline script
 *      except the one import map, allowed by its hash; no eval; Trusted Types required for every HTML
 *      sink, with no policy allowed — so `innerHTML = …` throws;
 *   2. the window: context isolation, sandbox, no Node in the page or its frames, no <webview>, no
 *      navigation away from app://ui/, no new windows, no permissions, no downloads;
 *   3. the session: every request whose URL is not app://ui/… is cancelled before it leaves (a second
 *      lock behind the CSP, also for what the CSP does not cover).
 * @module desktop/main/security
 */

import { createHash } from 'node:crypto'

export const APP_SCHEME = 'app'
export const APP_HOST = 'ui'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
export const APP_ENTRY = `${APP_ORIGIN}/index.html`

/** The privileges app:// needs for ES modules and the CSP's 'self' (registered before the app is ready). */
export const APP_SCHEME_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  supportFetchAPI: true,
  codeCache: true,
  corsEnabled: false,
  allowServiceWorkers: false,
  bypassCSP: false,
  stream: false,
})

/** webPreferences of every app window (preload added by the caller). */
export const WEB_PREFERENCES = Object.freeze({
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
})

const IMPORT_MAP_RE = /<script type="importmap">([\s\S]*?)<\/script>/

/** The one inline script of index.html: its import map. */
export function importMapOf(indexHtml) {
  const m = IMPORT_MAP_RE.exec(indexHtml)
  if (!m) throw new Error('index.html has no <script type="importmap">')
  return m[1]
}

/** CSP hash source of a script's text, as the browser computes it (UTF-8 bytes, sha256, base64). */
export function scriptHash(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`
}

/**
 * The page's Content-Security-Policy, as the response header sends it (protocol.mjs).
 * @param {string} importMapHashSource - scriptHash(importMapOf(index.html))
 */
export function contentSecurityPolicy(importMapHashSource) {
  return `${metaPolicy(importMapHashSource)}; frame-ancestors 'none'`
}

/**
 * The same policy as index.html's <meta> carries it: everything but frame-ancestors, which a <meta> cannot
 * set (Chromium ignores it there and says so). test/security.test.mjs checks the <meta> is exactly this.
 */
export function metaPolicy(importMapHashSource) {
  return [
    "default-src 'none'",
    `script-src 'self' ${importMapHashSource}`,
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    // (a page that must show a document the model wrote — plan C3's reading view — gets a sandboxed frame of its own
    // origin then, as the page's one allowed frame; nothing may be framed today)
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ')
}

/** Is this URL one the app serves itself? */
export function isAppUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST
  } catch {
    return false
  }
}

/**
 * Lock the session: requests other than app://ui/… are cancelled, every permission is refused, downloads
 * are cancelled. `devtools:` is let through only when `allowDevtools` (development).
 * @param {Electron.Session} ses
 * @param {{allowDevtools?: boolean, onBlocked?: (url: string) => void}} [opts]
 */
export function hardenSession(ses, opts = {}) {
  const allowDevtools = opts.allowDevtools === true
  const onBlocked = typeof opts.onBlocked === 'function' ? opts.onBlocked : () => {}
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const ok = isAppUrl(details.url) || (allowDevtools && details.url.startsWith('devtools:'))
    if (!ok) onBlocked(details.url)
    callback({ cancel: !ok })
  })
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.on('will-download', event => event.preventDefault())
}

/**
 * Lock one web contents (called for every one created): it may not leave app://ui/, open windows, or
 * attach a <webview>; and WebRTC sends no UDP of its own — that traffic passes neither the CSP nor the
 * session's request filter (an RTCPeerConnection to `stun:host:port` would send UDP to any address).
 * @param {Electron.WebContents} contents
 * @param {{onBlocked?: (url: string) => void}} [opts]
 */
export function guardContents(contents, opts = {}) {
  const onBlocked = typeof opts.onBlocked === 'function' ? opts.onBlocked : () => {}
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  const stay = (event, url) => {
    if (!isAppUrl(url)) { event.preventDefault(); onBlocked(url) }
  }
  contents.on('will-navigate', stay)
  contents.on('will-redirect', stay)
  contents.on('will-frame-navigate', details => {
    // the main frame stays on app://ui/; no subframe may load anything today (the CSP frames nothing)
    if (!isAppUrl(details.url) || details.isMainFrame === false) { details.preventDefault(); onBlocked(details.url) }
  })
  contents.on('will-attach-webview', event => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => { onBlocked(url); return { action: 'deny' } })
}
