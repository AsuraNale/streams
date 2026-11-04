// V10 · 每轮上限生效：上限设 5，第 6 条不调模型，剩余条目下一轮接着跑
// 怎么核：假连接器计数
//
// Eight items on a local feed, the per-round cap set to 5 in streams.json (pipeline.cap, what 「改上限」 writes), the core's
// counting fake connector. Round 1: exactly 5 model calls — gate 1 on items 1–5 — the sixth item is never sent to the model,
// stoppedAt 'cap', items 6–8 stay at stage seen. The next rounds go on from there: gate 1 on items 6–8 first, and no
// (item, gate) the ledger already has a score for is asked again. Reverse: the same library with a cap of 100 runs to the
// end in one round with no stoppedAt; a cap passed to runRound overrides the configured one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { core, fake } from './support/paths.mjs'
import { feedLibrary, fetchCtx, setPipeline, modelCalls, ledger } from './support/library.mjs'

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
