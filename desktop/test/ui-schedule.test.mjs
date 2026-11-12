// redesign R4b: 定时与上限 is one line with one 保存 ([data-action="save-run"]; v2 package F saved the switch and the time as they
// changed), its note [data-part="run-note"] (was [data-schedule-note]) and its words texts/sources.js SOURCES.run; the line under it
// says the next run, that Streams has to be running, the missed run made up once and the cap (P14) — the close button's rule is not
// on this page any more (design). Each test now presses 保存 after the change; what it checks is unchanged.
// redesign R4a: session B no longer walks 新建库's four steps to its last screen (the wizard is gone): it checks the 定时 line of the one-page form (see below).
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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NEXT_WHEN } from '../src/renderer/texts/common.js'
import { NEW_LIBRARY } from '../src/renderer/texts/first-run.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { SHELL } from '../src/renderer/texts/shell.js'
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
  // redesign R4b: the line under the row — the next run, then the rules (Streams running, a missed run made up once, the cap)
  assert.equal(next.text, `${fmt(SOURCES.run.next, { when: nextText(sched.nextRunAt, NEXT_WHEN) })}${SOURCES.run.rule}`)
  assert.ok(new Date(sched.nextRunAt).getTime() > Date.now(), 'the next run is ahead')
  const text = (await run('[data-schedule]')).text
  for (const words of [SOURCES.run.daily, SOURCES.run.at, SOURCES.run.capAfter]) assert.ok(text.includes(words), words)
})

test('a new time → the library streams.json (v1.0: settings.json) and the next run move; 25:00 through the bridge is bad_arguments; a time the field cannot hold is refused on the page', async () => {
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '21:15')
  await s.page.click('[data-part="run"] [data-action="save-run"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'saved', null, POLL)
  assert.deepEqual(scheduleOf(s.world.library), { enabled: true, time: '21:15' })
  const sched = await schedule()
  assert.equal(new Date(sched.nextRunAt).getHours() * 60 + new Date(sched.nextRunAt).getMinutes(), 21 * 60 + 15)
  await s.page.waitForFunction(iso => document.querySelector('[data-part="run"] [data-next-run]')?.dataset.nextRun === iso, sched.nextRunAt, POLL)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run-note"]').textContent), SOURCES.run.saved)
  // the bridge: 25:00, 24:00, a missing switch, an extra key — refused, nothing written
  const before = configBytes(s.world.library)
  for (const bad of [{ enabled: true, time: '25:00' }, { enabled: true, time: '24:00' }, { time: '07:00' }, { enabled: true, time: '07:00', every: 2 }]) {
    const r = await s.page.evaluate(v => window.streams.setSchedule(v), bad)
    assert.deepEqual(r, { ok: false, error: { code: 'bad_arguments' } }, JSON.stringify(bad))
  }
  assert.equal(configBytes(s.world.library), before, 'nothing written')
  // the page: the field cannot hold 25:00 (an empty value), and the page writes nothing for it
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '25:00')
  await s.page.click('[data-part="run"] [data-action="save-run"] button')
  await s.page.waitForFunction(t => document.querySelector('[data-part="run-note"]')?.textContent === t, SOURCES.run.timeBad, POLL)
  assert.equal(configBytes(s.world.library), before, 'nothing written from the page either')
  await s.page.fill('[data-part="run"] input[data-field="schedule-time"]', '21:15')
})

test('the switch off → the library streams.json (v1.0: settings.json), 「定时没开」, the time field disabled; on again → back', async () => {
  await s.page.click('[data-part="run"] input[data-field="schedule-on"]')
  await s.page.click('[data-part="run"] [data-action="save-run"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule === 'off', null, POLL)
  assert.deepEqual(scheduleOf(s.world.library), { enabled: false, time: '21:15' })
  assert.equal((await run('[data-next-run]')).text, `${SOURCES.run.off}${SOURCES.run.rule}`)
  assert.equal((await run('input[data-field="schedule-time"]')).disabled, true)
  assert.equal((await schedule()).nextRunAt, null)
  await s.page.click('[data-part="run"] input[data-field="schedule-on"]')
  await s.page.click('[data-part="run"] [data-action="save-run"] button')
  await s.page.waitForFunction(() => document.querySelector('[data-part="run"] [data-schedule]')?.dataset.schedule === 'on', null, POLL)
  assert.deepEqual(scheduleOf(s.world.library), { enabled: true, time: '21:15' })
})

// redesign R1: 概览 is gone; the next run is the chip beside the library head's run button on every tab (N06), in its words
// (SHELL.head.run: 「下次运行 …」 / 「未开启定时运行」); 「away and back」 goes by 来源与要求
test('the library head\'s chip: 「下次运行 …」 from getHome().nextRun with the schedule on; 「未开启定时运行」 with it off', async () => {
  await s.page.click('.st-lib-tabs [data-tab="inbox"]')
  await ready(s.page, 'inbox')
  const home = (await s.page.evaluate(() => window.streams.getHome())).data
  const sched = await schedule()
  assert.equal(home.nextRun, sched.nextRunAt, 'getHome().nextRun is getSchedule().nextRunAt')
  const subtitle = () => s.page.evaluate(() => document.querySelector('[data-part="library-head"] [data-part="next-run"]')?.textContent ?? '')
  await s.page.waitForFunction(() => document.querySelector('[data-part="next-run"]')?.textContent !== '', null, POLL)
  const on = await subtitle()
  const want = fmt(SHELL.head.run.next, { when: nextText(sched.nextRunAt, NEXT_WHEN) })
  assert.ok(on.includes(want), `${on} has ${want}`)
  assert.equal(on.includes(SHELL.head.run.nextNone), false, 'control: not 「未开启定时运行」')
  assert.equal((await s.page.evaluate(() => window.streams.setSchedule({ enabled: false, time: '21:15' }))).ok, true)
  // the screen reads its data when it opens: away and back
  await s.page.click('.st-lib-tabs [data-tab="sources"]')
  await ready(s.page, 'sources')
  await s.page.click('.st-lib-tabs [data-tab="inbox"]')
  await ready(s.page, 'inbox')
  await s.page.waitForFunction(t => document.querySelector('[data-part="next-run"]')?.textContent.includes(t), SHELL.head.run.nextNone, POLL)
  const off = await subtitle()
  assert.ok(off.includes(SHELL.head.run.nextNone), off)
  assert.equal(off.includes(fmt(SHELL.head.run.next, { when: '' }).trim()), false, 'control: no 「下次运行」')
})

test('no page errors (session A)', () => {
  assert.deepEqual(s.errors, [])
})

// redesign R4a: 新建库 is one page (screens/new-library.js; design P04, F47): 「定时」 is a line of the form — 每天 [时刻] 自动运行 · 单次运行
// 最多 [n] 次模型调用 — not the last step of a wizard any more (v2 package I's four steps are gone), so session B checks that line:
// it starts from the app's schedule (the world's settings.json: 08:30, off — the control), the time and the switch the user sets
// are what the new library's streams.json gets, and so is the cap. The rule (the library's own schedule, in its streams.json) is
// the one the old session checked.
const b = worldSession({
  kind: 'empty',
  waitFor: 'new-library',
  settings: { schedule: { enabled: false, time: '08:30' } },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), STREAMS_START_SCREEN: 'new-library' }),
})

test("新建库 (redesign R4a): the 定时 line starts from the app's schedule (08:30, off); 每天 checked and 06:45 typed, the cap 30 → the new library's streams.json", async () => {
  await b.page.waitForFunction(() => document.querySelector('main[data-screen="new-library"][data-state="ready"] [data-part="folder-state"]')?.dataset.state !== '', null, POLL)
  assert.deepEqual(await b.page.evaluate(() => [document.querySelector('[data-field="daily"]').checked, document.querySelector('[data-field="time"]').value, document.querySelector('[data-field="cap"]').value]), [false, '08:30', '120'], "control: the app's schedule, off")
  assert.equal(await b.page.evaluate(w => document.querySelector('[data-part="schedule"]').textContent.includes(w), NEW_LIBRARY.capAfter), true)
  await b.page.fill('[data-field="name"]', '定时库')
  await b.page.fill('[data-field="brief"]', '追踪电池价格。')
  await b.page.check('[data-field="daily"]')
  await b.page.fill('[data-field="time"]', '06:45')
  await b.page.fill('[data-field="cap"]', '30')
  await b.page.click('[data-action="create-only"] button')
  await ready(b.page, 'inbox')
  const dir = join(b.world.root, 'new-libs', '定时库')
  assert.deepEqual(scheduleOf(dir), { enabled: true, time: '06:45' })
  assert.equal(JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8')).pipeline.cap, 30)
  assert.deepEqual((await b.page.evaluate(() => window.streams.getSchedule())).data.enabled, true, "the new (current) library's")
})

test('no page errors (session B)', () => {
  assert.deepEqual(b.errors, [])
})
