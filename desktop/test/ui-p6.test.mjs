// 1.1.1 P6 in the real window (acceptance B17 as 1.1.1 changed it; A6): the current connection is an API key — a stand-in for
// the vendor's API on 127.0.0.1 (test/support/fake-api.mjs) as a custom vendor, the API connection kept real (STREAMS_DEV_API)
// while the command-line connections are the development stand-ins; Streams' readers answer from a table (STREAMS_DEV_READS).
//   no model key   新建库 says to enter it, 开始 cannot be pressed, startBuild is refused (build-needs-key), nothing made
//   with the key   问库: three questions, three answers (the vendor got them, with the key as Bearer)
//                  新建库: the model asks read_page, Streams reads the page and sends it back; the card it hands in is confirmed
//                  and the library is made
//                  the library's first update runs on the same API: the model reads a new page (kept as its original at once),
//                  hands in an item; it passes the same check as any connection's
//   the key is in no plain file of the app's data
// With STREAMS_P6_SHOTS=<folder> the window is shown and the pictures are saved there (paths masked). Each check holds first the
// state that would make it fail.
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { BUILD } from '../src/renderer/texts/build.js'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'
import { startFakeApi, text, tools } from './support/fake-api.mjs'

const SHOTS = process.env.STREAMS_P6_SHOTS && isAbsolute(process.env.STREAMS_P6_SHOTS) ? process.env.STREAMS_P6_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 90_000 }
const KEY = 'sk-p6-model-not-real-7h3k'
const SRC = 'https://grants.example.test/list'
const SAMPLE = 'https://grants.example.test/p/1'
const NEW = 'https://grants.example.test/p/2'
const sentence = n => `新补助第 ${n} 段：设备补助的第 ${n} 条规定，额度 ${n * 10} 万元，截止日期写在官方页上，申请要交三份材料。`
const CARD = {
  name: '补助追踪',
  definition: { summary: '一座帮小企业找补助的库。', purpose: '找补助', scope: '对象：小企业；地域：安省', exclude: '贷款', trust: '官方页为准', rhythm: '每周一次', language: '中文简报', hard: '只要不用还的' },
  collect: ['设备补助'], skip: ['贷款'], sources: [{ name: '补助目录', url: SRC, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清截止日期'], samples: [{ title: '样例', url: SAMPLE, date: '2026-11-20' }],
}
const ITEM = { url: NEW, title: '新补助', date: '2026-11-24', due: '', what: '一项新的设备补助。', points: [1, 2, 3].map(n => ({ text: `第 ${n} 条`, quote: sentence(n) })), why: '在卡的范围里' }

// the vendor: which call this is, by what it carries
const firstText = body => { const m = (body.messages ?? []).find(x => x.role === 'user'); return typeof m?.content === 'string' ? m.content : '' }
const kinds = []
function respond(body) {
  const msgs = body.messages ?? []
  const last = msgs.at(-1)
  const first = firstText(body)
  if (Array.isArray(body.tools) && body.tools.length) {
    const building = first.includes('## 用户的开场白')
    kinds.push(building ? 'build' : 'update')
    if (last.role === 'user' && typeof last.content === 'string') return tools(building ? [['read_page', { url: SRC }], ['read_page', { url: SAMPLE }]] : [['read_page', { url: NEW }]])
    return text(JSON.stringify(building ? { say: '请看卡，没问题点「确认」。', card: CARD } : { items: [ITEM], gaps: [] }))
  }
  if (first.includes('你在回答一个关于个人资料库的问题') || first.includes('You are answering a question about a personal library')) {
    kinds.push('ask')
    return text(JSON.stringify({ answer: [{ text: '新补助的规定写在这一条里：额度按条列出，截止日期写在官方页上，申请要交三份材料。', cites: [1] }], notInLibrary: false, missing: '', claimed: [] }))
  }
  const ids = [...first.matchAll(/^\[([\w-]+)\]/gm)].map(m => m[1])
  kinds.push(ids.length ? 'judge' : 'other')
  return text(JSON.stringify(ids.length ? { items: ids.map(id => ({ id, passed: true, evidence: 'ok' })) } : { ok: true }))
}
const api = await startFakeApi(respond)
after(() => api.close())

let reads = null
const s = worldSession({
  kind: 'empty',
  waitFor: 'load',
  prepare: world => {
    reads = join(world.root, 'reads.json')
    writeFileSync(reads, JSON.stringify({ [SRC]: { ok: true, links: [SAMPLE] }, [SAMPLE]: { ok: true, title: '样例', text: '样例正文：设备补助。' }, [NEW]: { ok: true, title: '新补助', text: [1, 2, 3, 4].map(sentence).join('\n\n') } }))
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_API: '1', STREAMS_DEV_READS: reads, STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), STREAMS_START_SCREEN: 'settings', ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [s.page.locator('.st-path'), s.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const filesUnder = dir => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])) : [])

describe('P6: an API key connection builds, updates and asks with Streams\' own tools', () => {
  test('no model key: 新建库 says to enter it; 开始 cannot be pressed; startBuild refused; nothing made', async () => {
    assert.ok((await bridge('setApiVendor', 'custom', api.baseUrl)).ok)
    assert.ok((await bridge('setConnectionModels', 'api', { model: 'fake-model', verifyModel: null })).ok)
    assert.ok((await bridge('setActiveConnection', 'api')).ok)
    await s.page.click('[data-action="add-library"]')
    await ready(s.page, 'build')
    await s.page.fill('textarea[data-field="opener"]', '帮我找补助')
    await until(() => document.querySelector('[data-part="start-why"]') !== null)
    const p = await s.page.evaluate(() => ({ start: document.querySelector('[data-action="start"] button').disabled, why: document.querySelector('[data-part="start-why"]').textContent }))
    assert.equal(p.start, true)
    assert.ok(p.why.includes(fmt(BUILD.needKey, { api: CONNECTIONS.names.api })), p.why)
    await shot('build-no-key')
    const r = await bridge('startBuild', '帮我找补助')
    assert.equal(r.ok, false)
    assert.equal(r.error?.code, 'bad_arguments')
    assert.equal((await bridge('getBuild')).data, null, 'nothing started')
    assert.equal(existsSync(join(s.world.root, 'new-libs')), false, 'nothing made')
    assert.equal(api.requests.length, 0, 'nothing sent to the vendor')
  })

  test('with the model key stored: 开始 can be pressed', async () => {
    assert.ok((await bridge('setApiKey', 'custom', KEY)).ok)
    await until(() => document.querySelector('[data-part="start-why"]') === null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="start"] button').disabled), false, 'now 开始 can be pressed')
  })

  test('新建库 on the API: read_page run by Streams, the card confirmed, the library made', async () => {
    await s.page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="talk"]') !== null && document.querySelector('[data-part="thinking"]') === null)
    await until(() => document.querySelector('article[data-part="build-card"][data-last="true"][data-can-confirm="true"]') !== null)
    const buildCalls = api.requests.filter(r => Array.isArray(r.body?.tools) && firstText(r.body).includes('## 用户的开场白'))
    assert.ok(buildCalls.length >= 2, `${buildCalls.length} build calls`)
    assert.deepEqual(buildCalls[0].body.tools.map(t => t.function.name), ['read_page'], 'no search service here: read_page only')
    assert.equal(buildCalls[0].headers.authorization, `Bearer ${KEY}`)
    const back = buildCalls[1].body.messages.filter(m => m.role === 'tool').map(m => m.content)
    assert.ok(back.some(c => c.includes('样例正文')), 'the page Streams read went back to the model')
    await shot('build-card-api')
    await s.page.click('article[data-part="build-card"][data-last="true"] [data-action="confirm"] button')
    await ready(s.page, 'sources')
    assert.ok(existsSync(join(s.world.root, 'new-libs')), 'the library made')
  })

  test('its first update runs on the API: the page the model read is kept, its item passes the check', async () => {
    const lib = (await bridge('getAppState')).data.library
    const rounds = () => { const f = join(lib.path, '_pipeline', 'rounds.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)) : [] }
    for (let i = 0; i < 900 && rounds().length === 0; i++) await s.page.waitForTimeout(100)
    const [round] = rounds()
    assert.deepEqual([round?.kind, round?.status], ['update', 'done'], JSON.stringify(round))
    assert.ok(kinds.includes('update'), 'the update agent was the API')
    const inbox = (await bridge('getInbox')).data ?? []
    const item = (Array.isArray(inbox) ? inbox : inbox.items ?? []).find(c => c.url === NEW)
    assert.ok(item, JSON.stringify(inbox).slice(0, 400))
    assert.equal(item.verification?.passed, true, JSON.stringify(item.verification))
    await s.page.click('[data-tab="inbox"]').catch(() => {})
    await shot('inbox-after-api-update')
  })

  test('问库 on the API: three questions, three answers', async () => {
    // a library with nothing kept answers 「库内暂无」 by itself: the update's item kept first, so the model is asked
    assert.ok((await bridge('keepItem', NEW)).ok)
    const rs = []
    for (const q of ['新补助的额度是多少？', '设备补助申请要交什么材料？', '新补助的截止日期写在哪里？']) {
      const r = await bridge('askLibrary', q)
      rs.push(r)
      assert.ok(r.ok, `${q}: ${JSON.stringify(r)}`)
    }
    assert.ok(rs.every(r => r.data.calls >= 1 && r.data.answer.length === 1 && r.data.answer[0].cites.includes(1)), JSON.stringify(rs.map(r => r.data)).slice(0, 600))
    assert.ok(kinds.filter(k => k === 'ask').length >= 3, JSON.stringify(kinds))
  })

  test('the key is in no plain file of the app\'s data or the library', () => {
    const read = []
    for (const f of [...filesUnder(s.world.appData), ...filesUnder(join(s.world.root, 'new-libs'))]) {
      if (f.endsWith('.bin')) continue
      let t
      try { t = readFileSync(f) } catch (err) { if (err.code === 'EBUSY' || err.code === 'EPERM') continue; throw err }
      read.push(f)
      assert.equal(t.includes(Buffer.from(KEY)), false, f)
    }
    assert.ok(read.some(f => f.endsWith('main.log')), 'main.log was read')
  })

  test('no page errors', () => { assert.deepEqual(s.errors, []) })
})
