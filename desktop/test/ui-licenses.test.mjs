// 许可证与致谢 (mockup S14; docs/desktop.md §四 getLicenses / openNotices) on a development run: 设置「关于」's button opens the
// dialog; the license text on the page is word for word the repository's LICENSE; 「由 Starry Digital 开发」 asks for the
// maker's page (a test run only writes the log); the five parts with the runtime's versions (Electron's own process.versions)
// and the shipped package.json's version and license (Preact, htm, @mozilla/readability); 「打开完整的第三方声明」 cannot be clicked in development and says why,
// and the bridge refuses it there (open_failed). Esc and 关闭 close it. (The installed app's answer: installer/test/packaged.test.mjs.)
// redesign R4b: 许可证与致谢 is the template's dialog (P19): its title is the dialog-head's h2 (was .st-dialog__title); the interface font
// is its own line 「界面字体 · Noto Sans SC（SIL Open Font License 1.1）」 with its license folded under it (was the table's last row and
// the text under the table), so the table lists the six bundled parts. What each test checks is unchanged.
// redesign R6a: the table has a seventh row, 「Noto Serif SC · 2.003 · OFL-1.1」 — 研究对话's heading font ships with the app now
// (contract R6a-1: a row with the version read from the font file) — so the list of rows compared below has that row at its
// end, and the control on the reading mode's part looks at the row before it. The font's own line and its license text on the
// page: test/ui-r6a.test.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const s = worldSession({ kind: 'empty', waitFor: 'settings', env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_START_SCREEN: 'settings' }) })
const pkg = name => JSON.parse(readFileSync(join(DESKTOP_DIR, 'node_modules', name, 'package.json'), 'utf8'))
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const open = async () => {
  await s.page.click('[data-part="about"] [data-action="licenses"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="licenses"] [data-part="license-text"]') !== null, null, POLL)
}

test('设置「关于」 → 许可证与致谢: MIT, the text word for word the repository\'s LICENSE', async () => {
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="licenses"]')), null, 'control: no dialog before the click')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="about"] [data-action="licenses"]').textContent.trim()), SETTINGS.licensesOpen)
  await open()
  const own = await s.page.evaluate(() => ({ license: document.querySelector('[data-dialog="licenses"] [data-part="own"]').dataset.license, text: document.querySelector('[data-part="license-text"]').textContent, title: document.querySelector('[data-dialog="licenses"] .dialog-head h2').textContent }))
  assert.equal(own.title, SETTINGS.licenses.title)
  assert.equal(own.license, 'MIT')
  assert.equal(own.text, readFileSync(join(REPO_DIR, 'LICENSE'), 'utf8'))
  assert.equal((await s.page.evaluate(() => window.streams.getLicenses())).data.own.text, readFileSync(join(REPO_DIR, 'LICENSE'), 'utf8'))
})

test('「由 Starry Digital 开发」 in the dialog asks for the maker\'s page', async () => {
  const want = 'not opened in a test run: https://starrydigital.ca'
  assert.ok(!log().includes(want), 'control: not asked before the click')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="licenses-made-by"] button').textContent), SETTINGS.madeBy)
  await s.page.click('[data-part="licenses-made-by"] button')
  const end = Date.now() + 20_000
  while (Date.now() < end && !log().includes(want)) await new Promise(r => setTimeout(r, 100))
  assert.ok(log().includes(want))
})

// (redesign R6a: this test's name said 「the six parts」; the table has seven rows since the heading font got its own)
test('the seven rows of the parts table: Electron, Chromium, Node.js from the runtime; Preact, htm and @mozilla/readability from the app\'s own package.json files; Noto Serif SC from the font file that ships (redesign R6a)', async () => {
  const versions = await s.app.evaluate(() => process.versions)
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="components"] [data-component]')].map(r => [...r.querySelectorAll('td')].map(td => td.textContent)))
  assert.deepEqual(rows, [
    ['Electron', versions.electron, 'MIT'],
    ['Chromium', versions.chrome, 'BSD-3-Clause'],
    ['Node.js', versions.node, 'MIT'],
    ['Preact', pkg('preact').version, pkg('preact').license],
    ['htm', pkg('htm').version, pkg('htm').license],
    ['@mozilla/readability', pkg('@mozilla/readability').version, pkg('@mozilla/readability').license],
    // redesign R6a: the heading font of 研究对话, its version from the font file that ships
    ['Noto Serif SC', '2.003', 'OFL-1.1'],
  ])
  assert.deepEqual(rows.at(-2), ['@mozilla/readability', '0.6.0', 'Apache-2.0'], 'control: the reading mode\'s part, as desktop/package.json pins it')
  // redesign R4b (P19): the bundled UI font is its own line above the table, its license folded under it
  assert.equal((await s.page.evaluate(() => window.streams.getLicenses())).data.font.name, 'Noto Sans SC')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="licenses"] [data-part="font"] b').textContent), fmt(SETTINGS.licenses.font, { name: 'Noto Sans SC', license: 'SIL Open Font License 1.1' }))
  // v2 package K2: the font's license in full under the table
  const font = await s.page.evaluate(() => ({ license: document.querySelector('[data-dialog="licenses"] [data-part="font"]')?.dataset.license, text: document.querySelector('[data-part="font-license-text"]')?.textContent ?? '' }))
  assert.equal(font.license, 'OFL-1.1')
  assert.match(font.text, /SIL OPEN FONT LICENSE Version 1\.1/)
  // redesign R6a (P19): the heading font's own line 「标题字体 · Noto Serif SC（SIL Open Font License 1.1）」 under it, with the OFL
  // text that came with the font in full (the file shipped beside it), folded the same way
  const display = await s.page.evaluate(() => { const el = document.querySelector('[data-dialog="licenses"] [data-part="display-font"]'); return el ? { line: el.querySelector('b').textContent, license: el.dataset.license, version: el.dataset.version, text: el.querySelector('[data-part="display-font-license-text"]').textContent, folded: el.querySelector('details').open === false, after: Boolean(document.querySelector('[data-dialog="licenses"] [data-part="font"]').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) } : null })
  assert.ok(display, 'the dialog has the heading font\'s line')
  assert.equal(display.line, fmt(SETTINGS.licenses.displayFont, { name: 'Noto Serif SC', license: 'SIL Open Font License 1.1' }))
  assert.equal(display.line, '标题字体 · Noto Serif SC（SIL Open Font License 1.1）')
  assert.deepEqual([display.license, display.version, display.folded, display.after], ['OFL-1.1', '2.003', true, true])
  assert.equal(display.text, readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'fonts', 'OFL-NotoSerifSC.txt'), 'utf8'), 'the shipped OFL text, whole')
  assert.notEqual(display.text, font.text, 'control: not the interface font\'s text twice')
  assert.equal(versions.electron, '44.0.0', 'control: the pinned Electron')
  const head = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="components"] th')].map(th => th.textContent))
  assert.deepEqual(head, [SETTINGS.licenses.name, SETTINGS.licenses.version, SETTINGS.licenses.license])
})

test('「打开完整的第三方声明」: not clickable in development, with the reason; the bridge says open_failed and opens nothing', async () => {
  const n = await s.page.evaluate(() => { const el = document.querySelector('[data-dialog="licenses"] [data-part="notices"]'); return { available: el.dataset.available, disabled: el.querySelector('[data-action="open-notices"] button').disabled, label: el.querySelector('[data-action="open-notices"] button').textContent, why: el.querySelector('[data-notices-why]')?.textContent ?? null } })
  assert.deepEqual(n, { available: 'false', disabled: true, label: SETTINGS.licenses.notices, why: SETTINGS.licenses.noticesNone })
  assert.deepEqual((await s.page.evaluate(() => window.streams.getLicenses())).data.notices, { available: false })
  assert.deepEqual(await s.page.evaluate(() => window.streams.openNotices()), { ok: false, error: { code: 'open_failed' } })
  assert.equal(log().includes('THIRD-PARTY-NOTICES.txt'), false, 'nothing opened, nothing asked to open')
})

test('Esc closes the dialog; 关闭 closes it too', async () => {
  await s.page.keyboard.press('Escape')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="licenses"]') === null, null, POLL)
  await open()
  await s.page.click('[data-dialog="licenses"] [data-action="close-licenses"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="licenses"]') === null, null, POLL)
  assert.deepEqual(s.errors, [])
})
