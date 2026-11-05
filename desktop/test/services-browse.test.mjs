// The library-and-reading service (src/main/services/browse.mjs) in plain Node, on a library the core itself wrote
// (test/support/seed.mjs): every method needs a library (no_library); an id must be in the index before anything is read,
// edited or opened, and the core is not asked otherwise; the core's shape errors come back as bad_arguments, the rest as
// internal; an edit sends library-changed; the note opens in Obsidian through the path the core gives, only inside notes/,
// and a test run (hidden) only logs. The core's W5 functions (listLibrary, readNote, editNote, …) are stand-ins here until
// they land; the last test runs the real ones and is skipped until core/src/library/browse.mjs exports them.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as realCore from '../src/main/core.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createBrowseService, inside } from '../src/main/services/browse.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { seedImportFolder, seedLibrary } from './support/seed.mjs'

const W5 = ['libraryCounts', 'listLibrary', 'readNote', 'notePath', 'editNote', 'search'].every(n => typeof realCore[n] === 'function')
const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })

/** A world with a seeded library opened (or none), the shell recording openExternal and openPath. */
async function world({ seeded = true } = {}) {
  const w = testWorld('st-browse-')
  worlds.push(w)
  const dir = join(w.root, 'lib')
  const seed = seeded ? await seedLibrary(dir) : null
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, devLibrary: seeded ? dir : null })
  w.paths = []
  w.shell.openPath = async p => { w.paths.push(p); return w.openPathAnswer ?? '' }
  return { w, dir, seed, library }
}

/** The real core with the W5 functions replaced by recorders; `over` gives what each answers. */
function standIn(over = {}) {
  const calls = []
  const rec = (name, answer) => (...args) => { calls.push([name, ...args]); return typeof answer === 'function' ? answer(...args) : answer }
  const fns = {
    libraryCounts: { kept: 1, authored: 0, caught: 1, pending: 0 },
    listLibrary: (dir, o) => ({ view: o.view, items: [], total: 0 }),
    search: [],
    readNote: (dir, id) => ({ entry: { id }, body: 'b', backlinks: [], sameSource: [], file: `${id}.md` }),
    notePath: (dir, id) => join(dir, 'notes', `${id}.md`),
    editNote: (dir, id) => ({ id, file: `${id}.md`, entry: { id }, extra: 'not handed on' }),
    ...over,
  }
  const core = { ...realCore }
  for (const [name, answer] of Object.entries(fns)) core[name] = rec(name, answer)
  return { core, calls, of: name => calls.filter(c => c[0] === name) }
}

let shared
before(async () => { shared = await world() })

test('without a library every method is no_library', async () => {
  const { w, library } = await world({ seeded: false })
  const { core, calls } = standIn()
  const h = createBrowseService({ library, emit: w.emit, log: w.log, shell: w.shell, core }).handlers
  for (const [name, args] of [['getLibrary', ['kept', null]], ['searchLibrary', ['q', null]], ['readNote', ['x']], ['editNote', ['x', { title: 't' }]], ['openInObsidian', ['x']]]) {
    await assert.rejects(async () => h[name](...args), err => err.code === 'no_library', name)
  }
  assert.deepEqual(calls, [], 'the core was not asked')
})

test('getLibrary and searchLibrary: the core gets the view, the filter and the clock; getLibrary adds the counts', async () => {
  const { w, dir, library } = shared
  const { core, of } = standIn()
  const h = createBrowseService({ library, emit: w.emit, log: w.log, shell: w.shell, core }).handlers
  const r = h.getLibrary('caught', { topics: ['评测'], days: 30 })
  assert.deepEqual(r, { counts: { kept: 1, authored: 0, caught: 1, pending: 0 }, view: 'caught', items: [], total: 0 })
  const [, d, o] = of('listLibrary')[0]
  assert.equal(d, dir)
  assert.deepEqual([o.view, o.topics, o.days, typeof o.now], ['caught', ['评测'], 30, 'function'])
  h.getLibrary('kept', null)
  assert.deepEqual(Object.keys(of('listLibrary')[1][2]).sort(), ['now', 'view'], 'null filter: nothing but the view and the clock')
  assert.deepEqual(h.searchLibrary('记忆', { view: 'all', topics: [] }), [])
  const [, sd, sq, { now: sNow, ...so }] = of('search')[0]
  assert.deepEqual([sd, sq, so, typeof sNow], [dir, '记忆', { view: 'all', topics: [] }, 'function'])
  // a core without the function yet: internal, not a crash of the service
  const { listLibrary, ...withoutList } = core
  void listLibrary
  const old = createBrowseService({ library, emit: w.emit, log: w.log, shell: w.shell, core: withoutList }).handlers
  assert.throws(() => old.getLibrary('kept', null), err => err.code === 'internal' && /listLibrary/.test(err.message))
})

test('readNote and editNote: only an id in the index reaches the core; core shape errors → bad_arguments, others → internal; an edit sends library-changed', async () => {
  const { w, dir, seed, library } = shared
  const id = seed.kept.id
  const { core, of } = standIn()
  const h = createBrowseService({ library, emit: w.emit, log: w.log, shell: w.shell, core }).handlers
  assert.equal(h.readNote(id).file, `${id}.md`)
  assert.deepEqual(of('readNote')[0].slice(1), [dir, id])
  for (const bad of ['2099-01-01-not-there', '../streams', 'C:\\Windows\\win.ini']) {
    assert.throws(() => h.readNote(bad), err => err.code === 'bad_arguments', bad)
    assert.throws(() => h.editNote(bad, { title: 't' }), err => err.code === 'bad_arguments', bad)
  }
  assert.equal(of('readNote').length, 1, 'an unknown id never reached the core')
  assert.equal(of('editNote').length, 0)
  const before = w.events.length
  assert.deepEqual(h.editNote(id, { title: '新标题', topics: ['评测'] }), { id, file: `${id}.md`, entry: { id } })
  assert.deepEqual(of('editNote')[0].slice(1), [dir, id, { title: '新标题', topics: ['评测'] }])
  assert.deepEqual(w.events.slice(before), [{ topic: 'library-changed', payload: { libraryId: library.current().libraryId, path: dir, name: 'lib' } }])
  // the core refuses: shape → bad_arguments, anything else → internal; no event either way
  const coded = code => () => { throw new realCore.StreamsError(code, `core: ${code}`) }
  for (const [code, want] of [['bad-edit', 'bad_arguments'], ['invalid-note', 'bad_arguments'], ['not-found', 'bad_arguments'], ['not-editable', 'bad_arguments'], ['id-conflict', 'internal'], ['bad-by', 'internal']]) {
    const s = standIn({ editNote: coded(code) })
    const hh = createBrowseService({ library, emit: w.emit, log: w.log, shell: w.shell, core: s.core }).handlers
    const n = w.events.length
    assert.throws(() => hh.editNote(id, { body: 'x' }), err => err.code === want, code)
    assert.equal(w.events.length, n, `${code}: no event`)
  }
})

test('openInObsidian: the obsidian:// address of the path the core gives; openPath when that fails; outside notes/ → internal; hidden only logs', async () => {
  const { w, dir, seed, library } = shared
  const id = seed.kept.id
  const path = join(dir, 'notes', `${id}.md`)
  const { core } = standIn()
  w.opened.length = 0
  w.paths.length = 0
  const h = createBrowseService({ library, emit: w.emit, log: w.log, shell: w.shell, core }).handlers
  assert.equal(await h.openInObsidian(id), null)
  assert.deepEqual(w.opened, [`obsidian://open?path=${encodeURIComponent(path)}`])
  assert.deepEqual(w.paths, [])
  await assert.rejects(async () => h.openInObsidian('2099-01-01-not-there'), err => err.code === 'bad_arguments')
  // obsidian:// not handled: the file with its own program; that failing too → open_failed
  const failing = { ...w.shell, openExternal: async () => { throw new Error('no handler') } }
  const h2 = createBrowseService({ library, emit: w.emit, log: w.log, shell: failing, core }).handlers
  assert.equal(await h2.openInObsidian(id), null)
  assert.deepEqual(w.paths, [path])
  w.openPathAnswer = 'Failed to open path'
  await assert.rejects(async () => h2.openInObsidian(id), err => err.code === 'open_failed')
  w.openPathAnswer = ''
  // a path outside notes/ (or not absolute) is never opened
  for (const bad of [join(dir, 'streams.json'), join(dir, 'notes'), 'notes/x.md', join(dir, '..', 'elsewhere.md')]) {
    const s = standIn({ notePath: () => bad })
    const h3 = createBrowseService({ library, emit: w.emit, log: w.log, shell: w.shell, core: s.core }).handlers
    const n = w.opened.length
    await assert.rejects(async () => h3.openInObsidian(id), err => err.code === 'internal', bad)
    assert.equal(w.opened.length, n)
  }
  // hidden: logged, nothing opened
  const quiet = createBrowseService({ library, emit: w.emit, log: w.log, hidden: true, shell: w.shell, core }).handlers
  const n = w.opened.length
  assert.equal(await quiet.openInObsidian(id), null)
  assert.equal(w.opened.length, n)
  assert.ok(w.lines.some(l => l.startsWith('not opened in a test run: obsidian')))
  // the rule itself can fail
  assert.equal(inside(join(dir, 'notes'), path), true)
  assert.equal(inside(join(dir, 'notes'), join(dir, 'notes')), false)
})

test('the real core W5: counts and lists, search, one note, an edit, the path', { skip: W5 ? false : 'core W5 (library/browse.mjs, edit.mjs, search.mjs) not landed yet' }, async () => {
  const { w, dir, seed, library } = await world()
  const h = createBrowseService({ library, emit: w.emit, log: w.log, hidden: true, shell: w.shell }).handlers
  const kept = h.getLibrary('kept', null)
  assert.equal(kept.view, 'kept')
  assert.equal(kept.counts.kept, 1)
  assert.deepEqual(kept.items.map(i => i.id), [seed.kept.id])
  assert.equal(kept.total, 1)
  const caught = h.getLibrary('caught', null)
  assert.ok(caught.items.some(i => i.url === seed.caughtUrl), 'the item that failed the first gate is 「抓到的」')
  const note = h.readNote(seed.kept.id)
  assert.equal(note.entry.id, seed.kept.id)
  assert.equal(note.file, seed.kept.file)
  assert.equal(typeof note.body, 'string')
  const hits = h.searchLibrary(seed.kept.title.slice(0, 6), { view: 'kept' })
  assert.ok(hits.some(x => x.id === seed.kept.id))
  const n = w.events.length
  const edited = h.editNote(seed.kept.id, { title: '改过的标题' })
  assert.equal(edited.entry.title, '改过的标题')
  assert.equal(realCore.readIndex(dir).find(e => e.id === seed.kept.id).title, '改过的标题')
  assert.deepEqual(w.events.slice(n).map(e => e.topic), ['library-changed'])
  assert.throws(() => h.editNote(seed.kept.id, { source: 'https://x' }), err => err.code === 'bad_arguments')
  assert.equal(await h.openInObsidian(seed.kept.id), null)
})

// ---- 待规范 (docs/desktop.md §4.3, S8): applyHeader / applyAllHeaders on an imported folder, the real core ----

/** An imported folder (seedImportFolder + the core's importFolder) opened as the library. */
function importedWorld() {
  const w = testWorld('st-browse-import-')
  worlds.push(w)
  const dir = join(w.root, 'vault')
  const seeded = seedImportFolder(dir)
  realCore.importFolder(dir, { name: 'vault' })
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, devLibrary: dir })
  return { w, dir, seeded, library, h: createBrowseService({ library, emit: w.emit, log: w.log, hidden: true, shell: w.shell }).handlers }
}
const bodyOf = (dir, file) => realCore.bodyHashOf(readFileSync(join(dir, file)))

test('applyHeader: only a file the core lists as needing a header; written with the proposal or the page\'s changes, the body unchanged; library-changed', async () => {
  const { w, dir, h } = importedWorld()
  const pending = h.getLibrary('pending', null)
  assert.deepEqual(pending.skippedDirs, ['旧笔记'], 'the sub folders not read come with the pending view')
  const row = pending.items.find(i => i.file === '记忆方案选型.md')
  assert.equal(row.bodyHash, bodyOf(dir, row.file))
  // refused before the core is asked to write: a conforming file, a file not there, a path
  const before = readFileSync(join(dir, '已经合规范.md'))
  for (const file of ['已经合规范.md', 'nope.md', '旧笔记/2024.md', '../outside.md']) {
    assert.throws(() => h.applyHeader(file, null), err => err.code === 'bad_arguments', file)
  }
  assert.ok(readFileSync(join(dir, '已经合规范.md')).equals(before))
  // the core's refusals are bad_arguments, the file untouched
  const badName = readFileSync(join(dir, '会议记录(草稿).md'))
  assert.throws(() => h.applyHeader('会议记录(草稿).md', null), err => err.code === 'bad_arguments')
  assert.throws(() => h.applyHeader('坏了的文件头.md', null), err => err.code === 'bad_arguments')
  assert.throws(() => h.applyHeader('untitled.md', { topics: [] }), err => err.code === 'bad_arguments')
  assert.ok(readFileSync(join(dir, '会议记录(草稿).md')).equals(badName))
  assert.equal(w.eventsOf('library-changed').length, 0, 'nothing written, nothing sent')
  // the proposal as it is
  const r = h.applyHeader('记忆方案选型.md', null)
  assert.equal(r.id, '记忆方案选型')
  assert.equal(r.entry.status, 'authored')
  assert.equal(bodyOf(dir, '记忆方案选型.md'), row.bodyHash, 'the body is byte for byte the old file')
  assert.equal(w.eventsOf('library-changed').length, 1)
  // the page's changes win
  const r2 = h.applyHeader('2025-读书笔记.md', { title: '页面上改过的', topics: ['阅读', '笔记'] })
  assert.equal(r2.entry.title, '页面上改过的')
  assert.deepEqual(realCore.parseFrontmatter(readFileSync(join(dir, '2025-读书笔记.md'), 'utf8')).meta.topics, ['阅读', '笔记'])
  assert.deepEqual(h.getLibrary('pending', null).items.map(i => i.file).sort(), ['untitled.md', '会议记录(草稿).md', '坏了的文件头.md'].sort())
  // an imported note opens in Obsidian from the folder itself
  assert.equal(await h.openInObsidian('记忆方案选型'), null)
  assert.ok(w.lines.some(l => l === `not opened in a test run: obsidian ${join(dir, '记忆方案选型.md')}`), w.lines.join('\n'))
})

test('applyAllHeaders: every file with a proposal and a usable name is written; the others are skipped with the reason; bodies unchanged', () => {
  const { w, dir, seeded, h } = importedWorld()
  const hashes = Object.fromEntries(seeded.proposable.map(f => [f, bodyOf(dir, f)]))
  const untouched = Object.fromEntries([...seeded.badName, ...seeded.notProposable, ...seeded.conforming].map(f => [f, readFileSync(join(dir, f))]))
  const r = h.applyAllHeaders()
  assert.deepEqual(r.written.slice().sort(), seeded.proposable.slice().sort())
  assert.deepEqual(r.skipped.slice().sort((a, b) => (a.file < b.file ? -1 : 1)), [{ file: '会议记录(草稿).md', code: 'bad-file-name' }, { file: '坏了的文件头.md', code: 'not-proposable' }])
  for (const [f, hash] of Object.entries(hashes)) assert.equal(bodyOf(dir, f), hash, f)
  for (const [f, bytes] of Object.entries(untouched)) assert.ok(readFileSync(join(dir, f)).equals(bytes), f)
  assert.deepEqual(realCore.readIndex(dir).map(e => e.id).sort(), ['2025-读书笔记', 'untitled', '已经合规范', '记忆方案选型'].sort())
  assert.equal(w.eventsOf('library-changed').length, 1)
  // again: nothing left to write, nothing sent
  const again = h.applyAllHeaders()
  assert.deepEqual(again.written, [])
  assert.equal(w.eventsOf('library-changed').length, 1)
})
