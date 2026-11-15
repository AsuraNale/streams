// The English text tables (src/renderer/texts-en/, src/main/texts-en/; docs/desktop.md��) against the Chinese ones they
// stand in for, in plain Node: every module has its pair, every export its twin, every key its twin (strings, frozen objects,
// arrays of the same length); no Chinese character except the one glyph built from code points; the same placeholders in
// both languages (a plural token counts by its key) except where the forms differ by design; plain-language English — none
// of our code's identifiers, and none of the words the product bans from its interface (V7). Controls first: a pair made to
// break each check.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'

const RENDERER = join(DESKTOP_DIR, 'src', 'renderer')
const MAIN = join(DESKTOP_DIR, 'src', 'main')

// zh folder → en folder; `skip`: zh modules with no English on purpose (the dev-only gallery)
const PAIRS = [
  { zh: join(RENDERER, 'texts'), en: join(RENDERER, 'texts-en'), skip: ['kit.js'] },
  { zh: join(MAIN, 'texts'), en: join(MAIN, 'texts-en'), skip: [] },
]
// the only Chinese an English table shows: the name of the Chinese language in the chooser
const GLYPHS = ['settings.js:SETTINGS.languages.zh-CN']
// placeholders that differ by design (dates by Intl)
const PLACEHOLDERS_DIFFER = ['common.js:WHEN.date', 'common.js:DAY.date', 'common.js:NEXT_WHEN.date']
// strings that are empty on purpose (the English brand has no tagline: the name is the wordmark)
const BLANK_OK = ['common.js:BRAND.tagline']

const range = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`
const CJK = new RegExp(`[${range(0x3000, 0x303F)}${range(0x3400, 0x9FFF)}${range(0xFF00, 0xFFEF)}]`)
const INVISIBLE = new RegExp(`[${String.fromCodePoint(0x00A0)}${range(0x200B, 0x200F)}${String.fromCodePoint(0xFEFF)}]`)
// the product's banned interface words (V7; wording/banned-terms.json names the same), our identifiers and jargon
const BANNED = /\b(bronze|silver|gold|judge|keeper|gate|medallion|pending|ledger|json|yaml|markdown(?! folder)|uid|hash|prompt|harness|refus(?:e|al|ed))\b/i
const SNAKE = /\b[a-z]+_[a-z0-9_]+\b/
const BRACES = /\{[^}]*\}/g
const TOKEN_OK = /^\{\w+\}$|^\{\w+\?[^|}]*\|[^}]*\}$/
// the set of keys a template names (a plural token repeats the key of the number it bends to: it counts once)
const placeholderKeys = s => [...new Set([...s.matchAll(/\{(\w+)(?:\?[^}]*)?\}/g)].map(m => m[1]))].sort().join(',')

/** Every string of a value, by path. */
function strings(value, path = '', out = []) {
  if (typeof value === 'string') out.push({ path, text: value })
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out)
  return out
}

/** zh and en side by side: the same shape, key for key; the problems found. */
function compare(zh, en, path, problems) {
  if (typeof zh === 'string') { if (typeof en !== 'string') problems.push(`${path}: en is ${typeof en}, zh a string`); return }
  if (Array.isArray(zh)) {
    if (!Array.isArray(en)) problems.push(`${path}: en is not an array`)
    else if (en.length !== zh.length) problems.push(`${path}: ${en.length} items in en, ${zh.length} in zh`)
    else zh.forEach((v, i) => compare(v, en[i], `${path}[${i}]`, problems))
    return
  }
  if (zh && typeof zh === 'object') {
    if (!en || typeof en !== 'object' || Array.isArray(en)) { problems.push(`${path}: en is not an object`); return }
    if (!Object.isFrozen(en)) problems.push(`${path}: en is not frozen`)
    // redesign R6b precheck: the Chinese tables are frozen too (texts/common.js PUNCT was the one export that was not)
    if (!Object.isFrozen(zh)) problems.push(`${path}: zh is not frozen`)
    const zk = Object.keys(zh).sort()
    const ek = Object.keys(en).sort()
    for (const k of zk) if (!ek.includes(k)) problems.push(`${path}.${k}: missing in en`)
    for (const k of ek) if (!zk.includes(k)) problems.push(`${path}.${k}: only in en`)
    for (const k of zk) if (ek.includes(k)) compare(zh[k], en[k], `${path}.${k}`, problems)
  }
}

/** The English strings of one module pair checked: the problems found. `file` names the module for the allow-lists. */
function checkEnglish(file, zhMod, enMod, problems) {
  const zhStrings = Object.fromEntries(strings(zhMod).map(s => [s.path, s.text]))
  for (const { path, text } of strings(enMod)) {
    const where = `${file}:${path}`
    if (text.trim() === '' && !BLANK_OK.includes(where)) problems.push(`${where}: blank`)
    if (CJK.test(text) && !GLYPHS.includes(where)) problems.push(`${where}: Chinese character in ${JSON.stringify(text)}`)
    if (INVISIBLE.test(text)) problems.push(`${where}: invisible character`)
    for (const b of text.match(BRACES) ?? []) if (!TOKEN_OK.test(b)) problems.push(`${where}: bad token ${b}`)
    const zh = zhStrings[path]
    if (typeof zh === 'string' && !PLACEHOLDERS_DIFFER.includes(where) && placeholderKeys(zh) !== placeholderKeys(text)) {
      problems.push(`${where}: placeholders en {${placeholderKeys(text)}} zh {${placeholderKeys(zh)}}`)
    }
    const hit = BANNED.exec(text)
    if (hit) problems.push(`${where}: "${hit[0]}" in ${JSON.stringify(text)}`)
    if (SNAKE.test(text)) problems.push(`${where}: snake_case in ${JSON.stringify(text)}`)
  }
}

async function load(dir, name) {
  return import(pathToFileURL(join(dir, name)).href)
}

test('controls: each check fails on a pair made to break it', () => {
  const zh = Object.freeze({ A: Object.freeze({ title: '标题 {n}', list: Object.freeze(['一', '二']), deep: Object.freeze({ k: '键' }) }) })
  let problems = []
  compare(zh, Object.freeze({ A: Object.freeze({ list: Object.freeze(['one']), deep: { k: 'key', extra: 'x' } }) }), 'A', problems)
  assert.ok(problems.some(p => p.includes('title: missing in en')), problems.join('\n'))
  assert.ok(problems.some(p => p.includes('1 items in en, 2 in zh')), problems.join('\n'))
  assert.ok(problems.some(p => p.includes('extra: only in en')), problems.join('\n'))
  assert.ok(problems.some(p => p.includes('deep: en is not frozen')), problems.join('\n'))
  problems = []
  compare(Object.freeze({ P: { open: '（' } }), Object.freeze({ P: Object.freeze({ open: '(' }) }), 'X', problems)
  assert.ok(problems.some(p => p.includes('X.P: zh is not frozen')), problems.join('\n'))
  problems = []
  compare(zh, Object.freeze({ A: Object.freeze({ title: 'Title {n}', list: Object.freeze(['one', 'two']), deep: Object.freeze({ k: 'key' }) }) }), 'A', problems)
  assert.deepEqual(problems, [], 'a faithful twin passes')
  problems = []
  checkEnglish('x.js', zh, { A: { title: `Title ${String.fromCodePoint(0x6807)}`, list: ['one {n} item{n?|s}', 'the fetch_state file'], deep: { k: 'bad {n?one} token' } } }, problems)
  assert.ok(problems.some(p => p.includes('Chinese character')), problems.join('\n'))
  assert.ok(problems.some(p => p.includes('placeholders en {n} zh {}')), 'a placeholder zh does not have')
  assert.ok(problems.some(p => p.includes('snake_case')), problems.join('\n'))
  assert.ok(problems.some(p => p.includes('bad token {n?one}')), problems.join('\n'))
  problems = []
  checkEnglish('x.js', { A: { t: '{n} 条' } }, { A: { t: '{n} item{n?|s}' } }, problems)
  assert.deepEqual(problems, [], 'a plural token counts by its key')
  // V7: each banned interface word is caught on its own, in any case
  for (const word of ['Bronze', 'silver', 'GOLD', 'judge', 'keeper', 'gate', 'Medallion', 'pending', 'ledger']) {
    problems = []
    checkEnglish('x.js', { A: { t: 'x' } }, { A: { t: `this is ${word} here` } }, problems)
    assert.ok(problems.length === 1 && problems[0].includes(`"${word}"`), `${word}: ${problems.join('\n')}`)
  }
  problems = []
  checkEnglish('x.js', { A: { t: 'x' } }, { A: { t: 'a golden gateway, judged by keepers' } }, problems)
  assert.deepEqual(problems, [], 'only whole words count')
})

test('every Chinese text module has its English twin, with the same exports (the dev-only gallery excepted)', async () => {
  for (const pair of PAIRS) {
    const zhFiles = readdirSync(pair.zh).filter(f => f.endsWith('.js') && !pair.skip.includes(f))
    assert.ok(zhFiles.length > 0, pair.zh)
    const enFiles = readdirSync(pair.en).filter(f => f.endsWith('.js'))
    for (const f of zhFiles) assert.ok(existsSync(join(pair.en, f)), `${f}: no English twin in ${pair.en}`)
    for (const f of enFiles) assert.ok(zhFiles.includes(f), `${f}: an English module with no Chinese original`)
    for (const f of zhFiles) {
      const zh = await load(pair.zh, f)
      const en = await load(pair.en, f)
      assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), `${f}: exports`)
    }
  }
})

test('key parity: every string, frozen object and array of the Chinese tables has its twin in the English ones', async () => {
  const problems = []
  for (const pair of PAIRS) {
    for (const f of readdirSync(pair.zh).filter(f => f.endsWith('.js') && !pair.skip.includes(f))) {
      const zh = await load(pair.zh, f)
      const en = await load(pair.en, f)
      for (const name of Object.keys(zh)) compare(zh[name], en[name], `${f}:${name}`, problems)
    }
  }
  assert.deepEqual(problems, [])
})

test('plain English: no Chinese character (one glyph excepted), no blank, the same placeholders as the Chinese, well-formed tokens, none of the banned words or our identifiers', async () => {
  const problems = []
  let count = 0
  for (const pair of PAIRS) {
    for (const f of readdirSync(pair.zh).filter(f => f.endsWith('.js') && !pair.skip.includes(f))) {
      const zh = await load(pair.zh, f)
      const en = await load(pair.en, f)
      count += strings(en).length
      checkEnglish(f, zh, en, problems)
    }
  }
  assert.ok(count > 60, `${count} English strings`)
  assert.deepEqual(problems, [])
})
