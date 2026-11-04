// V2 · 没有任何条目不经用户点收藏进入 notes/
// 怎么核：代码里只有一处写 notes/ 的函数，且只被收藏动作和导入写头调用；变异测试：去掉那个调用守卫，测试必须变红。
//   维护者 11-03 定：「编辑一条」（S7）也经这一个函数（by: edit），只能改 notes/ 里已存在且合规范的文件、不能新建；
//   变异测试加一条：用 edit 新建文件必须被拒
//
// Static: every write call in core/src and desktop/src whose path leads into notes/ is in core/src/library/write-note.mjs,
// and writeNoteFile is called only by keep (by:'keep') and editNote (by:'edit'). Dynamic: writeNoteFile refuses every
// other `by`, `by:'edit'` never creates a file, a whole round leaves notes/ byte for byte as it was and only keep adds a
// file. Mutants: the same dynamic check on a copy of the core without the `by` guard, and on one whose edit creates, fails.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORE_DIR, DESKTOP_DIR, core } from './support/paths.mjs'
import { makeLib, header, feedLibrary, fetchCtx, hashes, ledger } from './support/library.mjs'
import { mutantCore } from './support/mutant.mjs'
import { sourceFiles, notesWrites, writeNoteCalls } from './support/source-scan.mjs'

const EXTS = ['.mjs', '.js', '.cjs']
const scanned = () => [
  ...sourceFiles(join(CORE_DIR, 'src'), EXTS).map(f => ({ ...f, rel: `core/src/${f.rel}` })),
  ...sourceFiles(join(DESKTOP_DIR, 'src'), EXTS).map(f => ({ ...f, rel: `desktop/src/${f.rel}` })),
]
const WRITER = 'core/src/library/write-note.mjs'
const ALLOWED_CALLERS = { keep: [['core/src/pipeline/decide.mjs', 'keep']], 'import-header': [], edit: [['core/src/library/edit.mjs', 'editNote']] }

test('V2 static: the only write calls whose path leads into notes/ are in core/src/library/write-note.mjs', () => {
  const files = scanned()
  assert.ok(files.length > 100, `${files.length} source files scanned`)
  assert.ok(files.some(f => f.rel === WRITER), 'the writer itself is in the scanned set')
  const writes = notesWrites(files)
  assert.ok(writes.length >= 1, 'the scan finds the writer\'s own write call (a scan that finds nothing proves nothing)')
  assert.deepEqual([...new Set(writes.map(w => w.file))], [WRITER], JSON.stringify(writes, null, 1))
})

test('V2 static: writeNoteFile is called only by keep (by: keep) and editNote (by: edit); import-header has no caller yet', () => {
  const calls = writeNoteCalls(scanned())
  assert.ok(calls.length >= 1, 'at least the keep call site is found')
  for (const c of calls) {
    assert.ok(Object.hasOwn(ALLOWED_CALLERS, c.by), `${c.file}:${c.line} calls writeNoteFile with by ${JSON.stringify(c.by)}`)
    assert.ok(ALLOWED_CALLERS[c.by].some(([file, fn]) => file === c.file && fn === c.fn), `${c.file}:${c.line} (${c.fn}) is not an allowed caller for by:'${c.by}'`)
  }
  assert.deepEqual(calls.filter(c => c.by === 'keep').map(c => `${c.file}#${c.fn}`), ['core/src/pipeline/decide.mjs#keep'])
  assert.deepEqual(calls.filter(c => c.file.startsWith('desktop/')), [], 'the desktop never calls the writer itself')
})

test('V2 static, reverse: write calls into notes/ planted in a copy of the sources are all reported', () => {
  const planted = [
    { rel: 'core/src/pipeline/sneak-direct.mjs', text: "import { writeFileSync } from 'node:fs'\nimport { join } from 'node:path'\nimport { NOTES_DIR } from '../library/scan.mjs'\nexport function f(dir, s) { writeFileSync(join(dir, NOTES_DIR, 'x.md'), s) }\n" },
    { rel: 'core/src/pipeline/sneak-variable.mjs', text: "import { appendFileSync } from 'node:fs'\nexport function f(dir, id, s) {\n  const p = `${dir}/notes/${id}.md`\n  const q = p\n  appendFileSync(q, s)\n}\n" },
    { rel: 'core/src/pipeline/sneak-helper.mjs', text: "import { promises } from 'node:fs'\nimport { notePath } from '../library/browse.mjs'\nfunction put(target, s) { return promises.writeFile(target, s) }\nexport function f(dir, id, s) { return put(notePath(dir, id), s) }\n" },
    { rel: 'desktop/src/main/sneak-rename.mjs', text: "import { renameSync } from 'node:fs'\nimport { join } from 'node:path'\nexport function f(lib, tmp, name) { renameSync(tmp, join(lib, 'notes', name)) }\n" },
  ]
  const files = [...scanned(), ...planted]
  const reported = [...new Set(notesWrites(files).map(w => w.file))].sort()
  assert.deepEqual(reported, [WRITER, ...planted.map(p => p.rel)].sort())
  // a write beside a notes reference that does not go into notes/ (createLibrary's pattern) is not reported
  const benign = { rel: 'core/src/library/benign.mjs', text: "import { mkdirSync, writeFileSync } from 'node:fs'\nimport { join } from 'node:path'\nimport { NOTES_DIR } from './scan.mjs'\nexport function f(dir) {\n  mkdirSync(join(dir, NOTES_DIR))\n  writeFileSync(join(dir, 'index.jsonl'), '')\n}\n" }
  assert.deepEqual(notesWrites([benign]), [])
})

// The dynamic check of the writer's guard, run on whatever core it is given. Returns what is wrong ([] = right).
function writerProblems(c, name) {
  const problems = []
  const dir = makeLib(name, { core: c })
  const notes = join(dir, 'notes')
  const list = () => readdirSync(notes).sort()
  const refused = [undefined, null, '', 'pipeline', 'summary', 'fetch', 'round', 'KEEP', 'keep ', 'import', 'edit\n', 'auto']
  for (const [i, by] of refused.entries()) {
    const id = `2026-11-03-by-${i}`
    try {
      c.writeNoteFile(dir, { id, header: header(id), body: 'x\n' }, { by })
      problems.push(`by ${JSON.stringify(by)} was accepted`)
    } catch (e) {
      if (e.code !== 'bad-by') problems.push(`by ${JSON.stringify(by)}: ${e.code} instead of bad-by`)
    }
    if (existsSync(join(notes, `${id}.md`))) problems.push(`by ${JSON.stringify(by)} left ${id}.md in notes/`)
  }
  if (list().length !== 0) problems.push(`notes/ after the refused writes: ${list().join(', ')}`)
  // edit never creates
  try {
    c.writeNoteFile(dir, { id: 'new-by-edit', header: header('new-by-edit'), body: 'x\n' }, { by: 'edit' })
    problems.push('by edit created a new note')
  } catch (e) {
    if (e.code !== 'not-found') problems.push(`by edit on a new id: ${e.code} instead of not-found`)
  }
  if (existsSync(join(notes, 'new-by-edit.md'))) problems.push('by edit left new-by-edit.md in notes/')
  // the allowed values do what they say
  try { c.writeNoteFile(dir, { id: 'kept-one', header: header('kept-one'), body: 'a\n' }, { by: 'keep' }) } catch (e) { problems.push(`by keep refused: ${e.code}`) }
  try { c.writeNoteFile(dir, { id: 'imported-one', header: header('imported-one', { status: 'authored', kept: undefined }), body: 'b\n' }, { by: 'import-header' }) } catch (e) { problems.push(`by import-header refused: ${e.code}`) }
  try { c.writeNoteFile(dir, { id: 'kept-one', header: header('kept-one', { title: 'Edited' }), body: 'c\n' }, { by: 'edit' }) } catch (e) { problems.push(`by edit on an existing note refused: ${e.code}`) }
  // keep never overwrites
  try {
    c.writeNoteFile(dir, { id: 'kept-one', header: header('kept-one'), body: 'again\n' }, { by: 'keep' })
    problems.push('by keep overwrote an existing note')
  } catch (e) {
    if (e.code !== 'id-conflict') problems.push(`by keep on an existing id: ${e.code} instead of id-conflict`)
  }
  // edit refuses a non-conforming file and leaves it as it is
  writeFileSync(join(notes, 'untidy.md'), 'no header here\n', 'utf8')
  const before = hashes(notes)
  try {
    c.writeNoteFile(dir, { id: 'untidy', header: header('untidy'), body: 'x\n' }, { by: 'edit' })
    problems.push('by edit replaced a non-conforming file')
  } catch (e) {
    if (e.code !== 'not-editable') problems.push(`by edit on a non-conforming file: ${e.code} instead of not-editable`)
  }
  if (JSON.stringify(hashes(notes)) !== JSON.stringify(before)) problems.push('the non-conforming file changed')
  const want = ['imported-one.md', 'kept-one.md', 'untidy.md']
  if (JSON.stringify(list()) !== JSON.stringify(want)) problems.push(`notes/ at the end: ${list().join(', ')} (expected ${want.join(', ')})`)
  return problems
}

test('V2 dynamic: writeNoteFile takes only keep / import-header / edit; edit cannot create; keep cannot overwrite', () => {
  assert.deepEqual(writerProblems(core, 'v02-writer'), [])
})

test('V2 mutation: without the `by` guard the same check is red', async () => {
  const m = await mutantCore('v02-no-by-guard', [{ file: 'library/write-note.mjs', from: 'if (!WRITE_NOTE_BY.includes(by)) throw', to: 'if (false) throw' }])
  const problems = writerProblems(m, 'v02-writer-no-guard')
  assert.ok(problems.some(p => /was accepted/.test(p)), problems.join('\n'))
})

test('V2 mutation: an edit that creates a missing note makes the same check red', async () => {
  const m = await mutantCore('v02-edit-creates', [{ file: 'library/write-note.mjs', from: 'if (!existsSync(path)) throw ', to: "if (!existsSync(path)) return (writeFileSync(path, text, 'utf8'), { file, path }); if (false) throw " }])
  const problems = writerProblems(m, 'v02-writer-edit-creates')
  assert.ok(problems.includes('by edit created a new note'), problems.join('\n'))
})

test('V2 round: a whole round with items reaching the inbox leaves notes/ byte for byte; only keep puts a file there', async (t) => {
  const { dir, items } = await feedLibrary(t, 'v02-round', 3)
  const notes = join(dir, 'notes')
  const before = hashes(notes)
  assert.deepEqual(readdirSync(notes), [], 'notes/ starts empty')
  const conn = core.scriptedConnector()
  const r = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  assert.equal(r.ok, true)
  assert.equal(r.counts.inbox, 3, 'three items passed every gate and wait in the inbox')
  assert.deepEqual(hashes(notes), before, 'the round wrote nothing into notes/')
  assert.deepEqual(readdirSync(notes), [])
  // a second round (nothing new) and a dismiss: still nothing in notes/
  await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  core.dismiss(dir, items[1].url, '不相关')
  assert.deepEqual(readdirSync(notes), [], 'dismiss writes nothing into notes/')
  // the user keeps one: exactly one file appears, named by keep's id, and the ledger says kept
  const k = core.keep(dir, items[0].url)
  assert.deepEqual(readdirSync(notes), [k.file])
  assert.notDeepEqual(hashes(notes), before, 'reverse: the same comparison sees the kept file')
  assert.deepEqual(ledger(dir).filter(e => e.ev === 'kept').map(e => e.url), [items[0].url])
  // the item still in the inbox is not in notes/
  assert.equal(core.listInbox(dir).map(i => i.url).includes(items[2].url), true)
  assert.equal(readdirSync(notes).length, 1)
})
