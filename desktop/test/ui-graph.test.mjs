// 图谱 (screens/graph.js) on the seeded world plus plan B's extras. Every node sits at the core's row / col times the fixed
// spacing; the edges are the core's; the same data opened twice draws every node at the same place (and a filter that
// changes the data does change the picture: control); [[links]] off → no dashed edge (control: three with them on);
// 最近 30 天 drops the 2023 paper; a click on an item opens its box with what it links to, and 「打开」 goes to that note in
// 资料库. More than 60 items: only the 60 most recent are drawn (drawnItems, checked in plain Node on 70 made-up items).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { COL_GAP, MAX_ITEMS, PAD_X, PAD_Y, ROW_GAP, drawnItems } from '../src/renderer/screens/graph.js'
import { seedPlanB, worldSession } from './support/seed.mjs'
// v2 package F: 图谱 is a view of the library's 资料库 tab ([data-mode="graph"]; its <main> is still data-screen="graph") and 今日 is 概览: away and back goes through the tabs, not v1.0's sidebar entries; the assertions are v1.0's

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({
  kind: 'seeded',
  waitFor: 'graph',
  prepare: async world => { await seedPlanB(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'graph' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
const nodes = () => s.page.evaluate(() => [...document.querySelectorAll('[data-node]')].map(g => {
  const c = g.querySelector('circle')
  return { id: g.dataset.node, row: Number(g.dataset.row), col: Number(g.dataset.col), x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }
}))
const edges = () => s.page.evaluate(() => [...document.querySelectorAll('[data-edge]')].map(e => `${e.dataset.edgeKind} ${e.dataset.edge}`).sort())
const coreEdges = g => g.edges.map(e => `${e.kind} ${e.from}|${e.to}`).sort()
const settled = () => s.page.waitForFunction(() => document.querySelector('main[data-screen="graph"][data-state="ready"] svg[data-part="graph"]') !== null, null, POLL)
// the data drawn is the data asked for: the svg carries the filters the core echoed
const drawn = (name, value) => s.page.waitForFunction(([n, v]) => document.querySelector('svg[data-part="graph"]')?.dataset[n] === v, [name, value], POLL)
const filter = async (name, value) => {
  await s.page.click(`[data-filter="${name}"][data-value="${value}"]`)
  await drawn(name, value)
}

test('every node at the core\'s row and col times the fixed spacing; the edges are the core\'s', async () => {
  const g = core.graph(dir(), { days: null, status: 'all', links: true })
  const shown = await nodes()
  assert.deepEqual(shown.map(n => [n.id, n.row, n.col]), g.nodes.map(n => [n.id, n.row, n.col]))
  for (const n of shown) assert.deepEqual([n.x, n.y], [PAD_X + n.col * COL_GAP, PAD_Y + n.row * ROW_GAP], n.id)
  assert.deepEqual(await edges(), coreEdges(g))
  assert.equal(g.edges.filter(e => e.kind === 'link').length, 3, 'control: the extras link three times')
})

test('the same data opened twice: every node at the same place; a filter that changes the data changes the picture (control)', async () => {
  const first = await nodes()
  await s.page.click('.st-lib-tabs [data-tab="overview"]')
  await s.page.waitForFunction(() => document.querySelector('main[data-screen="overview"][data-state="ready"]') !== null, null, POLL)
  await s.page.click('.st-lib-tabs [data-tab="library"]')
  await s.page.waitForFunction(() => document.querySelector('main[data-screen="library"][data-state="ready"]') !== null, null, POLL)
  await s.page.click('[data-mode="graph"]')
  await settled()
  assert.deepEqual(await nodes(), first)
  await filter('status', 'kept')
  const kept = await nodes()
  assert.notDeepEqual(kept, first)
  assert.equal(kept.some(n => n.id === `item:${s.world.planB.mine.id}`), false, 'the note the user wrote is not kept')
  assert.deepEqual(kept.map(n => [n.id, n.col]), core.graph(dir(), { status: 'kept' }).nodes.map(n => [n.id, n.col]))
  await filter('status', 'all')
  assert.deepEqual(await nodes(), first)
})

test('[[links]] off: no dashed edge; 最近 30 天: the 2023 paper is not drawn', async () => {
  await s.page.click('input[data-filter="links"]')
  await drawn('links', 'false')
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-edge-kind="link"]').length), 0)
  assert.deepEqual(await edges(), coreEdges(core.graph(dir(), { links: false })))
  await s.page.click('input[data-filter="links"]')
  await drawn('links', 'true')
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-edge-kind="link"]').length), 3)
  await filter('days', '30')
  const shown = await nodes()
  assert.equal(shown.some(n => n.id === `item:${s.world.planB.memgpt.id}`), false)
  assert.deepEqual(shown.map(n => n.id), core.graph(dir(), { days: 30 }).nodes.map(n => n.id))
  await filter('days', 'all')
})

test('a click on an item: its box says what it links to; 打开 goes to that note in 资料库', async () => {
  const B = s.world.planB
  await s.page.click(`[data-node="item:${B.evals.id}"]`)
  await s.page.waitForFunction(i => document.querySelector(`[data-part="node-detail"][data-node-id="item:${i}"]`) !== null, B.evals.id, POLL)
  await s.page.waitForFunction(() => document.querySelector('[data-part="node-detail"] .st-t-sub') !== null, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="node-links"]').textContent), `链到：${B.memgpt.title}`)
  await s.page.click('[data-action="open-node"] button')
  await s.page.waitForFunction(i => document.querySelector(`main[data-screen="library"] [data-reader="${i}"]`) !== null, B.evals.id, POLL)
})

test('more than 60 items: the 60 most recent are drawn, in the core\'s order (plain Node)', () => {
  const items = Array.from({ length: 70 }, (_, i) => ({ id: `item:n${i}`, kind: 'item', col: i, row: 2 }))
  const date = id => `2026-10-${String((Number(id.slice(6)) % 30) + 1).padStart(2, '0')}`
  const drawn = drawnItems(items, date)
  assert.equal(drawn.length, MAX_ITEMS)
  assert.deepEqual(drawn.map(n => n.col), [...drawn.map(n => n.col)].sort((a, b) => a - b), 'the core\'s order kept')
  const oldest = Math.min(...drawn.map(n => date(n.id)).map(d => Number(d.slice(8))))
  const left = items.filter(n => !drawn.includes(n)).map(n => Number(date(n.id).slice(8)))
  assert.ok(left.every(d => d <= oldest), 'nothing left out is newer than what is drawn')
  assert.deepEqual(drawnItems(items.slice(0, 5), date), items.slice(0, 5), 'control: 5 items are all drawn')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
