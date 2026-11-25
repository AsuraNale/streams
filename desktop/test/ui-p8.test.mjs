// 1.1.1 P8 「快到期」 (docs/checks/2026-11-24-1.1.1/p8/scorecard.json; acceptance A12, B23), in the real window. One world (a
// seeded library) opened five times on the app's own clock (STREAMS_DEV_NOW), nothing updated in between:
//   day 0   待看's top block 快到期: due today, in 3 days... — in 待看 and kept, nearest first, each with its days left and
//           where it is; not: yesterday's, a dismissed one, one 31 days away. One notification for the library (two owed:
//           today's and the 7-day one). Pictures light and dark.
//   day 0   opened again in the evening: no second notification
//   day 2   no update ran: the kept item 7 days away is still listed — and notified (its 7-day notice)
//   day 8   (English) the kept item is due tomorrow: its 1-day notice; the block's words in English
//   day 31  nothing within 30 days: the block is not there
// The notifications of a test run are written to <logs>/notifications.jsonl (services/notify.mjs), not shown.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { closeApp } from '../scripts/lib/close-app.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'
import { launch, ready } from './support/app.mjs'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { INBOX as INBOX_EN } from '../src/renderer/texts-en/inbox.js'
import { NOTIFY } from '../src/main/texts/notify.js'
import { NOTIFY as NOTIFY_EN } from '../src/main/texts-en/notify.js'
import { fmt } from '../src/renderer/lib/format.js'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const SHOTS = process.env.STREAMS_P8_SHOTS && isAbsolute(process.env.STREAMS_P8_SHOTS) ? process.env.STREAMS_P8_SHOTS : null
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pad = n => String(n).padStart(2, '0')
const BASE = new Date()
/** The local calendar day `n` days from today: 'YYYY-MM-DD'. */
const day = n => { const d = new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const at = (n, hm) => `${day(n)}T${hm}:00`

const U = p => `https://p8.example.test/${p}`
const ITEMS = [
  { url: U('today'), title: '今天截止的补助', due: day(0) },
  { url: U('in-3'), title: '三天后截止的申请', due: day(3) },
  { url: U('in-30'), title: '三十天后截止', due: day(30) },
  { url: U('in-31'), title: '三十一天后截止', due: day(31) },
  { url: U('yesterday'), title: '昨天已截止', due: day(-1) },
  { url: U('dismissed'), title: '放弃的一条', due: day(5) },
  { url: U('kept'), title: '收藏了的补助', due: day(9) },
]

const world = { root: null, w: null, app: null, page: null, errors: [] }
after(async () => {
  try { if (world.app) await closeApp(world.app, { userDataDir: join(world.w.appData, 'electron') }) } catch { /* gone */ }
  await sleep(300)
  if (world.root) removeTree(world.root, { waitMs: 20_000 })
})

const logOf = () => { const f = join(world.w.appData, 'logs', 'main.log'); return existsSync(f) ? readFileSync(f, 'utf8') : '' }
const notifications = () => { const f = join(world.w.appData, 'logs', 'notifications.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [] }
const starts = () => logOf().split('\n').filter(l => l.includes('due: the app started: looked at every library')).length

async function open(n, hm, settings = null) {
  const before = starts()
  const started = await launch(world.w, { env: { STREAMS_DEV_NOW: at(n, hm), ...(SHOTS ? { STREAMS_WINDOW: 'shown', STREAMS_DEV_NOTIFY_LOG: '1' } : {}) }, settings })
  world.app = started.app
  world.page = started.page
  world.page.on('pageerror', err => world.errors.push(`pageerror: ${err.message}`))
  world.page.on('console', msg => { if (msg.type() === 'error') world.errors.push(`console: ${msg.text()}`) })
  await ready(world.page, 'inbox')
  const t0 = Date.now()
  while (starts() === before) { if (Date.now() - t0 > 30_000) throw new Error('the look at start not in main.log'); await sleep(200) }
  await sleep(800)
}
async function close() {
  await closeApp(world.app, { userDataDir: join(world.w.appData, 'electron') })
  world.app = null
  await sleep(500)
}
const block = () => world.page.evaluate(() => {
  const b = document.querySelector('[data-part="due"]')
  if (!b) return null
  return {
    count: Number(b.dataset.count),
    head: b.querySelector('.section-label')?.textContent ?? '',
    rows: [...b.querySelectorAll('[data-due]')].map(r => ({ url: r.dataset.due, days: Number(r.dataset.days), where: r.dataset.where, text: r.textContent.replace(/\s+/g, ' ').trim() })),
    first: document.querySelector('.thread > :nth-child(2)')?.dataset.part ?? null,
  }
})
const shot = async name => { if (SHOTS) { await world.page.evaluate(() => document.fonts.ready); await sleep(400); await world.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [world.page.locator('.st-path'), world.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }
const libraryName = async () => (await world.page.evaluate(() => window.streams.listLibraries())).data.find(l => l.active).name
const whenZh = d => (d === 0 ? INBOX.due.today : d === 1 ? INBOX.due.tomorrow : fmt(INBOX.due.days, { n: d }))

test('day 0: 快到期 at the top of 待看 — in 待看 and kept, nearest first, days left; not yesterday, dismissed, 31 days; one notification', async () => {
  world.root = tempDir('st-p8-')
  world.w = await makeWorld({ root: world.root, kind: 'seeded' })
  const lib = world.w.library
  const now = () => new Date(Date.parse(at(0, '09:00')))
  const checked = what => ({ status: 'checked', summary: { what, points: [] }, verification: { passed: true, rounds: 1, failed: [] }, original: { saved: false, method: 'direct' }, history: [] })
  for (const it of ITEMS) core.putInInbox(lib, { item: { url: it.url, title: it.title, source: 'p8', date: day(-2), due: it.due }, checked: checked(it.title), now })
  core.dismiss(lib, U('dismissed'), undefined, { now })
  const { id } = core.keep(lib, U('kept'), { now })
  // B23: the deadline is in the note's header
  assert.match(readFileSync(join(lib, 'notes', `${id}.md`), 'utf8'), new RegExp(`\\ndue: ${day(9)}\\n`))

  await open(0, '10:00')
  const b = await block()
  assert.ok(b, 'the block is there')
  assert.equal(b.first, 'due', 'right under the head of 待看')
  assert.deepEqual(b.rows.map(r => [r.url, r.days, r.where]), [[U('today'), 0, 'inbox'], [U('in-3'), 3, 'inbox'], [U('kept'), 9, 'kept'], [U('in-30'), 30, 'inbox']])
  assert.equal(b.count, 4)
  assert.ok(b.head.includes(INBOX.due.title) && b.head.includes(fmt(INBOX.due.count, { n: 4 })), b.head)
  for (const r of b.rows) {
    assert.ok(r.text.includes(whenZh(r.days)), `${r.url}: ${r.text}`)
    assert.ok(r.text.includes(r.where === 'kept' ? INBOX.due.kept : INBOX.due.inbox), r.text)
  }
  assert.ok(b.rows[2].text.includes(fmt(INBOX.due.date, { m: Number(day(9).slice(5, 7)), d: Number(day(9).slice(8)) })), b.rows[2].text)
  for (const gone of ['yesterday', 'dismissed', 'in-31']) assert.equal(b.rows.some(r => r.url === U(gone)), false, gone)
  await shot('due-light')
  assert.ok((await world.page.evaluate(() => window.streams.setAppearance('dark'))).ok)
  await sleep(300)
  await shot('due-dark')
  assert.ok((await world.page.evaluate(() => window.streams.setAppearance('light'))).ok)

  const n = notifications()
  assert.equal(n.length, 1, JSON.stringify(n))
  assert.equal(n[0].kind, 'dueMany')
  assert.equal(n[0].screen, 'inbox')
  assert.equal(n[0].body, fmt(NOTIFY.kinds.dueMany, { library: await libraryName(), count: 2, title: '今天截止的补助' }))
  assert.deepEqual(world.errors, [])
  await close()
})

test('day 0, opened again in the evening: no second notification', async () => {
  await open(0, '19:00')
  assert.equal((await block())?.count, 4)
  assert.equal(notifications().length, 1, 'still the one of the morning')
  await close()
})

test('day 2, no update in between: the kept item 7 days away is listed and notified (its 7-day notice)', async () => {
  await open(2, '10:00')
  const b = await block()
  assert.deepEqual(b.rows.map(r => [r.url, r.days, r.where]), [[U('in-3'), 1, 'inbox'], [U('kept'), 7, 'kept'], [U('in-30'), 28, 'inbox'], [U('in-31'), 29, 'inbox']])
  const n = notifications()
  // in-3 is at 1 day now (its 1-day notice) and the kept one at 7 days: two owed, one notification
  assert.equal(n.length, 2, JSON.stringify(n))
  assert.equal(n[1].kind, 'dueMany')
  assert.ok(n[1].body.includes('三天后截止的申请'), n[1].body)
  const rec = JSON.parse(readFileSync(join(world.w.library, '_pipeline', 'due-notices.json'), 'utf8'))
  assert.deepEqual(rec[U('kept')], { due: day(9), 7: day(2) })
  assert.equal(rec[U('in-3')]['1'], day(2))
  assert.equal(Object.hasOwn(rec, U('dismissed')), false, 'a dismissed item is never notified')
  await close()
})

test('day 8 (English): the kept item is due tomorrow — its 1-day notice; the block in English', async () => {
  await open(8, '10:00', { language: 'en' })
  const b = await block()
  assert.deepEqual(b.rows.map(r => [r.url, r.days]), [[U('kept'), 1], [U('in-30'), 22], [U('in-31'), 23]])
  assert.ok(b.head.includes(INBOX_EN.due.title), b.head)
  assert.ok(b.rows[0].text.includes(INBOX_EN.due.tomorrow) && b.rows[0].text.includes(INBOX_EN.due.kept), b.rows[0].text)
  await shot('due-en')
  const n = notifications()
  assert.equal(n.length, 3, JSON.stringify(n))
  assert.equal(n[2].kind, 'dueTomorrow')
  assert.equal(n[2].body, fmt(NOTIFY_EN.kinds.dueTomorrow, { library: await libraryName(), title: '收藏了的补助' }))
  await close()
})

test('day 32: nothing within 30 days — no 快到期 block; no notification', async () => {
  await open(32, '10:00')
  assert.equal(await block(), null)
  assert.equal(notifications().length, 3)
  assert.deepEqual(world.errors, [])
  await close()
})
