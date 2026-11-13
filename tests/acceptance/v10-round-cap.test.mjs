// V10 · 单次运行上限生效：上限设 5，第 6 条不调模型，剩余条目下次运行接着处理
// 怎么核：假连接器计数
// (Redesign R6a: the standard's sentence is the one 维护者 saw on 11-11 — was 「每轮上限生效：上限设 5，第 6 条不调模型，剩余条目下一轮
// 接着跑」. The core part below — the counts — is as it was. New, for the sentence's own words (单次运行上限 · 下次运行接着处理): the
// interface's words for the cap in both dictionaries, with no 「每轮」 left in any Chinese text table; and on the real window: the
// cap typed as 5 on 来源与要求 (its line says 单次运行最多 … 次模型调用), a run of eight new items stops at five model calls with
// the sixth item not sent, the right panel's 该库上次运行 says 「达到单次运行上限，剩余内容留待下次运行」, and the next run goes on with what was
// left. Shown to fail with the cap's words put back to 每轮 / 下一轮: desktop/scripts/mutation-check.mjs r6a-v10-per-round.)
//
// Eight items on a local feed, the per-run cap set to 5 in streams.json (pipeline.cap, what 来源与要求's 定时与上限 writes), the core's
// counting fake connector. Round 1: exactly 5 model calls — gate 1 on items 1–5 — the sixth item is never sent to the model,
// stoppedAt 'cap', items 6–8 stay at stage seen. The next rounds go on from there: gate 1 on items 6–8 first, and no
// (item, gate) the ledger already has a score for is asked again. Reverse: the same library with a cap of 100 runs to the
// end in one round with no stoppedAt; a cap passed to runRound overrides the configured one.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, fake, DESKTOP_DIR } from './support/paths.mjs'
import { feedLibrary, fetchCtx, setPipeline, modelCalls, ledger, rounds, startFakeServer, serveItems, feedRoute } from './support/library.mjs'
import { worldSession } from '../../desktop/test/support/seed.mjs'
import { RUN } from '../../desktop/src/renderer/texts/run.js'
import { RUN as RUN_EN } from '../../desktop/src/renderer/texts-en/run.js'
import { ADVANCED, SOURCES } from '../../desktop/src/renderer/texts/sources.js'
import { ADVANCED as ADVANCED_EN, SOURCES as SOURCES_EN } from '../../desktop/src/renderer/texts-en/sources.js'

const pairs = conn => modelCalls(conn).filter(c => fake.promptKind(c) === 'gate').map(c => `${fake.titleOf(c.prompt)}|${fake.scoreKeyOf(c.prompt)}`)
const titled = (items, i) => items[i - 1].title

test('V10: cap 5 → exactly 5 calls, the sixth item is not sent to the model, stoppedAt cap; the next round goes on with what is left', async (t) => {
  const { dir, items } = await feedLibrary(t, 'v10-cap', 8)
  setPipeline(dir, { cap: 5 })
  assert.equal(core.pipelineConfig(dir).cap, 5, 'the configured cap is 5')
  const conn = core.scriptedConnector()
  const r1 = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  assert.equal(r1.ok, true)
  assert.equal(r1.calls, 5, 'the round counted 5 calls')
  assert.equal(modelCalls(conn).length, 5, 'the connector saw 5 model calls (the probe left out)')
  assert.equal(r1.stoppedAt, 'cap')
  assert.deepEqual(pairs(conn), [1, 2, 3, 4, 5].map(i => `${titled(items, i)}|relevance`))
  for (const i of [6, 7, 8]) assert.equal(modelCalls(conn).some(c => c.prompt.includes(titled(items, i))), false, `item ${i} was not sent to the model`)
  const states = core.replayLedger(dir).states
  assert.equal(states.size, 8, 'all eight are registered: nothing lost')
  for (const i of [6, 7, 8]) assert.equal(states.get(items[i - 1].url).stage, 'seen')

  // round 2: picks up the rest, gate 1 on 6–8 first, then gate 2 from item 1
  const n1 = modelCalls(conn).length
  const r2 = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  assert.equal(r2.calls, 5)
  assert.equal(r2.stoppedAt, 'cap')
  assert.deepEqual(pairs(conn).slice(n1), [`${titled(items, 6)}|relevance`, `${titled(items, 7)}|relevance`, `${titled(items, 8)}|relevance`, `${titled(items, 1)}|substance`, `${titled(items, 2)}|substance`])

  // the rest of the rounds until nothing is left: never the same (item, gate) twice
  // (a summary item costs two calls, summary + its check, and the round finishes the item it is on — 方案 4.5 第 7 步
  // 「到每轮上限就在当前条目后停下」 — so a round may end on 6; it never starts an item once 5 are spent)
  let r
  for (let k = 0; k < 20; k++) {
    const before = modelCalls(conn).length
    r = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
    assert.equal(modelCalls(conn).length - before, r.calls, `round ${k + 3}: the count is the connector's`)
    assert.ok(r.calls <= 6, `round ${k + 3}: ${r.calls} calls`)
    if (r.stoppedAt === 'cap') assert.ok(r.calls >= 5, `round ${k + 3} stopped at the cap with ${r.calls} calls`)
    if (r.stoppedAt === undefined) break
  }
  assert.equal(r.stoppedAt, undefined, 'the last round ran out of work, not into the cap')
  const all = pairs(conn)
  assert.equal(new Set(all).size, all.length, 'no (item, gate) was asked twice')
  assert.equal(all.length, 16, 'eight items × two gates')
  const scored = ledger(dir).filter(e => e.ev === 'scored' && typeof e.score === 'number').map(e => `${e.url}|${e.node}`)
  assert.equal(new Set(scored).size, scored.length, 'at most one score per (item, gate) in the ledger')
  assert.deepEqual([...core.replayLedger(dir).states.values()].map(s => s.stage), Array(8).fill('inbox'))
})

test('V10 reverse: with a cap of 100 the same library runs to the end in one round, no stoppedAt; a cap given to runRound wins', async (t) => {
  const { dir } = await feedLibrary(t, 'v10-wide', 8)
  setPipeline(dir, { cap: 100 })
  const conn = core.scriptedConnector()
  const r = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  assert.equal(r.stoppedAt, undefined)
  assert.equal(r.counts.inbox, 8)
  assert.ok(r.calls > 5, `${r.calls} calls`)
  const { dir: d2 } = await feedLibrary(t, 'v10-arg', 8)
  setPipeline(d2, { cap: 100 })
  const c2 = core.scriptedConnector()
  const r2 = await core.runRound(d2, { connector: c2, cap: 5, ctx: fetchCtx() })
  assert.deepEqual([r2.calls, r2.stoppedAt, modelCalls(c2).length], [5, 'cap', 5])
})

// ---- Redesign R6a (contract R6a-2; 维护者 11-11 第 1 条): 单次运行上限 · 剩余条目下次运行接着处理 — the interface's words ----
test('V10 the words: the cap is 单次运行上限 and what is left waits for 下次运行, in both dictionaries; no 每轮 in any Chinese text table', () => {
  assert.equal(RUN.stopWhy.cap, '达到单次运行上限，剩余内容留待下次运行')
  assert.equal(ADVANCED.log.fieldNames.cap, '单次运行上限')
  assert.ok(SOURCES.run.at.includes('单次运行最多') && SOURCES.run.capLabel.startsWith('单次运行最多'), `${SOURCES.run.at} · ${SOURCES.run.capLabel}`)
  assert.ok(SOURCES.run.rule.includes('达到上限后停止，剩余内容留待下次运行处理'), SOURCES.run.rule)
  assert.ok(core.UI_TERMS.some(([, zh]) => zh.includes('单次运行上限')), 'the main agent\'s word list names the cap the same way')
  // English: per run, the next run
  assert.ok(/per-run/i.test(RUN_EN.stopWhy.cap) && /next run/.test(RUN_EN.stopWhy.cap), RUN_EN.stopWhy.cap)
  assert.ok(/per-run/i.test(ADVANCED_EN.log.fieldNames.cap), ADVANCED_EN.log.fieldNames.cap)
  assert.ok(/next run/.test(SOURCES_EN.run.rule), SOURCES_EN.run.rule)
  // no text table says the cap the old way: 每轮 anywhere in a Chinese table, 「下一轮接着」, or a cap 「per round」 in an English one
  const tables = folder => readdirSync(join(DESKTOP_DIR, 'src', ...folder)).filter(f => f.endsWith('.js')).map(f => [`${folder.join('/')}/${f}`, readFileSync(join(DESKTOP_DIR, 'src', ...folder, f), 'utf8')])
  const strings = text => [...text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)].map(m => m[1] ?? m[2])
  const zh = [...tables(['renderer', 'texts']), ...tables(['main', 'texts'])]
  const en = [...tables(['renderer', 'texts-en']), ...tables(['main', 'texts-en'])]
  assert.ok(zh.length >= 10 && en.length >= 10, 'control: the text tables are read')
  assert.ok(zh.some(([, t]) => strings(t).includes(RUN.stopWhy.cap)), 'control: the strings of a table are found')
  assert.deepEqual(strings("  cap: '达到每轮上限，剩余条目下一轮接着跑',").filter(s => /每轮/.test(s)).length, 1, 'control: the old words would be found')
  const oldZh = zh.flatMap(([f, t]) => strings(t).filter(s => /每轮|下一轮接着/.test(s)).map(s => `${f}: ${s}`))
  assert.deepEqual(oldZh, [], 'Chinese tables')
  const oldEn = en.flatMap(([f, t]) => strings(t).filter(s => /\bcap\b.*\bper round\b|\bper round\b.*\bcap\b|model calls? per round|\{n\?\|s\} per round/i.test(s)).map(s => `${f}: ${s}`))
  assert.deepEqual(oldEn, [], 'English tables')
})

describe('V10 desktop: the cap set to 5 on 来源与要求, a run stops at five model calls and says so in the cap\'s words, the next run goes on', () => {
  const made = { urls: [] }
  const s = worldSession({
    kind: 'seeded', waitFor: 'sources', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' } },
    // eight new items on a feed of this machine, added to the seeded library's sources before the app starts
    prepare: async world => {
      const srv = await startFakeServer()
      const list = serveItems(srv, 8, i => ({ title: `Cap item ${i} about agent memory` }))
      const feed = feedRoute(srv, list)
      const file = join(world.library, 'streams.json')
      const cfg = JSON.parse(readFileSync(file, 'utf8'))
      cfg.sources = [{ name: 'cap-feed', kind: 'rss', url: feed, topic: cfg.topics?.[0]?.name ?? 'agent 记忆', max_results: 100 }]
      writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
      made.urls = list.map(i => i.url)
      return () => srv.close()
    },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }),
  })
  const POLL = { polling: 100, timeout: 90_000 }
  const scoredNew = dir => ledger(dir).filter(e => e.ev === 'scored' && made.urls.includes(e.url))
  const untouched = dir => made.urls.filter(u => !scoredNew(dir).some(e => e.url === u))
  async function runOnce(dir) {
    const before = rounds(dir).length
    await s.page.waitForFunction(() => document.querySelector('[data-part="run-button"][data-run-state="idle"] button')?.disabled === false, null, POLL)
    await s.page.click('[data-part="run-button"] button')
    for (const until = Date.now() + POLL.timeout; Date.now() < until; await s.page.waitForTimeout(200)) {
      const state = await s.page.evaluate(() => window.streams.getRoundState())
      if (state.ok && state.data.running === false && rounds(dir).length > before) break
    }
    const all = rounds(dir)
    assert.equal(all.length, before + 1, 'one more run in the library\'s record')
    return all.at(-1)
  }

  test('the cap typed as 5 is the library\'s cap; the run makes 5 model calls and stops; 该库上次运行 says 达到单次运行上限，剩余内容留待下次运行; the next run goes on with what is left', async () => {
    const dir = s.world.library
    // 上限设 5, on the page
    await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-field="cap"]')?.disabled === false, null, POLL)
    const line = await s.page.evaluate(() => document.querySelector('[data-part="run"]').textContent)
    assert.ok(line.includes(SOURCES.run.at) && line.includes(SOURCES.run.capAfter) && line.includes('达到上限后停止，剩余内容留待下次运行处理'), line)
    assert.equal(/每轮|下一轮/.test(line), false, `the cap's line has no 每轮 / 下一轮: ${line}`)
    assert.notEqual(core.pipelineConfig(dir).cap, 5, 'control: the cap is not 5 before it is typed')
    await s.page.fill('[data-part="run"] [data-field="cap"]', '5')
    await s.page.click('[data-part="run"] [data-action="save-run"] button')
    await s.page.waitForFunction(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'saved', null, POLL)
    assert.equal(core.pipelineConfig(dir).cap, 5, 'the library\'s cap is 5')
    assert.equal(scoredNew(dir).length, 0, 'control: none of the eight new items was scored before the run')

    // the run: five model calls, then it stops — the sixth item is not sent to the model
    const r1 = await runOnce(dir)
    assert.equal(r1.calls, 5, `the run counted 5 model calls: ${JSON.stringify(r1).slice(0, 300)}`)
    assert.equal(r1.stoppedAt, 'cap')
    const states = core.replayLedger(dir).states
    assert.deepEqual(made.urls.filter(u => !states.has(u)), [], 'all eight are registered: nothing lost')
    const left = untouched(dir)
    assert.deepEqual([scoredNew(dir).length, left.length], [5, 3], 'five of the eight were scored — the five calls — and three were not sent to the model')
    for (const u of left) assert.equal(states.get(u).stage, 'seen', 'an item past the cap stays where it was')

    // 该库上次运行 (the right panel's 进度; 待看 shows the same funnel when it is empty) says why it stopped, in the cap's words
    const FUNNEL = '[data-part="right-panel"] [data-part="last-run-here"] [data-part="last-run"]'
    await s.page.waitForFunction(([sel, id]) => document.querySelector(`${sel}[data-round="${id}"] [data-part="funnel-stop"]`) !== null, [FUNNEL, r1.id], POLL)
    const stop = await s.page.evaluate(sel => { const e = document.querySelector(`${sel} [data-part="funnel-stop"]`); return { why: e.dataset.why, text: e.textContent, all: document.querySelector(sel).textContent } }, FUNNEL)
    assert.equal(stop.why, 'cap')
    assert.equal(stop.text, `${RUN.stopCell} · ${RUN.stopWhy.cap}`)
    assert.ok(stop.text.includes('达到单次运行上限') && stop.text.includes('剩余内容留待下次运行'), stop.text)
    assert.equal(/每轮|下一轮/.test(stop.all), false, `上次运行 has no 每轮 / 下一轮: ${stop.all}`)

    // the next run goes on with what was left. In this world that is more than one run's worth (the first step for the three not
    // sent before, then the second step for all eight), so the next run is a run at the cap too: exactly 5 model calls again, not
    // one more — the three left first, then the second step of 5 − 3 of the others — and nothing is scored twice
    const r2 = await runOnce(dir)
    assert.equal(r2.calls, 5, `the next run counted 5 model calls: ${JSON.stringify(r2).slice(0, 300)}`)
    assert.equal(r2.stoppedAt, 'cap')
    const second = ledger(dir).filter(e => e.ev === 'scored' && typeof e.score === 'number' && e.round === r2.id)
    assert.equal(second.length, 5, 'the next run\'s five calls are five scores in the library\'s record')
    assert.deepEqual(second.filter(e => e.node === 'relevance').map(e => e.url), left, 'the three not sent before are sent now, first')
    const further = second.filter(e => e.node !== 'relevance').map(e => e.url)
    assert.equal(further.length, 5 - left.length, 'what is left of the five calls goes to the next step')
    assert.ok(further.every(u => made.urls.includes(u) && !left.includes(u)), `… of items the first run had scored: ${further}`)
    assert.deepEqual(untouched(dir), [], 'none of the eight is left unsent after the next run')
    const scored = ledger(dir).filter(e => e.ev === 'scored' && typeof e.score === 'number').map(e => `${e.url}|${e.node}`)
    assert.equal(new Set(scored).size, scored.length, 'no (item, step) was scored twice')
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
