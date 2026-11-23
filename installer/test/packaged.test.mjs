// The real installer on this machine (docs/installer.md §五). Run after a build:
//
//   node --test --test-concurrency=1 "installer/test/*.test.mjs"
//
// One run, in order:
//   0. guards: no install of Streams on this machine — its uninstall entry, its Start-menu or desktop shortcut, its toast
//      activator key: the test stops rather than touch one. v2 package N: an entry or key whose install is gone (its folder
//      and uninstaller missing, no shortcut: machine.mjs deadLeftovers — 维护者's entry of 2026-11-09, docs/installer.md §十一)
//      is not an install: this run's install (the same AppId) writes over it and its uninstall removes it. v2 package N: the
//      real %APPDATA%\Streams and %LOCALAPPDATA%\Streams are not even listed any more (contract N: no test reads them); the
//      uninstall runs as the test's user (its {userappdata} resolves into this run's folder, checked first)
//   1. silent install into a temporary folder (/VERYSILENT /DIR=…): the HKCU uninstall entry (name, version, publisher,
//      location, icon), the Start-menu and desktop shortcuts (target, working folder, icon, the app's AppUserModelID and
//      toast activator CLSID, read the way Electron reads them), the toast activator key, Streams.exe's icon and version
//      info, the setup program's version info; every installed file byte for byte the build's stage, no link, no Electron
//      default app, no component gallery, the license files there
//   2. the scan (installer/scan.mjs) on the install folder and on the installer file finds nothing; its controls find
//      what is planted
//   3. use case A in the installed app, started by installer/test/harness.mjs (no development switch: every STREAMS_* the
//      main process reads is set to a trap — world.mjs trapSwitches, switches.test.mjs — and must stay untaken): packaged,
//      the release's version, no menu, no developer tools. Every word compared with the installed app's own dictionaries
//      (use-case-a.mjs appWords) and the default look with the installed code's (src\main\theme.mjs) — 首次打开, one screen
//      (no library registered): the default theme following Windows; nothing to connect on this machine, so 连接选择 shows
//      (three connections, none found) with the usual sidebar; the template's fonts; 暂时跳过 → the one screen says 未连接,
//      发送 off → 手动创建 → the build conversation (1.1): 开始 off with no connection, nothing made. 1.1 W12: the library of the
//      use case is one 1.1 made, written here with the core (its card; 待看 with two items whose originals were kept and one
//      whose original was not) — 1.1 builds libraries only in the build conversation with Claude Code, and its pages have no
//      button that opens a folder as a library: the bridge's chooseLibraryFolder (the dialog answered by the harness) and
//      useChosenFolder open it, registered and current; its 待看 shows the summaries; getLicenses (MIT, the parts, the two
//      fonts' notices and OFL); the right panel's four tabs, no quota corner, no trap's line in main.log; C keeps the current
//      card → a note in notes/ the core's check passes, its last line linking to ../_originals/<id>.md; the sidebar and 库架;
//      a point of the next card → the reading window on the original Streams kept (stored, that point's sentence marked),
//      isolated (its two web contents' parameters, its own in-memory session, no bridge), then 返回条目 closes it; no request
//      at all (the harness's record of Node's requests, the proxy trap for Chromium's), then the egress controls
//   4. quitting, with no debugger attached: nothing of the install left running
//   4b. v2 package J2: the reverse of world.mjs's Documents folder — started again with the test user's Documents removed,
//      the installed app still comes up (getPath('documents') fails, as the control shows); a new library's default place
//      is <home>Streams and main.log says why; quitting ends it
//   5. v2 package N: the uninstall 维护者 ran (unins000.exe with no switch, its dialogs: 是 → 「否」 to the data question → 确定;
//      installer/test/dialogs.mjs) — was silent before: program folder, shortcuts, uninstall entry, toast activator key gone
//      (the log: the entry deleted), nothing named 流息 among the uninstall entries; the app's data and the library stay
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
  VT_CLSID, VT_LPWSTR, asElectronReadsIt, deadLeftovers, endProcesses, entriesNamed, filesOf, iconFileOf, installedHere,
  liveInstallHere, processesUnder, realInstallTraces, same, sha256File, shellFolder, shortcut, sleep, toastKey, uninstallEntry,
} from './machine.mjs'
// v2 package N: the uninstall with its dialogs (the maintainer's way)
import { uninstallTexts, uninstallWithDialogs } from './dialogs.mjs'
import { DETECT_TRAP_VERSION, appEnv, startTrap, trapLogLines, trapsUntouched } from './world.mjs'
// redesign R6c: the installed app's own words and defaults
import { appWords, isAppWord } from './use-case-a.mjs'
import { BUNDLED_FONTS } from '../fonts.mjs'
import { machineMarkers, scanForLeaks } from '../scan.mjs'
import { groupMatchesIco, iconGroups, innoCopyright, setupVersionInfo, versionInfo } from '../exe-resources.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
// redesign R6c: no dictionary and no theme table of the repository is read here — what a page shows is compared with the installed
// app's own files (use-case-a.mjs appWords, in test 3). The repository's default look and its theme table (each theme's page
// colours and template body) are read only as the control of the installed ones; the reading window's own session is the
// repository's constant (v2 package J2)
const REPO_THEME = await imp('desktop/src/main/theme.mjs')
const REPO_THEMES = await imp('desktop/src/shared/themes.mjs')
const { READER_PARTITION } = await imp('desktop/src/main/reader.mjs')
// 1.1 W12: what the PDF reader carries inside it (PDF.js), as the repository's license list names it
const REPO_LICENSES = await imp('desktop/src/main/licenses.mjs')
// v2 package N: the pinned ISCC (its language file: the uninstaller's own texts)
const { ensureInnoSetup } = await imp('installer/innosetup/setup_innosetup.mjs')
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
// redesign R6c: the two shipped fonts as the build lists them (installer/fonts.mjs): the interface font and the heading font
const FONTS = Object.freeze({ ui: BUNDLED_FONTS.find(f => f.name === 'Noto Sans SC'), display: BUNDLED_FONTS.find(f => f.name === 'Noto Serif SC') })
// redesign R6c: what the test types into 新建库 (the user's own words): the brief
const BRIEF = '追踪安装检查用的本机来源，不要别的。'
// 1.1 W12: the library step 3 opens — one 1.1 made (its card, 待看 as an update leaves it), written with the core: only the
// build conversation with Claude Code makes a library in 1.1, and this machine has no connection. Addresses under .invalid
// (nothing is fetched: the reading window shows the kept original)
const SEED_SOURCE = 'https://installer-test-source.invalid/notices'
const seedUrl = n => `https://installer-test-source.invalid/notice/${n}`
const paragraphsOf = n => [`安装测试来源发布了第 ${n} 条通知。`, `第 ${n} 条通知说明新的申请窗口已经开放，截止日期写在官方页面上。`, `申请第 ${n} 个项目需要先在线注册账户，再提交项目说明。`, `第 ${n} 个项目的审核结果预计在截止后一个月内公布。`]
const seedOf = (n, date) => {
  const paragraphs = paragraphsOf(n)
  return { url: seedUrl(n), title: `安装测试来源：第 ${n} 条通知`, date, paragraphs, text: paragraphs.join('\n\n'), what: `安装测试来源第 ${n} 条通知：新的申请窗口和申请步骤。`, points: [1, 2, 3].map(i => ({ text: `第 ${n} 条通知的第 ${i} 个要点`, quote: paragraphs[i] })) }
}
// in the order they reach 待看: the one whose original could not be saved, an older one, the newest (the current card)
const SEED_ITEMS = Object.freeze([
  { url: seedUrl(3), title: '安装测试来源：读不到的一条', date: '2026-11-10', text: null },
  seedOf(2, '2026-11-18'),
  seedOf(1, '2026-11-20'),
])
const SEED_CARD = Object.freeze({
  name: '安装测试库',
  definition: { summary: '安装测试用的一座库：只收安装测试来源的通知。', purpose: '安装测试', scope: '对象：安装测试来源；行业：无；地域：本机；规模：小', exclude: '别的来源', trust: '只认安装测试来源', rhythm: '每天一次', language: '中文', hard: '每条要有出处' },
  decide: [], collect: ['新的通知'], skip: ['旧闻'],
  sources: [{ name: '安装测试来源', url: SEED_SOURCE, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清日期'], samples: [{ title: '样例', url: seedUrl(0), date: '2026-11-01' }],
})
/** One item into 待看 the way an update puts it (core update/inbox.mjs): its original kept, then its checked summary. */
function seedItem(dir, it) {
  const item = { url: it.url, title: it.title, source: '安装测试来源', date: it.date }
  if (!it.text) { core.putMissingInInbox(dir, { item, reason: 'dead' }); return }
  core.saveOriginal(dir, { url: it.url, title: it.title, text: it.text, method: 'direct', fetchedAt: new Date() })
  const anchors = it.points.map((p, i) => ({ point: i, quote: p.quote, ...core.locateQuote(it.text, p.quote) }))
  const summary = { what: it.what, points: it.points.map(p => p.text), quote: it.points[0].quote, anchors }
  core.putInInbox(dir, { item, checked: { status: 'checked', summary, verification: { passed: true, rounds: 1, failed: [], claimsNotFound: [], forgot: [] }, original: { id: core.originalId(it.url), saved: true, method: 'direct' }, history: [] } })
}
const POLL = { polling: 200, timeout: 120_000 }
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const STARTED = Date.now()
const ROOT = tempDir('st-installer-')
const W = {
  install: join(ROOT, 'install'),
  profile: join(ROOT, 'profile'),
  tmp: join(ROOT, 'tmp'),
  traps: join(ROOT, 'traps'),
  // (R6c fixer, after the pre-check: not 「我的库」, the sidebar group's own word — test 3 checks the name is no app word)
  library: join(ROOT, '安装测试库'),
}
W.roaming = join(W.profile, 'AppData', 'Roaming')
W.local = join(W.profile, 'AppData', 'Local')
W.appData = join(W.roaming, RELEASE.install_folder)
W.exe = join(W.install, RELEASE.exe_name)
for (const d of [W.profile, W.tmp, W.traps, W.library]) mkdirSync(d, { recursive: true })
// redesign R6c: the name typed into 新建库 (the folder the dialog gives is named the same)
const LIB_NAME = basename(W.library)

// v2 package N: the real %APPDATA%\Streams and %LOCALAPPDATA%\Streams are no longer pictured (listed) here — contract N: no
// test reads or writes them (玄翎 compares them from outside the tests). What keeps them safe: the app runs with its user
// folders in this run's folder (world.mjs appEnv), and so does the uninstaller (UNINSTALL_ENV, checked in before())
const S = { result: {} }
const traceArgs = { guid: RELEASE.app_guid, appName: RELEASE.app_name, clsid: TOAST_ACTIVATOR_CLSID }
const hook = n => ({ appData: W.roaming, localAppData: W.local, recordFile: join(ROOT, `record-${n}.jsonl`), pickFolder: W.library, quitFile: join(ROOT, `quit-${n}`) })
// v2 package N: the uninstaller runs as this run's user — {userappdata} / {localappdata}, which the data question's 「是」 would
// delete, resolve into W.profile (TEMP stays the real one: the uninstaller's copy of itself goes there, after() removes it)
const UNINSTALL_ENV = { ...process.env, USERPROFILE: W.profile, APPDATA: W.roaming, LOCALAPPDATA: W.local }
const inside = (p, dir) => resolve(p).toLowerCase().startsWith(`${resolve(dir).toLowerCase()}${sep}`)

before(async () => {
  assert.equal(process.platform, 'win32', 'the installer is Windows-only')
  assert.ok(existsSync(SETUP), `no installer at ${SETUP}: run node installer/build-installer.mjs`)
  assert.equal(sha256File(SETUP), RECORD.installer.sha256, 'the installer is the one the build recorded')
  assert.equal(RELEASE.version, RELEASE_FILE.version, 'the build is of release.json\'s version')
  // the guard: an install of Streams on this machine (its uninstall entry, a shortcut, its toast activator key) is never touched.
  // v2 package N: leftovers whose install is gone (deadLeftovers) are not an install — recorded, then replaced by this run's
  // install and removed by its uninstall (the maintainer agreed, 2026-11-10)
  S.traces = realInstallTraces(traceArgs)
  const found = liveInstallHere(S.traces)
  assert.deepEqual(found, [], `Streams looks installed on this machine (${found.join(', ')}): this test installs and uninstalls, so it does not run here`)
  S.result.leftoversBefore = deadLeftovers(S.traces)
  if (S.result.leftoversBefore.length) process.stderr.write(`before: leftovers of an install that is gone, removed by this run's install and uninstall: ${S.result.leftoversBefore.join('; ')}\n`)
  S.startMenu = S.traces.startMenuPath
  S.desktop = S.traces.desktopPath
  for (const d of [W.roaming, W.local]) mkdirSync(d, { recursive: true })
  for (const [name, dir] of [['ApplicationData', W.roaming], ['LocalApplicationData', W.local]]) {
    const p = shellFolder(name, UNINSTALL_ENV)
    assert.ok(same(p, dir) && inside(p, W.profile), `${name} resolves to ${p} for the uninstaller, not this run's ${dir}: refusing`)
  }
  const { iscc } = await ensureInnoSetup({ install: false })
  S.uninstallTexts = uninstallTexts({ iscc, iss: readFileSync(join(REPO, 'installer', 'setup', 'streams.iss'), 'utf8'), appName: RELEASE.app_name })
  S.trap = await startTrap()
})

after(async () => {
  // whatever happened: no process of the install, the uninstaller run if this run's install is still there, then the folder
  const left = existsSync(W.install) ? processesUnder(W.install) : []
  if (left.length) { process.stderr.write(`after: ending ${left.length} process(es) of the install\n`); endProcesses(left) }
  const entry = uninstallEntry(RELEASE.app_guid)
  if (entry && same(entry.InstallLocation, W.install) && existsSync(join(W.install, 'unins000.exe'))) {
    process.stderr.write('after: uninstalling this run\'s install\n')
    // v2 package N: as this run's user (UNINSTALL_ENV), like test 5
    spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, env: UNINSTALL_ENV })
    for (let i = 0; i < 120 && uninstallEntry(RELEASE.app_guid); i += 1) await sleep(500)
  }
  // the uninstaller's own copy in TEMP, when it outlived the uninstall
  for (const n of readdirSync(tmpdir()).filter(n => /^is-.*-uninstall\.tmp$/i.test(n) && statSync(join(tmpdir(), n)).mtimeMs >= STARTED)) {
    try { removeTree(join(tmpdir(), n), { waitMs: 10_000 }) } catch { /* still in use: left */ }
  }
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
// redesign R6c: the installed app's own words and defaults (use-case-a.mjs appWords), read once the app is installed
let T = null
const page = () => A.page
const until = (fn, arg, o = {}) => page().waitForFunction(fn, arg, { ...POLL, ...o })
const click = sel => page().click(`${sel} button`)
const text = sel => page().evaluate(s => document.querySelector(s)?.textContent ?? null, sel)
const registryFile = () => join(W.appData, 'libraries.json')
const registryOnDisk = () => (existsSync(registryFile()) ? JSON.parse(readFileSync(registryFile(), 'utf8')) : null)
// (settings.json is written only when there is something to keep: before 连接选择 is answered there is none)
const settingsOnDisk = () => (existsSync(join(W.appData, 'settings.json')) ? JSON.parse(readFileSync(join(W.appData, 'settings.json'), 'utf8')) : {})
const mainLog = () => readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8')
// redesign R6c: 首次打开 is one screen with two views (docs/desktop.md §4.16): home (P01) and pick (连接选择, P02)
const firstRunView = () => page().evaluate(() => document.querySelector('main[data-screen="first-run"][data-state="ready"] [data-part="first-run"]')?.dataset.view ?? null)
const viewIs = v => until(x => document.querySelector('main[data-screen="first-run"][data-state="ready"] [data-part="first-run"]')?.dataset.view === x, v)
// the left sidebar as it is drawn: 新建库, the two entries (库架 with how many libraries), 我的库 and its rows, 设置
const sidebarNow = () => page().evaluate(() => ({
  add: document.querySelector('.st-sidebar [data-action="add-library"]')?.textContent.trim() ?? null,
  nav: [...document.querySelectorAll('.st-sidebar [data-nav]')].map(a => [a.dataset.nav, a.querySelector('.st-sidebar__nav-text')?.textContent ?? null, a.querySelector('[data-nav-count]')?.textContent ?? null]),
  group: document.querySelector('.st-sidebar .st-sidebar__group')?.textContent ?? null,
  rows: [...document.querySelectorAll('.st-sidebar [data-library-row]')].map(r => [r.dataset.active, r.querySelector('.st-sidebar__lib-name')?.textContent ?? null]),
  settings: [...document.querySelectorAll('.st-sidebar .st-sidebar__footer-button')].map(b => b.textContent.trim()),
}))
const HAN = /[\u4e00-\u9fff]/
// v2 package J2: the reading window as the main process holds it (desktop/src/main/reader.mjs: a BrowserWindow on the reader's
// partition — its own web contents is the bar — with one WebContentsView, the page)
const READER_WINDOW = `require('electron').BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === require('electron').session.fromPartition(${JSON.stringify(READER_PARTITION)}))`

test('3 · use case A in the installed app, no development switch (1.1 W12: the first run → the connection choice, nothing to connect, skipped → set up manually → the build conversation cannot start → a library 1.1 made, opened): its 待看 with the summaries, C keeps one → a note in notes/ linking to the kept original; the look, the fonts, the sidebar, the right panel and the shelf of now, in the installed app\'s own words; the reading window on the kept original, isolated; no request at all', async () => {
  // redesign R6c: every word a page is compared with is the installed app's own (resources\app\src\renderer\texts), every
  // default of the look the installed code's (src\main\theme.mjs) — and that default is the repository's (control: a default
  // changed in the installed copy alone would agree with itself)
  T = await appWords(join(W.install, 'resources', 'app'))
  const { FIRST_RUN: F, BUILD: B, CONNECTIONS, PANEL, SIDEBAR, SHELL, SEP } = T
  const C = F.connect
  // (R6c fixer) the library's name is no word of the app's, so a row or a card drawn with one does not pass for it; control:
  // the sidebar group's word is one
  assert.equal(isAppWord(T, SHELL.sidebar.mine), true, 'control: the sidebar group\'s word is an app word')
  assert.equal(isAppWord(T, LIB_NAME), false, `the test library's name is no app word: ${LIB_NAME}`)
  assert.deepEqual([T.DEFAULT_THEME, T.DEFAULT_APPEARANCE], [REPO_THEME.DEFAULT_THEME, REPO_THEME.DEFAULT_APPEARANCE], 'the installed code\'s default look is the repository\'s')
  // (the window's colour and the template's body below are compared with the installed table; the table itself with the
  // repository's, so a colour changed in the installed copy alone does not agree with itself)
  assert.deepEqual({ page: T.THEME_PAGE, template: T.THEME_TEMPLATE }, { page: REPO_THEMES.THEME_PAGE, template: REPO_THEMES.THEME_TEMPLATE }, 'the installed theme table is the repository\'s')
  assert.ok(Object.hasOwn(T.THEME_PAGE, T.DEFAULT_THEME) && Object.hasOwn(T.THEME_TEMPLATE, T.DEFAULT_THEME), `the default theme is one of the app's: ${T.DEFAULT_THEME}`)
  for (const w of [F.title, C.title, C.skip, F.manual, B.start, SIDEBAR.settings, ...Object.values(PANEL.tabs)]) assert.match(w, HAN, `control: the dictionary read is the Chinese one: ${w}`)

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
  // the look of a first start (v2 package N; redesign R6c: the default theme of now, read from the installed code — 研究对话
  // since redesign R1): the settings say the default theme following Windows (no settings.json yet: the defaults), Electron's
  // own parts follow Windows, the window was made with that set's page colour (what shows before the first frame), the served
  // index.html carries data-theme and data-appearance on <html> before any script runs, and the page is that theme of the
  // template (its body class and data-theme) painting that colour
  assert.equal(existsSync(join(W.appData, 'settings.json')), false, 'control: a first start, no settings.json (the look is the default)')
  const look = await A.evaluate(`(async () => {
    const { BrowserWindow, nativeTheme, net } = require('electron')
    const w = BrowserWindow.getAllWindows()[0]
    const served = await net.fetch(w.webContents.getURL(), { cache: 'no-store' }).then(r => r.text()).catch(e => 'error: ' + e.message)
    return { background: w.getBackgroundColor(), themeSource: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors, htmlTag: (/<html[^>]*>/.exec(served) ?? [served.slice(0, 200)])[0] }
  })()`)
  const scheme = look.dark ? 'dark' : 'light'
  const theme = T.DEFAULT_THEME
  const state = (await page().evaluate(() => window.streams.getAppState())).data
  assert.deepEqual({ theme: state.theme, appearance: state.appearance, scheme: state.scheme }, { theme, appearance: T.DEFAULT_APPEARANCE, scheme }, `the default theme, following Windows (which is ${scheme} now)`)
  assert.equal(look.themeSource, T.DEFAULT_APPEARANCE, 'Electron\'s own parts follow Windows')
  assert.equal(look.background.toUpperCase(), T.THEME_PAGE[theme][scheme].toUpperCase(), `the window's colour before the first frame: ${look.background}`)
  assert.match(look.htmlTag, new RegExp(`\\sdata-theme="${theme}"`), `the served index.html: ${look.htmlTag}`)
  assert.match(look.htmlTag, new RegExp(`\\sdata-appearance="${scheme}"`), `the served index.html: ${look.htmlTag}`)
  const painted = await page().evaluate(() => ({ theme: document.documentElement.dataset.theme, appearance: document.documentElement.dataset.appearance, bodyClass: document.body.className, bodyTheme: document.body.dataset.theme, bodyAppearance: document.body.dataset.appearance, page: getComputedStyle(document.body).backgroundColor }))
  const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
  assert.deepEqual(painted, { theme, appearance: scheme, bodyClass: T.THEME_TEMPLATE[theme].bodyClass, bodyTheme: T.THEME_TEMPLATE[theme].dataTheme, bodyAppearance: scheme, page: rgb(T.THEME_PAGE[theme][scheme]) }, 'the page is the default theme of the template, painting its colour')
  S.result.look = { ...look, scheme, painted }
  // no development switch taken so far: 首次打开 (not STREAMS_DEV_LIBRARY's library, not STREAMS_START_SCREEN's settings), the
  // tray icon made (STREAMS_WINDOW=hidden would make none). 首次打开 shows because no library is registered
  assert.equal((await page().evaluate(() => window.streams.getAppState())).data.libraryCount, 0, 'no library known')
  assert.deepEqual(registryOnDisk()?.libraries ?? [], [], 'the registry has no library (nothing of v1.0 to take over)')
  // where a new library goes by default (Documents\Streams, packaged) is the test user's Documents, not the real one (world.mjs
  // appEnv makes that folder; 4b starts the app without it) and not STREAMS_DEV_LIBRARY_ROOT's trap folder
  const root = (await page().evaluate(() => window.streams.getLibraryRoot())).data
  assert.equal(root.isDefault, true)
  assert.ok(same(root.path, join(W.profile, 'Documents', 'Streams')), `the default place for a new library: ${root.path}`)
  const rec0 = readRecord(hook(1).recordFile)
  assert.ok(rec0.some(r => r.kind === 'hook' && r.notifications === 'stand-in' && r.tray === 'stand-in'))
  assert.equal(rec0.filter(r => r.kind === 'tray-made').length, 1, 'a tray icon was made (through the stand-in): the window is not hidden by a switch')
  assert.deepEqual(rec0.filter(r => r.kind === 'app-user-model-id').map(r => r.id), [APP_USER_MODEL_ID])
  assert.deepEqual(rec0.filter(r => r.kind === 'toast-activator-clsid').map(r => r.id), [TOAST_ACTIVATOR_CLSID])

  // 首次打开 (redesign R4a: one screen). Nothing to connect on this machine — no tool on PATH, no key; STREAMS_DEV_CONNECTION=fake
  // would make the two tools usable, STREAMS_DEV_DETECT's trap says both are found and signed in — so 流息 cannot choose a
  // connection itself and shows 连接选择 (the pick view), in the installed dictionary's words (not STREAMS_DEV_SYSTEM_LANGUAGES'
  // English)
  // (the main process's detection, waited for until it has answered for both tools)
  await until(() => window.streams.getConnections().then(r => ['claude-code', 'codex'].every(k => typeof r?.data?.kinds?.[k]?.installed === 'boolean')))
  const conns = (await page().evaluate(() => window.streams.getConnections())).data.kinds
  assert.deepEqual(Object.fromEntries(['claude-code', 'codex', 'api'].map(k => [k, k === 'api' ? conns[k].hasKey : conns[k].installed])), { 'claude-code': false, codex: false, api: false }, `nothing to connect on this machine: ${JSON.stringify(conns)}`)
  assert.equal(['claude-code', 'codex'].some(k => conns[k].version === DETECT_TRAP_VERSION || conns[k].loggedIn === true), false, 'STREAMS_DEV_DETECT (a trap: both found and signed in) not taken')
  await until(() => ['home', 'pick'].includes(document.querySelector('main[data-screen="first-run"][data-state="ready"] [data-part="first-run"]')?.dataset.view))
  assert.equal(await firstRunView(), 'pick', 'the connection choice shows at once: no connection is usable')
  assert.deepEqual([await text('#fr-title'), await text('[data-part="connect"] h2')], [C.title, C.heading], 'the connection choice\'s title and heading, the installed words')
  const cards = await page().evaluate(() => [...document.querySelectorAll('[data-part="connect"] [data-connection]')].map(c => [c.dataset.connection, c.dataset.connState, c.querySelector('.file-text')?.firstChild?.textContent ?? null, c.querySelector('[data-detect]')?.textContent ?? null]))
  assert.deepEqual(cards, [
    ['claude-code', 'not-installed', CONNECTIONS.names['claude-code'], [C.recommended, C.notFound, F.billing['claude-code']].join(SEP)],
    ['codex', 'not-installed', CONNECTIONS.names.codex, [C.notFound, F.billing.codex].join(SEP)],
    ['api', 'no-key', CONNECTIONS.names.api, [C.anyVendor, F.billing.api].join(SEP)],
  ], 'the three connections: none found, none usable')
  assert.deepEqual(await page().evaluate(() => ['redetect', 'skip-connection'].map(n => document.querySelector(`[data-action="${n}"] button`)?.textContent.trim() ?? null)), [C.redetect, C.skip])
  S.result.connectionCards = cards
  // the usual frame is there already: the sidebar with no library yet
  assert.deepEqual(await sidebarNow(), { add: SHELL.sidebar.newLibrary, nav: [['shelf', SIDEBAR.entries.shelf, '0'], ['chat', SIDEBAR.entries.chat, null]], group: SHELL.sidebar.mine, rows: [], settings: [SIDEBAR.settings] }, 'the sidebar of the first run: new library, the shelf with 0, the main agent, no library row, settings')

  // the fonts (v2 package N's Noto Sans SC; redesign R6a's Noto Serif SC; redesign R6c: the template's families): both files
  // are installed (test 1 compared them byte for byte with the stage). The page's own @font-face rules say which family each
  // file is declared under; the body's font names the interface font's family after the digits' face (a face of local fonts,
  // no file); the title's font names the heading font's family, and its glyphs were drawn from that web font; and what app://
  // serves at each rule's address is the installed file
  const fontsDir = join(W.install, 'resources', 'app', 'src', 'renderer', 'fonts')
  for (const f of [FONTS.ui.file, FONTS.display.file]) assert.ok(STAGE_MANIFEST.files.some(m => m.path === `resources/app/src/renderer/fonts/${f}`) && existsSync(join(fontsDir, f)), `${f} is in the stage and installed`)
  await page().evaluate(() => document.fonts.ready)
  const rules = await page().evaluate(() => {
    const out = []
    const walk = sheet => {
      let list = []
      try { list = [...sheet.cssRules] } catch { return }
      for (const r of list) {
        if (r instanceof CSSImportRule && r.styleSheet) walk(r.styleSheet)
        if (!(r instanceof CSSFontFaceRule)) continue
        const m = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue('src'))
        out.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(), url: m ? new URL(m[1], sheet.href ?? location.href).href : null })
      }
    }
    for (const sheet of document.styleSheets) walk(sheet)
    return out
  })
  const ruleOf = file => rules.filter(r => r.url !== null && new URL(r.url).pathname.endsWith(`/fonts/${file}`))
  assert.deepEqual([ruleOf(FONTS.ui.file).length, ruleOf(FONTS.display.file).length], [1, 1], `one @font-face rule for each shipped font file: ${JSON.stringify(rules)}`)
  const uiFace = ruleOf(FONTS.ui.file)[0]
  const displayFace = ruleOf(FONTS.display.file)[0]
  const font = await page().evaluate(async ([ui, display]) => {
    const families = el => getComputedStyle(el).fontFamily.split(',').map(f => f.trim().replace(/["']/g, ''))
    const faces = () => [...document.fonts].map(f => [f.family.replace(/["']/g, ''), f.status])
    const title = document.querySelector('#fr-title')
    const ts = getComputedStyle(title)
    const before = faces()
    // the interface font's face is asked for only where a glyph needs it (the template names the system's own font before it):
    // asked for here the way a page would, for the title's own text
    const asked = await document.fonts.load(`${getComputedStyle(document.body).fontSize} "${ui}"`, title.textContent).then(l => l.map(f => [f.family.replace(/["']/g, ''), f.status]), e => `error: ${e.message}`)
    return {
      body: families(document.body), title: families(title), titleText: title.textContent, before, asked, faces: faces(),
      uiCheck: document.fonts.check(`${getComputedStyle(document.body).fontSize} "${ui}"`, title.textContent),
      displayCheck: document.fonts.check(`${ts.fontWeight} ${ts.fontSize} "${display}"`, title.textContent),
    }
  }, [uiFace.family, displayFace.family])
  assert.match(font.titleText, HAN, `control: the title is Chinese text: ${font.titleText}`)
  // (a face whose file is missing or broken ends 'error', and check() is then false)
  assert.ok(font.body.includes(uiFace.family), `the body's font names the interface font's family (${uiFace.family}): ${font.body.join(', ')}`)
  assert.deepEqual(font.asked, [[uiFace.family, 'loaded']], `the interface font loads from its file: ${JSON.stringify(font.asked)}`)
  assert.equal(font.uiCheck, true, 'document.fonts.check for the interface font')
  const digits = rules.find(r => r.family === font.body[0])
  assert.ok(digits && digits.url === null, `the body's first family is the template's face for digits, made of local fonts: ${font.body[0]} (${JSON.stringify(digits)})`)
  assert.ok(font.faces.some(([f, s]) => f === font.body[0] && s === 'loaded'), `the digits' face is loaded: ${JSON.stringify(font.faces)}`)
  assert.ok(font.title.includes(displayFace.family) && font.title.indexOf(displayFace.family) < font.title.indexOf(uiFace.family), `the title's font names the heading font's family (${displayFace.family}) before the interface font's: ${font.title.join(', ')}`)
  assert.deepEqual(font.faces.filter(([f]) => f === displayFace.family), [[displayFace.family, 'loaded']], `the heading font's face is loaded: ${JSON.stringify(font.faces)}`)
  assert.equal(font.displayCheck, true, 'document.fonts.check for the title in the heading font')
  // what was really drawn: the title's glyphs come from the web font of that family (a copy installed in Windows would not be one)
  const cdp = await page().context().newCDPSession(page())
  let drawn = []
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root: doc } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#fr-title' })
    drawn = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => ({ familyName: f.familyName, isCustomFont: f.isCustomFont, glyphCount: f.glyphCount }))
  } finally { await cdp.detach().catch(() => {}) }
  const drawnDisplay = drawn.filter(f => f.familyName === displayFace.family)
  assert.ok(drawnDisplay.length >= 1 && drawnDisplay.every(f => f.isCustomFont === true) && drawnDisplay.reduce((n, f) => n + f.glyphCount, 0) >= 2, `the title is drawn with the shipped heading font: ${JSON.stringify(drawn)}`)
  // the files behind the two faces: what the app's own protocol serves at each rule's address is the installed file, byte for byte
  const servedFonts = await A.evaluate(`(async () => {
    const { net } = require('electron')
    const { createHash } = require('crypto')
    const out = {}
    for (const u of ${JSON.stringify([uiFace.url, displayFace.url])}) {
      try { const r = await net.fetch(u, { cache: 'no-store' }); const b = Buffer.from(await r.arrayBuffer()); out[u] = { status: r.status, type: r.headers.get('content-type'), bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') } } catch (e) { out[u] = { error: e.message } }
    }
    return out
  })()`)
  for (const [face, file] of [[uiFace, FONTS.ui.file], [displayFace, FONTS.display.file]]) {
    const got = servedFonts[face.url]
    assert.deepEqual({ status: got.status, bytes: got.bytes, sha256: got.sha256 }, { status: 200, bytes: statSync(join(fontsDir, file)).size, sha256: sha256File(join(fontsDir, file)) }, `${face.url} is the installed ${file}: ${JSON.stringify(got)}`)
  }
  S.result.fonts = { rules, ...font, drawn, served: servedFonts }

  // 连接选择 answered: 暂时跳过，稍后在设置中连接 → back on the one screen, which says there is no connection
  assert.equal(settingsOnDisk().setupConnection ?? null, null, 'control: nothing recorded before the connection choice is answered')
  await click('[data-action="skip-connection"]')
  await viewIs('home')
  // with no library yet, who decided the connection goes to settings.json (setupConnection)
  const setupConnection = settingsOnDisk().setupConnection
  assert.equal(setupConnection?.by, 'skipped', JSON.stringify(setupConnection))
  assert.equal(Object.hasOwn(setupConnection, 'detail'), false)
  assert.equal(settingsOnDisk().connections?.active ?? null, null, 'no connection chosen')
  assert.deepEqual(registryOnDisk()?.libraries ?? [], [], 'still no library')
  const home = await page().evaluate(() => ({
    title: document.querySelector('#fr-title')?.textContent ?? null,
    chip: document.querySelector('[data-part="head-connection"]')?.textContent ?? null,
    current: document.querySelector('[data-part="current-connection"]') !== null,
    none: [document.querySelector('[data-part="no-connection"] .file-text')?.firstChild?.textContent ?? null, document.querySelector('[data-part="no-connection"] .file-text small')?.textContent ?? null],
    heading: document.querySelector('[data-part="track"] h2')?.textContent ?? null,
    examples: [...document.querySelectorAll('[data-part="examples"] [data-example] .file-text')].map(e => e.firstChild.textContent),
    buttons: ['pick-connection', 'send', 'manual-new', 'skip-create'].map(n => document.querySelector(`[data-action="${n}"] button`)?.textContent.trim() ?? null),
  }))
  assert.deepEqual(home, { title: F.title, chip: F.headChipNone, current: false, none: [F.none, F.noneLine], heading: F.heading, examples: [...F.examples], buttons: [F.pick, F.send, F.manual, F.skip] }, 'the first run\'s one screen with no connection, the installed words')
  // 发送 has nothing to send to: off even with a sentence in the box
  await page().fill('textarea[data-field="track"]', BRIEF)
  assert.equal(await page().evaluate(() => document.querySelector('[data-action="send"] button').disabled), true, 'no connection: the send button stays off')
  S.result.firstRun = home

  // 1.1 W12: 手动创建 opens the build conversation (v1.0's 新建库 page is gone, W7b); with no connection it cannot start — a
  // sentence typed, 开始 stays off, nothing is made
  await click('[data-action="manual-new"]')
  await until(() => document.querySelector('main[data-screen="build"]') !== null && document.querySelector('textarea[data-field="opener"]') !== null)
  await page().fill('textarea[data-field="opener"]', BRIEF)
  assert.equal((await text('[data-action="start"] button'))?.trim(), B.start, 'the build conversation\'s 开始, the installed word')
  assert.equal(await page().evaluate(() => document.querySelector('[data-action="start"] button').disabled), true, 'no connection: the build conversation cannot start')
  assert.deepEqual(registryOnDisk()?.libraries ?? [], [], 'nothing made')

  // 1.1 W12: the library of this use case is one 1.1 made — its card, 待看 as an update leaves it (two items with their
  // originals kept and their summaries checked, one whose original could not be saved) — written here with the core, since
  // only the build conversation with Claude Code makes a library in 1.1 and this machine has no connection. 1.1's pages have
  // no button that opens a folder as a library (W12 reports it); the bridge's chooseLibraryFolder / useChosenFolder still do,
  // and the folder dialog is answered by the harness with that folder
  assert.equal(existsSync(join(W.library, 'streams.json')), false, 'control: the folder is empty so far')
  core.createLibrary(W.library, { name: LIB_NAME, language: 'zh-CN' })
  core.writeCard(W.library, SEED_CARD)
  for (const it of SEED_ITEMS) seedItem(W.library, it)
  const chosenFolder = await page().evaluate(() => window.streams.chooseLibraryFolder())
  assert.equal(chosenFolder.data?.state, 'library', `the dialog's folder holds a library: ${JSON.stringify(chosenFolder)}`)
  assert.deepEqual(readRecord(hook(1).recordFile).filter(r => r.kind === 'dialog').map(r => r.folder), [true], 'the folder dialog was asked once')
  const usedFolder = await page().evaluate(n => window.streams.useChosenFolder(n), LIB_NAME)
  assert.equal(usedFolder.error ?? null, null, JSON.stringify(usedFolder))
  const reg = registryOnDisk()
  assert.deepEqual(reg.libraries.map(l => [resolve(l.path).toLowerCase(), l.name]), [[resolve(W.library).toLowerCase(), LIB_NAME]], 'registered, under its name')
  assert.equal(reg.active, reg.libraries[0].id, 'and current')
  // v2 package A: settings.json's v1.0 fields (libraryPath, recentLibraries) are only read, never written
  const settings = settingsOnDisk()
  assert.deepEqual({ libraryPath: settings.libraryPath ?? null, recentLibraries: settings.recentLibraries ?? [] }, { libraryPath: null, recentLibraries: [] }, `settings.json's v1.0 library fields not written: ${JSON.stringify(settings)}`)
  // its row in the sidebar → its 待看: the three cards, the summaries of the two whose originals were kept
  await until(() => document.querySelector('.st-sidebar [data-library-row]') !== null)
  await page().click('.st-sidebar [data-library-row]')
  await until(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]') !== null)
  await until(n => document.querySelectorAll('article[data-card]').length === n, SEED_ITEMS.length)
  const shown = await page().evaluate(() => [...document.querySelectorAll('article[data-card]')].map(a => ({ url: a.dataset.url, current: a.dataset.current ?? null, text: a.textContent })))
  for (const it of SEED_ITEMS) {
    const c = shown.find(s => s.url === it.url)
    assert.ok(c, `the card of ${it.url}`)
    assert.ok(c.text.includes(it.title), `its title: ${c.text.slice(0, 200)}`)
    if (it.text) assert.ok(c.text.includes(it.what), `its summary: ${c.text.slice(0, 300)}`)
  }
  assert.equal(shown.find(s => s.current === 'true')?.url, SEED_ITEMS.at(-1).url, 'the newest card is the current one')
  S.result.inbox = shown.map(s => s.url)
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
    // 1.1 W2 (W12 here): the PDF reader, and PDF.js which it carries inside it (its version: the repository's licenses.mjs)
    ['unpdf', installedVersion('unpdf')], ['PDF.js', REPO_LICENSES.BUNDLED.find(b => b.name === 'PDF.js').version],
    // v2 package K2: the bundled UI font, its version read from the installed font file
    ['Noto Sans SC', '2.04'],
    // redesign R6a: the Research theme's heading font ships too, its version read the same way (first run in an install:
    // redesign R6c)
    ['Noto Serif SC', '2.003'],
  ])
  const lf = s => s.replace(/\r\n/g, '\n')
  const notices = lf(readFileSync(join(W.install, 'THIRD-PARTY-NOTICES.txt'), 'utf8'))
  assert.ok(notices.includes(`@mozilla/readability@${installedVersion('@mozilla/readability')}`), 'the notices list @mozilla/readability')
  assert.ok(notices.includes(`unpdf@${installedVersion('unpdf')}`) && notices.includes('PDF.js'), 'the notices list unpdf and PDF.js (1.1 W2)')
  // the two shipped fonts (v2 package K2: Noto Sans SC; redesign R6a: Noto Serif SC, first run in an install: redesign R6c) —
  // each installed with its license text; the notices' own line for it (its file, its name and use — the words of
  // installer/fonts.mjs, which fonts.test.mjs pins — OFL 1.1, where it is installed) followed by the installed file's sha256,
  // and its OFL in full; the license page's text is the shipped OFL file's
  const noticeLine = f => `* ${f.file} — ${f.name}, ${f.role}, unmodified — ${f.license} — installed at resources\\app\\src\\renderer\\fonts\\${f.file}\n    sha256: ${sha256File(join(fontsDir, f.file))}\n`
  const shownFonts = { [FONTS.ui.name]: licenses.font, [FONTS.display.name]: licenses.displayFont }
  const oflOf = {}
  for (const f of [FONTS.ui, FONTS.display]) {
    assert.ok(existsSync(join(fontsDir, f.file)) && existsSync(join(fontsDir, f.licenseFile)), `${f.name}: the font and its license text are installed`)
    oflOf[f.name] = lf(readFileSync(join(fontsDir, f.licenseFile), 'utf8')).trim()
    assert.match(oflOf[f.name], /SIL OPEN FONT LICENSE Version 1\.1/, `${f.licenseFile} is the OFL 1.1`)
    assert.ok(notices.includes(noticeLine(f)), `the notices name ${f.name}, its license and its file's sha256`)
    assert.ok(notices.includes(oflOf[f.name]), `the notices carry the OFL of ${f.name} in full`)
    assert.deepEqual([shownFonts[f.name]?.name, shownFonts[f.name]?.license], [f.name, 'OFL-1.1'], `the license page's entry for ${f.name}`)
    assert.equal(lf(shownFonts[f.name].text).trim(), oflOf[f.name], `the license page shows the shipped OFL of ${f.name} in full`)
  }
  assert.notEqual(oflOf[FONTS.ui.name], oflOf[FONTS.display.name], 'control: the two fonts\' license texts are two texts')
  S.result.licenses = { own: licenses.own.license, components: licenses.components, notices: licenses.notices }

  // the right panel (v2 package L; redesign R6c: the tabs of now, in the installed words): on 待看 the panel is open with its
  // four tabs in order — progress · decide · detail · files, each under PANEL.tabs' word — the detail tab current (the
  // default); a click on the progress tab switches it and settings.json remembers it (panel), and back
  const panelNow = () => page().evaluate(() => {
    const a = document.querySelector('aside[data-part="right-panel"]')
    return a && { open: a.dataset.open, tab: a.dataset.tab, tabs: [...a.querySelectorAll('[data-panel-tab]')].map(b => [b.dataset.panelTab, b.textContent.trim(), b.getAttribute('aria-current')]) }
  })
  const tabsWith = current => ['progress', 'decide', 'detail', 'files'].map(id => [id, PANEL.tabs[id], id === current ? 'true' : null])
  assert.equal(new Set(Object.values(PANEL.tabs)).size, 4, 'control: four different words')
  assert.deepEqual(await panelNow(), { open: 'true', tab: 'detail', tabs: tabsWith('detail') }, 'the right panel: four tabs, the detail tab current')
  await page().click('aside[data-part="right-panel"] [data-panel-tab="progress"]')
  await until(() => document.querySelector('aside[data-part="right-panel"]')?.dataset.tab === 'progress')
  assert.deepEqual(await panelNow(), { open: 'true', tab: 'progress', tabs: tabsWith('progress') })
  for (let i = 0; i < 50 && settingsOnDisk().panel?.tab !== 'progress'; i += 1) await sleep(100)
  assert.deepEqual(settingsOnDisk().panel, { open: true, tab: 'progress' }, 'settings.json remembers the tab')
  await page().click('aside[data-part="right-panel"] [data-panel-tab="detail"]')
  await until(() => document.querySelector('aside[data-part="right-panel"]')?.dataset.tab === 'detail')
  // v2 package N (package M's corner): no connection, so no plan quota and no API balance — the corner above 设置 is not
  // there at all (维护者 11-10: what cannot be read is not shown); control: the sidebar and its 设置 are
  const corner = await page().evaluate(async () => ({ quota: (await window.streams.getQuota()).data, part: document.querySelectorAll('[data-part="quota"]').length, settingsButton: document.querySelectorAll('.st-sidebar .st-sidebar__footer-button').length }))
  assert.deepEqual(corner, { quota: null, part: 0, settingsButton: 1 }, `no quota corner without a connection: ${JSON.stringify(corner)}`)
  // no switch whose trap is a file left a line in main.log — STREAMS_DEV_QUOTA, STREAMS_DEV_DETECT; 1.1 W12: the definition and
  // the SOP folder would have failed the start-up check — and no line names a trap folder (world.mjs trapLogLines; control: the
  // log has the app's own lines)
  assert.match(mainLog(), /connections: detected /, 'control: main.log holds the app\'s lines')
  assert.deepEqual(trapLogLines(W.traps, mainLog()), [], 'no development switch left a line in main.log')
  S.result.panelAndCorner = { panel: await panelNow(), corner }

  // 待看: C keeps the current card → a note in notes/ that the core's own check passes, its last line the link to the
  // original Streams kept (1.1 W8: ../_originals/<id>.md, never in notes/)
  const notesDir = join(W.library, 'notes')
  const before = existsSync(notesDir) ? readdirSync(notesDir) : []
  assert.deepEqual(before, [], 'control: no note yet')
  const current = await page().evaluate(() => document.querySelector('article[data-card][data-current="true"]')?.dataset.url ?? null)
  assert.equal(current, SEED_ITEMS.at(-1).url, 'the current card')
  await page().keyboard.press('c')
  await until(url => !document.querySelector(`article[data-card][data-url="${url}"]`), current)
  const notes = readdirSync(notesDir).filter(n => n.endsWith('.md'))
  assert.equal(notes.length, 1, `one note: ${notes.join(', ')}`)
  const noteText = readFileSync(join(notesDir, notes[0]), 'utf8')
  const checked = core.validateNote({ fileName: notes[0], text: noteText, config: JSON.parse(readFileSync(join(W.library, 'streams.json'), 'utf8')) })
  assert.deepEqual(checked.problems, [], 'the note passes the core\'s own check')
  assert.equal(checked.ok, true)
  assert.equal(checked.meta.source, current, 'the note is the kept card\'s')
  assert.equal(checked.meta.status, 'kept')
  assert.equal(checked.meta.kept, localDay(), 'kept today (not STREAMS_DEV_NOW\'s day)')
  const lastLine = noteText.trimEnd().split(/\r?\n/).at(-1)
  assert.ok(lastLine.includes(`(../_originals/${core.originalId(current)}.md)`), `the note's last line links to the kept original: ${lastLine}`)
  assert.ok(existsSync(join(W.library, '_originals', `${core.originalId(current)}.md`)), 'the original it links to is there')
  assert.deepEqual(readdirSync(notesDir).filter(n => !n.endsWith('.md')), [], 'no original in notes/')
  S.result.note = { path: join(notesDir, notes[0]), file: notes[0], text: noteText, problems: checked.problems, warnings: checked.warnings }

  // the left sidebar of now (redesign R1): 新建库, 库架 (one library) and 主 Agent, 我的库 with the library's row, current,
  // 设置 — the installed words; then 库架 with the library's card (its name, current, the two left in 待看)
  assert.deepEqual(await sidebarNow(), { add: SHELL.sidebar.newLibrary, nav: [['shelf', SIDEBAR.entries.shelf, '1'], ['chat', SIDEBAR.entries.chat, null]], group: SHELL.sidebar.mine, rows: [['true', LIB_NAME]], settings: [SIDEBAR.settings] }, 'the sidebar: the library is the one row, current')
  await page().click('.st-sidebar [data-nav="shelf"]')
  await until(() => document.querySelector('main[data-screen="shelf"][data-state="ready"]'))
  await until(n => document.querySelectorAll('[data-shelf-card]').length === 1 && document.querySelector('[data-shelf-card] [data-part="inbox"]')?.dataset.value === String(n), SEED_ITEMS.length - 1)
  const shelf = await page().evaluate(() => [...document.querySelectorAll('[data-shelf-card]')].map(c => ({ id: c.dataset.shelfCard, active: c.dataset.active, name: c.querySelector('[data-part="name"]')?.textContent, inbox: c.querySelector('[data-part="inbox"]')?.dataset.value })))
  assert.deepEqual(shelf, [{ id: reg.active, active: 'true', name: LIB_NAME, inbox: String(SEED_ITEMS.length - 1) }], 'the shelf: the library, current, two left in 待看')
  S.result.shelf = shelf

  // the reading window (docs/desktop.md §4.9) — 1.1 W6a (A4): a point of a card in 待看 opens the original Streams kept, at
  // that point's sentence, and nothing is fetched. 库架's card → the library's 待看; the current card's second point
  const where = () => page().evaluate(() => JSON.stringify({ screen: document.querySelector('main[data-screen]')?.dataset.screen, state: document.querySelector('main[data-screen]')?.dataset.state, cards: [...document.querySelectorAll('article[data-card]')].map(a => [a.dataset.url, a.dataset.current]), text: document.querySelector('main')?.innerText.slice(0, 400) }))
  const untilSaid = async (fn, what, arg) => { try { await until(fn, arg) } catch (e) { throw new Error(`${what}: ${e.message}; the page: ${await where().catch(() => '?')}`) } }
  await page().click('[data-shelf-card]')
  await untilSaid(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]') !== null && document.querySelector('article[data-card][data-current="true"]') !== null, 'the shelf card → the library\'s 待看')
  const opened = await page().evaluate(() => document.querySelector('article[data-card][data-current="true"]').dataset.url)
  const item = SEED_ITEMS.find(i => i.url === opened)
  assert.ok(item && item.text, `the current card now has a kept original: ${opened}`)
  await untilSaid(() => document.querySelector('article[data-card][data-current="true"] [data-action="open-point"][data-point="1"]') !== null, 'the current card\'s second point links to its place in the original')
  await page().click('article[data-card][data-current="true"] [data-action="open-point"][data-point="1"]')
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
  assert.equal(r.mode, 'stored', `the original Streams kept: ${JSON.stringify(r)}`)
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
      article: await all[1].executeJavaScript('JSON.stringify({ stored: document.querySelector("[data-reader-article][data-reader-stored]") !== null, text: document.querySelector("[data-reader-article]")?.textContent ?? "", mark: document.querySelector("[data-reader-article] mark")?.textContent ?? null, scripts: document.querySelectorAll("script").length })').then(JSON.parse),
    }
  })()`)
  for (const p of isolated.prefs) assert.deepEqual(p, { sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false, webSecurity: true, hasPreloadKey: false }, 'the reading window\'s parameters: isolated')
  assert.deepEqual(isolated.ownSession, [true, true], 'its own session, not the app\'s')
  assert.equal(isolated.persistent, false, 'in memory (no persist: partition)')
  assert.deepEqual(isolated.bridge, [['undefined', 'undefined', 'undefined'], ['undefined', 'undefined', 'undefined']], 'no bridge, nothing of Node, in either page')
  assert.equal(isolated.article.stored, true, 'the kept original\'s page')
  assert.ok(isolated.article.text.includes(item.paragraphs[2]), `the kept original's text: ${isolated.article.text.slice(0, 200)}`)
  assert.equal(isolated.article.mark, item.points[1].quote, 'the second point\'s sentence marked')
  assert.equal(isolated.article.scripts, 0, 'no script in the reading page')
  assert.ok(mainLog().includes(': stored (point 2)'), 'main.log: the reader opened the kept original at point 2')
  S.result.reader = { url: opened, mode: r.mode, prefs: isolated.prefs[0], ownSession: isolated.ownSession, persistent: isolated.persistent, mark: isolated.article.mark }
  // 返回条目 (a link in the bar, the bar's one action that closes the window)
  await A.evaluate(`(() => { const win = ${READER_WINDOW}; win.webContents.executeJavaScript('document.querySelector(\\'[data-reader-action="back"]\\').click(); true').catch(() => {}); return true })()`)
  let open = true
  for (let i = 0; i < 100 && open; i += 1) { open = await A.evaluate(`(() => Boolean(${READER_WINDOW}))()`); if (open) await sleep(200) }
  assert.equal(open, false, 'the bar\'s back action closed the reading window')

  // 1.1 W12: nothing went anywhere — no request the harness saw (Node's), nothing through the proxy trap (Chromium's), no
  // development switch reached anything
  const requests = readRecord(hook(1).recordFile).filter(r => r.kind === 'request')
  assert.deepEqual(requests, [], 'no request at all')
  assert.deepEqual(S.trap.requests, [], 'nothing through the proxy trap')
  assert.deepEqual(trapsUntouched(W.traps), [], 'no development switch taken')
  assert.deepEqual(trapLogLines(W.traps, mainLog()), [], 'no development switch left a line in main.log, to the end of the use case')
  // control of the note check: the same file under another name fails it
  assert.ok(core.validateNote({ fileName: `x-${notes[0]}`, text: noteText }).problems.some(p => p.code === 'id-mismatch'), 'control: a note whose id is not its file name fails')
  // the app's own session cancels every request that is not app:// (desktop/src/main/security.mjs hardenSession) and logs
  // it: what the pages tried, if anything, is in main.log
  const blockedLine = /^\S+ blocked: (.*)$/
  const blocked = () => mainLog().split(/\r?\n/).map(l => blockedLine.exec(l)?.[1]).filter(Boolean)
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
    // the app is up: its page ready (the library made in 3 is registered: its 待看), the main process answering
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

// v2 package N: was a silent uninstall (/VERYSILENT /SUPPRESSMSGBOXES, which no user runs); now the maintainer's of 2026-11-10 —
// unins000.exe with no switch but /LOG, its three boxes answered by dialogs.mjs (是 → 「否」 → 确定) — as this run's user
// (UNINSTALL_ENV: the data question's folders resolve into this run's folder, checked in before())
test('5 · the uninstall with its dialogs, as 维护者 ran it (是 → 「否」 → 确定): program folder, shortcuts, uninstall entry, toast activator key gone (the log: the entry deleted); the app\'s data and the library stay; nothing named 流息 among the uninstall entries', async () => {
  assert.deepEqual(processesUnder(W.install), [])
  const t0 = Date.now()
  const log = join(ROOT, 'uninstall.log')
  const T = S.uninstallTexts
  const r = await uninstallWithDialogs({ exe: join(W.install, 'unins000.exe'), env: UNINSTALL_ENV, log, confirmText: T.confirm, dataQuestion: T.dataQuestion, deleteData: false, workDir: ROOT })
  assert.equal(r.watcherErr, '')
  assert.equal(r.watcherEnd?.timedOut, false, `the uninstaller's processes ended: ${JSON.stringify(r.watcherEnd)}`)
  assert.equal(r.exitCode, 0)
  assert.deepEqual(r.dialogs.map(d => d.text), [T.confirm, T.dataQuestion, T.done], `the three boxes: ${JSON.stringify(r.dialogs)}`)
  assert.deepEqual(r.dialogs.map(d => d.pressed).slice(0, 2), [6, 7], '是, then 否')
  // the second phase (the uninstaller's copy in TEMP) ends a moment after the last box: wait for the entry and the folder
  for (let i = 0; i < 240 && (uninstallEntry(RELEASE.app_guid) || existsSync(W.install)); i += 1) await sleep(500)
  S.result.uninstallSeconds = Math.round((Date.now() - t0) / 100) / 10
  const lines = readFileSync(log, 'utf8').split(/\r?\n/)
  const at = re => lines.findIndex(l => re.test(l))
  assert.ok(at(new RegExp(`Deleting registry key: HKEY_CURRENT_USER\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\\{${RELEASE.app_guid}\\}_is1$`)) >= 0, 'the log: the uninstall entry deleted')
  assert.ok(at(/Uninstallation process succeeded\.$/) >= 0 && lines.some(l => /Removed all\? Yes$/.test(l)), 'the log: the uninstall succeeded, everything removed')
  assert.deepEqual(lines.filter(l => /User chose (Yes|No|OK)\.$/.test(l)).map(l => /User chose (\w+)\./.exec(l)[1]), ['Yes', 'No', 'OK'], 'the log: 是, 否, 确定')
  S.result.uninstallDialogs = r.dialogs
  S.result.uninstallLog = lines.filter(l => /Deleting registry key|User chose|Uninstallation process succeeded|Removed all/.test(l))
  assert.equal(uninstallEntry(RELEASE.app_guid), null, 'the uninstall entry is gone')
  assert.equal(existsSync(W.install), false, `the program folder is gone: ${existsSync(W.install) ? readdirSync(W.install).join(', ') : ''}`)
  assert.equal(existsSync(S.startMenu), false, 'Start-menu shortcut gone')
  assert.equal(existsSync(S.desktop), false, 'desktop shortcut gone')
  assert.equal(toastKey(TOAST_ACTIVATOR_CLSID), null, 'the toast activator key is gone')
  assert.deepEqual(entriesNamed(/^流息/), [], 'no uninstall entry named 流息')
  assert.deepEqual(entriesNamed(/Streams/i), [], 'nor one named Streams')
  assert.ok(existsSync(join(W.appData, 'settings.json')), 'the app\'s data stays (「否」)')
  assert.ok(existsSync(S.result.note.path), 'the library and its note stay')
  // nothing of an install left — the leftovers of before() (the maintainer's entry and key, if any) included
  assert.deepEqual(installedHere(realInstallTraces(traceArgs)), [], 'no trace of an install left')
  writeFileSync(join(DIST, 'packaged-test-result.json'), `${JSON.stringify({ at: new Date().toISOString(), installer: RECORD.installer, ...S.result }, null, 2)}\n`)
})
