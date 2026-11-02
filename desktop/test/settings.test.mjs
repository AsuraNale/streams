// The settings file (src/main/settings.mjs), in plain Node: a missing or broken file reads as the defaults; every field is
// checked on its own (a value that is not what it should be is its default, the others stay); a write keeps the other
// fields; a bad value is refused and nothing is written. Controls first: a broken file really does come back as defaults.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETTINGS_SCHEMA, readSettings, writeSettings } from '../src/main/settings.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const made = []
const folder = () => { const dir = tempDir('st-settings-'); made.push(dir); return dir }
after(() => { for (const dir of made) removeTree(dir, { waitMs: 3000 }) })
const onDisk = file => JSON.parse(readFileSync(file, 'utf8'))

test('no file, a broken file, a file of another shape: the defaults', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const defaults = { language: 'auto', libraryPath: null, showDeveloperInfo: false }
  assert.deepEqual(readSettings(file), defaults, 'no file yet')
  writeFileSync(file, '{ not json')
  assert.deepEqual(readSettings(file), defaults, 'broken JSON')
  writeFileSync(file, '[1, 2]')
  assert.deepEqual(readSettings(file), defaults, 'not an object')
  writeFileSync(file, `${JSON.stringify({ language: 'de', libraryPath: 'relative\\lib', showDeveloperInfo: 'yes' })}\n`)
  assert.deepEqual(readSettings(file), defaults, 'every field of the wrong kind reads as its default')
})

test('a write keeps the other fields and the schema; a bad value is refused and nothing is written', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const library = join(dir, 'library')
  assert.deepEqual(writeSettings(file, { libraryPath: library }), { language: 'auto', libraryPath: library, showDeveloperInfo: false })
  assert.equal(onDisk(file).schema, SETTINGS_SCHEMA)
  assert.equal(SETTINGS_SCHEMA, 'streams.settings/1')
  writeSettings(file, { language: 'en' })
  assert.deepEqual(readSettings(file), { language: 'en', libraryPath: library, showDeveloperInfo: false }, 'the library stayed')
  writeSettings(file, { showDeveloperInfo: true })
  assert.deepEqual(readSettings(file), { language: 'en', libraryPath: library, showDeveloperInfo: true })
  writeSettings(file, { libraryPath: null })
  assert.equal(readSettings(file).libraryPath, null, 'the library closed')
  const before = readFileSync(file, 'utf8')
  assert.throws(() => writeSettings(file, { language: 'fr' }), TypeError)
  assert.throws(() => writeSettings(file, { libraryPath: 'not\\absolute' }), TypeError)
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused write changes nothing on disk')
  assert.equal(existsSync(`${file}.${process.pid}.tmp`), false, 'no temporary file left behind')
})
