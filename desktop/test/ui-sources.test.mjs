// 来源与主题 (screens/sources.js) on the seeded world plus plan B's extras: the rows are the core's sourcesView (state, rounds in
// a row, the hint in words); 「试抓」 writes nothing (streams.json, the record and the fetch log hashed before and after); pause
// and resume, a new address, a removal (cancel first: nothing changes) land in streams.json; 加来源 is refused until a try
// reached the source (and again after the address changed), then adds it; the topics' keywords, a new topic, a removed
// topic; a link put into 待看 lands in the record once, the second time the page says it was seen.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { FETCH_HINTS } from '../src/renderer/texts/common.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { seedPlanB, startFeed, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
let feed = null
const s = worldSession({
  kind: 'seeded',
  waitFor: 'sources',
  prepare: async world => { await seedPlanB(world); feed = await startFeed(); return () => feed.close() },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
const file = name => join(dir(), name)
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const config = () => JSON.parse(readFileSync(file('streams.json'), 'utf8'))
const records = () => [sha(file('streams.json')), sha(file('_pipeline/ledger.jsonl')), sha(file('_pipeline/fetch_log.jsonl'))]
const rowsShown = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="sources"] [data-row]')].map(e => [e.dataset.row, e.dataset.state, e.dataset.paused]))
const waitRow = (name, attr, value) => s.page.waitForFunction(([n, a, v]) => document.querySelector(`[data-row="${n}"]`)?.getAttribute(a) === v, [name, attr, value], POLL)
const click = sel => s.page.click(`${sel} button`)
const dialog = name => s.page.waitForFunction(n => document.querySelector(`[data-dialog="${n}"]`) !== null, name, POLL)
const closed = name => s.page.waitForFunction(n => document.querySelector(`[data-dialog="${n}"]`) === null, name, POLL)

test('one row per source as sourcesView gives it: the state, the rounds in a row, what to do in words; a source that is fine has no hint (control)', async () => {
  const view = core.sourcesView(dir())
  assert.deepEqual(await rowsShown(), view.sources.map(x => [x.name, x.paused ? 'paused' : x.status ?? 'never', String(Boolean(x.paused))]))
  const old = await s.page.evaluate(() => { const r = document.querySelector('[data-row="old-blog"]'); return { n: r.dataset.consecutive, hint: r.querySelector('[data-hint]')?.dataset.hint, words: r.querySelector('[data-hint]')?.textContent, state: r.querySelector('.st-fetch').textContent } })
  assert.deepEqual(old, { n: '4', hint: 'fix-address-or-remove', words: FETCH_HINTS['fix-address-or-remove'], state: '地址有问题 · HTTP 404 · 连续 4 轮' })
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row="mcp-news"] [data-hint]')?.dataset.hint), 'retry-next-round')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-row="letta-blog"] [data-hint]')), null)
  const title = await s.page.evaluate(() => document.querySelector('main h1').textContent)
  assert.equal(title, `${view.counts.sources} 个来源 · ${view.counts.topics} 个主题`)
})

test('试抓 shows what came back and writes nothing', async () => {
  const before = records()
  await click('[data-row="letta-blog"] [data-action="try"]')
  await s.page.waitForFunction(() => { const t = document.querySelector('[data-tried="letta-blog"]'); return t && t.dataset.state !== 'trying' }, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-tried="letta-blog"]').dataset.state), 'failed', 'its address is dead on purpose')
  assert.deepEqual(records(), before)
})

test('暂停 / 恢复 and 改地址 land in streams.json', async () => {
  await click('[data-row="old-blog"] [data-action="pause"]')
  await waitRow('old-blog', 'data-paused', 'true')
  assert.equal(config().sources.find(x => x.name === 'old-blog').paused, true)
  await click('[data-row="old-blog"] [data-action="pause"]')
  await waitRow('old-blog', 'data-paused', 'false')
  assert.notEqual(config().sources.find(x => x.name === 'old-blog').paused, true)
  await click('[data-row="old-blog"] [data-action="edit-address"]')
  await dialog('edit-source')
  const url = `${feed.base}/moved-feed`
  await s.page.fill('[data-dialog="edit-source"] input[data-field="address"]', url)
  await click('[data-action="confirm-edit-source"]')
  await closed('edit-source')
  assert.equal(config().sources.find(x => x.name === 'old-blog').url, url)
})

test('删除 asks first: 取消 changes nothing (control); 删除 takes it out of streams.json and leaves the record', async () => {
  const before = records()
  await click('[data-row="old-blog"] [data-action="remove"]')
  await dialog('remove-source')
  await click('[data-action="cancel-remove"]')
  await closed('remove-source')
  assert.deepEqual(records(), before)
  await click('[data-row="old-blog"] [data-action="remove"]')
  await dialog('remove-source')
  await click('[data-action="confirm-remove"]')
  await closed('remove-source')
  await s.page.waitForFunction(() => document.querySelector('[data-row="old-blog"]') === null, null, POLL)
  assert.equal(config().sources.some(x => x.name === 'old-blog'), false)
  assert.deepEqual(records().slice(1), before.slice(1), 'the record and the fetch log untouched')
})

test('加来源: 加入 stays disabled until a try reached the source, and again once the address changes; then the source is in streams.json', async () => {
  await click('[data-action="add-source"]')
  await dialog('add-source')
  await s.page.fill('input[data-field="source-input"]', feed.feed)
  await click('[data-action="guess"]')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="add-source"] select[data-field="kind"]') !== null, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('select[data-field="kind"]').value), 'rss')
  assert.equal(await s.page.evaluate(() => document.querySelector('input[data-field="target"]').value), feed.feed)
  await s.page.fill('input[data-field="name"]', 'local-feed')
  await s.page.selectOption('select[data-field="topic"]', '评测')
  const disabled = () => s.page.evaluate(() => document.querySelector('[data-action="confirm-add"] button').disabled)
  assert.equal(await disabled(), true, 'control: not before a try')
  const before = config()
  await click('[data-action="try-new"]')
  await s.page.waitForFunction(() => document.querySelector('[data-tried="new"][data-state="ok"]') !== null, null, POLL)
  assert.equal(await disabled(), false)
  assert.deepEqual(config(), before, 'the try wrote nothing')
  // the address changed after the try: the try no longer counts
  await s.page.fill('input[data-field="target"]', `${feed.feed}?x=1`)
  assert.equal(await disabled(), true, 'control: a changed address needs a new try')
  await s.page.fill('input[data-field="target"]', feed.feed)
  await click('[data-action="try-new"]')
  await s.page.waitForFunction(() => document.querySelector('[data-tried="new"][data-state="ok"]') !== null && !document.querySelector('[data-action="confirm-add"] button').disabled, null, POLL)
  await click('[data-action="confirm-add"]')
  await closed('add-source')
  await s.page.waitForFunction(() => document.querySelector('[data-row="local-feed"]') !== null, null, POLL)
  assert.deepEqual(config().sources.find(x => x.name === 'local-feed'), { name: 'local-feed', kind: 'rss', url: feed.feed, topic: '评测' })
})

test('主题: the rows and kept counts are sourcesView\'s; keywords changed, a topic added, a topic removed (asked first) — in streams.json', async () => {
  const view = core.sourcesView(dir())
  const shown = await s.page.evaluate(() => [...document.querySelectorAll('[data-topic-row]')].map(e => [e.dataset.topicRow, Number(e.dataset.kept)]))
  assert.deepEqual(shown, view.topics.map(t => [t.name, t.kept]))
  await click('[data-topic-row="评测"] [data-action="edit-keywords"]')
  await s.page.fill('[data-topic-row="评测"] input[data-field="keywords"]', 'agent benchmark， eval harness')
  await click('[data-topic-row="评测"] [data-action="save-keywords"]')
  await s.page.waitForFunction(() => document.querySelector('[data-topic-row="评测"] [data-keywords]') !== null, null, POLL)
  assert.deepEqual(config().topics.find(t => t.name === '评测').keywords, ['agent benchmark', 'eval harness'])
  await s.page.fill('input[data-field="topic-name"]', '本地模型')
  await s.page.fill('input[data-field="topic-keywords"]', 'local LLM, ollama')
  await click('[data-action="add-topic"]')
  await s.page.waitForFunction(() => document.querySelector('[data-topic-row="本地模型"]') !== null, null, POLL)
  assert.deepEqual(config().topics.find(t => t.name === '本地模型'), { name: '本地模型', keywords: ['local LLM', 'ollama'] })
  // a second topic of the same name is refused (control)
  await s.page.fill('input[data-field="topic-name"]', '本地模型')
  await click('[data-action="add-topic"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="topic-error"]') !== null, null, POLL)
  assert.equal(config().topics.filter(t => t.name === '本地模型').length, 1)
  await click('[data-topic-row="评测"] [data-action="remove-topic"]')
  await dialog('remove-topic')
  await click('[data-action="confirm-remove"]')
  await closed('remove-topic')
  await s.page.waitForFunction(() => document.querySelector('[data-topic-row="评测"]') === null, null, POLL)
  const after = config()
  assert.equal(after.topics.some(t => t.name === '评测'), false)
  assert.equal(after.sources.find(x => x.name === 'local-feed').topic ?? null, null, 'the source that used it has no topic now')
})

test('贴一个链接进待看: the link is in the record once; the second time the page says it was seen', async () => {
  const url = `${feed.base}/by-hand`
  const seen = () => readFileSync(file('_pipeline/ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.ev === 'seen' && e.url === url).length
  for (const want of [SOURCES.linkDialog.added, SOURCES.linkDialog.seen]) {
    await click('[data-action="add-link"]')
    await dialog('add-link')
    await s.page.fill('input[data-field="link-url"]', url)
    await click('[data-action="confirm-link"]')
    await s.page.waitForFunction(() => document.querySelector('[data-part="link-note"]') !== null, null, POLL)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="link-note"]').textContent), want)
    await click('[data-action="close-link"]')
    await closed('add-link')
  }
  assert.equal(seen(), 1)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
