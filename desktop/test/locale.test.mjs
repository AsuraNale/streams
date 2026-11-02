// The language of the app's own words (src/main/locale.mjs; docs/desktop.md��), in plain Node: which tags count as
// Chinese; `auto` against the system's languages (the maintainer's machine lists English and Chinese: Chinese wins); a setting that
// names a language wins over the system; the state writes the setting, says when the page must load itself again, and the
// field survives the other settings' writes; the diagnostics carry the language line.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LANGUAGE, LANGUAGE_SETTINGS, LOCALES, createLocaleState, localeOfTag, resolveLocale } from '../src/main/locale.mjs'
import { readSettings, writeSettings } from '../src/main/settings.mjs'
import { diagnosticsText } from '../src/main/diagnostics.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const made = []
const folder = () => { const dir = tempDir('st-locale-'); made.push(dir); return dir }
after(() => { for (const dir of made) removeTree(dir, { waitMs: 3000 }) })

test('the tables: three settings, two locales, auto by default', () => {
  assert.deepEqual([...LANGUAGE_SETTINGS], ['auto', 'zh-CN', 'en'])
  assert.deepEqual([...LOCALES], ['zh-CN', 'en'])
  assert.equal(DEFAULT_LANGUAGE, 'auto')
})

test('localeOfTag: any Chinese tag is zh-CN, whatever its region, script, separator or case; everything else is en', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans-CN', 'zh-TW', 'zh_HK', 'ZH-cn', ' zh-SG ', 'zh-Hant']) assert.equal(localeOfTag(tag), 'zh-CN', tag)
  for (const tag of ['en', 'en-US', 'en-GB', 'fr', 'ja', 'de-DE', 'zho', 'zhx', 'z', '', null, undefined, 7]) assert.equal(localeOfTag(tag), 'en', String(tag))
})

test('resolveLocale: auto follows the system (Chinese anywhere in the list wins), the fallback only when the list is empty; a named language wins over the system', () => {
  assert.equal(resolveLocale('auto', { preferred: ['en-US', 'zh-Hans-CN'] }), 'zh-CN', 'the display languages hold both: Chinese')
  assert.equal(resolveLocale('auto', { preferred: ['zh-CN', 'en-US'] }), 'zh-CN')
  assert.equal(resolveLocale('auto', { preferred: ['en-US'] }), 'en')
  assert.equal(resolveLocale('auto', { preferred: ['fr', 'de'] }), 'en')
  assert.equal(resolveLocale('auto', { preferred: [], fallback: 'zh-CN' }), 'zh-CN')
  assert.equal(resolveLocale('auto', { preferred: [], fallback: 'en-GB' }), 'en')
  assert.equal(resolveLocale('auto', { preferred: ['en-US'], fallback: 'zh-CN' }), 'en', 'the fallback does not count while the list has a tag')
  assert.equal(resolveLocale('auto', { preferred: ['', '  ', null], fallback: 'zh-TW' }), 'zh-CN', 'empty tags do not count as a list')
  assert.equal(resolveLocale('auto'), 'en', 'no tag at all')
  assert.equal(resolveLocale('auto', { preferred: 'zh-CN' }), 'en', 'not a list: nothing known')
  assert.equal(resolveLocale('en', { preferred: ['zh-CN'] }), 'en')
  assert.equal(resolveLocale('zh-CN', { preferred: ['en-US'] }), 'zh-CN')
  for (const garbage of ['fr', 'ZH-CN', 'EN', '', null, undefined, 0, {}]) assert.equal(resolveLocale(garbage, { preferred: ['zh-CN'] }), 'zh-CN', `${String(garbage)} counts as auto`)
})

test('createLocaleState: resolves from the settings file, writes the setting, says when the resolved language changed; the field survives other writes; a broken value reads as auto', () => {
  const dir = folder()
  const settingsFile = join(dir, 'settings.json')
  let system = { preferred: ['en-US', 'zh-Hans-CN'], fallback: 'zh-CN' }
  const lines = []
  const state = createLocaleState({ settingsFile, readSettings, writeSettings, systemLanguages: () => system, log: l => lines.push(l) })
  assert.deepEqual(state.current(), { setting: 'auto', resolved: 'zh-CN' }, 'no settings file yet: auto, and the system has Chinese')
  assert.deepEqual(state.set('en'), { setting: 'en', resolved: 'en', changed: true })
  assert.equal(readSettings(settingsFile).language, 'en')
  assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8')).language, 'en', 'written to the file as it is')
  assert.deepEqual(state.set('en'), { setting: 'en', resolved: 'en', changed: false }, 'the same again: nothing changed')
  // the other settings' writes rebuild the file from what is read: the language stays
  writeSettings(settingsFile, { showDeveloperInfo: true })
  assert.deepEqual([readSettings(settingsFile).language, readSettings(settingsFile).showDeveloperInfo], ['en', true])
  assert.deepEqual(state.current(), { setting: 'en', resolved: 'en' })
  // back to auto: the system decides again (Chinese here), so the page changes
  assert.deepEqual(state.set('auto'), { setting: 'auto', resolved: 'zh-CN', changed: true })
  // the system's languages are asked on every resolve: an English-only system under auto is English
  system = { preferred: ['en-US'], fallback: 'en-US' }
  assert.deepEqual(state.set('auto'), { setting: 'auto', resolved: 'en', changed: true })
  assert.deepEqual(state.set('zh-CN'), { setting: 'zh-CN', resolved: 'zh-CN', changed: true })
  assert.throws(() => state.set('fr'), TypeError, 'an unknown value is refused, nothing written')
  assert.equal(readSettings(settingsFile).language, 'zh-CN')
  // a value in the file that is not one of the three reads as auto
  writeFileSync(settingsFile, `${JSON.stringify({ schema: 'streams.settings/1', language: 'de' })}\n`)
  assert.equal(readSettings(settingsFile).language, 'auto')
  writeFileSync(settingsFile, `${JSON.stringify({ schema: 'streams.settings/1', language: 7 })}\n`)
  assert.equal(readSettings(settingsFile).language, 'auto')
  assert.ok(lines.length >= 5 && lines.every(l => /^language: (auto|zh-CN|en) -> (zh-CN|en) \(system: /.test(l)), lines.join('\n'))
})

test('the diagnostics carry the language line (the setting and what it came to)', () => {
  const dir = folder()
  mkdirSync(join(dir, 'logs'), { recursive: true })
  const make = (language, locale) => diagnosticsText({
    versions: { app: '1.0.0', electron: '44', chrome: '1', node: '24', os: 'win32' },
    layout: { logsDir: join(dir, 'logs'), appData: dir, localData: join(dir, 'local') },
    settings: { libraryPath: null, showDeveloperInfo: false, language }, keysHeld: [], locale,
  })
  assert.match(make('en', { setting: 'en', resolved: 'en' }), /^language: en \(en\)$/m)
  assert.match(make('auto', { setting: 'auto', resolved: 'zh-CN' }), /^language: auto \(zh-CN\)$/m)
  // control: the first line and the keys line
  assert.match(make('auto', { setting: 'auto', resolved: 'zh-CN' }), /^Streams diagnostics/)
  assert.match(make('auto', { setting: 'auto', resolved: 'zh-CN' }), /keys stored: none/)
})
