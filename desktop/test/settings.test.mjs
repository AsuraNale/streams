// The settings file (src/main/settings.mjs), in plain Node: a missing or broken file reads as the defaults; every field is
// checked on its own (a value that is not what it should be is its default, the others stay); a write keeps the other
// fields; a bad value is refused and nothing is written. Controls first: a broken file really does come back as defaults.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECENT_MAX, SETTINGS_SCHEMA, defaultConnections, normalizeConnections, normalizeRecent, readSettings, withRecent, writeSettings } from '../src/main/settings.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const made = []
const folder = () => { const dir = tempDir('st-settings-'); made.push(dir); return dir }
after(() => { for (const dir of made) removeTree(dir, { waitMs: 3000 }) })
const onDisk = file => JSON.parse(readFileSync(file, 'utf8'))
const DEFAULTS = () => ({ language: 'auto', libraryPath: null, recentLibraries: [], connections: defaultConnections(), showDeveloperInfo: false })

test('no file, a broken file, a file of another shape: the defaults', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const defaults = DEFAULTS()
  assert.deepEqual(readSettings(file), defaults, 'no file yet')
  writeFileSync(file, '{ not json')
  assert.deepEqual(readSettings(file), defaults, 'broken JSON')
  writeFileSync(file, '[1, 2]')
  assert.deepEqual(readSettings(file), defaults, 'not an object')
  writeFileSync(file, `${JSON.stringify({ language: 'de', libraryPath: 'relative\\lib', recentLibraries: 'C:\\lib', connections: 'claude-code', showDeveloperInfo: 'yes' })}\n`)
  assert.deepEqual(readSettings(file), defaults, 'every field of the wrong kind reads as its default')
})

test('recentLibraries: absolute paths only, no repeats, most recent first, at most RECENT_MAX', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const a = join(dir, 'a')
  const b = join(dir, 'b')
  writeFileSync(file, `${JSON.stringify({ recentLibraries: [a, 'relative', 7, null, b, a.toUpperCase(), b] })}\n`)
  assert.deepEqual(readSettings(file).recentLibraries, [a, b], 'bad entries and repeats (letter case aside) are dropped, order kept')
  assert.equal(RECENT_MAX, 8)
  const many = Array.from({ length: 12 }, (_, i) => join(dir, `lib${i}`))
  assert.deepEqual(normalizeRecent(many), many.slice(0, 8))
  assert.deepEqual(normalizeRecent('nope'), [])
  assert.deepEqual(withRecent([a, b], b), [b, a], 'moved to the front')
  assert.deepEqual(withRecent(many.slice(0, 8), join(dir, 'new')), [join(dir, 'new'), ...many.slice(0, 7)], 'the oldest falls off')
  // a write
  writeSettings(file, { recentLibraries: [b, a] })
  assert.deepEqual(readSettings(file).recentLibraries, [b, a])
  const before = readFileSync(file, 'utf8')
  assert.throws(() => writeSettings(file, { recentLibraries: [a, 'relative\\x'] }), TypeError)
  assert.throws(() => writeSettings(file, { recentLibraries: a }), TypeError)
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused write changes nothing on disk')
})

test('connections: each field checked on its own; a bad field is its default and the good ones stay; no key anywhere', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const good = { active: 'codex', 'claude-code': { model: 'claude-opus-5-5', verifyModel: null }, codex: { model: null, verifyModel: 'gpt-6-luna' }, api: { vendor: 'custom', baseUrl: 'https://llm.example/v1', model: 'm', verifyModel: 'v' } }
  assert.deepEqual(normalizeConnections(good), good, 'a good object normalizes to itself')
  assert.deepEqual(normalizeConnections(undefined), defaultConnections())
  assert.deepEqual(normalizeConnections([]), defaultConnections())
  const bad = normalizeConnections({ active: 'ollama', 'claude-code': { model: '', verifyModel: 7 }, codex: 'x', api: { vendor: 'nope', baseUrl: 'ftp://x', model: ' m ', verifyModel: null, key: 'sk-should-never-be-here' } })
  assert.deepEqual(bad, { active: null, 'claude-code': { model: null, verifyModel: null }, codex: { model: null, verifyModel: null }, api: { vendor: 'anthropic', baseUrl: null, model: 'm', verifyModel: null } })
  assert.equal(JSON.stringify(bad).includes('sk-'), false, 'an extra key field is dropped, never kept')
  // a baseUrl survives only as an http(s) address, whatever the vendor says (the vendor rule is the service's)
  assert.equal(normalizeConnections({ api: { vendor: 'openai', baseUrl: 'http://127.0.0.1:8080/v1' } }).api.baseUrl, 'http://127.0.0.1:8080/v1')
  // on disk
  writeFileSync(file, `${JSON.stringify({ connections: { active: 'api', api: { vendor: 'deepseek' } } })}\n`)
  assert.deepEqual(readSettings(file).connections, { ...defaultConnections(), active: 'api', api: { ...defaultConnections().api, vendor: 'deepseek' } })
  // a write takes a complete, valid object only
  assert.deepEqual(writeSettings(file, { connections: good }).connections, good)
  assert.deepEqual(onDisk(file).connections, good)
  const before = readFileSync(file, 'utf8')
  assert.throws(() => writeSettings(file, { connections: { ...good, active: 'ollama' } }), TypeError)
  assert.throws(() => writeSettings(file, { connections: { ...good, api: { ...good.api, key: 'sk-x' } } }), TypeError, 'a key field is refused, not silently dropped')
  assert.throws(() => writeSettings(file, { connections: { active: 'codex' } }), TypeError, 'an incomplete object is refused')
  assert.throws(() => writeSettings(file, { connections: null }), TypeError)
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused write changes nothing on disk')
})

test('a write keeps the other fields and the schema; a bad value is refused and nothing is written', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const library = join(dir, 'library')
  assert.deepEqual(writeSettings(file, { libraryPath: library }), { ...DEFAULTS(), libraryPath: library })
  assert.equal(onDisk(file).schema, SETTINGS_SCHEMA)
  assert.equal(SETTINGS_SCHEMA, 'streams.settings/1')
  writeSettings(file, { language: 'en' })
  assert.deepEqual(readSettings(file), { ...DEFAULTS(), language: 'en', libraryPath: library }, 'the library stayed')
  writeSettings(file, { showDeveloperInfo: true })
  assert.deepEqual(readSettings(file), { ...DEFAULTS(), language: 'en', libraryPath: library, showDeveloperInfo: true })
  writeSettings(file, { libraryPath: null })
  assert.equal(readSettings(file).libraryPath, null, 'the library closed')
  const before = readFileSync(file, 'utf8')
  assert.throws(() => writeSettings(file, { language: 'fr' }), TypeError)
  assert.throws(() => writeSettings(file, { libraryPath: 'not\\absolute' }), TypeError)
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused write changes nothing on disk')
  assert.equal(existsSync(`${file}.${process.pid}.tmp`), false, 'no temporary file left behind')
})
