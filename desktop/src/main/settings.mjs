/**
 * The user's settings, in <appData>/settings.json — the protected folder:
 *   language            the language of the app's own words (locale.mjs): auto (default: follow the system) · zh-CN · en
 *   libraryPath         the library folder the app has open (an absolute path), or null until one is opened (「未打开库」)
 *   showDeveloperInfo   the advanced switch of the settings page (default off)
 * Read whole and checked field by field (a field that is not what it should be is its default); written whole,
 * through a temporary file and a rename, so a crash never leaves half a file.
 * The connections (which model, which key) are not here: they come with the connection screens (plan C2) and keep
 * their keys in secrets.mjs, never in this file.
 * @module desktop/main/settings
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { DEFAULT_LANGUAGE, LANGUAGE_SETTINGS } from './locale.mjs'

export const SETTINGS_SCHEMA = 'streams.settings/1'

const DEFAULTS = Object.freeze({ language: DEFAULT_LANGUAGE, libraryPath: null, showDeveloperInfo: false })

const own = (o, k) => (o !== null && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined)

/** The settings in `file`, each field checked; a missing or broken file gives the defaults. */
export function readSettings(file) {
  let data = null
  try { data = JSON.parse(readFileSync(file, 'utf8')) } catch { data = null }
  const language = own(data, 'language')
  const library = own(data, 'libraryPath')
  return {
    language: LANGUAGE_SETTINGS.includes(language) ? language : DEFAULTS.language,
    libraryPath: typeof library === 'string' && isAbsolute(library) ? library : DEFAULTS.libraryPath,
    showDeveloperInfo: own(data, 'showDeveloperInfo') === true,
  }
}

/**
 * Change some settings and write them all.
 * @param {string} file
 * @param {{language?: string, libraryPath?: string|null, showDeveloperInfo?: boolean}} patch
 * @returns {object} the settings now
 */
export function writeSettings(file, patch) {
  const next = { ...readSettings(file) }
  if (Object.hasOwn(patch, 'language')) {
    if (!LANGUAGE_SETTINGS.includes(patch.language)) throw new TypeError(`no language ${patch.language}`)
    next.language = patch.language
  }
  if (Object.hasOwn(patch, 'libraryPath')) {
    if (patch.libraryPath !== null && (typeof patch.libraryPath !== 'string' || !isAbsolute(patch.libraryPath))) throw new TypeError('libraryPath must be an absolute path, or null')
    next.libraryPath = patch.libraryPath
  }
  if (Object.hasOwn(patch, 'showDeveloperInfo')) next.showDeveloperInfo = patch.showDeveloperInfo === true
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ schema: SETTINGS_SCHEMA, ...next }, null, 2)}\n`)
  renameSync(tmp, file)
  return next
}
