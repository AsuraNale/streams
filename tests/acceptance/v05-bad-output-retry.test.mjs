// V5 · 模型输出坏格式时重试一次，再坏就标未评分，条目不丢
// 怎么核：假连接器
//
// The core's fake connectors (fakeConnector / scriptedConnector, modes bad-format-once and bad-format-always) answer the
// gates of a real round on a local feed. Once bad: one retry whose prompt is the same prompt plus 「你的输出不符合格式」, then
// scored. Always bad: exactly two attempts, then the ledger says unscored (bad-format), the item stays in the ledger at
// 「抓到的」, the run records (rounds.jsonl, logs/<day>.md) name it, and later rounds neither lose it nor call again for it.
// Reverse: with well-formed answers there is no retry at all, and the once-bad item is scored, not unscored.
// redesign R6b: 「next round」 reads 「next run」 here (comments, test names, the text of an assertion's message; in
// fetch-round.test and the r5a fixtures also the fetch log's message, which core fetch/states.mjs now writes as 'retry next
// run') — 05 统一用词 says 运行 / run, and the contract (R6b-1) wants the v1 处理建议's fragment 'next round' gone from the repository.
// Nothing else that is checked changed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { core } from './support/paths.mjs'
import { feedLibrary, fetchCtx, withProbeOk, ledger, rounds, modelCalls } from './support/library.mjs'

const RETRY = '你的输出不符合格式'
const gatePrompts = (conn, key) => modelCalls(conn).filter(c => c.model !== 'verify' && new RegExp(`"${key}": 0到1的小数`).test(c.prompt)).map(c => c.prompt)

test('V5 once bad: the gate is asked again once, with 「你的输出不符合格式」 added, and the item is scored', async (t) => {
  assert.equal(core.RETRY_NOTE, RETRY, 'the retry note is the plan\'s sentence')
  const { dir, items } = await feedLibrary(t, 'v05-once', 1)
  const conn = core.scriptedConnector({ mode: 'bad-format-once' })
  const r = await core.runRound(dir, { connector: withProbeOk(conn), ctx: fetchCtx() })
  assert.equal(r.ok, true)
  const ps = gatePrompts(conn, 'relevance')
  assert.equal(ps.length, 2, 'two attempts at gate 1')
  assert.equal(ps[0].includes(RETRY), false, 'the first prompt has no retry note')
  assert.ok(ps[1].includes(RETRY), 'the retry carries 「你的输出不符合格式」')
  assert.ok(ps[1].startsWith(ps[0]), 'the retry is the same prompt with the note added')
  assert.deepEqual(r.counts.gate1, { passed: 1, failed: 0, unscored: 0 })
  const ev = ledger(dir).filter(e => e.url === items[0].url)
  assert.equal(ev.filter(e => e.ev === 'unscored').length, 0, 'reverse of the always case: not unscored')
  assert.equal(ev.filter(e => e.ev === 'scored' && e.node === 'relevance').length, 1)
  assert.equal(core.replayLedger(dir).states.get(items[0].url).stage, 'inbox')
})

test('V5 always bad: two attempts, then unscored bad-format; the item stays in the ledger at 「抓到的」; the run record names it; never lost later', async (t) => {
  const { dir, items } = await feedLibrary(t, 'v05-always', 2)
  const conn = core.fakeConnector({ mode: 'bad-format-always' })
  const r = await core.runRound(dir, { connector: withProbeOk(conn), ctx: fetchCtx() })
  assert.equal(r.ok, true)
  assert.equal(r.calls, 4, 'two items, two attempts each, no third')
  assert.equal(conn.calls.length, 4)
  for (const it of items) {
    const ps = conn.calls.filter(c => c.prompt.includes(it.title)).map(c => c.prompt)
    assert.equal(ps.length, 2, `${it.title}: retried exactly once`)
    assert.ok(ps[1].includes(RETRY))
  }
  assert.deepEqual(r.counts.gate1, { passed: 0, failed: 0, unscored: 2 })
  const un = ledger(dir).filter(e => e.ev === 'unscored')
  assert.deepEqual(un.map(e => [e.url, e.node, e.reason]), items.map(it => [it.url, 'relevance', 'bad-format']))
  // not lost: still in the ledger at stage seen, listed under 「抓到的」 as unscored
  const states = core.replayLedger(dir).states
  for (const it of items) {
    assert.equal(states.get(it.url)?.stage, 'seen', `${it.url} still in the ledger`)
    assert.equal(states.get(it.url).unscored.relevance, 'bad-format')
  }
  const caught = core.listLibrary(dir, { view: 'caught' }).items
  assert.deepEqual(caught.filter(i => items.some(it => it.url === i.url)).map(i => i.stoppedAt), ['unscored', 'unscored'])
  // the run record says so: rounds.jsonl and the day's markdown
  assert.deepEqual(rounds(dir).at(-1).unscored.map(u => [u.url, u.node, u.reason]), items.map(it => [it.url, 'relevance', 'bad-format']))
  const logs = readdirSync(join(dir, '_pipeline', 'logs')).filter(f => f.endsWith('.md'))
  assert.equal(logs.length, 1)
  const md = readFileSync(join(dir, '_pipeline', 'logs', logs[0]), 'utf8')
  for (const it of items) assert.ok(md.includes(`unscored relevance bad-format ${it.url}`), md)
  // the next run: no new call for them under the same configuration, and they are still there
  const r2 = await core.runRound(dir, { connector: withProbeOk(conn), ctx: fetchCtx() })
  assert.equal(r2.calls, 0)
  assert.equal(conn.calls.length, 4)
  assert.equal(core.replayLedger(dir).states.size, 2)
  assert.equal(core.libraryCounts(dir).caught, 2)
})

test('V5 reverse: well-formed answers are never retried', async (t) => {
  const { dir } = await feedLibrary(t, 'v05-clean', 2)
  const conn = core.scriptedConnector()
  const r = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  assert.equal(r.counts.inbox, 2)
  assert.equal(gatePrompts(conn, 'relevance').length, 2, 'one attempt per item')
  assert.equal(modelCalls(conn).some(c => c.prompt.includes(RETRY)), false)
  assert.equal(ledger(dir).filter(e => e.ev === 'unscored').length, 0)
})
