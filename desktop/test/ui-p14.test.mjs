// 1.1.1 P14 动效 (docs/checks/2026-11-24-1.1.1/p14/scorecard.json; acceptance A16–A19), in the real window, read from the page's
// own list of animations (document.getAnimations(): every animation of the app is named st-mo-*, motion.css; the ones made in
// script carry the same names as their id). One world: the shelf's three libraries, the first with a card and two fake sources
// (STREAMS_DEV_READS), the update agent stand-in holding (STREAMS_DEV_UPDATE_SCRIPT), the build stand-in (STREAMS_DEV_BUILD) and
// 问库's scripted answer held back (STREAMS_DEV_ASK_SCRIPT with delayMs).
//   A16  nothing going on: no looping animation; a run going on: one loop each where it shows (待看's step, the head's run
//        label, 进度's running row, the sidebar's library) and none on the libraries that do not run; the build conversation and
//        问库 waiting for a reply: their dots; when it is over, still again
//   A18  减少动态效果 (emulated), the four themes one by one: no loop at all, the running library still marked (its still ring),
//        the others not; a card leaves with no movement
//   A17  C pressed three times at once keeps three items (none lost, none twice), each card leaving as it goes and the ones
//        below moving up; 放弃 → down, its bar coming up; 撤销 → the card back at its place, fading in; 稍后处理 → to the right;
//        last: C pressed and the app killed 60 ms later (mid-animation) — the item is kept on disk (the call went when pressed)
//   A19  every animation seen, its duration in its band: small ≤ 120 ms, in/out 160–240, big 240–320, loops 1.4–2 s, the ring
//        0.9 s; a button's hover within 120 ms; new items after a run come in one after another (40 ms apart)
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { THEME_IDS, THEME_TEMPLATE } from '../src/shared/themes.mjs'
import { seedPlanB, seedShelf, worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const SHOTS = process.env.STREAMS_P14_SHOTS && isAbsolute(process.env.STREAMS_P14_SHOTS) ? process.env.STREAMS_P14_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 50, timeout: 90_000 }
const S1 = 'https://p14.example.test/list'
const OLD = 'https://p14.example.test/p/0'
const N = [1, 2].map(n => `https://p14.example.test/p/${n}`)
const sentence = n => `新动态第 ${n} 段：一项设备补助的第 ${n} 条规定，额度 ${n * 10} 万元，申请要交三份材料，截止日期写在官方页上。`
const TEXT = [1, 2, 3, 4].map(sentence).join('\n\n')
const CARD = {
  name: 'AI Agent 记忆', definition: { summary: '一座测试动效的库。', purpose: '测试', scope: '对象：补助', exclude: '无', trust: '官方', rhythm: '每天一次', language: '中文', hard: '无' },
  decide: [], collect: ['补助'], skip: [], sources: [{ name: '目录', url: S1, status: 'ok' }], unreadable: [],
  pick: ['新的先收'], write: ['写清金额'], samples: [{ title: '样例', url: OLD, date: '2026-11-20' }],
}
const item = (url, title) => ({ url, title, date: '2026-11-24', due: '', what: '一项新的设备补助。', points: [1, 2, 3].map(n => ({ text: `第 ${n} 条`, quote: sentence(n) })), why: '在范围里' })
const ANSWER = { answer: [{ text: '库里有记忆方案的评测。', cites: [1] }], notInLibrary: false, missing: '', claimed: ['json-keys', 'cites-in-set', 'cited-sentences', 'claims-supported'], delayMs: 5000 }
const QUESTION = { say: '', question: { text: '这座库拿来做什么？', kind: 'input', options: [] } }

const F = {}
let shelf = null
const s = worldSession({
  kind: 'seeded',
  waitFor: 'inbox',
  prepare: async world => {
    await seedPlanB(world)
    shelf = await seedShelf(world)
    core.writeCard(world.library, CARD)
    const st = core.readUpdateState(world.library)
    core.writeUpdateState(world.library, { ...st, sources: { [S1]: { ok: true, seen: [OLD], firstAt: '2026-11-20T10:00:00.000Z' } }, lastAgentAt: '2026-11-23T10:00:00.000Z' })
    F.reads = join(world.root, 'reads.json')
    F.script = join(world.root, 'update-script.json')
    F.build = join(world.root, 'build.json')
    F.ask = join(world.root, 'ask.json')
    writeFileSync(F.reads, JSON.stringify({ [S1]: { ok: true, links: [OLD, ...N] }, [N[0]]: { ok: true, title: '新补助一', text: TEXT }, [N[1]]: { ok: true, title: '新补助二', text: TEXT } }))
    writeFileSync(F.script, JSON.stringify({ progress: [{ searches: 1, reads: 1, afterMs: 500 }], holdMs: 25_000, items: [item(N[0], '新补助一'), item(N[1], '新补助二')], judgeDelayMs: 0 }))
    // the build: a question after 4 s of the agent working, then the card after 1 s
    writeFileSync(F.build, JSON.stringify({ replies: [{ json: QUESTION, progress: [{ searches: 1, reads: 0, afterMs: 4000 }] }, { json: { say: '请看卡', card: { ...CARD, name: '新库' } }, progress: [{ searches: 1, reads: 1, afterMs: 1000 }] }] }))
    writeFileSync(F.ask, JSON.stringify(ANSWER))
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_READS: F.reads, STREAMS_DEV_UPDATE_SCRIPT: F.script, STREAMS_DEV_BUILD: F.build, STREAMS_DEV_ASK_SCRIPT: F.ask, STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown', STREAMS_DEV_NOTIFY_LOG: '1' } : {}) }),
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' }, theme: 'research', appearance: 'light' },
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [s.page.locator('.st-path'), s.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }

/** The page's animations now: name (a CSS animation's, a transition's property, or a script one's id), timing, where. */
const anims = () => s.page.evaluate(() => document.getAnimations().map(a => {
  const t = a.effect?.getTiming?.() ?? {}
  const el = a.effect?.target ?? null
  const mo = el?.closest?.('[data-mo]')?.dataset.mo ?? el?.dataset?.mo ?? null
  return {
    name: a.animationName ?? (a.transitionProperty ? `transition:${a.transitionProperty}` : a.id ?? ''),
    duration: typeof t.duration === 'number' ? t.duration : Number.parseFloat(String(t.duration)) || 0,
    iterations: t.iterations === Infinity ? 'infinite' : t.iterations ?? 1,
    mo,
    library: el?.closest?.('[data-library-row]')?.dataset.libraryRow ?? null,
    leaving: el?.closest?.('[data-leaving]')?.dataset.leaving ?? null,
    transform: Array.isArray(a.effect?.getKeyframes?.()) && a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none'),
    delay: t.delay ?? 0,
  }
}))
const loops = async () => (await anims()).filter(a => a.iterations === 'infinite')
// every animation seen while the tests ran, for A19
const seen = []
const watch = async (ms, every = 40) => { const end = Date.now() + ms; while (Date.now() < end) { seen.push(...await anims()); await sleep(every) } }

// the band each animation of the app belongs to (motion.css; the names are the keyframes')
const BAND = {
  small: [1, 120], inout: [160, 240], big: [240, 320], loop: [1400, 2000], ring: [850, 950],
}
const BAND_OF = {
  'st-mo-num': 'small', 'st-mo-in': 'inout', 'st-mo-fade': 'inout', 'st-mo-leave-keep': 'inout', 'st-mo-leave-dismiss': 'inout', 'st-mo-leave-later': 'inout',
  'st-mo-back': 'inout', 'st-mo-fill': 'inout', 'st-mo-bar': 'inout', 'st-mo-banner': 'inout', 'st-mo-menu': 'inout', 'st-mo-tick': 'inout', 'st-mo-pop': 'inout',
  'st-mo-glow': 'inout', 'st-mo-shake': 'inout', 'st-mo-dialog': 'big', 'st-mo-rise': 'big', 'st-mo-breathe': 'loop', 'st-mo-dots': 'loop', 'st-mo-shimmer': 'loop', 'st-mo-ring': 'ring',
}

describe('P14: motion', () => {
  test('A16: nothing going on — no looping animation anywhere', async () => {
    await sleep(800)
    assert.deepEqual(await loops(), [])
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('.st-mo-ring').length), 0)
  })

  test('A16 / A19: a run going on — one loop each in 待看\'s step, the head, 进度 and the sidebar; only on the library that runs; the right lengths', async () => {
    await s.page.click('[data-part="run-button"] button')
    await until(() => document.querySelector('[data-step="agent"]')?.dataset.now === 'true')
    await sleep(300)
    const l = await loops()
    const by = id => l.filter(a => a.mo === id)
    for (const id of ['steps', 'head', 'panel', 'sidebar']) assert.equal(by(id).length, 1, `${id}: ${JSON.stringify(l)}`)
    assert.ok(by('steps').every(a => a.name === 'st-mo-breathe' && a.duration === 1800), JSON.stringify(by('steps')))
    assert.ok(by('sidebar').every(a => a.name === 'st-mo-ring' && a.duration === 900), JSON.stringify(by('sidebar')))
    assert.deepEqual([...new Set(by('sidebar').map(a => a.library))], [shelf.ids[0]], 'the ring is on the library that runs only')
    assert.equal(l.length, 4, `no other loop: ${JSON.stringify(l)}`)
    seen.push(...await anims())
    await shot('running')
  })

  test('A18: 减少动态效果, the four themes — no loop; the running library still marked, the others not; then motion again', async () => {
    await s.page.emulateMedia({ reducedMotion: 'reduce' })
    for (const theme of THEME_IDS) {
      assert.equal((await s.page.evaluate(t => window.streams.setTheme(t), theme)).ok, true)
      await until(([t, cls]) => document.documentElement.dataset.theme === t && document.body.className === cls && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, THEME_TEMPLATE[theme].bodyClass])
      await sleep(300)
      assert.deepEqual(await loops(), [], `${theme}: no loop`)
      const marks = await s.page.evaluate(() => [...document.querySelectorAll('[data-library-row]')].map(r => {
        const ring = r.querySelector('.st-mo-ring')
        const st = ring ? getComputedStyle(ring) : null
        return { id: r.dataset.libraryRow, ring: Boolean(ring), seen: st ? st.borderTopWidth !== '0px' && st.borderTopColor !== 'rgba(0, 0, 0, 0)' && st.visibility !== 'hidden' && st.display !== 'none' : false }
      }))
      assert.deepEqual(marks.filter(m => m.ring).map(m => m.id), [shelf.ids[0]], `${theme}: ${JSON.stringify(marks)}`)
      assert.ok(marks.find(m => m.id === shelf.ids[0]).seen, `${theme}: the still ring can be seen`)
      assert.ok(await s.page.evaluate(() => document.querySelector('[data-step="agent"] .st-mo-breathe') !== null), `${theme}: the step going on is marked`)
      if (theme === 'monoline') await shot('reduced-monoline')
    }
    assert.equal((await s.page.evaluate(() => window.streams.setTheme('research'))).ok, true)
    await s.page.emulateMedia({ reducedMotion: 'no-preference' })
    await sleep(300)
    assert.ok((await loops()).length >= 4, 'the loops are back')
  })

  test('A19 / M6: the run ends — still again; the new items come in one after another; the counts pop', async () => {
    await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'idle')
    const t0 = Date.now()
    let fresh = []
    while (Date.now() - t0 < 4000 && fresh.length < 2) {
      const a = await anims()
      seen.push(...a)
      fresh = await s.page.evaluate(() => [...document.querySelectorAll('article.st-mo-new')].map(e => ({ url: e.dataset.url, i: getComputedStyle(e).getPropertyValue('--mo-i').trim(), delay: getComputedStyle(e).animationDelay })))
      await sleep(30)
    }
    assert.deepEqual(fresh.map(f => [f.i, f.delay]).sort(), [['0', '0s'], ['1', '0.04s']], JSON.stringify(fresh))
    await watch(500)
    assert.ok(seen.some(a => a.name === 'st-mo-pop'), 'a count popped')
    await sleep(600)
    assert.deepEqual(await loops(), [], 'still once the run is over')
  })

  test('A17: C pressed three times at once — three kept, none lost or twice; each card leaves, the ones below move up', async () => {
    await until(() => document.querySelectorAll('article[data-card]').length >= 6)
    const before = await s.page.evaluate(() => [...document.querySelectorAll('article[data-card]')].map(e => e.dataset.url))
    await s.page.evaluate(() => document.querySelector('article[data-card]').focus())
    await s.page.keyboard.press('c')
    await s.page.keyboard.press('c')
    await s.page.keyboard.press('c')
    await watch(320, 20)
    const leaving = seen.filter(a => a.leaving === 'keep' && a.name === 'st-mo-leave-keep')
    assert.ok(leaving.length >= 1, 'cards leaving up and right')
    assert.ok(seen.some(a => a.name === 'st-mo-fill'), 'the cards below moved up')
    await until(n => document.querySelectorAll('article[data-card]').length === n && document.querySelectorAll('[data-leaving]').length === 0, before.length - 3)
    const after = await s.page.evaluate(() => [...document.querySelectorAll('article[data-card]')].map(e => e.dataset.url))
    assert.deepEqual(after, before.slice(3))
    const states = core.replayLedger(s.world.library).states
    assert.deepEqual(before.slice(0, 3).map(u => states.get(u)?.stage), ['kept', 'kept', 'kept'])
    assert.equal(before.slice(3).some(u => states.get(u)?.stage === 'kept'), false, 'nothing else kept')
  })

  test('A17: 放弃 goes down and its bar comes up; 撤销 brings it back at its place, fading in; 稍后处理 goes to the right', async () => {
    const before = await s.page.evaluate(() => [...document.querySelectorAll('article[data-card]')].map(e => e.dataset.url))
    const second = before[1]
    await s.page.click(`article[data-card][data-url="${second}"] [data-action="dismiss"] button`)
    await watch(300, 20)
    assert.ok(seen.some(a => a.leaving === 'dismiss' && a.name === 'st-mo-leave-dismiss'))
    await until(() => document.querySelector('[data-part="dismiss-bar"]') !== null)
    await watch(120, 20)
    assert.ok(seen.some(a => a.name === 'st-mo-bar'), 'the bar came up')
    await shot('dismiss-bar')
    await s.page.click('[data-part="dismiss-bar"] [data-action="undo"] button')
    await until(u => document.querySelector(`article.st-mo-back[data-url="${u}"]`) !== null, second)
    seen.push(...await anims())
    assert.ok(seen.some(a => a.name === 'st-mo-back'))
    const back = await s.page.evaluate(() => [...document.querySelectorAll('article[data-card]')].map(e => e.dataset.url))
    assert.deepEqual(back, before, 'back at its place')
    await s.page.click(`article[data-card][data-url="${before[0]}"] [data-action="later"] button`)
    await watch(260, 20)
    assert.ok(seen.some(a => a.leaving === 'later' && a.name === 'st-mo-leave-later'))
  })

  test('A16 / M4: the build conversation waiting for the main agent — its dots; one loop; then still', async () => {
    await s.page.click('[data-action="add-library"]')
    await ready(s.page, 'build')
    await s.page.fill('textarea[data-field="opener"]', '帮我找补助')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('[data-mo="build"]') !== null)
    const l = await loops()
    assert.ok(l.length >= 1 && l.every(a => a.mo === 'build' && a.name === 'st-mo-dots'), JSON.stringify(l))
    seen.push(...await anims())
    await shot('build-waiting')
    await until(() => document.querySelector('[data-part="question"]') !== null && document.querySelector('[data-mo="build"]') === null)
    await sleep(400)
    assert.deepEqual(await loops(), [])
    // the card comes in as one block; 「确认」 shown once
    await s.page.fill('textarea[data-field="message"]', '找补助')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-part="build-card"]') !== null)
    await watch(300, 20)
    assert.ok(seen.some(a => a.name === 'st-mo-rise' && a.duration === 280), 'the card came in (big block)')
  })

  test('A16 / M5: 问库 waiting for its answer — its dots; the answer comes in; then still', async () => {
    await s.page.click('.st-sidebar [data-library-row]')
    await ready(s.page, 'inbox')
    await s.page.click('[data-tab="ask"]')
    await ready(s.page, 'ask')
    await s.page.fill('textarea[data-field="question"]', 'agent 记忆方案哪种好？')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-mo="ask"]') !== null)
    const l = await loops()
    assert.ok(l.length >= 1 && l.every(a => a.mo === 'ask' && a.name === 'st-mo-dots'), JSON.stringify(l))
    seen.push(...await anims())
    await until(() => document.querySelector('[data-mo="ask"]') === null)
    await watch(200, 20)
    await sleep(400)
    assert.deepEqual(await loops(), [])
  })

  test('A19: every animation seen is in its band; a button\'s hover within 120 ms; nothing of the app outside the st-mo names', async () => {
    // a dialog and a hover, to see them too
    await s.page.click('[data-tab="inbox"]')
    await ready(s.page, 'inbox')
    const btn = s.page.locator('article[data-card] [data-action="keep"] button').first()
    await btn.hover()
    await watch(60, 10)
    const transitions = seen.filter(a => a.name.startsWith('transition:'))
    assert.ok(transitions.length >= 1, 'a hover was seen')
    assert.ok(transitions.every(a => a.duration <= 120), JSON.stringify(transitions.filter(a => a.duration > 120)))
    const ours = seen.filter(a => a.name.startsWith('st-mo-'))
    const names = [...new Set(ours.map(a => a.name))].sort()
    for (const need of ['st-mo-breathe', 'st-mo-ring', 'st-mo-dots', 'st-mo-leave-keep', 'st-mo-leave-dismiss', 'st-mo-leave-later', 'st-mo-back', 'st-mo-fill', 'st-mo-bar', 'st-mo-in']) assert.ok(names.includes(need), `${need} seen: ${names}`)
    const wrong = ours.filter(a => {
      const band = BAND[BAND_OF[a.name]]
      return !band || a.duration < band[0] || a.duration > band[1] || (a.iterations === 'infinite') !== ['loop', 'ring'].includes(BAND_OF[a.name])
    })
    assert.deepEqual([...new Map(wrong.map(a => [`${a.name}:${a.duration}`, a])).values()], [], 'every animation in its band')
    assert.deepEqual(s.errors, [])
  })

  test('A17: C pressed and the app killed 60 ms later, mid-animation — the item is kept (the call went when pressed)', async () => {
    const url = await s.page.evaluate(() => document.querySelector('article[data-card]').dataset.url)
    await s.page.evaluate(() => document.querySelector('article[data-card]').focus())
    await s.page.keyboard.press('c')
    await sleep(60)
    // the whole app at once, its helper processes too (they hold the world's files)
    const child = s.app.process()
    execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' })
    await sleep(1500)
    s.app = null
    assert.equal(core.replayLedger(s.world.library).states.get(url)?.stage, 'kept')
  })
})
