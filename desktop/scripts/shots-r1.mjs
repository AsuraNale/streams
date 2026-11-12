#!/usr/bin/env node
// Pictures of the real window for redesign R1 (docs/checks/2026-11-11-r1/contract.md 「测」): Playwright drives the pinned
// Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; every world under the OS temp folder (removed
// after); the connection the core's fake, the quota corner from STREAMS_DEV_QUOTA, two proposal cards made at start
// (STREAMS_DEV_PROPOSALS). The theme and the appearance are changed the way 设置 changes them (setTheme / setAppearance), and
// the script checks the page is in that set (its <body> class and template sheets) before each picture.
//   node scripts/shots-r1.mjs                 all → docs/shots/2026-11-11-r1/
//   --out <folder>
// Pictures (<theme>-<appearance>-<screen>.png; the screens' names are the design's, 07-模板版/截图/<主题>/<画面>.png):
//   the four themes, light: 库架 (shelf) · 待看 (inbox, the shell around it) · 主Agent (chat) · 设置 外观与语言 (settings-look);
//   研究对话 and 单线黑白, dark: 库架 · 待看; the queue (研究对话 light: the waiting library's head 「排队中 · 第 2 位」 and the
//   sidebar's lines, the panel on 进度): queue-head-sidebar; the right panel folded (研究对话 light, 待看): panel-folded.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedPlanB, seedShelf } from '../test/support/seed.mjs'
import { seedQueue, startHoldingFeed } from '../test/support/queue-world.mjs'
import { THEME_IDS, THEME_TEMPLATE } from '../src/shared/themes.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-11-r1'))
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

/** One run of the app on a fresh world; `queue`: the busy queue of test/support/queue-world.mjs. */
async function session({ queue = false }, work) {
  const root = tempDir('st-shots-r1-')
  let app = null
  let feed = null
  try {
    const world = await makeWorld({ root, kind: 'seeded' })
    await seedPlanB(world)
    const shelf = await seedShelf(world)
    let q = null
    if (queue) {
      feed = await startHoldingFeed({ holdMs: 18_000 })
      q = await seedQueue(world, shelf, feed, { sources: 12 })
    }
    const cards = join(root, 'cards.json')
    writeFileSync(cards, JSON.stringify([
      { kind: 'edit_brief', params: { libraryId: shelf.ids[1], brief: '只追整车销量与电池装机量。' }, why: '你说「电池那块也要」' },
      { kind: 'edit_cap', params: { libraryId: shelf.ids[0], cap: 30 }, why: '你说「单次运行 30 次就够了」' },
    ]))
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: 'shelf', STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake',
      STREAMS_DEV_QUOTA: quotaFile(root), STREAMS_DEV_PROPOSALS: cards, STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'),
      ...(q ? { STREAMS_DEV_NOW: q.now } : {}),
    }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', connections: { active: 'claude-code' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, 'shelf')
    await until(() => document.querySelector('[data-part="quota"]') !== null)
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
      await page.waitForTimeout(500)
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
    const libTab = async (id, screen = id) => { await page.click(`.st-lib-tabs [data-tab="${id}"]`); await ready(page, screen) }
    const openLib = async (id, screen) => {
      await page.click(`[data-library-row="${id}"]`)
      await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-state="ready"]`) !== null, id)
      if (!(await page.evaluate(sc => document.querySelector(`main[data-screen="${sc}"]`) !== null, screen))) await libTab(screen)
    }
    await work({ page, until, shot, tab, libTab, openLib, look, q, shelf, world })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    if (feed) await feed.close()
    removeTree(root, { waitMs: 10_000 })
  }
}

async function screens(tools, theme, appearance, which) {
  const { page, until, shot, tab, openLib, look, shelf } = tools
  await look(theme, appearance)
  const pre = `${theme}-${appearance}`
  if (which.includes('shelf')) {
    await page.click('[data-nav="shelf"]')
    await ready(page, 'shelf')
    await tab('progress')
    await until(() => document.querySelectorAll('[data-shelf-card]').length === 3)
    await shot(`${pre}-shelf`)
  }
  if (which.includes('inbox')) {
    await openLib(shelf.ids[0], 'inbox')
    await until(() => document.querySelector('[data-card]') !== null)
    await tab('detail')
    await until(() => document.querySelector('[data-part="detail-inbox"]') !== null)
    await shot(`${pre}-inbox`)
  }
  if (which.includes('chat')) {
    await page.click('[data-nav="chat"]')
    await ready(page, 'chat')
    await tab('decide')
    await until(() => document.querySelectorAll('[data-decide]').length >= 2)
    await shot(`${pre}-chat`)
  }
  if (which.includes('settings')) {
    await page.click('.st-sidebar__footer-button')
    await ready(page, 'settings')
    await tab('progress')
    await page.evaluate(() => document.querySelector('[data-group="look"]').scrollIntoView({ block: 'start' }))
    await shot(`${pre}-settings-look`)
  }
}

await session({}, async tools => {
  for (const theme of THEME_IDS) await screens(tools, theme, 'light', ['shelf', 'inbox', 'chat', 'settings'])
  for (const theme of ['research', 'monoline']) await screens(tools, theme, 'dark', ['shelf', 'inbox'])
  // the right panel folded, on 待看
  await screens(tools, 'research', 'light', ['inbox'])
  await tools.page.click('[data-action="fold"] button')
  await tools.until(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'false')
  await tools.shot('research-light-panel-folded')
  await tools.page.click('[data-action="unfold"] button')
  await tools.until(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'true')
})
await session({ queue: true }, async ({ page, until, shot, tab, openLib, look, q }) => {
  await look('research', 'light')
  await until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`) !== null, [q.running, q.waiting])
  await openLib(q.waiting, 'inbox')
  await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'queued')
  await tab('progress')
  await until(() => document.querySelector('[data-part="running"]') !== null)
  await shot('research-light-queue-head-sidebar')
})
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
