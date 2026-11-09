// v2 package I in plain Node (src/main/services/library.mjs): 「新建库默认放在」 — getLibraryRoot / chooseLibraryRoot /
// setLibraryRoot over settings.json's libraryRoot — and 首次打开's connection record — recordSetupStep('connection', …) with no
// library writes settings.json's setupConnection, and a library 新建库 makes gets it as setup.connection (its time kept).
// Each case first shows the input that is refused: a relative path, the app-data folder itself and a folder inside it.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { readSetup } from '../src/main/core.mjs'
import { readSettings } from '../src/main/settings.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { testWorld } from './support/services.mjs'

const made = []
const world = () => { const w = testWorld('st-libroot-'); made.push(w.root); return w }
const elsewhere = () => { const d = tempDir('st-libroot-out-'); made.push(d); return d }
after(() => { for (const d of made) removeTree(d, { waitMs: 3000 }) })

// the world's root stands for the app-data folder (the settings file is in it)
const service = (w, extra = {}) => createLibraryService({
  settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale,
  defaultLibraryRoot: join(w.root, 'libraries'), protectedDirs: [w.root], ...extra,
})
const fileText = f => { try { return readFileSync(f, 'utf8') } catch { return null } }

test('getLibraryRoot: no setting → the default place, isDefault; a set one → that path, not default', () => {
  const w = world()
  const s = service(w)
  assert.deepEqual(s.handlers.getLibraryRoot(), { path: join(w.root, 'libraries'), isDefault: true })
  const out = elsewhere()
  writeFileSync(w.settingsFile, `${JSON.stringify({ libraryRoot: out })}\n`)
  assert.deepEqual(s.handlers.getLibraryRoot(), { path: out, isDefault: false })
})

test('setLibraryRoot: an absolute path outside the app data is written; relative, the app data itself or a folder in it → bad_arguments, nothing written; null = the default again', () => {
  const w = world()
  const s = service(w)
  const before = fileText(w.settingsFile)
  for (const bad of ['libs', '.\\libs', w.root, join(w.root, 'libraries'), join(w.root, 'a', 'b'), join(w.root.toUpperCase(), 'x'), ' ']) {
    assert.throws(() => s.handlers.setLibraryRoot(bad), err => err.code === 'bad_arguments', bad)
  }
  assert.equal(fileText(w.settingsFile), before, 'a refused path writes nothing')
  assert.equal(w.eventsOf('settings-changed').length, 0)
  const out = elsewhere()
  assert.deepEqual(s.handlers.setLibraryRoot(out), { path: out, isDefault: false })
  assert.equal(readSettings(w.settingsFile).libraryRoot, out)
  assert.equal(w.eventsOf('settings-changed').length, 1)
  assert.deepEqual(s.handlers.setLibraryRoot(null), { path: join(w.root, 'libraries'), isDefault: true })
  assert.equal(readSettings(w.settingsFile).libraryRoot, null)
})

test('chooseLibraryRoot: the dialog (cancel → null, nothing written); the development hook stands in for it; a folder in the app data is refused', async () => {
  const w = world()
  const s = service(w)
  assert.equal(await s.handlers.chooseLibraryRoot(), null, 'cancelled')
  assert.equal(readSettings(w.settingsFile).libraryRoot, null)
  const out = elsewhere()
  w.dialogAnswers.push(out)
  assert.deepEqual(await s.handlers.chooseLibraryRoot(), { path: out, isDefault: false })
  const inside = join(w.root, 'inside')
  mkdirSync(inside)
  const hooked = service(w, { devChooseFolder: inside })
  await assert.rejects(async () => hooked.handlers.chooseLibraryRoot(), err => err.code === 'bad_arguments')
  assert.equal(readSettings(w.settingsFile).libraryRoot, out, 'the refused one did not replace it')
  const out2 = elsewhere()
  assert.deepEqual(await service(w, { devChooseFolder: out2 }).handlers.chooseLibraryRoot(), { path: out2, isDefault: false })
})

test('recordSetupStep with no library: the connection → settings.json setupConnection; another step → no_library; a bad entry → bad_arguments', () => {
  const w = world()
  const s = service(w)
  assert.equal(s.dir(), null, 'control: no library')
  assert.throws(() => s.handlers.recordSetupStep('pack', { by: 'chose', detail: 'x' }), err => err.code === 'no_library')
  for (const bad of [{ by: 'maybe' }, { by: 'chose', when: 1 }, 'chose', null, { by: 'chose', detail: { kind: 'x' } }]) {
    assert.throws(() => s.handlers.recordSetupStep('connection', bad), err => err.code === 'bad_arguments', JSON.stringify(bad))
  }
  assert.equal(readSettings(w.settingsFile).setupConnection, null, 'nothing written yet')
  const r = s.handlers.recordSetupStep('connection', { by: 'chose', detail: 'codex' })
  assert.equal(r.step, 'connection')
  assert.deepEqual(readSettings(w.settingsFile).setupConnection, { by: 'chose', at: r.at, detail: 'codex' })
  s.handlers.recordSetupStep('connection', { by: 'skipped' })
  assert.deepEqual(Object.keys(readSettings(w.settingsFile).setupConnection), ['by', 'at'], 'replaced; no detail when skipped')
})

test('新建库 copies setupConnection into the new library (its time kept); a library with a connection record keeps its own; an existing library is not touched', async () => {
  const w = world()
  const at = '2026-11-01T09:00:00.000Z'
  writeFileSync(w.settingsFile, `${JSON.stringify({ setupConnection: { by: 'chose', at, detail: 'claude-code' } })}\n`)
  const s = service(w)
  const fresh = join(w.root, 'fresh')
  w.dialogAnswers.push(fresh)
  await s.handlers.chooseLibraryFolder()
  await s.handlers.useChosenFolder('')
  assert.deepEqual(readSetup(fresh), { connection: { by: 'chose', at, detail: 'claude-code' } })
  // the next record of that library (the manual flow's folder step) does not replace it
  s.handlers.recordSetupStep('library', { by: 'chose', detail: 'empty' })
  assert.deepEqual(readSetup(fresh).connection, { by: 'chose', at, detail: 'claude-code' })
  // control: with no setupConnection a new library gets no connection record
  const w2 = world()
  const s2 = service(w2)
  const fresh2 = join(w2.root, 'fresh')
  w2.dialogAnswers.push(fresh2)
  await s2.handlers.chooseLibraryFolder()
  await s2.handlers.useChosenFolder('')
  assert.deepEqual(readSetup(fresh2), {})
  // an existing library (opened, not made) keeps the record it has, or none
  const s3 = service(w)
  w.dialogAnswers.push(fresh2)
  await s3.handlers.chooseLibraryFolder()
  await s3.handlers.useChosenFolder('')
  assert.deepEqual(readSetup(fresh2), {}, 'opened, not made: nothing copied')
})
