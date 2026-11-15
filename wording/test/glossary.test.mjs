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
  // redesign R6b-1: the five words are 05 第三节's now (维护者 11-11 过目第 1 条; the contract's table, word for word) — this line used
  // to hold the v1 words, and the English column was only checked for being there
  assert.deepEqual(glossary.fetch_states.map(s => s.zh), ['正常', '无更新', '地址无效', '暂时失败', '访问被拒'])
  assert.deepEqual(glossary.fetch_states.map(s => s.en), ['OK', 'No updates', 'Invalid address', 'Temporary failure', 'Access denied'])
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
  // redesign R6b-1: and the words the main agent is given (core/src/agent/words.mjs STATE_WORDS) — one definition, the same in all three
  const { STATE_WORDS } = await import('../../core/src/agent/words.mjs')
  for (const s of FETCH_STATES) {
    assert.equal(STATE_WORDS.zh[s], fetchStateWord(s, 'zh'), `${s}: the core's Chinese word is the glossary's`)
    assert.equal(STATE_WORDS.en[s], fetchStateWord(s, 'en'), `${s}: the core's English word is the glossary's`)
  }
  // reverse: a glossary whose word for one state differs is seen by the same lookup
  const stale = { ...glossary, fetch_states: glossary.fetch_states.map(s => (s.id === 'gap' ? { ...s, zh: '地址出错' } : s)) }
  assert.notEqual(fetchStateWord('gap', 'zh', stale), WORDS.gap)
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

// ---- redesign R6b-3: the English word list (glossary.json `english`) ---------------------------------------------------------
test('R6b-3 the English word list: every word the contract asks for, the two deliberate deviations with their reasons, patterns that compile and catch their own samples', async () => {
  const { englishShapeProblems, englishProblems, REQUIRED_ENGLISH_TERMS } = await import('../src/english.mjs')
  const english = glossary.english
  assert.deepEqual(englishShapeProblems(english), [])
  const word = zh => english.terms.find(t => t.zh === zh)?.en
  // the words the contract names (docs/checks/2026-11-13-r6b/contract.md R6b-3), one definition each
  assert.deepEqual(['待看', '库架', '资料库', '问库', '来源与要求', '追踪要求', '主 Agent', '收藏', '放弃', '稍后处理', '忽略', '待确认', '系统检测', '运行', '核验'].map(word),
    ['Inbox', 'Shelf', 'Library', 'Ask', 'Sources & Brief', 'Brief', 'Main agent', 'Keep', 'Discard', 'Later', 'Dismiss', 'To confirm', 'Detected by Streams', 'run', 'verification'])
  assert.equal(word('核验的第 n 轮'), 'round', 'the verification rounds have a word of their own')
  assert.equal(word('提示词'), 'Instructions')
  assert.equal(word('设为当前连接'), 'Set as current connection')
  assert.ok(REQUIRED_ENGLISH_TERMS.length >= 22)
  // the two deviations from 05's English column, each with what 05 drafted, what is used and why
  assert.deepEqual(english.deviations.map(d => [d.line, d.draft, d.ours]), [[145, 'Prompt (editable)', 'Instructions (editable)'], [167, 'Use for scoring', 'Set as current connection']])
  for (const d of english.deviations) assert.ok(d.reason.length > 20, `line ${d.line} says why`)
  // the old word for 放弃 is gone from the v1 table too, and nothing the list says is a banned term
  assert.equal(userTerm('dismiss').en, 'Discard')
  for (const t of english.terms) assert.equal(scanText(t.en).ok, true, `${t.id}: ${t.en}`)
  // the word for a run is not the word the verification rounds keep: 'round' is banned except on the listed keys
  const round = english.banned.find(b => b.id === 'round')
  assert.equal(round.allow_keys.length, 5)

  // reverse: the checker on a small pair of tables — each kind of problem is reported, and clean tables are clean
  const clean = [
    { key: 'shell.js:SHELL.tabs.inbox', zh: '待看', en: 'Inbox' },
    { key: 'inbox.js:INBOX.card.keep', zh: '收藏', en: 'Keep' },
    { key: 'library.js:VERDICTS.round', zh: '第 {n} 轮', en: 'Round {n}' },
    { key: 'run.js:RUN.outcome', zh: '收藏 {kept} · 放弃 {dismissed}', en: 'kept {kept} · discarded {dismissed}' },
  ]
  const small = { ...english, terms: english.terms.filter(t => ['inbox', 'keep'].includes(t.id)).map(t => ({ ...t, keys: t.keys.filter(k => clean.some(c => c.key === k)) })), banned: english.banned.map(b => ({ ...b, allow_keys: b.allow_keys.filter(k => clean.some(c => c.key === k)) })) }
  assert.deepEqual(englishProblems(clean, small), [])
  const broken = (key, en) => englishProblems(clean.map(c => (c.key === key ? { ...c, en } : c)), small)
  assert.equal(broken('shell.js:SHELL.tabs.inbox', 'To read').length, 3, 'To read: not the list\'s word, not Inbox, and banned')
  assert.equal(broken('shell.js:SHELL.tabs.inbox', 'inbox').length, 3, 'inbox in lower case: the list writes Inbox')
  assert.equal(broken('inbox.js:INBOX.card.keep', 'Save').length, 3, 'Save for 收藏')
  assert.equal(broken('run.js:RUN.outcome', 'kept {kept} · let go {dismissed}').length, 3, 'let go for 放弃')
  assert.equal(englishProblems([...clean, { key: 'x.js:X.y', zh: '上次运行', en: 'Last round' }], small).length, 1, 'round for a run')
  assert.equal(englishProblems([...clean, { key: 'x.js:X.y', zh: '核验模型', en: 'Checking model' }], small).length, 3, 'check for 核验')
  assert.equal(englishProblems(clean.filter(c => c.key !== 'library.js:VERDICTS.round'), { ...small, banned: english.banned }).length, 5, 'a key on a white list that the tables do not have')
})
