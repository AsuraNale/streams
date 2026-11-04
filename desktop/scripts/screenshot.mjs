#!/usr/bin/env node
// A picture of the real window (Playwright drives the pinned Electron; the window shown, content 1440×960,
// --force-device-scale-factor=1), for the daily record in docs/shots/.
//   npm run shots                                      today on an empty world → docs/shots/<date>-empty-window.png
//   npm run shots -- --world seeded --screen today      a screen on the seeded world (scripts/lib/world.mjs) → docs/shots/<date>-<screen>.png
//   --screen first-run | today | inbox | run | error | settings | kit | <any screen id>
//       first-run   no library open, the wizard walked to its second step (the folder chosen through the development hook)
//       run         today with the 「跑一轮」 dialog open
//       error       today after a round that could not start (STREAMS_DEV_CONNECTION=login-expired): the S13 card
//       library | edit | sources | pipeline | status | ask | graph   plan B's screens on the seeded world plus its extras
//                   (test/support/seed.mjs seedPlanB): library = 资料库 with the MemGPT note open; edit = its 编辑 dialog;
//                   ask = after one question
//       settings-run        设置 on the seeded world, the schedule on (setSchedule from the page), scrolled to 「运行」 (A2, 11-04)
//       first-run-schedule  首次设置 walked to its last screen 「定时」: the folder, the connection skipped, the blank pack, the round
//       import      资料库 · 待规范 (S8) on a folder of .md files imported as a library: one card per file (11-04)
//   --lang en      the app in English            --out <file.png>   where the picture goes
// The app runs on a world under the OS temp folder, removed after; the process tree is ended (scripts/lib/close-app.mjs).
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'
import { seedPlanB } from '../test/support/seed.mjs'
import { seedImportFolder } from '../test/support/seed.mjs'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const screen = value('--screen') ?? 'today'
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
  run: { start: 'today', connection: 'fake' },
  error: { start: 'today', connection: 'login-expired' },
  // plan B (11-03): the seeded world plus seedPlanB's notes, verdicts, question and 404 source
  library: { start: 'library', connection: 'fake', planB: true },
  edit: { start: 'library', connection: 'fake', planB: true },
  sources: { start: 'sources', connection: 'fake', planB: true },
  pipeline: { start: 'pipeline', connection: 'fake', planB: true },
  status: { start: 'status', connection: 'fake', planB: true },
  ask: { start: 'ask', connection: 'fake', planB: true },
  graph: { start: 'graph', connection: 'fake', planB: true },
  // the timed round (A2, 11-04)
  'settings-run': { start: 'settings', connection: 'fake' },
  'first-run-schedule': { start: null, connection: 'fake', chooseFolder: true, noLibrary: true },
  // 资料库 · 待规范 (S8, 11-04) on a folder of .md files imported as a library (test/support/seed.mjs seedImportFolder + the
  // core's importFolder), any world kind; the window opens on that folder instead of the world's library
  import: { start: 'library', connection: 'fake', importFolder: true },
}
const plan = PLAN[screen] ?? { start: screen, connection: kind === 'seeded' ? 'fake' : null }

const root = tempDir('st-desktop-shot-')
let app = null
try {
  const world = await makeWorld({ root, kind })
  if (plan.planB && kind === 'seeded') await seedPlanB(world)
  const imported = plan.importFolder ? join(root, 'vault') : null
  if (imported) {
    seedImportFolder(imported)
    const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
    core.importFolder(imported, { name: 'vault' })
  }
  const env = {
    STREAMS_WINDOW: 'shown', // a hidden window draws no frames: nothing to take a picture of
    ...(plan.start ? { STREAMS_START_SCREEN: plan.start } : {}),
    // the world's library is open by default (test/support/app.mjs testEnv); 首次设置 starts without one
    ...(plan.noLibrary ? { STREAMS_DEV_LIBRARY: '' } : {}),
    ...(plan.connection ? { STREAMS_DEV_CONNECTION: plan.connection } : {}),
    ...(plan.chooseFolder ? { STREAMS_DEV_CHOOSE_FOLDER: world.library } : {}),
    ...(imported ? { STREAMS_DEV_LIBRARY: imported } : {}),
    ...(lang ? { STREAMS_DEV_SYSTEM_LANGUAGES: lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : lang } : {}),
  }
  // the seeded world has no connection chosen; the shots show the fake one chosen, as a user would in 设置
  const started = await launch(world, { env, settings: kind === 'seeded' && !plan.noLibrary ? { connections: { active: 'claude-code' } } : null })
  app = started.app
  const page = started.page
  if (screen === 'first-run') {
    await ready(page, 'first-run')
    await page.click('[data-action="choose-folder"] button')
    await page.waitForFunction(() => document.querySelector('[data-folder-path]') !== null, null, POLL)
    await page.click('[data-action="next"] button')
    await page.waitForFunction(() => document.querySelector('main[data-screen="first-run"][data-state="ready"] [data-part="step-connection"] [data-connection]') !== null, null, POLL)
  } else if (screen === 'run') {
    await ready(page, 'today')
    await page.click('[data-action="run"] button')
    await page.waitForFunction(() => document.querySelector('[data-dialog="run"] [data-row="cap"]') !== null, null, POLL)
  } else if (screen === 'error') {
    await ready(page, 'today')
    await page.click('[data-action="run"] button')
    await page.waitForFunction(() => document.querySelector('[data-dialog="run"] [data-row="cap"]') !== null, null, POLL)
    await page.click('[data-dialog="run"] [data-action="start"] button')
    await page.waitForFunction(() => document.querySelector('main[data-screen="today"] [data-part="problem"]') !== null, null, POLL)
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
    // the part reads the schedule when it is drawn: the page again, on the same screen
    await page.reload()
    await ready(page, 'settings')
    await page.waitForFunction(() => document.querySelector('[data-part="run"] [data-schedule="on"]') !== null, null, POLL)
    await page.evaluate(() => document.querySelector('[data-part="run"]').scrollIntoView({ block: 'start' }))
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
  } else {
    await ready(page, plan.start)
  }
  const size = await page.evaluate(() => [innerWidth, innerHeight])
  if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
  const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
  // no caret or focus ring in the picture
  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForTimeout(300)
  mkdirSync(dirname(out), { recursive: true })
  await page.screenshot({ path: out })
  const nav = await page.evaluate(() => [...document.querySelectorAll('[data-nav], [data-step]')].map(a => a.textContent.trim()))
  process.stdout.write(`${JSON.stringify({ out, screen, world: kind, windowTitle: title, size, sidebar: nav }, null, 2)}\n`)
} finally {
  if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
  removeTree(root, { waitMs: 10_000 })
}
