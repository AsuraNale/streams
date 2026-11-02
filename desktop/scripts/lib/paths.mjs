// Where things are, for the scripts and the tests (not used by the app itself).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DESKTOP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const REPO_DIR = resolve(DESKTOP_DIR, '..')

/** The Electron the app runs on: the one installer/electron pins. */
export const ELECTRON_VERSION = '44.0.0'
export const ELECTRON_DIST = join(REPO_DIR, 'installer', 'electron', 'node_modules', 'electron', 'dist')
export const ELECTRON_EXE = join(ELECTRON_DIST, 'electron.exe')

/**
 * The pinned electron.exe, after checking it is there and is 44.0.0 (dist/version). The full check of the
 * binary against installer/electron/manifest.json is `node installer/electron/setup_electron.mjs verify`.
 * @throws {Error} with what to run when it is missing or another version
 */
export function electronExe() {
  if (!existsSync(ELECTRON_EXE)) {
    throw new Error(`Electron ${ELECTRON_VERSION} is not installed at ${ELECTRON_EXE}. Run \`node installer/electron/setup_electron.mjs build\` in the repository first.`)
  }
  const version = readFileSync(join(ELECTRON_DIST, 'version'), 'utf8').trim()
  if (version !== ELECTRON_VERSION) {
    throw new Error(`${ELECTRON_EXE} is Electron ${version}, not the pinned ${ELECTRON_VERSION} (installer/electron/manifest.json)`)
  }
  return ELECTRON_EXE
}

/**
 * The environment the app is started with: the parent's, minus what would change how Electron runs
 * (ELECTRON_RUN_AS_NODE would start it as plain Node; NODE_OPTIONS could load code into it), plus the
 * development folders (layout.mjs ENV_NAMES).
 */
export function appEnv({ appData, localData, extra = {} }, parent = process.env) {
  const env = {}
  for (const [k, v] of Object.entries(parent)) {
    if (v === undefined) continue
    if (/^(ELECTRON_RUN_AS_NODE|NODE_OPTIONS|ELECTRON_ENABLE_LOGGING|STREAMS_.*)$/i.test(k)) continue
    env[k] = v
  }
  const out = { ...env, STREAMS_APP_DATA: appData, STREAMS_LOCAL_DATA: localData, ...extra }
  // a variable left out is not there at all, not the text "undefined"
  for (const [k, v] of Object.entries(out)) if (v === undefined || v === null) delete out[k]
  return out
}
