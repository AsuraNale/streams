// 1.1.3 (维护者 11-26 「每个库对应一个 session」; 赞妮's plan 对话与右键菜单-方案.md, 维护者 「按改后的建议」, and 第 5 项第二步
// 「做，开工」): the conversations of the main agent, one per library and the new libraries' apart. 1.1.2's build.json read as
// it is (the four kinds of plan 10.1); the maintainer's own situation (a new library's conversation where the agent only replied, and
// his library refused beside it) is not stuck any more (plan 10.2); one turn at a time, the others waiting and starting by
// themselves; 停止处理 and 取消排队 give the words back; 放弃 takes back only that conversation's card; a change whose library's
// card changed under it cannot be confirmed; the words are on disk before the agent is asked. The real library service; the
// agent is the development stand-in (devBuildSession) with a script per conversation. Each test was run first against the
// 1.1.2 service (one saved, one busy lock, every pending card taken back) or a mutant of the new one, and failed there.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createBuildService, devBuildSession, MAX_AT_ONCE } from '../src/main/services/build.mjs'
import { readCard, createLibrary, saveLibraryVolume } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root) })

const A = 'https://example-a.test/list'
const B = 'https://example-b.test/samples/1'
const CARD = (name = '测试电车库') => ({
  name,
  definition: { summary: '一座测试库。', purpose: '行业研究', scope: '对象：车企；行业：电动车；地域：中国；规模：大', exclude: '自媒体', trust: '官方', rhythm: '每天', language: '中文', hard: '一手出处' },
  decide: [{ what: '零跑收不收', default: '收' }],
  collect: ['月度销量'], skip: ['传闻'],
  sources: [{ name: '甲来源', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
})
const question = (text, extra = {}) => ({ json: { say: '', question: { text, kind: 'input', options: [] } }, ...extra })
const card = (c, extra = {}) => ({ json: { say: '请看卡', card: c }, reads: [A, B].map(url => ({ url, ok: true })), ...extra })
const say = (words, extra = {}) => ({ json: { say: words }, ...extra })
const later = ms => new Promise(r => setTimeout(r, ms))
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex')

function setup(script = { replies: [question('拿来做什么？')] }) {
  const w = testWorld('st-v113-')
  worlds.push(w)
  const file = join(w.root, 'build-script.json')
  writeFileSync(file, JSON.stringify(script))
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  const connections = { active: () => ({ kind: 'claude-code', connection: { kind: 'claude-code' } }) }
  const appData = join(w.root, 'app')
  const buildDir = join(appData, 'build')
  const make = () => createBuildService({
    appDataDir: appData, library, connections, emit: w.emit, log: w.log, locale, libraryRoot: () => join(w.root, 'libs'),
    session: (active, calls, who) => devBuildSession(file, calls, who), afterBuilt: () => ({ queued: true }),
  }).handlers
  // made at its first use: a test that lays 1.1.2's files down first has them there when the service starts
  let first = null
  return { w, library, buildDir, make, get b() { return (first ??= make()) }, script: s => writeFileSync(file, JSON.stringify(s)) }
}
/** A library made through a conversation (its card confirmed), and its id. */
async function madeLibrary(s, name = '测试电车库') {
  s.script({ byOpener: { [`建 ${name}`]: [card(CARD(name))] }, replies: [question('?')] })
  await s.b.startBuild(`建 ${name}`)
  const v = s.b.listConversations().unbuilt.find(r => r.title === name)
  const r = await s.b.confirmBuild(v.id)
  return r.libraryId
}
const files = dir => (existsSync(dir) ? readdirSync(dir).sort() : [])

// ---- 1.1.2's files (plan 10.1) ------------------------------------------------------------------------------------------

const legacy = (core, more = {}) => ({ v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', opener: core.opener, sessionId: 'old-sess', status: 'talking', asked: [], reads: [], searches: [], calls: core.turns.filter(t => t.role === 'agent').length, card: null, pendingId: null, libraryDir: null, edit: null, convert: null, extra: '', ...core }, stopped: null, trouble: null, retry: null, ...more })

test('10.1: a change going in 1.1.2 is that library\'s open thing, its file read as it is (not written again)', async () => {
  const s = setup()
  const id = await madeLibrary(s)
  const cardNow = { ...readCard(s.library.find(id).path), volume: 'standard' }
  const file = join(s.buildDir, 'build.json')
  writeFileSync(file, JSON.stringify(legacy({ opener: '多找一点', edit: { library: id, card: cardNow }, turns: [{ role: 'user', text: '多找一点', at: '2026-11-25T10:00:00.000Z' }, { role: 'agent', kind: 'question', say: '', question: { n: 1, text: '找哪方面？', kind: 'input', options: [], other: false }, at: '2026-11-25T10:01:00.000Z' }] })))
  const before = hash(file)
  const b = s.make()
  const row = b.listConversations().libraries.find(r => r.id === `lib:${id}`)
  assert.deepEqual([row.open, row.mode, row.state, row.n], [true, 'edit', 'question', 1])
  const v = b.getBuild(`lib:${id}`)
  assert.equal(v.turns.at(-1).question.text, '找哪方面？')
  assert.equal(b.listConversations().unbuilt.length, 0)
  assert.equal(hash(file), before, 'build.json is not written again by reading it')
})

test('10.1: a bringing over going in 1.1.2 is that library\'s (a library with no card), mode convert', async () => {
  const s = setup()
  const dir = join(s.w.root, 'libs', '旧版库')
  mkdirSync(dir, { recursive: true })
  createLibrary(dir, { name: '旧版库', language: 'zh-CN' })
  const reg = s.library.adopt(dir, { name: '旧版库' })
  mkdirSync(s.buildDir, { recursive: true })
  writeFileSync(join(s.buildDir, 'build.json'), JSON.stringify(legacy({ opener: '把它转过来', convert: { library: reg.libraryId }, turns: [{ role: 'user', text: '把它转过来', at: '2026-11-25T10:00:00.000Z' }, { role: 'agent', kind: 'say', say: '好的', at: '2026-11-25T10:01:00.000Z' }] })))
  const b = s.make()
  const row = b.listConversations().libraries.find(r => r.id === `lib:${reg.libraryId}`)
  assert.deepEqual([row.open, row.mode, row.state, row.hasCard], [true, 'convert', 'replied', false])
})

test('10.1 / 10.2: 维护者\'s conversation — a new library\'s where the agent only replied — is a row of 未建成, 主 Agent 已回复; his library is open to a change beside it; 放弃建库 takes it out', async () => {
  const s = setup()
  const id = await madeLibrary(s, 'AI 一人独立站代发货入门')
  mkdirSync(s.buildDir, { recursive: true })
  const opener = '一人独立站那个库，我觉得东西不够全，可以多帮我找一点吗？'
  writeFileSync(join(s.buildDir, 'build.json'), JSON.stringify(legacy({ opener, turns: [
    { role: 'user', text: opener, at: '2026-11-25T19:09:00.000Z' },
    { role: 'agent', kind: 'say', say: '这是新建库的对话，我看不到已有的库。', at: '2026-11-25T19:10:00.000Z' },
    { role: 'user', text: '放弃对话', at: '2026-11-27T02:51:00.000Z' },
    { role: 'agent', kind: 'say', say: '好的，这次就到这里，我什么都没改', at: '2026-11-27T02:51:30.000Z' },
  ] })))
  const b = s.make()
  const list = b.listConversations()
  assert.equal(list.unbuilt.length, 1)
  const stuck = list.unbuilt[0]
  assert.equal(stuck.id, 'new:build')
  assert.equal(stuck.state, 'replied')
  assert.equal(stuck.title, opener, 'its first words (the page cuts them to one line)')
  assert.equal(list.latest, 'new:build', '主 Agent opens the one active last')
  // the first way: his library's conversation takes his words at once (1.1.2: 「另一段对话正在进行」)
  s.script({ byLibrary: { [id]: [question('要多找哪方面？')] }, replies: [question('?')] })
  const v = await b.startBuild('东西不够全，多帮我找一点', id)
  assert.deepEqual([v.conv, v.mode, v.state, v.turns.at(-1).question.text], [`lib:${id}`, 'edit', 'question', '要多找哪方面？'])
  // the second way: 放弃建库 on the stuck one — out of the list, kept as dropped
  await b.dropBuild('new:build')
  assert.equal(b.listConversations().unbuilt.length, 0)
  assert.ok(files(s.buildDir).some(n => /^ended-.*-dropped\.json$/.test(n)))
  assert.equal(existsSync(join(s.buildDir, 'build.json')), false)
  assert.equal(b.getBuild(`lib:${id}`).open, true, 'his library\'s change is not touched')
})

test('10.1: a library\'s change that had ended (stopped) is history at once; a new library\'s stays as 已结束 and starts again with its first words', async () => {
  const s = setup()
  const id = await madeLibrary(s)
  mkdirSync(s.buildDir, { recursive: true })
  writeFileSync(join(s.buildDir, 'build.json'), JSON.stringify(legacy({ opener: '改一下', edit: { library: id, card: { ...readCard(s.library.find(id).path), volume: 'standard' } }, status: 'stopped', turns: [{ role: 'user', text: '改一下', at: '2026-11-25T10:00:00.000Z' }] }, { stopped: 'over-budget' })))
  writeFileSync(join(s.buildDir, 'open-2026-11-26T01-00-00-000Z-abcdef.json'), JSON.stringify(legacy({ opener: '跟踪新能源', status: 'stopped', turns: [{ role: 'user', text: '跟踪新能源', at: '2026-11-26T01:00:00.000Z' }] }, { stopped: 'too-many-turns' })))
  const b = s.make()
  const row = b.listConversations().libraries.find(r => r.id === `lib:${id}`)
  assert.deepEqual([row.open, row.state, row.last.why], [false, 'idle', 'stopped'])
  assert.equal(b.getBuild(`lib:${id}`).lastEnd.notice, 'over-budget')
  assert.equal(existsSync(join(s.buildDir, 'build.json')), false)
  const ended = b.listConversations().unbuilt[0]
  assert.equal(ended.state, 'ended')
  s.script({ byOpener: { 跟踪新能源: [question('拿来做什么？')] }, replies: [question('?')] })
  const again = await b.restartBuild(ended.id)
  assert.deepEqual([again.conv, again.state, again.opener], [ended.id, 'question', '跟踪新能源'], 'the same conversation, its first words again')
})

// ---- one at a time ---------------------------------------------------------------------------------------------------------

test('one turn at a time (MAX_AT_ONCE 1): another conversation\'s words wait — 等待 · 第 1 位 — and start by themselves', async () => {
  assert.equal(MAX_AT_ONCE, 1)
  const s = setup({ byOpener: { 甲: [question('甲问', { holdMs: 400 })], 乙: [question('乙问')] }, replies: [question('?')] })
  const one = s.b.startBuild('甲：跟踪电车')
  await later(60)
  const two = s.b.startBuild('乙：跟踪光伏')
  await later(60)
  const rows = s.b.listConversations().unbuilt
  const a = rows.find(r => r.title.startsWith('甲'))
  const b = rows.find(r => r.title.startsWith('乙'))
  assert.equal(a.state, 'working')
  assert.deepEqual([b.state, b.position], ['waiting', 1])
  assert.equal(s.b.getBuild(b.id).sending, '乙：跟踪光伏', 'the words waiting are shown')
  const [va, vb] = await Promise.all([one, two])
  assert.equal(va.turns.at(-1).question.text, '甲问')
  assert.equal(vb.turns.at(-1).question.text, '乙问', 'started by itself once the first was done')
  // switching and reading never wait: the views of both were there all along (getBuild during the wait above)
})

test('取消排队: the words come back (note left); the first words of a new conversation leave nothing behind', async () => {
  const s = setup({ byOpener: { 甲: [question('甲问', { holdMs: 400 })], 乙: [question('乙问')] }, replies: [question('?')] })
  const one = s.b.startBuild('甲：跟踪电车')
  await later(60)
  const two = s.b.startBuild('乙：跟踪光伏')
  await later(60)
  const waiting = s.b.listConversations().unbuilt.find(r => r.state === 'waiting')
  const out = await s.b.stopBuild(waiting.id)
  assert.deepEqual(out, { conv: waiting.id, gone: true, back: '乙：跟踪光伏', note: 'left' })
  assert.deepEqual(await two, out)
  assert.equal(s.b.listConversations().unbuilt.some(r => r.id === waiting.id), false)
  assert.equal((await one).state, 'question')
  // a conversation with something open: its words back, its state as before
  s.script({ byOpener: { 甲: [question('甲问'), question('甲二', { holdMs: 400 })], 丙: [question('丙问'), say('丙答')] }, replies: [question('?')] })
  const c = await s.b.startBuild('丙：跟踪芯片')
  const a = s.b.replyBuild('研究', (await one).conv)
  await later(60)
  const w = s.b.replyBuild('做投资', c.conv)
  await later(30)
  assert.equal(s.b.getBuild(c.conv).state, 'waiting')
  const back = await s.b.stopBuild(c.conv)
  assert.deepEqual([back.state, back.back, back.note, back.turns.length], ['question', '做投资', 'left', 2])
  await Promise.all([a, w])
})

// ---- 停止处理 ---------------------------------------------------------------------------------------------------------------

test('停止处理: the thing goes back to before the words, which come back (note stopped); the next words go on in a new session', async () => {
  const s = setup({ byOpener: { 甲: [question('拿来做什么？'), card(CARD(), { holdMs: 2000 }), question('还要什么？')] }, replies: [question('?')] })
  const v1 = await s.b.startBuild('甲：跟踪电车')
  const p = s.b.replyBuild('做研究', v1.conv)
  await later(80)
  assert.equal(s.b.getBuild(v1.conv).state, 'working')
  const t0 = Date.now()
  const out = await s.b.stopBuild(v1.conv)
  assert.ok(Date.now() - t0 < 1500, 'stopped at once, not after the reply')
  assert.deepEqual([out.state, out.back, out.note, out.turns.length, out.trouble], ['question', '做研究', 'stopped', 2, null])
  assert.deepEqual(await p, out)
  const saved = JSON.parse(readFileSync(join(s.buildDir, `${v1.conv.slice(4)}.json`), 'utf8'))
  assert.equal(saved.core.fresh, true)
  assert.equal(saved.core.calls, 2, 'the call stopped counts')
  const v2 = await s.b.replyBuild('做研究', v1.conv)
  assert.equal(v2.state, 'question')
  assert.equal(v2.back, null, 'sent again: nothing given back any more')
})

test('停止处理 on a library\'s first words: nothing opened (no file); on a new library\'s first words: the conversation is not kept', async () => {
  const s = setup()
  const id = await madeLibrary(s)
  s.script({ byLibrary: { [id]: [question('?', { holdMs: 2000 })] }, byOpener: { 新: [question('?', { holdMs: 2000 })] }, replies: [question('?')] })
  const before = files(s.buildDir)
  const p = s.b.startBuild('多找一点', id)
  await later(60)
  const out = await s.b.stopBuild(`lib:${id}`)
  assert.deepEqual([out.open, out.state, out.back, out.note], [false, 'idle', '多找一点', 'stopped'])
  await p
  assert.deepEqual(files(s.buildDir), before, 'no file left behind')
  const q = s.b.startBuild('新：跟踪光伏')
  await later(60)
  const id2 = s.b.listConversations().unbuilt[0].id
  assert.deepEqual(await s.b.stopBuild(id2), { conv: id2, gone: true, back: '新：跟踪光伏', note: 'stopped' })
  await q
  assert.equal(s.b.listConversations().unbuilt.length, 0)
  await assert.rejects(() => s.b.stopBuild(`lib:${id}`), e => e.code === 'bad_arguments', 'nothing to stop')
})

// ---- 放弃, 过期, 存盘 --------------------------------------------------------------------------------------------------------

test('放弃 takes back only that conversation\'s card: another\'s still waits and is confirmed', async () => {
  const s = setup({ byOpener: { 甲: [card(CARD('甲库'))], 乙: [card(CARD('乙库'))] }, replies: [question('?')] })
  const a = await s.b.startBuild('甲：跟踪电车')
  const b = await s.b.startBuild('乙：跟踪光伏')
  const pending = () => files(join(s.buildDir, 'pending')).filter(n => n.endsWith('.json')).length
  assert.equal(pending(), 2)
  assert.deepEqual(s.b.listConversations().cards.map(c => c.name), ['甲库', '乙库'], 'the one waiting longest first')
  await s.b.dropBuild(a.conv)
  assert.equal(pending(), 1)
  assert.deepEqual(s.b.listConversations().cards.map(c => c.conv), [b.conv])
  assert.equal((await s.b.confirmBuild(b.conv)).done, true)
})

test('改卡的卡过期: the library\'s card changed after the change started — the card cannot be confirmed (card-blocked, stale), the card file is not written', async () => {
  const s = setup()
  const id = await madeLibrary(s)
  const dir = s.library.find(id).path
  const changed = { ...CARD(), collect: ['月度销量', '价格战'] }
  s.script({ byLibrary: { [id]: [card(changed)] }, replies: [question('?')] })
  const v = await s.b.startBuild('加上价格战', id)
  assert.deepEqual([v.state, v.stale], ['card', false])
  // the library's card changes meanwhile (another way of 来源与要求): a new step of 每次更新的量
  saveLibraryVolume(dir, 'most')
  const v2 = s.b.getBuild(`lib:${id}`)
  assert.deepEqual([v2.state, v2.stale, v2.turns.at(-1).canConfirm], ['card-blocked', true, false])
  assert.equal(s.b.listConversations().cards[0].stale, true)
  const cardBefore = hash(join(dir, '_card', 'card.json'))
  await assert.rejects(() => s.b.confirmBuild(`lib:${id}`), e => e.code === 'bad_arguments' && /card-changed/.test(e.message))
  assert.equal(hash(join(dir, '_card', 'card.json')), cardBefore)
})

test('the words are written before the agent is asked: an app that quits part way shows 上一条消息未发送 and sends them again', async () => {
  const s = setup({ byOpener: { 甲: [question('拿来做什么？'), question('第二题', { holdMs: 3000 })] }, replies: [question('?')] })
  const v = await s.b.startBuild('甲：跟踪电车')
  const p = s.b.replyBuild('做研究', v.conv)
  await later(60)
  // the app quits here: the next start reads the file as it is now
  const file = join(s.buildDir, `${v.conv.slice(4)}.json`)
  const atQuit = readFileSync(file)
  const next = s.make()
  const after = next.getBuild(v.conv)
  assert.deepEqual([after.state, after.trouble], ['unsent', { code: 'interrupted' }])
  assert.equal(next.listConversations().attention, true)
  // (this process goes on: its turn is stopped, and the file put back as the quit left it)
  await s.b.stopBuild(v.conv)
  await p
  writeFileSync(file, atQuit)
  s.script({ byOpener: { 甲: [question('拿来做什么？'), question('第二题')] }, replies: [question('?')] })
  const again = await s.make().retryBuild(v.conv)
  assert.equal(again.turns.at(-1).question.text, '第二题')
})

test('the one-time note after the upgrade: due when 1.1.2 left conversations, until 知道了; never on a new install', async () => {
  const fresh = setup()
  assert.equal(fresh.b.listConversations().organised, false)
  await madeLibrary(fresh)
  assert.equal(fresh.make().listConversations().organised, false, 'a new install that has conversations since')
  const s = setup()
  mkdirSync(s.buildDir, { recursive: true })
  writeFileSync(join(s.buildDir, 'build.json'), JSON.stringify(legacy({ opener: '跟踪电车', turns: [{ role: 'user', text: '跟踪电车', at: '2026-11-25T10:00:00.000Z' }, { role: 'agent', kind: 'say', say: '好', at: '2026-11-25T10:00:01.000Z' }] })))
  const b = s.make()
  assert.equal(b.listConversations().organised, true)
  b.dismissConversationsNote()
  assert.equal(s.make().listConversations().organised, false)
})

test('a conversation\'s id from the page: an unknown one or a library not registered is bad_arguments; the same conversation busy is busy', async () => {
  const s = setup({ byOpener: { 甲: [question('拿来做什么？'), question('二', { holdMs: 400 })] }, replies: [question('?')] })
  assert.throws(() => s.b.getBuild('new:open-nope'), e => e.code === 'bad_arguments')
  assert.throws(() => s.b.getBuild('lib:nope1234'), e => e.code === 'bad_arguments')
  const v = await s.b.startBuild('甲：跟踪电车')
  const p = s.b.replyBuild('做研究', v.conv)
  await later(40)
  await assert.rejects(() => s.b.replyBuild('再说一句', v.conv), e => e.code === 'busy')
  await p
})
