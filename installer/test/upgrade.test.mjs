// The update, for real (docs/installer.md §十一): an older version installed, the app itself checks GitHub, downloads the
// newer setup program and starts it; the setup program installs over the older copy and opens Streams again. Run after a
// build (installer/dist/Streams-<release.json version>-setup.exe is the newer one):
//
//   node --test --test-concurrency=1 "installer/test/*.test.mjs"
//
// The older version is built here, by the same script: node installer/build-installer.mjs with
// STREAMS_INSTALLER_VERSION=0.9.0 and STREAMS_INSTALLER_OUT=<this run's folder> (release.json is not changed).
// v2 package J2: and with STREAMS_INSTALLER_APP_REF=<V1_REF>, v1.0's own app (desktop/src and core/src as git holds them at
// the commit before v2 package A), so the update is v1.0 → v2 as a user of the v1.0 test version has it, and the data the
// older app leaves is v1.0's: one library named by settings.json (libraryPath, recentLibraries, schedule) and no
// libraries.json. v2 package A migrates it at v2's first start (docs/desktop.md §4.4): that is checked in 6.
// Everything runs as a user whose folders are inside this run's folder: the setup programs, the app and the app the setup
// program opens again all get USERPROFILE, APPDATA, LOCALAPPDATA, TEMP there — so the Start menu, the desktop and the app's
// data resolve into it (checked first: Windows is asked where those folders are for that environment). What cannot move is
// HKCU — the uninstall entry and the toast activator key are the real ones — so the guard is the same as packaged.test.mjs's.
//   0. guards; the older build; where the user's folders resolve
//   1. 0.9.0 installed silently: its uninstall entry (0.9.0), its shortcuts in the test user's Start menu and desktop
//   2. 0.9.0 first start (installer/test/harness.mjs): use case A to a kept note (v1.0's 首次设置); 设置 → 关于 says 0.9.0;
//      v2 package J2: 设置's 定时 set to a time of its own (not the default 08:30, so a migration that ignores it shows);
//      v2 package N: and 设置's 主题 to 夜间 (night: its migration changes the appearance);
//      settings.json then holds v1.0's libraryPath / recentLibraries / schedule, and there is no libraries.json and no
//      schedule in the library's streams.json (the controls: what 6 finds there, v2 made)
//   3. the stand-in for GitHub (installer/test/github-standin.mjs) gives 1.0.0 with a WRONG sha256: 检查更新 → 有新版本 →
//      下载 → verify_failed, the file deleted, nothing started; then the right sha256: 检查更新 → 下载 → ready, the file in
//      <appData>\updates is the 1.0.0 installer byte for byte; the app asked GitHub's real addresses (the harness's record)
//      and nothing else but the feed; STREAMS_DEV_UPDATE_URL and STREAMS_DEV_UPDATE_SETUP_RECORD (traps) not taken
//   4. 开始更新 → the app starts the setup program (detached, no console, its five arguments and /STWAITPID=<its own
//      process id>; the harness adds /LOG) and quits — slowly: the harness holds the app's exit for 8 s (slowExitMs, a busy
//      machine), so Streams.exe outlives its windows that long; the setup program waits for it (the handshake), installs
//      1.0.0 over 0.9.0 and opens Streams again (it is ended once it is up), all within 2 minutes
//   5. after the update: the program folder is the 1.0.0 stage, file for file (and the uninstaller); one uninstall entry,
//      1.0.0; the setup log says it waited for the app's process ("process <pid> exited after <n> ms", seconds) before the
//      Restart Manager looked, the Restart Manager found no application holding our files, the older copy's files were
//      removed first and the app was opened again
//   6. a start of 1.0.0 (harness): packaged, 1.0.0, 关于 says 1.0.0; the library and its note, the settings — still there;
//      updates\ emptied; nothing asked of GitHub at start. v2 package J2, the migration of v1.0's data (made by the 1.0.0 that
//      the setup program opened again, its first start): libraries.json made from settings.json — the library registered
//      and current, nothing else; the app opens on its 待看 (redesign R1: 概览 is gone), the sidebar has its row and 库架 its card; its
//      schedule moved into its streams.json (the time set in 2, also what getSchedule answers); settings.json's libraryPath,
//      recentLibraries and schedule as 0.9.0 left them (read, not written). The theme migration (v2 package N; redesign R6c:
//      the table of now — 维护者 11-11, the R1 contract: every v1.0 id becomes the default theme, 研究对话, read from the
//      installed code's theme.mjs and not written here; river follows the default appearance, paper is light, night is dark):
//      v1.0's 夜间 is the default theme + 深色 (what the app reads, the page draws, the window's colour), every other field of
//      settings.json as v1.0 wrote it; the table's three v1.0 ids given to the installed app one by one in the test user's
//      settings.json; the installed migrateLook says the same. 关于's version line and the page's version chip are the
//      installed dictionary's sentence with 1.0.0
//   7. silent uninstall: entry, files, shortcuts, toast activator key gone; nothing of Streams left on the real machine
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchInstalled, readRecord, requestQuit } from './harness.mjs'
import {
  deadLeftovers, endProcesses, entriesNamed, filesOf, installedHere, liveInstallHere, processesUnder, ps, realInstallTraces, same,
  sha256File, shellFolder, shortcut, sleep, toastKey, uninstallEntry,
} from './machine.mjs'
import { startGitHub } from './github-standin.mjs'
import { appEnv, startFeed, startTrap, trapLogLines, trapsUntouched } from './world.mjs'
import { appWords, isAppWord, keepCurrent, openAbout, updateState, v1FirstRunToInbox } from './use-case-a.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { TOAST_ACTIVATOR_CLSID } = await imp('desktop/src/main/app-id.mjs')
const { SETUP_ARGS } = await imp('desktop/src/main/services/update.mjs')
// redesign R6c: the look's defaults, page colours and migration are read in 6 from the installed 1.0.0's own code (use-case-a.mjs
// appWords); the repository's defaults only as the control of the installed ones
const REPO_THEME = await imp('desktop/src/main/theme.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { tempDir } = await imp('desktop/scripts/lib/temp.mjs')
const core = await imp('core/src/index.mjs')

const DIST = join(REPO, 'installer', 'dist')
const NEW_RECORD = JSON.parse(readFileSync(join(DIST, 'build-record.json'), 'utf8'))
const NEW_SETUP = join(REPO, NEW_RECORD.installer.file)
const NEW_MANIFEST = JSON.parse(readFileSync(join(DIST, 'stage-manifest.json'), 'utf8'))
const RELEASE = NEW_RECORD.release
const OLDER = '0.9.0'
// v2 package J2: the older version's app is v1.0's — the commit before v2 package A (fe66f16), whose desktop/ and core/ are
// those of the last v1.0 commit (4d4dd53)
const V1_REF = 'b3b5512700d31e13327087729e2585a5873626bf'
// v2 package J2: the schedule 0.9.0 is given in 2 — not v1.0's default (08:30), twelve hours from now (no round of either
// version falls due while the test runs)
const V1_SCHEDULE = (() => {
  const d = new Date(Date.now() + 12 * 3_600_000)
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { enabled: true, time: t === '08:30' ? '08:31' : t }
})()
// v2 package N: the theme 0.9.0 (v1.0's app) is set to in 2 — 夜间, the one v1.0 theme whose migration changes the appearance
// (desktop/src/main/theme.mjs migrateLook). 6 checks the migration of all three in the installed 1.0.0
const V1_THEME = 'night'
// redesign R6c: the table of now (the maintainer 11-11, the R1 contract): what each v1.0 theme id becomes. The theme is the app's default
// one for all three — read in 6 from the installed code, not written here; the appearance: river follows the default one (null
// here), paper is light, night is dark
const V1_APPEARANCE = Object.freeze({ river: null, paper: 'light', night: 'dark' })
// how long the older app's exit is held after 开始更新 (the harness's slowExitMs): the busy machine of the update's handshake
const SLOW_EXIT_MS = 8000
const GITHUB_LATEST = 'https://api.github.com/repos/AsuraNale/streams/releases/latest'
const GITHUB_DOWNLOAD = `https://github.com/AsuraNale/streams/releases/download/v${RELEASE.version}/Streams-${RELEASE.version}-setup.exe`

const ROOT = tempDir('st-upgrade-')
const W = {
  older: join(ROOT, 'older-build'),
  install: join(ROOT, 'install'),
  profile: join(ROOT, 'profile'),
  tmp: join(ROOT, 'tmp'),
  traps: join(ROOT, 'traps'),
  // (R6c fixer, after the pre-check: not 「我的库」, the sidebar group's own word — test 6 checks the name is no app word; only
  // the folder's name changed, the code of steps 2–5 is as it was)
  library: join(ROOT, '安装测试库'),
}
W.roaming = join(W.profile, 'AppData', 'Roaming')
W.local = join(W.profile, 'AppData', 'Local')
W.appData = join(W.roaming, RELEASE.install_folder)
W.exe = join(W.install, RELEASE.exe_name)
for (const d of [W.profile, W.roaming, W.local, W.tmp, W.traps, W.library]) mkdirSync(d, { recursive: true })

const traceArgs = { guid: RELEASE.app_guid, appName: RELEASE.app_name, clsid: TOAST_ACTIVATOR_CLSID }
// v2 package N: the real %APPDATA%\Streams and %LOCALAPPDATA%\Streams are no longer pictured (listed) here — contract N: no
// test reads or writes them; everything of this run (setup programs, apps, uninstaller) runs as the test's user (userEnv)
const S = { result: {} }
const hook = (n, more = {}) => ({ appData: W.roaming, localAppData: W.local, recordFile: join(ROOT, `record-${n}.jsonl`), pickFolder: W.library, quitFile: join(ROOT, `quit-${n}`), githubUrl: S.github.url, ...more })
// the user's folders of this run, for the setup programs (the app gets the same through appEnv)
const userEnv = () => ({ ...process.env, USERPROFILE: W.profile, HOME: W.profile, APPDATA: W.roaming, LOCALAPPDATA: W.local, TEMP: W.tmp, TMP: W.tmp })
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { polling: 200, timeout: 120_000 })

async function quitAndWait(app, n) {
  await app.detach()
  requestQuit(hook(n).quitFile)
  const exit = await Promise.race([app.exited, sleep(60_000).then(() => null)])
  await sleep(2000)
  const left = processesUnder(W.install)
  if (left.length) endProcesses(left)
  return { exit, left }
}

before(async () => {
  assert.equal(process.platform, 'win32')
  assert.ok(existsSync(NEW_SETUP), `no installer at ${NEW_SETUP}: run node installer/build-installer.mjs`)
  assert.equal(sha256File(NEW_SETUP), NEW_RECORD.installer.sha256, 'the newer installer is the one the build recorded')
  // the guard (as packaged.test.mjs): HKCU is the real one, so an install of Streams here stops the test
  S.traces = realInstallTraces(traceArgs)
  // v2 package N: leftovers whose install is gone (machine.mjs deadLeftovers) are not an install: this run's install writes
  // over them and its uninstall removes them (as packaged.test.mjs)
  const found = liveInstallHere(S.traces)
  assert.deepEqual(found, [], `Streams looks installed on this machine (${found.join(', ')}): this test installs and uninstalls, so it does not run here`)
  S.result.leftoversBefore = deadLeftovers(S.traces)
  // where Windows puts the Start menu, the desktop and the two data folders for this run's user: inside the run's folder
  const env = userEnv()
  S.folders = Object.fromEntries(['Programs', 'DesktopDirectory', 'ApplicationData', 'LocalApplicationData'].map(n => [n, shellFolder(n, env)]))
  for (const [n, p] of Object.entries(S.folders)) assert.ok(resolve(p).toLowerCase().startsWith(resolve(W.profile).toLowerCase()), `${n} resolves to ${p}, outside the test's user folder: the run would write the real one`)
  assert.ok(same(S.folders.ApplicationData, W.roaming) && same(S.folders.LocalApplicationData, W.local))
  S.startMenu = join(S.folders.Programs, `${RELEASE.app_name}.lnk`)
  S.desktop = join(S.folders.DesktopDirectory, `${RELEASE.app_name}.lnk`)

  // the older version: the same script, another version number, written into this run's folder; v2 package J2: v1.0's app
  // (V1_REF), not the working tree's
  const t0 = Date.now()
  const build = spawnSync(process.execPath, [join(REPO, 'installer', 'build-installer.mjs')], {
    encoding: 'utf8', windowsHide: true, timeout: 900_000, maxBuffer: 64 << 20,
    env: { ...process.env, STREAMS_INSTALLER_VERSION: OLDER, STREAMS_INSTALLER_OUT: W.older, STREAMS_INSTALLER_APP_REF: V1_REF },
  })
  assert.equal(build.status, 0, `the older build failed:\n${(build.stdout + build.stderr).slice(-3000)}`)
  S.olderRecord = JSON.parse(readFileSync(join(W.older, 'build-record.json'), 'utf8'))
  S.olderSetup = join(W.older, `Streams-${OLDER}-setup.exe`)
  assert.equal(S.olderRecord.release.version, OLDER)
  assert.equal(S.olderRecord.from.app_ref, V1_REF, 'the older build is v1.0\'s app')
  assert.deepEqual(Object.keys(S.olderRecord.stage.copied).filter(k => k.startsWith('@mozilla/')), [], 'control: v1.0 had no @mozilla/readability (the older stage is not the working tree\'s)')
  assert.equal(S.olderRecord.installer.sha256, sha256File(S.olderSetup))
  assert.notEqual(S.olderRecord.installer.sha256, NEW_RECORD.installer.sha256)
  S.result.olderBuild = { seconds: Math.round((Date.now() - t0) / 1000), sha256: S.olderRecord.installer.sha256, bytes: S.olderRecord.installer.bytes }

  S.feed = await startFeed()
  S.trap = await startTrap()
  S.github = await startGitHub({ version: RELEASE.version, file: NEW_SETUP })
})

after(async () => {
  for (let i = 0; i < 3; i += 1) {
    const left = existsSync(W.install) ? processesUnder(W.install) : []
    if (!left.length) break
    process.stderr.write(`after: ending ${left.length} process(es) of the install\n`)
    endProcesses(left)
    await sleep(1000)
  }
  // a setup program this run started (from the app's updates folder) that is still there
  const setups = [...processesUnder(W.roaming), ...processesUnder(W.tmp)]
  if (setups.length) endProcesses(setups)
  const entry = uninstallEntry(RELEASE.app_guid)
  if (entry && same(entry.InstallLocation, W.install) && existsSync(join(W.install, 'unins000.exe'))) {
    process.stderr.write('after: uninstalling this run\'s install\n')
    spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, env: userEnv() })
    for (let i = 0; i < 120 && uninstallEntry(RELEASE.app_guid); i += 1) await sleep(500)
  }
  await S.feed?.close()
  await S.trap?.close()
  await S.github?.close()
  await sleep(1000)
  // The app the setup program reopens has no harness: it shows its real tray icon, and Windows records that icon under
  // HKCU\Control Panel\NotifyIconSettings with the exe's path. Only records whose exe lies inside this run's own folder are
  // removed — the record of any other program is never touched.
  try {
    // a single-quoted PowerShell literal: backslashes stay single (JSON.stringify would double them and match nothing)
    const removed = ps(`$root = '${ROOT.replace(/'/g, "''")}'; $k = 'HKCU:\\Control Panel\\NotifyIconSettings'; $n = 0; if (Test-Path $k) { Get-ChildItem $k | ForEach-Object { $exe = "$((Get-ItemProperty $_.PSPath).ExecutablePath)"; if ($exe -and $exe.StartsWith($root + '\\', [System.StringComparison]::OrdinalIgnoreCase)) { Remove-Item $_.PSPath -Recurse; $n++ } } }; $n`)
    if (removed !== '0') process.stderr.write(`after: removed ${removed} tray-icon record(s) of this run\n`)
  } catch (err) { process.stderr.write(`after: tray-icon records not cleaned: ${err.message}\n`) }
  removeTree(ROOT, { waitMs: 60_000 })
})

// ---------------------------------------------------------------- 1. the older version

test(`1 · ${OLDER} installed silently for the test's user: its uninstall entry, its shortcuts in that user's Start menu and desktop`, () => {
  const r = spawnSync(S.olderSetup, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`, `/LOG=${join(ROOT, 'install-older.log')}`], { windowsHide: true, timeout: 600_000, env: userEnv() })
  assert.equal(r.status, 0, `setup exit code ${r.status}`)
  const entry = uninstallEntry(RELEASE.app_guid)
  assert.ok(entry && same(entry.InstallLocation, W.install), JSON.stringify(entry))
  assert.equal(entry.DisplayVersion, OLDER)
  assert.deepEqual(entriesNamed(/^流息/).map(e => e.DisplayVersion), [OLDER], 'one uninstall entry named 流息')
  for (const lnk of [S.startMenu, S.desktop]) assert.ok(same(shortcut(lnk)?.target ?? '', W.exe), `${lnk} → Streams.exe`)
  assert.deepEqual(installedHere({ ...realInstallTraces(traceArgs), entry: null, toastKey: null }), [], 'nothing in the real Start menu or on the real desktop')
  const pkg = JSON.parse(readFileSync(join(W.install, 'resources', 'app', 'package.json'), 'utf8'))
  assert.equal(pkg.version, OLDER)
  S.result.olderEntry = entry
})

// ---------------------------------------------------------------- 2. the older version in use

let A = null

test(`2 · ${OLDER} first start: use case A to a kept note; 设置 → 关于 says ${OLDER}`, async () => {
  const env = appEnv({ profile: W.profile, tmp: W.tmp, trapUrl: S.trap.url, traps: W.traps })
  S.appEnv = env
  A = await launchInstalled({ exe: W.exe, env, hook: hook(1, { setupSpawn: 'run', setupLog: join(ROOT, 'setup-update.log'), slowExitMs: SLOW_EXIT_MS }), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  assert.equal(await A.evaluate("require('electron').app.getVersion()"), OLDER)
  // v2 package J2: 0.9.0 is v1.0's app, so v1.0's 首次设置 (the folder first, then the connection skipped, …)
  await v1FirstRunToInbox(A.page, { feedUrl: S.feed.feed })
  S.kept = await keepCurrent(A.page)
  const notes = readdirSync(join(W.library, 'notes')).filter(n => n.endsWith('.md'))
  assert.equal(notes.length, 1)
  S.note = { file: join(W.library, 'notes', notes[0]), text: readFileSync(join(W.library, 'notes', notes[0]), 'utf8') }
  const about = await openAbout(A.page)
  assert.equal(about.version, OLDER)
  assert.ok(about.text.includes(`流息 ${OLDER}（Windows 版）`) && !about.text.includes('开发版'), about.text)
  // v2 package J2: v1.0's 设置 → 定时, the time changed (a change event saves it: setSchedule)
  const settingsFile = join(W.appData, 'settings.json')
  assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')).schedule, { enabled: true, time: '08:30' }, 'control: 定时 → 完成 took the default')
  await A.page.fill('input[data-field="schedule-time"]', V1_SCHEDULE.time)
  await until(A.page, t => document.querySelector('[data-schedule-note]') !== null && document.querySelector('input[data-field="schedule-time"]')?.value === t, V1_SCHEDULE.time)
  for (let i = 0; i < 50 && JSON.parse(readFileSync(settingsFile, 'utf8')).schedule?.time !== V1_SCHEDULE.time; i += 1) await sleep(200)
  // v2 package N: v1.0's 设置 → 主题 changed to 夜间 (night), the way a user of the v1.0 test version did it; the new version
  // migrates it (维护者 11-10: night → 精密国际主义 + 深色) — checked in 6
  assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8')).theme ?? 'river', 'river', 'control: v1.0\'s default theme so far')
  await A.page.selectOption('select[data-field="theme"]', V1_THEME)
  for (let i = 0; i < 50 && JSON.parse(readFileSync(settingsFile, 'utf8')).theme !== V1_THEME; i += 1) await sleep(200)
  assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8')).theme, V1_THEME, 'v1.0 saved its theme in settings.json')
  assert.equal(await A.page.evaluate(() => document.documentElement.dataset.theme), V1_THEME, 'and drew it')
  // what v1.0 leaves: settings.json names the one library (libraryPath, recentLibraries) and holds the schedule; no
  // libraries.json; the library's streams.json has no schedule of its own
  S.settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
  assert.ok(same(S.settings.libraryPath, W.library), JSON.stringify(S.settings))
  assert.ok(Array.isArray(S.settings.recentLibraries) && S.settings.recentLibraries.some(p => same(p, W.library)), `recentLibraries: ${JSON.stringify(S.settings.recentLibraries)}`)
  assert.deepEqual(S.settings.schedule, V1_SCHEDULE, '设置 → 定时 saved the time in settings.json (v1.0)')
  assert.equal(existsSync(join(W.appData, 'libraries.json')), false, 'control: v1.0 has no libraries.json')
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(W.library, 'streams.json'), 'utf8')), 'schedule'), false, 'control: v1.0 keeps no schedule in the library')
  S.result.v1Settings = { libraryPath: S.settings.libraryPath, recentLibraries: S.settings.recentLibraries, schedule: S.settings.schedule }
})

// ---------------------------------------------------------------- 3. check and download

test(`3 · 检查更新 → ${RELEASE.version}: a wrong sha256 is refused (verify_failed, nothing kept, nothing started); the right one downloads the installer byte for byte; GitHub's real addresses asked`, async () => {
  const page = A.page
  const updates = join(W.appData, 'updates')
  // the reverse first: the stand-in says a sha256 that is not the file's
  S.github.setDigest('0'.repeat(64))
  await page.click('[data-update-action="check"] button')
  assert.equal(await updateState(page, ['available', 'manual', 'check_failed', 'up_to_date']), 'available')
  assert.ok((await page.evaluate(() => document.querySelector('[data-update="available"]').textContent)).includes(RELEASE.version))
  await page.click('[data-update-action="download"] button')
  assert.equal(await updateState(page, ['verify_failed', 'download_failed', 'ready']), 'verify_failed', 'the download whose sha256 is not the release\'s is refused')
  assert.deepEqual(existsSync(updates) ? readdirSync(updates) : [], [], 'nothing kept of the refused download')
  assert.equal(readRecord(hook(1).recordFile).filter(r => r.kind === 'setup-spawn').length, 0, 'nothing started')
  assert.match(readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8'), /update: the download did not pass the check \(sha256\); deleted, nothing runs/)
  S.result.verifyFailed = true

  // the right sha256: check again, download, ready
  S.github.setDigest(null)
  await page.click('[data-update-action="check"] button')
  assert.equal(await updateState(page, ['available', 'manual', 'check_failed', 'up_to_date']), 'available')
  await page.click('[data-update-action="download"] button')
  assert.equal(await updateState(page, ['ready', 'verify_failed', 'download_failed']), 'ready')
  const file = join(updates, `Streams-${RELEASE.version}-setup.exe`)
  assert.deepEqual(readdirSync(updates), [`Streams-${RELEASE.version}-setup.exe`])
  assert.equal(statSync(file).size, NEW_RECORD.installer.bytes)
  assert.equal(sha256File(file), NEW_RECORD.installer.sha256, 'the downloaded file is the newer installer')

  // what the app asked: GitHub's real addresses, twice each (the refused round and this one), with GitHub's Accept and the
  // app's User-Agent; nothing else but the feed on this machine; the development switches untaken
  const gh = readRecord(hook(1).recordFile).filter(r => r.kind === 'github-request')
  assert.deepEqual(gh.map(r => r.url), [GITHUB_LATEST, GITHUB_DOWNLOAD, GITHUB_LATEST, GITHUB_DOWNLOAD])
  assert.ok(gh.filter(r => r.url === GITHUB_LATEST).every(r => r.accept === 'application/vnd.github+json' && r.userAgent === `Streams/${OLDER}`), JSON.stringify(gh))
  assert.deepEqual(S.github.requests.map(r => r.url), ['/repos/AsuraNale/streams/releases/latest', `/AsuraNale/streams/releases/download/v${RELEASE.version}/Streams-${RELEASE.version}-setup.exe`, '/repos/AsuraNale/streams/releases/latest', `/AsuraNale/streams/releases/download/v${RELEASE.version}/Streams-${RELEASE.version}-setup.exe`], 'the stand-in got exactly those')
  const requests = readRecord(hook(1).recordFile).filter(r => r.kind === 'request')
  assert.deepEqual(requests.filter(r => !r.github && new URL(r.url).host !== S.feed.host), [], 'nothing asked but GitHub (the stand-in) and the feed')
  assert.deepEqual(S.trap.requests, [], 'nothing through the proxy trap (STREAMS_DEV_UPDATE_URL points there)')
  assert.deepEqual(trapsUntouched(W.traps), [], 'no development switch taken')
  S.result.githubRequests = gh
})

// ---------------------------------------------------------------- 4. the update

test(`4 · 开始更新: the app starts the downloaded setup program (detached, no console, its five arguments and its process id) and quits, 8 s late; ${RELEASE.version} is installed over ${OLDER} and Streams opens again`, async () => {
  const started = Date.now()
  const mainLog = join(W.appData, 'logs', 'main.log')
  const logLengthBefore = readFileSync(mainLog, 'utf8').length
  await A.page.click('[data-update-action="start"] button')
  const what = () => `record: ${readRecord(hook(1).recordFile).slice(-12).map(r => r.kind).join(' ')}\nmain.log: ${readFileSync(mainLog, 'utf8').slice(logLengthBefore).slice(-3000)}`
  for (let i = 0; i < 60 && !readRecord(hook(1).recordFile).some(r => r.kind === 'setup-spawn'); i += 1) await sleep(500)
  assert.ok(readRecord(hook(1).recordFile).some(r => r.kind === 'setup-spawn'), `the app started the setup program\n${what()}`)
  // the debugger lets go now: a process started with --inspect-brk waits at its exit for an attached debugger to leave
  await A.detach().catch(() => {})
  const exit = await Promise.race([A.exited, sleep(60_000).then(() => null)])
  assert.ok(exit, `the app quit after starting the setup program\n${what()}`)
  const rec = readRecord(hook(1).recordFile)
  const spawned = rec.filter(r => r.kind === 'setup-spawn')
  assert.equal(spawned.length, 1)
  const s = spawned[0]
  assert.ok(same(s.command, join(W.appData, 'updates', `Streams-${RELEASE.version}-setup.exe`)), s.command)
  S.appPid = A.child.pid
  assert.deepEqual(s.args, [...SETUP_ARGS, `/STWAITPID=${S.appPid}`])
  assert.deepEqual(s.args, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/STRELAUNCH=1', `/STWAITPID=${S.appPid}`], 'the switches, and the main process\'s own id')
  // the slow exit: held, then released; the process ended at least that long after it started the setup program
  assert.ok(rec.some(r => r.kind === 'exit-held') && rec.some(r => r.kind === 'exit-released'), 'the exit was held and released (the harness)')
  assert.ok(exit.at - s.t >= SLOW_EXIT_MS - 1000, `the app ended ${exit.at - s.t} ms after it started the setup program`)
  S.result.slowExit = { heldMs: SLOW_EXIT_MS, appEndedAfterSpawnMs: exit.at - s.t, pid: S.appPid }
  assert.deepEqual({ detached: s.detached, stdio: s.stdio, windowsHide: s.windowsHide }, { detached: true, stdio: 'ignore', windowsHide: true })
  for (const k of ['before-quit', 'will-quit', 'exit']) assert.ok(rec.some(r => r.kind === k && r.t >= started), `${k} after 开始更新`)
  // the setup program runs, installs and opens Streams again; once the entry says the new version and Streams runs from the
  // install folder, the reopened app is ended (it has no harness: its window is on the screen)
  let reopened = []
  for (let i = 0; i < 600; i += 1) {
    const entry = uninstallEntry(RELEASE.app_guid)
    reopened = processesUnder(W.install).filter(p => /^streams\.exe$/i.test(p.Name))
    if (entry?.DisplayVersion === RELEASE.version && reopened.length && !processesUnder(W.roaming).length && !processesUnder(W.tmp).length) break
    await sleep(500)
  }
  S.result.updateSeconds = Math.round((Date.now() - started) / 1000)
  const setupLog = join(ROOT, 'setup-update.log')
  const setupTail = () => (existsSync(setupLog) ? readFileSync(setupLog, 'utf8').split(/\r?\n/).slice(-25).join('\n') : '(no setup log)')
  assert.equal(uninstallEntry(RELEASE.app_guid)?.DisplayVersion, RELEASE.version, `the setup program installed ${RELEASE.version}\n${setupTail()}`)
  assert.ok(reopened.length >= 1, `Streams was opened again from the install folder\n${setupTail()}`)
  assert.ok(S.result.updateSeconds < 120, `the update took ${S.result.updateSeconds} s (nothing stuck closing the older app)\n${setupTail()}`)
  // its start is in the log (the leftovers of updates\ looked at), then it is ended
  const reopenedLog = () => readFileSync(mainLog, 'utf8').slice(logLengthBefore)
  for (let i = 0; i < 60 && !/update: the updates folder/.test(reopenedLog()); i += 1) await sleep(500)
  S.result.reopenedLog = reopenedLog().split(/\r?\n/).filter(l => /update: /.test(l))
  endProcesses(processesUnder(W.install))
  assert.match(reopenedLog(), /update: the updates folder/, 'the reopened Streams started (it looked at the leftovers in updates\\)')
  await sleep(1500)
  assert.deepEqual(processesUnder(W.install), [])
})

// ---------------------------------------------------------------- 5. after the update

test(`5 · after the update: the program folder is the ${RELEASE.version} stage; one uninstall entry, ${RELEASE.version}; the setup log: the older copy's files removed first, Streams opened again`, () => {
  const { files, links } = filesOf(W.install)
  assert.deepEqual(links, [])
  const staged = new Set(NEW_MANIFEST.files.map(f => f.path))
  assert.deepEqual([...files.keys()].filter(p => !staged.has(p)).sort(), ['unins000.dat', 'unins000.exe'], 'nothing but the newer stage and the uninstaller')
  for (const f of NEW_MANIFEST.files) assert.equal(sha256File(files.get(f.path)), f.sha256, f.path)
  assert.equal(JSON.parse(readFileSync(join(W.install, 'resources', 'app', 'package.json'), 'utf8')).version, RELEASE.version)
  const entries = entriesNamed(/^流息/)
  assert.equal(entries.length, 1, `one uninstall entry named 流息: ${JSON.stringify(entries)}`)
  const entry = uninstallEntry(RELEASE.app_guid)
  assert.equal(entry.DisplayVersion, RELEASE.version)
  assert.equal(entry.DisplayName, RELEASE.app_ver_name)
  assert.equal(Number(entry.MajorVersion), Number(RELEASE.version.split('.')[0]))
  assert.ok(same(entry.InstallLocation, W.install))
  for (const lnk of [S.startMenu, S.desktop]) assert.ok(same(shortcut(lnk)?.target ?? '', W.exe), `${lnk} still → Streams.exe`)
  const log = readFileSync(join(ROOT, 'setup-update.log'), 'utf8')
  // the handshake: the setup program waited for the app's own process — seconds, the held exit — before the Restart Manager
  // looked; by then nothing held our files
  const lines = log.split(/\r?\n/)
  const waits = lines.filter(l => l.includes('Wait for the app to exit:'))
  assert.equal(waits.length, 1, waits.join('\n'))
  const waited = new RegExp(`Wait for the app to exit: process ${S.appPid} exited after (\\d+) ms$`).exec(waits[0])
  assert.ok(waited, waits[0])
  assert.ok(Number(waited[1]) >= SLOW_EXIT_MS / 2, `waited ${waited[1]} ms`)
  const at = re => lines.findIndex(l => re.test(l))
  const rmAt = at(/Calling RestartManager's RmGetList/)
  assert.ok(rmAt < 0 || at(/Wait for the app to exit:/) < rmAt, 'the wait comes before the Restart Manager looks')
  assert.ok(at(/Wait for the app to exit:/) < at(/Starting the installation process/), 'and before the installation starts')
  assert.doesNotMatch(log, /RestartManager found an application using one of our files/, 'the Restart Manager found nothing to close')
  S.result.setupLogWait = waits[0]
  S.result.setupLogRestartManager = lines.filter(l => /RestartManager/.test(l))
  assert.match(log, /An older copy of the app in this folder \(its program files are removed first\): 1/)
  assert.match(log, /Open the app again after the update: 1/)
  assert.match(log, /The uninstall entry shows this version: 1\.0\.0|The uninstall entry showed version .*: written 1\.0\.0/)
  S.result.entryAfter = entry
})

// ---------------------------------------------------------------- 6. the newer version in use

test(`6 · a start of ${RELEASE.version}: packaged, 关于 says ${RELEASE.version}; the library, its note and the settings still there; updates\\ emptied; GitHub not asked at start`, async () => {
  const githubBefore = S.github.requests.length
  const B = await launchInstalled({ exe: W.exe, env: S.appEnv, hook: hook(2, { setupSpawn: 'record' }), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  try {
    assert.equal(await B.evaluate("require('electron').app.getVersion()"), RELEASE.version)
    assert.equal(await B.evaluate("require('electron').app.isPackaged"), true)
    await until(B.page, () => document.querySelector('main[data-state="ready"]'))
    // redesign R6c: the installed 1.0.0's own words and look (its dictionaries, its theme.mjs), and the table of now made from
    // them: each v1.0 id → the default theme with the appearance of V1_APPEARANCE. Controls: the installed defaults are the
    // repository's, and the installed migrateLook — the function the app reads settings.json through — says the same as the
    // table for each id
    const T = await appWords(join(W.install, 'resources', 'app'))
    assert.deepEqual([T.DEFAULT_THEME, T.DEFAULT_APPEARANCE], [REPO_THEME.DEFAULT_THEME, REPO_THEME.DEFAULT_APPEARANCE], 'the installed code\'s default look is the repository\'s')
    assert.ok(Object.hasOwn(T.THEME_PAGE, T.DEFAULT_THEME), `the default theme is one of the app's: ${T.DEFAULT_THEME}`)
    const MIGRATION = Object.fromEntries(Object.entries(V1_APPEARANCE).map(([old, appearance]) => [old, { theme: T.DEFAULT_THEME, appearance: appearance ?? T.DEFAULT_APPEARANCE }]))
    for (const [old, want] of Object.entries(MIGRATION)) assert.deepEqual(T.migrateLook(old, undefined), want, `theme.mjs migrateLook: v1.0's ${old} → ${want.theme} + ${want.appearance}`)
    assert.equal(new Set(Object.values(MIGRATION).map(m => m.appearance)).size, 3, 'control: the three v1.0 ids become three appearances')
    const LIB_NAME = basename(W.library)
    // (R6c fixer) the library's name is no word of the app's, so a row or a card drawn with one does not pass for it; control:
    // the sidebar group's word is one
    assert.equal(isAppWord(T, T.SHELL.sidebar.mine), true, 'control: the sidebar group\'s word is an app word')
    assert.equal(isAppWord(T, LIB_NAME), false, `the test library's name is no app word: ${LIB_NAME}`)
    // the migrated library is current, so the app opens on its 待看 (redesign R1: 概览 is gone; v1.0 opened on 今日; 首次打开
    // shows only when no library is registered); the sidebar has the library's row, current
    assert.equal(await B.page.evaluate(() => document.querySelector('main').dataset.screen), 'inbox', 'the library opens at start, on its 待看 (no 首次打开)')
    assert.deepEqual(await B.page.evaluate(() => [...document.querySelectorAll('[data-library-row]')].map(r => [r.dataset.active, r.querySelector('.st-sidebar__lib-name')?.textContent])), [['true', LIB_NAME]], 'the sidebar\'s one library row, current')
    // v2 package J2, the migration (docs/desktop.md §4.4): libraries.json made from v1.0's settings.json — the library v1.0
    // had open, registered and current, named after its folder, and nothing else (recentLibraries held only it)
    const registry = JSON.parse(readFileSync(join(W.appData, 'libraries.json'), 'utf8'))
    assert.equal(registry.schema, 'streams.libraries/1')
    assert.deepEqual(registry.libraries.map(l => [resolve(l.path).toLowerCase(), l.name]), [[resolve(W.library).toLowerCase(), LIB_NAME]], `registered: ${JSON.stringify(registry)}`)
    assert.equal(registry.active, registry.libraries[0].id, 'and current')
    assert.match(readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8'), /library: the registry made from settings\.json: 1 libraries, current /, 'main.log: made from settings.json')
    // the schedule moved into the library's own streams.json (the time 0.9.0 was given, not the default), and that is what
    // the app now answers
    const config = JSON.parse(readFileSync(join(W.library, 'streams.json'), 'utf8'))
    assert.deepEqual(config.schedule, V1_SCHEDULE, 'the schedule moved into the library\'s streams.json')
    const sched = (await B.page.evaluate(() => window.streams.getSchedule())).data
    assert.deepEqual({ enabled: sched.enabled, time: sched.time }, V1_SCHEDULE, 'getSchedule answers the moved schedule')
    // settings.json's v1.0 fields: read, not written — as 0.9.0 left them
    const settings = JSON.parse(readFileSync(join(W.appData, 'settings.json'), 'utf8'))
    assert.deepEqual({ libraryPath: settings.libraryPath, recentLibraries: settings.recentLibraries, schedule: settings.schedule }, S.result.v1Settings, 'settings.json keeps libraryPath, recentLibraries and schedule as v1.0 wrote them')
    // the theme migration after a real update (v2 package N; redesign R6c: the table of now): v1.0's 夜间 is the default theme
    // + 深色 now — what the app reads, what the page draws, the window's colour — and every other setting v1.0 wrote is as it
    // wrote it (only the theme field is v1.0's own that the app of now reads differently; settings.json keeps 'night' until the
    // app writes it, or has the two new fields)
    const look = (await B.page.evaluate(() => window.streams.getAppState())).data
    assert.deepEqual({ theme: look.theme, appearance: look.appearance, scheme: look.scheme }, { ...MIGRATION[V1_THEME], scheme: 'dark' }, `v1.0's ${V1_THEME} migrated`)
    assert.equal(MIGRATION[V1_THEME].appearance, 'dark', 'control: the theme 0.9.0 was given is the one that becomes dark')
    assert.deepEqual(await B.page.evaluate(() => ({ theme: document.documentElement.dataset.theme, appearance: document.documentElement.dataset.appearance, bodyClass: document.body.className, bodyAppearance: document.body.dataset.appearance })), { theme: MIGRATION[V1_THEME].theme, appearance: 'dark', bodyClass: T.THEME_TEMPLATE[MIGRATION[V1_THEME].theme].bodyClass, bodyAppearance: 'dark' }, 'the page draws the default theme, dark')
    const background = await B.evaluate("require('electron').BrowserWindow.getAllWindows().find(w => !w.isDestroyed()).getBackgroundColor()")
    assert.equal(background.toUpperCase(), T.THEME_PAGE[MIGRATION[V1_THEME].theme].dark.toUpperCase(), `the window's colour: ${background}`)
    for (const [k, v] of Object.entries(S.settings)) if (k !== 'theme') assert.deepEqual(settings[k], v, `settings.json's ${k}: as v1.0 wrote it`)
    assert.ok(settings.theme === V1_THEME || (settings.theme === MIGRATION[V1_THEME].theme && settings.appearance === MIGRATION[V1_THEME].appearance), `settings.json's theme: ${settings.theme} / ${settings.appearance}`)
    // the rest of the maintainer's table in the installed app: the test user's settings.json given each v1.0 id (the rest as v1.0 left
    // it), the app asked (getAppState reads the file each time, through the same readSettings / migrateLook as at start)
    const settingsFile = join(W.appData, 'settings.json')
    const kept = readFileSync(settingsFile)
    try {
      for (const [old, want] of Object.entries(MIGRATION)) {
        writeFileSync(settingsFile, `${JSON.stringify({ ...S.settings, theme: old }, null, 2)}\n`)
        const st = (await B.page.evaluate(() => window.streams.getAppState())).data
        assert.deepEqual({ theme: st.theme, appearance: st.appearance }, want, `v1.0's ${old} → ${want.theme} + ${want.appearance}`)
      }
    } finally { writeFileSync(settingsFile, kept) }
    S.result.themeMigration = { after: { theme: look.theme, appearance: look.appearance, scheme: look.scheme, background }, table: MIGRATION }
    // 库架: the library's card, current
    await B.page.click('.st-sidebar [data-nav="shelf"]')
    await until(B.page, () => document.querySelector('main[data-screen="shelf"][data-state="ready"]') && document.querySelectorAll('[data-shelf-card]').length > 0)
    const shelf = await B.page.evaluate(() => [...document.querySelectorAll('[data-shelf-card]')].map(c => ({ id: c.dataset.shelfCard, active: c.dataset.active, name: c.querySelector('[data-part="name"]')?.textContent })))
    assert.deepEqual(shelf, [{ id: registry.active, active: 'true', name: LIB_NAME }], '库架: the migrated library')
    S.result.migration = { registry, schedule: config.schedule, settings: S.result.v1Settings, shelf }
    // 设置 of now (redesign R4b): 关于's version line — inside [data-part="about"] — and the page's version chip both say the
    // installed dictionary's sentence with this version (a packaged app: not the development one's)
    const about = await openAbout(B.page)
    assert.equal(about.version, RELEASE.version)
    const versionLine = T.fmt(T.SETTINGS.version, { version: RELEASE.version })
    assert.ok(versionLine.includes(RELEASE.version) && versionLine !== T.fmt(T.SETTINGS.versionDev, { version: RELEASE.version }), `control: the sentence carries the version and is not the development build's: ${versionLine}`)
    assert.equal(about.text, versionLine)
    assert.deepEqual(await B.page.evaluate(() => ({ inAbout: document.querySelector('main[data-screen="settings"] [data-part="about"] [data-update-root] [data-version]') !== null, chip: document.querySelector('[data-part="version-chip"]')?.textContent ?? null })), { inAbout: true, chip: versionLine }, '关于\'s line is in 设置\'s 关于; the page\'s chip says the same')
    assert.equal(readFileSync(S.note.file, 'utf8'), S.note.text, 'the kept note is still there, unchanged')
    const id = S.note.file.split(/[\\/]/).pop().replace(/\.md$/, '')
    assert.ok(core.readIndex(W.library).some(e => e.id === id && e.source === S.kept), 'the library\'s index has the kept note')
    assert.deepEqual(existsSync(join(W.appData, 'updates')) ? readdirSync(join(W.appData, 'updates')) : [], [], 'updates\\ emptied at start')
  } finally {
    S.result.quitB = (await quitAndWait(B, 2)).exit ? 'ended' : 'killed'
  }
  assert.equal(S.github.requests.length, githubBefore, 'no check at start (only the user asks)')
  assert.deepEqual(S.trap.requests, [], 'nothing through the proxy trap, in either version')
  assert.deepEqual(trapsUntouched(W.traps), [], 'no development switch taken')
  // redesign R6c: nor did one whose trap is a file leave a line in main.log (world.mjs trapLogLines), in either version
  assert.deepEqual(trapLogLines(W.traps, readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8')), [], 'no development switch left a line in main.log')
})

// ---------------------------------------------------------------- 7. uninstall

test('7 · silent uninstall: entry, files, shortcuts, toast activator key gone; nothing of Streams left on the real machine', async () => {
  const r = spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, timeout: 120_000, env: userEnv() })
  assert.equal(r.status, 0)
  for (let i = 0; i < 240 && (uninstallEntry(RELEASE.app_guid) || existsSync(W.install)); i += 1) await sleep(500)
  assert.equal(uninstallEntry(RELEASE.app_guid), null)
  assert.equal(existsSync(W.install), false)
  assert.equal(existsSync(S.startMenu), false)
  assert.equal(existsSync(S.desktop), false)
  assert.equal(toastKey(TOAST_ACTIVATOR_CLSID), null)
  assert.deepEqual(entriesNamed(/^流息/), [])
  assert.ok(existsSync(join(W.appData, 'settings.json')) && existsSync(S.note.file), 'the app\'s data and the library stay')
  assert.deepEqual(installedHere(realInstallTraces(traceArgs)), [], 'no trace of an install on the real machine')
  writeFileSync(join(DIST, 'upgrade-test-result.json'), `${JSON.stringify({ at: new Date().toISOString(), newer: NEW_RECORD.installer, older: S.result.olderBuild, ...S.result, folders: S.folders }, null, 2)}\n`)
})
