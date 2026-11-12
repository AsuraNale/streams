#!/usr/bin/env node
// Pictures of the real window for redesign R3 (docs/checks/2026-11-11-r3/contract.md 「测」): Playwright drives the pinned
// Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; every world under the OS temp folder (removed
// after), its data made here: the seeded library (test/support/seed.mjs: a real round of the core) with plan B's notes (kept,
// one of your own, a file without a header, a record checked in two rounds) and the shelf's two other libraries. 问库's answer
// is scripted (STREAMS_DEV_ASK_SCRIPT: the fake connection answers the core's ask prompt with it), the main Agent's reply too
// (STREAMS_DEV_AGENT_SCRIPT: one proposal, the run cap); the reading window reads a site on this machine
// (test/support/reader-site.mjs). The theme and the appearance are changed the way 设置 changes them.
//   node scripts/shots-r3.mjs                 all → docs/shots/2026-11-11-r3/
//   --out <folder>   --only p09|p10|p11|p12|p13|p20
// Pictures (<theme>-<appearance>-<page>.png; the pages are the design's 03-页面稿):
//   research-light-p09  资料库: 全部 · 已收藏 · 我的笔记 with their numbers, the topics and 最近 30 天, the line of the file without a
//                       header, the list, a kept note read (已收藏, 编辑 · 查看原文 · 更多), the right panel's 详情 (入选理由, 核验记录,
//                       文件, 反向链接, 同来源内容)
//   precision-light-p09 · monoline-light-p09 · research-dark-p09   the same page in three more looks
//   research-light-p10  图谱: 主题 → 来源 → 条目, one filter (最近 30 天 · 全部), a topic clicked and its 详情
//   research-light-p11  编辑笔记 over 资料库
//   research-light-p12  缺少文件头: 返回资料库, 全部写入, the card with the suggested header, 写入 · 跳过
//   research-light-p13  问库: the line on top, a question answered with its cite numbers and the notes cited, 库内缺少 · 已加入待补充
//                       主题 · 反馈回答问题, a sentence handed to the main Agent with its proposal; the right panel's 详情
//   precision-light-p13 · monoline-light-p13 · research-dark-p13   the same page in three more looks
//   research-light-p20  the reading window in 阅读模式 (its bar and its page, one picture)
//   monoline-dark-p20   the same in 单线黑白, dark
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedPlanB, seedShelf } from '../test/support/seed.mjs'
import { seedReaderLibrary, startReaderSite } from '../test/support/reader-site.mjs'
import { BAR_HEIGHT, READER_PARTITION } from '../src/main/reader.mjs'
import { THEME_TEMPLATE } from '../src/shared/themes.mjs'

const CORE = pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href
const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-11-r3'))
const ONLY = value('--only') ?? null
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
mkdirSync(OUT, { recursive: true })
const report = []

// 问库's scripted answer (the core's ask: cites within the candidates, one thing the library lacks)
const ASK_ANSWER = Object.freeze({
  answer: [
    { text: '库里的评测横向比较了五种 agent 记忆方案，作者自己的方案排第一，基线是分层记忆。', cites: [1] },
    { text: '分层记忆把主记忆放在上下文里，外部存储按需换入换出，长对话上的评测效果最好。', cites: [2] },
    { text: '代价方面，分层方案每轮多一次模型调用。', cites: [2] },
  ],
  notInLibrary: false,
  missing: '「隔天回来」情形下各方案的直接排名',
  claimed: ['json-keys', 'cites-in-set', 'cited-sentences', 'claims-supported'],
})
const ASK_QUESTION = 'agent 记忆方案里哪种在长对话上表现最好？代价是什么？'
const CHANGE_SENTENCE = '这个库单次运行最多调用 30 次就够了，帮我把上限改成 30。'

/** The corner's plan usage as the design shows it (STREAMS_DEV_QUOTA: read at start, nothing real is read). */
function quotaFile(root) {
  const file = join(root, 'quota.json')
  const now = Math.floor(Date.now() / 1000)
  writeFileSync(file, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [
    { id: 'five_hour', usedPercent: 8, resetsAt: now + 4 * 3600 },
    { id: 'seven_day', usedPercent: 26, resetsAt: now + 3 * 86400 },
  ] } }))
  return file
}

/** One run of the app on a fresh world; `prepare(world, shelf, core, root)` makes the page's data (and env) before it starts. */
async function session({ start = 'library', prepare = null }, work) {
  const root = tempDir('st-shots-r3-')
  let app = null
  let cleanup = null
  try {
    const core = await import(CORE)
    const world = await makeWorld({ root, kind: 'seeded' })
    await seedPlanB(world)
    const shelf = await seedShelf(world)
    const extra = prepare ? (await prepare(world, shelf, core, root)) ?? {} : {}
    cleanup = extra.cleanup ?? null
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: start, STREAMS_DEV_CONNECTION: 'fake',
      STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_DEV_LIBRARY: '', STREAMS_DEV_QUOTA: quotaFile(root), ...(extra.env ?? {}),
    }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, start)
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
    const settle = async () => {
      await page.evaluate(() => document.activeElement?.blur?.())
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
    }
    const shot = async name => {
      await settle()
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
    await work({ page, app, until, shot, settle, tab, look, shelf, world, core })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    if (cleanup) await cleanup()
    removeTree(root, { waitMs: 10_000 })
  }
}

/** 资料库 with plan B's evals note open (it has a record of two rounds) and the right panel on 详情. */
async function libraryOn(t, id) {
  const { page, until, tab, world } = t
  await until(() => document.querySelector('main[data-screen="library"][data-state="ready"] [data-part="list"] [data-row]') !== null)
  await page.click(`[data-part="list"] [data-row="${id ?? world.planB.evals.id}"]`)
  await until(i => document.querySelector(`[data-reader="${i}"]`) !== null && document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id ?? world.planB.evals.id)
  await tab('detail')
  await until(() => document.querySelector('[data-part="detail-record"] small')?.textContent.includes('6') === true)
}

const want = id => ONLY === null || ONLY === id

if (want('p09') || want('p11') || want('p12') || want('p10')) {
  await session({ start: 'library' }, async t => {
    const { page, until } = t
    await t.look('research', 'light')
    if (want('p09')) {
      await libraryOn(t)
      await t.shot('research-light-p09')
      for (const [theme, appearance] of [['precision', 'light'], ['monoline', 'light'], ['research', 'dark']]) {
        await t.look(theme, appearance)
        await t.shot(`${theme}-${appearance}-p09`)
      }
      await t.look('research', 'light')
    }
    if (want('p11')) {
      await libraryOn(t)
      await page.click('[data-part="item-actions"] [data-action="edit"] button')
      await until(() => document.querySelector('dialog[data-dialog="edit"][open]') !== null)
      await t.shot('research-light-p11')
      await page.click('[data-action="cancel-edit"] button')
      await until(() => document.querySelector('[data-dialog="edit"]') === null)
    }
    if (want('p12')) {
      await until(() => document.querySelector('[data-part="missing-header-hint"] [data-action="go-missing-header"] button') !== null)
      await page.click('[data-part="missing-header-hint"] [data-action="go-missing-header"] button')
      await until(() => document.querySelector('[data-part="missing-header"] [data-card]') !== null)
      await t.tab('files')
      await t.shot('research-light-p12')
      await page.click('[data-action="back-to-library"] button')
      await until(() => document.querySelector('[data-part="list"] [data-row]') !== null)
      await t.tab('detail')
    }
    if (want('p10')) {
      await page.click('[data-part="view-switch"] [data-mode="graph"]')
      await until(() => document.querySelector('main[data-screen="graph"][data-state="ready"] [data-part="graph"] [data-node]') !== null)
      await page.click('[data-node="topic:agent 记忆"]')
      await until(() => document.querySelector('[data-part="detail-graph"] [data-part="node-items"] [data-node-item]') !== null)
      await t.shot('research-light-p10')
    }
  })
}

if (want('p13')) {
  await session({
    start: 'ask',
    prepare: (world, shelf, core, root) => {
      const askFile = join(root, 'ask-answer.json')
      writeFileSync(askFile, JSON.stringify(ASK_ANSWER), 'utf8')
      const agentFile = join(root, 'agent-script.json')
      writeFileSync(agentFile, JSON.stringify([{ reply: '已生成修改提议：单次运行上限从 120 次改为 30 次模型调用，确认后生效。', proposals: [{ kind: 'edit_cap', why: '你说这个库单次运行最多调用 30 次就够了', params: { libraryId: shelf.ids[0], cap: 30 } }] }]), 'utf8')
      return { env: { STREAMS_DEV_ASK_SCRIPT: askFile, STREAMS_DEV_AGENT_SCRIPT: agentFile } }
    },
  }, async t => {
    const { page, until } = t
    await t.look('research', 'light')
    await page.fill('textarea[data-field="question"]', ASK_QUESTION)
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done' && document.querySelector('[data-turn="0"] [data-sentence]') !== null)
    await page.click('[data-turn="0"] [data-action="add-demand"] button')
    await until(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]') !== null)
    await page.fill('textarea[data-field="question"]', CHANGE_SENTENCE)
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-turn="1"]')?.dataset.state === 'done' && document.querySelector('[data-turn="1"] [data-proposal]') !== null)
    await t.tab('detail')
    await until(() => document.querySelector('[data-part="detail-ask"] [data-detail-cite]') !== null)
    await page.evaluate(() => { const b = document.querySelector('.st-ask .thread-scroll'); b?.scrollTo(0, b.scrollHeight) })
    await t.shot('research-light-p13')
    for (const [theme, appearance] of [['precision', 'light'], ['monoline', 'light'], ['research', 'dark']]) {
      await t.look(theme, appearance)
      await t.shot(`${theme}-${appearance}-p13`)
    }
  })
}

/** The reading window as one picture: its bar (the window's own contents) over its page (the view), stitched in the main process. */
async function readerShot(app, name) {
  const png = await app.evaluate(async ({ BrowserWindow, session, nativeImage }, [partition, barHeight]) => {
    const ses = session.fromPartition(partition)
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses && w.contentView.children.length > 0)
    if (!win.isVisible()) win.showInactive()
    await new Promise(r => setTimeout(r, 800))
    // the window's own contents fill the whole window under the view: only its top BAR_HEIGHT pixels are the bar
    const bar = (await win.webContents.capturePage()).crop({ x: 0, y: 0, width: win.getContentSize()[0], height: barHeight })
    const pg = await win.contentView.children[0].webContents.capturePage()
    const a = bar.getSize()
    const b = pg.getSize()
    const width = Math.min(a.width, b.width)
    const rows = (img, size) => { const buf = img.toBitmap(); const out = []; for (let y = 0; y < size.height; y++) out.push(buf.subarray(y * size.width * 4, y * size.width * 4 + width * 4)); return out }
    const all = Buffer.concat([...rows(bar, a), ...rows(pg, b)])
    return nativeImage.createFromBitmap(all, { width, height: a.height + b.height }).toPNG().toString('base64')
  }, [READER_PARTITION, BAR_HEIGHT])
  const file = join(OUT, `${name}.png`)
  writeFileSync(file, Buffer.from(png, 'base64'))
  report.push(file)
  process.stdout.write(`${file}\n`)
}

if (want('p20')) {
  await session({
    start: 'library',
    prepare: async world => {
      const site = await startReaderSite()
      await seedReaderLibrary(world.library, site)
      world.site = site
      return { cleanup: () => site.close() }
    },
  }, async t => {
    const { page, app, world } = t
    await t.look('research', 'light')
    const mode = () => app.evaluate(async ({ BrowserWindow, session }, partition) => {
      const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === session.fromPartition(partition) && w.contentView.children.length > 0)
      if (!win || win.webContents.isLoading() || win.contentView.children[0].webContents.isLoading()) return null
      return win.webContents.executeJavaScript('[document.querySelector("[data-reader-bar]")?.dataset.mode ?? null, document.body.dataset.appearance, document.documentElement.dataset.theme]').catch(() => null)
    }, READER_PARTITION)
    const waitMode = async (want2, theme, appearance) => {
      const end = Date.now() + 60_000
      while (Date.now() < end) { const m = await mode(); if (m && m[0] === want2 && m[1] === appearance && m[2] === theme) return; await new Promise(r => setTimeout(r, 150)) }
      throw new Error(`the reading window did not come to ${want2} ${theme} ${appearance}`)
    }
    const r = await page.evaluate(u => window.streams.openReader(u, 'reader'), world.site.urls.article)
    if (!r.ok) throw new Error(JSON.stringify(r))
    await waitMode('reading', 'research', 'light')
    await readerShot(app, 'research-light-p20')
    await t.look('monoline', 'dark')
    await waitMode('reading', 'monoline', 'dark')
    await readerShot(app, 'monoline-dark-p20')
  })
}
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
