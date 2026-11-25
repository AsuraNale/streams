// 1.1 W6a in the real window (docs/checks/2026-11-20-1.1/w6a/scorecard.json): 待看 (A3), the reading window on the kept original
// with a point's sentence marked (A4), 来源与要求 of a library with a card (A5), 设置's two sentences (A6), the look in light and
// dark with an 80-character title (A7). The library is made by the core's own updates from a site on 127.0.0.1
// (support/card-world.mjs). With STREAMS_W6A_SHOTS=<folder> the window is shown and the pictures are saved there.
// Each check first holds the state that would make it fail where it could already be true.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { READER_PARTITION } from '../src/main/reader.mjs'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { INBOX as INBOX_EN } from '../src/renderer/texts-en/inbox.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'
import { seedCardLibrary, startCardSite } from './support/card-world.mjs'

const SHOTS = process.env.STREAMS_W6A_SHOTS && isAbsolute(process.env.STREAMS_W6A_SHOTS) ? process.env.STREAMS_W6A_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
const range = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`
const CJK = new RegExp(`[${range(0x3400, 0x9FFF)}${range(0x3000, 0x303F)}${range(0xFF00, 0xFFEF)}]`)
const fileHash = p => createHash('sha256').update(readFileSync(p)).digest('hex')

let site = null
let seeded = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: async world => { site = await startCardSite(); seeded = await seedCardLibrary(world.library, site, { longTitle: true }); return () => site.close() },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`) }) } }
const cardOf = url => `[data-card][data-url="${url}"]`

/** The reading window's page, read in the main process (its page runs no script of its own). */
async function readerPage(script) {
  return s.app.evaluate(async ({ BrowserWindow, session }, { partition, script }) => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses && w.contentView.children.length > 0)
    if (!win) return null
    const view = win.contentView.children[0].webContents
    if (view.isLoading() || win.webContents.isLoading()) return null
    const page = await view.executeJavaScript(script).catch(() => null)
    const bar = await win.webContents.executeJavaScript('JSON.stringify({ mode: document.querySelector("[data-reader-bar]")?.dataset.mode, current: document.querySelector(".rd-seg [aria-current]")?.dataset.readerAction, original: Boolean(document.querySelector("a[data-reader-action=original]")) })').catch(() => null)
    return page === null || bar === null ? null : { page: JSON.parse(page), bar: JSON.parse(bar) }
  }, { partition: READER_PARTITION, script })
}
async function readerShot(name) {
  if (!SHOTS) return
  const png = await s.app.evaluate(async ({ BrowserWindow, session }, partition) => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses && w.contentView.children.length > 0)
    if (!win.isVisible()) win.showInactive()
    await new Promise(r => setTimeout(r, 700))
    return (await win.contentView.children[0].webContents.capturePage()).toPNG().toString('base64')
  }, READER_PARTITION)
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png, 'base64'))
}
const MARK = 'JSON.stringify((() => { const m = document.querySelector("mark#streams-mark"); const r = m?.getBoundingClientRect(); return { stored: Boolean(document.querySelector("[data-reader-stored]")), mark: m?.textContent ?? null, inView: r ? r.top >= 0 && r.bottom <= innerHeight : false, note: document.querySelector("[data-reader-note-line]")?.textContent ?? "", scripts: document.scripts.length } })())'

describe('W6a: 待看, the reading window, 来源与要求, 设置', () => {
  test('A3: the summary on top, the original\'s opening right under it, each point\'s place; the item whose page was not read says so; no score anywhere', async () => {
    const [a1, a2] = seeded.items
    await until(n => document.querySelectorAll('[data-card]').length === n, 3)
    const card = await s.page.evaluate(sel => {
      const c = document.querySelector(sel)
      return {
        line: c.querySelector('[data-part="card-line"]').textContent,
        what: Boolean(c.querySelector('[data-part="what"]')),
        whatBeforeOpening: c.querySelector('[data-part="what"]').compareDocumentPosition(c.querySelector('[data-part="opening"]')) & Node.DOCUMENT_POSITION_FOLLOWING,
        opening: c.querySelector('[data-part="opening"] p')?.textContent ?? '',
        meta: c.querySelector('[data-part="opening-meta"]')?.textContent ?? '',
        links: [...c.querySelectorAll('[data-action="open-point"]')].map(a => [a.dataset.point, a.dataset.paragraph, a.textContent]),
      }
    }, cardOf(a1.url))
    assert.ok(card.line.includes(INBOX.card.saved), card.line)
    assert.ok(card.whatBeforeOpening, 'the summary first, the opening after it')
    assert.ok(card.opening.startsWith('十月新能源乘用车零售量为一百一十万辆'), card.opening)
    assert.ok(card.meta.includes(INBOX.card.methods.direct), card.meta)
    assert.deepEqual(card.links.map(([p, para]) => [p, para]), [['0', '0'], ['1', '2'], ['2', '3']])
    assert.equal(card.links[1][2], '原文第 3 段 · 查看原句') // 1.1.2 第 2 件: 看原话 → 查看原句
    const missing = await s.page.evaluate(sel => {
      const c = document.querySelector(sel)
      return { mark: c.querySelector('[data-original-missing]')?.dataset.originalMissing ?? null, note: c.querySelector('[data-part="missing-note"]')?.textContent ?? '', what: Boolean(c.querySelector('[data-part="what"]')), points: Boolean(c.querySelector('[data-part="points"]')) }
    }, cardOf(seeded.missing))
    assert.deepEqual([missing.mark, missing.what, missing.points], ['login', false, false])
    assert.ok(missing.note.includes(INBOX.card.missingWhy.login), missing.note)
    // no score of 1.0's scoring on the page or in 详情 (control: 详情 is open on an item and has its why)
    const page = await s.page.evaluate(() => ({ main: document.querySelector('main').innerText, panel: document.querySelector('[data-part="right-panel"]').innerText, why: document.querySelector('[data-part="detail-why"]')?.innerText ?? '' }))
    assert.ok(page.why.includes('建库卡要'), page.why)
    for (const w of ['相关度', '实质', '新鲜度', '按评分排序']) { assert.equal(page.main.includes(w), false, `main: ${w}`); assert.equal(page.panel.includes(w), false, `panel: ${w}`) }
    assert.ok(page.panel.includes('收藏以后一直留着'), 'the original\'s keeping in 详情')
    // the library's head is the card's: its paragraph and its sources (not 1.0's 「尚未填写追踪要求」 and 0 sources)
    const head = await s.page.evaluate(() => document.querySelector('[data-part="library-head"]').innerText)
    assert.ok(head.includes('一座跟进中国电动车和动力电池的测试库') && head.includes('4 个来源'), head)
    await shot('inbox-light')
  })

  test('A4: a point opens the kept original — nothing fetched from the web — with that point\'s sentence marked and in view; three points', async () => {
    const [a1, a2] = seeded.items
    const picks = [[a1, 0], [a1, 2], [a2, 1]]
    for (const [it, point] of picks) {
      const before = site.hits.filter(h => it.url.endsWith(h)).length
      await s.page.click(`${cardOf(it.url)} [data-action="open-point"][data-point="${point}"]`)
      let r = null
      const t0 = Date.now()
      while (Date.now() - t0 < 30_000) {
        r = await readerPage(MARK)
        if (r && r.page.stored && r.page.mark === it.quotes[point] && r.page.note.includes(`从要点 ${point + 1} 打开`)) break
        await new Promise(x => setTimeout(x, 200))
      }
      assert.ok(r, 'the reading window opened')
      assert.equal(r.page.mark, it.quotes[point], `point ${point + 1} of ${it.url}`)
      assert.ok(r.page.inView, 'the marked sentence is in view')
      assert.equal(r.page.scripts, 0, 'the page runs no script')
      assert.deepEqual([r.bar.mode, r.bar.current, r.bar.original], ['stored', 'stored', true], '存下的原文, and 原网页 one click away')
      assert.equal(site.hits.filter(h => it.url.endsWith(h)).length, before, 'the page was not fetched again')
      await readerShot(`reader-${new URL(it.url).pathname.replace(/\//g, '')}-point${point + 1}`)
    }
    // 1.1.1 P12 C3 (A7): the same page of the reading window in dark — its page follows the app (what would fail it: the
    // light page, whose background is near white)
    const BG = 'JSON.stringify(getComputedStyle(document.body).backgroundColor)'
    const lum = c => { const [r, g, b] = String(c).match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
    // the marked sentence can be read, in light and in dark: its words against its own background (the mark's colour over
    // the page's), at least 4.5 : 1 (1.1.1 P12 C3 found 1.13 in dark: the theme's light mark rule won)
    const markedReads = async look => {
      const MARKED = 'JSON.stringify((() => { const m = document.querySelector("mark#streams-mark") ?? document.querySelector("mark.rd-mark"); const c = getComputedStyle(m); const card = m.closest("article, main, body"); return { fg: c.color, bg: c.backgroundColor, under: getComputedStyle(card).backgroundColor, page: getComputedStyle(document.body).backgroundColor } })())'
      const rgba = c => { const n = String(c).match(/[\d.]+/g).map(Number); return String(c).startsWith('color(') ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : [n[0], n[1], n[2], n[3] ?? 1] }
      const over = (top, base) => { const [r, g, b, a] = rgba(top); const [R, G, B] = rgba(base); return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)] }
      const rel = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const marked = (await readerPage(MARKED)).page
      const base = rgba(marked.under)[3] === 0 ? marked.page : marked.under
      const bgMark = over(marked.bg, base)
      const fgMark = over(marked.fg, bgMark)
      const [hi, lo] = [rel(fgMark), rel(bgMark)].sort((x, y) => y - x)
      assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, `the marked sentence in ${look}: ${JSON.stringify(marked)} → ${((hi + 0.05) / (lo + 0.05)).toFixed(2)}`)
    }
    const light = await readerPage(BG)
    await markedReads('light')
    assert.ok(light && lum(light.page) > 0.7, `light first: ${light?.page}`)
    assert.ok((await s.page.evaluate(() => window.streams.setAppearance('dark'))).ok)
    let dark = null
    for (let i = 0; i < 100; i++) { dark = await readerPage(BG); if (dark && lum(dark.page) < 0.3) break; await new Promise(x => setTimeout(x, 200)) }
    assert.ok(dark && lum(dark.page) < 0.3, `the reading window in dark: ${dark?.page}`)
    await markedReads('dark')
    const [last, lastPoint] = picks.at(-1)
    await readerShot(`reader-${new URL(last.url).pathname.replace(/\//g, '')}-point${lastPoint + 1}-dark`)
    await s.page.evaluate(() => window.streams.setAppearance('light'))
  })

  test('A5: 来源与要求 shows the card and its sources — address or search word, and the three kinds of 「原文」 — and a source added waits for 确认', async () => {
    await s.page.click('.st-lib-tabs button[data-tab="sources"]')
    try {
      await until(() => document.querySelector('[data-part="card"]') !== null && document.querySelectorAll('[data-card-row]').length > 0)
    } catch (err) {
      const seen = await s.page.evaluate(async () => ({ screen: document.querySelector('main')?.dataset.screen, bridge: JSON.stringify(await window.streams.getCardView()).slice(0, 400) }))
      throw new Error(`no card on 来源与要求: ${JSON.stringify(seen)} · errors ${JSON.stringify(s.errors)}`)
    }
    const view = await s.page.evaluate(() => ({
      lines: [...document.querySelectorAll('[data-part="card-lines"] [data-line]')].map(e => e.dataset.line),
      rows: [...document.querySelectorAll('[data-card-row]')].map(e => [e.dataset.cardRow, e.dataset.original, e.querySelector('[data-original-word]').textContent, e.querySelector('.file-text small').textContent]),
      brief: Boolean(document.querySelector('[data-field="brief"]')), strict: Boolean(document.querySelector('[data-part="strictness"]')), topics: Boolean(document.querySelector('[data-part="topics"]')),
    }))
    assert.deepEqual(view.lines, ['purpose', 'scope', 'exclude', 'trust', 'rhythm', 'language', 'hard'])
    const O = SOURCES.cardSources.originals
    assert.deepEqual(view.rows.map(r => [r[0], r[1], r[2]]), [['数据站', 'read', O.read], ['报告库', 'pdf', O.pdf], ['会员区', 'link', O.link], ['固态电池', 'search', O.search], ['某协会', 'link', O.link]])
    assert.ok(view.rows[0][3].startsWith('http://127.0.0.1:'), 'its address')
    assert.equal(view.rows[3][3], '检索词：固态电池 装车')
    assert.deepEqual([view.brief, view.strict, view.topics], [false, false, false], '1.0\'s brief, strictness and topics are not on a card library\'s page')
    await shot('sources-light')
    const cardFile = join(s.world.library, '_card', 'card.json')
    const history = () => readdirSync(join(s.world.library, '_card', 'history')).length
    for (const [typed, check] of [[`${site.base}/new-feed`, c => c.sources.some(x => x.url === `${site.base}/new-feed`)], ['电池 装车 验证', c => c.sources.some(x => x.query === '电池 装车 验证')]]) {
      const hash = fileHash(cardFile)
      const n = history()
      await s.page.fill('[data-field="card-source"]', typed)
      await s.page.press('[data-field="card-source"]', 'Enter')
      await until(() => document.querySelector('[data-part="source-pending"]') !== null)
      assert.equal(fileHash(cardFile), hash, 'nothing written before 确认')
      await shot('sources-pending')
      await s.page.click('[data-action="confirm-source"] button')
      await until(() => document.querySelector('[data-part="source-pending"]') === null)
      await until(t => [...document.querySelectorAll('[data-card-row] .file-text small')].some(e => e.textContent.includes(t)), typed)
      assert.ok(check(JSON.parse(readFileSync(cardFile, 'utf8'))), typed)
      assert.equal(history(), n + 1, 'the new version kept in the history')
    }
    // 不加: nothing written
    const hash = fileHash(cardFile)
    await s.page.fill('[data-field="card-source"]', `${site.base}/not-this`)
    await s.page.press('[data-field="card-source"]', 'Enter')
    await until(() => document.querySelector('[data-part="source-pending"]') !== null)
    await s.page.click('[data-action="drop-source"] button')
    await until(() => document.querySelector('[data-part="source-pending"]') === null)
    assert.equal(fileHash(cardFile), hash)
  })

  test('A6 (1.1.1): 设置 says 「只能问库」 of no connection — Codex (P3) and an API key (P6) build and update too', async () => {
    await s.page.click('.st-sidebar__footer-button')
    await until(() => document.querySelectorAll('[data-connection]').length === 3)
    const r = await s.page.evaluate(() => ({ notes: [...document.querySelectorAll('[data-connection]')].map(e => [e.dataset.connection, e.querySelector('[data-part="only-ask"]')?.textContent ?? null]), uses: document.querySelector('[data-part="agent-uses"]').textContent, page: document.querySelector('main').innerText }))
    // what would fail it (A6's failing input): the words 「只能问库」 anywhere on the settings page
    assert.equal(r.page.includes('只能问库'), false, 'no 「只能问库」 on 设置')
    assert.deepEqual(r.notes, [['claude-code', null], ['codex', null], ['api', null]])
    assert.equal(r.uses, SETTINGS.conn.agentUses)
    assert.equal(r.uses.includes('评分'), false)
    await shot('settings-light')
  })

  test('A7: light and dark, an 80-character title: nothing runs over its box on 待看, 来源与要求 or 设置', async () => {
    const long = seeded.items[0].title
    assert.ok([...long].length >= 80, `the title is ${[...long].length} characters`)
    const over = () => s.page.evaluate(() => {
      const bad = []
      for (const el of document.querySelectorAll('main *')) {
        const box = el.closest('article, section, .file-row, .panel-section') ?? el.parentElement
        if (!box || box === el) continue
        const a = el.getBoundingClientRect()
        const b = box.getBoundingClientRect()
        if (a.width === 0 || getComputedStyle(el).position === 'fixed') continue
        if (a.right > b.right + 1 || a.left < b.left - 1) bad.push(`${el.tagName}.${el.className}`.slice(0, 80))
      }
      const main = document.querySelector('main .thread-scroll') ?? document.querySelector('main')
      if (main.scrollWidth > main.clientWidth + 1) bad.push('the main column scrolls sideways')
      return bad.slice(0, 5)
    })
    for (const look of ['light', 'dark']) {
      const set = await s.page.evaluate(a => window.streams.setAppearance(a), look)
      assert.ok(set.ok, JSON.stringify(set))
      await until(a => document.body.dataset.appearance === a, look)
      for (const tab of ['inbox', 'sources']) {
        // back to the library (from 设置, the round before), then its tab
        if (!(await s.page.$('.st-lib-tabs'))) await s.page.click('[data-library-row]')
        await s.page.waitForSelector('.st-lib-tabs')
        await s.page.click(`.st-lib-tabs button[data-tab="${tab}"]`)
        await until(t => document.querySelector(`main[data-screen="${t}"][data-state="ready"]`) !== null, tab)
        assert.deepEqual(await over(), [], `${tab} ${look}`)
        await shot(`${tab}-${look}`)
      }
      await s.page.click('.st-sidebar__footer-button')
      await until(() => document.querySelector('main[data-screen="settings"][data-state="ready"]') !== null)
      assert.deepEqual(await over(), [], `settings ${look}`)
      await shot(`settings-${look}`)
    }
  })

  test('no page error in the run', () => {
    assert.deepEqual(s.errors.filter(e => !/favicon/.test(e)), [])
  })
})

// ---- E5: the app started in English ----
describe('W6a in English (E5)', () => {
  let siteEn = null
  const e = worldSession({
    kind: 'empty',
    waitFor: 'inbox',
    prepare: async world => { siteEn = await startCardSite(); await seedCardLibrary(world.library, siteEn); return () => siteEn.close() },
    settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, language: 'en' },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
  })
  test('the new parts of 待看 are English', async () => {
    await e.page.waitForFunction(t => document.querySelector('[data-part="opening"] .section-label span')?.textContent === t, INBOX_EN.card.opening, POLL)
    const words = await e.page.evaluate(() => [...document.querySelectorAll('[data-part="opening"] .section-label, [data-action="open-point"], [data-action="open-stored"], [data-action="open-web"], [data-original-missing], [data-part="missing-note"]')].map(x => x.textContent))
    assert.ok(words.length > 8, words.length)
    // (a card's line is left out: it holds the source's name, which is data, in the library's own language)
    for (const w of words) assert.equal(CJK.test(w), false, w)
    if (SHOTS) { await e.page.waitForTimeout(400); await e.page.screenshot({ path: join(SHOTS, 'inbox-en.png') }) }
  })
})

// ---- A6: a library built by the last version (no card), on Codex and on Claude Code ----
describe('W6a: a library built by the last version (A6)', () => {
  let oldWorld = null
  const o = worldSession({
    kind: 'seeded',
    waitFor: 'sources',
    prepare: world => { oldWorld = world },
    settings: { connections: { active: 'codex' }, panel: { open: true, tab: 'detail' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
  })
  test('the notice and 「重新查一遍来源」: on with Codex (1.1.1 P3); off on an API key with the reason; on with Claude Code', async () => {
    await o.page.waitForSelector('[data-part="old-library"]', POLL)
    const state = () => o.page.evaluate(() => ({ can: document.querySelector('[data-part="old-library"]').dataset.can, disabled: document.querySelector('[data-action="recheck-sources"] button').disabled, why: document.querySelector('[data-part="recheck-why"]')?.textContent ?? null, lead: document.querySelector('[data-lead]').textContent }))
    const onCodex = await state()
    assert.deepEqual([onCodex.can, onCodex.disabled, onCodex.why], ['true', false, null], 'Codex can check the sources again')
    if (SHOTS) await o.page.screenshot({ path: join(SHOTS, 'sources-old-codex.png') })
    assert.ok((await o.page.evaluate(() => window.streams.setActiveConnection('api'))).ok)
    await o.page.waitForFunction(() => document.querySelector('[data-part="old-library"]')?.dataset.can === 'false', null, POLL)
    const off = await state()
    // (1.1.1 P6: an API key with no model key stored — off, with the reason)
    assert.deepEqual([off.can, off.disabled, off.why], ['false', true, fmt(SOURCES.old.needsClaude, { cc: CONNECTIONS.names['claude-code'], cx: CONNECTIONS.names.codex, api: CONNECTIONS.names.api })])
    assert.equal(off.lead, SOURCES.old.lead)
    const set = await o.page.evaluate(() => window.streams.setActiveConnection('claude-code'))
    assert.ok(set.ok, JSON.stringify(set))
    await o.page.waitForFunction(() => document.querySelector('[data-part="old-library"]')?.dataset.can === 'true', null, POLL)
    assert.equal(await o.page.evaluate(() => document.querySelector('[data-action="recheck-sources"] button').disabled), false)
    assert.equal(await o.page.evaluate(() => document.querySelector('[data-part="recheck-why"]')), null)
    if (SHOTS) await o.page.screenshot({ path: join(SHOTS, 'sources-old-claude.png') })
  })

  // 1.1 W9 (A6 names the API key; B17's 换库): on an API key the button is off with the reason, and bringing the library
  // over is refused with nothing written
  // 1.1.1 P6 (A6, B17): with the model's key an API key checks the sources again too — bringing the library over starts; nothing
  // in its folder changes before 确认
  test('on an API key with its key: 「重新查一遍来源」 on; bringing the library over starts; the folder byte for byte', async () => {
    const tree = dir => {
      const out = {}
      const walk = d => { for (const n of readdirSync(d, { withFileTypes: true })) { const p = join(d, n.name); if (n.isDirectory()) walk(p); else out[p.slice(dir.length)] = createHash('sha256').update(readFileSync(p)).digest('hex') } }
      walk(dir)
      return out
    }
    const before = tree(oldWorld.library)
    assert.ok(Object.keys(before).some(f => f.includes('notes')), 'control: the folder has its notes')
    assert.ok((await o.page.evaluate(() => window.streams.setApiKey('anthropic', 'sk-test-w9-not-real'))).ok)
    assert.ok((await o.page.evaluate(() => window.streams.setActiveConnection('api'))).ok)
    await o.page.waitForFunction(() => document.querySelector('[data-part="old-library"]')?.dataset.can === 'true', null, POLL)
    const on = await o.page.evaluate(() => ({ disabled: document.querySelector('[data-action="recheck-sources"] button').disabled, why: document.querySelector('[data-part="recheck-why"]')?.textContent ?? null }))
    assert.deepEqual([on.disabled, on.why], [false, null])
    if (SHOTS) await o.page.screenshot({ path: join(SHOTS, 'sources-old-api.png') })
    const id = (await o.page.evaluate(() => window.streams.getAppState())).data.library.libraryId
    const r = await o.page.evaluate(x => window.streams.startBuild('换过来', x), id)
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.equal(r.data.mode, 'convert')
    await o.page.evaluate(() => window.streams.dropBuild())
    assert.deepEqual(tree(oldWorld.library), before, 'the library byte for byte (nothing before 确认)')
  })
})

// ---- B12: the connection's sign-in ran out: the update does not start and 待看 says so ----
describe('W6a: the banner when the sign-in ran out (B12)', () => {
  let siteB = null
  const b = worldSession({
    kind: 'empty',
    waitFor: 'inbox',
    prepare: async world => { siteB = await startCardSite(); await seedCardLibrary(world.library, siteB); return () => siteB.close() },
    settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'login-expired', STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
  })
  test('no banner before; an update that cannot start for the sign-in puts it at the top of 待看, with the way to 设置', async () => {
    await b.page.waitForSelector('[data-card]', POLL)
    assert.equal(await b.page.$('[data-part="update-banner"]'), null, 'no banner before')
    const hits = siteB.hits.length
    const r = await b.page.evaluate(() => window.streams.startRound())
    assert.ok(r.ok, JSON.stringify(r))
    await b.page.waitForSelector('[data-part="update-banner"][data-code="login-expired"]', POLL)
    const text = await b.page.evaluate(() => document.querySelector('[data-part="update-banner"]').textContent)
    assert.ok(text.includes(INBOX.banner.loginExpired) && text.includes(INBOX.banner.toSettings), text)
    assert.equal(siteB.hits.length, hits, 'no source read: the update did not start')
    if (SHOTS) await b.page.screenshot({ path: join(SHOTS, 'inbox-login-expired.png') })
    await b.page.click('[data-part="update-banner"] [data-action="to-settings"] button')
    await b.page.waitForSelector('main[data-screen="settings"]', POLL)
  })
})
