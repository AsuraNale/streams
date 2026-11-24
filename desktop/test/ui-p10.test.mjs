// 1.1.1 P10 in the real window (acceptance A8; A14's first-run line): progress while it happens.
//   an update: 待看 shows the four steps with their numbers as they come — the sources read (each source takes 2.5 s here), the
//     originals fetched, the agent's counts (the stand-in tells them, then holds 32 s), the summaries checked (each judgment
//     waits 3 s); the right panel's 进度 the same; how long it usually takes, and that the user may leave. In the hold the
//     numbers do not move by themselves (read, 30 s, read again).
//   the next update says how long the last one took
//   a build: while the main agent works, its counts; then Streams' check of the card's addresses n/m; how long a turn takes
// With STREAMS_P10_SHOTS=<folder> the window is shown and the four steps' pictures are saved there (paths masked). Each check
// holds first the state that would make it fail.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { RUN } from '../src/renderer/texts/run.js'
import { BUILD } from '../src/renderer/texts/build.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const SHOTS = process.env.STREAMS_P10_SHOTS && isAbsolute(process.env.STREAMS_P10_SHOTS) ? process.env.STREAMS_P10_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 90_000 }
const S1 = 'https://p10.example.test/list-a'
const S2 = 'https://p10.example.test/list-b'
const N1 = 'https://p10.example.test/p/1'
const N2 = 'https://p10.example.test/p/2'
const OLD = 'https://p10.example.test/p/0'
const sentence = n => `新补助第 ${n} 段：设备补助的第 ${n} 条规定，额度 ${n * 10} 万元，截止日期写在官方页上，申请要交三份材料。`
const TEXT = [1, 2, 3, 4].map(sentence).join('\n\n')
const CARD = {
  name: '进度测试', definition: { summary: '一座测试进度的库。', purpose: '测试', scope: '对象：补助', exclude: '贷款', trust: '官方', rhythm: '每天一次', language: '中文', hard: '无' },
  decide: [], collect: ['补助'], skip: ['贷款'], sources: [{ name: '目录甲', url: S1, status: 'ok' }, { name: '目录乙', url: S2, status: 'ok' }], unreadable: [],
  pick: ['新的先收'], write: ['写清金额'], samples: [{ title: '样例', url: OLD, date: '2026-11-20' }],
}
const item = url => ({ url, title: '新补助', date: '2026-11-24', due: '', what: '一项新的设备补助。', points: [1, 2, 3].map(n => ({ text: `第 ${n} 条`, quote: sentence(n) })), why: '在范围里' })

const F = {}
const slowReads = { [S1]: { ok: true, links: [OLD, N1, N2], delayMs: 2500 }, [S2]: { ok: true, links: [OLD], delayMs: 2500 }, [N1]: { ok: true, title: '新补助一', text: TEXT, delayMs: 2500 }, [N2]: { ok: true, title: '新补助二', text: TEXT, delayMs: 2500 } }
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: world => {
    core.writeCard(world.library, CARD)
    // the sources were read before: their old link is seen, so N1 and N2 are new now
    const st = core.readUpdateState(world.library)
    core.writeUpdateState(world.library, { ...st, sources: { [S1]: { ok: true, seen: [OLD], firstAt: '2026-11-20T10:00:00.000Z' }, [S2]: { ok: true, seen: [OLD], firstAt: '2026-11-20T10:00:00.000Z' } }, lastAgentAt: '2026-11-23T10:00:00.000Z' })
    F.reads = join(world.root, 'reads.json')
    F.script = join(world.root, 'update-script.json')
    F.build = join(world.root, 'build-replies.json')
    writeFileSync(F.reads, JSON.stringify(slowReads))
    writeFileSync(F.script, JSON.stringify({ progress: [{ searches: 1, reads: 0, afterMs: 1500 }, { searches: 2, reads: 3, afterMs: 1500 }], holdMs: 32_000, items: [item(N1), item(N2)], judgeDelayMs: 3000 }))
    writeFileSync(F.build, JSON.stringify({ replies: [] }))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'progress' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_READS: F.reads, STREAMS_DEV_UPDATE_SCRIPT: F.script, STREAMS_DEV_BUILD: F.build, STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(300); await s.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [s.page.locator('.st-path'), s.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }
const steps = () => s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-part="run-steps"] [data-step]')].map(e => [e.dataset.step, { now: e.dataset.now === 'true', done: e.dataset.done === 'true', count: e.dataset.count }])))
const panelLine = () => s.page.evaluate(() => [...document.querySelectorAll('[data-part="running"] .step-line')].map(e => e.textContent.trim()).join(' | '))

describe('P10: progress while it happens', () => {
  test('an update: each step with its numbers as they come, in 待看 and in 进度; how long; no number moves by itself', async () => {
    await s.page.click('[data-part="run-button"] button')
    // sources: 1 / 2 after the first one (each takes 2.5 s)
    await until(() => document.querySelector('[data-step="sources"]')?.dataset.count === '1 / 2 个')
    let st = await steps()
    assert.deepEqual([st.sources.now, st.originals.count, st.agent.count], [true, '', ''], 'later steps have no numbers yet')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="run-usually"]').textContent), RUN.usuallyFirst)
    await shot('step-sources')
    // originals
    await until(() => document.querySelector('[data-step="originals"]')?.dataset.now === 'true')
    await until(t => document.querySelector('[data-step="originals"]')?.dataset.count === t, fmt(RUN.live.originals, { done: 1, total: 2, kept: 1 }))
    await shot('step-originals')
    // the agent's counts, as the stand-in tells them
    await until(t => document.querySelector('[data-step="agent"]')?.dataset.count === t, fmt(RUN.live.agent, { searches: 2, reads: 3 }))
    st = await steps()
    assert.deepEqual([st.sources.done, st.originals.done, st.agent.now], [true, true, true])
    assert.equal(st.originals.count, fmt(RUN.live.originals, { done: 2, total: 2, kept: 2 }))
    assert.ok((await panelLine()).includes(fmt(RUN.live.agent, { searches: 2, reads: 3 })), await panelLine())
    await shot('step-agent')
    // the stand-in holds: 30 s later the same numbers (nothing moves by itself)
    const before = JSON.stringify(await steps())
    await s.page.waitForTimeout(30_000)
    assert.equal(JSON.stringify(await steps()), before, 'no number moved without an event')
    // the check: n / 2
    await until(() => document.querySelector('[data-step="check"]')?.dataset.now === 'true')
    await until(() => /^\d \/ 2/.test(document.querySelector('[data-step="check"]')?.dataset.count ?? ''))
    await shot('step-check')
    await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'idle')
  })

  test('the next update says how long the last one took', async () => {
    // a new link on 目录乙, so the agent runs (and holds 4 s)
    const N3 = 'https://p10.example.test/p/3'
    writeFileSync(F.reads, JSON.stringify({ ...Object.fromEntries(Object.entries(slowReads).map(([u, r]) => [u, { ...r, delayMs: 0 }])), [S2]: { ok: true, links: [OLD, N3] }, [N3]: { ok: true, title: '三', text: TEXT } }))
    writeFileSync(F.script, JSON.stringify({ progress: [], holdMs: 4000, items: [], judgeDelayMs: 0 }))
    await s.page.click('[data-part="run-button"] button')
    await until(() => document.querySelector('[data-part="run-usually"]') !== null)
    const t = await s.page.evaluate(() => document.querySelector('[data-part="run-usually"]').textContent)
    assert.ok(t.startsWith(RUN.usuallyLast.split('{min}')[0]) && t !== RUN.usuallyFirst, t)
    await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'idle')
  })

  test('a build: the main agent\'s counts while it works, then Streams\' check of the card\'s addresses; how long a turn takes', async () => {
    const card = { ...CARD, name: '新库', sources: [{ name: '目录甲', url: S1, status: 'ok' }], samples: [{ title: '样例', url: N1, date: '2026-11-20' }] }
    writeFileSync(F.reads, JSON.stringify({ [S1]: { ok: true, links: [N2], delayMs: 3000 }, [N1]: { ok: true, title: '一', text: TEXT, delayMs: 3000 }, [N2]: { ok: true, title: '二', text: TEXT, delayMs: 3000 } }))
    // a question first (the conversation page shows from the first answer on), then the card with the agent's counts
    writeFileSync(F.build, JSON.stringify({ replies: [{ json: { say: '', question: { text: '拿来做什么？', kind: 'input', options: [] } } }, { json: { say: '请看卡', card }, progress: [{ searches: 3, reads: 0, afterMs: 1000 }, { searches: 3, reads: 5, afterMs: 2500 }] }] }))
    await s.page.click('[data-action="add-library"]')
    await ready(s.page, 'build')
    await s.page.fill('textarea[data-field="opener"]', '帮我找补助')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('[data-part="question"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    await s.page.fill('textarea[data-field="message"]', '找补助')
    await s.page.click('[data-action="send"] button')
    await until(t => document.querySelector('[data-part="thinking-live"]')?.textContent === t, fmt(BUILD.liveAgent, { searches: 3, reads: 5 }))
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="thinking-usually"]').textContent), BUILD.usuallyTurn)
    await shot('build-agent')
    // then Streams checks the card's addresses — the agent's counts stay beside it
    await until(() => /\d \/ \d/.test(document.querySelector('[data-part="thinking-check"]')?.textContent ?? ''))
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="thinking-live"]')?.textContent), fmt(BUILD.liveAgent, { searches: 3, reads: 5 }))
    await shot('build-check')
    await until(() => document.querySelector('article[data-part="build-card"]') !== null)
    await s.page.evaluate(() => window.streams.dropBuild())
  })

  test('no page errors', () => { assert.deepEqual(s.errors, []) })
})
