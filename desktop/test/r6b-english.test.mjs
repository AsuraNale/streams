// Redesign R6b-3 (docs/checks/2026-11-13-r6b/contract.md): the English of the interface, checked without a window.
//   1. the English word list (wording/glossary.json `english`, the same list docs/wording.md prints) holds over the two
//      dictionaries: the keys it names carry its words letter for letter, a Chinese string with one of its words has the
//      English word for it (核验 → verif…, never check; 收藏 → keep, never save; 放弃 → discard; …), and none of the old
//      English words is left (To read, let go, round for a run, Sources & brief, inbox in lower case, Checks for the
//      verification record, …) — the five keys that speak of a verification round excepted, by the list's own white list;
//   (1.1 W7b: R6b-3's checks of the English words the core gave v2's main agent, core/src/agent/words.mjs, and of the English
//   descriptions of v1.0's scoring steps' built-in rules went with that agent and that pipeline);
//   2. no full-width punctuation mark is written in the app's own code outside the text tables (the screens take theirs
//      from texts/common.js PUNCT, whose English table has the half-width ones).
// Each check is run on a broken input too (a word put back, a mark put back). The real windows are ui-english-screens.test.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { stringLiterals } from './support/literals.mjs'
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

// 1.1 W7b: the keys of the word list (wording/glossary.json) that named the interface of v1.0's scoring pipeline and of v2's
// main agent, its cards and 系统检测 — gone with them. Each must really be gone (the list cannot hide a key that is there); the
// glossary's own copy of them is outside the desktop (wording/).
const GONE_KEYS = Object.freeze([
  'sources.js:SOURCES.titlePlain', 'first-run.js:NEW_LIBRARY.brief', 'proposals.js:PROPOSALS.card.points.brief', 'agent.js:AGENT.name',
  'proposals.js:PROPOSALS.actions.dismiss', 'proposals.js:PROPOSALS.statuses.pending', 'proposals.js:PROPOSALS.card.points.trial', 'sources.js:SOURCES.row.try',
  'first-run.js:NEW_LIBRARY.tryOne', 'proposals.js:PROPOSALS.from.system', 'pipeline.js:PIPELINE.editor.checklist', 'sources.js:SOURCES.brief.strictness',
  'first-run.js:NEW_LIBRARY.strictness', 'sources.js:ADVANCED.log.fieldNames.cap',
])
const goneKey = p => GONE_KEYS.some(k => p.endsWith(`: the dictionaries have no key ${k}`))

test('R6b-3 the English word list holds over the two dictionaries: its words on the keys it names, its word wherever the Chinese has the term, none of the old English words', async () => {
  const all = await pairs()
  assert.ok(all.length > 1000, `control: the tables were read (${all.length} pairs)`)
  assert.ok(all.some(p => p.key.startsWith('main/')), 'control: the main process\'s tables too')
  assert.deepEqual(wording.englishShapeProblems(), [])
  for (const k of GONE_KEYS) assert.ok(!all.some(p => p.key === k), `${k} is listed as gone but is there`)
  assert.deepEqual(wording.englishProblems(all).filter(p => !goneKey(p)), [])
  // reverse: only the keys listed are let through — another missing key is still reported
  // (a key the word list names: shell.js:SHELL.tabs.inbox; one it does not name, taken away, would say nothing)
  assert.ok(all.some(p => p.key === 'shell.js:SHELL.tabs.inbox'), 'control: the key is there')
  assert.ok(wording.englishProblems(all.filter(p => p.key !== 'shell.js:SHELL.tabs.inbox')).some(p => !goneKey(p)))

  // reverse: one old word put back in a copy of the pairs, each on the key it used to be on — each is reported
  const withEn = (key, en) => {
    assert.ok(all.some(p => p.key === key), `control: ${key} exists`)
    return wording.englishProblems(all.map(p => (p.key === key ? { ...p, en } : p))).filter(p => !goneKey(p))
  }
  const back = [
    ['panel.js:PANEL.files.inboxHint', 'Click to go to ' + 'To' + ' read', /to-read/],
    ['panel.js:PANEL.detail.inbox.reasons', 'Recent reasons for ' + 'letting' + ' go', /let-go|放弃/],
    ['settings.js:SETTINGS.update.turnRunning', 'A ' + 'round' + ' is in progress. Update once it has finished.', /banned round/],
    ['first-run.js:HOW_IT_WORKS.note', 'Only what you ' + 'save' + ' becomes a note in the library folder. Every change needs your confirmation first.', /收藏/],
    ['panel.js:PANEL.files.requirementsHint', '{sources} sources · {topics} topics · click to open Sources & ' + 'brief', /sources-brief-case|来源与要求/],
    ['library.js:VERDICTS.title', 'Che' + 'cks', /checks-title|核验/],
    ['settings.js:SETTINGS.conn.verify', 'Che' + 'cking model', /核验/],
    ['run.js:RUN.last', 'Last run · {when} · {n} new in the ' + 'in' + 'box', /inbox-case|待看/],
    ['shell.js:SHELL.tabs.sources', 'Sources and ' + 'Brief', /terms sources-brief/],
    ['common.js:SIDEBAR.entries.chat', 'Main ' + 'Agent', /main-agent/],
    ['run.js:RUN.chipNoCap', 'Running: {phase} · model calls {calls} of the per-run ' + 'limit', /per-run/],
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

function files(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, exts, out)
    else if (exts.some(e => name.endsWith(e))) out.push(p)
  }
  return out
}
// the one full-width mark the code keeps on purpose: it goes into a data attribute the tests read, never into text
const MARK_OK = []
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
  // reverse: the screens with their marks written in again
  const putBack = (file, from, to) => wideMarksInCode(p => {
    const text = readFileSync(p, 'utf8')
    if (!p.replaceAll('\\', '/').endsWith(file)) return text
    assert.ok(text.includes(from), `control: ${file} has ${from}`)
    return text.replace(from, to)
  }).found
  assert.equal(putBack('screens/sources.js', '${PUNCT.open}${x.default}${PUNCT.close}', '（${x.default}）').length, 1)
  assert.equal(putBack('screens/build.js', '.join(PUNCT.list)', ".join('、')").length, 1)
  assert.equal(putBack('screens/build.js', 'problems.join(PUNCT.semi)', "problems.join('；')").length, 1)
})
