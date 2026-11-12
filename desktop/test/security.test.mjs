// redesign R1: 概览 is gone and the app opens on a library's 待看 — the screen this file waits for is 'inbox' (was 'overview'); nothing else changed
// A1-1 (work order 05 §六) on the running app: the page has no Node; an external address is refused — by the
// page's CSP, and by the session even where no CSP applies; the bridge has exactly the documented methods.
// Plus: the CSP the app sends is the one security.mjs defines, the app:// handler serves nothing outside its
// folders, and Electron's own data lives in the protected folder. An HTTP server on 127.0.0.1 stands in for
// "an external address": it counts every request that reaches it, so "refused" means nothing arrived.
// The other layers each have a check of their own (D4, D5): the bridge answers only the app's own page; every
// permission is refused; downloads are cancelled; WebRTC sends no UDP (a local UDP listener receives nothing).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isInside } from '../src/main/layout.mjs'
import { contentSecurityPolicy, importMapOf, metaPolicy, scriptHash } from '../src/main/security.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { bridgeTable } from './support/docs.mjs'
import { appSession, ready } from './support/app.mjs'
// v2 package F: 今日 is the 概览 tab of a library's page now (screen 'overview', the screen the app opens on); this file's assertions are v1.0's, only the screen id changed

const REAL_APP_DATA = process.env.APPDATA ? join(process.env.APPDATA, 'Streams') : null
const realAppDataBefore = REAL_APP_DATA ? existsSync(REAL_APP_DATA) : false

const s = appSession({ waitFor: 'load' })
let server
let base
const hits = []

before(async () => {
  server = createServer((req, res) => { hits.push(`${req.method} ${req.url}`); res.writeHead(200, { 'content-type': 'text/plain' }); res.end('reached') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise(resolve => server.close(() => resolve())).catch(() => {})
})

test('the page starts without errors', async () => {
  await ready(s.page, 'inbox')
  assert.deepEqual(s.errors, [])
})

test('A1-1 · the page has no Node: require, process and the rest are not there', async () => {
  const seen = await s.page.evaluate(() => ({
    require: typeof require, process: typeof process, module: typeof module, exports: typeof exports,
    Buffer: typeof Buffer, global: typeof global, __dirname: typeof __dirname, setImmediate: typeof setImmediate,
  }))
  assert.deepEqual(seen, { require: 'undefined', process: 'undefined', module: 'undefined', exports: 'undefined', Buffer: 'undefined', global: 'undefined', __dirname: 'undefined', setImmediate: 'undefined' })
  const prefs = await s.app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, nodeIntegrationInSubFrames: p.nodeIntegrationInSubFrames, nodeIntegrationInWorker: p.nodeIntegrationInWorker, webviewTag: p.webviewTag, webSecurity: p.webSecurity }
  })
  assert.deepEqual(prefs, { contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false, webSecurity: true })
})

test('A1-1 · an external address is refused in the page: fetch, XHR, image, script, style, frame, socket, beacon, navigation, new window', async () => {
  const r = await s.page.evaluate(async target => {
    const violations = []
    document.addEventListener('securitypolicyviolation', e => violations.push(e.effectiveDirective))
    const out = {}
    const settle = (make, key) => new Promise(resolve => {
      try {
        const el = make(() => resolve((out[key] = 'loaded')), () => resolve((out[key] = 'refused')))
        setTimeout(() => resolve((out[key] ??= el === 'sync' ? 'refused' : 'no answer')), 1500)
      } catch (e) {
        resolve((out[key] = `refused (${e.name})`))
      }
    })
    try { await fetch(`${target}/fetch`); out.fetch = 'loaded' } catch { out.fetch = 'refused' }
    await settle((ok, no) => { const x = new XMLHttpRequest(); x.onload = ok; x.onerror = no; x.open('GET', `${target}/xhr`); x.send() }, 'xhr')
    await settle((ok, no) => { const el = document.createElement('img'); el.onload = ok; el.onerror = no; el.src = `${target}/img.png`; document.body.append(el) }, 'img')
    await settle((ok, no) => { const el = document.createElement('script'); el.onload = ok; el.onerror = no; el.src = `${target}/script.js`; document.head.append(el) }, 'script')
    await settle((ok, no) => { const el = document.createElement('link'); el.rel = 'stylesheet'; el.onload = ok; el.onerror = no; el.href = `${target}/style.css`; document.head.append(el) }, 'style')
    const frame = document.createElement('iframe')
    frame.src = `${target}/frame`
    document.body.append(frame)
    try { const ws = new WebSocket(target.replace('http', 'ws') + '/ws'); ws.onopen = () => { out.socket = 'loaded' }; out.socket ??= 'pending' } catch (e) { out.socket = `refused (${e.name})` }
    // sendBeacon answers "queued" before the CSP drops it: only the server's count tells
    try { navigator.sendBeacon(`${target}/beacon`, 'x') } catch { /* refused at once */ }
    out.open = String(window.open(`${target}/open`))
    location.href = `${target}/navigate`
    await new Promise(resolve => setTimeout(resolve, 1500))
    if (out.socket === 'pending') out.socket = 'refused'
    return { out, violations: [...new Set(violations)].sort(), href: location.href }
  }, base)
  assert.deepEqual(Object.keys(r.out).sort(), ['fetch', 'img', 'open', 'script', 'socket', 'style', 'xhr'])
  assert.deepEqual(Object.entries(r.out).filter(([k, v]) => (k === 'open' ? v !== 'null' : !String(v).startsWith('refused'))), [], JSON.stringify(r.out))
  for (const d of ['connect-src', 'img-src', 'style-src-elem', 'frame-src']) assert.ok(r.violations.includes(d), `CSP ${d} refused: ${r.violations}`)
  assert.equal(r.href, 'app://ui/index.html', 'the page did not navigate away')
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.deepEqual(hits, [], 'nothing reached the address')
})

test('A1-1 · the session refuses any other address, also where the page\'s CSP does not apply', async () => {
  const result = await s.app.evaluate(async ({ BrowserWindow }, target) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
    try { await w.loadURL(target); return 'loaded' } catch (e) { return String(e.code ?? e.message) } finally { w.destroy() }
  }, `${base}/main-window`)
  assert.match(result, /ERR_BLOCKED_BY_CLIENT/)
  assert.deepEqual(hits, [], 'nothing reached the address')
})

test("D4 · the bridge answers only the app's own page: another page with the same preload is refused", async () => {
  const preload = join(DESKTOP_DIR, 'src', 'preload', 'preload.cjs')
  const r = await s.app.evaluate(async ({ BrowserWindow }, p) => {
    const w = new BrowserWindow({ show: false, webPreferences: { preload: p, sandbox: true, contextIsolation: true } })
    try {
      await w.loadURL('about:blank')
      return { url: w.webContents.getURL(), answer: await w.webContents.executeJavaScript('window.streams ? window.streams.getAppState() : "no bridge"') }
    } finally { w.destroy() }
  }, preload)
  assert.equal(r.url, 'about:blank')
  assert.deepEqual(r.answer, { ok: false, error: { code: 'refused' } })
  // the app's own page, same call: answered
  assert.equal((await s.page.evaluate(() => window.streams.getAppState())).ok, true)
})

test('D4 · every permission is refused: requests and checks (notifications, geolocation, camera, microphone, clipboard)', async () => {
  const r = await s.page.evaluate(async () => {
    const out = { notification: await Notification.requestPermission() }
    for (const name of ['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read']) {
      try { out[name] = (await navigator.permissions.query({ name })).state } catch (e) { out[name] = e.name }
    }
    try { await navigator.clipboard.readText(); out.clipboard = 'read' } catch (e) { out.clipboard = e.name }
    return out
  })
  assert.deepEqual(r, { notification: 'denied', notifications: 'denied', geolocation: 'denied', camera: 'denied', microphone: 'denied', 'clipboard-read': 'denied', clipboard: 'NotAllowedError' })
})

test('D4 · downloads are cancelled: the session\'s will-download handler refuses every download', async () => {
  // A real download cannot be watched in this harness: Playwright takes downloads over through DevTools
  // (Browser.setDownloadBehavior), so Electron's will-download is never emitted under it (tried twice: the main
  // process's evaluate never came back). The app's layer is its handler on the window's session: handed a
  // download, it refuses it.
  const r = await s.app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
    const item = { getURL: () => 'app://ui/index.html', setSavePath() {}, cancel() {} }
    const listeners = wc.session.listenerCount('will-download')
    wc.session.emit('will-download', event, item, wc)
    return { handled: listeners > 0, refused: event.defaultPrevented }
  })
  assert.deepEqual(r, { handled: true, refused: true })
})

test('D5 · WebRTC sends no UDP: a STUN request to a local listener never arrives', async () => {
  // the machine's own address (not loopback: Chromium gathers on the network interfaces), or loopback if none
  const address = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address ?? '127.0.0.1'
  const socket = createSocket('udp4')
  let packets = 0
  socket.on('message', () => { packets++ })
  await new Promise(resolve => socket.bind(0, address, resolve))
  try {
    const r = await s.page.evaluate(async url => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: url }] })
      const types = []
      pc.onicecandidate = e => { if (e.candidate) types.push(e.candidate.type) }
      pc.createDataChannel('x')
      await pc.setLocalDescription(await pc.createOffer())
      await new Promise(resolve => setTimeout(resolve, 3000))
      pc.close()
      return { types }
    }, `stun:${address}:${socket.address().port}`)
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(packets, 0, `UDP packets that reached the listener (candidates: ${r.types})`)
  } finally {
    socket.close()
  }
})

test('A1-1 · the bridge has exactly the methods docs/desktop.md lists, all functions, frozen; nothing else of Electron', async () => {
  const seen = await s.page.evaluate(() => ({
    keys: Object.keys(window.streams).sort(),
    types: [...new Set(Object.values(window.streams).map(v => typeof v))],
    frozen: Object.isFrozen(window.streams),
    others: ['ipcRenderer', 'electron', 'require', 'process', 'contextBridge'].filter(k => k in window),
  }))
  assert.deepEqual(seen.keys, bridgeTable().slice().sort())
  assert.deepEqual(seen.types, ['function'])
  assert.equal(seen.frozen, true)
  assert.deepEqual(seen.others, [])
  const calls = await s.page.evaluate(async () => [await window.streams.getAppState(), await window.streams.getAppState('C:\\Windows')])
  assert.equal(calls[0].ok, true)
  // a test world opens its empty library (test/support/app.mjs testEnv STREAMS_DEV_LIBRARY): the page sees its path and folder name
  // (v2 package A: and its id — the development library, not registered, goes by `dev`)
  assert.deepEqual(calls[0].data.library, { libraryId: 'dev', path: s.run.library, name: 'library' }, "the test world's library")
  assert.deepEqual(calls[1], { ok: false, error: { code: 'bad_arguments' } })
})

test('the CSP: the header app:// sends and index.html\'s <meta> are the policy of security.mjs; no unsafe-inline or eval', async () => {
  const html = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'index.html'), 'utf8')
  const hash = scriptHash(importMapOf(html))
  assert.equal(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1], metaPolicy(hash))
  const header = await s.app.evaluate(async ({ net }) => (await net.fetch('app://ui/index.html')).headers.get('content-security-policy'))
  assert.equal(header, contentSecurityPolicy(hash))
  // (nothing may be framed today: a reading view of a document, plan C3, gets a sandboxed frame of its own origin then)
  for (const d of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'; ", "trusted-types 'none'", "frame-ancestors 'none'"]) assert.ok(header.includes(d), d)
  assert.doesNotMatch(header, /unsafe-|\*|https?:/)
})

test('the page cannot write HTML or run strings as code (Trusted Types, no eval)', async () => {
  // run in a later task of the page's own: code Playwright evaluates directly is let through the CSP's eval
  // rule by DevTools (allowUnsafeEvalBlockedByCSP), so trying it there would prove nothing
  const r = await s.page.evaluate(() => new Promise(resolve => setTimeout(() => {
    const out = {}
    try { document.body.insertAdjacentHTML('beforeend', '<b>x</b>'); out.html = 'allowed' } catch (e) { out.html = e.name }
    try { (0, eval)('1'); out.eval = 'allowed' } catch (e) { out.eval = e.name }
    try { new Function('return 1')(); out.fn = 'allowed' } catch (e) { out.fn = e.name }
    resolve(out)
  }, 0)))
  assert.deepEqual(r, { html: 'TypeError', eval: 'EvalError', fn: 'EvalError' })
})

test('app:// serves only the page\'s own files', async () => {
  const status = await s.app.evaluate(async ({ net }, urls) => Promise.all(urls.map(async u => { try { return (await net.fetch(u)).status } catch { return 'error' } })), [
    'app://ui/index.html', 'app://ui/vendor/preact.module.js', 'app://ui/shared/fetch-states.mjs',
    'app://ui/%2e%2e/main/main.mjs', 'app://ui/..%2fmain%2fmain.mjs', 'app://ui/vendor/../../package.json', 'app://ui/node_modules/preact/package.json',
    'app://ui/vendor/htm.mjs', 'app://ui/shared/..%2f..%2fpackage.json', 'app://other/index.html', 'app://ui/styles/tokens.css%00.html',
  ])
  // the page's files: 200; everything else 404 — or, for another host, cancelled by the session before the
  // handler sees it (net.fetch then throws)
  assert.deepEqual(status.slice(0, 3), [200, 200, 200])
  assert.deepEqual(status.slice(3).filter(x => x !== 404 && x !== 'error'), [], JSON.stringify(status))
  assert.equal(status[9], 'error', 'app://other/ never reaches the handler')
})

test('A1-2 (layout) · Electron\'s own data and logs in the protected folder; the local data outside it; the real %APPDATA%\\Streams untouched', async () => {
  const paths = await s.app.evaluate(({ app: a }) => ({ userData: a.getPath('userData'), sessionData: a.getPath('sessionData'), logs: a.getPath('logs'), crashDumps: a.getPath('crashDumps') }))
  for (const [k, p] of Object.entries(paths)) assert.ok(isInside(p, s.run.appData), `${k}: ${p}`)
  assert.equal(isInside(s.run.localData, s.run.appData), false)
  if (REAL_APP_DATA) assert.equal(existsSync(REAL_APP_DATA), realAppDataBefore, 'a test run makes no %APPDATA%\\Streams')
})
