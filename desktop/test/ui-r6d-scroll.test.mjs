// Redesign R6d (total acceptance, R6d-6): 高级设置 opens at its top. 来源与要求 and 高级设置 are one scrolling body
// (screens/sources.js, data-view main / advanced); 高级设置's link is at the bottom of 来源与要求, so the scroll that took the
// person down there was kept and 高级设置 showed its own middle — whether it did depended on how long 来源与要求 was (it began
// to after R6d's styles hid the brief's repeated block name; found by the v2 draft's UC3 step 4 picture). A change of view now
// starts at the top, both ways.
// Fails on the code before the fix: the body is still scrolled when 高级设置 is ready. Control: 来源与要求 really is scrolled
// before the click (so a top that was never left proves nothing), and the body can be scrolled on 高级设置 too (it is long
// enough that a kept scroll would show). On a broken copy (scripts/mutation-check.mjs r6d-advanced-scroll): red.
// 1.1 W7b: the world's library is one the last version made (seed.mjs), so its 来源与要求 is the notice, its brief and its
// sources read only; 高级设置 is 变更记录 and 库文件夹. Both are made long enough here the way a library gets long: more sources
// in its streams.json, more lines in its change history (written by the core, by you).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { seedPlanB, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)

const s = worldSession({
  kind: 'seeded',
  waitFor: 'sources',
  prepare: async world => {
    await seedPlanB(world)
    const file = join(world.library, 'streams.json')
    const before = core.snapshot(world.library, ['sources', 'schedule'])
    const cfg = JSON.parse(readFileSync(file, 'utf8'))
    for (let i = 1; i <= 8; i++) cfg.sources.push({ name: `blog-${i}`, kind: 'rss', url: `http://127.0.0.1:9/feed-${i}.xml`, max_results: 20 })
    writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
    core.recordChanges(world.library, before, core.snapshot(world.library, ['sources', 'schedule']), { by: 'you' })
    for (let i = 0; i < 50; i++) {
      const b = core.snapshot(world.library, ['schedule'])
      core.saveLibrarySchedule(world.library, { enabled: false, time: `${String(6 + (i % 12)).padStart(2, '0')}:${i % 2 ? '30' : '00'}` })
      core.recordChanges(world.library, b, core.snapshot(world.library, ['schedule']), { by: 'you', now: () => new Date(Date.now() - (60 - i) * 60_000) })
    }
  },
  settings: world => ({ libraryPath: world.library }),
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'sources' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const body = () => s.page.evaluate(() => {
  const b = document.querySelector('main[data-screen="sources"] .st-src-body')
  const h = b?.querySelector('h2#sources-title')
  return b ? { view: b.dataset.view, top: b.scrollTop, room: b.scrollHeight - b.clientHeight, title: h ? h.getBoundingClientRect().top - b.getBoundingClientRect().top : null } : null
})

test('R6d 高级设置 opened from the bottom of 来源与要求 shows its top; 返回来源与要求 shows 来源与要求\'s top', async () => {
  await until(() => document.querySelector('main[data-screen="sources"][data-state="ready"] [data-part="old-sources"]') !== null)
  // to the bottom of 来源与要求, where the link is (a person scrolls there to reach it)
  await s.page.evaluate(() => { const b = document.querySelector('.st-src-body'); b.scrollTop = b.scrollHeight })
  await until(() => document.querySelector('.st-src-body').scrollTop > 0)
  const before = await body()
  assert.equal(before.view, 'main')
  assert.ok(before.top > 200, `control: 来源与要求 is scrolled down before the click (${before.top}px)`)
  await s.page.evaluate(() => document.querySelector('main[data-screen="sources"] [data-action="go-advanced"]').click())
  await until(() => document.querySelector('[data-view="advanced"] [data-part="changes"][data-state="ready"]') !== null)
  await sleep(3500) // the frame's own placing of a remembered scroll tries for 3 s at most: what is seen after it is what stays
  const adv = await body()
  assert.equal(adv.view, 'advanced')
  assert.ok(adv.room > before.top, `control (${before.top}px on 来源与要求): 高级设置 is long enough that the scroll kept from 来源与要求 would show (${adv.room}px of room)`)
  assert.equal(adv.top, 0, '高级设置 starts at its top')
  assert.ok(adv.title !== null && adv.title >= 0 && adv.title < 200, `its title is in sight (${adv.title}px from the top)`)
  // and back: 来源与要求 from its top
  await s.page.evaluate(() => { const b = document.querySelector('.st-src-body'); b.scrollTop = b.scrollHeight })
  await until(() => document.querySelector('.st-src-body').scrollTop > 0)
  await s.page.evaluate(() => document.querySelector('[data-view="advanced"] [data-action="back-sources"]').click())
  await until(() => document.querySelector('main[data-screen="sources"] [data-view="main"] [data-part="old-sources"]') !== null)
  await sleep(3500)
  const back = await body()
  assert.equal(back.view, 'main')
  assert.equal(back.top, 0, '来源与要求 starts at its top again')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
