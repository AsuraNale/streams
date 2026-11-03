// Running the app in a test file: one session per file —
//   const s = appSession({ env, settings, waitFor })      (at the top level of the test file)
//   … s.run (the world's folders) · s.app (Playwright ElectronApplication) · s.page · s.errors
// before: a fresh empty world under the OS temp folder (scripts/lib/world.mjs), the pinned Electron 44.0.0 started by
// Playwright (playwright-core's Electron support: no browser download), the window hidden (STREAMS_WINDOW=hidden,
// development only), then waiting for `waitFor`. The system's languages are pinned to Chinese
// (STREAMS_DEV_SYSTEM_LANGUAGES, docs/desktop.md��) unless `env` says otherwise, so every test reads the Chinese
// tables; `settings` is written as the settings.json the world starts with (e.g. `{ language: 'en' }`); the update asks
// GitHub nothing (STREAMS_DEV_UPDATE_URL off) unless the test points it at a stand-in through `env`.
// after, in this order and each whatever the others do: close the app (killed if it does not exit; leftover helper
// processes of its data folder too), then remove the folders, links first. One hook does both: node:test skips the
// remaining after hooks once one throws, and a folder cannot be removed while the app still runs in it.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before } from 'node:test'
import { _electron } from 'playwright-core'
import { closeApp } from '../../scripts/lib/close-app.mjs'
import { DESKTOP_DIR, appEnv, electronExe } from '../../scripts/lib/paths.mjs'
import { removeTree } from '../../scripts/lib/remove-tree.mjs'
import { tempDir } from '../../scripts/lib/temp.mjs'
import { makeWorld } from '../../scripts/lib/world.mjs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export { closeApp }

/** The environment the app starts with in a test world. */
export function testEnv(run, { env = {}, settings = null } = {}) {
  if (settings) writeFileSync(join(run.appData, 'settings.json'), `${JSON.stringify({ schema: 'streams.settings/1', ...settings })}\n`)
  return appEnv({
    appData: run.appData,
    localData: run.localData,
    // the world's library is open by default (the shell's tests start on 今日); a test of 首次设置 passes STREAMS_DEV_LIBRARY: ''
    extra: { STREAMS_WINDOW: 'hidden', STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN', STREAMS_DEV_UPDATE_URL: 'off', STREAMS_DEV_LIBRARY: run.library, ...env },
  })
}

/** Start the app on a world (Playwright). */
export async function launch(run, options = {}) {
  const app = await _electron.launch({
    executablePath: electronExe(),
    args: ['--force-device-scale-factor=1', DESKTOP_DIR],
    env: testEnv(run, options),
    timeout: 60_000,
  })
  try {
    const page = await app.firstWindow({ timeout: 60_000 })
    return { app, page }
  } catch (err) {
    // no window (the main process stopped at start): end it here, or the test process waits on it for ever
    await closeApp(app, { userDataDir: join(run.appData, 'electron') }).catch(() => {})
    throw err
  }
}

/**
 * @param {object} [o]
 * @param {Record<string,string>} [o.env] - more environment for the app (e.g. STREAMS_START_SCREEN)
 * @param {object|null} [o.settings] - the settings.json the world starts with (e.g. `{ language: 'en' }`)
 * @param {'load'|string} [o.waitFor] - 'load' (the page loaded) or a screen id (its data-state="ready"; default: the first screen)
 */
export function appSession({ env = {}, settings = null, waitFor } = {}) {
  const s = { run: null, app: null, page: null, errors: [] }
  const folders = []
  before(async () => {
    const root = tempDir('st-desktop-test-')
    folders.push(root)
    s.run = await makeWorld({ root })
    const started = await launch(s.run, { settings, env })
    s.app = started.app
    s.page = started.page
    s.page.on('pageerror', err => s.errors.push(`pageerror: ${err.message}`))
    s.page.on('console', msg => { if (msg.type() === 'error') s.errors.push(`console: ${msg.text()}`) })
    const wait = waitFor ?? 'today'
    if (wait === 'load') await s.page.waitForLoadState('domcontentloaded')
    else await ready(s.page, wait)
  })
  after(async () => {
    const problems = []
    try { await closeApp(s.app, { userDataDir: s.run ? join(s.run.appData, 'electron') : undefined }) } catch (err) { problems.push(err) }
    await sleep(300)
    for (const dir of folders) {
      try { removeTree(dir, { waitMs: 20_000 }) } catch (err) { problems.push(err) }
    }
    if (problems.length) throw problems[0]
  })
  return s
}

/** Wait until a screen has its data (Main's data-state="ready"). Polls by time, not by animation frame:
 *  a hidden window draws no frames. */
export async function ready(page, screen = 'today') {
  await page.waitForFunction(id => Boolean(document.querySelector(`main[data-screen="${id}"][data-state="ready"]`)), screen, { timeout: 90_000, polling: 100 })
}
