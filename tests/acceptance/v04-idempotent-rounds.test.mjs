// V4 · 没有新数据连跑两轮，第二轮账本、索引、inbox 零改动
// 怎么核：比对文件哈希
//
// A library on a local feed: round 1 takes two items through every gate into the inbox, the user keeps one (so the index
// has a line and notes/ a file), then two more rounds run with nothing new on the feed. The sha256 of the ledger
// (_pipeline/ledger.jsonl), the index (index.jsonl) and every file in _pipeline/inbox/ is compared before and after each of
// them: unchanged, and no model call. Reverse: a third item on the feed makes the next run change the ledger and the
// inbox and cost calls — the same comparison sees it.
// redesign R6b: 「next round」 reads 「next run」 here (comments, test names, the text of an assertion's message; in
// fetch-round.test and the r5a fixtures also the fetch log's message, which core fetch/states.mjs now writes as 'retry next
// run') — 05 统一用词 says 运行 / run, and the contract (R6b-1) wants the v1 处理建议's fragment 'next round' gone from the repository.
// Nothing else that is checked changed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { core } from './support/paths.mjs'
import { feedLibrary, feedRoute, serveItems, fetchCtx, hashes, fetchLog, modelCalls } from './support/library.mjs'

const STATE = rel => rel === '_pipeline/ledger.jsonl' || rel === 'index.jsonl' || rel.startsWith('_pipeline/inbox/')

test('V4: two rounds with no new data change no byte of the ledger, the index or the inbox, and call the model 0 times', async (t) => {
  const { srv, dir, items } = await feedLibrary(t, 'v04-idempotent', 2)
  const conn = core.scriptedConnector()
  const r1 = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  assert.equal(r1.ok, true)
  assert.deepEqual([r1.counts.new, r1.counts.inbox], [2, 2])
  assert.ok(modelCalls(conn).length > 0, 'round 1 did call the model')
  core.keep(dir, items[0].url)

  const before = hashes(dir, STATE)
  assert.ok(before['_pipeline/ledger.jsonl'], 'the ledger is compared')
  assert.ok(before['index.jsonl'], 'the index is compared')
  assert.equal(readFileSync(join(dir, 'index.jsonl'), 'utf8').trim().split('\n').length, 1, 'the index has the kept item')
  assert.equal(Object.keys(before).filter(k => k.startsWith('_pipeline/inbox/')).length, 1, 'one inbox file is compared')

  for (const n of [2, 3]) {
    conn.reset()
    const logLines = fetchLog(dir).length
    const r = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
    assert.equal(r.ok, true)
    assert.equal(r.started, true, `round ${n} ran`)
    assert.equal(fetchLog(dir).length, logLines + 1, `round ${n} fetched the feed`)
    assert.equal(fetchLog(dir).at(-1).status, 'empty', `round ${n}: the feed had nothing new`)
    assert.equal(r.counts.new, 0)
    assert.equal(r.calls, 0, `round ${n}: 0 model calls counted`)
    assert.deepEqual(modelCalls(conn), [], `round ${n}: the connector saw only the self-check's probe`)
    assert.deepEqual(hashes(dir, STATE), before, `round ${n}: ledger, index and inbox byte for byte unchanged`)
  }
  assert.ok(srv.hits('/feed') >= 3, 'the feed was asked every round')

  // reverse: one new item on the feed, and the same comparison must see the change
  feedRoute(srv, [...items, ...serveItems(srv, 3).slice(2)])
  conn.reset()
  const r4 = await core.runRound(dir, { connector: conn, ctx: fetchCtx() })
  assert.equal(r4.counts.new, 1)
  assert.ok(r4.calls > 0)
  const after = hashes(dir, STATE)
  assert.notDeepEqual(after, before)
  assert.notEqual(after['_pipeline/ledger.jsonl'], before['_pipeline/ledger.jsonl'], 'the ledger changed')
  assert.equal(Object.keys(after).filter(k => k.startsWith('_pipeline/inbox/')).length, 2, 'a second inbox file')
})
