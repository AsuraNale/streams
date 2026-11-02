// The glossary (glossary.json) is valid JSON, follows its own schema, carries the plan's §1.7 names (the maintainer 11-02) and the
// V7 list, agrees with the shell's five fetch states, and nothing it tells us to say is itself a banned term.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadBannedTerms, loadGlossary } from '../src/data.mjs'
import { entriesById, fetchStateWord, userTerm } from '../src/glossary.mjs'
import { scanText } from '../src/scanner.mjs'

const glossary = loadGlossary()
const ACTIONS = new Set(Object.keys(glossary.actions))
// the nine words of V7's hard list
const V7 = ['Bronze', 'Silver', 'Gold', 'judge', 'keeper', 'gate', 'Medallion', 'pending', 'ledger']

test('the two data files are valid JSON', () => {
  for (const name of ['glossary.json', 'banned-terms.json']) {
    const text = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
    assert.doesNotThrow(() => JSON.parse(text), name)
  }
})

test('every entry follows the schema', () => {
  const ids = new Set()
  for (const entry of glossary.entries) {
    assert.ok(entry.id && !ids.has(entry.id), `duplicate or empty id ${entry.id}`)
    ids.add(entry.id)
    assert.ok(Object.hasOwn(glossary.groups, entry.group), `${entry.id}: unknown group ${entry.group}`)
    assert.ok(entry.row?.trim(), `${entry.id}: empty row`)
    assert.ok(entry.treatment?.trim(), `${entry.id}: empty treatment`)
    assert.ok(Array.isArray(entry.terms) && entry.terms.length > 0, `${entry.id}: no terms`)
    for (const term of entry.terms) {
      assert.ok(Array.isArray(term.internal) && term.internal.length > 0 && term.internal.every(w => typeof w === 'string' && w),
        `${entry.id}: term without internal words`)
      assert.ok(ACTIONS.has(term.action), `${entry.id}: unknown action ${term.action}`)
      if (term.action === 'rename' || term.action === 'prefer') {
        assert.ok(typeof term.zh === 'string' && term.zh.trim(), `${entry.id}/${term.internal[0]}: ${term.action} needs zh`)
        assert.ok(typeof term.en === 'string' && term.en.trim(), `${entry.id}/${term.internal[0]}: ${term.action} needs en`)
      }
      assert.ok(Object.hasOwn(term, 'zh') && Object.hasOwn(term, 'en'), `${entry.id}/${term.internal[0]}: zh and en columns must exist`)
    }
  }
  assert.ok(entriesById(glossary).size === glossary.entries.length)
})

test('the maintainer 11-02 (plan §1.7): the three tiers, scoring, keeping and letting go, the one-line summary', () => {
  assert.equal(userTerm('Bronze').zh, '抓到的')
  assert.equal(userTerm('silver').zh, '待看')
  assert.equal(userTerm('GOLD').zh, '已收藏')
  assert.equal(userTerm('judge').zh, '打分')
  assert.equal(userTerm('relevance').zh, '相关度')
  assert.equal(userTerm('threshold').zh, '过关线')
  assert.equal(userTerm('promote').zh, '收藏')
  assert.equal(userTerm('dismiss').zh, '放弃')
  assert.equal(userTerm('one_line').zh, '这是什么')
  assert.equal(userTerm('Silver').en, 'Inbox')
  assert.equal(userTerm('no_such_word'), null)
})

test('what must not appear (plan §1.7): keeper, Intake Gate, Preflight, selftest, pending.json, judgments.json, ledger are hidden', () => {
  for (const word of ['keeper', 'Intake Gate', 'Preflight', 'selftest', 'pending.json', 'judgments.json', 'ledger', 'Medallion']) {
    const found = userTerm(word)
    assert.ok(found, `${word} has no entry`)
    assert.equal(found.action, 'hide', word)
    assert.equal(found.zh, null, `${word}: nothing to say instead`)
  }
})

test('the five fetch states: the shell\'s keys, in order, each with its words', async () => {
  const { FETCH_STATES } = await import('../../desktop/src/shared/fetch-states.mjs')
  assert.deepEqual(glossary.fetch_states.map(s => s.id), [...FETCH_STATES])
  assert.deepEqual(glossary.fetch_states.map(s => s.zh), ['正常', '没新内容', '地址有问题', '暂时失败', '被拒绝'])
  for (const s of FETCH_STATES) {
    assert.equal(fetchStateWord(s), userTerm(s).zh, s)
    assert.ok(fetchStateWord(s, 'en'), `${s} in English`)
  }
  assert.equal(fetchStateWord('no_such_state'), null)
  // the shell's own tables say the same (desktop/src/renderer/texts/common.js FETCH_STATES)
  const { FETCH_STATES: WORDS } = await import('../../desktop/src/renderer/texts/common.js')
  const { FETCH_STATES: WORDS_EN } = await import('../../desktop/src/renderer/texts-en/common.js')
  for (const s of FETCH_STATES) {
    assert.equal(WORDS[s], fetchStateWord(s, 'zh'), `${s}: the page's Chinese word is the glossary's`)
    assert.equal(WORDS_EN[s], fetchStateWord(s, 'en'), `${s}: the page's English word is the glossary's`)
  }
})

test('V7: every word of the hard list is a banned term that points at a glossary entry', () => {
  const banned = loadBannedTerms()
  const ids = new Set(glossary.entries.map(e => e.id))
  const terms = banned.hard.flatMap(g => g.terms.map(t => ({ ...t, group: g.id })))
  for (const word of V7) {
    const term = terms.find(t => t.t === word)
    assert.ok(term, `${word} is not a hard term`)
    assert.ok(ids.has(term.see), `${word} → unknown entry ${term.see}`)
  }
  for (const word of ['Claude', 'Anthropic', 'OpenAI', 'ChatGPT']) assert.ok(terms.find(t => t.t === word), `${word} is not a hard term`)
  const bad = []
  for (const t of terms) {
    if (t.see === null || t.see === undefined) { if (!t.suggest) bad.push(`${t.group}:${t.t ?? t.re} has neither see nor suggest`) } else if (!ids.has(t.see)) bad.push(`${t.group}:${t.t ?? t.re} -> unknown ${t.see}`)
  }
  for (const item of banned.soft) if (item.see && !ids.has(item.see)) bad.push(`soft ${item.id} -> unknown ${item.see}`)
  assert.deepEqual(bad, [])
})

test('nothing the glossary tells us to say is itself a banned term (Chinese and English)', () => {
  const bad = []
  const check = (text, where) => {
    const r = scanText(text)
    for (const hit of r.hits) bad.push(`${where}: 「${hit.text}」 in ${text}`)
  }
  for (const entry of glossary.entries) {
    for (const term of entry.terms) {
      if (term.zh) check(term.zh, `${entry.id}.zh`)
      if (term.en) check(term.en, `${entry.id}.en`)
      if (term.gloss) check(term.gloss, `${entry.id}.gloss`)
    }
  }
  for (const s of glossary.fetch_states) check(`${s.zh} ${s.en}`, `fetch state ${s.id}`)
  assert.deepEqual(bad, [])
  // control: the check sees a banned word in a sentence like the ones above
  assert.equal(scanText('过了关的进 Silver').ok, false)
})
