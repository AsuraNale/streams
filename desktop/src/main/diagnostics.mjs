/**
 * 「复制诊断信息」 (the settings page): a plain-text report for us, put on the clipboard by the main process (the page has
 * no clipboard permission, docs/desktop.md §五). Versions, the app's folders, the settings, which connections hold a key
 * (names only, never a key), and the end of the app's own log. Every secret the app holds is taken out of the text
 * before it leaves (the log never has one, this is the second line of defence), and so is anything that looks like an
 * API key.
 * @module desktop/main/diagnostics
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LOG_LINES = 200
const KEY_LIKE = /sk-[A-Za-z0-9_-]{8,}/g

/**
 * @param {object} o
 * @param {{app: string, electron: string, chrome: string, node: string, os: string}} o.versions
 * @param {object} o.layout
 * @param {object} o.settings
 * @param {string[]} [o.keysHeld] - the names of the secrets stored (key-<provider>), never their values
 * @param {string[]} o.secrets - every secret value the app holds now (taken out of the text)
 * @param {{setting: string, resolved: string}|null} [o.locale] - the language setting and what it came to (locale.mjs)
 * @param {string[]} [o.connections] - the connections' state, one line each (services/connections.mjs diagnosticLines:
 *   which one is active, what detection found; never a key or its hint)
 * @returns {string}
 */
export function diagnosticsText({ versions, layout, settings, keysHeld = [], secrets = [], locale = null, connections = [] }) {
  let log = ''
  try {
    const lines = readFileSync(join(layout.logsDir, 'main.log'), 'utf8').split('\n')
    log = lines.slice(-LOG_LINES - 1).join('\n')
  } catch {
    log = '(no log yet)'
  }
  let text = [
    'Streams diagnostics',
    `app ${versions.app} · Electron ${versions.electron} · Chromium ${versions.chrome} · Node ${versions.node} · ${versions.os}`,
    `app data: ${layout.appData}`,
    `local data: ${layout.localData}`,
    `library: ${settings.libraryPath ?? '(none open)'}`,
    `developer info: ${settings.showDeveloperInfo ? 'on' : 'off'} · keys stored: ${keysHeld.length ? keysHeld.join(', ') : 'none'}`,
    `language: ${locale?.setting ?? settings.language ?? 'auto'} (${locale?.resolved ?? 'zh-CN'})`,
    `recent libraries: ${Array.isArray(settings.recentLibraries) && settings.recentLibraries.length ? settings.recentLibraries.join(' · ') : 'none'}`,
    ...connections,
    '',
    `--- the last ${LOG_LINES} lines of logs/main.log`,
    log,
  ].join('\n')
  for (const secret of secrets) if (typeof secret === 'string' && secret.length >= 8) text = text.split(secret).join('[secret]')
  return text.replace(KEY_LIKE, '[key]')
}
