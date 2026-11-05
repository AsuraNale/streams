// 主题 on the running app (docs/desktop.md §五「主题」): the world starts with settings.json theme night. The first frame is
// night — index.html as app:// serves it already has data-theme="night" on <html> (so the set applies before any script
// runs), the window was made with night's page colour, Electron's own parts are dark (nativeTheme). 设置「主题」: paper chosen
// → <html data-theme> and the colours on screen change at once, settings.json says paper, the native side is light, the
// served index.html says paper; the app closed and started again on the same settings.json → paper from the first frame.
// The bridge refuses an id it does not know and writes nothing. Controls: river's sidebar is river, not paper's.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { closeApp, launch, ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const env = world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'settings' })
const s = worldSession({ kind: 'empty', waitFor: 'settings', settings: { theme: 'night' }, env })
const settingsOf = () => JSON.parse(readFileSync(join(s.world.appData, 'settings.json'), 'utf8'))

/** What the window shows and what Electron holds, read from the running app. */
async function look() {
  const page = await s.page.evaluate(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    body: getComputedStyle(document.body).backgroundColor,
    sidebar: getComputedStyle(document.querySelector('.st-sidebar')).backgroundColor,
    text: getComputedStyle(document.body).color,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }))
  const native = await s.app.evaluate(async ({ BrowserWindow, nativeTheme, net }) => ({
    window: BrowserWindow.getAllWindows()[0].getBackgroundColor().toUpperCase(),
    source: nativeTheme.themeSource,
    dark: nativeTheme.shouldUseDarkColors,
    served: /<html[^>]*>/.exec(await (await net.fetch('app://ui/index.html')).text())?.[0] ?? null,
  }))
  return { ...page, ...native }
}

test('the first frame is the theme settings.json names: night in the served page, on <html>, the window, the native side', async () => {
  assert.equal(settingsOf().theme, 'night', 'control: the world starts with night')
  const l = await look()
  assert.equal(l.served, '<html lang="zh-CN" data-theme="night">', 'index.html as served has the attribute (before any script)')
  assert.equal(l.theme, 'night')
  assert.equal(l.body, 'rgb(15, 22, 27)', 'night --st-page')
  assert.equal(l.sidebar, 'rgb(22, 48, 60)', 'night --st-sidebar')
  assert.equal(l.text, 'rgb(227, 233, 237)', 'night --st-text')
  assert.equal(l.scheme, 'dark')
  assert.equal(l.window, '#0F161B', 'the window was made with night\'s page colour')
  assert.deepEqual([l.source, l.dark], ['dark', true])
  assert.equal((await s.page.evaluate(() => window.streams.getAppState())).data.theme, 'night')
  const select = await s.page.evaluate(() => { const el = document.querySelector('[data-part="theme"] select[data-field="theme"]'); return { value: el.value, options: [...el.options].map(o => [o.value, o.textContent]) } })
  assert.equal(select.value, 'night')
  assert.deepEqual(select.options, [['river', SETTINGS.themes.river], ['paper', SETTINGS.themes.paper], ['night', SETTINGS.themes.night]])
})

test('设置「主题」: paper chosen → <html> and the colours change at once; settings.json, the native side and the served page follow', async () => {
  await s.page.selectOption('[data-part="theme"] select[data-field="theme"]', 'paper')
  // no reload in between: the page itself changes <html data-theme>
  await s.page.waitForFunction(() => document.documentElement.dataset.theme === 'paper', null, POLL)
  await s.page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(242, 245, 247)', null, POLL)
  const l = await look()
  assert.equal(l.sidebar, 'rgb(233, 238, 242)', 'paper\'s light sidebar (sunk)')
  assert.equal(l.text, 'rgb(22, 34, 43)', 'ink')
  assert.equal(l.scheme, 'light')
  assert.equal(settingsOf().theme, 'paper', 'written into settings.json')
  assert.deepEqual([l.source, l.dark, l.window], ['light', false, '#F2F5F7'])
  assert.equal(l.served, '<html lang="zh-CN" data-theme="paper">')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="theme"] select[data-field="theme"]').value), 'paper')
})

test('the bridge refuses an id it does not know (bad_arguments) and writes nothing; river\'s sidebar is river (control)', async () => {
  const before = readFileSync(join(s.world.appData, 'settings.json'), 'utf8')
  for (const bad of ['blue', 'Night', '', null, 3]) {
    assert.deepEqual(await s.page.evaluate(v => window.streams.setTheme(v), bad), { ok: false, error: { code: 'bad_arguments' } }, String(bad))
  }
  assert.equal(readFileSync(join(s.world.appData, 'settings.json'), 'utf8'), before, 'nothing written')
  assert.equal(await s.page.evaluate(() => document.documentElement.dataset.theme), 'paper')
  assert.deepEqual((await s.page.evaluate(() => window.streams.setTheme('river'))).data, { theme: 'river' })
  await s.page.evaluate(() => { location.hash = 'settings'; location.reload() })
  await ready(s.page, 'settings')
  const l = await look()
  assert.deepEqual([l.theme, l.sidebar, l.body], ['river', 'rgb(31, 110, 140)', 'rgb(242, 245, 247)'], 'river: the river sidebar, not paper\'s')
  assert.equal((await s.page.evaluate(() => window.streams.setTheme('paper'))).ok, true)
})

test('started again on the same settings.json: paper from the first frame', async () => {
  const saved = settingsOf()
  assert.equal(saved.theme, 'paper')
  await closeApp(s.app, { userDataDir: join(s.world.appData, 'electron') })
  // the same settings the app wrote (the test's launch writes the file again: with every field as it was)
  const { schema, ...settings } = saved
  const started = await launch(s.world, { settings, env: env(s.world) })
  s.app = started.app
  s.page = started.page
  s.page.on('pageerror', err => s.errors.push(`pageerror: ${err.message}`))
  await s.page.waitForLoadState('domcontentloaded')
  assert.equal(await s.page.evaluate(() => document.documentElement.dataset.theme ?? null), 'paper', 'on <html> as the page loads')
  await ready(s.page, 'settings')
  const l = await look()
  assert.deepEqual([l.theme, l.sidebar, l.window, l.source], ['paper', 'rgb(233, 238, 242)', '#F2F5F7', 'light'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="theme"] select[data-field="theme"]').value), 'paper')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
