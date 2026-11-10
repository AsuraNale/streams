// v2 package N: the uninstall a user runs — with its dialogs (docs/installer.md §五「有界面的卸载」, §十一). Every other
// installer test uninstalls with /VERYSILENT /SUPPRESSMSGBOXES; on 2026-11-10 the maintainer double-clicked unins000.exe, answered
// 「否」 to the question about the app's data, and the uninstall entry {DF025A05-…}_is1 was still to be seen afterwards. The
// cause was not the installer (§十一: the install had been started from a Claude tool shell, whose registry view is the
// Claude app's private one; his uninstall ran outside it), but no test had run the uninstaller as he did. This one does, in
// seconds and on any machine, as install-delete.test.mjs and uninstall-entry.test.mjs do it: the real
// installer/setup/streams.iss compiled with the pinned ISCC for a tiny stage under a test identity of its own (its own AppId,
// toast activator CLSID, name and install folder: a real install of Streams is not seen and not touched), installed for real,
// then uninstalled with no switch but /LOG — the dialogs answered by installer/test/dialogs.mjs:
//   1. 「否」: 「您确认要完全移除 … 吗？」 是 → the question 否 → 「已顺利 … 移除」 确定: the uninstall entry, the toast activator
//      key, the program folder and both shortcuts gone; the app's data (the test profile's {userappdata} and
//      {localappdata} folders of the test identity) there, unchanged; the log says the entry was deleted and 「否」 chosen
//   2. 「是」: the same, and the two data folders gone — a folder beside them (another name) stays
//   3. The maintainer's leftover, simulated: an install whose folder and shortcuts are removed the way an uninstaller in another
//      registry view removes them (the files go, this view's entry and key stay) — machine.mjs deadLeftovers names the entry
//      and the key, liveInstallHere says nothing is installed (control: before the files went, the same picture was a live
//      install); then an install with the same AppId into another folder and the uninstall with dialogs (「否」): the entry
//      and the key are gone — what packaged.test.mjs does with the maintainer's entry of 2026-11-09
// Where it writes (as uninstall-entry.test.mjs): the setup programs' and the app's folders inside a profile of this run's own
// (it refuses unless Windows resolves Programs, Desktop and the two app-data folders inside it — so 「是」 deletes the test
// profile's folders, never a real one; the test identity's data folder is not even named Streams); the test identity's
// uninstall entry and toast activator key under HKCU (removed by its uninstaller, and directly in after() when they still
// name this run's folder); the uninstaller's working folder in %TEMP%. The dialogs show on the screen for a few seconds.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deadLeftovers, installedHere, liveInstallHere, ps, shellFolder, toastKey, uninstallEntry, uninstallKey } from './machine.mjs'
import { uninstallTexts, uninstallWithDialogs } from './dialogs.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { ensureInnoSetup } = await imp('installer/innosetup/setup_innosetup.mjs')
const { installDeleteList } = await imp('installer/install-delete.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { tempDir } = await imp('desktop/scripts/lib/temp.mjs')
const { ICON_FILE } = await imp('desktop/src/main/icon.mjs')

const WINDOWS = process.platform === 'win32'
// the test identity: never Streams's (release.json app_guid, app-id.mjs), never another test's
const TEST = {
  guid: '6E2C4A91-7B3D-4F58-A0E6-2D9B1C7F5A38', clsid: 'B4D17E52-9C0A-4E3B-8F61-3A7C2E9D0B45',
  name: 'st-uninstall-ui-test', folder: 'StUninstallUiTest', exe: 'Streams.exe', aumid: 'StarryDigital.Streams.UninstallUiTest',
}
const PREFIX = 'st-uninstall-ui-'
const CLSID = `{${TEST.clsid}}`
const ENTRY_KEY = uninstallKey(TEST.guid)
const TOAST_KEY = `HKCU:\\Software\\Classes\\CLSID\\${CLSID}`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const inside = (p, dir) => resolve(p).toLowerCase().startsWith(`${resolve(dir).toLowerCase()}${sep}`)
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }

const ROOT = tempDir(PREFIX)
const PROFILE = join(ROOT, 'profile')
const ROAMING = join(PROFILE, 'AppData', 'Roaming')
const LOCAL = join(PROFILE, 'AppData', 'Local')
const STARTED = Date.now()
const env = { ...process.env, USERPROFILE: PROFILE, APPDATA: ROAMING, LOCALAPPDATA: LOCAL }
const S = {}
const removeKey = key => ps(`Remove-Item -LiteralPath '${key.replace(/'/g, "''")}' -Recurse -Force`)
/** The guard's picture (machine.mjs realInstallTraces) of the test identity, in this run's profile. */
const traces = () => ({
  entry: uninstallEntry(TEST.guid), toastKey: toastKey(CLSID),
  startMenuPath: S.startMenu, desktopPath: S.desktop, startMenu: existsSync(S.startMenu), desktop: existsSync(S.desktop),
})
/** The data the app would keep (test profile): file → text. */
const DATA = { [join(ROAMING, TEST.folder, 'settings.json')]: '{"theme":"precision"}\n', [join(ROAMING, TEST.folder, 'logs', 'main.log')]: 'a line\n', [join(LOCAL, TEST.folder, 'cache', 'x.bin')]: 'cache\n' }
const NEIGHBOUR = join(ROAMING, `${TEST.folder}-neighbour`, 'keep.txt')

function install(dir, log) {
  // silent, the default tasks (the desktop shortcut too), into `dir`
  const r = spawnSync(S.setup, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${dir}`, `/LOG=${log}`], { windowsHide: true, timeout: 180_000, env })
  assert.equal(r.status, 0, `the test setup program's exit code: ${r.status}`)
  const e = uninstallEntry(TEST.guid)
  assert.ok(e && same(e.InstallLocation, dir), `control: the entry names ${dir}: ${JSON.stringify(e)}`)
  assert.ok(toastKey(CLSID), 'control: the toast activator key is there')
  for (const lnk of [S.startMenu, S.desktop]) assert.ok(existsSync(lnk), `control: ${lnk} is there`)
}

/** The uninstall with its dialogs, answered; what every case checks after it. */
async function uninstallAnswering(dir, deleteData, log) {
  const r = await uninstallWithDialogs({ exe: join(dir, 'unins000.exe'), env, log, confirmText: S.texts.confirm, dataQuestion: S.texts.dataQuestion, deleteData, workDir: ROOT })
  assert.equal(r.watcherErr, '', 'the watcher ran without an error')
  assert.equal(r.watcherEnd?.timedOut, false, `the uninstaller's processes ended: ${JSON.stringify(r.watcherEnd)}`)
  assert.equal(r.exitCode, 0, 'the uninstaller (its first phase) exit code')
  // the three boxes, in order, each answered once: a box nobody expected (an error) shows up here
  assert.deepEqual(r.dialogs.map(d => d.text), [S.texts.confirm, S.texts.dataQuestion, S.texts.done], `the dialogs: ${JSON.stringify(r.dialogs)}`)
  assert.deepEqual(r.dialogs.slice(0, 2).map(d => d.pressed), [6, deleteData ? 6 : 7], '是, then the answer to the question')
  assert.ok([1, 2].includes(r.dialogs[2].pressed) && r.dialogs[2].buttons.length === 1, `the last box has one button, 确定: ${JSON.stringify(r.dialogs[2])}`)
  assert.ok(r.dialogs.every(d => d.posted), 'every answer was posted to its box')
  // the second phase (a copy in %TEMP%) may finish a moment after the boxes: wait for the entry and the folder
  for (let i = 0; i < 120 && (uninstallEntry(TEST.guid) || existsSync(dir)); i += 1) await sleep(250)
  const text = readFileSync(log, 'utf8')
  const lines = text.split(/\r?\n/)
  const at = re => lines.findIndex(l => re.test(l))
  assert.ok(at(new RegExp(`Deleting registry key: HKEY_CURRENT_USER\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\\{${TEST.guid}\\}_is1$`)) >= 0, 'the log: the uninstall entry deleted')
  assert.ok(at(/Uninstallation process succeeded\.$/) > at(/Deleting registry key: .*_is1$/), 'the log: … then the uninstall succeeded')
  assert.match(text, /Removed all\? Yes/)
  // (the first 「User chose Yes.」 is the confirmation's, before the uninstall; the question's answer is the next one)
  const answers = lines.filter(l => /User chose (Yes|No|OK)\.$/.test(l)).map(l => /User chose (\w+)\./.exec(l)[1])
  assert.deepEqual(answers, ['Yes', deleteData ? 'Yes' : 'No', 'OK'], 'the log: 是, then the answer, then 确定')
  assert.ok(lines.findLastIndex(l => /User chose (Yes|No)\.$/.test(l)) > at(/Uninstallation process succeeded\.$/), `the log: the question answered ${deleteData ? '是' : '否'} after the files went`)
  // gone: the entry, the key, the folder, both shortcuts; nothing of the identity left
  assert.equal(uninstallEntry(TEST.guid), null, 'the uninstall entry is gone')
  assert.equal(toastKey(CLSID), null, 'the toast activator key is gone')
  assert.equal(existsSync(dir), false, `the program folder is gone: ${existsSync(dir) ? readdirSync(dir).join(', ') : ''}`)
  assert.equal(existsSync(S.startMenu), false, 'the Start-menu shortcut is gone')
  assert.equal(existsSync(S.desktop), false, 'the desktop shortcut is gone')
  assert.deepEqual(installedHere(traces()), [], 'nothing of the install left')
  return { dialogs: r.dialogs, lines: lines.filter(l => /Deleting registry key|Message box|User chose|Uninstallation process succeeded|Removed all/.test(l)) }
}

before(async () => {
  if (!WINDOWS) return
  // a run killed before its after() leaves the identity's keys: removed when they name a folder of this test's (or no folder
  // at all: what a value written into the key after the uninstall leaves, as the residue mutant does), else refuse
  const left = uninstallEntry(TEST.guid)
  if (left) {
    const at = left.InstallLocation ?? ''
    assert.ok(!at || (inside(at, tmpdir()) && relative(tmpdir(), at).startsWith(PREFIX)), `${ENTRY_KEY} names ${at}, not a folder of this test's: refusing`)
    removeKey(ENTRY_KEY)
  }
  const leftKey = toastKey(CLSID)
  if (leftKey) {
    const at = leftKey.localServer ?? ''
    assert.ok(inside(at, tmpdir()) && relative(tmpdir(), at).startsWith(PREFIX), `${TOAST_KEY} names ${at}, not a folder of this test's: refusing`)
    removeKey(TOAST_KEY)
  }
  for (const d of [join(ROAMING, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), LOCAL, join(PROFILE, 'Desktop')]) mkdirSync(d, { recursive: true })
  // where Windows puts the shortcuts and the two data folders for this environment: inside this run's profile, or no run
  const folders = Object.fromEntries(['Programs', 'DesktopDirectory', 'ApplicationData', 'LocalApplicationData'].map(n => [n, shellFolder(n, env)]))
  for (const [n, p] of Object.entries(folders)) assert.ok(inside(p, PROFILE), `${n} resolves to ${p}, outside the test profile: 「是」 would delete outside it — refusing`)
  assert.ok(same(folders.ApplicationData, ROAMING) && same(folders.LocalApplicationData, LOCAL), JSON.stringify(folders))
  S.startMenu = join(folders.Programs, `${TEST.name}.lnk`)
  S.desktop = join(folders.DesktopDirectory, `${TEST.name}.lnk`)

  const { iscc } = await ensureInnoSetup({ install: false })
  const icon = join(REPO, 'desktop', ...ICON_FILE)
  const iss = readFileSync(join(REPO, 'installer', 'setup', 'streams.iss'), 'utf8')
  S.texts = uninstallTexts({ iscc, iss, appName: TEST.name })
  const stage = join(ROOT, 'stage')
  put(join(stage, 'LICENSE'), 'license\n')
  put(join(stage, TEST.exe), 'not a program\n')
  put(join(stage, 'resources', 'app', 'package.json'), '{"version":"9.0.0"}\n')
  put(join(stage, 'resources', 'app', ...ICON_FILE), readFileSync(icon))
  writeFileSync(join(ROOT, 'install-delete.iss'), installDeleteList(stage).text)
  const defines = {
    StageDir: stage, OutputDir: join(ROOT, 'out'), OutputBaseFilename: `${TEST.name}-setup`, AppVersion: '9.0.0',
    AppName: TEST.name, AppVerName: `${TEST.name} 9`, AppPublisher: 'test', AppGuid: TEST.guid, AppCopyright: 'Copyright (C) 2026 test',
    InstallFolder: TEST.folder, ExeName: TEST.exe, AppUserModelId: TEST.aumid, ToastActivatorClsid: TEST.clsid,
    SetupIconFile: icon, IconFile: ['resources', 'app', ...ICON_FILE].join(String.fromCharCode(92)), InstallDeleteFile: join(ROOT, 'install-delete.iss'),
  }
  const c = spawnSync(iscc, ['-Qp', ...Object.entries(defines).map(([k, v]) => `-D${k}=${v}`), '-'], { input: iss, cwd: join(REPO, 'installer', 'setup'), encoding: 'utf8', windowsHide: true, timeout: 180_000 })
  assert.equal(c.status, 0, `ISCC: ${c.stdout}${c.stderr}`)
  S.setup = join(ROOT, 'out', `${TEST.name}-setup.exe`)
})

after(async () => {
  if (WINDOWS) {
    const e = uninstallEntry(TEST.guid)
    const at = e?.InstallLocation
    if (at && inside(at, ROOT) && existsSync(join(at, 'unins000.exe'))) {
      spawnSync(join(at, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, timeout: 120_000, env })
      for (let i = 0; i < 120 && uninstallEntry(TEST.guid); i += 1) await sleep(500)
    }
    const leftEntry = uninstallEntry(TEST.guid)
    if (leftEntry && (!leftEntry.InstallLocation || inside(leftEntry.InstallLocation, ROOT))) removeKey(ENTRY_KEY)
    const leftKey = toastKey(CLSID)
    if (leftKey && inside(leftKey.localServer ?? '', ROOT)) removeKey(TOAST_KEY)
    for (const n of readdirSync(tmpdir()).filter(n => /^is-.*-uninstall\.tmp$/i.test(n) && statSync(join(tmpdir(), n)).mtimeMs >= STARTED)) {
      try { removeTree(join(tmpdir(), n), { waitMs: 10_000 }) } catch { /* still in use: left */ }
    }
  }
  await sleep(300)
  removeTree(ROOT, { waitMs: 30_000 })
})

test('1 · 「否」, as 维护者 answered: the uninstall entry, the toast activator key, the program folder and both shortcuts gone; the app\'s data there, unchanged', { skip: !WINDOWS && 'Windows only' }, async () => {
  const dir = join(ROOT, 'install-no')
  install(dir, join(ROOT, 'install-no.log'))
  for (const [f, t] of Object.entries(DATA)) put(f, t)
  const r = await uninstallAnswering(dir, false, join(ROOT, 'uninstall-no.log'))
  for (const [f, t] of Object.entries(DATA)) assert.equal(existsSync(f) && readFileSync(f, 'utf8'), t, `${f}: kept, unchanged`)
  S.no = r
})

test('2 · 「是」: the same, and the app\'s two data folders gone; a folder beside them stays', { skip: !WINDOWS && 'Windows only' }, async () => {
  const dir = join(ROOT, 'install-yes')
  install(dir, join(ROOT, 'install-yes.log'))
  for (const [f, t] of Object.entries(DATA)) put(f, t)
  put(NEIGHBOUR, 'not the app\'s\n')
  assert.ok(existsSync(join(ROAMING, TEST.folder)) && existsSync(join(LOCAL, TEST.folder)), 'control: both data folders are there')
  await uninstallAnswering(dir, true, join(ROOT, 'uninstall-yes.log'))
  assert.equal(existsSync(join(ROAMING, TEST.folder)), false, '{userappdata} folder of the app deleted')
  assert.equal(existsSync(join(LOCAL, TEST.folder)), false, '{localappdata} folder of the app deleted')
  assert.equal(readFileSync(NEIGHBOUR, 'utf8'), 'not the app\'s\n', 'the folder beside it stays')
})

test('3 · the maintainer\'s leftover, simulated (the files gone, this view\'s entry and key left): a dead leftover, not an install; an install with the same AppId and the uninstall with dialogs remove it', { skip: !WINDOWS && 'Windows only' }, async () => {
  const dir = join(ROOT, 'install-left')
  install(dir, join(ROOT, 'install-left.log'))
  // control: a whole install is a live one — the guard keeps away from it
  assert.deepEqual(deadLeftovers(traces()), [], 'control: a whole install is not a leftover')
  assert.equal(liveInstallHere(traces()).length, 4, `control: the guard sees a live install: ${liveInstallHere(traces()).join(', ')}`)
  // each piece on its own (the shortcuts left out of the picture): an entry whose folder and uninstaller are there, a key whose
  // Streams.exe is there — neither is a leftover
  const whole = traces()
  assert.deepEqual(deadLeftovers({ ...whole, startMenu: false, desktop: false, toastKey: null }), [], 'control: an entry whose folder is there is not a leftover')
  assert.deepEqual(deadLeftovers({ ...whole, startMenu: false, desktop: false, entry: null }), [], 'control: a key whose Streams.exe is there is not a leftover')
  rmSync(join(dir, 'unins000.exe'))
  assert.deepEqual(deadLeftovers({ ...traces(), startMenu: false, desktop: false, toastKey: null }), [], 'control: an entry whose folder is there (its uninstaller gone) is not a leftover')
  // the uninstall of 2026-11-10 as this view saw it: the program folder and the shortcuts gone, the entry and the key left
  removeTree(dir, { waitMs: 10_000 })
  rmSync(S.startMenu)
  rmSync(S.desktop)
  const left = traces()
  assert.ok(left.entry && left.toastKey, 'the entry and the key are left')
  assert.deepEqual(installedHere(left), ['its uninstall entry', 'its toast activator key'])
  assert.deepEqual(deadLeftovers(left), [`its uninstall entry (names ${left.entry.InstallLocation}, gone)`, `its toast activator key (names ${left.toastKey.localServer}, gone)`])
  assert.deepEqual(liveInstallHere(left), [], 'not an install: the guard lets the test run')
  // one live piece makes it an install again (a shortcut back): the guard refuses
  put(S.desktop, 'x')
  assert.deepEqual(deadLeftovers(traces()), [], 'control: with a shortcut there it is not only leftovers')
  rmSync(S.desktop)
  // what packaged.test.mjs does: its own install with the same AppId (another folder), its uninstall with dialogs
  const dir2 = join(ROOT, 'install-over')
  install(dir2, join(ROOT, 'install-over.log'))
  assert.match(readFileSync(join(ROOT, 'install-over.log'), 'utf8'), /Writing uninstall key values\./)
  await uninstallAnswering(dir2, false, join(ROOT, 'uninstall-over.log'))
  assert.deepEqual(installedHere(traces()), [], 'the leftover entry and key are gone with the test\'s own install')
})
