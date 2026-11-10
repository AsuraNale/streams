// 新建库默认放在, worked out when first needed (v2 package J2; src/main/library-root.mjs; docs/desktop.md §4.10). The installer
// test found the packaged app did not start where Windows could not give the Documents folder: main.mjs asked
// app.getPath('documents') at start and the error ended the app ("start failed: Error: Failed to get 'documents' path").
// Here, with Electron's getPath stood in for: it throws for 'documents' → the default is <home>\Streams and one line is
// logged; it throws for both → <app data>\libraries; it is not asked at all until the default is needed, and not in a
// development run; the library service asks the function each time getLibraryRoot needs the default; and main.mjs builds
// the default with it, with no getPath('documents') of its own left (the old code: red here).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { defaultLibraryRoot } from '../src/main/library-root.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const APP_DATA = 'C:\\Users\\u\\AppData\\Roaming\\Streams'
const stand = paths => {
  const asked = []
  const getPath = name => {
    asked.push(name)
    const p = paths[name]
    if (p instanceof Error) throw p
    return p
  }
  return { asked, getPath }
}
const failed = name => new Error(`Failed to get '${name}' path`)

test('packaged, Documents there: <Documents>\\Streams, nothing logged; asked once, at first use', () => {
  const { asked, getPath } = stand({ documents: 'C:\\Users\\u\\Documents', home: 'C:\\Users\\u' })
  const lines = []
  const root = defaultLibraryRoot({ packaged: true, getPath, appData: APP_DATA, log: l => lines.push(l) })
  assert.deepEqual(asked, [], 'nothing asked when the function is made (main.mjs makes it at start)')
  assert.equal(root(), join('C:\\Users\\u\\Documents', 'Streams'))
  assert.equal(root(), join('C:\\Users\\u\\Documents', 'Streams'))
  assert.deepEqual(asked, ['documents'], 'asked once')
  assert.deepEqual(lines, [])
})

test('packaged, getPath(\'documents\') throws: <home>\\Streams, one line in the log saying why', () => {
  const { asked, getPath } = stand({ documents: failed('documents'), home: 'C:\\Users\\u' })
  const lines = []
  const root = defaultLibraryRoot({ packaged: true, getPath, appData: APP_DATA, log: l => lines.push(l) })
  assert.equal(root(), join('C:\\Users\\u', 'Streams'))
  root()
  assert.deepEqual(asked, ['documents', 'home'])
  assert.equal(lines.length, 1, lines.join('\n'))
  assert.match(lines[0], /^library: the default place for a new library is C:\\Users\\u\\Streams \(no documents folder: Failed to get 'documents' path\)$/)
})

test('packaged, Documents and home both fail (one throws, one empty): <app data>\\libraries, one line', () => {
  const { getPath } = stand({ documents: failed('documents'), home: '' })
  const lines = []
  assert.equal(defaultLibraryRoot({ packaged: true, getPath, appData: APP_DATA, log: l => lines.push(l) })(), join(APP_DATA, 'libraries'))
  assert.equal(lines.length, 1)
  assert.match(lines[0], /no documents folder: Failed to get 'documents' path; no home folder\)$/)
})

test('a development run: STREAMS_DEV_LIBRARY_ROOT or <app data>\\libraries, getPath never asked', () => {
  const { asked, getPath } = stand({ documents: failed('documents'), home: failed('home') })
  assert.equal(defaultLibraryRoot({ packaged: false, getPath, devRoot: 'C:\\dev\\root', appData: APP_DATA })(), 'C:\\dev\\root')
  assert.equal(defaultLibraryRoot({ packaged: false, getPath, appData: APP_DATA })(), join(APP_DATA, 'libraries'))
  assert.deepEqual(asked, [])
})

test('the library service with the function: made without asking it; getLibraryRoot gives the fallback when Documents fails', t => {
  const dir = tempDir('st-library-root-')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const appData = join(dir, 'app-data')
  mkdirSync(appData, { recursive: true })
  const { asked, getPath } = stand({ documents: failed('documents'), home: join(dir, 'home') })
  const lines = []
  const log = l => lines.push(l)
  const root = defaultLibraryRoot({ packaged: true, getPath, appData, log })
  const service = createLibraryService({ settingsFile: join(appData, 'settings.json'), emit: () => {}, log, dialog: {}, shell: {}, locale: () => ({ resolved: 'zh-CN' }), defaultLibraryRoot: root, protectedDirs: [appData] })
  assert.deepEqual(asked, [], 'starting the service asks nothing of Documents')
  const view = service.handlers.getLibraryRoot()
  assert.deepEqual(view, { path: join(dir, 'home', 'Streams'), isDefault: true })
  assert.ok(lines.some(l => l.startsWith('library: the default place for a new library is ')), lines.join('\n'))
  // control: a string default (the v1.0 / package I form) still works
  const plain = createLibraryService({ settingsFile: join(appData, 'settings.json'), emit: () => {}, log: () => {}, dialog: {}, shell: {}, locale: () => ({ resolved: 'zh-CN' }), defaultLibraryRoot: 'D:\\Libraries', protectedDirs: [appData] })
  assert.deepEqual(plain.handlers.getLibraryRoot(), { path: 'D:\\Libraries', isDefault: true })
})

test('main.mjs builds the default with library-root.mjs and asks no getPath(\'documents\') itself (the old code did, at start)', () => {
  const main = readFileSync(new URL('../src/main/main.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(main, /getPath\(\s*['"]documents['"]\s*\)/, 'no getPath(\'documents\') in main.mjs')
  assert.match(main, /import \{ defaultLibraryRoot as defaultRootOf \} from '\.\/library-root\.mjs'/)
  assert.match(main, /const defaultLibraryRoot = defaultRootOf\(\{ packaged: app\.isPackaged, getPath: name => app\.getPath\(name\)/)
  assert.match(main, /libraryRoot: \(\) => readSettings\(layout\.settingsFile\)\.libraryRoot \?\? defaultLibraryRoot\(\),/)
})
