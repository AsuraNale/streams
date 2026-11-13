// V8 · 一个故意写坏的 .md 被列为「缺少文件头」的文件，不进索引、图谱、问库，且文件内容未被改动
// 怎么核：比对文件哈希
// (Redesign R6a: the standard's sentence is the one 维护者 saw on 11-11 — was 「…被列入待规范，…」. The core part below is as it was,
// only its messages say 缺少文件头 where they said 待规范; the desktop part at the end of this file is new: it reads the words
// 「缺少文件头」 off the real window.)
//
// A library with two conforming notes and one file in notes/ whose header is broken on purpose (an impossible date), the
// way a hand edit in Obsidian can leave it. Everything that reads the library runs over it: rebuildIndex, listPending,
// libraryCounts, graph, search, ask (with a question made of the broken file's own title words), a whole round, and an
// edit attempt. The broken file is listed as pending and appears in none of index.jsonl, the graph's nodes, the search
// results or ask's candidates and prompt; its sha256 is the same at the end. Reverse: the same file with the date fixed
// shows up in the index, the graph and ask's candidates, and leaves the pending list.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { core } from './support/paths.mjs'
import { makeLib, keepNote, fetchCtx, startFakeServer } from './support/library.mjs'
import { EMPTY_RSS } from '../../core/test/support/feeds.mjs'
import { worldSession } from '../../desktop/test/support/seed.mjs'
import { LIBRARY } from '../../desktop/src/renderer/texts/library.js'
import { LIBRARY as LIBRARY_EN } from '../../desktop/src/renderer/texts-en/library.js'
import { fmt } from '../../desktop/src/renderer/lib/format.js'

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
  assert.ok(mine, 'listed as a file that 缺少文件头 (the core: listPending)')
  assert.ok(mine.codes.length >= 1 && mine.codes.some(c => /date/.test(c)), `the problem is named: ${mine.codes.join(', ')}`)
  assert.equal(core.libraryCounts(dir).pending, 1)
  assert.ok(core.listLibrary(dir, { view: 'pending' }).items.some(i => i.file === BROKEN_FILE), 'the 缺少文件头 page lists it (the core: the pending view)')

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

test('V8 reverse: the same file with its date fixed enters the index, the graph and ask, and leaves the 缺少文件头 list', async () => {
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

// ---- Redesign R6a (contract R6a-2; 维护者 11-11 第 1 条): 被列为「缺少文件头」的文件 — the words on the real window ----
// The real app (the pinned Electron, the seeded world of desktop/test/support/seed.mjs, the fake connection) on a library that
// has the same broken file in notes/: 资料库 says 「n 个文件缺少文件头，尚未入库。」 (n is the core's count, one more than without
// the file), 去处理 opens the page headed 「n 个文件缺少文件头」 where the file has its card (its name, what is wrong with it, 尚未入库);
// the old name of that list (待规范) is nowhere on either; the file is not a row of 资料库, not a node of 图谱, not cited by 问库
// (asked with the file's own title); and its bytes are the same after all of it. The English dictionary has the same line.
// Shown to fail with the words put back to 待规范 (desktop/scripts/mutation-check.mjs r6a-v8-old-word).
describe('V8 desktop: the broken file is listed under 缺少文件头, and nowhere else', () => {
  const state = { before: null, countBefore: null }
  const s = worldSession({
    kind: 'seeded', waitFor: 'library',
    settings: { connections: { active: 'claude-code' } },
    prepare: world => {
      state.countBefore = core.libraryCounts(world.library).pending
      const path = join(world.library, 'notes', BROKEN_FILE)
      writeFileSync(path, brokenText('2026-13-40'), 'utf8')
      state.before = sha(path)
    },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'library' }),
  })
  const POLL = { polling: 100, timeout: 60_000 }

  test('资料库\'s line and the page it opens say 缺少文件头 and list the file; not a row, not a node, not cited; the bytes unchanged', async () => {
    const dir = s.world.library
    const path = join(dir, 'notes', BROKEN_FILE)
    const n = core.libraryCounts(dir).pending
    assert.equal(n, state.countBefore + 1, 'control: the broken file is one more file the core lists')
    assert.ok(core.listPending(dir).some(p => p.file === BROKEN_FILE))
    // the line on 资料库
    await s.page.waitForFunction(() => document.querySelector('[data-part="missing-header-hint"]') !== null, null, POLL)
    const hint = await s.page.evaluate(() => { const h = document.querySelector('[data-part="missing-header-hint"]'); return { count: h.dataset.count, text: h.querySelector('span').textContent, go: h.querySelector('[data-action="go-missing-header"]').textContent.trim() } })
    assert.deepEqual(hint, { count: String(n), text: `${n} 个文件缺少文件头，尚未入库。`, go: LIBRARY.pending.go })
    assert.equal(hint.text, fmt(LIBRARY.pending.hint, { n }), 'the line is the dictionary\'s')
    const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="list"] [data-row]')].map(r => r.dataset.row))
    assert.ok(rows.length >= 1, 'control: 资料库 lists the library\'s files')
    assert.equal(rows.includes(BROKEN_ID), false, 'the broken file is not a row of 资料库')
    assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="library"]').textContent.includes('Zephyr 量子记忆实验')), false)
    // the page
    await s.page.click('[data-part="missing-header-hint"] [data-action="go-missing-header"] button')
    await s.page.waitForFunction(f => document.querySelector(`[data-part="missing-header"] [data-card="${f}"]`) !== null, BROKEN_FILE, POLL)
    const page = await s.page.evaluate(f => {
      const root = document.querySelector('main[data-screen="library"] [data-part="missing-header"]')
      const card = root.querySelector(`[data-card="${f}"]`)
      return { count: root.dataset.count, heading: root.querySelector('#library-title').textContent, name: card.querySelector('h2').textContent, codes: card.querySelector('[data-part="card-codes"]').textContent, tag: card.querySelector('.confirm-number').textContent, text: root.textContent }
    }, BROKEN_FILE)
    assert.equal(page.count, String(n))
    assert.equal(page.heading, `${n} 个文件缺少文件头`, 'listed as a file that 缺少文件头')
    assert.equal(page.heading, fmt(LIBRARY.pending.heading, { n }))
    assert.equal(page.name, BROKEN_FILE)
    assert.ok(page.codes.includes('date'), `what is wrong with it is named: ${page.codes}`)
    assert.equal(page.tag, LIBRARY.pending.notYet)
    assert.equal(page.tag, '尚未入库')
    assert.equal(hint.text.includes('待规范') || page.text.includes('待规范'), false, 'the list\'s old name is not on the page')
    const en = fmt(LIBRARY_EN.pending.heading, { n: 1 })
    assert.ok(/missing a header/.test(en) && /missing a header/.test(fmt(LIBRARY_EN.pending.hint, { n: 1 })), en)
    await s.page.click('[data-action="back-to-library"] button')
    await s.page.waitForFunction(() => document.querySelector('[data-part="list"] [data-row]') !== null, null, POLL)
    // 图谱
    await s.page.click('[data-part="view-switch"] [data-mode="graph"]')
    await s.page.waitForFunction(() => document.querySelector('main[data-screen="graph"][data-state="ready"] [data-node]') !== null, null, POLL)
    const nodes = await s.page.evaluate(() => [...document.querySelectorAll('[data-node]')].map(e => e.dataset.node))
    assert.ok(nodes.some(id => id.startsWith('item:')), 'control: 图谱 draws the library\'s notes')
    assert.deepEqual(nodes.filter(id => id === `item:${BROKEN_ID}` || id === 'topic:坏主题' || id === 'source:secret-src'), [], 'not a node of 图谱')
    // 问库, asked with the file's own title
    await s.page.click('nav.st-libtabs [data-tab="ask"]')
    await s.page.waitForFunction(() => document.querySelector('main[data-screen="ask"][data-state="ready"] textarea[data-field="question"]') !== null, null, POLL)
    const asked = `${QUESTION}讲了什么？` // a plain question (the title alone is taken for a possible change request)
    await s.page.fill('textarea[data-field="question"]', asked)
    await s.page.click('[data-action="send"] button')
    await s.page.waitForFunction(() => { const t = document.querySelector('[data-turn="0"]'); return t && t.dataset.state !== 'asking' }, null, POLL)
    const turn = await s.page.evaluate(() => { const t = document.querySelector('[data-turn="0"]'); return { state: t.dataset.state, text: t.textContent, cites: t.querySelectorAll('[data-cite]').length } })
    assert.equal(turn.state, 'done', turn.text)
    assert.equal(turn.text.includes('量子记忆的一段实验记录') || turn.text.includes(BROKEN_ID), false, 'the answer has nothing of the broken file')
    assert.equal(core.askCandidates(dir, asked).some(c => c.id === BROKEN_ID), false, 'not a candidate of 问库')
    assert.equal(sha(path), state.before, 'the broken file is byte for byte what it was')
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
