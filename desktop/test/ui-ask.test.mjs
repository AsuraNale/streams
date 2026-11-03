// 问库 (screens/ask.js) on the seeded world plus plan B's extras, with the fake connection. The scope in the top bar is the
// core's counts; with no connection chosen a question says so and offers 设置; with the fake one (it answers nothing usable)
// the core falls back to 「库里没有」, which the page shows as a real answer, with 「记到想补的主题」: noting the same topic
// until it has 3 asks turns on 「建议加成主题」 (control: not before); the right panel says what was used. The page's half of
// V9 — the notice when the core took sources or sentences out, the numbered superscripts that mark their source — is
// checked by drawing, in the real page, the Answer component with what the core's own applyFallback makes of an answer that
// cites [12] among 2 candidates and has a sentence with no source.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { ASK } from '../src/renderer/texts/ask.js'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({
  kind: 'seeded',
  waitFor: 'ask',
  prepare: async world => { await seedPlanB(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'ask' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
const ask = async q => {
  const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
  await s.page.fill('textarea[data-field="question"]', q)
  await s.page.click('[data-action="send"] button')
  await s.page.waitForFunction(i => { const t = document.querySelector(`[data-turn="${i}"]`); return t && t.dataset.state !== 'asking' }, n, POLL)
  return n
}
const demand = topic => s.page.evaluate(t => { const d = document.querySelector(`[data-demand="${t}"]`); return d ? [Number(d.dataset.count), d.dataset.suggest] : null }, topic)

test('the scope is the core\'s counts; the topics wanted are the core\'s demands', async () => {
  const c = core.libraryCounts(dir())
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-topbar__subtitle').textContent), `范围：已收藏 ${c.kept} 条 · 我写的 ${c.authored} 条`)
  const shown = await s.page.evaluate(() => [...document.querySelectorAll('[data-demand]')].map(d => [d.dataset.demand, Number(d.dataset.count), d.dataset.suggest]))
  assert.deepEqual(shown, core.demands(dir()).map(d => [d.topic, d.count, String(d.suggest)]))
})

test('no connection chosen: the question says so and offers 设置', async () => {
  const i = await ask('agent 记忆有什么进展？')
  assert.equal(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"]`).dataset.state, i), 'error')
  assert.equal(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"] [data-part="no-connection"] [data-action="go-settings"]`) !== null, i), true)
})

test('with the fake connection: 库里没有 is the answer; the right panel says what was used; the field is free again', async () => {
  await s.page.evaluate(() => window.streams.setActiveConnection('claude-code'))
  const q = 'agent 记忆有什么进展？'
  const i = await ask(q)
  const got = await s.page.evaluate(n => {
    const t = document.querySelector(`[data-turn="${n}"]`)
    return { state: t.dataset.state, none: t.querySelector('[data-part="not-in-library"]')?.textContent ?? null, sentences: t.querySelectorAll('[data-sentence]').length, demand: t.querySelector('input[data-field="demand-topic"]') !== null }
  }, i)
  assert.equal(got.state, 'done')
  assert.ok(got.none.startsWith(ASK.answer.notInLibrary), got.none)
  assert.equal(got.sentences, 0, 'no sentence made up')
  assert.equal(got.demand, true)
  const used = await s.page.evaluate(() => { const h = document.querySelector('[data-used="hits"]'); return [Number(h.dataset.candidates), document.querySelector('[data-used="calls"]').dataset.calls] })
  assert.equal(used[0], core.askCandidates(dir(), q).length)
  assert.ok(used[0] > 0, 'control: the library has candidates for this question')
  assert.ok(Number(used[1]) >= 1)
  assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="question"]').disabled), false)
})

test('记到想补的主题: the same topic noted until 3 asks turns on 建议加成主题 (control: not at 2)', async () => {
  const topic = s.world.planB.demandTopic
  assert.deepEqual(await demand(topic), [1, 'false'])
  for (const [count, suggest] of [[2, 'false'], [3, 'true']]) {
    const i = await ask('有没有横向比较？')
    await s.page.fill(`[data-turn="${i}"] input[data-field="demand-topic"]`, topic)
    await s.page.click(`[data-turn="${i}"] [data-action="add-demand"] button`)
    await s.page.waitForFunction(([t, c]) => document.querySelector(`[data-demand="${t}"]`)?.dataset.count === String(c), [topic, count], POLL)
    assert.deepEqual(await demand(topic), [count, suggest])
  }
  const d = core.demands(dir()).find(x => x.topic === topic)
  assert.deepEqual([d.count, d.suggest], [3, true], 'the core agrees')
})

test('这个回答哪里不对: the note lands in feedback.jsonl', async () => {
  const i = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length - 1)
  await s.page.click(`[data-turn="${i}"] [data-action="feedback"] button`)
  await s.page.fill(`[data-turn="${i}"] textarea[data-field="feedback"]`, '应该引那篇评测')
  await s.page.click(`[data-turn="${i}"] [data-action="send-feedback"] button`)
  await s.page.waitForFunction(n => document.querySelector(`[data-turn="${n}"] [data-part="feedback-sent"]`) !== null, i, POLL)
  const { readFileSync } = await import('node:fs')
  const lines = readFileSync(join(dir(), '_pipeline', 'feedback.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.deepEqual(lines.map(l => l.note), ['应该引那篇评测'])
})

test('V9 on the page: what the core\'s fallback took out is said; each superscript marks its source; 打开 names the note', async () => {
  const cands = core.askCandidates(dir(), 'agent 记忆 MemGPT').slice(0, 2)
  assert.equal(cands.length, 2)
  const fixed = core.applyFallback({ answer: [{ text: '记忆拆成块。', cites: [1, 12] }, { text: '大家都觉得块更好。', cites: [] }, { text: '有一篇横向比较。', cites: [2] }] }, cands.length)
  assert.deepEqual([fixed.removedCites, fixed.removedSentences, fixed.answer.length], [[12], 1, 2], 'control: the core took [12] and one sentence out')
  const result = { ok: true, ...fixed, sources: cands.map(c => ({ n: c.n, id: c.id, title: c.title, date: c.date })), notInLibrary: false, missing: '', candidates: cands, used: cands.map(c => c.id), calls: 2, verification: { passed: false, rounds: 2, failed: [] } }
  const out = await s.page.evaluate(async r => {
    const { html, render } = await import('./lib/html.js')
    const { Answer } = await import('./screens/ask.js')
    const box = document.createElement('div')
    box.id = 'v9'
    document.body.append(box)
    const opened = []
    let lit = null
    const draw = () => render(html`<${Answer} turn=${{ question: 'q', status: 'done', result: r }} index=${0} highlight=${lit} onCite=${n => { lit = { turn: 0, n }; draw() }} onOpen=${id => opened.push(id)} onDemand=${() => {}} onSettings=${() => {}} />`, box)
    draw()
    const cites = [...box.querySelectorAll('[data-sentence]')].map(e => [...e.querySelectorAll('[data-cite]')].map(c => Number(c.dataset.cite)))
    const removed = [box.querySelector('[data-part="removed-cites"]')?.textContent, box.querySelector('[data-part="removed-sentences"]')?.textContent]
    box.querySelector('[data-cite="2"]').click()
    await new Promise(res => setTimeout(res, 50))
    const marked = [...box.querySelectorAll('[data-source-n][data-highlight="true"]')].map(e => Number(e.dataset.sourceN))
    box.querySelector('[data-source-n="2"] [data-action="open-cite"] button').click()
    render(null, box)
    box.remove()
    return { cites, removed, marked, opened }
  }, result)
  assert.deepEqual(out.cites, [[1], [2]])
  assert.deepEqual(out.removed, ['有 1 处出处不在库里，已删掉。', '有 1 句没有出处，已删掉。'])
  assert.deepEqual(out.marked, [2])
  assert.deepEqual(out.opened, [cands[1].id])
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
