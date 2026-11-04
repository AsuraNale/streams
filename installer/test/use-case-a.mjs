/**
 * Use case A in a page of the installed app, the short way (installer/test/upgrade.test.mjs; packaged.test.mjs walks the
 * same steps with a check at each): 首次设置 — the folder from the dialog (the harness answers it), the connection skipped,
 * the blank pack with one RSS feed, the trial round, 定时 → 完成 → 待看; then C keeps the current card.
 * @module installer/test/use-case-a
 */

const POLL = { polling: 200, timeout: 120_000 }

/** @param {import('playwright-core').Page} page @param {{feedUrl: string, rssName?: string}} o */
export async function firstRunToInbox(page, { feedUrl, rssName = 'local-feed' }) {
  const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
  const click = sel => page.click(`${sel} button`)
  const stepIs = id => until(i => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === i, id)
  await until(() => document.querySelector('main[data-screen="first-run"][data-state="ready"]'))
  await click('[data-action="choose-folder"]')
  await until(() => document.querySelector('[data-folder-path]') !== null)
  await click('[data-action="next"]')
  await stepIs('connection')
  await click('[data-action="skip"]')
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
  // the sidebar's footer button 设置 (desktop/src/renderer/kit/sidebar.js)
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
