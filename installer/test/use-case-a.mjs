/**
 * Use case A in a page of the installed app, the short way (packaged.test.mjs walks the same steps with a check at each).
 *
 * v2 package J2: v2's way (desktop/src/renderer/screens/first-run.js, chat.js's guide, new-library.js; docs/desktop.md §4.10):
 *   firstRunToInbox    首次打开 (no library registered) — 连接方式 skipped → 和主 Agent 聊 with its guide → 「也可以手动新建」 →
 *                      新建库's four steps: the folder from the dialog (the harness answers it), the blank pack with one RSS
 *                      feed, the trial round, 定时 → 完成，去待看 → 待看
 *   v1FirstRunToInbox  v1.0's 首次设置 (five steps in one wizard: the folder, the connection skipped, the pack, the round,
 *                      定时), kept for the update test (upgrade.test.mjs), whose older version is v1.0's own code
 *                      (installer/build-installer.mjs STREAMS_INSTALLER_APP_REF) — v1.0 has no 首次打开
 *   keepCurrent        C keeps the current card of 待看 (the same in both)
 * @module installer/test/use-case-a
 */

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
 * v2: 首次打开 → 连接方式 skipped → 和主 Agent 聊's guide → 也可以手动新建 → 新建库 (four steps) → 待看.
 * @param {import('playwright-core').Page} page @param {{feedUrl: string, rssName?: string}} o
 */
export async function firstRunToInbox(page, { feedUrl, rssName = 'local-feed' }) {
  const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
  const click = sel => page.click(`${sel} button`)
  await until(() => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === 'connection')
  await until(() => document.querySelectorAll('[data-connection]').length === 3)
  await click('[data-action="skip"]')
  await until(() => document.querySelector('main[data-screen="chat"][data-state="ready"] [data-part="first-guide"] [data-action="manual-new"]'))
  await click('[data-action="manual-new"]')
  await until(() => document.querySelector('main[data-screen="new-library"][data-state="ready"] .fr-body')?.dataset.step === 'folder')
  await click('[data-action="choose-folder"]')
  await until(() => document.querySelector('[data-folder-path]') !== null)
  await click('[data-action="next"]')
  await packRoundSchedule(page, { feedUrl, rssName, screen: 'new-library' })
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

/** The update's state as the page shows it ([data-update]), waited for until it is one of `states`. */
export async function updateState(page, states) {
  await page.waitForFunction(s => s.includes(document.querySelector('[data-update-root] [data-update]')?.dataset.update), states, POLL)
  return page.evaluate(() => document.querySelector('[data-update-root] [data-update]').dataset.update)
}
