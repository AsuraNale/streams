// The real installer on this machine (docs/installer.md §五). Run after a build:
//
//   node --test --test-concurrency=1 "installer/test/*.test.mjs"
//
// One run, in order:
//   0. guards: no install of Streams on this machine — its uninstall entry, its Start-menu or desktop shortcut, its toast
//      activator key: the test stops rather than touch one; a picture of the real %APPDATA%\Streams and
//      %LOCALAPPDATA%\Streams (names, sizes, times: nothing read inside)
//   1. silent install into a temporary folder (/VERYSILENT /DIR=…): the HKCU uninstall entry (name, version, publisher,
//      location, icon), the Start-menu and desktop shortcuts (target, working folder, icon, the app's AppUserModelID and
//      toast activator CLSID, read the way Electron reads them), the toast activator key, Streams.exe's icon and version
//      info, the setup program's version info; every installed file byte for byte the build's stage, no link, no Electron
//      default app, no component gallery, the license files there
//   2. the scan (installer/scan.mjs) on the install folder and on the installer file finds nothing; its controls find
//      what is planted
//   3. use case A in the installed app, started by installer/test/harness.mjs (no development switch: every STREAMS_* is
//      set to a trap and must stay untaken): packaged, version 1.0.0, no menu, no developer tools. v2 package J2: v2's way
//      (docs/desktop.md §4.10) — 首次打开 (no library registered): 连接方式, nothing to connect, skipped (settings.json
//      setupConnection) → 和主 Agent 聊 with its guide (the examples, 「还没有连接」, 「也可以手动新建」) → 新建库's four steps:
//      the folder (the dialog answered with the test's empty folder; registered and current), the blank pack with one RSS
//      feed on this machine, the trial round (no connection: nothing scored, every item to 待看), 定时 → 完成 (the schedule in
//      the library's own streams.json; settings.json's v1.0 fields not written; streams.json's setup records the six steps,
//      the connection's copied from setupConnection; getLicenses gives the MIT text of the repository's LICENSE, the parts
//      with @mozilla/readability, and the notices there); in 待看 the key C keeps the current card → a note file in the
//      library's notes/ that the core's own check passes; then the sidebar of plan B (库架 · 和主 Agent 聊 and the library's
//      row) and 库架 with the library's card; 资料库 → 「打开原文」 on the kept note → the reading window, isolated (its two web
//      contents' parameters, its own in-memory session, no bridge), in 阅读模式 with the item's article from the feed on this
//      machine and none of the page's script, then 回到条目 closes it; the only address the app asked for is the feed on this
//      machine (the harness's record of every request; the proxy trap empty)
//   4. quitting, with no debugger attached: nothing of the install left running
//   4b. v2 package J2: the reverse of world.mjs's Documents folder — started again with the test user's Documents removed,
//      the installed app still comes up (getPath('documents') fails, as the control shows); a new library's default place
//      is <home>Streams and main.log says why; quitting ends it
//   5. silent uninstall (the default: the app's data kept): program folder, shortcuts, uninstall entry, toast activator
//      key gone; the app's data and the library stay; the real %APPDATA%\Streams and %LOCALAPPDATA%\Streams as before
// `after`, whatever happened: the install's processes ended, the uninstaller run if this run's install is still there,
// the temporary folder removed (links first). The result goes to installer/dist/packaged-test-result.json.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchInstalled, readRecord, requestQuit } from './harness.mjs'
import {
  VT_CLSID, VT_LPWSTR, asElectronReadsIt, endProcesses, entriesNamed, filesOf, iconFileOf, installedHere, picture, processesUnder,
  realInstallTraces, same, sha256File, shortcut, sleep, toastKey, uninstallEntry,
} from './machine.mjs'
import { FEED_ITEMS, SCRIPT_RAN, appEnv, articleLine, startFeed, startTrap, trapsUntouched } from './world.mjs'
import { machineMarkers, scanForLeaks } from '../scan.mjs'
import { groupMatchesIco, iconGroups, innoCopyright, setupVersionInfo, versionInfo } from '../exe-resources.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { FIRST_RUN } = await imp('desktop/src/renderer/texts/first-run.js')
// v2 package J2: the guide of 和主 Agent 聊 (首次打开's second step) and the reading window's own session
const { AGENT } = await imp('desktop/src/renderer/texts/agent.js')
const { READER_PARTITION } = await imp('desktop/src/main/reader.mjs')
const { APP_USER_MODEL_ID, TOAST_ACTIVATOR_CLSID } = await imp('desktop/src/main/app-id.mjs')
const { ICON_FILE } = await imp('desktop/src/main/icon.mjs')
const { parseIco } = await imp('desktop/scripts/lib/icon.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { tempDir } = await imp('desktop/scripts/lib/temp.mjs')
const core = await imp('core/src/index.mjs')

const DIST = join(REPO, 'installer', 'dist')
const RECORD = JSON.parse(readFileSync(join(DIST, 'build-record.json'), 'utf8'))
const SETUP = join(REPO, RECORD.installer.file)
const STAGE_MANIFEST = JSON.parse(readFileSync(join(DIST, 'stage-manifest.json'), 'utf8'))
const RELEASE = RECORD.release
const RELEASE_FILE = JSON.parse(readFileSync(join(REPO, 'installer', 'setup', 'release.json'), 'utf8'))
const RSS_NAME = 'local-feed'
const POLL = { polling: 200, timeout: 120_000 }
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const STARTED = Date.now()
const ROOT = tempDir('st-installer-')
const W = {
  install: join(ROOT, 'install'),
  profile: join(ROOT, 'profile'),
  tmp: join(ROOT, 'tmp'),
  traps: join(ROOT, 'traps'),
  library: join(ROOT, '我的库'),
}
W.roaming = join(W.profile, 'AppData', 'Roaming')
W.local = join(W.profile, 'AppData', 'Local')
W.appData = join(W.roaming, RELEASE.install_folder)
W.exe = join(W.install, RELEASE.exe_name)
for (const d of [W.profile, W.tmp, W.traps, W.library]) mkdirSync(d, { recursive: true })

const real = {
  appData: join(process.env.APPDATA, RELEASE.install_folder),
  localAppData: join(process.env.LOCALAPPDATA, RELEASE.install_folder),
}
const S = { pictures: {}, result: {} }
const traceArgs = { guid: RELEASE.app_guid, appName: RELEASE.app_name, clsid: TOAST_ACTIVATOR_CLSID }
const hook = n => ({ appData: W.roaming, localAppData: W.local, recordFile: join(ROOT, `record-${n}.jsonl`), pickFolder: W.library, quitFile: join(ROOT, `quit-${n}`) })

before(async () => {
  assert.equal(process.platform, 'win32', 'the installer is Windows-only')
  assert.ok(existsSync(SETUP), `no installer at ${SETUP}: run node installer/build-installer.mjs`)
  assert.equal(sha256File(SETUP), RECORD.installer.sha256, 'the installer is the one the build recorded')
  assert.equal(RELEASE.version, RELEASE_FILE.version, 'the build is of release.json\'s version')
  // the guard: an install of Streams on this machine (its uninstall entry, a shortcut, its toast activator key) is never touched
  S.traces = realInstallTraces(traceArgs)
  const found = installedHere(S.traces)
  assert.deepEqual(found, [], `Streams looks installed on this machine (${found.join(', ')}): this test installs and uninstalls, so it does not run here`)
  S.startMenu = S.traces.startMenuPath
  S.desktop = S.traces.desktopPath
  S.pictures.before = { appData: picture(real.appData), localAppData: picture(real.localAppData) }
  S.feed = await startFeed()
  S.trap = await startTrap()
})

after(async () => {
  // whatever happened: no process of the install, the uninstaller run if this run's install is still there, then the folder
  const left = existsSync(W.install) ? processesUnder(W.install) : []
  if (left.length) { process.stderr.write(`after: ending ${left.length} process(es) of the install\n`); endProcesses(left) }
  const entry = uninstallEntry(RELEASE.app_guid)
  if (entry && same(entry.InstallLocation, W.install) && existsSync(join(W.install, 'unins000.exe'))) {
    process.stderr.write('after: uninstalling this run\'s install\n')
    spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true })
    for (let i = 0; i < 120 && uninstallEntry(RELEASE.app_guid); i += 1) await sleep(500)
  }
  // the uninstaller's own copy in TEMP, when it outlived the uninstall
  for (const n of readdirSync(tmpdir()).filter(n => /^is-.*-uninstall\.tmp$/i.test(n) && statSync(join(tmpdir(), n)).mtimeMs >= STARTED)) {
    try { removeTree(join(tmpdir(), n), { waitMs: 10_000 }) } catch { /* still in use: left */ }
  }
  await S.feed?.close()
  await S.trap?.close()
  await sleep(500)
  removeTree(ROOT, { waitMs: 30_000 })
})

// ---------------------------------------------------------------- 1. install

test('1 · silent install into a temporary folder: uninstall entry, both shortcuts as Electron reads them, the toast activator key, the icon and version info, every file the stage\'s', async () => {
  const t0 = Date.now()
  const r = spawnSync(SETUP, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`, `/LOG=${join(ROOT, 'install.log')}`], { windowsHide: true, timeout: 600_000 })
  S.result.installSeconds = Math.round((Date.now() - t0) / 100) / 10
  assert.equal(r.status, 0, `setup exit code ${r.status}`)
  assert.ok(existsSync(W.exe))

  const entry = uninstallEntry(RELEASE.app_guid)
  assert.ok(entry, 'the uninstall entry is there (HKCU: a per-user install)')
  assert.equal(entry.DisplayName, RELEASE.app_ver_name)
  assert.equal(entry.DisplayVersion, RELEASE.version)
  assert.equal(entry.Publisher, RELEASE.publisher)
  assert.ok(same(entry.InstallLocation, W.install), entry.InstallLocation)
  assert.match(entry.UninstallString, /unins000\.exe/i)
  assert.deepEqual(entriesNamed(/^流息/).map(e => e.key), [`{${RELEASE.app_guid}}_is1`], 'one uninstall entry named 流息')
  const ico = join(W.install, 'resources', 'app', ...ICON_FILE)
  assert.ok(existsSync(ico), ico)
  assert.ok(same(iconFileOf(entry.DisplayIcon), ico), `the uninstall entry's icon: ${entry.DisplayIcon}`)
  S.result.entry = entry

  S.shortcuts = {}
  for (const lnk of [S.startMenu, S.desktop]) {
    const s = shortcut(lnk)
    assert.ok(s, `${lnk} is there`)
    assert.ok(same(s.target, W.exe), `${lnk} → ${s.target}`)
    assert.ok(same(s.workdir, W.install), `${lnk} working folder ${s.workdir}`)
    assert.ok(same(iconFileOf(s.icon), ico), `${lnk} icon: ${s.icon}`)
    assert.equal(s.aumid, APP_USER_MODEL_ID, `${lnk} carries the app's AppUserModelID`)
    assert.equal(s.clsid, TOAST_ACTIVATOR_CLSID, `${lnk} carries the app's toast activator CLSID`)
    // what Electron 44 checks before it would rewrite the Start-menu shortcut at the app's first notification
    const e = asElectronReadsIt(lnk, ROOT)
    assert.deepEqual({ aumidType: e.aumidType, clsidType: e.clsidType }, { aumidType: VT_LPWSTR, clsidType: VT_CLSID }, `${lnk}: the property types Electron accepts`)
    assert.equal(e.aumid, APP_USER_MODEL_ID)
    assert.equal(e.clsid, TOAST_ACTIVATOR_CLSID)
    assert.equal(e.target.toLowerCase(), W.exe.toLowerCase(), `${lnk} target, as Electron compares it`)
    assert.equal(e.workdir.toLowerCase(), W.install.toLowerCase(), `${lnk} working folder, as Electron compares it`)
    S.shortcuts[lnk === S.startMenu ? 'startMenu' : 'desktop'] = { path: lnk, ...s, asElectronReadsIt: e }
  }
  S.result.shortcuts = S.shortcuts
  const key = toastKey(TOAST_ACTIVATOR_CLSID)
  assert.ok(key, `the toast activator key ${TOAST_ACTIVATOR_CLSID} is there`)
  assert.equal(key.name, 'Electron Notification Activator')
  assert.equal(key.customActivator, 1)
  assert.ok(key.localServer && same(key.localServer, W.exe), `LocalServer32 → ${key.localServer}`)
  S.result.toastKey = key

  // Streams.exe: the icon group is the installed .ico's images; the version info is release.json's and the build's record
  const groups = iconGroups(W.exe)
  assert.equal(groups.length, 1, `${RELEASE.exe_name} has one icon group`)
  assert.deepEqual(groupMatchesIco(groups[0], parseIco(readFileSync(ico))), { ok: true, matched: 5, missing: [], extra: 0 }, `${RELEASE.exe_name}'s icon is the installed .ico`)
  const info = versionInfo(W.exe)
  assert.equal(info.CompanyName, RELEASE.publisher)
  assert.equal(info.ProductName, RELEASE.app_name)
  assert.equal(info.FileDescription, RELEASE.app_name)
  assert.equal(info.FileVersion, RELEASE.version)
  assert.equal(info.ProductVersion, RELEASE.version)
  assert.equal(info.OriginalFilename, RELEASE.exe_name)
  assert.equal(info.LegalCopyright, RELEASE.copyright)
  assert.deepEqual(info, RECORD.streams_exe.version_info, 'the version info the build recorded')
  const setup = setupVersionInfo(SETUP)
  assert.equal(setup.CompanyName, RELEASE.publisher)
  assert.equal(setup.ProductName, RELEASE.app_name)
  assert.equal(setup.FileDescription, RELEASE.app_ver_name)
  assert.equal(setup.ProductVersion, RELEASE.version)
  assert.equal(setup.FileVersion, `${RELEASE.version}.0`)
  assert.equal(setup.LegalCopyright, innoCopyright(RELEASE.copyright))
  assert.deepEqual(setup, RECORD.installer.version_info, 'the setup program\'s version info the build recorded')
  S.result.versionInfo = { streamsExe: info, setup }

  // the install folder is the stage, file for file, byte for byte (plus the uninstaller's two files)
  const { files: installed, links } = filesOf(W.install)
  assert.deepEqual(links, [], 'no link in the install folder')
  const staged = new Set(STAGE_MANIFEST.files.map(f => f.path))
  const extra = [...installed.keys()].filter(p => !staged.has(p))
  assert.deepEqual(extra.sort(), ['unins000.dat', 'unins000.exe'], 'nothing but the stage and the uninstaller')
  for (const f of STAGE_MANIFEST.files) {
    const p = installed.get(f.path)
    assert.ok(p, `${f.path} is installed`)
    assert.equal(statSync(p).size, f.bytes, f.path)
    assert.equal(sha256File(p), f.sha256, f.path)
  }
  S.result.installedFiles = STAGE_MANIFEST.files.length
  assert.ok(existsSync(join(W.install, 'resources', 'core', 'src', 'index.mjs')), 'the core is installed')
  assert.equal(existsSync(join(W.install, 'resources', 'default_app.asar')), false, 'no Electron default app')
  assert.equal(existsSync(join(W.install, 'resources', 'app', 'src', 'renderer', 'screens', 'kit.js')), false, 'no component gallery')
  for (const f of ['LICENSE', 'LICENSES.chromium.html', 'THIRD-PARTY-NOTICES.txt', 'resources/app/LICENSE']) assert.ok(installed.has(f), `${f} is installed`)
  assert.equal(readFileSync(join(W.install, 'resources', 'app', 'LICENSE'), 'utf8'), readFileSync(join(REPO, 'LICENSE'), 'utf8'), 'Streams\' own license')
})

// ---------------------------------------------------------------- 2. scan

test('2 · no key, no address of ours, nothing of this machine in the install folder or the installer; the scan finds what is planted', () => {
  const PLANTED_EMAIL = 'planted.check@example.invalid'
  const markers = machineMarkers({ emails: [PLANTED_EMAIL] })
  const contentMarkers = ['streams-desktop-dev', 'Streams-trial']
  // the uninstall log is written on this machine at install time and names where it installed (a folder under this user's
  // TEMP): not something the installer carried, so only its machine hits are expected there
  const installTime = h => h.file === 'unins000.dat' && h.kind === 'machine'
  const installedScan = scanForLeaks([W.install], { markers, contentMarkers, devFiles: ['src/renderer/screens/kit.js', 'src/renderer/texts/kit.js', 'src/renderer/styles/screens/kit.css'] })
  assert.deepEqual(installedScan.hits.filter(h => !installTime(h)), [])
  const setupScan = scanForLeaks([SETUP], { markers, contentMarkers })
  assert.deepEqual(setupScan.hits, [])
  S.result.scan = { files: installedScan.scanned, bytes: installedScan.bytes, setupBytes: setupScan.bytes, uninstallLogNamesInstallFolder: installedScan.hits.some(installTime) }
  // controls: the same scan finds a planted key, path, address and content marker, as text and as UTF-16
  const plant = join(W.tmp, 'plant')
  mkdirSync(plant, { recursive: true })
  writeFileSync(join(plant, 'a.txt'), `key sk-streams-packaged-test-key-0000000000aa\nC:\\Users\\${markers.profile}\\x\n${PLANTED_EMAIL}\n`)
  writeFileSync(join(plant, 'b.bin'), Buffer.from(`Streams-trial ${markers.host}`, 'utf16le'))
  const control = scanForLeaks([plant], { markers, contentMarkers })
  assert.deepEqual([...new Set(control.hits.map(h => h.kind))].sort(), ['content', 'email', 'key', 'machine'])
})

// ---------------------------------------------------------------- 3. use case A

let A = null
const page = () => A.page
const until = (fn, arg, o = {}) => page().waitForFunction(fn, arg, { ...POLL, ...o })
const click = sel => page().click(`${sel} button`)
// v2 package J2: 首次打开 and 新建库 are two screens (first-run, new-library), each with its own .fr-body[data-step]
const stepIs = (id, screen = 'new-library') => until(([s, i]) => document.querySelector(`main[data-screen="${s}"][data-state="ready"] .fr-body`)?.dataset.step === i, [screen, id])
const sidebarSteps = () => page().evaluate(() => [...document.querySelectorAll('.st-sidebar [data-step]')].map(e => [e.dataset.step, e.dataset.stepState]))
const registryFile = () => join(W.appData, 'libraries.json')
const registryOnDisk = () => (existsSync(registryFile()) ? JSON.parse(readFileSync(registryFile(), 'utf8')) : null)
// (v2 writes settings.json only when it has something to keep: before 首次打开's first step is walked there is none)
const settingsOnDisk = () => (existsSync(join(W.appData, 'settings.json')) ? JSON.parse(readFileSync(join(W.appData, 'settings.json'), 'utf8')) : {})
const G = AGENT.guide
// v2 package J2: the reading window as the main process holds it (desktop/src/main/reader.mjs: a BrowserWindow on the reader's
// partition — its own web contents is the bar — with one WebContentsView, the page)
const READER_WINDOW = `require('electron').BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === require('electron').session.fromPartition(${JSON.stringify(READER_PARTITION)}))`

test('3 · use case A in the installed app, no development switch (v2: 首次打开 → 和主 Agent 聊 → 也可以手动新建 → 新建库): no connection, a feed on this machine, the round to 待看, C keeps one → a note in notes/; 库架 and the sidebar of plan B; the reading window, isolated; no request but the feed', async () => {
  const env = appEnv({ profile: W.profile, tmp: W.tmp, trapUrl: S.trap.url, traps: W.traps })
  A = await launchInstalled({ exe: W.exe, env, hook: hook(1), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  await until(() => document.querySelector('main[data-screen="first-run"][data-state="ready"]'))
  // the packaged app, from the install folder; developer tools asked to open do not (the window was made with devTools off)
  const facts = await A.evaluate(`(async () => { const { app, Menu, BrowserWindow } = require('electron'); const w = BrowserWindow.getAllWindows()[0]; w.webContents.openDevTools({ mode: 'detach' }); await new Promise(r => setTimeout(r, 1000)); return { packaged: app.isPackaged, version: app.getVersion(), resources: process.resourcesPath, menu: Menu.getApplicationMenu(), devTools: w.webContents.isDevToolsOpened(), visible: w.isVisible(), appData: app.getPath('appData'), toastActivatorCLSID: app.toastActivatorCLSID } })()`)
  assert.equal(facts.packaged, true)
  assert.equal(facts.version, RELEASE.version)
  assert.ok(same(facts.resources, join(W.install, 'resources')), facts.resources)
  assert.equal(facts.menu, null, 'no menu')
  assert.equal(facts.devTools, false, 'no developer tools in the packaged app')
  assert.equal(facts.visible, false, 'the window was never shown')
  assert.equal(facts.toastActivatorCLSID, TOAST_ACTIVATOR_CLSID)
  S.result.app = facts
  // no development switch taken so far: 首次打开 (not STREAMS_DEV_LIBRARY's library, not STREAMS_START_SCREEN's settings),
  // in Chinese (not STREAMS_DEV_SYSTEM_LANGUAGES' English), the tray icon made (STREAMS_WINDOW=hidden would make none)
  // v2 package J2: 首次打开 shows because no library is registered (the registry the first start made is empty); its first
  // step is 连接方式 and its own sidebar has two steps (v1.0's 首次设置 began with the folder)
  assert.equal(await page().evaluate(() => document.querySelector('main[data-screen="first-run"] .fr-body')?.dataset.step), 'connection')
  assert.deepEqual(await sidebarSteps(), [['connection', 'current'], ['track', 'todo']], '首次打开\'s two steps')
  assert.ok((await page().evaluate(() => document.body.innerText)).includes(FIRST_RUN.title), 'the Chinese words')
  assert.equal((await page().evaluate(() => window.streams.getAppState())).data.libraryCount, 0, 'no library known')
  assert.deepEqual(registryOnDisk()?.libraries ?? [], [], 'the registry has no library (nothing of v1.0 to take over)')
  // v2 package J2: where a new library goes by default (Documents\Streams, packaged) is the test user's Documents, not the
  // real one (world.mjs appEnv makes that folder; 4b starts the app without it)
  const root = (await page().evaluate(() => window.streams.getLibraryRoot())).data
  assert.equal(root.isDefault, true)
  assert.ok(same(root.path, join(W.profile, 'Documents', 'Streams')), `the default place for a new library: ${root.path}`)
  const rec0 = readRecord(hook(1).recordFile)
  assert.ok(rec0.some(r => r.kind === 'hook' && r.notifications === 'stand-in' && r.tray === 'stand-in'))
  assert.equal(rec0.filter(r => r.kind === 'tray-made').length, 1, 'a tray icon was made (through the stand-in): the window is not hidden by a switch')
  assert.deepEqual(rec0.filter(r => r.kind === 'app-user-model-id').map(r => r.id), [APP_USER_MODEL_ID])
  assert.deepEqual(rec0.filter(r => r.kind === 'toast-activator-clsid').map(r => r.id), [TOAST_ACTIVATOR_CLSID])

  // 首次打开 step 1, 连接方式: nothing to connect on this machine (no tool on PATH, no key; STREAMS_DEV_CONNECTION=fake would
  // make the two tools usable): skipped
  // (the main process's detection, waited for until it has answered for both tools: a card shows 「没找到」 also before)
  await until(() => window.streams.getConnections().then(r => ['claude-code', 'codex'].every(k => typeof r?.data?.kinds?.[k]?.installed === 'boolean')))
  const conns = (await page().evaluate(() => window.streams.getConnections())).data.kinds
  assert.deepEqual(Object.fromEntries(['claude-code', 'codex', 'api'].map(k => [k, k === 'api' ? conns[k].hasKey : conns[k].installed])), { 'claude-code': false, codex: false, api: false }, `nothing to connect on this machine: ${JSON.stringify(conns)}`)
  await until(() => document.querySelectorAll('[data-connection]').length === 3)
  const cards = await page().evaluate(() => [...document.querySelectorAll('[data-connection]')].map(c => [c.dataset.connection, c.dataset.connState]))
  assert.deepEqual(cards.map(c => c[0]), ['claude-code', 'codex', 'api'])
  assert.ok(cards.every(([, state]) => state !== 'usable'), `no connection usable: ${JSON.stringify(cards)}`)
  S.result.connectionCards = cards
  assert.equal(settingsOnDisk().setupConnection ?? null, null, 'control: nothing recorded before the step is walked through')
  await click('[data-action="skip"]')
  await until(() => document.querySelector('main[data-screen="chat"][data-state="ready"]'))
  // with no library yet, who decided the connection goes to settings.json (setupConnection)
  const setupConnection = settingsOnDisk().setupConnection
  assert.equal(setupConnection?.by, 'skipped', JSON.stringify(setupConnection))
  assert.equal(Object.hasOwn(setupConnection, 'detail'), false)
  assert.deepEqual(registryOnDisk()?.libraries ?? [], [], 'still no library')

  // 首次打开 step 2, 和主 Agent 聊 with its guide: the text, three examples, 「还没有连接」 (the connection was skipped),
  // 「也可以手动新建」 → 新建库
  await until(() => document.querySelector('[data-part="first-guide"]') !== null)
  assert.equal(await page().evaluate(() => document.querySelector('[data-part="first-guide"] .chat-guide__text')?.textContent), G.text)
  assert.deepEqual(await page().evaluate(() => [...document.querySelectorAll('[data-part="first-guide"] [data-action="example"]')].map(e => e.textContent.trim())), [...G.examples])
  assert.equal(await page().evaluate(() => document.querySelector('[data-part="guide-no-connection"] .st-t-wait')?.textContent), G.noConnection)
  assert.equal(await page().evaluate(() => document.querySelector('[data-action="manual-new"]')?.textContent.trim()), G.manual)
  await click('[data-action="manual-new"]')
  await stepIs('folder')
  assert.deepEqual(await sidebarSteps(), [['folder', 'current'], ['pack', 'todo'], ['trial', 'todo'], ['schedule', 'todo']], '新建库: v1.0\'s steps without the connection')

  // 新建库 1: the folder from the dialog (the harness answers with the test's empty folder): made, registered and current
  await click('[data-action="choose-folder"]')
  await until(() => document.querySelector('[data-folder-path]') !== null)
  assert.ok(same(await page().evaluate(() => document.querySelector('[data-folder-path]').dataset.folderPath), W.library), 'the dialog\'s folder (not STREAMS_DEV_CHOOSE_FOLDER)')
  assert.equal(await page().evaluate(() => document.querySelector('.fr-folder').dataset.folderState), 'empty')
  assert.equal(existsSync(join(W.library, 'streams.json')), false, 'control: nothing made before 下一步')
  await click('[data-action="next"]')
  await stepIs('pack')
  assert.ok(existsSync(join(W.library, 'streams.json')), 'the library was made in the folder')
  const reg = registryOnDisk()
  assert.deepEqual(reg.libraries.map(l => resolve(l.path).toLowerCase()), [resolve(W.library).toLowerCase()], 'registered')
  assert.equal(reg.active, reg.libraries[0].id, 'and current')

  // 新建库 2: blank, one RSS on this machine
  await page().click('[data-pack="blank"]')
  await until(() => document.querySelector('[data-part="pack-detail"]') !== null)
  await page().fill('[data-field="rss-name"]', RSS_NAME)
  await page().fill('[data-field="rss-url"]', S.feed.feed)
  await click('[data-action="add-rss"]')
  await until(name => document.querySelector(`[data-part="pack-detail"] [data-source="${name}"]`) !== null, RSS_NAME)
  await click('[data-action="apply"]')
  await until(() => document.querySelector('[data-part="tried"]') !== null)
  assert.deepEqual(await page().evaluate(() => [...document.querySelectorAll('[data-part="tried"] [data-source]')].map(e => [e.dataset.source, e.dataset.fetchState])), [[RSS_NAME, 'ok']])
  const config = JSON.parse(readFileSync(join(W.library, 'streams.json'), 'utf8'))
  assert.deepEqual(config.sources.map(s => [s.name, s.kind, s.url]), [[RSS_NAME, 'rss', S.feed.feed]])
  await click('[data-action="continue"]')
  await stepIs('trial')

  // 新建库 3: the trial round with no connection: nothing scored, every item to 待看
  assert.ok(await page().evaluate(() => document.querySelector('[data-no-connection]') !== null), 'the page says there is no connection')
  await click('[data-action="start"]')
  await until(() => document.querySelector('[data-part="round-progress"]')?.dataset.done === 'true')
  const inbox = core.listInbox(W.library)
  assert.equal(inbox.length, FEED_ITEMS.length, `every item of the feed in 待看: ${inbox.map(i => i.title).join(' | ')}`)
  S.result.inbox = inbox.map(i => ({ title: i.title, url: i.url }))
  await click('[data-action="next"]')
  await stepIs('schedule')

  // 新建库 4: 定时 → 完成，去待看. v2 package A: the schedule is the library's own (its streams.json); settings.json's v1.0 fields
  // (libraryPath, recentLibraries, schedule) are only read, never written — settings.json is written whole with its defaults
  // (settings.mjs: libraryPath null, recentLibraries [], the default schedule), so the new library is in none of them
  await click('[data-action="go-inbox"]')
  await until(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]'))
  assert.deepEqual(JSON.parse(readFileSync(join(W.library, 'streams.json'), 'utf8')).schedule, { enabled: true, time: '08:30' }, '定时 → 完成 turned the library\'s schedule on')
  const settings = settingsOnDisk()
  assert.deepEqual({ libraryPath: settings.libraryPath ?? null, recentLibraries: settings.recentLibraries ?? [] }, { libraryPath: null, recentLibraries: [] }, `settings.json's v1.0 library fields not written: ${JSON.stringify(settings)}`)
  // who decided each step, in the library's streams.json (plan A1): the folder chosen, the connection skipped (copied from
  // settings.json's setupConnection, its time kept), the blank pack with one RSS added (sources written), the round run, the
  // schedule taken as shown
  const setup = core.readSetup(W.library)
  assert.deepEqual(Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, [v.by, v.detail ?? null]])), {
    library: ['chose', 'empty'], connection: ['skipped', null], pack: ['chose', 'blank'], sources: ['wrote', { removed: 0, added: 1 }],
    trial: ['chose', null], schedule: ['default', { enabled: true, time: '08:30' }],
  })
  assert.equal(setup.connection.at, setupConnection.at, 'the connection\'s record is 首次打开\'s, its time kept')
  S.result.setup = setup
  // 许可证与致谢 in the installed app (S14): Streams' MIT license word for word the repository's (the build put it in
  // resources\app), the parts with the runtime's versions and, for the npm packages, the versions of the package.json files
  // installed in resources\app\node_modules (v2 package J2: @mozilla/readability added — the reading mode's extraction, v2
  // package H), and the full notices there to open (THIRD-PARTY-NOTICES.txt beside Streams.exe, which lists readability too).
  // Nothing is opened: only asked whether it can be.
  const licenses = (await page().evaluate(() => window.streams.getLicenses())).data
  assert.equal(licenses.own.license, 'MIT')
  assert.equal(licenses.own.text, readFileSync(join(REPO, 'LICENSE'), 'utf8'), 'the license text is the repository\'s LICENSE')
  assert.deepEqual(licenses.notices, { available: true }, 'the install has THIRD-PARTY-NOTICES.txt')
  const runtime = await A.evaluate('(() => process.versions)()')
  const installedVersion = name => JSON.parse(readFileSync(join(W.install, 'resources', 'app', 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).version
  assert.deepEqual(licenses.components.map(c => [c.name, c.version]), [
    ['Electron', runtime.electron], ['Chromium', runtime.chrome], ['Node.js', runtime.node],
    ['Preact', installedVersion('preact')], ['htm', installedVersion('htm')], ['@mozilla/readability', installedVersion('@mozilla/readability')],
    // v2 package K2: the bundled UI font, its version read from the installed font file
    ['Noto Sans SC', '2.04'],
  ])
  assert.ok(readFileSync(join(W.install, 'THIRD-PARTY-NOTICES.txt'), 'utf8').includes(`@mozilla/readability@${installedVersion('@mozilla/readability')}`), 'the notices list @mozilla/readability')
  // v2 package K2: the font and its license installed, and the license in full in the notices
  const ofl = readFileSync(join(W.install, 'resources', 'app', 'src', 'renderer', 'fonts', 'OFL-NotoSansSC.txt'), 'utf8')
  assert.ok(readFileSync(join(W.install, 'THIRD-PARTY-NOTICES.txt'), 'utf8').includes(ofl.replace(/\r\n/g, '\n').trim()), 'the notices carry the font\'s OFL in full')
  assert.equal(licenses.font.license, 'OFL-1.1')
  S.result.licenses = { own: licenses.own.license, components: licenses.components, notices: licenses.notices }

  // 待看: C keeps the current card
  const notesDir = join(W.library, 'notes')
  const before = existsSync(notesDir) ? readdirSync(notesDir) : []
  assert.deepEqual(before, [], 'control: no note yet')
  const current = await page().evaluate(() => document.querySelector('article[data-card][data-current="true"]')?.dataset.url ?? null)
  assert.ok(current, 'a current card')
  await page().keyboard.press('c')
  await until(url => !document.querySelector(`article[data-card][data-url="${url}"]`), current)
  const notes = readdirSync(notesDir).filter(n => n.endsWith('.md'))
  assert.equal(notes.length, 1, `one note: ${notes.join(', ')}`)
  const text = readFileSync(join(notesDir, notes[0]), 'utf8')
  const checked = core.validateNote({ fileName: notes[0], text, config: JSON.parse(readFileSync(join(W.library, 'streams.json'), 'utf8')) })
  assert.deepEqual(checked.problems, [], 'the note passes the core\'s own check')
  assert.equal(checked.ok, true)
  assert.equal(checked.meta.source, current, 'the note is the kept card\'s')
  assert.equal(checked.meta.status, 'kept')
  assert.equal(checked.meta.kept, localDay(), 'kept today (not STREAMS_DEV_NOW\'s day)')
  S.result.note = { path: join(notesDir, notes[0]), file: notes[0], text, problems: checked.problems, warnings: checked.warnings }

  // v2 package J2: the sidebar of plan B (docs/desktop.md §五「侧栏」): 库架 and 和主 Agent 聊 on top, the library's own row
  // below, current; then 库架 with the library's card (its name, current, the two left in 待看)
  const libName = basename(W.library)
  assert.deepEqual(await page().evaluate(() => [...document.querySelectorAll('.st-sidebar [data-nav]')].map(a => a.dataset.nav)), ['shelf', 'chat'], 'plan B: 库架 and 和主 Agent 聊')
  const rows = await page().evaluate(() => [...document.querySelectorAll('[data-library-row]')].map(r => [r.dataset.active, r.querySelector('.st-sidebar__lib-name')?.textContent]))
  assert.deepEqual(rows, [['true', libName]], 'the new library is the one row, current')
  await page().click('.st-sidebar [data-nav="shelf"]')
  await until(() => document.querySelector('main[data-screen="shelf"][data-state="ready"]'))
  await until(n => document.querySelectorAll('[data-shelf-card]').length === 1 && document.querySelector('[data-shelf-card] [data-part="inbox"]')?.dataset.value === String(n), FEED_ITEMS.length - 1)
  const shelf = await page().evaluate(() => [...document.querySelectorAll('[data-shelf-card]')].map(c => ({ id: c.dataset.shelfCard, active: c.dataset.active, name: c.querySelector('[data-part="name"]')?.textContent, inbox: c.querySelector('[data-part="inbox"]')?.dataset.value })))
  assert.deepEqual(shelf, [{ id: reg.active, active: 'true', name: libName, inbox: String(FEED_ITEMS.length - 1) }], '库架: the library, current, two left in 待看')
  S.result.shelf = shelf

  // v2 package J2: the reading window (docs/desktop.md §4.9) on the kept note's own address — the item's page, on the feed on
  // this machine. 库架's card → the library; its 资料库 tab opens 已收藏 on the kept note; 「打开原文」 = openReader(url, 'reader')
  // (each wait says what the page showed when it times out)
  const where = () => page().evaluate(() => JSON.stringify({ screen: document.querySelector('main[data-screen]')?.dataset.screen, state: document.querySelector('main[data-screen]')?.dataset.state, views: [...document.querySelectorAll('[data-view]')].map(v => [v.dataset.view, v.dataset.count, v.getAttribute('aria-current')]), rows: document.querySelectorAll('[data-part="list"] [data-row]').length, actions: [...document.querySelectorAll('[data-part="item-actions"]')].map(a => a.outerHTML.slice(0, 300)), text: document.querySelector('main')?.innerText.slice(0, 400) }))
  const untilSaid = async (fn, what) => { try { await until(fn) } catch (e) { throw new Error(`${what}: ${e.message}; the page: ${await where().catch(() => '?')}`) } }
  await page().click('[data-shelf-card]')
  // (the card opens the library where it was: here its 待看; the tabs are the library frame's, beside main)
  await untilSaid(() => document.querySelector('main[data-screen]:not([data-screen="shelf"])[data-state="ready"]') !== null && document.querySelector('.lib-page nav.st-lib-tabs button[data-tab="library"]') !== null, '库架 card → a page of the library, with its tabs')
  await page().click('.lib-page nav.st-lib-tabs button[data-tab="library"]')
  await untilSaid(() => document.querySelector('main[data-screen="library"][data-state="ready"]') !== null, '资料库')
  await untilSaid(() => document.querySelector('[data-part="item-actions"][data-for="note"] [data-action="source"] button') !== null, '已收藏 opens the kept note, with 打开原文')
  const itemPath = new URL(current).pathname
  const asked = () => S.feed.requests.filter(q => q === `GET ${itemPath}`).length
  const askedBefore = asked()
  const n = Number(/\/item\/(\d+)$/.exec(current)?.[1])
  assert.ok(n >= 1, `the kept card is an item of the feed: ${current}`)
  await page().click('[data-part="item-actions"] [data-action="source"] button')
  const readerNow = () => A.evaluate(`(async () => {
    const win = ${READER_WINDOW}
    if (!win || win.contentView.children.length === 0) return null
    const bar = win.webContents
    const view = win.contentView.children[0].webContents
    if (bar.isLoading() || view.isLoading()) return { loading: true }
    return { loading: false, pageUrl: view.getURL(), mode: await bar.executeJavaScript('document.querySelector("[data-reader-bar]")?.dataset.mode ?? null').catch(() => null) }
  })()`)
  let r = null
  const settled = x => Boolean(x && !x.loading && x.mode)
  for (let i = 0; i < 300 && !settled(r); i += 1) { r = await readerNow(); if (!settled(r)) await sleep(200) }
  assert.ok(settled(r), `the reading window opened: ${JSON.stringify(r)}`)
  assert.equal(r.mode, 'reading', `阅读模式 (the item's article is long enough): ${JSON.stringify(r)}`)
  assert.ok(r.pageUrl.startsWith('data:text/html'), 'a page the reader wrote, not the address')
  const isolated = await A.evaluate(`(async () => {
    const { session } = require('electron')
    const ses = session.fromPartition(${JSON.stringify(READER_PARTITION)})
    const win = ${READER_WINDOW}
    const all = [win.webContents, win.contentView.children[0].webContents]
    const seen = 'JSON.stringify([typeof window.streams, typeof require, typeof process])'
    return {
      prefs: all.map(c => { const p = c.getLastWebPreferences(); return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, nodeIntegrationInSubFrames: p.nodeIntegrationInSubFrames, nodeIntegrationInWorker: p.nodeIntegrationInWorker, webviewTag: p.webviewTag, webSecurity: p.webSecurity, hasPreloadKey: Object.hasOwn(p, 'preload') } }),
      ownSession: all.map(c => c.session === ses && c.session !== session.defaultSession),
      persistent: ses.isPersistent(),
      bridge: await Promise.all(all.map(c => c.executeJavaScript(seen).then(JSON.parse))),
      article: await all[1].executeJavaScript('JSON.stringify({ text: document.querySelector("[data-reader-article]")?.textContent ?? "", scripts: document.querySelectorAll("script").length })').then(JSON.parse),
    }
  })()`)
  for (const p of isolated.prefs) assert.deepEqual(p, { sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false, webSecurity: true, hasPreloadKey: false }, 'the reading window\'s parameters: isolated')
  assert.deepEqual(isolated.ownSession, [true, true], 'its own session, not the app\'s')
  assert.equal(isolated.persistent, false, 'in memory (no persist: partition)')
  assert.deepEqual(isolated.bridge, [['undefined', 'undefined', 'undefined'], ['undefined', 'undefined', 'undefined']], 'no bridge, nothing of Node, in either page')
  assert.ok(isolated.article.text.includes(articleLine(n)), `the item's article: ${isolated.article.text.slice(0, 200)}`)
  assert.ok(!isolated.article.text.includes('About us'), 'not the page\'s menu')
  assert.equal(isolated.article.scripts, 0, 'no script in the reading page')
  assert.ok(asked() > askedBefore, `the reader asked the item's page from the feed on this machine (${S.feed.requests.join(', ')})`)
  assert.deepEqual(S.feed.requests.filter(q => q.includes(SCRIPT_RAN)), [], 'the page\'s script never ran')
  assert.ok(readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8').includes(`reader: ${current}: reading`), 'main.log: the reader\'s line')
  S.result.reader = { url: current, mode: r.mode, prefs: isolated.prefs[0], ownSession: isolated.ownSession, persistent: isolated.persistent }
  // 回到条目 (a link in the bar, the bar's one action that closes the window)
  await A.evaluate(`(() => { const win = ${READER_WINDOW}; win.webContents.executeJavaScript('document.querySelector(\\'[data-reader-action="back"]\\').click(); true').catch(() => {}); return true })()`)
  let open = true
  for (let i = 0; i < 100 && open; i += 1) { open = await A.evaluate(`(() => Boolean(${READER_WINDOW}))()`); if (open) await sleep(200) }
  assert.equal(open, false, '回到条目 closed the reading window')

  // nothing went anywhere but the feed: every request the harness saw was to the feed on this machine; the proxy trap got
  // nothing (neither Node's requests nor Chromium's); no development switch reached anything
  const requests = readRecord(hook(1).recordFile).filter(r => r.kind === 'request')
  assert.ok(requests.length >= 1, 'control: the record holds the feed\'s requests')
  const elsewhere = requests.filter(r => new URL(r.url).host !== S.feed.host)
  assert.deepEqual(elsewhere, [], 'no request but the feed on this machine')
  assert.ok(S.feed.requests.length >= 1, 'the feed was asked')
  assert.deepEqual(S.trap.requests, [], 'nothing through the proxy trap')
  assert.deepEqual(trapsUntouched(W.traps), [], 'no development switch taken')
  S.result.requests = requests.map(r => `${r.via} ${r.method} ${r.url}`)
  // control of the note check: the same file under another name fails it
  assert.ok(core.validateNote({ fileName: `x-${notes[0]}`, text }).problems.some(p => p.code === 'id-mismatch'), 'control: a note whose id is not its file name fails')
  // the app's own session cancels every request that is not app:// (desktop/src/main/security.mjs hardenSession) and logs
  // it: what the pages tried, if anything, is in main.log
  const blockedLine = /^\S+ blocked: (.*)$/
  const blocked = () => readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8').split(/\r?\n/).map(l => blockedLine.exec(l)?.[1]).filter(Boolean)
  const blockedBefore = blocked()
  S.result.blockedBySession = blockedBefore
  // controls of the egress checks, made from the main process after the use case: a request by Node's fetch and by
  // https.request (each recorded by the harness, then caught by the proxy trap: NODE_USE_ENV_PROXY); one by Electron's
  // network stack in the app's own session (cancelled there and logged), and one in a session of the control's own,
  // in memory (Chromium's --proxy-server sends it to the trap). Addresses under .invalid, which cannot exist; the trap
  // answers each and nothing goes further
  const control = 'streams-egress-control.invalid'
  await A.evaluate(`(async () => {
    const tries = [
      fetch('http://fetch.${control}/x').catch(() => null),
      new Promise(r => { const q = require('https').request('https://https.${control}/x', () => r()); q.on('error', () => r()); q.end() }),
      require('electron').net.fetch('http://session.${control}/x').catch(() => null),
      require('electron').session.fromPartition('streams-egress-control').fetch('http://net.${control}/x').catch(() => null),
    ]
    await Promise.race([Promise.all(tries), new Promise(r => setTimeout(r, 15000))])
    return true
  })()`)
  const controlRequests = readRecord(hook(1).recordFile).filter(r => r.kind === 'request' && r.url.includes(control)).map(r => `${r.via} ${r.url}`)
  assert.deepEqual(controlRequests.sort(), [`fetch http://fetch.${control}/x`, `https.request https://https.${control}/x`], 'control: the harness records Node\'s requests')
  const trapped = [...new Set(S.trap.requests)]
  for (const via of ['fetch', 'https', 'net']) assert.ok(trapped.some(t => t.includes(`${via}.${control}`)), `control: the trap caught the ${via} request (${trapped.join(', ')})`)
  assert.deepEqual(trapped.filter(t => !t.includes(control)), [], 'the trap caught nothing else')
  assert.equal(trapped.some(t => t.includes(`session.${control}`)), false, 'the app\'s own session let nothing through')
  const blockedAfter = blocked()
  assert.deepEqual(blockedAfter.slice(blockedBefore.length), [`http://session.${control}/x`], 'control: the app\'s session cancels and logs a request')
  S.result.egressControls = { recorded: controlRequests, trapped, blockedBySession: blockedAfter.slice(blockedBefore.length) }
  const rec = readRecord(hook(1).recordFile)
  S.result.notifications = rec.filter(r => r.kind === 'notification').map(r => r.title)
  assert.equal(rec.filter(r => r.kind === 'open-external' || r.kind === 'open-path').length, 0, 'nothing opened outside the app')
})

// ---------------------------------------------------------------- 4. quitting

test('4 · quitting with no debugger attached: the app ends, nothing of the install left running', async () => {
  assert.ok(A, 'the app of step 3')
  await A.detach()
  const t0 = Date.now()
  requestQuit(hook(1).quitFile)
  const exit = await Promise.race([A.exited, sleep(60_000).then(() => null)])
  S.result.quit = { toProcessExit: exit ? exit.at - t0 : null }
  await sleep(3000)
  const left = processesUnder(W.install)
  if (!exit || left.length) endProcesses(left)
  assert.ok(exit, 'the app ended within 60 s')
  assert.deepEqual(left.map(p => p.Name), [], 'nothing of the install still running')
})

// ---------------------------------------------------------------- 4b. no Documents folder (v2 package J2)

test('4b · the reverse of world.mjs\'s Documents: the test user has no Documents folder — the installed app still starts, and a new library\'s default place falls back to <home>\\Streams (main.log says why)', async () => {
  assert.deepEqual(processesUnder(W.install), [], 'control: nothing of the install running before')
  const env = appEnv({ profile: W.profile, tmp: W.tmp, trapUrl: S.trap.url, traps: W.traps })
  // appEnv makes the Documents folder; this start is without it (an empty folder of the test's: nothing in it was ever written)
  const docs = join(W.profile, 'Documents')
  assert.deepEqual(readdirSync(docs), [], 'the test user\'s Documents is empty')
  rmSync(docs, { recursive: true })
  const B = await launchInstalled({ exe: W.exe, env, hook: hook(2), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  let exit = null
  try {
    // the app is up: its page ready (the library made in 3 is registered: its 概览), the main process answering
    await B.page.waitForFunction(() => document.querySelector('main[data-screen][data-state="ready"]') !== null, null, POLL)
    const facts = await B.evaluate(`(() => { const { app } = require('electron'); let documents; try { documents = app.getPath('documents') } catch (e) { documents = 'error: ' + e.message } return { documents, home: app.getPath('home') } })()`)
    // the case is real: Electron cannot give the Documents folder here
    assert.match(facts.documents, /^error: Failed to get 'documents' path/, `control: getPath('documents') fails for this user (${facts.documents})`)
    const root = (await B.page.evaluate(() => window.streams.getLibraryRoot())).data
    assert.deepEqual(root, { path: join(facts.home, 'Streams'), isDefault: true }, 'the default place falls back to <home>\\Streams')
    const log = readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8')
    assert.ok(log.includes(`library: the default place for a new library is ${join(facts.home, 'Streams')} (no documents folder: `), 'main.log says where and why')
    assert.equal(/start failed/.test(log), false, 'no start failed in main.log')
    S.result.noDocuments = { screen: await B.page.evaluate(() => document.querySelector('main[data-screen]').dataset.screen), documents: facts.documents, libraryRoot: root }
  } finally {
    await B.detach()
    requestQuit(hook(2).quitFile)
    exit = await Promise.race([B.exited, sleep(60_000).then(() => null)])
    await sleep(3000)
    const left = processesUnder(W.install)
    if (!exit || left.length) endProcesses(left)
    mkdirSync(docs, { recursive: true })
  }
  assert.ok(exit, 'the app ended within 60 s')
  assert.deepEqual(processesUnder(W.install), [], 'nothing of the install still running')
})

// ---------------------------------------------------------------- 5. uninstall

test('5 · silent uninstall: program folder, shortcuts, uninstall entry, toast activator key gone; the app\'s data and the library stay; the real %APPDATA%\\Streams and %LOCALAPPDATA%\\Streams as before', async () => {
  assert.deepEqual(processesUnder(W.install), [])
  const t0 = Date.now()
  const r = spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/LOG=${join(ROOT, 'uninstall.log')}`], { windowsHide: true, timeout: 120_000 })
  assert.equal(r.status, 0)
  // the uninstaller hands over to a copy of itself in TEMP and returns: wait for the entry and the folder to go
  for (let i = 0; i < 240 && (uninstallEntry(RELEASE.app_guid) || existsSync(W.install)); i += 1) await sleep(500)
  S.result.uninstallSeconds = Math.round((Date.now() - t0) / 100) / 10
  assert.equal(uninstallEntry(RELEASE.app_guid), null, 'the uninstall entry is gone')
  assert.equal(existsSync(W.install), false, `the program folder is gone: ${existsSync(W.install) ? readdirSync(W.install).join(', ') : ''}`)
  assert.equal(existsSync(S.startMenu), false, 'Start-menu shortcut gone')
  assert.equal(existsSync(S.desktop), false, 'desktop shortcut gone')
  assert.equal(toastKey(TOAST_ACTIVATOR_CLSID), null, 'the toast activator key is gone')
  assert.deepEqual(entriesNamed(/^流息/), [], 'no uninstall entry named 流息')
  assert.ok(existsSync(join(W.appData, 'settings.json')), 'the app\'s data stays (the uninstaller deletes it only when asked)')
  assert.ok(existsSync(S.result.note.path), 'the library and its note stay')
  const now = { appData: picture(real.appData), localAppData: picture(real.localAppData) }
  assert.deepEqual(now.appData, S.pictures.before.appData, '%APPDATA%\\Streams unchanged')
  assert.deepEqual(now.localAppData, S.pictures.before.localAppData, '%LOCALAPPDATA%\\Streams unchanged')
  assert.deepEqual(installedHere(realInstallTraces(traceArgs)), [], 'no trace of an install left')
  writeFileSync(join(DIST, 'packaged-test-result.json'), `${JSON.stringify({
    at: new Date().toISOString(), installer: RECORD.installer, ...S.result, realDataBefore: S.pictures.before, realDataAfter: now,
  }, null, 2)}\n`)
})
