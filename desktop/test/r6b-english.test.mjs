// Redesign R6b-3 (docs/checks/2026-11-13-r6b/contract.md): the English of the interface, checked without a window.
//   1. the English word list (wording/glossary.json `english`, the same list docs/wording.md prints) holds over the two
//      dictionaries: the keys it names carry its words letter for letter, a Chinese string with one of its words has the
//      English word for it (核验 → verif…, never check; 收藏 → keep, never save; 放弃 → discard; …), and none of the old
//      English words is left (To read, let go, round for a run, Sources & brief, inbox in lower case, Checks for the
//      verification record, …) — the five keys that speak of a verification round excepted, by the list's own white list;
//   2. the same over the English words the core hands the main agent and writes into the conversation (agent/words.mjs);
//   3. the eleven descriptions of the built-in rules (core verify/checklist.mjs) have an English form with nothing Chinese in
//      it, worked out from an item's id and rule, and the Chinese form the pipeline runs with is what it always was;
//   4. no full-width punctuation mark is written in the app's own code outside the text tables (the screens take theirs
//      from texts/common.js PUNCT, whose English table has the half-width ones).
// Each check is run on a broken input too (a word put back, a mark put back). The real windows are ui-english-screens.test.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { stringLiterals } from './support/literals.mjs'
import * as WORDS from '../../core/src/agent/words.mjs'
import { BASELINE_LANGUAGES, baselineDescription, describeChecklist, gateBaseline, summaryBaseline } from '../../core/src/verify/checklist.mjs'
import { PUNCT } from '../src/renderer/texts/common.js'
import { PUNCT as PUNCT_EN } from '../src/renderer/texts-en/common.js'

const wording = await import(pathToFileURL(join(REPO_DIR, 'wording', 'src', 'index.mjs')).href)
const SRC = join(DESKTOP_DIR, 'src')
const TABLES = [
  { zh: join(SRC, 'renderer', 'texts'), en: join(SRC, 'renderer', 'texts-en'), prefix: '', skip: ['kit.js'] },
  { zh: join(SRC, 'main', 'texts'), en: join(SRC, 'main', 'texts-en'), prefix: 'main/', skip: [] },
]
const range = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`
/** Chinese characters and full-width punctuation (the same ranges as texts-en.test.mjs). */
const WIDE = new RegExp(`[${range(0x3000, 0x303F)}${range(0x3400, 0x9FFF)}${range(0xFF00, 0xFFEF)}]`)
/** Full-width punctuation alone. */
const WIDE_MARK = new RegExp(`[${range(0x3000, 0x303F)}${range(0xFF00, 0xFFEF)}]`)

function flatten(value, path, out) {
  if (typeof value === 'string') out.set(path, value)
  else if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, `${path}.${k}`, out)
}
/** Every pair of the two dictionaries: [{ key, zh, en }] (the dev-only gallery left out, as in texts-en.test.mjs). */
async function pairs() {
  const out = []
  for (const t of TABLES) {
    for (const name of readdirSync(t.zh).filter(n => n.endsWith('.js') && !t.skip.includes(n)).sort()) {
      const zh = new Map()
      const en = new Map()
      for (const [exp, v] of Object.entries(await import(pathToFileURL(join(t.zh, name)).href))) flatten(v, `${t.prefix}${name}:${exp}`, zh)
      for (const [exp, v] of Object.entries(await import(pathToFileURL(join(t.en, name)).href))) flatten(v, `${t.prefix}${name}:${exp}`, en)
      for (const [key, text] of zh) out.push({ key, zh: text, en: en.get(key) ?? '' })
    }
  }
  return out
}

test('R6b-3 the English word list holds over the two dictionaries: its words on the keys it names, its word wherever the Chinese has the term, none of the old English words', async () => {
  const all = await pairs()
  assert.ok(all.length > 1300, `control: the tables were read (${all.length} pairs)`)
  assert.ok(all.some(p => p.key.startsWith('main/')), 'control: the main process\'s tables too')
  assert.deepEqual(wording.englishShapeProblems(), [])
  assert.deepEqual(wording.englishProblems(all), [])

  // reverse: one old word put back in a copy of the pairs, each on the key it used to be on — each is reported
  const withEn = (key, en) => {
    assert.ok(all.some(p => p.key === key), `control: ${key} exists`)
    return wording.englishProblems(all.map(p => (p.key === key ? { ...p, en } : p)))
  }
  const back = [
    ['panel.js:PANEL.files.inboxHint', 'Click to go to ' + 'To' + ' read', /to-read/],
    ['pipeline.js:PIPELINE.panel.reasons', 'Recent reasons for ' + 'letting' + ' go', /let-go|放弃/],
    ['settings.js:SETTINGS.update.turnRunning', 'A ' + 'round' + ' is in progress. Update once it has finished.', /banned round/],
    ['first-run.js:HOW_IT_WORKS.note', 'Only what you ' + 'save' + ' becomes a note in the library folder. Every change needs your confirmation first.', /收藏/],
    ['proposals.js:PROPOSALS.advice.failureNotRolledBack', 'Check Sources & ' + 'brief' + '.', /sources-brief-case|来源与要求/],
    ['library.js:VERDICTS.title', 'Che' + 'cks', /checks-title|核验/],
    ['settings.js:SETTINGS.conn.verify', 'Che' + 'cking model', /核验/],
    ['run.js:RUN.cells.inbox', 'Into the ' + 'in' + 'box', /inbox-case|待看/],
    ['shell.js:SHELL.tabs.sources', 'Sources and ' + 'Brief', /terms sources-brief/],
    ['common.js:SIDEBAR.entries.chat', 'Main ' + 'Agent', /main-agent/],
    ['run.js:RUN.stopWhy.cap', 'Reached the per-run ' + 'limit' + '; the rest waits for the next run', /per-run/],
  ]
  for (const [key, en, expect] of back) {
    const problems = withEn(key, en)
    assert.ok(problems.length >= 1 && problems.some(p => expect.test(p)), `${key} with 「${en}」 is reported: ${JSON.stringify(problems)}`)
  }
  // the five keys of a verification round keep 'round' by the white list, and only those: the same word on another key is reported
  const round = wording.loadGlossary().english.banned.find(b => b.id === 'round')
  for (const key of round.allow_keys) assert.match(all.find(p => p.key === key).en, /\bround/i, `${key} speaks of a verification round`)
  assert.equal(all.filter(p => /\brounds?\b/i.test(p.en.replace(/\{\w+\?[^}]*\}/g, ' '))).length <= round.allow_keys.length, true, 'no other key says round')
})

/** Every English string of the core's words for the main agent: the `en` halves, and the third column of UI_TERMS. */
function coreEnglish() {
  const out = []
  const walk = (v, path) => {
    if (typeof v === 'string') out.push({ key: path, text: v })
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
  }
  for (const [name, value] of Object.entries(WORDS)) {
    if (name === 'UI_TERMS') value.forEach((row, i) => out.push({ key: `UI_TERMS[${i}]`, text: row[2], zh: row[1] }))
    else if (value && typeof value === 'object' && value.en !== undefined) walk(value.en, `${name}.en`)
  }
  return out
}

test('R6b-3 the English words the core gives the main agent use the same word list: no old word, the proper names as the list writes them', () => {
  const words = coreEnglish()
  assert.ok(words.length > 40, `control: the core's English words were read (${words.length})`)
  const english = wording.loadGlossary().english
  const hits = list => list.flatMap(w => english.banned.filter(b => new RegExp(b.re, b.flags ?? '').test(w.text)).map(b => `${w.key}: ${b.id} in 「${w.text}」`))
  assert.deepEqual(hits(words), [])
  // the proper names in the list of interface terms the model is given
  const term = zh => WORDS.UI_TERMS.find(r => r[1].startsWith(zh))?.[2]
  assert.equal(term('待确认'), 'To confirm')
  assert.equal(term('来源与要求'), 'Sources & Brief')
  assert.match(term('待看'), /^Inbox/)
  assert.match(term('运行'), /^run \(Run now/)
  // reverse: the same scan sees an old word
  assert.equal(hits([{ key: 'x', text: 'put nothing new into the ' + 'in' + 'box' }, { key: 'y', text: 'the next ' + 'round' }]).length, 2)
  assert.equal(WIDE.test(words.map(w => w.text).join('\n')), false, 'no Chinese in the English halves')
})

test('R6b-3 the built-in rules of a scoring step and of the summary have an English description (by the interface\'s language); the Chinese one the pipeline runs with is unchanged', () => {
  const node = { id: 'substance', kind: 'gate', output: { substance: 'score', freshness: 'enum:new|followup|duplicate', reason: 'text', quote: 'text' } }
  const zh = [...gateBaseline(node), ...summaryBaseline()]
  assert.equal(zh.length, 11, 'the eleven built-in descriptions')
  assert.deepEqual(BASELINE_LANGUAGES, ['zh-CN', 'en'])
  // what runs is what it was before R6b (the words the verifier is told are part of the pipeline's behaviour)
  assert.deepEqual(zh.map(i => i.desc), ['输出包含全部约定字段：substance、freshness、reason、quote', 'substance 是 0 到 1 之间的数', 'freshness 只能是 new / followup / duplicate 之一', '理由不超过 120 字',
    '引用原话逐字出现在材料里', '有「这是什么」一句', '要点恰好三行', '没有 TODO / TBD / FIXME 占位', '没有内部用词', '引用原话逐字出现在材料里',
    '摘要里的每个数字和断言都能在材料里找到，目标 / 预计 / 已完成这类状态词没被升级'])
  const en = describeChecklist(zh, 'en')
  assert.equal(en.length, 11)
  for (const [i, item] of en.entries()) {
    assert.equal(WIDE.test(item.desc), false, `${item.id}: nothing Chinese in 「${item.desc}」`)
    assert.ok(item.desc.length >= 12 && item.desc !== zh[i].desc, `${item.id} has English words`)
    assert.deepEqual({ ...item, desc: 0 }, { ...zh[i], desc: 0 }, `${item.id}: only the description differs`)
  }
  assert.equal(en[0].desc, 'The output has every agreed field: substance, freshness, reason, quote')
  assert.equal(en[2].desc, 'freshness is one of new / followup / duplicate')
  assert.deepEqual(describeChecklist(en, 'zh-CN'), zh, 'and back: the description is worked out from the id and the rule, not from the words')
  assert.deepEqual(gateBaseline(node, 'en'), en.slice(0, 5))
  assert.deepEqual(summaryBaseline('en'), en.slice(5))
  // a user's own item is never reworded; a language the core does not know gives the Chinese; the input is not changed
  const mine = { id: 'user-1', desc: '我自己加的一条规则', kind: 'judge', origin: 'user' }
  assert.equal(baselineDescription(mine, 'en'), null)
  assert.deepEqual(describeChecklist([mine, zh[3]], 'en'), [mine, { ...zh[3], desc: 'The reason is at most 120 characters' }])
  assert.equal(baselineDescription(zh[3], 'fr'), zh[3].desc)
  assert.equal(zh[3].desc, '理由不超过 120 字')
  // reverse: an item taken for a built-in one that is not (a user's item carrying a built-in id) keeps its words
  assert.equal(baselineDescription({ ...zh[3], origin: 'user' }, 'en'), null)
})

function files(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, exts, out)
    else if (exts.some(e => name.endsWith(e))) out.push(p)
  }
  return out
}
// the one full-width mark the code keeps on purpose: it goes into a data attribute the tests read, never into text
const MARK_OK = [{ file: 'renderer/screens/sources.js', text: '、', why: 'data-keywords, an attribute (not shown)' }]
/** Full-width punctuation written in a string of the app's code (the text tables and the design's template left out). */
function wideMarksInCode(read = p => readFileSync(p, 'utf8')) {
  const skip = [join(SRC, 'renderer', 'texts'), join(SRC, 'renderer', 'texts-en'), join(SRC, 'main', 'texts'), join(SRC, 'main', 'texts-en'), join(SRC, 'renderer', 'template')]
  const found = []
  const list = files(SRC, ['.js', '.mjs', '.cjs']).filter(f => !skip.some(dir => f.startsWith(dir + '\\') || f.startsWith(dir + '/')))
  for (const f of list) {
    const rel = relative(SRC, f).replaceAll('\\', '/')
    for (const lit of stringLiterals(read(f))) {
      if (!WIDE_MARK.test(lit.text)) continue
      if (MARK_OK.some(o => o.file === rel && o.text === lit.text)) continue
      found.push(`${rel}:${lit.line} ${JSON.stringify(lit.text)}`)
    }
  }
  return { found, files: list.length }
}

test('R6b-3 no full-width punctuation mark is written in the app\'s code outside the text tables; the screens take theirs from PUNCT (half-width in English)', () => {
  const r = wideMarksInCode()
  assert.ok(r.files > 40, `control: the code was read (${r.files} files)`)
  assert.deepEqual(r.found, [])
  assert.deepEqual(Object.keys(PUNCT_EN), Object.keys(PUNCT))
  for (const [k, v] of Object.entries(PUNCT)) assert.ok(WIDE_MARK.test(v), `the Chinese ${k} is a full-width mark`)
  for (const [k, v] of Object.entries(PUNCT_EN)) assert.equal(WIDE.test(v), false, `the English ${k} is half-width`)
  // reverse: the three screens with their marks written in again
  const putBack = (file, from, to) => wideMarksInCode(p => {
    const text = readFileSync(p, 'utf8')
    if (!p.replaceAll('\\', '/').endsWith(file)) return text
    assert.ok(text.includes(from), `control: ${file} has ${from}`)
    return text.replace(from, to)
  }).found
  assert.equal(putBack('screens/pipeline.js', '${PUNCT.open}${T.editor.baseline}${PUNCT.close}', '（${T.editor.baseline}）').length, 1)
  assert.equal(putBack('screens/proposal.js', 'const LIST = PUNCT.list', "const LIST = '、'").length, 1)
  assert.equal(putBack('screens/sources.js', 'keywords.join(PUNCT.comma)', "keywords.join('，')").length, 1)
})
