#!/usr/bin/env node
// Pictures of the real window for v2 package I (docs/checks/2026-11-09-wp-i/contract.md I3): 首次打开's two steps, 新建库's first
// step and the settings page, on worlds under the OS temp folder (removed after). Playwright drives the pinned Electron, the
// window shown, content 1440×960, --force-device-scale-factor=1; the connections are the core's fake (STREAMS_DEV_CONNECTION=fake),
// the folder dialog the development hook. Pictures → docs/shots/<date>-i-<name>[-<theme>].png:
//   first-run-1   no library: 首次打开, step 1 (连接方式), the three cards                               (河蓝)
//   first-run-2   the connection chosen → 和主 Agent 聊 with the guide and its three example sentences    (河蓝)
//   new-library-1 「也可以手动新建」 → 新建库, step 1 with the folder chosen                             (河蓝)
//   settings      the settings page, whole: the window made as tall as the page for the picture       (河蓝, 素灰, 夜间)
//   node scripts/shots-i.mjs [--theme river|paper|night] [--date YYYY-MM-DD]
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeApp } from './lib/close-app.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch, ready } from '../test/support/app.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const day = value('--date') ?? new Date().toLocaleDateString('sv-SE')
const W = 1440
const H = 960
const POLL = { polling: 100, timeout: 60_000 }
const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const themes = value('--theme') ? [value('--theme')] : ['river', 'paper', 'night']
const taken = []
const out = (name, theme) => resolve(REPO_DIR, 'docs', 'shots', `${day}-i-${name}${theme === 'river' ? '' : `-${theme}`}.png`)

async function session(theme, kind, { env, prepare }, walk) {
  const root = tempDir(`st-shots-i-${theme}-`)
  let app = null
  try {
    const world = await makeWorld({ root, kind })
    if (prepare) await prepare(world)
    const started = await launch(world, { env: { STREAMS_WINDOW: 'shown', STREAMS_DEV_CONNECTION: 'fake', ...env(world) }, settings: { theme } })
    app = started.app
    const page = started.page
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    if (size[0] !== W || size[1] !== H) throw new Error(`the window's content is ${size.join('×')}, not ${W}×${H}`)
    const shot = async name => {
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(400)
      await page.screenshot({ path: out(name, theme) })
      taken.push(out(name, theme))
    }
    await walk({ page, app, world, shot })
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    removeTree(root, { waitMs: 10_000 })
  }
}

// 首次打开 → 和主 Agent 聊 → 新建库 (河蓝 only)
if (themes.includes('river')) {
  await session('river', 'empty', {
    prepare: world => mkdirSync(join(world.root, 'ev-library')),
    env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'ev-library') }),
  }, async ({ page, shot }) => {
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, 'first-run')
    await until(() => document.querySelectorAll('[data-connection] [data-detect]').length === 3)
    await shot('first-run-1')
    await page.click('[data-connection="claude-code"] [data-action="use"] button')
    await until(() => document.querySelector('[data-connection="claude-code"] [data-probe="ok"]') !== null)
    await page.click('[data-action="next"] button')
    await ready(page, 'chat')
    await until(() => document.querySelector('[data-part="first-guide"]') !== null && document.querySelector('[data-part="intro"]') !== null)
    await shot('first-run-2')
    await page.click('[data-action="manual-new"] button')
    await ready(page, 'new-library')
    await page.click('[data-action="choose-folder"] button')
    await until(() => document.querySelector('[data-folder-path]') !== null)
    await shot('new-library-1')
  })
}

// the settings page, whole, in each theme: three libraries, a few turns with the main Agent
for (const theme of themes) {
  await session(theme, 'seeded', {
    prepare: async world => {
      const { seedShelf } = await import('../test/support/seed.mjs')
      await seedShelf(world)
      const agentDir = join(world.appData, core.AGENT_DIR)
      let i = 0
      const t0 = Date.now() - 3 * 3_600_000
      const now = () => new Date(t0 + (i++) * 60_000)
      for (let turn = 1; turn <= 6; turn++) {
        core.appendTranscript(agentDir, { turn, role: 'you', text: `第 ${turn} 句` }, { now })
        core.appendTranscript(agentDir, { turn, role: 'agent', text: `第 ${turn} 个回答` }, { now })
      }
    },
    env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_START_SCREEN: 'settings' }),
  }, async ({ page, app, shot }) => {
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, 'settings')
    await until(() => document.querySelectorAll('[data-schedule-row]').length === 3 && !document.querySelector('[data-schedule="unknown"]')
      && document.querySelector('[data-part="usage"] [data-calls]') !== null && document.querySelector('[data-part="agent"] [data-turns]') !== null
      && document.querySelector('[data-part="library-root"] [data-root-path]') !== null && document.querySelectorAll('[data-connection] [data-conn-words]').length === 3)
    // the whole page in one picture: the window as tall as the page's body needs (the body scrolls inside the window)
    const extra = await page.evaluate(() => { const b = document.querySelector('main[data-screen="settings"] .st-main__body'); return b.scrollHeight - b.clientHeight })
    if (extra > 0) {
      await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(1, 1); win.setContentSize(w, h) }, [W, H + extra])
      await page.waitForFunction(h => innerHeight >= h, H + extra, POLL)
    }
    await shot('settings')
    await app.evaluate(({ BrowserWindow }, [w, h]) => { BrowserWindow.getAllWindows()[0].setContentSize(w, h) }, [W, H])
  })
}

for (const f of taken) console.log(f)
