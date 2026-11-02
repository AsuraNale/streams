// The app-data layout (docs/desktop.md §三): the protected folder, the local-data folder outside it, the protected folder
// in protectedDirs, development runs never on the real folders.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APP_FOLDER, ENV_NAMES, LayoutError, checkOverlaps, isInside, resolveLayout } from '../src/main/layout.mjs'

const ROAMING = 'C:\\Users\\someone\\AppData\\Roaming'
const LOCAL = 'C:\\Users\\someone\\AppData\\Local'
const DEV = { STREAMS_APP_DATA: 'C:\\Temp\\run\\app-data', STREAMS_LOCAL_DATA: 'C:\\Temp\\run\\local-data' }

test('the shipped app: %APPDATA%\\Streams protected, the local data in %LOCALAPPDATA%\\Streams, outside it', () => {
  const l = resolveLayout({ isPackaged: true, roamingAppData: ROAMING, localAppData: LOCAL, env: DEV })
  assert.equal(APP_FOLDER, 'Streams')
  assert.equal(l.appData, `${ROAMING}\\Streams`)
  assert.equal(l.localData, `${LOCAL}\\Streams`)
  assert.equal(isInside(l.localData, l.appData), false)
  assert.equal(isInside(l.appData, l.localData), false)
  assert.deepEqual(l.protectedDirs, [l.appData])
  for (const key of ['settingsFile', 'secretsDir', 'logsDir', 'chromiumDir', 'updatesDir']) {
    assert.ok(isInside(l[key], l.appData), `${key} is inside the protected folder`)
  }
  assert.ok(isInside(l.cacheDir, l.localData), 'the cache is in the local data')
  assert.ok(Object.isFrozen(l) && Object.isFrozen(l.protectedDirs))
})

test('development and tests: the variables decide; without them the app does not start', () => {
  const l = resolveLayout({ isPackaged: false, roamingAppData: ROAMING, localAppData: LOCAL, env: DEV })
  assert.equal(l.appData, DEV.STREAMS_APP_DATA)
  assert.equal(l.localData, DEV.STREAMS_LOCAL_DATA)
  assert.throws(() => resolveLayout({ isPackaged: false, roamingAppData: ROAMING, localAppData: LOCAL, env: {} }),
    err => err instanceof LayoutError && err.code === 'missing_dev_paths', 'never falls back to the real %APPDATA%\\Streams')
  assert.throws(() => resolveLayout({ isPackaged: false, roamingAppData: ROAMING, localAppData: LOCAL, env: { ...DEV, STREAMS_APP_DATA: 'relative\\app-data' } }),
    err => err.code === 'relative_path')
  assert.deepEqual(Object.values(ENV_NAMES).sort(), ['STREAMS_APP_DATA', 'STREAMS_LOCAL_DATA'])
  // a packaged app ignores the variables
  const p = resolveLayout({ isPackaged: true, roamingAppData: ROAMING, localAppData: LOCAL, env: DEV })
  assert.notEqual(p.appData, DEV.STREAMS_APP_DATA)
})

test('neither folder may hold the other (the local data in the protected folder is refused)', () => {
  const env = { ...DEV, STREAMS_LOCAL_DATA: 'C:\\Temp\\run\\app-data\\local' }
  assert.throws(() => resolveLayout({ isPackaged: false, roamingAppData: ROAMING, localAppData: LOCAL, env }), err => err.code === 'overlap')
  assert.throws(() => checkOverlaps({ appData: 'C:\\x\\local\\app', localData: 'C:\\x\\local' }), err => err.code === 'overlap')
  assert.throws(() => checkOverlaps({ appData: 'C:\\a', localData: 'C:\\A\\cache' }), err => err.code === 'overlap', 'letter case does not count on Windows')
  assert.doesNotThrow(() => checkOverlaps({ appData: 'C:\\a\\Streams', localData: 'C:\\a\\Streams-cache' }), 'a sibling with a longer name is not inside')
})
