/**
 * Streams desktop — the main process (Electron 44.0.0). See docs/desktop.md.
 *
 * Start order: work out the folders (layout.mjs; a development run without its variables stops here) →
 * point Electron's own data into the protected folder → register app:// → sandbox every page → when
 * ready: lock the session, serve the page, register the bridge, open the window.
 * @module desktop/main/main
 */

import { app, BrowserWindow, Menu, Notification, dialog, protocol, safeStorage, session, shell } from 'electron'
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
import { createUsageCounter } from './core.mjs'
import { createNotifier } from './services/notify.mjs'
import { wireUpdate } from './update-wiring.mjs'
import { appVersion } from './version.mjs'
import { endHelpers } from './quit.mjs'
import { APP_USER_MODEL_ID, TOAST_ACTIVATOR_CLSID } from './app-id.mjs'
import { iconPath } from './icon.mjs'

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

app.on('web-contents-created', (_event, contents) => guardContents(contents, { onBlocked: blocked }))

// the app's own windows: where events go (events.mjs)
const appWindows = new Set()
const emit = createEmitter(() => [...appWindows], log)

/** The app's window to the front (restored when minimised): a second launch, a click on a notification. false: no window. */
function bringToFront() {
  const win = [...appWindows][0]
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  if (!HIDDEN) win.show()
  win.focus()
  return true
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    useContentSize: true,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    backgroundColor: '#F2F5F7',
    autoHideMenuBar: true,
    icon: ICON,
    webPreferences: { ...WEB_PREFERENCES, preload: PRELOAD, devTools: !app.isPackaged },
  })
  appWindows.add(win)
  win.on('closed', () => appWindows.delete(win))
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
  const uiHandler = createAppProtocolHandler({ rendererDir: RENDERER_DIR, sharedDir: SHARED_DIR, vendor: vendorFiles(), csp, dev: !app.isPackaged, locale: () => locale.current().resolved })
  protocol.handle(APP_SCHEME, request => uiHandler(request))

  // the secret store (secrets.mjs), the library (services/library.mjs), the connections (services/connections.mjs), the
  // pipeline (services/pipeline.mjs), then the shell's own services (app-services.mjs): the app state, the settings page
  const secrets = createSecretStore({ dir: layout.secretsDir, safeStorage })
  const currentLocale = () => locale.current()
  const library = createLibraryService({ settingsFile: layout.settingsFile, emit, log, hidden: HIDDEN, dialog, shell, locale: currentLocale, devLibrary: DEV_LIBRARY, devChooseFolder: DEV_CHOOSE_FOLDER })
  const connections = createConnectionsService({
    settingsFile: layout.settingsFile, emit, log, hidden: HIDDEN, secrets, locale: currentLocale, devConnection: DEV_CONNECTION,
    // a probe made from the page counts in the open library's usage (core createUsageCounter), under `probe`
    usageWrap: c => { const d = library.dir(); return d ? createUsageCounter(d).wrap(c, 'probe') : c },
  })
  const pipeline = createPipelineService({ library, connections, emit, log, hidden: HIDDEN, shell, locale: currentLocale })
  // interface B (docs/desktop.md §4.2): reading and editing, the sources and topics, asking the library, the run status
  const browse = createBrowseService({ library, emit, log, hidden: HIDDEN, shell })
  const sources = createSourcesService({ library, emit, log })
  const ask = createAskService({ library, connections, log })
  const status = createStatusService({ library, connections, log, hidden: HIDDEN, shell })
  const services = createAppServices({ layout, emit, log, hidden: HIDDEN, locale, version: VERSION, library, connections, secrets })
  // Windows notifications (services/notify.mjs): made here, used by later wiring (the pipeline's rounds, plan C5)
  const notifier = createNotifier({
    Notification, windows: () => [...appWindows], bringToFront, emit, log,
    logFile: HIDDEN ? join(layout.logsDir, 'notifications.jsonl') : null,
    locale: () => locale.current().resolved,
  })
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
      ...sources.handlers,
      ...ask.handlers,
      ...status.handlers,
    },
  })

  createWindow()
  void notifier

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
