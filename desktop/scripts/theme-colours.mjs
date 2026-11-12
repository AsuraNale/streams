#!/usr/bin/env node
// Redesign R1: the page colour of every theme × appearance, read off the real window (docs/desktop.md §五「主题」). The app
// is started once on an empty world (STREAMS_WINDOW hidden); for each of the four themes and light / dark the bridge's
// setTheme / setAppearance changes the look (lib/theme.js swaps the template's sheets) and the body's computed background is
// read. Prints the table src/shared/themes.mjs THEME_PAGE must hold (the window's colour before the first frame), and the
// rows that differ from it; exit 1 when one does. test/ui-theme.test.mjs makes the same comparison.
//   node scripts/theme-colours.mjs
import { join } from 'node:path'
import { closeApp } from './lib/close-app.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'
import { makeWorld } from './lib/world.mjs'
import { launch } from '../test/support/app.mjs'
import { SCHEMES, THEME_IDS, THEME_PAGE } from '../src/shared/themes.mjs'

const hex = rgb => `#${rgb.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`

/** Every set's page colour in a running app (`page`: Playwright's page of the main window). */
export async function measurePageColours(page) {
  const out = {}
  for (const theme of THEME_IDS) {
    out[theme] = {}
    for (const scheme of SCHEMES) {
      const r1 = await page.evaluate(t => window.streams.setTheme(t), theme)
      const r2 = await page.evaluate(a => window.streams.setAppearance(a), scheme)
      if (!r1.ok || !r2.ok) throw new Error(`setTheme / setAppearance refused: ${JSON.stringify([r1, r2])}`)
      await page.waitForFunction(([t, s]) => document.documentElement.dataset.theme === t && document.body.dataset.appearance === s
        && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, scheme], { polling: 100, timeout: 30_000 })
      out[theme][scheme] = hex(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    }
  }
  return out
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const root = tempDir('st-theme-colours-')
  let app = null
  let world = null
  try {
    world = await makeWorld({ root })
    const started = await launch(world, { env: { STREAMS_DEV_LIBRARY: '', STREAMS_START_SCREEN: 'settings' } })
    app = started.app
    await started.page.waitForLoadState('domcontentloaded')
    await started.page.waitForFunction(() => typeof window.streams?.setTheme === 'function', null, { timeout: 60_000 })
    const got = await measurePageColours(started.page)
    console.log(JSON.stringify(got, null, 2))
    const differ = THEME_IDS.flatMap(t => SCHEMES.filter(s => THEME_PAGE[t][s] !== got[t][s]).map(s => `${t}/${s}: table ${THEME_PAGE[t][s]}, window ${got[t][s]}`))
    for (const d of differ) console.log(`DIFFERS ${d}`)
    process.exitCode = differ.length ? 1 : 0
  } finally {
    if (app) await closeApp(app, { userDataDir: world ? join(world.appData, 'electron') : undefined }).catch(() => {})
    removeTree(root, { waitMs: 10_000 })
  }
}
