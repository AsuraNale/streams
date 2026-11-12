// 待看 (screens/inbox.js) on the seeded world — redesign R2 (docs/checks/2026-11-11-r2/contract.md R2-1 … R2-5, R2-9). This file
// was v1.0's 待看 test (the reason dialog, 「这一条的记录」 dialog, L that wrote nothing); redesign R2 changed what 待看 is — the
// dialog is gone (放弃 is a bar, its reason optional), 稍后处理 is recorded, the record is in the right panel's 详情 — so the
// file is rewritten for the new page; what it kept: the cards in the core's order, the marks, J / K and the focus, C writes a note.
//   cards   one line 「来源 · 日期 · 相关度 · 实质 · 新鲜度」, no reason on the card (the reasons are 详情's), the marks on it, the
//           title opens Streams' reading window (openReader: in a test run the main log says so), J / K / C / D / L
//   放弃    off the list at once with nothing in the ledger; the bar: four quick reasons + 其他原因… + 撤销; 撤销 → back, no
//           `dismissed`; 关闭 → written without a reason field; a quick reason → written with it; the next decision → the held
//           one written (and the app quitting: the second session below)
//   稍后    L → the row 「稍后处理 · n 条」 (opened: the item), _pipeline/later.json; after a restart still there; a run of this
//           library that ended → back in 待看 (the third session)
//   未通过筛选  folded by default; opened: the step, the score, the reason; 移入待看 → a card marked 未通过筛选 · 手动移入 with
//           notes/ byte for byte unchanged; 收藏 then → a note the core validates and the index lists
//   添加链接  a bad address says so; a good one is a 「待评分」 row at once; the same one again says it is known
//   详情    推荐理由 (the three steps and their reasons), 核验, 核验记录 folded (opened: the record of verdicts.jsonl, no dialog),
//           来源 · 发布 · 首次抓取
// Each check is built to be able to fail: the state before is asserted first (a control) where it could already be true.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { PANEL } from '../src/renderer/texts/panel.js'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { closeApp, launch, ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const settings = { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } }
const jsonl = p => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
const notesHash = dir => readdirSync(join(dir, 'notes')).sort().map(f => `${f}:${createHash('sha256').update(readFileSync(join(dir, 'notes', f))).digest('hex')}`).join('|')

describe('待看: cards, 详情, J / K, 放弃 and its bar, 稍后处理, 未通过筛选, 添加链接', () => {
  const s = worldSession({ kind: 'seeded', waitFor: 'inbox', settings, env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox' }) })
  const dir = () => s.world.library
  const ledger = () => jsonl(join(dir(), '_pipeline', 'ledger.jsonl'))
  const dismissed = () => ledger().filter(e => e.ev === 'dismissed')
  const cards = () => s.page.evaluate(() => [...document.querySelectorAll('[data-card]')].map(e => e.dataset.url))
  const current = () => s.page.evaluate(() => document.querySelector('[data-card][data-current="true"]')?.dataset.url ?? null)
  const waitCards = n => s.page.waitForFunction(k => document.querySelectorAll('[data-card]').length === k, n, POLL)
  const bar = () => s.page.evaluate(() => { const b = document.querySelector('[data-part="dismiss-bar"]'); return b ? { url: b.dataset.url, reasons: [...b.querySelectorAll('[data-reason]')].map(e => [e.dataset.reason, e.textContent]), actions: [...b.querySelectorAll('[data-action]')].map(e => e.dataset.action), text: b.textContent } : null })
  const mainLog = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')

  test('cards in the core\'s order, one line of source · date · scores, no reason on a card, the marks on it; the head and the keys', async () => {
    const seed = s.world.seed
    assert.deepEqual(await cards(), seed.inbox.map(i => i.url))
    assert.equal(await current(), seed.inbox[0].url)
    const got = await s.page.evaluate(() => [...document.querySelectorAll('[data-card]')].map(c => ({ url: c.dataset.url, line: c.querySelector('[data-part="card-line"]')?.textContent ?? '', text: c.textContent })))
    for (const c of got) {
      const sc = seed.scores[c.url]
      assert.ok(c.line.includes(`相关度 ${sc.relevance.score.toFixed(2)}`) && c.line.includes(`实质 ${sc.substance.score.toFixed(2)}`), c.line)
      assert.ok(c.line.includes(INBOX.card.freshness[sc.freshness.value]), `freshness in the line: ${c.line}`)
      assert.ok(c.line.startsWith('letta-blog'), c.line)
      // the reasons are 详情's, never the card's (control: the seed's reasons are not empty)
      assert.ok(sc.relevance.reason.length > 3 && sc.substance.reason.length > 3)
      assert.equal(c.text.includes(sc.relevance.reason), false, `relevance reason on the card ${c.url}`)
      assert.equal(c.text.includes(sc.substance.reason), false, `substance reason on the card ${c.url}`)
    }
    const waiting = await s.page.evaluate(() => [...document.querySelectorAll('[data-card] [data-waiting]')].map(e => [e.closest('[data-card]').dataset.url, e.dataset.waiting]))
    assert.deepEqual(waiting, [[seed.waiting.url, String(seed.waiting.days)]])
    const unverified = await s.page.evaluate(() => [...document.querySelectorAll('[data-card] [data-unverified]')].map(e => e.closest('[data-card]').dataset.url))
    assert.equal(unverified.length, 1, 'one card did not pass the check (seed item 4)')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-card] [data-unverified]').textContent.trim()), INBOX.card.unverified)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="inbox-count"]').textContent), '待看 · 4 条')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="keys"]').textContent), INBOX.keys)
    const buttons = await s.page.evaluate(() => [...document.querySelector('[data-card]').querySelectorAll('[data-action]')].map(e => [e.dataset.action, e.textContent.trim()]))
    assert.deepEqual(buttons, [['open', s.world.seed.inbox[0].title], ['later', '稍后处理'], ['dismiss', '放弃'], ['keep', '收藏']])
  })

  test('the title opens Streams\' reading window for that item (openReader; a test run logs it)', async () => {
    const url = (await cards())[1]
    assert.equal(mainLog().includes(`reader: open ${url}`), false, 'control: not opened yet')
    await s.page.click(`[data-card][data-url="${url}"] [data-action="open"]`)
    const end = Date.now() + 20_000
    while (!mainLog().includes(`reader: open ${url}`)) { if (Date.now() > end) throw new Error('the reading window was not asked for'); await s.page.waitForTimeout(100) }
  })

  test('详情 is the current card: 推荐理由 (three steps, their reasons), 核验, 核验记录 folded — opened, the record of verdicts.jsonl (no dialog) — and 来源 · 发布 · 首次抓取', async () => {
    const seed = s.world.seed
    const url = await s.page.evaluate(() => document.querySelector('[data-card] [data-unverified]').closest('[data-card]').dataset.url)
    await s.page.click(`[data-card][data-url="${url}"] .card-body`)
    await s.page.waitForFunction(u => document.querySelector('[data-part="detail-scores"]')?.dataset.url === u, url, POLL)
    const d = await s.page.evaluate(() => ({
      ids: [...document.querySelectorAll('[data-detail-score]')].map(e => e.dataset.detailScore),
      text: document.querySelector('[data-part="detail-scores"]').textContent,
      check: document.querySelector('[data-part="detail-check"]').dataset.verified,
      record: document.querySelector('[data-part="detail-record"]').dataset.open,
      source: document.querySelector('[data-part="detail-source"]').textContent,
      head: document.querySelector('[data-part="detail-scores"] .section-label').textContent,
    }))
    assert.deepEqual(d.ids, ['relevance', 'substance', 'freshness'])
    assert.equal(d.head, PANEL.detail.inbox.scores)
    assert.ok(d.text.includes(seed.scores[url].relevance.reason) && d.text.includes(seed.scores[url].substance.reason), d.text)
    assert.equal(d.check, 'failed', 'the card that did not pass the check')
    assert.equal(d.record, 'false', 'folded by default')
    assert.ok(d.source.includes('letta-blog') && d.source.includes('发布') && d.source.includes('首次抓取'), d.source)
    const rows = jsonl(join(dir(), '_pipeline', 'verdicts.jsonl')).filter(v => v.url === url && v.node === 'summary')
    const rounds = [...new Set(rows.map(v => String(v.round)))]
    assert.ok(rounds.length >= 1, 'control: the seed wrote a record for this card')
    await s.page.click('[data-part="detail-record"] summary')
    await s.page.waitForSelector('[data-part="detail-record"] .vd[data-state="ready"] [data-verdict-node="summary"] [data-round]', { timeout: 30_000 })
    const shown = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="detail-record"] [data-verdict-node="summary"] [data-round]')].map(e => e.dataset.round))
    assert.deepEqual(shown, rounds)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog]')), null, 'no dialog opened')
    // back to the first card for what follows
    await s.page.click(`[data-card][data-url="${seed.inbox[0].url}"] .card-body`)
    await s.page.waitForFunction(u => document.querySelector('[data-card][data-current="true"]')?.dataset.url === u, seed.inbox[0].url, POLL)
  })

  test('J and K move the current card and the keyboard focus with it', async () => {
    const urls = await cards()
    await s.page.evaluate(() => document.activeElement?.blur())
    await s.page.keyboard.press('j')
    await s.page.waitForFunction(u => document.activeElement?.dataset?.url === u && document.activeElement.dataset.current === 'true', urls[1], POLL)
    await s.page.keyboard.press('j')
    await s.page.waitForFunction(u => document.querySelector('[data-card][data-current="true"]')?.dataset.url === u, urls[2], POLL)
    await s.page.keyboard.press('k')
    await s.page.keyboard.press('k')
    await s.page.keyboard.press('k')
    await s.page.waitForFunction(u => document.querySelector('[data-card][data-current="true"]')?.dataset.url === u, urls[0], POLL)
    assert.equal(await current(), urls[0], 'K at the top stays at the top')
  })

  test('D: the card is gone at once, nothing in the ledger; the bar has the four quick reasons, 其他原因… and 撤销; 撤销 → back where it was, no dismissed', async () => {
    const urls = await cards()
    const before = dismissed().length
    assert.equal(await bar(), null, 'control: no bar')
    await s.page.keyboard.press('d')
    await waitCards(urls.length - 1)
    assert.equal((await cards()).includes(urls[0]), false)
    const b = await bar()
    assert.equal(b.url, urls[0])
    assert.deepEqual(b.reasons, [['marketing', '营销内容'], ['irrelevant', '不相关'], ['shallow', '内容过浅'], ['duplicate', '重复'], ['other', '其他原因…']])
    assert.ok(b.actions.includes('undo') && b.actions.includes('close-bar'))
    assert.ok(b.text.includes(s.world.seed.inbox[0].title))
    assert.equal(dismissed().length, before, 'held: nothing written')
    // 「n 条待看」 everywhere leaves the held one out: the list head and the tab's badge (v1.0's 今日 test checked the badge)
    await s.page.waitForFunction(n => document.querySelector('[data-tab-badge="inbox"]')?.textContent.trim() === String(n), urls.length - 1, POLL)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="inbox-count"]').dataset.count), String(urls.length - 1))
    await s.page.click('[data-part="dismiss-bar"] [data-action="undo"] button')
    await waitCards(urls.length)
    assert.deepEqual(await cards(), urls, 'back where it was')
    assert.equal(await bar(), null)
    assert.equal(dismissed().length, before, '撤销: no dismissed at all')
  })

  test('D then 关闭: written without a reason field; D then a quick reason: written with it (and its id)', async () => {
    const before = dismissed().length
    let urls = await cards()
    await s.page.click(`[data-card][data-url="${urls[0]}"] [data-action="dismiss"] button`)
    await s.page.waitForFunction(() => document.querySelector('[data-part="dismiss-bar"]') !== null, null, POLL)
    await s.page.click('[data-part="dismiss-bar"] [data-action="close-bar"] button')
    await s.page.waitForFunction(() => document.querySelector('[data-part="dismiss-bar"]') === null, null, POLL)
    let d = dismissed()
    assert.equal(d.length, before + 1)
    assert.equal(d.at(-1).url, urls[0])
    assert.equal(Object.hasOwn(d.at(-1), 'reason'), false, 'no reason chosen: no reason field')
    urls = await cards()
    await s.page.click(`[data-card][data-url="${urls[0]}"] [data-action="dismiss"] button`)
    await s.page.waitForFunction(() => document.querySelector('[data-part="dismiss-bar"] [data-reason="marketing"]') !== null, null, POLL)
    await s.page.click('[data-part="dismiss-bar"] [data-reason="marketing"]')
    await s.page.waitForFunction(() => document.querySelector('[data-part="dismiss-bar"]') === null, null, POLL)
    d = dismissed()
    assert.deepEqual([d.length, d.at(-1).url, d.at(-1).reason, d.at(-1).quick], [before + 2, urls[0], '营销内容', 'marketing'])
    await s.page.waitForFunction(() => [...document.querySelectorAll('[data-part="reasons"] [data-reason]')].some(e => e.dataset.reason === '营销内容'), null, POLL)
  })

  test('D then L on the next card: the held one is written (no reason) and the other goes to 稍后处理 (_pipeline/later.json, nothing in the ledger)', async () => {
    const urls = await cards()
    assert.equal(urls.length, 2, 'control: two cards left')
    const before = dismissed().length
    const lines = ledger().length
    await s.page.click(`[data-card][data-url="${urls[0]}"] [data-action="dismiss"] button`)
    await s.page.waitForFunction(() => document.querySelector('[data-part="dismiss-bar"]') !== null, null, POLL)
    await s.page.click(`[data-card][data-url="${urls[1]}"] .card-body`)
    await s.page.keyboard.press('l')
    await s.page.waitForFunction(() => document.querySelector('[data-part="later"]') !== null && document.querySelector('[data-part="dismiss-bar"]') === null, null, POLL)
    const d = dismissed()
    assert.deepEqual([d.length, d.at(-1).url, Object.hasOwn(d.at(-1), 'reason')], [before + 1, urls[0], false])
    assert.equal(ledger().length, lines + 1, 'only the dismissal: 稍后处理 writes no ledger line')
    const later = JSON.parse(readFileSync(join(dir(), '_pipeline', 'later.json'), 'utf8')).items.map(i => i.url)
    assert.deepEqual(later, [urls[1]])
    assert.deepEqual(await s.page.evaluate(() => { const r = document.querySelector('[data-part="later"]'); return [r.dataset.count, r.dataset.open, r.textContent.includes('下次运行后重新列入待看')] }), ['1', 'false', true])
    await s.page.click('[data-part="later"] summary')
    await s.page.waitForFunction(u => document.querySelector(`[data-part="later"] [data-later="${u}"]`) !== null, urls[1], POLL)
  })

  test('待看 empty: 暂无待看内容, the last run as a funnel (the run record\'s five cells; the calls by part add up), 最近收藏', async () => {
    await waitCards(0)
    await s.page.waitForFunction(() => document.querySelector('[data-part="empty"]') !== null && document.querySelector('main [data-part="last-run"]') !== null, null, POLL)
    const rec = core.listRounds(dir(), 1)[0]
    const f = await s.page.evaluate(() => {
      const p = document.querySelector('main [data-part="last-run"]')
      return { cells: [...p.querySelectorAll('[data-funnel-cell]')].map(e => [e.dataset.funnelCell, e.dataset.value]), total: p.querySelector('[data-part="funnel-calls"]')?.dataset.total, parts: p.querySelector('[data-part="funnel-calls"]')?.dataset.parts, text: p.textContent, round: p.dataset.round }
    })
    assert.equal(f.round, rec.id)
    assert.deepEqual(f.cells, [['fetched', String(rec.counts.fetched)], ['new', String(rec.counts.new)], ['gate:relevance', String(rec.gates.relevance.passed)], ['gate:substance', String(rec.gates.substance.passed)], ['inbox', String(rec.counts.inbox)]])
    const by = rec.callsBy
    assert.ok(by, 'control: the record has its parts')
    const parts = [['self-check', by.selfCheck], ['gate:relevance', by.gates.relevance], ['gate:substance', by.gates.substance], ['summary', by.summary], ['verify', by.verify]]
    assert.equal(f.parts, parts.map(([id, n]) => `${id}:${n}`).join(','))
    assert.equal(Number(f.total), parts.reduce((a, [, n]) => a + n, 0), 'N = the sum of the parts')
    assert.equal(Number(f.total), by.selfCheck + rec.calls)
    assert.ok(f.text.includes(`模型调用 ${f.total} 次 = 运行前自检 ${by.selfCheck} + 相关度 ${by.gates.relevance}`), f.text)
    assert.ok(await s.page.evaluate(() => document.querySelectorAll('[data-part="recent"] [data-kept]').length >= 1))
  })

  test('未通过筛选: folded by default; opened, the step, score and reason; 移入待看 → a card marked 手动移入, notes/ unchanged; 收藏 → a valid note in the index', async () => {
    const r = core.listRejected(dir())
    assert.ok(r.total >= 1, 'control: the seed has an item below relevance')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="rejected"]').dataset.open), 'false')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="rejected"] [data-rejected]')), null, 'folded: no row drawn')
    await s.page.click('[data-part="rejected"] summary')
    await s.page.waitForFunction(() => document.querySelector('[data-part="rejected"] [data-rejected]') !== null, null, POLL)
    const row = await s.page.evaluate(() => { const e = document.querySelector('[data-part="rejected"] [data-rejected]'); return { url: e.dataset.rejected, gate: e.dataset.gate, score: e.dataset.score, text: e.textContent } })
    const want = r.items[0]
    assert.deepEqual([row.url, row.gate, Number(row.score)], [want.url, want.gate, want.score])
    assert.ok(row.text.includes(`未通过相关度 ${want.score.toFixed(2)}`) && row.text.includes(want.reason), row.text)
    const notes = notesHash(dir())
    await s.page.click(`[data-rejected="${row.url}"] [data-action="move"] button`)
    await waitCards(1)
    assert.equal(notesHash(dir()), notes, 'notes/ byte for byte')
    assert.ok(await s.page.evaluate(u => document.querySelector(`[data-card][data-url="${u}"] [data-moved]`) !== null, row.url), 'the card says 未通过筛选 · 手动移入')
    const keptBefore = readdirSync(join(dir(), 'notes')).length
    await s.page.click(`[data-card][data-url="${row.url}"] [data-action="keep"] button`)
    await waitCards(0)
    const files = readdirSync(join(dir(), 'notes'))
    assert.equal(files.length, keptBefore + 1)
    const kept = ledger().filter(e => e.ev === 'kept' && e.url === row.url)
    assert.equal(kept.length, 1)
    const file = `${kept[0].id}.md`
    const v = core.validateNote({ fileName: file, text: readFileSync(join(dir(), 'notes', file), 'utf8') })
    assert.deepEqual(v.problems, [])
    assert.ok(core.readIndex(dir()).some(e => e.id === kept[0].id), 'the index lists it')
  })

  test('＋ 添加链接: a bad address says so; a good one is a 待评分 row at once; the same one again says it is known', async () => {
    const url = 'https://example.org/agent-memory-survey'
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="manual"]')), null, 'control: no row')
    await s.page.click('[data-action="add-link"] button')
    await s.page.waitForSelector('[data-dialog="add-link"] [data-field="link-url"]')
    await s.page.fill('[data-field="link-url"]', 'ftp://nope')
    await s.page.click('[data-action="confirm-link"] button')
    await s.page.waitForFunction(() => document.querySelector('[data-part="link-note"]')?.dataset.kind === 'bad', null, POLL)
    await s.page.fill('[data-field="link-url"]', url)
    await s.page.click('[data-action="confirm-link"] button')
    await s.page.waitForFunction(u => document.querySelector(`[data-part="manual"] [data-manual="${u}"]`) !== null, url, POLL)
    assert.ok(await s.page.evaluate(u => document.querySelector(`[data-manual="${u}"]`).textContent.includes('待评分') && document.querySelector(`[data-manual="${u}"]`).textContent.includes('将在下次运行时评分'), url))
    assert.equal(ledger().filter(e => e.ev === 'seen' && e.url === url && e.source === 'manual').length, 1)
    await s.page.click('[data-action="add-link"] button')
    await s.page.fill('[data-field="link-url"]', url)
    await s.page.click('[data-action="confirm-link"] button')
    await s.page.waitForFunction(() => document.querySelector('[data-part="link-note"]')?.dataset.kind === 'seen', null, POLL)
    await s.page.click('[data-action="cancel-link"] button')
  })

  test('no page errors', () => {
    assert.deepEqual(s.errors, [])
  })
})

describe('the app quits while a 放弃 is held: it is written', () => {
  test('D, then the app quits → the ledger has that dismissal, without a reason', async () => {
    const root = tempDir('st-r2-quit-')
    let app = null
    try {
      const world = await makeWorld({ root, kind: 'seeded' })
      const started = await launch(world, { env: { STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox' }, settings })
      app = started.app
      const page = started.page
      await ready(page, 'inbox')
      const url = await page.evaluate(() => document.querySelector('[data-card]').dataset.url)
      await page.click(`[data-card][data-url="${url}"] [data-action="dismiss"] button`)
      await page.waitForFunction(() => document.querySelector('[data-part="dismiss-bar"]') !== null, null, POLL)
      const file = join(world.library, '_pipeline', 'ledger.jsonl')
      assert.equal(jsonl(file).some(e => e.ev === 'dismissed' && e.url === url), false, 'control: held, not written')
      await closeApp(app, { userDataDir: join(world.appData, 'electron') })
      app = null
      const d = jsonl(file).filter(e => e.ev === 'dismissed' && e.url === url)
      assert.equal(d.length, 1, 'written when the app quit')
      assert.equal(Object.hasOwn(d[0], 'reason'), false)
    } finally {
      if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
      removeTree(root, { waitMs: 20_000 })
    }
  })
})

describe('稍后处理 after a restart, and back in 待看 when this library\'s run has ended', () => {
  test('L → restart: still in 稍后处理; 立即运行 to its end → back in 待看, later.json gone', async () => {
    const root = tempDir('st-r2-later-')
    let app = null
    try {
      const world = await makeWorld({ root, kind: 'seeded' })
      const env = { STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox' }
      let started = await launch(world, { env, settings })
      app = started.app
      await ready(started.page, 'inbox')
      const url = await started.page.evaluate(() => document.querySelector('[data-card]').dataset.url)
      await started.page.click(`[data-card][data-url="${url}"] [data-action="later"] button`)
      await started.page.waitForFunction(() => document.querySelector('[data-part="later"]')?.dataset.count === '1', null, POLL)
      await closeApp(app, { userDataDir: join(world.appData, 'electron') })
      started = await launch(world, { env, settings })
      app = started.app
      const page = started.page
      await ready(page, 'inbox')
      await page.waitForFunction(() => document.querySelector('[data-part="later"]')?.dataset.count === '1', null, POLL)
      assert.equal(await page.evaluate(u => document.querySelector(`[data-card][data-url="${u}"]`), url), null, 'not among the cards after the restart')
      const rounds = core.listRounds(world.library).length
      await page.waitForFunction(() => document.querySelector('[data-part="run-button"][data-run-state="idle"] button')?.disabled === false, null, POLL)
      await page.click('[data-part="run-button"] button')
      const end = Date.now() + 90_000
      while (core.listRounds(world.library).length === rounds) { if (Date.now() > end) throw new Error('the run did not end'); await page.waitForTimeout(200) }
      await page.waitForFunction(u => document.querySelector(`[data-card][data-url="${u}"]`) !== null && document.querySelector('[data-part="later"]') === null, url, POLL)
      assert.equal(existsSync(join(world.library, '_pipeline', 'later.json')), false)
    } finally {
      if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
      removeTree(root, { waitMs: 20_000 })
    }
  })
})
