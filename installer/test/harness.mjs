/**
 * Starting the installed app in a test (docs/installer.md §五). The packaged app reads no development switch (STREAMS_*:
 * every one is behind app.isPackaged), so a test cannot steer it the way the desktop tests steer the development app.
 * Instead the harness starts Streams.exe under the Node inspector, paused before the app's first line (--inspect-brk;
 * Electron's EnableNodeCliInspectArguments fuse is on), and from there changes only the surroundings, through Electron's
 * and Node's public objects — nothing of the app's code:
 *
 *   - where Windows keeps the user's data: app.setPath('appData') and LOCALAPPDATA point into the test's own folder (the
 *     real %APPDATA%\Streams and %LOCALAPPDATA%\Streams are never touched; the test also starts the app with USERPROFILE,
 *     APPDATA and LOCALAPPDATA pointing there); the system's display languages read as Chinese, whatever this machine's
 *     are (the packaged app ignores STREAMS_DEV_SYSTEM_LANGUAGES)
 *   - the window is never shown (BrowserWindow.prototype.show does nothing); the folder dialog answers with the test's
 *     folder; nothing is opened outside the app (shell.openPath / openExternal / showItemInFolder only recorded)
 *   - notifications and the tray icon: Electron's Notification and Tray are replaced by recording stand-ins before the
 *     app's code runs. Electron 44's own Notification, at the first one of a run (Notification.isSupported() is enough),
 *     writes a shortcut into the user's Start menu and a toast activator key under HKCU\Software\Classes\CLSID; a real
 *     Tray icon is remembered by Windows (the notification area's settings). No test run may leave either. The stand-ins
 *     go in where Electron gets the classes from — its modules ask process._linkedBinding('electron_browser_notification')
 *     and ('electron_browser_tray') once, when require('electron').Notification / .Tray is first read; the hook then reads
 *     both properties and fails unless they are the stand-ins (the app, still paused before its first line, is ended).
 *     The app's own `import { Notification, Tray } from 'electron'` is bound to those same objects
 *   - the network, recorded: every request of the main process — globalThis.fetch (the core's fetchers), http.request /
 *     https.request / http.get / https.get (services/env-proxy-fetch.mjs: the update) — is written to the record with its
 *     address and method before it goes, so the test sees every address the app asked for. Nothing is changed, except:
 *   - the update (desktop/src/main/services/update.mjs): the check's GET of
 *     https://api.github.com/repos/AsuraNale/streams/… and the download from
 *     https://github.com/AsuraNale/streams/releases/download/… are answered by the test's stand-in for GitHub (`githubUrl`,
 *     installer/test/github-standin.mjs), path and all, over loopback, with no agent (no connection kept) — so the test sees
 *     the app asks GitHub's real addresses; the setup program the app then starts (…\updates\Streams-<version>-setup.exe)
 *     is recorded with its arguments and how it is started, and only really started when the test says
 *     `setupSpawn: 'run'` — then with `/LOG=<setupLog>` added after the app's own arguments when the test gives
 *     `setupLog` (the record keeps the app's arguments as the app gave them)
 *   - app.setAppUserModelId and app.setToastActivatorCLSID are recorded; quit times are recorded; a file the test touches
 *     makes the app quit (app.quit, as the tray's 「退出」 does), so quitting needs no debugger attached
 *   - a slow exit, when the test gives `slowExitMs` (upgrade.test.mjs: a busy machine): the app's first will-quit is held
 *     that long (event.preventDefault, then app.quit again), so Streams.exe outlives its windows by that much
 *
 * Then the inspector session is used to read the main process when needed, or closed; the pages are driven with
 * Playwright through Chromium's remote-debugging port (chromium.connectOverCDP). Chromium itself is started with a proxy
 * that is the test's trap (`--proxy-server`): a request of a page or of Electron's own network stack would land there.
 * @module installer/test/harness
 */

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** The hook, as source text: runs in the app's main process before its own code (see the module comment). Exported for a syntax check. */
export function hookSource(h) {
  return `(() => {
  const H = ${JSON.stringify(h)}
  const fs = require('fs')
  // (\`require\` is the inspector's, there only while this runs: whatever a wrapper needs later is taken now)
  const { EventEmitter } = require('events')
  const record = (kind, data = {}) => { try { fs.appendFileSync(H.recordFile, JSON.stringify({ t: Date.now(), kind, ...data }) + '\\n') } catch {} }
  // notifications and the tray first, before anything reads require('electron').Notification / .Tray (see the module comment)
  class Notification extends EventEmitter {
    constructor(options = {}) {
      super()
      this.title = String(options.title ?? '')
      this.body = String(options.body ?? '')
      record('notification-made', { title: this.title, body: this.body })
    }
    show() { record('notification', { title: this.title, body: this.body }) }
    close() { record('notification-close', { title: this.title }) }
  }
  const notificationBinding = {
    Notification,
    isSupported: () => { record('notification-supported'); return true },
    handleActivation: () => {}, getHistory: async () => [], remove: () => {}, removeAll: () => {}, removeGroup: () => {},
  }
  class Tray extends EventEmitter {
    constructor(image) { super(); record('tray-made', { image: String(image) }); this.destroyed = false }
    setToolTip(text) { record('tray-tooltip', { text: String(text) }) }
    setContextMenu(menu) { record('tray-menu', { items: (menu?.items ?? []).map(i => i.label).filter(Boolean) }) }
    setImage() {}
    setTitle() {}
    displayBalloon() { record('tray-balloon') }
    destroy() { this.destroyed = true; record('tray-destroyed') }
    isDestroyed() { return this.destroyed }
  }
  const trayBinding = { Tray }
  const linkedBinding = process._linkedBinding
  process._linkedBinding = function (name) {
    if (name === 'electron_browser_notification') return notificationBinding
    if (name === 'electron_browser_tray') return trayBinding
    return linkedBinding.apply(this, arguments)
  }
  if (require('electron').Notification !== Notification) throw new Error('Electron\\'s Notification was read before the hook: the app would get the real one')
  if (require('electron').Tray !== Tray) throw new Error('Electron\\'s Tray was read before the hook: the app would get the real one')
  const { app, BrowserWindow, dialog, shell, clipboard } = require('electron')
  const cp = require('child_process')
  app.setPath('appData', H.appData)
  app.getPreferredSystemLanguages = () => ['zh-CN']
  process.env.LOCALAPPDATA = H.localAppData
  const setId = app.setAppUserModelId.bind(app)
  app.setAppUserModelId = id => { record('app-user-model-id', { id }); return setId(id) }
  const setClsid = app.setToastActivatorCLSID.bind(app)
  app.setToastActivatorCLSID = id => { record('toast-activator-clsid', { id }); return setClsid(id) }
  BrowserWindow.prototype.show = function () { record('window-show-held-back') }
  BrowserWindow.prototype.showInactive = function () { record('window-show-held-back') }
  dialog.showOpenDialog = async (...args) => {
    const o = args.find(a => a && Array.isArray(a.properties)) ?? {}
    const folder = (o.properties ?? []).includes('openDirectory')
    record('dialog', { folder })
    return { canceled: false, filePaths: folder ? [H.pickFolder] : [] }
  }
  dialog.showMessageBox = async () => { record('message-box'); return { response: 0, checkboxChecked: false } }
  shell.openPath = async p => { record('open-path', { p }); return '' }
  shell.openExternal = async u => { record('open-external', { u }) }
  shell.showItemInFolder = p => { record('show-item', { p }) }
  clipboard.writeText = t => record('clipboard', { characters: String(t).length })

  // the update's setup program (services/update.mjs: <appData>\\updates\\Streams-<version>-setup.exe): recorded; started
  // only when the test says so, else a stand-in child that "started"
  const spawn = cp.spawn
  cp.spawn = function (command, args, options) {
    const list = Array.isArray(args) ? args.map(String) : []
    if (/[\\\\/]updates[\\\\/]Streams-[0-9]+\\.[0-9]+\\.[0-9]+-setup\\.exe$/i.test(String(command))) {
      const o = options || {}
      const run = H.setupSpawn === 'run'
      record('setup-spawn', { command: String(command), args: list, detached: o.detached === true, stdio: o.stdio ?? null, windowsHide: o.windowsHide === true, cwd: o.cwd ?? null, run, testLog: run && H.setupLog ? H.setupLog : null })
      if (run) return spawn.call(this, command, H.setupLog ? [...list, '/LOG=' + H.setupLog] : args, options)
      const child = new EventEmitter()
      child.pid = 0
      child.unref = () => {}
      setImmediate(() => child.emit('spawn'))
      return child
    }
    record('spawn', { command: String(command), args: list.slice(0, 3) })
    return spawn.call(this, command, args, options)
  }

  // every request of the main process, recorded before it goes (the address and the method); the update's two GitHub
  // addresses answered by the stand-in (see the module comment)
  const http = require('http')
  const https = require('https')
  const httpRequest = http.request
  const httpsRequest = https.request
  const githubRe = /^https:\\/\\/(api\\.github\\.com\\/repos\\/AsuraNale\\/streams\\/|github\\.com\\/AsuraNale\\/streams\\/releases\\/download\\/)/i
  const urlOf = (target, options, scheme) => {
    if (typeof target === 'string') return target
    if (target instanceof URL) return target.href
    const o = target && typeof target === 'object' ? target : options || {}
    return scheme + '//' + (o.hostname || o.host || 'localhost') + (o.port ? ':' + o.port : '') + (o.path || '/')
  }
  const wrap = (original, scheme, kind) => function (target, options, callback) {
    const url = urlOf(target, typeof options === 'object' ? options : null, scheme)
    const o = (typeof options === 'object' && options) || (target && typeof target === 'object' && !(target instanceof URL) ? target : {})
    const headers = o.headers || {}
    const header = name => { const k = Object.keys(headers).find(h => h.toLowerCase() === name); return k === undefined ? null : String(headers[k]) }
    const github = H.githubUrl && githubRe.test(url)
    record('request', { via: kind, url, method: o.method || 'GET', github: Boolean(github) })
    if (!github) return original.apply(this, arguments)
    if (typeof options === 'function') { callback = options; options = {} }
    record('github-request', { url, method: o.method || 'GET', accept: header('accept'), userAgent: header('user-agent') })
    const u = new URL(url)
    const req = httpRequest(H.githubUrl + u.pathname + u.search, { method: o.method, headers, signal: o.signal, agent: false }, callback)
    if (kind.endsWith('.get')) req.end()
    return req
  }
  https.request = wrap(httpsRequest, 'https:', 'https.request')
  http.request = wrap(httpRequest, 'http:', 'http.request')
  https.get = wrap(https.get, 'https:', 'https.get')
  http.get = wrap(http.get, 'http:', 'http.get')
  const fetch = globalThis.fetch
  globalThis.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && typeof input.url === 'string' ? input.url : String(input)
    record('request', { via: 'fetch', url, method: (init && init.method) || (input && input.method) || 'GET', github: false })
    return fetch.apply(this, arguments)
  }
  require('module').syncBuiltinESMExports()
  for (const e of ['before-quit', 'will-quit', 'quit']) app.on(e, () => record(e))
  // a slow exit (the update test's busy machine): the first will-quit is held for H.slowExitMs, then the app quits again —
  // the windows are gone by then, the process (Streams.exe, holding its program files) stays that long. Registered before the
  // app's own will-quit listeners, which run as usual both times
  if (H.slowExitMs > 0) {
    let held = false
    app.on('will-quit', event => {
      if (held) return
      held = true
      event.preventDefault()
      record('exit-held', { ms: H.slowExitMs })
      setTimeout(() => { record('exit-released'); app.quit() }, H.slowExitMs)
    })
  }
  process.on('exit', () => record('exit'))
  if (H.quitFile) {
    const watcher = fs.watchFile(H.quitFile, { interval: 100 }, cur => { if (cur.mtimeMs > 0) { record('quit-file'); app.quit() } })
    if (watcher && watcher.unref) watcher.unref()
  }
  record('hook', { notifications: 'stand-in', tray: 'stand-in' })
  return 'ok'
})()`
}

/** One inspector (CDP) session over Node's global WebSocket. */
async function cdpSession(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  let id = 0
  const pending = new Map()
  const listeners = new Set()
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } else for (const l of listeners) l(msg)
  })
  // a main thread that never answers (a modal error dialog, a hang) fails the call instead of waiting for ever
  const send = (method, params = {}, ms = 120_000) => new Promise((resolve, reject) => {
    const i = ++id
    const timer = setTimeout(() => { pending.delete(i); reject(new Error(`${method}: no answer from the main process in ${ms} ms`)) }, ms)
    pending.set(i, m => { clearTimeout(timer); return m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result) })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  const once = method => new Promise(resolve => { const l = m => { if (m.method === method) { listeners.delete(l); resolve(m.params) } }; listeners.add(l) })
  return { ws, send, once, close: () => { try { ws.close() } catch { /* closed */ } } }
}

/** Wait for a line on stderr (the inspector's and DevTools' "listening on ws://…" lines go there). */
function lineMatching(child, re, ms, label) {
  return new Promise((resolve, reject) => {
    let text = ''
    const onData = d => {
      text += d
      const m = re.exec(text)
      if (m) { child.stderr.off('data', onData); clearTimeout(timer); resolve(m[1]) }
    }
    const timer = setTimeout(() => { child.stderr.off('data', onData); reject(new Error(`${label}: not seen in ${ms} ms; stderr: ${text.slice(-2000)}`)) }, ms)
    child.stderr.on('data', onData)
  })
}

/**
 * Start the installed app.
 * @param {object} o
 * @param {string} o.exe - the installed Streams.exe
 * @param {Record<string,string>} o.env - its whole environment
 * @param {object} o.hook - {appData, localAppData, recordFile, pickFolder, quitFile?, githubUrl?, setupSpawn?: 'record' | 'run', setupLog?, slowExitMs?}
 * @param {string} [o.chromiumProxy] - Chromium's proxy (the test's trap), as --proxy-server
 * @param {boolean} [o.devtools] - open Chromium's remote-debugging port and connect Playwright to the page
 * @param {string} o.repo - the repository (playwright-core from desktop/node_modules)
 * @param {string} [o.cwd]
 */
export async function launchInstalled({ exe, env, hook, chromiumProxy = null, devtools = true, repo, cwd }) {
  const args = ['--inspect-brk=0', ...(devtools ? ['--remote-debugging-port=0'] : []), ...(chromiumProxy ? [`--proxy-server=${chromiumProxy}`] : [])]
  const started = Date.now()
  const child = spawn(exe, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  child.stderr.setEncoding('utf8')
  let stderr = ''
  child.stderr.on('data', d => { stderr += d })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal, at: Date.now() })))
  const inspectorUrl = await lineMatching(child, /Debugger listening on (ws:\/\/\S+)/, 30_000, 'the inspector')
  const main = await cdpSession(inspectorUrl)
  await main.send('Runtime.enable')
  await main.send('Debugger.enable')
  const paused = main.once('Debugger.paused')
  await main.send('Runtime.runIfWaitingForDebugger')
  // Electron pauses before the app's first line; when it never does, the app is stuck (a load error shows a modal dialog)
  const stuck = await Promise.race([paused.then(() => false), sleep(60_000).then(() => true)])
  if (stuck) {
    child.kill()
    throw new Error(`the app never reached its first line (stderr: ${stderr.slice(-2000)})`)
  }
  const hooked = await main.send('Runtime.evaluate', { expression: hookSource(hook), includeCommandLineAPI: true, returnByValue: true })
  if (hooked.exceptionDetails || hooked.result?.value !== 'ok') {
    // still paused before the app's first line: ended here, so nothing of the app runs without the hook
    child.kill()
    throw new Error(`the hook did not install: ${JSON.stringify(hooked.exceptionDetails ?? hooked.result)}`)
  }
  await main.send('Debugger.resume')
  await main.send('Debugger.disable')

  /** Evaluate in the main process (async allowed; `require` available); the value is returned as JSON. */
  const evaluate = async expression => {
    const r = await main.send('Runtime.evaluate', { expression, includeCommandLineAPI: true, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`main process: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }

  let browser = null
  let page = null
  if (devtools) {
    const wsEndpoint = await lineMatching(child, /DevTools listening on (ws:\/\/\S+)/, 60_000, 'DevTools')
    const { chromium } = await import(pathToFileURL(join(repo, 'desktop', 'node_modules', 'playwright-core', 'index.mjs')).href)
    browser = await chromium.connectOverCDP(wsEndpoint)
    const deadline = Date.now() + 60_000
    while (!page && Date.now() < deadline) {
      page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('app://')) ?? null
      if (!page) await sleep(200)
    }
    if (!page) throw new Error(`no app:// page (pages: ${browser.contexts().flatMap(c => c.pages()).map(p => p.url()).join(', ')})`)
  }

  return {
    child, exited, started, evaluate, browser, page,
    stderr: () => stderr,
    /** Leave the app running with no debugger attached: Playwright and the inspector disconnect. */
    async detach() {
      if (browser) { await browser.close().catch(() => {}); browser = null }
      main.close()
    },
  }
}

/** The hook's record (one JSON object per line). */
export function readRecord(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
}

/** Touch the quit file: the app quits (app.quit). */
export function requestQuit(file) {
  appendFileSync(file, 'quit\n')
}
