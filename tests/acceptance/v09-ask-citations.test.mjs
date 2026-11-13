// V9 · 问库答案的每个引用编号都在候选集内；库里没有的问题得到「库内暂无相关内容。」
// 怎么核：用一个只有 5 条的库问 10 个问题，逐条核
// (Redesign R6a: the standard's sentence is the one 维护者 saw on 11-11 — was 「…库里没有的问题得到「库里没有」」. The ten questions
// and every check on the cites are as they were. New: the sentence itself — the core's NOT_IN_LIBRARY (what the main agent is
// told the page says) is 「库内暂无相关内容。」 with its English, the two dictionaries carry exactly those, and the real window shows
// that sentence, and no sentence made up, for a question the library has nothing on. Shown to fail with 「库里没有。」 put back in
// the dictionary: desktop/scripts/mutation-check.mjs r6a-v9-old-sentence.)
//
// A library of exactly five entries (four kept, one written by the user). Ten questions go through the core's ask with a
// scripted fake connector that answers each question its own way, reading the question and the candidate numbers off the
// prompt it is given: a good answer; a cite far outside the set ([12]) twice; a sentence with no cite; a wrong cite the
// model fixes when sent back; the model saying the library does not have it; two questions the library has nothing on;
// cites as a string, 0 and -1; only out-of-set cites; a cite one past the question's own candidate set. Every answer is
// checked the same way: each cite number, and each listed source, is one of that question's candidates; every sentence
// keeps a cite; a question with no candidate gets notInLibrary with no model call. Reverse: the same ten questions on a
// copy of the core whose fallback keeps out-of-set cites make the same check report them.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { core } from './support/paths.mjs'
import { makeLib, keepNote } from './support/library.mjs'
import { mutantCore } from './support/mutant.mjs'
import { worldSession } from '../../desktop/test/support/seed.mjs'
import { ASK } from '../../desktop/src/renderer/texts/ask.js'
import { ASK as ASK_EN } from '../../desktop/src/renderer/texts-en/ask.js'

// redesign R6a: the sentence of the standard, as written there (tests/acceptance/standards.mjs V9)
const SENTENCE = '库内暂无相关内容。'

const NOW = () => new Date('2026-11-03T16:00:00.000Z')

function fiveEntryLibrary(name, c) {
  const dir = makeLib(name, { core: c })
  const k = (id, o, body) => keepNote(dir, id, o, body, { core: c })
  k('letta', { title: 'Letta memory blocks', date: '2026-10-31', topics: ['agent 记忆'] }, 'Letta 发布了 memory blocks 接口，延迟降低 6%。\n')
  k('memgpt', { title: 'MemGPT paper on memory', date: '2023-10-12', topics: ['agent 记忆'] }, 'MemGPT 提出分层记忆。\n')
  k('mine', { title: 'My memory notes', date: '2026-10-20', status: 'authored', kept: undefined, source: 'file:mine.md', topics: ['agent 记忆'] }, '我的选型笔记。\n')
  k('mcp-registry', { title: 'MCP registry poisoning', date: '2026-10-28', topics: ['MCP'] }, '注册表被投毒的复盘。\n')
  k('mcp-spec', { title: 'MCP spec update', date: '2026-10-29', topics: ['MCP'] }, '规范更新了传输层。\n')
  c.rebuildIndex(dir)
  return dir
}

const s = (text, cites) => ({ text, cites })
const answer = (sentences, extra = {}) => ({ answer: sentences, notInLibrary: false, missing: '', claimed: [], ...extra })

// question -> (attempt, candidate numbers) -> the model's JSON; expect = what this question must come back with
const QUESTIONS = [
  { q: 'Letta memory blocks 是什么？', reply: () => answer([s('Letta 发布了记忆块接口。', [1])]), expect: { notInLibrary: false, removedCites: [], removedSentences: 0, rounds: 1 } },
  { q: 'MCP registry 出了什么事？', reply: () => answer([s('注册表被投毒。', [1]), s('还影响了十二个客户端。', [12])]), expect: { notInLibrary: false, removedCites: [12], removedSentences: 1, rounds: 2 } },
  { q: 'MemGPT paper 讲了什么？', reply: () => answer([s('MemGPT 提出分层记忆。', [1]), s('这是业界公认最好的方案。', [])]), expect: { notInLibrary: false, removedCites: [], removedSentences: 1, rounds: 2 } },
  { q: 'MCP spec update 改了什么？', reply: n => answer([s('规范更新了传输层。', n === 1 ? [7] : [1])]), expect: { notInLibrary: false, removedCites: [], removedSentences: 0, rounds: 2, passed: true } },
  { q: 'My memory notes 里有评测数据吗？', reply: () => ({ answer: [], notInLibrary: true, missing: '记忆方案的评测数据', claimed: [] }), expect: { notInLibrary: true, missing: '记忆方案的评测数据' } },
  { q: '量子计算 blockchain 的进展？', reply: null, expect: { notInLibrary: true, calls: 0, candidates: 0 } },
  { q: 'kubernetes autoscaling tips', reply: null, expect: { notInLibrary: true, calls: 0, candidates: 0 } },
  { q: 'agent memory 有什么进展？', reply: () => answer([s('Letta 发布了接口。', ['2']), s('MemGPT 是分层记忆。', [0]), s('还有别的。', [-1])]), expect: { notInLibrary: false, removedCites: [0, -1], removedSentences: 2 } },
  { q: 'MCP registry poisoning 的影响', reply: () => answer([s('影响很大。', [40]), s('波及全网。', [41])]), expect: { notInLibrary: true, removedCites: [40, 41], removedSentences: 2 } },
  { q: 'Letta 和 MemGPT 的关系', reply: (n, cands) => answer([s('两者都讲 agent 记忆。', [1]), s('是同一条线。', [Math.max(...cands) + 1])]), expect: { notInLibrary: false, removedSentences: 1, pastTheSet: true } },
]

function scriptedAsk() {
  const attempts = new Map()
  return core.fakeConnector({
    mode: 'counting',
    json: req => {
      if (req.model === 'verify') return { items: [...req.prompt.matchAll(/^\[([a-z-]+)\] /gm)].map(m => ({ id: m[1], passed: true, evidence: 'ok' })) }
      const q = /^问题：(.*)$/m.exec(req.prompt)?.[1]?.trim()
      const spec = QUESTIONS.find(x => x.q === q)
      if (!spec || !spec.reply) throw new Error(`no script for ${q}`)
      const n = (attempts.get(q) ?? 0) + 1
      attempts.set(q, n)
      const cands = [...req.prompt.matchAll(/^\[(\d+)\] /gm)].map(m => Number(m[1]))
      return spec.reply(n, cands)
    },
  })
}

/** The V9 check of one answer: what is wrong with it ([] = right). */
function citationProblems(q, r) {
  const out = []
  if (r.ok !== true) return [`${q}: ask failed (${r.code})`]
  const set = new Set(r.candidates.map(c => c.n))
  for (const [i, sentence] of r.answer.entries()) {
    if (!Array.isArray(sentence.cites) || sentence.cites.length === 0) out.push(`${q}: sentence ${i + 1} has no cite`)
    for (const n of sentence.cites ?? []) if (!set.has(n)) out.push(`${q}: cite [${n}] is not a candidate (${[...set].join(',') || 'none'})`)
  }
  for (const src of r.sources) {
    const cand = r.candidates.find(c => c.n === src.n)
    if (!cand) out.push(`${q}: source [${src.n}] is not a candidate`)
    else if (cand.id !== src.id) out.push(`${q}: source [${src.n}] is ${src.id}, the candidate is ${cand.id}`)
  }
  if (r.candidates.length === 0 && (r.notInLibrary !== true || r.calls !== 0 || r.answer.length !== 0)) out.push(`${q}: no candidate, yet notInLibrary ${r.notInLibrary}, ${r.calls} calls`)
  if (r.notInLibrary === false && r.answer.length === 0) out.push(`${q}: an empty answer that does not say notInLibrary`)
  return out
}

async function askAll(c, dir) {
  const conn = scriptedAsk()
  const results = []
  for (const spec of QUESTIONS) {
    const before = conn.calls.length
    const r = await c.ask(dir, spec.q, { connector: conn, now: NOW })
    results.push({ spec, r, connectorCalls: conn.calls.length - before })
  }
  return results
}

test('V9: a five-entry library, ten questions — every cite and source is in that question\'s candidate set; nothing in the library → notInLibrary (the page then says 库内暂无相关内容。)', async () => {
  const dir = fiveEntryLibrary('v09-five', core)
  const indexed = core.readIndex(dir)
  assert.equal(indexed.length, 5, 'exactly five entries')
  assert.deepEqual([...new Set(indexed.map(e => e.status))].sort(), ['authored', 'kept'])
  const results = await askAll(core, dir)
  assert.equal(results.length, 10, 'ten questions asked')
  for (const { spec, r, connectorCalls } of results) {
    assert.deepEqual(citationProblems(spec.q, r), [], spec.q)
    const e = spec.expect
    assert.equal(r.notInLibrary, e.notInLibrary, `${spec.q}: notInLibrary`)
    if (e.removedCites) assert.deepEqual(r.removedCites, e.removedCites, `${spec.q}: removedCites`)
    if (e.removedSentences !== undefined) assert.equal(r.removedSentences, e.removedSentences, `${spec.q}: removedSentences`)
    if (e.rounds !== undefined) assert.equal(r.verification.rounds, e.rounds, `${spec.q}: rounds`)
    if (e.passed !== undefined) assert.equal(r.verification.passed, e.passed, `${spec.q}: passed`)
    if (e.missing !== undefined) assert.equal(r.missing, e.missing)
    if (e.candidates !== undefined) assert.equal(r.candidates.length, e.candidates, `${spec.q}: candidates`)
    if (e.calls !== undefined) {
      assert.equal(r.calls, e.calls, `${spec.q}: calls`)
      assert.equal(connectorCalls, e.calls, `${spec.q}: the connector saw ${connectorCalls} calls`)
    } else {
      assert.ok(r.candidates.length >= 1 && connectorCalls >= 2, `${spec.q}: answered from ${r.candidates.length} candidates`)
      assert.ok(r.candidates.length <= 5)
    }
    if (e.notInLibrary) assert.deepEqual(r.answer, [], `${spec.q}: notInLibrary comes with no sentence`)
  }
  // the cite one past this question's own set (still within 1..9) was taken out too
  const past = results.find(x => x.spec.expect.pastTheSet)
  assert.ok(past.r.candidates.length < 9 && past.r.removedCites.length === 1 && past.r.removedCites[0] === past.r.candidates.length + 1, JSON.stringify(past.r.removedCites))
  // cites the model gave as a string are read as numbers, and kept when they are candidates
  const str = results.find(x => x.spec.q.startsWith('agent memory'))
  assert.deepEqual(str.r.answer.map(a => a.cites), [[2]])
})

test('V9 reverse: on a core whose fallback keeps out-of-set cites, the same check reports them', async () => {
  const m = await mutantCore('v09-keeps-bad-cites', [
    { file: 'ask/ask.mjs', from: 'if (k !== null && k >= 1 && k <= n) {', to: 'if (k !== null) {' },
    { file: 'ask/ask.mjs', from: 'citedNs.map((n) => listed[n - 1])', to: "citedNs.map((n) => listed[n - 1] ?? { n, id: '?', title: '', date: '' })" },
  ])
  const dir = fiveEntryLibrary('v09-five-mutant', m)
  const results = await askAll(m, dir)
  const problems = results.flatMap(({ spec, r }) => citationProblems(spec.q, r))
  assert.ok(problems.some(p => p.includes('cite [12] is not a candidate')), problems.join('\n'))
  assert.ok(problems.some(p => p.includes('cite [40] is not a candidate')), problems.join('\n'))
  assert.ok(problems.some(p => p.includes('source [')), 'an out-of-set source is reported too')
})

// ---- Redesign R6a (contract R6a-2; 维护者 11-11 第 1 条): 库里没有的问题得到「库内暂无相关内容。」 ----
test('V9 the sentence: the standard\'s, the core\'s (what the main agent is told the page says) and the two dictionaries\' are the same', async () => {
  const { STANDARDS } = await import('./standards.mjs')
  assert.ok(STANDARDS.find(s => s.id === 'V9').standard.endsWith(`得到「${SENTENCE}」`), 'control: the sentence checked here is the standard\'s')
  assert.equal(core.NOT_IN_LIBRARY.zh, SENTENCE)
  assert.equal(ASK.answer.notInLibrary, SENTENCE, 'the Chinese dictionary')
  assert.equal(ASK_EN.answer.notInLibrary, core.NOT_IN_LIBRARY.en, 'the English dictionary is the core\'s English')
  assert.ok(ASK_EN.answer.notInLibrary.length > 0 && !/[一-鿿]/.test(ASK_EN.answer.notInLibrary), 'an English sentence')
  assert.ok(core.UI_TERMS.some(([, zh, en]) => zh === SENTENCE && en === core.NOT_IN_LIBRARY.en), 'the main agent\'s word list has it')
  assert.ok(String(core.AGENT_SYSTEM).includes(SENTENCE), 'the main agent\'s system prompt lists it')
  for (const old of ['库里没有。', '库里没有」']) assert.equal(JSON.stringify(ASK).includes(old), false, `the sentence before R6a is gone: ${old}`)
})

describe('V9 desktop: a question the library has nothing on is answered 「库内暂无相关内容。」', () => {
  const s = worldSession({
    kind: 'seeded', waitFor: 'ask', settings: { connections: { active: 'claude-code' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'ask' }),
  })
  const POLL = { polling: 100, timeout: 60_000 }
  const ask = async q => {
    const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
    await s.page.fill('textarea[data-field="question"]', q)
    await s.page.click('[data-action="send"] button')
    await s.page.waitForFunction(i => { const t = document.querySelector(`[data-turn="${i}"]`); return t && t.dataset.state !== 'asking' }, n, POLL)
    return s.page.evaluate(i => {
      const t = document.querySelector(`[data-turn="${i}"]`)
      const none = t.querySelector('[data-part="not-in-library"]')
      return { state: t.dataset.state, said: none?.querySelector('b')?.textContent ?? null, whole: none?.textContent ?? null, sentences: t.querySelectorAll('[data-sentence]').length, cites: t.querySelectorAll('[data-cite]').length }
    }, n)
  }

  test('nothing in the library on the question (no candidate, no model call) → the sentence, and no sentence made up', async () => {
    const q = 'kubernetes autoscaling 怎么配置？'
    assert.equal(core.askCandidates(s.world.library, q).length, 0, 'control: the library has no candidate for this question')
    const got = await ask(q)
    assert.equal(got.state, 'done', JSON.stringify(got))
    assert.equal(got.said, SENTENCE, 'the answer is the standard\'s sentence')
    assert.ok(got.whole.startsWith(SENTENCE), got.whole)
    assert.deepEqual([got.sentences, got.cites], [0, 0], 'no sentence and no cite made up')
  })

  test('candidates but no answer in them (the fake connection) → the same sentence', async () => {
    const q = 'agent 记忆有什么进展？'
    assert.ok(core.askCandidates(s.world.library, q).length > 0, 'control: the library has candidates for this question')
    const got = await ask(q)
    assert.equal(got.state, 'done', JSON.stringify(got))
    assert.equal(got.said, SENTENCE)
    assert.deepEqual([got.sentences, got.cites], [0, 0])
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
