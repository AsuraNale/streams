// The settings file (src/main/settings.mjs), in plain Node: a missing or broken file reads as the defaults; every field is
// checked on its own (a value that is not what it should be is its default, the others stay); a write keeps the other
// fields; a bad value is refused and nothing is written. Controls first: a broken file really does come back as defaults.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECENT_MAX, SETTINGS_SCHEMA, defaultConnections, normalizeConnections, normalizeRecent, normalizeSchedule, readSettings, withRecent, writeSettings } from '../src/main/settings.mjs'
import { DEFAULT_THEME } from '../src/main/theme.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const made = []
const folder = () => { const dir = tempDir('st-settings-'); made.push(dir); return dir }
after(() => { for (const dir of made) removeTree(dir, { waitMs: 3000 }) })
const onDisk = file => JSON.parse(readFileSync(file, 'utf8'))
const DEFAULTS = () => ({ language: 'auto', libraryPath: null, recentLibraries: [], connections: defaultConnections(), showDeveloperInfo: false, schedule: { enabled: true, time: '08:30' }, theme: DEFAULT_THEME, libraryRoot: null })

test('no file, a broken file, a file of another shape: the defaults', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const defaults = DEFAULTS()
  assert.deepEqual(readSettings(file), defaults, 'no file yet')
  writeFileSync(file, '{ not json')
  assert.deepEqual(readSettings(file), defaults, 'broken JSON')
  writeFileSync(file, '[1, 2]')
  assert.deepEqual(readSettings(file), defaults, 'not an object')
  writeFileSync(file, `${JSON.stringify({ language: 'de', libraryPath: 'relative\\lib', recentLibraries: 'C:\\lib', connections: 'claude-code', showDeveloperInfo: 'yes', schedule: 'daily', theme: 'blue', libraryRoot: 'relative\\libs' })}\n`)
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

test('schedule: default on at 08:30; each field checked on its own; a write takes { enabled, time } with 00:00–23:59 only', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  assert.deepEqual(readSettings(file).schedule, { enabled: true, time: '08:30' }, 'no file: on, 08:30')
  writeFileSync(file, `${JSON.stringify({ schedule: { enabled: false, time: '21:15' } })}\n`)
  assert.deepEqual(readSettings(file).schedule, { enabled: false, time: '21:15' }, 'control: a good schedule is read as it is')
  writeFileSync(file, `${JSON.stringify({ schedule: { enabled: false, time: '25:00' } })}\n`)
  assert.deepEqual(readSettings(file).schedule, { enabled: false, time: '08:30' }, 'a bad time is the default time; the good switch stays')
  writeFileSync(file, `${JSON.stringify({ schedule: { enabled: 'no', time: '07:05' } })}\n`)
  assert.deepEqual(readSettings(file).schedule, { enabled: true, time: '07:05' }, 'a bad switch is the default switch; the good time stays')
  for (const raw of [null, [], 'x', { time: '7:05' }, { enabled: 1, time: '24:00' }]) assert.deepEqual(normalizeSchedule(raw), { enabled: true, time: '08:30' }, JSON.stringify(raw))
  // a write
  writeSettings(file, { language: 'en' })
  assert.deepEqual(writeSettings(file, { schedule: { enabled: false, time: '23:59' } }).schedule, { enabled: false, time: '23:59' })
  assert.deepEqual(onDisk(file).schedule, { enabled: false, time: '23:59' })
  assert.equal(readSettings(file).language, 'en', 'the other fields stay')
  const before = readFileSync(file, 'utf8')
  for (const bad of [{ enabled: true, time: '25:00' }, { enabled: true, time: '24:00' }, { enabled: true, time: '8:30' }, { enabled: 'yes', time: '08:30' }, { enabled: true }, { enabled: true, time: '08:30', extra: 1 }, null]) {
    assert.throws(() => writeSettings(file, { schedule: bad }), TypeError, JSON.stringify(bad))
  }
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused write changes nothing on disk')
  writeSettings(file, { schedule: { enabled: true, time: '00:00' } })
  assert.deepEqual(readSettings(file).schedule, { enabled: true, time: '00:00' }, '00:00 is a time')
})

test('theme: one of river · paper · night; anything else reads as DEFAULT_THEME; a write takes an id only', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  assert.equal(DEFAULT_THEME, 'river', 'the default until the maintainer picks one (plan 5.6 D5)')
  assert.equal(readSettings(file).theme, DEFAULT_THEME, 'no file: the default')
  writeFileSync(file, `${JSON.stringify({ theme: 'night' })}
`)
  assert.equal(readSettings(file).theme, 'night', 'control: a good theme is read as it is')
  for (const bad of ['Night', 'dark', '', 7, null, ['paper'], { id: 'paper' }]) {
    writeFileSync(file, `${JSON.stringify({ theme: bad })}
`)
    assert.equal(readSettings(file).theme, DEFAULT_THEME, JSON.stringify(bad))
  }
  writeSettings(file, { language: 'en' })
  assert.equal(writeSettings(file, { theme: 'paper' }).theme, 'paper')
  assert.equal(onDisk(file).theme, 'paper')
  assert.equal(readSettings(file).language, 'en', 'the other fields stay')
  const before = readFileSync(file, 'utf8')
  for (const bad of ['blue', 'Paper', '', null, undefined]) assert.throws(() => writeSettings(file, { theme: bad }), TypeError, String(bad))
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused write changes nothing on disk')
})

test('libraryRoot (v2 package B): null by default; an absolute path is kept; a relative one reads as null and is refused on write', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  assert.equal(readSettings(file).libraryRoot, null)
  const root = join(dir, 'libs')
  assert.equal(writeSettings(file, { libraryRoot: root }).libraryRoot, root)
  assert.equal(readSettings(file).libraryRoot, root)
  const before = readFileSync(file, 'utf8')
  assert.throws(() => writeSettings(file, { libraryRoot: 'libs' }), TypeError)
  assert.equal(readFileSync(file, 'utf8'), before, 'nothing written')
  writeFileSync(file, `${JSON.stringify({ libraryRoot: 'libs' })}\n`)
  assert.equal(readSettings(file).libraryRoot, null)
  assert.equal(writeSettings(file, { libraryRoot: null }).libraryRoot, null)
})
