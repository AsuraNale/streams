// 1.1.2 第 4、5 件 in the main process (维护者 11-25): the conversations by library (services/build.mjs listConversations,
// getConversation — a 1.1.1 file too, one of no library left out), a change of a card told the library's step, its earlier
// conversations and its last update, and showing those conversations above; a step proposed on the card written on 确认
// only; the step of a new library from 设置; a library's step set by the user (services/volume.mjs), recorded as theirs, and
// how near its last update came to the limit. The real library service; the agent is a stand-in that keeps its prompts.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createBuildService } from '../src/main/services/build.mjs'
import { createVolumeService } from '../src/main/services/volume.mjs'
import { readLibraryVolume, readCard } from '../src/main/core.mjs'
import { readSettings, writeSettings } from '../src/main/settings.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root) })
const A = 'https://example-a.test/list'
const B = 'https://example-b.test/samples/1'
// the card of services-build.test.mjs (not imported: that would run its tests here too)
const CARD = () => ({
  name: '测试电车库',
  definition: { summary: '一座测试库。', purpose: '行业研究', scope: '对象：车企；行业：电动车；地域：中国；规模：大', exclude: '自媒体', trust: '官方', rhythm: '每天', language: '中文', hard: '一手出处' },
  decide: [{ what: '零跑收不收', default: '收' }],
  collect: ['月度销量'], skip: ['传闻'],
  sources: [{ name: '甲来源', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
})
const question = (text, kind = 'input', options = []) => ({ say: '', question: { text, kind, options } })
const cardOf = (c, reads = [A, B]) => ({ json: { say: '请看卡', card: c }, reads })

// a session that answers from a list and keeps every prompt
function scripted(list) {
  const prompts = []
  return {
    prompts,
    session: () => ({
      async send(req) {
        prompts.push(req.prompt)
        const r = list[Math.min(prompts.length - 1, list.length - 1)]
        const json = r.json ?? r
        return { ok: true, json, text: JSON.stringify(json), sessionId: 'v112', resumed: prompts.length > 1, reads: (r.reads ?? []).map(url => ({ url, ok: true })), searches: [], otherTools: [] }
      },
    }),
  }
}

async function setup(list, { defaultVolume = () => 'standard' } = {}) {
  const w = testWorld('st-v112-')
  worlds.push(w)
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  const agent = scripted(list)
  const connections = { active: () => ({ kind: 'claude-code', connection: { kind: 'claude-code' } }) }
  const b = createBuildService({ appDataDir: join(w.root, 'app'), library, connections, emit: w.emit, log: w.log, locale, libraryRoot: () => join(w.root, 'libs'), session: agent.session, afterBuilt: () => ({ queued: true }), defaultVolume }).handlers
  const v = createVolumeService({ library, settings: () => readSettings(w.settingsFile), writeSettings: p => writeSettings(w.settingsFile, p), emit: w.emit, log: w.log }).handlers
  return { w, library, agent, b, v, buildDir: join(w.root, 'app', 'build') }
}

// the user case's last update (rounds.jsonl, with 1.1.2's limits)
const LAST = { id: 'u-1', kind: 'update', startedAt: '2026-11-25T19:00:47.809Z', status: 'done', volume: 'standard', budget: { sources: 30, newLinks: 20, searches: 8, reads: 20, items: 30 },
  counts: { sources: 14, read: 14, unreadable: 2, newLinks: 0, originals: 2, items: 3, inbox: 2 }, unfinished: [],
  agent: { searches: 3, reads: 19, sources: [{ url: 'https://x.test/editions', status: '这次没读（用量不够）' }], gaps: ['价格页按月付是 49。'] } }

test('第 5 件: a library made is listed with its conversation; getConversation has its turns, the choice as made; a new library gets 设置\'s step', async () => {
  const s = await setup([question('拿来做什么？'), question('还要哪几家？', 'multi', ['零跑', '问界']), cardOf(CARD())], { defaultVolume: () => 'more' })
  await s.b.startBuild('帮我跟踪中国电动车')
  assert.match(s.agent.prompts[0], /## 新库的「每次更新的量」\n现在是「较多」/, 'a new library: the step of 设置')
  await s.b.replyBuild('行业研究')
  await s.b.replyBuild({ picked: ['零跑'], other: '宁德时代' })
  const r = await s.b.confirmBuild()
  const dir = s.library.find(r.libraryId).path
  assert.deepEqual(readLibraryVolume(dir), { volume: 'more', stored: true })
  const list = s.b.listConversations()
  assert.equal(list.going, null)
  const row = list.libraries.find(x => x.library.id === r.libraryId)
  assert.equal(row.conversations.length, 1)
  assert.deepEqual([row.conversations[0].mode, row.conversations[0].why, row.conversations[0].asked, row.conversations[0].cards], ['create', 'built', 2, 1])
  const c = s.b.getConversation(row.conversations[0].id)
  assert.equal(c.library.id, r.libraryId)
  assert.deepEqual(c.turns.filter(t => t.role === 'you').map(t => t.answer ?? null), [null, null, { picked: ['零跑'], other: '宁德时代' }])
  await assert.rejects(async () => s.b.getConversation('ended-nope'), e => e.code === 'bad_arguments')
})

test('第 5 件: 1.1.1 files find their library — one by its pending id (the library\'s _actions.jsonl create_library: 1.1.1 kept no folder), one by the folder (any case); one of no library, a broken one: not listed, nothing breaks', async () => {
  const s = await setup([question('x')])
  const made = join(s.w.root, 'libs', '旧库')
  mkdirSync(made, { recursive: true })
  // a library registered at that folder (opened as any library is)
  const lib = (await import('../src/main/core.mjs')).createLibrary
  lib(made, { name: '旧库', language: 'zh-CN' })
  const reg = s.library.adopt(made, { name: '旧库' })
  mkdirSync(s.buildDir, { recursive: true })
  const old = { v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', opener: '我想学跨境电商', status: 'built', turns: [{ role: 'user', text: '我想学跨境电商', at: '2026-11-25T18:32:22.171Z' }, { role: 'agent', kind: 'question', say: '', question: { n: 1, text: '用途？', kind: 'input', options: [], other: false }, at: '2026-11-25T18:32:43Z' }], asked: [{ n: 1 }], reads: [], searches: [], calls: 1, card: null, pendingId: null, libraryDir: made.toUpperCase(), edit: null, convert: null } }
  // the user case's own file: status talking, no folder, the pending id of the card confirmed
  appendFileSync(join(made, '_actions.jsonl'), JSON.stringify({ ts: '2026-11-25T19:00:47.793Z', actor: 'main_agent', action: 'create_library', object: { type: 'library', id: made }, confirmedBy: 'user', pendingId: 'a-mwwh1vot-7dcfd5' }) + '\n')
  writeFileSync(join(s.buildDir, 'ended-2026-11-25T19-00-47-804Z-built.json'), JSON.stringify({ ...old, core: { ...old.core, status: 'talking', libraryDir: null, pendingId: 'a-mwwh1vot-7dcfd5' } }))
  writeFileSync(join(s.buildDir, 'ended-2026-11-25T12-00-00-000Z-built.json'), JSON.stringify(old))
  writeFileSync(join(s.buildDir, 'ended-2026-11-24T14-15-32-206Z-built.json'), JSON.stringify({ ...old, core: { ...old.core, libraryDir: join(s.w.root, 'elsewhere') } }))
  writeFileSync(join(s.buildDir, 'ended-2026-11-24T15-00-00-000Z-built.json'), JSON.stringify({ ...old, core: { ...old.core, libraryDir: null, pendingId: 'a-of-nothing' } }))
  writeFileSync(join(s.buildDir, 'ended-2026-11-23T10-00-00-000Z-built.json'), 'not JSON')
  const list = s.b.listConversations()
  const row = list.libraries.find(x => x.library.id === reg.libraryId)
  assert.deepEqual(row.conversations.map(c => [c.id, c.mode, c.why, c.startedAt, c.endedAt]), [
    ['ended-2026-11-25T12-00-00-000Z-built', 'create', 'built', '2026-11-25T18:32:22.171Z', '2026-11-25T12:00:00.000Z'],
    ['ended-2026-11-25T19-00-47-804Z-built', 'create', 'built', '2026-11-25T18:32:22.171Z', '2026-11-25T19:00:47.804Z'],
  ])
  assert.equal(list.libraries.flatMap(x => x.conversations).length, 2, 'the ones of no library and the broken file are not listed')
  assert.equal(s.b.getConversation('ended-2026-11-25T19-00-47-804Z-built').turns[0].text, '我想学跨境电商')
})

test('第 5 件: from a library, the agent is told its step, its earlier conversations and its last update; the view shows them above; a proposed step is written on 确认 only', async () => {
  const s = await setup([question('拿来做什么？'), cardOf(CARD()), { say: '我看了上次更新，有来源因为用量不够没读。' }, cardOf({ ...CARD(), volume: 'more' }, [])])
  await s.b.startBuild('帮我跟踪中国电动车')
  await s.b.replyBuild('行业研究')
  const made = await s.b.confirmBuild()
  const dir = s.library.find(made.libraryId).path
  mkdirSync(join(dir, '_pipeline'), { recursive: true })
  appendFileSync(join(dir, '_pipeline', 'rounds.jsonl'), JSON.stringify(LAST) + '\n')
  let v = await s.b.startBuild('我觉得东西不够全，可以多帮我找一点吗？', made.libraryId)
  const p = s.agent.prompts.at(-1)
  assert.ok(p.indexOf('## 这座库现在的建库卡') < p.indexOf('## 这座库的「每次更新的量」'))
  assert.match(p, /"volume": "standard"/, 'the card the agent sees carries the step')
  assert.match(p, /## 之前和用户的对话[\s\S]*- 用户：帮我跟踪中国电动车[\s\S]*- 你问：拿来做什么？/)
  assert.match(p, /读网页 19 \/ 上限 20 次/)
  assert.match(p, /因为用量不够没读的来源 1 个/)
  assert.ok(p.indexOf('## 这座库最近一次更新') < p.indexOf('## 用户的开场白'))
  assert.equal(v.mode, 'edit')
  assert.equal(v.earlier.length, 1)
  assert.equal(v.earlier[0].turns[0].text, '帮我跟踪中国电动车')
  v = await s.b.replyBuild('那就多一点')
  const proposal = v.turns.at(-1)
  assert.deepEqual(proposal.changes.find(c => c.key === 'volume'), { key: 'volume', before: '标准', after: '较多' })
  assert.equal(readLibraryVolume(dir).volume, 'standard', 'nothing before 确认')
  await s.b.confirmBuild()
  assert.equal(readLibraryVolume(dir).volume, 'more')
  assert.equal(Object.hasOwn(readCard(dir), 'volume'), false, 'the card file has no step')
  const row = s.b.listConversations().libraries.find(x => x.library.id === made.libraryId)
  assert.deepEqual(row.conversations.map(c => c.mode), ['create', 'edit'])
})

test('第 4 件: a library\'s step set by the user is theirs in the change record; a bad one refused; the near-limit hint from its last update; 设置\'s default', async () => {
  const s = await setup([question('拿来做什么？'), cardOf(CARD())])
  await s.b.startBuild('帮我跟踪中国电动车')
  await s.b.replyBuild('行业研究')
  const made = await s.b.confirmBuild()
  const id = made.libraryId
  const dir = s.library.find(id).path
  let v = s.v.getLibraryVolume(id)
  assert.deepEqual([v.volume, v.volumes, v.near], ['standard', ['standard', 'more', 'most'], null])
  assert.equal(v.budget.newLinks, 20)
  v = s.v.setLibraryVolume(id, 'most')
  assert.equal(v.volume, 'most')
  assert.equal(v.budget.newLinks, 60)
  const lines = readFileSync(join(dir, '_pipeline', 'changes.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.deepEqual(lines.filter(l => l.field === 'volume').map(l => [l.by, l.before, l.after]), [['you', 'standard', 'most']])
  assert.throws(() => s.v.setLibraryVolume(id, 'loud'), e => e.code === 'bad_arguments')
  assert.equal(readLibraryVolume(dir).volume, 'most')
  appendFileSync(join(dir, '_pipeline', 'rounds.jsonl'), JSON.stringify(LAST) + '\n')
  assert.deepEqual(s.v.getLibraryVolume(id).near, { reads: 19, limit: 20, notRead: 1, volume: 'standard' })
  assert.deepEqual(s.v.getDefaultVolume(), { volume: 'standard' })
  assert.deepEqual(s.v.setDefaultVolume('more'), { volume: 'more' })
  assert.equal(readSettings(s.w.settingsFile).defaultVolume, 'more')
  assert.throws(() => s.v.setDefaultVolume('huge'), e => e.code === 'bad_arguments')
  assert.ok(s.w.events.some(e => e.topic === 'library-changed'))
})
