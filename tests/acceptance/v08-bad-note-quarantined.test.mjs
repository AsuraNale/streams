// V8 · 一个故意写坏的 .md 被列入待规范，不进索引、图谱、问库，且文件内容未被改动
// 怎么核：比对文件哈希
//
// A library with two conforming notes and one file in notes/ whose header is broken on purpose (an impossible date), the
// way a hand edit in Obsidian can leave it. Everything that reads the library runs over it: rebuildIndex, listPending,
// libraryCounts, graph, search, ask (with a question made of the broken file's own title words), a whole round, and an
// edit attempt. The broken file is listed as pending and appears in none of index.jsonl, the graph's nodes, the search
// results or ask's candidates and prompt; its sha256 is the same at the end. Reverse: the same file with the date fixed
// shows up in the index, the graph and ask's candidates, and leaves the pending list.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { core } from './support/paths.mjs'
import { makeLib, keepNote, fetchCtx, startFakeServer } from './support/library.mjs'
import { EMPTY_RSS } from '../../core/test/support/feeds.mjs'

const BROKEN_ID = 'zephyr-broken'
const BROKEN_FILE = `${BROKEN_ID}.md`
const brokenText = date => `---
id: ${BROKEN_ID}
title: Zephyr 量子记忆实验
source: https://example.test/zephyr
source_name: secret-src
date: ${date}
collected: 2026-11-01
kept: 2026-11-01
status: kept
topics: [坏主题]
---
Zephyr 正文：量子记忆的一段实验记录。
`
const QUESTION = 'Zephyr 量子记忆实验'
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')

function askConnector() {
  return core.fakeConnector({
    mode: 'counting',
    json: req => {
      if (req.model === 'verify') return { items: [...req.prompt.matchAll(/^\[([a-z-]+)\] /gm)].map(m => ({ id: m[1], passed: true, evidence: 'ok' })) }
      return { answer: [{ text: '库里有一条 Zephyr 的综述。', cites: [1] }], notInLibrary: false, missing: '', claimed: [] }
    },
  })
}

function present(dir) {
  const index = readFileSync(join(dir, 'index.jsonl'), 'utf8')
  const g = core.graph(dir)
  return {
    pending: core.listPending(dir).map(p => p.file).includes(BROKEN_FILE),
    index: core.readIndex(dir).some(e => e.id === BROKEN_ID) || index.includes(BROKEN_ID) || index.includes('Zephyr 量子记忆实验'),
    graphItem: g.nodes.some(n => n.id === `item:${BROKEN_ID}`),
    graphTopic: g.nodes.some(n => n.id === 'topic:坏主题'),
    graphSource: g.nodes.some(n => n.id === 'source:secret-src'),
    search: core.search(dir, QUESTION).some(r => r.id === BROKEN_ID),
  }
}

test('V8: a broken .md is listed as pending, kept out of the index, the graph, search and ask, and not changed by any of them', async (t) => {
  const srv = await startFakeServer()
  t.after(() => srv.close())
  const feed = srv.route('/feed', { body: EMPTY_RSS })
  const dir = makeLib('v08-broken', { sources: [{ name: 'feed-a', kind: 'rss', url: feed, topic: 'agent 记忆' }] })
  keepNote(dir, 'zephyr-survey', { title: 'Zephyr memory survey', source_name: 'blog-a', topics: ['agent 记忆'] }, 'A survey of Zephyr memory designs.\n')
  keepNote(dir, 'mcp-registry', { title: 'MCP registry', source_name: 'blog-b', topics: ['MCP'] }, 'Registry.\n')
  const path = join(dir, 'notes', BROKEN_FILE)
  writeFileSync(path, brokenText('2026-13-40'), 'utf8') // the hand edit: an impossible date
  const before = sha(path)

  const rebuilt = core.rebuildIndex(dir)
  assert.equal(rebuilt.entries.length, 2, 'the two conforming notes are indexed')
  assert.ok(rebuilt.pending.some(p => p.file === BROKEN_FILE), 'rebuildIndex reports it pending')
  const pending = core.listPending(dir)
  const mine = pending.find(p => p.file === BROKEN_FILE)
  assert.ok(mine, 'listed as 待规范')
  assert.ok(mine.codes.length >= 1 && mine.codes.some(c => /date/.test(c)), `the problem is named: ${mine.codes.join(', ')}`)
  assert.equal(core.libraryCounts(dir).pending, 1)
  assert.ok(core.listLibrary(dir, { view: 'pending' }).items.some(i => i.file === BROKEN_FILE), 'the 待规范 page lists it')

  const p = present(dir)
  assert.deepEqual(p, { pending: true, index: false, graphItem: false, graphTopic: false, graphSource: false, search: false })
  assert.ok(core.graph(dir).nodes.some(n => n.id === 'item:zephyr-survey'), 'control: the graph does draw indexed notes')
  assert.ok(core.search(dir, QUESTION).some(r => r.id === 'zephyr-survey'), 'control: the same words do find the indexed note')

  // ask with the broken file's own title as the question
  const conn = askConnector()
  const a = await core.ask(dir, QUESTION, { connector: conn })
  assert.equal(a.ok, true)
  assert.deepEqual(a.candidates.map(c => c.id), ['zephyr-survey'], 'the candidates are the indexed note only')
  assert.equal(conn.calls.some(c => c.prompt.includes('量子记忆的一段实验记录') || c.prompt.includes('Zephyr 量子记忆实验（')), false, 'the broken file\'s text never reaches the model')
  assert.equal(a.sources.some(s => s.id === BROKEN_ID), false)

  // a whole round over the library, and an edit attempt
  const r = await core.runRound(dir, { connector: core.scriptedConnector(), ctx: fetchCtx() })
  assert.equal(r.ok, true)
  assert.ok(r.warnings.some(w => w.includes(BROKEN_FILE)), 'the round warns about it')
  assert.throws(() => core.editNote(dir, BROKEN_ID, { title: 'x' }), e => ['not-found', 'not-editable'].includes(e.code))
  core.rebuildIndex(dir)

  assert.equal(sha(path), before, 'the broken file is byte for byte what it was')
  assert.deepEqual(present(dir), p)
})

test('V8 reverse: the same file with its date fixed enters the index, the graph and ask, and leaves 待规范', async () => {
  const dir = makeLib('v08-fixed')
  keepNote(dir, 'zephyr-survey', { title: 'Zephyr memory survey', source_name: 'blog-a', topics: ['agent 记忆'] }, 'A survey of Zephyr memory designs.\n')
  const path = join(dir, 'notes', BROKEN_FILE)
  writeFileSync(path, brokenText('2026-13-40'), 'utf8')
  core.rebuildIndex(dir)
  assert.equal(present(dir).index, false)
  writeFileSync(path, brokenText('2026-10-30'), 'utf8') // the user fixes the date
  core.rebuildIndex(dir)
  assert.deepEqual(present(dir), { pending: false, index: true, graphItem: true, graphTopic: true, graphSource: true, search: true })
  const a = await core.ask(dir, QUESTION, { connector: askConnector() })
  assert.ok(a.candidates.some(c => c.id === BROKEN_ID), 'now a candidate of ask')
})
