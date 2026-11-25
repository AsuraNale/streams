// 1.1 W7a in the real window (docs/checks/2026-11-20-1.1/w7a/scorecard.json): a library made by 1.0.1 (test/fixtures/
// v101-library: 3 notes, 2 items in 待看, made once by 1.0's own round — scripts/make-v101-fixture.mjs) opened by 1.1:
// its notes byte for byte, 待看 there and keepable, 问库 as before (E3); 立即运行 does not run the old round and says to
// bring it over (needs-build); 「重新查一遍来源」 is the build conversation in its convert mode — the card goes into that
// library's own folder only on 确认, the folder byte for byte the same before (and after 不换了) (B3). On an API key: 问库
// answers, building / changing / bringing over / updating do not start and say why, nothing changes, the key stays (B17).
// The main agent is a scripted stand-in (STREAMS_DEV_BUILD). STREAMS_W7A_SHOTS=<folder>: the window shown, pictures saved.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { readCard, writeCard } from '../src/main/core.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'

const SHOTS = process.env.STREAMS_W7A_SHOTS && isAbsolute(process.env.STREAMS_W7A_SHOTS) ? process.env.STREAMS_W7A_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
const FIXTURE = join(DESKTOP_DIR, 'test', 'fixtures', 'v101-library')
const range = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`
const CJK = new RegExp(`[${range(0x3400, 0x9FFF)}${range(0x3000, 0x303F)}${range(0xFF00, 0xFFEF)}]`)

/** Every file under `dir` → its sha256 (the folder byte for byte). */
function tree(dir) {
  const out = {}
  const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out[relative(dir, p)] = createHash('sha256').update(readFileSync(p)).digest('hex') } }
  if (existsSync(dir)) walk(dir)
  return out
}

const A = 'https://example-a.test/list'
const B = 'https://example-b.test/item/1'
const CARD = () => ({
  name: 'agent 记忆跟踪',
  definition: { summary: '一座跟踪 agent 记忆方案的库。', purpose: '研究', scope: '对象：agent 框架；行业：AI；地域：全球；规模：不限', exclude: '营销稿', trust: '官方博客和论文', rhythm: '每周', language: '中文简报', hard: '一手出处' },
  decide: [], collect: ['新方案和评测'], skip: ['营销稿'],
  sources: [{ name: '甲', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
})
const card = (c, urls = []) => ({ json: { say: '重新查过了，请看卡。', card: c }, reads: urls.map(url => ({ url, ok: true })) })

let lib = null
let replies = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: world => {
    lib = join(world.root, 'v101-library')
    cpSync(FIXTURE, lib, { recursive: true })
    replies = join(world.root, 'build-replies.json')
    writeFileSync(replies, JSON.stringify({ replies: [card(CARD(), [A, B])] }))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: lib, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: replies, STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`) }) } }
const tab = async t => {
  if (!(await s.page.$('.st-lib-tabs'))) await s.page.click('[data-library-row]')
  await s.page.waitForSelector('.st-lib-tabs')
  await s.page.click(`.st-lib-tabs button[data-tab="${t}"]`)
  await ready(s.page, t)
}

describe('W7a: a library made by 1.0.1, opened by 1.1', () => {
  let notesBefore = null
  test('E3: it opens; its 3 notes are in 资料库 and byte for byte as they were; its 2 items wait in 待看 and one can be kept; 问库 answers', async () => {
    notesBefore = tree(join(FIXTURE, 'notes'))
    assert.equal(Object.keys(notesBefore).length, 3, 'control: the fixture has 3 notes')
    assert.deepEqual(tree(join(lib, 'notes')), notesBefore, 'opened: the notes byte for byte')
    await until(() => document.querySelectorAll('[data-card]').length === 2)
    await tab('library')
    await until(() => document.querySelectorAll('main [data-row]').length >= 3)
    const answer = await s.page.evaluate(() => window.streams.askLibrary('agent 记忆有什么进展？'))
    assert.ok(answer.ok, JSON.stringify(answer))
    await tab('inbox')
    const first = await s.page.evaluate(() => document.querySelector('[data-card]').dataset.url)
    const kept = await s.page.evaluate(u => window.streams.keepItem(u), first)
    assert.ok(kept.ok, JSON.stringify(kept))
    assert.equal(Object.keys(tree(join(lib, 'notes'))).length, 4, 'the kept one is a note now')
    for (const [f, h] of Object.entries(notesBefore)) assert.equal(tree(join(lib, 'notes'))[f], h, `${f} untouched`)
    await until(() => document.querySelectorAll('[data-card]').length === 1)
    await shot('upgrade-inbox')
  })

  test('E3: 立即运行 does not run the old round — the banner says to bring it over, with 重新查一遍来源; nothing fetched, nothing written', async () => {
    const before = tree(lib)
    await s.page.click('[data-part="run-button"] button')
    await until(() => document.querySelector('[data-part="problem"][data-code="needs-build"]') !== null)
    const banner = await s.page.evaluate(() => ({ text: document.querySelector('[data-part="problem"]').textContent, buttons: [...document.querySelectorAll('[data-part="problem"] [data-action]')].map(b => b.dataset.action) }))
    assert.ok(banner.text.includes('旧版本创建') && banner.text.includes('重新核查来源') /* 1.1.2 第 2 件 */, banner.text)
    assert.deepEqual(banner.buttons, ['rebuild'])
    await s.page.waitForTimeout(1500)
    assert.deepEqual(tree(lib), before, 'nothing fetched or written (rounds.jsonl, the ledger, 待看)')
    await shot('needs-build')
    await s.page.click('[data-part="problem"] [data-action="rebuild"] button')
    await ready(s.page, 'sources')
    await until(() => document.querySelector('[data-part="old-library"]') !== null)
  })

  test('B3 / E3: 重新查一遍来源 → the build conversation bringing it over, its old requirements and sources as the opening words; the folder the same until 确认 (and after 不换了); then the card in its own folder, notes and 待看 as they were', async () => {
    const before = tree(lib)
    await s.page.click('[data-action="recheck-sources"] button')
    await ready(s.page, 'build')
    await until(() => document.querySelector('textarea[data-field="opener"]')?.value.includes('旧版本创建'))
    const p = await s.page.evaluate(() => ({ mode: document.querySelector('main[data-screen="build"]').dataset.mode, h2: document.querySelector('main h2').textContent, opener: document.querySelector('textarea[data-field="opener"]').value, note: Boolean(document.querySelector('[data-part="from-old"]')) }))
    assert.equal(p.mode, 'convert')
    assert.ok(p.h2.includes('v101-library'), p.h2)
    assert.ok(p.opener.includes('letta-blog') && p.opener.includes('原有追踪要求'), p.opener)
    assert.equal(p.note, true)
    await shot('convert-start')
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('article[data-part="build-card"] [data-action="confirm"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    assert.ok((await s.page.evaluate(() => document.querySelector('[data-action="confirm"]').textContent)).includes('确认并转换')) // 1.1.2 第 2 件: 确认，换过来 → 确认并转换
    assert.deepEqual(tree(lib), before, 'not confirmed: the library byte for byte')
    await shot('convert-card')
    await s.page.click('article[data-part="build-card"] [data-action="drop"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null)
    assert.deepEqual(tree(lib), before, '不换了: the library byte for byte')
    // again, and 确认
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('article[data-part="build-card"] [data-action="confirm"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    const id = (await s.page.evaluate(() => window.streams.getAppState())).data.library.libraryId
    await s.page.click('article[data-part="build-card"] [data-action="confirm"] button')
    await ready(s.page, 'sources')
    const state = (await s.page.evaluate(() => window.streams.getAppState())).data.library
    assert.deepEqual([state.libraryId, state.path], [id, lib], 'the same library, the same folder')
    assert.equal(readCard(lib).name, 'agent 记忆跟踪')
    const after = tree(lib)
    for (const [f, h] of Object.entries(before)) if (f.startsWith('notes') || f.startsWith(join('_pipeline', 'inbox'))) assert.equal(after[f], h, `${f} untouched`)
    assert.equal(readdirSync(join(lib, '_card', 'history')).length, 1)
    assert.equal(await s.page.$('[data-part="old-library"]'), null, 'the notice of the last version is gone: it has a card')
    // now it is updated by its card: 立即运行 does not say needs-build
    await tab('inbox')
    await s.page.click('[data-part="run-button"] button')
    await s.page.waitForTimeout(2500)
    assert.equal(await s.page.$('[data-part="problem"][data-code="needs-build"]'), null)
  })

  test('no page error in the run', () => {
    assert.deepEqual(s.errors.filter(e => !/favicon/.test(e)), [])
  })
})

// ---- B17: on an API key ----
describe('W7a: on an API key (B17), and on Codex', () => {
  let k = null
  const a = worldSession({
    kind: 'empty',
    waitFor: 'inbox',
    prepare: world => { writeCard(world.library, CARD()); k = world },
    settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
  })
  const untilA = (fn, arg) => a.page.waitForFunction(fn, arg, POLL)
  // 1.1.1 P6 (B17 as 1.1.1 changed it): on an API key 问库, 立即运行, 新建库 and 改建库卡 all start; with no model key 新建库
  // stops at the connection's words and nothing starts. (ui-p6 walks a build and an update on a stand-in vendor API; here the
  // command-line stand-ins carry the turns.)
  test('B17 (1.1.1): 问库 answers; 立即运行, 新建库 and 改建库卡 start; with no key 新建库 says to enter it and nothing starts; the key stays until removed', async () => {
    const stored = await a.page.evaluate(() => window.streams.setApiKey('anthropic', 'sk-test-w7a-not-real'))
    assert.ok(stored.ok, JSON.stringify(stored))
    const set = await a.page.evaluate(() => window.streams.setActiveConnection('api'))
    assert.ok(set.ok, JSON.stringify(set))
    for (const q of ['agent 记忆有什么进展？', '库里有几条？', '哪条讲了评测？']) {
      const r = await a.page.evaluate(x => window.streams.askLibrary(x), q)
      assert.ok(r.ok, `${q}: ${JSON.stringify(r)}`)
    }
    // 立即运行: the update starts (no 「只能问库」 any more)
    const run = (await a.page.evaluate(() => window.streams.startRound())).data
    assert.equal(run.started, true, JSON.stringify(run))
    await untilA(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'idle')
    assert.equal(await a.page.evaluate(() => document.body.innerText.includes('只能问库')), false)
    if (SHOTS) await a.page.screenshot({ path: join(SHOTS, 'api-update.png') })
    // 改建库卡 starts (through the bridge as the page would), and is dropped: the card file the same
    const id = (await a.page.evaluate(() => window.streams.getAppState())).data.library.libraryId
    const before = tree(k.library)
    const edit = await a.page.evaluate(x => window.streams.startBuild('加一个来源', x), id)
    assert.equal(edit.ok, true, JSON.stringify(edit))
    await a.page.evaluate(() => window.streams.dropBuild())
    assert.deepEqual(tree(k.library), before, 'nothing changed before 确认')
    // 新建库 on the key: 开始 can be pressed
    await a.page.click('[data-action="add-library"]')
    await ready(a.page, 'build')
    await a.page.fill('textarea[data-field="opener"]', '跟踪储能')
    assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="start"] button').disabled), false)
    const conns = (await a.page.evaluate(() => window.streams.getConnections())).data
    assert.ok(JSON.stringify(conns).includes('"hasKey":true'), 'the key stays')
    // the key removed: 新建库 says to enter it, 开始 cannot be pressed, startBuild is refused
    assert.ok((await a.page.evaluate(() => window.streams.removeApiKey('anthropic'))).ok)
    await a.page.evaluate(() => window.streams.setActiveConnection('api'))
    await untilA(() => document.querySelector('[data-part="start-why"]') !== null)
    assert.equal(await a.page.evaluate(() => document.querySelector('[data-action="start"] button').disabled), true)
    assert.ok((await a.page.evaluate(() => document.querySelector('[data-part="start-why"]').textContent)).includes('输入 API key'))
    const refused = await a.page.evaluate(() => window.streams.startBuild('跟踪储能'))
    assert.equal(refused.ok, false)
    assert.equal(refused.error?.code, 'bad_arguments')
    assert.equal((await a.page.evaluate(() => window.streams.getBuild())).data, null, 'nothing started')
  })
})

// ---- E5: the words of W7a in English ----
describe('W7a in English (E5)', () => {
  let libEn = null
  const e = worldSession({
    kind: 'empty',
    waitFor: 'inbox',
    prepare: world => { libEn = join(world.root, 'v101-library'); cpSync(FIXTURE, libEn, { recursive: true }) },
    settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, language: 'en' },
    env: () => ({ STREAMS_DEV_LIBRARY: libEn, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox' }),
  })
  test('the banner of a library made by the last version and the page that brings it over: no Chinese of ours', async () => {
    await e.page.click('[data-part="run-button"] button')
    await e.page.waitForFunction(() => document.querySelector('[data-part="problem"][data-code="needs-build"]') !== null, null, POLL)
    const banner = await e.page.evaluate(() => document.querySelector('[data-part="problem"]').textContent)
    assert.equal(CJK.test(banner), false, banner)
    await e.page.click('[data-part="problem"] [data-action="rebuild"] button')
    await ready(e.page, 'sources')
    await e.page.click('[data-action="recheck-sources"] button')
    await ready(e.page, 'build')
    await e.page.waitForFunction(() => document.querySelector('textarea[data-field="opener"]')?.value.includes('earlier version'), null, POLL) // 1.1.2 第 2 件: last version → earlier version
    const page = await e.page.evaluate(() => { const m = document.querySelector('main').cloneNode(true); for (const x of m.querySelectorAll('textarea')) x.remove(); return m.textContent })
    // the library's own words (its brief, its sources' names) are the user's, not ours: only our words are checked
    const ours = page.replace(/v101-library/g, '')
    assert.equal(CJK.test(ours), false, ours.match(new RegExp(`.{0,20}${CJK.source}.{0,20}`))?.[0])
  })
})
