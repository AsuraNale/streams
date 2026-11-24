// 问库 — redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-5; design 03-页面稿 P13, 07-模板版 「问库」; F41–F44) on the seeded
// world plus plan B's notes and the shelf (the seeded library is registered and current). The answer is scripted
// (STREAMS_DEV_ASK_SCRIPT: the fake connection answers the core's ask prompt with it — cites 1 and 2 and what the library
// lacks).
//   - V9 on the page: every cite number and every note listed under the answer is in the core's candidate set for that
//     question (askCandidates); 打开 opens that note in 资料库; 查看原文 opens Streams' reading window (its log), not the browser
//   - 「库内缺少：…」 + 「加入待补充主题」 → 「已加入待补充主题」 (demand.jsonl has the click); another tab and back: still 已加入 — the state
//     is the core's record, not the page's (mutant r3-demand-forgotten: the page's own state only → red here); 详情: 引用了 n 篇笔记,
//     the line of what the answer used, 待补充主题 with 已提问 n 次 and the hint
//   - 1.1 W7b: 问库 just answers — a sentence that asks to change the library is asked of the library like any other (askLibrary);
//     nothing is routed or handed to an agent (v2 package E's routing and v2's main agent are gone; a card is changed through the
//     build conversation)
//   - the box: 「每次提问约 2–4 次模型调用」
// redesign R6b-2: a test name or comment here quotes a sentence of the page as 05 has it now
// (docs/checks/2026-11-13-r6b/05-对照.md 附表一); no assertion changed for it unless a line says so.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { ASK } from '../src/renderer/texts/ask.js'
import { seedPlanB, seedShelf, worldSession } from './support/seed.mjs'
import { markIn, markOfFile } from './support/brand.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const QUESTION = 'agent 记忆方案里哪种在长对话上表现最好？代价是什么？'
const MISSING = '「隔天回来」情形下各方案的直接排名'
const ANSWER = {
  answer: [{ text: '库里的评测横向比较了五种 agent 记忆方案。', cites: [1] }, { text: '分层记忆在长对话上表现最好。', cites: [2] }, { text: '代价是每轮多一次模型调用。', cites: [2] }],
  notInLibrary: false, missing: MISSING, claimed: ['json-keys', 'cites-in-set', 'cited-sentences', 'claims-supported'],
}
let shelf = null
const s = worldSession({
  kind: 'seeded',
  waitFor: 'ask',
  prepare: async world => {
    await seedPlanB(world)
    shelf = await seedShelf(world)
    writeFileSync(join(world.root, 'ask.json'), JSON.stringify(ANSWER), 'utf8')
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'ask', STREAMS_DEV_ASK_SCRIPT: join(world.root, 'ask.json') }),
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } },
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
// 1.1.1 P11a: the scope line ends with 待看's count when it has items (问库 does not read them)
const inboxLine = () => { const n = core.homeNumbers(dir()).inbox; return n > 0 ? ` · 待看里还有 ${n} 条没收藏，问库不看` : '' }
const log = () => readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8')
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
async function waitFor(fn, ms = 30_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)) }
  assert.fail('timed out')
}
const send = async text => {
  const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
  await s.page.fill('textarea[data-field="question"]', text)
  await s.page.click('[data-action="send"] button')
  await until(i => { const t = document.querySelector(`[data-turn="${i}"]`); return t && t.dataset.state === 'done' }, n)
  return n
}
const panel = async tab => {
  if (await s.page.evaluate(t => document.querySelector('[data-part="right-panel"]')?.dataset.tab !== t, tab)) await s.page.click(`[data-panel-tab="${tab}"]`)
  await until(t => document.querySelector('[data-part="right-panel"]')?.dataset.tab === t, tab)
}

test('R3-5 the line on top and under the box', async () => {
  const c = core.libraryCounts(dir())
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="scope"]').textContent), `仅基于库内内容回答 · 范围：已收藏 ${c.kept} 条 · 我的笔记 ${c.authored} 条 · 不联网${inboxLine()}`)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="input-hint"]').textContent), '每次提问约 2–4 次模型调用')
})

test('R3-5 / V9 an answer: each cite number and each note listed is in the core\'s candidate set; 打开 → 资料库, 查看原文 → the reading window', async () => {
  const i = await send(QUESTION)
  const cands = core.askCandidates(dir(), QUESTION)
  assert.ok(cands.length >= 2, 'control: the library has candidates')
  const got = await s.page.evaluate(n => {
    const t = document.querySelector(`[data-turn="${n}"]`)
    return {
      cites: [...t.querySelectorAll('[data-sentence] [data-cite]')].map(e => Number(e.dataset.cite)),
      sources: [...t.querySelectorAll('[data-source-n]')].map(e => [Number(e.dataset.sourceN), e.dataset.id]),
      missing: t.querySelector('[data-part="missing"]')?.textContent,
    }
  }, i)
  assert.deepEqual(got.cites, [1, 2, 2])
  for (const n of got.cites) assert.ok(n >= 1 && n <= cands.length, `cite ${n} in 1..${cands.length}`)
  assert.deepEqual(got.sources, cands.filter(c => [1, 2].includes(c.n)).map(c => [c.n, c.id]))
  assert.equal(got.missing, `库内缺少：${MISSING}`)
  // 查看原文 of a note whose source is a web address: the reading window (its log names the address), never the browser
  const withWeb = got.sources.map(([, id]) => core.readNote(dir(), id).entry).find(e => /^https?:/.test(e.source))
  assert.ok(withWeb, 'control: a cited note with a web source')
  await s.page.click(`[data-turn="${i}"] [data-source-n][data-id="${withWeb.id}"] [data-action="cite-original"] button`)
  await waitFor(() => log().includes(`reader: ${withWeb.source}`))
  assert.ok(!log().includes(`not opened in a test run: ${withWeb.source}`), 'not the browser')
  await s.page.click(`[data-turn="${i}"] [data-source-n="1"] [data-action="open-cite"] button`)
  await until(id => document.querySelector(`main[data-screen="library"] [data-reader="${id}"]`) !== null, got.sources[0][1])
  await s.page.click('nav.st-lib-tabs button[data-tab="ask"]')
  await until(() => document.querySelector('main[data-screen="ask"][data-state="ready"] [data-turn="0"]') !== null)
})

// logo (docs/checks/2026-11-12-logo/contract.md L-3, 2026-11-12): a check added — 流息's speaker avatar was the template's
// weave glyph; it is 流息's mark now
test('logo: the answer\'s speaker avatar is 流息\'s mark (mark-black.svg\'s one path, currentColor), not the template\'s weave', async () => {
  // the answer of the test above; run alone (a name pattern), it asks the question itself
  if (await s.page.evaluate(() => document.querySelector('[data-turn="0"]') === null)) await send(QUESTION)
  await until(() => document.querySelector('[data-turn="0"] .speaker .avatar svg') !== null)
  const file = markOfFile()
  const got = await markIn(s.page, '[data-turn="0"] .speaker .avatar svg')
  assert.deepEqual([got.viewBox, got.paths.length, got.paths[0].transform, got.paths[0].d, got.paths[0].fill, got.glyph], [file.viewBox, 1, file.transform, file.d, 'currentColor', null])
  assert.equal(got.shown, true, 'drawn (单线黑白 hides the template\'s svg in an avatar for a picture)')
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-glyph="weave"]').length), 0, 'no weave anywhere on the page')
  // 单线黑白 · 深色: the template puts a picture of the 3D mark on white there and hides the svg — here the svg is drawn, no picture
  for (const [m, v] of [['setTheme', 'monoline'], ['setAppearance', 'dark']]) assert.equal((await s.page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])).ok, true)
  await until(() => document.body.classList.contains('r12-line') && document.body.dataset.appearance === 'dark' && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null))
  const line = await markIn(s.page, '[data-turn="0"] .speaker .avatar svg')
  assert.equal(line.shown, true)
  assert.equal(await s.page.evaluate(() => getComputedStyle(document.querySelector('[data-turn="0"] .speaker .avatar')).backgroundImage), 'none')
  assert.notEqual(line.paths[0].computedFill, await s.page.evaluate(() => getComputedStyle(document.querySelector('[data-turn="0"] .speaker .avatar')).backgroundColor), 'the mark is not the colour of its box')
  for (const [m, v] of [['setTheme', 'research'], ['setAppearance', 'light']]) assert.equal((await s.page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])).ok, true)
  await until(() => document.body.classList.contains('r11-research') && document.body.dataset.appearance === 'light')
})

test('R3-5 加入待补充主题 → 已加入待补充主题, in demand.jsonl, and still so after another tab and back; 详情: 引用了 n 篇笔记, what it used, 待补充主题', async () => {
  const before = await s.page.evaluate(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]'))
  assert.equal(before, null, 'control: not added before the click')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-turn="0"] [data-action="add-demand"] button').textContent), ASK.demand.add)
  await s.page.click('[data-turn="0"] [data-action="add-demand"] button')
  await until(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]') !== null)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]').textContent.trim()), ASK.demand.added)
  assert.deepEqual(core.demandsAdded(dir()), [{ topic: MISSING, question: QUESTION }])
  // another tab, then 问库 again: the page is drawn anew; the answer says 已加入 from the core's record
  await s.page.click('nav.st-lib-tabs button[data-tab="inbox"]')
  await until(() => document.querySelector('main[data-screen="inbox"][data-state="ready"]') !== null)
  await s.page.click('nav.st-lib-tabs button[data-tab="ask"]')
  await until(() => document.querySelector('main[data-screen="ask"][data-state="ready"] [data-turn="0"]') !== null)
  await s.page.waitForTimeout(800)
  assert.ok(await s.page.evaluate(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]') !== null), '已加入待补充主题 after reopening')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-turn="0"] [data-action="add-demand"]')), null)
  await panel('detail')
  const d = await s.page.evaluate(() => ({
    title: document.querySelector('[data-part="detail-ask"] [data-part="detail-head"] h2').textContent,
    lead: document.querySelector('[data-part="detail-ask"] [data-part="detail-lead"]').textContent,
    cites: [...document.querySelectorAll('[data-part="detail-cites"] [data-detail-cite]')].map(e => Number(e.dataset.detailCite)),
    demand: [...document.querySelectorAll('[data-part="demands"] [data-demand]')].map(e => [e.dataset.demand, e.querySelector('small').textContent]),
    hint: [...document.querySelectorAll('[data-part="demands"] .limit-note')].map(e => e.textContent),
  }))
  assert.equal(d.title, '引用了 2 篇笔记')
  assert.match(d.lead, /^命中 \d+ 条 · 引用 2 条 · 模型调用 \d+ 次 · 核验 \d+ 轮均通过 · 模型未获得任何工具权限，未联网$/)
  assert.deepEqual(d.cites, [1, 2])
  const row = core.demands(dir()).find(x => x.topic === MISSING)
  assert.ok(d.demand.some(([t, small]) => t === MISSING && small === `已提问 ${row.count} 次`), JSON.stringify(d.demand))
  assert.ok(d.hint.includes('提问达 3 次的内容将建议添加为主题。'))
})

test('W7b 问库 just answers: a sentence that asks to change the library is asked of the library — no routing, no hand-over, no card', async () => {
  const asked = () => (log().match(/^.*ask: calls /gm) ?? []).length
  const before = asked()
  const i = await send('这个库单次运行最多调用 30 次就够了，帮我把上限改成 30。')
  const t = await s.page.evaluate(n => { const e = document.querySelector(`[data-turn="${n}"]`); return { answer: e.querySelector('.st-ask-answer') !== null, speaker: e.querySelector('.speaker small')?.textContent ?? null, card: e.querySelector('[data-proposal]') !== null, routed: e.querySelector('[data-part="routed"], [data-part="unsure"], [data-part="handing"]') !== null, route: e.dataset.route ?? null } }, i)
  assert.deepEqual(t, { answer: true, speaker: ASK.speakerRole, card: false, routed: false, route: null }, 'an answer of the library (问库 speaks), nothing else')
  await waitFor(() => asked() > before)
  assert.equal(asked(), before + 1, 'one askLibrary for the sentence')
  assert.equal(existsSync(join(dir(), '_pipeline', 'routes.jsonl')), false, 'no routing line written')
  assert.deepEqual(await s.page.evaluate(() => ['sendLibraryMessage', 'resolveLibraryMessage', 'agentSend'].filter(m => typeof window.streams[m] === 'function')), [], 'no bridge method of the old routing')
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
