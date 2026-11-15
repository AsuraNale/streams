// N1（草案，待 维护者 定）· 主 Agent 的任何改动都必须经一张你确认过的提议卡；变异测试：去掉「只认确认」的守卫，测试必须变红
//
// How it is checked, at the level of the app's own wiring (the desktop's main-process services in plain Node, as main.mjs
// wires them: the library service, package B's proposal service, package C's agent service), with the main Agent on the
// core's scripted stand-in (no model call) and the add_source test fetch on a site on this machine:
//   1. two turns of the main Agent put forward all ten kinds of card (five per answer, the most one answer may carry);
//   2. while they wait, nothing of either library, of the library registry or of the place new libraries go has changed
//      (every file hashed), and no round was queued;
//   3. 「不要」 two of them, 「改一下」 one: still nothing changed;
//   4. 「确认」 on a card already 不要 / 改一下 is refused and changes nothing (the guard: only a pending card is decided);
//   5. 「确认」 on each of the other seven: each one changes what its card says and nothing that a declined card would
//      have changed; every change is in the library's changes.jsonl as agent-confirmed with the card's id; the new library
//      exists and is registered; the round is queued once.
// The scenario returns the list of what went wrong. On the repository it must be empty. Reverse (mutants, a copy of
// core/src + desktop/src/main changed in one line, ./support/mutant-app.mjs):
//   N1-a  core proposals.mjs assertPending no longer refuses a card that is not pending → step 4 changes the library: red
//   N1-b  the desktop's 「不要」 runs the card instead of declining it → step 3 changes the library: red
//   N1-c  the agent service confirms each card the moment it is made → step 2 changes the library: red
// redesign R6b-4: the test's name and the fixture's words (three 理由 and the 提出修改 sentence of the scripted main agent) use
// the page's words now — 拒绝 / 提出修改 (were 不要 / 改一下), 严格程度 (过关线), 单次运行上限 (每轮), 立即运行 (现在跑一轮). No assertion reads
// those words; the messages of the assertions and the mutants' `step` (which must equal a message) are as they were.
// redesign R6b precheck: three 理由 more without 调 / 跑 (05 统一用词: 修改 / 提高 / 降低, 运行) — 提高严格程度, 降低单次运行上限,
// 提前定时运行的时间; no assertion reads them.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mutantApp, realApp } from './support/mutant-app.mjs'
import { servicesWorld, sha, tree } from './support/services.mjs'
import { startSite } from './support/site.mjs'

const site = await startSite()
after(() => site.close())

const NEW_LIBRARY = '新能源电池'

/** The main Agent's two answers: all ten kinds, five per answer. */
function answers(ids, libraryRoot) {
  const a = ids.a
  const b = ids.b
  return [
    { reply: '先拟了五张卡，等你确认。', proposals: [
      { kind: 'edit_brief', params: { libraryId: a, brief: '只追 agent 记忆与评测，不要营销稿。' }, why: '你说只关心记忆' },
      { kind: 'add_source', params: { libraryId: a, source: { name: 'evals-weekly', kind: 'rss', url: site.feed('evals-weekly', 3), topic: '评测' } }, why: '补一个评测来源' },
      { kind: 'remove_source', params: { libraryId: b, name: 'old-blog' }, why: 'old-blog 一直没有新东西' },
      { kind: 'pause_source', params: { libraryId: b, name: 'feed-b', paused: true }, why: 'feed-b 连续被拒' },
      { kind: 'edit_topics', params: { libraryId: a, ops: [{ op: 'add_keywords', topic: '评测', keywords: ['基准'] }] }, why: '评测加一个关键词' },
    ] },
    { reply: '再拟五张。', proposals: [
      { kind: 'edit_thresholds', params: { libraryId: a, relevance: 0.75 }, why: '提高严格程度' },
      { kind: 'edit_schedule', params: { libraryId: b, enabled: true, time: '07:45' }, why: '提前定时运行的时间' },
      { kind: 'edit_cap', params: { libraryId: a, cap: 12 }, why: '降低单次运行上限' },
      { kind: 'run_round', params: { libraryId: b }, why: '立即运行一次看看' },
      { kind: 'create_library', params: { name: NEW_LIBRARY, brief: '追踪新能源电池：装机量、价格。', folder: join(libraryRoot, 'battery'), topics: [{ name: '电池', keywords: ['装机量'] }], sources: [{ name: 'battery-weekly', kind: 'rss', url: site.feed('battery', 2), topic: '电池' }], schedule: { enabled: false, time: '08:30' } }, why: '你想追新能源电池' },
    ] },
  ]
}

const KINDS = ['create_library', 'add_source', 'remove_source', 'pause_source', 'edit_topics', 'edit_brief', 'edit_thresholds', 'edit_schedule', 'edit_cap', 'run_round']

/** The whole N1 scenario on `app` → [what went wrong]. Throws only when the world itself cannot be made. */
async function scenario(app, label) {
  const problems = []
  const want = (ok, what) => { if (!ok) problems.push(what) }
  const libs = [
    { key: 'a', name: 'AI Agent 记忆', topics: [{ name: '评测', keywords: ['benchmark'] }], sources: [{ name: 'feed-a', kind: 'rss', url: site.feed('a', 2), topic: '评测' }] },
    { key: 'b', name: '中国电动车行业', topics: [{ name: '整车销量', keywords: ['月销'] }], sources: [{ name: 'feed-b', kind: 'rss', url: site.feed('b', 2), topic: '整车销量' }, { name: 'old-blog', kind: 'rss', url: site.feed('old', 1), topic: '整车销量' }] },
  ]
  // the scripted main Agent: its answers are made once the library ids are known (they name the libraries by id)
  let script = []
  const w0 = { connector: null }
  const app0 = await app.core()
  const connector = app0.scriptedAgentConnector({ answers: (_req, n) => script[n] ?? { reply: '没有别的了。' } })
  w0.connector = connector
  const w = await servicesWorld(app, { name: `n01-${label}`, libraries: libs, connector })
  const core = w.core
  script = answers(w.ids, w.libraryRoot)
  const newFolder = join(w.libraryRoot, 'battery')
  const registryFile = join(w.appData, 'libraries.json')
  const facts = () => ({ a: tree(w.dirs.a), b: tree(w.dirs.b), registry: sha(registryFile), newFolder: existsSync(newFolder), queued: w.queued.length })
  const start = facts()
  const snap = (key, fields) => core.snapshot(w.dirs[key], fields)
  const a0 = snap('a', ['brief', 'sources', 'topics', 'thresholds', 'cap'])
  const b0 = snap('b', ['sources', 'schedule'])

  // 1. two turns
  const t1 = await w.agent.handlers.agentSend('帮我把 AI Agent 记忆这个库收紧一点，电动车那个库也看看')
  const t2 = await w.agent.handlers.agentSend('还有别的吗？')
  const ids = [...t1.proposalIds, ...t2.proposalIds]
  const cards = ids.map(id => w.proposals.card(id))
  want(cards.length === 10, `${label}: 10 cards made (got ${cards.length}: ${JSON.stringify(w.lines.filter(l => l.includes('proposal')).slice(-3))})`)
  want(JSON.stringify(cards.map(c => c?.kind).sort()) === JSON.stringify([...KINDS].sort()), `${label}: the ten kinds (got ${cards.map(c => c?.kind).join(',')})`)
  const byKind = Object.fromEntries(cards.filter(Boolean).map(c => [c.kind, c]))
  // 2. while they wait: nothing changed
  const pendingNow = cards.filter(c => c && w.proposals.card(c.id)?.status === 'pending' && c.by === 'agent').length
  want(pendingNow === 10, `${label}: all ten pending by agent after the turns (${pendingNow})`)
  want(JSON.stringify(facts()) === JSON.stringify(start), `${label}: the turns changed something before any 确认: ${diff(start, facts())}`)
  if (cards.length !== 10) return problems

  // 3. 不要 ×2, 改一下 ×1: still nothing
  const decide = (fn, ...args) => { try { return { card: w.proposals.handlers[fn](...args) } } catch (err) { return { error: err } } }
  decide('declineProposal', byKind.edit_cap.id)
  decide('declineProposal', byKind.pause_source.id)
  decide('reviseProposal', byKind.edit_thresholds.id, '严格程度不要改')
  want(w.proposals.card(byKind.edit_cap.id).status === 'declined', `${label}: 不要 → declined (${w.proposals.card(byKind.edit_cap.id).status})`)
  want(w.proposals.card(byKind.edit_thresholds.id).status === 'revise', `${label}: 改一下 → revise`)
  want(JSON.stringify(facts()) === JSON.stringify(start), `${label}: 不要 / 改一下 changed something: ${diff(start, facts())}`)

  // 4. 确认 on a card that is not pending: refused, nothing changed
  for (const k of ['edit_cap', 'pause_source', 'edit_thresholds']) {
    const r = decide('confirmProposal', byKind[k].id)
    want(r.error?.code === 'bad_arguments', `${label}: 确认 on a ${w.proposals.card(byKind[k].id).status} ${k} card was not refused (${r.error?.code ?? r.card?.status})`)
  }
  want(JSON.stringify(facts()) === JSON.stringify(start), `${label}: 确认 on a decided card changed something: ${diff(start, facts())}`)

  // 5. 确认 the other seven
  for (const k of ['edit_brief', 'add_source', 'remove_source', 'edit_topics', 'edit_schedule', 'run_round', 'create_library']) {
    const r = decide('confirmProposal', byKind[k].id)
    want(r.card?.status === 'confirmed', `${label}: 确认 ${k} → ${r.card?.status ?? r.error?.code} ${JSON.stringify(r.card?.failure ?? r.card?.reason ?? '')}`)
  }
  const a1 = snap('a', ['brief', 'sources', 'topics', 'thresholds', 'cap'])
  const b1 = snap('b', ['sources', 'schedule'])
  want(a1.brief === '只追 agent 记忆与评测，不要营销稿。', `${label}: edit_brief confirmed → the brief (${a1.brief})`)
  const names = (a1.sources ?? []).map(s => s.name)
  want(names.includes('evals-weekly'), `${label}: add_source confirmed → sources of a ${names.join(',')}`)
  const namesB = (b1.sources ?? []).map(s => s.name)
  want(JSON.stringify(namesB) === JSON.stringify(['feed-b']), `${label}: remove_source confirmed → sources of b ${namesB.join(',')}`)
  want((a1.topics ?? []).find(t => t.name === '评测')?.keywords?.includes('基准'), `${label}: edit_topics confirmed → the keyword`)
  want(JSON.stringify(a1.thresholds) === JSON.stringify(a0.thresholds), `${label}: the thresholds of a card sent back changed`)
  want(a1.cap === a0.cap, `${label}: the cap of a declined card changed (${a0.cap} → ${a1.cap})`)
  const feedB = list => JSON.stringify((list ?? []).find(s => s.name === 'feed-b'))
  want(feedB(b1.sources) === feedB(b0.sources), `${label}: the source of a declined pause card changed`)
  want(b1.schedule?.time === '07:45' && b1.schedule?.enabled === true, `${label}: edit_schedule confirmed → ${JSON.stringify(b1.schedule)}`)
  // run_round queues b once; create_library queues the new library's first round (UC1 step 4); nothing else is queued
  const newId = w.library.entries().find(e => e.path === newFolder)?.id
  want(JSON.stringify(w.queued.map(q => q.id).sort()) === JSON.stringify([w.ids.b, newId].sort()), `${label}: queued after the confirms: ${JSON.stringify(w.queued)} (b ${w.ids.b}, new ${newId})`)
  want(existsSync(join(newFolder, 'streams.json')), `${label}: create_library confirmed → the folder is a library`)
  want(w.library.entries().some(e => e.path === newFolder), `${label}: create_library confirmed → registered`)
  // 变更记录 (was 「谁定的」): every confirmed change of a, agent-confirmed with its card's id; none from a declined card
  const changes = core.readChanges(w.dirs.a).entries
  const confirmedIds = new Set(['edit_brief', 'add_source', 'edit_topics'].map(k => byKind[k].id))
  want(changes.length > 0 && changes.every(c => c.by === 'agent-confirmed' && confirmedIds.has(c.proposalId)), `${label}: changes.jsonl of a: ${JSON.stringify(changes.map(c => [c.field, c.by, c.proposalId]))}`)
  want(!changes.some(c => c.field === 'cap' || c.field === 'thresholds'), `${label}: a declined / sent-back card left a change line`)
  return problems
}

function diff(a, b) {
  const out = []
  for (const k of Object.keys(a)) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue
    if (a[k] && typeof a[k] === 'object') {
      const keys = new Set([...Object.keys(a[k]), ...Object.keys(b[k] ?? {})])
      out.push(`${k}: ${[...keys].filter(f => a[k][f] !== b[k]?.[f]).join(',')}`)
    } else out.push(`${k}: ${a[k]} → ${b[k]}`)
  }
  return out.join('; ') || 'nothing'
}

test('N1 · the main Agent\'s ten kinds of card change nothing until 确认; 拒绝 / 提出修改 change nothing; only 确认 of a pending card changes what it says', async () => {
  const problems = await scenario(realApp(), 'real')
  assert.deepEqual(problems, [])
})

const MUTANTS = [
  { id: 'N1-a', what: 'assertPending lets a card that is not pending through', step: '确认 on a decided card changed',
    edits: [{ file: 'core/src/proposals/proposals.mjs', from: "if (c === null || typeof c !== 'object' || c.status !== 'pending') {", to: "if (c === null || typeof c !== 'object') {" }] },
  { id: 'N1-b', what: '「不要」 runs the card', step: '不要 / 改一下 changed something',
    edits: [{ file: 'desktop/src/main/services/proposals.mjs', from: 'try { next = declineProposal(known(id), { now }) } catch (err) { throw bridgeErrorOf(err) }', to: "try { const c = known(id); next = confirmProposal(c, { libraryDir: c.libraryId ? library.find(c.libraryId)?.path : null, now, hooks: { enqueue: () => ({ queued: true }) } }) } catch (err) { throw bridgeErrorOf(err) }" }] },
  { id: 'N1-c', what: 'a card made by the agent is confirmed at once', step: 'the turns changed something before any 确认',
    edits: [{ file: 'desktop/src/main/services/proposals.mjs', from: '    persist(card)\n    log(`proposals: ${card.id} ${card.kind} by ${card.by}', to: '    persist(card)\n    try { handlers.confirmProposal(card.id) } catch {}\n    log(`proposals: ${card.id} ${card.kind} by ${card.by}' }] },
]

for (const m of MUTANTS) {
  test(`N1 reverse ${m.id}: ${m.what} → the scenario is red at「${m.step}」`, async () => {
    const app = await mutantApp(m.id, m.edits)
    const problems = await scenario(app, m.id)
    assert.ok(problems.some(p => p.includes(m.step)), `the mutant was not caught at that step: ${JSON.stringify(problems)}`)
    assert.equal(app.untouched(), true, 'the real files are as they were')
  })
}
