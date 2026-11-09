#!/usr/bin/env node
// The three themes side by side, for 维护者 to pick the default (plan 5.6 D5; docs/desktop.md §五「主题」): the same screens of
// the real window (Playwright drives the pinned Electron; the window shown, content 1440×960, --force-device-scale-factor=1)
// in each set, on the same seeded world (scripts/lib/world.mjs 'seeded' + test/support/seed.mjs seedPlanB, the development
// connection faked) — a fresh world and a fresh start of the app per theme, the theme written into settings.json first, so
// every picture is the app's own first frame of that set, not a switch made on the page.
//   npm run shots:themes                     → docs/shots/themes/<theme>/<screen>.png and docs/shots/themes/index.html
//   -- --themes night,paper   only these     -- --screens today,ask   only these
// The screens: 今日, 待看, 资料库 with a note open, 来源与主题, 运行状态, 设置, 首次设置 (its first step), 问库 after one question,
// 图谱, and the 许可证与致谢 dialog over 设置. index.html: one row per screen, the three sets in three columns, the set's
// name under each picture. The worlds live under the OS temp folder and are removed after; the process trees are ended.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedPlanB } from '../test/support/seed.mjs'
import { THEME_IDS } from '../src/shared/themes.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OUT = join(REPO_DIR, 'docs', 'shots', 'themes')
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }

// the sets' names as the settings page gives them (texts/settings.js, texts-en/settings.js)
const NAMES = { river: '河蓝 River', paper: '素灰 Paper', night: '夜间 Night' }
// each screen: its id on the page, its name in index.html, what the picture needs once the screen is ready
const SCREENS = [
  // v2 package F: 今日 and 运行状态 are 概览 (the second scrolled to 「运行状态」), 来源与主题 is 来源与要求: `screen` is the page's data-screen
  { id: 'today', name: '概览（v1.0 今日）', start: 'today', screen: 'overview' },
  { id: 'inbox', name: '待看', start: 'inbox' },
  { id: 'library', name: '资料库 · 读一条', start: 'library', then: async (page, world) => {
    const id = world.planB.memgpt.id
    await page.click(`[data-part="list"] [data-row="${id}"] a`)
    await page.waitForFunction(i => document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id, POLL)
  } },
  { id: 'sources', name: '来源与要求', start: 'sources' },
  { id: 'status', name: '概览 · 运行状态', start: 'status', screen: 'overview' },
  { id: 'settings', name: '设置', start: 'settings' },
  { id: 'first-run', name: '首次打开 · 连接方式', start: 'first-run' },
  { id: 'ask', name: '问库', start: 'ask', then: async (page, world) => {
    await page.fill('textarea[data-field="question"]', world.planB.demandQuestion)
    await page.click('[data-action="send"] button')
    await page.waitForFunction(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done', null, POLL)
  } },
  { id: 'graph', name: '图谱', start: 'graph' },
  { id: 'licenses', name: '对话框 · 许可证与致谢', start: 'settings', then: async page => {
    await page.click('[data-part="about"] [data-action="licenses"] button')
    await page.waitForFunction(() => document.querySelector('[data-dialog="licenses"] [data-part="components"] [data-component]') !== null, null, POLL)
  } },
]

const themes = (value('--themes')?.split(',') ?? [...THEME_IDS]).filter(t => THEME_IDS.includes(t))
const screens = value('--screens') ? SCREENS.filter(s => value('--screens').split(',').includes(s.id)) : SCREENS
const report = []

for (const theme of themes) {
  const root = tempDir(`st-theme-shot-${theme}-`)
  let app = null
  try {
    const world = await makeWorld({ root, kind: 'seeded' })
    await seedPlanB(world)
    const env = { STREAMS_WINDOW: 'shown', STREAMS_START_SCREEN: 'today', STREAMS_DEV_CONNECTION: 'fake' }
    // the theme is the settings.json the app starts with: the first frame is that set (backgroundColor, the served data-theme)
    const started = await launch(world, { env, settings: { theme, connections: { active: 'claude-code' } } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await ready(page, 'overview')
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    mkdirSync(join(OUT, theme), { recursive: true })
    for (const s of screens) {
      // each screen opened the way a development run opens one (the hash), the page loaded afresh
      await page.evaluate(id => { location.hash = id; location.reload() }, s.start)
      await ready(page, s.screen ?? s.start)
      if (s.then) await s.then(page, world)
      const seen = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? null, page: getComputedStyle(document.body).backgroundColor }))
      if (seen.theme !== theme) throw new Error(`${s.id}: the page is ${seen.theme}, not ${theme}`)
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(300)
      const file = join(OUT, theme, `${s.id}.png`)
      await page.screenshot({ path: file })
      report.push({ theme, screen: s.id, file, body: seen.page })
      process.stdout.write(`${theme} ${s.id} → ${file}\n`)
    }
    if (errors.length) throw new Error(`page errors in ${theme}: ${errors.join(' | ')}`)
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
}

// the page the maintainer looks at: one row per screen, the three sets side by side (only when all three were taken)
if (themes.length === THEME_IDS.length) {
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rows = SCREENS.filter(s => screens.includes(s)).map(s => `  <tr>
    <th scope="row">${esc(s.name)}<br><code>${esc(s.id)}</code></th>
${THEME_IDS.map(t => `    <td><a href="${t}/${s.id}.png"><img src="${t}/${s.id}.png" alt="${esc(`${s.name} · ${NAMES[t]}`)}" width="${W / 3}" loading="lazy"></a><div class="name">${esc(NAMES[t])}</div></td>`).join('\n')}
  </tr>`).join('\n')
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>流息 · 三套主题并排</title>
<style>
  body { margin: 24px; font-family: 'Microsoft YaHei UI', 'PingFang SC', sans-serif; font-size: 13px; color: #16222B; background: #F2F5F7; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p { margin: 0 0 16px; color: #56646F; }
  table { border-collapse: collapse; }
  th, td { padding: 8px; vertical-align: top; border-bottom: 1px solid #D5DEE4; }
  thead th { text-align: center; font-size: 14px; }
  tbody th { text-align: left; width: 120px; font-weight: 700; }
  img { display: block; border: 1px solid #D5DEE4; }
  .name { text-align: center; margin-top: 4px; font-weight: 700; }
</style>
</head>
<body>
<h1>三套主题并排（河蓝 · 素灰 · 夜间）</h1>
<p>同一个开发假库、同一组画面，每套主题各起一次真 Electron 窗口（1440×960）拍的，主题在启动前写进 settings.json，所以每张都是那一套的第一帧。点图看原尺寸。默认主题只在 <code>desktop/src/main/theme.mjs</code> 的 <code>DEFAULT_THEME</code> 一行，现在是 river。重拍：<code>cd desktop &amp;&amp; npm run shots:themes</code>。</p>
<table>
  <thead><tr><th></th>${THEME_IDS.map(t => `<th scope="col">${esc(NAMES[t])}</th>`).join('')}</tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</body>
</html>
`
  writeFileSync(join(OUT, 'index.html'), html)
  process.stdout.write(`index → ${join(OUT, 'index.html')}\n`)
}
process.stdout.write(`${JSON.stringify({ shots: report.length, themes, screens: screens.map(s => s.id) })}\n`)
