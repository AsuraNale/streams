// The settings file (src/main/settings.mjs), in plain Node: a missing or broken file reads as the defaults; every field is
// checked on its own (a value that is not what it should be is its default, the others stay); a write keeps the other
// fields; a bad value is refused and nothing is written. Controls first: a broken file really does come back as defaults.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECENT_MAX, SETTINGS_SCHEMA, defaultConnections, normalizeConnections, normalizeRecent, normalizeSchedule, readSettings, withRecent, writeSettings } from '../src/main/settings.mjs'
import { DEFAULT_APPEARANCE, DEFAULT_THEME } from '../src/main/theme.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const made = []
const folder = () => { const dir = tempDir('st-settings-'); made.push(dir); return dir }
after(() => { for (const dir of made) removeTree(dir, { waitMs: 3000 }) })
const onDisk = file => JSON.parse(readFileSync(file, 'utf8'))
// v2 package I: settings.json has one more field, setupConnection (首次打开's connection step while there is no library)
// v2 package L: and the right panel's state, panel { open, tab } (default open, 详情) — the reason this list changed
const DEFAULTS = () => ({ language: 'auto', libraryPath: null, recentLibraries: [], connections: defaultConnections(), showDeveloperInfo: false, schedule: { enabled: true, time: '08:30' }, theme: DEFAULT_THEME, appearance: DEFAULT_APPEARANCE, libraryRoot: null, setupConnection: null, panel: { open: true, tab: 'detail' } })

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

// v2 package K2: the theme and the appearance a field of its own; older ids migrated when read (theme.mjs migrateLook).
// Redesign R1 (the R1 contract): four themes, the default research — this test's default and its list changed for it.
test('theme and appearance: precision · glass · research · monoline and light · dark · system; anything else reads as the defaults; a write takes those only', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  assert.equal(DEFAULT_THEME, 'research', '维护者 11-11: 研究对话')
  writeFileSync(file, `${JSON.stringify({ theme: 'monoline', appearance: 'dark' })}\n`)
  assert.deepEqual([readSettings(file).theme, readSettings(file).appearance], ['monoline', 'dark'], 'control: the fourth theme is read as it is')
  rmSync(file)
  assert.equal(DEFAULT_APPEARANCE, 'system', '维护者 11-10: 跟随系统')
  assert.deepEqual([readSettings(file).theme, readSettings(file).appearance], [DEFAULT_THEME, DEFAULT_APPEARANCE], 'no file: the defaults')
  writeFileSync(file, `${JSON.stringify({ theme: 'research', appearance: 'dark' })}\n`)
  assert.deepEqual([readSettings(file).theme, readSettings(file).appearance], ['research', 'dark'], 'control: good values are read as they are')
  for (const bad of ['Glass', 'dark', '', 7, null, ['glass'], { id: 'glass' }]) {
    writeFileSync(file, `${JSON.stringify({ theme: bad, appearance: 'light' })}\n`)
    assert.equal(readSettings(file).theme, DEFAULT_THEME, JSON.stringify(bad))
  }
  for (const bad of ['Dark', 'auto', '', 7, null]) {
    writeFileSync(file, `${JSON.stringify({ theme: 'glass', appearance: bad })}\n`)
    assert.deepEqual([readSettings(file).theme, readSettings(file).appearance], ['glass', DEFAULT_APPEARANCE], JSON.stringify(bad))
  }
  writeSettings(file, { language: 'en' })
  assert.equal(writeSettings(file, { theme: 'glass' }).theme, 'glass')
  assert.equal(writeSettings(file, { appearance: 'light' }).appearance, 'light')
  assert.deepEqual([onDisk(file).theme, onDisk(file).appearance], ['glass', 'light'])
  assert.equal(readSettings(file).language, 'en', 'the other fields stay')
  const before = readFileSync(file, 'utf8')
  for (const bad of ['blue', 'river', 'night', 'Glass', '', null, undefined]) assert.throws(() => writeSettings(file, { theme: bad }), TypeError, String(bad))
  for (const bad of ['Dark', 'auto', '', null, undefined]) assert.throws(() => writeSettings(file, { appearance: bad }), TypeError, String(bad))
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused write changes nothing on disk')
})

// v2 package K2: a v1.0 settings.json with every other field set — reading it changes only the theme and the appearance (the maintainer's
// table, redesign R1: none / river / other → research + system, paper → research + light, night → research + dark); the next write stores
// the two new fields and keeps the rest. Controls: night is told apart from paper and from river; a mutant mapping night to light
// would fail the night row.
test('v1.0\'s theme migrated when read: only theme and appearance change, every other field is as it was', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  const lib = join(dir, 'lib')
  const other = {
    language: 'en', libraryPath: lib, recentLibraries: [lib], showDeveloperInfo: true, schedule: { enabled: false, time: '21:15' }, libraryRoot: join(dir, 'libs'),
    connections: { active: 'codex', 'claude-code': { model: 'opus', verifyModel: null }, codex: { model: null, verifyModel: 'mini' }, api: { vendor: 'deepseek', baseUrl: null, model: null, verifyModel: null } },
    setupConnection: { by: 'chose', at: '2026-11-03T10:00:00.000Z', detail: 'codex' },
    // v2 package L: the right panel's state is one more field, kept as written like the others (why this list changed)
    panel: { open: false, tab: 'files' },
  }
  // redesign R1: what they become is research (was precision); precision and monoline, ids of now, are kept
  const rows = [[undefined, 'research', 'system'], ['river', 'research', 'system'], ['paper', 'research', 'light'], ['night', 'research', 'dark'], ['sepia', 'research', 'system'], ['precision', 'precision', 'system'], ['monoline', 'monoline', 'system']]
  const seen = {}
  for (const [old, theme, appearance] of rows) {
    const raw = old === undefined ? { schema: 'streams.settings/1', ...other } : { schema: 'streams.settings/1', ...other, theme: old }
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`)
    const s = readSettings(file)
    const { theme: t, appearance: a, ...rest } = s
    assert.deepEqual([t, a], [theme, appearance], String(old))
    assert.deepEqual(rest, other, `${String(old)}: every other field as written`)
    seen[String(old)] = a
    // the next write (any field) stores the migrated two and keeps the rest
    writeSettings(file, { showDeveloperInfo: true })
    const disk = onDisk(file)
    assert.deepEqual([disk.theme, disk.appearance], [theme, appearance], `${String(old)}: on disk after a write`)
    assert.equal(disk.language, 'en')
    assert.deepEqual(disk.connections, other.connections)
  }
  assert.equal(new Set([seen.night, seen.paper, seen.river]).size, 3, 'control: night, paper and river come out three different ways')
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

test('setupConnection (v2 package I, 首次打开 before any library): null by default; { by, at, detail? } kept; anything else reads as null and is refused on write', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  assert.equal(readSettings(file).setupConnection, null)
  const rec = { by: 'chose', at: '2026-11-09T18:00:00.000Z', detail: 'claude-code' }
  assert.deepEqual(writeSettings(file, { setupConnection: rec }).setupConnection, rec)
  assert.deepEqual(readSettings(file).setupConnection, rec)
  assert.deepEqual(writeSettings(file, { setupConnection: { by: 'skipped', at: rec.at } }).setupConnection, { by: 'skipped', at: rec.at })
  const before = readFileSync(file, 'utf8')
  for (const bad of [{ by: 'maybe', at: rec.at }, { by: 'chose' }, { by: 'chose', at: 'yesterday' }, { ...rec, extra: 1 }, { ...rec, detail: 3 }, 'chose']) {
    assert.throws(() => writeSettings(file, { setupConnection: bad }), TypeError, JSON.stringify(bad))
  }
  assert.equal(readFileSync(file, 'utf8'), before, 'nothing written')
  writeFileSync(file, `${JSON.stringify({ setupConnection: { by: 'maybe', at: rec.at } })}\n`)
  assert.equal(readSettings(file).setupConnection, null)
  assert.equal(writeSettings(file, { setupConnection: null }).setupConnection, null)
})

// v2 package L: the right panel's state (folded or open, its tab) — kept in settings.json so the next start opens it the same way.
// Controls first: each bad value reads as its default; a write of one field keeps the other; a bad patch writes nothing.
test('panel: { open, tab } read field by field, written by patch, a bad one refused', () => {
  const dir = folder()
  const file = join(dir, 'settings.json')
  assert.deepEqual(readSettings(file).panel, { open: true, tab: 'detail' }, 'no file: open, 详情')
  writeFileSync(file, JSON.stringify({ panel: { open: 'no', tab: 'logs' } }))
  assert.deepEqual(readSettings(file).panel, { open: true, tab: 'detail' }, 'both fields bad: both their defaults')
  writeFileSync(file, JSON.stringify({ panel: { open: false, tab: 'logs' } }))
  assert.deepEqual(readSettings(file).panel, { open: false, tab: 'detail' }, 'one bad field: only that one is its default')
  writeSettings(file, { panel: { tab: 'files' } })
  assert.deepEqual(onDisk(file).panel, { open: false, tab: 'files' }, 'the tab changed, open stayed folded')
  writeSettings(file, { panel: { open: true } })
  assert.deepEqual(readSettings(file).panel, { open: true, tab: 'files' }, 'unfolded, the tab stayed')
  for (const bad of [{}, { open: 1 }, { tab: 'ledger' }, { open: true, extra: 1 }, null, 'open']) {
    const before = readFileSync(file, 'utf8')
    assert.throws(() => writeSettings(file, { panel: bad }), TypeError, JSON.stringify(bad))
    assert.equal(readFileSync(file, 'utf8'), before, 'nothing written for ' + JSON.stringify(bad))
  }
})
