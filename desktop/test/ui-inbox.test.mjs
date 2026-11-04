// 待看 (screens/inbox.js) on the seeded world, driven by the keyboard only (page.keyboard): J / K move the current card, C keeps
// (a file in notes/, a `kept` event, the card gone), D opens the dialog whose 放弃并下一条 stays disabled while the reason is
// empty and Enter alone does nothing (control), then a reason typed → `dismissed` with that reason, the card gone, the reason in
// the right panel; L moves on. The cards come in getInbox order; the 17-day card and the unverified card carry their marks.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { worldSession } from './support/seed.mjs'

const s = worldSession({ kind: 'seeded', waitFor: 'inbox', env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox' }) })
const POLL = { polling: 100, timeout: 60_000 }
const cards = () => s.page.evaluate(() => [...document.querySelectorAll('[data-card]')].map(e => e.dataset.url))
const current = () => s.page.evaluate(() => document.querySelector('[data-card][data-current="true"]')?.dataset.url ?? null)
const ledger = () => readFileSync(join(s.world.library, '_pipeline', 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const notes = () => readdirSync(join(s.world.library, 'notes'))
// the keyboard focus: the url of the card that has it (null when the focus is elsewhere), and whether that card is the current one
const focused = () => s.page.evaluate(() => { const a = document.activeElement; return a?.matches?.('[data-card]') ? { url: a.dataset.url, current: a.dataset.current } : null })
const waitFocusOn = url => s.page.waitForFunction(u => document.activeElement?.matches?.('[data-card]') && document.activeElement.dataset.url === u && document.activeElement.dataset.current === 'true', url, POLL)
const waitCards = n => s.page.waitForFunction(k => document.querySelectorAll('[data-card]').length === k, n, POLL)

test('the cards in the core\'s order, the first one current; the 17-day card and the unverified card are marked; the keys in the top bar', async () => {
  const seed = s.world.seed
  assert.deepEqual(await cards(), seed.inbox.map(i => i.url))
  assert.equal(await current(), seed.inbox[0].url)
  const waiting = await s.page.evaluate(() => [...document.querySelectorAll('[data-card] [data-waiting]')].map(e => [e.closest('[data-card]').dataset.url, e.dataset.waiting]))
  assert.deepEqual(waiting, [[seed.waiting.url, String(seed.waiting.days)]])
  const unverified = await s.page.evaluate(() => [...document.querySelectorAll('[data-card] [data-unverified]')].map(e => e.closest('[data-card]').dataset.url))
  assert.equal(unverified.length, 1, 'one card did not pass the check (seed item 4)')
  const scores = await s.page.evaluate(() => [...document.querySelectorAll('[data-card]')[0].querySelectorAll('[data-score]')].map(e => e.dataset.score))
  assert.deepEqual(scores, ['relevance', 'substance', 'freshness'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="keys"]').textContent), INBOX.keys)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-card] [data-action="open"]').textContent), seed.inbox[0].title)
})

test('S15 from a card: 「这一条的记录」 opens the check record of that card (the rounds the core wrote); J does nothing while it is open; Esc closes it', async () => {
  const target = await s.page.evaluate(() => document.querySelector('[data-card] [data-unverified]').closest('[data-card]').dataset.url)
  const rows = readFileSync(join(s.world.library, '_pipeline', 'verdicts.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(v => v.url === target && v.node === 'summary')
  const rounds = [...new Set(rows.map(v => v.round))]
  assert.ok(rounds.length >= 1, 'the seed wrote a check record for this card')
  const before = await current()
  await s.page.evaluate(u => document.querySelector(`[data-card][data-url="${u}"] [data-action="record"]`).click(), target)
  await s.page.waitForSelector('[data-dialog="verdicts"] [data-round]', { timeout: 30_000 })
  const shown = await s.page.evaluate(() => [...document.querySelectorAll('[data-dialog="verdicts"] [data-verdict-node="summary"] [data-round]')].map(e => e.dataset.round))
  assert.deepEqual(shown.map(String), rounds.map(String), 'one section per round of the summary check, as recorded')
  const cur = await current()
  await s.page.keyboard.press('j')
  assert.equal(await current(), cur, 'the list keys are off while the record is open')
  await s.page.keyboard.press('Escape')
  await s.page.waitForFunction(() => !document.querySelector('[data-dialog="verdicts"]'), null, POLL)
  // the record was opened with the mouse, from the link: with the dialog gone the focus is on the current card, not the link
  await waitFocusOn(cur)
  // control: with the dialog gone the keys work again; put the current card back where it was
  const all = await cards()
  if (all.indexOf(cur) === all.length - 1) {
    await s.page.keyboard.press('k')
    assert.notEqual(await current(), cur)
  } else {
    await s.page.keyboard.press('j')
    assert.notEqual(await current(), cur)
  }
  // leave the list as the next tests expect it: the card that was current before this test
  for (let i = 0; i < all.length && (await current()) !== before; i++) await s.page.keyboard.press('k')
  assert.equal(await current(), before)
})

test('J and K move the current card and keep it in view; the keyboard focus goes with it (activeElement is the current card)', async () => {
  const urls = await cards()
  // control: the focus starts somewhere else, so the checks below can fail
  await s.page.evaluate(() => document.activeElement?.blur())
  assert.equal(await focused(), null, 'control: no card has the focus before J')
  await s.page.keyboard.press('j')
  await s.page.waitForFunction(u => document.querySelector('[data-card][data-current="true"]')?.dataset.url === u, urls[1], POLL)
  await waitFocusOn(urls[1])
  assert.deepEqual(await focused(), { url: urls[1], current: 'true' })
  await s.page.keyboard.press('j')
  await s.page.waitForFunction(u => document.querySelector('[data-card][data-current="true"]')?.dataset.url === u, urls[2], POLL)
  await waitFocusOn(urls[2])
  await s.page.keyboard.press('k')
  await s.page.waitForFunction(u => document.querySelector('[data-card][data-current="true"]')?.dataset.url === u, urls[1], POLL)
  await waitFocusOn(urls[1])
  await s.page.keyboard.press('k')
  await s.page.keyboard.press('k')
  assert.equal(await current(), urls[0], 'K at the top stays at the top')
  await waitFocusOn(urls[0])
  const inView = await s.page.evaluate(() => { const r = document.querySelector('[data-card][data-current="true"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  assert.equal(inView, true)
})

test('C keeps the current card: a file in notes/, a kept event, the card gone, the next one current', async () => {
  const urls = await cards()
  const before = notes().length
  await s.page.keyboard.press('c')
  await waitCards(urls.length - 1)
  assert.equal(notes().length, before + 1, 'one note file more')
  const kept = ledger().filter(e => e.ev === 'kept' && e.url === urls[0])
  assert.equal(kept.length, 1)
  assert.equal(await current(), urls[1])
  assert.equal((await cards()).includes(urls[0]), false)
  await waitFocusOn(urls[1])
})

test('D: the dialog; 放弃并下一条 disabled while the reason is empty, Enter alone does nothing (control); a reason → dismissed with it', async () => {
  const urls = await cards()
  await s.page.keyboard.press('d')
  await s.page.waitForFunction(() => document.querySelector('[data-dialog="dismiss"]') !== null, null, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="confirm-dismiss"] button').disabled), true)
  await s.page.keyboard.press('Enter')
  await s.page.keyboard.press('Control+Enter')
  await s.page.waitForTimeout(400)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="dismiss"]') !== null), true, 'the dialog stays')
  assert.deepEqual(await cards(), urls, 'nothing dismissed without a reason')
  assert.equal(ledger().filter(e => e.ev === 'dismissed').length, 1, 'only the seed\'s dismissal in the ledger')
  await s.page.keyboard.type('只是提到「memory」这个词')
  await s.page.waitForFunction(() => document.querySelector('[data-action="confirm-dismiss"] button').disabled === false, null, POLL)
  await s.page.keyboard.press('Control+Enter')
  await waitCards(urls.length - 1)
  const dismissed = ledger().filter(e => e.ev === 'dismissed' && e.url === urls[0])
  assert.deepEqual(dismissed.map(e => e.reason), ['只是提到「memory」这个词'])
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-dialog="dismiss"]')), null, 'the dialog closed')
  // the dismissed card is gone: the focus is on the card that is current now
  await waitFocusOn(urls[1])
  await s.page.waitForFunction(r => [...document.querySelectorAll('[data-part="reasons"] [data-reason]')].some(e => e.dataset.reason === r), '只是提到「memory」这个词', POLL)
  const reasons = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="reasons"] [data-reason]')].map(e => e.dataset.reason))
  assert.deepEqual(reasons, ['只是提到「memory」这个词', s.world.seed.dismissed.reason], 'newest first, the seed\'s reason too')
})

test('L moves to the next card and writes nothing', async () => {
  const urls = await cards()
  const lines = ledger().length
  await s.page.keyboard.press('l')
  await s.page.waitForFunction(u => document.querySelector('[data-card][data-current="true"]')?.dataset.url === u, urls[1], POLL)
  assert.equal(ledger().length, lines)
  assert.deepEqual(await cards(), urls)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
