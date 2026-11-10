/**
 * Streams desktop — the main process (Electron 44.0.0). See docs/desktop.md.
 *
 * Start order: work out the folders (layout.mjs; a development run without its variables stops here) →
 * point Electron's own data into the protected folder → register app:// → sandbox every page → when
 * ready: lock the session, serve the page, register the bridge, open the window.
 * @module desktop/main/main
 */

import { app, BrowserWindow, Menu, Notification, Tray, WebContentsView, dialog, nativeTheme, powerMonitor, protocol, safeStorage, session, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerBridge } from './bridge.mjs'
import { ensureLayout, resolveLayout } from './layout.mjs'
import { createLocaleState } from './locale.mjs'
import { createLog } from './log.mjs'
import { createAppProtocolHandler, vendorFiles } from './protocol.mjs'
import {
  APP_ENTRY, APP_SCHEME, APP_SCHEME_PRIVILEGES, WEB_PREFERENCES, contentSecurityPolicy, guardContents, hardenSession,
  importMapOf, scriptHash,
} from './security.mjs'
import { createEmitter } from './events.mjs'
import { createAppServices } from './app-services.mjs'
import { readSettings, writeSettings } from './settings.mjs'
import { createSecretStore } from './secrets.mjs'
import { createLibraryService } from './services/library.mjs'
import { DEV_CONNECTION_MODES, createConnectionsService } from './services/connections.mjs'
import { createPipelineService } from './services/pipeline.mjs'
import { createBrowseService } from './services/browse.mjs'
import { createSourcesService } from './services/sources.mjs'
import { createAskService } from './services/ask.mjs'
import { createStatusService } from './services/status.mjs'
import { AGENT_DIR, agentPaths, createUsageCounter } from './core.mjs'
import { createNotifier } from './services/notify.mjs'
import { wireUpdate } from './update-wiring.mjs'
import { appVersion } from './version.mjs'
import { endHelpers } from './quit.mjs'
import { APP_USER_MODEL_ID, TOAST_ACTIVATOR_CLSID } from './app-id.mjs'
import { iconPath } from './icon.mjs'
import { createScheduleService } from './services/schedule.mjs'
import { createProposalsService } from './services/proposals.mjs'
import { createAgentService } from './services/agent.mjs'
import { createTray } from './tray.mjs'
import { listInbox } from './core.mjs'
import { nativeSource, windowColour } from './theme.mjs'
import { createReader, isReaderSession, readabilitySource, readerCss } from './reader.mjs'
import { createReaderService } from './services/reader.mjs'
import { defaultLibraryRoot as defaultRootOf } from './library-root.mjs'

const DESKTOP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RENDERER_DIR = join(DESKTOP_DIR, 'src', 'renderer')
const SHARED_DIR = join(DESKTOP_DIR, 'src', 'shared')
const PRELOAD = join(DESKTOP_DIR, 'src', 'preload', 'preload.cjs')
// the app's icon (assets/icon/streams.ico; icon.mjs): the window's title bar and the taskbar, in development and packaged
const ICON = iconPath(DESKTOP_DIR)

// development and tests only (a packaged app ignores both): keep the window hidden (test runs); open
// another screen first (`npm start -- --screen settings`)
const HIDDEN = !app.isPackaged && process.env.STREAMS_WINDOW === 'hidden'
const START_SCREEN = !app.isPackaged && /^[a-z][a-z0-9-]{0,40}$/.test(process.env.STREAMS_START_SCREEN ?? '') ? process.env.STREAMS_START_SCREEN : null
// stand in for the system's preferred languages (comma-separated tags, locale.mjs): the tests pin Chinese with it,
// `npm start -- --lang en` opens the app in English; a packaged app reads the real system languages
const DEV_LANGUAGES = !app.isPackaged && typeof process.env.STREAMS_DEV_SYSTEM_LANGUAGES === 'string'
  ? process.env.STREAMS_DEV_SYSTEM_LANGUAGES.split(',').map(s => s.trim()).filter(Boolean)
  : null
// the update (update-wiring.mjs; docs/desktop.md§四): where a development run asks for the latest release — a stand-in
// for GitHub (`http://127.0.0.1:…`, its downloads too) or `off` (no request: the tests); unset, and in a packaged app, GitHub
const DEV_UPDATE_URL = !app.isPackaged && /^(off|https?:\/\/[^\s/]+\/?)$/.test(process.env.STREAMS_DEV_UPDATE_URL ?? '') ? process.env.STREAMS_DEV_UPDATE_URL : null
// development tests only: a development run may then download and update, the setup program recorded in this file, not started
const DEV_UPDATE_SETUP_RECORD = !app.isPackaged && typeof process.env.STREAMS_DEV_UPDATE_SETUP_RECORD === 'string' && isAbsolute(process.env.STREAMS_DEV_UPDATE_SETUP_RECORD)
  ? process.env.STREAMS_DEV_UPDATE_SETUP_RECORD
  : null
// the library and the connections (services/*.mjs; docs/desktop.md §4.1), development and tests only: a library taken as
// opened at start; a folder given instead of the choose-folder dialog; every connection replaced by the core's fake
const DEV_LIBRARY = !app.isPackaged && typeof process.env.STREAMS_DEV_LIBRARY === 'string' && isAbsolute(process.env.STREAMS_DEV_LIBRARY) ? process.env.STREAMS_DEV_LIBRARY : null
const DEV_CHOOSE_FOLDER = !app.isPackaged && typeof process.env.STREAMS_DEV_CHOOSE_FOLDER === 'string' && isAbsolute(process.env.STREAMS_DEV_CHOOSE_FOLDER) ? process.env.STREAMS_DEV_CHOOSE_FOLDER : null
const DEV_CONNECTION = !app.isPackaged && DEV_CONNECTION_MODES.includes(process.env.STREAMS_DEV_CONNECTION) ? process.env.STREAMS_DEV_CONNECTION : null
// the timed round (services/schedule.mjs; docs/desktop.md §4.3), development and tests only: 「now」 is this ISO time when the
// app starts and runs on from there (the schedule, the catch-up and the rounds read this clock); a packaged app reads the real one
const DEV_NOW = !app.isPackaged && typeof process.env.STREAMS_DEV_NOW === 'string' && !Number.isNaN(Date.parse(process.env.STREAMS_DEV_NOW)) ? Date.parse(process.env.STREAMS_DEV_NOW) : null
// the proposal cards (services/proposals.mjs; docs/desktop.md §4.5), development and tests only: a JSON file of cards made at
// start (by: 'dev'), for the page's tests and package G; where a new library goes when a card names no folder and
// settings.json has no libraryRoot (a development run never falls back to the real Documents folder: without this, a folder in
// its own app data). A packaged app ignores both: its cards come from the main agent, its default place is Documents\Streams
const DEV_PROPOSALS = !app.isPackaged && typeof process.env.STREAMS_DEV_PROPOSALS === 'string' && isAbsolute(process.env.STREAMS_DEV_PROPOSALS) ? process.env.STREAMS_DEV_PROPOSALS : null
const DEV_LIBRARY_ROOT = !app.isPackaged && typeof process.env.STREAMS_DEV_LIBRARY_ROOT === 'string' && isAbsolute(process.env.STREAMS_DEV_LIBRARY_ROOT) ? process.env.STREAMS_DEV_LIBRARY_ROOT : null
// the main agent (services/agent.mjs; docs/desktop.md §4.6), development and tests only: with STREAMS_DEV_CONNECTION=fake the
// agent's scripted answers, a JSON file (for the page's tests and package G). A packaged app ignores it: its agent talks to the
// chosen connection
const DEV_AGENT_SCRIPT = !app.isPackaged && typeof process.env.STREAMS_DEV_AGENT_SCRIPT === 'string' && isAbsolute(process.env.STREAMS_DEV_AGENT_SCRIPT) ? process.env.STREAMS_DEV_AGENT_SCRIPT : null
const STARTED_AT = Date.now()
const clock = DEV_NOW === null ? () => new Date() : () => new Date(DEV_NOW + (Date.now() - STARTED_AT))
// the app's own version (version.mjs): release.json's — packaged through resources/app/package.json, in development read from it
const VERSION = appVersion({ isPackaged: app.isPackaged, getVersion: () => app.getVersion() })

let layout
try {
  layout = resolveLayout({
    isPackaged: app.isPackaged,
    roamingAppData: app.getPath('appData'),
    localAppData: process.env.LOCALAPPDATA || join(app.getPath('home'), 'AppData', 'Local'),
    env: process.env,
  })
  ensureLayout(layout)
} catch (err) {
  process.stderr.write(`streams: ${err?.code ?? 'error'}: ${err?.message ?? err}\n`)
  app.exit(1)
  throw err
}

// Chromium's own data (caches, local storage, the key safeStorage uses) inside the protected folder
app.setPath('userData', layout.chromiumDir)
app.setPath('sessionData', layout.chromiumDir)
app.setPath('crashDumps', join(layout.chromiumDir, 'Crashpad'))
app.setAppLogsPath(layout.logsDir)

const log = createLog(layout.logsDir)
const blocked = url => log(`blocked: ${url}`)

// the packaged app's identity for Windows — its notifications show under the installer's shortcuts, which carry the
// same ID and the same toast activator CLSID (app-id.mjs: with the CLSID fixed, Electron leaves those shortcuts alone and
// registers no new CLSID each run). A development run keeps Electron's own.
if (app.isPackaged) {
  app.setAppUserModelId(APP_USER_MODEL_ID)
  app.setToastActivatorCLSID(TOAST_ACTIVATOR_CLSID)
}

// one app at a time: the lock is the user-data folder's, so a second launch on the same data gives way at once and the
// first one brings its window to the front ('second-instance', below)
if (!app.requestSingleInstanceLock()) {
  log('a second launch: the app already runs, so this one ends')
  app.exit(0)
}

protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: APP_SCHEME_PRIVILEGES }])
app.enableSandbox()
Menu.setApplicationMenu(null)

// (the reading window's contents are the reader's to guard: reader.mjs guardReaderContents — they may show http(s) pages)
app.on('web-contents-created', (_event, contents) => {
  if (isReaderSession(contents.session, p => session.fromPartition(p))) return
  guardContents(contents, { onBlocked: blocked })
})

// the app's own windows: where events go (events.mjs)
const appWindows = new Set()
const emitToPages = createEmitter(() => [...appWindows], log)
// the main process's own listeners of the same events (the tray's hint follows `inbox-changed`)
const emitListeners = []
const emit = (topic, payload = null) => {
  const sent = emitToPages(topic, payload)
  for (const listener of emitListeners) {
    try { listener(topic, payload) } catch (err) { log(`event ${topic}: a listener failed: ${String(err?.stack ?? err)}`) }
  }
  return sent
}

// closing the window (docs/desktop.md §4.3): with the schedule of any library on, the close button hides it into the tray; the tray's
// 「退出」, an update and every other quit really end the app (before-quit comes first)
let quitting = false
let closeToTray = () => false
let closeReader = () => {}
app.on('before-quit', () => { quitting = true })

/** The app's window to the front (restored when minimised): a second launch, a click on a notification. false: no window. */
function bringToFront() {
  const win = [...appWindows][0]
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  if (!HIDDEN) win.show()
  win.focus()
  return true
}

// the app's look (theme.mjs; docs/desktop.md §五「主题」): settings.json's theme, read when it is needed — the window's colour
// before the first frame, Electron's own parts (nativeTheme), index.html's data-theme (protocol.mjs)
const currentTheme = () => readSettings(layout.settingsFile).theme
/** The theme on Electron's side: the title bar, native scrollbars and pop-up menus, and every window's background. */
function applyTheme(id) {
  nativeTheme.themeSource = nativeSource(id)
  for (const win of appWindows) if (!win.isDestroyed()) win.setBackgroundColor(windowColour(id))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    useContentSize: true,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    backgroundColor: windowColour(currentTheme()),
    autoHideMenuBar: true,
    icon: ICON,
    webPreferences: { ...WEB_PREFERENCES, preload: PRELOAD, devTools: !app.isPackaged },
  })
  appWindows.add(win)
  // the reading window goes with the app's window (it is part of it, not an app of its own)
  win.on('closed', () => { appWindows.delete(win); if (appWindows.size === 0) closeReader() })
  win.on('close', event => {
    if (quitting || !closeToTray()) return
    event.preventDefault()
    win.hide()
    log('window: closed into the tray (the schedule is on)')
  })
  if (!HIDDEN) win.once('ready-to-show', () => win.show())
  win.loadURL(START_SCREEN ? `${APP_ENTRY}#${START_SCREEN}` : APP_ENTRY)
  return win
}

app.whenReady().then(() => {
  const csp = contentSecurityPolicy(scriptHash(importMapOf(readFileSync(join(RENDERER_DIR, 'index.html'), 'utf8'))))
  hardenSession(session.defaultSession, { allowDevtools: !app.isPackaged, onBlocked: blocked })
  // the language of the app's own words (locale.mjs; docs/desktop.md§六): decided here once — app.getLocale() is only valid
  // after ready on Windows — and again whenever the settings page changes the setting; the page and the notifier follow it
  const locale = createLocaleState({
    settingsFile: layout.settingsFile, readSettings, writeSettings, log,
    systemLanguages: () => (DEV_LANGUAGES ? { preferred: DEV_LANGUAGES, fallback: null } : { preferred: app.getPreferredSystemLanguages(), fallback: app.getLocale() }),
  })
  // the theme's native side before the window is made (its background is read in createWindow, the page's in protocol.mjs)
  nativeTheme.themeSource = nativeSource(currentTheme())
  const uiHandler = createAppProtocolHandler({ rendererDir: RENDERER_DIR, sharedDir: SHARED_DIR, vendor: vendorFiles(), csp, dev: !app.isPackaged, locale: () => locale.current().resolved, theme: currentTheme })
  protocol.handle(APP_SCHEME, request => uiHandler(request))

  // the secret store (secrets.mjs), the library (services/library.mjs), the connections (services/connections.mjs), the
  // pipeline (services/pipeline.mjs), then the shell's own services (app-services.mjs): the app state, the settings page
  const secrets = createSecretStore({ dir: layout.secretsDir, safeStorage })
  const currentLocale = () => locale.current()
  // where a new library goes when settings.json has no libraryRoot (v2 packages B and I): a development run never falls back to
  // the real Documents folder. v2 package J2: worked out when first needed, not at start — the packaged app did not start
  // where Windows could not give the Documents folder; now it falls back to <home>Streams, then <app data>libraries, with a
  // line in the log (library-root.mjs)
  const defaultLibraryRoot = defaultRootOf({ packaged: app.isPackaged, getPath: name => app.getPath(name), devRoot: DEV_LIBRARY_ROOT, appData: layout.appData, log })
  // the libraries the app knows (v2 package A): the registry in layout.librariesFile, made from settings.json the first time
  const library = createLibraryService({
    // 新建库默认放在 (v2 package I): shown and changed on 设置, never inside the protected folder
    defaultLibraryRoot, protectedDirs: layout.protectedDirs,
    settingsFile: layout.settingsFile, registryFile: layout.librariesFile, emit, log, hidden: HIDDEN, dialog, shell, locale: currentLocale, now: clock, devLibrary: DEV_LIBRARY, devChooseFolder: DEV_CHOOSE_FOLDER,
    // the main agent's calls count in 「全部库本月用量合计」 on their own line (v2 package C)
    agentUsageFile: agentPaths(join(layout.appData, AGENT_DIR)).usage,
  })
  const connections = createConnectionsService({
    settingsFile: layout.settingsFile, emit, log, hidden: HIDDEN, secrets, locale: currentLocale, devConnection: DEV_CONNECTION,
    // a probe made from the page counts in the open library's usage (core createUsageCounter), under `probe`
    usageWrap: c => { const d = library.dir(); return d ? createUsageCounter(d).wrap(c, 'probe') : c },
  })
  // the schedule and the queue (services/schedule.mjs) are made below; the pipeline reaches them through these three
  // (getHome's nextRun; the end of a round: the notification, the next one in the queue; the page's startRound: the queue)
  let scheduler = null
  // the main agent (made below): after every round it records the library's rule-based suggestion cards (v2 package C)
  let agent = null
  const pipeline = createPipelineService({
    library, connections, emit, log, hidden: HIDDEN, shell, locale: currentLocale, now: clock,
    schedule: () => scheduler?.view() ?? null, onRoundDone: done => scheduler?.roundDone(done),
    roundGate: () => scheduler.startCurrent('the page'),
    afterRound: r => agent?.afterRound(r),
  })
  // interface B (docs/desktop.md §4.2): reading and editing, the sources and topics, asking the library, the run status
  const browse = createBrowseService({ library, emit, log, hidden: HIDDEN, shell })
  // 「打开原文」 (v2 package H; reader.mjs): the isolated reading window, 阅读模式 by @mozilla/readability
  const reader = createReader({
    BrowserWindow, WebContentsView, session, shell, log, hidden: HIDDEN, icon: ICON,
    locale: () => locale.current().resolved, theme: currentTheme,
    css: readerCss(RENDERER_DIR), readability: readabilitySource(DESKTOP_DIR),
    onBack: () => { bringToFront() },
  })
  const readerService = createReaderService({ library, reader, log })
  closeReader = () => { reader.window()?.close() }
  const sources = createSourcesService({ library, emit, log })
  // the library's chat box (v2 package E): a sentence routed to a change goes to the main agent (made below) with the library's id
  const ask = createAskService({ library, connections, log, agentSend: (text, options) => agent.handlers.agentSend(text, options) })
  const status = createStatusService({ library, connections, log, hidden: HIDDEN, shell, schedule: () => scheduler?.view() ?? null })
  const services = createAppServices({
    layout, emit, log, hidden: HIDDEN, locale, version: VERSION, library, connections, secrets, applyTheme,
    // 许可证与致谢 (licenses.mjs): the packaged app reads its own copies (resources/app, beside Streams.exe), a development run the repository's
    licenses: { packaged: app.isPackaged, desktopDir: DESKTOP_DIR, installDir: dirname(process.execPath) },
  })
  // Windows notifications (services/notify.mjs): made here, used by later wiring (the pipeline's rounds, plan C5)
  const notifier = createNotifier({
    Notification, windows: () => [...appWindows], bringToFront, emit, log,
    logFile: HIDDEN ? join(layout.logsDir, 'notifications.jsonl') : null,
    locale: () => locale.current().resolved, clock,
  })
  // the timed rounds, the queue and the tray (docs/desktop.md §4.3–4.4): the timer, the catch-up, the close button into the tray
  scheduler = createScheduleService({ settingsFile: layout.settingsFile, library, pipeline, notifier, emit, log, now: clock })
  closeToTray = () => scheduler.enabled()
  // the proposal cards (v2 package B): made by the main agent later (createProposal, not on the bridge), confirmed on the page;
  // a confirm reaches the registry and the queue through the library service and the scheduler
  const proposals = createProposalsService({
    appDataDir: layout.appData, library, scheduler: () => scheduler, emit, log, now: clock, locale: currentLocale,
    libraryRoot: () => readSettings(layout.settingsFile).libraryRoot ?? defaultLibraryRoot(),
    fallbackSchedule: () => readSettings(layout.settingsFile).schedule,
    devProposals: DEV_PROPOSALS,
  })
  // the main agent (v2 package C): one conversation, one turn at a time; its cards go through createProposal above, so only
  // the user's 「确认」 changes anything
  agent = createAgentService({ appDataDir: layout.appData, library, connections, proposals, emit, log, now: clock, locale: currentLocale, devScript: DEV_AGENT_SCRIPT })
  // the tray's count is the current library's
  const inboxNow = () => { const d = library.dir(); if (!d) return 0; try { return listInbox(d).length } catch { return 0 } }
  const tray = createTray({
    Tray, Menu, icon: ICON, hidden: HIDDEN, log, locale: () => locale.current().resolved,
    onOpen: () => { if (!bringToFront()) createWindow() },
    onRunNow: () => { void scheduler.startOne('the tray menu') },
    onQuit: () => { quitting = true; app.quit() },
  })
  tray.setCount(inboxNow())
  emitListeners.push((topic, payload) => {
    // another library's inbox (a timed round of it) leaves the current library's count as it is
    if (topic === 'inbox-changed') tray.setCount(Number.isInteger(payload?.count) && payload?.libraryId === library.current()?.libraryId ? payload.count : inboxNow())
    else if (topic === 'library-changed') tray.setCount(inboxNow())
    else if (topic === 'settings-changed') tray.refresh()
    // a library registered, removed or switched to: the timer again, for the libraries as they are now
    else if (topic === 'libraries-changed') scheduler.arm()
  })
  powerMonitor.on('resume', () => { void scheduler.resumed() })
  app.on('will-quit', () => { scheduler.stop(); tray.destroy() })
  // the update (update-wiring.mjs): a check only when the user asks; the setup program replaces the install in place
  const update = wireUpdate({
    emit, layout, log, hidden: HIDDEN, packaged: app.isPackaged, version: VERSION, turnRunning: () => pipeline.isRunning(),
    quit: () => app.quit(), shell, devUpdateURL: DEV_UPDATE_URL, devSetupRecord: DEV_UPDATE_SETUP_RECORD,
  })
  // last time's leftovers in <appData>/updates/ (the setup program that ran, a download cut short)
  update.start()
  // this run's Chromium helpers end with it (quit.mjs: a slow exit seen in the tests)
  // (the list is taken at before-quit: by will-quit Electron no longer lists them, yet they are still there)
  let helpersAtQuit = []
  app.on('before-quit', () => { helpersAtQuit = app.getAppMetrics() })
  app.on('will-quit', () => endHelpers({ metrics: helpersAtQuit, selfPid: process.pid, log }))

  registerBridge({
    log,
    handlers: {
      ...services.handlers,
      ...update.handlers,
      ...library.handlers,
      ...connections.handlers,
      ...pipeline.handlers,
      ...browse.handlers,
      ...readerService.handlers,
      ...sources.handlers,
      ...ask.handlers,
      ...status.handlers,
      ...scheduler.handlers,
      ...proposals.handlers,
      ...agent.handlers,
    },
  })

  createWindow()
  // the catch-up at start: the libraries are known by now (the registry, the development one)
  void scheduler.start()
  // the development cards (STREAMS_DEV_PROPOSALS), once the libraries are known
  void proposals.loadDev()

  // a second launch (the single-instance lock above): this app's window comes to the front instead
  app.on('second-instance', () => {
    log('second launch: the window is brought to the front')
    bringToFront()
  })
}).catch(err => {
  // a start that fails is a defect: say it in the log and on stderr, and stop (no half-started app)
  log(`start failed: ${String(err?.stack ?? err)}`)
  process.stderr.write(`streams: start failed: ${err?.message ?? err}\n`)
  app.exit(1)
})

app.on('window-all-closed', () => app.quit())
