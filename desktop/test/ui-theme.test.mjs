// 主题 on the running app (docs/desktop.md §4.13). Rewritten for redesign R1 (维护者 11-11, 04 第 19–21 题; the R1 contract
// R1-2): K2's three token sets are gone — the look is the template's own sheets and <body> class, four themes, the default
// 研究对话. The world starts with a v1.0 settings.json: theme night (and the language set, as a user would have it).
//   - The first frame is research + dark (the contract's migration: night → 研究对话 · 深色): index.html as app:// serves it has
//     the theme's template sheets, its <body> class / data-theme / data-appearance, data-theme and data-appearance on <html>;
//     the window was made with that set's page colour; Electron's own parts are dark.
//   - The real window: every theme × appearance draws the page colour of src/shared/themes.mjs THEME_PAGE (the window's colour
//     before the first frame) — measured here, all eight, with the window's own background each time; the bundled font face
//     (the template's 'Yunzhi Noto', served through app://) loads where the theme uses it (精密国际主义).
//   - 设置 「外观与语言」: the four themes in the Chinese words, 研究对话 marked 默认; 外观 a select (跟随系统 · 浅色 · 深色);
//     澄明玻璃 chosen → the sheets and <body> change at once, settings.json says glass (dark kept), the served page and the
//     window follow — and so does the reading window, open beside it; 浅色 chosen → light everywhere, themeSource light.
//   - 跟随系统: themeSource system; Windows turning dark (nativeTheme says so with `updated`) turns the app dark while it runs,
//     the main window and the reading window both, and back; with 浅色 fixed the same signal changes nothing (the reverse).
//   - The bridge refuses an id or an appearance it does not know and writes nothing; started again → the same set from the
//     first frame (单线黑白 · 深色 this time).
// Windows' own setting is not touched: the test stands in for it by giving nativeTheme.shouldUseDarkColors a value and sending
// `updated` in the main process, the way Electron tells the app.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { SCHEMES, TEMPLATE_BASE, THEME_IDS, THEME_PAGE, THEME_TEMPLATE } from '../src/shared/themes.mjs'
import { closeApp, launch, ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'
import { seedReaderLibrary, startReaderSite } from './support/reader-site.mjs'

const POLL = { polling: 100, timeout: 60_000 }
let site = null
const env = world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'settings' })
const s = worldSession({
  kind: 'empty',
  waitFor: 'settings',
  settings: { theme: 'night', language: 'zh-CN' },
  prepare: async world => { site = await startReaderSite(); world.reader = await seedReaderLibrary(world.library, site); return () => site.close() },
  env,
})
const settingsOf = () => JSON.parse(readFileSync(join(s.world.appData, 'settings.json'), 'utf8'))
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const sheetsOf = id => THEME_TEMPLATE[id].sheets.map(p => `${TEMPLATE_BASE}${p}`)

/** What the window shows and what Electron holds, read from the running app; the reading window's too when it is open. */
async function look() {
  const page = await s.page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    appearance: document.documentElement.dataset.appearance ?? null,
    bodyClass: document.body.className,
    bodyTheme: document.body.dataset.theme ?? null,
    bodyAppearance: document.body.dataset.appearance ?? null,
    sheets: [...document.querySelectorAll('link[data-theme-sheet]')].map(l => l.getAttribute('href')),
    body: getComputedStyle(document.body).backgroundColor,
    sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
    scheme: getComputedStyle(document.body).colorScheme,
  }))
  const native = await s.app.evaluate(async ({ BrowserWindow, nativeTheme, net, session }) => {
    const reader = session.fromPartition('streams-reader')
    const wins = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed())
    const main = wins.find(w => w.webContents.session !== reader)
    const rd = wins.find(w => w.webContents.session === reader && w.contentView.children.length > 0)
    const served = await (await net.fetch('app://ui/index.html')).text()
    return {
      window: main.getBackgroundColor().toUpperCase(),
      source: nativeTheme.themeSource,
      served: /<html[^>]*>/.exec(served)?.[0] ?? null,
      servedBody: /<body[^>]*>/.exec(served)?.[0] ?? null,
      reader: rd ? {
        window: rd.getBackgroundColor().toUpperCase(),
        bar: await rd.webContents.executeJavaScript('[document.documentElement.dataset.theme, document.documentElement.dataset.appearance, getComputedStyle(document.body).backgroundColor].join(" ")').catch(() => null),
      } : null,
    }
  })
  return { ...page, ...native }
}

/** Windows' light / dark as Electron reports it, set by the test, then the signal Electron sends. null: Electron's own again. */
const windowsDark = dark => s.app.evaluate(({ nativeTheme }, d) => {
  if (d === null) delete nativeTheme.shouldUseDarkColors
  else Object.defineProperty(nativeTheme, 'shouldUseDarkColors', { configurable: true, get: () => d })
  nativeTheme.emit('updated')
  return nativeTheme.shouldUseDarkColors
}, dark)
const bodyFor = (id, scheme) => `<body class="${THEME_TEMPLATE[id].bodyClass}" data-theme="${THEME_TEMPLATE[id].dataTheme}" data-appearance="${scheme}" data-product="streams">`
const settled = ([t, a]) => s.page.waitForFunction(([tt, aa]) => document.documentElement.dataset.theme === tt && document.body.dataset.appearance === aa
  && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [t, a], POLL)

test('the first frame is v1.0\'s night migrated: research + dark in the served page (sheets, <body>, <html>), the window, the native side; the language kept', async () => {
  // a page that crashes or closes under the test is said so (s.errors), not only seen as a timeout later
  s.page.on('crash', () => s.errors.push('the page crashed'))
  s.page.on('close', () => { if (!s.restarting) s.errors.push('the page closed') })
  s.app.process().on('exit', (code, signal) => { if (!s.restarting) s.errors.push(`the app exited: ${code} ${signal}`) })
  const saved = settingsOf()
  assert.equal(saved.theme, 'night', 'control: the world starts with v1.0\'s theme')
  const l = await look()
  assert.equal(l.served, '<html lang="zh-CN" data-theme="research" data-appearance="dark">', 'index.html as served (before any script)')
  assert.equal(l.servedBody, bodyFor('research', 'dark'))
  assert.deepEqual([l.theme, l.appearance, l.bodyClass, l.bodyTheme, l.bodyAppearance, l.scheme], ['research', 'dark', THEME_TEMPLATE.research.bodyClass, 'research11', 'dark', 'dark'])
  assert.deepEqual(l.sheets, sheetsOf('research'), 'the template\'s sheets of 研究对话, in its order')
  assert.equal(l.body, rgb(THEME_PAGE.research.dark), 'research dark: the template\'s page colour')
  assert.equal(l.window, THEME_PAGE.research.dark, 'the window was made with that set\'s page colour')
  assert.equal(l.source, 'dark')
  assert.notEqual(l.sidebar, l.body, 'the template drew its sidebar: a colour of its own (control: the sheets are applied)')
  const state = (await s.page.evaluate(() => window.streams.getAppState())).data
  assert.deepEqual([state.theme, state.appearance, state.scheme, state.defaultTheme], ['research', 'dark', 'dark', 'research'])
  assert.equal(state.language.setting, 'zh-CN', 'the other settings as they were')
})

test('设置 「外观与语言」: four themes in the Chinese words, 研究对话 默认 and chosen; 外观 a select of 跟随系统 · 浅色 · 深色 on 深色', async () => {
  const ui = await s.page.evaluate(() => ({
    chips: [...document.querySelectorAll('[data-part="theme"] [data-theme-card]')].map(c => [c.dataset.themeCard, c.querySelector('.settings__theme-name').textContent, c.dataset.checked, c.querySelector('[data-default]') !== null, c.classList.contains('filter')]),
    options: [...document.querySelectorAll('[data-part="appearance"] select[data-field="appearance"] option')].map(o => [o.value, o.textContent]),
    value: document.querySelector('[data-part="appearance"] select[data-field="appearance"]').value,
  }))
  assert.deepEqual(ui.chips.map(c => c[0]), ['precision', 'glass', 'research', 'monoline'])
  assert.deepEqual(ui.chips.map(c => c[1]), ['精密国际主义', '澄明玻璃', '研究对话', '单线黑白'], 'the names (literal: 维护者 11-11)')
  assert.deepEqual(ui.chips.map(c => c[1]), THEME_IDS.map(id => SETTINGS.themes[id]))
  assert.deepEqual(ui.chips.map(c => [c[2], c[3]]), [['false', false], ['false', false], ['true', true], ['false', false]])
  assert.ok(ui.chips.every(c => c[4]), 'the template\'s choice chips')
  assert.deepEqual(ui.options, [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']])
  assert.equal(ui.value, 'dark')
})

test('澄明玻璃 chosen → the sheets and <body> change at once; settings.json, the served page, the window and the open reading window follow', async () => {
  await s.page.evaluate(u => window.streams.openReader(u, 'reader'), s.world.reader?.urls?.article ?? site.urls.article)
  const end = Date.now() + 60_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('research dark')) await sleep(200)
  assert.equal((await look()).reader.bar, `research dark ${rgb(THEME_PAGE.research.dark)}`, 'the reading window opens in the set in force')
  await s.page.click('[data-part="theme"] [data-theme-card="glass"]')
  await settled(['glass', 'dark'])
  await s.page.waitForFunction(c => getComputedStyle(document.body).backgroundColor === c, rgb(THEME_PAGE.glass.dark), POLL)
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass dark')) await sleep(200)
  const l = await look()
  assert.deepEqual([l.theme, l.appearance, l.bodyClass, l.window, l.source], ['glass', 'dark', THEME_TEMPLATE.glass.bodyClass, THEME_PAGE.glass.dark, 'dark'])
  assert.deepEqual(l.sheets, sheetsOf('glass'), 'research\'s sheets swapped for glass\'s, in its order, none left over')
  assert.equal(l.served, '<html lang="zh-CN" data-theme="glass" data-appearance="dark">')
  assert.equal(l.servedBody, bodyFor('glass', 'dark'))
  assert.deepEqual([settingsOf().theme, settingsOf().appearance], ['glass', 'dark'], 'written into settings.json')
  assert.deepEqual(l.reader, { window: THEME_PAGE.glass.dark, bar: `glass dark ${rgb(THEME_PAGE.glass.dark)}` }, 'the reading window with it')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-theme-card="glass"]').dataset.checked), 'true')
})

test('浅色 chosen → light everywhere; nativeTheme.themeSource light', async () => {
  await s.page.selectOption('[data-part="appearance"] select[data-field="appearance"]', 'light')
  await settled(['glass', 'light'])
  const end = Date.now() + 30_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass light')) await sleep(200)
  const l = await look()
  assert.deepEqual([l.theme, l.appearance, l.bodyAppearance, l.scheme, l.body, l.window, l.source], ['glass', 'light', 'light', 'light', rgb(THEME_PAGE.glass.light), THEME_PAGE.glass.light, 'light'])
  assert.equal(settingsOf().appearance, 'light')
  assert.equal(l.reader.window, THEME_PAGE.glass.light)
  // the reverse of the next test: with 浅色 fixed, Windows turning dark changes nothing
  await windowsDark(true)
  await sleep(800)
  const after = await look()
  assert.deepEqual([after.appearance, after.body, after.window, after.reader.window], ['light', rgb(THEME_PAGE.glass.light), THEME_PAGE.glass.light, THEME_PAGE.glass.light])
  await windowsDark(null)
})

test('跟随系统: the app follows Windows while it runs — dark, then light again — the main window and the reading window both', async () => {
  await windowsDark(false)
  await s.page.selectOption('[data-part="appearance"] select[data-field="appearance"]', 'system')
  await s.page.waitForFunction(() => document.querySelector('[data-part="appearance"] select')?.value === 'system', null, POLL)
  for (let i = 0; i < 50 && settingsOf().appearance !== 'system'; i++) await sleep(100)
  assert.equal(settingsOf().appearance, 'system')
  assert.equal((await look()).source, 'system', 'Electron follows Windows')
  await windowsDark(false)
  await s.page.waitForFunction(() => document.body.dataset.appearance === 'light', null, POLL)
  // Windows turns dark: nothing clicked in the app
  await windowsDark(true)
  await s.page.waitForFunction(() => document.body.dataset.appearance === 'dark' && document.documentElement.dataset.appearance === 'dark', null, POLL)
  let end = Date.now() + 30_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass dark')) await sleep(200)
  let l = await look()
  assert.deepEqual([l.appearance, l.body, l.window], ['dark', rgb(THEME_PAGE.glass.dark), THEME_PAGE.glass.dark])
  assert.deepEqual(l.reader, { window: THEME_PAGE.glass.dark, bar: `glass dark ${rgb(THEME_PAGE.glass.dark)}` })
  assert.equal(l.served, '<html lang="zh-CN" data-theme="glass" data-appearance="dark">', 'a reload would come back dark too')
  assert.equal(settingsOf().appearance, 'system', 'the setting stays 跟随系统')
  // and light again
  await windowsDark(false)
  await s.page.waitForFunction(() => document.body.dataset.appearance === 'light', null, POLL)
  end = Date.now() + 30_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass light')) await sleep(200)
  l = await look()
  assert.deepEqual([l.appearance, l.window, l.reader.window], ['light', THEME_PAGE.glass.light, THEME_PAGE.glass.light])
  await windowsDark(null)
  await s.app.evaluate(({ BrowserWindow, session }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.session === session.fromPartition('streams-reader')) w.close() })
})

test('every theme × appearance in the real window: the page colour is THEME_PAGE\'s and the window\'s background too (eight); the bundled face loads where it is used', async () => {
  const report = {}
  for (const theme of THEME_IDS) {
    for (const scheme of SCHEMES) {
      assert.equal((await s.page.evaluate(t => window.streams.setTheme(t), theme)).ok, true)
      assert.equal((await s.page.evaluate(a => window.streams.setAppearance(a), scheme)).ok, true)
      await settled([theme, scheme])
      const l = await look()
      report[`${theme}/${scheme}`] = l.body
      assert.equal(l.body, rgb(THEME_PAGE[theme][scheme]), `${theme}/${scheme}: the page`)
      assert.equal(l.window, THEME_PAGE[theme][scheme], `${theme}/${scheme}: the window`)
      assert.deepEqual(l.sheets, sheetsOf(theme), `${theme}/${scheme}: its sheets`)
      if (theme === 'precision' && scheme === 'light') {
        await s.page.evaluate(() => document.fonts.ready)
        const faces = await s.page.evaluate(() => [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Yunzhi Noto').map(f => f.status))
        assert.ok(faces.includes('loaded'), `精密国际主义 uses the bundled Noto Sans SC: ${JSON.stringify(faces)}`)
      }
    }
  }
  process.stdout.write(`# page colours in the real window ${JSON.stringify(report)}\n`)
  assert.equal(new Set(Object.values(report)).size, 8, 'eight different page colours')
})

test('the bridge refuses an id or an appearance it does not know (bad_arguments) and writes nothing', async () => {
  const before = readFileSync(join(s.world.appData, 'settings.json'), 'utf8')
  for (const bad of ['river', 'night', 'Glass', 'line12', '', null, 3]) {
    assert.deepEqual(await s.page.evaluate(v => window.streams.setTheme(v), bad), { ok: false, error: { code: 'bad_arguments' } }, String(bad))
  }
  for (const bad of ['Dark', 'auto', '', null]) {
    assert.deepEqual(await s.page.evaluate(v => window.streams.setAppearance(v), bad), { ok: false, error: { code: 'bad_arguments' } }, String(bad))
  }
  assert.equal(readFileSync(join(s.world.appData, 'settings.json'), 'utf8'), before, 'nothing written')
  assert.equal((await s.page.evaluate(() => window.streams.setTheme('monoline'))).data.theme, 'monoline')
  assert.equal((await s.page.evaluate(() => window.streams.setAppearance('dark'))).data.scheme, 'dark')
})

test('started again on the same settings.json: 单线黑白 + dark from the first frame', async () => {
  const saved = settingsOf()
  assert.deepEqual([saved.theme, saved.appearance], ['monoline', 'dark'])
  s.restarting = true
  await closeApp(s.app, { userDataDir: join(s.world.appData, 'electron') })
  const { schema, ...settings } = saved
  const started = await launch(s.world, { settings, env: env(s.world) })
  s.app = started.app
  s.page = started.page
  s.page.on('pageerror', err => s.errors.push(`pageerror: ${err.message}`))
  await s.page.waitForLoadState('domcontentloaded')
  assert.deepEqual(await s.page.evaluate(() => [document.documentElement.dataset.theme ?? null, document.body.dataset.theme ?? null, document.body.dataset.appearance ?? null]), ['monoline', 'line12', 'dark'], 'on <html> and <body> as the page loads')
  await ready(s.page, 'settings')
  const l = await look()
  assert.deepEqual([l.theme, l.body, l.window, l.source], ['monoline', rgb(THEME_PAGE.monoline.dark), THEME_PAGE.monoline.dark, 'dark'])
  assert.deepEqual(l.sheets, sheetsOf('monoline'))
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
