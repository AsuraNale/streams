#!/usr/bin/env node
/**
 * rcedit, the tool that gives Streams.exe its own icon and version info (the icon round, 2026-10-08; docs/installer.md
 * §二 and §三). Its own folder, installer/rcedit: engine/ and desktop/ are not touched. Only the binary it ships,
 * bin/rcedit-x64.exe, is used (installer/build-installer.mjs runs it directly); its JavaScript wrapper is not loaded.
 *
 *   node installer/rcedit/setup_rcedit.mjs build    npm ci here, then check the binary and the tarballs against manifest.json
 *   node installer/rcedit/setup_rcedit.mjs verify   check what is already there; installs and downloads nothing
 *   node installer/rcedit/setup_rcedit.mjs lock     npm ci, then (re)write manifest.json from what was installed
 *
 * `npm ci --ignore-scripts` as installer/electron/setup_electron.mjs does it: exactly the packages of package-lock.json,
 * from https://registry.npmjs.org/ only (every `resolved` checked first; --registry, no user or global npmrc, no
 * npm_config_* variable), into node_modules (git-ignored), npm's cache in installer/downloads/npm-cache. npm checks each
 * tarball's sha512 (`integrity` in the lock); this script also takes each tarball's SHA256 from that cache, and the
 * SHA256 and size of bin/rcedit-x64.exe, and runs it once (`--help`) to read the version it reports. The binary is not
 * code-signed (checked), so these hashes are what pins it. build and verify stop at the first mismatch (exit code 1).
 * The measured facts go to installer/build/rcedit-build.json.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const DOWNLOADS = join(REPO, 'installer', 'downloads')
const NPM_CACHE = join(DOWNLOADS, 'npm-cache')
const BUILD_RECORD = join(REPO, 'installer', 'build', 'rcedit-build.json')
const MANIFEST = join(HERE, 'manifest.json')
const LOCK = join(HERE, 'package-lock.json')
const PACKAGE_DIR = join(HERE, 'node_modules', 'rcedit')
const BINARY = 'bin/rcedit-x64.exe'
const REGISTRY = 'https://registry.npmjs.org/'
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

/** This process's environment without anything that steers npm. */
function cleanEnv() {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(npm_config_|npm_package_|node_options$|force_no_cache$)/i.test(key)) continue
    env[key] = value
  }
  return env
}

function npmCli() {
  const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!existsSync(cli)) throw new Stop(`npm not found next to this Node (${cli})`)
  return cli
}

function npm(args) {
  const full = [...args, `--registry=${REGISTRY}`, `--userconfig=${NO_USERCONFIG}`, `--globalconfig=${NO_GLOBALCONFIG}`,
    `--cache=${NPM_CACHE}`, '--no-audit', '--no-fund', '--update-notifier=false']
  say(`  $ npm ${full.join(' ')}`)
  const result = spawnSync(process.execPath, [npmCli(), ...full], { cwd: HERE, env: cleanEnv(), stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.status !== 0) throw new Stop(`npm ${args[0]} failed (exit code ${result.status})`)
}

function lockPackages() {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'))
  return Object.entries(lock.packages)
    .filter(([key]) => key !== '')
    .map(([key, value]) => ({ name: key.replace(/^.*node_modules\//, ''), path: key, version: value.version, resolved: value.resolved, integrity: value.integrity, license: value.license }))
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
    return { name: pkg.name, version: pkg.version, license: pkg.license, resolved: pkg.resolved, integrity: pkg.integrity, sha256: sha256File(file), bytes: statSync(file).size }
  })
}

function checkRegistry() {
  const outside = lockPackages().filter(pkg => !String(pkg.resolved).startsWith(REGISTRY))
  if (outside.length > 0) throw new Stop(`package-lock.json resolves outside ${REGISTRY}: ${outside.map(pkg => `${pkg.name} ${pkg.resolved}`).join(', ')}`)
}

/** The installed binary: where it is, its hash and size, and the first line it prints (its own version). */
function binaryFacts() {
  const exe = join(PACKAGE_DIR, ...BINARY.split('/'))
  if (!existsSync(exe)) throw new Stop(`${exe} is missing; run node installer/rcedit/setup_rcedit.mjs build`)
  const pkg = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'))
  const run = spawnSync(exe, ['--help'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  const first = `${run.stdout ?? ''}${run.stderr ?? ''}`.split(/\r?\n/).find(l => /rcedit/i.test(l)) ?? ''
  if (!first) throw new Stop(`${exe} --help printed nothing that names rcedit (exit code ${run.status})`)
  return {
    version: pkg.version,
    license: pkg.license,
    repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
    binary: { file: BINARY, sha256: sha256File(exe), bytes: statSync(exe).size, reports: first.trim() },
  }
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
  compare('rcedit version', facts.version, manifest.rcedit.version)
  compare(`${BINARY} sha256`, facts.binary.sha256, manifest.rcedit.binary.sha256)
  compare(`${BINARY} bytes`, facts.binary.bytes, manifest.rcedit.binary.bytes)
  compare(`${BINARY} --help`, facts.binary.reports, manifest.rcedit.binary.reports)
}

/** Before npm runs: whatever is already in the cache must match the manifest (npm would quietly fetch a bad file again). */
function precheckCache(manifest) {
  const listed = new Map(manifest.npm_packages.map(pkg => [`${pkg.name}@${pkg.version}`, pkg]))
  for (const pkg of lockPackages()) {
    const entry = listed.get(`${pkg.name}@${pkg.version}`)
    if (!entry) throw new Stop(`${pkg.name}@${pkg.version} (package-lock.json) is not in the manifest; run lock`)
    if (entry.integrity !== pkg.integrity) throw new Stop(`${pkg.name}@${pkg.version}: package-lock.json integrity ${pkg.integrity}, the manifest ${entry.integrity}`)
    const file = cachedTarball(pkg)
    if (existsSync(file) && sha256File(file) !== entry.sha256) throw new Stop(`${file} (${pkg.name}@${pkg.version}) does not match the manifest's sha256 ${entry.sha256}; nothing was installed`)
  }
}

function install(manifest) {
  const pinned = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).devDependencies.rcedit
  if (manifest && manifest.rcedit.version !== pinned) throw new Stop(`package.json pins rcedit ${pinned}, the manifest ${manifest.rcedit.version}`)
  say('1. npm packages (npm ci --ignore-scripts), from the npm registry only')
  checkRegistry()
  if (manifest) precheckCache(manifest)
  npm(['ci', '--ignore-scripts'])
  const packages = tarballs()
  say('2. the binary')
  const facts = binaryFacts()
  if (facts.version !== pinned) throw new Stop(`node_modules/rcedit is ${facts.version}, package.json pins ${pinned}`)
  return { packages, facts }
}

function record({ packages, facts }, started) {
  const out = {
    built: new Date().toISOString(),
    seconds: Math.round((Date.now() - started) / 100) / 10,
    rcedit: facts,
    npm_tarballs: { count: packages.length, bytes: packages.reduce((sum, pkg) => sum + pkg.bytes, 0) },
  }
  mkdirSync(dirname(BUILD_RECORD), { recursive: true })
  writeFileSync(BUILD_RECORD, `${JSON.stringify(out, null, 2)}\n`)
  say(`\nrcedit ${facts.version}: ${join(PACKAGE_DIR, ...BINARY.split('/'))}`)
  say(`  ${facts.binary.bytes} bytes, sha256 ${facts.binary.sha256}; reports "${facts.binary.reports}"`)
  say(`  record: ${BUILD_RECORD}`)
}

function lock(result) {
  const npmVersion = spawnSync(process.execPath, [npmCli(), '--version'], { encoding: 'utf8' }).stdout.trim()
  const manifest = {
    about: 'rcedit, the tool that sets Streams.exe\'s icon and version info at build time (the icon round, 2026-10-08). Written by '
      + '`setup_rcedit.mjs lock`; `build` and `verify` stop when anything differs. Only bin/rcedit-x64.exe is used; it is not '
      + 'code-signed, so its SHA256 here is what pins it. npm also checks each tarball against its sha512 `integrity` in package-lock.json.',
    locked: { date: new Date().toLocaleDateString('sv-SE'), node: process.version, npm: npmVersion, registry: REGISTRY },
    rcedit: { ...result.facts, npm_deprecation: 'npm marks every version of the rcedit package deprecated ("Package no longer supported"); the binary works and is pinned here' },
    npm_packages: result.packages,
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  say(`wrote ${MANIFEST}`)
}

export function readManifest() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

/** The pinned rcedit-x64.exe, checked against the manifest; installed first (npm ci) when `install` and it is missing. */
export function ensureRcedit({ install: allowed = true } = {}) {
  const manifest = readManifest()
  const exe = join(PACKAGE_DIR, ...BINARY.split('/'))
  let packages
  let facts
  if (!existsSync(exe)) {
    if (!allowed) throw new Stop(`rcedit ${manifest.rcedit.version} is not installed; run node installer/rcedit/setup_rcedit.mjs build`)
    ;({ packages, facts } = install(manifest))
  } else {
    checkRegistry()
    packages = tarballs()
    facts = binaryFacts()
  }
  checkAgainstManifest(manifest, packages, facts)
  return { exe, version: facts.version, license: facts.license, binary: facts.binary }
}

export { Stop }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  const started = Date.now()
  try {
    if (!['build', 'verify', 'lock'].includes(command)) throw new Stop('usage: node installer/rcedit/setup_rcedit.mjs build | verify | lock')
    const manifest = existsSync(MANIFEST) ? readManifest() : undefined
    if (command !== 'lock' && manifest === undefined) throw new Stop(`${MANIFEST} is missing; run lock first`)
    if (command === 'verify') {
      checkRegistry()
      checkAgainstManifest(manifest, tarballs(), binaryFacts())
      say('\nverify: rcedit matches the manifest')
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
}
