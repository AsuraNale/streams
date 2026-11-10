// 截图：7 个画面 × 3 主题 × 浅 / 深，1440×900（42 张）+ 精密国际主义浅色 1280×800（7 张，文件名带 -1280）。
// 用 desktop/ 下的 playwright-core 驱动本机 Edge，以 file:// 打开 index.html，URL 参数定画面、主题、外观，?bar=0 收掉设计稿切换条。
// 跑法（仓库根目录）：node docs/design/next/themes/tools/shoot.mjs [输出目录]   默认 docs/shots/2026-11-10-k1
// 另：--extra <目录> 再截右栏四个标签、收起的右栏、余量的几种状态、右键菜单（不算进那 49 张）。
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../..')
const pw = await import(pathToFileURL(join(repo, 'desktop', 'node_modules', 'playwright-core', 'index.mjs')).href)
const args = process.argv.slice(2)
const extraAt = args.indexOf('--extra')
const extraDir = extraAt >= 0 ? resolve(args[extraAt + 1]) : null
const out = resolve(args.find((a, i) => !a.startsWith('--') && (extraAt < 0 || i !== extraAt + 1)) ??join(repo, 'docs', 'shots', '2026-11-10-k1'))
const page0 = pathToFileURL(join(here, '..', 'index.html')).href

const SCREENS = ['shelf', 'chat', 'inbox', 'library', 'ask', 'settings', 'queue']
const THEMES = ['precision', 'glass', 'research']
const LOOKS = ['light', 'dark']

const browser = await pw.chromium.launch({ channel: 'msedge', headless: true })
const problems = []
async function shot(file, params, size) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: params.appearance === 'dark' ? 'dark' : 'light' })
  const page = await ctx.newPage()
  page.on('pageerror', e => problems.push(`${file}: pageerror ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') problems.push(`${file}: console ${m.text()}`) })
  const q = new URLSearchParams({ bar: '0', ...params })
  await page.goto(`${page0}?${q}`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(150)
  const got = await page.evaluate(() => window.streamsDesign.state)
  for (const k of ['screen', 'theme']) if (params[k] && got[k] !== params[k]) problems.push(`${file}: asked ${k}=${params[k]}, page has ${got[k]}`)
  if (params.appearance && got.appearance !== params.appearance) problems.push(`${file}: asked appearance=${params.appearance}, page has ${got.appearance}`)
  await page.screenshot({ path: file })
  await ctx.close()
}

mkdirSync(out, { recursive: true })
let n = 0
for (const screen of SCREENS) for (const theme of THEMES) for (const appearance of LOOKS) {
  await shot(join(out, `${screen}-${theme}-${appearance}.png`), { screen, theme, appearance }, { width: 1440, height: 900 }); n++
}
for (const screen of SCREENS) {
  await shot(join(out, `${screen}-precision-light-1280.png`), { screen, theme: 'precision', appearance: 'light' }, { width: 1280, height: 800 }); n++
}
if (extraDir) {
  mkdirSync(extraDir, { recursive: true })
  const W = { width: 1440, height: 900 }
  for (const tab of ['progress', 'decide', 'detail', 'files']) await shot(join(extraDir, `panel-${tab}-inbox-precision-light.png`), { screen: 'inbox', theme: 'precision', appearance: 'light', tab }, W)
  for (const screen of ['chat', 'library', 'ask']) await shot(join(extraDir, `panel-detail-${screen}-precision-light.png`), { screen, theme: 'precision', appearance: 'light', tab: 'detail' }, W)
  await shot(join(extraDir, 'panel-closed-inbox-precision-light.png'), { screen: 'inbox', theme: 'precision', appearance: 'light', panel: 'closed' }, W)
  await shot(join(extraDir, 'panel-files-menu-library-precision-light.png'), { screen: 'library', theme: 'precision', appearance: 'light', tab: 'files', menu: '1' }, W)
  for (const quota of ['claude', 'codex', 'api', 'unreadable', 'none']) await shot(join(extraDir, `quota-${quota}-shelf-precision-light.png`), { screen: 'shelf', theme: 'precision', appearance: 'light', quota }, W)
  for (const theme of THEMES) await shot(join(extraDir, `panel-files-library-${theme}-dark.png`), { screen: 'library', theme, appearance: 'dark', tab: 'files' }, W)
}
await browser.close()
console.log(`${n} shots in ${out}${extraDir ? ` (+ extras in ${extraDir})` : ''}`)
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1 }
