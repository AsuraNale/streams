// 问库 — redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-5; design 03-页面稿 P13, 07-模板版 「问库」; F41–F44) on the seeded
// world plus plan B's notes and the shelf (the seeded library is registered and current). The answer is scripted
// (STREAMS_DEV_ASK_SCRIPT: the fake connection answers the core's ask prompt with it — cites 1 and 2 and what the library
// lacks), the main Agent's two turns too (STREAMS_DEV_AGENT_SCRIPT: each a proposal to change this library's run cap).
//   - V9 on the page: every cite number and every note listed under the answer is in the core's candidate set for that
//     question (askCandidates); 打开 opens that note in 资料库; 查看原文 opens Streams' reading window (its log), not the browser
//   - 「库内缺少：…」 + 「加入待补充主题」 → 「已加入待补充主题」 (demand.jsonl has the click); another tab and back: still 已加入 — the state
//     is the core's record, not the page's (mutant r3-demand-forgotten: the page's own state only → red here); 详情: 引用了 n 篇笔记,
//     the line of what the answer used, 待补充主题 with 已提问 n 次 and the hint
//   - a sentence that asks to change the library: 「已转交主 Agent」 and the proposal in the conversation; the same card in the right
//     panel's 待确认; 确认 in 待确认 → the conversation's card is confirmed; the second card 确认'd in the conversation → it leaves
//     待确认 (mutant r3-card-not-shared: 待确认's 确认 calls nothing → red here)
//   - the box: 「每次提问约 2–5 次模型调用 · 如需调整来源、主题或要求，可直接描述」
// redesign R6b-2: a test name or comment here quotes a sentence of the page as 05 has it now
// (docs/checks/2026-11-13-r6b/05-对照.md 附表一); no assertion changed for it unless a line says so.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
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
    const card = cap => ({ reply: `已生成修改提议：单次运行上限改为 ${cap} 次模型调用。`, proposals: [{ kind: 'edit_cap', why: `你说上限改成 ${cap}`, params: { libraryId: shelf.ids[0], cap } }] })
    writeFileSync(join(world.root, 'agent.json'), JSON.stringify([card(30), card(40)]), 'utf8')
  },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'ask', STREAMS_DEV_ASK_SCRIPT: join(world.root, 'ask.json'), STREAMS_DEV_AGENT_SCRIPT: join(world.root, 'agent.json') }),
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } },
})
const POLL = { polling: 100, timeout: 60_000 }
const dir = () => s.world.library
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
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="scope"]').textContent), `仅基于库内内容回答 · 范围：已收藏 ${c.kept} 条 · 我的笔记 ${c.authored} 条 · 不联网`)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="input-hint"]').textContent), '每次提问约 2–5 次模型调用 · 如需调整来源、主题或要求，可直接描述')
})

test('R3-5 / V9 an answer: each cite number and each note listed is in the core\'s candidate set; 打开 → 资料库, 查看原文 → the reading window', async () => {
  const i = await send(QUESTION)
  const cands = core.askCandidates(dir(), QUESTION)
  assert.ok(cands.length >= 2, 'control: the library has candidates')
  const got = await s.page.evaluate(n => {
    const t = document.querySelector(`[data-turn="${n}"]`)
    return {
      route: t.dataset.route,
      cites: [...t.querySelectorAll('[data-sentence] [data-cite]')].map(e => Number(e.dataset.cite)),
      sources: [...t.querySelectorAll('[data-source-n]')].map(e => [Number(e.dataset.sourceN), e.dataset.id]),
      missing: t.querySelector('[data-part="missing"]')?.textContent,
    }
  }, i)
  assert.equal(got.route, 'question')
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

// redesign R5b (R5b-1, R5b-3): the card is the one 提议 — its buttons 拒绝 · 提出修改 · 确认, the main one on the right (were 确认 · 提出修改 ·
// 拒绝 in the conversation); in 待确认 it is the small card [data-decide="agent:<id>"] with the same three (were decide-decline · decide-revise ·
// decide-confirm in [data-part="decide-actions"]). Only how the buttons are found and their order changed; what is checked is as it was.
test('R3-5 转交主 Agent: 「已转交主 Agent」 and the card in the conversation; the same card in 待确认 — decided in either place, decided in both', async () => {
  const i = await send('这个库单次运行最多调用 30 次就够了，帮我把上限改成 30。')
  await until(n => document.querySelector(`[data-turn="${n}"] [data-proposal]`) !== null, i)
  const first = await s.page.evaluate(n => { const t = document.querySelector(`[data-turn="${n}"]`); return { route: t.dataset.route, routed: t.querySelector('[data-part="routed"]')?.textContent, card: t.querySelector('[data-proposal]').dataset.proposal, status: t.querySelector('[data-proposal]').dataset.status, actions: [...t.querySelectorAll('[data-proposal] [data-action]')].map(a => [a.dataset.action, a.textContent.trim()]) } }, i)
  assert.equal(first.route, 'change')
  assert.equal(first.routed, '已转交主 Agent')
  assert.equal(first.status, 'pending')
  assert.deepEqual(first.actions, [['decline', '拒绝'], ['revise', '提出修改'], ['confirm', '确认']])
  await panel('decide')
  await until(id => document.querySelector(`[data-pane="decide"] [data-decide="agent:${id}"] [data-action]`) !== null, first.card)
  assert.deepEqual(await s.page.evaluate(id => [...document.querySelectorAll(`[data-decide="agent:${id}"] [data-action]`)].map(a => [a.dataset.action, a.textContent.trim()]), first.card), [['decline', '拒绝'], ['revise', '提出修改'], ['confirm', '确认']])
  const capBefore = core.pipelineFrom(core.readConfig(dir()).config).cap
  // 确认 in 待确认 → the card in the conversation is confirmed too, and the library's cap is changed once
  await s.page.click(`[data-decide="agent:${first.card}"] [data-action="confirm"] button`)
  await until(([n, id]) => document.querySelector(`[data-turn="${n}"] [data-proposal="${id}"]`)?.dataset.status === 'confirmed', [i, first.card])
  await until(id => document.querySelector(`[data-decide="agent:${id}"]`) === null, first.card)
  const capAfter = core.pipelineFrom(core.readConfig(dir()).config).cap
  assert.notEqual(capAfter, capBefore, 'control: the confirm changed the library')
  assert.equal(capAfter, 30)
  // the second card, 确认 in the conversation → it leaves 待确认
  const j = await send('还是改成 40 吧，帮我把上限改成 40。')
  await until(n => document.querySelector(`[data-turn="${n}"] [data-proposal]`) !== null, j)
  const second = await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"] [data-proposal]`).dataset.proposal, j)
  await until(id => document.querySelector(`[data-decide="agent:${id}"]`) !== null, second)
  await s.page.click(`[data-turn="${j}"] [data-proposal="${second}"] [data-action="confirm"] button`)
  await until(([n, id]) => document.querySelector(`[data-turn="${n}"] [data-proposal="${id}"]`)?.dataset.status === 'confirmed', [j, second])
  await until(id => document.querySelector(`[data-decide="agent:${id}"]`) === null, second)
  assert.equal(core.pipelineFrom(core.readConfig(dir()).config).cap, 40)
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
