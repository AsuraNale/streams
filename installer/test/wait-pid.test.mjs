// The update's handshake on the setup program's side (installer/setup/streams.iss [Code] WaitForTheApp, run from
// PrepareToInstall; docs/installer.md §七), checked in seconds and on any machine, as install-delete.test.mjs does it: the
// real streams.iss compiled with the pinned ISCC for a tiny stage under a test identity of its own (its own AppId, toast
// activator CLSID, name and install folder: nothing of Streams'), then installed for real into this run's folder, each time
// with a process of this test's own that lives a few seconds more (a Node child: `node -e "setTimeout(…)"`):
//   A. /STWAITPID=<that process>: the setup program waits for it — the log says "process <pid> exited after <n> ms", n at
//      least most of the process's remaining life — and only then installs; the line comes before the Restart Manager's
//      and before "Starting the installation process"
//   B. the same slow process, no /STWAITPID (an install not started by the app; the app before the handshake): the log says
//      "no /STWAITPID given", there is no "exited after" line, and the setup program has finished while that process still
//      runs (nothing waited)
//   C. /STWAITPID=12ab and /STWAITPID=0: "is not a process id", nothing waited
//   D. the id of a process that has exited: "is not running"
//   E. compiled with a limit of 2 s (WaitPidTimeoutMs, the define the build leaves at 60 000) and a process that lives 8 s:
//      "still running after <n> ms (limit 2000 ms)", n ≥ 2000, and the install goes on
// Every case installs over the same folder (the test identity's copy), and after() uninstalls it.
// What it writes for real (the setup program's folders are moved into a profile of this run's own; it refuses unless Windows
// resolves them inside it): the test identity's uninstall entry and toast activator key under HKCU — removed by the
// uninstaller in after(), and directly when they still name this run's folder.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { ensureInnoSetup } = await imp('installer/innosetup/setup_innosetup.mjs')
const { installDeleteList } = await imp('installer/install-delete.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { tempDir } = await imp('desktop/scripts/lib/temp.mjs')
const { ICON_FILE } = await imp('desktop/src/main/icon.mjs')
const { SETUP_ARGS } = await imp('desktop/src/main/services/update.mjs')

const WINDOWS = process.platform === 'win32'
// the test identity: never Streams' (installer/setup/release.json app_guid, desktop/src/main/app-id.mjs), nor another test's
const TEST = {
  guid: '20793815-539D-4C91-9B7C-352840BD8C2D', clsid: '43DD9F8A-022C-4743-B61B-9CA990321A13',
  name: 'st-wait-pid-test', folder: 'StWaitPidTest', exe: 'Streams.exe', aumid: 'StarryDigital.Streams.WaitPidTest',
}
const PREFIX = 'st-wait-pid-'
const UNINSTALL_KEY = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{${TEST.guid}}_is1`
const TOAST_KEY = `HKCU:\\Software\\Classes\\CLSID\\{${TEST.clsid}}`
const POWERSHELL = WINDOWS ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : ''
const sleep = ms => new Promise(r => setTimeout(r, ms))
const inside = (p, dir) => resolve(p).toLowerCase().startsWith(`${resolve(dir).toLowerCase()}${sep}`)
const WAIT_LINE = /Wait for the app to exit: (.*)/

const ROOT = tempDir(PREFIX)
const PROFILE = join(ROOT, 'profile')
const X = join(ROOT, 'install')
const STARTED = Date.now()
const env = { ...process.env, USERPROFILE: PROFILE, APPDATA: join(PROFILE, 'AppData', 'Roaming'), LOCALAPPDATA: join(PROFILE, 'AppData', 'Local') }
const SETUPS = {}
const children = []

function ps(script, withEnv = false) {
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8', windowsHide: true, timeout: 60_000, ...(withEnv ? { env } : {}) })
  if (r.status !== 0) throw new Error(`powershell: ${r.stderr}`)
  return r.stdout.trim()
}
const entry = () => { const o = ps(`if (Test-Path -LiteralPath '${UNINSTALL_KEY}') { Get-ItemProperty -LiteralPath '${UNINSTALL_KEY}' | Select-Object 'Inno Setup: App Path', DisplayVersion | ConvertTo-Json -Compress } else { 'none' }`); return o === 'none' ? null : JSON.parse(o) }
const toastServer = () => { const o = ps(`if (Test-Path -LiteralPath '${TOAST_KEY}') { [string](Get-Item -LiteralPath '${TOAST_KEY}\\LocalServer32' -ErrorAction SilentlyContinue).GetValue('') } else { 'none' }`); return o === 'none' ? null : o }
const removeKey = key => ps(`Remove-Item -LiteralPath '${key}' -Recurse -Force`)
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }

/** A process of this test's own that lives `ms` more: { pid, exited: Promise, alive() }. */
function slowProcess(ms) {
  const child = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`], { stdio: 'ignore', windowsHide: true })
  children.push(child)
  let done = false
  const exited = new Promise(r => child.once('exit', () => { done = true; r(Date.now()) }))
  return { pid: child.pid, exited, alive: () => !done }
}

/** The setup program with the app's switches but /VERYSILENT and without /STRELAUNCH (the stage's Streams.exe is not a program). */
const appSwitches = SETUP_ARGS.filter(a => a !== '/SILENT' && !/^\/STRELAUNCH=/i.test(a))
function runSetup(name, extra, log) {
  const t0 = Date.now()
  const r = spawnSync(SETUPS[name], ['/VERYSILENT', ...appSwitches, '/SP-', `/DIR=${X}`, '/MERGETASKS=!desktopicon', ...extra, `/LOG=${log}`], { windowsHide: true, timeout: 180_000, env })
  assert.equal(r.status, 0, `the test setup program's exit code (${extra.join(' ')}): ${r.status}`)
  const text = readFileSync(log, 'utf8')
  const lines = text.split(/\r?\n/)
  const waits = lines.filter(l => WAIT_LINE.test(l)).map(l => WAIT_LINE.exec(l)[1])
  const at = re => lines.findIndex(l => re.test(l))
  return { ms: Date.now() - t0, text, waits, waitAt: at(WAIT_LINE), rmAt: at(/RestartManager/i), installAt: at(/Starting the installation process/) }
}

before(async () => {
  if (!WINDOWS) return
  // a run killed before its after() leaves the test identity's two keys: removed when they name a folder of this test's
  const left = entry()
  if (left) {
    const at = left['Inno Setup: App Path'] ?? ''
    assert.ok(inside(at, tmpdir()) && relative(tmpdir(), at).startsWith(PREFIX), `${UNINSTALL_KEY} names ${at}, not a folder of this test's: refusing`)
    removeKey(UNINSTALL_KEY)
  }
  const leftServer = toastServer()
  if (leftServer !== null) {
    assert.ok(inside(leftServer, tmpdir()) && relative(tmpdir(), leftServer).startsWith(PREFIX), `${TOAST_KEY} names ${leftServer}, not a folder of this test's: refusing`)
    removeKey(TOAST_KEY)
  }
  for (const d of [join(PROFILE, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), join(PROFILE, 'AppData', 'Local'), join(PROFILE, 'Desktop')]) mkdirSync(d, { recursive: true })
  for (const name of ['Programs', 'ApplicationData', 'LocalApplicationData']) {
    const p = ps(`[Environment]::GetFolderPath('${name}', 'DoNotVerify')`, true)
    assert.ok(inside(p, PROFILE), `${name} resolves to ${p}, outside the test profile: this run would write into the real one`)
  }
  // the stage, its clean-up list, two setup programs from the real streams.iss: as the build leaves it, and with a 2 s limit
  const stage = join(ROOT, 'stage')
  const icon = join(REPO, 'desktop', ...ICON_FILE)
  put(join(stage, 'LICENSE'), 'license\n')
  put(join(stage, TEST.exe), 'not a program\n')
  put(join(stage, 'resources', 'app', 'package.json'), '{"version":"3.0.0"}\n')
  put(join(stage, 'resources', 'app', ...ICON_FILE), readFileSync(icon))
  writeFileSync(join(ROOT, 'install-delete.iss'), installDeleteList(stage).text)
  const { iscc } = await ensureInnoSetup({ install: false })
  const iss = readFileSync(join(REPO, 'installer', 'setup', 'streams.iss'), 'utf8')
  assert.match(iss, /^\s*#define WaitPidTimeoutMs 60000$/m, 'the limit the build leaves: 60 s')
  for (const [name, more] of [['default', {}], ['short-limit', { WaitPidTimeoutMs: '2000' }]]) {
    const defines = {
      StageDir: stage, OutputDir: join(ROOT, 'out'), OutputBaseFilename: `${TEST.name}-${name}-setup`, AppVersion: '3.0.0',
      AppName: TEST.name, AppVerName: `${TEST.name} 3`, AppPublisher: 'test', AppGuid: TEST.guid, AppCopyright: 'Copyright (C) 2026 test',
      InstallFolder: TEST.folder, ExeName: TEST.exe, AppUserModelId: TEST.aumid, ToastActivatorClsid: TEST.clsid,
      SetupIconFile: icon, IconFile: ['resources', 'app', ...ICON_FILE].join(String.fromCharCode(92)), InstallDeleteFile: join(ROOT, 'install-delete.iss'),
      ...more,
    }
    const c = spawnSync(iscc, ['-Qp', ...Object.entries(defines).map(([k, v]) => `-D${k}=${v}`), '-'], { input: iss, cwd: join(REPO, 'installer', 'setup'), encoding: 'utf8', windowsHide: true, timeout: 180_000 })
    assert.equal(c.status, 0, `ISCC (${name}): ${c.stdout}${c.stderr}`)
    SETUPS[name] = join(ROOT, 'out', `${TEST.name}-${name}-setup.exe`)
  }
})

after(async () => {
  for (const c of children) { try { c.kill() } catch { /* gone */ } }
  if (WINDOWS) {
    const e = entry()
    const at = e?.['Inno Setup: App Path']
    if (at && inside(at, ROOT) && existsSync(join(at, 'unins000.exe'))) {
      spawnSync(join(at, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, timeout: 120_000, env })
      for (let i = 0; i < 120 && entry(); i += 1) await sleep(500)
    }
    const leftEntry = entry()
    if (leftEntry && inside(leftEntry['Inno Setup: App Path'] ?? '', ROOT)) removeKey(UNINSTALL_KEY)
    const leftServer = toastServer()
    if (leftServer !== null && inside(leftServer, ROOT)) removeKey(TOAST_KEY)
    for (const n of readdirSync(tmpdir()).filter(n => /^is-.*-uninstall\.tmp$/i.test(n) && statSync(join(tmpdir(), n)).mtimeMs >= STARTED)) {
      try { removeTree(join(tmpdir(), n), { waitMs: 10_000 }) } catch { /* still in use: left */ }
    }
  }
  await sleep(300)
  removeTree(ROOT, { waitMs: 30_000 })
})

const W = { skip: !WINDOWS && 'Windows only' }

test('A · /STWAITPID=<a process that lives 5 s more>: the setup program waits for it, logs "exited after <n> ms", then installs', W, async () => {
  const p = slowProcess(5000)
  const t0 = Date.now()
  const r = runSetup('default', [`/STWAITPID=${p.pid}`], join(ROOT, 'a.log'))
  const exitedAt = await p.exited
  assert.equal(r.waits.length, 1, r.waits.join(' | '))
  const m = new RegExp(`^process ${p.pid} exited after (\\d+) ms$`).exec(r.waits[0])
  assert.ok(m, `the line: ${r.waits[0]}`)
  assert.ok(Number(m[1]) >= 3000 && Number(m[1]) < 15_000, `waited ${m[1]} ms`)
  assert.ok(r.ms >= exitedAt - t0 - 500, 'the setup program finished after the process had exited')
  assert.ok(r.waitAt >= 0 && r.waitAt < r.installAt, 'the wait comes before the installation starts')
  if (r.rmAt >= 0) assert.ok(r.waitAt < r.rmAt, 'and before the Restart Manager')
  assert.equal(entry()?.DisplayVersion, '3.0.0', 'installed')
  assert.ok(existsSync(join(X, TEST.exe)))
})

test('B · the same slow process, no /STWAITPID: "no /STWAITPID given", no "exited after" line; nothing waited for it', W, async () => {
  const p = slowProcess(20_000)
  const r = runSetup('default', [], join(ROOT, 'b.log'))
  assert.deepEqual(r.waits, ['no /STWAITPID given, nothing to wait for'])
  assert.doesNotMatch(r.text, /exited after \d+ ms/)
  assert.equal(p.alive(), true, 'the setup program finished while the process still ran')
  assert.ok(r.ms < 15_000, `the setup program took ${r.ms} ms`)
})

test('C · /STWAITPID=12ab and /STWAITPID=0: "is not a process id", nothing waited', W, () => {
  for (const [i, bad] of ['12ab', '0'].entries()) {
    const r = runSetup('default', [`/STWAITPID=${bad}`], join(ROOT, `c${i}.log`))
    assert.deepEqual(r.waits, [`/STWAITPID=${bad} is not a process id; not waiting`])
  }
})

test('D · /STWAITPID=<a process that has exited>: "is not running"', W, async () => {
  const p = slowProcess(0)
  await p.exited
  await sleep(300)
  const r = runSetup('default', [`/STWAITPID=${p.pid}`], join(ROOT, 'd.log'))
  assert.deepEqual(r.waits, [`process ${p.pid} is not running (it has exited already)`])
})

test('E · a limit of 2 s and a process that lives 8 s: "still running after <n> ms (limit 2000 ms)", and the install goes on', W, async () => {
  const p = slowProcess(8000)
  const r = runSetup('short-limit', [`/STWAITPID=${p.pid}`], join(ROOT, 'e.log'))
  assert.equal(r.waits.length, 1, r.waits.join(' | '))
  const m = new RegExp(`^process ${p.pid} still running after (\\d+) ms \\(limit 2000 ms\\); going on, the Restart Manager closes it$`).exec(r.waits[0])
  assert.ok(m, `the line: ${r.waits[0]}`)
  assert.ok(Number(m[1]) >= 2000 && Number(m[1]) < 6000, `waited ${m[1]} ms`)
  assert.equal(p.alive(), true, 'the process was not ended by the setup program')
  assert.equal(entry()?.DisplayVersion, '3.0.0')
})
