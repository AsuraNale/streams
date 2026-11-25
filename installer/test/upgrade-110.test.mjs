// Acceptance E7 (1.1.1 P13): from 1.1.0 to 1.1.1, the way a user of 1.1.0 gets it — the 1.1.0 that was released (installer/dist/
// Streams-1.1.0-setup.exe, sha256 705108d6…, the file on the v1.1.0 release) installed, a library made and used by it, then this
// build's setup program run over it. Afterwards: the library opens, its notes folder is byte for byte what it was, its two
// items are still in 待看, its schedule (every day 08:30) is what it was, and the API key 1.1.0 saved is still there.
//   0. guards (as packaged.test.mjs: HKCU is the real one; no Streams installed here); the two setup programs
//   1. 1.1.0 installed silently for the test's user
//   2. a library made with 1.1.0's own core (the installed resources\core): three items kept (three notes), two left in 待看, the
//      schedule every day 08:30, registered as the current library; 1.1.0 started — it opens that library, its schedule reads
//      08:30, 待看 has the two items; an API key saved through 1.1.0's own bridge (setApiKey: safeStorage); then quit.
//      Pictured: every file of the notes folder (sha256), the 待看 items, streams.json's schedule, the key's hint
//   3. this build's setup program run silently over it: one uninstall entry, the new version
//   4. 1.1.1 started: its version; the library is the current one; the notes folder the same, file for file; 待看 the same two;
//      the schedule the same (streams.json and what the app answers); the key there, the same hint
//   5. silent uninstall: nothing of the install left
// STREAMS_E7_NEW_SETUP (a mutant's run, docs/checks/2026-11-24-1.1.1/p13): the newer setup program to use instead of the build's.
// Run through File Explorer (a .cmd), not from a tool's shell: an install from there writes HKCU into a private view.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchInstalled, requestQuit } from './harness.mjs'
import { endProcesses, entriesNamed, filesOf, liveInstallHere, processesUnder, realInstallTraces, same, sha256File, shellFolder, sleep, uninstallEntry } from './machine.mjs'
import { appEnv, startTrap } from './world.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { TOAST_ACTIVATOR_CLSID } = await imp('desktop/src/main/app-id.mjs')
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { tempDir } = await imp('desktop/scripts/lib/temp.mjs')

const DIST = join(REPO, 'installer', 'dist')
const NEW_RECORD = JSON.parse(readFileSync(join(DIST, 'build-record.json'), 'utf8'))
const RELEASE = NEW_RECORD.release
const NEW_SETUP = process.env.STREAMS_E7_NEW_SETUP || join(REPO, NEW_RECORD.installer.file)
const OLD_SETUP = join(DIST, 'Streams-1.1.0-setup.exe')
const OLD_SHA = '705108d6241fb8d5910f5bd863d5dc05fb5b90485a491d969c8b8e40ee2b4494'
const KEY = 'sk-ant-e7-upgrade-test-0000-1234'
const SCHEDULE = { enabled: true, time: '08:30' }

const ROOT = tempDir('st-e7-')
const W = { install: join(ROOT, 'install'), profile: join(ROOT, 'profile'), tmp: join(ROOT, 'tmp'), traps: join(ROOT, 'traps'), library: join(ROOT, '升级测试库') }
W.roaming = join(W.profile, 'AppData', 'Roaming')
W.local = join(W.profile, 'AppData', 'Local')
W.appData = join(W.roaming, RELEASE.install_folder)
W.exe = join(W.install, RELEASE.exe_name)
for (const d of [W.profile, W.roaming, W.local, W.tmp, W.traps]) mkdirSync(d, { recursive: true })
const traceArgs = { guid: RELEASE.app_guid, appName: RELEASE.app_name, clsid: TOAST_ACTIVATOR_CLSID }
const userEnv = () => ({ ...process.env, USERPROFILE: W.profile, HOME: W.profile, APPDATA: W.roaming, LOCALAPPDATA: W.local, TEMP: W.tmp, TMP: W.tmp })
const S = {}
const hook = n => ({ appData: W.roaming, localAppData: W.local, recordFile: join(ROOT, `record-${n}.jsonl`), pickFolder: W.library, quitFile: join(ROOT, `quit-${n}`) })
const bridge = (page, name, ...args) => page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const ready = (page, screen) => page.waitForFunction(id => Boolean(document.querySelector(`main[data-screen="${id}"][data-state="ready"]`)), screen, { polling: 200, timeout: 120_000 })

async function quitAndWait(app, n) {
  await app.detach()
  requestQuit(hook(n).quitFile)
  const exit = await Promise.race([app.exited, sleep(60_000).then(() => null)])
  await sleep(2000)
  const left = processesUnder(W.install)
  if (left.length) endProcesses(left)
  return exit
}
function picture() {
  const hashes = dir => Object.fromEntries([...filesOf(dir).files].map(([rel, abs]) => [rel, sha256File(abs)]).sort((a, b) => (a[0] < b[0] ? -1 : 1)))
  const notes = hashes(join(W.library, 'notes'))
  const inbox = existsSync(join(W.library, '_pipeline', 'inbox')) ? Object.keys(hashes(join(W.library, '_pipeline', 'inbox'))) : []
  return { notes, inbox: inbox.sort(), schedule: JSON.parse(readFileSync(join(W.library, 'streams.json'), 'utf8')).schedule ?? null }
}

before(async () => {
  assert.equal(process.platform, 'win32')
  assert.ok(existsSync(OLD_SETUP), 'installer/dist/Streams-1.1.0-setup.exe is needed (the released 1.1.0)')
  assert.equal(sha256File(OLD_SETUP), OLD_SHA, 'the 1.1.0 setup program is the released one')
  assert.ok(existsSync(NEW_SETUP), `no newer installer at ${NEW_SETUP}`)
  if (!process.env.STREAMS_E7_NEW_SETUP) assert.equal(sha256File(NEW_SETUP), NEW_RECORD.installer.sha256, 'the newer installer is the one the build recorded')
  const found = liveInstallHere(realInstallTraces(traceArgs))
  assert.deepEqual(found, [], `Streams looks installed on this machine (${found.join(', ')}): this test installs and uninstalls, so it does not run here`)
  const env = userEnv()
  for (const n of ['Programs', 'DesktopDirectory', 'ApplicationData', 'LocalApplicationData']) {
    const p = shellFolder(n, env)
    assert.ok(resolve(p).toLowerCase().startsWith(resolve(W.profile).toLowerCase()), `${n} resolves to ${p}, outside the test's user folder`)
  }
  S.trap = await startTrap()
})

after(async () => {
  for (let i = 0; i < 3; i += 1) {
    const left = existsSync(W.install) ? processesUnder(W.install) : []
    if (!left.length) break
    endProcesses(left)
    await sleep(1000)
  }
  const entry = uninstallEntry(RELEASE.app_guid)
  if (entry && same(entry.InstallLocation, W.install) && existsSync(join(W.install, 'unins000.exe'))) {
    spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, env: userEnv() })
    for (let i = 0; i < 120 && uninstallEntry(RELEASE.app_guid); i += 1) await sleep(500)
  }
  await S.trap?.close()
  await sleep(1000)
  removeTree(ROOT, { waitMs: 60_000 })
})

test('1 · 1.1.0 (the released setup program) installed silently for the test\'s user', () => {
  const r = spawnSync(OLD_SETUP, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`], { windowsHide: true, timeout: 600_000, env: userEnv() })
  assert.equal(r.status, 0)
  const entry = uninstallEntry(RELEASE.app_guid)
  assert.ok(entry && same(entry.InstallLocation, W.install))
  assert.equal(entry.DisplayVersion, '1.1.0')
  assert.equal(JSON.parse(readFileSync(join(W.install, 'resources', 'app', 'package.json'), 'utf8')).version, '1.1.0')
})

test('2 · a library made and used by 1.1.0: three notes, two items in 待看, every day 08:30, an API key saved', async () => {
  // 1.1.0's own core, as installed
  const old = await import(pathToFileURL(join(W.install, 'resources', 'core', 'src', 'index.mjs')).href)
  old.createLibrary(W.library, { name: '升级测试库' })
  const at = () => new Date('2026-11-20T15:00:00.000Z')
  const checked = what => ({ status: 'checked', summary: { what, points: [] }, verification: { passed: true, rounds: 1, failed: [] }, original: { saved: false, method: 'direct' }, history: [] })
  for (let i = 1; i <= 5; i += 1) old.putInInbox(W.library, { item: { url: `https://example.org/e7/${i}`, title: `升级测试条目 ${i}`, source: 'e7', date: '2026-11-19' }, checked: checked(`第 ${i} 条`), now: at })
  for (let i = 1; i <= 3; i += 1) old.keep(W.library, `https://example.org/e7/${i}`, { now: at })
  const cfgFile = join(W.library, 'streams.json')
  writeFileSync(cfgFile, `${JSON.stringify({ ...JSON.parse(readFileSync(cfgFile, 'utf8')), schedule: SCHEDULE }, null, 2)}\n`)
  // registered and current, as 1.1.0 keeps it (its own registry functions); settings: the API connection, Anthropic
  let reg = old.emptyRegistry()
  const r = old.withLibrary(reg, W.library, { name: '升级测试库' })
  reg = old.withActive(r.registry, r.entry.id)
  mkdirSync(W.appData, { recursive: true })
  old.writeRegistry(join(W.appData, 'libraries.json'), reg)
  writeFileSync(join(W.appData, 'settings.json'), `${JSON.stringify({ schema: 'streams.settings/1', schedule: { enabled: false, time: '08:30' }, connections: { active: 'api', 'claude-code': { model: null, verifyModel: null }, codex: { model: null, verifyModel: null }, api: { vendor: 'anthropic', baseUrl: null, model: null, verifyModel: null } } }, null, 2)}\n`)
  const env = appEnv({ profile: W.profile, tmp: W.tmp, trapUrl: S.trap.url, traps: W.traps })
  S.appEnv = env
  const A = await launchInstalled({ exe: W.exe, env, hook: hook(1), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  assert.equal(await A.evaluate("require('electron').app.getVersion()"), '1.1.0')
  await ready(A.page, 'inbox')
  const st = (await bridge(A.page, 'getAppState')).data
  assert.ok(same(st.library.path, W.library), JSON.stringify(st.library))
  assert.deepEqual((await bridge(A.page, 'getSchedule')).data.time, '08:30')
  assert.equal((await bridge(A.page, 'getInbox')).data.items.length, 2)
  const k = await bridge(A.page, 'setApiKey', 'anthropic', KEY)
  assert.ok(k.ok, JSON.stringify(k))
  const conns = (await bridge(A.page, 'getConnections')).data
  assert.equal(conns.kinds.api.hasKey, true, 'control: 1.1.0 holds the key')
  S.keyHint = conns.kinds.api.keyHint
  await quitAndWait(A, 1)
  S.before = picture()
  assert.equal(Object.keys(S.before.notes).length, 3)
  assert.equal(S.before.inbox.length, 2)
  assert.deepEqual(S.before.schedule, SCHEDULE)
  S.settingsBefore = readFileSync(join(W.appData, 'settings.json'), 'utf8')
})

test('3 · this build\'s setup program over it, silently: one uninstall entry, the new version', () => {
  const r = spawnSync(NEW_SETUP, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`], { windowsHide: true, timeout: 600_000, env: userEnv() })
  assert.equal(r.status, 0)
  assert.deepEqual(entriesNamed(/^流息/).map(e => e.DisplayVersion), [RELEASE.version])
  assert.equal(JSON.parse(readFileSync(join(W.install, 'resources', 'app', 'package.json'), 'utf8')).version, RELEASE.version)
})

test(`4 · ${RELEASE.version} started: the library opens; notes byte for byte; 待看's two items; the schedule; the key — as before`, async () => {
  const A = await launchInstalled({ exe: W.exe, env: S.appEnv, hook: hook(2), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  assert.equal(await A.evaluate("require('electron').app.getVersion()"), RELEASE.version)
  await ready(A.page, 'inbox')
  const st = (await bridge(A.page, 'getAppState')).data
  assert.ok(same(st.library.path, W.library), 'the library opens, the current one')
  const items = (await bridge(A.page, 'getInbox')).data.items
  assert.deepEqual(items.map(i => i.url).sort(), ['https://example.org/e7/4', 'https://example.org/e7/5'], '待看 has the same two items')
  const sched = (await bridge(A.page, 'getSchedule')).data
  assert.deepEqual([sched.enabled, sched.time], [true, '08:30'], 'the schedule the app answers')
  const conns = (await bridge(A.page, 'getConnections')).data
  assert.equal(conns.kinds.api.hasKey, true, 'the key 1.1.0 saved is there')
  assert.equal(conns.kinds.api.keyHint, S.keyHint, 'the same key (its last four characters)')
  await quitAndWait(A, 2)
  const now = picture()
  assert.deepEqual(now.notes, S.before.notes, 'the notes folder, file for file and byte for byte')
  assert.deepEqual(now.inbox, S.before.inbox)
  assert.deepEqual(now.schedule, S.before.schedule, 'streams.json\'s schedule as 1.1.0 left it')
})

test('5 · silent uninstall: the entry and the program folder gone', async () => {
  const r = spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, env: userEnv() })
  assert.equal(r.status, 0)
  for (let i = 0; i < 120 && uninstallEntry(RELEASE.app_guid); i += 1) await sleep(500)
  assert.equal(uninstallEntry(RELEASE.app_guid), null)
  for (let i = 0; i < 60 && existsSync(W.exe); i += 1) await sleep(500)
  assert.equal(existsSync(W.exe), false)
})
