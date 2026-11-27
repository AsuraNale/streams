// Acceptance E9 (1.1.3 P2): from 1.1.2 to 1.1.3, the way a user of 1.1.2 gets it (the maintainer's own machine runs the released 1.1.2) —
// the 1.1.2 that was released (installer/dist/Streams-1.1.2-setup.exe, sha256 32c8da3e…, the file on the v1.1.2 release)
// installed, a library made and used by it, then this build's setup program run over it. As E7 and E8: notes byte for byte,
// 待看's two items, the schedule, the key. And 1.1.3's own (维护者 11-26, 赞妮's plan 10.1 / 10.2): the conversation that made the
// library (ended, built; found by the pending id in the library's _actions.jsonl) is still that library's; and a new library's
// conversation 1.1.2 left open with no card — 维护者's: the agent only replied, so 1.1.2 had no 「不建了」 and kept every library's
// conversation behind 「另一段对话正在进行」 — is a row of 未建成 (new:build, 主 Agent 已回复, its first words as its title),
// read without being written again, and 放弃建库 takes it out of the list and keeps it as dropped. The one-time note is due.
// STREAMS_E9_NEW_SETUP (a mutant's run, docs/checks/2026-11-26-1.1.3/p2): the newer setup program to use instead of the build's.
// Run through File Explorer (a .cmd), not from a tool's shell: an install from there writes HKCU into a private view.

import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
const NEW_SETUP = process.env.STREAMS_E9_NEW_SETUP || join(REPO, NEW_RECORD.installer.file)
const OLD_SETUP = join(DIST, 'Streams-1.1.2-setup.exe')
const OLD_SHA = '32c8da3e5d421094b1c8cd0fcbbb3fa2a7ed91cc5b52f5130f7bbfb39226ab6a'
const NAME = '升级测试库 1.1.2'
const PENDING = 'a-e9upgrade-112112'
const BUILT = 'ended-2026-11-25T19-00-47-804Z-built'
const KEY = 'sk-ant-e9-upgrade-test-0000-9012'
const SCHEDULE = { enabled: true, time: '08:30' }
const STUCK = '一人独立站那个库，我觉得东西不够全，可以多帮我找一点吗？'

const ROOT = tempDir('st-e9-')
const W = { install: join(ROOT, 'install'), profile: join(ROOT, 'profile'), tmp: join(ROOT, 'tmp'), traps: join(ROOT, 'traps'), library: join(ROOT, NAME) }
W.roaming = join(W.profile, 'AppData', 'Roaming')
W.local = join(W.profile, 'AppData', 'Local')
W.appData = join(W.roaming, RELEASE.install_folder)
W.build = join(W.appData, 'build')
W.exe = join(W.install, RELEASE.exe_name)
for (const d of [W.profile, W.roaming, W.local, W.tmp, W.traps]) mkdirSync(d, { recursive: true })
const traceArgs = { guid: RELEASE.app_guid, appName: RELEASE.app_name, clsid: TOAST_ACTIVATOR_CLSID }
const userEnv = () => ({ ...process.env, USERPROFILE: W.profile, HOME: W.profile, APPDATA: W.roaming, LOCALAPPDATA: W.local, TEMP: W.tmp, TMP: W.tmp })
const S = {}
const hook = n => ({ appData: W.roaming, localAppData: W.local, recordFile: join(ROOT, `record-${n}.jsonl`), pickFolder: W.library, quitFile: join(ROOT, `quit-${n}`) })
const bridge = (page, name, ...args) => page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const ready = (page, screen) => page.waitForFunction(id => Boolean(document.querySelector(`main[data-screen="${id}"][data-state="ready"]`)), screen, { polling: 200, timeout: 120_000 })
const buildFiles = () => (existsSync(W.build) ? readdirSync(W.build).sort() : [])

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
/** A conversation file as 1.1.2 keeps one (desktop/src/main/services/build.mjs of v1.1.2: { v, core, stopped, trouble, retry }). */
const saved1112 = core => ({ v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', sessionId: 's', status: 'talking', asked: [], reads: [], searches: [], calls: core.turns.filter(t => t.role === 'agent').length, card: null, pendingId: null, libraryDir: null, edit: null, convert: null, ...core }, stopped: null, trouble: null, retry: null })

before(async () => {
  assert.equal(process.platform, 'win32')
  assert.ok(existsSync(OLD_SETUP), 'installer/dist/Streams-1.1.2-setup.exe is needed (the released 1.1.2)')
  assert.equal(sha256File(OLD_SETUP), OLD_SHA, 'the 1.1.2 setup program is the released one')
  assert.ok(existsSync(NEW_SETUP), `no newer installer at ${NEW_SETUP}`)
  if (!process.env.STREAMS_E9_NEW_SETUP) assert.equal(sha256File(NEW_SETUP), NEW_RECORD.installer.sha256, 'the newer installer is the one the build recorded')
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

test('1 · 1.1.2 (the released setup program) installed silently for the test\'s user', () => {
  const r = spawnSync(OLD_SETUP, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`], { windowsHide: true, timeout: 600_000, env: userEnv() })
  assert.equal(r.status, 0)
  const entry = uninstallEntry(RELEASE.app_guid)
  assert.ok(entry && same(entry.InstallLocation, W.install))
  assert.equal(entry.DisplayVersion, '1.1.2')
  assert.equal(JSON.parse(readFileSync(join(W.install, 'resources', 'app', 'package.json'), 'utf8')).version, '1.1.2')
})

test('2 · a library made and used by 1.1.2: three notes, two items in 待看, every day 08:30, an API key saved; its build conversation and 维护者\'s stuck one left by it', async () => {
  // 1.1.2's own core, as installed
  const old = await import(pathToFileURL(join(W.install, 'resources', 'core', 'src', 'index.mjs')).href)
  old.createLibrary(W.library, { name: NAME })
  const at = () => new Date('2026-11-24T15:00:00.000Z')
  const checked = what => ({ status: 'checked', summary: { what, points: [] }, verification: { passed: true, rounds: 1, failed: [] }, original: { saved: false, method: 'direct' }, history: [] })
  for (let i = 1; i <= 5; i += 1) old.putInInbox(W.library, { item: { url: `https://example.org/e9/${i}`, title: `升级测试条目 ${i}`, source: 'e9', date: '2026-11-23' }, checked: checked(`第 ${i} 条`), now: at })
  for (let i = 1; i <= 3; i += 1) old.keep(W.library, `https://example.org/e9/${i}`, { now: at })
  const cfgFile = join(W.library, 'streams.json')
  writeFileSync(cfgFile, `${JSON.stringify({ ...JSON.parse(readFileSync(cfgFile, 'utf8')), schedule: SCHEDULE }, null, 2)}\n`)
  // registered and current, as 1.1.2 keeps it (its own registry functions); settings: the API connection, Anthropic
  let reg = old.emptyRegistry()
  const r = old.withLibrary(reg, W.library, { name: NAME })
  reg = old.withActive(r.registry, r.entry.id)
  mkdirSync(W.appData, { recursive: true })
  old.writeRegistry(join(W.appData, 'libraries.json'), reg)
  writeFileSync(join(W.appData, 'settings.json'), `${JSON.stringify({ schema: 'streams.settings/1', schedule: { enabled: false, time: '08:30' }, connections: { active: 'api', 'claude-code': { model: null, verifyModel: null }, codex: { model: null, verifyModel: null }, api: { vendor: 'anthropic', baseUrl: null, model: null, verifyModel: null } } }, null, 2)}\n`)
  const env = appEnv({ profile: W.profile, tmp: W.tmp, trapUrl: S.trap.url, traps: W.traps })
  S.appEnv = env
  const A = await launchInstalled({ exe: W.exe, env, hook: hook(1), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  assert.equal(await A.evaluate("require('electron').app.getVersion()"), '1.1.2')
  await ready(A.page, 'inbox')
  const st = (await bridge(A.page, 'getAppState')).data
  assert.ok(same(st.library.path, W.library), JSON.stringify(st.library))
  assert.deepEqual((await bridge(A.page, 'getSchedule')).data.time, '08:30')
  assert.equal((await bridge(A.page, 'getInbox')).data.items.length, 2)
  const k = await bridge(A.page, 'setApiKey', 'anthropic', KEY)
  assert.ok(k.ok, JSON.stringify(k))
  const conns = (await bridge(A.page, 'getConnections')).data
  assert.equal(conns.kinds.api.hasKey, true, 'control: 1.1.2 holds the key')
  S.keyHint = conns.kinds.api.keyHint
  await quitAndWait(A, 1)
  S.before = picture()
  assert.equal(Object.keys(S.before.notes).length, 3)
  assert.equal(S.before.inbox.length, 2)
  assert.deepEqual(S.before.schedule, SCHEDULE)
  // the conversation that made it, ended (built), and the library's record of that create_library
  mkdirSync(W.build, { recursive: true })
  const made = [{ role: 'user', text: '我想学习最新的跨境电商运营方法，我是零基础。', at: '2026-11-25T18:32:22.171Z' }, { role: 'agent', kind: 'question', say: '', question: { n: 1, text: '你学这些打算用来做什么？', kind: 'input', options: [], other: false }, at: '2026-11-25T18:32:43.865Z' }]
  writeFileSync(join(W.build, `${BUILT}.json`), JSON.stringify(saved1112({ opener: made[0].text, turns: made, asked: [{ n: 1 }], pendingId: PENDING }), null, 1))
  writeFileSync(join(W.library, '_actions.jsonl'), `${JSON.stringify({ ts: '2026-11-25T19:00:47.793Z', actor: 'main_agent', action: 'create_library', object: { type: 'library', id: W.library }, before: null, after: { name: NAME }, confirmedBy: 'user', pendingId: PENDING })}\n`)
  // the maintainer's: a new library's conversation still open (build.json), the agent only replied, no card
  writeFileSync(join(W.build, 'build.json'), JSON.stringify(saved1112({ opener: STUCK, turns: [
    { role: 'user', text: STUCK, at: '2026-11-25T19:09:00.000Z' },
    { role: 'agent', kind: 'say', say: '这是新建库的对话，我看不到已有的库。', at: '2026-11-25T19:10:00.000Z' },
    { role: 'user', text: '放弃对话', at: '2026-11-26T02:51:00.000Z' },
    { role: 'agent', kind: 'say', say: '好的，这次就到这里，我什么都没改', at: '2026-11-26T02:51:30.000Z' },
  ] }), null, 1))
  S.stuckFile = readFileSync(join(W.build, 'build.json'), 'utf8')
  S.builtFile = readFileSync(join(W.build, `${BUILT}.json`), 'utf8')
})

test('3 · this build\'s setup program over it, silently: one uninstall entry, the new version', () => {
  const r = spawnSync(NEW_SETUP, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${W.install}`], { windowsHide: true, timeout: 600_000, env: userEnv() })
  assert.equal(r.status, 0)
  assert.deepEqual(entriesNamed(/^流息/).map(e => e.DisplayVersion), [RELEASE.version])
  assert.equal(JSON.parse(readFileSync(join(W.install, 'resources', 'app', 'package.json'), 'utf8')).version, RELEASE.version)
})

test(`4 · ${RELEASE.version} started: the library opens; notes byte for byte; 待看's two items; the schedule; the key — as before`, async () => {
  const A = await launchInstalled({ exe: W.exe, env: S.appEnv, hook: hook(2), chromiumProxy: S.trap.url, repo: REPO, cwd: W.install })
  S.app = A
  assert.equal(await A.evaluate("require('electron').app.getVersion()"), RELEASE.version)
  await ready(A.page, 'inbox')
  const st = (await bridge(A.page, 'getAppState')).data
  assert.ok(same(st.library.path, W.library), 'the library opens, the current one')
  const items = (await bridge(A.page, 'getInbox')).data.items
  assert.deepEqual(items.map(i => i.url).sort(), ['https://example.org/e9/4', 'https://example.org/e9/5'], '待看 has the same two items')
  const sched = (await bridge(A.page, 'getSchedule')).data
  assert.deepEqual([sched.enabled, sched.time], [true, '08:30'], 'the schedule the app answers')
  const conns = (await bridge(A.page, 'getConnections')).data
  assert.equal(conns.kinds.api.hasKey, true, 'the key 1.1.2 saved is there')
  assert.equal(conns.kinds.api.keyHint, S.keyHint, 'the same key (its last four characters)')
})

test('5 · 1.1.3: 维护者\'s stuck conversation is a row of 未建成 (主 Agent 已回复), read as it is; the library\'s own conversation is its; the one-time note is due', async () => {
  const page = S.app.page
  const list = (await bridge(page, 'listConversations')).data
  assert.deepEqual(list.unbuilt.map(r => [r.id, r.kind, r.state, r.title]), [['new:build', 'unbuilt', 'replied', STUCK]], 'the conversation 1.1.2 left open, under 未建成')
  const row = list.libraries.find(r => r.library?.name === NAME)
  assert.ok(row, JSON.stringify(list.libraries))
  assert.equal(row.id, `lib:${row.library.id}`)
  assert.deepEqual([row.last?.mode, row.last?.why], ['create', 'built'], 'the conversation that made the library, found by its library')
  assert.equal(list.organised, true, 'the one-time note after the upgrade is due')
  const conv = (await bridge(page, 'getConversation', BUILT)).data
  assert.equal(conv.turns[0].text, '我想学习最新的跨境电商运营方法，我是零基础。')
  const v = (await bridge(page, 'getBuild', 'new:build')).data
  assert.deepEqual([v.kind, v.open, v.state, v.turns.at(-1).say], ['unbuilt', true, 'replied', '好的，这次就到这里，我什么都没改'])
  assert.equal(readFileSync(join(W.build, 'build.json'), 'utf8'), S.stuckFile, 'build.json as 1.1.2 left it: read, not written again')
  assert.equal(readFileSync(join(W.build, `${BUILT}.json`), 'utf8'), S.builtFile)
})

test('6 · 放弃建库 on it: out of 未建成, kept as dropped, build.json gone; the library\'s conversation untouched', async () => {
  const page = S.app.page
  const r = await bridge(page, 'dropBuild', 'new:build')
  assert.ok(r.ok, JSON.stringify(r))
  const list = (await bridge(page, 'listConversations')).data
  assert.deepEqual(list.unbuilt, [], '未建成 is empty')
  const files = buildFiles()
  assert.ok(files.some(n => /^ended-.*-dropped\.json$/.test(n)), files.join(', '))
  assert.equal(files.includes('build.json'), false)
  assert.ok(files.includes(`${BUILT}.json`))
  const row = list.libraries.find(x => x.library?.name === NAME)
  assert.deepEqual([row.last?.why, row.open ?? false], ['built', false])
  await quitAndWait(S.app, 2)
  const now = picture()
  assert.deepEqual(now.notes, S.before.notes, 'the notes folder, file for file and byte for byte')
  assert.deepEqual(now.inbox, S.before.inbox)
  assert.deepEqual(now.schedule, S.before.schedule, 'streams.json\'s schedule as 1.1.2 left it')
})

test('7 · silent uninstall: the entry and the program folder gone', async () => {
  const r = spawnSync(join(W.install, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true, env: userEnv() })
  assert.equal(r.status, 0)
  for (let i = 0; i < 120 && uninstallEntry(RELEASE.app_guid); i += 1) await sleep(500)
  assert.equal(uninstallEntry(RELEASE.app_guid), null)
  for (let i = 0; i < 60 && existsSync(W.exe); i += 1) await sleep(500)
  assert.equal(existsSync(W.exe), false)
})
