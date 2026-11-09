// 库架 and the sidebar after a round of a library ends (found by the v2 draft acceptance test N6, UC2 step 1, 11-09): the
// shelf card's 「上次更新」 and its problem, and the sidebar's amber dot, are the bridge's getLibrariesOverview — read again
// when a round ends (`round-progress` with done: true), not only when the registry or a library's settings change. The world:
// three registered libraries (test/support/seed.mjs seedShelf); 「电动车」 never ran.
// The round's end is what the main process says at the end of every round (services/pipeline.mjs: round-progress done:true,
// with its libraryId); what it ran is written into the library's rounds.jsonl as the core writes it (three rounds that put
// nothing into 待看 → the no-output problem). Control: with the file written and no event yet, the page still shows what it
// read before (so it is the event that makes the difference); a round-progress that is not the end changes nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENT_CHANNEL } from '../src/main/events.mjs'
import { SHELL } from '../src/renderer/texts/shell.js'
import { ready } from './support/app.mjs'
import { seedShelf, worldSession } from './support/seed.mjs'

let shelf = null
const s = worldSession({
  kind: 'seeded',
  waitFor: 'overview',
  prepare: async world => { shelf = await seedShelf(world) },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake' }),
})
const POLL = { polling: 100, timeout: 30_000 }
const send = (topic, payload) => s.app.evaluate(({ BrowserWindow }, [channel, m]) => { BrowserWindow.getAllWindows()[0].webContents.send(channel, m) }, [EVENT_CHANNEL, { topic, payload }])
const card = id => s.page.evaluate(i => {
  const c = document.querySelector(`[data-shelf-card="${i}"]`)
  return c ? { updated: c.querySelector('[data-part="updated"]').textContent, problem: c.querySelector('[data-part="problem"]').dataset.problem } : null
}, id)
const dot = id => s.page.evaluate(i => document.querySelector(`[data-library-row="${i}"] [data-problem]`)?.dataset.problem ?? null, id)

test('a round of 电动车 ends: the shelf card says when, the problem of its three rounds without output shows on the card and in the sidebar', async () => {
  const ev = shelf.ids[1]
  await s.page.click('[data-nav="shelf"]')
  await ready(s.page, 'shelf')
  const before = await card(ev)
  assert.ok(before.updated.startsWith(SHELL.shelf.updatedNever), `control: never ran (${before.updated})`)
  assert.equal(before.problem, 'none')
  assert.equal(await dot(ev), null)
  // the rounds, as the core writes them: three that put nothing into 待看
  const t0 = Date.now()
  const at = i => new Date(t0 - (3 - i) * 60_000).toISOString()
  writeFileSync(join(shelf.dirs[1], '_pipeline', 'rounds.jsonl'), [0, 1, 2].map(i => `${JSON.stringify({ id: `r-${i}`, startedAt: at(i), finishedAt: at(i), counts: { fetched: 1, new: 0, maybeDuplicates: 0, summarized: 0, inbox: 0 }, gates: {}, calls: 0 })}\n`).join(''), 'utf8')
  const fromBridge = (await s.page.evaluate(() => window.streams.getLibrariesOverview())).data.find(r => r.id === ev)
  assert.deepEqual([fromBridge.lastRoundAt, fromBridge.problem], [at(2), 'no-output'], 'control: the bridge already says so')
  // control: no event yet, and a round-progress that is not the end → the page keeps what it read
  await send('round-progress', { roundId: 'r-2', libraryId: ev, phase: 'fetch', counts: null, calls: 0, cap: 120, done: false })
  await s.page.waitForTimeout(800)
  assert.deepEqual(await card(ev), before, 'nothing read again before the end of the round')
  // the end of the round
  await send('round-progress', { roundId: 'r-2', libraryId: ev, phase: 'done', counts: { inbox: 0 }, calls: 0, cap: 120, done: true, result: { started: true } })
  await s.page.waitForFunction(i => document.querySelector(`[data-shelf-card="${i}"] [data-part="problem"]`)?.dataset.problem === 'no-output', ev, POLL)
  const after = await card(ev)
  assert.ok(after.updated.startsWith(SHELL.shelf.updated.split('{')[0]), `「上次更新」 now (${after.updated})`)
  assert.equal(after.updated.startsWith(SHELL.shelf.updatedNever), false)
  await s.page.waitForFunction(i => document.querySelector(`[data-library-row="${i}"] [data-problem]`)?.dataset.problem === 'no-output', ev, POLL)
  assert.equal(await dot(ev), 'no-output', 'the sidebar\'s amber dot')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
