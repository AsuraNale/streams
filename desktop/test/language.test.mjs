// The English interface on the running app (docs/desktop.md��). Session A starts with `language: 'en'` in settings.json:
// the sidebar's entries (v2 package F: plan B's 库架 and 和主 Agent 聊, the library's line, the five tabs of its page; v1.0
// checked the nine entries and 今日's title — the same checks, on the words that took their place), the window title, <html lang> and the settings page come from the English tables; switching
// to Chinese on the settings page reloads the page there in Chinese and writes the setting; switching to 跟随系统 on a
// Chinese system (the tests pin it) changes nothing and does not reload. Session B: no setting, the system's languages
// English and French → English, `auto` resolved to `en`.
// redesign R1 (维护者 11-11 第 1 题, 05-措辞规范): a library's page has four tabs (概览 gone, a library opens on 待看) and the
// sidebar's second entry is 「主 Agent」 / 「Main agent」 — the expected words and tabs here changed with them; an entry's words are
// read from its .st-sidebar__nav-text (库架's entry ends with the number of libraries now).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SIDEBAR as SIDEBAR_EN } from '../src/renderer/texts-en/common.js'
import { SETTINGS as SETTINGS_EN } from '../src/renderer/texts-en/settings.js'
import { SIDEBAR } from '../src/renderer/texts/common.js'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { SHELL } from '../src/renderer/texts/shell.js'
import { SHELL as SHELL_EN } from '../src/renderer/texts-en/shell.js'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'
import { appSession, closeApp, launch, ready } from './support/app.mjs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const CJK = /[㐀-鿿]/
const s = appSession({ settings: { language: 'en' } })
const settings = () => JSON.parse(readFileSync(join(s.run.appData, 'settings.json'), 'utf8'))
const until = (fn, arg) => s.page.waitForFunction(fn, arg, { polling: 100, timeout: 60_000 })
const navWords = page => page.evaluate(() => [...document.querySelectorAll('[data-nav]')].map(a => a.querySelector('.st-sidebar__nav-text').textContent.trim()))
// redesign R1: the first screen is the current library's 待看: its tab (the page's h1 is the library's name)
const currentTab = page => page.evaluate(() => document.querySelector('.st-lib-tabs [aria-current]')?.textContent.trim() ?? null)
const tabWords = page => page.evaluate(() => [...document.querySelectorAll('.st-lib-tabs [data-tab]')].map(b => b.textContent.trim()))

test('the first screen and the sidebar in English; <html lang> and the window title follow the words; the app state says so', async () => {
  assert.equal(await currentTab(s.page), SHELL_EN.tabs.inbox)
  assert.notEqual(SHELL_EN.tabs.inbox, SHELL.tabs.inbox, 'control: the two words differ')
  assert.deepEqual(await tabWords(s.page), ['inbox', 'library', 'ask', 'sources'].map(k => SHELL_EN.tabs[k]))
  assert.deepEqual(await navWords(s.page), Object.values(SIDEBAR_EN.entries))
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__footer-button').textContent), SIDEBAR_EN.settings)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__group').textContent), SHELL_EN.sidebar.mine)
  // a test world opens its empty library (test/support/app.mjs): its line in 我的库 is the folder's name, not an English word
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-library-row] .st-sidebar__lib-name').textContent), 'library')
  assert.equal(await s.page.evaluate(() => document.querySelector('main h1, #lib-head-name').textContent), 'library')
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
  await s.page.click('[data-library-row]')
  // (the page was loaded again for the language: nothing remembered, so the library opens on its 待看; then its 问库 tab)
  await ready(s.page, 'inbox')
  await s.page.click('.st-lib-tabs [data-tab="ask"]')
  await ready(s.page, 'ask')
  assert.equal(await currentTab(s.page), SHELL_EN.tabs.ask)
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
  await ready(page, 'inbox')
  assert.equal(await currentTab(page), SHELL_EN.tabs.inbox)
  const state = await page.evaluate(() => window.streams.getAppState())
  assert.deepEqual(state.data.language, { setting: 'auto', resolved: 'en' })
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en')
  // control: the same world with the system pinned to Chinese (what every other test does) is Chinese
  await closeApp(app, { userDataDir: join(run.appData, 'electron') })
  app = null
  const zh = await launch(run, {})
  app = zh.app
  await ready(zh.page, 'inbox')
  assert.equal(await currentTab(zh.page), SHELL.tabs.inbox)
  assert.deepEqual((await zh.page.evaluate(() => window.streams.getAppState())).data.language, { setting: 'auto', resolved: 'zh-CN' })
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})

// 2026-11-02 验方缺口：上面的中文断言拿字典自己当标准，字典改了测试照样绿。这里把方案的入口写死：改字典里任何一个词都必须红。
// v2 package F: the words are the v2 design's now (docs/design/v2/streams-v2-design.html 导航: 库架 · 和主 Agent 聊 · 我的库 ·
// 新建库 · 设置, a library's five tabs); v1.0's nine entries (今日 … 运行状态) are no sidebar entries any more.
// Redesign R1: the redesign's words (05-措辞规范: 主 Agent / Main agent; 04 第 1 题: four tabs, 概览 gone).
test('the sidebar\'s entries and a library\'s four tabs are the words of the design, in both languages (literal, not the table)', () => {
  assert.deepEqual(Object.values(SIDEBAR.entries), ['库架', '主 Agent'])
  assert.deepEqual([SHELL.sidebar.mine, SHELL.sidebar.newLibrary], ['我的库', '新建库'])
  assert.deepEqual(['inbox', 'library', 'ask', 'sources'].map(k => SHELL.tabs[k]), ['待看', '资料库', '问库', '来源与要求'])
  assert.equal(Object.hasOwn(SHELL.tabs, 'overview'), false, '概览 is gone')
  assert.equal(SIDEBAR.settings, '设置')
  assert.equal(SIDEBAR.noLibrary, '未打开库')
  assert.deepEqual(Object.values(SIDEBAR_EN.entries), ['Shelf', 'Main agent'])
  assert.deepEqual(['inbox', 'library', 'ask', 'sources'].map(k => SHELL_EN.tabs[k]), ['Inbox', 'Library', 'Ask', 'Sources & Brief'])
  assert.equal(SIDEBAR_EN.settings, 'Settings')
  assert.deepEqual(Object.keys(SIDEBAR.entries), Object.keys(SIDEBAR_EN.entries), 'both tables key the same entries')
})
