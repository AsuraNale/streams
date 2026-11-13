// redesign R4b: rewritten for the new 来源与要求 (docs/checks/2026-11-12-r4b/contract.md R4b-1, 「测」; design P14). v1.0 / v2 package F's
// page had 加来源 / 贴一个链接进待看 dialogs, every action on every row and 「谁定的」 beside each part; those are gone by design (the
// actions under 「⋯」, the source added in place, the history in 高级设置's 变更记录, the link on 待看 since R2). What v1.0's file checked
// is still checked here, through the new page: the rows are the core's sourcesView, 测试抓取 writes nothing, pause / resume, a new
// address and a removal (cancel first) land in streams.json, a source is added only after a try that reached it, the topics' keywords,
// a new topic, a removed topic.
// On the seeded world plus plan B's extras, the feeds on this machine (core/test/support/fake-server.mjs):
//   - four parts in this order — 要求 (库名称, 追踪要求, 严格程度) · 来源 · 主题 · 定时与上限 — and the line to 高级设置; no 「谁定的」 mark,
//     no 贴一个链接进待看;
//   - 要求: the brief, the name and the level saved with one 保存 → streams.json (brief · name · the level's two thresholds) and the
//     registry's name, each one line by you in changes.jsonl; the sidebar carries the new name; an empty brief refused, nothing written;
//   - 来源: added in place — five addresses typed, each tried where it was typed: the five states in FETCH_STATES' words with V3's
//     FETCH_HINTS (never the server's message); 添加 off until the try reached the source (a gap or a refusal stays off); added →
//     streams.json; the same address again → said, not added;
//   - each row's 「⋯」: 测试抓取 (nothing written) · 暂停 / 恢复 · 修改地址 (the template dialog) · 删除 (asked first; 取消 changes nothing);
//   - 主题: tags with the kept counts of sourcesView; one opened shows its keywords; 编辑关键词 → streams.json; a new topic with a name only
//     (no keywords); 删除主题 asked first;
//   - 定时与上限: one 保存 → the schedule and the cap in streams.json, each one line by you; a bad cap said, nothing written.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { FETCH_HINTS, FETCH_STATES } from '../src/renderer/texts/common.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { NEW_LIBRARY } from '../src/renderer/texts/first-run.js'
import { fmt } from '../src/renderer/lib/format.js'
import { seedPlanB, worldSession } from './support/seed.mjs'
import { startFakeServer } from '../../core/test/support/fake-server.mjs'
import { EMPTY_RSS, rssWith } from '../../core/test/support/feeds.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const srv = await startFakeServer()
after(() => srv.close())
const URLS = {
  ok: srv.route('/memory.xml', { body: rssWith([{ title: 'Launch HN: 长期记忆评测集', url: 'https://hn.test/1' }, { title: '另一条', url: 'https://hn.test/2' }]) }),
  empty: srv.route('/empty.xml', { body: EMPTY_RSS }),
  gap: srv.route('/gone.xml', { status: 404, body: 'HTTP 404 page not here' }),
  failed: srv.route('/busy.xml', { status: 503, body: 'upstream busy 503' }),
  blocked: srv.route('/blocked.xml', { status: 403, body: 'forbidden 403' }),
}
const s = worldSession({
  kind: 'seeded',
  waitFor: 'sources',
  prepare: async world => { await seedPlanB(world) },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }),
  settings: world => ({ libraryPath: world.library }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const dir = () => s.world.library
const file = name => join(dir(), name)
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const config = () => JSON.parse(readFileSync(file('streams.json'), 'utf8'))
const records = () => [sha(file('streams.json')), sha(file('_pipeline/ledger.jsonl')), sha(file('_pipeline/fetch_log.jsonl'))]
const changes = () => (existsSync(file('_pipeline/changes.jsonl')) ? readFileSync(file('_pipeline/changes.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
const registry = () => JSON.parse(readFileSync(join(s.world.appData, 'libraries.json'), 'utf8'))
const rowsShown = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="sources"] [data-row]')].map(e => [e.dataset.row, e.dataset.state, e.dataset.paused]))
const waitRow = (name, attr, value) => until(([n, a, v]) => document.querySelector(`[data-row="${n}"]`)?.getAttribute(a) === v, [name, attr, value])
const click = sel => s.page.click(`${sel} button`)
const dialog = name => until(n => document.querySelector(`dialog[data-dialog="${n}"][open]`) !== null, name)
const closed = name => until(n => document.querySelector(`[data-dialog="${n}"]`) === null, name)
const more = async (name, action) => {
  await click(`[data-row="${name}"] [data-action="row-more"]`)
  await until(n => document.querySelector(`[data-row="${n}"] [data-part="row-menu"]`) !== null, name)
  await click(`[data-row="${name}"] [data-part="row-menu"] [data-action="${action}"]`)
}
const typeSource = async url => {
  await s.page.fill('[data-field="source"]', url)
  await s.page.press('[data-field="source"]', 'Enter')
}

test('R4b-1 four parts in order (要求 · 来源 · 主题 · 定时与上限) and the line to 高级设置; no 「谁定的」, no 贴一个链接进待看', async () => {
  await until(() => document.querySelector('[data-part="brief"][data-state="ready"]') !== null && document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule !== 'unknown')
  const parts = await s.page.evaluate(() => [...document.querySelectorAll('main[data-screen="sources"] .st-src > [data-part]')].map(e => e.dataset.part))
  assert.deepEqual(parts, ['brief', 'sources', 'topics', 'run'])
  assert.equal(await s.page.evaluate(() => document.querySelector('main[data-screen="sources"] [data-action="go-advanced"]')?.textContent.trim()), SOURCES.advancedLink)
  const gone = await s.page.evaluate(() => ['[data-who]', '[data-action="add-link"]', '[data-dialog="add-link"]', '[data-part="gates"]', '[data-part="this-library"]', '.src-who']
    .filter(q => document.querySelector(`main[data-screen="sources"] ${q}`) !== null))
  assert.deepEqual(gone, [], 'none of these is on the page')
  const text = await s.page.evaluate(() => document.querySelector('main[data-screen="sources"]').textContent)
  for (const word of ['谁定的', '你改的', '首次设置', '贴一个链接']) assert.equal(text.includes(word), false, word)
  // control: the reader sees what is on the page
  assert.equal(text.includes(SOURCES.brief.strictness), true)
  // the brief box is open (no 改要求 first) and the level the library has is shown
  assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="brief"]').disabled), false)
  const lvl = core.readStrictness(dir()).level
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="strictness"]').dataset.level), lvl)
})

test('R4b-1 来源: one row per source as sourcesView gives it — the state, the runs in a row, what to do in words; a source that is fine has no hint (control)', async () => {
  const view = core.sourcesView(dir())
  assert.deepEqual(await rowsShown(), view.sources.map(x => [x.name, x.paused ? 'paused' : x.status ?? 'never', String(Boolean(x.paused))]))
  const old = await s.page.evaluate(() => { const r = document.querySelector('[data-row="old-blog"]'); return { n: r.dataset.consecutive, hint: r.querySelector('[data-hint]')?.dataset.hint, words: r.querySelector('[data-hint]')?.textContent, state: r.querySelector('[data-fetch-word]').textContent.trim() } })
  // redesign R5a (O9): getSources no longer hands the page the HTTP code (it goes to 复制诊断信息), so the row says the state and
  // the runs in a row without it — this line used to expect SOURCES.row.streak with HTTP 404
  assert.deepEqual(old, { n: '4', hint: 'fix-address-or-remove', words: FETCH_HINTS['fix-address-or-remove'], state: fmt(SOURCES.row.streakNoHttp, { state: FETCH_STATES.gap, n: 4 }) })
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row="mcp-news"] [data-hint]')?.dataset.hint), 'retry-next-round')
  const fine = view.sources.find(x => x.status === 'ok' && !x.paused)
  if (fine) assert.equal(await s.page.evaluate(n => document.querySelector(`[data-row="${n}"] [data-hint]`), fine.name), null)
  assert.equal(await s.page.evaluate(() => document.querySelector('#src-sources-h').textContent), fmt(SOURCES.sourcesHeading, { n: view.sources.length }))
  // the table's three columns
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('.st-src-head span')].map(e => e.textContent).filter(Boolean)), [SOURCES.table.source, SOURCES.table.state, SOURCES.table.topic])
})

test('R4b-1 「⋯」 folds the four actions; 测试抓取 shows what came back and writes nothing', async () => {
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="row-menu"]')), null, 'folded at first')
  await click('[data-row="letta-blog"] [data-action="row-more"]')
  await until(() => document.querySelector('[data-row="letta-blog"] [data-part="row-menu"]') !== null)
  assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-row="letta-blog"] [data-part="row-menu"] [data-action]')].map(e => [e.dataset.action, e.textContent.trim()])),
    [['try', SOURCES.row.try], ['pause', SOURCES.row.pause], ['edit-address', SOURCES.row.editAddress], ['remove', SOURCES.row.remove]])
  const before = records()
  await click('[data-row="letta-blog"] [data-part="row-menu"] [data-action="try"]')
  await until(() => { const t = document.querySelector('[data-tried="letta-blog"]'); return t && t.dataset.state !== 'trying' })
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-tried="letta-blog"]').dataset.state), 'failed', 'its address is dead on purpose')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="row-menu"]')), null, 'the menu folds after a choice')
  assert.deepEqual(records(), before)
})

test('R4b-1 暂停 / 恢复 and 修改地址 (the template dialog) land in streams.json, each recorded as the user\'s', async () => {
  const lines = changes().length
  await more('old-blog', 'pause')
  await waitRow('old-blog', 'data-paused', 'true')
  assert.equal(config().sources.find(x => x.name === 'old-blog').paused, true)
  await more('old-blog', 'pause')
  await waitRow('old-blog', 'data-paused', 'false')
  assert.notEqual(config().sources.find(x => x.name === 'old-blog').paused, true)
  await more('old-blog', 'edit-address')
  await dialog('edit-source')
  const url = `${srv.base ?? URLS.ok.replace(/\/memory\.xml$/, '')}/moved-feed`
  await s.page.fill('[data-dialog="edit-source"] input[data-field="address"]', url)
  await click('[data-action="confirm-edit-source"]')
  await closed('edit-source')
  assert.equal(config().sources.find(x => x.name === 'old-blog').url, url)
  assert.deepEqual(changes().slice(lines).map(l => [l.field, l.by]), [['sources', 'you'], ['sources', 'you'], ['sources', 'you']])
})

test('R4b-1 删除 asks first (the template dialog): 取消 changes nothing (control); 删除 takes it out of streams.json and leaves the record', async () => {
  const before = records()
  await more('old-blog', 'remove')
  await dialog('remove-source')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="remove-source"] .readable').textContent), SOURCES.removeDialog.text)
  await click('[data-dialog="remove-source"] [data-action="cancel-remove"]')
  await closed('remove-source')
  assert.deepEqual(records(), before)
  await more('old-blog', 'remove')
  await dialog('remove-source')
  await click('[data-dialog="remove-source"] [data-action="confirm-remove"]')
  await closed('remove-source')
  await until(() => document.querySelector('[data-row="old-blog"]') === null)
  assert.equal(config().sources.some(x => x.name === 'old-blog'), false)
  assert.deepEqual(records().slice(1), before.slice(1), 'the record and the fetch log untouched')
})

test('R4b-1 就地加来源: five addresses typed, each tried where it was typed — V3\'s words and what to do, never the server\'s message; 添加 only after a try that reached it', async () => {
  const seen = {}
  for (const state of ['empty', 'gap', 'failed', 'blocked', 'ok']) {
    const before = sha(file('streams.json'))
    await typeSource(URLS[state])
    await until(() => { const r = document.querySelector('[data-part="adding"]'); return r && r.dataset.fetchState !== 'trying' })
    const row = await s.page.evaluate(() => { const r = document.querySelector('[data-part="adding"]'); return { state: r.dataset.fetchState, chip: r.querySelector('.status-chip').textContent.trim(), hint: r.querySelector('[data-part="source-hint"]')?.textContent ?? null, lead: r.querySelector('[data-part="source-lead"]')?.textContent ?? null, all: r.textContent, add: document.querySelector('[data-action="add-source"] button').disabled } })
    seen[state] = row
    assert.equal(row.state, state)
    assert.equal(row.lead, fmt(SOURCES.add.recognized, { kind: 'RSS' }))
    for (const raw of ['HTTP 404', 'upstream busy', 'forbidden', '503', '403']) assert.equal(row.all.includes(raw), false, `「${raw}」 is not shown`)
    assert.equal(sha(file('streams.json')), before, 'a try writes nothing')
    if (state !== 'ok') {
      assert.equal(row.chip, FETCH_STATES[state], state)
      assert.equal(row.hint, FETCH_HINTS[core.hintOf(state)], `${state}: V3's 怎么办`)
      assert.equal(row.add, !['empty', 'failed'].includes(state), `${state}: 添加 ${['empty', 'failed'].includes(state) ? 'on' : 'off'}`)
      await click('[data-action="cancel-add"]')
      await until(() => document.querySelector('[data-part="adding"]') === null)
    }
  }
  assert.equal(seen.ok.chip, fmt(NEW_LIBRARY.okCount, { state: FETCH_STATES.ok, n: 2 }))
  assert.equal(seen.ok.hint, fmt(NEW_LIBRARY.latest, { title: 'Launch HN: 长期记忆评测集' }))
  assert.equal(seen.ok.add, false, 'a try that reached the source: 添加 on')
  // the 正常 one is still there: 添加 → streams.json, the row in the table, one line by you
  const name = await s.page.evaluate(() => document.querySelector('[data-part="adding"]').dataset.source)
  const lines = changes().length
  await click('[data-action="add-source"]')
  await until(n => document.querySelector(`[data-row="${n}"]`) !== null && document.querySelector('[data-part="adding"]') === null, name)
  assert.deepEqual(config().sources.find(x => x.name === name), { name, kind: 'rss', url: URLS.ok })
  assert.deepEqual(changes().slice(lines).map(l => [l.field, l.by]), [['sources', 'you']])
  // the same address again: said, not added
  await typeSource(URLS.ok)
  await until(() => document.querySelector('[data-part="add-error"]') !== null)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="add-error"]').textContent), SOURCES.add.duplicate)
  assert.equal(config().sources.filter(x => x.url === URLS.ok).length, 1)
})

test('R4b-1 主题: tags with sourcesView\'s kept counts; one opened shows its keywords (fixed); 编辑关键词, a topic with a name only, 删除主题 asked first — in streams.json', async () => {
  const view = core.sourcesView(dir())
  const shown = await s.page.evaluate(() => [...document.querySelectorAll('[data-topic-row]')].map(e => [e.dataset.topicRow, Number(e.dataset.kept)]))
  assert.deepEqual(shown, view.topics.map(t => [t.name, t.kept]))
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="topic-detail"]')), null, 'no topic open at first')
  await s.page.click('[data-topic-row="agent 记忆"]')
  await until(() => document.querySelector('[data-part="topic-detail"][data-topic="agent 记忆"]') !== null)
  const kw = await s.page.evaluate(() => ({ label: document.querySelector('.st-src-kw-label').textContent, words: document.querySelector('[data-keywords]').dataset.keywords }))
  assert.equal(kw.label, fmt(SOURCES.topics.keywordsOf, { name: 'agent 记忆' }))
  assert.equal(kw.words, config().topics.find(t => t.name === 'agent 记忆').keywords.join('、'))
  await click('[data-part="topic-detail"] [data-action="edit-keywords"]')
  await s.page.fill('[data-part="topic-detail"] input[data-field="keywords"]', 'agent benchmark， eval harness')
  await click('[data-part="topic-detail"] [data-action="save-keywords"]')
  await until(() => document.querySelector('[data-part="topic-detail"] [data-keywords]') !== null)
  assert.deepEqual(config().topics.find(t => t.name === 'agent 记忆').keywords, ['agent benchmark', 'eval harness'])
  // a topic needs only its name
  await s.page.fill('input[data-field="topic-name"]', '本地模型')
  await s.page.press('input[data-field="topic-name"]', 'Enter')
  await until(() => document.querySelector('[data-topic-row="本地模型"]') !== null)
  assert.deepEqual(config().topics.find(t => t.name === '本地模型'), { name: '本地模型', keywords: [] })
  // a second topic of the same name is refused (control)
  await s.page.fill('input[data-field="topic-name"]', '本地模型')
  await s.page.press('input[data-field="topic-name"]', 'Enter')
  await until(() => document.querySelector('[data-part="topic-error"]') !== null)
  assert.equal(config().topics.filter(t => t.name === '本地模型').length, 1)
  await s.page.click('[data-topic-row="评测"]')
  await until(() => document.querySelector('[data-part="topic-detail"][data-topic="评测"]') !== null)
  await click('[data-part="topic-detail"] [data-action="remove-topic"]')
  await dialog('remove-topic')
  await click('[data-dialog="remove-topic"] [data-action="confirm-remove"]')
  await closed('remove-topic')
  await until(() => document.querySelector('[data-topic-row="评测"]') === null)
  assert.equal(config().topics.some(t => t.name === '评测'), false)
})

test('R4b-1 要求: 库名称, 追踪要求 and 严格程度 saved with one 保存 → streams.json, the registry and the sidebar; each one line by you; an empty brief refused', async () => {
  const id = registry().active
  const lines = changes().length
  const name = 'AI Agent 长期记忆'
  const brief = '追踪 AI agent 长期记忆的评测与对比数据。营销稿不要。'
  await s.page.fill('input[data-field="library-name"]', name)
  await s.page.fill('textarea[data-field="brief"]', brief)
  await s.page.click('[data-part="strictness"] [data-level="standard"]')
  await until(() => document.querySelector('[data-part="level-note"]')?.dataset.level === 'standard')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="level-note"]').textContent), fmt(SOURCES.brief.levelNote, { level: SOURCES.brief.levels.standard, relevance: 0.5, substance: 0.6 }))
  await click('[data-action="save-brief"]')
  await until(() => document.querySelector('[data-part="brief-note"]')?.dataset.kind === 'saved')
  const cfg = config()
  assert.equal(cfg.name, name, 'the name is in streams.json')
  assert.equal(cfg.brief, brief)
  assert.deepEqual(core.readStrictness(dir()), { level: 'standard', thresholds: { relevance: 0.5, substance: 0.6 } })
  assert.equal(registry().libraries.find(l => l.id === id).name, name, 'and in the registry')
  assert.deepEqual(changes().slice(lines).map(l => [l.field, l.by]).sort(), [['brief', 'you'], ['name', 'you'], ['thresholds', 'you']])
  assert.equal(changes().find(l => l.field === 'name').after, name)
  await until(n => document.querySelector('[data-library-row][data-active="true"] .st-sidebar__lib-name')?.textContent === n, name)
  await until(n => document.querySelector('#lib-head-name')?.textContent === n, name)
  // an empty brief: said, nothing written
  const before = sha(file('streams.json'))
  const n2 = changes().length
  await s.page.fill('textarea[data-field="brief"]', '   ')
  await click('[data-action="save-brief"]')
  await until(() => document.querySelector('[data-part="brief-note"]')?.dataset.kind === 'error')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="brief-note"]').textContent), SOURCES.brief.bad)
  assert.equal(sha(file('streams.json')), before)
  assert.equal(changes().length, n2)
  await s.page.fill('textarea[data-field="brief"]', brief)
})

test('R4b-1 定时与上限: one line; 保存 → the schedule and the cap in streams.json, each one line by you; a bad cap said, nothing written', async () => {
  const lines = changes().length
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run"] [data-schedule]').dataset.schedule), 'off', 'control: off in the seeded world')
  const before = sha(file('streams.json'))
  await s.page.fill('[data-part="run"] input[data-field="cap"]', '0')
  await click('[data-part="run"] [data-action="save-run"]')
  await until(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'bad')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run-note"]').textContent), SOURCES.run.capBad)
  assert.equal(sha(file('streams.json')), before)
  await s.page.click('[data-part="run"] input[data-field="schedule-on"]')
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '07:45')
  await s.page.fill('[data-part="run"] input[data-field="cap"]', '30')
  await click('[data-part="run"] [data-action="save-run"]')
  await until(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'saved' && document.querySelector('[data-part="run"] [data-schedule]').dataset.schedule === 'on')
  const cfg = config()
  assert.deepEqual(cfg.schedule, { enabled: true, time: '07:45' })
  assert.equal(cfg.pipeline.cap, 30)
  assert.deepEqual(changes().slice(lines).map(l => [l.field, l.by]).sort(), [['cap', 'you'], ['schedule', 'you']])
  assert.ok((await s.page.evaluate(() => document.querySelector('[data-part="run"] [data-next-run]').dataset.nextRun)) !== '', 'the next run is said')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
