// The app's identity for Windows (src/main/app-id.mjs; docs/installer.md): both values are pinned here, since
// neither may change once shipped — the installer's shortcuts and registry key carry them, and a different CLSID in a
// later version would leave the old one's registration behind. The packaged app gives Windows both; a development run
// neither.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_USER_MODEL_ID, TOAST_ACTIVATOR_CLSID } from '../src/main/app-id.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'

const RELEASE = JSON.parse(readFileSync(join(DESKTOP_DIR, '..', 'installer', 'setup', 'release.json'), 'utf8'))

test('the AppUserModelID and the toast activator CLSID: their values and forms', () => {
  assert.equal(APP_USER_MODEL_ID, 'StarryDigital.Streams')
  // the form Electron reports back (app.toastActivatorCLSID: braces, upper case); the installer passes it without the
  // braces (Inno Setup's AppUserModelToastActivatorCLSID) and writes the registry key with them
  assert.match(TOAST_ACTIVATOR_CLSID, /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/)
  assert.equal(TOAST_ACTIVATOR_CLSID, '{10309C50-6EBE-4E03-AB99-FF685983103D}')
  // a random (version 4) GUID made for this, not the installer's AppId
  assert.equal(TOAST_ACTIVATOR_CLSID[15], '4')
  assert.match(TOAST_ACTIVATOR_CLSID[20], /[89AB]/)
  assert.notEqual(TOAST_ACTIVATOR_CLSID.slice(1, -1), RELEASE.app_guid.toUpperCase())
})

test('main.mjs gives Windows both, only when packaged, before any notification can be made', () => {
  const main = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'main.mjs'), 'utf8')
  assert.match(main, /import \{ APP_USER_MODEL_ID, TOAST_ACTIVATOR_CLSID \} from '\.\/app-id\.mjs'/)
  const block = /\nif \(app\.isPackaged\) \{\n {2}app\.setAppUserModelId\(APP_USER_MODEL_ID\)\n {2}app\.setToastActivatorCLSID\(TOAST_ACTIVATOR_CLSID\)\n\}\n/.exec(main)
  assert.ok(block, 'the two calls, together, under app.isPackaged')
  assert.equal(main.match(/setToastActivatorCLSID\(/g).length, 1)
  assert.equal(main.match(/setAppUserModelId\(/g).length, 1)
  // before the window and the services exist (a notification needs both)
  assert.ok(block.index < main.indexOf('new BrowserWindow('), 'set before the window is made')
  assert.ok(block.index < main.indexOf('createNotifier('), 'set before the notifier is made')
})
