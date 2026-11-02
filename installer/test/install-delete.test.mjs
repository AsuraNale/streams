// The update's clean-up ([InstallDelete], work order 08; docs/installer.md §十一 11.1 and 11.3), checked in seconds and on any
// machine: the real installer/setup/streams.iss and the real list maker (installer/install-delete.mjs), compiled with the
// pinned ISCC for a six-file stage under a test identity of its own (its own AppId, toast activator CLSID, name and install
// folder: nothing of Streams's — a real install of Streams on this machine is not seen and not touched), then installed,
// updated and installed elsewhere for real:
//   A. a first install, into a folder that already holds a file under resources\: [InstallDelete] answers 0, that file stays
//   B. the same setup again over that copy, as an update (no /DIR, the app's own switches but /VERYSILENT): answers 1 — one
//      answer, taken before the first entry deleted anything — and the older copy's files go: files planted below
//      resources\ and locales\ (names this stage does not have) are gone, every stage file is there, the uninstaller and a
//      file of the user's at the folder's top stay. 2026-10-12 the answer was asked afresh per entry and turned to 0 once the
//      entry Streams.exe (sorted before locales\ and resources\, as in the real list) had gone: the planted files stayed
//   C. an install into another folder that has a Streams.exe and a resources\ of someone else's (the uninstall entry names
//      the first folder): answers 0, nothing of theirs goes
// What it writes for real (the setup program's and the app's folders are moved into a profile of this run's own, as in
// upgrade.test.mjs; it refuses unless Windows resolves them inside it): the test identity's uninstall entry
// HKCU\…\Uninstall\{TEST_GUID}_is1 and its activator key HKCU\Software\Classes\CLSID\{TEST_CLSID} — removed by the uninstaller
// in after(), and directly when they still name this run's folder; the setup programs' working folders in %TEMP%.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { ensureInnoSetup } = await imp('installer/innosetup/setup_innosetup.mjs')
const { installDeleteList, INSTALL_DELETE_CHECK } = await imp('installer/install-delete.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { ICON_FILE } = await imp('desktop/src/main/icon.mjs')

const WINDOWS = process.platform === 'win32'
// the test identity: never Streams's (installer/setup/release.json app_guid, desktop/src/main/app-id.mjs)
const TEST = {
  guid: 'BF7F4887-A299-41C1-A07C-BE468152D79C', clsid: '5DBB9B8D-34CC-4527-A074-0E35C254B0C2',
  name: 'st-install-delete-test', folder: 'YzInstallDeleteTest', exe: 'Streams.exe', aumid: 'StarryDigital.Streams.InstallDeleteTest',
}
const PREFIX = 'st-w7-install-delete-'
const UNINSTALL_KEY = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{${TEST.guid}}_is1`
const TOAST_KEY = `HKCU:\\Software\\Classes\\CLSID\\{${TEST.clsid}}`
const POWERSHELL = WINDOWS ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : ''
const sleep = ms => new Promise(r => setTimeout(r, ms))
const inside = (p, dir) => resolve(p).toLowerCase().startsWith(`${resolve(dir).toLowerCase()}${sep}`)
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

const ROOT = mkdtempSync(join(tmpdir(), PREFIX))
const PROFILE = join(ROOT, 'profile')
const STAGE = join(ROOT, 'stage')
const X = join(ROOT, 'install')
const Y = join(ROOT, 'someone-elses')
const STARTED = Date.now()
const env = { ...process.env, USERPROFILE: PROFILE, APPDATA: join(PROFILE, 'AppData', 'Roaming'), LOCALAPPDATA: join(PROFILE, 'AppData', 'Local') }

function ps(script, withEnv = false) {
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8', windowsHide: true, timeout: 60_000, ...(withEnv ? { env } : {}) })
  if (r.status !== 0) throw new Error(`powershell: ${r.stderr}`)
  return r.stdout.trim()
}
const entry = () => { const o = ps(`if (Test-Path -LiteralPath '${UNINSTALL_KEY}') { Get-ItemProperty -LiteralPath '${UNINSTALL_KEY}' | Select-Object 'Inno Setup: App Path', InstallLocation | ConvertTo-Json -Compress } else { 'none' }`); return o === 'none' ? null : JSON.parse(o) }
const toastServer = () => { const o = ps(`if (Test-Path -LiteralPath '${TOAST_KEY}') { [string](Get-Item -LiteralPath '${TOAST_KEY}\\LocalServer32' -ErrorAction SilentlyContinue).GetValue('') } else { 'none' }`); return o === 'none' ? null : o }
const removeKey = key => ps(`Remove-Item -LiteralPath '${key}' -Recurse -Force`)
/** The [InstallDelete] answers ([Code] OldCopyHere) in an Inno Setup log, in order ('0' / '1'). */
const answers = log => [...readFileSync(log, 'utf8').matchAll(/An older copy of the app in this folder \(its program files are removed first\): ([01])/g)].map(m => m[1])
/** Every file below `dir`, relative, with `/`. */
const files = dir => { const out = []; const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(relative(dir, p).split(sep).join('/')) } }; walk(dir); return out.sort() }
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
const setup = () => join(ROOT, 'out', `${TEST.name}-setup.exe`)
function runSetup(args, log) {
  const r = spawnSync(setup(), [...args, `/LOG=${log}`], { windowsHide: true, timeout: 180_000, env })
  assert.equal(r.status, 0, `the test setup program's exit code (${args.join(' ')}): ${r.status}`)
  return answers(log)
}

// ---------------------------------------------------------------- the list

test('the list: every top-level name of the stage, sorted, folders whole, each with the Check; never unins*, never a path', () => {
  const stage = join(ROOT, 'list-stage')
  for (const f of ['Streams.exe', 'LICENSE', 'v8_context_snapshot.bin', 'locales/en-US.pak', 'resources/app/package.json']) put(join(stage, f), 'x')
  const list = installDeleteList(stage)
  assert.deepEqual(list.entries, [
    { name: 'LICENSE', dir: false }, { name: 'Streams.exe', dir: false }, { name: 'locales', dir: true }, { name: 'resources', dir: true }, { name: 'v8_context_snapshot.bin', dir: false },
  ])
  const bs = String.fromCharCode(92)
  assert.deepEqual(list.text.split('\n').filter(l => l && !l.startsWith(';')), list.entries.map(e => `Type: ${e.dir ? 'filesandordirs' : 'files'}; Name: "{app}${bs}${e.name}"; Check: ${INSTALL_DELETE_CHECK}`))
  assert.equal(INSTALL_DELETE_CHECK, 'OldCopyHere')
  // what the list does not write: the uninstaller's name, a name that is not one plain name, an empty stage
  put(join(stage, 'unins000.exe'), 'x')
  assert.throws(() => installDeleteList(stage), /unins000\.exe .*uninstaller/)
  rmSync(join(stage, 'unins000.exe'))
  put(join(stage, 'a name.txt'), 'x')
  assert.throws(() => installDeleteList(stage), /top-level name .* a name\.txt/)
  const empty = join(ROOT, 'empty-stage')
  mkdirSync(empty)
  assert.throws(() => installDeleteList(empty), /empty/)
})

// ---------------------------------------------------------------- the real .iss, compiled and run

const STAGE_FILES = {
  LICENSE: 'license of version 2\n',
  [TEST.exe]: 'not a program: version 2\n',
  'locales/en-US.pak': 'en-US of version 2\n',
  'resources/app/package.json': '{"version":"2.0.0"}\n',
  version: '2.0.0\n',
}

before(async () => {
  if (!WINDOWS) return
  // a run killed before its after() leaves the test identity's two keys: removed when they name a folder of this test's
  // (…\st-w7-install-delete-*), else this run refuses (they are not this test's)
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

test('streams.iss, compiled for a small stage and run: a first install removes nothing; an update over its own copy removes that copy\'s files (one answer, taken before the first deletion); a folder not its own keeps everything', { skip: !WINDOWS && 'Windows only' }, async () => {
  // the stage, the list the build would make from it, the setup program from the real streams.iss
  for (const [f, text] of Object.entries(STAGE_FILES)) put(join(STAGE, f), text)
  const icon = join(REPO, 'desktop', ...ICON_FILE)
  put(join(STAGE, 'resources', 'app', ...ICON_FILE), readFileSync(icon))
  const list = installDeleteList(STAGE)
  assert.ok(list.entries.findIndex(e => e.name === TEST.exe) < list.entries.findIndex(e => e.name === 'resources'), 'as in the real list, Streams.exe comes before resources\\')
  writeFileSync(join(ROOT, 'install-delete.iss'), list.text)
  const { iscc } = await ensureInnoSetup({ install: false })
  const defines = {
    StageDir: STAGE, OutputDir: join(ROOT, 'out'), OutputBaseFilename: `${TEST.name}-setup`, AppVersion: '2.0.0',
    AppName: TEST.name, AppVerName: `${TEST.name} 2`, AppPublisher: 'test', AppGuid: TEST.guid, AppCopyright: 'Copyright (C) 2026 test',
    InstallFolder: TEST.folder, ExeName: TEST.exe, AppUserModelId: TEST.aumid, ToastActivatorClsid: TEST.clsid,
    SetupIconFile: icon, IconFile: ['resources', 'app', ...ICON_FILE].join(String.fromCharCode(92)), InstallDeleteFile: join(ROOT, 'install-delete.iss'),
  }
  const c = spawnSync(iscc, ['-Qp', ...Object.entries(defines).map(([k, v]) => `-D${k}=${v}`), '-'], { input: readFileSync(join(REPO, 'installer', 'setup', 'streams.iss'), 'utf8'), cwd: join(REPO, 'installer', 'setup'), encoding: 'utf8', windowsHide: true, timeout: 180_000 })
  assert.equal(c.status, 0, `ISCC: ${c.stdout}${c.stderr}`)
  const stageFiles = files(STAGE)

  // A. a first install into a folder that already holds a file below resources\ (no entry yet, no Streams.exe): nothing removed
  put(join(X, 'resources', 'there-before.txt'), 'there before the first install\n')
  const a = runSetup(['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${X}`, '/MERGETASKS=!desktopicon'], join(ROOT, 'a.log'))
  assert.ok(a.length >= 1 && a.every(v => v === '0'), `a first install: [InstallDelete] answers ${a.join(' ')}`)
  assert.ok(existsSync(join(X, 'resources', 'there-before.txt')), 'a first install removes nothing')
  assert.ok(same(entry()['Inno Setup: App Path'], X))
  assert.ok(existsSync(join(PROFILE, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${TEST.name}.lnk`)), 'the shortcut is in the test profile')

  // B. the update: over the copy the entry names (no /DIR), with files of an "older version" below resources\ and locales\
  const older = ['resources/app/src/main/left-by-an-older-version.mjs', 'resources/older-only/deep/file.txt', 'locales/xx-OLDER.pak']
  for (const f of older) put(join(X, f), 'from an older version\n')
  put(join(X, TEST.exe), 'not a program: version 1\n')
  put(join(X, 'notes-of-the-user.txt'), 'mine\n')
  const b = runSetup(['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS'], join(ROOT, 'b.log'))
  assert.ok(b.length >= 1 && b.every(v => v === '1'), `the update over its own copy: [InstallDelete] answers ${b.join(' ')} (one answer for every entry, 1)`)
  for (const f of [...older, 'resources/there-before.txt']) assert.equal(existsSync(join(X, f)), false, `${f}: resources\\ and locales\\ of the older copy go whole`)
  assert.deepEqual(files(X), [...stageFiles, 'notes-of-the-user.txt', 'unins000.dat', 'unins000.exe'].sort(), 'the stage, the uninstaller and the user\'s own file at the top')
  for (const f of stageFiles) assert.deepEqual(readFileSync(join(X, f)), readFileSync(join(STAGE, f)), f)
  assert.ok(same(entry()['Inno Setup: App Path'], X))

  // C. another folder with a Streams.exe and a resources\ of someone else's; the entry names X, not it: nothing of theirs goes
  put(join(Y, TEST.exe), 'someone else\'s\n')
  put(join(Y, 'resources', 'theirs.txt'), 'theirs\n')
  put(join(Y, 'locales', 'theirs.pak'), 'theirs\n')
  const cAnswers = runSetup(['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${Y}`, '/MERGETASKS=!desktopicon'], join(ROOT, 'c.log'))
  assert.ok(cAnswers.length >= 1 && cAnswers.every(v => v === '0'), `a folder this app's entry does not name: [InstallDelete] answers ${cAnswers.join(' ')}`)
  for (const f of ['resources/theirs.txt', 'locales/theirs.pak']) assert.ok(existsSync(join(Y, f)), `${f} stays`)
})
