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
import { isPanelPatch, readSettings, writeSettings } from './settings.mjs'
import { BridgeError } from './bridge-methods.mjs'
import { DEFAULT_THEME, isAppearance, isThemeId } from './theme.mjs'
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
 * @param {() => void} [o.applyTheme] - the look on Electron's side, from settings.json (main.mjs: nativeTheme, the windows'
 *   background, the reading window). v2 package K2: no argument — the theme and the appearance are both read there
 * @param {() => string} [o.scheme] - v2 package K2: the appearance in force now, 'light' | 'dark' (main.mjs: the setting, or
 *   what Windows uses for 'system')
 * @param {{packaged: boolean, desktopDir: string, installDir: string}} o.licenses - where licensesView reads (main.mjs)
 * @param {{lines: () => string[]}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs, the raw error texts for the diagnostics
 */
/** The maker's site (README and the about part: 「由 Starry Digital 开发」, 维护者 11-02). */
export const MAKER_URL = 'https://starrydigital.ca'

export function createAppServices({ layout, emit, log, hidden = false, locale, version, library, connections, secrets, applyTheme = () => {}, scheme = () => 'light', licenses, rawErrors = null }) {
  const settings = () => readSettings(layout.settingsFile)

  const appState = () => {
    const s = settings()
    return {
      // the library: its folder name is what the sidebar shows; null is 「未打开库」
      library: library.current(),
      // v2 package I: how many libraries the app knows (the registry's, the development one too) — 0 is 首次打开 (app.js)
      libraryCount: library.entries().length,
      // v2 package I: the connection chosen in settings.json (claude-code · codex · api), or null — 和主 Agent 聊's guide says
      // 「还没有连接」 without it (no detection: only the setting is read)
      activeConnection: s.connections.active,
      // 1.1.1 P6 (B17): with an API key connection, whether the model's key is stored (新建库 says so before starting); null
      // for another connection
      activeHasKey: s.connections.active === 'api' ? (() => { try { return secrets.has(`key-${s.connections.api.vendor}`) } catch { return false } })() : null,
      // the registered libraries (settings 「库 · 其他」 lists those that are not the current one; openRecentLibrary takes
      // only one of these): path and name. v2 package A: from the registry, no longer settings.json's recentLibraries
      recentLibraries: library.entries().filter(l => !l.temporary).map(l => ({ path: l.path, name: l.name })),
      showDeveloperInfo: s.showDeveloperInfo,
      // the language of the app's own words: the setting and what it comes to (locale.mjs)
      language: locale.current(),
      // the app's own version (version.mjs: release.json's) and whether this is a development run
      version: version.version,
      devBuild: version.dev,
      // the app's look (theme.mjs): one of THEME_IDS; v2 package K2: the appearance setting (light · dark · system) and the
      // set in force now (light · dark), which the page puts on <html data-appearance> (app.js)
      theme: s.theme,
      appearance: s.appearance,
      scheme: scheme(),
      // 设置 marks the default theme's card 「默认」 (theme.mjs DEFAULT_THEME, the one place it is defined)
      defaultTheme: DEFAULT_THEME,
      // v2 package L: the main window's right panel — open or folded, and its tab (settings.json; screens/right-panel.js)
      panel: s.panel,
    }
  }

  const handlers = {
    getAppState: () => appState(),
    /**
     * v2 package L: the right panel folded / unfolded, or another tab — written into settings.json, so the next start opens it
     * the same way. No event: the page that asked keeps what this answers ({ open, tab }).
     */
    setPanel(patch) {
      if (!isPanelPatch(patch)) throw new BridgeError('bad_arguments')
      const s = writeSettings(layout.settingsFile, { panel: patch })
      log(`panel: ${s.panel.open ? 'open' : 'folded'}, ${s.panel.tab}`)
      return s.panel
    },
    /** 「语言」: write the setting and decide the language again; `changed` tells the page to load itself again. */
    setLanguage(v) {
      const r = locale.set(v)
      emit('settings-changed', null)
      return r
    },
    /**
     * 「主题」: write the setting, then the look on Electron's side; the page sets its own data-theme at once. v2 package K2:
     * the answer is the whole look — { theme, appearance, scheme } — so the page sets data-theme and data-appearance from it.
     */
    setTheme(id) {
      if (!isThemeId(id)) throw new BridgeError('bad_arguments')
      const s = writeSettings(layout.settingsFile, { theme: id })
      applyTheme()
      log(`theme: ${s.theme}`)
      emit('settings-changed', null)
      return { theme: s.theme, appearance: s.appearance, scheme: scheme() }
    },
    /** v2 package K2 「外观」: light · dark · system written, Electron's side follows (nativeTheme.themeSource), then the page. */
    setAppearance(a) {
      if (!isAppearance(a)) throw new BridgeError('bad_arguments')
      const s = writeSettings(layout.settingsFile, { appearance: a })
      applyTheme()
      log(`appearance: ${s.appearance} (${scheme()})`)
      emit('settings-changed', null)
      return { theme: s.theme, appearance: s.appearance, scheme: scheme() }
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
        // redesign R5a (O9): the raw error texts the page was not given
        rawErrors: rawErrors?.lines() ?? [],
      })
      // a test run (hidden window) must not overwrite the clipboard of the person at the machine: the text goes to a file
      if (hidden) writeFileSync(join(layout.logsDir, 'clipboard.txt'), text)
      else clipboard.writeText(text)
      return { ok: true }
    },
  }

  return { handlers, settings }
}
