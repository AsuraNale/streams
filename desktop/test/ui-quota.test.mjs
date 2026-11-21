// v2 package M (docs/checks/2026-11-10-wp-m/contract.md M4; docs/desktop.md §4.11) on the running app: the corner of the
// sidebar above 设置. The development file STREAMS_DEV_QUOTA stands in for what the connections read (no real codex, no key,
// no request): Claude Code's two windows, Codex's one, and an API balance kept for Anthropic (a vendor with no balance
// endpoint). Three states, by changing the current connection from the page (the bridge, as 设置 does):
//   - numbers: Claude Code → 套餐余量 with two lines; Codex → one line (7 天); the words are the Chinese table's;
//   - nothing read: the API with DeepSeek (nothing read for it) → the corner is not drawn; no connection chosen → not drawn;
//   - no endpoint: the API with Anthropic (a balance kept, but the vendor has no endpoint) → not drawn;
// it sits between 新建库 and 设置; its visible words pass the wording scanner and name no brand. With STREAMS_QUOTA_SHOTS=<folder>
// the window is shown (a hidden one draws no frames) and each state is saved there as a picture of the sidebar; without it, no
// picture (an ordinary test run opens no window). Each check first shows the input that makes it fail.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { SHELL } from '../src/renderer/texts/shell.js'
import { SIDEBAR } from '../src/renderer/texts/common.js'
import { fmt, nextText } from '../src/renderer/lib/format.js'
import { quotaView } from '../src/renderer/lib/quota.js'
import { appSession } from './support/app.mjs'

const wording = await import(pathToFileURL(join(REPO_DIR, 'wording', 'src', 'index.mjs')).href)
const AT = new Date(Date.now() - 5 * 60_000).toISOString()
const soon = Math.floor(Date.now() / 1000) + 2 * 3600
const later = Math.floor(Date.now() / 1000) + 3 * 86400
const DEV = {
  'claude-code': { source: 'claude-code', at: AT, windows: [{ id: 'five_hour', usedPercent: 5, resetsAt: soon }, { id: 'seven_day', usedPercent: 11, resetsAt: later }] },
  codex: { source: 'codex', at: AT, plan: 'prolite', windows: [{ id: 'primary', usedPercent: 28, windowMins: 10080, resetsAt: later }] },
  api: { source: 'api', at: AT, vendor: 'anthropic', balance: [{ currency: 'USD', amount: 12.5 }] },
}
const here = tempDir('st-quota-ui-')
const devFile = join(here, 'quota.json')
writeFileSync(devFile, JSON.stringify(DEV))
const SHOTS = process.env.STREAMS_QUOTA_SHOTS && isAbsolute(process.env.STREAMS_QUOTA_SHOTS) ? process.env.STREAMS_QUOTA_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const s = appSession({ settings: { connections: { active: 'claude-code' } }, env: { STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_QUOTA: devFile, ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) } })
const POLL = { polling: 100, timeout: 30_000 }
const corner = () => s.page.evaluate(() => {
  const q = document.querySelector('.st-sidebar [data-part="quota"]')
  if (!q) return null
  const kids = [...q.parentElement.children]
  return {
    // v2 package K2: a plan row is drawn in parts (span · bar · per cent · 「… 重置」); its whole sentence is its accessible name
    kind: q.dataset.quotaKind, title: q.querySelector('.st-sidebar__quota-title')?.textContent, rows: [...q.querySelectorAll('[data-quota-row]')].map(r => [r.dataset.quotaRow, r.getAttribute('aria-label')]),
    parts: [...q.querySelectorAll('[data-quota-row]')].map(r => [r.querySelector('.st-sidebar__quota-span')?.textContent ?? null, r.querySelector('.st-sidebar__quota-pct')?.textContent ?? null, r.querySelector('.st-sidebar__quota-fill')?.style.width ?? null]),
    asOf: q.querySelector('[data-quota-as-of]')?.textContent ?? null,
    hover: q.getAttribute('title'), text: q.textContent,
    // where it is: right before 设置, after 新建库
    next: q.nextElementSibling?.classList.contains('st-sidebar__footer-button') ?? false,
    afterAdd: kids.indexOf(q) > kids.findIndex(k => k.matches('[data-action="add-library"]')),
  }
})
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const shot = async name => {
  if (!SHOTS) return
  const box = await s.page.evaluate(() => { const r = document.querySelector('.st-sidebar').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  await s.page.screenshot({ path: join(SHOTS, `quota-${name}.png`), clip: box })
}
const until = fn => s.page.waitForFunction(fn, null, POLL)

test('quotaView: the lines in the Chinese table\'s words; null for nothing, a shape not known, a balance with no line', () => {
  // the clock is noon today, not the moment the test runs: after 22:00 a reset two hours away is tomorrow's and the row
  // rightly says 「明天 01:34 重置」, which the today-only pattern below does not take (red at 23:34 on 11-20)
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const soon = Math.floor(now.getTime() / 1000) + 2 * 3600
  const later = Math.floor(now.getTime() / 1000) + 3 * 86400
  const plan = { source: 'claude-code', at: new Date(now.getTime() - 5 * 60_000).toISOString(), windows: [{ id: 'five_hour', usedPercent: 5, resetsAt: soon }, { id: 'seven_day', usedPercent: 11, resetsAt: later }] }
  const v = quotaView(plan, now)
  assert.equal(v.title, SHELL.sidebar.quota.plan)
  const resets = sec => nextText(new Date(sec * 1000).toISOString(), SHELL.sidebar.quota.resets, now)
  // v2 package K2: each plan row also carries its parts for the K1 look (span, used 0–100, pct, when)
  assert.deepEqual(v.rows, [
    { id: 'five_hour', text: fmt(SHELL.sidebar.quota.window, { span: fmt(SHELL.sidebar.quota.hours, { n: 5 }), pct: '5', when: resets(soon) }), span: fmt(SHELL.sidebar.quota.hours, { n: 5 }), used: 5, pct: '5', when: resets(soon) },
    { id: 'seven_day', text: fmt(SHELL.sidebar.quota.window, { span: fmt(SHELL.sidebar.quota.days, { n: 7 }), pct: '11', when: resets(later) }), span: fmt(SHELL.sidebar.quota.days, { n: 7 }), used: 11, pct: '11', when: resets(later) },
  ])
  assert.match(v.rows[0].text, /^5 小时 已用 5% · \d\d:\d\d 重置$/, 'today: the time only (contract: 「5 小时 已用 5% · 14:30 重置」)')
  assert.equal(quotaView(DEV.codex, now).rows[0].text.startsWith('7 天 已用 28%'), true)
  assert.deepEqual(quotaView(DEV.api, now).rows, [{ id: 'USD', text: '12.50 USD' }])
  for (const bad of [null, undefined, {}, { source: 'claude-code', windows: [] }, { source: 'claude-code', windows: [{ id: 'other', usedPercent: 1, resetsAt: soon }] }, { source: 'api', balance: [] }, { source: 'x' }]) assert.equal(quotaView(bad, now), null, JSON.stringify(bad))
})

test('numbers: Claude Code\'s two windows, then Codex\'s one, right above 设置; the hover says when; quota-changed re-reads', async () => {
  await until(() => document.querySelector('.st-sidebar [data-part="quota"]') !== null)
  const c = await corner()
  assert.equal(c.kind, 'plan')
  assert.equal(c.title, SHELL.sidebar.quota.plan)
  assert.deepEqual(c.rows.map(r => r[0]), ['five_hour', 'seven_day'])
  assert.deepEqual(c.rows.map(r => r[1]), quotaView(DEV['claude-code']).rows.map(r => r.text))
  // v2 package K2: the K1 card — the span, the per cent and a bar as wide as the per cent; 「截至 …」 in the head
  assert.deepEqual(c.parts, [[fmt(SHELL.sidebar.quota.hours, { n: 5 }), '5%', '5%'], [fmt(SHELL.sidebar.quota.days, { n: 7 }), '11%', '11%']])
  assert.equal(c.asOf, c.hover)
  assert.ok(c.next, 'right before 设置')
  assert.ok(c.afterAdd, 'after 新建库')
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar__footer-button')?.textContent.trim()), SIDEBAR.settings)
  assert.ok(c.hover.startsWith(fmt(SHELL.sidebar.quota.asOf, { when: '' }).trim()), c.hover)
  await shot('claude-code')
  await bridge('setActiveConnection', 'codex')
  await until(() => document.querySelector('.st-sidebar [data-quota-row="primary"]') !== null)
  const x = await corner()
  assert.deepEqual(x.rows.map(r => r[1]), quotaView(DEV.codex).rows.map(r => r.text))
  await shot('codex')
})

test('nothing read, no endpoint, no connection: the corner is not drawn at all', async () => {
  // no endpoint: the API with Anthropic, a balance kept for it
  await bridge('setActiveConnection', 'api')
  await until(() => document.querySelector('.st-sidebar [data-part="quota"]') === null)
  assert.equal(await corner(), null)
  assert.equal(await s.page.evaluate(() => window.streams.getQuota()).then(r => r.data), null, 'getQuota says null')
  await shot('api-no-endpoint')
  // nothing read: DeepSeek has an endpoint, but nothing was read for it (no real request in a development run)
  await bridge('setApiVendor', 'deepseek', null)
  await new Promise(r => setTimeout(r, 500))
  assert.equal(await corner(), null)
  await shot('api-nothing-read')
  // reverse: back to Claude Code, the corner is drawn again (the absence above is not a corner that never draws)
  await bridge('setActiveConnection', 'claude-code')
  await until(() => document.querySelector('.st-sidebar [data-part="quota"]') !== null)
  await bridge('setActiveConnection', null)
  await until(() => document.querySelector('.st-sidebar [data-part="quota"]') === null)
  assert.equal(await corner(), null)
  assert.deepEqual(s.errors, [])
})

test('V7: the corner\'s visible words pass the wording scanner and name no brand (control: a planted brand is caught)', async () => {
  await bridge('setActiveConnection', 'claude-code')
  await until(() => document.querySelector('.st-sidebar [data-part="quota"]') !== null)
  const c = await corner()
  const BRAND = /claude|codex|anthropic|openai|deepseek|moonshot|kimi|gemini|zhipu|glm/i
  assert.ok(BRAND.test(`${c.text} · Claude Code`), 'control: the brand check can fail')
  assert.ok(!BRAND.test(`${c.text} ${c.hover}`), `${c.text} ${c.hover}`)
  const r = wording.scanStrings({ title: c.title, hover: c.hover, ...Object.fromEntries(c.rows) })
  assert.equal(wording.scanStrings({ a: `${c.title} pending` }).ok, false, 'control: the scanner finds a banned word here')
  assert.deepEqual(r.hits, [])
  assert.equal(r.ok, true)
})
