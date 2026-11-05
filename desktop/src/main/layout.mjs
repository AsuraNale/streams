/**
 * Where the app keeps things on disk (docs/desktop.md §三).
 *
 *   appData       the protected folder: %APPDATA%\Streams in the shipped app. Settings, the library registry, the
 *                 encrypted secrets (API keys), logs, Chromium's own data. The first entry of `protectedDirs`: nothing a model
 *                 subprocess runs may reach it (the connections run with their working folder elsewhere).
 *   localData     %LOCALAPPDATA%\Streams: caches and generated things that need not roam (fetch caches, indexes of
 *                 the library once there is one). Outside appData on purpose, and never containing it.
 *
 * Development and tests (not packaged) must say where both go (STREAMS_APP_DATA, STREAMS_LOCAL_DATA; `npm start`
 * and the tests set them to a temporary folder): a development run never falls back to the user's real
 * %APPDATA%\Streams. A packaged app ignores those variables.
 * @module desktop/main/layout
 */

import { mkdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export const ENV_NAMES = Object.freeze({
  appData: 'STREAMS_APP_DATA',
  localData: 'STREAMS_LOCAL_DATA',
})

export const APP_FOLDER = 'Streams'

export class LayoutError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

/** Is `child` the folder `parent` or inside it? (Windows: letter case does not count.) */
export function isInside(child, parent) {
  const norm = p => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
  const rel = relative(norm(parent), norm(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function fromEnv(env, name) {
  const v = Object.hasOwn(env, name) ? env[name] : undefined
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!isAbsolute(v)) throw new LayoutError('relative_path', `${name} must be an absolute path`)
  return resolve(v)
}

/**
 * The layout for this run. Pure: reads only what it is given.
 * @param {object} o
 * @param {boolean} o.isPackaged - app.isPackaged
 * @param {string} o.roamingAppData - app.getPath('appData'), i.e. %APPDATA%
 * @param {string} o.localAppData - %LOCALAPPDATA%
 * @param {Record<string, string|undefined>} o.env
 * @returns {Readonly<object>}
 * @throws {LayoutError} missing_dev_paths · relative_path · overlap
 */
export function resolveLayout({ isPackaged, roamingAppData, localAppData, env }) {
  const pick = name => (isPackaged ? null : fromEnv(env, name))
  const appData = pick(ENV_NAMES.appData) ?? (isPackaged ? join(roamingAppData, APP_FOLDER) : null)
  const localData = pick(ENV_NAMES.localData) ?? (isPackaged ? join(localAppData, APP_FOLDER) : null)
  if (!appData || !localData) {
    throw new LayoutError('missing_dev_paths', `a development run needs ${ENV_NAMES.appData} and ${ENV_NAMES.localData} (absolute paths, normally a temporary folder); start it with \`npm start\` in desktop/, which sets them`)
  }
  const layout = {
    appData,
    settingsFile: join(appData, 'settings.json'), // settings.mjs
    librariesFile: join(appData, 'libraries.json'), // the library registry (core registry; services/library.mjs, v2 package A)
    secretsDir: join(appData, 'secrets'), // secrets.mjs: API keys, safeStorage-encrypted
    logsDir: join(appData, 'logs'),
    chromiumDir: join(appData, 'electron'), // Electron userData / sessionData (caches, the safeStorage key)
    updatesDir: join(appData, 'updates'), // services/update.mjs: the downloaded setup program
    localData,
    cacheDir: join(localData, 'cache'),
  }
  checkOverlaps(layout)
  return Object.freeze({ ...layout, protectedDirs: Object.freeze([appData]) })
}

/** Neither of the two top folders may hold the other (both ways). */
export function checkOverlaps({ appData, localData }) {
  const named = [['app data', appData], ['local data', localData]].filter(([, p]) => p)
  for (const [a, pa] of named) {
    for (const [b, pb] of named) {
      if (a !== b && isInside(pa, pb)) throw new LayoutError('overlap', `the ${a} folder must not be inside the ${b} folder`)
    }
  }
}

/** Make the folders the app writes to itself. */
export function ensureLayout(layout) {
  for (const dir of [layout.appData, layout.logsDir, layout.chromiumDir, layout.localData, layout.cacheDir]) mkdirSync(dir, { recursive: true })
}
