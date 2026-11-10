#!/usr/bin/env node
// Pictures of the real window for v2 package L (docs/checks/2026-11-10-wp-l/contract.md 「测」), after scripts/shots-k2.mjs:
// Playwright drives the pinned Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; every world under
// the OS temp folder (removed after); the connections the core's fake, the quota corner from STREAMS_DEV_QUOTA, the main Agent
// the core's scripted stand-in (one lookup, one proposal card), two proposal cards made at start (STREAMS_DEV_PROPOSALS); the
// queue busy as on 维护者's morning of 11-10 (test/support/queue-world.mjs: 「中国电动车行业」 catching up its missed round with its
// feeds held on this machine, 「中国时尚上市公司」 waiting behind it).
//   node scripts/shots-l.mjs                 all → docs/shots/2026-11-10-l/
//   --out <folder>  --only main|themes
// 精密国际主义 浅色 (main): the right panel's four tabs on 待看 (panel-<tab>-inbox), 详情 on 资料库 / 问库 / 和主 Agent 聊
// (detail-<screen>), the panel folded (panel-closed-inbox), the queue three ways (queue-dialog, queue-overview, queue-sidebar),
// 资料库's two columns (library-two-col). The five other sets (精密国际主义 深色, 澄明玻璃 浅 / 深, 研究对话 浅 / 深): 进度 on 待看
// (progress-<theme>-<appearance>). The bundled font must be loaded in every window, else the script fails.
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

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-10-l'))
const ONLY = value('--only') ?? null
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
const FONT_CHECK = "document.fonts.check('14px \"Streams Noto Sans SC\"') && [...document.fonts].some(f => f.family.replace(/\"/g, '') === 'Streams Noto Sans SC' && f.status === 'loaded')"
mkdirSync(OUT, { recursive: true })
const report = []

function quotaFile(root) {
  const file = join(root, 'quota.json')
  const now = Math.floor(Date.now() / 1000)
  writeFileSync(file, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [
    { id: 'five_hour', usedPercent: 5, resetsAt: now + 4 * 3600 },
    { id: 'seven_day', usedPercent: 11, resetsAt: now + 3 * 86400 },
  ] } }))
  return file
}

/** One run of the app on a fresh busy-queue world; `work(page, tools)` takes the pictures. */
async function session(theme, appearance, work) {
  const root = tempDir(`st-shots-l-${theme}-${appearance}-`)
  let app = null
  let feed = null
  try {
    const world = await makeWorld({ root, kind: 'seeded' })
    await seedPlanB(world)
    const shelf = await seedShelf(world)
    feed = await startHoldingFeed({ holdMs: 18_000 })
    const q = await seedQueue(world, shelf, feed, { sources: 12 })
    const script = join(root, 'agent-script.json')
    writeFileSync(script, JSON.stringify([
      { reply: '', lookups: [{ what: 'library', libraryId: shelf.ids[0] }] },
      { reply: '查过了：这个库的来源只有两个在正常出条目。我拟了一个改动：', proposals: [{ kind: 'edit_brief', why: '你说「只看评测」', params: { libraryId: shelf.ids[0], brief: '只追 agent 记忆方案的评测与对比，不要营销稿。' } }] },
    ]))
    const cards = join(root, 'cards.json')
    writeFileSync(cards, JSON.stringify([{ kind: 'edit_brief', params: { libraryId: shelf.ids[1], brief: '只追整车销量与电池装机量。' }, why: '你说「电池那块也要」' }]))
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: 'shelf', STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_AGENT_SCRIPT: script,
      STREAMS_DEV_QUOTA: quotaFile(root), STREAMS_DEV_NOW: q.now, STREAMS_DEV_PROPOSALS: cards, STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'),
    }
    const started = await launch(world, { env, settings: { theme, appearance, connections: { active: 'claude-code' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, 'shelf')
    await until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`) !== null && document.querySelector('[data-part="quota"]') !== null, [q.running, q.waiting])
    await page.evaluate(() => document.fonts.ready)
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const seen = await page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.appearance])
    if (seen[0] !== theme || seen[1] !== appearance) throw new Error(`the page is ${seen.join('/')}, not ${theme}/${appearance}`)
    const shot = async name => {
      await page.evaluate(() => document.activeElement?.blur?.())
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(450)
      if (await page.evaluate(FONT_CHECK) !== true) throw new Error(`${name}: the bundled font is not loaded`)
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
    const tab = async t => { await page.click(`[data-panel-tab="${t}"]`); await until(x => document.querySelector('[data-part="right-panel"]')?.dataset.tab === x, t) }
    const libTab = async (id, screen = id) => { await page.click(`.st-lib-tabs [data-tab="${id}"]`); await ready(page, screen) }
    // a library of the sidebar: back where it was left (its first visit: 待看), then the tab asked for
    const openLib = async (id, screen) => {
      await page.click(`[data-library-row="${id}"]`)
      await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-state="ready"]`) !== null, id)
      if (!(await page.evaluate(sc => document.querySelector(`main[data-screen="${sc}"]`) !== null, screen))) await libTab(screen)
    }
    await work({ page, until, shot, tab, libTab, openLib, q, shelf, world })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    if (feed) await feed.close()
    removeTree(root, { waitMs: 10_000 })
  }
}

async function main({ page, until, shot, tab, libTab, openLib, q, shelf, world }) {
  // the queue: the sidebar (and 库架's cards) first
  await shot('queue-sidebar')
  // the four tabs on 待看 of the current library
  await openLib(q.current, 'inbox')
  await until(() => document.querySelector('[data-card]') !== null)
  for (const t of ['progress', 'decide', 'detail', 'files']) {
    await tab(t)
    if (t === 'decide') await until(() => document.querySelectorAll('[data-decide]').length >= 1)
    if (t === 'files') await until(() => document.querySelector('[data-tree="notes"]') !== null)
    if (t === 'progress') await until(() => document.querySelector('[data-part="running"]') !== null)
    await shot(`panel-${t}-inbox`)
  }
  // folded
  await page.click('[data-action="fold"] button')
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'false')
  await shot('panel-closed-inbox')
  await page.click('[data-action="unfold"] button')
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'true')
  // 资料库: two columns, 详情 = the old third column
  await tab('detail')
  await libTab('library')
  const id = world.planB.memgpt.id
  await page.click(`[data-part="list"] [data-row="${id}"] a`)
  await until(i => document.querySelector(`[data-pane="detail"] [data-part="note-panel"][data-id="${i}"]`) !== null, id)
  await shot('library-two-col')
  await shot('detail-library')
  // 问库: the cited notes
  await libTab('ask')
  await page.fill('textarea[data-field="question"]', world.planB.demandQuestion)
  await page.click('main[data-screen="ask"] [data-action="send"] button')
  await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done')
  await shot('detail-ask')
  // 和主 Agent 聊: this turn's lookup and card
  await page.click('[data-nav="chat"]')
  await ready(page, 'chat')
  await page.fill('textarea[data-field="message"]', '这个库以后只看评测。')
  await page.click('[data-action="send"] button')
  await until(() => document.querySelector('[data-part="detail-cards"] [data-detail-card]') !== null && document.querySelector('[data-part="compose"]')?.dataset.busy === 'false')
  await page.evaluate(() => { const l = document.querySelector('[data-part="conversation"]'); l.scrollTop = l.scrollHeight })
  await shot('detail-chat')
  // the queue on the waiting library's 概览 (banner, 「已排上」), then the dialog in a library not in the line
  await openLib(q.waiting, 'inbox')
  await libTab('overview')
  await until(() => document.querySelector('main [data-part="queue"]') !== null)
  await tab('progress')
  await shot('queue-overview')
  await openLib(q.current, 'inbox')
  await libTab('overview')
  await until(() => document.querySelector('[data-action="run"] button')?.disabled === false)
  await page.click('[data-action="run"] button')
  await until(() => document.querySelector('[data-dialog="run"] [data-action="start"] button')?.disabled === false)
  await page.click('[data-dialog="run"] [data-action="start"] button')
  await until(() => document.querySelector('[data-dialog="run"] [data-part="queued"]') !== null)
  await shot('queue-dialog')
}

async function progressOnly({ until, shot, tab, openLib, q }, name) {
  await openLib(q.current, 'inbox')
  await until(() => document.querySelector('[data-card]') !== null)
  await tab('progress')
  await until(() => document.querySelector('[data-part="running"]') !== null)
  await shot(name)
}

if (!ONLY || ONLY === 'main') await session('precision', 'light', main)
if (!ONLY || ONLY === 'themes') {
  for (const [theme, appearance] of [['precision', 'dark'], ['glass', 'light'], ['glass', 'dark'], ['research', 'light'], ['research', 'dark']]) {
    await session(theme, appearance, tools => progressOnly(tools, `progress-${theme}-${appearance}`))
  }
}
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
