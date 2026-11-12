// 资料库 (screens/library.js), 编辑笔记 (screens/edit-dialog.js), 缺少文件头's line and the folded 核验记录 (verdict-dialog.js) on the
// seeded world plus plan B's extras (test/support/seed.mjs seedPlanB: kept notes, one of your own, a file without a header, a
// record checked in two rounds). Every number and list on the page is compared with what the core itself gives for the same
// library (libraryCounts, listLibrary, search, readNote, verdictsFor), each with a control that would fail if the page showed
// something else.
// Redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-1, R3-3, R3-4; design P09 · P11 · P12) — rewritten from v2's: the four
// tabs (已收藏 · 我写的 · 抓到的 · 待规范) are three filters (全部 · 已收藏 · 我的笔记) and 资料库 lists only files; the head's buttons
// are the reading area's (编辑 · 查看原文 · 更多); the old third column is 详情 with only what the reading area has not (入选理由,
// 核验记录 folded, 文件, 反向链接, 同来源内容); 编辑 is the template's dialog; 「待规范」 is a line that leads to its page (the
// page's own checks: test/ui-import.test.mjs). Reverse checks: a 「全部」 that lists the caught items (mutant r3-all-lists-caught)
// is red in the first test; with no file lacking a header the line is not there (test/ui-library-reader.test.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { EDIT, LIBRARY } from '../src/renderer/texts/library.js'
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
const open = async id => { await s.page.click(`[data-part="list"] [data-row="${id}"]`); await waitReader(id) }
const view = async id => { await s.page.click(`[data-view="${id}"]`); await s.page.waitForFunction(v => document.querySelector(`[data-view="${v}"]`)?.getAttribute('aria-current') === 'true', id, POLL) }
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
async function waitFor(fn, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (fn()) return; await new Promise(r => setTimeout(r, 100)) }
  assert.fail('timed out')
}

test('R3-1 three filters with the core\'s counts; 全部 is every file (the index) and none of the caught items; 已收藏 and 我的笔记 the core\'s lists; no 抓到的 / 待规范 / 添加链接', async () => {
  const counts = core.libraryCounts(dir())
  assert.deepEqual([counts.all, counts.kept, counts.authored, counts.pending], [4, 3, 1, 1], 'control: the world is what seedPlanB says')
  const caught = core.listLibrary(dir(), { view: 'caught' }).items
  assert.ok(caught.length >= 3, 'control: caught items a wrong 「全部」 would show')
  await s.page.waitForFunction(() => document.querySelector('[data-view="all"]')?.getAttribute('aria-current') === 'true', null, POLL)
  const shown = await s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-view]')].map(e => [e.dataset.view, Number(e.dataset.count)])))
  assert.deepEqual(shown, { all: counts.all, kept: counts.kept, authored: counts.authored })
  const all = core.listLibrary(dir(), { view: 'all' }).items.map(i => i.id)
  await waitRows(all)
  const text = await s.page.evaluate(() => document.querySelector('[data-part="list"]').textContent)
  for (const c of caught) assert.ok(!(await rows()).includes(c.url) && !text.includes(c.title), `${c.title} (caught, no file) is not listed`)
  // the first of the list is open
  await waitReader(all[0])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row][data-current="true"]').dataset.row), all[0])
  await view('kept')
  await waitRows(core.listLibrary(dir(), { view: 'kept' }).items.map(i => i.id))
  await view('authored')
  await waitRows(core.listLibrary(dir(), { view: 'authored' }).items.map(i => i.id))
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row] [data-snippet], [data-row] p')?.textContent.includes('**')), false, 'no Markdown marks in a row')
  await view('all')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-view="caught"], [data-view="pending"]')), null)
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="library"] [data-action="add-link"]')), null)
  // a file without a header: the line, with its count
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="missing-header-hint"]')?.dataset.count), String(counts.pending))
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="missing-header-hint"] span').textContent), `${counts.pending} 个文件缺少文件头，尚未入库。`)
})

test('the reading paper: 来源 / 主题, the title, 发布 · 收藏, the Markdown cut into elements; a [[link]] to a note opens it, one to nothing is not a link', async () => {
  const B = s.world.planB
  await open(B.memgpt.id)
  const head = await s.page.evaluate(() => ({ where: document.querySelector('[data-part="reader-source"]').textContent, meta: document.querySelector('[data-part="reader-meta"]').textContent }))
  const n = core.readNote(dir(), B.memgpt.id).entry
  assert.equal(head.where, `${n.source_name} / ${n.topics.join(' · ')}`)
  assert.equal(head.meta, `发布 ${n.date} · 收藏 ${n.kept}`)
  const md = await s.page.evaluate(() => {
    const body = document.querySelector('[data-part="body"]')
    return {
      blocks: [...body.children].map(e => e.dataset.md),
      strong: body.querySelector('strong')?.textContent,
      items: body.querySelectorAll('ul li').length,
      wiki: [...body.querySelectorAll('[data-wiki-id]')].map(e => [e.dataset.wiki, e.dataset.wikiId]),
      raw: body.textContent.includes('**') || body.textContent.includes('[['),
    }
  })
  assert.deepEqual(md.blocks, ['p', 'ul'])
  assert.equal(md.strong, '这是什么：')
  assert.equal(md.items, 3)
  assert.deepEqual(md.wiki, [[B.mine.title, B.mine.id]])
  assert.equal(md.raw, false, 'no Markdown marks left as text')
  await s.page.click(`[data-wiki-id="${B.mine.id}"]`)
  await waitReader(B.mine.id)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="item-actions"] [data-part="mark"]').textContent), LIBRARY.reader.status.authored)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="item-actions"] [data-action="source"]')), null, 'a note of your own has no web original')
  await open(B.evals.id)
  const missing = await s.page.evaluate(() => [...document.querySelectorAll('[data-wiki-missing]')].map(e => [e.dataset.wiki, e.tagName]))
  assert.deepEqual(missing, [[B.missingLink, 'SPAN']])
})

test('R3-1 详情 has only what the paper has not: 入选理由 (each score with its reason), 核验记录 folded (verdictsFor), 文件 (its path), 反向链接, 同来源内容 — a click selects that note', async () => {
  const B = s.world.planB
  await open(B.evals.id)
  if (await s.page.evaluate(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab !== 'detail')) await s.page.click('[data-panel-tab="detail"]')
  const want = core.readNote(dir(), B.evals.id)
  const got = await s.page.evaluate(() => ({
    title: document.querySelector('[data-part="detail-library"] [data-part="detail-head"] h2')?.textContent,
    scores: [...document.querySelectorAll('[data-part="detail-reasons"] [data-detail-score]')].map(e => [e.dataset.detailScore, e.querySelector('dd').textContent]),
    file: document.querySelector('[data-part="detail-file"] [data-path]')?.dataset.path,
    parts: [...document.querySelectorAll('[data-part="note-panel"] > [data-part]')].map(e => e.dataset.part),
  }))
  assert.equal(got.title, want.entry.title)
  assert.deepEqual(got.scores, Object.keys(want.scores).map(k => [k, want.scores[k].reason]))
  assert.equal(got.file, join('notes', `${B.evals.id}.md`))
  assert.deepEqual(got.parts, ['detail-reasons', 'detail-check', 'detail-file', 'backlinks', 'same-source'])
  // what the paper shows (the source line, the dates, the topics) is not repeated here
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="note-panel"] [data-panel-row]')), null)
  // 核验记录: folded, its line says each step's items; opened, the rounds as verdictsFor gives them
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="detail-record"]').dataset.open), 'false')
  await s.page.click('[data-part="detail-record"] summary')
  await s.page.waitForFunction(() => document.querySelector('[data-part="detail-record"] .vd[data-state="ready"] [data-verdict-node]') !== null, null, POLL)
  const v = core.verdictsFor(dir(), B.evals.source)
  const rounds = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="detail-record"] [data-round]')].map(r => [Number(r.dataset.round), [...r.querySelectorAll('[data-check]')].map(c => [c.dataset.check, c.dataset.passed === 'true'])]))
  assert.deepEqual(rounds, v.map(g => [g.round, g.items.map(i => [i.item, i.passed])]))
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="verdicts"]')), null, 'no dialog')
  // 反向链接 and 同来源内容 are the core's readNote; a click selects that note in 资料库
  await open(B.memgpt.id)
  const m = core.readNote(dir(), B.memgpt.id)
  const links = await s.page.evaluate(() => ({ back: [...document.querySelectorAll('[data-part="backlinks"] [data-link]')].map(e => e.dataset.link), same: [...document.querySelectorAll('[data-part="same-source"] [data-link]')].map(e => e.dataset.link) }))
  assert.deepEqual(links.back, m.backlinks.map(b => b.id))
  assert.ok(links.back.length === 2, 'control: two notes link here')
  assert.deepEqual(links.same, m.sameSource.map(b => b.id))
  assert.ok(links.same.length >= 1, 'control: one from the same source')
  await s.page.click(`[data-part="same-source"] [data-link="${links.same[0]}"]`)
  await waitReader(links.same[0])
  assert.equal(await s.page.evaluate(i => document.querySelector(`[data-part="list"] [data-row="${i}"]`)?.dataset.current, links.same[0]), 'true', 'selected in the list too')
})

test('the search box: the core\'s search, in its order, its snippets without Markdown marks; a word with no hit says so (control)', async () => {
  await s.page.fill('input[data-field="search"]', 'MemGPT')
  const want = core.search(dir(), 'MemGPT', { view: 'all' }).map(r => r.id)
  assert.ok(want.length >= 2, 'control: more than one hit')
  await waitRows(want)
  assert.equal(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="list"] [data-snippet]')].some(e => /\*\*|\[\[/.test(e.textContent))), false)
  await s.page.fill('input[data-field="search"]', 'zzqq-nothing-here')
  await s.page.waitForFunction(() => document.querySelector('[data-part="search-none"]') !== null, null, POLL)
  assert.deepEqual(await rows(), [])
  await s.page.fill('input[data-field="search"]', '')
  await waitRows(core.listLibrary(dir(), { view: 'all' }).items.map(i => i.id))
})

test('a topic filter and 最近 30 天 give the core\'s filtered lists; switching them off brings the whole list back', async () => {
  const all = core.listLibrary(dir(), { view: 'all' }).items.map(i => i.id)
  const evals = core.listLibrary(dir(), { view: 'all', topics: ['评测'] }).items.map(i => i.id)
  assert.notDeepEqual(evals, all, 'control: the filter changes the list')
  await s.page.click('[data-filter-topic="评测"]')
  await waitRows(evals)
  await s.page.click('[data-filter-topic="评测"]')
  await waitRows(all)
  const recent = core.listLibrary(dir(), { view: 'all', days: 30 }).items.map(i => i.id)
  assert.ok(!recent.includes(s.world.planB.memgpt.id), 'control: the 2023 paper is not in the last 30 days')
  await s.page.click('[data-filter-days]')
  await waitRows(recent)
  await s.page.click('[data-filter-days]')
  await waitRows(all)
})

// the sources of this world are example.org addresses: here only 「在浏览器中打开」 is clicked (a test run only logs it); 查看原文 opens
// the reading window on a site on this machine: test/ui-library-reader.test.mjs and test/ui-reader.test.mjs
test('R3-1 the reading area\'s buttons: 编辑 · 查看原文 · 更多 ▾ = 在 Obsidian 中打开 · 在资源管理器中显示 · 在浏览器中打开 (each through the bridge)', async () => {
  const B = s.world.planB
  await open(B.evals.id)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-part="item-actions"] [data-action]')].map(e => e.dataset.action)), ['edit', 'source', 'more'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="item-actions"] [data-part="mark"]').textContent), LIBRARY.reader.status.kept)
  await s.page.click('[data-part="item-actions"] [data-action="more"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-menu]') !== null, null, POLL)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-menu-item]')].map(e => [e.dataset.menuItem, e.textContent])), [['obsidian', LIBRARY.actions.obsidian], ['folder', LIBRARY.actions.folder], ['browser', LIBRARY.actions.browser]])
  await s.page.click('[data-menu-item="obsidian"]')
  const path = join(dir(), 'notes', `${B.evals.id}.md`)
  await waitFor(() => log().includes(`not opened in a test run: obsidian ${path}`))
  await s.page.click('[data-part="item-actions"] [data-action="more"] button')
  await s.page.click('[data-menu-item="browser"]')
  await waitFor(() => log().includes(`not opened in a test run: ${B.evals.source}`))
})

test('R3-3 编辑笔记 (the template\'s dialog): title, topics, body, 插入链接 and the record line — nothing else; no topic left → 保存 disabled, nothing written (control); a new topic and a [[link]] saved → the file passes, its record unchanged, one more backlink', async () => {
  const B = s.world.planB
  const id = s.world.seed.kept.id
  const file = join(dir(), 'notes', `${id}.md`)
  await view('kept')
  await open(id)
  await s.page.click('[data-part="item-actions"] [data-action="edit"] button')
  await s.page.waitForFunction(() => document.querySelector('dialog[data-dialog="edit"][open]') !== null, null, POLL)
  const shape = await s.page.evaluate(() => {
    const d = document.querySelector('dialog[data-dialog="edit"]')
    return {
      fields: [...d.querySelectorAll('[data-field]')].map(e => e.dataset.field),
      actions: [...d.querySelectorAll('[data-action]')].map(e => e.dataset.action).filter(a => a !== 'remove-topic'),
      record: d.querySelector('[data-part="record"]').textContent,
      title: d.querySelector('.dialog-head h2').textContent,
    }
  })
  assert.deepEqual(shape.fields, ['title', 'body'])
  assert.deepEqual(shape.actions, ['close-edit', 'add-topic', 'save-edit', 'insert-link', 'cancel-edit'])
  assert.equal(shape.record, EDIT.record)
  assert.equal(shape.record, '仅可修改标题、主题、正文和链接；来源、日期、评分为记录字段，不可修改。')
  assert.equal(shape.title, '编辑笔记')
  const before = sha(file)
  const record = () => { const m = core.parseFrontmatter(readFileSync(file, 'utf8')).meta; return JSON.stringify({ source: m.source, source_name: m.source_name, date: m.date, collected: m.collected, kept: m.kept, status: m.status, scores: m.scores }) }
  const rec = record()
  // control: take every topic off — 保存 cannot be pressed, the file stays
  const topics = await s.page.evaluate(() => [...document.querySelectorAll('[data-dialog="edit"] [data-topic]')].map(e => e.dataset.topic))
  for (const t of topics) await s.page.click(`[data-dialog="edit"] [data-topic="${t}"] [data-action="remove-topic"]`)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="save-edit"] button').disabled), true)
  assert.equal(sha(file), before)
  // ＋ 添加主题: one the library has (from its list) and a new one
  await s.page.click('[data-dialog="edit"] [data-action="add-topic"] button')
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('#edit-known-topics option')].map(o => o.value).sort()), core.readConfig(dir()).config.topics.map(t => t.name).sort())
  await s.page.fill('[data-dialog="edit"] input[data-field="add-topic"]', topics[0])
  await s.page.press('[data-dialog="edit"] input[data-field="add-topic"]', 'Enter')
  await s.page.waitForFunction(t => document.querySelector(`[data-dialog="edit"] [data-topic="${t}"]`) !== null, topics[0], POLL)
  await s.page.click('[data-dialog="edit"] [data-action="add-topic"] button')
  await s.page.fill('[data-dialog="edit"] input[data-field="add-topic"]', '新主题 R3')
  await s.page.press('[data-dialog="edit"] input[data-field="add-topic"]', 'Enter')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="edit"] [data-topic="新主题 R3"]') !== null, null, POLL)
  // the cursor at the end of the body, then 插入链接 → a search → the note
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
  assert.deepEqual(core.parseFrontmatter(text).meta.topics, [topics[0], '新主题 R3'])
  assert.deepEqual(core.readNote(dir(), B.mine.id).backlinks.map(b => b.id).sort(), [...backBefore, id].sort())
  await s.page.click(`[data-part="body"] [data-wiki-id="${B.mine.id}"]`)
  await waitReader(B.mine.id)
  await s.page.waitForFunction(i => document.querySelector(`[data-part="backlinks"] [data-link="${i}"]`) !== null, id, POLL)
  assert.equal(await reader(), B.mine.id)
  // the bridge refuses a record field, whatever the page sends (V2: only title / topics / body)
  const r = await s.page.evaluate(i => window.streams.editNote(i, { source: 'https://elsewhere.example/' }), id)
  assert.deepEqual(r, { ok: false, error: { code: 'bad_arguments' } })
  assert.equal(record(), rec)
})

test('R3-4 the line 「n 个文件缺少文件头」 → 去处理 → its page (← 返回资料库 back to the list)', async () => {
  await s.page.click('[data-part="missing-header-hint"] [data-action="go-missing-header"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-part="missing-header"] [data-card="untitled.md"]') !== null, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="library"] [data-part="missing-header"]').dataset.count), '1')
  await s.page.click('[data-action="back-to-library"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-part="list"] [data-row]') !== null, null, POLL)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
