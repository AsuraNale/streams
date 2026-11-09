// v2 draft N6: the real app (the pinned Electron 44.0.0 the installer's setup put in installer/electron, started by
// Playwright's Electron support from desktop/node_modules) on a world of its own under the system's temporary folder:
// its own app-data and local-data folders (STREAMS_APP_DATA / STREAMS_LOCAL_DATA — never %APPDATA%\Streams), Chinese
// pinned as the system language, no update request (STREAMS_DEV_UPDATE_URL off), every connection the core's stand-in
// (STREAMS_DEV_CONNECTION=fake) and the main Agent on a script (STREAMS_DEV_AGENT_SCRIPT). The window starts hidden
// (STREAMS_WINDOW=hidden: a test run — nothing is opened outside the app, a click on 「用 Obsidian 打开」 only writes the log)
// and is then shown without taking the focus (showInactive), so that it draws and the screenshots are of the real window.
//
//   const a = await launchApp({ appData, localData, env })   → { app, page, errors, log(), close() }
//   await ready(page, 'chat')                                 main[data-screen="chat"][data-state="ready"]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR, fileUrl } from '../../support/paths.mjs'

const { _electron } = await import(fileUrl(join(DESKTOP_DIR, 'node_modules', 'playwright-core', 'index.mjs')))
const { appEnv, electronExe } = await import(fileUrl(join(DESKTOP_DIR, 'scripts', 'lib', 'paths.mjs')))
const { closeApp } = await import(fileUrl(join(DESKTOP_DIR, 'scripts', 'lib', 'close-app.mjs')))

export const W = 1280
export const H = 800

export async function launchApp({ appData, localData, env = {} }) {
  const app = await _electron.launch({
    executablePath: electronExe(),
    // Chromium stops drawing a window that other windows cover (native occlusion on Windows): a screenshot then waits for a
    // frame that never comes. These two switches keep it drawing whatever lies on top of it (the test window has no focus).
    args: ['--force-device-scale-factor=1', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', DESKTOP_DIR],
    env: appEnv({ appData, localData, extra: { STREAMS_WINDOW: 'hidden', STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN', STREAMS_DEV_UPDATE_URL: 'off', ...env } }),
    timeout: 60_000,
  })
  let page
  try {
    page = await app.firstWindow({ timeout: 60_000 })
  } catch (err) {
    await closeApp(app, { userDataDir: join(appData, 'electron') }).catch(() => {})
    throw err
  }
  const errors = []
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setContentSize(w, h)
    win.showInactive()
  }, [W, H])
  return {
    app,
    page,
    errors,
    log: () => { try { return readFileSync(join(appData, 'logs', 'main.log'), 'utf8') } catch { return '' } },
    close: () => closeApp(app, { userDataDir: join(appData, 'electron') }),
  }
}

export async function ready(page, screen) {
  await page.waitForFunction(id => Boolean(document.querySelector(`main[data-screen="${id}"][data-state="ready"]`)), screen, { timeout: 90_000, polling: 100 })
}
