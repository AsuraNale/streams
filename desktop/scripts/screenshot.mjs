#!/usr/bin/env node
// A picture of the real window (Playwright drives the pinned Electron; the window shown, content 1440×960,
// --force-device-scale-factor=1), for the daily record in docs/shots/.
//   npm run shots                                      概览 on an empty world → docs/shots/<date>-empty-window.png
//   npm run shots -- --world seeded --screen overview   a screen on the seeded world (scripts/lib/world.mjs) → docs/shots/<date>-<screen>.png
//   --screen first-run | overview | inbox | run | error | settings | kit | <any screen id>
//   v2 package F: the shell of plan B on three registered libraries (test/support/seed.mjs seedShelf + seedPlanB; --world seeded):
//       shelf                      库架
//       lib-overview | lib-inbox | lib-library | lib-ask | lib-sources   a library's page on each of its five tabs
//       (today, status and pipeline are v1.0's ids: 概览, 概览 scrolled to 「运行状态」, 来源与要求 scrolled to 「关卡」)
//       first-run   no library open, the wizard walked to its second step (the folder chosen through the development hook)
//       run         概览 with the 「跑一轮」 dialog open
//       error       概览 after a round that could not start (STREAMS_DEV_CONNECTION=login-expired): the S13 card
//       library | edit | sources | pipeline | status | ask | graph   plan B's screens on the seeded world plus its extras
//                   (test/support/seed.mjs seedPlanB): library = 资料库 with the MemGPT note open; edit = its 编辑 dialog;
//                   ask = after one question
//       settings-run        设置 on the seeded world, the schedule on (setSchedule), scrolled to 「定时一览」 (A2, 11-04; v2 package F)
//       first-run-schedule  首次设置 walked to its last screen 「定时」: the folder, the connection skipped, the blank pack, the round
//       import      资料库 · 待规范 (S8) on a folder of .md files imported as a library: one card per file (11-04)
//       settings-theme   设置 scrolled to 「主题」 (the three sets; docs/desktop.md §五) (11-04)
//       settings-setup   设置 scrolled to 「库」 with 「首次设置」: six records written by the core before the start (plan A1, 11-04)
//       no-output        概览 with 「连续 3 轮没有产出」: three rounds without output appended to rounds.jsonl (plan C8, 11-04)
//       licenses         设置 with the 许可证与致谢 dialog open (S14, 11-04)
//   v2 package H (11-09), on a library with nothing kept whose items are pages of a site on this machine (any --world;
//   test/support/reader-site.mjs):
//       library-empty    资料库 opened on 抓到的, nothing chosen (no button in the head)
//       library-more     an item kept from 抓到的, the note open (「已收藏 · 进了 notes/」), 「更多」 open
//       reader-reading   the reading window in 阅读模式 (its bar and its page laid one above the other by the script)
//       reader-fallback  the reading window on a page with no text: the original page and the line saying so
//       inbox-ai         待看 with the 「写给 AI 的话」 mark on one card
//   --theme river | paper | night   the theme settings.json starts with (default: the app's default)
//   --lang en      the app in English            --out <file.png>   where the picture goes
// The app runs on a world under the OS temp folder, removed after; the process tree is ended (scripts/lib/close-app.mjs).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedPlanB, seedShelf } from '../test/support/seed.mjs'
import { seedImportFolder } from '../test/support/seed.mjs'
import { seedReaderLibrary, startReaderSite } from '../test/support/reader-site.mjs'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const screen = value('--screen') ?? 'overview'
const kind = value('--world') ?? 'empty'
const lang = value('--lang')
const today = new Date().toLocaleDateString('sv-SE')
const out = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', value('--screen') ? `${today}-${screen}.png` : `${today}-empty-window.png`))
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }

// which screen the app opens on, and what the picture needs beyond that
const PLAN = {
  'first-run': { start: null, connection: 'fake', chooseFolder: true, noLibrary: true },
  run: { start: 'overview', connection: 'fake' },
  error: { start: 'overview', connection: 'login-expired' },
  // plan B (11-03): the seeded world plus seedPlanB's notes, verdicts, question and 404 source
  library: { start: 'library', connection: 'fake', planB: true },
  edit: { start: 'library', connection: 'fake', planB: true },
  sources: { start: 'sources', connection: 'fake', planB: true },
  pipeline: { start: 'sources', ready: 'sources', part: 'gates', connection: 'fake', planB: true },
  status: { start: 'overview', ready: 'overview', part: 'run', connection: 'fake', planB: true },
  ask: { start: 'ask', connection: 'fake', planB: true },
  graph: { start: 'graph', connection: 'fake', planB: true },
  // the timed round (A2, 11-04)
  'settings-run': { start: 'settings', connection: 'fake' },
  'first-run-schedule': { start: null, connection: 'fake', chooseFolder: true, noLibrary: true },
  // 资料库 · 待规范 (S8, 11-04) on a folder of .md files imported as a library (test/support/seed.mjs seedImportFolder + the
  // core's importFolder), any world kind; the window opens on that folder instead of the world's library
  import: { start: 'library', connection: 'fake', importFolder: true },
  // 11-04: the three themes' row, 首次设置's record, the banner of plan C8, 许可证与致谢
  'settings-theme': { start: 'settings', connection: 'fake' },
  'settings-setup': { start: 'settings', connection: 'fake', setupRecord: true },
  'no-output': { start: 'overview', connection: 'fake', noOutput: true },
  // v2 package F: three registered libraries (seedShelf), the seeded one current
  shelf: { start: 'shelf', connection: 'fake', planB: true, shelf: true },
  'lib-overview': { start: 'overview', connection: 'fake', planB: true, shelf: true },
  'lib-inbox': { start: 'inbox', connection: 'fake', planB: true, shelf: true },
  'lib-library': { start: 'library', connection: 'fake', planB: true, shelf: true },
  'lib-ask': { start: 'ask', connection: 'fake', planB: true, shelf: true },
  'lib-sources': { start: 'sources', connection: 'fake', planB: true, shelf: true },
  licenses: { start: 'settings', connection: 'fake' },
  // v2 package H (11-09): a library with nothing kept whose items are pages of a site on this machine (test/support/reader-site.mjs)
  'library-empty': { start: 'library', connection: 'fake', reader: true },
  'library-more': { start: 'library', connection: 'fake', reader: true },
  'reader-reading': { start: 'library', connection: 'fake', reader: true },
  'reader-fallback': { start: 'library', connection: 'fake', reader: true },
  'inbox-ai': { start: 'inbox', connection: 'fake', reader: true },
}
const theme = value('--theme')
const plan = PLAN[screen] ?? { start: screen, connection: kind === 'seeded' ? 'fake' : null }

const root = tempDir('st-desktop-shot-')
let app = null
let site = null
let readerDone = false
try {
  const world = await makeWorld({ root, kind: plan.reader ? 'empty' : kind })
  if (plan.reader) {
    site = await startReaderSite()
    await seedReaderLibrary(world.library, site)
  }
  if (plan.planB && kind === 'seeded') await seedPlanB(world)
  if (plan.shelf && kind === 'seeded') await seedShelf(world)
  const imported = plan.importFolder ? join(root, 'vault') : null
  if (imported) {
    seedImportFolder(imported)
    const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
    core.importFolder(imported, { name: 'vault' })
  }
  if (plan.setupRecord || plan.noOutput) {
    const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
    // who decided each step, as a walk through 首次设置 would have left it (the core's own writer)
    if (plan.setupRecord) {
      for (const [step, entry] of [['library', { by: 'chose', detail: 'empty' }], ['connection', { by: 'chose', detail: 'claude-code' }], ['pack', { by: 'chose', detail: 'agent-memory' }],
        ['sources', { by: 'wrote', detail: { removed: 1, added: 1 } }], ['trial', { by: 'skipped' }], ['schedule', { by: 'default', detail: { enabled: true, time: '08:30' } }]]) core.recordSetupStep(world.library, step, entry)
    }
    // three rounds after the seed's, none of them with output (the shape runRound writes)
    if (plan.noOutput) {
      for (let i = 1; i <= core.NO_OUTPUT_ROUNDS; i++) {
        const at = new Date(Date.now() - (core.NO_OUTPUT_ROUNDS - i + 1) * 3_600_000).toISOString()
        appendFileSync(join(world.library, '_pipeline', 'rounds.jsonl'), `${JSON.stringify({ id: `shot-${i}`, startedAt: at, finishedAt: at, counts: { fetched: 2, new: 0, maybeDuplicates: 0, summarized: 0, inbox: 0 }, gates: {}, calls: 0 })}\n`)
      }
    }
  }
  const env = {
    STREAMS_WINDOW: 'shown', // a hidden window draws no frames: nothing to take a picture of
    ...(plan.start ? { STREAMS_START_SCREEN: plan.start } : {}),
    // the world's library is open by default (test/support/app.mjs testEnv); 首次设置 starts without one
    ...(plan.noLibrary || plan.shelf ? { STREAMS_DEV_LIBRARY: '' } : {}),
    ...(plan.connection ? { STREAMS_DEV_CONNECTION: plan.connection } : {}),
    ...(plan.chooseFolder ? { STREAMS_DEV_CHOOSE_FOLDER: world.library } : {}),
    ...(imported ? { STREAMS_DEV_LIBRARY: imported } : {}),
    ...(lang ? { STREAMS_DEV_SYSTEM_LANGUAGES: lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : lang } : {}),
  }
  // the seeded world has no connection chosen; the shots show the fake one chosen, as a user would in 设置
  const settings = { ...((kind === 'seeded' || plan.reader) && !plan.noLibrary ? { connections: { active: 'claude-code' } } : {}), ...(theme ? { theme } : {}) }
  const started = await launch(world, { env, settings: Object.keys(settings).length ? settings : null })
  app = started.app
  const page = started.page
  if (screen === 'first-run') {
    await ready(page, 'first-run')
    await page.click('[data-action="choose-folder"] button')
    await page.waitForFunction(() => document.querySelector('[data-folder-path]') !== null, null, POLL)
    await page.click('[data-action="next"] button')
    await page.waitForFunction(() => document.querySelector('main[data-screen="first-run"][data-state="ready"] [data-part="step-connection"] [data-connection]') !== null, null, POLL)
  } else if (screen === 'run') {
    await ready(page, 'overview')
    await page.click('[data-action="run"] button')
    await page.waitForFunction(() => document.querySelector('[data-dialog="run"] [data-row="cap"]') !== null, null, POLL)
  } else if (screen === 'error') {
    await ready(page, 'overview')
    await page.click('[data-action="run"] button')
    await page.waitForFunction(() => document.querySelector('[data-dialog="run"] [data-row="cap"]') !== null, null, POLL)
    await page.click('[data-dialog="run"] [data-action="start"] button')
    await page.waitForFunction(() => document.querySelector('main[data-screen="overview"] [data-part="problem"]') !== null, null, POLL)
  } else if (screen === 'library' || screen === 'edit') {
    await ready(page, 'library')
    const id = world.planB?.memgpt.id
    if (id) {
      await page.click(`[data-part="list"] [data-row="${id}"] a`)
      await page.waitForFunction(i => document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id, POLL)
    }
    if (screen === 'edit') {
      await page.click('[data-action="edit"] button')
      await page.waitForFunction(() => document.querySelector('[data-dialog="edit"]') !== null, null, POLL)
    }
  } else if (screen === 'import') {
    await ready(page, 'library')
    await page.click('[data-view="pending"]')
    await page.waitForFunction(() => document.querySelector('[data-part="tidy"] [data-card] textarea') !== null, null, POLL)
  } else if (screen === 'ask') {
    await ready(page, 'ask')
    await page.fill('textarea[data-field="question"]', world.planB?.demandQuestion ?? 'agent')
    await page.click('[data-action="send"] button')
    await page.waitForFunction(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done', null, POLL)
  } else if (screen === 'settings-run') {
    await ready(page, 'settings')
    await page.evaluate(() => window.streams.setSchedule({ enabled: true, time: '08:30' }))
    // the part reads the schedules when it is drawn: the page again, on the same screen
    await page.reload()
    await ready(page, 'settings')
    await page.waitForFunction(() => document.querySelector('[data-part="schedules"] [data-schedule="on"]') !== null, null, POLL)
    await page.evaluate(() => document.querySelector('[data-part="schedules"]').scrollIntoView({ block: 'start' }))
  } else if (screen === 'first-run-schedule') {
    const step = id => page.waitForFunction(i => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === i, id, POLL)
    await ready(page, 'first-run')
    await page.click('[data-action="choose-folder"] button')
    await page.waitForFunction(() => document.querySelector('[data-folder-path]') !== null, null, POLL)
    await page.click('[data-action="next"] button')
    await step('connection')
    await page.click('[data-action="skip"] button')
    await step('pack')
    await page.click('[data-pack="blank"]')
    await page.click('[data-action="apply"] button')
    await page.waitForFunction(() => document.querySelector('[data-part="tried"]') !== null, null, POLL)
    await page.click('[data-action="continue"] button')
    await step('trial')
    await page.click('[data-action="start"] button')
    await page.waitForFunction(() => document.querySelector('[data-part="round-progress"]')?.dataset.done === 'true', null, POLL)
    await page.click('[data-action="next"] button')
    await step('schedule')
  } else if (screen === 'settings-theme' || screen === 'settings-setup') {
    await ready(page, 'settings')
    const part = screen === 'settings-theme' ? 'theme' : 'library'
    if (screen === 'settings-setup') await page.waitForFunction(() => document.querySelector('[data-part="library"] [data-part="setup"]')?.dataset.setup === 'recorded', null, POLL)
    await page.evaluate(p => document.querySelector(`[data-part="${p}"]`).scrollIntoView({ block: 'start' }), part)
  } else if (screen === 'no-output') {
    await ready(page, 'overview')
    await page.waitForFunction(() => document.querySelector('[data-part="no-output"]') !== null, null, POLL)
  } else if (screen === 'licenses') {
    await ready(page, 'settings')
    await page.click('[data-part="about"] [data-action="licenses"] button')
    await page.waitForFunction(() => document.querySelector('[data-dialog="licenses"] [data-part="components"] [data-component]') !== null, null, POLL)
  } else if (plan.part) {
    await ready(page, plan.ready)
    await page.waitForFunction(p => document.querySelector(`[data-part="${p}"]`) !== null, plan.part, POLL)
    await page.evaluate(p => document.querySelector(`[data-part="${p}"]`).scrollIntoView({ block: 'start' }), plan.part)
  } else if (screen === 'lib-sources') {
    await ready(page, 'sources')
    await page.waitForFunction(() => document.querySelector('[data-part="gates"][data-state="ready"]') !== null && document.querySelector('[data-who="brief"]') !== null, null, POLL)
  } else if (screen === 'library-empty') {
    await ready(page, 'library')
    await page.waitForFunction(() => document.querySelector('[data-view="caught"]')?.getAttribute('aria-current') === 'true' && document.querySelector('[data-part="pick-one"]') !== null, null, POLL)
  } else if (screen === 'library-more') {
    await ready(page, 'library')
    await page.click(`[data-part="list"] [data-row="${site.urls.article}"] a`)
    await page.waitForFunction(() => document.querySelector('[data-part="library-head"] [data-action="keep"] button:not([disabled])') !== null, null, POLL)
    await page.click('[data-part="library-head"] [data-action="keep"] button')
    await page.waitForFunction(() => document.querySelector('[data-kept-now="true"]') !== null && document.querySelector('[data-part="library-head"] [data-action="more"]') !== null, null, POLL)
    await page.click('[data-part="library-head"] [data-action="more"] button')
    await page.waitForFunction(() => document.querySelector('[data-menu]') !== null, null, POLL)
  } else if (screen === 'reader-reading' || screen === 'reader-fallback') {
    await ready(page, 'library')
    const url = screen === 'reader-reading' ? site.urls.article : site.urls.plain
    await page.click(`[data-part="list"] [data-row="${url}"] a`)
    await page.waitForFunction(() => document.querySelector('[data-part="library-head"] [data-action="source"]') !== null, null, POLL)
    // the reading window: its bar and its page, each taken by Electron and laid one above the other (the page is a view of
    // the window, not part of the window's own web contents)
    await page.evaluate(u => window.streams.openReader(u, 'reader'), url)
    await page.waitForTimeout(1500)
    const shot = await app.evaluate(async ({ BrowserWindow, nativeImage, session }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === session.fromPartition('streams-reader'))
      const view = win.contentView.children[0]
      const bar = await win.webContents.capturePage()
      const body = await view.webContents.capturePage()
      // the bar's web contents is the whole window under the view: only its top rows, down to where the view starts
      const top = view.getBounds().y
      const a = bar.getSize()
      const b = body.getSize()
      const width = Math.min(a.width, b.width)
      const rows = []
      for (const [img, size, height] of [[bar, a, top], [body, b, b.height]]) {
        const bmp = img.toBitmap()
        for (let y = 0; y < height; y++) rows.push(bmp.subarray(y * size.width * 4, y * size.width * 4 + width * 4))
      }
      const out = nativeImage.createFromBitmap(Buffer.concat(rows), { width, height: top + b.height })
      return { png: out.toPNG().toString('base64'), size: [width, top + b.height], title: win.getTitle(), content: win.getContentSize(), view: view.getBounds() }
    })
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, Buffer.from(shot.png, 'base64'))
    process.stdout.write(`${JSON.stringify({ out, screen, world: 'reader', size: shot.size, windowTitle: shot.title }, null, 2)}\n`)
    readerDone = true
  } else if (screen === 'inbox-ai') {
    await ready(page, 'inbox')
    await page.waitForFunction(() => document.querySelector('[data-card] [data-ai-instruction]') !== null, null, POLL)
  } else if (screen === 'lib-library') {
    await ready(page, 'library')
    const id = world.planB?.memgpt.id
    if (id) {
      await page.click(`[data-part="list"] [data-row="${id}"] a`)
      await page.waitForFunction(i => document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id, POLL)
    }
  } else {
    await ready(page, plan.start)
  }
  if (!readerDone) {
    // the shell's own data (the libraries of the sidebar) before the picture
    if (plan.shelf) await page.waitForFunction(() => document.querySelectorAll('[data-library-row]').length === 3, null, POLL)
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
    // no caret or focus ring in the picture
    await page.evaluate(() => document.activeElement?.blur())
    await page.waitForTimeout(300)
    mkdirSync(dirname(out), { recursive: true })
    await page.screenshot({ path: out })
    const nav = await page.evaluate(() => [...document.querySelectorAll('[data-nav], [data-library-row], [data-step]')].map(a => a.textContent.trim()))
    process.stdout.write(`${JSON.stringify({ out, screen, world: kind, windowTitle: title, size, sidebar: nav }, null, 2)}\n`)
  }
} finally {
  if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
  if (site) await site.close()
  removeTree(root, { waitMs: 10_000 })
}
