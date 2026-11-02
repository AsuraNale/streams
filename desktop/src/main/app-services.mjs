/**
 * The shell's own services and their bridge handlers: the app state the page draws itself from, the settings page
 * (language, the developer switch, the diagnostics), the secret store the connections will keep their keys in. main.mjs
 * only creates this and spreads `handlers` into registerBridge — so later wiring (the library, the pipeline, the
 * connections: plan C1–C9) sits next to it without touching this file.
 *
 * Development and tests only (a packaged app ignores it):
 *   STREAMS_DEV_LIBRARY   a library folder taken as opened at start (the page shows its name instead of 「未打开库」)
 * @module desktop/main/app-services
 */

import { app, clipboard, safeStorage } from 'electron'
import { writeFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import { diagnosticsText } from './diagnostics.mjs'
import { createSecretStore } from './secrets.mjs'
import { readSettings, writeSettings } from './settings.mjs'

/**
 * @param {object} o
 * @param {object} o.layout - layout.mjs
 * @param {(topic: string, payload: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run (no window shown): nothing is opened outside the app, and the diagnostics go to
 *   <appData>/logs/clipboard.txt instead of the clipboard
 * @param {{current: () => {setting: string, resolved: string}, set: (v: string) => object}} o.locale - the language of the
 *   app's own words (locale.mjs)
 * @param {{version: string, dev: boolean}} o.version - the app's own version (version.mjs)
 */
export function createAppServices({ layout, emit, log, hidden = false, locale, version }) {
  const dev = !app.isPackaged
  const devEnv = dev ? process.env : {}
  const settings = () => readSettings(layout.settingsFile)
  const secrets = createSecretStore({ dir: layout.secretsDir, safeStorage })
  // the library the app has open: the development variable when given, else the setting (null until one is opened)
  const devLibrary = typeof devEnv.STREAMS_DEV_LIBRARY === 'string' && isAbsolute(devEnv.STREAMS_DEV_LIBRARY) ? devEnv.STREAMS_DEV_LIBRARY : null
  const libraryPath = () => devLibrary ?? settings().libraryPath

  const appState = () => {
    const s = settings()
    const library = libraryPath()
    return {
      // the library: its folder name is what the sidebar shows; null is 「未打开库」
      library: library ? { path: library, name: basename(library) } : null,
      showDeveloperInfo: s.showDeveloperInfo,
      // the language of the app's own words: the setting and what it comes to (locale.mjs)
      language: locale.current(),
      // the app's own version (version.mjs: release.json's) and whether this is a development run
      version: version.version,
      devBuild: version.dev,
    }
  }

  const handlers = {
    getAppState: () => appState(),
    /** 「语言」: write the setting and decide the language again; `changed` tells the page to load itself again. */
    setLanguage(v) {
      const r = locale.set(v)
      emit('settings-changed', null)
      return r
    },
    setShowDeveloperInfo(on) {
      const r = { showDeveloperInfo: writeSettings(layout.settingsFile, { showDeveloperInfo: on }).showDeveloperInfo }
      emit('settings-changed', null)
      return r
    },
    copyDiagnostics() {
      const held = []
      const names = []
      // every stored key is taken out of the text; the names say which connections have one
      for (const name of secrets.list()) {
        names.push(name)
        try { const k = secrets.get(name); if (k) held.push(k) } catch { /* not readable: nothing to take out */ }
      }
      const text = diagnosticsText({
        versions: { app: `${version.version}${version.dev ? ' (development)' : ''}`, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, os: `${process.platform} ${process.getSystemVersion()}` },
        layout, settings: settings(), keysHeld: names, secrets: held, locale: locale.current(),
      })
      // a test run (hidden window) must not overwrite the clipboard of the person at the machine: the text goes to a file
      if (hidden) writeFileSync(join(layout.logsDir, 'clipboard.txt'), text)
      else clipboard.writeText(text)
      return { ok: true }
    },
  }

  return { handlers, settings, libraryPath, secrets }
}
