// 主题 on the running app (docs/desktop.md §五「主题」). v2 package K2 (维护者 11-10): the three themes of the K1 draft and the
// appearance replace v1.0's river / paper / night — this file was rewritten for them (the old one walked night → paper).
// The world starts with a v1.0 settings.json: theme night (and the language set, as a user would have it).
//   - The first frame is precision + dark (维护者's migration: night → 精密国际主义 · 深色): index.html as app:// serves it has
//     data-theme and data-appearance on <html>, the window was made with that set's page colour, Electron's own parts are dark;
//     the bundled Noto Sans SC is loaded in the real window (document.fonts.check, the face's status) and is the body's font.
//   - 设置: the three theme cards (zh names) and the three appearance segments; 澄明玻璃 chosen → <html> and the colours
//     change at once, settings.json says glass (dark kept), the served page and the window follow — and so does the reading
//     window, open beside it; 浅色 chosen → light everywhere, nativeTheme.themeSource light.
//   - 跟随系统: themeSource system; Windows turning dark (nativeTheme says so with `updated`) turns the app dark while it runs,
//     the main window and the reading window both, and back; with 浅色 fixed the same signal changes nothing (the reverse).
//   - The bridge refuses an id or an appearance it does not know and writes nothing; started again → the same set from the
//     first frame.
// Windows' own setting is not touched: the test stands in for it by giving nativeTheme.shouldUseDarkColors a value and sending
// `updated` in the main process, the way Electron tells the app.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { THEME_PAGE } from '../src/shared/themes.mjs'
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

/** What the window shows and what Electron holds, read from the running app; the reading window's too when it is open. */
async function look() {
  const page = await s.page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    appearance: document.documentElement.dataset.appearance ?? null,
    body: getComputedStyle(document.body).backgroundColor,
    sidebar: getComputedStyle(document.querySelector('.st-sidebar')).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }))
  const native = await s.app.evaluate(async ({ BrowserWindow, nativeTheme, net, session }) => {
    const reader = session.fromPartition('streams-reader')
    const wins = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed())
    const main = wins.find(w => w.webContents.session !== reader)
    const rd = wins.find(w => w.webContents.session === reader && w.contentView.children.length > 0)
    return {
      window: main.getBackgroundColor().toUpperCase(),
      source: nativeTheme.themeSource,
      served: /<html[^>]*>/.exec(await (await net.fetch('app://ui/index.html')).text())?.[0] ?? null,
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

test('the first frame is v1.0\'s night migrated: precision + dark in the served page, on <html>, the window, the native side; the language kept', async () => {
  // a page that crashes or closes under the test is said so (s.errors), not only seen as a timeout later
  // (the last test closes the app on purpose: not counted from then on)
  s.page.on('crash', () => s.errors.push('the page crashed'))
  s.page.on('close', () => { if (!s.restarting) s.errors.push('the page closed') })
  s.app.process().on('exit', (code, signal) => { if (!s.restarting) s.errors.push(`the app exited: ${code} ${signal}`) })
  const saved = settingsOf()
  assert.equal(saved.theme, 'night', 'control: the world starts with v1.0\'s theme')
  const l = await look()
  assert.equal(l.served, '<html lang="zh-CN" data-theme="precision" data-appearance="dark">', 'index.html as served has both attributes (before any script)')
  assert.deepEqual([l.theme, l.appearance, l.scheme], ['precision', 'dark', 'dark'])
  assert.equal(l.body, rgb(THEME_PAGE.precision.dark), 'precision dark --st-page')
  assert.equal(l.window, THEME_PAGE.precision.dark, 'the window was made with that set\'s page colour')
  assert.equal(l.source, 'dark')
  const state = (await s.page.evaluate(() => window.streams.getAppState())).data
  assert.deepEqual([state.theme, state.appearance, state.scheme, state.defaultTheme], ['precision', 'dark', 'dark', 'precision'])
  assert.equal(state.language.setting, 'zh-CN', 'the other settings as they were')
})

test('the bundled Noto Sans SC is loaded in the real window and is the page\'s font', async () => {
  await s.page.evaluate(() => document.fonts.ready)
  const f = await s.page.evaluate(() => ({
    check: document.fonts.check('14px "Streams Noto Sans SC"'),
    faces: [...document.fonts].map(x => [x.family.replace(/"/g, ''), x.status]),
    body: getComputedStyle(document.body).fontFamily,
    // a control: a family the page never declared is not reported as loaded by the same check
    other: [...document.fonts].some(x => x.family.replace(/"/g, '') === 'No Such Family'),
  }))
  assert.equal(f.check, true)
  assert.ok(f.faces.some(([family, status]) => family === 'Streams Noto Sans SC' && status === 'loaded'), JSON.stringify(f.faces))
  assert.match(f.body, /^"?Streams Numerals"?, "?Streams Noto Sans SC"?, sans-serif$/)
  assert.equal(f.other, false)
})

test('设置: three theme cards and three appearance segments in the Chinese words; the current ones marked', async () => {
  const ui = await s.page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-part="theme"] [data-theme-card]')].map(c => [c.dataset.themeCard, c.querySelector('.settings__theme-name b').textContent, c.dataset.checked, c.querySelector('[data-default]') !== null]),
    previews: [...document.querySelectorAll('[data-part="theme"] .settings__theme-preview')].map(p => [p.dataset.theme, p.dataset.appearance, getComputedStyle(p).backgroundColor]),
    segs: [...document.querySelectorAll('[data-part="appearance"] [data-appearance-choice]')].map(c => [c.dataset.appearanceChoice, c.textContent.trim(), c.dataset.checked]),
  }))
  assert.deepEqual(ui.cards, [['precision', SETTINGS.themes.precision, 'true', true], ['glass', SETTINGS.themes.glass, 'false', false], ['research', SETTINGS.themes.research, 'false', false]])
  assert.deepEqual(ui.cards.map(c => c[1]), ['精密国际主义', '澄明玻璃', '研究对话'])
  // each card draws itself in its own set (the appearance in force): three different page colours
  assert.deepEqual(ui.previews, ['precision', 'glass', 'research'].map(t => [t, 'dark', rgb(THEME_PAGE[t].dark)]))
  assert.deepEqual(ui.segs, [['light', '浅色', 'false'], ['dark', '深色', 'true'], ['system', '跟随系统', 'false']])
})

test('澄明玻璃 chosen → <html> and the colours change at once; settings.json, the served page, the window and the open reading window follow', async () => {
  await s.page.evaluate(u => window.streams.openReader(u, 'reader'), s.world.reader?.urls?.article ?? site.urls.article)
  const end = Date.now() + 60_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('precision dark')) await sleep(200)
  assert.equal((await look()).reader.bar, `precision dark ${rgb(THEME_PAGE.precision.dark)}`, 'the reading window opens in the set in force')
  await s.page.click('[data-part="theme"] [data-theme-card="glass"]')
  await s.page.waitForFunction(() => document.documentElement.dataset.theme === 'glass', null, POLL)
  await s.page.waitForFunction(c => getComputedStyle(document.body).backgroundColor === c, rgb(THEME_PAGE.glass.dark), POLL)
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass dark')) await sleep(200)
  const l = await look()
  assert.deepEqual([l.theme, l.appearance, l.window, l.source], ['glass', 'dark', THEME_PAGE.glass.dark, 'dark'])
  assert.equal(l.served, '<html lang="zh-CN" data-theme="glass" data-appearance="dark">')
  assert.deepEqual([settingsOf().theme, settingsOf().appearance], ['glass', 'dark'], 'written into settings.json')
  assert.deepEqual(l.reader, { window: THEME_PAGE.glass.dark, bar: `glass dark ${rgb(THEME_PAGE.glass.dark)}` }, 'the reading window with it')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-theme-card="glass"]').dataset.checked), 'true')
})

test('浅色 chosen → light everywhere; nativeTheme.themeSource light', async () => {
  await s.page.click('[data-part="appearance"] [data-appearance-choice="light"]')
  await s.page.waitForFunction(() => document.documentElement.dataset.appearance === 'light', null, POLL)
  const end = Date.now() + 30_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass light')) await sleep(200)
  const l = await look()
  assert.deepEqual([l.theme, l.appearance, l.scheme, l.body, l.window, l.source], ['glass', 'light', 'light', rgb(THEME_PAGE.glass.light), THEME_PAGE.glass.light, 'light'])
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
  await s.page.click('[data-part="appearance"] [data-appearance-choice="system"]')
  await s.page.waitForFunction(() => document.querySelector('[data-appearance-choice="system"]')?.dataset.checked === 'true', null, POLL)
  assert.equal(settingsOf().appearance, 'system')
  assert.equal((await look()).source, 'system', 'Electron follows Windows')
  await windowsDark(false)
  await s.page.waitForFunction(() => document.documentElement.dataset.appearance === 'light', null, POLL)
  // Windows turns dark: nothing clicked in the app
  await windowsDark(true)
  await s.page.waitForFunction(() => document.documentElement.dataset.appearance === 'dark', null, POLL)
  let end = Date.now() + 30_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass dark')) await sleep(200)
  let l = await look()
  assert.deepEqual([l.appearance, l.body, l.window], ['dark', rgb(THEME_PAGE.glass.dark), THEME_PAGE.glass.dark])
  assert.deepEqual(l.reader, { window: THEME_PAGE.glass.dark, bar: `glass dark ${rgb(THEME_PAGE.glass.dark)}` })
  assert.equal(l.served, '<html lang="zh-CN" data-theme="glass" data-appearance="dark">', 'a reload would come back dark too')
  assert.equal(settingsOf().appearance, 'system', 'the setting stays 跟随系统')
  // and light again
  await windowsDark(false)
  await s.page.waitForFunction(() => document.documentElement.dataset.appearance === 'light', null, POLL)
  end = Date.now() + 30_000
  while (Date.now() < end && !(await look()).reader?.bar?.startsWith('glass light')) await sleep(200)
  l = await look()
  assert.deepEqual([l.appearance, l.window, l.reader.window], ['light', THEME_PAGE.glass.light, THEME_PAGE.glass.light])
  await windowsDark(null)
  await s.app.evaluate(({ BrowserWindow, session }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.session === session.fromPartition('streams-reader')) w.close() })
})

test('the bridge refuses an id or an appearance it does not know (bad_arguments) and writes nothing', async () => {
  const before = readFileSync(join(s.world.appData, 'settings.json'), 'utf8')
  for (const bad of ['river', 'night', 'Glass', '', null, 3]) {
    assert.deepEqual(await s.page.evaluate(v => window.streams.setTheme(v), bad), { ok: false, error: { code: 'bad_arguments' } }, String(bad))
  }
  for (const bad of ['Dark', 'auto', '', null]) {
    assert.deepEqual(await s.page.evaluate(v => window.streams.setAppearance(v), bad), { ok: false, error: { code: 'bad_arguments' } }, String(bad))
  }
  assert.equal(readFileSync(join(s.world.appData, 'settings.json'), 'utf8'), before, 'nothing written')
  const r = await s.page.evaluate(() => window.streams.setTheme('research'))
  assert.equal(r.data.theme, 'research')
  assert.equal((await s.page.evaluate(() => window.streams.setAppearance('dark'))).data.scheme, 'dark')
})

test('started again on the same settings.json: research + dark from the first frame', async () => {
  const saved = settingsOf()
  assert.deepEqual([saved.theme, saved.appearance], ['research', 'dark'])
  s.restarting = true
  await closeApp(s.app, { userDataDir: join(s.world.appData, 'electron') })
  const { schema, ...settings } = saved
  const started = await launch(s.world, { settings, env: env(s.world) })
  s.app = started.app
  s.page = started.page
  s.page.on('pageerror', err => s.errors.push(`pageerror: ${err.message}`))
  await s.page.waitForLoadState('domcontentloaded')
  assert.deepEqual(await s.page.evaluate(() => [document.documentElement.dataset.theme ?? null, document.documentElement.dataset.appearance ?? null]), ['research', 'dark'], 'on <html> as the page loads')
  await ready(s.page, 'settings')
  const l = await look()
  assert.deepEqual([l.theme, l.body, l.window, l.source], ['research', rgb(THEME_PAGE.research.dark), THEME_PAGE.research.dark, 'dark'])
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
