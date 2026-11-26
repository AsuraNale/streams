// 1.1 W7b in the real window (docs/checks/2026-11-20-1.1/w7b/scorecard.json): v1.0's scoring pipeline, v2's main agent chat, its
// proposal cards and 系统检测 are gone; what the screens show now, on two registered libraries — one with a library card
// (test/support/card-world.mjs: two real updates of the core over a site on this machine) and one made by 1.0.1
// (test/fixtures/v101-library, made once by 1.0's own round):
//   待看        a card library's cards and a 1.0 library's: the title, 「来源 · 发布 · 已存原文」, no score, no 未通过筛选 / 重新评分 /
//               待评分 / 添加链接; an empty 待看 says the last run in one line;
//   来源与要求  the card library: its card and its sources; the 1.0 library: the notice with 「重新查一遍来源」, its 追踪要求 and its
//               sources read only (no field to edit, no 严格程度, no 单次上限), 定时; 高级设置: 变更记录 · 库文件夹 (no 评分环节);
//   资料库      a 1.0 note: no 入选理由 (no score of v1.0) in 详情;
//   主 Agent    the sidebar's 主 Agent opens the build conversation: its one-sentence start marks 「新建库」, a conversation marks
//               「主 Agent」; the right panel's 待确认 holds the build's waiting card and nothing else, its tab says 1.
// The main agent is a scripted stand-in (STREAMS_DEV_BUILD). STREAMS_W7B_SHOTS=<folder>: the window shown, the AFTER pictures saved.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'
import { seedCardLibrary, startCardSite } from './support/card-world.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const SHOTS = process.env.STREAMS_W7B_SHOTS && isAbsolute(process.env.STREAMS_W7B_SHOTS) ? process.env.STREAMS_W7B_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
const FIXTURE = join(DESKTOP_DIR, 'test', 'fixtures', 'v101-library')

const A = 'https://example-a.test/list'
const B = 'https://example-b.test/item/1'
const BUILD_CARD = {
  name: 'agent 记忆跟踪',
  definition: { summary: '一座跟踪 agent 记忆方案的库。', purpose: '研究', scope: '对象：agent 框架；行业：AI；地域：全球；规模：不限', exclude: '营销稿', trust: '官方博客和论文', rhythm: '每周', language: '中文简报', hard: '一手出处' },
  decide: [], collect: ['新方案和评测'], skip: ['营销稿'],
  sources: [{ name: '甲', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
}

let site = null
let ids = null
let oldDir = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: async world => {
    site = await startCardSite()
    await seedCardLibrary(world.library, site)
    oldDir = join(world.root, 'v101-library')
    cpSync(FIXTURE, oldDir, { recursive: true })
    let reg = core.emptyRegistry()
    ids = {}
    for (const [key, dir, name] of [['card', world.library, '电动车测试库'], ['old', oldDir, 'AI Agent 记忆']]) {
      const r = core.withLibrary(reg, dir, { name })
      reg = r.registry
      ids[key] = r.entry.id
    }
    core.writeRegistry(join(world.appData, 'libraries.json'), core.withActive(reg, ids.card))
    const replies = join(world.root, 'build-replies.json')
    writeFileSync(replies, JSON.stringify({ replies: [{ json: { say: '我先看了一眼，写了一张建库卡，请看。', card: BUILD_CARD }, reads: [A, B].map(url => ({ url, ok: true })) }] }))
    world.replies = replies
    return () => site.close()
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: world.replies, STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(500); await s.page.screenshot({ path: join(SHOTS, `${name}.png`) }) } }
const openLibrary = async (id, t) => {
  await s.page.click(`[data-library-row="${id}"]`)
  await until(i => document.querySelector(`.lib-page[data-library="${i}"] .st-lib-tabs`) !== null, id)
  await s.page.click(`.st-lib-tabs button[data-tab="${t}"]`)
  await until(([i, sc]) => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="${sc}"][data-state="ready"]`) !== null, [id, t])
}
/** What a page must not show of v1.0's scoring pipeline, v2's main agent and its cards (the hooks those parts had). */
const GONE = ['[data-part="rejected"]', '[data-part="rescore"]', '[data-part="manual"]', '[data-action="add-link"]', '[data-part="caught-waiting"]', '[data-funnel-cell]',
  '[data-part="strictness"]', '[data-field="cap"]', '[data-part="gates-fold"]', '[data-decide]', '[data-detail-score]', '[data-part="detail-scores"]', '[data-part="detail-reasons"]',
  '[data-scoreless]', '[data-moved]', '[data-maybe-duplicate]', '[data-part="estimate"]']
const gone = () => s.page.evaluate(list => list.filter(sel => document.querySelector(sel) !== null), GONE)

describe('W7b: what the screens show once v1.0\'s pipeline and v2\'s main agent are gone', () => {
  test('W7b · 待看 of a card library and of a 1.0 library: the cards and their one line, no score and none of v1.0\'s parts', async () => {
    await openLibrary(ids.card, 'inbox')
    await until(() => document.querySelectorAll('[data-card]').length >= 1)
    const card = await s.page.evaluate(() => ({ n: document.querySelectorAll('[data-card]').length, line: document.querySelector('[data-card] [data-part="card-line"]')?.textContent ?? '' }))
    assert.ok(card.n >= 1, 'control: the card library has cards in 待看')
    assert.ok(card.line.includes(INBOX.card.saved) || card.line.length > 0, card.line)
    assert.doesNotMatch(card.line, /\d\.\d\d/, 'no score in the line')
    assert.deepEqual(await gone(), [])
    await shot('inbox-card-library')
    await openLibrary(ids.old, 'inbox')
    await until(() => document.querySelectorAll('[data-card]').length === 2)
    const old = await s.page.evaluate(() => [...document.querySelectorAll('[data-card] [data-part="card-line"]')].map(l => l.textContent))
    assert.equal(old.length, 2, 'control: the 1.0 library\'s two cards')
    for (const line of old) assert.doesNotMatch(line, /\d\.\d\d/, `no score in ${line}`)
    assert.deepEqual(await gone(), [])
    await shot('inbox-old-library')
  })

  test('W7b · 来源与要求 of a card library (card, sources) and of a 1.0 library (notice, brief and sources read only, 定时 without a cap)', async () => {
    await openLibrary(ids.card, 'sources')
    await until(() => document.querySelector('[data-part="card"]') !== null && document.querySelector('[data-part="card-sources"]') !== null)
    assert.deepEqual(await gone(), [])
    await shot('sources-card-library')
    await openLibrary(ids.old, 'sources')
    await until(() => document.querySelector('[data-part="old-library"]') !== null && document.querySelector('[data-part="old-sources"]') !== null)
    const v = await s.page.evaluate(() => ({
      parts: [...document.querySelectorAll('main[data-screen="sources"] .st-src > section')].map(e => e.dataset.part),
      fields: [...document.querySelectorAll('main[data-screen="sources"] input, main[data-screen="sources"] textarea')].map(e => e.dataset.field),
      rows: document.querySelectorAll('[data-part="old-sources"] [data-row]').length,
      recheck: Boolean(document.querySelector('[data-action="recheck-sources"] button')),
      lead: document.querySelector('main[data-screen="sources"] [data-lead]')?.textContent,
    }))
    assert.deepEqual(v.parts, ['old-library', 'old-brief', 'old-sources', 'run'], JSON.stringify(v.parts))
    assert.deepEqual(v.fields, ['schedule-on', 'schedule-time'], 'only the schedule can be changed')
    assert.ok(v.rows >= 1, 'control: its old sources are listed')
    assert.equal(v.recheck, true)
    assert.equal(v.lead, SOURCES.old.lead)
    assert.deepEqual(await gone(), [])
    await shot('sources-old-library')
    await s.page.click('[data-action="go-advanced"]')
    await until(() => document.querySelector('[data-view="advanced"]') !== null)
    assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('.st-src-advanced > details')].map(d => d.dataset.part)), ['changes-fold', 'folder-fold'])
    await s.page.click('[data-action="back-sources"]')
  })

  test('W7b · 资料库 of a 1.0 note: 详情 without 入选理由 (no score of v1.0); its 核验记录 still there', async () => {
    await openLibrary(ids.old, 'library')
    await until(() => document.querySelectorAll('main [data-row]').length >= 3)
    await s.page.click('main [data-row]')
    await until(() => document.querySelector('[data-part="note-panel"]') !== null && document.querySelector('[data-reader]') !== null)
    assert.deepEqual(await gone(), [])
    assert.ok(await s.page.evaluate(() => document.querySelector('[data-part="detail-file"]') !== null), 'control: 详情 is drawn')
    await shot('library-old-note')
  })

  test('W7b · 主 Agent opens the build conversation: the start marks 新建库, a conversation marks 主 Agent; 待确认 holds the build\'s card only', async () => {
    const marks = () => s.page.evaluate(() => ({
      view: document.querySelector('main[data-screen="build"]')?.dataset.view ?? null,
      agent: document.querySelector('[data-nav="chat"]')?.getAttribute('aria-current') ?? null,
      add: document.querySelector('[data-action="add-library"]')?.classList.contains('active') ?? null,
    }))
    await s.page.click('[data-nav="chat"]')
    await ready(s.page, 'build')
    assert.deepEqual(await marks(), { view: 'start', agent: null, add: true }, 'no conversation: the one-sentence start, 新建库 marked')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-panel-badge="decide"]')), null, 'nothing to confirm: no number')
    const r = await s.page.evaluate(() => window.streams.startBuild('帮我建一个跟踪 agent 记忆方案的库'))
    assert.ok(r.ok, JSON.stringify(r))
    // 1.1.3: the conversation is a row of 未建成; opened from there
    await until(() => document.querySelector('nav[data-part="conversations"] [data-conv^="new:"]') !== null)
    await s.page.click('nav[data-part="conversations"] [data-conv^="new:"] .st-conv__main')
    await until(() => document.querySelector('main[data-screen="build"][data-view="talk"]') !== null)
    assert.deepEqual(await marks(), { view: 'talk', agent: 'page', add: false }, 'a conversation: 主 Agent marked')
    await until(() => document.querySelector('[data-panel-badge="decide"]')?.textContent === '1')
    await shot('sidebar-agent-on-build-conversation')
    await s.page.click('[data-panel-tab="decide"]')
    await until(() => document.querySelector('[data-pane="decide"]') !== null)
    const pane = await s.page.evaluate(() => ({
      count: document.querySelector('[data-pane="decide"]').dataset.count,
      items: [...document.querySelectorAll('[data-part="decide-list"] > *')].map(e => e.dataset.part),
    }))
    assert.deepEqual(pane, { count: '1', items: ['build-waiting'] })
    await shot('panel-decide-build-card')
    // the conversation dropped: nothing waits any more
    const d = await s.page.evaluate(() => window.streams.dropBuild())
    assert.ok(d.ok, JSON.stringify(d))
    await until(() => document.querySelector('[data-pane="decide"]')?.dataset.count === '0')
  })

  test('W7b · no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})
