/**
 * The shell's own services and their bridge handlers: the app state the page draws itself from, the settings page
 * (language, the theme, the developer switch, the diagnostics, 许可证与致谢). The library, the connections and the pipeline are their own
 * services (services/library.mjs, services/connections.mjs, services/pipeline.mjs); main.mjs creates all four and
 * spreads their `handlers` into registerBridge. This one reads the library service for the app state and the
 * connections service and the secret store for the diagnostics.
 * @module desktop/main/app-services
 */

import { clipboard, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { diagnosticsText } from './diagnostics.mjs'
import { readSettings, writeSettings } from './settings.mjs'
import { BridgeError } from './bridge-methods.mjs'
import { isThemeId } from './theme.mjs'
import { licensesView, noticesFileOf } from './licenses.mjs'

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
 * @param {{current: () => {libraryId: string, path: string, name: string}|null, entries: () => object[]}} o.library - services/library.mjs
 * @param {{diagnosticLines: () => string[]}} o.connections - services/connections.mjs
 * @param {{list: () => string[], get: (name: string) => string|null}} o.secrets - secrets.mjs
 * @param {(id: string) => void} [o.applyTheme] - the theme on Electron's side (main.mjs: nativeTheme, the windows' background)
 * @param {{packaged: boolean, desktopDir: string, installDir: string}} o.licenses - where licensesView reads (main.mjs)
 */
/** The maker's site (README and the about part: 「由 Starry Digital 开发」, 维护者 11-02). */
export const MAKER_URL = 'https://starrydigital.ca'

export function createAppServices({ layout, emit, log, hidden = false, locale, version, library, connections, secrets, applyTheme = () => {}, licenses }) {
  const settings = () => readSettings(layout.settingsFile)

  const appState = () => {
    const s = settings()
    return {
      // the library: its folder name is what the sidebar shows; null is 「未打开库」
      library: library.current(),
      // the registered libraries (settings 「库 · 其他」 lists those that are not the current one; openRecentLibrary takes
      // only one of these): path and name. v2 package A: from the registry, no longer settings.json's recentLibraries
      recentLibraries: library.entries().filter(l => !l.temporary).map(l => ({ path: l.path, name: l.name })),
      showDeveloperInfo: s.showDeveloperInfo,
      // the language of the app's own words: the setting and what it comes to (locale.mjs)
      language: locale.current(),
      // the app's own version (version.mjs: release.json's) and whether this is a development run
      version: version.version,
      devBuild: version.dev,
      // the app's look (theme.mjs): one of THEME_IDS
      theme: s.theme,
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
    /** 「主题」: write the setting, then the theme on Electron's side; the page sets its own data-theme at once. */
    setTheme(id) {
      if (!isThemeId(id)) throw new BridgeError('bad_arguments')
      const theme = writeSettings(layout.settingsFile, { theme: id }).theme
      applyTheme(theme)
      log(`theme: ${theme}`)
      emit('settings-changed', null)
      return { theme }
    },
    /** 许可证与致谢: Streams' own license, the parts that ship with it, whether the full notices are there (licensesView). */
    getLicenses: () => licensesView(licenses),
    /** 「打开完整的第三方声明」: the install's THIRD-PARTY-NOTICES.txt in the system's viewer (a test run only writes the log). */
    async openNotices() {
      if (!licensesView(licenses).notices.available) throw new BridgeError('open_failed', 'no third-party notices in a development run')
      const file = noticesFileOf(licenses)
      if (hidden) { log(`not opened in a test run: ${file}`); return null }
      const problem = await shell.openPath(file)
      if (problem) throw new BridgeError('open_failed', `openPath ${file}: ${problem}`)
      return null
    },
    setShowDeveloperInfo(on) {
      const r = { showDeveloperInfo: writeSettings(layout.settingsFile, { showDeveloperInfo: on }).showDeveloperInfo }
      emit('settings-changed', null)
      return r
    },
    /** 「由 Starry Digital 开发」 in the about part: the maker's site in the user's browser (a test run only writes the log). */
    async openMakerPage() {
      if (hidden) { log(`not opened in a test run: ${MAKER_URL}`); return null }
      await shell.openExternal(MAKER_URL)
      return null
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
        layout, settings: { ...settings(), libraryPath: library.current()?.path ?? null }, keysHeld: names, secrets: held, locale: locale.current(),
        connections: connections.diagnosticLines(),
      })
      // a test run (hidden window) must not overwrite the clipboard of the person at the machine: the text goes to a file
      if (hidden) writeFileSync(join(layout.logsDir, 'clipboard.txt'), text)
      else clipboard.writeText(text)
      return { ok: true }
    },
  }

  return { handlers, settings }
}
