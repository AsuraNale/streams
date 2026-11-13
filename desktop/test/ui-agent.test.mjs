// redesign R5b (docs/checks/2026-11-12-r5b/contract.md): 「等你定的事」 and the suggestion card are gone — the cards waiting and the 系统检测 are the
// right panel's 待确认 (one list of every library), the card is the one 提议 (screens/proposal.js), the conversation the template's; the
// tests that read them were changed where they read (each says how, beside it) — what each checks is as it was, but where the
// 动作表 (维护者 11-11) renamed a button or 创建 now opens the new library's 待看.
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
import { createHash } from 'node:crypto'
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
import { ADVANCED } from '../src/renderer/texts/sources.js'
import { PROPOSALS } from '../src/renderer/texts/proposals.js'
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
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')

// redesign R5b (F15, O5; contract R5b-2 / R5b-3): 「等你定的事」 above the conversation is gone — what waits is the right panel's
// 待确认 (the bridge's listToConfirm: every library's), the page's head says how many (「n 项待确认」), the tab the same number.
// This test checked the same things there: the five cards and the two 系统检测 of two libraries, one number in three places (was:
// the list on top of the page, foldable — the fold went with it).
test('待确认 (was 等你定的事): the cards waiting + the 系统检测 (every library) in the right panel, the same number as the tab and the page\'s head', async () => {
  const pending = await cards({ status: 'pending' })
  assert.equal(pending.length, 5, 'control: the development hook made five cards')
  const open = (await bridge('listSuggestions', null)).data
  assert.deepEqual(open.map(x => x.kind).sort(), ['no-output', 'source-failing'])
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab === 'decide')
  await until(() => document.querySelector('[data-part="to-confirm-chip"]')?.dataset.count === '7' && document.querySelector('[data-panel-badge="decide"]')?.textContent === '7')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="waiting"]')), null, 'no 「等你定的事」 any more')
  const shown = await s.page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-pane="decide"] [data-proposal-id]')].map(e => e.dataset.proposalId),
    suggestions: [...document.querySelectorAll('[data-pane="decide"] [data-suggestion]')].map(e => [e.dataset.kind, e.querySelector('[data-part="from"]').textContent]),
  }))
  assert.deepEqual(shown.cards.sort(), pending.map(c => c.id).sort())
  assert.deepEqual(shown.suggestions.map(x => x[0]).sort(), ['no-output', 'source-failing'])
  assert.ok(shown.suggestions.some(([k, from]) => k === 'no-output' && from === fmt(PROPOSALS.card.eyebrow, { from: PROPOSALS.from.system, library: SHELF.names[2] })), JSON.stringify(shown.suggestions))
})
// redesign R5b: the conversation is the template's (user-message, assistant-message with its speaker): the faint lines are
// [data-faint] (were .chat-faint), the main Agent's mark is the speaker's (was the round 「主」); what is checked is as it was.
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
  const faint = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="conversation"] [data-faint]')].map(e => [e.dataset.row, e.dataset.turn, e.textContent]))
  assert.deepEqual(faint, [
    ['summary', '5', AGENT.rows.summary],
    ['lookup', '6', fmt(AGENT.rows.lookup.library, { name: SHELF.names[1] })],
    ['note', '7', AGENT.rows.note],
  ])
  const text = await s.page.evaluate(() => document.querySelector('[data-part="conversation"]').textContent)
  for (const raw of ['RAW-LOOKUP-TEXT', 'RAW-NOTE-TEXT', 'RAW-SUMMARY-TEXT']) assert.equal(text.includes(raw), false, raw)
  assert.ok(text.includes('以前的第 1 句') && text.includes('以前的第 55 个回答'), 'control: the words themselves are shown')
  // your words as the template's user-message, the main Agent's as its assistant-message with the speaker
  assert.deepEqual(await s.page.evaluate(() => {
    const you = document.querySelector('[data-row="you"][data-turn="1"]')
    const bot = document.querySelector('[data-row="agent"][data-turn="1"]')
    return [you.classList.contains('user-message'), bot.classList.contains('assistant-message'), bot.querySelector('.speaker')?.textContent.replace(/\s+/g, ' ').trim()]
  }), [true, true, `${AGENT.name} ${AGENT.role}`])
})
// redesign R5b (R5b-1, R5b-2): the card is the one 提议 (screens/proposal.js) — its line 「主 Agent 提议 · 确认后生效」 (was 「提议卡 ·
// 你确认后才生效」), its points (追踪要求 · 严格程度 as the level's name and one sentence — 0.7 / 0.6 is 自定义 — · 主题与来源 · 定时与上限;
// it has no 为什么 any more), its buttons 拒绝 · 提出修改 · 创建 (the main one on the right); 创建 takes the page to the new
// library's 待看 (02 第 39 行), so the card's state is read from the bridge there, and the test goes back to 主 Agent at its end.
test('UC1: a sentence → one question with quick answers; a quick answer is sent as your words → the new library\'s card; 创建 → the sidebar has it, its 待看 opens', async () => {
  await say('帮我建个库，追踪新能源电池。')
  const ask = await s.page.evaluate(() => {
    const a = document.querySelector('[data-part="ask"][data-open="true"]')
    return a ? { q: a.querySelector('[data-part="question"]').textContent, options: [...a.querySelectorAll('[data-action="quick"]')].map(b => b.dataset.option) } : null
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
      head: c.querySelector('[data-part="from"]').textContent, title: c.querySelector('[data-part="title"]').textContent,
      brief: c.querySelector('[data-part="brief"]').textContent, keywords: [...c.querySelectorAll('[data-part="topics"] [data-keyword]')].map(k => k.dataset.keyword),
      trials: [...c.querySelectorAll('[data-trial]')].map(t => [t.dataset.trial, t.dataset.state, t.dataset.include, t.querySelector('[data-part="trial-chip"]').textContent, t.querySelector('[data-part="unticked"]')?.textContent ?? null]),
      thresholds: c.querySelector('[data-part="thresholds"]').textContent, schedule: c.querySelector('[data-part="schedule"]').textContent, folder: c.querySelector('[data-part="folder"]').textContent,
      actions: [...c.querySelectorAll('[data-action]')].map(a => [a.dataset.action, a.textContent.trim()]),
    }
  }, card.id)
  assert.equal(shown.head, PROPOSALS.card.sub)
  assert.equal(shown.title, fmt(PROPOSALS.card.titles.create_library, { name: NEW_LIBRARY }))
  assert.equal(shown.brief, card.after.brief)
  assert.deepEqual(shown.keywords, ['装机量', '固态电池'])
  // the core's test fetches: the refused one is not ticked and says so
  assert.deepEqual(card.trial.map(t => [t.name, t.status, t.include, t.count]), [['battery-weekly', 'ok', true, 4], ['battery-forum', 'blocked', false, 0]], 'control: what the core found')
  // redesign R5a (O9): a card's trials reach the page without the HTTP code (public-data.mjs publicCard), so the refused one
  // reads as its state and its count — this line used to expect 「被拒绝 · HTTP 403」
  assert.deepEqual(shown.trials, [['battery-weekly', 'ok', 'true', '正常 · 4 条', null], ['battery-forum', 'blocked', 'false', '被拒绝 · 0 条', PROPOSALS.card.unticked]])
  // redesign R5b (precheck fix 1): 自定义 says where the pair stands (no one edited a proposal by hand) — this line used to expect
  // 「自定义（通过阈值已在「高级设置」中手动修改）」
  const C = PROPOSALS.card
  assert.equal(shown.thresholds, fmt(C.customLevel, { where: fmt(C.customWhere.between, { lo: C.levelNames.standard, hi: C.levelNames.strict }) }), '0.7 / 0.6 is none of the three levels; no number on the card')
  assert.equal(shown.schedule, fmt(PROPOSALS.card.scheduleOn, { time: '08:30' }))
  assert.equal(shown.folder, fmt(PROPOSALS.card.folder, { path: card.after.folder }))
  assert.deepEqual(shown.actions, [['decline', PROPOSALS.actions.decline], ['revise', PROPOSALS.actions.revise], ['confirm', PROPOSALS.actions.create]], 'three buttons, nothing that does it by itself later')
  // 创建
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-library-row]').length), 3, 'control: three libraries before')
  await s.page.click(`[data-part="conversation"] [data-proposal="${card.id}"] [data-action="confirm"] button`)
  await until(() => document.querySelectorAll('[data-library-row]').length === 4)
  const done = await cardOf('create_library', null)
  assert.equal(done.status, 'confirmed')
  assert.ok(await s.page.evaluate(n => [...document.querySelectorAll('.st-sidebar__lib-name')].some(e => e.textContent === n), NEW_LIBRARY))
  await until(id => document.querySelector(`.lib-page[data-library="${id}"] main[data-screen="inbox"]`) !== null, done.result.libraryId)
  await s.page.click('[data-nav="chat"]')
  await until(() => document.querySelector('main[data-screen="chat"][data-state="ready"]') !== null)
  const status = await s.page.evaluate(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"] [data-part="status"]`)?.textContent, card.id)
  assert.ok(status.startsWith(PROPOSALS.states.confirmed.split('{')[0]), status)
})
// redesign R5b: a faint line is [data-faint] (was .chat-faint); the notices' words are the page's new ones (texts/agent.js)
test('a lookup is one faint line; the four notices each have their words; the connection\'s problem offers 设置', async () => {
  await say('电动车那个库现在怎么样？')
  const turn = transcript().filter(r => r.role === 'lookup').at(-1).turn
  assert.equal(await s.page.evaluate(t => document.querySelector(`[data-faint][data-row="lookup"][data-turn="${t}"]`)?.textContent, turn), fmt(AGENT.rows.lookup.library, { name: SHELF.names[1] }))
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

// redesign R5b (R5b-1, 维护者 11-11 动作表): the 系统检测 is a small card of the right panel's 待确认 (was 「等你定的事」 on this page),
// its buttons the 动作表's — 忽略 · 交由主 Agent 分析 · 将严格程度调整为「标准」 (was 交给主 Agent · 不要); 交由主 Agent 分析 is
// actOnSuggestion(…, 'forward') (was acceptSuggestion): recorded, one turn of the main Agent, the card leaves the list.
test('a 系统检测 in 待确认: 交由主 Agent 分析 → recorded, one turn of the main Agent; the card leaves the list and the count follows', async () => {
  const fashionDir = shelf.dirs[2]
  const card = '[data-pane="decide"] [data-suggestion][data-kind="no-output"]'
  await until(q => document.querySelector(q) !== null, card)
  const shown = await s.page.evaluate(sel => {
    const c = document.querySelector(sel)
    return { sentence: c.querySelector('[data-part="sentence"]').textContent, evidence: c.querySelector('[data-part="evidence"]')?.textContent ?? null, actions: [...c.querySelectorAll('[data-action]')].map(a => [a.dataset.action, a.textContent.trim()]), text: c.textContent }
  }, card)
  assert.equal(shown.sentence, fmt(PROPOSALS.kinds['no-output'], { n: 3 }))
  assert.ok(shown.evidence.startsWith(PROPOSALS.evidence['no-output'].split('{')[0]), shown.evidence)
  assert.deepEqual(shown.actions, [['dismiss', PROPOSALS.actions.dismiss], ['forward', PROPOSALS.actions.forward], ['set-strictness', fmt(PROPOSALS.actions.setStrictness, { level: PROPOSALS.card.levelNames.standard })]])
  assert.equal(AUTO.test(shown.text), false)
  const n = Number(await s.page.evaluate(() => document.querySelector('[data-part="to-confirm-chip"]').dataset.count))
  assert.deepEqual(suggestionLines(fashionDir).map(l => l.ev), ['suggested'], 'control: not handled yet')
  await s.page.click(`${card} [data-action="forward"] button`)
  await until(q => document.querySelector(q) === null, card)
  assert.deepEqual(suggestionLines(fashionDir).map(l => l.ev), ['suggested', 'accepted'])
  await until(m => document.querySelector('[data-part="to-confirm-chip"]')?.dataset.count === String(m), n - 1)
  await until(m => document.querySelector('[data-panel-badge="decide"]')?.textContent === String(m), n - 1)
  // the main Agent's turn: the card handed over is one faint line (never the note's text), then its answer
  const last = transcript().filter(r => r.role === 'note').at(-1)
  await until(t => document.querySelector(`[data-faint][data-row="note"][data-turn="${t}"]`) !== null, last.turn)
  assert.equal(await s.page.evaluate(t => document.querySelector(`[data-faint][data-row="note"][data-turn="${t}"]`).textContent, last.turn), AGENT.rows.handed)
  await until(t => document.querySelector(`[data-row="agent"][data-turn="${t}"]`)?.textContent.includes('先看看它的来源'), last.turn)
})
// redesign R5b (R5b-1, R5b-3): the cards waiting that no conversation shows (the development hook's) are the right panel's small
// cards now (were in 「等你定的事」), with the same three buttons and the same bridge calls; a card answered leaves the list, so
// what became of it is read from the bridge, and a stale or failed one is said on top of the list ([data-part="decide-said"]).
test('the proposal card in 待确认: 拒绝 → declineProposal (the badge follows proposals-changed); 确认 pressed twice → one call; stale; failed', async () => {
  const [seeded, ev, fashion] = ids()
  const inList = id => `[data-pane="decide"] [data-proposal-id="${id}"]`
  // 拒绝
  const brief = await cardOf('edit_brief', seeded)
  await until(q => document.querySelector(q) !== null, inList(brief.id))
  const badge = Number(await s.page.evaluate(() => document.querySelector('[data-panel-badge="decide"]').textContent))
  await s.page.click(`${inList(brief.id)} [data-action="decline"] button`)
  await until(q => document.querySelector(q) === null, inList(brief.id))
  assert.equal((await cardOf('edit_brief', seeded)).status, 'declined', '拒绝 is declineProposal')
  assert.equal(core.readBrief(shelf.dirs[0]), SHELF.briefs[0], 'the library is as it was')
  await until(m => document.querySelector('[data-panel-badge="decide"]')?.textContent === String(m), badge - 1)
  // 确认, pressed twice before the bridge answers: one call, the buttons disabled meanwhile
  const sched = await cardOf('edit_schedule', fashion)
  await slow('confirmProposal', 1200)
  try {
    const sel = `${inList(sched.id)} [data-action="confirm"] button`
    await s.page.evaluate(q => { const b = document.querySelector(q); b.click(); b.click() }, sel)
    await until(q => document.querySelector(`${q} .confirm-footer`)?.dataset.busy === 'true', inList(sched.id))
    assert.deepEqual(await s.page.evaluate(q => [...document.querySelectorAll(`${q} [data-action] button`)].map(b => b.disabled), inList(sched.id)), [true, true, true])
    await s.page.evaluate(q => document.querySelector(q)?.click(), sel)
    await new Promise(r => setTimeout(r, 1500))
    assert.equal(await callsOf('confirmProposal'), 1, 'one confirm, whatever the presses')
  } finally { await unslow('confirmProposal') }
  assert.equal((await cardOf('edit_schedule', fashion)).status, 'confirmed')
  // stale: the library changed after the card (the cap set by hand), then 确认
  const cap = await cardOf('edit_cap', seeded)
  // (创建 made the new library the current one: the cap is set on the card's library)
  await bridge('setActiveLibrary', seeded)
  await bridge('setRoundCap', 40)
  await s.page.click(`${inList(cap.id)} [data-action="confirm"] button`)
  await until(q => document.querySelector(q) === null, inList(cap.id))
  assert.equal((await cardOf('edit_cap', seeded)).status, 'stale')
  await until(t => document.querySelector('[data-part="decide-said"]')?.textContent.includes(t), PROPOSALS.states.stale)
  // failed: 电动车's streams.json cannot be written (read-only), then 确认
  const add = await cardOf('add_source', ev)
  const cfg = join(shelf.dirs[1], 'streams.json')
  const bytes = readFileSync(cfg)
  chmodSync(cfg, 0o444)
  try {
    await s.page.click(`${inList(add.id)} [data-action="confirm"] button`)
    await until(q => document.querySelector(q) === null, inList(add.id))
  } finally { chmodSync(cfg, 0o644) }
  const failed = await cardOf('add_source', ev)
  assert.equal(failed.status, 'failed', JSON.stringify(failed.failure ?? failed.result))
  assert.deepEqual(readFileSync(cfg), bytes, 'the library is as it was')
  const said = await s.page.evaluate(() => document.querySelector('[data-part="decide-said"]').textContent)
  // not all undone (failure.rolledBack false): the advice does not say 已撤回
  assert.ok(said.includes(PROPOSALS.states.failed) && said.includes(failed.failure.rolledBack ? PROPOSALS.advice[failed.failure.advice] : PROPOSALS.advice.failureNotRolledBack), said)
})
// redesign R5b (R5b-1): 提出修改 (was 改一下) opens its line on the small card of 待确认 itself; the empty sentence's words are
// the new ones (texts/proposals.js PROPOSALS.card.reviseEmpty); what is checked is as it was.
test('提出修改: reviseProposal with your sentence, then the sentence goes to the main Agent; the card says 已提出修改', async () => {
  const fashion = ids()[2]
  const card = await cardOf('edit_brief', fashion)
  const sel = `[data-pane="decide"] [data-proposal-id="${card.id}"]`
  await s.page.click(`${sel} [data-action="revise"] button`)
  await s.page.click(`${sel} [data-action="revise-send"] button`)
  assert.equal(await s.page.evaluate(q => document.querySelector(`${q} [data-part="revise"] [role="alert"]`)?.textContent, sel), PROPOSALS.card.reviseEmpty, 'an empty sentence is refused on the page')
  assert.equal((await cardOf('edit_brief', fashion)).status, 'pending', 'control: nothing sent')
  const before = transcript().length
  await s.page.fill(`${sel} textarea[data-field="revise"]`, '只追财报，不要门店。')
  await s.page.click(`${sel} [data-action="revise-send"] button`)
  await until(q => document.querySelector(q) === null, sel)
  const got = await cardOf('edit_brief', fashion)
  assert.deepEqual([got.status, got.reviseText], ['revise', '只追财报，不要门店。'])
  await settled(before)
  await until(() => [...document.querySelectorAll('[data-row="agent"]')].some(e => e.textContent.includes('我按你说的重新拟')))
  assert.equal(transcript().slice(before).find(r => r.role === 'you')?.text, '只追财报，不要门店。')
})
// redesign R5b: the cards are the one 提议's ([data-proposal] in the conversation, [data-decide] in 待确认) and their buttons the
// 动作表's; the text tables are texts/agent.js and texts/proposals.js (the card's words moved there).
test('no card and no 系统检测 carries a switch that does a kind of change by itself (DOM and both text tables)', async () => {
  const dom = await s.page.evaluate(() => {
    const parts = [...document.querySelectorAll('[data-proposal], [data-decide]')]
    return {
      n: parts.length,
      switches: parts.flatMap(p => [...p.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="switch"], [role="checkbox"]')]).length,
      actions: [...new Set(parts.flatMap(p => [...p.querySelectorAll('[data-action]')].map(a => a.dataset.action)))].sort(),
      text: parts.map(p => p.textContent).join('\n'),
    }
  })
  // (redesign R5b: a decided card is one line and a handled one leaves 待确认 — by now the page has fewer than the three of before)
  assert.ok(dom.n >= 2, `control: cards on the page (${dom.n})`)
  assert.equal(dom.switches, 0)
  assert.deepEqual(dom.actions.filter(a => !['confirm', 'decline', 'revise', 'revise-cancel', 'revise-send', 'dismiss', 'forward', 'pause-source', 'edit-address', 'set-strictness', 'draft-proposal'].includes(a)), [])
  assert.equal(AUTO.test(dom.text), false)
  const en = await import('../src/renderer/texts-en/agent.js')
  const enP = await import('../src/renderer/texts-en/proposals.js')
  for (const table of [AGENT, en.AGENT, PROPOSALS, enP.PROPOSALS]) assert.equal(AUTO.test(JSON.stringify(table)), false)
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
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="input-hint"]').textContent), fmt(ASK.inputHint, { n: '2–5' }))
  const ask = async text => {
    const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
    await s.page.fill('textarea[data-field="question"]', text)
    await s.page.click('main[data-screen="ask"] [data-action="send"] button')
    await until(i => { const t = document.querySelector(`[data-turn="${i}"]`); return t && t.dataset.state !== 'asking' }, n)
    return n
  }
  const i = await ask('你好')
  assert.equal(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"]`).dataset.state, i), 'unsure')
  assert.deepEqual(await s.page.evaluate(n => { const u = document.querySelector(`[data-turn="${n}"] [data-part="unsure"]`); return [u.querySelector('b').textContent, ...[...u.querySelectorAll('[data-action]')].map(a => a.textContent.trim())] }, i), [ASK.route.unsure, ASK.route.yes, ASK.route.no])
  assert.deepEqual(routes().at(-1), ['你好', 'unsure', 'none', null], 'control: routed unsure, nobody asked')
  const before = transcript().length
  await s.page.click(`[data-turn="${i}"] [data-action="route-change"] button`)
  await until(n => document.querySelector(`[data-turn="${n}"]`)?.dataset.state === 'done', i)
  assert.deepEqual(routes().at(-1), ['你好', 'change', 'you', 'you'], '是，改这个库 = change')
  assert.equal(transcript().slice(before).find(r => r.role === 'you')?.data?.libraryId, seeded, 'to the main Agent, with this library')
  // the main Agent's reply in the box (whatever the script's next answer is: this check also runs on its own, npm run mutants)
  assert.notEqual(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"] [data-part="agent-reply"] [data-part="reply"]`), i), null)
  const j = await ask('随便看看')
  assert.equal(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"]`).dataset.state, j), 'unsure')
  await s.page.click(`[data-turn="${j}"] [data-action="route-question"] button`)
  await until(n => !['unsure', 'asking'].includes(document.querySelector(`[data-turn="${n}"]`)?.dataset.state), j)
  assert.deepEqual(routes().at(-1), ['随便看看', 'question', 'you', 'you'], '不是，问问题 = question')
  // a question with no connection chosen: v1.0's line and 去设置
  assert.notEqual(await s.page.evaluate(n => document.querySelector(`[data-turn="${n}"] [data-part="no-connection"] [data-action="go-settings"]`), j), null)
})

// redesign R5b (R5b-1): the cards in 问库 are the one 提议's full card — their titles 动作 + 对象 (添加来源：agent-evals · 修改主题; were
// 改「库」：加 1 个来源 · 改主题), the trial's chip [data-part="trial-chip"] (was .pc-chip), what is new marked [data-changed="true"]
// (was .pc-name--new); what is checked is as it was.
test('问库 · change (UC3): 「这句转给主 Agent」, the reply and its cards in the box; 确认 → 来源与要求 says 主 Agent 提的 · 你确认的; 和主 Agent 聊 has the turn', async () => {
  const seeded = ids()[0]
  const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
  await s.page.fill('textarea[data-field="question"]', '以后也追踪 agent 评测的公告。')
  await s.page.click('main[data-screen="ask"] [data-action="send"] button')
  await until(i => document.querySelector(`[data-turn="${i}"]`)?.dataset.state === 'done', n)
  const t = await s.page.evaluate(i => {
    const turn = document.querySelector(`[data-turn="${i}"]`)
    return { route: turn.dataset.route, tag: turn.querySelector('[data-part="routed"]')?.textContent ?? null, reply: turn.querySelector('[data-part="agent-reply"] [data-part="reply"]')?.textContent, cards: [...turn.querySelectorAll('[data-proposal]')].map(c => [c.dataset.kind, c.dataset.status, c.querySelector('[data-part="title"]').textContent]) }
  }, n)
  assert.deepEqual([t.route, t.tag, t.reply], ['change', ASK.route.routed, '好，我拟了一个改动：'])
  assert.deepEqual(t.cards, [
    ['add_source', 'pending', fmt(PROPOSALS.card.titles.add_source, { name: 'agent-evals' })],
    ['edit_topics', 'pending', PROPOSALS.card.titles.edit_topics],
  ])
  // before / after from the core, the new source marked; its test fetch
  const add = await cardOf('add_source', seeded)
  const diff = await s.page.evaluate(id => {
    const c = document.querySelector(`[data-proposal="${id}"]`)
    return { before: [...c.querySelectorAll('[data-part="before"] [data-name]')].map(e => e.dataset.name), after: [...c.querySelectorAll('[data-part="after"] [data-name]')].map(e => [e.dataset.name, e.dataset.changed]), trial: c.querySelector('[data-part="trial"] [data-part="trial-chip"]')?.textContent }
  }, add.id)
  assert.deepEqual(diff.before, add.before.sources.names)
  assert.deepEqual(diff.after, add.after.sources.names.map(x => [x, String(x === 'agent-evals')]))
  assert.equal(diff.trial, '正常 · 3 条')
  const topics = await cardOf('edit_topics', seeded)
  assert.equal(await s.page.evaluate(id => [...document.querySelectorAll(`[data-proposal="${id}"] [data-part="after"] [data-changed="true"]`)].map(e => e.textContent).join(','), topics.id), '公告')
  // 确认 → 来源与要求's 「谁定的」
  await s.page.click(`[data-proposal="${add.id}"] [data-action="confirm"] button`)
  await until(id => document.querySelector(`[data-proposal="${id}"]`)?.dataset.status === 'confirmed', add.id)
  assert.ok(JSON.parse(readFileSync(join(shelf.dirs[0], 'streams.json'), 'utf8')).sources.some(x => x.name === 'agent-evals'))
  // redesign R4b: 「谁定的」 beside each part is gone; who changed the sources is 来源与要求 → 高级设置's 变更记录 (主 Agent 提议 · 已确认)
  await s.page.click('.st-lib-tabs [data-tab="sources"]')
  await until(() => document.querySelector('main[data-screen="sources"][data-state="ready"] [data-action="go-advanced"]') !== null)
  await s.page.click('[data-action="go-advanced"]')
  await until(() => document.querySelector('[data-change-row][data-field="sources"]')?.dataset.by === 'agent-confirmed')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-change-row][data-field="sources"] [data-part="by"]').textContent), ADVANCED.log.bys['agent-confirmed'])
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
  // redesign R3: 问库's conversation stays while you are elsewhere in the app (per library, in memory): the new turn is the last
  // one, not turn 0 (the turns of the tests above are still there)
  const n = await s.page.evaluate(() => document.querySelectorAll('[data-turn]').length)
  await s.page.fill('textarea[data-field="question"]', 'agent 记忆有什么进展？')
  await s.page.click('main[data-screen="ask"] [data-action="send"] button')
  await until(i => document.querySelector(`[data-turn="${i}"]`)?.dataset.state === 'done', n)
  const got = await s.page.evaluate(i => { const t = document.querySelector(`[data-turn="${i}"]`); return [t.dataset.route, t.querySelector('[data-part="routed"]'), t.querySelector('[data-part="not-in-library"]')?.textContent.startsWith('库里没有')] }, n)
  assert.deepEqual(got, ['question', null, true])
  assert.equal(core.readRoutes(shelf.dirs[0]).at(-1).route, 'question')
})

// redesign R1: 概览 is gone — this library's suggestion cards were in the right panel's 待确认 under 「当前库 · 系统检测」.
// Redesign R5b (R5b-1, R5b-3, 维护者 11-11 动作表): that second list is gone (a card shows once, in the one list of every library);
// the card is the one 提议's small card, its buttons the 动作表's — 忽略 · 交由主 Agent 分析 · 修改地址 · 暂停该来源 (were 交给主
// Agent · 不要); a card handled leaves the list (was: it stayed, saying so). 忽略 is dismissSuggestion's record, as it was.
test('待确认: this library\'s 系统检测 (忽略 · 交由主 Agent 分析 · 修改地址 · 暂停该来源); 忽略 → recorded, nothing else changed', async () => {
  const dir = shelf.dirs[0]
  await s.page.click('.st-lib-tabs [data-tab="inbox"]')
  await s.page.click('[data-panel-tab="decide"]')
  const sel = `[data-pane="decide"] [data-suggestion="source-failing:mcp-news"][data-library="${ids()[0]}"]`
  await until(q => document.querySelector(q) !== null, sel)
  const c = await s.page.evaluate(q => {
    const e = document.querySelector(q)
    return { sentence: e.querySelector('[data-part="sentence"]').textContent, evidence: e.querySelector('[data-part="evidence"]').textContent, actions: [...e.querySelectorAll('[data-action]')].map(a => a.dataset.action), twice: document.querySelectorAll('[data-suggestion="source-failing:mcp-news"]').length }
  }, sel)
  assert.equal(c.sentence, fmt(PROPOSALS.kinds['source-failing'], { subject: 'mcp-news', n: 3 }))
  // redesign R5a (O9): a 系统检测's evidence reaches the page without the fetcher's message or the HTTP code (core
  // suggestionFacts) — this line used to expect HTTP 403 in it
  assert.ok(c.evidence.includes('2') && !c.evidence.includes('403'), c.evidence)
  assert.deepEqual(c.actions, ['dismiss', 'forward', 'edit-address', 'pause-source'])
  assert.equal(c.twice, 1, 'once in the window')
  const cfg = sha(join(dir, 'streams.json'))
  await s.page.click(`${sel} [data-action="dismiss"] button`)
  await until(q => document.querySelector(q) === null, sel)
  assert.deepEqual(suggestionLines(dir).map(l => l.ev), ['suggested', 'dismissed'])
  assert.equal((await bridge('listSuggestions', { libraryId: ids()[0] })).data.length, 0)
  assert.equal(sha(join(dir, 'streams.json')), cfg, '忽略 changes nothing of the library')
})
// redesign R5b: the card is the one 提议 (screens/proposal.js): each state is one line with its words (texts/proposals.js
// PROPOSALS.states; was AGENT.card.states and a 「看卡上写的」 button), the four kinds of 系统检测 are its small card (was the
// suggestion card, AGENT.suggestion), the box's no-connection line a progress-alert. test/ui-r5b.test.mjs draws all ten kinds and ①–⑤.
test('drawn in the page: each state of the card; the four kinds of 系统检测; the input with no connection', async () => {
  const out = await s.page.evaluate(async () => {
    const { html, render } = await import('./lib/html.js')
    const { Proposal, agentItem } = await import('./screens/proposal.js')
    const { Compose } = await import('./screens/chat.js')
    const box = document.createElement('div')
    document.body.append(box)
    const base = { id: 'p-x', kind: 'edit_cap', libraryId: null, params: { cap: 9 }, why: 'w', before: { cap: 10 }, after: { cap: 9 }, createdAt: '2026-11-09T10:00:00Z', decidedAt: '2026-11-09T10:05:00Z', by: 'agent' }
    const states = {}
    for (const c of [
      { status: 'pending' }, { status: 'confirmed', result: { changed: ['cap'] } }, { status: 'declined' }, { status: 'revise', reviseText: 'x' },
      { status: 'stale', reason: 'changed' }, { status: 'stale', reason: 'library-gone' },
      { status: 'failed', failure: { step: 'cap', done: [], rolledBack: true, category: 'error', advice: 'failureError' } }, { status: 'failed', failure: { step: 'op:2', done: [], rolledBack: false, category: 'error', advice: 'failureError' } },
    ]) {
      render(html`<${Proposal} item=${agentItem({ ...base, ...c })} size="full" />`, box)
      await new Promise(r => setTimeout(r, 0))
      const e = box.querySelector('[data-proposal]')
      states[`${c.status}${c.reason ? `:${c.reason}` : ''}${c.failure ? `:${c.failure.step}` : ''}`] = { status: e.querySelector('[data-part="status"]')?.textContent ?? null, actions: [...e.querySelectorAll('[data-action]')].map(a => a.dataset.action), failure: e.querySelector('[data-part="failure"]')?.textContent ?? null }
      render(null, box)
    }
    const kinds = {}
    const item = (kind, subject, evidence, extra = {}) => ({ id: `system:a:${kind}`, from: 'system', libraryId: 'a', libraryName: '甲', key: `${kind}:${subject}`, kind, subject, evidence, actions: [{ id: 'forward', label: 'actions.forward', primary: true, callsModel: true }, { id: 'dismiss', label: 'actions.dismiss', primary: false, callsModel: false }], ...extra })
    for (const i of [
      item('source-failing', 's1', { rounds: 4, state: 'failing', failed: 4, blocked: 0, last: { ts: '2026-11-09T10:00:00Z', status: 'failed', hint: 'retry-next-round' } }),
      item('no-output', 'library', { rounds: 5, since: '2026-11-08T10:00:00Z' }),
      item('ai-instruction', 's2', { count: 2, phrases: ['ignore previous instructions'] }),
      item('topic-overlap', 'b', { jaccard: 0.667, percent: 67, shared: ['电池', '充电'] }, { otherLibraryId: 'b', otherLibraryName: null }),
    ]) {
      render(html`<${Proposal} item=${i} size="compact" />`, box)
      await new Promise(r => setTimeout(r, 0))
      kinds[i.kind] = [box.querySelector('[data-part="sentence"]').textContent, box.querySelector('[data-part="evidence"]')?.textContent ?? null]
      render(null, box)
    }
    render(html`<${Compose} text="x" onText=${() => {}} onSend=${() => {}} busy=${false} noConnection=${true} onSettings=${() => {}} />`, box)
    await new Promise(r => setTimeout(r, 0))
    const compose = { line: box.querySelector('[data-part="no-connection"] > span')?.textContent ?? null, go: box.querySelector('[data-part="no-connection"] [data-action="go-settings"]') !== null }
    render(null, box)
    box.remove()
    return { states, kinds, compose }
  })
  const S = PROPOSALS.states
  assert.deepEqual(out.states.pending, { status: null, actions: ['decline', 'revise', 'confirm'], failure: null })
  assert.ok(out.states.confirmed.status.startsWith(S.confirmed.split('{')[0]))
  assert.deepEqual(out.states.confirmed.actions, [], 'decided: one line, no button that changes anything')
  assert.equal(out.states.declined.status, S.declined)
  assert.equal(out.states.revise.status, S.revise)
  assert.equal(out.states['stale:changed'].status, S.stale)
  assert.equal(out.states['stale:library-gone'].status, S.staleGone)
  assert.equal(out.states['failed:cap'].status, S.failed)
  assert.equal(out.states['failed:cap'].failure, PROPOSALS.advice.failureError)
  assert.equal(out.states['failed:op:2'].failure, PROPOSALS.advice.failureNotRolledBack)
  for (const k of ['declined', 'revise', 'stale:changed', 'failed:cap']) assert.deepEqual(out.states[k].actions, [], k)
  const K = PROPOSALS.kinds
  assert.equal(out.kinds['source-failing'][0], fmt(K['source-failing'], { subject: 's1', n: 4 }))
  assert.equal(out.kinds['no-output'][0], fmt(K['no-output'], { n: 5 }))
  assert.equal(out.kinds['ai-instruction'][0], fmt(K['ai-instruction'], { subject: 's2' }))
  assert.equal(out.kinds['ai-instruction'][1], fmt(PROPOSALS.evidence['ai-instruction'], { n: 2, phrase: 'ignore previous instructions' }))
  assert.equal(out.kinds['topic-overlap'][0], fmt(K['topic-overlap'], { other: PROPOSALS.card.unknownLibrary, pct: 67 }))
  assert.equal(out.kinds['topic-overlap'][1], fmt(PROPOSALS.evidence['topic-overlap'], { shared: '电池、充电' }))
  assert.deepEqual(out.compose, { line: NO_CONNECTION.text, go: true })
})
test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
