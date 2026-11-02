/**
 * Starting the installed app in a test (W7; docs/installer.md §五). The packaged app reads no development switch
 * (STREAMS_*), so a test cannot steer it the way the desktop tests steer the development app. Instead the harness starts
 * Streams.exe under the Node inspector, paused before the app's first line (--inspect-brk; Electron's
 * EnableNodeCliInspectArguments fuse is on), and from there changes only the surroundings, through Electron's and Node's
 * public objects — nothing of the app's code:
 *
 *   - where Windows keeps the user's data: app.setPath('appData') and LOCALAPPDATA point into the test's own folder
 *     (the real %APPDATA%\Streams and %LOCALAPPDATA%\Streams are never touched); the system's display languages read as
 *     Chinese, whatever this machine's are (the packaged app ignores STREAMS_DEV_SYSTEM_LANGUAGES; docs/desktop.md §十六)
 *   - the window is never shown (BrowserWindow.prototype.show does nothing), the folder and file dialogs answer with the
 *     test's folder, nothing is opened outside the app
 *   - notifications: Electron's Notification is replaced by a recording stand-in before the app's code runs — made,
 *     shown, asked whether notifications are supported: each is recorded, nothing reaches Windows. Electron 44's own
 *     Notification, at the first one of a run (Notification.isSupported() is enough, no show() needed), writes a shortcut
 *     into the user's real Start menu and a toast activator key under HKCU\Software\Classes\CLSID (docs/installer.md
 *     §九 12) — no test run may do either. The stand-in goes in where Electron gets the class from (its module asks
 *     process._linkedBinding('electron_browser_notification') once, when require('electron').Notification is first
 *     read); the hook then reads that property and fails unless it is the stand-in (the app, still paused before its
 *     first line, is ended). The app's own `import { Notification } from 'electron'` is bound to that same object
 *   - the model: the two child processes that talk to DeepSeek — the key check and dsh — are pointed at the engine's mock
 *     model (child_process.spawn wrapped: the key check's request body gets the mock's address, dsh gets
 *     DEEPSEEK_BASE_URL); what they were going to use is recorded first, so the test sees that the app itself goes to
 *     DeepSeek's public address
 *   - the balance: the main process's own read of DeepSeek's balance (docs/desktop.md §十七; services/env-proxy-fetch.mjs,
 *     which calls https.request) is answered by the test's stand-in (`balanceUrl`, test/support/balance-mock.mjs of the
 *     desktop): https.request wrapped, only for https://api.deepseek.com/…; what the app was going to ask is recorded
 *     first (the URL, the method, whether a Bearer authorization went with it — never its value), so the test sees that
 *     the app itself goes to DeepSeek's public address; any other request is left alone and the proxy trap catches it
 *   - the update (docs/desktop.md §十九, work order 08): the check's GET of https://api.github.com/repos/AsuraNale/
 *     streams-releases/… and the download from https://github.com/AsuraNale/streams/releases/download/… are recorded
 *     (the URL, the method, the Accept and User-Agent headers) and answered by the test's stand-in for GitHub (`githubUrl`,
 *     desktop/test/support/update-mock.mjs), path and all — so the test sees the app asks GitHub's real addresses; the setup
 *     program the app then starts (…\updates\Streams-<version>-setup.exe) is recorded with its arguments and how it is
 *     started, and only really started when the test says `setupSpawn: 'run'` (the real upgrade, upgrade.test.mjs) — then
 *     with `/LOG=<setupLog>` added after the app's own arguments when the test gives `setupLog` (Inno Setup's log of that
 *     install, read by the test; the record keeps the app's arguments as the app gave them; the app itself starts the setup
 *     program without /LOG, docs/installer.md 11.1)
 *   - app.setAppUserModelId and app.setToastActivatorCLSID are recorded (the ID and the CLSID the app gives Windows);
 *     quit times are recorded; a file the test touches makes the app quit (so quitting can be measured with no debugger
 *     attached)
 *
 * Then the inspector session is used to read the main process when needed, or closed; the pages are driven with
 * Playwright through Chromium's remote-debugging port (chromium.connectOverCDP).
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
  // notifications first, before anything reads require('electron').Notification (see the module comment): the stand-in
  // is what Electron's module gets from the binding, so it is what every reader of that property gets
  class Notification extends require('events').EventEmitter {
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
    getHistory: async () => [], remove: () => {}, removeAll: () => {}, removeGroup: () => {},
  }
  const linkedBinding = process._linkedBinding
  process._linkedBinding = function (name) { return name === 'electron_browser_notification' ? notificationBinding : linkedBinding.apply(this, arguments) }
  if (require('electron').Notification !== Notification) throw new Error('Electron\\'s Notification was read before the hook: the app would get the real one')
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
    return { canceled: false, filePaths: folder ? [H.pickFolder] : (H.pickFiles ?? []) }
  }
  shell.openPath = async p => { record('open-path', { p }); return '' }
  shell.openExternal = async u => { record('open-external', { u }) }
  clipboard.writeText = t => record('clipboard', { characters: String(t).length })
  const spawn = cp.spawn
  cp.spawn = function (command, args, options) {
    const list = Array.isArray(args) ? args.map(String) : []
    const dsh = list.find(a => /[\\\\/]@deepseek-ai[\\\\/]dsh[\\\\/]lib[\\\\/]bin\\.js$/.test(a))
    const keycheck = list.some(a => /keycheck-child\\.mjs$/.test(a))
    // the update's setup program (desktop/src/main/services/update.mjs: <appData>\\updates\\Streams-<version>-setup.exe):
    // recorded; started only when the test says so (the real upgrade), else a stand-in child that "started". \`args\` in the
    // record are the app's own; a real start gets the test's /LOG=<setupLog> after them (the setup program's log, which
    // the app itself never asks for: see the module comment)
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
    if (dsh) {
      const env = { ...((options && options.env) || process.env) }
      const pathName = Object.keys(env).find(k => k.toUpperCase() === 'PATH')
      record('dsh', { command: String(command), dsh, cwd: options && options.cwd, baseUrlGiven: env.DEEPSEEK_BASE_URL ?? null,
        pathFirst: String(env[pathName] || '').split(';')[0], runAsNode: env.ELECTRON_RUN_AS_NODE ?? null, apiKeySet: typeof env.DEEPSEEK_API_KEY === 'string' })
      env.DEEPSEEK_BASE_URL = H.mockUrl
      env.DEEPSEEK_SEARCH_BASE_URL = H.mockUrl
      options = { ...options, env }
    } else if (!keycheck) {
      record('spawn', { command: String(command), args: list.slice(0, 3) })
    }
    const child = spawn.call(this, command, args, options)
    if (keycheck) {
      const end = child.stdin.end.bind(child.stdin)
      child.stdin.end = (chunk, ...rest) => {
        const body = JSON.parse(String(chunk))
        record('key-check', { command: String(command), baseURL: body.baseURL, model: body.model })
        body.baseURL = H.mockUrl
        return end(JSON.stringify(body), ...rest)
      }
    }
    return child
  }
  // the balance block's own read, in this process (services/env-proxy-fetch.mjs calls https.request with an absolute URL):
  // a request to DeepSeek's address is recorded first (the URL, the method, whether a Bearer authorization was sent —
  // never its value), then answered by the test's stand-in over loopback, with no agent (no connection kept). Any other
  // request, and any other way out (https.get, fetch), is left alone: the proxy trap catches it.
  // The update's requests (desktop/src/main/services/update.mjs: the check's GET of GitHub's API and the download of the setup
  // program, both through env-proxy-fetch.mjs, i.e. https.request with an absolute URL) the same way: a request to
  // https://api.github.com/repos/AsuraNale/streams/… or https://github.com/AsuraNale/streams/releases/download/…
  // is recorded (the URL, the method, its Accept and User-Agent) and answered by the test's stand-in for GitHub
  // (\`githubUrl\`, desktop/test/support/update-mock.mjs), path and all.
  const routes = [
    ...(H.balanceUrl ? [{ re: /^https:\\/\\/api\\.deepseek\\.com\\//i, base: H.balanceUrl, kind: 'balance-read' }] : []),
    ...(H.githubUrl ? [{ re: /^https:\\/\\/(api\\.github\\.com\\/repos\\/AsuraNale\\/streams-releases\\/|github\\.com\\/AsuraNale\\/streams-releases\\/releases\\/download\\/)/i, base: H.githubUrl, kind: 'github-request' }] : []),
  ]
  if (routes.length) {
    const https = require('https')
    const http = require('http')
    const request = https.request
    https.request = function (target, options, callback) {
      const url = typeof target === 'string' ? target : target instanceof URL ? target.href : null
      const route = url === null ? null : routes.find(r => r.re.test(url))
      if (!route) return request.apply(this, arguments)
      if (typeof options === 'function') { callback = options; options = {} }
      const o = options || {}
      const headers = o.headers || {}
      const header = name => { const k = Object.keys(headers).find(h => h.toLowerCase() === name); return k === undefined ? null : String(headers[k]) }
      if (route.kind === 'balance-read') record('balance-read', { url, method: o.method || 'GET', bearer: /^Bearer \\S+$/.test(header('authorization') ?? '') })
      else record('github-request', { url, method: o.method || 'GET', accept: header('accept'), userAgent: header('user-agent') })
      const u = new URL(url)
      return http.request(route.base + u.pathname + u.search, { method: o.method, headers, signal: o.signal, agent: false }, callback)
    }
  }
  require('module').syncBuiltinESMExports()
  for (const e of ['before-quit', 'will-quit', 'quit']) app.on(e, () => record(e))
  process.on('exit', () => record('exit'))
  if (H.quitFile) {
    const watcher = fs.watchFile(H.quitFile, { interval: 100 }, cur => { if (cur.mtimeMs > 0) { record('quit-file'); app.quit() } })
    if (watcher && watcher.unref) watcher.unref()
  }
  record('hook', { notifications: 'stand-in' })
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

/** Wait for a line on a stream (the inspector's and DevTools' "listening on ws://…" lines go to stderr). */
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
 * @param {object} o.hook - {appData, localAppData, mockUrl, recordFile, pickFolder, pickFiles?, quitFile?, balanceUrl?, githubUrl?, setupSpawn?: 'record' | 'run', setupLog?}
 * @param {boolean} [o.devtools] - open Chromium's remote-debugging port and connect Playwright to the page
 * @param {string} o.repo - the repository (playwright-core from desktop/node_modules)
 */
export async function launchInstalled({ exe, env, hook, devtools = true, repo, cwd }) {
  const args = ['--inspect-brk=0', ...(devtools ? ['--remote-debugging-port=0'] : [])]
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
      page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('app://ui/')) ?? null
      if (!page) await sleep(200)
    }
    if (!page) throw new Error('no app://ui/ page')
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

/** Touch the quit file: the app quits as when its window is closed. */
export function requestQuit(file) {
  appendFileSync(file, 'quit\n')
}
