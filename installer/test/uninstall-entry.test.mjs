// The uninstall entry's version after an update (0.2.2; docs/installer.md §十一 11.6) — what Windows Settings → Apps shows —
// checked in seconds and on any machine, as install-delete.test.mjs does it: the real installer/setup/streams.iss compiled
// with the pinned ISCC for a tiny stage under a test identity of its own (its own AppId, toast activator CLSID, name and
// install folder, none of Streams's or install-delete.test.mjs's: a real install of Streams on this machine is not seen and
// not touched), as three setup programs, then installed and updated for real:
//   A. 9.0.0 installed silently: the entry shows 9.0.0 (DisplayVersion, MajorVersion/MinorVersion, VersionMajor/VersionMinor)
//   B. 9.0.1 run over it the way the app runs an update (desktop/src/main/services/update.mjs SETUP_ARGS, plus /LOG): the
//      entry shows 9.0.1. Inno Setup deletes and writes the entry anew at every install, so B passes with or without
//      [Code] UninstallEntryVersion; it pins that behaviour (an entry that seemed left at 0.2.0 on the maintainer's machine on
//      2026-10-13 was a reading of the Claude desktop app's private registry view, not the real one: docs/installer.md 11.6)
//   C. the symptom simulated: 9.1.0 compiled with CreateUninstallRegKey=no added to [Setup] (in memory, for this test only:
//      Inno Setup then leaves the existing entry untouched, as it was left on the maintainer's machine), run over B's copy with the
//      app's switches: the entry must show 9.1.0 all the same — [Code] UninstallEntryVersion writes the version values
//      (MinorVersion 0 → 1 too) and says so in the log. Without it the entry still shows 9.0.1 and C fails
//   D. the same setup program installed into another folder (the entry names B's): the entry is left as it is
// What it writes for real (the setup programs' and the app's folders are moved into a profile of this run's own, as in
// install-delete.test.mjs; it refuses unless Windows resolves them inside it): the test identity's uninstall entry
// HKCU\…\Uninstall\{TEST_GUID}_is1 and its activator key HKCU\Software\Classes\CLSID\{TEST_CLSID} — removed by the uninstaller
// in after(), and directly when they still name this run's folder; the setup programs' working folders in %TEMP%.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { ensureInnoSetup } = await imp('installer/innosetup/setup_innosetup.mjs')
const { installDeleteList } = await imp('installer/install-delete.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { ICON_FILE } = await imp('desktop/src/main/icon.mjs')
const { SETUP_ARGS } = await imp('desktop/src/main/services/update.mjs')

const WINDOWS = process.platform === 'win32'
// the test identity: never Streams's (installer/setup/release.json app_guid, desktop/src/main/app-id.mjs), never install-delete.test.mjs's
const TEST = {
  guid: '90B1C472-8550-4956-9A95-D1652B17B4DA', clsid: '8E51C9C8-C845-4382-AB25-DBB2D265F932',
  name: 'st-uninstall-entry-test', folder: 'YzUninstallEntryTest', exe: 'Streams.exe', aumid: 'StarryDigital.Streams.UninstallEntryTest',
  // fixed, without the patch number, as release.json's app_ver_name is: the entry's DisplayName
  verName: 'st-uninstall-entry-test 9 试用版',
}
const PREFIX = 'st-w7-uninstall-entry-'
const UNINSTALL_KEY = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{${TEST.guid}}_is1`
const TOAST_KEY = `HKCU:\\Software\\Classes\\CLSID\\{${TEST.clsid}}`
const POWERSHELL = WINDOWS ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : ''
const sleep = ms => new Promise(r => setTimeout(r, ms))
const inside = (p, dir) => resolve(p).toLowerCase().startsWith(`${resolve(dir).toLowerCase()}${sep}`)
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

const ROOT = mkdtempSync(join(tmpdir(), PREFIX))
const PROFILE = join(ROOT, 'profile')
const X = join(ROOT, 'install')
const Y = join(ROOT, 'elsewhere')
const STARTED = Date.now()
const env = { ...process.env, USERPROFILE: PROFILE, APPDATA: join(PROFILE, 'AppData', 'Roaming'), LOCALAPPDATA: join(PROFILE, 'AppData', 'Local') }

function ps(script, withEnv = false) {
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8', windowsHide: true, timeout: 60_000, ...(withEnv ? { env } : {}) })
  if (r.status !== 0) throw new Error(`powershell: ${r.stderr}`)
  return r.stdout.trim()
}
const VALUES = ['Inno Setup: App Path', 'DisplayName', 'DisplayVersion', 'MajorVersion', 'MinorVersion', 'VersionMajor', 'VersionMinor']
const entry = () => { const o = ps(`if (Test-Path -LiteralPath '${UNINSTALL_KEY}') { Get-ItemProperty -LiteralPath '${UNINSTALL_KEY}' | Select-Object ${VALUES.map(v => `'${v}'`).join(', ')} | ConvertTo-Json -Compress } else { 'none' }`); return o === 'none' ? null : JSON.parse(o) }
const toastServer = () => { const o = ps(`if (Test-Path -LiteralPath '${TOAST_KEY}') { [string](Get-Item -LiteralPath '${TOAST_KEY}\\LocalServer32' -ErrorAction SilentlyContinue).GetValue('') } else { 'none' }`); return o === 'none' ? null : o }
const removeKey = key => ps(`Remove-Item -LiteralPath '${key}' -Recurse -Force`)
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
/** What the entry shows of a version: the five values Inno Setup writes from AppVersion, and the name. */
const shows = version => {
  const [major, minor] = version.split('.').map(Number)
  return { DisplayName: TEST.verName, DisplayVersion: version, MajorVersion: major, MinorVersion: minor, VersionMajor: major, VersionMinor: minor }
}
/** The entry as `shows` has it, once it is known to name `folder` (Windows may write the path in another case). */
const shown = folder => {
  const { 'Inno Setup: App Path': at, ...rest } = entry() ?? {}
  assert.ok(at && same(at, folder), `the entry names ${at}, not ${folder}`)
  return rest
}
/** [Code] UninstallEntryVersion's line in an Inno Setup log. */
const entryLine = log => (readFileSync(log, 'utf8').match(/The uninstall entry (shows this version: \S+|showed version \S+: written \S+|showed version \S+: writing \S+ failed|does not name this folder: its version is left as it is)/g) ?? [])

const SETUPS = {}
function runSetup(name, args, log) {
  const r = spawnSync(SETUPS[name], [...args, `/LOG=${log}`], { windowsHide: true, timeout: 180_000, env })
  assert.equal(r.status, 0, `the test setup program ${name}'s exit code (${args.join(' ')}): ${r.status}`)
  return readFileSync(log, 'utf8')
}

before(async () => {
  if (!WINDOWS) return
  // a run killed before its after() leaves the test identity's two keys: removed when they name a folder of this test's
  // (…\st-w7-uninstall-entry-*), else this run refuses (they are not this test's)
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
})

after(async () => {
  if (WINDOWS) {
    // the uninstaller of whichever folder the entry names now (always one of this run's), then whatever is left of the keys
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

test('streams.iss, compiled as 9.0.0 / 9.0.1 / 9.1.0 and run over each other with the app\'s switches: the uninstall entry shows the version that ran last — also when Inno Setup leaves the entry as it was (2026-10-13); an entry of another folder is left alone', { skip: !WINDOWS && 'Windows only' }, async () => {
  const { iscc } = await ensureInnoSetup({ install: false })
  const icon = join(REPO, 'desktop', ...ICON_FILE)
  const iss = readFileSync(join(REPO, 'installer', 'setup', 'streams.iss'), 'utf8')
  assert.equal((iss.match(/^\[Setup\]$/gm) ?? []).length, 1, 'one [Setup] line')
  assert.doesNotMatch(iss, /^CreateUninstallRegKey=/m, 'the real script writes the entry (CreateUninstallRegKey is not set: yes)')
  const build = (name, version, extraSetup = '') => {
    const stage = join(ROOT, `stage-${name}`)
    put(join(stage, 'LICENSE'), `license of ${version}\n`)
    put(join(stage, TEST.exe), `not a program: ${version}\n`)
    put(join(stage, 'resources', 'app', 'package.json'), `{"version":"${version}"}\n`)
    put(join(stage, 'resources', 'app', ...ICON_FILE), readFileSync(icon))
    writeFileSync(join(ROOT, `install-delete-${name}.iss`), installDeleteList(stage).text)
    const defines = {
      StageDir: stage, OutputDir: join(ROOT, 'out'), OutputBaseFilename: `${TEST.name}-${name}-setup`, AppVersion: version,
      AppName: TEST.name, AppVerName: TEST.verName, AppPublisher: 'test', AppGuid: TEST.guid, AppCopyright: 'Copyright (C) 2026 test',
      InstallFolder: TEST.folder, ExeName: TEST.exe, AppUserModelId: TEST.aumid, ToastActivatorClsid: TEST.clsid,
      SetupIconFile: icon, IconFile: ['resources', 'app', ...ICON_FILE].join(String.fromCharCode(92)), InstallDeleteFile: join(ROOT, `install-delete-${name}.iss`),
    }
    const input = extraSetup ? iss.replace(/^\[Setup\]$/m, `[Setup]\n${extraSetup}`) : iss
    const c = spawnSync(iscc, ['-Qp', ...Object.entries(defines).map(([k, v]) => `-D${k}=${v}`), '-'], { input, cwd: join(REPO, 'installer', 'setup'), encoding: 'utf8', windowsHide: true, timeout: 180_000 })
    assert.equal(c.status, 0, `ISCC (${name}): ${c.stdout}${c.stderr}`)
    SETUPS[name] = join(ROOT, 'out', `${TEST.name}-${name}-setup.exe`)
  }
  build('9.0.0', '9.0.0')
  build('9.0.1', '9.0.1')
  build('9.1.0-entry-left', '9.1.0', 'CreateUninstallRegKey=no')
  const update = [...SETUP_ARGS]
  assert.ok(update.includes('/SILENT') && update.includes('/STRELAUNCH=1'), `the app's switches: ${update.join(' ')}`)

  // A. the lower version, installed silently
  let log = runSetup('9.0.0', ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${X}`, '/MERGETASKS=!desktopicon'], join(ROOT, 'a.log'))
  assert.deepEqual(shown(X), shows('9.0.0'))
  assert.deepEqual(entryLine(join(ROOT, 'a.log')), ['The uninstall entry shows this version: 9.0.0'])

  // B. the higher one over it, as the app starts it (no /DIR: over the copy the entry names): Inno Setup writes the entry anew
  log = runSetup('9.0.1', update, join(ROOT, 'b.log'))
  assert.match(log, /Creating new uninstall key: .*\{90B1C472-8550-4956-9A95-D1652B17B4DA\}_is1/)
  assert.match(log, /Writing uninstall key values\./)
  assert.deepEqual(shown(X), shows('9.0.1'))
  assert.deepEqual(entryLine(join(ROOT, 'b.log')), ['The uninstall entry shows this version: 9.0.1'])

  // C. 2026-10-13's symptom: the update leaves the entry as the older install wrote it — [Code] writes the version values
  log = runSetup('9.1.0-entry-left', update, join(ROOT, 'c.log'))
  assert.doesNotMatch(log, /Creating new uninstall key/, 'this setup program leaves the entry to [Code] (CreateUninstallRegKey=no)')
  assert.match(log, /An older copy of the app in this folder \(its program files are removed first\): 1/)
  assert.deepEqual(shown(X), shows('9.1.0'), 'the entry shows the version that ran last, 9.1.0, though Inno Setup did not write it')
  assert.deepEqual(entryLine(join(ROOT, 'c.log')), ['The uninstall entry showed version 9.0.1: written 9.1.0'])
  assert.equal(readFileSync(join(X, 'resources', 'app', 'package.json'), 'utf8'), '{"version":"9.1.0"}\n', 'and the program files are 9.1.0\'s')

  // D. the same setup program into another folder: the entry names X, not Y — left as it is
  ps(`Set-ItemProperty -LiteralPath '${UNINSTALL_KEY}' -Name DisplayVersion -Value '9.0.1'`)
  runSetup('9.1.0-entry-left', ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${Y}`, '/MERGETASKS=!desktopicon'], join(ROOT, 'd.log'))
  assert.deepEqual(entryLine(join(ROOT, 'd.log')), ['The uninstall entry does not name this folder: its version is left as it is'])
  assert.deepEqual(shown(X), { ...shows('9.1.0'), DisplayVersion: '9.0.1' }, 'an entry that names another folder is not written')
})
