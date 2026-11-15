#!/usr/bin/env node
/**
 * The Windows installer of Streams in one command (docs/installer.md):
 *
 *   node installer/build-installer.mjs
 *
 * 1. Electron 44.0.0: installer/electron/setup_electron.mjs verify (the zip, electron.exe and dist/ against its manifest).
 * 2. Inno Setup 7.1.0: installer/innosetup/setup_innosetup.mjs (the official file, SHA256 and signature checked,
 *    installed portable under installer/downloads/), then its installed compiler files checked against the manifest.
 * 3. rcedit 5.0.2 (installer/rcedit/setup_rcedit.mjs): the pinned rcedit-x64.exe, its SHA256 checked against the manifest
 *    (installed with npm ci when missing).
 * 4. The stage, installer/dist/stage/: exactly the install folder (docs/installer.md §三) — Electron renamed Streams.exe,
 *    resources/app (the desktop app with its npm dependencies — preact, htm and, v2 package J2, @mozilla/readability —, the icon file assets/icon/streams.ico, Streams' LICENSE; v2 package K2: the UI font
 *    src/renderer/fonts/NotoSansSC-VF.ttf with its OFL text, checked to be there and listed in the notices' section 6;
 *    redesign R6a: and the Research theme's heading font, src/renderer/fonts/NotoSerifSC-VF.ttf with its OFL text, the same
 *    way — which fonts ship and what the build asks of them is installer/fonts.mjs),
 *    resources/core (core/src: desktop/src/main/core.mjs imports ../../../core/src/index.mjs, which from
 *    resources/app/src/main is resources/core/src), THIRD-PARTY-NOTICES.txt. Only files git knows (tracked, or new and
 *    not ignored) from desktop/src and core/src; tests, fixtures and the component gallery stay out. Then rcedit gives Streams.exe its icon (the .ico) and
 *    流息's version info (publisher, name, version, the company's copyright line — release.json's `copyright`, the one
 *    source of that line for Streams.exe and the setup program both).
 * 5. Checks on the stage: no link anywhere; Streams.exe is electron.exe with only its .rsrc section rewritten (every other
 *    PE section byte for byte the pinned one, the rest of Electron's files byte for byte the dist's), its one icon group
 *    exactly the .ico's images, its version info ours; nothing the scan (installer/scan.mjs) must not find.
 * 6. ISCC compiles installer/setup/streams.iss into installer/dist/<name>.exe, with installer/dist/install-delete.iss made
 *    from the stage's top level (the update's clean-up of an older copy: installer/install-delete.mjs). The setup program,
 *    the uninstall entry and both shortcuts get the .ico; the setup program's version info is read back and must be
 *    release.json's: publisher, name, version, copyright. installer/dist/ is git-ignored.
 * 7. installer/dist/build-record.json: inputs, stage, Streams.exe, the installer's size, SHA256 and version info; the stage's
 *    file list goes to installer/dist/stage-manifest.json, and when the previous build's list is there, the files that
 *    differ are printed. installer/dist/release-notes-<version>.md: the installer's name, size and SHA256, that it is not
 *    signed and the two clicks past SmartScreen (tests/acceptance/v01-clean-install.test.mjs reads it).
 * Stops at the first failed check (exit code 1).
 *
 * For the update test only (installer/test/upgrade.test.mjs): STREAMS_INSTALLER_VERSION=<major.minor.patch> builds the same
 * app under another version number (release.json itself is not changed: version, output_base_filename and app_ver_name are
 * taken over for this one run), and STREAMS_INSTALLER_OUT=<absolute folder> puts everything this build writes there
 * instead of installer/dist. Both are build-time variables of this script; the app never reads them.
 * v2 package J2: STREAMS_INSTALLER_APP_REF=<git commit> (the update test only, with the two above) takes the app — desktop/src,
 * desktop/package.json and its lock, the icon file, LICENSE, core/src and core/package.json — from that commit as git holds
 * it (git ls-tree / git cat-file), not from the working tree, so the older version of the update test is v1.0's own code
 * (its single-library settings.json is what v2 package A migrates). The npm packages are still copied from desktop/node_modules
 * and must be the versions that commit's lock names; Electron, rcedit, Inno Setup and streams.iss are this checkout's.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ensureInnoSetup } from './innosetup/setup_innosetup.mjs'
import { ensureRcedit } from './rcedit/setup_rcedit.mjs'
import { compareSections, groupMatchesIco, iconGroups, innoCopyright, setupVersionInfo, versionInfo } from './exe-resources.mjs'
import { buildNotices } from './notices.mjs'
import { fontFilesToShip } from './fonts.mjs'
import { machineMarkers, scanForLeaks } from './scan.mjs'
import { installDeleteList } from './install-delete.mjs'
import { developmentLeftovers, linksIn, relativeImportProblems, walk } from './stage-check.mjs'
import { ICON_FILE } from '../desktop/src/main/icon.mjs'
import { parseIco } from '../desktop/scripts/lib/icon.mjs'
import { VERSION_RE } from '../desktop/src/main/version.mjs'
import { setupName } from '../desktop/src/main/services/update.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INSTALLER = join(REPO, 'installer')
const OUT_OVERRIDE = process.env.STREAMS_INSTALLER_OUT ?? ''
if (OUT_OVERRIDE && !isAbsolute(OUT_OVERRIDE)) throw new Error('STREAMS_INSTALLER_OUT must be an absolute folder')
const DIST = OUT_OVERRIDE ? resolve(OUT_OVERRIDE) : join(INSTALLER, 'dist')
const STAGE = join(DIST, 'stage')
const RECORD = join(DIST, 'build-record.json')
const STAGE_MANIFEST = join(DIST, 'stage-manifest.json')
// the update's clean-up list, made from the stage (installer/install-delete.mjs) and included by installer/setup/streams.iss
const INSTALL_DELETE = join(DIST, 'install-delete.iss')
const ELECTRON_DIST = join(INSTALLER, 'electron', 'node_modules', 'electron', 'dist')
const RELEASE_FILE_JSON = JSON.parse(readFileSync(join(INSTALLER, 'setup', 'release.json'), 'utf8'))
const VERSION_OVERRIDE = process.env.STREAMS_INSTALLER_VERSION ?? ''
// the update test's other version (see the header): the same release.json with the version, the setup program's name and
// the version-and-name line taken over for this one build
const RELEASE = VERSION_OVERRIDE
  ? {
      ...RELEASE_FILE_JSON,
      version: VERSION_OVERRIDE,
      output_base_filename: setupName(VERSION_OVERRIDE).replace(/.exe$/, ''),
      app_ver_name: RELEASE_FILE_JSON.app_ver_name.split(RELEASE_FILE_JSON.version).join(VERSION_OVERRIDE),
    }
  : RELEASE_FILE_JSON
// v2 package J2: the app of another commit (see the header); '' = the working tree, as always
const APP_REF_GIVEN = process.env.STREAMS_INSTALLER_APP_REF ?? ''
const APP_REF = APP_REF_GIVEN ? resolveRef(APP_REF_GIVEN) : ''
if (APP_REF && !(OUT_OVERRIDE && VERSION_OVERRIDE)) throw new Error('STREAMS_INSTALLER_APP_REF goes with STREAMS_INSTALLER_VERSION and STREAMS_INSTALLER_OUT (the update test\'s older build): installer/dist is always the working tree\'s app')
for (const key of ['version', 'app_name', 'app_ver_name', 'publisher', 'copyright', 'app_guid', 'install_folder', 'exe_name', 'output_base_filename']) {
  if (typeof RELEASE[key] !== 'string' || !RELEASE[key].trim()) throw new Error(`installer/setup/release.json has no "${key}"`)
}
if (!/^Copyright \(C\) \d{4} \S/.test(RELEASE.copyright)) throw new Error(`installer/setup/release.json: "copyright" must read "Copyright (C) <year> <holder>", not "${RELEASE.copyright}"`)
// the version (docs/desktop.md §十九): the app's one source — Streams.exe, the setup program, the packaged package.json
// (app.getVersion) all take it from here — and what the update compares, so major.minor.patch, digits only
// (desktop/src/main/version.mjs VERSION_RE); the setup program's name is the one the update looks for on the release
// (services/update.mjs setupName): Streams-<version>-setup.exe
if (!VERSION_RE.test(RELEASE.version)) throw new Error(`installer/setup/release.json: "version" must be major.minor.patch (digits only), not "${RELEASE.version}"`)
if (`${RELEASE.output_base_filename}.exe` !== setupName(RELEASE.version)) throw new Error(`installer/setup/release.json: "output_base_filename" must be "${setupName(RELEASE.version).replace(/\.exe$/, '')}" (the name the update looks for), not "${RELEASE.output_base_filename}"`)
// the icon file in the install: resources/app is the packaged app's desktop/, so the same relative place as in development
const ICON_IN_STAGE = ['resources', 'app', ...ICON_FILE]
const ICON_STAGED = join(STAGE, ...ICON_IN_STAGE)
const FUSE_SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'
// Electron's fuse wire, in order (@electron/fuses FuseV1Options): '1' on, '0' off, 'r' removed
const FUSE_NAMES = ['RunAsNode', 'EnableCookieEncryption', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar', 'LoadBrowserProcessSpecificV8Snapshot', 'GrantFileProtocolExtraPrivileges',
  'WasmTrapHandlers']

// What the scan finds and may ship, each with the reason (installer/scan.mjs): nothing else is allowed
const ALLOWED_HITS = []

class Stop extends Error {}
const say = text => process.stdout.write(`${text}\n`)
const mib = bytes => `${(bytes / 1048576).toFixed(1)} MiB`

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

function run(label, command, args, options = {}) {
  say(`  $ ${[command, ...args].join(' ')}`)
  const r = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20, ...options })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) {
    say(out.split(/\r?\n/).slice(-30).join('\n'))
    throw new Stop(`${label} failed (exit code ${r.status})`)
  }
  return out
}

// ---------------------------------------------------------------- what goes in

/** v2 package J2: a commit's full id (STREAMS_INSTALLER_APP_REF), or the build stops. */
function resolveRef(ref) {
  const r = spawnSync('git', ['-C', REPO, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8', windowsHide: true })
  const id = r.stdout.trim()
  if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(id)) throw new Error(`STREAMS_INSTALLER_APP_REF: ${ref} is not a commit of this repository`)
  return id
}

/**
 * Files git knows below `dir` (tracked, or new and not ignored), present in the working tree; repo-relative, `/`.
 * v2 package J2: with STREAMS_INSTALLER_APP_REF, the files of that commit below `dir` instead.
 */
function gitFiles(dir) {
  if (APP_REF) {
    const t = spawnSync('git', ['-C', REPO, 'ls-tree', '-r', '-z', '--name-only', APP_REF, '--', dir], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 })
    if (t.status !== 0) throw new Stop(`git ls-tree ${APP_REF} ${dir}: ${t.stderr}`)
    return [...new Set(t.stdout.split('\0').filter(Boolean))].sort()
  }
  const r = spawnSync('git', ['-C', REPO, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', dir], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new Stop(`git ls-files ${dir}: ${r.stderr}`)
  return [...new Set(r.stdout.split('\0').filter(Boolean))].filter(p => existsSync(join(REPO, p))).sort()
}

/** A repo-relative file's bytes: the working tree's, or (v2 package J2, STREAMS_INSTALLER_APP_REF) that commit's blob. */
function sourceBytes(path) {
  if (!APP_REF) return readFileSync(join(REPO, path))
  const r = spawnSync('git', ['-C', REPO, 'cat-file', 'blob', `${APP_REF}:${path}`], { windowsHide: true, maxBuffer: 256 << 20 })
  if (r.status !== 0) throw new Stop(`git cat-file ${APP_REF}:${path}: ${String(r.stderr)}`)
  return r.stdout
}
const sourceJson = path => JSON.parse(sourceBytes(path).toString('utf8'))

/** v2 package J2: STREAMS_INSTALLER_APP_REF's desktop/package-lock.json as a file in this build's output folder (for buildNotices). */
function appRefLock() {
  const file = join(DIST, 'app-ref-package-lock.json')
  writeFileSync(file, sourceBytes('desktop/package-lock.json'))
  return file
}

/** Copy a repo-relative source file (sourceBytes) to `dest`. */
function copySource(path, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  if (APP_REF) writeFileSync(dest, sourceBytes(path))
  else copyFileSync(join(REPO, path), dest)
}

/** Copy a folder as it is on disk; a link anywhere stops the build. */
function copyTree(src, dest, { skip = () => false, rel = '' } = {}) {
  let count = 0
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    const r = rel ? `${rel}/${entry.name}` : entry.name
    if (skip(r)) continue
    const st = lstatSync(from)
    if (st.isSymbolicLink()) throw new Stop(`${from} is a link: the install must hold real folders`)
    if (st.isDirectory()) count += copyTree(from, to, { skip, rel: r })
    else if (st.isFile()) { copyFileSync(from, to); count += 1 }
  }
  return count
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** The component gallery's files (development only: desktop/src/main/protocol.mjs DEV_ONLY), read from the source. */
function devOnlyFiles() {
  const text = sourceBytes('desktop/src/main/protocol.mjs').toString('utf8')
  const m = /export const DEV_ONLY = Object\.freeze\(\[([^\]]*)\]\)/.exec(text)
  if (!m) throw new Stop('desktop/src/main/protocol.mjs has no DEV_ONLY list')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

function stage() {
  if (existsSync(STAGE)) rmSync(STAGE, { recursive: true, force: true })
  mkdirSync(STAGE, { recursive: true })
  const counts = {}

  // Electron: every file of dist/ but Electron's default app; electron.exe → Streams.exe (nothing in it changes)
  counts.electron = copyTree(ELECTRON_DIST, STAGE, { skip: r => r === 'resources/default_app.asar' })
  renameSync(join(STAGE, 'electron.exe'), join(STAGE, RELEASE.exe_name))

  // the desktop app
  const app = join(STAGE, 'resources', 'app')
  const desktopPkg = sourceJson('desktop/package.json')
  // the version the packaged app reports (app.getVersion() reads this package.json) is release.json's, the one source;
  // desktop/package.json's own version is npm's and is not compared (it would make a second place to bump for every release)
  writeJson(join(app, 'package.json'), {
    name: desktopPkg.name, productName: desktopPkg.productName, version: RELEASE.version, private: true,
    description: desktopPkg.description, license: desktopPkg.license, type: desktopPkg.type, main: desktopPkg.main,
  })
  const devOnly = devOnlyFiles()
  const srcFiles = gitFiles('desktop/src').filter(f => !devOnly.some(d => f === `desktop/src/renderer/${d}`))
  for (const f of srcFiles) copySource(f, join(app, relative('desktop', f)))
  counts.desktop = srcFiles.length
  // v2 package K2: the bundled UI font and its license text go with desktop/src (git knows both); a build without either stops.
  // v2 package N: asked of an app whose styles load the font (styles/fonts.css, package K2 on) — v1.0's app, the update
  // test's older build (STREAMS_INSTALLER_APP_REF), has neither, and the build stopped there: upgrade.test.mjs could not run
  // redesign R6a: the question is asked of the font files themselves (installer/fonts.mjs fontFilesToShip) — styles/fonts.css
  // went away with redesign R1 (the template declares the face), and there are two fonts now: Noto Sans SC and the Research
  // theme's Noto Serif SC, each with its license text. The working tree's app must have all four; an older app only its pairs.
  const shippedFonts = fontFilesToShip(srcFiles, { appRef: APP_REF })
  if (shippedFonts.problems.length) throw new Stop(shippedFonts.problems.join('\n'))
  counts.font = shippedFonts.files.length
  // the icon: of desktop/assets/icon only the one file the app reads (desktop/src/main/icon.mjs); the SVG sources and the
  // PNG renders stay out
  const icoFile = `desktop/${ICON_FILE.join('/')}`
  if (!gitFiles('desktop/assets/icon').includes(icoFile)) throw new Stop(`${icoFile} is not a file git knows (desktop/assets/icon/README.md)`)
  copySource(icoFile, ICON_STAGED)
  counts.icon = 1
  const desktopLock = sourceJson('desktop/package-lock.json').packages
  for (const name of Object.keys(desktopPkg.dependencies)) {
    const installed = JSON.parse(readFileSync(join(REPO, 'desktop', 'node_modules', name, 'package.json'), 'utf8')).version
    if (installed !== desktopLock[`node_modules/${name}`]?.version) throw new Stop(`desktop/node_modules/${name} is ${installed}, the lock says ${desktopLock[`node_modules/${name}`]?.version}`)
    counts[name] = copyTree(join(REPO, 'desktop', 'node_modules', name), join(app, 'node_modules', name))
  }
  // Streams' own license, next to the app's package.json (Electron's LICENSE is the one at the top of the install folder)
  if (!gitFiles('LICENSE').includes('LICENSE')) throw new Stop('LICENSE is not a file git knows')
  copySource('LICENSE', join(app, 'LICENSE'))
  counts.license = 1

  // the core (core/src): the desktop app reaches it by a relative path (desktop/src/main/core.mjs:
  // ../../../core/src/index.mjs), so it sits where that path lands from resources/app/src/main — resources/core/src. It has
  // no npm dependencies (core/package.json); its package.json goes along with the fields that say what it is
  const coreDir = join(STAGE, 'resources', 'core')
  const coreFiles = gitFiles('core/src')
  if (!coreFiles.includes('core/src/index.mjs')) throw new Stop('core/src/index.mjs is not a file git knows')
  for (const f of coreFiles) copySource(f, join(coreDir, relative('core', f)))
  const corePkg = sourceJson('core/package.json')
  if (Object.keys(corePkg.dependencies ?? {}).length) throw new Stop(`core/package.json has dependencies (${Object.keys(corePkg.dependencies).join(', ')}): the stage does not carry them`)
  writeJson(join(coreDir, 'package.json'), { name: corePkg.name, version: RELEASE.version, private: true, license: corePkg.license, type: corePkg.type })
  counts.core = coreFiles.length
  return { counts, devOnly }
}

/**
 * Streams.exe's own resources: rcedit replaces electron.exe's icon group with the .ico and rewrites the version strings —
 * publisher, name, file description, the copyright line, the file names — and the file and product versions, all from
 * release.json. Nothing else in the file changes (checkStage compares every other PE section with electron.exe). rcedit
 * writes the same bytes for the same input, so the build stays reproducible.
 * @returns {{strings: Record<string, string>, fileVersion: string, productVersion: string}} what was written
 */
function brandExe(rcedit) {
  const exe = join(STAGE, RELEASE.exe_name)
  const strings = {
    CompanyName: RELEASE.publisher,
    ProductName: RELEASE.app_name,
    FileDescription: RELEASE.app_name,
    LegalCopyright: RELEASE.copyright,
    OriginalFilename: RELEASE.exe_name,
    InternalName: RELEASE.exe_name.replace(/\.exe$/i, ''),
  }
  const args = [exe, '--set-icon', ICON_STAGED, ...Object.entries(strings).flatMap(([k, v]) => ['--set-version-string', k, v]),
    '--set-file-version', RELEASE.version, '--set-product-version', RELEASE.version]
  run('rcedit', rcedit.exe, args, { timeout: 300_000 })
  return { strings, fileVersion: RELEASE.version, productVersion: RELEASE.version }
}

// ---------------------------------------------------------------- checks

function readFuses(exe) {
  const buf = readFileSync(exe)
  const at = buf.indexOf(Buffer.from(FUSE_SENTINEL, 'ascii'))
  if (at < 0) throw new Stop(`${exe}: no fuse wire`)
  const version = buf[at + FUSE_SENTINEL.length]
  const length = buf[at + FUSE_SENTINEL.length + 1]
  const wire = buf.subarray(at + FUSE_SENTINEL.length + 2, at + FUSE_SENTINEL.length + 2 + length).toString('latin1')
  const named = {}
  for (const [i, ch] of [...wire].entries()) named[FUSE_NAMES[i] ?? `fuse${i}`] = { 1: 'on', 0: 'off', r: 'removed' }[ch] ?? ch
  return { version, wire, named }
}

function checkStage({ devOnly, branded }) {
  const facts = {}
  // no links; the longest path
  let files = 0
  let bytes = 0
  let longest = ''
  const links = linksIn(STAGE)
  if (links.length) throw new Stop(`links in the stage: ${links.slice(0, 5).join(', ')}`)
  for (const e of walk(STAGE)) {
    if (!e.dir && !e.link) { files += 1; bytes += e.size }
    const r = relative(STAGE, e.path)
    if (r.length > longest.length) longest = r
  }
  facts.files = files
  facts.bytes = bytes
  facts.longest_relative_path = { length: longest.length, path: longest }
  say(`  ok  no links; ${files} files, ${mib(bytes)}; longest path ${longest.length} characters below the install folder`)

  // every relative import in our own code resolves inside the stage (a package laid out differently from the repository
  // fails here, at build time, not as a dialog in the packaged app)
  // (installer/stage-check.mjs: resources/app/src and resources/core/src; app.js loads the component gallery only in
  // development (`#kit`), its files are left out on purpose)
  const imports = relativeImportProblems(STAGE, { devOnly })
  if (imports.missingRoots.length) throw new Stop(`our own code is missing from the stage: ${imports.missingRoots.join(', ')}`)
  if (imports.unresolved.length) throw new Stop(`relative imports that do not resolve in the stage: ${imports.unresolved.slice(0, 10).join('; ')}`)
  facts.relative_imports = { imports: imports.imports, files: imports.files }
  say(`  ok  ${imports.imports} relative imports in ${imports.files} files of our own code (resources/app/src, resources/core/src) all resolve inside the stage`)
  if (!existsSync(join(STAGE, 'resources', 'core', 'src', 'index.mjs'))) throw new Stop('resources/core/src/index.mjs is not in the stage')

  // the component gallery is not there; nor tests, fixtures, samples, development scripts
  const app = join(STAGE, 'resources', 'app', 'src', 'renderer')
  const shipped = devOnly.filter(d => existsSync(join(app, ...d.split('/'))))
  if (shipped.length) throw new Stop(`development-only files in the stage: ${shipped.join(', ')}`)
  const leftovers = developmentLeftovers(STAGE)
  if (leftovers.length) throw new Stop(`tests, fixtures or development scripts in the stage: ${leftovers.slice(0, 10).join(', ')}`)
  say(`  ok  the component gallery's files are not in the stage (${devOnly.join(', ')}); no tests, fixtures, samples or development scripts`)

  // Streams.exe is the pinned electron.exe with its resources rewritten and nothing else: the same PE sections in the same
  // order and every one but .rsrc byte for byte electron.exe's (the manifest's hash first: setup_electron verify ran, but
  // the comparison below is only as good as its reference)
  const manifest = JSON.parse(readFileSync(join(INSTALLER, 'electron', 'manifest.json'), 'utf8'))
  const electronExe = join(ELECTRON_DIST, 'electron.exe')
  const electronSha = sha256File(electronExe)
  if (electronSha !== manifest.electron.electron_exe.sha256) throw new Stop(`electron.exe sha256 ${electronSha} is not the manifest's ${manifest.electron.electron_exe.sha256}`)
  const exe = join(STAGE, RELEASE.exe_name)
  const sections = compareSections(exe, electronExe)
  if (sections.different.join() !== '.rsrc') throw new Stop(`${RELEASE.exe_name}: PE sections that differ from electron.exe: ${sections.different.join(', ') || 'none'} (exactly .rsrc may)`)
  const fuses = readFuses(exe)
  say(`  ok  ${RELEASE.exe_name}: ${sections.same.length} of ${sections.names.length} PE sections byte for byte electron.exe ${manifest.electron.version} (sha256 ${electronSha}), .rsrc rewritten; fuses ${JSON.stringify(fuses.named)}`)

  // inside .rsrc: the one icon group holds exactly the .ico's images; the version info is what brandExe wrote
  const icoSha = sha256File(ICON_STAGED)
  const groups = iconGroups(exe)
  if (groups.length !== 1) throw new Stop(`${RELEASE.exe_name} has ${groups.length} icon groups (ids ${groups.map(g => g.id).join(', ')}); one is expected`)
  const match = groupMatchesIco(groups[0], parseIco(readFileSync(ICON_STAGED)))
  if (!match.ok) throw new Stop(`${RELEASE.exe_name}'s icon is not ${ICON_IN_STAGE.join('/')}: ${match.matched} images match, missing ${match.missing.join(', ') || 'none'}, ${match.extra} extra`)
  const info = versionInfo(exe)
  const want = { ...branded.strings, FileVersion: branded.fileVersion, ProductVersion: branded.productVersion }
  const wrong = Object.entries(want).filter(([k, v]) => info[k] !== v).map(([k, v]) => `${k}: "${info[k]}" (wanted "${v}")`)
  if (wrong.length) throw new Stop(`${RELEASE.exe_name}'s version info is not ours: ${wrong.join('; ')}`)
  const exeSha = sha256File(exe)
  facts.exe = {
    sha256: exeSha, bytes: statSync(exe).size, electron: { version: manifest.electron.version, electron_exe_sha256: electronSha },
    sections: { same_as_electron: sections.same, rewritten: sections.different },
    icon: { file: ICON_IN_STAGE.join('/'), sha256: icoSha, group_id: groups[0].id, images: groups[0].images.map(i => `${i.width}x${i.height}`) },
    version_info: info, fuses: fuses.named,
  }
  say(`  ok  ${RELEASE.exe_name} (sha256 ${exeSha}): icon group ${groups[0].id} = ${ICON_IN_STAGE.join('/')} (${facts.exe.icon.images.join(', ')}); ${Object.entries(want).map(([k, v]) => `${k} "${v}"`).join(', ')}`)

  // the rest of Electron's files are the dist's, byte for byte
  let electronFiles = 0
  for (const e of walk(ELECTRON_DIST)) {
    if (e.dir) continue
    const rel = relative(ELECTRON_DIST, e.path)
    if (rel === 'electron.exe' || rel === join('resources', 'default_app.asar')) continue
    const staged = join(STAGE, rel)
    if (!existsSync(staged) || sha256File(staged) !== sha256File(e.path)) throw new Stop(`${rel} in the stage is not Electron's file`)
    electronFiles += 1
  }
  facts.electron_files = electronFiles
  say(`  ok  the other ${electronFiles} files of Electron's dist are in the stage byte for byte`)

  // the version the packaged app reports (Electron's app.getVersion() reads resources/app/package.json): release.json's
  const appPkg = JSON.parse(readFileSync(join(STAGE, 'resources', 'app', 'package.json'), 'utf8'))
  if (appPkg.version !== RELEASE.version) throw new Stop(`resources/app/package.json says ${appPkg.version}; release.json ${RELEASE.version}`)
  say(`  ok  the packaged app reports ${appPkg.version} (resources/app/package.json, from release.json)`)
  return facts
}

/** Content that is not ours to ship (the scan looks for it): where a development run keeps its data, the dev scripts. */
function contentMarkers() {
  return ['streams-desktop-dev', 'Streams-trial']
}

/**
 * The release notes for this version (installer/dist/release-notes-<version>.md): what a tester or the release page needs —
 * the file, its size and SHA-256 (as computed from the file just built), that it is not signed and what Windows then
 * shows, how to check the SHA-256, how to uninstall. Written from the build's own facts: the same bytes for the same
 * installer.
 */
function releaseNotes({ file, bytes, sha256, electron }) {
  const v = RELEASE.version
  const tick = '`'
  const fence = '```'
  // v2 package N: the size in MB too, and how much of what is installed is the bundled font (the stage's own file; a build of
  // an older app — STREAMS_INSTALLER_APP_REF — has none, and its notes then say nothing of it)
  // redesign R6c: and the Research theme's heading font, Noto Serif SC (redesign R6a), when the stage has it
  const fontBytesOf = name => { const p = join(STAGE, 'resources', 'app', 'src', 'renderer', 'fonts', name); return existsSync(p) ? statSync(p).size : null }
  const fontBytes = fontBytesOf('NotoSansSC-VF.ttf')
  const serifBytes = fontBytesOf('NotoSerifSC-VF.ttf')
  const mb = n => (n / 1_000_000).toFixed(1)
  const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return [
    `# 流息 Streams ${v} · 发布说明 / Release notes`,
    '',
    '由 Starry Digital 开发（https://starrydigital.ca）· Developed by Starry Digital · MIT',
    '',
    '## 安装包 / Installer',
    '',
    '| | |',
    '|---|---|',
    `| 文件 / File | ${tick}${file}${tick} |`,
    `| 大小 / Size | ${bytes} 字节 / bytes（约 / about ${mb(bytes)} MB）${fontBytes === null ? '' : serifBytes === null
      ? `，含界面字体 Noto Sans SC / including the interface font Noto Sans SC（字体文件 / font file ${group(fontBytes)} 字节 / bytes，装好后 / installed）`
      : `，含界面字体 Noto Sans SC 与研究对话主题的标题字体 Noto Serif SC / including the interface font Noto Sans SC and the Research theme's heading font Noto Serif SC（字体文件 / font files ${group(fontBytes)} + ${group(serifBytes)} 字节 / bytes，装好后 / installed）`} |`,
    `| sha256 | ${tick}${sha256}${tick} |`,
    `| 版本 / Version | ${v}（${RELEASE.app_ver_name}） |`,
    `| 发布者 / Publisher | ${RELEASE.publisher} |`,
    '| 系统 / System | Windows 10 1809 及以上、Windows 11，x64 |',
    `| 内含 / Contains | Electron ${electron} |`,
    '',
    '核对下载的文件（PowerShell）/ To check the download:',
    '',
    fence,
    `Get-FileHash .\\${file} -Algorithm SHA256`,
    fence,
    '',
    '显示的值应与上面的 sha256 一致（大小写不论）。The hash shown must be the sha256 above (letter case aside).',
    '',
    // redesign R6c: what this build has since the redesign (packages R1–R6: 丽芙's template in four themes, the sidebar and the
    // shelf, a library's four tabs, the right panel's tabs of now, one kind of proposal and the main agent's page, 首次打开 as one
    // screen and 新建库 as one page, the new icon, the serif heading font), in the words of the design's 05-措辞规范 — the earlier
    // text was v2 package N's (K2, L, M). Nothing about the version number or a release date, which are not decided. The wording
    // line is redesign R6b's (merged before this build): the five source states are its words, as in wording/glossary.json
    '## 这一版有什么 / What is new in this build',
    '',
    '- **四套主题**：研究对话（默认）、精密国际主义、澄明玻璃、单线黑白，各有浅色与深色；外观可选浅色、深色或跟随系统（默认跟随系统）。此前的主题设置自动换算：v1.0 测试版的河蓝、素灰、夜间分别变为研究对话 + 跟随系统、浅色、深色；已选择的精密国际主义、澄明玻璃、研究对话保持不变，其他设置不受影响。',
    '- **左栏与库架**：左栏依次为新建库、库架、主 Agent 与「我的库」；每个库一行，显示运行中、排队中、来源异常或待看条数；底部显示当前连接的套餐用量或 API 余额（无法读取时不显示）。库架为每个库显示一张卡片：追踪范围、上次运行、待看条数与来源状态。打开应用后直接进入当前库的待看。',
    '- **库页四个标签**：待看、资料库、问库、来源与要求。页面顶部显示该库的追踪范围、下次运行时间与「立即运行」。',
    '- **右栏四个标签**：进度（全部库的运行情况、队列顺序与下次运行时间）、待确认（全部库中需要确认的提议）、详情（随当前页面内容变化）、文件（当前库的笔记、待看与程序记录）。右栏可收起，收起状态与所选标签下次打开时保持。',
    '- **一种提议与主 Agent**：主 Agent 提议与系统检测统一为一种提议，均需确认后才会执行；主 Agent 提议可确认、拒绝或提出修改。主 Agent 页用于管理全部库：创建库、修改来源与追踪要求。',
    '- **首次打开与新建库**：首次打开为一屏，流息自动选用已登录的连接，仅在需要时显示连接选择；输入一句想追踪的内容，由主 Agent 生成建库提议，也可手动创建。新建库为一页表单：库名称、追踪要求、严格程度（宽松、标准、严格）、来源（添加后立即测试抓取）、预设来源包、存储位置与定时，可选择「仅创建」或「创建并运行」。',
    '- **新应用图标与衬线字体**：应用图标更换为新标志。研究对话主题的标题使用衬线字体 Noto Serif SC，与界面字体 Noto Sans SC 一同随安装包提供（均为 SIL Open Font License 1.1，全文见「设置 → 许可证与致谢」与安装目录的 `THIRD-PARTY-NOTICES.txt`）。',
    '- **界面文字统一**：中文界面按统一的措辞规范改写；来源的五种状态为正常、无更新、地址无效、暂时失败、访问被拒，各附处理建议。英文界面已逐条重新校对。',
    '',
    '- **Four themes**: Research (the default), Precision, Clear Glass and Monoline, each light and dark; the appearance is Light, Dark or Follow system (the default). Earlier theme settings carry over: the v1.0 test version\'s River, Paper and Night become Research with Follow system, Light and Dark; Precision, Clear Glass and Research stay as chosen, and no other setting changes.',
    '- **Sidebar and Shelf**: the sidebar lists New library, Shelf, Main agent and My libraries — one row per library with its state (running, queued, source issues, or the number of items to review) — and, at the foot, the current connection\'s plan usage or API balance (hidden when it cannot be read). The Shelf shows one card per library: what it tracks, its last run, items to review and the state of its sources. The app opens on the current library\'s Inbox.',
    '- **Four tabs on a library\'s page**: Inbox, Library, Ask, Sources & Brief. The header shows what the library tracks, its next run and Run now.',
    '- **A right panel with four tabs**: Progress (runs, queue order and next scheduled runs of all libraries), To confirm (proposals of all libraries that need your confirmation), Details (follows the current page) and Files (the current library\'s notes, inbox and program records). The panel folds away, and stays folded or on its tab next time.',
    '- **One kind of proposal, and the main agent**: proposals by the main agent and items detected by Streams are one kind of proposal, and nothing is applied until you confirm it; a proposal by the main agent can be confirmed, declined or sent back with a change request. The Main agent page manages all libraries: creating one, changing its sources and its brief.',
    '- **First run and New library**: the first run is one screen — Streams picks a signed-in connection by itself and shows the connection choice only when needed; say in one sentence what to track and the main agent drafts a proposal for the library, or set it up manually. New library is one form: name, brief, strictness (loose, standard, strict), sources (fetched once as a test when added), a starter pack, location and schedule, with Create only or Create and run.',
    '- **A new app icon and a serif font**: the app has a new icon. Headings of the Research theme use the serif font Noto Serif SC, which ships with the installer beside the interface font Noto Sans SC (both SIL Open Font License 1.1, in full under Settings → Licenses and credits and in `THIRD-PARTY-NOTICES.txt`).',
    '- **Consistent wording**: the Chinese interface follows one wording guide throughout; a source is OK, No updates, Invalid address, Temporary failure or Access denied, each with what to do next. The English interface has been reviewed line by line.',
    '',
    '## 这一版没有代码签名 / This version is not code-signed',
    '',
    '安装包和 Streams.exe 都**未签名**。第一次打开安装包时，Windows 会弹出蓝色的「Windows 已保护你的电脑」（SmartScreen，「未知发布者」）：',
    '',
    '1. 点「**更多信息**」；',
    '2. 再点「**仍要运行**」。',
    '',
    'The installer and Streams.exe are not code-signed, so Windows SmartScreen shows "Windows protected your PC" (unknown publisher): click "More info", then "Run anyway".',
    '',
    '## 没有在干净机器上验过 / Not verified on a clean machine',
    '',
    'v1.0 未在干净机器上验过：发版前的人工验收是在开发者自己的 Windows 11 家庭版上直接装这个安装包、走完一遍（真连接一并测），没有在全新的 Windows 或虚拟机上装过。自动测试另在只有系统目录的环境里装过、启动过、走过一遍。',
    '',
    'v1.0 has not been verified on a clean machine: the hands-on check before release installed this installer on the developer\'s own Windows 11 Home PC (real connections included), not on a fresh Windows or a virtual machine. The automated tests also install, start and walk through it with only the system folders on the path.',
    '',
    '## 安装与卸载 / Install and uninstall',
    '',
    `- 按用户安装，无需管理员权限：默认装到 ${tick}%LOCALAPPDATA%\\Programs\\${RELEASE.install_folder}${tick}；开始菜单与桌面有「${RELEASE.app_name}」。安装本身不联网。`,
    // v2 package J2: the app data of v2 also holds the library register (libraries.json) and the main agent's conversation
    `- 卸载：「设置 → 应用 → 已安装的应用」里找「${RELEASE.app_ver_name}」→ 卸载。最后会询问是否同时删除应用数据（API key、设置、库的登记、主 Agent 的对话记录、日志和缓存），默认「否」；选择「是」会删除这些应用数据，选择「否」将全部保留；两种选择下你的库（Markdown 文件夹）都不会被删除。`,
    '- 已安装 v1.0 测试版：直接运行本安装包，无需先卸载；首次打开时，v1.0 使用的库会登记到库架，其定时移入该库自己的设置（v1.0 的设置文件只读取、不修改）。',
    '- 之后的版本可在应用内「设置 → 关于 → 检查更新」直接更新，无需先卸载。',
    '',
  ].join('\n')
}

function stageManifest() {
  const list = []
  for (const e of walk(STAGE)) {
    if (e.dir || e.link) continue
    list.push({ path: relative(STAGE, e.path).split(sep).join('/'), bytes: e.size, sha256: sha256File(e.path) })
  }
  list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const tree = createHash('sha256')
  for (const f of list) tree.update(`${f.path}\0${f.sha256}\n`)
  return { files: list, tree_sha256: tree.digest('hex') }
}

function compareWithPrevious(previous, current) {
  if (!previous) return null
  const before = new Map(previous.files.map(f => [f.path, f.sha256]))
  const after = new Map(current.files.map(f => [f.path, f.sha256]))
  const changed = []
  for (const [p, h] of after) if (before.has(p) && before.get(p) !== h) changed.push(p)
  return { same_tree: previous.tree_sha256 === current.tree_sha256, changed, added: [...after.keys()].filter(p => !before.has(p)), removed: [...before.keys()].filter(p => !after.has(p)) }
}

// ---------------------------------------------------------------- main

async function main() {
  const started = Date.now()
  if (process.platform !== 'win32') throw new Stop('the Windows installer is built on Windows')
  const head = spawnSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
  const dirty = spawnSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
  say(`Streams ${RELEASE.version} installer, from ${head}${dirty.length ? ` with ${dirty.length} uncommitted change(s)` : ''}${APP_REF ? `; the app (desktop/src, core/src) of commit ${APP_REF}` : ''}`)

  say('1. Electron')
  run('setup_electron.mjs verify', process.execPath, [join(INSTALLER, 'electron', 'setup_electron.mjs'), 'verify'])
  say('  ok  Electron matches installer/electron/manifest.json')

  say('2. Inno Setup')
  const inno = await ensureInnoSetup()
  say(`  ok  Inno Setup ${inno.version}: ${inno.iscc}`)

  say('3. rcedit')
  const rcedit = ensureRcedit()
  say(`  ok  rcedit ${rcedit.version} (${rcedit.license}): ${rcedit.exe} (sha256 ${rcedit.binary.sha256})`)

  say(`4. the stage: ${STAGE}`)
  const staged = stage()
  say(`  copied: ${JSON.stringify(staged.counts)}`)
  const branded = brandExe(rcedit)
  say(`  ok  ${RELEASE.exe_name}: icon ${ICON_IN_STAGE.join('/')}; ${Object.entries(branded.strings).map(([k, v]) => `${k} "${v}"`).join(', ')}; FileVersion/ProductVersion ${branded.fileVersion}`)

  say('5. THIRD-PARTY-NOTICES.txt')
  const notices = buildNotices({
    // v2 package J2: with STREAMS_INSTALLER_APP_REF, that commit's lock (written beside this build's other output)
    stage: STAGE, lockFile: APP_REF ? appRefLock() : join(REPO, 'desktop', 'package-lock.json'),
    facts: { appName: RELEASE.app_name, version: RELEASE.version, electron: JSON.parse(readFileSync(join(INSTALLER, 'electron', 'manifest.json'), 'utf8')).electron.version },
  })
  writeFileSync(join(STAGE, 'THIRD-PARTY-NOTICES.txt'), notices.text)
  // v2 package N: for an app that bundles the font (v1.0's, an older build's, has none: staged.counts.font 0)
  // redesign R6a: every font file staged has its line and its license text in full (counts.font = the font files and their
  // license texts: two files a font), and none is a file the notices cannot name
  if (notices.fontProblems.length) throw new Stop(`THIRD-PARTY-NOTICES.txt: ${notices.fontProblems.join('; ')}`)
  if (notices.fonts * 2 !== staged.counts.font || notices.fontLicenses.length !== notices.fonts) throw new Stop(`THIRD-PARTY-NOTICES.txt lists ${notices.fonts} font file(s) with ${notices.fontLicenses.length} license text(s); the stage has ${staged.counts.font} font and license files (installer/fonts.mjs)`)
  say(`  ok  ${notices.npm} npm packages, ${notices.fonts} font${notices.fonts === 1 ? '' : 's'} each with its OFL (${notices.fontLicenses.join(', ') || 'none'}); MPL / LGPL with their source:${notices.copyleft.map(c => `${c.id} (${c.license})`).join(', ') || 'none'}`)

  say('6. checks on the stage')
  const facts = checkStage({ ...staged, branded })
  const markers = machineMarkers()
  const scan = scanForLeaks([STAGE], { markers, contentMarkers: contentMarkers(), devFiles: [...staged.devOnly.map(d => `src/renderer/${d}`), 'scripts/start.mjs', 'scripts/run-tests.mjs', 'test/support/app.mjs'] })
  const allowed = scan.hits.filter(h => ALLOWED_HITS.some(a => a.kind === h.kind && a.file === h.file.split(sep).join('/')))
  const hits = scan.hits.filter(h => !allowed.includes(h))
  for (const h of allowed) say(`  allowed ${h.kind}  ${h.file}: ${ALLOWED_HITS.find(a => a.file === h.file.split(sep).join('/')).why}`)
  if (hits.length) {
    for (const h of hits.slice(0, 40)) say(`  HIT ${h.kind}  ${h.file}  @${h.offset}  ${h.shown}`)
    throw new Stop(`the scan found ${hits.length} thing(s) that must not ship`)
  }
  say(`  ok  scan: ${scan.scanned} files, ${mib(scan.bytes)}: no key, no address of ours, nothing of this machine (${markers.profile} · ${markers.host}), no development content; third-party authors' addresses: ${scan.info.thirdPartyPersonalMail}`)

  say('7. the stage\'s file list')
  const previous = existsSync(STAGE_MANIFEST) ? JSON.parse(readFileSync(STAGE_MANIFEST, 'utf8')) : null
  const manifest = stageManifest()
  writeJson(STAGE_MANIFEST, manifest)
  const diff = compareWithPrevious(previous, manifest)
  say(`  tree sha256 ${manifest.tree_sha256}${diff ? (diff.same_tree ? ' (the same as the previous build)' : ` (previous build: ${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed: ${[...diff.changed, ...diff.added, ...diff.removed].slice(0, 10).join(', ')})`) : ''}`)

  // the update's clean-up list, from the stage's top level (installer/install-delete.mjs): what an update over an older copy removes first
  let installDelete
  try { installDelete = installDeleteList(STAGE) } catch (error) { throw new Stop(error.message) }
  writeFileSync(INSTALL_DELETE, installDelete.text)
  say(`  ok  the update removes first (when it installs over this app's older copy): ${installDelete.entries.map(e => (e.dir ? `${e.name}\\` : e.name)).join(' ')}`)

  say('8. ISCC')
  const iss = readFileSync(join(INSTALLER, 'setup', 'streams.iss'), 'utf8')
  const { APP_USER_MODEL_ID, TOAST_ACTIVATOR_CLSID } = await import(pathToFileURL(join(REPO, 'desktop', 'src', 'main', 'app-id.mjs')).href)
  // the toast activator CLSID goes to Inno Setup without its braces (AppUserModelToastActivatorCLSID; the .iss adds them
  // for the registry key)
  const toastClsid = /^\{([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})\}$/.exec(TOAST_ACTIVATOR_CLSID)?.[1]
  if (!toastClsid) throw new Stop(`app-id.mjs: TOAST_ACTIVATOR_CLSID is not a brace-wrapped upper-case GUID: ${TOAST_ACTIVATOR_CLSID}`)
  const defines = {
    StageDir: STAGE, OutputDir: DIST, OutputBaseFilename: RELEASE.output_base_filename, AppVersion: RELEASE.version,
    AppName: RELEASE.app_name, AppVerName: RELEASE.app_ver_name, AppPublisher: RELEASE.publisher, AppGuid: RELEASE.app_guid,
    // the setup program's VersionInfoCopyright: the same line Streams.exe carries (brandExe); Inno Setup writes its "(C)" as ©
    AppCopyright: RELEASE.copyright,
    InstallFolder: RELEASE.install_folder, ExeName: RELEASE.exe_name, AppUserModelId: APP_USER_MODEL_ID, ToastActivatorClsid: toastClsid,
    // the icon: the setup program's own (a file on this machine, compiled in) and, below {app}, the shortcuts' and the uninstall entry's
    SetupIconFile: ICON_STAGED, IconFile: ICON_IN_STAGE.join('\\'),
    // [InstallDelete]: the list above
    InstallDeleteFile: INSTALL_DELETE,
  }
  const output = join(DIST, `${RELEASE.output_base_filename}.exe`)
  if (existsSync(output)) rmSync(output)
  const t0 = Date.now()
  run('ISCC', inno.iscc, ['-Qp', ...Object.entries(defines).map(([k, v]) => `-D${k}=${v}`), '-'], { input: iss, cwd: join(INSTALLER, 'setup') })
  const seconds = Math.round((Date.now() - t0) / 1000)
  const bytes = statSync(output).size
  const sha256 = sha256File(output)
  say(`  ok  ${output}: ${bytes} bytes (${mib(bytes)}), sha256 ${sha256}, compiled in ${seconds} s`)
  // the setup program's own version info is release.json's too (the .iss takes every value from the defines above):
  // publisher, name, the version (Inno Setup's text version is the four-part one), the company's copyright line
  const setupInfo = setupVersionInfo(output)
  const setupWant = {
    CompanyName: RELEASE.publisher, ProductName: RELEASE.app_name, FileDescription: RELEASE.app_ver_name,
    ProductVersion: RELEASE.version, FileVersion: `${RELEASE.version}.0`, LegalCopyright: innoCopyright(RELEASE.copyright),
  }
  const setupWrong = Object.entries(setupWant).filter(([k, v]) => setupInfo[k] !== v).map(([k, v]) => `${k}: "${setupInfo[k]}" (wanted "${v}")`)
  if (setupWrong.length) throw new Stop(`the setup program's version info is not release.json's: ${setupWrong.join('; ')}`)
  say(`  ok  the setup program's version info: ${Object.entries(setupWant).map(([k, v]) => `${k} "${v}"`).join(', ')}`)

  const previousRecord = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : null
  const record = {
    built: new Date().toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
    from: { head, uncommitted: dirty, ...(APP_REF ? { app_ref: APP_REF } : {}) },
    release: RELEASE,
    app_user_model_id: APP_USER_MODEL_ID,
    toast_activator_clsid: TOAST_ACTIVATOR_CLSID,
    inputs: {
      electron: facts.exe.electron,
      inno_setup: inno.version,
      rcedit: { version: rcedit.version, license: rcedit.license, binary: rcedit.binary },
    },
    streams_exe: facts.exe,
    app_icon: { file: ICON_IN_STAGE.join('/'), sha256: facts.exe.icon.sha256, setup_icon: true, shortcuts_and_uninstall_entry: true },
    stage: { files: facts.files, bytes: facts.bytes, tree_sha256: manifest.tree_sha256, longest_relative_path: facts.longest_relative_path, copied: staged.counts, electron_files: facts.electron_files },
    // what an update over an older copy removes first ([InstallDelete], from the stage's top level; a folder ends in /)
    install_delete: installDelete.entries.map(e => (e.dir ? `${e.name}/` : e.name)),
    notices: { npm: notices.npm, copyleft: notices.copyleft },
    scan: { files: scan.scanned, bytes: scan.bytes, hits: hits.length, allowed: allowed.map(h => ({ kind: h.kind, file: h.file.split(sep).join('/') })), third_party_personal_mail: scan.info.thirdPartyPersonalMail, machine: { profile: markers.profile, host: markers.host } },
    installer: { file: relative(REPO, output).split(sep).join('/'), bytes, sha256, compile_seconds: seconds, version_info: setupInfo },
    // the one copyright line of both version infos (release.json), as each program carries it
    copyright: { source: 'installer/setup/release.json', line: RELEASE.copyright, streams_exe: facts.exe.version_info.LegalCopyright, setup: setupInfo.LegalCopyright },
    previous: previousRecord ? { sha256: previousRecord.installer?.sha256, same_installer: previousRecord.installer?.sha256 === sha256, same_stage: previousRecord.stage?.tree_sha256 === manifest.tree_sha256, stage_diff: diff } : null,
  }
  // the release notes, with the installer's own name, size and SHA-256 (tests/acceptance/v01-clean-install.test.mjs reads them)
  const notesFile = join(DIST, `release-notes-${RELEASE.version}.md`)
  writeFileSync(notesFile, releaseNotes({ file: `${RELEASE.output_base_filename}.exe`, bytes, sha256, electron: facts.exe.electron.version }))
  if (!readFileSync(notesFile, 'utf8').includes(sha256)) throw new Stop(`${notesFile} does not carry the installer's sha256`)
  record.release_notes = { file: relative(REPO, notesFile).split(sep).join('/'), sha256: sha256File(notesFile) }
  writeJson(RECORD, record)
  say(`  ok  release notes: ${relative(REPO, notesFile)} (the installer's name, size, sha256; not signed, the two SmartScreen clicks)`)
  say(`\n${RELEASE.app_ver_name}: ${relative(REPO, output)}`)
  say(`  ${bytes} bytes (${mib(bytes)})  sha256 ${sha256}`)
  if (record.previous) say(`  previous build: ${record.previous.same_installer ? 'byte-identical' : `different (stage ${record.previous.same_stage ? 'identical' : 'different'})`}`)
  say(`  record: ${relative(REPO, RECORD)}  (${record.seconds} s)`)
}

main().catch(error => {
  if (!(error instanceof Stop)) throw error
  say(`\nSTOP: ${error.message}`)
  process.exitCode = 1
})
