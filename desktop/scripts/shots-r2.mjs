#!/usr/bin/env node
// Pictures of the real window for redesign R2 (docs/checks/2026-11-11-r2/contract.md 「测」): Playwright drives the pinned
// Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; every world under the OS temp folder (removed
// after), its data made here: the seeded library (test/support/seed.mjs: a real round of the core) with the shelf's two other
// libraries; the quota corner from STREAMS_DEV_QUOTA. The theme and the appearance are changed the way 设置 changes them.
//   node scripts/shots-r2.mjs                 all → docs/shots/2026-11-11-r2/
//   --out <folder>   --only p05|p06|p07|p08
// Pictures (<theme>-<appearance>-<page>.png; the pages are the design's 03-页面稿 P05–P08):
//   research-light-p05  待看 with cards (one with the 「面向 AI 的指令」 mark), the bar after 放弃, 稍后处理 · 1 条, 待评分 (a link
//                       added by hand), 未通过筛选 opened, the right panel on 详情 (推荐理由, 核验, 核验记录, 来源)
//   precision-light-p05 · monoline-light-p05 · research-dark-p05   the same page in three more looks
//   research-light-p05-record   详情's 核验记录 opened (what the dialog had)
//   research-light-p06  待看 empty: 暂无待看内容, the last run's funnel, 处理情况 and 模型调用 N = …, 最近收藏, 未通过筛选 folded;
//                       the right panel on 进度 (当前无运行任务 + the same funnel)
//   research-light-p07  a library running (its catch-up, held on a slow feed) and another waiting: 待看's 本次运行 and six steps,
//                       the head's 「运行中：抓取 · 模型调用 0 / 上限 …」, the right panel's 进度 (running, 队列顺序, 下次运行时间)
//   research-light-p08  立即运行 with the sign-in expired: the banner (three buttons), 「有 n 条内容已抓取、尚未评分」, the funnel stopped
//                       at its first cell; the right panel on 待确认 with the library's two system findings (a source failing, no
//                       output three runs in a row)
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedPlanB, seedShelf } from '../test/support/seed.mjs'
import { seedQueue, startHoldingFeed } from '../test/support/queue-world.mjs'
import { THEME_TEMPLATE } from '../src/shared/themes.mjs'

const CORE = pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href
const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-11-r2'))
const ONLY = value('--only') ?? null
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
mkdirSync(OUT, { recursive: true })
const report = []

function quotaFile(root) {
  const file = join(root, 'quota.json')
  const now = Math.floor(Date.now() / 1000)
  writeFileSync(file, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [
    { id: 'five_hour', usedPercent: 8, resetsAt: now + 4 * 3600 },
    { id: 'seven_day', usedPercent: 26, resetsAt: now + 3 * 86400 },
  ] } }))
  return file
}

/** One run of the app on a fresh world; `prepare(world, shelf, core)` makes the page's data before the app starts. */
async function session({ queue = false, connection = 'fake', prepare = null }, work) {
  const root = tempDir('st-shots-r2-')
  let app = null
  let feed = null
  try {
    const core = await import(CORE)
    const world = await makeWorld({ root, kind: 'seeded' })
    await seedPlanB(world)
    const shelf = await seedShelf(world)
    let q = null
    if (queue) {
      feed = await startHoldingFeed({ holdMs: 18_000 })
      q = await seedQueue(world, shelf, feed, { sources: 2 })
    }
    if (prepare) await prepare(world, shelf, core)
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: 'inbox', STREAMS_DEV_CONNECTION: connection,
      STREAMS_DEV_QUOTA: quotaFile(root), STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_DEV_LIBRARY: '',
      ...(q ? { STREAMS_DEV_NOW: q.now } : {}),
    }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, 'inbox')
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const look = async (theme, appearance) => {
      for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
        const r = await page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
        if (!r.ok) throw new Error(`${m}(${v}): ${JSON.stringify(r)}`)
      }
      await until(([t, a, cls]) => document.documentElement.dataset.theme === t && document.body.dataset.appearance === a && document.body.className === cls
        && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass])
    }
    const shot = async name => {
      await page.evaluate(() => document.activeElement?.blur?.())
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const file = join(OUT, `${name}.png`)
      for (let i = 0; ; i++) {
        try { await page.screenshot({ path: file, timeout: 20_000 }); break } catch (err) {
          if (i === 2) throw err
          await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })
          await page.waitForTimeout(500)
        }
      }
      report.push(file)
      process.stdout.write(`${file}\n`)
    }
    const tab = async t => {
      if (await page.evaluate(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'false')) await page.click('[data-action="unfold"] button')
      await page.click(`[data-panel-tab="${t}"]`)
      await until(x => document.querySelector('[data-part="right-panel"]')?.dataset.tab === x, t)
    }
    const openLib = async id => {
      await page.click(`[data-library-row="${id}"]`)
      await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="inbox"][data-state="ready"]`) !== null, id)
    }
    const bridge = (name, ...a) => page.evaluate(([n, x]) => window.streams[n](...x), [name, a])
    await work({ page, until, shot, tab, openLib, look, q, shelf, world, bridge, feed })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    if (feed) await feed.close()
    removeTree(root, { waitMs: 10_000 })
  }
}

const sha1 = s => createHash('sha1').update(String(s)).digest('hex')
/** The second card of the seed carries the 「写给 AI 的话」 mark (as a round that found one writes it into the card's file). */
function markAi(world) {
  const url = world.seed.inbox[1].url
  const file = join(world.library, '_pipeline', 'inbox', `${sha1(url)}.json`)
  const card = JSON.parse(readFileSync(file, 'utf8'))
  card.aiInstruction = true
  card.verification = { ...(card.verification ?? {}), aiInstruction: { source: 'rule', matches: [{ phrase: '忽略之前的所有指令' }] } }
  writeFileSync(file, `${JSON.stringify(card, null, 2)}\n`, 'utf8')
}

/** P05 on the current library: L on the third card, D on the last one (the bar), a link added by hand, 未通过筛选 opened. */
async function p05(t) {
  const { page, until, tab, bridge, world } = t
  await until(() => document.querySelectorAll('[data-card]').length === 4)
  const urls = await page.evaluate(() => [...document.querySelectorAll('[data-card]')].map(e => e.dataset.url))
  await page.click(`[data-card][data-url="${urls[2]}"] [data-action="later"] button`)
  await until(() => document.querySelector('[data-part="later"]') !== null)
  const r = await bridge('addManualLink', 'https://example.org/agent-memory-survey', '')
  if (!r.ok) throw new Error(JSON.stringify(r))
  await until(() => document.querySelector('[data-part="manual"] [data-manual]') !== null)
  await page.click(`[data-card][data-url="${urls[3]}"] [data-action="dismiss"] button`)
  await until(() => document.querySelector('[data-part="dismiss-bar"]') !== null)
  const rej = await page.evaluate(() => document.querySelector('[data-part="rejected"] summary') !== null)
  if (rej) await page.click('[data-part="rejected"] summary')
  await until(() => document.querySelector('[data-part="rejected"][data-open="true"] [data-rejected]') !== null)
  await page.click(`[data-card][data-url="${urls[0]}"] .card-body`)
  await until(u => document.querySelector(`[data-card][data-url="${u}"]`)?.dataset.current === 'true', urls[0])
  await tab('detail')
  await until(() => document.querySelector('[data-part="detail-inbox"]') !== null)
  await page.evaluate(() => document.querySelector('.inbox-body')?.scrollTo(0, 0))
  void world
}

const want = id => ONLY === null || ONLY === id

if (want('p05')) {
  await session({ prepare: world => markAi(world) }, async t => {
    await t.look('research', 'light')
    await p05(t)
    await t.shot('research-light-p05')
    // the lower half of the same page: 待评分, the bar after 放弃, 稍后处理, 未通过筛选 opened
    await t.page.evaluate(() => { const b = document.querySelector('.inbox-body'); b.scrollTo(0, b.scrollHeight) })
    await t.shot('research-light-p05-lower')
    await t.page.evaluate(() => document.querySelector('.inbox-body')?.scrollTo(0, 0))
    for (const [theme, appearance] of [['precision', 'light'], ['monoline', 'light'], ['research', 'dark']]) {
      await t.look(theme, appearance)
      await t.shot(`${theme}-${appearance}-p05`)
    }
    await t.look('research', 'light')
    await t.page.click('[data-part="detail-record"] summary')
    await t.until(() => document.querySelector('[data-part="detail-record"] .vd[data-state="ready"]') !== null)
    await t.shot('research-light-p05-record')
  })
}

if (want('p06')) {
  // every card decided before the app starts: two kept, two let go (one with a reason) — 待看 is empty
  await session({ prepare: (world, shelf, core) => {
    const items = core.listInbox(world.library)
    core.keep(world.library, items[0].url)
    core.keep(world.library, items[1].url)
    core.dismiss(world.library, items[2].url, '营销内容', { quick: 'marketing' })
    core.dismiss(world.library, items[3].url)
  } }, async t => {
    await t.look('research', 'light')
    await t.until(() => document.querySelector('[data-part="empty"]') !== null && document.querySelector('main [data-part="last-run"]') !== null)
    await t.tab('progress')
    await t.until(() => document.querySelector('[data-part="right-panel"] [data-part="last-run"]') !== null)
    await t.shot('research-light-p06')
  })
}

if (want('p07')) {
  await session({ queue: true }, async t => {
    await t.look('research', 'light')
    await t.until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`) !== null, [t.q.running, t.q.waiting])
    await t.openLib(t.q.running)
    await t.until(() => document.querySelector('[data-part="run-steps"]') !== null && document.querySelector('[data-part="running-chip"]') !== null)
    await t.tab('progress')
    await t.until(() => document.querySelector('[data-part="running"]') !== null)
    await t.shot('research-light-p07')
  })
}

if (want('p08')) {
  await session({ connection: 'login-expired', prepare: (world, shelf, core) => {
    const dir = world.library
    // 待看 empty, one item fetched and not scored yet
    for (const it of core.listInbox(dir)) core.keep(dir, it.url)
    core.appendEvent(dir, { ev: 'seen', url: 'https://example.org/ev/oct-retail', source: 'letta-blog', title: '10 月乘用车零售数据', date: core.localIsoDate(new Date()) })
    // three runs in a row without output after the seed's round (no-output), and the 404 source of plan B (source-failing)
    const at = i => new Date(Date.now() - (4 - i) * 3_600_000).toISOString()
    appendFileSync(join(dir, '_pipeline', 'rounds.jsonl'), [1, 2, 3].map(i => `${JSON.stringify({ id: `dry-${i}`, startedAt: at(i), finishedAt: at(i), counts: { fetched: 2, new: 0, maybeDuplicates: 0, summarized: 0, inbox: 0 }, gates: { relevance: { passed: 0, failed: 0, unscored: 0 }, substance: { passed: 0, failed: 0, unscored: 0 } }, calls: 0 })}
`).join(''), 'utf8')
    for (const i of [1, 2, 3]) core.appendFetchLog(dir, { ts: at(i), round: `dry-${i}`, source: 'mcp-news', kind: 'rss', status: 'failed', hint: 'retry-next-round', count: 0, new: 0, message: 'connect ECONNREFUSED' })
    core.recordSuggestions(dir, core.suggestFor(dir))
  } }, async t => {
    await t.look('research', 'light')
    await t.until(() => document.querySelector('[data-part="run-button"][data-run-state="idle"] button')?.disabled === false)
    await t.page.click('[data-part="run-button"] button')
    await t.until(() => document.querySelector('.lib-page [data-part="problem"]') !== null && document.querySelector('[data-part="caught-waiting"]') !== null)
    await t.until(() => document.querySelector('main [data-part="last-run"][data-complete="false"]') !== null)
    await t.tab('decide')
    await t.until(() => document.querySelectorAll('[data-decide]').length >= 2)
    await t.shot('research-light-p08')
  })
}
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
