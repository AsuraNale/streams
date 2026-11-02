// The scanner against the product's own list (V7 and plan §1.7): every banned interface word is caught in any case and
// form; the brand words are caught except in the sentences V7 allows; an old item card is flagged, its rewrite passes,
// and a rewrite with one banned word put back into any field fails (so a scanner that sees nothing cannot pass);
// variants of spelling (full-width, zero-width, traditional) fold back to the word; titles and web links are not wording.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scanText, scanCard, scanPayload, scanStrings, formatForAgent, compileMatchers } from '../src/scanner.mjs'

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const oldItem = JSON.parse(fixture('old-item.json'))
const rewrittenItem = JSON.parse(fixture('rewritten-item.json'))
const texts = r => r.hits.map(h => h.text)
const V7 = ['Bronze', 'Silver', 'Gold', 'judge', 'keeper', 'gate', 'Medallion', 'pending', 'ledger']
const BRANDS = ['Claude', 'Anthropic', 'OpenAI', 'ChatGPT']

test('V7: each of the nine words is caught on its own, in any case, as a plural, inside a Chinese sentence', () => {
  for (const word of V7) {
    for (const form of [word, word.toLowerCase(), word.toUpperCase(), `${word}s`]) {
      const r = scanText(`这一条是 ${form} 里的`)
      assert.equal(r.ok, false, form)
      assert.ok(r.hits.some(h => h.normalized.toLowerCase().startsWith(word.toLowerCase())), `${form}: ${JSON.stringify(texts(r))}`)
    }
  }
  // forms the plural rule does not give
  for (const form of ['judged', 'judging', 'judgment', 'gating', 'gatekeeper', 'Intake Gate', 'pending.json', 'judgments.json']) assert.equal(scanText(`see ${form} here`).ok, false, form)
  // not inside another word
  for (const ok of ['golden', 'investigate', 'bookkeeper', 'judgement-free is not a word we use: judgemental', 'goldfish', 'silvery']) {
    const r = scanText(`the ${ok} thing`)
    assert.deepEqual(texts(r).filter(t => !/judgement/i.test(t)), [], `${ok}: ${JSON.stringify(texts(r))}`)
  }
  assert.deepEqual(texts(scanText('这一条在待看里等你；已收藏 3 条，相关度 0.8，过关线 0.6。')), [])
})

test('V7: the brand words are caught, except in the sentences the rule allows', () => {
  for (const word of BRANDS) {
    assert.deepEqual(texts(scanText(`${word} 打的分`)), [word], word)
    assert.deepEqual(texts(scanText(`scored by ${word.toLowerCase()}`)), [word.toLowerCase()], `${word} in lower case`)
  }
  assert.deepEqual(texts(scanText('连接你电脑上的 Claude Code')), [], 'the allowed Chinese sentence')
  assert.deepEqual(texts(scanText('连接你电脑上的 Codex')), [], 'Codex is not a banned word')
  assert.deepEqual(texts(scanText('Connect the Claude Code on this computer')), [], 'the allowed English sentence')
  assert.deepEqual(texts(scanText('Connect the Codex on this computer')), [])
  // controls: the same brand outside the allowed phrase is caught; the phrase does not cover a second mention
  assert.deepEqual(texts(scanText('连接你电脑上的 Claude Code，Claude 会打分')), ['Claude'])
  assert.deepEqual(texts(scanText('用 Claude Code 打分')), ['Claude'])
})

test('the old item card is flagged in every field; the rewrite has zero hits; one banned word put back into any field is caught', () => {
  const r = scanCard(oldItem)
  assert.equal(r.ok, false)
  // (promote and dismiss are not banned words: the next test says so; the fixture names them next to banned ones)
  for (const word of ['Silver', 'pending', 'judge', 'Gold', 'ledger', 'Claude', 'keeper', 'Intake Gate', 'one_line', 'judgments.json', 'pending.json']) {
    assert.ok(texts(r).includes(word) || texts(r).some(t => t.includes(word)), `missing hit: ${word} in ${JSON.stringify(texts(r))}`)
  }
  for (const field of ['header', 'question', 'detail', 'options[0].label', 'options[0].description', 'options[1].label', 'options[1].description']) {
    assert.ok(r.hits.some(h => h.field === field), `${field} was not scanned`)
  }
  const clean = scanCard(rewrittenItem)
  assert.deepEqual(texts(clean), [])
  assert.equal(clean.ok, true)
  for (const field of ['header', 'question', 'detail']) {
    const broken = scanCard({ ...rewrittenItem, [field]: `${rewrittenItem[field]} pending` })
    assert.deepEqual(broken.hits.map(h => [h.field, h.text]), [[field, 'pending']])
  }
  const options = rewrittenItem.options.map(o => ({ ...o }))
  options[1].description = `${options[1].description}（ledger）`
  assert.deepEqual(scanCard({ ...rewrittenItem, options }).hits.map(h => [h.field, h.text]), [['options[1].description', 'ledger']])
  const payload = scanPayload({ questions: [rewrittenItem, oldItem] })
  assert.equal(payload.ok, false)
  assert.ok(payload.hits.every(h => h.field.startsWith('questions[1].')), 'hits come from the old card only')
})

test('promote and dismiss (plan 1.7) are not banned words: they are what the interface renames, caught only as snake_case or by the glossary', () => {
  // the V7 hard list does not name them; the glossary says what to call them. A page that wrote them would fail the
  // texts-en jargon check, not this scanner — so this is a statement of scope, with its control.
  assert.deepEqual(texts(scanText('the item was dismissed')), [])
  assert.deepEqual(texts(scanText('one_line is missing')), ['one_line'])
})

test('spelling variants fold back to the word: full-width letters, zero-width characters inside, traditional characters in the Chinese soft words', () => {
  const cp = String.fromCodePoint
  const fullWidth = [...'pending'].map(c => cp(c.codePointAt(0) + 0xFEE0)).join('')
  assert.deepEqual(scanText(`这一条还 ${fullWidth}`).hits.map(h => h.normalized), ['pending'])
  assert.deepEqual(scanText(`this is pen${cp(0x200B)}ding`).hits.map(h => h.normalized), ['pending'])
  assert.deepEqual(scanText(`Sil${cp(0x00AD)}ver`).hits.map(h => h.normalized), ['Silver'])
  // the soft list is advisory only, and the traditional form of a soft word is seen
  const a = scanText('記在賬本里', { advise: true })
  assert.equal(a.ok, true)
  assert.deepEqual(a.advisories.map(x => x.normalized), ['账本'])
  assert.deepEqual(scanText('记在账本里').advisories, [], 'advisories only when asked for')
})

test('titles in 《》 and web links are citations, not wording; a local link is flagged; fields that are not user copy are not scanned', () => {
  assert.deepEqual(texts(scanText('参考《The Gold Standard》的说法')), [])
  assert.deepEqual(texts(scanText('参考《Anthropic 的论文》')), [], 'a company in a real title')
  assert.deepEqual(texts(scanText('参考 The Gold Standard 的说法')), ['Gold'], 'control: a bare title is scanned')
  assert.deepEqual(texts(scanText('见 https://example.com/gold/pending 这一页')), [])
  assert.deepEqual(texts(scanText('打开《pending.json》看看')), ['pending.json'], 'our own file name counts even in 《》 (in_titles)')
  const local = scanText('报告在 http://127.0.0.1:8130/status 这里')
  assert.deepEqual(local.hits.map(h => h.rule), ['env:local-link'])
  const card = { id: 'gold-1', question: '收藏进库吗？', sources: ['https://example.com/gold'], quotes: ['pending'], options: [{ label: '收藏', description: '进库' }] }
  assert.equal(scanCard(card).ok, true)
})

test("the user's own words are not flagged when shown to be theirs; cards and dictionaries are always strict", () => {
  const userText = '我这个主题就叫 Gold Rush，盯着它'
  assert.deepEqual(texts(scanText('你说的「Gold Rush」已经加进主题', { userText })), [])
  assert.deepEqual(texts(scanText('你说的「Gold Rush」已经加进主题')), ['Gold'], 'control: no user text, the word is ours')
  assert.deepEqual(texts(scanText('你原话里的「Gold Rush」', { quoteCues: true })), [], 'free text, loose mode: a cue word before the quote')
  assert.throws(() => scanStrings({ a: 'x' }, { quoteCues: true }), TypeError, 'dictionaries refuse the loose mode')
  assert.throws(() => scanCard(rewrittenItem, { quoteCues: true }), TypeError)
})

test('every hard-list term can fire', () => {
  const failures = []
  for (const matcher of compileMatchers()) {
    const sample = matcher.term.example ?? matcher.term.t
    const text = `这里有${sample}一处`
    const at = text.indexOf(sample)
    matcher.re.lastIndex = 0
    if (!matcher.re.test(text)) failures.push(`${matcher.rule}: own pattern does not match ${sample}`)
    const r = scanText(text)
    // a wider rule may report the span instead; what matters is that it is caught
    if (!r.hits.some(h => h.start < at + sample.length && at < h.end)) failures.push(`${matcher.rule}: scan misses ${sample}`)
  }
  assert.deepEqual(failures, [])
})

test('UI dictionaries, and the message back to the model', () => {
  const dict = scanStrings({ status: { title: '运行状态', line: '上一轮 08:00 · 3 条 pending · ledger 已写' } })
  assert.deepEqual(dict.hits.map(h => [h.field, h.text]), [['status.line', 'pending'], ['status.line', 'ledger']])
  assert.equal(scanStrings({ status: { title: '运行状态', line: '上一轮 08:00 · 3 条待看' } }).ok, true)
  const message = formatForAgent(scanCard(oldItem))
  assert.match(message, /Silver/u)
  assert.match(message, /待看/u)
  assert.equal(formatForAgent(scanCard(rewrittenItem)), '')
})
