// The library service (src/main/services/library.mjs) in plain Node: a folder's state is judged by what is in it; the
// page never names a path — useChosenFolder acts on the last dialog answer and openRecentLibrary only on a path already
// in the recent list; opening writes the setting and the recent list and sends library-changed; every method needing a
// library answers no_library without one. Each case first shows the refused input really is refused.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService, folderState } from '../src/main/services/library.mjs'
import { readSettings } from '../src/main/settings.mjs'
import { readConfig } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { IMPORT_FILES, seedImportFolder } from './support/seed.mjs'

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
const world = () => { const w = testWorld('st-library-'); worlds.push(w); return w }
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })

const service = (w, extra = {}) => createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, ...extra })

test('folderState: empty (or not there) · library (has streams.json) · other', () => {
  const w = world()
  const empty = join(w.root, 'empty')
  mkdirSync(empty)
  assert.equal(folderState(empty), 'empty')
  assert.equal(folderState(join(w.root, 'not-yet')), 'empty', 'a folder that is not there yet counts as empty (createLibrary makes it)')
  const lib = join(w.root, 'lib')
  mkdirSync(lib)
  writeFileSync(join(lib, 'streams.json'), '{}')
  assert.equal(folderState(lib), 'library')
  const other = join(w.root, 'other')
  mkdirSync(other)
  writeFileSync(join(other, 'notes.txt'), 'x')
  assert.equal(folderState(other), 'other')
  assert.notEqual(folderState(other), 'empty')
})

test('chooseLibraryFolder: the dialog answer is remembered here; cancel is null and forgets; the page cannot name a path', async () => {
  const w = world()
  const s = service(w)
  await assert.rejects(async () => s.handlers.useChosenFolder('x'), err => err.code === 'bad_arguments', 'nothing chosen yet')
  const folder = join(w.root, 'my lib')
  mkdirSync(folder)
  w.dialogAnswers.push(folder)
  assert.deepEqual(await s.handlers.chooseLibraryFolder(), { path: folder, name: 'my lib', state: 'empty' })
  assert.deepEqual(s.chosen(), { path: folder, name: 'my lib', state: 'empty' })
  assert.equal(await s.handlers.chooseLibraryFolder(), null, 'cancelled')
  assert.equal(s.chosen(), null, 'a cancel forgets the earlier choice')
  await assert.rejects(async () => s.handlers.useChosenFolder(''), err => err.code === 'bad_arguments')
  // the development hook stands in for the dialog
  const hook = service(w, { devChooseFolder: folder })
  assert.deepEqual(await hook.handlers.chooseLibraryFolder(), { path: folder, name: 'my lib', state: 'empty' })
})

test('useChosenFolder: empty → a library is made with the name given (or the folder name); library → opened; other → open_failed', async () => {
  const w = world()
  const s = service(w)
  const folder = join(w.root, 'fresh')
  w.dialogAnswers.push(folder)
  await s.handlers.chooseLibraryFolder()
  assert.equal(s.current(), null, 'choosing opens nothing')
  assert.deepEqual(await s.handlers.useChosenFolder('  AI tools  '), { path: folder, name: 'fresh' })
  assert.equal(readConfig(folder).config.name, 'AI tools', 'the name given, trimmed')
  assert.equal(readConfig(folder).config.pipeline.language, 'zh-CN', 'the prompts follow the app language')
  assert.ok(existsSync(join(folder, 'notes')))
  assert.ok(existsSync(join(folder, 'index.jsonl')), 'the index is built on open')
  assert.deepEqual(s.current(), { path: folder, name: 'fresh' })
  assert.equal(readSettings(w.settingsFile).libraryPath, folder)
  assert.deepEqual(readSettings(w.settingsFile).recentLibraries, [folder])
  assert.deepEqual(w.eventsOf('library-changed'), [{ topic: 'library-changed', payload: { path: folder, name: 'fresh' } }])
  // an empty name = the folder name; English app → English prompts
  const second = join(w.root, 'second')
  w.locale = { resolved: 'en' }
  w.dialogAnswers.push(second)
  await s.handlers.chooseLibraryFolder()
  await s.handlers.useChosenFolder('')
  assert.equal(readConfig(second).config.name, 'second')
  assert.equal(readConfig(second).config.pipeline.language, 'en')
  assert.deepEqual(readSettings(w.settingsFile).recentLibraries, [second, folder], 'most recent first')
  // an existing library is opened, not remade
  w.dialogAnswers.push(folder)
  assert.equal((await s.handlers.chooseLibraryFolder()).state, 'library')
  await s.handlers.useChosenFolder('ignored')
  assert.equal(readConfig(folder).config.name, 'AI tools', 'the existing library keeps its name')
  assert.deepEqual(readSettings(w.settingsFile).recentLibraries, [folder, second], 'moved to the front, no repeat')
  // other: refused, nothing written, nothing opened
  const other = join(w.root, 'other')
  mkdirSync(other)
  writeFileSync(join(other, 'a.txt'), 'x')
  w.dialogAnswers.push(other)
  assert.equal((await s.handlers.chooseLibraryFolder()).state, 'other')
  await assert.rejects(async () => s.handlers.useChosenFolder('x'), err => err.code === 'open_failed')
  assert.equal(existsSync(join(other, 'streams.json')), false)
  assert.equal(readSettings(w.settingsFile).libraryPath, folder, 'the open library is unchanged')
  // a library folder whose streams.json is broken: open_failed
  const broken = join(w.root, 'broken')
  mkdirSync(broken)
  writeFileSync(join(broken, 'streams.json'), '{ not json')
  w.dialogAnswers.push(broken)
  assert.equal((await s.handlers.chooseLibraryFolder()).state, 'library')
  await assert.rejects(async () => s.handlers.useChosenFolder(''), err => err.code === 'open_failed')
})

test('openRecentLibrary: only a path in the recent list; a listed path that no longer holds a library is open_failed', async () => {
  const w = world()
  const s = service(w)
  const a = join(w.root, 'a')
  const b = join(w.root, 'b')
  for (const d of [a, b]) { w.dialogAnswers.push(d); await s.handlers.chooseLibraryFolder(); await s.handlers.useChosenFolder('') }
  assert.deepEqual(s.current().path, b)
  await assert.rejects(async () => s.handlers.openRecentLibrary(join(w.root, 'c')), err => err.code === 'bad_arguments', 'not in the list')
  await assert.rejects(async () => s.handlers.openRecentLibrary(a.toUpperCase()), err => err.code === 'bad_arguments', 'the exact string, nothing looser')
  assert.deepEqual(await s.handlers.openRecentLibrary(a), { path: a, name: 'a' })
  assert.equal(readSettings(w.settingsFile).libraryPath, a)
  assert.deepEqual(readSettings(w.settingsFile).recentLibraries, [a, b])
  removeTree(b, { waitMs: 3000 })
  await assert.rejects(async () => s.handlers.openRecentLibrary(b), err => err.code === 'open_failed')
  assert.equal(readSettings(w.settingsFile).libraryPath, a, 'still a')
})

test('rebuildIndex and revealLibrary need a library; the development library stands in for the setting; reveal only logs when hidden', async () => {
  const w = world()
  const s = service(w)
  await assert.rejects(async () => s.handlers.rebuildIndex(), err => err.code === 'no_library')
  await assert.rejects(async () => s.handlers.revealLibrary(), err => err.code === 'no_library')
  const lib = join(w.root, 'lib')
  w.dialogAnswers.push(lib)
  await s.handlers.chooseLibraryFolder()
  await s.handlers.useChosenFolder('')
  assert.deepEqual(s.handlers.rebuildIndex(), { count: 0, pending: [] })
  // a note that does not conform shows up as pending with its codes; a good one counts
  writeFileSync(join(lib, 'notes', 'bad.md'), 'no front matter\n')
  writeFileSync(join(lib, 'notes', '2026-11-03-good.md'), '---\nid: 2026-11-03-good\ntitle: Good\nsource: https://example.org/a\ndate: 2026-11-03\nstatus: kept\ntopics: [t]\n---\nbody\n')
  const r = s.handlers.rebuildIndex()
  assert.equal(r.count, 1)
  assert.deepEqual(r.pending, [{ file: 'bad.md', codes: ['no-frontmatter'] }])
  assert.equal(w.eventsOf('library-changed').length, 3, 'two opens, one rebuild')
  assert.equal(s.handlers.revealLibrary(), null)
  assert.deepEqual(w.revealed, [lib])
  const hidden = service(w, { hidden: true })
  assert.equal(hidden.handlers.revealLibrary(), null)
  assert.deepEqual(w.revealed, [lib], 'hidden: not revealed again')
  assert.ok(w.lines.some(l => l.includes('not revealed in a test run')))
  // the development library
  const dev = service(w, { devLibrary: join(w.root, 'dev-lib') })
  assert.deepEqual(dev.current(), { path: join(w.root, 'dev-lib'), name: 'dev-lib' })
  assert.equal(dev.dir(), join(w.root, 'dev-lib'))
})

// ---- 导入已有文件夹 (docs/desktop.md §4.3): a folder of .md files without streams.json is importable ----

test('folderState importable: .md files on the first level and no streams.json; a .md only in a sub folder is other', () => {
  const w = world()
  const folder = join(w.root, 'vault')
  seedImportFolder(folder)
  assert.equal(folderState(folder), 'importable')
  const deep = join(w.root, 'deep')
  mkdirSync(join(deep, 'sub'), { recursive: true })
  writeFileSync(join(deep, 'sub', 'a.md'), '# a')
  writeFileSync(join(deep, 'a.txt'), 'x')
  assert.equal(folderState(deep), 'other', 'nothing on the first level to import')
  writeFileSync(join(folder, 'streams.json'), '{}')
  assert.equal(folderState(folder), 'library', 'a streams.json makes it a library, whatever else is there')
})

test('useChosenFolder on an importable folder: importFolder, then opened; every file that was there is byte for byte the same', async () => {
  const w = world()
  const s = service(w)
  const folder = join(w.root, 'my notes')
  const seeded = seedImportFolder(folder)
  const before = hashTree(folder)
  w.dialogAnswers.push(folder)
  const chosen = await s.handlers.chooseLibraryFolder()
  assert.deepEqual(chosen, { path: folder, name: 'my notes', state: 'importable', mdCount: seeded.mdCount })
  assert.equal(existsSync(join(folder, 'streams.json')), false, 'choosing writes nothing')
  assert.deepEqual(await s.handlers.useChosenFolder(''), { path: folder, name: 'my notes' })
  const cfg = readConfig(folder)
  assert.equal(cfg.ok, true)
  assert.equal(cfg.config.notesDir, '.')
  assert.equal(cfg.config.name, 'my notes')
  const after = hashTree(folder)
  for (const [rel, h] of Object.entries(before)) assert.equal(after[rel], h, rel)
  assert.equal(readSettings(w.settingsFile).libraryPath, folder)
  assert.deepEqual(w.eventsOf('library-changed').at(-1), { topic: 'library-changed', payload: { path: folder, name: 'my notes' } })
  assert.ok(w.lines.some(l => l.startsWith(`library: imported ${folder}: 1 conforming, 5 to tidy, 1 sub folders not read`)), w.lines.join('\n'))
  // chosen again: it is a library now, opened as it is
  w.dialogAnswers.push(folder)
  assert.equal((await s.handlers.chooseLibraryFolder()).state, 'library')
  // reverse: the hash comparison sees a changed file
  writeFileSync(join(folder, 'untitled.md'), 'changed')
  assert.notEqual(hashTree(folder)['untitled.md'], before['untitled.md'])
})

test('useChosenFolder: an importable folder that became a library meanwhile is opened, not imported again; one that lost its .md files is open_failed', async () => {
  const w = world()
  const s = service(w)
  const folder = join(w.root, 'changing')
  seedImportFolder(folder)
  w.dialogAnswers.push(folder)
  assert.equal((await s.handlers.chooseLibraryFolder()).state, 'importable')
  for (const f of Object.keys(IMPORT_FILES).filter(f => !f.includes('/'))) rmSync(join(folder, f))
  await assert.rejects(async () => s.handlers.useChosenFolder(''), err => err.code === 'open_failed')
  assert.equal(existsSync(join(folder, 'streams.json')), false)
})
