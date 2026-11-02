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
  const code = files(join(DESKTOP_DIR, 'src'), ['.js', '.mjs', '.cjs']).filter(f => !TEXT_DIRS.some(dir => f.startsWith(dir)))
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
  const ours = files(DESKTOP_DIR, ['.js', '.mjs', '.cjs', '.json', '.css', '.html', '.md'])
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
