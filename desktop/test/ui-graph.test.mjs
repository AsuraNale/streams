// 图谱 (screens/graph.js) on the seeded world plus plan B's extras.
// Redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-2; design P10, F40) — rewritten from v2's: the picture is three rows of the
// template's nodes (主题 → 来源 → 条目), its one filter is the time range (只看已收藏 / 全部条目 and 显示 [[链接]] are gone from the page
// and from the bridge), only files are drawn, the [[links]] always (dashed), and a node clicked shows in the right panel's 详情
// (the box at the bottom right is gone). What is checked:
//   - the nodes are the core's graph's (every item a file of the index; none of the ledger's caught items — mutant r3-graph-caught,
//     a main process that adds them, is red here), each at its row and its place in its row by the core's col; the lines are
//     derived from the core's edges (a topic to its items' sources, a source to its items, an item without a source straight
//     from its topics); the [[links]] are dashed paths and nothing else is; the same data opened twice draws the same picture
//   - one filter only: 最近 30 天 drops the 2023 paper (control: 全部 has it); the bridge refuses the old filters
//   - a node clicked: 详情 says what it is (a topic: 篇数, 关键词数, its items; an item: what it links to and what links to it);
//     「在资料库中打开」 opens that note in 资料库
//   - more than 60 items: the 60 most recent are drawn (drawnItems, plain Node on 70 made-up items)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { MAX_ITEMS, ROW_Y, drawnItems, linesOf } from '../src/renderer/screens/graph.js'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({
  kind: 'seeded',
  waitFor: 'graph',
  prepare: async world => { await seedPlanB(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'graph' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
const nodes = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="graph"] [data-node]')].map(n => ({ id: n.dataset.node, kind: n.dataset.kind, row: Number(n.dataset.row), col: Number(n.dataset.col), x: Number(n.dataset.x), y: Number(n.dataset.y) })))
const lines = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="graph"] [data-edge]')].map(e => ({ key: `${e.dataset.edgeKind} ${e.dataset.edge}`, dashed: e.dataset.dashed === 'true' && e.getAttribute('stroke-dasharray') !== null })))
const drawn = days => s.page.waitForFunction(d => document.querySelector('[data-part="graph"]')?.dataset.days === d, days, POLL)

test('R3-2 only files are drawn — the index\'s entries, none of the ledger\'s caught items — each at its row and its place by the core\'s col; the lines from the core\'s edges, the [[links]] dashed', async () => {
  await drawn('all')
  const g = core.graph(dir(), { days: null, status: 'all', links: true })
  const got = await nodes()
  assert.deepEqual(got.map(n => n.id).sort(), g.nodes.map(n => n.id).sort())
  const items = got.filter(n => n.kind === 'item').map(n => n.id.replace(/^item:/, '')).sort()
  assert.deepEqual(items, core.readIndex(dir()).map(e => e.id).sort(), 'the items are the index (every file, kept and your own)')
  const caught = core.listLibrary(dir(), { view: 'caught' }).items
  assert.ok(caught.length >= 3, 'control: the ledger has items without a file')
  for (const c of caught) assert.ok(!got.some(n => n.id === `item:${c.url}`), `${c.title}: not drawn`)
  for (const n of got) {
    const c = g.nodes.find(x => x.id === n.id)
    assert.equal(n.row, c.row, n.id)
    assert.equal(n.y, ROW_Y[c.row], `${n.id}: its row's height`)
  }
  for (const r of [0, 1, 2]) {
    const row = got.filter(n => n.row === r)
    assert.deepEqual(row.slice().sort((a, b) => a.x - b.x).map(n => n.col), row.map(n => n.col).sort((a, b) => a - b), `row ${r}: left to right in the core's col order`)
  }
  const byId = new Map(g.nodes.map(n => [n.id, n]))
  const want = linesOf(g.edges, byId).map(l => `${l.kind} ${l.from}|${l.to}`).sort()
  const shown = await lines()
  assert.deepEqual(shown.map(l => l.key).sort(), want)
  const links = g.edges.filter(e => e.kind === 'link').map(e => `link ${e.from}|${e.to}`).sort()
  assert.ok(links.length >= 2, 'control: [[links]] between the files')
  assert.deepEqual(shown.filter(l => l.dashed).map(l => l.key).sort(), links, 'the [[links]], and only they, are dashed')
  // an item with a source hangs from its source; the topics reach it through the source
  assert.ok(shown.some(l => l.key.startsWith('topic-source topic:')), 'a topic → source line')
  assert.ok(shown.some(l => l.key === `topic topic:agent 记忆|item:${s.world.planB.mine.id}`), 'your own note (no source) straight from its topic')
  // the same data opened again: every node at the same place
  await s.page.click('[data-part="view-switch"] [data-mode="list"]')
  await s.page.waitForFunction(() => document.querySelector('main[data-screen="library"][data-state="ready"]') !== null, null, POLL)
  await s.page.click('[data-part="view-switch"] [data-mode="graph"]')
  await drawn('all')
  assert.deepEqual(await nodes(), got)
})

test('R3-2 one filter, the time range: 最近 30 天 drops the 2023 paper (control: 全部 has it); the old filters are gone from the page and the bridge', async () => {
  const filters = await s.page.evaluate(() => [...document.querySelectorAll('main[data-screen="graph"] [data-filter]')].map(e => `${e.dataset.filter}:${e.dataset.value}`))
  assert.deepEqual(filters, ['days:30', 'days:all'])
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="graph"] input[type="checkbox"], [data-filter="status"], [data-filter="links"]')), null)
  const paper = `item:${s.world.planB.memgpt.id}`
  assert.ok((await nodes()).some(n => n.id === paper), 'control: 全部 draws it')
  await s.page.click('[data-filter="days"][data-value="30"]')
  await drawn('30')
  assert.ok(!(await nodes()).some(n => n.id === paper), 'the 2023 paper is not in the last 30 days')
  assert.deepEqual((await nodes()).filter(n => n.kind === 'item').map(n => n.id).sort(), core.graph(dir(), { days: 30, status: 'all', links: true }).nodes.filter(n => n.kind === 'item').map(n => n.id).sort())
  await s.page.click('[data-filter="days"][data-value="all"]')
  await drawn('all')
  for (const old of [{ status: 'kept' }, { links: false }, { topics: ['评测'] }]) {
    assert.deepEqual(await s.page.evaluate(f => window.streams.getGraph(f), old), { ok: false, error: { code: 'bad_arguments' } }, JSON.stringify(old))
  }
})

test('R3-2 a node clicked: 详情 shows it — a topic (篇数, 关键词数, its items), an item (what it links to, what links to it); 在资料库中打开 opens the note', async () => {
  const B = s.world.planB
  if (await s.page.evaluate(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab !== 'detail')) await s.page.click('[data-panel-tab="detail"]')
  assert.ok(await s.page.evaluate(() => document.querySelector('[data-part="right-panel"] [data-part="detail-none"]') !== null), 'control: nothing chosen yet')
  const g = core.graph(dir(), { days: null, status: 'all', links: true })
  const topic = 'agent 记忆'
  await s.page.click(`[data-node="topic:${topic}"]`)
  await s.page.waitForFunction(t => document.querySelector(`[data-part="node-detail"][data-node-id="topic:${t}"]`) !== null, topic, POLL)
  const keywords = core.readConfig(dir()).config.topics.find(t => t.name === topic).keywords.length
  const n = g.nodes.find(x => x.id === `topic:${topic}`).count
  const d = await s.page.evaluate(() => ({ title: document.querySelector('[data-part="detail-graph"] [data-part="detail-head"] h2').textContent, meta: document.querySelector('[data-part="node-meta"]').textContent, items: [...document.querySelectorAll('[data-part="node-items"] [data-node-item]')].map(e => e.dataset.nodeItem).sort() }))
  assert.equal(d.title, `主题：${topic}`)
  assert.equal(d.meta, `${n} 篇 · 关键词 ${keywords} 个`)
  assert.deepEqual(d.items, g.edges.filter(e => e.kind === 'topic' && e.from === `topic:${topic}`).map(e => e.to.replace(/^item:/, '')).sort())
  await s.page.click(`[data-node="item:${B.evals.id}"]`)
  await s.page.waitForFunction(i => document.querySelector(`[data-part="node-detail"][data-node-id="item:${i}"]`) !== null, B.evals.id, POLL)
  const it = await s.page.evaluate(() => ({ to: [...document.querySelectorAll('[data-part="node-links"] [data-node-item]')].map(e => e.dataset.nodeItem), from: [...document.querySelectorAll('[data-part="node-backlinks"] [data-node-item]')].map(e => e.dataset.nodeItem) }))
  assert.deepEqual(it.to, g.edges.filter(e => e.kind === 'link' && e.from === `item:${B.evals.id}`).map(e => e.to.replace(/^item:/, '')))
  assert.ok(it.to.includes(B.memgpt.id), 'control: it links to the MemGPT note')
  assert.deepEqual(it.from, g.edges.filter(e => e.kind === 'link' && e.to === `item:${B.evals.id}`).map(e => e.from.replace(/^item:/, '')))
  assert.equal(await s.page.evaluate(i => document.querySelector(`[data-node="item:${i}"]`).getAttribute('aria-pressed'), B.evals.id), 'true')
  await s.page.click('[data-part="detail-graph"] [data-action="open-node"] button')
  await s.page.waitForFunction(i => document.querySelector(`main[data-screen="library"] [data-reader="${i}"]`) !== null, B.evals.id, POLL)
})

test('more than 60 items: the 60 most recent are drawn, in the core\'s order (plain Node)', () => {
  const items = Array.from({ length: 70 }, (_, i) => ({ id: `item:n${i}`, kind: 'item', col: i, row: 2 }))
  const date = id => `2026-10-${String((Number(id.slice(6)) % 30) + 1).padStart(2, '0')}`
  const kept = drawnItems(items, date)
  assert.equal(kept.length, MAX_ITEMS)
  assert.deepEqual(kept.map(n => n.col), [...kept.map(n => n.col)].sort((a, b) => a - b), 'the core\'s order kept')
  const oldest = Math.min(...kept.map(n => date(n.id)).map(d => Number(d.slice(8))))
  const left = items.filter(n => !kept.includes(n)).map(n => Number(date(n.id).slice(8)))
  assert.ok(left.every(d => d <= oldest), 'nothing left out is newer than what is drawn')
  assert.deepEqual(drawnItems(items.slice(0, 5), date), items.slice(0, 5), 'control: 5 items are all drawn')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
