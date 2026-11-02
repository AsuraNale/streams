// The update in place, on the real installer (work order 08 §四「打包测试（真升级）」; docs/installer.md §十一). Run after a
// build, in the full suite:
//
//   node --test --test-concurrency=1 "installer/test/*.test.mjs"
//
// Where it writes. The setup program, the app and the app it opens again run with USERPROFILE, APPDATA and LOCALAPPDATA
// pointing into a profile of this run's own under the OS temp folder (…\st-upgrade-*\profile). Those variables move only
// what Windows defines through them: the Start menu, the desktop and both AppData folders resolve inside that profile because
// this user's shell folders are written as %USERPROFILE%\… (a desktop redirected elsewhere, e.g. to OneDrive, does not move:
// then no desktop shortcut is made). Step 0 asks Windows, with those variables, where the Programs folder and both AppData
// folders are, and refuses unless all three are inside the profile. What does NOT move, and is written for real while the
// run lasts:
//   - HKCU (the registry follows no variable): the uninstall entry …\Uninstall\{app_guid}_is1 and the notification activator
//     key HKCU\Software\Classes\CLSID\{toast CLSID} — the very keys a real install has, which is why a full run refuses to
//     start when Streams is installed for real (either key, or its Start-menu or desktop shortcut). Step 7's uninstaller
//     removes both; after() runs the uninstaller if this run's install is still there, then deletes either key that still
//     names this run's folder (never one that names another)
//   - the real %TEMP%: the setup program's and the uninstaller's working folders (is-*.tmp: Inno Setup removes them; after()
//     removes an uninstaller copy that outlived it), and whatever Windows itself notes about programs that ran
//   - the screen: the setup program's progress window (step 4) and the reopened Streams's window, for a few seconds
// A run killed before after() can leave the two HKCU keys behind: the next full run's step 0 then refuses; run that run's
// …\st-upgrade-*\install\unins000.exe, or delete the two keys.
//   0. guards: no real install (uninstall entry, toast activator key, the real Start-menu and desktop shortcuts); the test
//      profile's folders resolve inside it; a picture of the real ~/.dsh, %APPDATA%\Streams, %LOCALAPPDATA%\Streams and of the
//      real Start-menu and desktop shortcuts
//   1. the current build installed silently into a temporary folder: no app opened afterwards (no /STRELAUNCH)
//   2. a first start (installer/test/harness.mjs; the mock model): a key, a folder, one project with one turn
//   3. Settings 「关于」: the packaged app's version (release.json's, no 「开发版」); 检查更新 asks GitHub's real address once
//      (answered by a stand-in that publishes a higher version pointing at this same setup program); 下载并更新 → the file in
//      <appData>\updates, the release's size and SHA-256, no mark of the web; a file of an older version planted in the
//      program folder, and an older version's numbers in this run's own uninstall entry (DisplayVersion OLDER, its major and
//      minor: what Settings → Apps would show of the version before; 0.2.2, docs/installer.md 11.6)
//   4. 开始更新: the setup program started (detached, no stdio, no console window) with the five arguments, the app quits the
//      ordinary way; the setup program installs over the copy silently and opens Streams again. The harness adds one thing
//      to that real start, after the app's five arguments: /LOG=<this run's folder>\setup-1.log (the app never asks for a log)
//   5. after it: the setup program's log says the folder held this app's older copy, one answer for all of [InstallDelete];
//      the planted files gone (a file of the user's at the folder's top stays), every program file the stage's,
//      one uninstall entry, as the first install wrote it — so its version the update's, release.json's, not the planted
//      older one (2026-10-13 on the maintainer's machine the update to 0.2.1 left the entry at 0.2.0; until 0.2.2 this step compared the
//      entry with step 1's, which an update by the same setup program could not tell from a left-behind one) —, the
//      shortcuts and the notification key as before, the app's data and the project there, Streams
//      running again from the program folder with a window — closed even when something above failed (finally), so that
//      its single-instance lock does not make steps 6 and 7 fail too (step 6 also ends anything an earlier step left)
//   6. a start after it: the home page with the project, 「关于」 the version, the updates folder empty again
//   7. the silent uninstall: all of it gone; the real folders and shortcuts as before
// YZ_W7_FROM_STAGE=1 (a developer's shortcut, as in packaged.test.mjs): steps 2–4 on installer/dist/stage, the setup program
// recorded instead of run (nothing is installed, nothing updated); 1, 5, 6 skipped, 7 only compares the real ones. Then a
// real install of Streams may be there: it is pictured and must be the same afterwards. And the "release" the stand-in
// publishes is not a setup program at all but bytes that are no program (so a start that slipped past the harness's
// recording would fail to start, never update that real install: the setup program finds a real install by its HKCU entry,
// whatever the profile); nothing here writes HKCU.
// What the real update does not show: the setup program that runs for the update is this very build, the version installed
// in step 1 too (the stand-in only publishes it as NEXT). So the older version is only planted (files, the entry's version
// numbers); a genuinely older setup program's entry being replaced by a newer one's is installer/test/uninstall-entry.test.mjs
// (the real streams.iss compiled as 9.0.0 / 9.0.1 / 9.1.0 for a tiny stage, run over each other with the app's switches).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchInstalled, readRecord, requestQuit } from './harness.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { FIRST_RUN: T } = await imp('desktop/src/renderer/texts/first-run.js')
const { SETTINGS } = await imp('desktop/src/renderer/texts/settings.js')
const { TOAST_ACTIVATOR_CLSID } = await imp('desktop/src/main/app-id.mjs')
const { SETUP_ARGS } = await imp('desktop/src/main/services/update.mjs')
const { startMockModel } = await imp('engine/mock/mock-model.mjs')
const { assetPath, releaseJson, startUpdateMock } = await imp('desktop/test/support/update-mock.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')

const RECORD = JSON.parse(readFileSync(join(REPO, 'installer', 'dist', 'build-record.json'), 'utf8'))
const SETUP = join(REPO, RECORD.installer.file)
const STAGE_MANIFEST = JSON.parse(readFileSync(join(REPO, 'installer', 'dist', 'stage-manifest.json'), 'utf8'))
const RELEASE = RECORD.release
const NEXT = (() => { const [a, b, c] = RELEASE.version.split('.').map(Number); return `${a}.${b}.${c + 1}` })()
const NEXT_SETUP = `Streams-${NEXT}-setup.exe`
// a version below release.json's, planted into this run's uninstall entry before the update (step 3)
const OLDER = (() => { const [a, b, c] = RELEASE.version.split('.').map(Number); return c > 0 ? `${a}.${b}.${c - 1}` : b > 0 ? `${a}.${b - 1}.99` : `${a - 1}.99.99` })()
// the addresses as docs/desktop.md §十九 documents them (written out here, not taken from the app's code)
const LATEST_URL = 'https://api.github.com/repos/AsuraNale/streams/releases/latest'
const DOWNLOAD_URL = `https://github.com/AsuraNale/streams/releases/download/v${NEXT}/${NEXT_SETUP}`
const UNINSTALL_ROOT = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
const UNINSTALL_KEY = `${UNINSTALL_ROOT}\\{${RELEASE.app_guid}}_is1`
const TOAST_KEY = `HKCU:\\Software\\Classes\\CLSID\\${TOAST_ACTIVATOR_CLSID}`
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const SYSTEM32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
const TEST_KEY = 'sk-streams-upgrade-test-key-0000000000000bb' // fake; the mock answers it, nothing real does
const TITLE = '升级测试项目'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
const inside = (p, dir) => resolve(p).toLowerCase().startsWith(`${resolve(dir).toLowerCase()}${sep}`)

const FROM_STAGE = process.env.YZ_W7_FROM_STAGE === '1'
const STARTED = Date.now()
const ROOT = mkdtempSync(join(tmpdir(), 'st-upgrade-'))
const PROFILE = join(ROOT, 'profile')
const W = {
  install: FROM_STAGE ? join(REPO, 'installer', 'dist', 'stage') : join(ROOT, 'install'),
  roaming: join(PROFILE, 'AppData', 'Roaming'),
  local: join(PROFILE, 'AppData', 'Local'),
  projects: join(ROOT, '研究项目'),
  traps: join(ROOT, 'traps'),
}
W.appData = join(W.roaming, RELEASE.install_folder)
W.exe = join(W.install, RELEASE.exe_name)
W.updates = join(W.appData, 'updates')
for (const d of [W.roaming, W.local, join(PROFILE, 'Desktop'), join(W.roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), W.traps]) mkdirSync(d, { recursive: true })
for (const d of ['app-data', 'dsh-home', 'projects', 'pick']) mkdirSync(join(W.traps, d), { recursive: true })

/** The test profile: what the setup program, the app and the app it opens again see as this user's folders. */
const profileEnv = () => ({ USERPROFILE: PROFILE, APPDATA: W.roaming, LOCALAPPDATA: W.local })

function ps(script, env = undefined) {
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8', windowsHide: true, timeout: 60_000, ...(env ? { env: { ...process.env, ...env } } : {}) })
  if (r.status !== 0) throw new Error(`powershell: ${r.stderr}`)
  return r.stdout.trim()
}
/** Where Windows puts a known folder for a process with this environment (not created, not checked). */
const knownFolder = (name, env) => ps(`[Environment]::GetFolderPath('${name}', 'DoNotVerify')`, env)
const uninstallEntry = () => {
  const out = ps(`if (Test-Path '${UNINSTALL_KEY}') { Get-ItemProperty '${UNINSTALL_KEY}' | Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString, DisplayIcon | ConvertTo-Json -Compress } else { 'none' }`)
  return out === 'none' ? null : JSON.parse(out)
}
/** The entry's version values as Inno Setup writes them from AppVersion (what Settings → Apps shows: DisplayVersion). */
const entryVersion = () => {
  const out = ps(`if (Test-Path '${UNINSTALL_KEY}') { Get-ItemProperty '${UNINSTALL_KEY}' | Select-Object DisplayVersion, MajorVersion, MinorVersion, VersionMajor, VersionMinor | ConvertTo-Json -Compress } else { 'none' }`)
  return out === 'none' ? null : JSON.parse(out)
}
const versionValues = v => { const [major, minor] = v.split('.').map(Number); return { DisplayVersion: v, MajorVersion: major, MinorVersion: minor, VersionMajor: major, VersionMinor: minor } }
/** Every uninstall entry of this user named like the app (the one this app's AppId owns, and any other). */
const entriesNamedLikeTheApp = () => {
  const out = ps(`@(Get-ChildItem '${UNINSTALL_ROOT}' | ForEach-Object { $n = $_.GetValue('DisplayName'); if ($n -and $n.StartsWith('${RELEASE.app_name}')) { $_.PSChildName } }) | ConvertTo-Json -Compress`)
  const v = out ? JSON.parse(out) : []
  return Array.isArray(v) ? v : [v]
}
const shortcut = path => (existsSync(path)
  ? JSON.parse(ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${path}'); $i = (New-Object -ComObject Shell.Application).NameSpace('${dirname(path)}').ParseName('${path.split(sep).pop()}'); @{ target = $s.TargetPath; workdir = $s.WorkingDirectory; icon = $s.IconLocation; aumid = [string]$i.ExtendedProperty('System.AppUserModel.ID'); clsid = [string]$i.ExtendedProperty('System.AppUserModel.ToastActivatorCLSID'); bytes = (Get-Item -LiteralPath '${path}').Length } | ConvertTo-Json -Compress`))
  : null)
const toastKey = () => {
  const out = ps(`if (Test-Path -LiteralPath '${TOAST_KEY}') { $k = Get-Item -LiteralPath '${TOAST_KEY}'; $l = Get-Item -LiteralPath '${TOAST_KEY}\\LocalServer32' -ErrorAction SilentlyContinue; @{ name = $k.GetValue(''); customActivator = $k.GetValue('CustomActivator'); localServer = $(if ($l) { $l.GetValue('') } else { $null }) } | ConvertTo-Json -Compress } else { 'none' }`)
  return out === 'none' ? null : JSON.parse(out)
}
/** Processes whose executable lies under `dir`, with whether they have a window. */
const processesUnder = dir => {
  const out = ps(`@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('${resolve(dir).toLowerCase()}') } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; @{ ProcessId = $_.ProcessId; Name = $_.Name; ParentProcessId = $_.ParentProcessId; Window = [bool]($p -and $p.MainWindowHandle -ne 0) } }) | ConvertTo-Json -Compress`)
  if (!out) return []
  const rows = JSON.parse(out)
  return Array.isArray(rows) ? rows : [rows]
}
/** This run's setup program and its unpacked part (Streams-<the stand-in's version>-setup.exe / .tmp), nothing else. */
const setupProcesses = () => {
  const names = [NEXT_SETUP, NEXT_SETUP.replace(/exe$/, 'tmp')]
  const out = ps(`@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${names[0]}' -or $_.Name -eq '${names[1]}' } | ForEach-Object { @{ ProcessId = $_.ProcessId; Name = $_.Name } }) | ConvertTo-Json -Compress`)
  if (!out) return []
  const rows = JSON.parse(out)
  return Array.isArray(rows) ? rows : [rows]
}
const endProcesses = rows => { for (const p of rows) spawnSync(join(SYSTEM32, 'taskkill.exe'), ['/PID', String(p.ProcessId), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) }
const zoneStreams = file => ps(`Get-Item -LiteralPath '${file}' -Stream * | ForEach-Object { $_.Stream }`).split(/\r?\n/)

function picture(root) {
  if (!existsSync(root)) return null
  const out = []
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      const st = lstatSync(p)
      out.push(`${relative(root, p)}|${st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : st.size}|${Math.round(st.mtimeMs)}`)
      if (st.isDirectory() && !st.isSymbolicLink()) walk(p)
    }
  }
  walk(root)
  return out.sort()
}
const fileFacts = p => (existsSync(p) ? `${statSync(p).size}|${Math.round(statSync(p).mtimeMs)}` : null)
const sha256File = path => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', d => h.update(d)).on('error', rej).on('end', () => res(h.digest('hex'))) })

// ---------------------------------------------------------------- the world of this run

const S = { real: {}, mock: null, gh: null, trap: null, trapRequests: [], desktopInProfile: true }

const turnSteps = [{ text: '好的，收到。' }]
const dispatch = async req => {
  if (req.body?.max_tokens === 1) return { text: 'ok' } // the key check
  return turnSteps.shift() ?? { error: { status: 400, type: 'invalid_request_error', message: 'no scripted step left' } }
}

/** The app's environment: the test profile, no Python or Node on PATH, the proxy trap, every development switch a trap. */
function appEnv() {
  const env = {}
  for (const k of ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'HOMEDRIVE', 'HOMEPATH', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION', 'OS', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'PSModulePath', 'PUBLIC', 'ALLUSERSPROFILE', 'SystemDrive']) {
    if (process.env[k] !== undefined) env[k] = process.env[k]
  }
  Object.assign(env, profileEnv())
  env.PATH = [SYSTEM32, join(SYSTEM32, 'Wbem'), join(SYSTEM32, 'WindowsPowerShell', 'v1.0')].join(';')
  env.HTTP_PROXY = S.mock.url
  env.HTTPS_PROXY = S.mock.url
  env.NO_PROXY = '127.0.0.1,localhost'
  Object.assign(env, {
    STREAMS_APP_DATA: join(W.traps, 'app-data'), STREAMS_DSH_HOME: join(W.traps, 'dsh-home'), STREAMS_PROJECTS_ROOT: join(W.traps, 'projects'),
    STREAMS_WINDOW: 'hidden', STREAMS_DEV_API_KEY: 'sk-development-trap-key-should-never-be-stored', STREAMS_DEV_MODEL_URL: S.trap.url,
    STREAMS_DEV_PICK_FOLDER: join(W.traps, 'pick'),
    // the update's development switches (desktop/src/main/main.mjs): a packaged app takes neither
    STREAMS_DEV_UPDATE_URL: S.trap.url, STREAMS_DEV_UPDATE_SETUP_RECORD: join(W.traps, 'setup-record.json'),
  })
  return env
}

// setupLog: the harness adds /LOG=<it> to the setup program it really starts (the app's own five arguments stay as recorded;
// the app itself never asks for a log, docs/installer.md 11.1): step 5 reads the update's [InstallDelete] answer there
const hook = (n, more = {}) => ({
  appData: W.roaming, localAppData: W.local, mockUrl: S.mock.url, balanceUrl: S.balance.url, githubUrl: S.gh.url,
  setupSpawn: FROM_STAGE ? 'record' : 'run', setupLog: join(ROOT, `setup-${n}.log`), recordFile: join(ROOT, `record-${n}.jsonl`), pickFolder: W.projects, quitFile: join(ROOT, `quit-${n}`), ...more,
})
const records = (n, kind) => readRecord(hook(n).recordFile).filter(r => r.kind === kind)
/** The [InstallDelete] answers ([Code] OldCopyHere) an Inno Setup log of this app's setup program wrote, in order ('0' / '1'). */
const oldCopyAnswers = text => [...text.matchAll(/An older copy of the app in this folder \(its program files are removed first\): ([01])/g)].map(m => m[1])

/**
 * Closes what runs from the program folder: the windows of Streams the ordinary way (taskkill without /F: as when the user
 * closes the window), up to 30 s for it all to end, then ends whatever is left. Returns what was left (ended by force).
 */
async function closeInstalledApp() {
  for (const p of processesUnder(W.install).filter(r => /^Streams\.exe$/i.test(r.Name) && r.Window)) spawnSync(join(SYSTEM32, 'taskkill.exe'), ['/PID', String(p.ProcessId)], { stdio: 'ignore', windowsHide: true })
  for (let i = 0; i < 60 && processesUnder(W.install).length; i += 1) await sleep(500)
  const still = processesUnder(W.install)
  if (still.length) endProcesses(still)
  for (let i = 0; i < 20 && processesUnder(W.install).length; i += 1) await sleep(500)
  return still
}

before(async () => {
  assert.equal(process.platform, 'win32', 'the installer is Windows-only')
  assert.ok(existsSync(SETUP), `no installer at ${SETUP}: run node installer/build-installer.mjs`)
  S.setupSha = await sha256File(SETUP)
  assert.equal(S.setupSha, RECORD.installer.sha256, 'the installer is the one the build recorded')
  // guards: a real install of Streams is never updated, uninstalled or touched — the full run refuses next to one, as
  // packaged.test.mjs does (FROM_STAGE installs nothing and starts no setup program: there it is pictured)
  S.real.entry = uninstallEntry()
  S.real.toastKey = toastKey()
  S.real.startMenu = join(knownFolder('Programs'), `${RELEASE.app_name}.lnk`)
  S.real.desktop = join(knownFolder('DesktopDirectory'), `${RELEASE.app_name}.lnk`)
  if (!FROM_STAGE) {
    assert.equal(S.real.entry, null, `a Streams uninstall entry exists (${UNINSTALL_KEY}): this test would update that install; run it where Streams is not installed`)
    assert.equal(S.real.toastKey, null, `${TOAST_KEY} exists: this test does not touch the app's own registration`)
    assert.equal(existsSync(S.real.startMenu), false, `${S.real.startMenu} exists: Streams is installed here (or was); run it where it is not`)
    assert.equal(existsSync(S.real.desktop), false, `${S.real.desktop} exists: Streams is installed here (or was); run it where it is not`)
  }
  // the test profile: Windows resolves its folders inside it for the setup program and the app (USERPROFILE, APPDATA,
  // LOCALAPPDATA); the desktop may be redirected elsewhere (OneDrive): then no desktop shortcut is made
  for (const name of ['Programs', 'ApplicationData', 'LocalApplicationData']) {
    const p = knownFolder(name, profileEnv())
    assert.ok(inside(p, PROFILE), `${name} resolves to ${p}, outside the test profile: this run would write into the real one`)
  }
  S.programs = knownFolder('Programs', profileEnv())
  S.desktopDir = knownFolder('DesktopDirectory', profileEnv())
  S.desktopInProfile = inside(S.desktopDir, PROFILE)
  S.startMenu = join(S.programs, `${RELEASE.app_name}.lnk`)
  S.desktop = join(S.desktopDir, `${RELEASE.app_name}.lnk`)
  // the real ones, pictured (names, sizes, times: nothing read inside)
  S.real.before = {
    dsh: picture(join(homedir(), '.dsh')), appData: picture(join(process.env.APPDATA, RELEASE.install_folder)), localAppData: picture(join(process.env.LOCALAPPDATA, RELEASE.install_folder)),
    startMenu: fileFacts(S.real.startMenu), desktop: fileFacts(S.real.desktop), entry: S.real.entry, toastKey: S.real.toastKey,
  }
  S.mock = await startMockModel({ script: Array.from({ length: 20 }, () => dispatch), unref: true })
  const { startBalanceMock, reading } = await imp('desktop/test/support/balance-mock.mjs')
  S.balance = await startBalanceMock({ response: reading({ cny: { total: 23.45, granted: 0, toppedUp: 23.45 } }) })
  // the stand-in for GitHub: a higher version whose setup program is this very build (the same bytes, so its SHA-256) — in the
  // full run, where it really runs. FROM_STAGE (nothing may be installed, and a real install may be on this machine): bytes
  // that are no program (no "MZ"), so that even a start the harness failed to record could not run anything
  S.payload = SETUP
  if (FROM_STAGE) {
    S.payload = join(ROOT, 'not-a-program.bin')
    writeFileSync(S.payload, Buffer.alloc(8 * 1024 * 1024, 0x2e))
  }
  S.payloadSha = S.payload === SETUP ? S.setupSha : await sha256File(S.payload)
  S.gh = await startUpdateMock()
  S.gh.setLatest({ status: 200, body: releaseJson({ version: NEXT, base: 'https://github.com/', size: statSync(S.payload).size, sha256: S.payloadSha, notes: '升级测试：同一个安装包，版本号高一位。' }) })
  S.gh.serve(assetPath(NEXT), { file: S.payload, chunk: 1024 * 1024 })
  S.trap = await new Promise(r => {
    const server = createServer((req, res) => { S.trapRequests.push(`${req.method} ${req.url}`); res.writeHead(500).end() })
    server.on('connect', (req, socket) => { S.trapRequests.push(`CONNECT ${req.url}`); socket.destroy() })
    server.listen(0, '127.0.0.1', () => { server.unref(); r({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }) })
  })
})

after(async () => {
  const left = existsSync(W.install) ? processesUnder(W.install) : []
  if (left.length) { process.stderr.write(`after: ending ${left.length} process(es) of the install\n`); endProcesses(left) }
  if (!FROM_STAGE) {
    // a setup program of this run still going, then the uninstaller — only ever this run's own install (its folder)
    endProcesses(setupProcesses())
    const entry = uninstallEntry()
    if (entry && same(entry.InstallLocation ?? '', W.install) && existsSync(join(W.install, 'unins000.exe'))) {
      spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, env: { ...process.env, ...profileEnv() } })
      for (let i = 0; i < 120 && uninstallEntry(); i += 1) await sleep(500)
    }
    // the real HKCU keys this run wrote, whatever the uninstaller did: removed when they still name this run's folder — never
    // when they name another (a real install's)
    const leftEntry = uninstallEntry()
    if (leftEntry && same(leftEntry.InstallLocation ?? '', W.install)) {
      process.stderr.write(`after: removing this run's uninstall entry ${UNINSTALL_KEY}\n`)
      ps(`Remove-Item -LiteralPath '${UNINSTALL_KEY}' -Recurse -Force`)
    }
    const leftKey = toastKey()
    if (leftKey && typeof leftKey.localServer === 'string' && inside(leftKey.localServer, ROOT)) {
      process.stderr.write(`after: removing this run's notification activator key ${TOAST_KEY}\n`)
      ps(`Remove-Item -LiteralPath '${TOAST_KEY}' -Recurse -Force`)
    }
    for (const n of readdirSync(tmpdir()).filter(n => /^is-.*-uninstall.tmp$/i.test(n) && statSync(join(tmpdir(), n)).mtimeMs >= STARTED)) {
      try { removeTree(join(tmpdir(), n), { waitMs: 10_000 }) } catch { /* still in use: left */ }
    }
  }
  await S.mock?.close()
  await S.balance?.close()
  await S.gh?.close()
  S.trap?.close()
  await sleep(500)
  removeTree(ROOT, { waitMs: 30_000 })
})

// ---------------------------------------------------------------- 1. install

test('1 · the current build, installed silently into the test profile: no app opened afterwards (no /STRELAUNCH)', { skip: FROM_STAGE && 'YZ_W7_FROM_STAGE: not the installer' }, async () => {
  const r = spawnSync(SETUP, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`, `/LOG=${join(ROOT, 'install.log')}`, ...(S.desktopInProfile ? [] : ['/MERGETASKS=!desktopicon'])],
    { windowsHide: true, timeout: 600_000, env: { ...process.env, ...profileEnv() } })
  assert.equal(r.status, 0, `setup exit code ${r.status}`)
  const entry = uninstallEntry()
  assert.ok(entry && same(entry.InstallLocation, W.install), JSON.stringify(entry))
  assert.equal(entry.DisplayVersion, RELEASE.version)
  assert.deepEqual(entryVersion(), versionValues(RELEASE.version))
  S.entry = entry
  assert.ok(existsSync(S.startMenu), `the Start-menu shortcut in the test profile: ${S.startMenu}`)
  if (S.desktopInProfile) assert.ok(existsSync(S.desktop), S.desktop)
  S.shortcuts = { startMenu: shortcut(S.startMenu), desktop: S.desktopInProfile ? shortcut(S.desktop) : null }
  assert.ok(same(S.shortcuts.startMenu.target, W.exe))
  S.toastKey = toastKey()
  assert.ok(S.toastKey && same(S.toastKey.localServer, W.exe), JSON.stringify(S.toastKey))
  assert.deepEqual(entriesNamedLikeTheApp(), [`{${RELEASE.app_guid}}_is1`])
  // the installer's log says the clean-up was not for a first install, and that nothing opens again by itself
  const log = readFileSync(join(ROOT, 'install.log'), 'utf8')
  assert.match(log, /An older copy of the app in this folder \(its program files are removed first\): 0/)
  assert.match(log, /Open the app again after the update: 0/)
  await sleep(3000)
  assert.deepEqual(processesUnder(W.install), [], 'nothing of the install runs: a silent install without /STRELAUNCH opens nothing')
  // the real shortcuts were not made or changed
  assert.equal(fileFacts(S.real.startMenu), S.real.before.startMenu)
  assert.equal(fileFacts(S.real.desktop), S.real.before.desktop)
})

// ---------------------------------------------------------------- 2. a first start with a project

let A = null
const page = () => A.page
const until = (fn, arg, timeout = 90_000) => page().waitForFunction(fn, arg, { polling: 200, timeout })

test('2 · a first start: a key, a folder, one project with one turn', async () => {
  A = await launchInstalled({ exe: W.exe, env: appEnv(), hook: hook(1), repo: REPO, cwd: W.install })
  await until(() => document.querySelector('main[data-screen="first-run"][data-state="ready"]'))
  await page().fill('#first-run-key', TEST_KEY)
  await until(w => document.getElementById('first-run-key-status')?.textContent === w, T.keyOk)
  await page().click('.first-run__footer .st-button--primary')
  await until(() => document.querySelector('.first-run__body')?.dataset.step === '2' && document.querySelector('[data-loaded="yes"]'))
  await page().click('.first-run__other .st-button')
  await until(() => document.querySelector('.first-run__chosen'))
  await page().click('.first-run__footer .st-button--primary')
  await until(() => document.querySelector('main[data-screen="home"][data-state="ready"]'), null, 120_000)
  await page().click('.st-sidebar__new')
  await until(() => document.querySelector('#new-project-name'))
  await page().fill('#new-project-name', TITLE)
  await page().fill('#new-project-request', '看看县域充电设施的建设情况。')
  await page().click('.new-project__bar .st-button--primary')
  await until(() => document.querySelector('[data-stop]') || document.querySelector('.wb-chat'), null, 120_000)
  await until(() => !document.querySelector('[data-stop]') && !document.querySelector('[data-busy]'), null, 180_000)
  const registry = JSON.parse(readFileSync(join(W.appData, 'projects.json'), 'utf8'))
  S.project = registry.projects.find(p => p.title === TITLE)
  assert.ok(S.project && existsSync(S.project.path), JSON.stringify(registry))
})

// ---------------------------------------------------------------- 3. check and download in the packaged app

test('3 · 「关于」 says the packaged version; 检查更新 asks GitHub\'s own address once; 下载并更新 → the release\'s file in <appData>\\updates, no mark of the web', async () => {
  await page().click('.st-sidebar__footer-button')
  await until(() => document.querySelector('main[data-screen="settings"][data-state="ready"]') && document.querySelector('[data-update-root]'))
  assert.equal(await page().evaluate(() => document.querySelector('[data-version]').textContent), `流息 ${RELEASE.version}（Windows 版）`, 'release.json\'s version, no 开发版')
  assert.equal(await A.evaluate('require(\'electron\').app.getVersion()'), RELEASE.version)
  await page().click('[data-update-action="check"] button')
  await until(() => document.querySelector('[data-update="available"]'), null, 60_000)
  const asked = records(1, 'github-request')
  assert.deepEqual(asked.map(r => [r.url, r.method, r.accept, r.userAgent]), [[LATEST_URL, 'GET', 'application/vnd.github+json', `Streams/${RELEASE.version}`]], 'one check, to GitHub\'s own address')
  assert.equal(S.gh.checks().length, 1)
  assert.ok((await page().evaluate(() => document.querySelector('[data-update="available"]').innerText)).includes(`有新版本：${NEXT}`))
  await page().click('[data-update-action="download"] button')
  await until(() => document.querySelector('[data-update="ready"]'), null, 600_000)
  const file = join(W.updates, NEXT_SETUP)
  assert.deepEqual(readdirSync(W.updates), [NEXT_SETUP])
  assert.equal(statSync(file).size, statSync(S.payload).size)
  assert.equal(await sha256File(file), S.payloadSha, 'the release\'s SHA-256')
  assert.deepEqual(zoneStreams(file), [':$DATA'], 'no Zone.Identifier: nothing for SmartScreen to stop')
  assert.deepEqual(records(1, 'github-request').slice(1).map(r => [r.url, r.method, r.accept]), [[DOWNLOAD_URL, 'GET', 'application/octet-stream']])
  assert.deepEqual(S.trapRequests, [], 'STREAMS_DEV_UPDATE_URL was not taken')
  assert.equal(existsSync(join(W.traps, 'setup-record.json')), false, 'STREAMS_DEV_UPDATE_SETUP_RECORD was not taken')
  assert.ok((await page().evaluate(() => document.querySelector('[data-update="ready"]').innerText)).includes(SETTINGS.update.readyText))
  if (!FROM_STAGE) {
    // a file of an older version in the program folder (one that version had and this one has not), and a file of the
    // user's at the folder's top (not a name of the stage): the first goes with the update, the second stays
    S.planted = [join(W.install, 'resources', 'app', 'src', 'main', 'left-by-an-older-version.mjs'), join(W.install, 'locales', 'xx-OLDER.pak')]
    for (const p of S.planted) writeFileSync(p, 'from an older version\n')
    S.userFile = join(W.install, 'notes-of-the-user.txt')
    writeFileSync(S.userFile, 'mine\n')
    // and the older version's numbers in the uninstall entry — this run's own (it names this run's folder): the update has to
    // write its own version there for Settings → Apps to show it (step 5)
    const entry = uninstallEntry()
    assert.ok(entry && same(entry.InstallLocation, W.install), `the entry is this run's: ${JSON.stringify(entry)}`)
    const older = versionValues(OLDER)
    ps(`Set-ItemProperty -LiteralPath '${UNINSTALL_KEY}' -Name DisplayVersion -Value '${OLDER}'; ${['MajorVersion', 'MinorVersion', 'VersionMajor', 'VersionMinor'].map(n => `Set-ItemProperty -LiteralPath '${UNINSTALL_KEY}' -Name ${n} -Value ${older[n]} -Type DWord`).join('; ')}`)
    assert.deepEqual(entryVersion(), older, 'the planted older version')
  }
})

// ---------------------------------------------------------------- 4. the update itself

test('4 · 开始更新: the setup program started on its own with the five arguments, the app quits the ordinary way; the setup program installs and opens Streams again', async () => {
  const quitAt = Date.now()
  await page().click('[data-update-action="start"] button')
  // no debugger may hold the app at its exit (Node waits for one): Playwright and the inspector let go now
  await sleep(100)
  await A.detach()
  const exit = await Promise.race([A.exited, sleep(60_000).then(() => null)])
  const tail = () => { try { return readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8').split('\n').slice(-15).join('\n') } catch { return '(no log)' } }
  assert.ok(exit, `the app ended by itself; the record: ${readRecord(hook(1).recordFile).slice(-8).map(r => r.kind).join(', ')}; the log:\n${tail()}`)
  const rec = readRecord(hook(1).recordFile)
  const spawned = rec.filter(r => r.kind === 'setup-spawn')
  assert.equal(spawned.length, 1)
  assert.ok(same(spawned[0].command, join(W.updates, NEXT_SETUP)), spawned[0].command)
  assert.deepEqual(spawned[0].args, [...SETUP_ARGS])
  assert.deepEqual(spawned[0].args, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/STRELAUNCH=1'])
  assert.deepEqual([spawned[0].detached, spawned[0].stdio, spawned[0].windowsHide], [true, 'ignore', true])
  // the one thing the test adds to the real start: Inno Setup's log, after the app's own arguments (the harness; step 5 reads it)
  assert.equal(spawned[0].testLog, FROM_STAGE ? null : hook(1).setupLog)
  // the app's own quit after it (before-quit, will-quit, Node's exit, recorded by the harness)
  const after = rec.filter(r => r.t >= spawned[0].t).map(r => r.kind)
  for (const k of ['before-quit', 'will-quit', 'exit']) assert.ok(after.includes(k), `${k} after the setup program started: ${after.join(', ')}`)
  if (FROM_STAGE) return
  // the setup program: it runs, then it is gone; Streams runs again from the program folder, with a window
  let seenSetup = false
  let relaunched = []
  for (let i = 0; i < 600; i += 1) {
    const setups = setupProcesses()
    if (setups.length) seenSetup = true
    relaunched = processesUnder(W.install).filter(p => /^Streams\.exe$/i.test(p.Name) && p.Window)
    if (seenSetup && !setups.length && relaunched.length) break
    await sleep(1000)
  }
  S.updateSeconds = Math.round((Date.now() - quitAt) / 1000)
  assert.ok(seenSetup, 'the setup program ran')
  assert.deepEqual(setupProcesses(), [], 'the setup program has ended')
  assert.ok(relaunched.length >= 1, `Streams runs again from the program folder with a window: ${JSON.stringify(processesUnder(W.install))}`)
  S.relaunched = relaunched
})

// ---------------------------------------------------------------- 5. after the update

test('5 · after it: the older version\'s file gone, the user\'s stays; the program files the stage\'s; one uninstall entry; shortcuts, notification key, data and project as before; Streams open again', { skip: FROM_STAGE && 'YZ_W7_FROM_STAGE: nothing was installed' }, async () => {
  // whatever fails below, the app the setup program opened again is closed before this step ends (finally): left running it
  // holds the app's single-instance lock and step 6's start, then step 7's uninstall, would fail for it too
  let still = null
  try {
    // the setup program's own log (the harness's /LOG): [InstallDelete]'s answer — this folder holds this app's older copy —
    // given before the first entry deleted anything and kept for every entry ([Code] OldCopyHere; 10-12 it was asked afresh
    // per entry and turned to 0 once the 4th entry, Streams.exe, was gone: the other 16 entries were skipped)
    const setupLog = existsSync(hook(1).setupLog) ? readFileSync(hook(1).setupLog, 'utf8') : ''
    const answers = oldCopyAnswers(setupLog)
    S.installDeleteAnswers = answers
    assert.ok(answers.length >= 1 && answers.every(a => a === '1'), `the update's [InstallDelete] answers in ${hook(1).setupLog}: ${answers.join(' ') || '(none)'}`)
    for (const p of S.planted) assert.equal(existsSync(p), false, `${p} was removed by the update`)
    assert.ok(existsSync(S.userFile), 'a file of the user\'s at the folder\'s top is not a name of the stage: it stays')
    // the program folder is the stage, file for file (plus the uninstaller and the user's file)
    const installed = new Map()
    const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else installed.set(relative(W.install, p).split(sep).join('/'), p) } }
    walk(W.install)
    const staged = new Set(STAGE_MANIFEST.files.map(f => f.path))
    assert.deepEqual([...installed.keys()].filter(p => !staged.has(p)).sort(), ['notes-of-the-user.txt', 'unins000.dat', 'unins000.exe'])
    for (const f of STAGE_MANIFEST.files) assert.equal(statSync(installed.get(f.path)).size, f.bytes, f.path)
    // one uninstall entry, the same; the shortcuts and the notification activator key as the first install made them
    assert.deepEqual(entriesNamedLikeTheApp(), [`{${RELEASE.app_guid}}_is1`])
    // the version the update installed, not the planted OLDER (Settings → Apps; 2026-10-13 the entry stayed behind): the
    // update's setup program is release.json's version, the one that ran last
    assert.deepEqual(entryVersion(), versionValues(RELEASE.version), `the uninstall entry's version after the update (planted before it: ${OLDER})`)
    assert.deepEqual(uninstallEntry(), S.entry)
    // [Code] UninstallEntryVersion's line in the update's log: Inno Setup had written the entry anew, so it shows this version
    assert.ok(setupLog.includes(`The uninstall entry shows this version: ${RELEASE.version}`), `[Code] UninstallEntryVersion's line in ${hook(1).setupLog}`)
    assert.deepEqual({ startMenu: shortcut(S.startMenu), desktop: S.desktopInProfile ? shortcut(S.desktop) : null }, S.shortcuts)
    assert.deepEqual(toastKey(), S.toastKey)
    // the app's data and the project
    const registry = JSON.parse(readFileSync(join(W.appData, 'projects.json'), 'utf8'))
    assert.ok(registry.projects.some(p => p.id === S.project.id && p.title === TITLE))
    assert.ok(existsSync(S.project.path) && readdirSync(S.project.path).length > 0)
    // Streams was opened again: it started (its start removes what it can of the updates folder) and has a window; closed
    // below the ordinary way (its window closed), the relaunched app's only request out being its balance read (no harness
    // there: through the proxy trap, refused)
    await sleep(2000)
    const log = readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8')
    const updateStarted = log.indexOf(`update: the setup program of ${NEXT} started`)
    assert.ok(updateStarted >= 0, 'the first run started the setup program')
    assert.match(log.slice(updateStarted), /update: the updates folder: \d+ file\(s\) removed/, 'the app opened again started after it (its start looked at the updates folder)')
  } finally {
    still = await closeInstalledApp()
  }
  assert.deepEqual(still, [], 'the relaunched app closed when its window was closed')
  assert.ok(S.mock.egress.every(e => e.method === 'CONNECT' && e.target === 'api.deepseek.com:443'), JSON.stringify(S.mock.egress))
  assert.equal(S.mock.egress.some(e => /github/i.test(e.target)), false, 'nothing went to GitHub')
})

// ---------------------------------------------------------------- 6. a start after the update

test('6 · a start after it: the home page with the project, 「关于」 the version, the updates folder empty again', { skip: FROM_STAGE && 'YZ_W7_FROM_STAGE: nothing was installed' }, async () => {
  // an earlier step that failed may have left the setup program or the app it opened running (step 5 closes the app even
  // when it fails; a setup program step 4 gave up waiting for may open it later): ended first, so that this start is not
  // refused by the single-instance lock of one of them — that earlier step has already failed and said why
  const leftSetup = setupProcesses()
  if (leftSetup.length) { process.stderr.write(`step 6: ending this run's setup program, still running\n`); endProcesses(leftSetup) }
  const left = await closeInstalledApp()
  if (left.length) process.stderr.write(`step 6: ended ${left.length} process(es) of the install an earlier step left running\n`)
  const B = await launchInstalled({ exe: W.exe, env: appEnv(), hook: hook(2), repo: REPO, cwd: W.install })
  try {
    await B.page.waitForFunction(() => document.querySelector('main[data-screen="home"][data-state="ready"]'), null, { polling: 200, timeout: 90_000 })
    assert.ok((await B.page.evaluate(() => document.querySelector('main').innerText)).includes(TITLE))
    await B.page.click('.st-sidebar__footer-button')
    await B.page.waitForFunction(() => document.querySelector('[data-version]'), null, { polling: 200, timeout: 60_000 })
    assert.equal(await B.page.evaluate(() => document.querySelector('[data-version]').textContent), `流息 ${RELEASE.version}（Windows 版）`)
    assert.deepEqual(readdirSync(W.updates), [], 'the setup program that ran is gone')
    assert.equal((await B.page.evaluate(() => window.streams.getUpdateState())).data.state, 'idle', 'no check by itself')
  } finally {
    await B.detach()
    requestQuit(hook(2).quitFile)
    const exit = await Promise.race([B.exited, sleep(60_000).then(() => null)])
    if (!exit) endProcesses(processesUnder(W.install))
  }
})

// ---------------------------------------------------------------- 7. uninstall

test('7 · the silent uninstall: everything of it gone; the real folders and shortcuts as before', async () => {
  if (!FROM_STAGE) {
    assert.deepEqual(processesUnder(W.install), [])
    const r = spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/LOG=${join(ROOT, 'uninstall.log')}`], { windowsHide: true, timeout: 120_000, env: { ...process.env, ...profileEnv() } })
    assert.equal(r.status, 0)
    // the folder itself stays: the user's own file at its top is not the uninstaller's to delete (step 3 put it there). So
    // the wait is for the uninstaller's last file (it deletes itself last), not for the folder to go
    const leftInFolder = () => (existsSync(W.install) ? readdirSync(W.install).sort() : [])
    for (let i = 0; i < 240 && (uninstallEntry() || leftInFolder().some(n => n !== 'notes-of-the-user.txt')); i += 1) await sleep(500)
    assert.equal(uninstallEntry(), null)
    assert.equal(existsSync(join(W.install, RELEASE.exe_name)), false, 'the program files are gone')
    assert.deepEqual(leftInFolder(), ['notes-of-the-user.txt'], 'nothing of the install is left in its folder, the user\'s own file is')
    assert.equal(existsSync(S.startMenu), false)
    assert.equal(existsSync(S.desktop), false)
    assert.equal(toastKey(), null)
  }
  // the real ones: as before (FROM_STAGE: a real install there stays as it was)
  const now = {
    dsh: picture(join(homedir(), '.dsh')), appData: picture(join(process.env.APPDATA, RELEASE.install_folder)), localAppData: picture(join(process.env.LOCALAPPDATA, RELEASE.install_folder)),
    startMenu: fileFacts(S.real.startMenu), desktop: fileFacts(S.real.desktop), entry: uninstallEntry(), toastKey: toastKey(),
  }
  assert.deepEqual(now, S.real.before)
  writeFileSync(join(REPO, 'installer', 'dist', `upgrade-test-result${FROM_STAGE ? '-from-stage' : ''}.json`), `${JSON.stringify({
    at: new Date().toISOString(), fromStage: FROM_STAGE, installer: RECORD.installer, next: NEXT, githubRequests: records(1, 'github-request'), setupSpawn: records(1, 'setup-spawn'),
    published: { what: FROM_STAGE ? 'bytes that are no program (YZ_W7_FROM_STAGE)' : 'this build\'s setup program', bytes: statSync(S.payload).size, sha256: S.payloadSha },
    updateSeconds: S.updateSeconds ?? null, relaunched: S.relaunched ?? null, desktopInProfile: S.desktopInProfile, egress: S.mock.egress,
    // the update's [InstallDelete] answers in the setup program's own log (step 5): one, 1
    installDeleteAnswers: S.installDeleteAnswers ?? null,
  }, null, 2)}\n`)
})
