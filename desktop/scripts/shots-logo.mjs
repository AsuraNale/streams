#!/usr/bin/env node
// Pictures of the new logo (五流; docs/checks/2026-11-12-logo/contract.md 「测」), as shots-r4b.mjs takes them: Playwright drives the
// pinned Electron, the window shown (STREAMS_WINDOW=shown), content 1440×960, scale 1; every world under the OS temp folder
// (removed after); every connection the fake one (STREAMS_DEV_CONNECTION=fake: nothing real is called), the detection stood in
// for (STREAMS_DEV_DETECT), new libraries' default place a folder of the world (never the real Documents). The theme and the
// appearance are changed the way 设置 changes them. sharp (scripts/lib/icon.mjs loadSharp; STREAMS_SHARP_DIR) lays out the sheets.
//   node scripts/shots-logo.mjs                 all → docs/shots/2026-11-12-logo/
//   --out <folder>   --only brand|first-run|icons|titlebar
// Pictures:
//   <theme>-<appearance>-window.png   the whole window (库架, the sidebar's brand top left): precision · glass · research · monoline
//                                     light, research dark, monoline dark
//   <theme>-<appearance>-brand.png    the sidebar's top left (320×120) in all eight looks; brand-sheet.png: the eight side by side, ×2
//   research-light-first-run.png      首次打开 (one screen; its sidebar's brand)
//   icons-compare.png                 the app icon: this repository's renders (desktop/assets/icon/png/) beside the design's
//                                     (docs/design/logo/source/流息/png/), 16 · 24 · 32 · 48 · 256 at their size and the small ones ×6
//   titlebar.png · titlebar-zoom.png  the window's own title bar (Windows draws it, with streams.ico) taken off the screen: the
//                                     window's top strip, and its left end ×4. Taken with .NET's Graphics.CopyFromScreen (PowerShell),
//                                     the window put on top for the moment.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { loadSharp } from './lib/icon.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedShelf } from '../test/support/seed.mjs'
import { THEME_IDS, THEME_TEMPLATE } from '../src/shared/themes.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', '2026-11-12-logo'))
const ONLY = value('--only') ?? null
const want = id => ONLY === null || ONLY === id
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
const CROP = { x: 0, y: 0, width: 320, height: 120 }
const WINDOWS = new Set(['precision-light', 'glass-light', 'research-light', 'monoline-light', 'research-dark', 'monoline-dark'])
mkdirSync(OUT, { recursive: true })
const report = []
const sharp = loadSharp()
const wrote = file => { report.push(file); process.stdout.write(`${file}\n`) }

/** One run of the app on a fresh world. */
async function session({ start, shelf = true }, work) {
  const root = tempDir('st-shots-logo-')
  let app = null
  try {
    const world = await makeWorld({ root, kind: shelf ? 'seeded' : 'empty' })
    if (shelf) await seedShelf(world)
    const detectFile = join(root, 'detect.json')
    writeFileSync(detectFile, JSON.stringify({ 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } }), 'utf8')
    const env = {
      STREAMS_WINDOW: 'shown', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_DETECT: detectFile, STREAMS_DEV_LIBRARY: '',
      STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), ...(start ? { STREAMS_START_SCREEN: start } : {}),
    }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', ...(shelf ? { connections: { active: 'claude-code' } } : {}), panel: { open: true, tab: 'progress' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await ready(page, start ?? 'first-run')
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const look = async (theme, appearance) => {
      for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
        const r = await page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
        if (!r.ok) throw new Error(`${m}(${v}): ${JSON.stringify(r)}`)
      }
      await page.waitForFunction(([t, a, cls]) => document.documentElement.dataset.theme === t && document.body.dataset.appearance === a && document.body.className === cls
        && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass], POLL)
    }
    const shot = async (name, clip) => {
      await page.evaluate(() => document.activeElement?.blur?.())
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const file = join(OUT, `${name}.png`)
      for (let i = 0; ; i++) {
        try { await page.screenshot({ path: file, timeout: 20_000, ...(clip ? { clip } : {}) }); break } catch (err) {
          if (i === 2) throw err
          await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })
          await page.waitForTimeout(500)
        }
      }
      wrote(file)
      return file
    }
    await work({ app, page, look, shot })
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const label = (text, w, h = 28, size = 15, fg = '#111827') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="4" y="${h - 9}" font-family="Microsoft YaHei UI, sans-serif" font-size="${size}" fill="${fg}">${esc(text)}</text></svg>`)
const nearest = (file, k) => sharp(file).metadata().then(m => sharp(file).resize(m.width * k, m.height * k, { kernel: 'nearest' }).png().toBuffer())

/** Pictures side by side on a light page: rows of { label, tiles: [{ label, input (png buffer), w, h }] }. */
async function sheet(rows, file, { gap = 24, pad = 24, bg = '#F4F5F7', fg = '#111827' } = {}) {
  const parts = []
  let y = pad
  let width = 0
  for (const row of rows) {
    parts.push({ input: label(row.label, 900, 30, 17, fg), left: pad, top: y })
    y += 36
    let x = pad
    let tall = 0
    for (const t of row.tiles) {
      parts.push({ input: label(t.label, Math.max(t.w, 80), 24, 13, fg), left: x, top: y })
      parts.push({ input: t.input, left: x, top: y + 26 })
      x += Math.max(t.w, 80) + gap
      tall = Math.max(tall, t.h + 26)
    }
    width = Math.max(width, x - gap + pad)
    y += tall + gap
  }
  await sharp({ create: { width, height: y + pad - gap, channels: 4, background: bg } }).composite(parts).png().toFile(file)
  wrote(file)
}

if (want('brand')) {
  const crops = []
  await session({ start: 'shelf' }, async t => {
    for (const appearance of ['light', 'dark']) {
      for (const theme of THEME_IDS) {
        await t.look(theme, appearance)
        if (WINDOWS.has(`${theme}-${appearance}`)) await t.shot(`${theme}-${appearance}-window`)
        crops.push({ label: `${theme} · ${appearance === 'light' ? '浅色' : '深色'}`, file: await t.shot(`${theme}-${appearance}-brand`, CROP) })
      }
    }
  })
  const tile = async c => ({ label: c.label, input: await nearest(c.file, 2), w: CROP.width * 2, h: CROP.height * 2 })
  await sheet([
    { label: '左栏品牌 · 浅色（×2，最近邻放大）', tiles: await Promise.all(crops.slice(0, 4).map(tile)) },
    { label: '左栏品牌 · 深色（×2，最近邻放大）', tiles: await Promise.all(crops.slice(4).map(tile)) },
  ], join(OUT, 'brand-sheet.png'))
}

if (want('first-run')) {
  await session({ start: null, shelf: false }, async t => {
    await t.page.waitForFunction(() => document.querySelector('main[data-screen="first-run"] [data-part="track"]') !== null, null, POLL)
    await t.shot('research-light-first-run')
  })
}

if (want('icons')) {
  const ours = join(REPO_DIR, 'desktop', 'assets', 'icon', 'png')
  const theirs = join(REPO_DIR, 'docs', 'design', 'logo', 'source', '流息', 'png')
  const row = async (name, dir) => {
    const tiles = []
    for (const s of [16, 24, 32, 48, 256]) tiles.push({ label: `${s} px`, input: readFileSync(join(dir, `icon-${s}.png`)), w: s, h: s })
    for (const s of [16, 24, 32, 48]) tiles.push({ label: `${s} ×6`, input: await nearest(join(dir, `icon-${s}.png`), 6), w: s * 6, h: s * 6 })
    return { label: name, tiles }
  }
  await sheet([
    await row('本仓渲染：desktop/assets/icon/png/（build-icon.mjs，streams.ico 打包的就是这五张）', ours),
    await row('定稿：docs/design/logo/source/流息/png/（赞妮 finalize.mjs 渲染，原样复制）', theirs),
  ], join(OUT, 'icons-compare.png'))
  // the same on a dark ground (the taskbar in dark mode): this repository's renders only
  const dark = await row('本仓渲染，深色底（像深色任务栏）', ours)
  await sheet([dark], join(OUT, 'icons-on-dark.png'), { bg: '#202020', fg: '#E5E7EB' })
}

if (want('titlebar')) {
  await session({ start: 'shelf' }, async t => {
    await t.look('research', 'light')
    const win = await t.app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.setAlwaysOnTop(true); w.show(); w.focus()
      return { bounds: w.getBounds(), content: w.getContentBounds(), scale: screen.getPrimaryDisplay().scaleFactor, title: w.getTitle() }
    })
    await t.page.waitForTimeout(1200)
    const capDir = tempDir('st-shots-logo-cap-')
    const raw = join(capDir, 'cap.png')
    const b = win.bounds
    // the strip from the window's top to its content's top: Windows' own title bar, its icon and its title
    const strip = { x: b.x, y: b.y, w: b.width, h: Math.max(32, win.content.y - b.y) }
    const ps = [
      'Add-Type -AssemblyName System.Drawing',
      'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }\'',
      '[void][Dpi]::SetProcessDPIAware()',
      `$bmp = New-Object System.Drawing.Bitmap ${strip.w}, ${strip.h}`,
      '$g = [System.Drawing.Graphics]::FromImage($bmp)',
      `$g.CopyFromScreen(${strip.x}, ${strip.y}, 0, 0, $bmp.Size)`,
      `$bmp.Save('${raw.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    ].join('; ')
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' })
    await t.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setAlwaysOnTop(false) })
    if (r.status !== 0) throw new Error(`the screen copy failed: ${r.stdout}${r.stderr}`)
    const file = join(OUT, 'titlebar.png')
    await sharp(raw).png().toFile(file)
    removeTree(capDir)
    wrote(file)
    const zoom = join(OUT, 'titlebar-zoom.png')
    const left = Math.min(240, strip.w)
    await sharp(file).extract({ left: 0, top: 0, width: left, height: strip.h }).resize(left * 4, strip.h * 4, { kernel: 'nearest' }).png().toFile(zoom)
    wrote(zoom)
    process.stdout.write(`${JSON.stringify({ titlebar: { ...win, strip } })}\n`)
  })
}
process.stdout.write(`${JSON.stringify({ shots: report.length, out: OUT })}\n`)
