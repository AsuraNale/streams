// 1.1.1 P11a in the real window (docs/checks/2026-11-24-1.1.1/handoff/2026-11-24-v1.1.1-acceptance.md A10, A11, A14; 场景五①):
//   库架   each card has its schedule's tag and a 「更多」 (在资源管理器中显示 · 关掉 / 打开定时 · 移除该库); removing goes through the
//          same dialog as 高级设置's — only the registration goes, the folder is untouched — and afterwards neither getQueue nor
//          the right panel's 「下次运行时间」 has it (待办 C4: it stayed as 「（未登记的库）」)
//   来源与要求  a library brought up from 1.1.0 (no how-often, a weekly card): one line and 「按节奏设」, which sets it weekly
//   新建库  the cost line names the connection in use; on Codex it names no other connection's quota (待办 A4)
//   问库    「待看里还有 n 条没收藏，问库不看」 when 待看 has items
// Two libraries made with the core: one by confirming a weekly card (its schedule set by the card's rhythm), one written as
// 1.1.0 left it (the same card, no schedule yet: every day). With STREAMS_P11A_SHOTS=<folder> the window is shown and the
// pictures are saved there. Each check holds first the state that would make it fail.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { SHELL } from '../src/renderer/texts/shell.js'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { BUILD } from '../src/renderer/texts/build.js'
import { ASK } from '../src/renderer/texts/ask.js'
import { PANEL } from '../src/renderer/texts/panel.js'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { scheduleTag } from '../src/renderer/lib/schedule-words.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const SHOTS = process.env.STREAMS_P11A_SHOTS && isAbsolute(process.env.STREAMS_P11A_SHOTS) ? process.env.STREAMS_P11A_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
// W4's confirmed card 2 (「每周一次」), from the core's test fixture (the mutation mirror has no docs/)
const CARD = JSON.parse(readFileSync(join(REPO_DIR, 'core', 'test', 'fixtures', 'w4-cards.json'), 'utf8')).cards.find(c => c.n === 2).card

const L = {}
const s = worldSession({
  kind: 'empty',
  waitFor: 'load',
  prepare: async world => {
    // made by confirming the card (1.1.1): weekly, by the card's 「每周一次」
    const made = await core.cardHandlers({ libraryDirFor: c => join(world.root, 'libs', `${c.name}-新`) }).create_library({ card: CARD }, { now: () => new Date() })
    L.weekly = made.object.id
    // as 1.1.0 left it: the same card, no schedule in streams.json yet (read as every day)
    L.old = join(world.root, 'libs', `${CARD.name}-旧`)
    core.createLibrary(L.old, { name: `${CARD.name}（旧）`, language: 'zh-CN' })
    core.writeCard(L.old, CARD)
    core.putMissingInInbox(L.old, { item: { url: 'https://example.org/notice/1', title: '一条待看', date: '2026-11-24' } })
    let reg = core.emptyRegistry()
    const ids = []
    for (const [dir, name] of [[L.weekly, `${CARD.name}（新）`], [L.old, `${CARD.name}（旧）`]]) {
      const r = core.withLibrary(reg, dir, { name })
      reg = r.registry
      ids.push(r.entry.id)
    }
    L.ids = ids
    core.writeRegistry(join(world.appData, 'libraries.json'), core.withActive(reg, ids[1]))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' }, theme: 'research', appearance: 'light' },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'shelf', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`) }) } }
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const scheduleOn = dir => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8')).schedule
const treeHash = dir => {
  const h = createHash('sha256')
  const walk = d => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else h.update(`${p.slice(dir.length)}\n`).update(readFileSync(p)) } }
  walk(dir)
  return h.digest('hex')
}
const tagOf = id => s.page.evaluate(i => { const t = document.querySelector(`[data-shelf-card="${i}"] [data-part="schedule-tag"]`); return t ? { text: t.textContent, kind: t.dataset.schedule } : null }, id)
async function moreOn(id) {
  await s.page.click(`[data-shelf-item="${id}"] [data-action="card-more"] button`)
  await until(() => document.querySelector('[data-menu]') !== null)
  return s.page.evaluate(() => [...document.querySelectorAll('[data-menu] [data-menu-item]')].map(e => [e.dataset.menuItem, e.textContent]))
}

describe('P11a: 库架\'s 更多 and schedule tags, 定时 by the rhythm, the cost line, 问库\'s line', () => {
  test('A10 / A11: each card shows its schedule — the confirmed weekly card weekly, the one from 1.1.0 every day', async () => {
    try { await until(() => document.querySelectorAll('[data-shelf-card]').length === 2) } catch (e) { throw new Error(`${e.message}; page: ${await s.page.evaluate(() => JSON.stringify({ screen: document.querySelector('main[data-screen]')?.dataset.screen, cards: document.querySelectorAll('[data-shelf-card]').length, text: document.querySelector('main')?.innerText.slice(0, 300) }))}`) }
    const weekly = scheduleOn(L.weekly)
    assert.equal(weekly.every, 'week', `confirming the card set it weekly: ${JSON.stringify(weekly)}`)
    assert.deepEqual(await tagOf(L.ids[0]), { text: scheduleTag(weekly), kind: 'week' })
    // the 1.1.0 one: no how-often — every day (the test world's settings.json has timed runs off, which a library without its own
    // schedule takes on its first read; the tag says what is on disk)
    await until(i => document.querySelector(`[data-shelf-card="${i}"] [data-part="schedule-tag"]`) !== null, L.ids[1])
    const old = scheduleOn(L.old)
    assert.equal(old?.every, undefined, `the 1.1.0 one has no how-often: ${JSON.stringify(old)}`)
    assert.deepEqual(await tagOf(L.ids[1]), { text: scheduleTag(old), kind: old.enabled ? 'day' : 'off' })
    await shot('shelf')
    if (SHOTS) {
      await s.page.evaluate(() => window.streams.setAppearance('dark'))
      await s.page.waitForTimeout(600)
      await shot('shelf-dark')
      await s.page.evaluate(() => window.streams.setAppearance('light'))
      await s.page.waitForTimeout(600)
    }
  })

  test('A11: 「更多」 — 在资源管理器中显示 (any library, not only the current one); 关掉定时 then 打开定时', async () => {
    const items = await moreOn(L.ids[0])
    assert.deepEqual(items, [['reveal', SHELL.shelf.more.reveal], ['schedule-off', SHELL.shelf.more.scheduleOff], ['remove', SHELL.shelf.more.remove]])
    await shot('shelf-more')
    // a shown window is not a test run: it would really open File Explorer, so the pictures' run leaves this item alone
    if (!SHOTS) {
      await s.page.click('[data-menu] [data-menu-item="reveal"]')
      await until(() => document.querySelector('[data-menu]') === null)
      for (let i = 0; i < 100 && !log().includes(`not revealed in a test run: ${L.weekly}`); i++) await s.page.waitForTimeout(100)
      assert.ok(log().includes(`not revealed in a test run: ${L.weekly}`), 'the weekly library\'s folder, though the other one is current')
    } else {
      await s.page.keyboard.press('Escape')
      await until(() => document.querySelector('[data-menu]') === null)
    }
    await moreOn(L.ids[0])
    await s.page.click('[data-menu] [data-menu-item="schedule-off"]')
    await until(i => document.querySelector(`[data-shelf-card="${i}"] [data-part="schedule-tag"]`)?.dataset.schedule === 'off', L.ids[0])
    assert.equal(scheduleOn(L.weekly).enabled, false)
    assert.equal(scheduleOn(L.weekly).every, 'week', 'turning it off keeps how often')
    await moreOn(L.ids[0])
    await s.page.click('[data-menu] [data-menu-item="schedule-on"]')
    await until(i => document.querySelector(`[data-shelf-card="${i}"] [data-part="schedule-tag"]`)?.dataset.schedule === 'week', L.ids[0])
    assert.equal(scheduleOn(L.weekly).enabled, true)
  })

  test('A10: the library from 1.1.0 — 来源与要求 says its card is weekly and its schedule every day; 「按节奏设」 makes it weekly, as the user\'s own change', async () => {
    await s.page.click(`[data-shelf-card="${L.ids[1]}"]`)
    await ready(s.page, 'inbox')
    await s.page.click('nav.st-lib-tabs button[data-tab="sources"]')
    await until(() => document.querySelector('[data-part="run-mismatch"]') !== null)
    const line = await s.page.evaluate(() => document.querySelector('[data-part="run-mismatch"]').textContent)
    assert.ok(line.includes('每周一次') && line.includes('每天'), line)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-field="schedule-every"]').value), 'day')
    await s.page.evaluate(() => document.querySelector('[data-part="run"]').scrollIntoView({ block: 'center' }))
    await shot('sources-mismatch')
    await s.page.click('[data-action="to-rhythm"] button')
    await until(() => document.querySelector('[data-part="run-mismatch"]') === null && document.querySelector('[data-field="schedule-every"]')?.value === 'week')
    const sch = scheduleOn(L.old)
    assert.equal(sch.every, 'week')
    assert.equal(sch.days.length, 1)
    assert.equal(sch.time, '08:30', 'the time it had')
    const changes = readFileSync(join(L.old, '_pipeline', 'changes.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    assert.ok(changes.some(c => c.field === 'schedule' && c.by === 'you' && c.after?.every === 'week'), 'recorded as the user\'s own change')
    await s.page.evaluate(() => document.querySelector('[data-part="run"]').scrollIntoView({ block: 'center' }))
    await shot('sources-weekly')
  })

  test('A10: 来源与要求\'s 定时 takes how often — two weekdays saved; none chosen is refused and nothing written', async () => {
    // timed runs on first (the test world has them off), then a second day
    if (!(await s.page.evaluate(() => document.querySelector('[data-field="schedule-on"]').checked))) await s.page.click('[data-field="schedule-on"]')
    await s.page.click('[data-weekday="5"]')
    await s.page.click('[data-action="save-run"] button')
    await until(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'saved')
    assert.equal(scheduleOn(L.old).days.includes(5), true)
    assert.equal(scheduleOn(L.old).days.length, 2, 'two days a week')
    const before = readFileSync(join(L.old, 'streams.json'), 'utf8')
    for (const n of scheduleOn(L.old).days) await s.page.click(`[data-weekday="${n}"]`)
    await s.page.click('[data-action="save-run"] button')
    await until(() => document.querySelector('[data-part="run-note"]')?.dataset.kind === 'bad')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run-note"]').textContent), SOURCES.run.weekdayNone)
    assert.equal(readFileSync(join(L.old, 'streams.json'), 'utf8'), before, 'nothing written')
  })

  test('场景五①: 问库 says 待看 still has items it does not read', async () => {
    await s.page.click('nav.st-lib-tabs button[data-tab="ask"]')
    await until(() => document.querySelector('[data-part="inbox-not-read"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="inbox-not-read"]').textContent), fmt(ASK.inboxNotRead, { n: 1 }))
    await shot('ask-line')
  })

  test('A14: 新建库\'s cost line names the connection in use — on Codex no other connection\'s quota', async () => {
    await s.page.click('[data-action="add-library"]')
    await ready(s.page, 'build')
    const cost = () => s.page.evaluate(() => document.querySelector('[data-part="build-cost"]')?.textContent ?? null)
    assert.equal(await cost(), fmt(BUILD.cost, { name: CONNECTIONS.names['claude-code'] }), 'on Claude Code: its own quota')
    const set = await s.page.evaluate(() => window.streams.setActiveConnection('codex'))
    assert.ok(set.ok, JSON.stringify(set))
    await until(() => document.querySelector('[data-part="start-why"]') !== null)
    const c = await cost()
    assert.ok(!c.includes(CONNECTIONS.names['claude-code']), `on Codex the line names no other connection: ${c}`)
    await shot('build-codex')
    await s.page.evaluate(() => window.streams.setActiveConnection('claude-code'))
    await until(() => document.querySelector('[data-part="start-why"]') === null)
  })

  test('A11 / 待办 C4: 移除该库 from 库架 — the same dialog, the folder untouched; then not in the queue, not in 下次运行时间', async () => {
    await s.page.click('.st-sidebar [data-nav="shelf"]')
    await until(() => document.querySelectorAll('[data-shelf-card]').length === 2)
    const id = L.ids[0]
    // the failing state first: it has a timed slot, so it is in the queue's 「下次运行时间」
    const q0 = (await s.page.evaluate(() => window.streams.getQueue())).data
    assert.ok(q0.next.some(n => n.libraryId === id), `in the queue before: ${JSON.stringify(q0.next)}`)
    const hash = treeHash(L.weekly)
    await moreOn(id)
    await s.page.click('[data-menu] [data-menu-item="remove"]')
    await until(() => document.querySelector('[data-dialog="remove-library"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="remove-path"]').textContent), L.weekly)
    await shot('shelf-remove')
    await s.page.click('[data-action="confirm-remove"] button')
    await until(() => document.querySelectorAll('[data-shelf-card]').length === 1)
    const q1 = (await s.page.evaluate(() => window.streams.getQueue())).data
    assert.ok(!q1.next.some(n => n.libraryId === id), `not in the queue after: ${JSON.stringify(q1.next)}`)
    await until(u => !(document.querySelector('[data-part="next"]')?.textContent ?? '').includes(u), PANEL.progress?.unknownLibrary ?? PANEL.unknownLibrary ?? '（未登记的库）')
    assert.equal(treeHash(L.weekly), hash, 'not one file of the folder changed')
  })

  test('no page errors', () => { assert.deepEqual(s.errors, []) })
})
