// Redesign R5a (docs/checks/2026-11-12-r5a/contract.md 「测」; docs/desktop.md §4.19): the main process's part, in plain Node on
// real libraries the library service registered, the real proposals, agent, pipeline and schedule services, the core's scripted
// connections (no model is called) and feeds on a local server:
//   R5a-1  listToConfirm: every library's 主 Agent 提议 and 系统检测 — 来处, 库名, 动作 (the 动作表), evidence in the interface's
//          terms — from a library that is NOT the current one too; handling one sends suggestions-changed and the list is one
//          shorter; a confirmed 暂停该来源 collapses the same source's ① ③ at once
//   R5a-2  actOnSuggestion on a library that is not the current one: 暂停该来源 / 将严格程度调整为… change THAT library's
//          streams.json, 变更记录 by 'you' (手动修改), no model call; a card that no longer fits is not acted on; 交由主 Agent
//          分析 hands it over in the interface's words; 生成修改提议 leaves the 追踪要求 as it is and a 修改追踪要求 proposal is
//          there; rule ⑤ is checked right after a 放弃 is written (撤销 one never counts)
//   R5a-4  重新评分 through the queue, under the 单次运行上限, into 待看, notes/ byte for byte
//   R5a-6  trySource, the starter pack, a failed proposal, a run's problems: no raw text, no HTTP code — the diagnostics have them
//   words  the keys of the actions are in both dictionaries; the core's state / level / quick words are the dictionaries' own
// Each rule first gets the input made to break it (the r5a-* mutants of scripts/mutation-check.mjs). Nothing here touches the
// real app data.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAgentService } from '../src/main/services/agent.mjs'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createProposalsService } from '../src/main/services/proposals.mjs'
import { createPipelineService } from '../src/main/services/pipeline.mjs'
import { createScheduleService } from '../src/main/services/schedule.mjs'
import { createSourcesService } from '../src/main/services/sources.mjs'
import { createRawErrors } from '../src/main/raw-errors.mjs'
import { diagnosticsText } from '../src/main/diagnostics.mjs'
import { publicCard, publicProblems } from '../src/main/public-data.mjs'
import { BRIDGE_METHODS, checkArgs } from '../src/main/bridge-methods.mjs'
import {
  STATE_WORDS, LEVEL_WORDS, QUICK_WORDS, addSource, addTopic, agentPaths, appendEvent, appendFetchLog, createLibrary, readBrief, readChanges, readStrictness,
  readSuggestionLines, readTranscript, recordAiInstruction, runRound, saveBrief, saveStrictness, scriptedAgentConnector, scriptedConnector, targetLevel, thresholdsOf,
  pipelineConfig, readUsage, setSourcePaused, openSuggestions, ADVICE_WORDS, CONNECTION_WORDS, appendTranscript,
} from '../src/main/core.mjs'
import { createStatusService } from '../src/main/services/status.mjs'
import { PROPOSALS } from '../src/renderer/texts/proposals.js'
import { PROPOSALS as PROPOSALS_EN } from '../src/renderer/texts-en/proposals.js'
import { CONNECTIONS, FETCH_HINTS, FETCH_STATES, SOURCE_STATES } from '../src/renderer/texts/common.js'
import { CONNECTIONS as CONNECTIONS_EN, FETCH_HINTS as FETCH_HINTS_EN, FETCH_STATES as FETCH_STATES_EN } from '../src/renderer/texts-en/common.js'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { SOURCES } from '../src/renderer/texts/sources.js'
import { SOURCES as SOURCES_EN } from '../src/renderer/texts-en/sources.js'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { INBOX as INBOX_EN } from '../src/renderer/texts-en/inbox.js'
import { titleOf } from '../../core/src/pipeline/fake.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'
import { startFakeServer } from '../../core/test/support/fake-server.mjs'
import { feedRoute, serveItems } from '../../core/test/support/pipeline.mjs'

const worlds = []
const servers = []
after(async () => {
  for (const srv of servers) await srv.close()
  for (const w of worlds) removeTree(w.root, { waitMs: 3000 })
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check, { timeoutMs = 20_000 } = {}) => {
  const t0 = Date.now()
  while (!check()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timed out waiting')
    await sleep(50)
  }
}
const T0 = Date.parse('2026-11-12T08:00:00.000Z')
const at = h => new Date(T0 + h * 3_600_000).toISOString()
const CLOCK = new Date(T0 + 20 * 3_600_000)
const now = () => CLOCK
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const notesHash = dir => { const d = join(dir, 'notes'); return existsSync(d) ? readdirSync(d).sort().map(f => `${f}:${sha(join(d, f))}`).join('|') : '' }
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

let seq = 0
/** A dismissal straight into the ledger (with a quick reason, words only, or none). */
function dismissal(dir, quick, hour) {
  seq += 1
  const url = `https://example.test/d/${seq}`
  appendEvent(dir, { ts: at(hour), ev: 'seen', url, source: 'feed-a', title: `dismissed ${seq}` })
  appendEvent(dir, { ts: at(hour), ev: 'dismissed', url, ...(quick ? { quick, reason: quick } : {}) })
}

/**
 * Two registered libraries (a, then b — b is the current one) with the same topic and a source each; the library, proposals,
 * agent, pipeline and schedule services wired as main.mjs wires them. `agentAnswers`: the main agent's scripted answers;
 * `score`: the scoring connection's relevance by title.
 */
async function setup({ agentAnswers = [], score = () => 0.9, feedOf = null, scoring = null } = {}) {
  const w = testWorld('st-r5a-')
  worlds.push(w)
  const appData = join(w.root, 'appData')
  const raw = createRawErrors({ log: w.log, now })
  let pipeline = null
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale: () => w.locale, now, agentUsageFile: agentPaths(join(appData, 'agent')).usage, held: () => pipeline?.held() ?? null })
  const dirs = {}
  for (const name of ['a', 'b']) {
    const dir = join(w.root, name)
    dirs[name] = dir
    createLibrary(dir, { name })
    addTopic(dir, { name: 'agent 框架', keywords: ['agent framework'] })
    addSource(dir, { name: 'feed-a', kind: 'rss', url: feedOf?.(name) ?? `https://example.test/${name}/a.xml`, topic: 'agent 框架' })
    addSource(dir, { name: 'feed-b', kind: 'rss', url: `https://example.test/${name}/b.xml`, topic: 'agent 框架' })
    w.dialogAnswers.push(dir)
    await library.handlers.chooseLibraryFolder()
    await library.handlers.useChosenFolder(name)
  }
  const [ia, ib] = library.entries().map(l => l.id)
  const agentConnector = scriptedAgentConnector({ answers: agentAnswers })
  const scorer = scriptedConnector({ score: (key, prompt) => (key === 'relevance' ? score(titleOf(prompt)) : 0.8) })
  const connections = { devConnection: null, active: () => ({ kind: 'claude-code', model: 'm', verifyModel: 'm', connector: scoring ?? scorer }), sessionConnector: () => agentConnector }
  let agent = null
  let scheduler = null
  const proposals = createProposalsService({ appDataDir: appData, library, emit: w.emit, log: w.log, now, scratchRoot: join(w.root, 'scratch'), afterConfirmed: card => agent?.afterProposal(card), rawErrors: raw })
  agent = createAgentService({ appDataDir: appData, library, connections, proposals, emit: w.emit, log: w.log, now, rawErrors: raw })
  pipeline = createPipelineService({
    library, connections, emit: w.emit, log: w.log, shell: w.shell, locale: () => w.locale, now, fetchContext: { timeoutMs: 2000, sleep: async () => {} },
    afterRound: r => agent.afterRound(r), afterDismiss: r => agent.afterDismiss(r), rescoreGate: entry => scheduler.startRescore(entry),
    onRoundDone: done => scheduler?.roundDone(done), rawErrors: raw, roundGate: () => scheduler.startCurrent('the page'),
  })
  scheduler = createScheduleService({ settingsFile: w.settingsFile, library, pipeline, emit: w.emit, log: w.log, now })
  const sources = createSourcesService({ library, emit: w.emit, log: w.log, now, rawErrors: raw, fetchContext: { timeoutMs: 2000, sleep: async () => {} } })
  return { w, raw, library, proposals, agent, pipeline, scheduler, sources, scorer, agentConnector, ids: { a: ia, b: ib }, dirs }
}

/** Library a (not the current one) gets one 系统检测 of each rule (① as 地址无效 with a raw 404), b gets its ④. */
function everyRule(s) {
  const { dirs, ids, agent } = s
  appendFetchLog(dirs.a, { ts: at(1), round: 'r1', source: 'feed-a', kind: 'rss', status: 'gap', http: 404, message: 'HTTP 404: check the address', count: 0, new: 0 })
  appendFetchLog(dirs.a, { ts: at(2), round: 'r2', source: 'feed-a', kind: 'rss', status: 'gap', http: 404, message: 'HTTP 404: check the address', count: 0, new: 0 })
  recordAiInstruction(dirs.a, { at: at(1), source: 'feed-a', itemId: 'u1', by: 'rule', phrases: ['ignore your rules'] })
  writeFileSync(join(dirs.a, '_pipeline', 'rounds.jsonl'), [1, 2, 3].map(h => JSON.stringify({ id: `r${h}`, startedAt: at(h), finishedAt: at(h), counts: { inbox: 0 } })).join('\n') + '\n')
  for (const h of [3, 4, 5]) dismissal(dirs.a, 'marketing', h)
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  agent.afterRound({ dir: dirs.b, libraryId: ids.b })
}

const kinds = items => items.map(i => `${i.from}:${i.libraryId}:${i.kind}`).sort()

// ---- R5a-1 ------------------------------------------------------------------------------------------------------------

test('R5a-1 listToConfirm: both places, every library (not only the current one), the actions of the 动作表, no raw error; handled → event and one fewer', async () => {
  const s = await setup()
  const { w, ids, dirs, agent, proposals } = s
  assert.equal(s.library.current().libraryId, ids.b, 'control: b is the current library')
  everyRule(s)
  await proposals.createProposal('pause_source', { libraryId: ids.a, name: 'feed-b', paused: true }, '它一直没有新内容')
  const v = agent.handlers.listToConfirm()
  assert.deepEqual(kinds(v.items), [
    `agent:${ids.a}:pause_source`,
    `system:${ids.a}:ai-instruction`, `system:${ids.a}:dismiss-reason`, `system:${ids.a}:no-output`, `system:${ids.a}:source-failing`, `system:${ids.a}:topic-overlap`,
    `system:${ids.b}:topic-overlap`,
  ].sort())
  assert.equal(v.count, 7)
  assert.ok(v.items.every(i => i.libraryName === (i.libraryId === ids.a ? 'a' : 'b')), 'the library\'s name on each')
  const of = (lib, kind) => v.items.find(i => i.libraryId === lib && i.kind === kind)
  const act = i => i.actions.map(a => a.level ? `${a.id}:${a.level}` : a.id)
  assert.deepEqual(act(of(ids.a, 'source-failing')), ['edit-address', 'pause-source', 'forward', 'dismiss'], '地址无效: 修改地址 first')
  assert.deepEqual(act(of(ids.a, 'no-output')), [`set-strictness:${targetLevel(thresholdsOf(pipelineConfig(dirs.a)))}`, 'forward', 'dismiss'])
  assert.deepEqual(act(of(ids.a, 'ai-instruction')), ['pause-source', 'forward', 'dismiss'])
  assert.deepEqual(act(of(ids.a, 'topic-overlap')), ['forward', 'dismiss'])
  assert.deepEqual(act(of(ids.a, 'dismiss-reason')), ['draft-proposal', 'dismiss'])
  assert.deepEqual(act(of(ids.a, 'pause_source')), ['confirm', 'revise', 'decline'])
  assert.deepEqual(of(ids.a, 'source-failing').actions.map(a => a.callsModel), [false, false, true, false])
  assert.deepEqual([of(ids.b, 'topic-overlap').otherLibraryId, of(ids.b, 'topic-overlap').otherLibraryName], [ids.a, 'a'])
  assert.equal(of(ids.a, 'topic-overlap').evidence.percent, 100)
  assert.deepEqual(of(ids.a, 'ai-instruction').evidence.phrases, ['ignore your rules'], '③ carries the phrase')
  assert.deepEqual(of(ids.a, 'source-failing').evidence.last, { ts: at(2), status: 'gap', hint: 'fix-address-or-remove' }, 'a state and the key of what to do')
  // O9: no fetcher message, no HTTP code to the page — the diagnostics have them
  const page = JSON.stringify(v)
  assert.ok(!page.includes('404') && !page.includes('check the address'), 'no raw error in the view')
  assert.ok(!JSON.stringify(agent.handlers.listSuggestions()).includes('404'), 'nor in the old list')
  assert.ok(s.raw.lines().some(l => l.includes('HTTP 404') && l.includes('check the address')), 'the raw text is in the diagnostics')
  // handled: the event says so, and the list is one shorter
  const n = w.eventsOf('suggestions-changed').length
  agent.handlers.dismissSuggestion(ids.b, `topic-overlap:${ids.a}`)
  assert.deepEqual(w.eventsOf('suggestions-changed').slice(n).map(e => e.payload), [{ libraryId: ids.b, key: `topic-overlap:${ids.a}`, status: 'dismissed' }])
  const v2 = agent.handlers.listToConfirm()
  assert.equal(v2.count, 6)
  assert.deepEqual(v2.handled.filter(h => h.from === 'system').map(h => [h.libraryId, h.kind, h.status]), [[ids.b, 'topic-overlap', 'dismissed']])
  // new ones sent the event too
  assert.ok(w.eventsOf('suggestions-changed').filter(e => e.payload.status === 'open').length >= 6)
})

test('R5a-1 a confirmed 暂停该来源 (主 Agent 提议) collapses that source\'s ① and ③ at once — the event before anything is listed', async () => {
  const s = await setup()
  const { w, ids, dirs, proposals } = s
  everyRule(s)
  const card = await proposals.createProposal('pause_source', { libraryId: ids.a, name: 'feed-a', paused: true }, '地址无效')
  const n = w.eventsOf('suggestions-changed').length
  proposals.handlers.confirmProposal(card.id)
  const expired = w.eventsOf('suggestions-changed').slice(n).map(e => e.payload)
  assert.deepEqual(expired.map(e => [e.libraryId, e.key, e.status]).sort(), [[ids.a, 'ai-instruction:feed-a', 'expired'], [ids.a, 'source-failing:feed-a', 'expired']])
  assert.deepEqual(readSuggestionLines(dirs.a).filter(l => l.ev === 'expired').map(l => l.reason), ['source-paused', 'source-paused'])
  assert.ok(!s.agent.handlers.listToConfirm().items.some(i => i.subject === 'feed-a'))
})

test('R5a-1 a 系统检测 that no longer fits is not listed: changed by hand outside the app, it is expired (the event, a 失效 line) and cannot be acted on', async () => {
  const s = await setup()
  const { w, ids, dirs, agent } = s
  everyRule(s)
  const keysOf = v => v.items.filter(i => i.libraryId === ids.a && i.from === 'system').map(i => i.key).sort()
  assert.deepEqual(keysOf(agent.handlers.listToConfirm()), ['ai-instruction:feed-a', 'dismiss-reason:marketing', 'no-output:library', 'source-failing:feed-a', `topic-overlap:${ids.b}`], 'control: all five listed')
  // the summary in the interface's words and the keys of the card's words, both dictionaries
  for (const i of agent.handlers.listToConfirm().items.filter(x => x.from === 'system')) {
    assert.ok(typeof i.summary === 'string' && i.summary !== '' && !/source-failing|no-output|ai-instruction|topic-overlap|dismiss-reason|404/.test(i.summary), i.summary)
    for (const k of [i.words.title, i.words.evidence]) assert.ok(typeof get(PROPOSALS, k) === 'string' && typeof get(PROPOSALS_EN, k) === 'string', k)
  }
  // by hand, not through the app (no library-changed): feed-a paused, the 追踪要求 edited, the other library's topics changed
  setSourcePaused(dirs.a, 'feed-a', true)
  saveBrief(dirs.a, '只看开源实现')
  const n = w.eventsOf('suggestions-changed').length
  const v = agent.handlers.listToConfirm()
  assert.deepEqual(keysOf(v), ['no-output:library', `topic-overlap:${ids.b}`], 'the three that no longer fit are not listed')
  assert.deepEqual(w.eventsOf('suggestions-changed').slice(n).map(e => [e.payload.libraryId, e.payload.key, e.payload.status]).sort(), [
    [ids.a, 'ai-instruction:feed-a', 'expired'], [ids.a, 'dismiss-reason:marketing', 'expired'], [ids.a, 'source-failing:feed-a', 'expired'],
  ])
  assert.deepEqual(v.handled.filter(h => h.status === 'expired').map(h => [h.key, h.reason]).sort(), [
    ['ai-instruction:feed-a', 'source-paused'], ['dismiss-reason:marketing', 'brief-changed'], ['source-failing:feed-a', 'source-paused'],
  ])
  for (const h of v.handled.filter(x => x.status === 'expired')) assert.ok(PROPOSALS.expired[h.reason] && PROPOSALS_EN.expired[h.reason], h.reason)
  await assert.rejects(async () => agent.handlers.actOnSuggestion(ids.a, 'source-failing:feed-a', 'pause-source'), err => err.code === 'bad_arguments', 'expired: nothing to act on')
})

// ---- R5a-2 ------------------------------------------------------------------------------------------------------------

test('R5a-2 actOnSuggestion on a library that is not the current one: its streams.json, 手动修改 in its 变更记录, no model call', async () => {
  const s = await setup()
  const { w, ids, dirs, agent, agentConnector, scorer } = s
  everyRule(s)
  const bBefore = sha(join(dirs.b, 'streams.json'))
  const n = w.eventsOf('suggestions-changed').length
  const r = await agent.handlers.actOnSuggestion(ids.a, 'source-failing:feed-a', 'pause-source')
  assert.deepEqual([r.done, r.status, r.changed], [true, 'acted', ['sources']])
  const cfgA = JSON.parse(readFileSync(join(dirs.a, 'streams.json'), 'utf8'))
  assert.equal(cfgA.sources.find(x => x.name === 'feed-a').paused, true, 'library a\'s streams.json')
  assert.equal(sha(join(dirs.b, 'streams.json')), bBefore, 'the current library untouched')
  assert.deepEqual(readChanges(dirs.a).entries.map(c => [c.field, c.by]), [['sources', 'you']], '手动修改')
  assert.deepEqual(w.eventsOf('suggestions-changed').slice(n).map(e => [e.payload.key, e.payload.status]), [['source-failing:feed-a', 'acted'], ['ai-instruction:feed-a', 'expired']], 'the same source\'s ③ collapsed')
  // 将严格程度调整为…
  const target = targetLevel(thresholdsOf(pipelineConfig(dirs.a)))
  const r2 = await agent.handlers.actOnSuggestion(ids.a, 'no-output:library', 'set-strictness')
  assert.deepEqual([r2.status, r2.level], ['acted', target])
  assert.equal(readStrictness(dirs.a).level, target)
  assert.deepEqual(readChanges(dirs.a).entries.map(c => [c.field, c.by]), [['sources', 'you'], ['thresholds', 'you']])
  // 0 model calls: no agent turn, no scoring call, no usage line
  assert.equal(agentConnector.sends().length, 0)
  assert.equal(scorer.calls.length, 0)
  assert.equal(readUsage(dirs.a).calls, 0)
  // a card that no longer fits: the 追踪要求 edited since ⑤ — not acted on, expired
  saveBrief(dirs.a, '只看开源实现')
  const m = w.eventsOf('suggestions-changed').length
  await assert.rejects(async () => agent.handlers.actOnSuggestion(ids.a, 'dismiss-reason:marketing', 'dismiss'), err => err.code === 'bad_arguments')
  assert.deepEqual(w.eventsOf('suggestions-changed').slice(m).map(e => [e.payload.key, e.payload.status]), [['dismiss-reason:marketing', 'expired']])
  // an action the card does not have; 修改地址 = where to go, nothing written
  await assert.rejects(async () => agent.handlers.actOnSuggestion(ids.a, `topic-overlap:${ids.b}`, 'pause-source'), err => err.code === 'bad_arguments')
  appendFetchLog(dirs.a, { ts: at(6), round: 'r6', source: 'feed-b', kind: 'rss', status: 'gap', count: 0, new: 0 })
  appendFetchLog(dirs.a, { ts: at(7), round: 'r7', source: 'feed-b', kind: 'rss', status: 'gap', count: 0, new: 0 })
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  const lines = readSuggestionLines(dirs.a).length
  const nav = await agent.handlers.actOnSuggestion(ids.a, 'source-failing:feed-b', 'edit-address')
  assert.deepEqual(nav, { done: false, navigate: { screen: 'sources', source: 'feed-b', dialog: 'edit-address', libraryId: ids.a } })
  assert.equal(readSuggestionLines(dirs.a).length, lines)
  // the bridge's checks
  assert.ok(Object.hasOwn(BRIDGE_METHODS, 'actOnSuggestion') && Object.hasOwn(BRIDGE_METHODS, 'listToConfirm'))
  assert.doesNotThrow(() => checkArgs('actOnSuggestion', ['abcdefgh', 'k', 'pause-source']))
  assert.throws(() => checkArgs('actOnSuggestion', ['abcdefgh', 'k', 'delete-library']), err => err.code === 'bad_arguments')
  assert.throws(() => checkArgs('listToConfirm', ['x']), err => err.code === 'bad_arguments')
})

test('R5a-2 交由主 Agent 分析: recorded as 已转交, the agent gets the card in the interface\'s words — no kind name, no JSON, no raw error', async () => {
  const s = await setup({ agentAnswers: [{ reply: '这个来源的地址失效了。' }] })
  const { ids, agent, agentConnector } = s
  everyRule(s)
  const r = await agent.handlers.actOnSuggestion(ids.a, 'source-failing:feed-a', 'forward')
  assert.deepEqual([r.done, r.status, r.turn.reply], [true, 'accepted', '这个来源的地址失效了。'])
  const note = readTranscript(agent.agentDir).rows.find(x => x.role === 'note').text
  assert.match(note, /点击了「交由主 Agent 分析」。系统检测：来源「feed-a」连续 2 次运行的抓取结果为「地址有问题」/)
  assert.doesNotMatch(note, /source-failing|[{}]|404|check the address/, note)
  assert.ok(!agentConnector.calls[0].prompt.includes('check the address'), 'nor in the prompt')
  assert.ok(agent.handlers.listToConfirm().handled.some(h => h.key === 'source-failing:feed-a' && h.status === 'accepted' && h.action === 'forward'))
})

test('R5a-2 生成修改提议 (⑤): the 追踪要求 stays as it is; a 修改追踪要求 主 Agent 提议 is waiting', async () => {
  const s = await setup({ agentAnswers: [{ reply: '已生成修改追踪要求的提议，确认后生效。', proposals: [{ kind: 'edit_brief', params: { brief: '追踪 agent 框架，不要营销内容' }, why: '最近 3 次放弃都是营销内容' }] }] })
  const { ids, dirs, agent } = s
  saveBrief(dirs.a, '追踪 agent 框架')
  for (const h of [3, 4, 5]) dismissal(dirs.a, 'marketing', h)
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  const before = sha(join(dirs.a, 'streams.json'))
  const r = await agent.handlers.actOnSuggestion(ids.a, 'dismiss-reason:marketing', 'draft-proposal')
  assert.equal(r.status, 'accepted')
  assert.equal(readBrief(dirs.a), '追踪 agent 框架', 'not changed before a confirm')
  assert.equal(sha(join(dirs.a, 'streams.json')), before)
  const p = agent.handlers.listToConfirm().items.find(i => i.from === 'agent')
  assert.deepEqual([p.kind, p.libraryId, p.status, p.card.after.brief], ['edit_brief', ids.a, 'pending', '追踪 agent 框架，不要营销内容'])
  assert.match(readTranscript(agent.agentDir).rows.find(x => x.role === 'note').text, /生成修改提议[\s\S]*修改追踪要求的主 Agent 提议[\s\S]*当前追踪要求：「追踪 agent 框架」/)
})

test('R5a-2 rule ⑤ is checked right after a 放弃 is written (no run needed); a 放弃 undone never counts', async t => {
  const srv = await startFakeServer()
  t.after(() => srv.close())
  const feed = feedRoute(srv, serveItems(srv, 5, i => ({ title: `B item ${i}` })))
  const s = await setup({ feedOf: name => (name === 'b' ? feed : `https://example.test/${name}/a.xml`) })
  const { w, ids, dirs, pipeline } = s
  const started = await pipeline.startRoundIn({ id: ids.b, path: dirs.b })
  assert.equal(started.started, true)
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === started.roundId && e.payload.done))
  const urls = pipeline.handlers.getInbox().items.map(i => i.url)
  assert.equal(urls.length, 5, 'control: five in 待看')
  const card = () => w.eventsOf('suggestions-changed').some(e => e.payload.key === 'dismiss-reason:marketing' && e.payload.status === 'open')
  const discard = (url, quick) => { pipeline.handlers.dismissItem(url); return pipeline.handlers.settleDismiss('营销内容', quick) }
  discard(urls[0], 'marketing')
  discard(urls[1], 'marketing')
  pipeline.handlers.dismissItem(urls[2])
  pipeline.handlers.undoDismiss()
  assert.equal(card(), false, 'two, and one undone: no card')
  discard(urls[3], 'marketing')
  assert.equal(card(), true, 'the third, at once (no run since)')
  assert.ok(s.agent.handlers.listToConfirm().items.some(i => i.key === 'dismiss-reason:marketing' && i.libraryId === ids.b))
})

// ---- R5a-4 ------------------------------------------------------------------------------------------------------------

test('R5a-4 重新评分 through the queue: only the old ones, under the 单次运行上限, into 待看, notes/ byte for byte', async t => {
  const srv = await startFakeServer()
  t.after(() => srv.close())
  const feed = feedRoute(srv, serveItems(srv, 3, i => ({ title: `B item ${i}` })))
  const scores = { 'B item 1': 0.65, 'B item 2': 0.66, 'B item 3': 0.45 }
  const s = await setup({ feedOf: name => (name === 'b' ? feed : `https://example.test/${name}/a.xml`), score: title => scores[title] ?? 0.9 })
  const { w, ids, dirs, pipeline, scorer } = s
  const run = async () => {
    const r = await pipeline.startRoundIn({ id: ids.b, path: dirs.b })
    await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === r.roundId && e.payload.done))
  }
  await run()
  assert.equal(pipeline.handlers.getInbox().rejected.total, 3, 'control: all three below the 0.7 of the pipeline')
  saveStrictness(dirs.b, 'standard')
  const calls = scorer.calls.length
  await run()
  assert.equal(scorer.calls.length - calls, 1, 'the next run: only its self-check — no call for the judged items')
  const inbox = pipeline.handlers.getInbox()
  assert.deepEqual([inbox.rejected.total, inbox.rejected.old, inbox.rescore.total], [3, 3, 3], 'still in 未通过筛选, marked old')
  assert.deepEqual(pipeline.handlers.getRescore(ids.b).expectedCalls, [4, 13])
  const notes = notesHash(dirs.b)
  // the 单次运行上限 is 2: two calls (one item's 相关度 and 实质, or two items' 相关度), then it stops
  pipeline.handlers.setRoundCap(2)
  const r = await pipeline.handlers.startRescore(ids.b)
  assert.deepEqual([r.started, r.rescore], [true, true])
  assert.ok(w.eventsOf('queue-changed').some(e => e.payload.running === ids.b), 'it went through the one queue (the runs above did not)')
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === r.roundId && e.payload.done))
  const done = w.eventsOf('round-progress').find(e => e.payload.roundId === r.roundId && e.payload.done).payload
  assert.deepEqual([done.rescore, done.result.stoppedAt, done.result.calls], [true, 'cap', 2])
  const left = pipeline.handlers.getRescore(ids.b).total
  assert.ok(left >= 1 && left < 3, `the rest (${left}) wait for the next 重新评分`)
  pipeline.handlers.setRoundCap(120)
  const r2 = await pipeline.handlers.startRescore(ids.b)
  await until(() => w.eventsOf('round-progress').some(e => e.payload.roundId === r2.roundId && e.payload.done))
  assert.equal(pipeline.handlers.getInbox().rescore.total, 0)
  // an item whose steps were judged under the new standard and not finished (the cap) goes on with the next run as usual
  await run()
  const after = pipeline.handlers.getInbox()
  assert.equal(after.rescore.total, 0)
  assert.deepEqual(after.rejected.items.map(i => [i.title, i.old]), [['B item 3', false]], '0.45 is below 标准 too, no longer old')
  assert.ok(after.items.some(i => i.title === 'B item 2'), 'what passes is in 待看')
  assert.equal(notesHash(dirs.b), notes, 'notes/ byte for byte')
  assert.ok(Object.keys(readUsage(dirs.b).byPurpose).includes('rescore:gate:relevance'), 'in the library\'s usage file')
})

test('R5a-4 startRescore goes through the queue: while another library runs it waits at the end, then runs', async () => {
  const w = testWorld('st-r5a-queue-')
  worlds.push(w)
  const entries = [{ id: 'aaaaaaaa', path: join(w.root, 'a'), name: 'a' }, { id: 'bbbbbbbb', path: join(w.root, 'b'), name: 'b' }]
  const library = { entries: () => entries, find: id => entries.find(e => e.id === id) ?? null, entryOf: id => entries.find(e => e.id === id), current: () => ({ libraryId: 'aaaaaaaa' }), usable: () => true }
  const started = []
  let running = false
  const pipeline = {
    isRunning: () => running, runningLibrary: () => null, current: () => null,
    startRoundIn: async e => { started.push(['run', e.id]); running = true; return { started: true, roundId: 'r1' } },
    startRescoreIn: async e => { started.push(['rescore', e.id]); running = true; return { started: true, roundId: 'rs1', rescore: true } },
  }
  const scheduler = createScheduleService({ settingsFile: w.settingsFile, library, pipeline, emit: w.emit, log: w.log, now })
  await scheduler.startCurrent('test')
  const q = await scheduler.startRescore(entries[1])
  assert.deepEqual([q.started, q.queued, q.position], [false, true, 2], 'busy: queued at the end')
  assert.deepEqual(scheduler.handlers.getQueue().waiting.map(x => [x.libraryId, x.job]), [['bbbbbbbb', 'rescore']])
  running = false
  scheduler.roundDone({ roundId: 'r1', libraryId: 'aaaaaaaa', result: { started: true, counts: { inbox: 0 } } })
  await until(() => started.length === 2)
  assert.deepEqual(started, [['run', 'aaaaaaaa'], ['rescore', 'bbbbbbbb']])
})

// ---- R5a-6 ------------------------------------------------------------------------------------------------------------

test('R5a-6 trySource, a failed proposal, a run\'s problems: no raw text, no HTTP code to the page; the diagnostics have them, never a key', async t => {
  const srv = await startFakeServer()
  t.after(() => srv.close())
  const s = await setup()
  const gone = srv.route('/gone.xml', { status: 404, body: 'not here', contentType: 'text/plain' })
  const r = await s.sources.handlers.trySource({ name: 'gone', kind: 'rss', url: gone })
  assert.deepEqual(Object.keys(r).sort(), ['count', 'hint', 'sample', 'status'])
  assert.deepEqual([r.status, r.hint], ['gap', 'fix-address-or-remove'])
  assert.ok(!JSON.stringify(r).includes('404'))
  assert.ok(s.raw.lines().some(l => l.includes('trySource gone') && l.includes('HTTP 404')), 'the raw text is kept for the diagnostics')
  // a 主 Agent 提议's own try, as listProposals and listToConfirm hand it to the page
  const made = await s.proposals.createProposal('add_source', { libraryId: s.ids.b, source: { name: 'gone-too', kind: 'rss', url: gone } }, '试一下')
  assert.ok(JSON.stringify(made.trial).includes('404'), 'control: the core\'s try has the HTTP code')
  const listed = s.proposals.handlers.listProposals(null).find(c => c.id === made.id)
  const viewed = s.agent.handlers.listToConfirm().items.find(i => i.proposalId === made.id).card
  for (const c of [listed, viewed]) {
    assert.deepEqual([c.trial].flat().map(t => [t.status, t.hint]), [['gap', 'fix-address-or-remove']])
    assert.ok(!JSON.stringify(c).includes('404'), JSON.stringify(c.trial))
  }
  // a failed card: its step, whether it was undone, a kind of failure and the key of what to do
  const card = publicCard({ id: 'p-1', kind: 'add_source', status: 'failed', failure: { step: 'add', done: [], code: 'EPERM', message: 'EPERM: operation not permitted, rename C:\\x', rolledBack: true }, trial: [{ name: 'x', status: 'gap', hint: 'fix-address-or-remove', http: 404, message: 'HTTP 404: check the address', count: 0 }] }, { raw: s.raw })
  assert.deepEqual(card.failure, { step: 'add', done: [], rolledBack: true, category: 'error', advice: 'failureError' })
  assert.deepEqual(card.trial, [{ name: 'x', status: 'gap', hint: 'fix-address-or-remove', count: 0 }])
  assert.ok(PROPOSALS.advice[card.failure.advice] && PROPOSALS_EN.advice[card.failure.advice])
  // a run's problems: the code, not the detail
  assert.deepEqual(publicProblems([{ code: 'connection', connectionCode: 'network', detail: 'getaddrinfo ENOTFOUND api.example.com', node: 'relevance', url: 'u' }], { raw: s.raw }), [{ code: 'connection', connectionCode: 'network', node: 'relevance' }])
  // the diagnostics: the raw texts, never the key
  const text = diagnosticsText({ versions: { app: '1', electron: '1', chrome: '1', node: '1', os: 'x' }, layout: { logsDir: join(s.w.root, 'nologs'), appData: 'a', localData: 'l' }, settings: {}, secrets: ['sk-test-0123456789abcdef'], rawErrors: [...s.raw.lines(), 'leaked sk-test-0123456789abcdef'] })
  for (const raw of ['HTTP 404', 'EPERM: operation not permitted', 'getaddrinfo ENOTFOUND']) assert.ok(text.includes(raw), raw)
  assert.ok(!text.includes('sk-test-0123456789abcdef'), 'no API key')
})

test('R5a-6 the sources\' rows (来源与要求, the status page) and the last run (概览, 评分环节): a state and a hint, no message, no HTTP code, no problem detail', async () => {
  const s = await setup()
  const { w, raw, dirs, sources, pipeline, library } = s
  appendFetchLog(dirs.b, { ts: at(1), round: 'r1', source: 'feed-a', kind: 'rss', status: 'gap', http: 404, message: 'HTTP 404: check the address', count: 0, new: 0 })
  appendFetchLog(dirs.b, { ts: at(1), round: 'r1', source: 'feed-b', kind: 'rss', status: 'failed', http: 503, message: 'HTTP 503: upstream busy', count: 0, new: 0 })
  writeFileSync(join(dirs.b, '_pipeline', 'rounds.jsonl'), JSON.stringify({ id: 'r1', startedAt: at(1), finishedAt: at(1), counts: { inbox: 0 }, stoppedAt: 'connection', problems: [{ code: 'connection', connectionCode: 'network', detail: 'getaddrinfo ENOTFOUND api.example.com', node: 'relevance', url: 'u' }], warnings: [] }) + '\n')
  const rows = sources.handlers.getSources().sources
  assert.deepEqual(rows.map(r => [r.name, r.status, r.hint]), [['feed-a', 'gap', 'fix-address-or-remove'], ['feed-b', 'failed', 'retry-next-round']], 'control: the states are there')
  assert.ok(rows.every(r => !Object.hasOwn(r, 'http') && !Object.hasOwn(r, 'message')), JSON.stringify(rows))
  const status = createStatusService({ library, connections: { handlers: { getConnections: async () => [] } }, log: w.log, shell: w.shell, now, rawErrors: raw })
  const st = await status.handlers.getStatus()
  assert.deepEqual(st.sources.map(r => r.status), ['gap', 'failed'])
  const home = pipeline.handlers.getHome()
  const shown = JSON.stringify([rows, st, home, pipeline.handlers.getPipeline().lastRound])
  for (const bit of ['404', '503', 'check the address', 'upstream busy', 'ENOTFOUND']) assert.ok(!shown.includes(bit), bit)
  assert.deepEqual(home.lastRound.problems, [{ code: 'connection', connectionCode: 'network', node: 'relevance' }])
  for (const bit of ['HTTP 404: check the address', 'HTTP 503: upstream busy', 'getaddrinfo ENOTFOUND']) assert.ok(raw.lines().some(l => l.includes(bit)), bit)
})

// precheck fix 1: the self-check that fails — startRound's own answer (through the queue, schedule.mjs startCurrent) and a
// run the queue starts (pump) carry the problems' codes, never the detail; the detail is in the diagnostics
test('R5a-6 a self-check that fails: startRound\'s answer (through the queue) and the queue\'s own start give codes, no detail; the diagnostics have it', async () => {
  const RAW = 'getaddrinfo ENOTFOUND api.example.com'
  const failing = { kind: 'api', model: 'm', complete: async () => ({ ok: false, code: 'network', detail: RAW, usage: { calls: 1 } }), probe: async () => ({ ok: false, code: 'network', detail: RAW, usage: { calls: 1 } }) }
  const s = await setup({ scoring: failing })
  const { w, raw, pipeline, scheduler, ids, dirs } = s
  const answers = []
  answers.push(await pipeline.handlers.startRound())
  answers.push(await scheduler.startCurrent('test'))
  answers.push(await pipeline.startRoundIn({ id: ids.a, path: dirs.a }))
  for (const r of answers) {
    assert.equal(r.started, false, JSON.stringify(r))
    assert.deepEqual(r.problems, [{ code: 'connection', connectionCode: 'network' }], 'control: the problem is there, by its codes')
  }
  const shown = JSON.stringify([answers, pipeline.handlers.getRoundState(), pipeline.handlers.getHome().problem])
  for (const bit of ['ENOTFOUND', 'api.example.com']) assert.ok(!shown.includes(bit), `${bit} in ${shown}`)
  assert.ok(raw.lines().some(l => l.includes(RAW)), 'the diagnostics have the detail')
})

// precheck fix 11: 测试连接 (probeConnection, getConnections().probes) — the code, not the connection's own text
test('R5a-6 测试连接: a failed probe gives the page its code (the page words it), not the connection\'s text; the diagnostics have it', async () => {
  const w = testWorld('st-r5a-probe-')
  worlds.push(w)
  const raw = createRawErrors({ log: w.log, now })
  const c = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale: () => w.locale, devConnection: 'login-expired', rawErrors: raw })
  const p = await c.handlers.probeConnection('claude-code')
  assert.deepEqual([p.ok, p.code], [false, 'login-expired'], 'control: the probe failed')
  assert.equal(Object.hasOwn(p, 'detail'), false, JSON.stringify(p))
  const stored = (await c.handlers.getConnections()).probes['claude-code']
  assert.equal(stored.code, 'login-expired')
  assert.equal(Object.hasOwn(stored, 'detail'), false, JSON.stringify(stored))
  assert.ok(!JSON.stringify([p, stored]).includes('session expired'))
  assert.ok(Object.hasOwn(CONNECTIONS.codes, p.code) && Object.hasOwn(CONNECTIONS_EN.codes, p.code), 'the page has words for the code')
  assert.ok(raw.lines().some(l => l.includes('probe claude-code') && l.includes('fake: session expired')), raw.lines().join('\n'))
})

// ---- precheck fixes 3, 6, 8 (the two pre-checkers of R5a) ---------------------------------------------------------------

// fix 3: rule ④ is 「两个库各一张」 — ONE check (a's run) records b's card too, naming a and the ratio; b's schedule is off and b
// never ran
test('R5a ④ two-sided: one afterRound of a records a\'s card AND b\'s (each naming the other and the ratio); b never ran, its schedule off', async () => {
  const s = await setup()
  const { w, ids, dirs, agent, scheduler } = s
  assert.deepEqual([openSuggestions(dirs.a).length, openSuggestions(dirs.b).length], [0, 0], 'control: nothing yet')
  scheduler.handlers.setLibrarySchedule(ids.b, { enabled: false, time: scheduler.handlers.getLibrarySchedule(ids.b).time })
  scheduler.stop() // saving a schedule arms the timer (a's slot): none is left running in a test
  assert.equal(scheduler.handlers.getLibrarySchedule(ids.b).enabled, false, 'control: b\'s schedule is off')
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  const ka = openSuggestions(dirs.a).filter(x => x.kind === 'topic-overlap')
  const kb = openSuggestions(dirs.b).filter(x => x.kind === 'topic-overlap')
  assert.deepEqual(ka.map(x => x.key), [`topic-overlap:${ids.b}`])
  assert.deepEqual(kb.map(x => x.key), [`topic-overlap:${ids.a}`], 'b has its card without a run of its own')
  assert.equal(existsSync(join(dirs.b, '_pipeline', 'rounds.jsonl')), false, 'control: b never ran')
  const items = agent.handlers.listToConfirm().items.filter(i => i.kind === 'topic-overlap')
  assert.deepEqual(items.map(i => [i.libraryName, i.otherLibraryName, i.evidence.percent]).sort(), [['a', 'b', 100], ['b', 'a', 100]])
  assert.ok(w.eventsOf('suggestions-changed').some(e => e.payload.libraryId === ids.b && e.payload.key === `topic-overlap:${ids.a}` && e.payload.status === 'open'), 'b\'s card was told to the page')
  // b's own handling counts: dismissed on b, a's next check does not bring it back
  agent.handlers.dismissSuggestion(ids.b, `topic-overlap:${ids.a}`)
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  assert.deepEqual(openSuggestions(dirs.b).filter(x => x.kind === 'topic-overlap'), [], 'dismissed on b: not recorded again while the shared words are the same')
})

// fix 8: ④'s 「对方库已移除」 only for a library gone from the list; one that cannot be read now (a drive taken out) keeps it
test('R5a ④ the other library unreadable for now keeps the card; removed from the list, the card expires', async () => {
  const s = await setup()
  const { ids, dirs, agent, library } = s
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  const key = `topic-overlap:${ids.b}`
  assert.ok(openSuggestions(dirs.a).some(x => x.key === key), 'control: a has its card')
  const cfg = join(dirs.b, 'streams.json')
  const away = join(dirs.b, 'streams.json.away')
  renameSync(cfg, away)
  assert.equal(library.usable(dirs.b), false, 'control: b cannot be read now')
  agent.checkLibrary(ids.a)
  agent.afterRound({ dir: dirs.a, libraryId: ids.a })
  agent.handlers.listToConfirm()
  assert.ok(openSuggestions(dirs.a).some(x => x.key === key), 'b unreadable: a\'s card stays')
  assert.ok(!readSuggestionLines(dirs.a).some(l => l.ev === 'expired' && l.key === key), 'no 失效 line')
  renameSync(away, cfg)
  agent.checkLibrary(ids.a)
  assert.ok(openSuggestions(dirs.a).some(x => x.key === key), 'b readable again: still there')
  library.handlers.removeLibrary(ids.b)
  agent.checkLibrary(ids.a)
  const exp = readSuggestionLines(dirs.a).filter(l => l.ev === 'expired' && l.key === key)
  assert.deepEqual(exp.map(l => l.reason), ['library-removed'], 'b gone from the list: the card expires')
})

// fix 6: 交由主 Agent 分析 is recorded as 已转交 only once the turn answered; a connection that fails leaves the card 待确认 and
// the bridge says the kind of failure — and the user can try again
test('R5a-2 交由主 Agent 分析 with the connection failing: the card stays 待确认, the answer says the kind of failure; again → 已转交', async () => {
  const s = await setup({ agentAnswers: [{ $fail: 'network' }, { reply: '这个来源的地址失效了。' }] })
  const { w, ids, agent } = s
  everyRule(s)
  const key = 'source-failing:feed-a'
  const r = await agent.handlers.actOnSuggestion(ids.a, key, 'forward')
  assert.deepEqual([r.done, r.status, r.failure], [false, 'open', { category: 'connection', code: 'network' }], JSON.stringify(r))
  assert.equal(r.turn.reply, null, 'control: the turn had no answer')
  assert.ok(Object.hasOwn(CONNECTIONS.codes, r.failure.code), 'the page words the kind of failure')
  assert.ok(!JSON.stringify(r).includes('fake: network'), 'not the connection\'s own text')
  assert.ok(agent.handlers.listToConfirm().items.some(i => i.key === key && i.status === 'open'), 'still 待确认')
  assert.ok(!readSuggestionLines(s.dirs.a).some(l => l.key === key && l.ev === 'accepted'), 'not recorded as 已转交')
  assert.ok(!w.eventsOf('suggestions-changed').some(e => e.payload.key === key && e.payload.status === 'accepted'))
  const again = await agent.handlers.actOnSuggestion(ids.a, key, 'forward')
  assert.deepEqual([again.done, again.status, again.turn.reply], [true, 'accepted', '这个来源的地址失效了。'])
  assert.ok(agent.handlers.listToConfirm().handled.some(h => h.key === key && h.status === 'accepted'))
  assert.ok(w.eventsOf('suggestions-changed').some(e => e.payload.key === key && e.payload.status === 'accepted'))
})

// fix 2 (the page's half): getAgentTranscript gives the rows in the interface's words — no raw text, no kind name
test('R5a getAgentTranscript: a proposal not made and a connection that failed — interface words, no raw text, no kind name', async () => {
  const s = await setup({ agentAnswers: [
    { reply: '拟了一张', proposals: [{ kind: 'pause_source', params: { libraryId: 'zzzzzzzz', name: 'feed-a', paused: true }, why: '老失败' }] },
    { $fail: 'network' },
  ] })
  const { agent, raw } = s
  const r1 = await agent.handlers.agentSend('暂停一下')
  assert.deepEqual(r1.notice, [{ code: 'proposals-dropped', count: 1 }], 'control: not made')
  const r2 = await agent.handlers.agentSend('再来')
  assert.deepEqual(r2.notice, [{ code: 'connection', connection: 'network' }], 'control: the connection failed')
  // a row as a version before the fix wrote it (the kind name, the code, the raw text in it)
  appendTranscript(agent.agentDir, { turn: 3, role: 'note', text: '连接出了问题（network），这条消息没有回答', data: { error: 'network', detail: 'fake: network (an old row)' } }, { now })
  const rows = agent.handlers.getAgentTranscript().entries
  const notes = rows.filter(x => x.role === 'note')
  assert.deepEqual(notes.map(x => x.text), ['有 1 张提议没能生成：暂停或恢复来源 · 找不到这个库', '连接出了问题：网络连不上，这条消息没有回答。', '连接出了问题：网络连不上，这条消息没有回答。'])
  assert.deepEqual(notes.map(x => x.data), [{ dropped: [{ index: 0, category: 'no-library' }] }, { error: 'network' }, { error: 'network' }])
  const shown = JSON.stringify(rows.filter(x => x.role !== 'you').map(x => ({ ...x, data: x.data ? { ...x.data, error: undefined } : x.data })))
  for (const bit of ['pause_source', 'bad-proposal', 'unknown-library', 'fake: network', 'zzzzzzzz', 'network']) assert.ok(!shown.includes(bit), `${bit} in ${shown}`)
  assert.ok(raw.lines().some(l => l.includes('unknown-library')) && raw.lines().some(l => l.includes('fake: network')), 'the diagnostics have the raw texts')
})

// ---- words ------------------------------------------------------------------------------------------------------------

test('R5a words: every action\'s key is in both dictionaries; the core\'s state, level and quick words are the dictionaries\' own', async () => {
  const s = await setup()
  everyRule(s)
  await s.proposals.createProposal('pause_source', { libraryId: s.ids.a, name: 'feed-b', paused: true }, 'w')
  const v = s.agent.handlers.listToConfirm()
  const labels = new Set(v.items.flatMap(i => i.actions.map(a => a.label)))
  assert.ok(labels.size >= 9, [...labels].join())
  for (const l of labels) {
    assert.equal(typeof get(PROPOSALS, l), 'string', `zh ${l}`)
    assert.equal(typeof get(PROPOSALS_EN, l), 'string', `en ${l}`)
  }
  for (const i of v.items.filter(x => x.from === 'system')) assert.ok(PROPOSALS.from.system && PROPOSALS.kinds[i.kind], i.kind)
  // the words the main agent is given are the page's (until R6 changes them in both places)
  assert.deepEqual(Object.fromEntries(Object.keys(FETCH_STATES).map(k => [k, STATE_WORDS.zh[k]])), { ...FETCH_STATES })
  assert.deepEqual(Object.fromEntries(Object.keys(FETCH_STATES_EN).map(k => [k, STATE_WORDS.en[k]])), { ...FETCH_STATES_EN })
  assert.deepEqual([STATE_WORDS.zh.paused, STATE_WORDS.zh.never], [SOURCE_STATES.paused, SOURCE_STATES.never])
  assert.deepEqual({ ...LEVEL_WORDS.zh }, { ...SOURCES.requirement?.levels ?? SOURCES.levels ?? findLevels(SOURCES) })
  assert.deepEqual({ ...LEVEL_WORDS.en }, { ...SOURCES_EN.requirement?.levels ?? SOURCES_EN.levels ?? findLevels(SOURCES_EN) })
  assert.deepEqual({ ...QUICK_WORDS.zh }, { ...findKey(INBOX, 'quick') })
  assert.deepEqual({ ...QUICK_WORDS.en }, { ...findKey(INBOX_EN, 'quick') })
})

// precheck fix 10: the 处理建议 the model is given is the page's own (FETCH_HINTS), the connection's failure words too; the new
// dictionaries name a source's state with the five states' words of now (R6 changes those, not R5a) and have the same keys
test('R5a words (precheck fix 10): 处理建议 and connection words are the page\'s own; texts/proposals.js names states with FETCH_STATES; zh / en keys the same', () => {
  assert.deepEqual({ ...ADVICE_WORDS.zh }, { ...FETCH_HINTS })
  assert.deepEqual({ ...ADVICE_WORDS.en }, { ...FETCH_HINTS_EN })
  assert.deepEqual({ ...CONNECTION_WORDS.zh }, { ...CONNECTIONS.codes })
  assert.deepEqual({ ...CONNECTION_WORDS.en }, { ...CONNECTIONS_EN.codes })
  const keysOf = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v, `${p}${k}.`) : [`${p}${k}`])).sort()
  assert.deepEqual(keysOf(PROPOSALS_EN), keysOf(PROPOSALS), 'the same keys in both dictionaries')
  const states = [PROPOSALS.kinds['source-failing-gap'], PROPOSALS.evidence['source-failing'], PROPOSALS.evidence['source-failing-gap']].join(' ')
  const statesEn = [PROPOSALS_EN.kinds['source-failing-gap'], PROPOSALS_EN.evidence['source-failing'], PROPOSALS_EN.evidence['source-failing-gap']].join(' ')
  for (const k of ['gap', 'failed', 'blocked']) {
    assert.ok(states.includes(FETCH_STATES[k]), `zh ${FETCH_STATES[k]}`)
    assert.ok(statesEn.includes(FETCH_STATES_EN[k]), `en ${FETCH_STATES_EN[k]}`)
  }
  // the words R6 brings in (05 第三节: 无更新 / 地址无效 / 访问被拒) are not used before R6
  const all = JSON.stringify([PROPOSALS, PROPOSALS_EN])
  for (const w of ['地址无效', '访问被拒', '无更新', 'invalid address', 'access denied', 'Access denied', 'Invalid address']) assert.ok(!all.includes(w), w)
})

function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined
  if (Object.hasOwn(obj, key)) return obj[key]
  for (const v of Object.values(obj)) { const r = findKey(v, key); if (r) return r }
  return undefined
}
function findLevels(obj) { return findKey(obj, 'levels') }
