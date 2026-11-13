#!/usr/bin/env node
// Pictures of the real window for redesign R6a (docs/checks/2026-11-13-r6a/contract.md 「测」): Playwright drives the pinned
// Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; the world is under the OS temp folder (removed
// after): the shelf's three libraries (test/support/seed.mjs seedShelf: the seeded one with a real round of the core over a feed on
// this machine), every connection the fake one (STREAMS_DEV_CONNECTION=fake: nothing real is called), the detection stood in for
// (STREAMS_DEV_DETECT), new libraries' default place a folder of the world (STREAMS_DEV_LIBRARY_ROOT: never the real Documents).
// The theme and the appearance are changed the way 设置 changes them.
//   node scripts/shots-r6a.mjs                 all → docs/shots/2026-11-13-r6a/
//   --out <folder>   --only shelf|serif
// Pictures:
//   <theme>-<appearance>-shelf   (eight: precision · glass · research · monoline × light · dark) 库架 with the pointer on the current
//                                library's card — the selected card (R6a-3): its name, what it follows and its numbers on the
//                                theme's own surface for a picked part
//   research-light-serif         研究对话, light: 库架 with the pointer off the cards — the screen with the most text in the bundled
//                                Noto Serif SC (R6a-1): the page's title 库架, the line 每天看新来的，存下值得的。, the three
//                                libraries' names on their cards, the right panel's heading and the brand's name at the top of
//                                the side bar. (The serif is the theme's display font: page heads, headings, the names on the
//                                shelf's cards. 待看's cards have their titles in the interface font, Noto Sans SC — so that
//                                screen, which this picture showed at first, has the serif only in its page head and the
//                                right panel's heading.)
//   research-light-licenses      许可证与致谢 over 设置: 界面字体 · Noto Sans SC, 标题字体 · Noto Serif SC, the table's row with its version
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedShelf } from '../test/support/seed.mjs'
import { THEME_IDS, THEME_TEMPLATE } from '../src/shared/themes.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-13-r6a'))
const ONLY = value('--only') ?? null
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
mkdirSync(OUT, { recursive: true })
const report = []

/** One run of the app on a fresh shelf world, started on `start`. */
async function session({ start }, work) {
  const root = tempDir('st-shots-r6a-')
  let app = null
  try {
    const world = await makeWorld({ root, kind: 'seeded' })
    const shelf = await seedShelf(world)
    const detectFile = join(root, 'detect.json')
    writeFileSync(detectFile, JSON.stringify({ 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } }), 'utf8')
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_DETECT: detectFile, STREAMS_DEV_LIBRARY: '',
      STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_START_SCREEN: start,
    }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' } } })
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
    const shot = async name => {
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(700)
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
    await work({ page, until, shot, look, world, shelf })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
}

const want = id => ONLY === null || ONLY === id

if (want('shelf')) {
  await session({ start: 'shelf' }, async t => {
    const { page, until, shelf } = t
    const card = `[data-shelf-card="${shelf.ids[0]}"]`
    await until(sel => document.querySelector(sel) !== null, card)
    for (const theme of THEME_IDS) {
      for (const appearance of ['light', 'dark']) {
        await page.mouse.move(4, 4)
        await t.look(theme, appearance)
        // the pointer on the current library's card: the selected card
        await page.hover(`${card} [data-part="tracking"]`)
        await until(sel => document.querySelector(sel).matches(':hover'), card)
        await t.shot(`${theme}-${appearance}-shelf`)
      }
    }
  })
}

if (want('serif')) {
  await session({ start: 'shelf' }, async t => {
    const { page, until, shelf } = t
    await t.look('research', 'light')
    // 库架, the pointer on no card: the title, the lead line and the cards' names are the theme's display font
    await until(sel => document.querySelector(sel) !== null && document.querySelector('.shelf-body .home-title') !== null, `[data-shelf-card="${shelf.ids[0]}"]`)
    await until(() => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Noto Serif SC' && f.status === 'loaded'))
    await page.mouse.move(4, 4)
    await until(() => document.querySelector('[data-shelf-card]:hover') === null)
    await t.shot('research-light-serif')
    // 许可证与致谢: the two fonts' lines and the table's row
    await page.click('.st-sidebar .st-sidebar__footer-button')
    await ready(page, 'settings')
    await page.click('[data-part="about"] [data-action="licenses"] button')
    await until(() => document.querySelector('dialog[data-dialog="licenses"][open] [data-part="display-font"]') !== null)
    await page.evaluate(() => { const d = document.querySelector('dialog[data-dialog="licenses"] [data-part="display-font"]'); d.scrollIntoView({ block: 'center' }) })
    await t.shot('research-light-licenses')
  })
}
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
