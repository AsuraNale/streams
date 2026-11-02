/**
 * The bridge between the page and the main process: every method the page may call, by name.
 *
 * Exactly these names are exposed by the preload (src/preload/preload.cjs `METHODS`) and listed in
 * docs/desktop.md §四 — test/bridge.test.mjs checks the three agree, and the running page is checked to
 * have exactly the documented ones (test/security.test.mjs). Adding a method: docs/desktop.md §四.
 *
 * Every call answers with an envelope, never a thrown error: `{ ok: true, data }` or
 * `{ ok: false, error: { code } }` (codes in ERROR_CODES; the page puts them in words). Pure: no Electron here,
 * so the table can be tested in plain Node; bridge.mjs registers it with ipcMain.
 * @module desktop/main/bridge-methods
 */

import { LANGUAGE_SETTINGS } from './locale.mjs'

export const CHANNEL_PREFIX = 'streams:'

/** name → how many arguments it takes, and a check for them. */
export const BRIDGE_METHODS = Object.freeze({
  // the shell (app-services.mjs): what the page needs to draw itself, and the settings page
  getAppState: Object.freeze({ args: 0 }),
  // the language of the app's own words (locale.mjs; docs/desktop.md §十六): the setting, not a locale
  setLanguage: Object.freeze({ args: 1, check: ([v]) => LANGUAGE_SETTINGS.includes(v) }),
  setShowDeveloperInfo: Object.freeze({ args: 1, check: ([on]) => typeof on === 'boolean' }),
  copyDiagnostics: Object.freeze({ args: 0 }),
  // the update (docs/desktop.md §十九, update-wiring.mjs): the state, a check now, the download and its cancel, the setup
  // program started (the app then quits), the release's page in the user's browser — no address or file name from the page
  getUpdateState: Object.freeze({ args: 0 }),
  checkForUpdate: Object.freeze({ args: 0 }),
  downloadUpdate: Object.freeze({ args: 0 }),
  cancelUpdateDownload: Object.freeze({ args: 0 }),
  installUpdate: Object.freeze({ args: 0 }),
  openReleasePage: Object.freeze({ args: 0 }),
})

export const ERROR_CODES = Object.freeze([
  'refused', // the call did not come from the app's own page (bridge.mjs)
  'bad_arguments', // wrong number or kind of arguments
  'no_library', // no library folder opened yet
  'open_failed', // the system could not open the folder or the address
  'internal', // anything else; the details go to the app's log, not to the page
])

export class BridgeError extends Error {
  constructor(code, message = code) {
    super(message)
    this.code = ERROR_CODES.includes(code) ? code : 'internal'
  }
}

export const channelOf = name => `${CHANNEL_PREFIX}${name}`

export function methodNames() {
  return Object.keys(BRIDGE_METHODS)
}

/** @throws {BridgeError} bad_arguments */
export function checkArgs(name, args) {
  const spec = Object.hasOwn(BRIDGE_METHODS, name) ? BRIDGE_METHODS[name] : null
  if (!spec) throw new BridgeError('internal', `no bridge method ${name}`)
  if (!Array.isArray(args) || args.length !== spec.args) throw new BridgeError('bad_arguments')
  if (typeof spec.check === 'function' && spec.check(args) !== true) throw new BridgeError('bad_arguments')
}

/**
 * Run one handler and wrap what it gives in the envelope.
 * @param {string} name
 * @param {Function} handler
 * @param {unknown[]} args
 * @param {(line: string) => void} [log]
 */
export async function runHandler(name, handler, args, log = () => {}) {
  try {
    checkArgs(name, args)
    return { ok: true, data: await handler(...args) }
  } catch (err) {
    const code = err instanceof BridgeError ? err.code : 'internal'
    log(`bridge ${name}: ${code}: ${String(err?.stack ?? err)}`)
    return { ok: false, error: { code } }
  }
}

/**
 * The handlers must be exactly the table's methods: a handler without an entry (or an entry without a
 * handler) stops the app at start, before any window opens.
 */
export function assertHandlers(handlers) {
  const want = methodNames().sort()
  const got = Object.keys(handlers).sort()
  if (want.join() !== got.join()) throw new Error(`bridge handlers ${JSON.stringify(got)} do not match BRIDGE_METHODS ${JSON.stringify(want)}`)
  for (const name of want) if (typeof handlers[name] !== 'function') throw new Error(`bridge handler ${name} is not a function`)
}
