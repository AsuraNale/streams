// 定时 on the running app (docs/desktop.md §4.3). Session A, the seeded world with the schedule on at 08:30: 设置「运行」 shows
// the switch on, the time, the next run as getSchedule gives it and the two rules; a new time typed → settings.json; the
// switch off → settings.json, 「定时没开」; 25:00 through the bridge → bad_arguments and nothing written, and a time the field
// cannot hold → the page says so and writes nothing; 今日's top bar 「下次运行 …」 with the schedule on, 「定时没开」 with it off.
// Session B, 首次设置 walked to its last screen (folder → skipped connection → blank pack → the first round): 「定时」 shows
// every day at 08:30 in the tray; 完成 writes { enabled: true, time: '08:30' } (the world started with it off, the control).
// v2 package A: the schedule is the library's own, in its streams.json — every 「→ settings.json」 below now reads the library's
// streams.json (`scheduleOf`); settings.json's schedule is only what the library got written in the first time (the migration:
// session B's control is that copy, off as the world's settings.json had it).
// v2 package F: the schedule is changed on the library's own 来源与要求 now (its part 「定时与每轮上限」, [data-part="run"], the same
// hooks as 设置「运行」 had; 设置 only lists every library's schedule): session A opens 来源与要求 instead of 设置, and 今日's top
// bar is the library's head on 概览 ([data-part="next-run"]); 待看 and 概览 are tabs ([data-tab]). The assertions are v1.0's.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NEXT_WHEN } from '../src/renderer/texts/common.js'
import { FIRST_RUN } from '../src/renderer/texts/first-run.js'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { TODAY } from '../src/renderer/texts/today.js'
import { fmt, nextText } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const POLL = { polling: 100, timeout: 60_000 }
// v2: the library's own schedule (streams.json), where setSchedule writes; and that file's bytes, for 「nothing written」
const scheduleOf = dir => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8')).schedule
const configBytes = dir => readFileSync(join(dir, 'streams.json'), 'utf8')

const s = worldSession({
  kind: 'seeded',
  waitFor: 'sources',
  settings: { schedule: { enabled: true, time: '08:30' } },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }),
})
const run = sel => s.page.evaluate(q => { const el = document.querySelector(`[data-part="run"] ${q}`); return el ? { text: el.textContent, disabled: el.disabled, checked: el.checked, value: el.value, data: { ...el.dataset } } : null }, sel)
const schedule = async () => (await s.page.evaluate(() => window.streams.getSchedule())).data

test('来源与要求「定时与每轮上限」 (v1.0: 设置「运行」): the switch on, the time, the next run as getSchedule says, the rules for a missed round and the close button', async () => {
  await s.page.waitForSelector('[data-part="run"] [data-schedule]', { timeout: 60_000 })
  const sched = await schedule()
  assert.deepEqual([sched.enabled, sched.time, sched.missed], [true, '08:30', false], JSON.stringify(sched))
  assert.equal(sched.lastRoundAt, JSON.parse(readFileSync(join(s.world.library, '_pipeline', 'rounds.jsonl'), 'utf8').trim().split('\n').pop()).startedAt, 'the seed\'s round')
  assert.equal((await run('[data-schedule]')).data.schedule, 'on')
  assert.equal((await run('input[data-field="schedule-on"]')).checked, true)
  assert.equal((await run('input[data-field="schedule-time"]')).value, '08:30')
  const next = await run('[data-next-run]')
  assert.equal(next.data.nextRun, sched.nextRunAt)
  assert.equal(next.text, fmt(SETTINGS.scheduleNext, { when: nextText(sched.nextRunAt, NEXT_WHEN) }))
  assert.ok(new Date(sched.nextRunAt).getTime() > Date.now(), 'the next run is ahead')
  const text = (await run('[data-schedule]')).text
  for (const words of [SETTINGS.scheduleOn, SETTINGS.scheduleMissed, SETTINGS.scheduleClose]) assert.ok(text.includes(words), words)
})

test('a new time → the library streams.json (v1.0: settings.json) and the next run move; 25:00 through the bridge is bad_arguments; a time the field cannot hold is refused on the page', async () => {
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '21:15')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-schedule-note]') !== null, null, POLL)
  assert.deepEqual(scheduleOf(s.world.library), { enabled: true, time: '21:15' })
  const sched = await schedule()
  assert.equal(new Date(sched.nextRunAt).getHours() * 60 + new Date(sched.nextRunAt).getMinutes(), 21 * 60 + 15)
  await s.page.waitForFunction(iso => document.querySelector('[data-part="run"] [data-next-run]')?.dataset.nextRun === iso, sched.nextRunAt, POLL)
  assert.equal((await run('[data-schedule-note]')).text, SETTINGS.scheduleSaved)
  // the bridge: 25:00, 24:00, a missing switch, an extra key — refused, nothing written
  const before = configBytes(s.world.library)
  for (const bad of [{ enabled: true, time: '25:00' }, { enabled: true, time: '24:00' }, { time: '07:00' }, { enabled: true, time: '07:00', every: 2 }]) {
    const r = await s.page.evaluate(v => window.streams.setSchedule(v), bad)
    assert.deepEqual(r, { ok: false, error: { code: 'bad_arguments' } }, JSON.stringify(bad))
  }
  assert.equal(configBytes(s.world.library), before, 'nothing written')
  // the page: the field cannot hold 25:00 (an empty value), and the page writes nothing for it
  await s.page.evaluate(() => { const el = document.querySelector('[data-part="run"] input[data-field="schedule-time"]'); el.value = '25:00'; el.dispatchEvent(new Event('change', { bubbles: true })) })
  await s.page.waitForFunction(t => document.querySelector('[data-part="run"] [data-schedule-note]')?.textContent === t, SETTINGS.scheduleBad, POLL)
  assert.equal(configBytes(s.world.library), before, 'nothing written from the page either')
})

test('the switch off → the library streams.json (v1.0: settings.json), 「定时没开」, the time field disabled; on again → back', async () => {
  await s.page.click('[data-part="run"] input[data-field="schedule-on"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule === 'off', null, POLL)
  assert.deepEqual(scheduleOf(s.world.library), { enabled: false, time: '21:15' })
  assert.equal((await run('[data-next-run]')).text, SETTINGS.scheduleOff)
  assert.equal((await run('input[data-field="schedule-time"]')).disabled, true)
  assert.equal((await schedule()).nextRunAt, null)
  await s.page.click('[data-part="run"] input[data-field="schedule-on"]')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule === 'on', null, POLL)
  assert.deepEqual(scheduleOf(s.world.library), { enabled: true, time: '21:15' })
})

test('今日\'s top bar: 「下次运行 …」 from getHome().nextRun with the schedule on; 「定时没开」 with it off', async () => {
  await s.page.click('.st-lib-tabs [data-tab="overview"]')
  await ready(s.page, 'overview')
  const home = (await s.page.evaluate(() => window.streams.getHome())).data
  const sched = await schedule()
  assert.equal(home.nextRun, sched.nextRunAt, 'getHome().nextRun is getSchedule().nextRunAt')
  const subtitle = () => s.page.evaluate(() => document.querySelector('main[data-screen="overview"]') ? document.querySelector('[data-part="next-run"]')?.textContent ?? '' : '')
  const on = await subtitle()
  const want = fmt(TODAY.nextRun.at, { when: nextText(sched.nextRunAt, NEXT_WHEN) })
  assert.ok(on.includes(want), `${on} has ${want}`)
  assert.equal(on.includes(TODAY.nextRun.none), false, 'control: not 「定时没开」')
  assert.equal((await s.page.evaluate(() => window.streams.setSchedule({ enabled: false, time: '21:15' }))).ok, true)
  // the screen reads its data when it opens: away and back
  await s.page.click('.st-lib-tabs [data-tab="inbox"]')
  await ready(s.page, 'inbox')
  await s.page.click('.st-lib-tabs [data-tab="overview"]')
  await ready(s.page, 'overview')
  const off = await subtitle()
  assert.ok(off.includes(TODAY.nextRun.none), off)
  assert.equal(off.includes(fmt(TODAY.nextRun.at, { when: '' }).trim()), false, 'control: no 「下次运行」')
})

test('no page errors (session A)', () => {
  assert.deepEqual(s.errors, [])
})

const b = worldSession({
  kind: 'empty',
  waitFor: 'first-run',
  settings: { schedule: { enabled: false, time: '08:30' } },
  prepare: world => { mkdirSync(join(world.root, 'chosen')) },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: join(world.root, 'chosen') }),
})
const stepIs = id => b.page.waitForFunction(i => document.querySelector('main[data-screen="first-run"][data-state="ready"] .fr-body')?.dataset.step === i, id, POLL)

test('首次设置: after the first round, 下一步 → the last screen 「定时」: every day at 08:30, in the tray, the rules; five steps in the sidebar', async () => {
  const steps = await b.page.evaluate(() => [...document.querySelectorAll('.st-sidebar [data-step]')].map(e => e.dataset.step))
  assert.deepEqual(steps, ['folder', 'connection', 'pack', 'trial', 'schedule'])
  await b.page.click('[data-action="choose-folder"] button')
  await b.page.waitForFunction(() => document.querySelector('[data-folder-path]') !== null, null, POLL)
  await b.page.click('[data-action="next"] button')
  await stepIs('connection')
  await b.page.click('[data-action="skip"] button')
  await stepIs('pack')
  await b.page.click('[data-pack="blank"]')
  await b.page.click('[data-action="apply"] button')
  await b.page.waitForFunction(() => document.querySelector('[data-part="tried"]') !== null, null, POLL)
  await b.page.click('[data-action="continue"] button')
  await stepIs('trial')
  await b.page.click('[data-action="start"] button')
  await b.page.waitForFunction(() => document.querySelector('[data-part="round-progress"]')?.dataset.done === 'true', null, POLL)
  assert.equal(await b.page.evaluate(() => document.querySelector('[data-action="go-today"]')), null, 'the wizard does not end at the round any more')
  await b.page.click('[data-action="next"] button')
  await stepIs('schedule')
  assert.equal(await b.page.evaluate(() => document.querySelector('.st-sidebar [data-step="schedule"]').dataset.stepState), 'current')
  const card = await b.page.evaluate(() => { const el = document.querySelector('[data-part="schedule"]'); return { time: el.dataset.time, every: el.querySelector('[data-every]').textContent, text: el.textContent } })
  assert.equal(card.time, '08:30')
  assert.equal(card.every, fmt(FIRST_RUN.schedule.every, { time: '08:30' }))
  assert.ok(card.text.includes(FIRST_RUN.schedule.where), card.text)
  const rules = await b.page.evaluate(() => document.querySelector('[data-part="schedule-rules"]').textContent)
  assert.ok(rules.includes(FIRST_RUN.schedule.missed) && rules.includes(FIRST_RUN.schedule.close), rules)
})

test('首次设置 「定时」: 完成 = setSchedule with the default → the new library streams.json (v1.0: settings.json) { enabled: true, time: 08:30 }, then 待看', async () => {
  const chosen = join(b.world.root, 'chosen')
  assert.deepEqual(scheduleOf(chosen), { enabled: false, time: '08:30' }, 'control: the world started with it off (settings.json\'s, written into the new library)')
  await b.page.click('[data-action="go-inbox"] button')
  await ready(b.page, 'inbox')
  assert.deepEqual(scheduleOf(chosen), { enabled: true, time: '08:30' })
  assert.equal((await b.page.evaluate(() => window.streams.getSchedule())).data.enabled, true)
})

test('no page errors (session B)', () => {
  assert.deepEqual(b.errors, [])
})
