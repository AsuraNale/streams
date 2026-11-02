// W7-2 … W7-5 on the real installer (work order 06 §三; docs/installer.md §五). Run after a build:
//
//   node --test --test-concurrency=1 "installer/test/*.test.mjs"
//
// One run, in order, on this machine (Windows):
//   0. guards: no real install of Streams (its uninstall entry, its shortcuts, the app's toast activator key under
//      HKCU\Software\Classes\CLSID) — the test stops rather than touch one (YZ_W7_FROM_STAGE, which installs nothing:
//      one is pictured and must be the same at step 6); a picture of ~/.dsh (names, sizes, times: nothing is read inside),
//      of %APPDATA%\Streams and %LOCALAPPDATA%\Streams
//   1. silent install into a temporary folder (/VERYSILENT /DIR=…): the uninstall entry (HKCU, the names, the icon), the
//      two shortcuts (target, working folder, AppUserModelID, toast activator CLSID, the icon), the toast activator key
//      (HKCU, LocalServer32 the installed Streams.exe), every installed file byte for byte the build's stage, no link,
//      @streams/* real folders, the files inherit the install folder's permissions (installer/python/acls.py); Streams.exe's
//      own icon group is the installed .ico's images and its version info is 流息's (the icon round, 2026-10-08); the
//      setup program's own version info is release.json's too, the copyright line the company's on both
//   2. W7-4: the scan (installer/scan.mjs) on the install folder and on the installer file finds nothing; its controls
//      find what is planted
//   3. W7-2/W7-5, first start (installer/test/harness.mjs; window never shown; the mock model): D01 — a key typed in the
//      page, checked (the app asked for DeepSeek's public address; the mock answered); the balance read with that key
//      (the app asked DeepSeek's balance address with a Bearer authorization; a stand-in answered) and its reading in the
//      sidebar; D02 — the folder from the dialog, the sandbox check with the toolkit's imports and node passed (main.log);
//      home with no project; nothing of development: no gallery, no devtools, every STREAMS_* switch set to a trap and
//      none taken; the app gave Windows its AppUserModelID and toast activator CLSID
//   4. W7-2: D04 → the app's first turn: in the assistant's shell `py`, `python`, `node` are the installed ones and
//      `import yaml, docx, pypdf, lxml` works in the sandbox; the task plan card pops, 确认 in the page, the record is
//      signed and app-core verifies it with the installed toolkit; nothing went anywhere but the mock and the balance
//      stand-in
//   5. quitting after the turn, with no debugger attached: the time, and no process of the install left
//   6. a second start (no remote debugging at all): the home page with the project; the balance read at start went to
//      the stand-in too; still nothing through the proxy; quitting again, timed; the Start-menu shortcut and the toast
//      activator key as the installer left them (with YZ_W7_FROM_STAGE: both exactly as before the run — absent stays absent,
//      a real install's stay as they were: no notification of the two runs reached Electron, harness.mjs)
//   7. W7-3: silent uninstall (the default: the app's data kept): program folder, shortcuts, uninstall entry, toast
//      activator key gone; the project folder still there; ~/.dsh, %APPDATA%\Streams, %LOCALAPPDATA%\Streams as before
// Everything lives in one folder under the OS temp folder, removed at the end (links first).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchInstalled, readRecord, requestQuit } from './harness.mjs'
import { machineMarkers, scanForLeaks } from '../scan.mjs'
import { groupMatchesIco, iconGroups, innoCopyright, setupVersionInfo, versionInfo } from '../exe-resources.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { FIRST_RUN: T } = await imp('desktop/src/renderer/texts/first-run.js')
const { APP_USER_MODEL_ID, TOAST_ACTIVATOR_CLSID } = await imp('desktop/src/main/app-id.mjs')
const { ICON_FILE } = await imp('desktop/src/main/icon.mjs')
const { parseIco } = await imp('desktop/scripts/lib/icon.mjs')
const { Keyring, checkProjectSignoffs } = await imp('app-core/src/index.mjs')
const { startMockModel, lastToolResults } = await imp('engine/mock/mock-model.mjs')
const { reading, startBalanceMock } = await imp('desktop/test/support/balance-mock.mjs')
const MAIN = await imp('app-core/fixtures/example/main-project.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')

const RECORD = JSON.parse(readFileSync(join(REPO, 'installer', 'dist', 'build-record.json'), 'utf8'))
const SETUP = join(REPO, RECORD.installer.file)
const STAGE_MANIFEST = JSON.parse(readFileSync(join(REPO, 'installer', 'dist', 'stage-manifest.json'), 'utf8'))
const RELEASE = RECORD.release
const UNINSTALL_KEY = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{${RELEASE.app_guid}}_is1`
// the app's toast activator registration (docs/installer.md §九 12): the installer writes it, Electron writes it again at
// the app's first notification of a run, the uninstaller removes it. The one key of HKCU\Software\Classes\CLSID this test
// looks at — the app's own, by its fixed CLSID
const TOAST_KEY = `HKCU:\\Software\\Classes\\CLSID\\${TOAST_ACTIVATOR_CLSID}`
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const SYSTEM32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
const TEST_KEY = 'sk-streams-packaged-test-key-00000000000000aa' // fake; the mock answers it, nothing real does
const PUBLIC_BASE_URL = 'https://api.deepseek.com/anthropic'
// the balance endpoint as docs/desktop.md §17.2 documents it (written out here, not taken from the app's code)
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
// what the balance stand-in answers, and how the sidebar block writes it (two decimals, the yuan sign)
const BALANCE_READING = reading({ cny: { total: 23.45, granted: 0, toppedUp: 23.45 } })
const BALANCE_SHOWN = '¥23.45'
const TITLE = '安装包试装项目'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

function ps(script) {
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8', windowsHide: true, timeout: 60_000 })
  if (r.status !== 0) throw new Error(`powershell: ${r.stderr}`)
  return r.stdout.trim()
}
const shellFolder = name => ps(`[Environment]::GetFolderPath('${name}')`)
const uninstallEntry = () => {
  const out = ps(`if (Test-Path '${UNINSTALL_KEY}') { Get-ItemProperty '${UNINSTALL_KEY}' | Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString, QuietUninstallString, DisplayIcon | ConvertTo-Json -Compress } else { 'none' }`)
  return out === 'none' ? null : JSON.parse(out)
}
const shortcut = path => (existsSync(path)
  ? JSON.parse(ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${path}'); $i = (New-Object -ComObject Shell.Application).NameSpace('${dirname(path)}').ParseName('${path.split(sep).pop()}'); @{ target = $s.TargetPath; workdir = $s.WorkingDirectory; icon = $s.IconLocation; aumid = [string]$i.ExtendedProperty('System.AppUserModel.ID'); clsid = [string]$i.ExtendedProperty('System.AppUserModel.ToastActivatorCLSID') } | ConvertTo-Json -Compress`))
  : null)
// A shortcut as Electron 44 reads it before deciding whether to rewrite it (windows_toast_activator.cc,
// ExistingShortcutValid; docs/installer.md §九 12): through IShellLink and the link's IPropertyStore, the raw target
// (SLGP_RAWPATH), the working folder, and AppUserModel.ID and ToastActivatorCLSID with their PROPVARIANT types — Electron
// keeps the shortcut only when the ID is a VT_LPWSTR and the CLSID a VT_CLSID. Inno Setup writes the ID as a VT_BSTR; the
// installer's [Code] writes it back as a VT_LPWSTR. C#, compiled by PowerShell's Add-Type; the file is opened read-only.
const VT_LPWSTR = 31
const VT_CLSID = 72
const LINK_READER = String.raw`using System;
using System.Runtime.InteropServices;
using System.Text;
namespace StreamsTest {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey { public Guid fmtid; public uint pid; public PropertyKey(Guid f, uint p) { fmtid = f; pid = p; } }
  [StructLayout(LayoutKind.Explicit, Size = 24)]
  public struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int cch, IntPtr fd, uint flags);
    void GetIDList(out IntPtr ppidl); void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
  }
  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPersistFile {
    void GetClassID(out Guid c); [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string f, uint mode);
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    void GetCount(out uint c); void GetAt(uint i, out PropertyKey k);
    void GetValue(ref PropertyKey k, out PropVariant v);
  }
  public static class LinkReader {
    public static string[] Read(string path) {
      object o = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
      ((IPersistFile)o).Load(path, 0);
      var link = (IShellLinkW)o;
      var target = new StringBuilder(1024); link.GetPath(target, 1024, IntPtr.Zero, 4);
      var dir = new StringBuilder(1024); link.GetWorkingDirectory(dir, 1024);
      var store = (IPropertyStore)o;
      var group = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
      var idKey = new PropertyKey(group, 5); var clsidKey = new PropertyKey(group, 26);
      PropVariant id, clsid; store.GetValue(ref idKey, out id); store.GetValue(ref clsidKey, out clsid);
      string idText = (id.vt == 31 || id.vt == 8) && id.p != IntPtr.Zero ? Marshal.PtrToStringUni(id.p) : "";
      string clsidText = clsid.vt == 72 && clsid.p != IntPtr.Zero ? ((Guid)Marshal.PtrToStructure(clsid.p, typeof(Guid))).ToString("B").ToUpperInvariant() : "";
      return new string[] { target.ToString(), dir.ToString(), id.vt.ToString(), idText, clsid.vt.ToString(), clsidText };
    }
  }
}
`
let linkReaderFile = null
const asElectronReadsIt = path => {
  if (!linkReaderFile) { linkReaderFile = join(ROOT, 'link-reader.cs'); writeFileSync(linkReaderFile, LINK_READER) }
  return JSON.parse(ps(`Add-Type -Path '${linkReaderFile}'; $r = [StreamsTest.LinkReader]::Read('${path}'); @{ target = $r[0]; workdir = $r[1]; aumidType = [int]$r[2]; aumid = $r[3]; clsidType = [int]$r[4]; clsid = $r[5] } | ConvertTo-Json -Compress`))
}
/** The app's toast activator key (TOAST_KEY): its default value, CustomActivator and LocalServer32's default, or null. */
const toastKey = () => {
  const out = ps(`if (Test-Path -LiteralPath '${TOAST_KEY}') { $k = Get-Item -LiteralPath '${TOAST_KEY}'; $l = Get-Item -LiteralPath '${TOAST_KEY}\\LocalServer32' -ErrorAction SilentlyContinue; @{ name = $k.GetValue(''); customActivator = $k.GetValue('CustomActivator'); localServer = $(if ($l) { $l.GetValue('') } else { $null }) } | ConvertTo-Json -Compress } else { 'none' }`)
  return out === 'none' ? null : JSON.parse(out)
}
/** A real install's traces, read only (the guard, YZ_W7_FROM_STAGE): uninstall entry, both shortcuts (what they point at, their
 *  size and time), the notification key. */
const realInstallPicture = () => {
  const link = p => (existsSync(p) ? { ...shortcut(p), bytes: statSync(p).size, mtime: Math.round(statSync(p).mtimeMs) } : null)
  return { entry: uninstallEntry(), startMenu: link(S.startMenu), desktop: link(S.desktop), toastKey: toastKey() }
}
/** An icon reference ("path,index") without its index. */
const iconFileOf = ref => String(ref ?? '').replace(/,-?\d+$/, '')
/** Processes whose executable lies under `dir` (the installed app and anything it started from there). */
const processesUnder = dir => {
  const out = ps(`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('${resolve(dir).toLowerCase()}') } | Select-Object ProcessId, Name | ConvertTo-Json -Compress`)
  if (!out) return []
  const rows = JSON.parse(out)
  return Array.isArray(rows) ? rows : [rows]
}
const endProcesses = rows => { for (const p of rows) spawnSync(join(SYSTEM32, 'taskkill.exe'), ['/PID', String(p.ProcessId), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) }

/** Names, sizes and times of everything below `root` (nothing read inside files; links not followed). */
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

function sha256File(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }

function* walkFiles(root, dir = root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    const st = lstatSync(p)
    if (st.isSymbolicLink()) yield { path: p, link: true }
    else if (st.isDirectory()) yield* walkFiles(root, p)
    else yield { path: p, link: false }
  }
}

// ---------------------------------------------------------------- the world of this run

// A developer's shortcut, not the acceptance run: YZ_W7_FROM_STAGE=1 runs steps 3–6 on installer/dist/stage (the same
// folder the installer installs) without installing; steps 1, 2 and 7 (the installer itself) are skipped.
const FROM_STAGE = process.env.YZ_W7_FROM_STAGE === '1'
const STARTED = Date.now()
const ROOT = mkdtempSync(join(tmpdir(), 'st-w7-'))
const W = {
  install: FROM_STAGE ? join(REPO, 'installer', 'dist', 'stage') : join(ROOT, 'install'),
  roaming: join(ROOT, 'roaming'),
  local: join(ROOT, 'local'),
  projects: join(ROOT, '研究项目'),
  traps: join(ROOT, 'traps'),
  tmp: join(ROOT, 'tmp'),
}
W.appData = join(W.roaming, RELEASE.install_folder)
W.dshHome = join(W.local, RELEASE.install_folder, 'dsh-home')
W.exe = join(W.install, RELEASE.exe_name)
for (const d of [W.roaming, W.local, W.traps, W.tmp]) mkdirSync(d, { recursive: true })
for (const d of ['app-data', 'dsh-home', 'projects', 'pick', 'drive-D', 'drive-C']) mkdirSync(join(W.traps, d), { recursive: true })

const real = {
  appData: join(process.env.APPDATA, RELEASE.install_folder),
  localAppData: join(process.env.LOCALAPPDATA, RELEASE.install_folder),
  dsh: join(homedir(), '.dsh'),
}
const S = { pictures: {}, mock: null, trap: null, balance: null, trapRequests: [], toolResults: [], quit: {} }

// the mock model: the key check gets "ok"; the turns follow the script below, one step per model request
const turnSteps = []
const dispatch = async req => {
  if (req.body?.max_tokens === 1) return { text: 'ok' } // the key check: one token, the cheapest model
  const step = turnSteps.shift()
  if (!step) return { error: { status: 400, type: 'invalid_request_error', message: 'no scripted step left' } }
  return typeof step === 'function' ? step(req) : step
}

/** The app's environment: a machine without Python or Node on its PATH, a proxy that refuses everything (the egress
 *  trap), and every development switch set — to a trap. A packaged app must take none of them. */
function appEnv() {
  const env = {}
  for (const k of ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION', 'OS', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'PSModulePath', 'PUBLIC', 'ALLUSERSPROFILE', 'SystemDrive']) {
    if (process.env[k] !== undefined) env[k] = process.env[k]
  }
  env.PATH = [SYSTEM32, join(SYSTEM32, 'Wbem'), join(SYSTEM32, 'WindowsPowerShell', 'v1.0')].join(';')
  env.HTTP_PROXY = S.mock.url
  env.HTTPS_PROXY = S.mock.url
  env.NO_PROXY = '127.0.0.1,localhost'
  Object.assign(env, {
    STREAMS_APP_DATA: join(W.traps, 'app-data'), STREAMS_DSH_HOME: join(W.traps, 'dsh-home'), STREAMS_PROJECTS_ROOT: join(W.traps, 'projects'),
    STREAMS_WINDOW: 'hidden', STREAMS_START_SCREEN: 'kit', STREAMS_DEV_API_KEY: 'sk-development-trap-key-should-never-be-stored',
    STREAMS_DEV_MODEL_URL: S.trap.url, STREAMS_DEV_DRIVE_ROOTS: JSON.stringify({ D: join(W.traps, 'drive-D'), C: join(W.traps, 'drive-C') }),
    STREAMS_DEV_PICK_FOLDER: join(W.traps, 'pick'), STREAMS_DEV_PICK_FILES: JSON.stringify([]), STREAMS_DEV_SANDBOX_NO_GRANT: '1',
    STREAMS_DEV_BACKGROUND_WAIT_MS: '1', STREAMS_DEV_SAVE_TO: join(W.traps, 'pick', 'x.docx'),
  })
  return env
}

const hook = (n, more = {}) => ({ appData: W.roaming, localAppData: W.local, mockUrl: S.mock.url, balanceUrl: S.balance.url, recordFile: join(ROOT, `record-${n}.jsonl`), pickFolder: W.projects, quitFile: join(ROOT, `quit-${n}`), ...more })

/** The app's balance reads in one start's record (harness.mjs) and what the stand-in got: every one the documented GET with
 *  a Bearer authorization — the key the page stored (compared, never printed). Returns how many the app made. */
async function checkBalanceReads(n) {
  const readsOf = i => readRecord(hook(i).recordFile).filter(r => r.kind === 'balance-read')
  const reads = readsOf(n)
  assert.ok(reads.length >= 1, `start ${n}: the app read the balance`)
  for (const r of reads) assert.deepEqual({ url: r.url, method: r.method, bearer: r.bearer }, { url: BALANCE_URL, method: 'GET', bearer: true }, `start ${n}: what the app asked for`)
  // the stand-in serves the whole run: it gets the reads of this start and the ones before. A read is recorded just before
  // it is sent, so the last one gets a moment to arrive
  let all = 0
  for (let i = 1; i <= n; i += 1) all += readsOf(i).length
  for (let i = 0; i < 50 && S.balance.requests.length < all; i += 1) await sleep(100)
  const got = S.balance.requests.map(r => ({ method: r.method, url: r.url, key: r.bearer === TEST_KEY }))
  assert.equal(got.length, all, 'the stand-in got exactly the reads the app made (none by another way)')
  assert.ok(got.every(g => g.method === 'GET' && g.url === '/user/balance' && g.key), 'every read reached the stand-in as GET /user/balance with the stored key')
  return reads.length
}

before(async () => {
  assert.equal(process.platform, 'win32', 'the installer is Windows-only')
  assert.ok(existsSync(SETUP), `no installer at ${SETUP}: run node installer/build-installer.mjs`)
  assert.equal(sha256File(SETUP), RECORD.installer.sha256, 'the installer is the one the build recorded')
  // guards: a real install of Streams on this machine is never touched. The whole run installs, so it refuses to start next to
  // one; YZ_W7_FROM_STAGE installs nothing (the app runs from the stage), so there a real install is only pictured — its
  // uninstall entry, its shortcuts, its notification key — and step 6 checks it is exactly as it was (work order 08: The maintainer's
  // machine has one now)
  S.startMenu = join(shellFolder('Programs'), `${RELEASE.app_name}.lnk`)
  S.desktop = join(shellFolder('DesktopDirectory'), `${RELEASE.app_name}.lnk`)
  S.realInstall = realInstallPicture()
  if (!FROM_STAGE) {
    assert.equal(S.realInstall.entry, null, `a Streams uninstall entry already exists (${UNINSTALL_KEY}); this test does not touch a real install`)
    assert.equal(existsSync(S.startMenu), false, `${S.startMenu} already exists`)
    assert.equal(existsSync(S.desktop), false, `${S.desktop} already exists`)
    assert.equal(S.realInstall.toastKey, null, `${TOAST_KEY} already exists; this test does not touch the app's own registration`)
  }
  S.pictures.before = { dsh: picture(real.dsh), appData: picture(real.appData), localAppData: picture(real.localAppData) }
  S.mock = await startMockModel({ script: Array.from({ length: 60 }, () => dispatch), unref: true })
  S.balance = await startBalanceMock({ response: BALANCE_READING })
  S.trap = await new Promise(r => {
    const server = createServer((req, res) => { S.trapRequests.push(`${req.method} ${req.url}`); res.writeHead(500).end() })
    server.on('connect', (req, socket) => { S.trapRequests.push(`CONNECT ${req.url}`); socket.destroy() })
    server.listen(0, '127.0.0.1', () => { server.unref(); r({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }) })
  })
})

after(async () => {
  // whatever happened: no process of the install, the uninstaller run if the install is still there, then the folder
  const left = existsSync(W.install) ? processesUnder(W.install) : []
  if (left.length) { process.stderr.write(`after: ending ${left.length} process(es) of the install\n`); endProcesses(left) }
  // YZ_W7_FROM_STAGE: a real install's traces compared once more whatever happened (step 6 compares only when the run gets
  // that far); asserted at the end, after the clean-up
  const realNow = FROM_STAGE && S.realInstall ? realInstallPicture() : null
  // (only this run's own install: YZ_W7_FROM_STAGE never uninstalls anything)
  if (!FROM_STAGE && uninstallEntry() && existsSync(join(W.install, 'unins000.exe'))) {
    spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true })
    for (let i = 0; i < 120 && uninstallEntry(); i += 1) await sleep(500)
  }
  // the uninstaller's own copy in TEMP, when it outlived the uninstall (see step 7)
  for (const n of readdirSync(tmpdir()).filter(n => /^is-.*-uninstall.tmp$/i.test(n) && statSync(join(tmpdir(), n)).mtimeMs >= STARTED)) {
    try { removeTree(join(tmpdir(), n), { waitMs: 10_000 }) } catch { /* still in use: left */ }
  }
  await S.mock?.close()
  await S.balance?.close()
  S.trap?.close()
  await sleep(500)
  removeTree(ROOT, { waitMs: 30_000 })
  if (realNow) assert.deepEqual(realNow, S.realInstall, 'after the run: the real Start-menu shortcut, desktop shortcut, uninstall entry and notification key as before it')
})

// ---------------------------------------------------------------- 1. install

test('1 · silent install into a temporary folder: uninstall entry, shortcuts with the app\'s ID and toast activator CLSID as Electron reads them, its registry key, the icon on all of them and in Streams.exe, every file the stage\'s, no link, permissions inherited', { skip: FROM_STAGE && 'YZ_W7_FROM_STAGE: not the installer' }, async () => {
  const t0 = Date.now()
  const r = spawnSync(SETUP, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`, `/LOG=${join(ROOT, 'install.log')}`], { windowsHide: true, timeout: 600_000 })
  S.installSeconds = Math.round((Date.now() - t0) / 100) / 10
  assert.equal(r.status, 0, `setup exit code ${r.status}`)
  assert.ok(existsSync(W.exe))

  const entry = uninstallEntry()
  assert.ok(entry, 'the uninstall entry is there (HKCU: a per-user install)')
  assert.equal(entry.DisplayName, RELEASE.app_ver_name)
  assert.equal(entry.DisplayVersion, RELEASE.version)
  assert.equal(entry.Publisher, RELEASE.publisher)
  assert.ok(same(entry.InstallLocation, W.install), entry.InstallLocation)
  assert.match(entry.UninstallString, /unins000\.exe/i)
  S.entry = entry

  // the icon (desktop/assets/icon, installed at resources/app/assets/icon/streams.ico): the uninstall entry's and both
  // shortcuts' icon is that file; Streams.exe's own icon group holds exactly its images and its version info is 流息's
  // (the build ran rcedit; installer/exe-resources.mjs reads both back from the PE)
  const ico = join(W.install, 'resources', 'app', ...ICON_FILE)
  assert.ok(existsSync(ico), ico)
  assert.ok(same(iconFileOf(entry.DisplayIcon), ico), `the uninstall entry's icon: ${entry.DisplayIcon}`)
  S.shortcuts = {}
  for (const lnk of [S.startMenu, S.desktop]) {
    const s = shortcut(lnk)
    assert.ok(s, `${lnk} is there`)
    assert.ok(same(s.target, W.exe), `${lnk} → ${s.target}`)
    assert.equal(s.aumid, APP_USER_MODEL_ID, `${lnk} carries the app's AppUserModelID`)
    assert.ok(same(iconFileOf(s.icon), ico), `${lnk} icon: ${s.icon}`)
    assert.equal(s.clsid, TOAST_ACTIVATOR_CLSID, `${lnk} carries the app's toast activator CLSID`)
    // what Electron 44 checks before it would rewrite the Start-menu shortcut at the app's first notification
    // (docs/installer.md §九 12), read as Electron reads it: the raw target is the exe it runs and the working folder that
    // exe's folder — the strings, compared ignoring case as Electron compares them (a trailing backslash would already
    // differ) —, the ID a VT_LPWSTR (Inno Setup's VT_BSTR rewritten by the installer's [Code]) and the app's, the CLSID a
    // VT_CLSID and the one the app sets. The desktop shortcut is made the same way
    const e = asElectronReadsIt(lnk)
    assert.deepEqual({ aumidType: e.aumidType, clsidType: e.clsidType }, { aumidType: VT_LPWSTR, clsidType: VT_CLSID }, `${lnk}: the property types Electron accepts`)
    assert.equal(e.aumid, APP_USER_MODEL_ID)
    assert.equal(e.clsid, TOAST_ACTIVATOR_CLSID)
    assert.equal(e.target.toLowerCase(), W.exe.toLowerCase(), `${lnk} target, as Electron compares it`)
    assert.equal(e.workdir.toLowerCase(), W.install.toLowerCase(), `${lnk} working folder, as Electron compares it`)
    S.shortcuts[lnk === S.startMenu ? 'startMenu' : 'desktop'] = { ...s, asElectronReadsIt: e }
  }
  // the toast activator's registration, as Electron writes it: the installer's, removed again by the uninstaller (step 7)
  const key = toastKey()
  assert.ok(key, `${TOAST_KEY} is there`)
  assert.equal(key.name, 'Electron Notification Activator')
  assert.equal(key.customActivator, 1)
  assert.ok(key.localServer && same(key.localServer, W.exe), `LocalServer32 → ${key.localServer}`)
  S.toastKey = key
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
  assert.equal(info.LegalCopyright, RELEASE.copyright, 'the company\'s copyright line (release.json), as it is')
  assert.match(RELEASE.copyright, /^Copyright \(C\) \d{4} Starry Data & Technology Inc\.$/, 'release.json names the company')
  assert.deepEqual(info, RECORD.streams_exe.version_info, 'the version info the build recorded')
  // the setup program's own version info: the same release.json values (publisher, names, version; Inno Setup's text
  // version is the four-part one), the same copyright line (Inno Setup writes its "(C)" as ©), what the build recorded
  const setup = setupVersionInfo(SETUP)
  assert.equal(setup.CompanyName, RELEASE.publisher)
  assert.equal(setup.ProductName, RELEASE.app_name)
  assert.equal(setup.FileDescription, RELEASE.app_ver_name)
  assert.equal(setup.ProductVersion, RELEASE.version)
  assert.equal(setup.FileVersion, `${RELEASE.version}.0`)
  assert.equal(setup.LegalCopyright, innoCopyright(RELEASE.copyright), 'the setup program carries the company\'s copyright line')
  assert.equal(setup.LegalCopyright.replace('©', '(C)'), info.LegalCopyright, 'setup program and Streams.exe: one copyright line')
  assert.deepEqual(setup, RECORD.installer.version_info, 'the setup program\'s version info the build recorded')
  S.exe = { versionInfo: info, iconGroup: groups[0].images.map(i => `${i.width}x${i.height}`), shortcutIcon: shortcut(S.startMenu).icon, uninstallIcon: entry.DisplayIcon }
  S.setup = { versionInfo: setup }

  // the install folder is the stage, file for file, byte for byte (plus the uninstaller's two files)
  const installed = new Map()
  const links = []
  for (const f of walkFiles(W.install)) {
    if (f.link) { links.push(relative(W.install, f.path)); continue }
    installed.set(relative(W.install, f.path).split(sep).join('/'), f.path)
  }
  assert.deepEqual(links, [], 'no link in the install folder')
  const staged = new Set(STAGE_MANIFEST.files.map(f => f.path))
  const extra = [...installed.keys()].filter(p => !staged.has(p))
  assert.deepEqual(extra.sort(), ['unins000.dat', 'unins000.exe'], 'nothing but the stage and the uninstaller')
  let checked = 0
  for (const f of STAGE_MANIFEST.files) {
    const p = installed.get(f.path)
    assert.ok(p, `${f.path} is installed`)
    assert.equal(statSync(p).size, f.bytes, f.path)
    assert.equal(sha256File(p), f.sha256, f.path)
    checked += 1
  }
  S.installedFiles = checked
  assert.ok(lstatSync(join(W.install, 'resources', 'engine', 'node_modules', '@streams', 'ann-runtime')).isDirectory())
  assert.equal(existsSync(join(W.install, 'resources', 'default_app.asar')), false, 'no Electron default app')
  assert.equal(existsSync(join(W.install, 'resources', 'app', 'src', 'renderer', 'screens', 'kit.js')), false, 'no component gallery')
  assert.match(readFileSync(join(W.install, 'THIRD-PARTY-NOTICES.txt'), 'utf8'), /@deepseek-ai\/libreoffice-kit@0\.1\.2 — MPL-2\.0/)

  // every installed file and folder inherits the install folder's permissions (the 10-05 trap cannot come back here)
  const acl = spawnSync('py', ['-3.12', '-X', 'utf8', join(REPO, 'installer', 'python', 'acls.py'), 'check', W.install], { encoding: 'utf8', windowsHide: true, timeout: 600_000 })
  S.acl = JSON.parse(acl.stdout)
  assert.equal(acl.status, 0, acl.stdout)
  assert.equal(S.acl.not_inherited, 0)
})

// ---------------------------------------------------------------- 2. scan

test('2 · W7-4: no key, no address of ours, nothing of this machine, no project content in the install folder or the installer; the scan finds what is planted', { skip: FROM_STAGE && 'YZ_W7_FROM_STAGE: not the installer' }, () => {
  // a made-up address joins the machine's own (git, STREAMS_SCAN_EMAILS) so the control below always has one to plant
  const PLANTED_EMAIL = 'planted.check@example.invalid'
  const markers = machineMarkers({ emails: [PLANTED_EMAIL] })
  const contentMarkers = [MAIN.TITLE, 'Streams-trial', 'Desktop\\研究项目', 'Desktop/研究项目']
  const allowed = new Set(RECORD.scan.allowed.map(a => `${a.kind}|${a.file}`))
  const installedScan = scanForLeaks([W.install], { markers, contentMarkers, devFiles: ['src/renderer/screens/kit.js', 'src/renderer/texts/kit.js', 'src/renderer/styles/screens/kit.css', 'fixtures/make-example.mjs'] })
  // the uninstall log is written on this machine at install time and names where it installed (here a folder under this
  // user's TEMP): that is not something the installer carried, so only its machine hits are expected; key, address and
  // content hits would still count
  const installTime = h => h.file === 'unins000.dat' && h.kind === 'machine'
  const hits = installedScan.hits.filter(h => !allowed.has(`${h.kind}|${h.file.split(sep).join('/')}`) && !installTime(h))
  assert.deepEqual(hits, [])
  const setupScan = scanForLeaks([SETUP], { markers, contentMarkers })
  assert.deepEqual(setupScan.hits, [])
  S.scan = { files: installedScan.scanned, bytes: installedScan.bytes, allowed: installedScan.hits.filter(h => !installTime(h)).length - hits.length, uninstallLogNamesInstallFolder: installedScan.hits.some(installTime), thirdPartyMail: installedScan.info.thirdPartyPersonalMail, setup: setupScan.bytes }
  // controls: the same scan finds a planted key, path, address and title, as text and as UTF-16
  const plant = join(W.tmp, 'plant')
  mkdirSync(plant)
  writeFileSync(join(plant, 'a.txt'), `key ${TEST_KEY}\nC:\\Users\\${markers.profile}\\x\n${PLANTED_EMAIL}\n`)
  writeFileSync(join(plant, 'b.bin'), Buffer.from(`${MAIN.TITLE} ${markers.host}`, 'utf16le'))
  const control = scanForLeaks([plant], { markers, contentMarkers })
  assert.deepEqual([...new Set(control.hits.map(h => h.kind))].sort(), ['content', 'email', 'key', 'machine'])
})

// ---------------------------------------------------------------- 3. first start

let A = null // the first start
const page = () => A.page
const until = (fn, arg, timeout = 90_000) => page().waitForFunction(fn, arg, { polling: 200, timeout })

test('3 · W7-2/W7-5 · first start: D01 with a key checked (the app asks DeepSeek\'s public address), D02 with the sandbox check of the toolkit, home with no project; no development switch taken', async () => {
  A = await launchInstalled({ exe: W.exe, env: appEnv(), hook: hook(1), repo: REPO, cwd: W.install })
  await until(() => document.querySelector('main[data-screen="first-run"][data-state="ready"]'))
  // the packaged app, from the install folder
  // (developer tools: asked to open, they do not — the window was made with devTools off)
  const facts = await A.evaluate(`(async () => { const { app, Menu, BrowserWindow } = require('electron'); const w = BrowserWindow.getAllWindows()[0]; w.webContents.openDevTools({ mode: 'detach' }); await new Promise(r => setTimeout(r, 1000)); return { packaged: app.isPackaged, version: app.getVersion(), resources: process.resourcesPath, menu: Menu.getApplicationMenu(), devTools: w.webContents.isDevToolsOpened(), visible: w.isVisible(), toastActivatorCLSID: app.toastActivatorCLSID } })()`)
  assert.equal(facts.packaged, true)
  assert.equal(facts.version, RELEASE.version)
  assert.ok(same(facts.resources, join(W.install, 'resources')), facts.resources)
  assert.equal(facts.menu, null, 'no menu')
  assert.equal(facts.devTools, false, 'no developer tools in the packaged app')
  assert.equal(facts.visible, false, 'the window was never shown')
  // the app gave Windows its toast activator CLSID (the hook recorded the call; Electron reports it back as set)
  const rec1 = readRecord(hook(1).recordFile)
  assert.deepEqual(rec1.filter(r => r.kind === 'toast-activator-clsid').map(r => r.id), [TOAST_ACTIVATOR_CLSID], 'app.setToastActivatorCLSID, once, with the fixed CLSID')
  assert.equal(facts.toastActivatorCLSID, TOAST_ACTIVATOR_CLSID, 'the CLSID Electron uses')
  assert.ok(rec1.some(r => r.kind === 'hook' && r.notifications === 'stand-in'), 'notifications go to the harness\'s stand-in')
  assert.equal(await page().evaluate(() => document.querySelector('.first-run__body')?.dataset.step), '1', 'D01: no key stored (STREAMS_DEV_API_KEY not taken)')
  // the gallery is not reachable
  await page().evaluate(() => { location.hash = '#kit' })
  await sleep(1500)
  assert.equal(await page().evaluate(() => Boolean(document.querySelector('main[data-screen="kit"]'))), false, 'no component gallery')
  await page().evaluate(() => { location.hash = '' })

  // D01: the key typed; the app checks it against DeepSeek's public address (the mock answers, see harness.mjs)
  await page().fill('#first-run-key', TEST_KEY)
  await until(w => document.getElementById('first-run-key-status')?.textContent === w, T.keyOk)
  const rec = readRecord(hook(1).recordFile)
  const keyChecks = rec.filter(r => r.kind === 'key-check')
  assert.ok(keyChecks.length >= 1)
  assert.ok(keyChecks.every(k => k.baseURL === PUBLIC_BASE_URL && same(k.command, W.exe)), JSON.stringify(keyChecks))
  await page().click('.first-run__footer .st-button--primary')
  await until(() => document.querySelector('.first-run__body')?.dataset.step === '2' && document.querySelector('[data-loaded="yes"]'))

  // D02: another folder (the dialog answers with the test's folder), then 完成: made, rights, the sandbox check
  await page().click('.first-run__other .st-button')
  await until(() => document.querySelector('.first-run__chosen'))
  const t0 = Date.now()
  await page().click('.first-run__footer .st-button--primary')
  await until(() => document.querySelector('main[data-screen="home"][data-state="ready"]'), null, 120_000)
  S.d02Seconds = Math.round((Date.now() - t0) / 100) / 10
  assert.ok(existsSync(W.projects))
  const log = readFileSync(join(W.appData, 'logs', 'main.log'), 'utf8')
  const passed = /the sandbox check passed \(python (.+?), node (v[\d.]+), electron ([\d.]+)\)/.exec(log)
  assert.ok(passed, 'the D02 check passed in the sandbox')
  assert.ok(same(passed[1], join(W.install, 'resources', 'python', 'python.exe')), passed[1])
  assert.equal(passed[3], '44.0.0')
  S.d02 = { python: passed[1], node: passed[2], electron: passed[3] }
  assert.match(ps(`icacls '${W.projects}'`), /\(WDAC,WO\)/, 'the rights were granted (STREAMS_DEV_SANDBOX_NO_GRANT not taken)')
  const projects = await page().evaluate(() => window.streams.listProjects())
  assert.equal(projects.ok, true)
  assert.deepEqual(projects.data.projects, [], 'no example project')
  // the balance, read with the key D01 stored (connectApiKey): the app asked DeepSeek's balance address with a Bearer
  // authorization, the harness answered from the stand-in, and the sidebar's block shows that reading (docs/desktop.md §17.3, ok)
  await until(want => document.querySelector('[data-balance="ok"]')?.innerText.includes(want), BALANCE_SHOWN, 30_000)
  await checkBalanceReads(1)
  assert.ok(same(JSON.parse(readFileSync(join(W.appData, 'settings.json'), 'utf8')).projectsRoot, W.projects), 'the folder from the dialog, not STREAMS_DEV_PICK_FOLDER')
})

// ---------------------------------------------------------------- 4. the first turn

test('4 · W7-2 · D04 → the first turn: py, python, node in the assistant\'s shell are the installed ones and import yaml, docx, pypdf, lxml in the sandbox; the task plan card, 确认, a valid signature', async () => {
  const command = [
    "$o = @()",
    "$o += 'where-py=' + (Get-Command py).Source",
    "$o += 'where-python=' + (Get-Command python).Source",
    "$o += 'where-node=' + (Get-Command node).Source",
    "$o += (py -c \"import sys; print('py-exe=' + sys.executable)\")",
    "$o += (python -c \"import sys; print('python-exe=' + sys.executable)\")",
    "$o += (node -e \"console.log('node-exe=' + process.execPath + ' electron=' + process.versions.electron)\")",
    "$o += (py -c \"import yaml, docx, pypdf, lxml.etree; print('imports=' + str(yaml.safe_load('a: 1')) + ' ' + str(lxml.etree.LXML_VERSION))\")",
    '$o -join [Environment]::NewLine',
  ].join('; ')
  const plan = MAIN.taskPlan(2)
  turnSteps.push(
    { tool: { name: 'pwsh', input: { command, description: 'Check the tools' } } },
    req => { S.toolResults.push(lastToolResults(req.body)); return { tools: [{ name: 'write', input: { file_path: 'task_plan.md', content: `---\n${plan.fm}\n---\n${plan.body}` } }, { name: 'write', input: { file_path: 'clarify.yaml', content: MAIN.CLARIFY } }] } },
    req => { S.toolResults.push(lastToolResults(req.body)); return { text: '任务计划写好了，请你确认。', tool: { name: 'ann_gate_card', input: { id: 'task-plan', kind: 'task_plan' } } } },
    req => { S.toolResults.push(lastToolResults(req.body)); return { text: '好，任务计划定下了。' } },
  )
  await page().click('.st-sidebar__new')
  await until(() => document.querySelector('#new-project-name'))
  await page().fill('#new-project-name', TITLE)
  await page().fill('#new-project-request', MAIN.REQUEST)
  await page().click('.new-project__bar .st-button--primary')
  await until(() => document.querySelector('.wb-card[data-kind="task_plan"][data-state="waiting"]'), null, 180_000)
  const shell = S.toolResults[0]?.[0]
  assert.ok(shell && !shell.is_error, JSON.stringify(shell))
  const lines = Object.fromEntries(shell.text.split(/\r?\n/).map(l => l.trim()).filter(l => /^[a-z-]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  S.shell = lines
  const bin = join(W.dshHome, 'profiles', 'ann', 'bin')
  assert.ok(same(lines['where-py'], join(bin, 'py.cmd')), lines['where-py'])
  assert.ok(same(lines['where-python'], join(bin, 'python.cmd')), lines['where-python'])
  assert.ok(same(lines['where-node'], join(bin, 'node.cmd')), lines['where-node'])
  assert.ok(same(lines['py-exe'], join(W.install, 'resources', 'python', 'python.exe')), lines['py-exe'])
  assert.ok(same(lines['python-exe'], join(W.install, 'resources', 'python', 'python.exe')), lines['python-exe'])
  assert.ok(lines['node-exe'] && same(lines['node-exe'].split(' electron=')[0], W.exe), lines['node-exe'])
  assert.match(lines['node-exe'], /electron=44\.0\.0$/)
  assert.match(lines.imports ?? '', /^\{'a': 1\} \(6, 1, 3, 0\)$/, 'yaml, docx, pypdf and lxml imported and used in the sandbox')
  // dsh itself: run by the installed Streams.exe as Node, from the installed engine, with no development model address
  const dsh = readRecord(hook(1).recordFile).filter(r => r.kind === 'dsh')
  assert.ok(dsh.length >= 1)
  for (const d of dsh) {
    assert.ok(same(d.command, W.exe), d.command)
    assert.ok(same(d.dsh, join(W.install, 'resources', 'engine', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')), d.dsh)
    assert.equal(d.runAsNode, '1')
    assert.equal(d.baseUrlGiven, null, 'the packaged app gives dsh no model address of its own (STREAMS_DEV_MODEL_URL not taken)')
    assert.ok(same(d.pathFirst, bin), d.pathFirst)
    assert.equal(d.apiKeySet, true)
  }

  // 确认 in the page; the record is signed and verifies with the installed toolkit and Python
  await page().click('.wb-card[data-kind="task_plan"][data-state="waiting"] [data-choice="confirm"]')
  await until(() => document.querySelector('[data-kind="task_plan"][data-state="answered"][data-status="confirmed"]'), null, 120_000)
  await until(() => !document.querySelector('[data-stop]') && !document.querySelector('[data-busy]'), null, 120_000)
  const registry = JSON.parse(readFileSync(join(W.appData, 'projects.json'), 'utf8'))
  const project = registry.projects.find(p => p.title === TITLE)
  assert.ok(project, JSON.stringify(registry))
  S.project = project
  assert.ok(resolve(project.path).toLowerCase().startsWith(resolve(W.projects).toLowerCase()))
  const toolkit = { python: [join(W.install, 'resources', 'python', 'python.exe'), '-E', '-X', 'utf8', '-B'], toolkitDir: join(W.install, 'resources', 'toolkit'), tempDir: W.tmp }
  const checked = await checkProjectSignoffs({ projectDir: project.path, projectId: project.id, keyring: Keyring.load(join(W.appData, 'keyring.json')), toolkit, appDataDir: W.appData })
  assert.equal(checked.docs['task_plan.md'].state, 'valid', JSON.stringify(checked.docs['task_plan.md']))
  S.signature = checked.docs['task_plan.md'].state

  // nothing went anywhere but the mock and the balance stand-in; no development switch reached anything
  S.balanceReads = await checkBalanceReads(1)
  assert.deepEqual(S.mock.egress, [], 'nothing left the machine through the proxy')
  assert.deepEqual(S.trapRequests, [], 'STREAMS_DEV_MODEL_URL was never used')
  for (const d of ['app-data', 'dsh-home', 'projects', 'pick', 'drive-D', 'drive-C']) assert.deepEqual(readdirSync(join(W.traps, d)), [], `the trap ${d} is untouched`)
  assert.ok(S.mock.messages.every(m => m.headers['x-api-key'] === TEST_KEY), 'every request carried the key the page stored')
  const rec = readRecord(hook(1).recordFile)
  S.notifications = rec.filter(r => r.kind === 'notification')
  S.aumid = rec.find(r => r.kind === 'app-user-model-id')?.id ?? null
  S.toastClsid = rec.find(r => r.kind === 'toast-activator-clsid')?.id ?? null
  assert.equal(S.aumid, APP_USER_MODEL_ID, 'the app gives Windows the ID the shortcuts carry')
  assert.equal(S.toastClsid, TOAST_ACTIVATOR_CLSID, 'and the toast activator CLSID they carry')
  assert.ok(S.notifications.length >= 1, 'a card waiting with the window not in front: a Windows notification (held back by the test)')
  // every one made and shown through the harness's stand-in, asked for after the app checked support (notify.mjs)
  S.notificationsMade = rec.filter(r => r.kind === 'notification-made').length
  assert.equal(S.notificationsMade, S.notifications.length, 'each notification shown was made from the stand-in')
  assert.ok(rec.some(r => r.kind === 'notification-supported'), 'Notification.isSupported() answered by the stand-in')
})

// ---------------------------------------------------------------- 5. quitting after the turn

async function timedQuit(app, n) {
  const quitFile = hook(n).quitFile
  const t0 = Date.now()
  requestQuit(quitFile)
  const exit = await Promise.race([app.exited, sleep(60_000).then(() => null)])
  const rec = readRecord(hook(n).recordFile)
  const at = kind => rec.find(r => r.kind === kind && r.t >= t0)?.t ?? null
  const result = {
    exitCode: exit?.code ?? null,
    toBeforeQuit: at('before-quit') && at('before-quit') - t0,
    toNodeExit: at('exit') && at('exit') - t0,
    toProcessExit: exit ? exit.at - t0 : null,
  }
  // anything of the install still running a little later?
  await sleep(3000)
  result.leftAfter3s = processesUnder(W.install).map(p => `${p.Name} ${p.ProcessId}`)
  if (!exit) endProcesses(processesUnder(W.install))
  return result
}

test('5 · quitting after the turn, no debugger attached: under 5 s, nothing of the install left running', async () => {
  await A.detach()
  S.quit.afterTurn = await timedQuit(A, 1)
  assert.ok(S.quit.afterTurn.toProcessExit !== null, `the app did not end within 60 s: ${JSON.stringify(S.quit.afterTurn)}`)
  assert.ok(S.quit.afterTurn.toProcessExit < 5000, JSON.stringify(S.quit.afterTurn))
  assert.deepEqual(S.quit.afterTurn.leftAfter3s, [])
})

// ---------------------------------------------------------------- 6. second start

test('6 · a second start, no remote debugging: the home page with the project (no D01); quitting idle under 5 s', async () => {
  const B = await launchInstalled({ exe: W.exe, env: appEnv(), hook: hook(2), devtools: false, repo: REPO, cwd: W.install })
  let state = null
  try {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      state = await B.evaluate(`(async () => { const { BrowserWindow } = require('electron'); const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; return await w.webContents.executeJavaScript("(() => { const m = document.querySelector('main'); return m ? { screen: m.dataset.screen, state: m.dataset.state, text: m.innerText.slice(0, 4000) } : null })()") })()`)
      if (state?.state === 'ready') break
      await sleep(500)
    }
    await sleep(2000)
  } finally {
    // quit whatever the page showed: no debugger attached, timed
    await B.detach()
    S.quit.idle = await timedQuit(B, 2)
  }
  assert.equal(state?.screen, 'home', JSON.stringify(state))
  assert.ok(state.text.includes(TITLE), 'the project is on the home page')
  // the engine profile's links point at the installed engine's real folders (the writer links them at every dsh start)
  const linksDir = join(W.dshHome, 'profiles', 'ann', 'node_modules', '@streams')
  const links = readdirSync(linksDir).sort()
  assert.deepEqual(links, ['ann-gate-host', 'ann-runtime'])
  for (const l of links) assert.ok(same(realpathSync(join(linksDir, l)), join(W.install, 'resources', 'engine', 'node_modules', '@streams', l)), `${l} → ${realpathSync(join(linksDir, l))}`)
  // the balance read at start (a key is stored) went to the stand-in too; still nothing through the proxy
  S.balanceReads += await checkBalanceReads(2)
  assert.deepEqual(S.mock.egress, [], 'nothing left the machine through the proxy')
  // after both runs (a notification in the first): the Start-menu shortcut and the toast activator key as the installer
  // left them (Electron rewrites a shortcut it finds different — without the icon); with YZ_W7_FROM_STAGE, where nothing
  // was installed, both exactly as before the run: absent stays absent (Electron would have made both: docs/installer.md
  // §九 12), and a real install's stay as they were (an Electron that was not held back would rewrite its shortcut to the stage)
  if (FROM_STAGE) {
    assert.deepEqual(realInstallPicture(), S.realInstall, 'the real Start-menu shortcut, desktop shortcut, uninstall entry and notification key: as before the run')
    if (!S.realInstall.startMenu) assert.equal(existsSync(S.startMenu), false, `${S.startMenu}: made during the test`)
    if (!S.realInstall.toastKey) assert.equal(toastKey(), null, `${TOAST_KEY}: registered during the test`)
  } else {
    assert.deepEqual({ ...shortcut(S.startMenu), asElectronReadsIt: asElectronReadsIt(S.startMenu) }, S.shortcuts.startMenu, 'the Start-menu shortcut as the installer made it')
    assert.deepEqual(toastKey(), S.toastKey, 'the toast activator key as the installer wrote it')
  }
  assert.ok(S.quit.idle.toProcessExit !== null && S.quit.idle.toProcessExit < 5000, JSON.stringify(S.quit.idle))
  assert.deepEqual(S.quit.idle.leftAfter3s, [])
})

// ---------------------------------------------------------------- 7. uninstall

test('7 · W7-3 · silent uninstall: program folder, shortcuts, entry and toast activator key gone; the project folder stays; ~/.dsh, %APPDATA%\\Streams and %LOCALAPPDATA%\\Streams as before', { skip: FROM_STAGE && 'YZ_W7_FROM_STAGE: not the installer' }, async () => {
  assert.deepEqual(processesUnder(W.install), [])
  const t0 = Date.now()
  const r = spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/LOG=${join(ROOT, 'uninstall.log')}`], { windowsHide: true, timeout: 120_000 })
  assert.equal(r.status, 0)
  // the uninstaller hands over to a copy of itself in TEMP and returns: wait for the entry and the folder to go
  for (let i = 0; i < 240 && (uninstallEntry() || existsSync(W.install)); i += 1) await sleep(500)
  S.uninstallSeconds = Math.round((Date.now() - t0) / 100) / 10
  assert.equal(uninstallEntry(), null, 'the uninstall entry is gone')
  assert.equal(existsSync(W.install), false, `the program folder is gone: ${existsSync(W.install) ? readdirSync(W.install).join(', ') : ''}`)
  assert.equal(existsSync(S.startMenu), false, 'Start-menu shortcut gone')
  assert.equal(existsSync(S.desktop), false, 'desktop shortcut gone')
  assert.equal(toastKey(), null, `the toast activator key is gone (${TOAST_KEY})`)
  assert.ok(existsSync(join(S.project.path, 'task_plan.md')), 'the project folder and its files stay')
  assert.ok(existsSync(join(W.appData, 'projects.json')), 'the app data the test used stays (the uninstaller deletes only when asked)')
  // Inno Setup's uninstaller runs from a copy in TEMP (is-…-uninstall.tmp) and removes it when done; once in a while the
  // folder outlives it (seen once in three runs: _unins.tmp and _unins-done.tmp left). The test's own copy is removed here
  const uninstallTemps = () => readdirSync(tmpdir()).filter(n => /^is-.*-uninstall\.tmp$/i.test(n) && statSync(join(tmpdir(), n)).mtimeMs >= t0 - 1000)
  for (let i = 0; i < 60 && uninstallTemps().length; i += 1) await sleep(500)
  S.uninstallerTempLeft = uninstallTemps()
  for (const n of S.uninstallerTempLeft) removeTree(join(tmpdir(), n), { waitMs: 10_000 })
  const now = { dsh: picture(real.dsh), appData: picture(real.appData), localAppData: picture(real.localAppData) }
  assert.deepEqual(now.dsh, S.pictures.before.dsh, '~/.dsh unchanged')
  assert.deepEqual(now.appData, S.pictures.before.appData, '%APPDATA%\\Streams unchanged')
  assert.deepEqual(now.localAppData, S.pictures.before.localAppData, '%LOCALAPPDATA%\\Streams unchanged')
  writeFileSync(join(REPO, 'installer', 'dist', 'packaged-test-result.json'), `${JSON.stringify({
    at: new Date().toISOString(), installer: RECORD.installer, installSeconds: S.installSeconds, installedFiles: S.installedFiles, acl: S.acl, exe: S.exe, setup: S.setup,
    scan: S.scan, d02Seconds: S.d02Seconds, d02: S.d02, shell: S.shell, signature: S.signature, notifications: S.notifications, notificationsMade: S.notificationsMade, aumid: S.aumid,
    toastActivator: { clsid: S.toastClsid, shortcuts: Object.fromEntries(Object.entries(S.shortcuts).map(([k, v]) => [k, { clsid: v.clsid, aumidType: v.asElectronReadsIt.aumidType, clsidType: v.asElectronReadsIt.clsidType }])), key: S.toastKey, goneAfterUninstall: true },
    balanceReads: S.balanceReads, quit: S.quit, uninstallSeconds: S.uninstallSeconds, uninstallerTempLeft: S.uninstallerTempLeft, entry: S.entry, dshUnchanged: true, modelRequests: S.mock.messages.length,
  }, null, 2)}\n`)
})
