// The English interface on the running app (docs/desktop.md §十六). Session A starts with `language: 'en'` in settings.json:
// the sidebar's nine entries, the window title, <html lang> and the settings page come from the English tables; switching
// to Chinese on the settings page reloads the page there in Chinese and writes the setting; switching to 跟随系统 on a
// Chinese system (the tests pin it) changes nothing and does not reload. Session B: no setting, the system's languages
// English and French → English, `auto` resolved to `en`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SIDEBAR as SIDEBAR_EN } from '../src/renderer/texts-en/common.js'
import { SCREENS as SCREENS_EN } from '../src/renderer/texts-en/screens.js'
import { SETTINGS as SETTINGS_EN } from '../src/renderer/texts-en/settings.js'
import { SIDEBAR } from '../src/renderer/texts/common.js'
import { SCREENS } from '../src/renderer/texts/screens.js'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'
import { appSession, closeApp, launch, ready } from './support/app.mjs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const CJK = /[㐀-鿿]/
const s = appSession({ settings: { language: 'en' } })
const settings = () => JSON.parse(readFileSync(join(s.run.appData, 'settings.json'), 'utf8'))
const until = (fn, arg) => s.page.waitForFunction(fn, arg, { polling: 100, timeout: 60_000 })
const navWords = page => page.evaluate(() => [...document.querySelectorAll('[data-nav]')].map(a => a.textContent.trim()))

test('the first screen and the sidebar in English; <html lang> and the window title follow the words; the app state says so', async () => {
  assert.equal(await s.page.evaluate(() => document.querySelector('main h1').textContent), SCREENS_EN.titles.today)
  assert.notEqual(SCREENS_EN.titles.today, SCREENS.titles.today, 'control: the two titles differ')
  assert.deepEqual(await navWords(s.page), Object.values(SIDEBAR_EN.entries))
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__footer-button').textContent), SIDEBAR_EN.settings)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__library-name').textContent), SIDEBAR_EN.noLibrary)
  assert.equal(await s.page.evaluate(() => [document.documentElement.lang, document.title].join()), 'en,Streams')
  assert.equal(await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), 'Streams')
  const state = await s.page.evaluate(() => window.streams.getAppState())
  assert.deepEqual(state.data.language, { setting: 'en', resolved: 'en' })
  const text = await s.page.evaluate(() => document.body.innerText)
  assert.equal(CJK.test(text), false, `no Chinese on the page in English: ${text}`)
})

test('the settings page: the language row shows English chosen and what the system would give; Chinese chosen reloads the page in Chinese there and writes the setting', async () => {
  await s.page.click('.st-sidebar__footer-button')
  await ready(s.page, 'settings')
  assert.equal(await s.page.evaluate(() => document.querySelector('main h1').textContent), SETTINGS_EN.title)
  const checked = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="language"] input')].map(i => [i.id, i.checked]))
  assert.deepEqual(await checked(), [['settings-language-auto', false], ['settings-language-zh-CN', false], ['settings-language-en', true]])
  const autoLabel = await s.page.evaluate(() => document.querySelector('label[for="settings-language-auto"]').textContent)
  assert.ok(autoLabel.includes(SETTINGS_EN.languages.auto) && autoLabel.includes('(now: English)'), autoLabel)
  assert.equal(await s.page.evaluate(() => document.querySelector('label[for="settings-language-zh-CN"] b').textContent), String.fromCodePoint(0x4E2D, 0x6587))
  // to Chinese: the page loads itself again, in Chinese, on the settings screen
  await s.page.click('label[for="settings-language-zh-CN"]')
  await until(want => document.querySelector('main[data-screen="settings"][data-state="ready"] h1')?.textContent === want, SETTINGS.title)
  assert.equal(settings().language, 'zh-CN')
  assert.equal(await s.page.evaluate(() => [document.documentElement.lang, document.title].join()), 'zh-CN,流息')
  assert.deepEqual(await checked(), [['settings-language-auto', false], ['settings-language-zh-CN', true], ['settings-language-en', false]])
  assert.deepEqual(await navWords(s.page), Object.values(SIDEBAR.entries))
  const state = await s.page.evaluate(() => window.streams.getAppState())
  assert.deepEqual(state.data.language, { setting: 'zh-CN', resolved: 'zh-CN' })
})

test('跟随系统 on a Chinese system (the tests pin it) changes nothing: the setting is written, the page is not reloaded', async () => {
  await s.page.evaluate(() => { window.__notReloaded = 'still here' })
  await s.page.click('label[for="settings-language-auto"]')
  await until(() => document.querySelector('#settings-language-auto')?.checked === true)
  await sleep(500)
  assert.equal(settings().language, 'auto')
  assert.equal(await s.page.evaluate(() => window.__notReloaded), 'still here', 'the page did not load itself again')
  assert.equal(await s.page.evaluate(() => document.documentElement.lang), 'zh-CN')
  const autoLabel = await s.page.evaluate(() => document.querySelector('label[for="settings-language-auto"]').textContent)
  assert.ok(autoLabel.includes(SETTINGS.languages.auto) && autoLabel.includes(SETTINGS.languages['zh-CN']), autoLabel)
  // back to English from Chinese: the same reload, the other way (the page comes back to settings in English)
  await s.page.click('label[for="settings-language-en"]')
  await until(want => document.querySelector('main[data-screen="settings"][data-state="ready"] h1')?.textContent === want, SETTINGS_EN.title)
  assert.equal(settings().language, 'en')
  await s.page.click('[data-nav="today"]')
  await ready(s.page, 'today')
  assert.equal(await s.page.evaluate(() => document.querySelector('main h1').textContent), SCREENS_EN.titles.today)
})

test('no setting and a system without Chinese: English, auto resolved to en (session B)', async t => {
  const root = tempDir('st-desktop-lang-b-')
  const run = await makeWorld({ root })
  let app = null
  t.after(async () => {
    if (app) await closeApp(app, { userDataDir: join(run.appData, 'electron') })
    await sleep(300)
    removeTree(root, { waitMs: 20_000 })
  })
  const started = await launch(run, { env: { STREAMS_DEV_SYSTEM_LANGUAGES: 'en-US,fr' } })
  app = started.app
  const page = started.page
  await ready(page, 'today')
  assert.equal(await page.evaluate(() => document.querySelector('main h1').textContent), SCREENS_EN.titles.today)
  const state = await page.evaluate(() => window.streams.getAppState())
  assert.deepEqual(state.data.language, { setting: 'auto', resolved: 'en' })
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en')
  // control: the same world with the system pinned to Chinese (what every other test does) is Chinese
  await closeApp(app, { userDataDir: join(run.appData, 'electron') })
  app = null
  const zh = await launch(run, {})
  app = zh.app
  await ready(zh.page, 'today')
  assert.equal(await zh.page.evaluate(() => document.querySelector('main h1').textContent), SCREENS.titles.today)
  assert.deepEqual((await zh.page.evaluate(() => window.streams.getAppState())).data.language, { setting: 'auto', resolved: 'zh-CN' })
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
