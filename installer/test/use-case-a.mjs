/**
 * What the two install tests share of walking the installed app's pages (docs/installer.md §五).
 *
 * Redesign R6c: use case A of now (首次打开 as one screen → 连接选择 skipped → 手动创建 → 新建库's one-page form → 创建并运行 →
 * 待看; docs/desktop.md §4.16) is walked by packaged.test.mjs itself, step by step with a check at each; v2 package J2's
 * `firstRunToInbox` (首次打开's two steps → 和主 Agent 聊's guide → 新建库's four steps), which no test called, is deleted. Here:
 *   appWords           the app's own words and defaults read from an app folder — the installed resources\app: its Chinese
 *                      dictionaries (src\renderer\texts\*.js), fmt, and the look's defaults and migration (src\main\theme.mjs,
 *                      src\shared\themes.mjs). The install tests compare what a page shows with these, never with a Chinese
 *                      literal of their own, so a change of wording in the app needs no change in the tests
 *   isAppWord          whether a string is one of those words (the test library's name must not be one)
 *   v1FirstRunToInbox  v1.0's 首次设置 (five steps in one wizard: the folder, the connection skipped, the pack, the round,
 *                      定时), kept for the update test (upgrade.test.mjs), whose older version is v1.0's own code
 *                      (installer/build-installer.mjs STREAMS_INSTALLER_APP_REF) — packRoundSchedule is now its alone
 *   keepCurrent        C keeps the current card of 待看 (v1.0 and now alike)
 *   openAbout · updateState   设置's 「关于」 and the update's state (v1.0 and now alike)
 * @module installer/test/use-case-a
 */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const POLL = { polling: 200, timeout: 120_000 }

/** The steps both versions share once the library folder is chosen: the blank pack with one RSS feed, the round, 定时 → 待看. */
async function packRoundSchedule(page, { feedUrl, rssName, screen }) {
  const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
  const click = sel => page.click(`${sel} button`)
  const stepIs = id => until(([s, i]) => document.querySelector(`main[data-screen="${s}"][data-state="ready"] .fr-body`)?.dataset.step === i, [screen, id])
  await stepIs('pack')
  await page.click('[data-pack="blank"]')
  await until(() => document.querySelector('[data-part="pack-detail"]') !== null)
  await page.fill('[data-field="rss-name"]', rssName)
  await page.fill('[data-field="rss-url"]', feedUrl)
  await click('[data-action="add-rss"]')
  await until(name => document.querySelector(`[data-part="pack-detail"] [data-source="${name}"]`) !== null, rssName)
  await click('[data-action="apply"]')
  await until(() => document.querySelector('[data-part="tried"]') !== null)
  await click('[data-action="continue"]')
  await stepIs('trial')
  await click('[data-action="start"]')
  await until(() => document.querySelector('[data-part="round-progress"]')?.dataset.done === 'true')
  await click('[data-action="next"]')
  await stepIs('schedule')
  await click('[data-action="go-inbox"]')
  await until(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]'))
}

/**
 * v1.0: 首次设置 — the folder, the connection skipped, then the pack, the round, 定时 → 待看 (the update test's older version).
 * @param {import('playwright-core').Page} page @param {{feedUrl: string, rssName?: string}} o
 */
export async function v1FirstRunToInbox(page, { feedUrl, rssName = 'local-feed' }) {
  const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
  const click = sel => page.click(`${sel} button`)
  const stepIs = id => until(i => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === i, id)
  await until(() => document.querySelector('main[data-screen="first-run"][data-state="ready"]'))
  await stepIs('folder')
  await click('[data-action="choose-folder"]')
  await until(() => document.querySelector('[data-folder-path]') !== null)
  await click('[data-action="next"]')
  await stepIs('connection')
  await click('[data-action="skip"]')
  await packRoundSchedule(page, { feedUrl, rssName, screen: 'first-run' })
}

/** C on the current card of 待看; resolves with its address once the card is gone. */
export async function keepCurrent(page) {
  const url = await page.evaluate(() => document.querySelector('article[data-card][data-current="true"]')?.dataset.url ?? null)
  if (!url) throw new Error('no current card in 待看')
  await page.keyboard.press('c')
  await page.waitForFunction(u => !document.querySelector(`article[data-card][data-url="${u}"]`), url, POLL)
  return url
}

/** The settings page's 「关于」 part: [data-version], ready for 检查更新. */
export async function openAbout(page) {
  // the sidebar's footer button 设置 (desktop/src/renderer/kit/sidebar.js; v1.0 and v2 alike)
  await page.click('.st-sidebar__footer-button')
  await page.waitForFunction(() => document.querySelector('main[data-screen="settings"][data-state="ready"] [data-update-root] [data-version]'), null, POLL)
  return page.evaluate(() => {
    const el = document.querySelector('[data-update-root] [data-version]')
    return { version: el.dataset.version, text: el.textContent }
  })
}

/**
 * Redesign R6c (fixer, after the pre-check): whether `s` is one of the words of `words` (appWords' result: every string in its
 * dictionaries, however deep). The test library's name must not be one — were it 「我的库」 (SHELL.sidebar.mine), a row or a
 * card drawn with the group's word would pass for the library's own.
 * @param {object} words
 * @param {string} s
 */
export function isAppWord(words, s) {
  const seen = new Set()
  const walk = v => {
    if (typeof v === 'string') return v === s
    if (v === null || typeof v !== 'object' || seen.has(v)) return false
    seen.add(v)
    return Object.values(v).some(walk)
  }
  return walk(words)
}

/** The update's state as the page shows it ([data-update]), waited for until it is one of `states`. */
export async function updateState(page, states) {
  await page.waitForFunction(s => s.includes(document.querySelector('[data-update-root] [data-update]')?.dataset.update), states, POLL)
  return page.evaluate(() => document.querySelector('[data-update-root] [data-update]').dataset.update)
}

/**
 * Redesign R6c: the app's own words and defaults, read from an app folder (`appDir`: the installed resources\app — the files
 * the running app itself reads). The Chinese dictionaries (the harness pins the system's language to Chinese), `fmt` that
 * fills their placeholders, and the look: DEFAULT_THEME / DEFAULT_APPEARANCE / migrateLook (src\main\theme.mjs), THEME_PAGE /
 * THEME_TEMPLATE (src\shared\themes.mjs). None of these files imports Electron or anything outside the app folder.
 * @param {string} appDir
 */
export async function appWords(appDir) {
  const imp = (...p) => import(pathToFileURL(join(appDir, 'src', ...p)).href)
  const [firstRun, common, panel, settings, shell, library, format, theme, themes] = await Promise.all([
    imp('renderer', 'texts', 'first-run.js'), imp('renderer', 'texts', 'common.js'), imp('renderer', 'texts', 'panel.js'),
    imp('renderer', 'texts', 'settings.js'), imp('renderer', 'texts', 'shell.js'), imp('renderer', 'texts', 'library.js'),
    imp('renderer', 'lib', 'format.js'), imp('main', 'theme.mjs'), imp('shared', 'themes.mjs'),
  ])
  return {
    FIRST_RUN: firstRun.FIRST_RUN, NEW_LIBRARY: firstRun.NEW_LIBRARY,
    BRAND: common.BRAND, CONNECTIONS: common.CONNECTIONS, FETCH_STATES: common.FETCH_STATES, SEP: common.SEP, SIDEBAR: common.SIDEBAR,
    PANEL: panel.PANEL, SETTINGS: settings.SETTINGS, SHELL: shell.SHELL, LIBRARY: library.LIBRARY,
    fmt: format.fmt,
    DEFAULT_THEME: theme.DEFAULT_THEME, DEFAULT_APPEARANCE: theme.DEFAULT_APPEARANCE, migrateLook: theme.migrateLook,
    THEME_PAGE: themes.THEME_PAGE, THEME_TEMPLATE: themes.THEME_TEMPLATE,
  }
}
