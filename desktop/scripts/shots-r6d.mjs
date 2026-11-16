#!/usr/bin/env node
// Redesign R6d (docs/checks/2026-11-15-r6d/contract.md R6d-1 · R6d-2 · R6d-3): every screen of the design's list in every look.
// The list is docs/design/redesign/source/07-模板版/画面清单.json — 21 screens × the design's four themes; the app has each
// theme in light and in dark, so 21 screens × 8 looks = 168 pictures of the real window, each the size of the design's own
// pictures (1440 × 906: the design's 1440 × 940 viewport less its demo bar), each with the text the window showed at that
// moment beside it, and each checked for contrast just before it is taken (scripts/lib/contrast.mjs).
//
//   node scripts/shots-r6d.mjs                      all 168 → docs/shots/2026-11-15-r6d/<theme>-<light|dark>/<screen>.png + .txt,
//                                                   the contrast record → docs/checks/2026-11-15-r6d/对比度.json,
//                                                   the side-by-side page → docs/shots/2026-11-15-r6d/index.html
//   --only <screen,…>      only these screens (ids of the list); --looks <theme-appearance,…>  only these looks
//   --skip <screen,…>      leave these screens out (a control: what a run is asked for and does not take this time is counted
//                          missing — whatever an earlier run left on disk — and the exit code is 1)
//   --out <folder>         another folder for the pictures (then the contrast record is <folder>/对比度.json unless --contrast)
//   --contrast <file>      another file for the contrast record
//   --app <folder>         run another copy of the app (a folder like desktop/, with core/ beside it) — for the control of the
//                          contrast check: a temporary copy whose dark ink is changed (docs/desktop.md §4.23)
//   --rules                each piece under the bar also lists the style rules that set its colour (for looking into a failure)
//   --verify               take nothing: only count the pictures in --out and read their sizes
//   --index                take nothing: only write index.html from what is in --out
// A run with --only or --looks replaces the pictures it takes in the contrast record and keeps the rest; a run without
// them (all 168, --skip or not) writes the record afresh, so a screen it did not take is not in it.
// A run that takes pictures counts as missing every picture it was asked for (the screens of --only, all 21 without it;
// the looks of --looks, all 8 without it; --skip does not take a screen out of that) and did not take in this run — the
// file on disk from an earlier run does not stand in for it (redesign R6d precheck: before, a skipped screen's old
// picture and its old contrast lines were counted, and 「缺 0」 with exit code 0 came out of a run that took nothing).
// Exit code: 0 when all 168 pictures are there, each 1440 × 906 with its text, the text has no word of this machine's user
// in it, and no piece of text that is not exempt is under the contrast bar; 1 when a picture or a text is missing, has
// another size, or names the user; 2 when only the contrast fails. The last line printed is 「21 画面 × 8 外观 = 168 张，缺 n」.
//
// How it works. Each screen is reached once, the way the pictures of R1–R6a reach it (docs/checks/2026-11-13-r6b/survey/
// shots.md §2; scripts/shots-r2 … r6a, shots-r5b and test/ui-english-screens.test.mjs hold the same steps); then, for each of
// the 8 looks: the look is changed the way 设置 changes it (shots-r6a's look(): through the bridge, then data-theme,
// body.dataset.appearance, the template's body class and the loaded sheets are checked), the screen's ARRIVAL is checked
// again (the locators that say 「this is that screen」 and the tab the right panel rests on), the contrast check runs, the
// text is read (document.body.innerText; the reading window's own bar and page) and the picture is taken (shots-r6a's
// shot(): document.fonts.ready, a pause, three tries).
//
// Worlds and safety. Every world is made by tempDir (scripts/lib/temp.mjs: mkdirSync, never mkdtemp) — and for this script
// the temp folder itself is moved, for this process and the app it starts, to a folder whose path does not hold this
// machine's user name: C:\streams-shots\<process id>-<random> (made with mkdirSync, removed at the end); when C:\ cannot
// be written, %ProgramData%\streams-shots\… . So the folders the screens show (高级设置's 库文件夹, 移除该库, 设置's 新建库默认存储
// 位置, the 文件 tab) name no user. Which one was used is printed and written into the contrast record (meta.worldRoot).
// The app gets its data folders through appEnv (scripts/lib/paths.mjs: every STREAMS_* of the parent is dropped, then
// STREAMS_APP_DATA / STREAMS_LOCAL_DATA of the world), STREAMS_DEV_CONNECTION=fake (or login-expired: nothing real is
// called), STREAMS_DEV_LIBRARY_ROOT inside the world (never the real Documents), the update off, the schedule off. The real
// %APPDATA%\Streams is never read or written.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { _electron } from 'playwright-core'
import { closeApp } from './lib/close-app.mjs'
import { contrastInPage, EXEMPT, REQUIRED } from './lib/contrast.mjs'
import { DESKTOP_DIR, REPO_DIR, electronExe } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { ready, testEnv } from '../test/support/app.mjs'
import { seedPlanB, seedShelf } from '../test/support/seed.mjs'
import { seedQueue, startHoldingFeed } from '../test/support/queue-world.mjs'
import { seedReaderLibrary, startReaderSite } from '../test/support/reader-site.mjs'
import { BAR_HEIGHT, READER_PARTITION } from '../src/main/reader.mjs'
import { THEME_IDS, THEME_TEMPLATE } from '../src/shared/themes.mjs'

const started = Date.now()
const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const list = name => (value(name) ? value(name).split(',').map(s => s.trim()).filter(Boolean) : null)
const DEFAULT_OUT = join(REPO_DIR, 'docs', 'shots', '2026-11-15-r6d')
const OUT = resolve(value('--out') ?? DEFAULT_OUT)
const CONTRAST_FILE = resolve(value('--contrast') ?? (OUT === DEFAULT_OUT ? join(REPO_DIR, 'docs', 'checks', '2026-11-15-r6d', '对比度.json') : join(OUT, '对比度.json')))
const APP_DIR = resolve(value('--app') ?? DESKTOP_DIR)
const RULES = args.includes('--rules') // for looking into a failure: each piece under the bar also lists the style rules that give it its colour
const W = 1440
const H = 906
const POLL = { polling: 100, timeout: 60_000 }

// ---- the design's list: 21 screens × 4 themes -----------------------------------------------------------------------------------
const DESIGN_DIR = join(REPO_DIR, 'docs', 'design', 'redesign', 'source', '07-模板版')
const LIST = JSON.parse(readFileSync(join(DESIGN_DIR, '画面清单.json'), 'utf8'))
const SCREENS = [...new Set(LIST.map(x => x.screen))]
const DESIGN_THEMES = [...new Set(LIST.map(x => x.theme))]
/** The design's theme names → the app's theme ids (src/shared/themes.mjs; docs/checks/2026-11-13-r6b/survey/shots.md §3). */
const THEME_OF = Object.freeze({ 精密国际主义: 'precision', 澄明玻璃: 'glass', 研究对话: 'research', 单线黑白: 'monoline' })
const APPEARANCES = Object.freeze(['light', 'dark'])
if (SCREENS.length !== 21 || DESIGN_THEMES.length !== 4 || LIST.length !== 84) throw new Error(`画面清单.json: ${SCREENS.length} screens × ${DESIGN_THEMES.length} themes, ${LIST.length} entries — not 21 × 4 = 84`)
if (DESIGN_THEMES.some(n => !THEME_OF[n]) || DESIGN_THEMES.map(n => THEME_OF[n]).sort().join() !== [...THEME_IDS].sort().join()) throw new Error(`the design's themes ${DESIGN_THEMES.join(' · ')} are not the app's ${THEME_IDS.join(' · ')}`)
const THEMES = DESIGN_THEMES.map(name => ({ name, id: THEME_OF[name] }))
const LOOKS = THEMES.flatMap(t => APPEARANCES.map(a => ({ theme: t.id, appearance: a, id: `${t.id}-${a}` })))
/** The design's picture of a screen in a theme (a path under 07-模板版/, as the list gives it). */
const designPng = (themeName, screen) => LIST.find(x => x.theme === themeName && x.screen === screen).png
const screenName = id => LIST.find(x => x.screen === id).name

// ---- which design picture each screen is compared to, the tab its right panel rests on, and what says 「arrived」 ----------------
// `design`: the file under 07-模板版/截图/<主题>/ (the same name in all four themes; held to 画面清单.json below). `tab`: the right panel's tab in the design's
// picture (07-模板版/streams/app.js DEFAULT_TAB) — except the three screens marked *: there the design's panel shows 「流息怎样工作」
// with 进度 lit; the app has that text under 详情 (R4a: screens/first-run.js HowItWorks), so the panel rests on 详情 and shows
// what the design shows. `pointer`: where the pointer is (the design's pictures are taken without a pointer: nothing hovered;
// 库架's cards too). `at(c)`: selectors that must each match in the window before every one of the 8 pictures; `not`: selectors
// that must match nothing. The reading window is a window of its own: its bar and its page are asked instead.
const tabIs = t => `[data-part="right-panel"][data-open="true"][data-tab="${t}"]`
const ARRIVAL = Object.freeze({
  firstrun: { design: '首次打开.png', tab: 'detail*', at: () => ['main[data-screen="first-run"][data-state="ready"] [data-part="first-run"][data-view="home"] [data-part="current-connection"][data-kind="claude-code"]', `${tabIs('detail')} [data-part="how-it-works"]`] },
  connect: { design: '连接选择.png', tab: 'detail*', at: () => ['[data-part="first-run"][data-view="pick"] [data-connection="claude-code"][data-conn-state="not-logged-in"]', `${tabIs('detail')} [data-part="how-it-works"]`] },
  shelf: { design: '库架.png', tab: 'progress', at: c => ['main[data-screen="shelf"][data-state="ready"]', ...c.shelf.ids.map(id => `[data-shelf-card="${id}"]`), tabIs('progress')], not: ['[data-shelf-card]:hover'] },
  agent: { design: '主Agent.png', tab: 'decide', at: () => ['main[data-screen="chat"][data-state="ready"] [data-part="conversation"] [data-proposal][data-kind="create_library"][data-status="pending"]', '[data-part="compose"][data-busy="false"]', `${tabIs('decide')} [data-pane="decide"] [data-decide][data-from="agent"]`, '[data-pane="decide"] [data-decide][data-from="system"]'] },
  new: { design: '新建库.png', tab: 'detail*', at: () => ['main[data-screen="new-library"][data-state="ready"] [data-part="sources"] [data-source][data-fetch-state="ok"]', '[data-part="sources"] [data-source][data-fetch-state="failed"]', `${tabIs('detail')} [data-part="how-it-works"]`] },
  inbox: { design: '待看.png', tab: 'detail', at: () => ['main[data-screen="inbox"][data-state="ready"] [data-card][data-current="true"]', `${tabIs('detail')} [data-part="detail-inbox"]`], not: ['main [data-part="empty"]'] },
  empty: { design: '待看空着时.png', tab: 'progress', at: () => ['main[data-screen="inbox"][data-state="ready"] [data-part="empty"]', 'main [data-part="last-run"]', `${tabIs('progress')} [data-part="last-run"]`], not: ['[data-card]'] },
  run: { design: '运行与排队.png', tab: 'progress', at: c => [`.lib-page[data-library="${c.q.running}"] main[data-screen="inbox"][data-state="ready"] [data-part="run-steps"]`, `.lib-page[data-library="${c.q.running}"] [data-part="running-chip"]`, `[data-library-row="${c.q.running}"] [data-library-queue="running"]`, `[data-library-row="${c.q.waiting}"] [data-library-queue="queued"]`, `${tabIs('progress')} [data-part="running"]`] },
  expired: { design: '连接出问题.png', tab: 'decide', at: () => ['.lib-page main[data-screen="inbox"][data-state="ready"]', '.lib-page [data-part="problem"]', `${tabIs('decide')} [data-pane="decide"] [data-decide]`] },
  library: { design: '资料库.png', tab: 'detail', at: c => [`main[data-screen="library"][data-state="ready"] [data-reader="${c.world.planB.evals.id}"]`, `${tabIs('detail')} [data-part="note-panel"][data-id="${c.world.planB.evals.id}"]`], not: ['dialog[open]'] },
  graph: { design: '图谱.png', tab: 'detail', at: () => ['main[data-screen="graph"][data-state="ready"] [data-part="graph"] [data-node]', `${tabIs('detail')} [data-part="detail-graph"] [data-part="node-items"] [data-node-item]`] },
  edit: { design: '编辑笔记.png', tab: 'detail', at: () => ['dialog[data-dialog="edit"][open]', 'main[data-screen="library"][data-state="ready"]', tabIs('detail')] },
  header: { design: '缺少文件头.png', tab: 'files', at: () => ['[data-part="missing-header"] [data-card]', tabIs('files')] },
  ask: { design: '问库.png', tab: 'detail', at: () => ['main[data-screen="ask"][data-state="ready"] [data-turn="1"][data-state="done"] [data-proposal]', `${tabIs('detail')} [data-part="detail-ask"] [data-detail-cite]`] },
  sources: { design: '来源与要求.png', tab: 'files', at: () => ['main[data-screen="sources"][data-state="ready"] [data-part="brief"][data-state="ready"]', '[data-part="sources"] [data-row]', tabIs('files')], not: ['[data-part="gates"]', 'dialog[open]'] },
  advanced: { design: '高级设置.png', tab: 'detail', at: () => ['[data-part="gates"][data-state="ready"]', '[data-part="changes"][data-state="ready"]', tabIs('detail')], not: ['dialog[open]'] },
  remove: { design: '移除该库.png', tab: 'detail', at: () => ['dialog[data-dialog="remove-library"][open]', '[data-part="gates"][data-state="ready"]', tabIs('detail')] },
  settings: { design: '设置.png', tab: 'progress', at: () => ['main[data-screen="settings"][data-state="ready"] [data-part="connections"] [data-connection="api"]', '[data-part="usage-sum"]', tabIs('progress')], not: ['dialog[open]'] },
  apikey: { design: '输入API-key.png', tab: 'progress', at: () => ['dialog[data-dialog="api-key"][open]', 'main[data-screen="settings"][data-state="ready"]', tabIs('progress')] },
  licenses: { design: '许可证与致谢.png', tab: 'progress', at: () => ['dialog[data-dialog="licenses"][open] [data-part="components"]', 'main[data-screen="settings"][data-state="ready"]', tabIs('progress')] },
  reader: { design: '阅读窗口.png', tab: '(no panel)', window: 'reader', at: () => ({ bar: ['[data-reader-bar][data-mode="reading"]'], page: ['.reader-title'] }) },
})
if (Object.keys(ARRIVAL).sort().join() !== [...SCREENS].sort().join()) throw new Error('ARRIVAL does not name exactly the 21 screens of the list')
for (const t of THEMES) for (const s of SCREENS) if (designPng(t.name, s) !== `截图/${t.name}/${ARRIVAL[s].design}`) throw new Error(`${s}: the list's picture is ${designPng(t.name, s)}, ARRIVAL says ${ARRIVAL[s].design}`)

const ONLY = list('--only')
const SKIP = list('--skip') ?? []
const ONLY_LOOKS = list('--looks')
for (const id of [...(ONLY ?? []), ...SKIP]) if (!SCREENS.includes(id)) throw new Error(`${id} is not a screen of the list (${SCREENS.join(' ')})`)
for (const id of ONLY_LOOKS ?? []) if (!LOOKS.some(l => l.id === id)) throw new Error(`${id} is not a look (${LOOKS.map(l => l.id).join(' ')})`)
const want = id => (ONLY === null || ONLY.includes(id)) && !SKIP.includes(id)
const wantAny = (...ids) => ids.some(want)
const looks = () => LOOKS.filter(l => ONLY_LOOKS === null || ONLY_LOOKS.includes(l.id))

// ---- the side-by-side page (R6d-2) ---------------------------------------------------------------------------------------------
/** docs/shots/2026-11-15-r6d/index.html: relative paths only, nothing from the network. 84 groups, three pictures each. */
function writeIndex() {
  const rel = p => p.split('\\').join('/')
  const designBase = '../../design/redesign/source/07-模板版'
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const groups = []
  for (const screen of SCREENS) {
    const parts = THEMES.map(t => {
      const pics = [
        ['设计稿 · 浅色', `${designBase}/${designPng(t.name, screen)}`],
        ['应用 · 浅色', `${t.id}-light/${screen}.png`],
        ['应用 · 深色', `${t.id}-dark/${screen}.png`],
      ]
      return `<section class="group" id="g-${screen}-${t.id}" data-screen="${screen}" data-theme="${t.id}"><h3>${esc(screenName(screen))} · ${esc(t.name)} <small>${screen} · ${t.id}</small> <a class="top" href="#top">回到顶上</a></h3><div class="row">${
        pics.map(([label, src]) => `<figure><a href="${esc(rel(src))}"><img loading="lazy" width="${W}" height="${H}" src="${esc(rel(src))}" alt="${esc(`${screenName(screen)} · ${t.name} · ${label}`)}"></a><figcaption>${esc(label)} <code>${esc(rel(src))}</code></figcaption></figure>`).join('')
      }</div></section>`
    })
    groups.push(`<section class="screen" id="s-${screen}"><h2>${esc(screenName(screen))} <small>${screen}</small></h2>${parts.join('\n')}</section>`)
  }
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>流息 · R6d · 21 画面 × 四套主题 × 浅深 对照</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { margin: 0; font: 14px/1.5 "Microsoft YaHei UI", "Segoe UI", sans-serif; color: #1f2933; background: #eef0f2; }
header { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid #c9cfd6; padding: 10px 16px; }
header h1 { font-size: 16px; margin: 0 0 6px; }
header p { margin: 2px 0; }
header a, header button { display: inline-block; margin: 2px 6px 2px 0; padding: 1px 8px; border: 1px solid #c9cfd6; border-radius: 4px; background: #f7f8f9; color: #1f2933; text-decoration: none; font: inherit; cursor: pointer; }
header button[aria-pressed="true"] { background: #1f2933; color: #fff; }
main { padding: 0 16px 80px; }
.screen > h2 { margin: 28px 0 4px; font-size: 20px; scroll-margin-top: 150px; }
.screen, .group { scroll-margin-top: 150px; }
.group h3 { margin: 14px 0 6px; font-size: 14px; }
small { color: #52606d; font-weight: normal; }
.top { font-weight: normal; font-size: 12px; margin-left: 8px; }
.row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
figure { margin: 0; background: #fff; border: 1px solid #c9cfd6; }
figure img { display: block; width: 100%; height: auto; }
figcaption { padding: 4px 8px; font-size: 12px; color: #323f4b; }
code { font-size: 11px; color: #52606d; word-break: break-all; }
body[data-only] .group { display: none; }
body[data-only="precision"] .group[data-theme="precision"], body[data-only="glass"] .group[data-theme="glass"],
body[data-only="research"] .group[data-theme="research"], body[data-only="monoline"] .group[data-theme="monoline"] { display: block; }
table.jump { border-collapse: collapse; font-size: 12px; margin-top: 4px; }
table.jump td, table.jump th { border: 1px solid #d9dee3; padding: 0 4px; text-align: left; font-weight: normal; }
table.jump a { border: 0; background: none; padding: 0 2px; margin: 0; text-decoration: underline; }
details summary { cursor: pointer; }
</style></head>
<body id="top">
<header>
<h1>流息 · 重设计 R6d · 21 画面 × 四套主题：设计稿浅色 | 应用浅色 | 应用深色（84 组，每组三张，1440 × 906）</h1>
<p>按画面跳：${SCREENS.map(s => `<a href="#s-${s}">${esc(screenName(s))}</a>`).join('')}</p>
<p>按主题看：<button type="button" data-show="" aria-pressed="true">四套都看</button>${THEMES.map(t => `<button type="button" data-show="${t.id}" aria-pressed="false">只看${esc(t.name)}</button>`).join('')}</p>
<details><summary>按主题 × 画面跳到某一组（84 个链接）</summary><table class="jump"><tr><th>主题</th><th>画面</th></tr>${
  THEMES.map(t => `<tr><th id="t-${t.id}">${esc(t.name)}</th><td>${SCREENS.map(s => `<a href="#g-${s}-${t.id}">${esc(screenName(s))}</a>`).join(' ')}</td></tr>`).join('')
}</table></details>
</header>
<main>
${groups.join('\n')}
</main>
<script>
// 只在本页内切换显示：不联网，不读写任何东西
for (const b of document.querySelectorAll('header button[data-show]')) b.addEventListener('click', () => {
  if (b.dataset.show) document.body.dataset.only = b.dataset.show; else delete document.body.dataset.only
  for (const o of document.querySelectorAll('header button[data-show]')) o.setAttribute('aria-pressed', String(o === b))
})
</script>
</body></html>
`
  mkdirSync(OUT, { recursive: true })
  const file = join(OUT, 'index.html')
  writeFileSync(file, html, 'utf8')
  // every file the page points at is there (the design's pictures are, from the list; the app's once they are taken)
  const missing = []
  for (const m of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) { const p = resolve(OUT, m[1].replace(/&amp;/g, '&')); if (!existsSync(p)) missing.push(m[1]) }
  return { file, groups: SCREENS.length * THEMES.length, missing: [...new Set(missing)] }
}

// ---- the count at the end (R6d-1): every picture there, 1440 × 906, with its text; no word of this machine's user ----------------
// this machine's user as a path or a screen could name it: the profile folder's name (C:Users<it>) and the account's name
// when that is another word — but not an account name that is an ordinary word of the interface (an account called
// 「Windows」 would be found in 「Windows 版」 on every screen)
const USER_NAMES = [...new Set([basename(homedir()), userInfo().username])].filter(n => n && n.length >= 3 && !/^(windows|user|users|admin|administrator|public|default|owner)$/i.test(n))
const namesUser = text => USER_NAMES.some(n => text.toLowerCase().includes(n.toLowerCase()))
function pngSize(file) {
  const b = readFileSync(file)
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}
function verify(notTaken = new Set()) {
  const problems = []
  let missing = 0
  for (const l of LOOKS) {
    for (const s of SCREENS) {
      const png = join(OUT, l.id, `${s}.png`)
      const txt = join(OUT, l.id, `${s}.txt`)
      if (!existsSync(png)) { missing += 1; problems.push(`缺 ${l.id}/${s}.png`); continue }
      if (notTaken.has(`${l.id}/${s}`)) { missing += 1; problems.push(`缺 ${l.id}/${s}.png：这次要拍、没有拍（盘上那张是之前拍的）`); continue }
      const size = pngSize(png)
      if (!size || size[0] !== W || size[1] !== H) problems.push(`尺寸不对 ${l.id}/${s}.png：${size ? size.join(' × ') : '不是 PNG'}，应为 ${W} × ${H}`)
      if (!existsSync(txt)) { problems.push(`缺文字 ${l.id}/${s}.txt`); continue }
      const text = readFileSync(txt, 'utf8')
      if (text.trim().length < 20) problems.push(`文字是空的 ${l.id}/${s}.txt`)
      // R6d-5: nothing of this machine's user in what the window showed (the world's root is why)
      const hit = [namesUser(text) ? '本机用户名' : null, /\b维护者\b/i.test(text) ? '维护者' : null, /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text) ? '邮箱样式的字' : null].filter(Boolean)
      if (hit.length) problems.push(`文字里有${hit.join('、')} ${l.id}/${s}.txt`)
    }
  }
  return { missing, problems }
}

// ---- the contrast record (R6d-3) ------------------------------------------------------------------------------------------------
const taken = [] // { look, screen, at, checked, below, exempt, covered, pictures, lowestPassing, entries }
function writeContrast(meta) {
  let old = { shots: [] }
  try { old = JSON.parse(readFileSync(CONTRAST_FILE, 'utf8')) } catch { /* the first run */ }
  const key = s => `${s.look}/${s.screen}`
  const fresh = new Map(taken.map(s => [key(s), s]))
  const partial = ONLY !== null || ONLY_LOOKS !== null
  const kept = partial ? (old.shots ?? []).filter(s => !fresh.has(key(s))) : []
  const order = s => LOOKS.findIndex(l => l.id === s.look) * 100 + SCREENS.indexOf(s.screen)
  const shots = [...kept, ...taken].sort((a, b) => order(a) - order(b))
  const entries = shots.flatMap(s => s.entries.map(e => ({ look: s.look, screen: s.screen, ...e, ...(e.exempt ? { reason: EXEMPT[e.exempt] } : {}) })))
  const violations = entries.filter(e => !e.exempt)
  const exemptBy = {}
  for (const e of entries) if (e.exempt) exemptBy[e.exempt] = (exemptBy[e.exempt] ?? 0) + 1
  const record = {
    what: '重设计 R6d-3：168 张截图各自拍之前的对比度检查（desktop/scripts/shots-r6d.mjs + scripts/lib/contrast.mjs）。entries 只列不到要求的文字；每条：look 外观、screen 画面、selector 选择器、text 文字前 20 字、fg 前景、bg 实际背景、ratio 比值（向下取两位）、required 要求、size 字号 px、weight 字重；exempt + reason 是不计入的（只有禁用控件与空输入框的占位提示）；inert 表示在打开的对话框后面（按它自己的前景与背景量，不叠遮罩）。',
    required: REQUIRED,
    exemptReasons: EXEMPT,
    meta,
    totals: { shots: shots.length, combinations: new Set(shots.map(key)).size, checked: shots.reduce((n, s) => n + s.checked, 0), below: entries.length, violations: violations.length, exempt: entries.length - violations.length, exemptBy },
    shots: shots.map(s => ({ look: s.look, screen: s.screen, at: s.at, checked: s.checked, below: s.below, violations: s.entries.filter(e => !e.exempt).length, exempt: s.entries.filter(e => e.exempt).length, covered: s.covered, pictures: s.pictures, lowestPassing: s.lowestPassing, entries: s.entries })),
    entries,
  }
  mkdirSync(dirname(CONTRAST_FILE), { recursive: true })
  writeFileSync(CONTRAST_FILE, `${JSON.stringify(record, null, 1)}\n`, 'utf8')
  return record.totals
}

function finish(code0 = 0, contrastTotals = null, notTaken = new Set(), tookNow = null) {
  const page = writeIndex()
  const v = verify(notTaken)
  for (const p of v.problems) process.stdout.write(`${p}\n`)
  if (page.missing.length) process.stdout.write(`index.html 指到的文件有 ${page.missing.length} 个不在：${page.missing.slice(0, 5).join('、')}${page.missing.length > 5 ? ' …' : ''}\n`)
  let totals = contrastTotals
  if (!totals) { try { totals = JSON.parse(readFileSync(CONTRAST_FILE, 'utf8')).totals } catch { totals = null } }
  if (totals) process.stdout.write(`对比度：${totals.combinations} 张 · 量了 ${totals.checked} 处文字 · 不到要求 ${totals.below} 处 · 其中不计入 ${totals.exempt} 处（${Object.entries(totals.exemptBy).map(([k, n]) => `${k} ${n}`).join('、') || '无'}）· 违规 ${totals.violations} 处 → ${CONTRAST_FILE}\n`)
  else process.stdout.write(`对比度：没有记录（${CONTRAST_FILE}）\n`)
  process.stdout.write(`对照页：${page.file}（${page.groups} 组）\n`)
  process.stdout.write(`用时 ${Math.round((Date.now() - started) / 1000)} 秒\n`)
  if (tookNow !== null) process.stdout.write(`这次拍了 ${tookNow} 张${tookNow < SCREENS.length * LOOKS.length ? `，其余 ${SCREENS.length * LOOKS.length - tookNow} 张是盘上之前拍的` : ''}\n`)
  process.stdout.write(`${SCREENS.length} 画面 × ${LOOKS.length} 外观 = ${SCREENS.length * LOOKS.length} 张，缺 ${v.missing}\n`)
  const contrastBad = !totals || totals.violations > 0 || totals.combinations !== SCREENS.length * LOOKS.length
  process.exitCode = code0 || (v.problems.length || page.missing.length ? 1 : (contrastBad ? 2 : 0))
}

if (args.includes('--verify') || args.includes('--index')) {
  if (args.includes('--index')) { const p = writeIndex(); process.stdout.write(`${p.file}：${p.groups} 组，指到的文件缺 ${p.missing.length} 个\n`); process.exitCode = p.missing.length ? 1 : 0 } else finish()
} else {
  await main()
}

async function main() {
  // ---- where the worlds go: a folder without this machine's user name in its path ----------------------------------------------
  const bases = ['C:\\streams-shots', join(process.env.ProgramData ?? 'C:\\ProgramData', 'streams-shots')]
  let RUN_ROOT = null
  let BASE = null
  for (const base of bases) {
    if (namesUser(base)) continue
    try {
      mkdirSync(base, { recursive: true })
      const dir = join(base, `${process.pid}-${randomBytes(4).toString('hex')}`)
      mkdirSync(dir)
      writeFileSync(join(dir, 'probe.txt'), 'x')
      RUN_ROOT = dir
      BASE = base
      break
    } catch { /* cannot write there: the next one */ }
  }
  if (!RUN_ROOT) throw new Error(`no folder without the user name could be written (${bases.join(', ')})`)
  // tempDir() makes its folders under os.tmpdir(), which reads these two: every world of this run, and the app's own temp files
  process.env.TEMP = RUN_ROOT
  process.env.TMP = RUN_ROOT
  process.stdout.write(`世界的根：${BASE}\\<进程号-随机>（不含本机用户名；拍完删）\n`)

  const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
  const { startFakeServer } = await import(pathToFileURL(join(REPO_DIR, 'core', 'test', 'support', 'fake-server.mjs')).href)
  const { rssWith } = await import(pathToFileURL(join(REPO_DIR, 'core', 'test', 'support', 'feeds.mjs')).href)
  const CONTRAST_SRC = `(${contrastInPage.toString()})`

  function quotaFile(root) {
    const file = join(root, 'quota.json')
    const now = Math.floor(Date.now() / 1000)
    writeFileSync(file, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [
      { id: 'five_hour', usedPercent: 8, resetsAt: now + 4 * 3600 },
      { id: 'seven_day', usedPercent: 26, resetsAt: now + 3 * 86400 },
    ] } }))
    return file
  }
  const DETECT_OK = { 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } }

  /**
   * One run of the app on a fresh world. `kind` 'empty' (no library: 首次打开) or 'seeded' (the shelf's three libraries, plan B's
   * notes when `planB`); `prepare({ world, shelf, root })` writes the data before the start and may return { env, cleanup, … }
   * (the rest is given to `work` as t.extra). `work(t)` drives the page; t.shoot(id, { restore }) takes the screen's pictures.
   */
  async function session({ kind = 'seeded', planB = false, start = null, tab = 'detail', detect = DETECT_OK, connection = 'fake', prepare = null }, work) {
    const root = tempDir('w-')
    if (namesUser(root)) throw new Error('the world\'s root holds the user name')
    let app = null
    let cleanup = null
    try {
      const world = await makeWorld({ root, kind })
      let shelf = null
      if (kind === 'seeded') {
        if (planB) await seedPlanB(world)
        shelf = await seedShelf(world)
      }
      const extra = prepare ? (await prepare({ world, shelf, root })) ?? {} : {}
      cleanup = extra.cleanup ?? null
      const detectFile = join(root, 'detect.json')
      writeFileSync(detectFile, JSON.stringify(detect), 'utf8')
      const env = {
        STREAMS_WINDOW: 'shown', STREAMS_DEV_CONNECTION: connection, STREAMS_DEV_DETECT: detectFile, STREAMS_DEV_LIBRARY: '',
        STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_DEV_QUOTA: quotaFile(root), ...(start ? { STREAMS_START_SCREEN: start } : {}), ...(extra.env ?? {}),
      }
      const settings = { theme: 'research', appearance: 'light', panel: { open: true, tab }, ...(kind === 'seeded' ? { connections: { active: 'claude-code' } } : {}) }
      // test/support/app.mjs launch(), with the folder of the app to run (--app: a temporary copy for the contrast control)
      app = await _electron.launch({ executablePath: electronExe(), args: ['--force-device-scale-factor=1', APP_DIR], env: testEnv(world, { env, settings }), timeout: 60_000 })
      const page = await app.firstWindow({ timeout: 60_000 })
      const errors = []
      page.on('pageerror', err => errors.push(err.message))
      const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
      await ready(page, start ?? 'first-run')
      // the design's pictures are 1440 × 906; the app opens at 1440 × 960 (main.mjs createWindow): the content is resized, nothing else
      // (the window is on the real desktop while the pictures are taken: so that a stray double click on its title bar or a snap
      // does not change its size, it cannot be maximized meanwhile; the size is asked again before every picture)
      const sized = async () => {
        await app.evaluate(({ BrowserWindow }, [w, h]) => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isMaximized()) win.unmaximize()
            if (win.isFullScreen()) win.setFullScreen(false)
            win.setMaximizable(false)
            const [cw, ch] = win.getContentSize()
            if (cw !== w || ch !== h) win.setContentSize(w, h)
          }
        }, [W, H])
        await until(([w, h]) => innerWidth === w && innerHeight === h, [W, H])
      }
      await sized()
      const tabTo = async name => {
        if (await page.evaluate(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'false')) await page.click('[data-action="unfold"] button')
        await page.click(`[data-panel-tab="${name}"]`)
        await until(x => document.querySelector('[data-part="right-panel"]')?.dataset.tab === x, name)
      }
      // shots-r6a.mjs look(): the theme and the appearance changed the way 设置 changes them, then what the page shows checked
      const look = async (theme, appearance) => {
        for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
          const r = await page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
          if (!r.ok) throw new Error(`${m}(${v}): ${JSON.stringify(r)}`)
        }
        await until(([t, a, cls]) => document.documentElement.dataset.theme === t && document.body.dataset.appearance === a && document.body.className === cls
          && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass])
        // the icons are the theme's own too: the app draws again once the look is on the page (app.js, redesign R6d — before
        // that fix the light pictures had the icons of the theme before). Held here on 新建库's icon in the sidebar, against the
        // template's own edition of the theme (lib/template-icons.js TIcon newProject / plus; 单线黑白's edition is not a function
        // of the page's globals, so it is not asked — it is drawn by the same code).
        if (theme !== 'monoline') {
          await until(t => {
            const el = document.querySelector('.sidebar [data-action="add-library"] svg')
            const e = typeof window.yunzhiRound11Edition === 'function' ? window.yunzhiRound11Edition(`${t}11`) : null
            if (!el || !e) return true
            const layers = e.controlArt?.newProject
            const want = (layers ? layers.map(l => l.d) : [e.icons?.plus ?? 'M12 5v14M5 12h14']).join('|')
            return [...el.querySelectorAll('path')].map(p => p.getAttribute('d')).join('|') === want
          }, theme)
        }
      }
      const ctx ={ world, shelf, root, q: extra.q ?? null }
      // ---- the reading window: its bar (the window's own contents, the top BAR_HEIGHT px) and its page (the view) ------------------
      const inReader = code => app.evaluate(async ({ BrowserWindow, session: ses }, [partition, js]) => {
        const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses.fromPartition(partition) && w.contentView.children.length > 0)
        if (!win || win.webContents.isLoading() || win.contentView.children[0].webContents.isLoading()) return null
        const bar = await win.webContents.executeJavaScript(js).catch(() => null)
        const view = await win.contentView.children[0].webContents.executeJavaScript(js).catch(() => null)
        return bar === null || view === null ? null : { bar, view }
      }, [READER_PARTITION, code])
      const readerShot = async file => {
        // shots-r3.mjs readerShot(): the bar over the page, stitched in the main process
        const png = await app.evaluate(async ({ BrowserWindow, session: ses, nativeImage }, [partition, barHeight]) => {
          const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses.fromPartition(partition) && w.contentView.children.length > 0)
          if (!win.isVisible()) win.showInactive()
          await new Promise(done => setTimeout(done, 700))
          const bar = (await win.webContents.capturePage()).crop({ x: 0, y: 0, width: win.getContentSize()[0], height: barHeight })
          const pg = await win.contentView.children[0].webContents.capturePage()
          const a = bar.getSize()
          const b = pg.getSize()
          const width = Math.min(a.width, b.width)
          const rows = (img, size) => { const buf = img.toBitmap(); const out = []; for (let y = 0; y < size.height; y++) out.push(buf.subarray(y * size.width * 4, y * size.width * 4 + width * 4)); return out }
          return nativeImage.createFromBitmap(Buffer.concat([...rows(bar, a), ...rows(pg, b)]), { width, height: a.height + b.height }).toPNG().toString('base64')
        }, [READER_PARTITION, BAR_HEIGHT])
        writeFileSync(file, Buffer.from(png, 'base64'))
      }
      /** Is the window on screen `id` (ARRIVAL)? Throws with what is missing. */
      const arrived = async (id, lk) => {
        const a = ARRIVAL[id]
        const sel = a.at(ctx)
        if (a.window === 'reader') {
          const code = `(${JSON.stringify(sel)}).__K__.filter(s => document.querySelector(s) === null).concat(document.documentElement.dataset.theme === ${JSON.stringify(lk.theme)} && document.body.dataset.appearance === ${JSON.stringify(lk.appearance)} ? [] : ['look ' + document.documentElement.dataset.theme + ' ' + document.body.dataset.appearance])`
          const end = Date.now() + 60_000
          let last = null
          while (Date.now() < end) {
            const bar = await inReader(code.replace('__K__', 'bar'))
            const pg = await inReader(code.replace('__K__', 'page'))
            last = bar && pg ? [...bar.bar.map(s => `bar: ${s}`), ...pg.view.map(s => `page: ${s}`)] : ['the reading window is not there or still loading']
            if (last.length === 0) return
            await new Promise(done => setTimeout(done, 150))
          }
          throw new Error(`${id} ${lk.id}: not arrived — ${last.join(' | ')}`)
        }
        const check = () => page.evaluate(([must, not]) => [...must.filter(s => document.querySelector(s) === null).map(s => `missing ${s}`), ...not.filter(s => document.querySelector(s) !== null).map(s => `present ${s}`)], [sel, a.not ?? []])
        let last = await check()
        for (const end = Date.now() + 20_000; last.length && Date.now() < end;) { await page.waitForTimeout(150); last = await check() }
        if (last.length) throw new Error(`${id} ${lk.id}: not arrived — ${last.join(' | ')}`)
      }
      /** The 8 pictures of screen `id` (those asked for): look → restore → arrived → settle → contrast → text → picture. */
      const shoot = async (id, { restore = null } = {}) => {
        if (!want(id)) return
        const reader = ARRIVAL[id].window === 'reader'
        for (const lk of looks()) {
          await page.mouse.move(4, 4)
          await sized()
          await look(lk.theme, lk.appearance)
          if (restore) await restore()
          await arrived(id, lk)
          // the window is on the real desktop: the machine's own pointer, resting over it, lights whatever is under it (in the
          // first full run the first example row of 首次打开 was the hovered grey in all 8 looks: the middle of the window). The
          // pointer is put on the sidebar's corner again, and nothing of the main area, the right panel or a dialog may be
          // under a pointer when the picture is taken (the design's pictures have no pointer).
          if (!reader) {
            await page.mouse.move(4, 4)
            await until(() => document.querySelector('main *:hover, [data-part="right-panel"] *:hover, dialog *:hover') === null)
          }
          // shots-r6a.mjs shot(): the fonts, a pause (the template's transitions are 210 ms)
          await page.evaluate(() => document.activeElement?.blur?.())
          await page.evaluate(() => document.fonts.ready)
          await page.waitForTimeout(700)
          // a window that is covered on the desktop may draw no frames: a colour transition (160 ms in the template) would then
          // stay where it started and the colours read would be the look before's. Whatever still runs is brought to its end.
          await until(() => { const running = document.getAnimations().filter(a => a instanceof CSSTransition); for (const a of running) a.finish(); return running.length === 0 })
          await arrived(id, lk)
          const dir = join(OUT, lk.id)
          mkdirSync(dir, { recursive: true })
          const file = join(dir, `${id}.png`)
          let contrast
          let text
          if (reader) {
            // the bar's document lies under the page's view below its first BAR_HEIGHT px: only that strip of it is seen
            const both = await inReader(`[${CONTRAST_SRC}({ rules: ${RULES}, maxY: document.querySelector("[data-reader-bar]") ? ${BAR_HEIGHT} : 0 }), document.body.innerText]`)
            if (!both) throw new Error(`${id} ${lk.id}: the reading window went away`)
            const tag = (r, w) => r.entries.map(e => ({ ...e, selector: `${w}: ${e.selector}` }))
            const [b, v] = [both.bar[0], both.view[0]]
            const low = [b.lowestPassing, v.lowestPassing].filter(Boolean).sort((x, y) => x.ratio - y.ratio)[0] ?? null
            contrast = { checked: b.checked + v.checked, below: b.below + v.below, covered: b.covered + v.covered, pictures: b.pictures + v.pictures, lowestPassing: low, entries: [...tag(b, 'bar'), ...tag(v, 'page')] }
            text = `${both.bar[1]}\n${both.view[1]}`
            await readerShot(file)
          } else {
            contrast = await page.evaluate(`${CONTRAST_SRC}({ rules: ${RULES} })`)
            text = await page.evaluate(() => document.body.innerText)
            for (let i = 0; ; i++) {
              try { await page.screenshot({ path: file, timeout: 20_000 }); break } catch (err) {
                if (i === 2) throw err
                await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })
                await page.waitForTimeout(500)
              }
            }
          }
          if (contrast.checked < 5) throw new Error(`${id} ${lk.id}: the contrast check found only ${contrast.checked} pieces of text`)
          writeFileSync(join(dir, `${id}.txt`), `${text.replace(/\r\n/g, '\n').trimEnd()}\n`, 'utf8')
          const size = pngSize(file)
          if (!size || size[0] !== W || size[1] !== H) throw new Error(`${file} is ${size ? size.join(' × ') : 'not a PNG'}, not ${W} × ${H}`)
          const bad = contrast.entries.filter(e => !e.exempt).length
          taken.push({ look: lk.id, screen: id, at: new Date().toISOString(), ...contrast })
          appendFileSync(join(RUN_ROOT, 'taken.log'), `${lk.id}/${id}\n`)
          process.stdout.write(`${lk.id}/${id}.png · 文字 ${contrast.checked} 处 · 不到要求 ${contrast.below}（违规 ${bad}）\n`)
        }
      }
      await work({ page, app, until, tabTo, look, shoot, inReader, world, shelf, root, extra })
      if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
    } finally {
      if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
      if (cleanup) await cleanup()
      removeTree(root, { waitMs: 15_000 })
    }
  }

  let failure = null
  try {
    // 1 首次打开 (shots-r4a p01): no library, Claude Code found and signed in
    if (want('firstrun')) {
      await session({ kind: 'empty' }, async t => {
        await t.until(() => document.querySelector('[data-part="first-run"][data-view="home"] [data-part="current-connection"][data-kind="claude-code"]') !== null)
        await t.shoot('firstrun')
      })
    }
    // 2 连接选择 (shots-r4a p02): Claude Code found but not signed in, Codex not found
    if (want('connect')) {
      await session({ kind: 'empty', detect: { 'claude-code': { installed: true, loggedIn: false, version: '2.1.287' }, codex: { installed: false } } }, async t => {
        await t.until(() => document.querySelector('[data-part="first-run"][data-view="pick"] [data-connection="claude-code"][data-conn-state="not-logged-in"]') !== null)
        await t.shoot('connect')
      })
    }
    // 3 库架 (shots-r6a): the three libraries, the pointer on no card (the design's picture has no pointer)
    if (want('shelf')) {
      await session({ start: 'shelf', tab: 'progress' }, async t => {
        await t.until(sel => document.querySelector(sel) !== null, `[data-shelf-card="${t.shelf.ids[0]}"]`)
        await t.shoot('shelf', { restore: async () => { await t.page.mouse.move(4, 4); await t.until(() => document.querySelector('[data-shelf-card]:hover') === null) } })
      })
    }
    // 4 主Agent (shots-r5b p03): one sentence, the reply and its 创建库 proposal, the right panel on 待确认
    if (want('agent')) {
      const srv = await startFakeServer()
      try {
        const feed = srv.route('/feed.xml', { body: rssWith(Array.from({ length: 5 }, (_, i) => ({ title: `agent memory note ${i + 1}`, url: `https://example.test/m/${i + 1}` }))) })
        await session({
          start: 'chat', tab: 'decide',
          prepare: ({ shelf, root }) => {
            // every library's 系统检测 as the app records them at the end of its runs (shots-r5b.mjs, precheck fix 14)
            const others = me => shelf.ids.map((id, i) => ({ libraryId: id, dir: shelf.dirs[i] })).filter(o => o.dir !== me)
            for (const dir of shelf.dirs) core.recordSuggestions(dir, core.suggestFor(dir, { otherLibraries: others(dir) }))
            const script = join(root, 'agent-script.json')
            writeFileSync(script, JSON.stringify([{
              reply: '已生成建库提议。来源仅包含你提供的这一个（试抓结果：正常 · 5 条）；严格程度暂定为「标准」，营销内容主要由「实质」环节过滤。点击「创建」后由流息创建该库，并立即开始首次运行。',
              proposals: [{ kind: 'create_library', why: '用户要追踪 agent 长期记忆的方案与评测', params: {
                name: 'AI Agent 长期记忆', brief: '追踪 AI agent 的长期记忆方案与评测。只要有技术细节或数据的内容；不要营销稿、产品通稿、无数据的观点。',
                topics: [{ name: '记忆方案', keywords: ['agent memory', 'long-term memory'] }, { name: '记忆评测', keywords: ['benchmark', 'MemBench'] }],
                sources: [{ name: 'my-feed', kind: 'rss', url: feed, topic: '记忆方案' }], schedule: { enabled: true, time: '08:00' },
              } }],
            }]), 'utf8')
            return { env: { STREAMS_DEV_AGENT_SCRIPT: script } }
          },
        }, async t => {
          const { page, until } = t
          await page.fill('textarea[data-field="message"]', `我想追 AI agent 的长期记忆方案和评测，不要营销稿。来源先只用我常看的这个订阅：${feed}`)
          await page.click('[data-action="send"] button')
          await until(() => document.querySelector('[data-part="conversation"] [data-proposal][data-kind="create_library"][data-status="pending"]') !== null
            && document.querySelector('[data-part="compose"]')?.dataset.busy === 'false'
            && document.querySelectorAll('[data-pane="decide"] [data-decide][data-from="system"]').length >= 1)
          const bottom = () => page.evaluate(() => { const el = document.querySelector('.st-chat .thread-scroll'); if (el) el.scrollTop = el.scrollHeight })
          await t.shoot('agent', { restore: bottom })
        })
      } finally { await srv.close() }
    }
    // 5 新建库 (shots-r4a p04): the form filled, two sources tried on this machine (正常, 暂时失败), from its top
    if (want('new')) {
      const srv = await startFakeServer()
      try {
        const ev = srv.route('/ev.xml', { body: rssWith([{ title: '10 月乘用车零售数据', url: 'https://ev.test/1' }, { title: '动力电池 10 月装车量', url: 'https://ev.test/2' }]) })
        const notices = srv.route('/notices.xml', { status: 503, body: 'busy' })
        await session({ start: 'new-library' }, async t => {
          const { page, until } = t
          await page.fill('[data-field="name"]', '中国电动车')
          await page.fill('[data-field="brief"]', '追踪中国新能源车的月度数据：乘用车零售与批发、渗透率、动力电池装车量与技术路线。不要车型评测、促销和软文。')
          for (const url of [ev, notices]) {
            await page.fill('[data-field="source"]', url)
            await page.press('[data-field="source"]', 'Enter')
          }
          await until(() => [...document.querySelectorAll('[data-part="sources"] [data-source]')].map(r => r.dataset.fetchState).join() === 'ok,failed')
          await page.fill('[data-field="topic"]', '月度数据')
          await page.press('[data-field="topic"]', 'Enter')
          await until(() => document.querySelector('[data-part="folder-state"]')?.dataset.state === 'empty' && document.querySelector('[data-part="estimate"]')?.dataset.lo !== '')
          await t.shoot('new', { restore: () => page.evaluate(() => { document.querySelector('.st-first-body').scrollTop = 0 }) })
        })
      } finally { await srv.close() }
    }
    // 6 待看 (shots-r2 p05, the plain page as the design shows it): the cards, the first one current, the right panel on 详情
    if (want('inbox')) {
      await session({ planB: true, start: 'inbox' }, async t => {
        const { page, until } = t
        await until(() => document.querySelectorAll('[data-card]').length === 4)
        const urls = await page.evaluate(() => [...document.querySelectorAll('[data-card]')].map(e => e.dataset.url))
        await page.click(`[data-card][data-url="${urls[0]}"] .card-body`)
        await until(u => document.querySelector(`[data-card][data-url="${u}"]`)?.dataset.current === 'true', urls[0])
        await t.tabTo('detail')
        await until(() => document.querySelector('[data-part="detail-inbox"]') !== null)
        await t.shoot('inbox', { restore: () => page.evaluate(() => document.querySelector('.inbox-body')?.scrollTo(0, 0)) })
      })
    }
    // 7 待看空着时 (shots-r2 p06): every card decided before the start; the right panel on 进度
    if (want('empty')) {
      await session({
        planB: true, start: 'inbox', tab: 'progress',
        prepare: ({ world }) => {
          const items = core.listInbox(world.library)
          core.keep(world.library, items[0].url)
          core.keep(world.library, items[1].url)
          core.dismiss(world.library, items[2].url, '营销内容', { quick: 'marketing' })
          core.dismiss(world.library, items[3].url)
        },
      }, async t => {
        await t.until(() => document.querySelector('[data-part="empty"]') !== null && document.querySelector('main [data-part="last-run"]') !== null)
        await t.tabTo('progress')
        await t.until(() => document.querySelector('[data-part="right-panel"] [data-part="last-run"]') !== null)
        await t.shoot('empty')
      })
    }
    // 8 运行与排队 (shots-r2 p07): one library running — held in 抓取 by feeds on this machine that answer slowly — and one waiting.
    // The feed: 8 sources, each held 19 s (under the core's 20 s fetch timeout), one after the other: about 150 s in 抓取. The 8
    // looks take about 20 s (measured: docs/desktop.md §4.23); the arrival (running + queued) is checked before every picture.
    if (want('run')) {
      let feed = null
      await session({
        planB: true, start: 'inbox', tab: 'progress',
        prepare: async ({ world, shelf }) => {
          feed = await startHoldingFeed({ holdMs: 19_000 })
          const q = await seedQueue(world, shelf, feed, { sources: 8 })
          return { q, env: { STREAMS_DEV_NOW: q.now }, cleanup: () => feed.close() }
        },
      }, async t => {
        const { page, until } = t
        const q = t.extra.q
        const t0 = Date.now()
        await until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`) !== null, [q.running, q.waiting])
        await page.click(`[data-library-row="${q.running}"]`)
        await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="inbox"][data-state="ready"]`) !== null, q.running)
        await until(() => document.querySelector('[data-part="run-steps"]') !== null && document.querySelector('[data-part="running-chip"]') !== null)
        await t.tabTo('progress')
        await until(() => document.querySelector('[data-part="running"]') !== null)
        await t.shoot('run')
        process.stdout.write(`运行与排队：从开始运行到拍完 ${Math.round((Date.now() - t0) / 1000)} 秒（慢 feed 压住约 ${8 * 19} 秒）\n`)
      })
    }
    // 9 连接出问题 (shots-r5b p08): 立即运行 with the sign-in expired; the right panel on 待确认 with the library's system findings
    if (want('expired')) {
      await session({
        start: 'inbox', connection: 'login-expired', tab: 'decide',
        prepare: ({ world }) => {
          const dir = world.library
          for (const it of core.listInbox(dir)) core.keep(dir, it.url)
          core.appendEvent(dir, { ev: 'seen', url: 'https://example.org/ev/oct-retail', source: 'letta-blog', title: '10 月乘用车零售数据', date: core.localIsoDate(new Date()) })
          const at = i => new Date(Date.now() - (4 - i) * 3_600_000).toISOString()
          appendFileSync(join(dir, '_pipeline', 'rounds.jsonl'), [1, 2, 3].map(i => `${JSON.stringify({ id: `dry-${i}`, startedAt: at(i), finishedAt: at(i), counts: { fetched: 2, new: 0, maybeDuplicates: 0, summarized: 0, inbox: 0 }, gates: {}, calls: 0 })}\n`).join(''), 'utf8')
          for (const i of [2, 3]) core.appendFetchLog(dir, { ts: at(i), round: `dry-${i}`, source: 'mcp-news', kind: 'rss', status: 'gap', hint: 'fix-address-or-remove', count: 0, new: 0, http: 404, message: 'HTTP 404: check the address' })
          core.recordSuggestions(dir, core.suggestFor(dir))
        },
      }, async t => {
        const { page, until } = t
        await until(() => document.querySelector('[data-part="run-button"][data-run-state="idle"] button')?.disabled === false)
        await page.click('[data-part="run-button"] button')
        await until(() => document.querySelector('.lib-page [data-part="problem"]') !== null)
        await until(() => document.querySelectorAll('[data-pane="decide"] [data-decide]').length >= 2)
        await t.shoot('expired')
      })
    }
    // 10–13 资料库 · 编辑笔记 · 缺少文件头 · 图谱 (shots-r3 p09 p11 p12 p10): one run of the app, plan B's notes
    if (wantAny('library', 'edit', 'header', 'graph')) {
      await session({ planB: true, start: 'library' }, async t => {
        const { page, until, world } = t
        const id = world.planB.evals.id
        await until(() => document.querySelector('main[data-screen="library"][data-state="ready"] [data-part="list"] [data-row]') !== null)
        await page.click(`[data-part="list"] [data-row="${id}"]`)
        await until(i => document.querySelector(`[data-reader="${i}"]`) !== null && document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id)
        await t.tabTo('detail')
        await until(() => document.querySelector('[data-part="detail-record"] small')?.textContent.includes('6') === true)
        await t.shoot('library')

        if (want('edit')) {
          await page.click('[data-part="item-actions"] [data-action="edit"] button')
          await until(() => document.querySelector('dialog[data-dialog="edit"][open]') !== null)
          await t.shoot('edit')
          await page.click('[data-action="cancel-edit"] button')
          await until(() => document.querySelector('[data-dialog="edit"]') === null)
        }
        if (want('header')) {
          await until(() => document.querySelector('[data-part="missing-header-hint"] [data-action="go-missing-header"] button') !== null)
          await page.click('[data-part="missing-header-hint"] [data-action="go-missing-header"] button')
          await until(() => document.querySelector('[data-part="missing-header"] [data-card]') !== null)
          await t.tabTo('files')
          await t.shoot('header')
          await page.click('[data-action="back-to-library"] button')
          await until(() => document.querySelector('[data-part="list"] [data-row]') !== null)
          await t.tabTo('detail')
        }
        if (want('graph')) {
          await page.click('[data-part="view-switch"] [data-mode="graph"]')
          await until(() => document.querySelector('main[data-screen="graph"][data-state="ready"] [data-part="graph"] [data-node]') !== null)
          await page.click(`[data-node="topic:${world.seed.topics[0]}"]`)
          await until(() => document.querySelector('[data-part="detail-graph"] [data-part="node-items"] [data-node-item]') !== null)
          await t.shoot('graph')
        }
      })
    }
    // 14 问库 (shots-r3 p13): a question answered with its cites, then a sentence handed to the main Agent with its proposal
    if (want('ask')) {
      await session({
        planB: true, start: 'ask',
        prepare: ({ shelf, root }) => {
          const askFile = join(root, 'ask-answer.json')
          writeFileSync(askFile, JSON.stringify({
            answer: [
              { text: '库里的评测横向比较了五种 agent 记忆方案，作者自己的方案排第一，基线是分层记忆。', cites: [1] },
              { text: '分层记忆把主记忆放在上下文里，外部存储按需换入换出，长对话上的评测效果最好。', cites: [2] },
              { text: '代价方面，分层方案每轮多一次模型调用。', cites: [2] },
            ],
            notInLibrary: false,
            missing: '「隔天回来」情形下各方案的直接排名',
            claimed: ['json-keys', 'cites-in-set', 'cited-sentences', 'claims-supported'],
          }), 'utf8')
          const agentFile = join(root, 'agent-script.json')
          writeFileSync(agentFile, JSON.stringify([{ reply: '已生成修改提议：单次运行上限从 120 次改为 30 次模型调用，确认后生效。', proposals: [{ kind: 'edit_cap', why: '你说这个库单次运行最多调用 30 次就够了', params: { libraryId: shelf.ids[0], cap: 30 } }] }]), 'utf8')
          return { env: { STREAMS_DEV_ASK_SCRIPT: askFile, STREAMS_DEV_AGENT_SCRIPT: agentFile } }
        },
      }, async t => {
        const { page, until } = t
        await page.fill('textarea[data-field="question"]', 'agent 记忆方案里哪种在长对话上表现最好？代价是什么？')
        await page.click('[data-action="send"] button')
        await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done' && document.querySelector('[data-turn="0"] [data-sentence]') !== null)
        await page.click('[data-turn="0"] [data-action="add-demand"] button')
        await until(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]') !== null)
        await page.fill('textarea[data-field="question"]', '这个库单次运行最多调用 30 次就够了，帮我把上限改成 30。')
        await page.click('[data-action="send"] button')
        await until(() => document.querySelector('[data-turn="1"]')?.dataset.state === 'done' && document.querySelector('[data-turn="1"] [data-proposal]') !== null)
        await t.tabTo('detail')
        await until(() => document.querySelector('[data-part="detail-ask"] [data-detail-cite]') !== null)
        await t.shoot('ask', { restore: () => page.evaluate(() => { const b = document.querySelector('.st-ask .thread-scroll'); b?.scrollTo(0, b.scrollHeight) }) })
      })
    }
    // 15–17 来源与要求 · 高级设置 · 移除该库 (shots-r4b p14 p15 p21): one run of the app; 来源与要求 from its top, the right panel on 文件
    if (wantAny('sources', 'advanced', 'remove')) {
      await session({
        start: 'sources', tab: 'files',
        prepare: ({ world }) => {
          core.saveBrief(world.library, '追踪 AI agent 长期记忆的评测与对比数据：基准与评测方法、实验结果与消融、不同记忆方案的对比。框架作者的工程笔记、经验谈不要；营销稿、产品通稿不要。')
          core.saveStrictness(world.library, 'standard')
          core.updateTopic(world.library, world.seed.topics[0], { keywords: ['agent memory', 'long-term memory', 'MemGPT', '评测'] })
        },
      }, async t => {
        const { page, until, world } = t
        await until(() => document.querySelector('[data-part="brief"][data-state="ready"]') && document.querySelectorAll('[data-part="sources"] [data-row]').length > 0)
        await t.shoot('sources', { restore: () => page.evaluate(() => { document.querySelector('.st-main__body').scrollTop = 0 }) })
        if (wantAny('advanced', 'remove')) {
          // a little history, written the way the page writes it (by you), so 变更记录 has lines
          await page.evaluate(async name => {
            await window.streams.setStrictness('strict')
            await window.streams.updateTopic(name, { keywords: ['agent memory', 'long-term memory', 'MemGPT', '评测', 'LoCoMo'] })
            await window.streams.setRoundCap(30)
          }, world.seed.topics[0])
          await page.click('[data-action="go-advanced"]')
          await until(() => document.querySelector('[data-part="gates"][data-state="ready"]') && document.querySelector('[data-part="changes"][data-state="ready"]'))
          await t.tabTo('detail')
          await t.shoot('advanced', { restore: () => page.evaluate(() => { document.querySelector('.st-main__body').scrollTop = 0 }) })
          if (want('remove')) {
            await page.click('[data-action="remove-library"] button')
            await until(() => document.querySelector('dialog[data-dialog="remove-library"][open]') !== null)
            await t.shoot('remove')
          }
        }
      })
    }
    // 18–20 设置 · 输入 API key · 许可证与致谢 (shots-r4b p17 p18 p19): one run of the app; one turn of the main agent so 用量 has its line
    if (wantAny('settings', 'apikey', 'licenses')) {
      await session({
        start: 'settings', tab: 'progress',
        prepare: ({ root }) => {
          const script = join(root, 'agent-script.json')
          writeFileSync(script, JSON.stringify([{ reply: '好的，已记下。' }]), 'utf8')
          return { env: { STREAMS_DEV_AGENT_SCRIPT: script } }
        },
      }, async t => {
        const { page, until } = t
        await page.evaluate(() => window.streams.agentSend('你好'))
        await until(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3 && document.querySelector('[data-part="usage-sum"]') !== null)
        const top = () => page.evaluate(() => { document.querySelector('.st-main__body').scrollTop = 0 })
        await t.shoot('settings', { restore: top })
        if (want('apikey')) {
          await top()
          await page.click('[data-connection="api"] [data-action="setup-key"] button')
          await until(() => document.querySelector('dialog[data-dialog="api-key"][open]') !== null)
          await t.shoot('apikey')
          await page.click('[data-dialog="api-key"] [data-action="cancel-key"] button')
          await until(() => document.querySelector('[data-dialog="api-key"]') === null)
        }
        if (want('licenses')) {
          await page.click('[data-part="about"] [data-action="licenses"] button')
          await until(() => document.querySelector('dialog[data-dialog="licenses"][open] [data-part="components"]') !== null)
          await t.shoot('licenses')
        }
      })
    }
    // 21 阅读窗口 (shots-r3 p20): the window of its own in 阅读模式, an article of a site on this machine; resized to 1440 × 906
    if (want('reader')) {
      await session({
        planB: true, start: 'library',
        prepare: async ({ world }) => {
          const site = await startReaderSite()
          await seedReaderLibrary(world.library, site)
          return { site, cleanup: () => site.close() }
        },
      }, async t => {
        const { page, app } = t
        const r = await page.evaluate(u => window.streams.openReader(u, 'reader'), t.extra.site.urls.article)
        if (!r.ok) throw new Error(JSON.stringify(r))
        let state = null
        for (const end = Date.now() + 60_000; Date.now() < end;) {
          state = await t.inReader('[document.querySelector("[data-reader-bar]")?.dataset.mode ?? null, Boolean(document.querySelector(".reader-title"))]')
          if (state && state.bar[0] === 'reading' && state.view[1] === true) break
          await new Promise(done => setTimeout(done, 150))
        }
        if (!(state && state.bar[0] === 'reading' && state.view[1] === true)) throw new Error(`the reading window did not come to its reading page: ${JSON.stringify(state)}`)
        const size = await app.evaluate(async ({ BrowserWindow, session: ses }, [partition, w, h]) => {
          const win = BrowserWindow.getAllWindows().find(x => !x.isDestroyed() && x.webContents.session === ses.fromPartition(partition) && x.contentView.children.length > 0)
          win.setContentSize(w, h)
          await new Promise(done => setTimeout(done, 400))
          return win.getContentSize()
        }, [READER_PARTITION, W, H])
        if (size[0] !== W || size[1] !== H) throw new Error(`the reading window's content is ${size.join(' × ')}, not ${W} × ${H}`)
        await t.shoot('reader')
      })
    }
  } catch (err) {
    failure = err
    process.stdout.write(`停在这里：${err.stack ?? err.message}\n`)
  } finally {
    try { removeTree(RUN_ROOT, { waitMs: 15_000 }) } catch (err) { process.stdout.write(`没删掉 ${RUN_ROOT}：${err.message}\n`) }
    try { if (readdirSync(BASE).length === 0) rmdirSync(BASE) } catch { /* another run is using it */ }
  }
  const totals = taken.length ? writeContrast({ script: 'desktop/scripts/shots-r6d.mjs', at: new Date().toISOString(), window: `${W} × ${H}`, worldRoot: `${BASE}\\<进程号-随机>`, electron: 'the pinned one (installer/electron), --force-device-scale-factor=1', seconds: Math.round((Date.now() - started) / 1000) }) : null
  // every picture this run was asked for must have been taken in it (the screens of --only — or all — in the looks of --looks — or all)
  const done = new Set(taken.map(x => `${x.look}/${x.screen}`))
  const notTaken = new Set(looks().flatMap(l => SCREENS.filter(id => ONLY === null || ONLY.includes(id)).map(id => `${l.id}/${id}`)).filter(k => !done.has(k)))
  finish(failure ? 1 : 0, totals, notTaken, done.size)
}
