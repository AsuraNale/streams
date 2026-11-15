/**
 * The app's own version (docs/desktop.md��): one source, installer/setup/release.json.
 *
 *   packaged      app.getVersion(): Electron reads it from resources/app/package.json, which installer/build-installer.mjs
 *                 writes from release.json's `version` (and checks); so the packaged app says what the setup program and
 *                 Streams.exe's version info say
 *   development   release.json's `version` read from the repository, marked `dev` (desktop/package.json's own version,
 *                 1.0.0-dev.1, is npm's and is not read): the page says 「开发版」 next to it, and a development run may check
 *                 for a newer version but does not update itself (services/update.mjs)
 * Settings 「关于」 shows it, the update check compares with it, the diagnostics name it.
 * @module desktop/main/version
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** installer/setup/release.json, from this file (desktop/src/main/ → the repository root). Not there in a packaged app. */
export const RELEASE_FILE = fileURLToPath(new URL('../../../installer/setup/release.json', import.meta.url))

/** major.minor.patch, digits only (no pre-release part): the only form the app compares. */
export const VERSION_RE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/

/**
 * @param {object} o
 * @param {boolean} o.isPackaged - app.isPackaged
 * @param {() => string} o.getVersion - app.getVersion
 * @param {string} [o.releaseFile] - development: where release.json is
 * @returns {{version: string, dev: boolean}} `version` is major.minor.patch when it can be read; otherwise what was there
 *   (or '0.0.0' in development) — the update check then cannot compare and says so
 */
export function appVersion({ isPackaged, getVersion, releaseFile = RELEASE_FILE }) {
  if (isPackaged) return { version: String(getVersion() ?? ''), dev: false }
  let version = null
  try { version = JSON.parse(readFileSync(releaseFile, 'utf8')).version } catch { version = null }
  return { version: typeof version === 'string' && VERSION_RE.test(version) ? version : '0.0.0', dev: true }
}
