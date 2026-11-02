#!/usr/bin/env node
// A picture of the real window (Playwright drives the pinned Electron; the window shown, content 1440×960,
// --force-device-scale-factor=1), for the daily record in docs/shots/.
//   npm run shots                         today, the first screen → docs/shots/<date>-empty-window.png
//   npm run shots -- --screen settings    another screen first (settings · kit · any screen id)
//   npm run shots -- --lang en            the app in English
//   npm run shots -- --out <file.png>     where the picture goes
// The app runs on an empty world under the OS temp folder, removed after; the process tree is ended (scripts/lib/close-app.mjs).
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const screen = value('--screen') ?? 'today'
const lang = value('--lang')
const today = new Date().toLocaleDateString('sv-SE')
const out = resolve(value('--out') ?? join(REPO_DIR, 'docs', 'shots', `${today}-empty-window.png`))
const W = 1440
const H = 960

const root = tempDir('st-desktop-shot-')
let app = null
try {
  const world = await makeWorld({ root })
  const env = {
    STREAMS_WINDOW: 'shown', // a hidden window draws no frames: nothing to take a picture of
    STREAMS_START_SCREEN: screen,
    ...(lang ? { STREAMS_DEV_SYSTEM_LANGUAGES: lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : lang } : {}),
  }
  const started = await launch(world, { env })
  app = started.app
  const page = started.page
  await ready(page, screen)
  const size = await page.evaluate(() => [innerWidth, innerHeight])
  if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
  const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
  // no caret or focus ring in the picture
  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForTimeout(300)
  mkdirSync(dirname(out), { recursive: true })
  await page.screenshot({ path: out })
  const nav = await page.evaluate(() => [...document.querySelectorAll('[data-nav]')].map(a => a.textContent.trim()))
  process.stdout.write(`${JSON.stringify({ out, screen, windowTitle: title, size, sidebar: nav }, null, 2)}\n`)
} finally {
  if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
  removeTree(root, { waitMs: 10_000 })
}
