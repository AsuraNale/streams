#!/usr/bin/env node
/**
 * Electron for the installer feasibility batch (work order 02, items E1 and E4).
 * Its own folder, installer/electron: engine/ and its dependencies are not touched.
 *
 *   node installer/electron/setup_electron.mjs build    install, then check everything against manifest.json
 *   node installer/electron/setup_electron.mjs verify   check what is already there; installs and downloads nothing
 *   node installer/electron/setup_electron.mjs lock     install, then (re)write manifest.json from what was fetched
 *
 * build and lock:
 *   1. `npm ci --ignore-scripts` here: exactly the packages of package-lock.json, from
 *      https://registry.npmjs.org/ only (every `resolved` is checked first; --registry, and no user or global
 *      npmrc, whose scoped-registry lines --registry would not override, and no npm_config_* variable), into
 *      node_modules (git-ignored), with npm's cache in installer/downloads/npm-cache. npm checks each
 *      tarball's sha512 (`integrity` in the lock); this script also takes each tarball's SHA256 from that cache.
 *   2. Electron's own install.js fetches electron-v<version>-win32-x64.zip from Electron's GitHub releases,
 *      @electron/get's default: every variable that could name a mirror, another folder, file name, version,
 *      platform or architecture (npm_config_*, npm_package_config_*, ELECTRON_*, electron_*) is removed from
 *      its environment, and the URL it used (from its debug log) must be the official one. It checks the zip
 *      against the checksums.json inside the electron npm package, keeps it in installer/downloads/electron,
 *      and unpacks it into node_modules/electron/dist.
 *   3. The zip's SHA256 (against the manifest and checksums.json), electron.exe's SHA256, dist/version, and
 *      what Electron reports when run as Node; dist/ and node_modules/ are measured.
 * build stops at the first mismatch with the manifest (exit code 1). The measured sizes go to
 * installer/build/electron-build.json.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const DOWNLOADS = join(REPO, 'installer', 'downloads')
const NPM_CACHE = join(DOWNLOADS, 'npm-cache')
const ELECTRON_CACHE = join(DOWNLOADS, 'electron')
const BUILD = join(REPO, 'installer', 'build')
const BUILD_RECORD = join(BUILD, 'electron-build.json')
const MANIFEST = join(HERE, 'manifest.json')
const LOCK = join(HERE, 'package-lock.json')
const ELECTRON_DIR = join(HERE, 'node_modules', 'electron')
const DIST = join(ELECTRON_DIR, 'dist')
const REGISTRY = 'https://registry.npmjs.org/'
const OFFICIAL = 'https://github.com/electron/electron/releases/download/'
// Files that do not exist: npm then reads no user or global configuration at all.
const NO_USERCONFIG = join(DOWNLOADS, 'npm-no-userconfig')
const NO_GLOBALCONFIG = join(DOWNLOADS, 'npm-no-globalconfig')

class Stop extends Error {}

const say = text => process.stdout.write(`${text}\n`)

function sha256File(path) {
  const hash = createHash('sha256')
  const buffer = Buffer.alloc(1 << 20)
  const fd = openSync(path, 'r')
  try {
    for (let read; (read = readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, read))
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

function folderSize(root) {
  let files = 0
  let bytes = 0
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) walk(path)
      else {
        files += 1
        bytes += statSync(path).size
      }
    }
  }
  walk(root)
  return { files, bytes }
}

const mib = bytes => `${(bytes / 1048576).toFixed(1)} MiB`

/** This process's environment without anything that steers npm or Electron's download. */
function cleanEnv() {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(npm_config_|npm_package_|electron_|node_options$|force_no_cache$)/i.test(key)) continue
    env[key] = value
  }
  return env
}

function npm(args) {
  const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!existsSync(cli)) throw new Stop(`npm not found next to this Node (${cli})`)
  const full = [...args, `--registry=${REGISTRY}`, `--userconfig=${NO_USERCONFIG}`, `--globalconfig=${NO_GLOBALCONFIG}`,
    `--cache=${NPM_CACHE}`, '--no-audit', '--no-fund', '--update-notifier=false']
  say(`  $ npm ${full.join(' ')}`)
  const result = spawnSync(process.execPath, [cli, ...full], { cwd: HERE, env: cleanEnv(), stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.status !== 0) throw new Stop(`npm ${args[0]} failed (exit code ${result.status})`)
}

function lockPackages() {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'))
  return Object.entries(lock.packages)
    .filter(([key]) => key !== '')
    .map(([key, value]) => ({ name: key.replace(/^.*node_modules\//, ''), path: key, version: value.version, resolved: value.resolved, integrity: value.integrity }))
}

/** The tarball npm verified and cached, found by its sha512 integrity in the cache's content store. */
function cachedTarball(pkg) {
  const match = /^sha512-(.+)$/.exec(pkg.integrity ?? '')
  if (!match) throw new Stop(`${pkg.path}: no sha512 integrity in package-lock.json`)
  const hex = Buffer.from(match[1], 'base64').toString('hex')
  return join(NPM_CACHE, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4))
}

function tarballs() {
  return lockPackages().map(pkg => {
    const file = cachedTarball(pkg)
    if (!existsSync(file)) throw new Stop(`${pkg.name}@${pkg.version}: its tarball is not in ${NPM_CACHE}`)
    return { name: pkg.name, version: pkg.version, resolved: pkg.resolved, integrity: pkg.integrity, sha256: sha256File(file), bytes: statSync(file).size }
  })
}

function runInstallJs() {
  const env = cleanEnv()
  env.electron_config_cache = ELECTRON_CACHE
  env.DEBUG = '@electron/get*'
  env.DEBUG_COLORS = '0'
  say(`  $ node ${join(ELECTRON_DIR, 'install.js')}   (electron_config_cache=${ELECTRON_CACHE}, DEBUG=@electron/get*)`)
  const result = spawnSync(process.execPath, [join(ELECTRON_DIR, 'install.js')], { cwd: ELECTRON_DIR, env, encoding: 'utf8' })
  const log = `${result.stdout}${result.stderr}`
  for (const line of log.split(/\r?\n/).filter(Boolean)) say(`    | ${line}`)
  if (result.status !== 0) throw new Stop(`electron's install.js failed (exit code ${result.status})`)
  // @electron/get's debug lines: "Checking the cache (<dir>) for <file> (<url>)" and "Downloading <url> to <path> …".
  const urls = [...log.matchAll(/(?:Downloading |for \S+ \()(https?:\/\/[^\s)]+)/g)].map(match => match[1])
  if (urls.length === 0) throw new Stop('install.js logged no download URL (was the binary already in place?)')
  const foreign = urls.filter(url => !url.startsWith(OFFICIAL))
  if (foreign.length > 0) throw new Stop(`install.js used ${foreign.join(', ')}, not ${OFFICIAL}`)
  return { urls: [...new Set(urls)], downloaded: /Downloading /.test(log) }
}

/** Where @electron/get keeps a download: <cacheRoot>/<sha256 of the URL without its file name>/<file name> (its Cache.getCacheDirectory). */
function cachedZipPath(url) {
  const parsed = new URL(url)
  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = posix.dirname(parsed.pathname)
  return join(ELECTRON_CACHE, createHash('sha256').update(parsed.toString()).digest('hex'), posix.basename(new URL(url).pathname))
}

function electronFacts(version) {
  const fileName = `electron-v${version}-win32-x64.zip`
  const url = `${OFFICIAL}v${version}/${fileName}`
  const zip = cachedZipPath(url)
  if (!existsSync(zip)) throw new Stop(`${zip} is missing (the zip was not fetched from ${OFFICIAL})`)
  const checksums = JSON.parse(readFileSync(join(ELECTRON_DIR, 'checksums.json'), 'utf8'))
  const exe = join(DIST, 'electron.exe')
  const run = spawnSync(exe, ['-e', 'process.stdout.write(JSON.stringify(process.versions))'], {
    env: { ...cleanEnv(), ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true,
  })
  if (run.status !== 0) throw new Stop(`electron.exe as Node failed: ${run.stderr}`)
  const versions = JSON.parse(run.stdout)
  return {
    version,
    zip: { file: fileName, url, sha256: sha256File(zip), bytes: statSync(zip).size, checksums_json_sha256: checksums[fileName] ?? null, cache_path: zip },
    dist_version: readFileSync(join(DIST, 'version'), 'utf8').trim(),
    path_txt: readFileSync(join(ELECTRON_DIR, 'path.txt'), 'utf8'),
    electron_exe: { sha256: sha256File(exe), bytes: statSync(exe).size },
    dist: folderSize(DIST),
    runs_as_node: { electron: versions.electron, node: versions.node, v8: versions.v8, modules: versions.modules, napi: versions.napi, chrome: versions.chrome },
  }
}

function checkRegistry() {
  const outside = lockPackages().filter(pkg => !String(pkg.resolved).startsWith(REGISTRY))
  if (outside.length > 0) throw new Stop(`package-lock.json resolves outside ${REGISTRY}: ${outside.map(pkg => `${pkg.name} ${pkg.resolved}`).join(', ')}`)
}

function compare(label, actual, expected) {
  if (actual !== expected) throw new Stop(`${label}: ${actual}, the manifest says ${expected}`)
  say(`  ok  ${label}  ${actual}`)
}

function checkAgainstManifest(manifest, packages, facts) {
  const listed = new Map(manifest.npm_packages.map(pkg => [`${pkg.name}@${pkg.version}`, pkg]))
  if (listed.size !== packages.length) throw new Stop(`the lock has ${packages.length} packages, the manifest ${listed.size}`)
  for (const pkg of packages) {
    const entry = listed.get(`${pkg.name}@${pkg.version}`)
    if (!entry) throw new Stop(`${pkg.name}@${pkg.version} is not in the manifest`)
    compare(`${pkg.name}@${pkg.version} tarball sha256`, pkg.sha256, entry.sha256)
  }
  compare(`${facts.zip.file} sha256`, facts.zip.sha256, manifest.electron.zip.sha256)
  compare(`${facts.zip.file} sha256 in electron's checksums.json`, facts.zip.checksums_json_sha256, manifest.electron.zip.sha256)
  compare('dist/version', facts.dist_version, manifest.electron.dist_version)
  compare('electron.exe sha256', facts.electron_exe.sha256, manifest.electron.electron_exe.sha256)
  compare('Electron as Node: electron', facts.runs_as_node.electron, manifest.electron.version)
  if (facts.dist.files !== manifest.electron.dist.files || facts.dist.bytes !== manifest.electron.dist.bytes) {
    throw new Stop(`dist/ holds ${facts.dist.files} files, ${facts.dist.bytes} bytes; the manifest says ${manifest.electron.dist.files}, ${manifest.electron.dist.bytes}`)
  }
  say(`  ok  dist/ ${facts.dist.files} files, ${facts.dist.bytes} bytes`)
}

/**
 * Before npm and install.js run: whatever is already in the two caches must match the manifest. Left alone,
 * both would quietly fetch a bad cached file again (npm on an integrity error, @electron/get when the zip
 * fails checksums.json), so a corrupted or swapped file would go unreported; the rule is to stop.
 */
function precheckCaches(manifest) {
  const listed = new Map(manifest.npm_packages.map(pkg => [`${pkg.name}@${pkg.version}`, pkg]))
  for (const pkg of lockPackages()) {
    const entry = listed.get(`${pkg.name}@${pkg.version}`)
    if (!entry) throw new Stop(`${pkg.name}@${pkg.version} (package-lock.json) is not in the manifest; run lock`)
    if (entry.integrity !== pkg.integrity) throw new Stop(`${pkg.name}@${pkg.version}: package-lock.json integrity ${pkg.integrity}, the manifest ${entry.integrity}`)
    const file = cachedTarball(pkg)
    if (existsSync(file) && sha256File(file) !== entry.sha256) {
      throw new Stop(`${file} (${pkg.name}@${pkg.version}) does not match the manifest's sha256 ${entry.sha256}; nothing was installed`)
    }
  }
  const { zip } = manifest.electron
  const cached = cachedZipPath(zip.url)
  if (existsSync(cached)) {
    const actual = sha256File(cached)
    if (actual !== zip.sha256) throw new Stop(`${cached} has sha256 ${actual}, the manifest says ${zip.sha256}; nothing was installed`)
    say(`  ok  cached ${zip.file}  ${actual}`)
  }
}

function install(manifest) {
  const version = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).devDependencies.electron
  if (manifest && manifest.electron.version !== version) throw new Stop(`package.json pins electron ${version}, the manifest ${manifest.electron.version}`)
  say('1. npm packages (npm ci --ignore-scripts), from the npm registry only')
  checkRegistry()
  if (manifest) precheckCaches(manifest)
  npm(['ci', '--ignore-scripts'])
  const packages = tarballs()
  say(`2. Electron's install.js: electron-v${version}-win32-x64.zip from ${OFFICIAL}`)
  const fetched = runInstallJs()
  say('3. checks')
  const facts = electronFacts(version)
  if (facts.zip.sha256 !== facts.zip.checksums_json_sha256) throw new Stop(`the zip's sha256 ${facts.zip.sha256} is not the one in electron's checksums.json (${facts.zip.checksums_json_sha256})`)
  if (facts.dist_version.replace(/^v/, '') !== version || facts.path_txt !== 'electron.exe' || facts.runs_as_node.electron !== version) {
    throw new Stop(`installed Electron does not look like ${version}: ${JSON.stringify({ dist: facts.dist_version, path: facts.path_txt, runs: facts.runs_as_node })}`)
  }
  return { version, packages, fetched, facts }
}

function record({ packages, fetched, facts }, started) {
  const nodeModules = folderSize(join(HERE, 'node_modules'))
  const out = {
    built: new Date().toISOString(),
    seconds: Math.round((Date.now() - started) / 100) / 10,
    downloaded_this_run: fetched.downloaded,
    urls: fetched.urls,
    electron: facts,
    npm_tarballs: { count: packages.length, bytes: packages.reduce((sum, pkg) => sum + pkg.bytes, 0) },
    node_modules: nodeModules,
  }
  mkdirSync(BUILD, { recursive: true })
  writeFileSync(BUILD_RECORD, `${JSON.stringify(out, null, 2)}\n`)
  say(`\nElectron ${facts.version} in ${DIST}`)
  say(`  zip ${facts.zip.file}: ${facts.zip.bytes} bytes (${mib(facts.zip.bytes)}), sha256 ${facts.zip.sha256}`)
  say(`  dist/: ${facts.dist.files} files, ${facts.dist.bytes} bytes (${mib(facts.dist.bytes)})`)
  say(`  node_modules/ (dist included): ${nodeModules.files} files, ${nodeModules.bytes} bytes (${mib(nodeModules.bytes)})`)
  say(`  as Node: ${JSON.stringify(facts.runs_as_node)}`)
  say(`  record: ${BUILD_RECORD}`)
}

function verify(manifest) {
  checkRegistry()
  const packages = tarballs()
  const facts = electronFacts(manifest.electron.version)
  checkAgainstManifest(manifest, packages, facts)
}

function lock(result) {
  const npmVersion = spawnSync(process.execPath, [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), '--version'], { encoding: 'utf8' }).stdout.trim()
  const { cache_path: _cachePath, ...zip } = result.facts.zip
  const manifest = {
    about: 'Electron for the installer feasibility batch (work order 02, E1 and E4). Written by `setup_electron.mjs lock`; '
      + '`build` and `verify` stop when anything differs. npm also checks each tarball against its sha512 `integrity` in package-lock.json.',
    locked: { date: new Date().toLocaleDateString('sv-SE'), node: process.version, npm: npmVersion, registry: REGISTRY },
    electron: {
      version: result.version,
      zip: { ...zip, source: "fetched by the electron package's own install.js (@electron/get) from Electron's GitHub releases" },
      dist_version: result.facts.dist_version,
      electron_exe: result.facts.electron_exe,
      dist: result.facts.dist,
      runs_as_node: result.facts.runs_as_node,
    },
    npm_packages: result.packages,
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  say(`wrote ${MANIFEST}`)
}

const command = process.argv[2]
const started = Date.now()
try {
  if (!['build', 'verify', 'lock'].includes(command)) throw new Stop('usage: node installer/electron/setup_electron.mjs build | verify | lock')
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : undefined
  if (command !== 'lock' && manifest === undefined) throw new Stop(`${MANIFEST} is missing; run lock first`)
  if (command === 'verify') {
    verify(manifest)
    say('\nverify: everything matches the manifest')
  } else {
    const result = install(command === 'build' ? manifest : undefined)
    if (command === 'build') checkAgainstManifest(manifest, result.packages, result.facts)
    else lock(result)
    record(result, started)
  }
} catch (error) {
  if (!(error instanceof Stop)) throw error
  say(`\nSTOP: ${error.message}`)
  process.exitCode = 1
}
