#!/usr/bin/env node
// Pictures of the real window for redesign R4a (docs/checks/2026-11-12-r4a/contract.md 「测」): Playwright drives the pinned
// Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; every world under the OS temp folder (removed
// after). The connection detection is stood in for (STREAMS_DEV_DETECT, a JSON file: what is found, its version, signed in or
// not) and every connection is the fake one (STREAMS_DEV_CONNECTION=fake: nothing real is called); new libraries go to a folder
// of the world (STREAMS_DEV_LIBRARY_ROOT: never the real Documents). The sources the form tries are a server on this machine.
// The theme and the appearance are changed the way 设置 changes them.
//   node scripts/shots-r4a.mjs                 all → docs/shots/2026-11-12-r4a/
//   --out <folder>   --only p01|p02|p04
// Pictures (<theme>-<appearance>-<page>.png; the pages are the design's 03-页面稿):
//   research-light-p01  首次打开: no library yet, Claude Code found and signed in → chosen without asking; the line on top
//                       (当前连接 · 版本 · 已登录 · 用量计入你的套餐 · 已连接 · 更换连接), 你想追踪什么内容？, three examples, the box,
//                       发送 · 手动创建 · 暂不创建，先进入应用; the right panel's 详情 「流息怎样工作」
//   precision-light-p01 · monoline-light-p01 · research-dark-p01   the same screen in three more looks
//   research-light-p02  连接选择 on its own (one of the three cases): Claude Code found 2.1.287 but not signed in (前往登录 ·
//                       已登录，重新检测), Codex not found, no API key (输入 API key); 重新检测 · 暂时跳过，稍后在设置中连接
//   research-light-p04  新建库's one page: 库名称, 追踪要求, 严格程度 (标准), two sources typed and tried on this machine — one 正常 ·
//                       2 条 with its latest title, one 暂时失败 with what to do — the preset pack's line, a topic, 存储位置, 定时;
//                       取消 · 预计 n–m 次模型调用 · 仅创建 · 创建并运行 (research-light-p04-end: the same page scrolled to its end)
//   precision-light-p04 · monoline-light-p04 · research-dark-p04   the same form in three more looks
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedShelf } from '../test/support/seed.mjs'
import { THEME_TEMPLATE } from '../src/shared/themes.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-12-r4a'))
const ONLY = value('--only') ?? null
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
mkdirSync(OUT, { recursive: true })
const report = []
const { startFakeServer } = await import(pathToFileURL(join(REPO_DIR, 'core', 'test', 'support', 'fake-server.mjs')).href)
const { rssWith } = await import(pathToFileURL(join(REPO_DIR, 'core', 'test', 'support', 'feeds.mjs')).href)

const BRIEF = '追踪中国新能源车的月度数据：乘用车零售与批发、渗透率、动力电池装车量与技术路线。不要车型评测、促销和软文。'

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

/** One run of the app on a fresh world. `kind` 'empty' (no library registered: 首次打开) or 'shelf' (the shelf's libraries). */
async function session({ kind, start, detect, settings = {} }, work) {
  const root = tempDir('st-shots-r4a-')
  let app = null
  try {
    const world = await makeWorld({ root, kind: kind === 'shelf' ? 'seeded' : 'empty' })
    if (kind === 'shelf') await seedShelf(world)
    const detectFile = join(root, 'detect.json')
    writeFileSync(detectFile, JSON.stringify(detect), 'utf8')
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_DETECT: detectFile, STREAMS_DEV_LIBRARY: '',
      STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_DEV_QUOTA: quotaFile(root), ...(start ? { STREAMS_START_SCREEN: start } : {}),
    }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', panel: { open: true, tab: 'detail' }, ...settings } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, start ?? 'first-run')
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
    await work({ page, until, shot, look })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
}

const want = id => ONLY === null || ONLY === id
const LOOKS = [['precision', 'light'], ['monoline', 'light'], ['research', 'dark']]

if (want('p01')) {
  await session({ kind: 'empty', detect: { 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } } }, async t => {
    await t.until(() => document.querySelector('[data-part="first-run"][data-view="home"] [data-part="current-connection"][data-kind="claude-code"]') !== null)
    await t.look('research', 'light')
    await t.shot('research-light-p01')
    for (const [theme, appearance] of LOOKS) {
      await t.look(theme, appearance)
      await t.shot(`${theme}-${appearance}-p01`)
    }
  })
}

if (want('p02')) {
  await session({ kind: 'empty', detect: { 'claude-code': { installed: true, loggedIn: false, version: '2.1.287' }, codex: { installed: false } } }, async t => {
    await t.until(() => document.querySelector('[data-part="first-run"][data-view="pick"] [data-connection="claude-code"][data-conn-state="not-logged-in"]') !== null)
    await t.look('research', 'light')
    await t.shot('research-light-p02')
  })
}

if (want('p04')) {
  const srv = await startFakeServer()
  try {
    const ev = srv.route('/ev.xml', { body: rssWith([{ title: '10 月乘用车零售数据', url: 'https://ev.test/1' }, { title: '动力电池 10 月装车量', url: 'https://ev.test/2' }]) })
    const notices = srv.route('/notices.xml', { status: 503, body: 'busy' })
    await session({ kind: 'shelf', start: 'new-library', detect: { 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' } }, settings: { connections: { active: 'claude-code' } } }, async t => {
      const { page, until } = t
      await t.look('research', 'light')
      await page.fill('[data-field="name"]', '中国电动车')
      await page.fill('[data-field="brief"]', BRIEF)
      for (const url of [ev, notices]) {
        await page.fill('[data-field="source"]', url)
        await page.press('[data-field="source"]', 'Enter')
      }
      await until(() => [...document.querySelectorAll('[data-part="sources"] [data-source]')].map(r => r.dataset.fetchState).join() === 'ok,failed')
      await page.fill('[data-field="topic"]', '月度数据')
      await page.press('[data-field="topic"]', 'Enter')
      await until(() => document.querySelector('[data-part="folder-state"]')?.dataset.state === 'empty' && document.querySelector('[data-part="estimate"]')?.dataset.lo !== '')
      await page.evaluate(() => { document.querySelector('.st-first-body').scrollTop = 0 })
      await t.shot('research-light-p04')
      // the rest of the same page (存储位置, 定时, the buttons): one more picture, scrolled to its end
      await page.evaluate(() => { const b = document.querySelector('.st-first-body'); b.scrollTop = b.scrollHeight })
      await t.shot('research-light-p04-end')
      await page.evaluate(() => { document.querySelector('.st-first-body').scrollTop = 0 })
      for (const [theme, appearance] of LOOKS) {
        await t.look(theme, appearance)
        await t.shot(`${theme}-${appearance}-p04`)
      }
    })
  } finally {
    srv.close()
  }
}
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
