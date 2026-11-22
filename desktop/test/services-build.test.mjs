// 1.1 W6b (A1, A2, B3): the build conversation in the main process (services/build.mjs) — only Claude Code builds; a card
// waits until 确认 (no folder, no registry entry before); 确认 makes the library and makes it the current one; 不建了 makes
// nothing; a change of a library's card shows before / after and writes only on 确认; the conversation is kept across a
// restart; a failed turn can be tried again. The real library service; the agent is a scripted stand-in.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLibraryService } from '../src/main/services/library.mjs'
import { createBuildService, devBuildSession } from '../src/main/services/build.mjs'
import { readCard } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root) })

const A = 'https://example-a.test/list'
const B = 'https://example-b.test/samples/1'
export const CARD = () => ({
  name: '测试电车库',
  definition: { summary: '一座测试库。', purpose: '行业研究', scope: '对象：车企；行业：电动车；地域：中国；规模：大', exclude: '自媒体', trust: '官方', rhythm: '每天', language: '中文', hard: '一手出处' },
  decide: [{ what: '零跑收不收', default: '收' }],
  collect: ['月度销量'], skip: ['传闻'],
  sources: [{ name: '甲来源', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
})
const question = (text, kind = 'input', options = []) => ({ json: { say: '', question: { text, kind, options } } })
const card = (c, reads = []) => ({ json: { say: '请看卡', card: c }, reads: reads.map(url => ({ url, ok: true })) })

async function setup({ kind = 'claude-code', replies = [] } = {}) {
  const w = testWorld('st-build-')
  worlds.push(w)
  const script = join(w.root, 'build-replies.json')
  writeFileSync(script, JSON.stringify({ replies }))
  const locale = () => w.locale
  const library = createLibraryService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, dialog: w.dialog, shell: w.shell, locale })
  const now = { kind }
  const connections = { active: () => (now.kind ? { kind: now.kind, connection: { kind: now.kind } } : null) }
  const make = () => createBuildService({
    appDataDir: join(w.root, 'app'), library, connections, emit: w.emit, log: w.log, locale, libraryRoot: () => join(w.root, 'libs'),
    session: (active, calls) => devBuildSession(script, calls),
  })
  return { w, library, script, make, b: make().handlers, setReplies: r => writeFileSync(script, JSON.stringify({ replies: r })), setKind: k => { now.kind = k } }
}
const hash = p => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'absent')

test('only Claude Code builds: Codex or an API key is refused, none chosen is no_connection; an empty sentence is refused', async () => {
  for (const kind of ['codex', 'api']) {
    const s = await setup({ kind })
    await assert.rejects(() => s.b.startBuild('跟踪电车'), e => e.code === 'bad_arguments' && /build-not-supported/.test(e.message))
    assert.equal(s.b.getBuild(), null)
  }
  const none = await setup({ kind: null })
  await assert.rejects(() => none.b.startBuild('跟踪电车'), e => e.code === 'no_connection')
  const s = await setup({ replies: [question('拿来做什么？')] })
  await assert.rejects(() => s.b.startBuild('   '), e => e.code === 'bad_arguments')
})

test('a question, an answer, a card: nothing is made until 确认; then the library with its card is the current one', async () => {
  const s = await setup({ replies: [question('拿来做什么？'), question('还要哪几家？', 'multi', ['零跑', '问界']), card(CARD(), [A, B])] })
  let v = await s.b.startBuild('帮我跟踪中国电动车')
  assert.deepEqual([v.mode, v.status, v.asked, v.turns.map(t => t.role)], ['create', 'talking', 1, ['you', 'agent']])
  assert.equal(v.turns[1].question.kind, 'input')
  v = await s.b.replyBuild('行业研究')
  assert.deepEqual(v.turns.at(-1).question.options, ['零跑', '问界'])
  assert.equal(v.turns.at(-1).question.other, true)
  v = await s.b.replyBuild({ picked: ['零跑'], other: '宁德时代' })
  assert.equal(v.turns.at(-2).text, '我选了：零跑；其它：宁德时代', 'the answer as the agent is given it')
  const last = v.turns.at(-1)
  assert.deepEqual([last.kind, last.canConfirm, last.before], ['card', true, null])
  assert.equal(existsSync(join(s.w.root, 'libs')), false, 'no folder before 确认')
  assert.equal(s.library.current(), null)
  const r = await s.b.confirmBuild()
  assert.equal(r.done, true)
  const cur = s.library.current()
  assert.equal(cur.libraryId, r.libraryId)
  assert.equal(readCard(cur.path).name, '测试电车库')
  assert.equal(s.b.getBuild(), null, 'the conversation ended')
  assert.ok(readdirSync(join(s.w.root, 'app', 'build')).some(n => n.startsWith('ended-') && n.endsWith('-built.json')))
})

test('a card that is not whole, or carries an address not read, has no 确认; confirmBuild refuses and makes nothing', async () => {
  const noUnreadable = CARD(); delete noUnreadable.unreadable
  const noLanguage = CARD(); delete noLanguage.definition.language
  for (const [name, c, reads] of [['unreadable', noUnreadable, [A, B]], ['language', noLanguage, [A, B]], ['not read', CARD(), [A]]]) {
    const s = await setup({ replies: [card(c, reads)] })
    const v = await s.b.startBuild('x')
    const last = v.turns.at(-1)
    assert.deepEqual([last.kind, last.canConfirm], ['card', false], name)
    assert.ok(last.problems.length > 0, name)
    await assert.rejects(() => s.b.confirmBuild(), e => e.code === 'bad_arguments', name)
    assert.equal(existsSync(join(s.w.root, 'libs')), false, name)
  }
})

test('不建了: nothing made, the conversation gone; a new one can start', async () => {
  const s = await setup({ replies: [card(CARD(), [A, B])] })
  await s.b.startBuild('x')
  assert.equal(s.b.dropBuild(), null)
  assert.equal(s.b.getBuild(), null)
  assert.equal(existsSync(join(s.w.root, 'libs')), false)
  assert.equal(readdirSync(join(s.w.root, 'app', 'build', 'pending')).filter(n => n.endsWith('.json')).length, 0, 'the waiting card taken back')
  await assert.rejects(() => s.b.confirmBuild(), e => e.code === 'bad_arguments')
  await s.b.startBuild('再来一次')
  assert.notEqual(s.b.getBuild(), null)
})

test('one conversation at a time; it is kept across a restart and goes on from where it was', async () => {
  const s = await setup({ replies: [question('拿来做什么？'), card(CARD(), [A, B])] })
  await s.b.startBuild('x')
  await assert.rejects(() => s.b.startBuild('另一个'), e => e.code === 'bad_arguments')
  const again = s.make().handlers
  const v = again.getBuild()
  assert.deepEqual([v.turns.length, v.turns[1].question.text], [2, '拿来做什么？'])
  const v2 = await again.replyBuild('研究')
  assert.equal(v2.turns.at(-1).kind, 'card', 'the second reply was given: the call count came back with the conversation')
  assert.equal((await again.confirmBuild()).done, true)
})

test('a failed turn says so and can be tried again; nothing of the failed one is kept', async () => {
  const s = await setup({ replies: [{ ok: false, code: 'login-expired' }] })
  const v = await s.b.startBuild('x')
  assert.deepEqual(v.trouble, { code: 'login-expired' })
  assert.deepEqual(v.turns.map(t => t.role), [], 'the sentence is not kept as said')
  s.setReplies([{ ok: false, code: 'login-expired' }, question('拿来做什么？')])
  const v2 = await s.b.retryBuild()
  assert.equal(v2.trouble, null)
  assert.equal(v2.turns.at(-1).question.text, '拿来做什么？')
})

test('changing a library\'s card: before / after; the card file is the same until 确认, then the new one with its history', async () => {
  const s = await setup({ replies: [card(CARD(), [A, B])] })
  await s.b.startBuild('x')
  const { libraryId } = await s.b.confirmBuild()
  const dir = s.library.find(libraryId).path
  const file = join(dir, '_card', 'card.json')
  const before = hash(file)
  const changed = CARD(); changed.collect = ['月度销量', '价格战']
  s.setReplies([card(changed)])
  const v = await s.b.startBuild('加上价格战', libraryId)
  assert.deepEqual([v.mode, v.library.id], ['edit', libraryId])
  const last = v.turns.at(-1)
  assert.deepEqual([last.canConfirm, last.before.collect, last.card.collect], [true, ['月度销量'], ['月度销量', '价格战']])
  assert.equal(hash(file), before, 'not confirmed: the same file')
  s.b.dropBuild()
  assert.equal(hash(file), before, 'dropped: the same file')
  s.setReplies([card(changed)])
  await s.b.startBuild('加上价格战', libraryId)
  await s.b.confirmBuild()
  assert.notEqual(hash(file), before)
  assert.deepEqual(readCard(dir).collect, ['月度销量', '价格战'])
  assert.equal(readdirSync(join(dir, '_card', 'history')).length, 2)
  await assert.rejects(() => s.b.startBuild('x', 'no-such-library'), e => e.code === 'bad_arguments')
})

test('a second library of the same name goes to a free folder', async () => {
  const s = await setup({ replies: [card(CARD(), [A, B])] })
  await s.b.startBuild('x')
  const one = s.library.find((await s.b.confirmBuild()).libraryId).path
  s.setReplies([card(CARD(), [A, B])])
  await s.b.startBuild('y')
  const two = s.library.find((await s.b.confirmBuild()).libraryId).path
  assert.notEqual(one, two)
  assert.ok(two.endsWith(' 2'), two)
})

test('不建了 after the connection changed to one that cannot build: the waiting card is still taken back', async () => {
  const s = await setup({ replies: [card(CARD(), [A, B])] })
  await s.b.startBuild('x')
  const pending = () => readdirSync(join(s.w.root, 'app', 'build', 'pending')).filter(n => n.endsWith('.json')).length
  assert.equal(pending(), 1)
  s.setKind('codex')
  const again = s.make().handlers
  assert.equal(again.dropBuild(), null)
  assert.equal(pending(), 0, 'taken back without the connection')
  assert.equal(again.getBuild(), null)
})
