// The libraries the app knows (v2 package A; src/main/services/library.mjs on the core registry; docs/desktop.md §4.4) in
// plain Node: the first start builds libraries.json from v1.0's settings.json (the open library first and current, the
// recent ones after it, a folder not there left out) and never writes those settings again; an existing libraries.json is
// not built again; listLibraries / setActiveLibrary / addLibrary / removeLibrary / setLibraryMeta / getLibrariesOverview /
// getUsageTotal, each with the input that must be refused; removing a registration leaves every file of the folder as it
// was; the development library stands in without being written; the bridge's checks of the new methods; an unknown id is
// bad_arguments through the envelope. Each case first shows the refused input really is refused.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEV_LIBRARY_ID, createLibraryService } from '../src/main/services/library.mjs'
import { createScheduleService } from '../src/main/services/schedule.mjs'
import { BRIDGE_METHODS, checkArgs, runHandler } from '../src/main/bridge-methods.mjs'
import { createLibrary, createUsageCounter, readChanges, readConfig, readRegistry, saveBrief } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { seedLibrary } from './support/seed.mjs'

/** sha256 of every file under dir, by its path relative to dir with "/". */
function hashTree(dir, base = dir, out = {}) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) hashTree(p, base, out)
    else out[p.slice(base.length + 1).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex')
  }
  return out
}

const worlds = []
const world = () => { const w = testWorld('st-registry-'); worlds.push(w); return w }
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })

const registryFile = w => join(w.root, 'libraries.json')
const service = (w, extra = {}) => createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, ...extra })
/** A library folder made by the core, under the world. */
const made = (w, name) => { const dir = join(w.root, name); createLibrary(dir, { name }); return dir }
/** Register folders through the page's own path: the dialog's answer, then useChosenFolder. */
async function openAll(s, w, dirs) {
  for (const d of dirs) { w.dialogAnswers.push(d); await s.handlers.chooseLibraryFolder(); await s.handlers.useChosenFolder('') }
}

test('the first start: libraries.json from v1.0\'s settings.json — the open library first and current, the recent ones after it, a folder not there left out; settings.json never written', async () => {
  const w = world()
  const open = made(w, 'open')
  const recent = made(w, 'recent')
  const gone = join(w.root, 'gone')
  writeFileSync(w.settingsFile, `${JSON.stringify({ schema: 'streams.settings/1', libraryPath: open, recentLibraries: [open, gone, recent], schedule: { enabled: false, time: '07:00' } }, null, 2)}\n`)
  const settingsBefore = readFileSync(w.settingsFile, 'utf8')
  assert.equal(existsSync(registryFile(w)), false, 'control: no registry before the start')
  const s = service(w)
  const reg = readRegistry(registryFile(w))
  assert.deepEqual(reg.libraries.map(l => [l.path, l.name]), [[open, 'open'], [recent, 'recent']])
  assert.equal(reg.active, reg.libraries[0].id)
  assert.ok(w.lines.some(l => l.includes(gone) && l.includes('not registered')), w.lines.join('\n'))
  assert.deepEqual(s.current(), { libraryId: reg.libraries[0].id, path: open, name: 'open' })
  // switching, opening, removing: the registry changes, settings.json stays as it was (read only, kept as the source)
  await s.handlers.setActiveLibrary(reg.libraries[1].id)
  assert.equal(s.dir(), recent)
  const third = join(w.root, 'third')
  await openAll(s, w, [third])
  s.handlers.removeLibrary(reg.libraries[0].id)
  assert.equal(readFileSync(w.settingsFile, 'utf8'), settingsBefore, 'settings.json byte for byte')
  // a second start finds the registry: not built again (the removed library stays removed)
  const again = service(w)
  assert.deepEqual(again.entries().map(l => l.path), [recent, third])
  assert.equal(again.dir(), third)
})

test('the first start with no v1.0 library: an empty registry, no library open; a broken libraries.json reads as empty', () => {
  const w = world()
  const s = service(w)
  assert.deepEqual(readRegistry(registryFile(w)), { schema: 'streams.libraries/1', active: null, libraries: [] })
  assert.equal(s.current(), null)
  assert.throws(() => s.require(), err => err.code === 'no_library')
  writeFileSync(registryFile(w), '{ broken')
  assert.deepEqual(service(w).handlers.listLibraries(), [])
})

test('listLibraries: every library in order, the current one marked, `exists` false for a folder gone or a streams.json that cannot be read', async () => {
  const w = world()
  const s = service(w)
  const [a, b, c] = ['a', 'b', 'c'].map(n => join(w.root, n))
  await openAll(s, w, [a, b, c])
  const list = s.handlers.listLibraries()
  assert.deepEqual(list.map(l => [l.path, l.name, l.icon, l.active, l.exists, l.temporary]), [[a, 'a', 'a', false, true, false], [b, 'b', 'b', false, true, false], [c, 'c', 'c', true, true, false]])
  assert.equal(new Set(list.map(l => l.color)).size, 3, 'the colours by turn')
  rmSync(b, { recursive: true, force: true })
  writeFileSync(join(c, 'streams.json'), '{ broken')
  assert.deepEqual(s.handlers.listLibraries().map(l => l.exists), [true, false, false])
})

test('setActiveLibrary: the current library and the events, each with the id; an unknown id → bad_arguments, a folder gone → open_failed, nothing changes', async () => {
  const w = world()
  const s = service(w)
  const [a, b] = ['a', 'b'].map(n => join(w.root, n))
  await openAll(s, w, [a, b])
  const [ia, ib] = s.entries().map(l => l.id)
  const n = w.events.length
  assert.deepEqual(s.handlers.setActiveLibrary(ia), { libraryId: ia, path: a, name: 'a' })
  assert.equal(s.dir(), a)
  assert.equal(readRegistry(registryFile(w)).active, ia, 'written')
  assert.deepEqual(w.events.slice(n), [
    { topic: 'libraries-changed', payload: { libraryId: ia } },
    { topic: 'library-changed', payload: { libraryId: ia, path: a, name: 'a' } },
    { topic: 'settings-changed', payload: null },
  ])
  assert.throws(() => s.handlers.setActiveLibrary('zzzzzzzz'), err => err.code === 'bad_arguments')
  rmSync(b, { recursive: true, force: true })
  assert.throws(() => s.handlers.setActiveLibrary(ib), err => err.code === 'open_failed')
  assert.equal(s.dir(), a, 'still a')
  // control: back to a folder that is there
  mkdirSync(b)
  createLibrary(b, { name: 'b' })
  assert.equal(s.handlers.setActiveLibrary(ib).path, b)
})

test('addLibrary: only the folder the dialog just gave, which must hold a library; registered once; another path → bad_arguments', async () => {
  const w = world()
  const s = service(w)
  const lib = made(w, 'existing')
  const other = made(w, 'other')
  assert.throws(() => s.handlers.addLibrary(lib), err => err.code === 'bad_arguments', 'nothing chosen yet: the page cannot name a path')
  w.dialogAnswers.push(lib)
  await s.handlers.chooseLibraryFolder()
  assert.throws(() => s.handlers.addLibrary(other), err => err.code === 'bad_arguments', 'not the folder just chosen')
  assert.equal(s.handlers.addLibrary(lib).path, lib)
  assert.equal(s.handlers.addLibrary(lib).path, lib)
  assert.deepEqual(s.entries().map(l => l.path), [lib], 'registered once')
  // a chosen folder that holds no library
  const empty = join(w.root, 'empty')
  mkdirSync(empty)
  w.dialogAnswers.push(empty)
  await s.handlers.chooseLibraryFolder()
  assert.throws(() => s.handlers.addLibrary(empty), err => err.code === 'open_failed')
  assert.equal(existsSync(join(empty, 'streams.json')), false, 'nothing made there')
})

test('removeLibrary: only the registration — every file of the folder stays; the current one removed → the next one; none left → no library', async () => {
  const w = world()
  const s = service(w)
  const dirs = ['a', 'b', 'c'].map(n => join(w.root, n))
  await openAll(s, w, dirs)
  for (const d of dirs) writeFileSync(join(d, 'notes', 'mine.md'), 'my own words\n')
  const before = Object.fromEntries(dirs.map(d => [d, hashTree(d)]))
  const [ia, ib, ic] = s.entries().map(l => l.id)
  s.handlers.setActiveLibrary(ib)
  assert.throws(() => s.handlers.removeLibrary('zzzzzzzz'), err => err.code === 'bad_arguments')
  assert.deepEqual(s.handlers.removeLibrary(ib), { removed: ib, active: ic }, 'the current one removed: the next one')
  assert.equal(s.dir(), dirs[2])
  assert.ok(w.eventsOf('library-changed').at(-1).payload.libraryId === ic)
  assert.deepEqual(s.handlers.removeLibrary(ia), { removed: ia, active: ic }, 'another one removed: the current one stays')
  assert.deepEqual(s.handlers.removeLibrary(ic), { removed: ic, active: null })
  assert.equal(s.current(), null)
  assert.throws(() => s.require(), err => err.code === 'no_library')
  assert.equal(w.eventsOf('library-changed').at(-1).payload, null)
  for (const d of dirs) assert.deepEqual(hashTree(d), before[d], `${d}: every file as it was`)
  // control: the comparison sees a changed file
  writeFileSync(join(dirs[0], 'notes', 'mine.md'), 'changed\n')
  assert.notDeepEqual(hashTree(dirs[0]), before[dirs[0]])
})

test('setLibraryMeta: name, icon, colour of one library (the current one: library-changed with the new name); bad values and unknown ids → bad_arguments', async () => {
  const w = world()
  const s = service(w)
  const [a, b] = ['a', 'b'].map(n => join(w.root, n))
  await openAll(s, w, [a, b])
  const [ia, ib] = s.entries().map(l => l.id)
  const n = w.eventsOf('library-changed').length
  assert.deepEqual(s.handlers.setLibraryMeta(ia, { name: '论文', icon: '论', color: 'violet' }), { id: ia, name: '论文', icon: '论', color: 'violet' })
  assert.equal(w.eventsOf('library-changed').length, n, 'not the current one: no library-changed')
  assert.deepEqual(w.eventsOf('libraries-changed').at(-1).payload, { libraryId: ia })
  s.handlers.setLibraryMeta(ib, { name: 'AI 工具' })
  assert.deepEqual(w.eventsOf('library-changed').at(-1).payload, { libraryId: ib, path: b, name: 'AI 工具' })
  assert.equal(s.current().name, 'AI 工具')
  // the name is the library's own too (streams.json `name`, N08), recorded as yours in 变更记录 (1.1 W7b: this test holds it —
  // 来源与要求's 库名称 field, which v1.0's editing had, is gone)
  assert.equal(readConfig(b).config.name, 'AI 工具')
  assert.deepEqual(readChanges(b).entries.filter(e => e.field === 'name').map(e => [e.by, e.after]), [['you', 'AI 工具']])
  const reg = readFileSync(registryFile(w), 'utf8')
  for (const bad of [{ color: '#ff0000' }, { icon: 'abc' }, { name: '' }]) assert.throws(() => s.handlers.setLibraryMeta(ia, bad), err => err.code === 'bad_arguments', JSON.stringify(bad))
  assert.throws(() => s.handlers.setLibraryMeta('zzzzzzzz', { name: 'x' }), err => err.code === 'bad_arguments')
  assert.equal(readFileSync(registryFile(w), 'utf8'), reg, 'nothing written')
})

test('getLibrariesOverview: 待看 from homeNumbers, the last round, one problem — sources, three rounds without output, folder missing — or none', async () => {
  const w = world()
  const s = service(w)
  const seeded = join(w.root, 'seeded')
  mkdirSync(seeded)
  const seed = await seedLibrary(seeded)
  const quiet = made(w, 'quiet')
  const dry = made(w, 'dry')
  mkdirSync(join(dry, '_pipeline'), { recursive: true })
  writeFileSync(join(dry, '_pipeline', 'rounds.jsonl'), [1, 2, 3].map(i => `${JSON.stringify({ id: `r${i}`, startedAt: `2026-11-0${i}T08:30:00.000Z`, counts: { inbox: 0 } })}\n`).join(''))
  const gone = made(w, 'gone')
  for (const d of [seeded, quiet, dry, gone]) { w.dialogAnswers.push(d); await s.handlers.chooseLibraryFolder(); s.handlers.addLibrary(d) }
  rmSync(gone, { recursive: true, force: true })
  const [is, iq, id, ig] = s.entries().map(l => l.id)
  const o = s.handlers.getLibrariesOverview()
  assert.deepEqual(o.map(l => l.id), [is, iq, id, ig])
  // v2 package F: four keys more — the brief, the topics' names, how many sources, the rounds in a row without output (the
  // shelf's card and the library page's head need them); the seven of package A as they were
  assert.deepEqual(Object.keys(o[0]).sort(), ['brief', 'color', 'icon', 'id', 'inbox', 'lastRoundAt', 'name', 'noOutputStreak', 'problem', 'sources', 'topics'])
  // the seed: four cards waiting, its round, its dead source
  assert.deepEqual([o[0].inbox, o[0].problem], [seed.inbox.length, 'sources'])
  assert.ok(o[0].lastRoundAt, 'the seed\'s round')
  assert.deepEqual([o[0].brief, o[0].topics, o[0].sources, o[0].noOutputStreak], [null, ['agent 记忆', 'MCP 生态', '评测'], 2, 0], 'the seed: no brief, its three topics, its two sources')
  assert.deepEqual([o[1].inbox, o[1].lastRoundAt, o[1].problem], [0, null, null], 'a fresh library: nothing wrong')
  assert.deepEqual([o[2].lastRoundAt, o[2].problem, o[2].noOutputStreak], ['2026-11-03T08:30:00.000Z', 'no-output', 3])
  assert.deepEqual([o[3].inbox, o[3].problem, o[3].brief, o[3].topics, o[3].sources], [0, 'missing', null, [], 0])
  // the brief is streams.json's (core saveBrief), read again each time
  saveBrief(quiet, '追踪一件事。不要别的。')
  assert.equal(s.handlers.getLibrariesOverview()[1].brief, '追踪一件事。不要别的。')
  // control: two rounds without output are not three
  writeFileSync(join(dry, '_pipeline', 'rounds.jsonl'), [1, 2].map(i => `${JSON.stringify({ id: `r${i}`, startedAt: `2026-11-0${i}T08:30:00.000Z`, counts: { inbox: 0 } })}\n`).join(''))
  assert.equal(s.handlers.getLibrariesOverview()[2].problem, null)
})

test('getUsageTotal: every library\'s calls this month added up, by connection; each library\'s own; a folder gone counts nothing and is said', async () => {
  const w = world()
  const now = () => new Date('2026-11-05T12:00:00.000Z')
  const s = service(w, { now })
  const [a, b, c] = ['a', 'b', 'c'].map(n => join(w.root, n))
  await openAll(s, w, [a, b, c])
  createUsageCounter(a).record({ ts: '2026-11-01T10:00:00.000Z', kind: 'claude-code', purpose: 'score', calls: 2 })
  // redesign R4b: a run's 运行前自检 (purpose probe) counts in the library's calls and is said on its own (selfCheck)
  createUsageCounter(a).record({ ts: '2026-11-01T09:59:00.000Z', kind: 'claude-code', purpose: 'probe' })
  createUsageCounter(a).record({ ts: '2026-10-30T10:00:00.000Z', kind: 'claude-code', purpose: 'score', calls: 9 })
  createUsageCounter(b).record({ ts: '2026-11-02T10:00:00.000Z', kind: 'api', purpose: 'ask' })
  createUsageCounter(c).record({ ts: '2026-11-03T10:00:00.000Z', kind: 'api', purpose: 'ask', calls: 5 })
  rmSync(c, { recursive: true, force: true })
  const [ia, ib, ic] = s.entries().map(l => l.id)
  const t = s.handlers.getUsageTotal()
  assert.equal(t.month, '2026-11')
  assert.equal(t.calls, 4, 'a: 2 + its self-check 1 this month (October\'s 9 not), b: 1, c: gone')
  assert.deepEqual(t.byKind, { 'claude-code': 3, api: 1 })
  assert.deepEqual(t.libraries, [{ id: ia, name: 'a', calls: 3, missing: false, selfCheck: 1 }, { id: ib, name: 'b', calls: 1, missing: false, selfCheck: 0 }, { id: ic, name: 'c', calls: 0, missing: true, selfCheck: 0 }])
})

test('the development library: the current one without being registered (id dev), listed as temporary; opening another library ends it', async () => {
  const w = world()
  const dev = made(w, 'dev-lib')
  const s = service(w, { devLibrary: dev })
  assert.deepEqual(s.current(), { libraryId: DEV_LIBRARY_ID, path: dev, name: 'dev-lib' })
  assert.deepEqual(s.handlers.listLibraries().map(l => [l.id, l.temporary, l.active]), [[DEV_LIBRARY_ID, true, true]])
  assert.deepEqual(readRegistry(registryFile(w)).libraries, [], 'not written')
  assert.throws(() => s.handlers.removeLibrary(DEV_LIBRARY_ID), err => err.code === 'bad_arguments')
  const other = join(w.root, 'other')
  await openAll(s, w, [other])
  assert.equal(s.dir(), other)
  assert.deepEqual(s.entries().map(l => l.path), [other], 'the development library is gone with it')
  // a development library that is registered is that library (its own id)
  const again = service(w, { devLibrary: other })
  assert.equal(again.current().libraryId, readRegistry(registryFile(w)).libraries[0].id)
})

test('getLibrarySchedule / setLibrarySchedule: any library by id, not only the current one; an unknown id → bad_arguments', async () => {
  const w = world()
  const s = service(w)
  const [a, b] = ['a', 'b'].map(n => join(w.root, n))
  await openAll(s, w, [a, b])
  const [ia] = s.entries().map(l => l.id)
  const sched = createScheduleService({ settingsFile: w.settingsFile, library: s, pipeline: { isRunning: () => false, startRoundIn: async () => ({ started: false }) }, emit: w.emit, log: w.log, timers: { set: () => 1, clear: () => {} } })
  assert.equal(s.current().path, b, 'b is the current one')
  const r = sched.handlers.setLibrarySchedule(ia, { enabled: false, time: '06:15' })
  assert.deepEqual([r.libraryId, r.enabled, r.time, r.nextRunAt], [ia, false, '06:15', null])
  assert.deepEqual(JSON.parse(readFileSync(join(a, 'streams.json'), 'utf8')).schedule, { enabled: false, time: '06:15' })
  assert.notDeepEqual(JSON.parse(readFileSync(join(b, 'streams.json'), 'utf8')).schedule, { enabled: false, time: '06:15' }, 'the current one untouched')
  assert.deepEqual(sched.handlers.getLibrarySchedule(ia).time, '06:15')
  assert.throws(() => sched.handlers.getLibrarySchedule('zzzzzzzz'), err => err.code === 'bad_arguments')
  assert.throws(() => sched.handlers.setLibrarySchedule('zzzzzzzz', { enabled: true, time: '08:30' }), err => err.code === 'bad_arguments')
  assert.throws(() => sched.handlers.setLibrarySchedule(ia, { enabled: true, time: '25:00' }), err => err.code === 'bad_arguments')
})

test('the bridge: the nine new methods and what each takes; an unknown id comes back as bad_arguments in the envelope', async () => {
  for (const name of ['listLibraries', 'setActiveLibrary', 'addLibrary', 'removeLibrary', 'setLibraryMeta', 'getLibrariesOverview', 'getLibrarySchedule', 'setLibrarySchedule', 'getUsageTotal']) assert.ok(Object.hasOwn(BRIDGE_METHODS, name), name)
  const ok = (name, args) => assert.doesNotThrow(() => checkArgs(name, args), `${name}(${JSON.stringify(args)})`)
  const bad = (name, args) => assert.throws(() => checkArgs(name, args), err => err.code === 'bad_arguments', `${name}(${JSON.stringify(args)}) accepted`)
  for (const name of ['listLibraries', 'getLibrariesOverview', 'getUsageTotal']) { ok(name, []); bad(name, ['x']) }
  for (const name of ['setActiveLibrary', 'removeLibrary', 'getLibrarySchedule']) { ok(name, ['k3v9x0qa']); bad(name, ['']); bad(name, [7]); bad(name, []); bad(name, ['x'.repeat(41)]) }
  ok('addLibrary', ['C:\\lib']); bad('addLibrary', ['']); bad('addLibrary', [null])
  ok('setLibraryMeta', ['k3v9x0qa', { name: 'x' }]); ok('setLibraryMeta', ['k3v9x0qa', { name: 'x', icon: 'x', color: 'river' }])
  bad('setLibraryMeta', ['k3v9x0qa', {}]); bad('setLibraryMeta', ['k3v9x0qa', { path: 'C:\\x' }]); bad('setLibraryMeta', ['k3v9x0qa', { name: 7 }]); bad('setLibraryMeta', ['k3v9x0qa', null])
  ok('setLibrarySchedule', ['k3v9x0qa', { enabled: true, time: '08:30' }]); bad('setLibrarySchedule', ['k3v9x0qa', { enabled: true, time: '24:00' }]); bad('setLibrarySchedule', ['k3v9x0qa', { enabled: true, time: '08:30', every: 2 }])
  // through the envelope, on the real service
  const w = world()
  const s = service(w)
  for (const [name, args] of [['setActiveLibrary', ['zzzzzzzz']], ['removeLibrary', ['zzzzzzzz']], ['setLibraryMeta', ['zzzzzzzz', { name: 'x' }]]]) {
    assert.deepEqual(await runHandler(name, s.handlers[name], args), { ok: false, error: { code: 'bad_arguments' } }, name)
  }
  assert.deepEqual(await runHandler('listLibraries', s.handlers.listLibraries, []), { ok: true, data: [] })
})
