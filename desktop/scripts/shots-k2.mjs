#!/usr/bin/env node
// Pictures of the real window for v2 package K2 (docs/checks/2026-11-10-wp-k2/contract.md 「测」): the three new themes × light /
// dark on six screens, and the reading window in each set. Playwright drives the pinned Electron, the window shown (a hidden
// window draws no frames: STREAMS_WINDOW=shown), content 1440×960, --force-device-scale-factor=1; every world under the OS
// temp folder (removed after), the connections the core's fake, the quota corner from a development file (STREAMS_DEV_QUOTA),
// the main Agent the core's scripted stand-in (STREAMS_DEV_AGENT_SCRIPT) answering with one proposal card. The theme and the
// appearance are written into settings.json before the start, so each picture is that set's own first frame, not a switch.
//   node scripts/shots-k2.mjs                         all 36 + 6 → docs/shots/2026-11-10-k2/
//   --themes precision,glass  --appearances dark  --screens inbox,settings  --no-reader  --out <folder>
// The six screens: shelf 库架 · chat 和主 Agent 聊 (with the proposal card) · inbox 库页·待看 · library 库页·资料库 (a note open) ·
// ask 库页·问库 (after one question) · settings 设置 (scrolled to 「外观与语言」). Files: <screen>-<theme>-<appearance>.png and
// reader-<theme>-<appearance>.png (the reading window in 阅读模式: its bar and its page laid one above the other).
// In every window the bundled font must be loaded (document.fonts.check for 'Streams Noto Sans SC'), else the script fails.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedPlanB, seedShelf } from '../test/support/seed.mjs'
import { seedReaderLibrary, startReaderSite } from '../test/support/reader-site.mjs'
import { THEME_IDS } from '../src/shared/themes.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const list = (name, all) => (value(name) ? value(name).split(',').filter(x => all.includes(x)) : [...all])
const SCREENS = ['shelf', 'chat', 'inbox', 'library', 'ask', 'settings']
const themes = list('--themes', THEME_IDS)
const appearances = list('--appearances', ['light', 'dark'])
const screens = list('--screens', SCREENS)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-10-k2'))
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
const FONT_CHECK = "document.fonts.check('14px \"Streams Noto Sans SC\"') && [...document.fonts].some(f => f.family.replace(/\"/g, '') === 'Streams Noto Sans SC' && f.status === 'loaded')"
mkdirSync(OUT, { recursive: true })
const report = []

// a feed on this machine for the proposal card's trial fetch (nothing reaches the network)
const server = createServer((req, res) => {
  const base = `http://127.0.0.1:${server.address().port}`
  const items = [1, 2, 3].map(i => `<item><title>MCP 安全周报 第 ${i} 条</title><link>${base}/item/${i}</link><pubDate>${new Date(Date.now() - i * 3_600_000).toUTCString()}</pubDate><description>MCP</description></item>`).join('')
  res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
  res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>mcp-weekly</title>${items}</channel></rss>`)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const FEED = `http://127.0.0.1:${server.address().port}/feed/mcp-weekly`

/** The quota corner's development file: Claude Code's two windows, as package M reads them. */
function quotaFile(root) {
  const file = join(root, 'quota.json')
  const now = Math.floor(Date.now() / 1000)
  writeFileSync(file, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [
    { id: 'five_hour', usedPercent: 5, resetsAt: now + 4 * 3600 },
    { id: 'seven_day', usedPercent: 11, resetsAt: now + 3 * 86400 },
  ] } }))
  return file
}

async function check(page, name) {
  const font = await page.evaluate(FONT_CHECK)
  if (font !== true) throw new Error(`${name}: the bundled font is not loaded`)
  return font
}

async function mainWindow(theme, appearance) {
  const root = tempDir(`st-shots-k2-${theme}-${appearance}-`)
  let app = null
  try {
    const world = await makeWorld({ root, kind: 'seeded' })
    await seedPlanB(world)
    const shelf = await seedShelf(world)
    const script = join(root, 'agent-script.json')
    writeFileSync(script, JSON.stringify([{ reply: '好，我拟了一个改动，新来源试抓过了：', proposals: [
      { kind: 'add_source', why: '你说「以后也追 MCP 安全的周报」', params: { libraryId: shelf.ids[0], source: { name: 'mcp-weekly', kind: 'rss', url: FEED, topic: 'agent 记忆' } } },
    ] }]))
    const env = { STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: 'shelf', STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_AGENT_SCRIPT: script, STREAMS_DEV_QUOTA: quotaFile(root) }
    const started = await launch(world, { env, settings: { theme, appearance, connections: { active: 'claude-code' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, 'shelf')
    await until(() => document.querySelectorAll('[data-library-row]').length === 3 && document.querySelector('[data-part="quota"]') !== null)
    await page.evaluate(() => document.fonts.ready)
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const seen = await page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.appearance])
    if (seen[0] !== theme || seen[1] !== appearance) throw new Error(`the page is ${seen.join('/')}, not ${theme}/${appearance}`)
    const shot = async name => {
      if (!screens.includes(name)) return
      await page.evaluate(() => document.activeElement?.blur())
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(400)
      const font = await check(page, name)
      const file = join(OUT, `${name}-${theme}-${appearance}.png`)
      // a shown window that lost the front can stop drawing for a moment: bring it back and try again (three times at most)
      for (let i = 0; ; i++) {
        try { await page.screenshot({ path: file, timeout: 20_000 }); break } catch (err) {
          if (i === 2) throw err
          await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })
          await page.waitForTimeout(500)
        }
      }
      report.push({ file, font })
      process.stdout.write(`${file}\n`)
    }
    const tab = async (id, screen = id) => {
      await page.click(`.st-lib-tabs [data-tab="${id}"]`)
      await ready(page, screen)
    }
    await shot('shelf')
    if (screens.includes('chat')) {
      await page.click('[data-nav="chat"]')
      await ready(page, 'chat')
      await page.fill('textarea[data-field="message"]', '以后也追 MCP 安全的周报。')
      await page.click('[data-action="send"] button')
      await until(() => document.querySelector('[data-part="conversation"] [data-proposal][data-kind="add_source"]') !== null && document.querySelector('[data-part="compose"]')?.dataset.busy === 'false')
      await page.evaluate(() => { const l = document.querySelector('[data-part="conversation"]'); l.scrollTop = l.scrollHeight })
      await shot('chat')
    }
    if (['inbox', 'library', 'ask'].some(s => screens.includes(s))) {
      await page.click(`[data-library-row="${shelf.ids[0]}"]`)
      await until(() => document.querySelector('main[data-screen]')?.dataset.state === 'ready' && document.querySelector('.st-lib-tabs') !== null)
      await tab('inbox')
      await until(() => document.querySelector('[data-card]') !== null)
      await shot('inbox')
      await tab('library')
      const id = world.planB.memgpt.id
      await page.click(`[data-part="list"] [data-row="${id}"] a`)
      await until(i => document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id)
      await shot('library')
      await tab('ask')
      await page.fill('textarea[data-field="question"]', world.planB.demandQuestion)
      await page.click('main[data-screen="ask"] [data-action="send"] button')
      await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done')
      await shot('ask')
    }
    if (screens.includes('settings')) {
      await page.click('.st-sidebar__footer-button')
      await ready(page, 'settings')
      await until(() => document.querySelector('[data-part="theme"] [data-theme-card]') !== null)
      await page.evaluate(() => document.querySelector('[data-group="look"]').scrollIntoView({ block: 'start' }))
      await shot('settings')
    }
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
}

async function readerWindow(theme, appearance) {
  const root = tempDir(`st-shots-k2-reader-${theme}-${appearance}-`)
  let app = null
  let site = null
  try {
    const world = await makeWorld({ root, kind: 'empty' })
    site = await startReaderSite()
    await seedReaderLibrary(world.library, site)
    const started = await launch(world, { env: { STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: 'library', STREAMS_DEV_CONNECTION: 'fake' }, settings: { theme, appearance, connections: { active: 'claude-code' } } })
    app = started.app
    const page = started.page
    await ready(page, 'library')
    await page.evaluate(() => document.fonts.ready)
    await check(page, 'reader: the app window')
    await page.evaluate(u => window.streams.openReader(u, 'reader'), site.urls.article)
    const end = Date.now() + 60_000
    let state = null
    while (Date.now() < end) {
      state = await app.evaluate(async ({ BrowserWindow, session }) => {
        const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === session.fromPartition('streams-reader') && w.contentView.children.length > 0)
        if (!win) return null
        const view = win.contentView.children[0]
        const bar = await win.webContents.executeJavaScript('JSON.stringify([document.documentElement.dataset.theme, document.documentElement.dataset.appearance, document.querySelector("[data-reader-bar]")?.dataset.mode])').catch(() => null)
        return { bar, loading: view.webContents.isLoading() || win.webContents.isLoading() }
      })
      if (state?.bar && JSON.parse(state.bar)[2] === 'reading' && !state.loading) break
      await new Promise(r => setTimeout(r, 200))
    }
    const [t, a, mode] = JSON.parse(state?.bar ?? '[]')
    if (t !== theme || a !== appearance || mode !== 'reading') throw new Error(`the reading window is ${t}/${a}/${mode}`)
    await new Promise(r => setTimeout(r, 600))
    const shot = await app.evaluate(async ({ BrowserWindow, nativeImage, session }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === session.fromPartition('streams-reader'))
      const view = win.contentView.children[0]
      const bar = await win.webContents.capturePage()
      const body = await view.webContents.capturePage()
      const top = view.getBounds().y
      const sa = bar.getSize()
      const sb = body.getSize()
      const width = Math.min(sa.width, sb.width)
      const rows = []
      for (const [img, size, height] of [[bar, sa, top], [body, sb, sb.height]]) {
        const bmp = img.toBitmap()
        for (let y = 0; y < height; y++) rows.push(bmp.subarray(y * size.width * 4, y * size.width * 4 + width * 4))
      }
      return nativeImage.createFromBitmap(Buffer.concat(rows), { width, height: top + sb.height }).toPNG().toString('base64')
    })
    const file = join(OUT, `reader-${theme}-${appearance}.png`)
    writeFileSync(file, Buffer.from(shot, 'base64'))
    report.push({ file })
    process.stdout.write(`${file}\n`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    if (site) await site.close()
    removeTree(root, { waitMs: 10_000 })
  }
}

try {
  for (const theme of themes) {
    for (const appearance of appearances) {
      if (screens.length) await mainWindow(theme, appearance)
      if (!args.includes('--no-reader')) await readerWindow(theme, appearance)
    }
  }
} finally {
  server.close()
}
process.stdout.write(`${JSON.stringify({ shots: report.length, fontChecked: report.filter(r => r.font === true).length, out: OUT })}\n`)
