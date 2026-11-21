// Dependencies (docs/desktop.md §一; v2 package H added @mozilla/readability): exact versions, all from the official npm registry with an sha512
// integrity in package-lock.json, licences known; what node_modules holds is what the lock says; the page's
// three vendored modules are those packages' own files; the app runs on the pinned Electron 44.0.0. No local link.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vendorFiles } from '../src/main/protocol.mjs'
import { DESKTOP_DIR, ELECTRON_VERSION, REPO_DIR, electronExe } from '../scripts/lib/paths.mjs'

const pkg = JSON.parse(readFileSync(join(DESKTOP_DIR, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(DESKTOP_DIR, 'package-lock.json'), 'utf8'))

// v2 package H: @mozilla/readability, the reading window's 阅读模式 (src/main/reader.mjs; run in a hidden window, not by the page)
const EXPECTED = {
  // 1.1 W2: unpdf, the PDF reader (src/main/pdf-text.mjs; main process)
  dependencies: { '@mozilla/readability': '0.6.0', htm: '3.1.1', preact: '10.29.8', unpdf: '1.9.1' },
  devDependencies: { 'playwright-core': '1.63.0' },
}
const LICENCES = { '@mozilla/readability': 'Apache-2.0', htm: 'Apache-2.0', preact: 'MIT', 'playwright-core': 'Apache-2.0', unpdf: 'MIT' }

test('package.json pins exactly these dependencies', () => {
  assert.deepEqual(pkg.dependencies, EXPECTED.dependencies)
  assert.deepEqual(pkg.devDependencies, EXPECTED.devDependencies)
})

test('package-lock.json: every package from registry.npmjs.org with an sha512 integrity and a known licence; nothing linked', () => {
  const entries = Object.entries(lock.packages).filter(([k]) => k.startsWith('node_modules/'))
  const names = entries.map(([k]) => k.slice('node_modules/'.length)).sort()
  assert.deepEqual(names, ['@mozilla/readability', 'htm', 'playwright-core', 'preact', 'unpdf'], 'no other package (none of them has dependencies)')
  for (const [key, e] of entries) {
    const name = key.slice('node_modules/'.length)
    assert.equal(e.link, undefined, `${name} is not a link`)
    assert.equal(e.version, EXPECTED.dependencies[name] ?? EXPECTED.devDependencies[name], name)
    // a scoped package's tarball is named without its scope
    assert.equal(e.resolved, `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${e.version}.tgz`, name)
    assert.equal(e.dependencies, undefined, `${name} has no dependencies`)
    assert.match(e.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/, name)
    assert.equal(e.license, LICENCES[name], name)
    assert.equal(e.hasInstallScript, undefined, `${name} runs nothing at install`)
    const installed = JSON.parse(readFileSync(join(DESKTOP_DIR, key, 'package.json'), 'utf8'))
    assert.equal(installed.version, e.version, `node_modules holds ${name}@${e.version}`)
  }
})

test('the page\'s vendored modules are the packages\' own files, and the import map names exactly them', () => {
  const vendor = vendorFiles()
  const html = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'index.html'), 'utf8')
  const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1])
  assert.deepEqual(Object.values(map.imports).map(u => u.replace('/vendor/', '')).sort(), Object.keys(vendor).sort())
  assert.deepEqual(Object.keys(map.imports).sort(), ['htm', 'preact', 'preact/hooks'])
  for (const [name, file] of Object.entries(vendor)) {
    assert.ok(existsSync(file), name)
    // (Node resolves links to the real folder, so only the end of the path is fixed)
    assert.match(file.split('\\').join('/'), /\/node_modules\/(preact\/(dist\/preact|hooks\/dist\/hooks)|htm\/dist\/htm)\.module\.js$/, name)
  }
})

test('Electron is the pinned 44.0.0 of installer/electron', () => {
  assert.equal(ELECTRON_VERSION, '44.0.0')
  const manifest = JSON.parse(readFileSync(join(REPO_DIR, 'installer', 'electron', 'manifest.json'), 'utf8'))
  assert.equal(manifest.electron.version, ELECTRON_VERSION)
  assert.ok(existsSync(electronExe()))
})
