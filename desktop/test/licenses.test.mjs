// 许可证与致谢 (src/main/licenses.mjs), in plain Node: in development the repository's LICENSE, in a packaged layout the app's
// own copy; the six parts with the runtime's versions and the shipped package.json's version and license; the notices only
// in an install that has the file. Controls first: a folder laid out as an install with another LICENSE gives that one.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { NOTICES_FILE, licensesView, noticesFileOf } from '../src/main/licenses.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const made = []
after(() => { for (const dir of made) removeTree(dir, { waitMs: 3000 }) })
const pkg = name => JSON.parse(readFileSync(join(DESKTOP_DIR, 'node_modules', name, 'package.json'), 'utf8'))
const VERSIONS = { electron: '44.0.0', chrome: '150.0.1.2', node: '24.9.0' }

/** An install's layout: <root>/Streams.exe's folder with resources/app (LICENSE, node_modules/<preact, htm, @mozilla/readability>/package.json). */
function install({ license = 'MIT License\n\nCopyright (c) test\n', notices = true } = {}) {
  const root = tempDir('st-licenses-')
  made.push(root)
  const app = join(root, 'resources', 'app')
  for (const [name, version, lic] of [['preact', '9.9.9', 'MIT'], ['htm', '8.8.8', 'Apache-2.0'], ['@mozilla/readability', '7.7.7', 'BSD-2-Clause']]) {
    mkdirSync(join(app, 'node_modules', name), { recursive: true })
    writeFileSync(join(app, 'node_modules', name, 'package.json'), JSON.stringify({ name, version, license: lic }))
  }
  writeFileSync(join(app, 'LICENSE'), license)
  if (notices) writeFileSync(join(root, NOTICES_FILE), 'notices\n')
  return { root, app }
}

test('development: the repository\'s LICENSE in full, the six parts, no notices to open', () => {
  const v = licensesView({ packaged: false, desktopDir: DESKTOP_DIR, installDir: join(DESKTOP_DIR, 'node_modules'), versions: VERSIONS })
  assert.equal(v.own.text, readFileSync(join(REPO_DIR, 'LICENSE'), 'utf8'), 'word for word the repository\'s LICENSE')
  assert.equal(v.own.license, 'MIT')
  assert.deepEqual(v.components, [
    { name: 'Electron', version: '44.0.0', license: 'MIT' },
    { name: 'Chromium', version: '150.0.1.2', license: 'BSD-3-Clause' },
    { name: 'Node.js', version: '24.9.0', license: 'MIT' },
    { name: 'Preact', version: pkg('preact').version, license: pkg('preact').license },
    { name: 'htm', version: pkg('htm').version, license: pkg('htm').license },
    { name: '@mozilla/readability', version: pkg('@mozilla/readability').version, license: pkg('@mozilla/readability').license },
  ])
  assert.deepEqual([pkg('preact').version, pkg('htm').version, pkg('@mozilla/readability').version], ['10.29.8', '3.1.1', '0.6.0'], 'control: the pinned versions (desktop/package.json)')
  assert.equal(pkg('@mozilla/readability').license, 'Apache-2.0', 'control: the reading mode\'s part is Apache-2.0')
  const deps = JSON.parse(readFileSync(join(DESKTOP_DIR, 'package.json'), 'utf8')).dependencies
  assert.deepEqual(Object.keys(deps).sort(), ['@mozilla/readability', 'htm', 'preact'], 'every package the app ships has its row (a new dependency without one turns this red)')
  assert.deepEqual(v.notices, { available: false })
  assert.equal(noticesFileOf({ packaged: false, installDir: 'C:\\x' }), null)
})

test('installed: the app\'s own LICENSE and package.json files, the notices beside Streams.exe; without the file, none', () => {
  const { root, app } = install({ license: 'MIT License\n\nanother copy\n' })
  const v = licensesView({ packaged: true, desktopDir: app, installDir: root, versions: VERSIONS })
  assert.equal(v.own.text, 'MIT License\n\nanother copy\n', 'control: the install\'s copy, not the repository\'s')
  assert.deepEqual(v.components.slice(3), [{ name: 'Preact', version: '9.9.9', license: 'MIT' }, { name: 'htm', version: '8.8.8', license: 'Apache-2.0' }, { name: '@mozilla/readability', version: '7.7.7', license: 'BSD-2-Clause' }], 'the install\'s own package.json files, not the repository\'s')
  assert.deepEqual(v.notices, { available: true })
  assert.equal(noticesFileOf({ packaged: true, installDir: root }), join(root, NOTICES_FILE))
  const bare = install({ notices: false, license: 'Some Other License\n' })
  const w = licensesView({ packaged: true, desktopDir: bare.app, installDir: bare.root, versions: VERSIONS })
  assert.deepEqual(w.notices, { available: false })
  assert.equal(w.own.license, 'unknown', 'a text that is not MIT is not called MIT')
  // a development run never offers the notices, even with a file of that name in its folder
  assert.deepEqual(licensesView({ packaged: false, desktopDir: DESKTOP_DIR, installDir: root, versions: VERSIONS }).notices, { available: false })
})
