#!/usr/bin/env node
/**
 * Inno Setup, the tool that builds the Windows installer (W7; why this tool: docs/installer.md §一).
 *
 *   node installer/innosetup/setup_innosetup.mjs build    download (when missing), check, install portable, check the files
 *   node installer/innosetup/setup_innosetup.mjs verify   check what is installed; downloads and installs nothing
 *   node installer/innosetup/setup_innosetup.mjs lock     the same as build, then (re)write the installed files' SHA256
 *
 * 1. The file: innosetup-<version>-x64.exe from the project's own GitHub releases (jrsoftware/issrc; the download page
 *    jrsoftware.org/isdl.php links there). Its SHA256 and size must be the manifest's (the manifest's value is the
 *    digest GitHub publishes for the release asset), and Windows must report its Authenticode signature Valid, from the
 *    signer named in the manifest. Kept in installer/downloads/innosetup/ (git-ignored).
 * 2. Installed in portable mode into installer/downloads/innosetup/<version>/ (git-ignored): Inno Setup's own setup takes
 *    /PORTABLE=1 (its isportable.iss: no uninstaller and so no entry in Settings → Apps, no Start-menu folder, no file
 *    association), /CURRENTUSER (no administrator rights). During its install Inno Setup checks its own compiler files
 *    against its signature files (.issig).
 * 3. The installed compiler files (ISCC.exe, ISCmplr.dll, ISPP.dll, the LZMA compressor, the Setup stubs, the Chinese
 *    translation) must have the SHA256 in the manifest (written by `lock`); `build` and `verify` stop at the first
 *    difference.
 * The run prints what it did; installer/build/innosetup-build.json records it.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const MANIFEST = join(HERE, 'manifest.json')
const DOWNLOADS = join(REPO, 'installer', 'downloads', 'innosetup')
const BUILD_RECORD = join(REPO, 'installer', 'build', 'innosetup-build.json')
const OFFICIAL = 'https://github.com/jrsoftware/issrc/releases/download/'
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

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

/** Where a version is installed (portable): installer/downloads/innosetup/<version>/. */
export function innoDir(manifest = readManifest()) {
  return join(DOWNLOADS, manifest.version)
}

/** The command-line compiler of the pinned Inno Setup, after `verify`. */
export function isccPath(manifest = readManifest()) {
  return join(innoDir(manifest), 'ISCC.exe')
}

export function readManifest() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

async function download(url, dest) {
  if (!url.startsWith(OFFICIAL)) throw new Stop(`refusing ${url}: Inno Setup comes only from ${OFFICIAL}`)
  say(`  get ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Stop(`${url}: HTTP ${res.status}`)
  // GitHub redirects release assets to its own download host
  const host = new URL(res.url).hostname
  if (!/^(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)$/.test(host)) throw new Stop(`${url} ended at ${res.url}`)
  const part = `${dest}.part`
  writeFileSync(part, Buffer.from(await res.arrayBuffer()))
  renameSync(part, dest)
}

/** Windows' own view of the file's Authenticode signature: {status, subject}. */
function authenticode(path) {
  const script = `$s = Get-AuthenticodeSignature -LiteralPath $env:ST_FILE; @{ status = [string]$s.Status; subject = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress`
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ST_FILE: path } })
  if (r.status !== 0) throw new Stop(`Get-AuthenticodeSignature failed: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

function checkInstaller(manifest) {
  const { file, sha256, bytes, signer } = manifest.installer
  const path = join(DOWNLOADS, file)
  const actual = sha256File(path)
  const size = statSync(path).size
  if (actual !== sha256 || size !== bytes) {
    const rejected = `${path}.rejected`
    renameSync(path, rejected)
    throw new Stop(`${file}: SHA256 ${actual}, ${size} bytes; the manifest says ${sha256}, ${bytes} bytes. Kept as ${rejected}; nothing installed.`)
  }
  say(`  ok  ${file}  sha256 ${actual}`)
  const sig = authenticode(path)
  if (sig.status !== 'Valid' || !sig.subject.includes(signer)) throw new Stop(`${file}: Authenticode ${sig.status}, signer ${sig.subject}; the manifest expects a Valid signature from ${signer}`)
  say(`  ok  Authenticode Valid, ${sig.subject}`)
  return { path, sha256: actual, authenticode: sig }
}

function installPortable(manifest, setupExe) {
  const dir = innoDir(manifest)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dirname(dir), { recursive: true })
  const log = join(DOWNLOADS, `install-${manifest.version}.log`)
  const args = ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/PORTABLE=1', '/CURRENTUSER', '/NOICONS', '/TASKS=', `/DIR=${dir}`, `/LOG=${log}`]
  say(`  $ ${setupExe} ${args.join(' ')}`)
  const r = spawnSync(setupExe, args, { stdio: 'ignore', windowsHide: true, timeout: 300_000 })
  if (r.status !== 0) throw new Stop(`Inno Setup's own setup exited with ${r.status} (log: ${log})`)
  if (!existsSync(join(dir, 'ISCC.exe'))) throw new Stop(`no ISCC.exe in ${dir} after the install (log: ${log})`)
  if (existsSync(join(dir, 'unins000.exe'))) throw new Stop(`${dir} has an uninstaller: the install was not portable`)
}

function installedFacts(manifest) {
  const dir = innoDir(manifest)
  const files = {}
  for (const name of manifest.check_files) {
    const path = join(dir, ...name.split('/'))
    if (!existsSync(path)) throw new Stop(`${path} is missing`)
    files[name] = sha256File(path)
  }
  const version = spawnSync(join(dir, 'ISCC.exe'), ['--version'], { encoding: 'utf8', windowsHide: true })
  return { files, iscc_version: `${version.stdout}`.trim() }
}

function checkInstalled(manifest, facts) {
  for (const [name, sha] of Object.entries(manifest.installed_sha256 ?? {})) {
    if (facts.files[name] !== sha) throw new Stop(`${name}: SHA256 ${facts.files[name]}, the manifest says ${sha}`)
    say(`  ok  ${name}  ${sha}`)
  }
  if (Object.keys(manifest.installed_sha256 ?? {}).length !== manifest.check_files.length) throw new Stop('the manifest has no installed SHA256 for every checked file; run lock')
  if (!facts.iscc_version.includes(manifest.version)) throw new Stop(`ISCC --version says ${facts.iscc_version}, not ${manifest.version}`)
  say(`  ok  ${facts.iscc_version}`)
}

async function build(manifest, { lock = false } = {}) {
  mkdirSync(DOWNLOADS, { recursive: true })
  const setupExe = join(DOWNLOADS, manifest.installer.file)
  say(`1. ${manifest.installer.file}, checked`)
  if (!existsSync(setupExe)) await download(manifest.installer.url, setupExe)
  const checked = checkInstaller(manifest)
  say(`2. portable install into ${innoDir(manifest)}`)
  installPortable(manifest, setupExe)
  say('3. the installed compiler files')
  const facts = installedFacts(manifest)
  if (lock) {
    manifest.installed_sha256 = facts.files
    manifest.iscc_version = facts.iscc_version
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
    say(`  wrote ${MANIFEST}`)
  }
  checkInstalled(manifest, facts)
  mkdirSync(dirname(BUILD_RECORD), { recursive: true })
  writeFileSync(BUILD_RECORD, `${JSON.stringify({ built: new Date().toISOString(), installer: checked, dir: innoDir(manifest), ...facts }, null, 2)}\n`)
}

/** Check the installed Inno Setup against the manifest; installs it first when `install` and it is missing. */
export async function ensureInnoSetup({ install = true } = {}) {
  const manifest = readManifest()
  if (!existsSync(isccPath(manifest))) {
    if (!install) throw new Stop(`Inno Setup ${manifest.version} is not installed; run node installer/innosetup/setup_innosetup.mjs build`)
    await build(manifest)
  } else {
    checkInstalled(manifest, installedFacts(manifest))
  }
  return { iscc: isccPath(manifest), dir: innoDir(manifest), version: manifest.version }
}

export { Stop }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  try {
    if (!['build', 'verify', 'lock'].includes(command)) throw new Stop('usage: node installer/innosetup/setup_innosetup.mjs build | verify | lock')
    const manifest = readManifest()
    if (command === 'verify') {
      checkInstalled(manifest, installedFacts(manifest))
      say('\nverify: Inno Setup matches the manifest')
    } else {
      await build(manifest, { lock: command === 'lock' })
      say(`\nInno Setup ${manifest.version} in ${innoDir(manifest)}`)
    }
  } catch (error) {
    if (!(error instanceof Stop)) throw error
    say(`\nSTOP: ${error.message}`)
    process.exitCode = 1
  }
}
