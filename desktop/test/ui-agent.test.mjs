// redesign R1 (F10): 主 Agent in the sidebar carries no number any more — what waits for you is counted on the right panel's 待确认 tab only, from the same list; the badge read is [data-panel-badge="decide"] (was [data-badge="chat"]); 概览's suggestion cards are in 待确认
// v2 package G (docs/checks/2026-11-09-wp-g/contract.md G1–G4) on the running app: 和主 Agent 聊, the proposal card, the
// suggestion card, 问库's routed sentences. The world: three registered libraries (test/support/seed.mjs seedShelf), the main
// Agent on the core's scripted stand-in (STREAMS_DEV_CONNECTION=fake + STREAMS_DEV_AGENT_SCRIPT: SCRIPT below, one answer per
// call, in the order the tests use them), five cards made at start by the development hook (STREAMS_DEV_PROPOSALS), two
// suggestion cards recorded by the core, a record of 113 lines written before the start (a summary, a lookup, a note among
// them), and a feed server on this machine for the test fetches (nothing leaves the machine). No connection is chosen, so a
// question to the library says so (v1.0's line) and the routing of an unclear sentence asks you.
// Where a check needs a call to be slow (a turn in progress, a button pressed twice), the main process's handler of that one
// bridge method is wrapped for the test (a delay and a counter), never the page.
// Each check first shows the input that makes it fail.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { EVENT_CHANNEL } from '../src/main/events.mjs'
import { AGENT } from '../src/renderer/texts/agent.js'
import { ASK } from '../src/renderer/texts/ask.js'
import { CONNECTIONS, NO_CONNECTION } from '../src/renderer/texts/common.js'
import { SHELL } from '../src/renderer/texts/shell.js'
import { fmt } from '../src/renderer/lib/format.js'
import { SHELF, seedShelf, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const here = tempDir('st-ui-agent-')
const scriptFile = join(here, 'agent-script.json')
const cardsFile = join(here, 'cards.json')
const libraryRoot = join(here, 'library-root')
mkdirSync(libraryRoot)

// ---- the feed server of the test fetches: /feed/<name>?n=<items>, /blocked (403) ----
const rss = (base, name, n) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${name}</title>\n${Array.from({ length: n }, (_, i) => `<item><title>${name} item ${i + 1}</title><link>${base}/item/${name}/${i + 1}</link><pubDate>${new Date(Date.now() - (i + 1) * 3_600_000).toUTCString()}</pubDate><description>about ${name}</description></item>`).join('\n')}\n</channel></rss>`
const server = createServer((req, res) => {
  const base = `http://127.0.0.1:${server.address().port}`
  const u = new URL(req.url ?? '/', base)
  const m = /^\/feed\/([\w-]+)$/.exec(u.pathname)
  if (m) { res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' }); res.end(rss(base, m[1], Number(u.searchParams.get('n') ?? 3))); return }
  if (u.pathname === '/blocked') { res.writeHead(403); res.end('no'); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<html><body><p>An item.</p></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${server.address().port}`
const feed = (name, n) => `${BASE}/feed/${name}?n=${n}`

const NEW_LIBRARY = '新能源电池'
let shelf = null
const ids = () => shelf.ids
const s = worldSession({
  kind: 'seeded',
  waitFor: 'chat',
  prepare: async world => {
    shelf = await seedShelf(world)
    const [seeded, ev, fashion] = shelf.ids
    // the cards waiting at start (by: 'dev'), oldest first
    writeFileSync(cardsFile, JSON.stringify([
      { kind: 'edit_brief', params: { libraryId: seeded, brief: '只追 agent 记忆。' }, why: '测试：不要' },
      { kind: 'edit_cap', params: { libraryId: seeded, cap: 33 }, why: '测试：过期' },
      { kind: 'add_source', params: { libraryId: ev, source: { name: 'ev-weekly', kind: 'rss', url: feed('ev-weekly', 8), topic: '整车销量' } }, why: '测试：没生效' },
      { kind: 'edit_schedule', params: { libraryId: fashion, enabled: true, time: '09:00' }, why: '测试：确认' },
      { kind: 'edit_brief', params: { libraryId: fashion, brief: '追踪中国时尚上市公司的财报。' }, why: '测试：改一下' },
    ]))
    // the main Agent's answers, one per call, in the order the tests below make them
    writeFileSync(scriptFile, JSON.stringify([
      /* 0 UC1 step 1 */ { reply: '好。先问一件事。', ask: { question: '港股上市的公司要算进来吗？', options: ['要', '不要'] } },
      /* 1 UC1 step 2 */ { reply: '按你说的拟了一个库，被拒绝的那个没勾：', proposals: [{ kind: 'create_library', why: '你要追新能源电池，港股上市的也算', params: {
        name: NEW_LIBRARY, brief: '追踪新能源电池：装机量、价格、技术路线。', topics: [{ name: '电池', keywords: ['装机量', '固态电池'] }],
        sources: [{ name: 'battery-weekly', kind: 'rss', url: feed('battery', 4), topic: '电池' }, { name: 'battery-forum', kind: 'rss', url: `${BASE}/blocked`, topic: '电池' }],
        thresholds: { relevance: 0.7, substance: 0.6 }, schedule: { enabled: true, time: '08:30' } } }] },
      /* 2 a lookup */ { reply: '', lookups: [{ what: 'library', libraryId: ev }] },
      /* 3 */ { reply: '电动车那个库还没跑过。', note: '用户关心电动车库' },
      /* 4, 5 not understood twice */ { $text: 'not json at all' }, { $text: 'still not json' },
      /* 6 a card that does not fit */ { reply: '试了一下。', proposals: [{ kind: 'edit_cap', params: { libraryId: seeded, cap: -1 }, why: '上限改成 -1' }] },
      /* 7, 8 the session lost on resume, then the answer of the new one */ { $lost: true }, { reply: '接上了。' },
      /* 9 the connection fails */ { $fail: 'login-expired' },
      /* 10 a slow turn */ { reply: '慢慢来。' },
      /* 11 交给主 Agent */ { reply: '这个库连续几轮没有产出，先看看它的来源。' },
      /* 12 改一下 */ { reply: '好，我按你说的重新拟。' },
      /* 13 unsure → 是，改这个库 */ { reply: '好的，你想怎么改这个库？' },
      /* 14 UC3 step 3 */ { reply: '好，我拟了一个改动：', proposals: [
        { kind: 'add_source', params: { libraryId: seeded, source: { name: 'agent-evals', kind: 'rss', url: feed('agent-evals', 3), topic: '评测' } }, why: '你说「以后也追踪 agent 评测的公告」' },
        { kind: 'edit_topics', params: { libraryId: seeded, ops: [{ op: 'add_keywords', topic: '评测', keywords: ['公告'] }] }, why: '你说「以后也追踪 agent 评测的公告」' }] },
    ]))
    // two suggestion cards: 时尚's three rounds without output (the core's rule), a source of the seeded library failing
    const [seededDir, , fashionDir] = shelf.dirs
    const found = core.suggestFor(fashionDir)
    assert.deepEqual(found.map(x => x.kind), ['no-output'], 'control: the rule finds the three rounds')
    core.recordSuggestions(fashionDir, found)
    const at = new Date(Date.now() - 3_600_000).toISOString()
    core.recordSuggestions(seededDir, [{ key: 'source-failing:mcp-news', kind: 'source-failing', subject: 'mcp-news', createdAt: at,
      evidence: { rounds: 3, failed: 2, blocked: 1, since: at, last: { ts: at, status: 'blocked', message: 'HTTP 403', http: 403 } } }])
    // the record before the start: 55 turns of words, a summary of the first five, a lookup and a note in turns 6 and 7
    const agentDir = join(world.appData, core.AGENT_DIR)
    let i = 0
    const t0 = Date.now() - 86_400_000
    const now = () => new Date(t0 + (i++) * 1000)
    for (let turn = 1; turn <= 55; turn++) {
      core.appendTranscript(agentDir, { turn, role: 'you', text: `以前的第 ${turn} 句` }, { now })
      if (turn === 6) core.appendTranscript(agentDir, { turn, role: 'lookup', text: 'RAW-LOOKUP-TEXT', data: { request: { what: 'library', libraryId: ev }, round: 1 } }, { now })
      if (turn === 7) core.appendTranscript(agentDir, { turn, role: 'note', text: 'RAW-NOTE-TEXT', data: { errors: ['x'] } }, { now })
      core.appendTranscript(agentDir, { turn, role: 'agent', text: `以前的第 ${turn} 个回答` }, { now })
      if (turn === 5) core.appendTranscript(agentDir, { turn, role: 'summary', text: 'RAW-SUMMARY-TEXT', data: { from: 1, through: 5, chars: 100 } }, { now })
    }
    return () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
  },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_AGENT_SCRIPT: scriptFile, STREAMS_DEV_PROPOSALS: cardsFile, STREAMS_DEV_LIBRARY_ROOT: libraryRoot, STREAMS_START_SCREEN: 'chat' }),
})
after(() => removeTree(here, { waitMs: 5000 }))

const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const event = (topic, payload) => s.app.evaluate(({ BrowserWindow }, [channel, m]) => { BrowserWindow.getAllWindows()[0].webContents.send(channel, m) }, [EVENT_CHANNEL, { topic, payload }])
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const cards = async filter => (await bridge('listProposals', filter ?? null)).data
const cardOf = async (kind, libraryId) => (await cards(null)).find(c => c.kind === kind && c.libraryId === libraryId)
const transcript = () => readFileSync(join(s.world.appData, core.AGENT_DIR, core.TRANSCRIPT_FILE), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const suggestionLines = dir => (existsSync(join(dir, '_pipeline', 'suggestions.jsonl')) ? readFileSync(join(dir, '_pipeline', 'suggestions.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
const agentRows = () => s.page.evaluate(() => document.querySelectorAll('[data-part="conversation"] [data-row="agent"]').length)
const idle = () => until(() => document.querySelector('[data-part="compose"]')?.dataset.busy === 'false')
/** One sentence from 和主 Agent 聊's input; waits for its turn to end and the record to be drawn again. */
async function say(text) {
  const before = transcript().length
  await s.page.fill('textarea[data-field="message"]', text)
  await s.page.click('[data-action="send"] button')
  await settled(before)
}
/** Until the record has more than `before` lines and the page has drawn the end of that turn. */
async function settled(before) {
  const end = Date.now() + 60_000
  while (transcript().length <= before) {
    if (Date.now() > end) throw new Error('the turn wrote nothing to the record')
    await new Promise(r => setTimeout(r, 100))
  }
  await until(() => !document.querySelector('[data-sending]') && document.querySelector('[data-part="compose"]')?.dataset.busy === 'false')
}
/** Wrap one bridge method's handler in the main process: every call counted and held `ms` before it runs. */
const slow = (name, ms) => s.app.evaluate(({ ipcMain }, [channel, wait]) => {
  const map = ipcMain._invokeHandlers
  const original = map.get(channel)
  if (!original) throw new Error(`no handler ${channel}`)
  globalThis.__slow ??= {}
  globalThis.__slow[channel] = { calls: 0, original }
  map.set(channel, async (...a) => { globalThis.__slow[channel].calls++; await new Promise(r => setTimeout(r, wait)); return original(...a) })
}, [`streams:${name}`, ms])
const callsOf = name => s.app.evaluate((_e, channel) => globalThis.__slow?.[channel]?.calls ?? 0, `streams:${name}`)
const unslow = name => s.app.evaluate(({ ipcMain }, channel) => { ipcMain._invokeHandlers.set(channel, globalThis.__slow[channel].original) }, `streams:${name}`)
// what no card may carry (the maintainer 11-05): a switch for doing a kind of change by itself from then on
const AUTO = /以后这类|直接做|直接换|自动执行|always do|automatically/i

test('等你定的事: the cards waiting + the suggestion cards (every library), the same number as the sidebar\'s badge; foldable', async () => {
  const pending = await cards({ status: 'pending' })
  assert.equal(pending.length, 5, 'control: the development hook made five cards')
  const open = (await bridge('listSuggestions', null)).data
  assert.deepEqual(open.map(x => x.kind).sort(), ['no-output', 'source-failing'])
  await until(() => document.querySelector('[data-part="waiting"] [data-waiting]')?.dataset.waiting === '7')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="waiting"] h2').textContent), fmt(AGENT.waiting.title, { n: 7 }))
  await until(() => document.querySelector('[data-panel-badge="decide"]')?.textContent === '7')
  const shown = await s.page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-part="waiting-items"] [data-proposal]')].map(e => e.dataset.proposal),
    suggestions: [...document.querySelectorAll('[data-part="waiting-items"] [data-suggestion]')].map(e => [e.dataset.kind, e.querySelector('.sc-who').textContent]),
  }))
  assert.deepEqual(shown.cards.sort(), pending.map(c => c.id).sort())
  assert.deepEqual(shown.suggestions.map(x => x[0]).sort(), ['no-output', 'source-failing'])
  assert.ok(shown.suggestions.some(([k, who]) => k === 'no-output' && who === AGENT.avatar + fmt(AGENT.suggestion.whoOf, { lib: SHELF.names[2] })), JSON.stringify(shown.suggestions))
  await s.page.click('[data-part="waiting"] [data-action="fold"] button')
  await until(() => document.querySelector('[data-part="waiting-items"]') === null)
  await s.page.click('[data-part="waiting"] [data-action="fold"] button')
  await until(() => document.querySelector('[data-part="waiting-items"]') !== null)
})

test('the record: the newest 100 lines; 加载更早的对话 brings the rest; lookup / note / summary are one faint line, never their text', async () => {
  const total = transcript().length
  assert.equal(total, 113)
  const count = () => s.page.evaluate(() => document.querySelectorAll('[data-part="conversation"] [data-row]').length)
  assert.equal(await count(), 100, 'one page of the record')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="intro"]')), null, 'control: not the start of the record, no first words')
  await s.page.click('[data-action="load-more"] button')
  await until(n => document.querySelectorAll('[data-part="conversation"] [data-row]').length === n, total)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-action="load-more"]')), null)
  assert.notEqual(await s.page.evaluate(() => document.querySelector('[data-part="intro"]')), null, 'the start of the record: the first words')
  const faint = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="conversation"] .chat-faint')].map(e => [e.dataset.row, e.dataset.turn, e.textContent]))
  assert.deepEqual(faint, [
    ['summary', '5', AGENT.rows.summary],
    ['lookup', '6', fmt(AGENT.rows.lookup.library, { name: SHELF.names[1] })],
    ['note', '7', AGENT.rows.note],
  ])
  const text = await s.page.evaluate(() => document.querySelector('[data-part="conversation"]').textContent)
  for (const raw of ['RAW-LOOKUP-TEXT', 'RAW-NOTE-TEXT', 'RAW-SUMMARY-TEXT']) assert.equal(text.includes(raw), false, raw)
  assert.ok(text.includes('以前的第 1 句') && text.includes('以前的第 55 个回答'), 'control: the words themselves are shown')
  // your words on the right, the main Agent's with its mark
  assert.deepEqual(await s.page.evaluate(() => {
    const you = document.querySelector('[data-row="you"][data-turn="1"]')
    const bot = document.querySelector('[data-row="agent"][data-turn="1"]')
    return [getComputedStyle(you).alignSelf, bot.querySelector('.agent-av')?.textContent]
  }), ['flex-end', AGENT.avatar])
})

test('UC1: a sentence → one question with quick answers; a quick answer is sent as your words → the new library\'s card; 建库 → the sidebar has it', async () => {
  await say('帮我建个库，追踪新能源电池。')
  const ask = await s.page.evaluate(() => {
    const a = document.querySelector('[data-part="ask"][data-open="true"]')
    return a ? { q: a.querySelector('.chat-text').textContent, options: [...a.querySelectorAll('[data-action="quick"]')].map(b => b.dataset.option) } : null
  })
  assert.deepEqual(ask, { q: '港股上市的公司要算进来吗？', options: ['要', '不要'] })
  const before = transcript().length
  await s.page.click('[data-part="ask"][data-open="true"] [data-action="quick"][data-option="要"] button')
  await until(() => document.querySelector('[data-proposal][data-kind="create_library"]') !== null && document.querySelector('[data-part="compose"]')?.dataset.busy === 'false')
  const you = transcript().slice(before).find(r => r.role === 'you')
  assert.equal(you.text, '要', 'the option itself went as your words')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="ask"][data-open="true"]')), null, 'answered: no quick answers any more')
  const card = (await cards({ status: 'pending' })).find(c => c.kind === 'create_library')
  assert.ok(card)
  const shown = await s.page.evaluate(id => {
    const c = document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)
    return {
      head: c.querySelector('.pc-who').textContent, title: c.querySelector('[data-part="title"]').textContent, why: c.querySelector('[data-part="why"]').textContent,
      brief: c.querySelector('[data-part="brief"]').textContent, keywords: [...c.querySelectorAll('[data-part="topics"] [data-keyword]')].map(k => k.dataset.keyword),
      trials: [...c.querySelectorAll('[data-trial]')].map(t => [t.dataset.trial, t.dataset.state, t.dataset.include, t.querySelector('.pc-chip').textContent, t.querySelector('[data-part="unticked"]')?.textContent ?? null]),
      thresholds: c.querySelector('[data-part="thresholds"]').textContent, schedule: c.querySelector('[data-part="schedule"]').textContent, folder: c.querySelector('[data-part="folder"]').textContent,
      actions: [...c.querySelectorAll('[data-action]')].map(a => [a.dataset.action, a.textContent.trim()]),
    }
  }, card.id)
  assert.equal(shown.head, AGENT.avatar + AGENT.card.head)
  assert.equal(shown.title, fmt(AGENT.card.titles.create_library, { name: NEW_LIBRARY }))
  assert.equal(shown.why, card.why)
  assert.equal(shown.brief, card.after.brief)
  assert.deepEqual(shown.keywords, ['装机量', '固态电池'])
  // the core's test fetches: the refused one is not ticked and says so
  assert.deepEqual(card.trial.map(t => [t.name, t.status, t.include, t.count]), [['battery-weekly', 'ok', true, 4], ['battery-forum', 'blocked', false, 0]], 'control: what the core found')
  assert.deepEqual(shown.trials, [['battery-weekly', 'ok', 'true', '正常 · 4 条', null], ['battery-forum', 'blocked', 'false', '被拒绝 · HTTP 403', AGENT.card.unticked]])
  assert.equal(shown.thresholds, fmt(AGENT.card.thresholdsLine, { relevance: '0.7', substance: '0.6' }))
  assert.equal(shown.schedule, fmt(AGENT.card.scheduleOn, { time: '08:30' }))
  assert.equal(shown.folder, card.after.folder)
  assert.deepEqual(shown.actions, [['confirm', AGENT.card.create], ['revise', AGENT.card.revise], ['decline', AGENT.card.decline]], 'three buttons, nothing that does it by itself later')
  // 建库
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-library-row]').length), 3, 'control: three libraries before')
  await s.page.click(`[data-part="conversation"] [data-proposal="${card.id}"] [data-action="confirm"] button`)
  await until(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)?.dataset.status === 'confirmed', card.id)
  assert.equal((await cardOf('create_library', null)).status, 'confirmed')
  await until(() => document.querySelectorAll('[data-library-row]').length === 4)
  assert.ok(await s.page.evaluate(n => [...document.querySelectorAll('.st-sidebar__lib-name')].some(e => e.textContent === n), NEW_LIBRARY))
  const status = await s.page.evaluate(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"] [data-part="status"]`).textContent, card.id)
  assert.ok(status.startsWith(AGENT.card.states.created.split('{')[0]), status)
})

test('a lookup is one faint line; the four notices each have their words; the connection\'s problem offers 设置', async () => {
  await say('电动车那个库现在怎么样？')
  const turn = transcript().filter(r => r.role === 'lookup').at(-1).turn
  assert.equal(await s.page.evaluate(t => document.querySelector(`.chat-faint[data-row="lookup"][data-turn="${t}"]`)?.textContent, turn), fmt(AGENT.rows.lookup.library, { name: SHELF.names[1] }))
  const notice = code => s.page.evaluate(c => [...document.querySelectorAll(`[data-part="conversation"] [data-notice="${c}"]`)].map(e => e.textContent.trim()), code)
  assert.deepEqual(await notice('not-understood'), [], 'control: none before')
  await say('说点什么')
  assert.deepEqual(await notice('not-understood'), [AGENT.notices['not-understood']])
  await say('把上限改成 -1')
  assert.deepEqual(await notice('proposals-dropped'), [fmt(AGENT.notices['proposals-dropped'], { n: 1 })])
  await say('接着说')
  assert.deepEqual(await notice('session-rebuilt'), [AGENT.notices['session-rebuilt']])
  await say('在吗')
  const conn = await notice('connection')
  assert.equal(conn.length, 1)
  assert.ok(conn[0].startsWith(fmt(AGENT.notices.connection, { reason: CONNECTIONS.codes['login-expired'] })), conn[0])
  assert.ok(conn[0].endsWith(NO_CONNECTION.go))
  // a notice is said once (the turn's answer and the record say the same)
  for (const c of ['not-understood', 'proposals-dropped', 'session-rebuilt', 'connection']) assert.equal((await notice(c)).length, 1, c)
})

test('a turn in progress: 「主 Agent 在想…」, the input and 发送 disabled, a second sentence not sent; the same for a turn started elsewhere', async () => {
  await slow('agentSend', 1500)
  try {
    await s.page.fill('textarea[data-field="message"]', '慢一点')
    await s.page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-part="thinking"]') !== null)
    const during = await s.page.evaluate(() => ({ field: document.querySelector('textarea[data-field="message"]').disabled, send: document.querySelector('[data-action="send"] button').disabled, text: document.querySelector('[data-part="thinking"]').textContent }))
    assert.deepEqual(during, { field: true, send: true, text: AGENT.chat.thinking })
    // a second try while it runs: the button gives nothing (pressed in the page, past Playwright's own wait for enabled)
    await s.page.evaluate(() => { const b = document.querySelector('[data-action="send"] button'); b.disabled = false; b.click(); b.click() })
    await idle()
    assert.equal(await callsOf('agentSend'), 1, 'one sentence sent, not three')
  } finally { await unslow('agentSend') }
  assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="message"]').disabled), false, 'free again after the turn')
  // a turn of the main Agent started elsewhere (问库, 交给主 Agent): the same
  await event('agent-changed', { phase: 'started', turn: 999, libraryId: null })
  await until(() => document.querySelector('[data-part="compose"]')?.dataset.busy === 'true')
  assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="message"]').disabled), true)
  await event('agent-changed', { phase: 'done', turn: 999, libraryId: null })
  await idle()
})

test('a suggestion card in 等你定的事: 交给主 Agent → acceptSuggestion (recorded, one turn of the main Agent); the count follows', async () => {
  const fashionDir = shelf.dirs[2]
  const card = '[data-part="waiting-items"] [data-suggestion][data-kind="no-output"]'
  const shown = await s.page.evaluate(sel => {
    const c = document.querySelector(sel)
    return { sentence: c.querySelector('[data-part="sentence"]').textContent, evidence: c.querySelector('[data-part="evidence"]')?.textContent ?? null, actions: [...c.querySelectorAll('[data-action]')].map(a => [a.dataset.action, a.textContent.trim()]), text: c.textContent }
  }, card)
  assert.equal(shown.sentence, fmt(AGENT.suggestion.kinds['no-output'], { n: 3 }))
  assert.ok(shown.evidence.startsWith(fmt(AGENT.suggestion.evidence['no-output'], { n: 3, when: '' }).split(' · ')[0]), shown.evidence)
  assert.deepEqual(shown.actions, [['accept', AGENT.suggestion.accept], ['dismiss', AGENT.suggestion.dismiss]])
  assert.equal(AUTO.test(shown.text), false)
  const n = Number(await s.page.evaluate(() => document.querySelector('[data-waiting]').dataset.waiting))
  assert.deepEqual(suggestionLines(fashionDir).map(l => l.ev), ['suggested'], 'control: not handled yet')
  await s.page.click(`${card} [data-action="accept"] button`)
  await until(() => document.querySelector('[data-part="waiting-items"] [data-suggestion][data-kind="no-output"]')?.dataset.state === 'accepted')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="waiting-items"] [data-suggestion][data-kind="no-output"] [data-part="done"]').textContent.trim()), AGENT.suggestion.accepted, 'it stays, saying what became of it')
  assert.deepEqual(suggestionLines(fashionDir).map(l => l.ev), ['suggested', 'accepted'])
  await until(m => document.querySelector('[data-waiting]')?.dataset.waiting === String(m), n - 1)
  await until(m => document.querySelector('[data-panel-badge="decide"]')?.textContent === String(m), n - 1)
  // the main Agent's turn: the card handed over is one faint line (never the note's text), then its answer
  const last = transcript().filter(r => r.role === 'note').at(-1)
  await until(t => document.querySelector(`.chat-faint[data-row="note"][data-turn="${t}"]`) !== null, last.turn)
  assert.equal(await s.page.evaluate(t => document.querySelector(`.chat-faint[data-row="note"][data-turn="${t}"]`).textContent, last.turn), AGENT.rows.handed)
  await until(t => document.querySelector(`[data-row="agent"][data-turn="${t}"]`)?.textContent.includes('先看看它的来源'), last.turn)
})

test('the proposal card: 不要 → declineProposal (the badge follows proposals-changed); 确认 pressed twice → one call; stale; failed', async () => {
  const [seeded, ev, fashion] = ids()
  const inWaiting = id => `[data-part="waiting-items"] [data-proposal="${id}"]`
  // 不要
  const brief = await cardOf('edit_brief', seeded)
  const badge = Number(await s.page.evaluate(() => document.querySelector('[data-panel-badge="decide"]').textContent))
  await s.page.click(`${inWaiting(brief.id)} [data-action="decline"] button`)
  await until(id => document.querySelector(`[data-proposal="${id}"]`)?.dataset.status !== 'pending' || document.querySelector(`[data-part="waiting-items"] [data-proposal="${id}"]`) === null, brief.id)
  assert.equal((await cardOf('edit_brief', seeded)).status, 'declined', '不要 is declineProposal')
  assert.equal(core.readBrief(shelf.dirs[0]), SHELF.briefs[0], 'the library is as it was')
  await until(m => document.querySelector('[data-panel-badge="decide"]')?.textContent === String(m), badge - 1)
  // 确认, pressed twice before the bridge answers: one call, the buttons disabled meanwhile
  const sched = await cardOf('edit_schedule', fashion)
  await slow('confirmProposal', 1200)
  try {
    const sel = `${inWaiting(sched.id)} [data-action="confirm"] button`
    await s.page.evaluate(q => { const b = document.querySelector(q); b.click(); b.click() }, sel)
    await until(id => document.querySelector(`[data-proposal="${id}"]`)?.dataset.busy === 'true', sched.id)
    assert.deepEqual(await s.page.evaluate(id => [...document.querySelectorAll(`[data-proposal="${id}"] [data-action] button`)].map(b => b.disabled), sched.id), [true, true, true])
    await s.page.evaluate(q => document.querySelector(q)?.click(), sel)
    await new Promise(r => setTimeout(r, 1500))
    assert.equal(await callsOf('confirmProposal'), 1, 'one confirm, whatever the presses')
  } finally { await unslow('confirmProposal') }
  assert.equal((await cardOf('edit_schedule', fashion)).status, 'confirmed')
  // stale: the library changed after the card (the cap set by hand), then 确认
  const cap = await cardOf('edit_cap', seeded)
  // (建库 made the new library the current one: the cap is set on the card's library)
  await bridge('setActiveLibrary', seeded)
  await bridge('setRoundCap', 40)
  await s.page.click(`${inWaiting(cap.id)} [data-action="confirm"] button`)
  await until(id => document.querySelector(`[data-proposal="${id}"]`)?.dataset.status === 'stale', cap.id)
  assert.equal(await s.page.evaluate(id => document.querySelector(`[data-proposal="${id}"] [data-part="status"]`).textContent, cap.id), AGENT.card.states.stale)
  // failed: 电动车's streams.json cannot be written (read-only), then 确认
  const add = await cardOf('add_source', ev)
  const cfg = join(shelf.dirs[1], 'streams.json')
  const bytes = readFileSync(cfg)
  chmodSync(cfg, 0o444)
  try {
    await s.page.click(`${inWaiting(add.id)} [data-action="confirm"] button`)
    await until(id => ['failed', 'confirmed'].includes(document.querySelector(`[data-proposal="${id}"]`)?.dataset.status), add.id)
  } finally { chmodSync(cfg, 0o644) }
  const failed = await cardOf('add_source', ev)
  assert.equal(failed.status, 'failed', JSON.stringify(failed.failure ?? failed.result))
  assert.deepEqual(readFileSync(cfg), bytes, 'the library is as it was')
  assert.equal(await s.page.evaluate(id => document.querySelector(`[data-proposal="${id}"] [data-part="status"]`).textContent, add.id), fmt(AGENT.card.states.failed, { step: AGENT.card.steps[failed.failure.step] }))
  assert.notEqual(await s.page.evaluate(id => document.querySelector(`[data-proposal="${id}"] [data-part="failure"]`), add.id), null)
})

test('改一下: reviseProposal with your sentence, then the sentence goes to the main Agent; the card says 已改', async () => {
  const fashion = ids()[2]
  const card = await cardOf('edit_brief', fashion)
  const sel = `[data-part="waiting-items"] [data-proposal="${card.id}"]`
  await s.page.click(`${sel} [data-action="revise"] button`)
  await s.page.click(`${sel} [data-action="revise-send"] button`)
  assert.equal(await s.page.evaluate(q => document.querySelector(`${q} [data-part="revise"] [role="alert"]`)?.textContent, sel), AGENT.card.reviseEmpty, 'an empty sentence is refused on the page')
  assert.equal((await cardOf('edit_brief', fashion)).status, 'pending', 'control: nothing sent')
  const before = transcript().length
  await s.page.fill(`${sel} textarea[data-field="revise"]`, '只追财报，不要门店。')
  await s.page.click(`${sel} [data-action="revise-send"] button`)
  await until(t => document.querySelector(`[data-proposal="${t}"]`)?.dataset.status === 'revise' || document.querySelector(`[data-part="waiting-items"] [data-proposal="${t}"]`) === null, card.id)
  const got = await cardOf('edit_brief', fashion)
  assert.deepEqual([got.status, got.reviseText], ['revise', '只追财报，不要门店。'])
  await settled(before)
  await until(() => [...document.querySelectorAll('[data-row="agent"]')].some(e => e.textContent.includes('我按你说的重新拟')))
  assert.equal(transcript().slice(before).find(r => r.role === 'you')?.text, '只追财报，不要门店。')
})

test('no card and no suggestion carries a switch that does a kind of change by itself (DOM and both text tables)', async () => {
  const dom = await s.page.evaluate(() => {
    const parts = [...document.querySelectorAll('[data-proposal], [data-suggestion]')]
    return {
      n: parts.length,
      switches: parts.flatMap(p => [...p.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="switch"], [role="checkbox"]')]).length,
      actions: [...new Set(parts.flatMap(p => [...p.querySelectorAll('[data-action]')].map(a => a.dataset.action)))].sort(),
      text: parts.map(p => p.textContent).join('\n'),
    }
  })
  assert.ok(dom.n >= 3, `control: cards on the page (${dom.n})`)
  assert.equal(dom.switches, 0)
  assert.deepEqual(dom.actions.filter(a => !['accept', 'confirm', 'decline', 'dismiss', 'revise', 'revise-cancel', 'revise-send', 'show', 'go-chat'].includes(a)), [])
  assert.equal(AUTO.test(dom.text), false)
  const en = await import('../src/renderer/texts-en/agent.js')
  for (const table of [AGENT, en.AGENT]) assert.equal(AUTO.test(JSON.stringify(table)), false)
  assert.equal(AUTO.test('以后这类直接换'), true, 'control: the pattern finds the button the design had')
})

test('问库 · unsure: 「这是要改这个库吗？」 — 是 → resolveLibraryMessage(text, change); 不是 → (text, question)', async () => {
  const seeded = ids()[0]
  const dir = shelf.dirs[0]
  const routes = () => core.readRoutes(dir).map(r => [r.text, r.route, r.by, r.resolvedBy ?? null])
  await s.page.click(`[data-library-row="${seeded}"]`)
  await s.page.click('.st-lib-tabs [data-tab="ask"]')
  await until(() => document.querySelector('main[data-screen="ask"][data-state="ready"]') !== null)
  assert.equal(await s.page.evaluate(() => document.querySelector('textarea[data-field="question"]').placeholder), ASK.inputPlaceholder)
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="input-hint"]').textContent), ASK.inputHint)
  const ask = async text => {
    const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
    await s.page.fill('textarea[data-field="question"]', text)
    await s.page.click('main[data-screen="ask"] [data-action="send"] button')
    await until(i => { const t = document.querySelector(`[data-turn="${i}"]`); return t && t.dataset.state !== 'asking' }, n)
    return n
  }
  const i = await ask('你好')
  assert.equal(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"]`).dataset.state, i), 'unsure')
  assert.deepEqual(await s.page.evaluate(n => { const u = document.querySelector(`[data-turn="${n}"] [data-part="unsure"]`); return [u.querySelector('.st-t-strong').textContent, ...[...u.querySelectorAll('[data-action]')].map(a => a.textContent.trim())] }, i), [ASK.route.unsure, ASK.route.yes, ASK.route.no])
  assert.deepEqual(routes().at(-1), ['你好', 'unsure', 'none', null], 'control: routed unsure, nobody asked')
  const before = transcript().length
  await s.page.click(`[data-turn="${i}"] [data-action="route-change"] button`)
  await until(n => document.querySelector(`[data-turn="${n}"]`)?.dataset.state === 'done', i)
  assert.deepEqual(routes().at(-1), ['你好', 'change', 'you', 'you'], '是，改这个库 = change')
  assert.equal(transcript().slice(before).find(r => r.role === 'you')?.data?.libraryId, seeded, 'to the main Agent, with this library')
  // the main Agent's reply in the box (whatever the script's next answer is: this check also runs on its own, npm run mutants)
  assert.notEqual(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"] [data-row="agent"] .chat-text`), i), null)
  const j = await ask('随便看看')
  assert.equal(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"]`).dataset.state, j), 'unsure')
  await s.page.click(`[data-turn="${j}"] [data-action="route-question"] button`)
  await until(n => !['unsure', 'asking'].includes(document.querySelector(`[data-turn="${n}"]`)?.dataset.state), j)
  assert.deepEqual(routes().at(-1), ['随便看看', 'question', 'you', 'you'], '不是，问问题 = question')
  // a question with no connection chosen: v1.0's line and 去设置
  assert.notEqual(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"] [data-part="no-connection"] [data-action="go-settings"]`), j), null)
})

test('问库 · change (UC3): 「这句转给主 Agent」, the reply and its cards in the box; 确认 → 来源与要求 says 主 Agent 提的 · 你确认的; 和主 Agent 聊 has the turn', async () => {
  const seeded = ids()[0]
  const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
  await s.page.fill('textarea[data-field="question"]', '以后也追踪 agent 评测的公告。')
  await s.page.click('main[data-screen="ask"] [data-action="send"] button')
  await until(i => document.querySelector(`[data-turn="${i}"]`)?.dataset.state === 'done', n)
  const t = await s.page.evaluate(i => {
    const turn = document.querySelector(`[data-turn="${i}"]`)
    return { route: turn.dataset.route, tag: turn.querySelector('[data-part="routed"]')?.textContent ?? null, reply: turn.querySelector('[data-row="agent"] .chat-text')?.textContent, cards: [...turn.querySelectorAll('[data-proposal]')].map(c => [c.dataset.kind, c.dataset.status, c.querySelector('[data-part="title"]').textContent]) }
  }, n)
  assert.deepEqual([t.route, t.tag, t.reply], ['change', ASK.route.routed, '好，我拟了一个改动：'])
  assert.deepEqual(t.cards, [
    ['add_source', 'pending', fmt(AGENT.card.titles.add_source, { lib: SHELF.names[0], n: 1 })],
    ['edit_topics', 'pending', fmt(AGENT.card.titles.edit_topics, { lib: SHELF.names[0] })],
  ])
  // before / after from the core, the new source marked; its test fetch
  const add = await cardOf('add_source', seeded)
  const diff = await s.page.evaluate(id => {
    const c = document.querySelector(`[data-proposal="${id}"]`)
    return { before: [...c.querySelectorAll('[data-part="before"] [data-name]')].map(e => e.dataset.name), after: [...c.querySelectorAll('[data-part="after"] [data-name]')].map(e => [e.dataset.name, e.dataset.changed]), trial: c.querySelector('[data-part="trial"] .pc-chip')?.textContent }
  }, add.id)
  assert.deepEqual(diff.before, add.before.sources.names)
  assert.deepEqual(diff.after, add.after.sources.names.map(x => [x, String(x === 'agent-evals')]))
  assert.equal(diff.trial, '正常 · 3 条')
  const topics = await cardOf('edit_topics', seeded)
  assert.equal(await s.page.evaluate(id => [...document.querySelectorAll(`[data-proposal="${id}"] [data-part="after"] .pc-name--new`)].map(e => e.textContent).join(','), topics.id), '公告')
  // 确认 → 来源与要求's 「谁定的」
  await s.page.click(`[data-proposal="${add.id}"] [data-action="confirm"] button`)
  await until(id => document.querySelector(`[data-proposal="${id}"]`)?.dataset.status === 'confirmed', add.id)
  assert.ok(JSON.parse(readFileSync(join(shelf.dirs[0], 'streams.json'), 'utf8')).sources.some(x => x.name === 'agent-evals'))
  await s.page.click('.st-lib-tabs [data-tab="sources"]')
  await until(() => document.querySelector('[data-who="sources"]')?.dataset.by === 'agent-confirmed')
  assert.ok((await s.page.evaluate(() => document.querySelector('[data-who="sources"]').textContent)).startsWith(SHELL.who.agent.split('{')[0]))
  // 和主 Agent 聊: the turn handed over is there (from the record), with where it came from
  await s.page.click('[data-nav="chat"]')
  await until(() => document.querySelector('main[data-screen="chat"][data-state="ready"]') !== null)
  await until(() => [...document.querySelectorAll('[data-row="you"]')].some(e => e.textContent.includes('以后也追踪 agent 评测的公告。')))
  assert.ok(await s.page.evaluate(name => [...document.querySelectorAll('[data-row="you"]')].some(e => e.textContent.includes('以后也追踪 agent 评测的公告。') && e.querySelector('[data-part="from-library"]')?.textContent.includes(name)), SHELF.names[0]))
})

test('问库 · question, with a connection: the answer as v1.0 drew it', async () => {
  await bridge('setActiveConnection', 'claude-code')
  await s.page.click(`[data-library-row="${ids()[0]}"]`)
  await s.page.click('.st-lib-tabs [data-tab="ask"]')
  await until(() => document.querySelector('main[data-screen="ask"][data-state="ready"]') !== null)
  await s.page.fill('textarea[data-field="question"]', 'agent 记忆有什么进展？')
  await s.page.click('main[data-screen="ask"] [data-action="send"] button')
  await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done')
  const got = await s.page.evaluate(() => { const t = document.querySelector('[data-turn="0"]'); return [t.dataset.route, t.querySelector('[data-part="routed"]'), t.querySelector('[data-part="not-in-library"]')?.textContent.startsWith('库里没有')] })
  assert.deepEqual(got, ['question', null, true])
  assert.equal(core.readRoutes(shelf.dirs[0]).at(-1).route, 'question')
})

// redesign R1: 概览 is gone — this library's suggestion cards are in the right panel's 待确认, under 「当前库 · 系统检测」, until R5
// makes them one kind of card; this test opens that tab on the library's page. The assertions on the card are the ones of before.
test('待确认 (was 概览): this library\'s suggestion card (交给主 Agent / 不要); 不要 → dismissSuggestion; nothing else on it', async () => {
  const dir = shelf.dirs[0]
  await s.page.click('.st-lib-tabs [data-tab="inbox"]')
  await s.page.click('[data-panel-tab="decide"]')
  await until(() => document.querySelector('[data-part="suggestions"] [data-suggestion="source-failing:mcp-news"]') !== null)
  const c = await s.page.evaluate(() => {
    const e = document.querySelector('[data-part="suggestions"] [data-suggestion="source-failing:mcp-news"]')
    return { sentence: e.querySelector('[data-part="sentence"]').textContent, evidence: e.querySelector('[data-part="evidence"]').textContent, actions: [...e.querySelectorAll('[data-action]')].map(a => a.dataset.action), title: document.querySelector('#ov-suggestions').textContent }
  })
  assert.equal(c.title, AGENT.suggestion.title)
  assert.equal(c.sentence, fmt(AGENT.suggestion.kinds['source-failing'], { subject: 'mcp-news', n: 3 }))
  assert.ok(c.evidence.includes('2') && c.evidence.includes('HTTP 403'), c.evidence)
  assert.deepEqual(c.actions, ['accept', 'dismiss'])
  await s.page.click('[data-suggestion="source-failing:mcp-news"] [data-action="dismiss"] button')
  await until(() => document.querySelector('[data-suggestion="source-failing:mcp-news"]')?.dataset.state === 'dismissed')
  assert.deepEqual(suggestionLines(dir).map(l => l.ev), ['suggested', 'dismissed'])
  assert.equal((await bridge('listSuggestions', { libraryId: ids()[0] })).data.length, 0)
})

test('drawn in the page: each state of the card; the four kinds of suggestion; the input with no connection', async () => {
  const out = await s.page.evaluate(async () => {
    const { html, render } = await import('./lib/html.js')
    const { ProposalCard } = await import('./screens/proposal-card.js')
    const { SuggestionCard } = await import('./screens/suggestion-card.js')
    const { Compose } = await import('./screens/chat.js')
    const box = document.createElement('div')
    document.body.append(box)
    const base = { id: 'p-x', kind: 'edit_cap', libraryId: null, params: { cap: 9 }, why: 'w', before: { cap: 10 }, after: { cap: 9 }, createdAt: '2026-11-09T10:00:00Z', decidedAt: '2026-11-09T10:05:00Z', by: 'agent' }
    const states = {}
    for (const c of [
      { status: 'pending' }, { status: 'confirmed', result: { changed: ['cap'] } }, { status: 'declined' }, { status: 'revise', reviseText: 'x' },
      { status: 'stale', reason: 'changed' }, { status: 'stale', reason: 'library-gone' },
      { status: 'failed', failure: { step: 'cap', done: [], rolledBack: true } }, { status: 'failed', failure: { step: 'op:2', done: [], rolledBack: false } },
    ]) {
      render(html`<${ProposalCard} card=${{ ...base, ...c }} />`, box)
      await new Promise(r => setTimeout(r, 0))
      const e = box.querySelector('[data-proposal]')
      states[`${c.status}${c.reason ? `:${c.reason}` : ''}${c.failure ? `:${c.failure.step}` : ''}`] = { status: e.querySelector('[data-part="status"]')?.textContent ?? null, actions: [...e.querySelectorAll('[data-action]')].map(a => a.dataset.action), failure: e.querySelector('[data-part="failure"]')?.textContent ?? null }
      render(null, box)
    }
    const kinds = {}
    for (const item of [
      { libraryId: 'a', key: 'k1', kind: 'source-failing', subject: 's1', evidence: { rounds: 4, failed: 4, blocked: 0, last: { ts: '2026-11-09T10:00:00Z', status: 'failed' } } },
      { libraryId: 'a', key: 'k2', kind: 'no-output', subject: 'library', evidence: { rounds: 5, since: '2026-11-08T10:00:00Z' } },
      { libraryId: 'a', key: 'k3', kind: 'ai-instruction', subject: 's2', evidence: { count: 2, phrases: ['ignore previous instructions'] } },
      { libraryId: 'a', key: 'k4', kind: 'topic-overlap', subject: 'b', otherLibraryId: 'b', evidence: { jaccard: 0.667, shared: ['电池', '充电'] } },
    ]) {
      render(html`<${SuggestionCard} item=${item} />`, box)
      await new Promise(r => setTimeout(r, 0))
      kinds[item.kind] = [box.querySelector('[data-part="sentence"]').textContent, box.querySelector('[data-part="evidence"]')?.textContent ?? null]
      render(null, box)
    }
    render(html`<${Compose} text="x" onText=${() => {}} onSend=${() => {}} busy=${false} noConnection=${true} onSettings=${() => {}} />`, box)
    await new Promise(r => setTimeout(r, 0))
    const compose = { line: box.querySelector('[data-part="no-connection"] .st-t-wait')?.textContent ?? null, go: box.querySelector('[data-part="no-connection"] [data-action="go-settings"]') !== null }
    render(null, box)
    box.remove()
    return { states, kinds, compose }
  })
  const S = AGENT.card.states
  assert.deepEqual(out.states.pending, { status: null, actions: ['confirm', 'revise', 'decline'], failure: null })
  assert.ok(out.states.confirmed.status.startsWith(S.confirmed.split('{')[0]))
  assert.deepEqual(out.states.confirmed.actions, ['show'], 'decided: no button that changes anything')
  assert.equal(out.states.declined.status, S.declined)
  assert.equal(out.states.revise.status, S.revise)
  assert.equal(out.states['stale:changed'].status, S.stale)
  assert.equal(out.states['stale:library-gone'].status, S.staleGone)
  assert.equal(out.states['failed:cap'].status, fmt(S.failed, { step: AGENT.card.steps.cap }))
  assert.equal(out.states['failed:cap'].failure, AGENT.card.rolledBack)
  assert.equal(out.states['failed:op:2'].status, fmt(S.failed, { step: fmt(AGENT.card.steps.op, { n: 2 }) }))
  assert.equal(out.states['failed:op:2'].failure, AGENT.card.notRolledBack)
  for (const k of ['declined', 'revise', 'stale:changed', 'failed:cap']) assert.deepEqual(out.states[k].actions, ['show'], k)
  const K = AGENT.suggestion.kinds
  assert.equal(out.kinds['source-failing'][0], fmt(K['source-failing'], { subject: 's1', n: 4 }))
  assert.equal(out.kinds['no-output'][0], fmt(K['no-output'], { n: 5 }))
  assert.equal(out.kinds['ai-instruction'][0], fmt(K['ai-instruction'], { subject: 's2' }))
  assert.equal(out.kinds['ai-instruction'][1], fmt(AGENT.suggestion.evidence['ai-instruction'], { n: 2, phrase: 'ignore previous instructions' }))
  assert.equal(out.kinds['topic-overlap'][0], fmt(K['topic-overlap'], { other: AGENT.rows.unknownLibrary }))
  assert.equal(out.kinds['topic-overlap'][1], fmt(AGENT.suggestion.evidence['topic-overlap'], { pct: 67, shared: '电池 · 充电' }))
  assert.deepEqual(out.compose, { line: NO_CONNECTION.text, go: true })
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
