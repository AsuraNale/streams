// Every word the page writes itself (src/renderer/texts/, and index.html's title) passes the wording scanner
// with 0 hits and uses full-width punctuation next to Chinese (work order 05 §六 A1-6); no Chinese text is
// written anywhere else in the app's code (so the text tables really are all of it); the text files are
// LF-only and hold no invisible characters.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { CJK, halfWidthPunctuation, stringLiterals } from './support/literals.mjs'

const wording = await import(pathToFileURL(join(REPO_DIR, 'wording', 'src', 'index.mjs')).href)
const RENDERER = join(DESKTOP_DIR, 'src', 'renderer')
const TEXTS = join(RENDERER, 'texts')
// the main process's own words (what the app writes to the agent, the folder name it suggests): the same rules
const MAIN_TEXTS = join(DESKTOP_DIR, 'src', 'main', 'texts')
const TEXT_DIRS = [TEXTS, MAIN_TEXTS]
// redesign R1: the design's template, copied byte for byte (src/renderer/template/manifest.json)
const TEMPLATE = join(RENDERER, 'template')

function files(dir, exts) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.work') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p, exts))
    else if (exts.includes(extname(name))) out.push(p)
  }
  return out
}

function strings(value, path = '', out = []) {
  if (typeof value === 'string') out.push({ path, text: value })
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out)
  return out
}

/** Every string of every text table, by module and key. */
async function textTables() {
  const all = []
  for (const dir of TEXT_DIRS) {
    if (!existsSync(dir)) continue
    for (const file of files(dir, ['.js'])) {
      const mod = await import(pathToFileURL(file).href)
      for (const [name, value] of Object.entries(mod)) all.push(...strings(value, `${relative(DESKTOP_DIR, file)}:${name}`))
    }
  }
  return all
}

const TITLE = /<title>([^<]*)<\/title>/.exec(readFileSync(join(RENDERER, 'index.html'), 'utf8'))?.[1]

// 1.1 acceptance E4 (W7b): the interface files of BOTH languages — the page's (src/renderer/texts, texts-en) and the main
// process's (src/main/texts, texts-en). The wording scanner's own list (V7: Bronze · Silver · Gold · judge · keeper · gate ·
// Medallion · pending · ledger, and the brand words outside 「连接你电脑上的 …」) goes over every value of all of them, and so
// does E4's list: the words the discussions used (状态包, 四档, 交卷, 把关) and v1.0's scoring words no longer used (相关度, 实质;
// in English relevance, substance — whole words, any case). E4's list is also read in each file's text as written (its keys
// and comments included), so a word cannot hide in a key or a note.
const EN_TEXTS = join(RENDERER, 'texts-en')
const MAIN_EN_TEXTS = join(DESKTOP_DIR, 'src', 'main', 'texts-en')
const ALL_TEXT_DIRS = [TEXTS, EN_TEXTS, MAIN_TEXTS, MAIN_EN_TEXTS]
export const E4_WORDS = Object.freeze(['状态包', '四档', '交卷', '把关', '相关度', '实质', 'relevance', 'substance'])
const E4 = new RegExp(E4_WORDS.map(w => (/^[a-z]+$/.test(w) ? `\\b${w}\\b` : w)).join('|'), 'gi')

/** E4's words in a text: [{ word, at }]. */
export function e4Hits(text) {
  return [...String(text).matchAll(E4)].map(m => ({ word: m[0], at: m.index }))
}

/** Every string of every text table of `dirs`, by module and key. */
async function tablesOf(dirs) {
  const all = []
  for (const dir of dirs) {
    assert.ok(existsSync(dir), `control: ${relative(DESKTOP_DIR, dir)} is there`)
    for (const file of files(dir, ['.js'])) {
      const mod = await import(pathToFileURL(file).href)
      for (const [name, value] of Object.entries(mod)) all.push(...strings(value, `${relative(DESKTOP_DIR, file)}:${name}`))
    }
  }
  return all
}

test('E4 · controls: a planted banned word is reported, by the wording scanner and by E4\'s list, in either language', () => {
  // the words E4 bans, as decided (1.1 W7b) — written out here, not read from E4_WORDS, so a word dropped from the list is seen
  const DECIDED = ['状态包', '四档', '交卷', '把关', '相关度', '实质', 'relevance', 'substance']
  for (const w of DECIDED) {
    const planted = /^[a-z]+$/.test(w) ? `the ${w.toUpperCase()} of it` : `这一条的${w}很高`
    assert.equal(e4Hits(planted).length, 1, `${w} planted in ${JSON.stringify(planted)}`)
  }
  assert.deepEqual(e4Hits('relevant, substantial, irrelevance and substances are other words'), [], 'whole English words only')
  assert.deepEqual(e4Hits('这一条在待看里等你'), [])
  // the scanner's own list in an English string, and a brand word outside the allowed sentence
  assert.equal(wording.scanStrings({ a: 'this one is still pending in the ledger' }).ok, false)
  assert.equal(wording.scanStrings({ a: '用 Anthropic 的模型' }).ok, false)
})

test('E4 · every interface text file of both languages: 0 hits of the wording scanner and of E4\'s list', async () => {
  const all = await tablesOf(ALL_TEXT_DIRS)
  const en = all.filter(s => s.path.includes('texts-en'))
  assert.ok(all.length > 2000 && en.length > 1000, `control: ${all.length} strings, ${en.length} of them English`)
  const result = wording.scanStrings(Object.fromEntries(all.map(s => [s.path, s.text])))
  assert.deepEqual(result.hits.map(h => `${h.field}: ${h.text} (${h.label ?? h.rule})`), [])
  assert.deepEqual(all.flatMap(s => e4Hits(s.text).map(h => `${s.path}: ${h.word}`)), [])
  const raw = ALL_TEXT_DIRS.flatMap(dir => files(dir, ['.js'])).flatMap(f => readFileSync(f, 'utf8').split('\n').flatMap((line, i) => e4Hits(line).map(h => `${relative(DESKTOP_DIR, f)}:${i + 1}: ${h.word}`)))
  assert.deepEqual(raw, [])
})

test('the scanner and the punctuation check can fail (controls)', () => {
  assert.equal(wording.scanStrings({ a: '这一条是 Silver，还 pending' }).ok, false, 'a banned term is found')
  assert.equal(wording.scanStrings({ a: '这一条在待看里等你' }).ok, true)
  assert.equal(halfWidthPunctuation('进行中 2 个,已交付 1 个').length, 1)
  assert.deepEqual(halfWidthPunctuation('进行中 2 个，已交付 1 个。'), [])
  assert.deepEqual(stringLiterals("const a = '中文' // 注释\nconst b = `x${y}文`").map(l => l.text.length), [2, 3])
})

test('A1-6 · every word the page writes passes the wording scanner: 0 hits', async () => {
  const all = await textTables()
  assert.ok(all.length > 60, `${all.length} strings in the text tables`)
  assert.ok(TITLE && CJK.test(TITLE), 'index.html has its title')
  const payload = Object.fromEntries([...all.map(s => [s.path, s.text]), ['index.html:title', TITLE]])
  const result = wording.scanStrings(payload)
  assert.deepEqual(result.hits.map(h => `${h.field}: ${h.text} (${h.label ?? h.rule})`), [])
  assert.equal(result.ok, true)
})

test('full-width punctuation next to Chinese in every text table string', async () => {
  const problems = []
  for (const { path, text } of await textTables()) for (const h of halfWidthPunctuation(text)) problems.push(`${path}: ${h.char} in ${JSON.stringify(h.context)}`)
  assert.deepEqual(problems, [])
})

test('no Chinese text in a string anywhere in the app\'s code outside src/renderer/texts/', () => {
  // the text tables (src/renderer/texts/, src/main/texts/) are the only place for words
  // redesign R1: src/renderer/template/ is the design's template copied byte for byte (its icon scripts name their own demo
  // themes in Chinese and are never shown); not the app's code — test/theme.test.mjs holds it to the design's sha256
  const code = files(join(DESKTOP_DIR, 'src'), ['.js', '.mjs', '.cjs']).filter(f => !TEXT_DIRS.some(dir => f.startsWith(dir)) && !f.startsWith(TEMPLATE))
  assert.ok(code.length > 15, `${code.length} files`)
  const found = []
  for (const f of code) for (const lit of stringLiterals(readFileSync(f, 'utf8'))) if (CJK.test(lit.text)) found.push(`${relative(DESKTOP_DIR, f)}:${lit.line} ${JSON.stringify(lit.text)}`)
  assert.deepEqual(found, [])
})

// the code points the repository's hygiene checks list (wording/test/source-hygiene.test.mjs)
const RANGES = [
  [0x00A0, 0x00A0], [0x00AD, 0x00AD], [0x034F, 0x034F], [0x115F, 0x1160], [0x17B4, 0x17B5], [0x180B, 0x180F],
  [0x2000, 0x200F], [0x2028, 0x2029], [0x202F, 0x202F], [0x205F, 0x206F], [0x2800, 0x2800], [0x3000, 0x3000],
  [0x3164, 0x3164], [0xE000, 0xF8FF], [0xFE00, 0xFE0F], [0xFEFF, 0xFEFF], [0xFFA0, 0xFFA0],
]
const invisible = text => [...text].map(ch => ch.codePointAt(0)).filter(cp => (cp < 32 && cp !== 10 && cp !== 9) || RANGES.some(([a, b]) => cp >= a && cp <= b))

test('desktop/, docs/desktop.md and docs/tokens.md: LF line ends only, no invisible or control characters', () => {
  // redesign R1: the template's files keep the design's bytes (some have CR line ends): not checked here (test/theme.test.mjs)
  const ours = files(DESKTOP_DIR, ['.js', '.mjs', '.cjs', '.json', '.css', '.html', '.md']).filter(f => !f.startsWith(TEMPLATE))
  const list = [...ours, join(REPO_DIR, 'docs', 'desktop.md'), join(REPO_DIR, 'docs', 'tokens.md')]
  assert.ok(list.length > 40, `${list.length} files`)
  const problems = []
  for (const f of list) {
    const bytes = readFileSync(f)
    if (bytes.includes(13)) problems.push(`${relative(REPO_DIR, f)}: CR`)
    const bad = invisible(bytes.toString('utf8'))
    if (bad.length) problems.push(`${relative(REPO_DIR, f)}: ${bad.map(cp => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`).join(' ')}`)
  }
  assert.deepEqual(problems, [])
  assert.deepEqual(invisible(`a${String.fromCodePoint(0x200B)}b${String.fromCodePoint(0x3000)}`), [0x200B, 0x3000], 'control: the check sees them')
})
