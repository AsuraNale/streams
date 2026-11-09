// 资料库 (screens/library.js), 编辑一条 (screens/edit-dialog.js) and 核验记录 (screens/verdict-dialog.js) on the seeded world plus
// plan B's extras (test/support/seed.mjs seedPlanB). Every number and list on the page is compared with what the core itself
// gives for the same library (libraryCounts, listLibrary, search, readNote, verdictsFor), each with a control that would
// fail if the page showed something else: a filter that changes the list, a search with no hit, an unresolved [[link]].
// The edit: only the title, topics and body are offered; a [[link]] inserted through the search; saved → the file still
// passes the spec, its record (source, dates, scores) is byte for byte what it was, and the linked note's 「链到这里的」 has
// one more; with no topic left 「保存」 stays disabled and the file is untouched (control).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { LIBRARY } from '../src/renderer/texts/library.js'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const s = worldSession({
  kind: 'seeded',
  waitFor: 'library',
  prepare: async world => { await seedPlanB(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'library' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
const rows = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="list"] [data-row]')].map(e => e.dataset.row))
const waitRows = want => s.page.waitForFunction(w => JSON.stringify([...document.querySelectorAll('[data-part="list"] [data-row]')].map(e => e.dataset.row)) === w, JSON.stringify(want), POLL)
const reader = () => s.page.evaluate(() => document.querySelector('[data-reader]')?.dataset.reader ?? null)
const waitReader = id => s.page.waitForFunction(i => document.querySelector('[data-reader]')?.dataset.reader === i && document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id, POLL)
const open = async id => { await s.page.click(`[data-part="list"] [data-row="${id}"] a`); await waitReader(id) }
const view = async id => { await s.page.click(`[data-view="${id}"]`); await s.page.waitForFunction(v => document.querySelector(`[data-view="${v}"]`)?.getAttribute('aria-current') === 'true', id, POLL) }
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')

test('the four tabs carry the core\'s counts; 已收藏 lists the core\'s kept notes in its order, the first one open', async () => {
  const counts = core.libraryCounts(dir())
  assert.deepEqual(counts, { kept: 3, authored: 1, caught: 5, pending: 1 }, 'control: the world is what seedPlanB says')
  const shown = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-view]')].map(e => [e.dataset.view, Number(e.dataset.count)])))
  assert.deepEqual(shown, counts)
  const kept = core.listLibrary(dir(), { view: 'kept' }).items.map(i => i.id)
  // v2 package H: with notes kept the page opens on 已收藏 (with none it opens on 抓到的: test/ui-library-reader.test.mjs)
  await s.page.waitForFunction(() => document.querySelector('[data-view="kept"]')?.getAttribute('aria-current') === 'true', null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-view="caught"]').getAttribute('aria-current')), null)
  assert.deepEqual(await rows(), kept)
  await waitReader(kept[0])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row][data-current="true"]').dataset.row), kept[0])
})

test('the reader: the Markdown cut into elements; a [[link]] to a note in the library opens it, one to nothing is not a link', async () => {
  const B = s.world.planB
  await open(B.memgpt.id)
  const md = await s.page.evaluate(() => {
    const body = document.querySelector('[data-part="body"]')
    return {
      blocks: [...body.children].map(e => e.dataset.md),
      strong: body.querySelector('strong')?.textContent,
      em: body.querySelector('em')?.textContent,
      items: body.querySelectorAll('ul li').length,
      wiki: [...body.querySelectorAll('[data-wiki-id]')].map(e => [e.dataset.wiki, e.dataset.wikiId]),
      raw: body.textContent.includes('**') || body.textContent.includes('[['),
    }
  })
  assert.deepEqual(md.blocks, ['p', 'ul'])
  assert.equal(md.strong, '这是什么：')
  assert.equal(md.em, '长对话')
  assert.equal(md.items, 3)
  assert.deepEqual(md.wiki, [[B.mine.title, B.mine.id]])
  assert.equal(md.raw, false, 'no Markdown marks left as text')
  await s.page.click(`[data-wiki-id="${B.mine.id}"]`)
  await waitReader(B.mine.id)
  const mine = await s.page.evaluate(() => ({ h: [...document.querySelectorAll('[data-part="body"] [data-md="heading"]')].map(e => [e.tagName, e.textContent]), code: document.querySelector('[data-part="body"] code')?.textContent }))
  assert.deepEqual(mine.h, [['H2', '记忆方案选型'], ['H3', '方案 A'], ['H3', '方案 B']])
  assert.equal(mine.code, '每轮多一次调用')
  // control: the evals note names a note the library does not have — drawn, not clickable
  await view('kept')
  await open(B.evals.id)
  const missing = await s.page.evaluate(() => [...document.querySelectorAll('[data-wiki-missing]')].map(e => [e.dataset.wiki, e.tagName]))
  assert.deepEqual(missing, [[B.missingLink, 'SPAN']])
})

test('the right panel: topics, source, scores, file; 链到这里的 and 同一来源的 are the core\'s readNote', async () => {
  const B = s.world.planB
  await open(B.memgpt.id)
  const want = core.readNote(dir(), B.memgpt.id)
  const panel = await s.page.evaluate(() => ({
    rows: Object.fromEntries([...document.querySelectorAll('[data-part="note-panel"] [data-panel-row]')].map(e => [e.dataset.panelRow, e.querySelector('dd').textContent])),
    back: [...document.querySelectorAll('[data-part="backlinks"] [data-link]')].map(e => e.dataset.link),
    same: [...document.querySelectorAll('[data-part="same-source"] [data-link]')].map(e => e.dataset.link),
  }))
  assert.equal(panel.rows.topics, want.entry.topics.join(' · '))
  assert.equal(panel.rows.source, want.entry.source_name)
  // each score with its reason from the header (core readNote.scores); a score without a reason shows the number alone
  const shown = id => (want.scores[id]?.reason ? `${want.entry.scores[id].toFixed(2)} · ${want.scores[id].reason}` : want.entry.scores[id].toFixed(2))
  assert.ok(Object.values(want.scores).some(v => v.reason), 'control: the seed note carries reasons')
  assert.equal(panel.rows.relevance, shown('relevance'))
  assert.equal(panel.rows.substance, shown('substance'))
  assert.equal(panel.rows.file, want.file)
  assert.deepEqual(panel.back, want.backlinks.map(b => b.id))
  assert.ok(panel.back.length === 2, 'control: two notes link here')
  assert.deepEqual(panel.same, want.sameSource.map(b => b.id))
  await s.page.click(`[data-part="backlinks"] [data-link="${B.evals.id}"] button`)
  await waitReader(B.evals.id)
})

test('the search box: the core\'s search, in its order; a word with no hit says so (control)', async () => {
  await s.page.fill('input[data-field="search"]', 'MemGPT')
  const want = core.search(dir(), 'MemGPT', { view: 'kept' }).map(r => r.id)
  assert.ok(want.length >= 2, 'control: more than one hit')
  await waitRows(want)
  await s.page.fill('input[data-field="search"]', 'zzqq-nothing-here')
  await s.page.waitForFunction(() => document.querySelector('[data-part="search-none"]') !== null, null, POLL)
  assert.deepEqual(await rows(), [])
  await s.page.fill('input[data-field="search"]', '')
  await waitRows(core.listLibrary(dir(), { view: 'kept' }).items.map(i => i.id))
})

test('a topic filter and 最近 30 天 give the core\'s filtered lists; switching them off brings the whole list back', async () => {
  const all = core.listLibrary(dir(), { view: 'kept' }).items.map(i => i.id)
  const evals = core.listLibrary(dir(), { view: 'kept', topics: ['评测'] }).items.map(i => i.id)
  assert.notDeepEqual(evals, all, 'control: the filter changes the list')
  await s.page.click('[data-filter-topic="评测"]')
  await waitRows(evals)
  await s.page.click('[data-filter-topic="评测"]')
  await waitRows(all)
  const recent = core.listLibrary(dir(), { view: 'kept', days: 30 }).items.map(i => i.id)
  assert.ok(!recent.includes(s.world.planB.memgpt.id), 'control: the 2023 paper is not in the last 30 days')
  await s.page.click('[data-filter-days]')
  await waitRows(recent)
  await s.page.click('[data-filter-days]')
  await waitRows(all)
})

test('抓到的: every item short of kept or let go, with its scores and the step it stopped at; 待规范 lists the file and its problem', async () => {
  await view('caught')
  const caught = core.listLibrary(dir(), { view: 'caught' }).items
  await waitRows(caught.map(i => i.url))
  const stopped = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="list"] [data-row]')].map(e => e.dataset.stopped))
  assert.deepEqual(stopped, caught.map(i => i.stoppedAt))
  const seven = caught.find(i => i.stoppedAt === 'relevance')
  assert.ok(seven, 'control: one item stopped at relevance')
  const words = await s.page.evaluate(u => document.querySelector(`[data-row="${u}"] .lib-row__stopped`).textContent, seven.url)
  assert.equal(words, LIBRARY.caught.stopped.relevance)
  const score = await s.page.evaluate(u => document.querySelector(`[data-row="${u}"] [data-score="relevance"]`).dataset.value, seven.url)
  assert.equal(Number(score), seven.scores.relevance.score)
  await view('pending')
  await waitRows(['untitled.md'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row="untitled.md"] .lib-row__meta').textContent), LIBRARY.pending.codes['no-frontmatter'])
})

test('核验记录: the evals note\'s summary over two rounds, 「说做了其实没做」 on its own line, the result passed in 2 rounds — as verdictsFor gives it', async () => {
  const B = s.world.planB
  await view('kept')
  await open(B.evals.id)
  await s.page.click('[data-action="verdicts"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="verdicts"] .vd[data-state="ready"] [data-verdict-node]') !== null, null, POLL)
  const want = core.verdictsFor(dir(), B.evals.source)
  const got = await s.page.evaluate(() => [...document.querySelectorAll('[data-verdict-node] [data-round]')].map(r => ({
    round: Number(r.dataset.round),
    items: [...r.querySelectorAll('[data-check]')].map(c => [c.dataset.check, c.dataset.passed === 'true', c.dataset.kind]),
    said: [...r.querySelectorAll('[data-said-not-done]')].map(c => c.dataset.saidNotDone),
  })))
  assert.deepEqual(got, want.map(g => ({ round: g.round, items: g.items.map(i => [i.item, i.passed, i.kind]), said: g.items.filter(i => i.claimedNotDone).map(i => i.item) })))
  assert.deepEqual(got.map(g => g.said), [['numbers-in-source'], []], 'control: round 1 has the one claimed-but-failed item')
  const result = await s.page.evaluate(() => { const r = document.querySelector('[data-part="verdict-result"]'); return [r.dataset.passed, r.dataset.rounds] })
  assert.deepEqual(result, ['true', '2'])
  await s.page.click('[data-action="close-verdicts"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="verdicts"]') === null, null, POLL)
})

// v2 package H: 用 Obsidian 打开 is in 「更多」 now (a note with a file); 打开原文 opens the reading window (test/ui-reader.test.mjs,
// on a site on this machine — this world's sources are example.org addresses, so here only 「在浏览器里打开」 is clicked, which a
// test run only logs)
test('更多 → 用 Obsidian 打开 / 在浏览器里打开 go through the bridge (a test run only writes the log); 打开原文 is there for a web source', async () => {
  const B = s.world.planB
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="item-actions"]')?.dataset.id), B.evals.id)
  assert.ok(await s.page.evaluate(() => document.querySelector('[data-part="library-head"] [data-action="source"] button') !== null))
  await s.page.click('[data-part="library-head"] [data-action="more"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-menu]') !== null, null, { polling: 100, timeout: 20_000 })
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-menu-item]')].map(e => e.dataset.menuItem)), ['obsidian', 'folder', 'browser'])
  await s.page.click('[data-menu-item="obsidian"]')
  const path = join(dir(), 'notes', `${B.evals.id}.md`)
  await waitFor(() => log().includes(`not opened in a test run: obsidian ${path}`))
  await s.page.click('[data-part="library-head"] [data-action="more"] button')
  await s.page.click('[data-menu-item="browser"]')
  await waitFor(() => log().includes(`not opened in a test run: ${B.evals.source}`))
})

async function waitFor(fn, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (fn()) return; await new Promise(r => setTimeout(r, 100)) }
  assert.fail('timed out')
}

test('编辑: four things only; no topic left → 保存 disabled and nothing written (control); a [[link]] inserted and saved → the file passes, its record is unchanged, the linked note has one more backlink', async () => {
  const B = s.world.planB
  const id = s.world.seed.kept.id
  const file = join(dir(), 'notes', `${id}.md`)
  await view('kept')
  await open(id)
  await s.page.click('[data-action="edit"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="edit"]') !== null, null, POLL)
  const fields = await s.page.evaluate(() => [...document.querySelectorAll('[data-dialog="edit"] [data-field]')].map(e => e.dataset.field))
  assert.deepEqual(fields, ['title', 'add-topic', 'body'])
  const before = sha(file)
  const record = () => { const m = core.parseFrontmatter(readFileSync(file, 'utf8')).meta; return JSON.stringify({ source: m.source, source_name: m.source_name, date: m.date, collected: m.collected, kept: m.kept, status: m.status, scores: m.scores }) }
  const rec = record()
  // control: take every topic off — 保存 cannot be pressed, the file stays
  const topics = await s.page.evaluate(() => [...document.querySelectorAll('[data-dialog="edit"] [data-topic]')].map(e => e.dataset.topic))
  for (const t of topics) await s.page.click(`[data-dialog="edit"] [data-topic="${t}"] [data-action="remove-topic"]`)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="save-edit"] button').disabled), true)
  assert.equal(sha(file), before)
  await s.page.selectOption('[data-dialog="edit"] select[data-field="add-topic"]', topics[0])
  await s.page.waitForFunction(t => document.querySelector(`[data-dialog="edit"] [data-topic="${t}"]`) !== null, topics[0], POLL)
  // the cursor at the end of the body, then 插入 [[链接]]… → a search → the note
  await s.page.click('textarea[data-field="body"]')
  await s.page.keyboard.press('Control+End')
  await s.page.keyboard.type('\n我的批注：对比 ')
  await s.page.click('[data-action="insert-link"] button')
  await s.page.fill('input[data-field="link-search"]', '记忆方案选型')
  await s.page.waitForFunction(i => document.querySelector(`[data-link-option="${i}"]`) !== null, B.mine.id, POLL)
  await s.page.click(`[data-link-option="${B.mine.id}"]`)
  const body = await s.page.evaluate(() => document.querySelector('textarea[data-field="body"]').value)
  assert.ok(body.endsWith(`我的批注：对比 [[${B.mine.title}]]`), body)
  const backBefore = core.readNote(dir(), B.mine.id).backlinks.map(b => b.id)
  assert.ok(!backBefore.includes(id), 'control: not linked before')
  await s.page.click('[data-action="save-edit"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="edit"]') === null, null, POLL)
  await s.page.waitForFunction(i => document.querySelector(`[data-part="body"] [data-wiki-id="${i}"]`) !== null, B.mine.id, POLL)
  const text = readFileSync(file, 'utf8')
  assert.equal(core.validateNote({ fileName: `${id}.md`, text, config: core.readConfig(dir()).config }).ok, true, 'the file still passes the spec')
  assert.equal(record(), rec, 'source, dates, status and scores untouched')
  assert.deepEqual(core.readNote(dir(), B.mine.id).backlinks.map(b => b.id).sort(), [...backBefore, id].sort())
  // and the page says so: open the linked note, its 链到这里的 has the edited one
  await s.page.click(`[data-part="body"] [data-wiki-id="${B.mine.id}"]`)
  await waitReader(B.mine.id)
  await s.page.waitForFunction(i => document.querySelector(`[data-part="backlinks"] [data-link="${i}"]`) !== null, id, POLL)
  assert.equal(await reader(), B.mine.id)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
