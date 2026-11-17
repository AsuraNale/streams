// 1.0.1 (docs/checks/2026-11-17-1.0.1/contract.md) on the running app, Chinese interface:
//   F2  the 主 Agent page's conversation, long enough to scroll: left for another page and opened again, it stands at its end
//       (the last line in sight). The other way: a card picked in the right panel's 详情 is scrolled to and stays there (it is
//       not pulled to the end), and the page opened afresh still shows the end.
//   F4  a 主 Agent 提议 whose source's test fetch did not pass (地址无效 · 访问被拒 · 暂时失败) says so beside its 确认: the first
//       press does not confirm, it asks once more on the page (no system dialog); the second press confirms. A card whose test
//       fetch passed is confirmed by one press, with no such line. Both sizes of the one card: the conversation's and the
//       right panel's 待确认.
// The world: three registered libraries (support/seed.mjs seedShelf); a record of 60 earlier turns written before the start
// (core appendTranscript) so the conversation scrolls; the main agent on the core's scripted stand-in (STREAMS_DEV_CONNECTION
// =fake + STREAMS_DEV_AGENT_SCRIPT): its one answer makes five add_source cards whose test fetches are on a feed server on
// this machine — two that pass, one 403 (访问被拒), one 404 (地址无效), one 503 (暂时失败). Nothing leaves the machine.
// Fails on the code before the fix: F2 — the conversation stands at its top after coming back; F4 — no line beside 确认 and
// the first press confirms.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { PROPOSALS } from '../src/renderer/texts/proposals.js'
import { seedShelf, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const here = tempDir('st-ui-v101-')
const scriptFile = join(here, 'agent-script.json')
const libraryRoot = join(here, 'library-root')
mkdirSync(libraryRoot)
const C = PROPOSALS.card

// ---- the feed server of the test fetches: /feed/<name> (200), /status/<code> ----
const rss = (base, name) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${name}</title>\n${[1, 2, 3].map(i => `<item><title>${name} item ${i}</title><link>${base}/item/${name}/${i}</link><pubDate>${new Date(Date.now() - i * 3_600_000).toUTCString()}</pubDate><description>about ${name}</description></item>`).join('\n')}\n</channel></rss>`
const server = createServer((req, res) => {
  const base = `http://127.0.0.1:${server.address().port}`
  const u = new URL(req.url ?? '/', base)
  const feedName = /^\/feed\/([\w-]+)$/.exec(u.pathname)
  if (feedName) { res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' }); res.end(rss(base, feedName[1])); return }
  const code = /^\/status\/(\d{3})$/.exec(u.pathname)
  if (code) { res.writeHead(Number(code[1])); res.end('no'); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<html><body><p>An item.</p></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${server.address().port}`

// the five sources of the one answer, and the state each one's test fetch comes back in
export const SOURCES = [
  ['v101-ok-a', `${BASE}/feed/ok-a`, 'ok'],
  ['v101-blocked', `${BASE}/status/403`, 'blocked'],
  ['v101-gap', `${BASE}/status/404`, 'gap'],
  ['v101-failed', `${BASE}/status/503`, 'failed'],
  ['v101-ok-b', `${BASE}/feed/ok-b`, 'ok'],
]
let shelf = null
const s = worldSession({
  kind: 'seeded',
  waitFor: 'chat',
  prepare: async world => {
    shelf = await seedShelf(world)
    const [seeded] = shelf.ids
    writeFileSync(scriptFile, JSON.stringify([
      { reply: '已生成五项添加来源的提议，测试抓取的结果在每项提议上。', proposals: SOURCES.map(([name, url]) => ({ kind: 'add_source', params: { libraryId: seeded, source: { name, kind: 'rss', url } }, why: `测试：${name}` })) },
    ]))
    // the record before the start: 60 turns of words, long enough that the conversation scrolls
    const agentDir = join(world.appData, core.AGENT_DIR)
    let i = 0
    const t0 = Date.now() - 86_400_000
    const now = () => new Date(t0 + (i++) * 1000)
    for (let turn = 1; turn <= 60; turn++) {
      core.appendTranscript(agentDir, { turn, role: 'you', text: `以前的第 ${turn} 句：${'这是一段较长的话，用来让对话足够长。'.repeat(3)}` }, { now })
      core.appendTranscript(agentDir, { turn, role: 'agent', text: `以前的第 ${turn} 个回答：${'主 Agent 的回答也写得长一些，占几行。'.repeat(4)}` }, { now })
    }
    return () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
  },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_AGENT_SCRIPT: scriptFile, STREAMS_DEV_LIBRARY_ROOT: libraryRoot, STREAMS_START_SCREEN: 'chat' }),
})
after(() => removeTree(here, { waitMs: 5000 }))

const dialogs = []
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const cards = async () => (await bridge('listProposals', null)).data
const cardNamed = async name => (await cards()).find(c => c.kind === 'add_source' && c.params?.source?.name === name)
const transcript = () => readFileSync(join(s.world.appData, core.AGENT_DIR, core.TRANSCRIPT_FILE), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))

/** Where the conversation stands: its scroll, its room, and whether its last line is in sight. */
const where = () => s.page.evaluate(() => {
  const el = document.querySelector('main[data-screen="chat"] .thread-scroll')
  if (!el) return null
  const box = el.getBoundingClientRect()
  const rows = el.querySelectorAll('[data-part="conversation"] > *')
  const last = rows[rows.length - 1]?.getBoundingClientRect() ?? null
  return {
    top: Math.round(el.scrollTop), room: Math.round(el.scrollHeight - el.clientHeight),
    lastInSight: last ? last.bottom <= box.bottom + 2 && last.bottom > box.top : false,
  }
})
const atEnd = w => w !== null && w.room > 0 && w.room - w.top <= 4 && w.lastInSight
/** The chat page drawn with its record and every card of the last turn. */
const chatReady = () => until(() => document.querySelector('main[data-screen="chat"][data-state="ready"]')
  && document.querySelectorAll('[data-part="conversation"] [data-row="agent"]').length >= 45)

test('v101 F2 setup: one message → the answer with five cards; the conversation is long enough to scroll', async () => {
  s.page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}) })
  await chatReady()
  const before = transcript().length
  await s.page.fill('textarea[data-field="message"]', '帮我添加这五个来源')
  await s.page.click('[data-action="send"] button')
  const end = Date.now() + 60_000
  while (transcript().length <= before) {
    if (Date.now() > end) throw new Error('the turn wrote nothing to the record')
    await sleep(100)
  }
  await until(n => document.querySelectorAll('[data-part="conversation"] [data-proposal][data-status="pending"]').length === n, SOURCES.length)
  const states = Object.fromEntries((await cards()).filter(c => c.kind === 'add_source').map(c => [c.params.source.name, c.trial?.status]))
  assert.deepEqual(states, Object.fromEntries(SOURCES.map(([n, , st]) => [n, st])), 'control: each test fetch came back in the state it was made for')
  const w = await where()
  assert.ok(w.room > 3000, `control: the conversation scrolls (${w.room}px of room)`)
})

test('v101 F2: left for another page and opened again, the conversation stands at its end (the last line in sight)', async () => {
  for (const away of ['shelf', 'settings']) {
    // a person reading higher up first: the end is not where it stood when it was left
    await s.page.evaluate(() => { document.querySelector('main[data-screen="chat"] .thread-scroll').scrollTop = 200 })
    await s.page.click(away === 'shelf' ? 'a[data-nav="shelf"]' : 'button.st-sidebar__footer-button')
    await until(() => !document.querySelector('main[data-screen="chat"]'))
    await s.page.click('a[data-nav="chat"]')
    await chatReady()
    await until(n => document.querySelectorAll('[data-part="conversation"] [data-proposal]').length === n, SOURCES.length)
    await sleep(1500) // what is seen after the page has settled is what stays
    const w = await where()
    assert.ok(w.room > 3000, `control: the conversation still scrolls (${w.room}px)`)
    assert.ok(atEnd(w), `back from ${away}: at the end (${JSON.stringify(w)})`)
  }
})

test('v101 F2 (the other way): a card picked in the right panel\'s 详情 is scrolled to, and it is not pulled back to the end', async () => {
  const first = await cardNamed(SOURCES[0][0])
  await s.page.click('[data-panel-tab="detail"]')
  await until(id => document.querySelector(`[data-detail-card="${id}"]`) !== null, first.id)
  const before = await where()
  assert.ok(atEnd(before), `control: the page stands at its end before the pick (${JSON.stringify(before)})`)
  await s.page.click(`[data-detail-card="${first.id}"]`)
  await sleep(1500)
  const w = await where()
  const card = await s.page.evaluate(id => {
    const el = document.querySelector('main[data-screen="chat"] .thread-scroll')
    const c = document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`).getBoundingClientRect()
    const b = el.getBoundingClientRect()
    return { inSight: c.top >= b.top - 2 && c.top < b.bottom, offCentre: Math.round(Math.abs((c.top + c.bottom) / 2 - (b.top + b.bottom) / 2)) }
  }, first.id)
  assert.ok(card.inSight, `the picked card is in sight (${JSON.stringify(card)})`)
  assert.ok(w.room - w.top > 200, `and the page is not at its end: it was moved to the card (${JSON.stringify(w)})`)
  // and it stays there: a change of the cards (another one confirmed in the right panel) does not pull the page down
  const ok = await cardNamed('v101-ok-b')
  assert.equal((await bridge('confirmProposal', ok.id)).data.status, 'confirmed')
  await until(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)?.dataset.status === 'confirmed', ok.id)
  await sleep(1000)
  const after = await where()
  assert.ok(Math.abs(after.top - w.top) < 40, `still at the card after the cards changed (${w.top} → ${after.top})`)
  await s.page.click('[data-panel-tab="decide"]')
})

// ---- F4 ------------------------------------------------------------------------------------------------------------------

/** The confirm part of the conversation's card of `name`: its warning line, the button's words and whether it waits to be pressed again. */
const confirmPart = name => s.page.evaluate(async n => {
  const card = [...document.querySelectorAll('[data-part="conversation"] [data-proposal][data-kind="add_source"]')].find(c => c.querySelector('[data-part="title"]')?.textContent.includes(n))
  if (!card) return null
  const btn = card.querySelector('[data-action="confirm"] button')
  const warn = card.querySelector('[data-part="trial-warning"]')
  const row = btn?.closest('.row')
  return {
    status: card.dataset.status, armed: card.querySelector('[data-action="confirm"]')?.dataset.armed ?? null,
    button: btn?.textContent.trim() ?? null, warning: warn?.textContent.trim() ?? null,
    warningBesideButton: Boolean(warn && row && row.contains(warn)), again: card.querySelector('[data-part="trial-again"]')?.textContent.trim() ?? null,
    unticked: card.querySelector('[data-part="trial"] [data-part="unticked"]')?.textContent.trim() ?? null,
  }
}, name)

test('v101 F4: a card whose test fetch passed — no line beside 确认, one press confirms', async () => {
  const p = await confirmPart('v101-ok-a')
  assert.deepEqual([p.status, p.warning, p.button], ['pending', null, PROPOSALS.actions.confirm])
  await s.page.click(`[data-proposal="${(await cardNamed('v101-ok-a')).id}"] [data-action="confirm"] button`)
  await sleep(1500)
  assert.equal((await cardNamed('v101-ok-a')).status, 'confirmed', 'one press: confirmed')
  await until(id => document.querySelector(`[data-part="conversation"] [data-proposal="${id}"]`)?.dataset.status === 'confirmed', (await cardNamed('v101-ok-a')).id)
})

for (const [name, , state] of SOURCES.filter(x => x[2] === 'blocked' || x[2] === 'gap')) {
  test(`v101 F4: a card whose test fetch came back ${state} — the line beside 确认; the first press asks again, the second confirms`, async () => {
    const id = (await cardNamed(name)).id
    const p = await confirmPart(name)
    assert.equal(p.status, 'pending')
    assert.equal(p.warning, C.trialWarn, 'the line says the test fetch did not pass')
    assert.ok(p.warningBesideButton, 'beside the 确认 button')
    assert.equal(p.unticked, null, 'its test fetch line does not say 不添加: the source is added (the line beside 确认 says so)')
    assert.equal(p.armed, 'false')
    await s.page.click(`[data-proposal="${id}"] [data-action="confirm"] button`)
    // a fixed wait, then what the bridge and the page say (a press that confirmed would have done so well within it)
    await sleep(1500)
    assert.equal((await cardNamed(name)).status, 'pending', 'the first press did not confirm')
    const asked = await confirmPart(name)
    assert.deepEqual([asked.status, asked.armed, asked.button, asked.again], ['pending', 'true', C.confirmAgain, C.trialAgain], 'the button asks once more, on the page')
    await s.page.click(`[data-proposal="${id}"] [data-action="confirm"] button`)
    await until(i => document.querySelector(`[data-part="conversation"] [data-proposal="${i}"]`)?.dataset.status === 'confirmed', id)
    assert.equal((await cardNamed(name)).status, 'confirmed', 'the second press confirmed')
  })
}

test('v101 F4: the right panel\'s 待确认 (the same card, compact) — 暂时失败: the line, the first press asks again, the second confirms', async () => {
  const id = (await cardNamed('v101-failed')).id
  await s.page.click('[data-panel-tab="decide"]')
  await until(() => document.querySelector('[data-part="right-panel"]')?.dataset.tab === 'decide')
  const sel = `[data-pane="decide"] [data-proposal-id="${id}"]`
  await until(q => document.querySelector(q) !== null, sel)
  const read = () => s.page.evaluate(q => {
    const card = document.querySelector(q)
    const btn = card?.querySelector('[data-action="confirm"] button')
    const warn = card?.querySelector('[data-part="trial-warning"]')
    return card ? { warning: warn?.textContent.trim() ?? null, beside: Boolean(warn && btn?.closest('.row')?.contains(warn)), button: btn.textContent.trim(), armed: card.querySelector('[data-action="confirm"]').dataset.armed, again: card.querySelector('[data-part="trial-again"]')?.textContent.trim() ?? null } : null
  }, sel)
  const p = await read()
  assert.deepEqual([p.warning, p.beside, p.armed], [C.trialWarn, true, 'false'])
  await s.page.click(`${sel} [data-action="confirm"] button`)
  await sleep(1500)
  assert.equal((await cardNamed('v101-failed')).status, 'pending', 'the first press did not confirm')
  const asked = await read()
  assert.deepEqual([asked?.armed, asked?.button, asked?.again], ['true', C.confirmAgain, C.trialAgain], 'the button asks once more, on the page')
  await s.page.click(`${sel} [data-action="confirm"] button`)
  await until(i => document.querySelector(`[data-part="conversation"] [data-proposal="${i}"]`)?.dataset.status === 'confirmed', id)
  assert.equal((await cardNamed('v101-failed')).status, 'confirmed', 'the second press confirmed')
})

test('v101: no system dialog was opened, no page errors', () => {
  assert.deepEqual(dialogs, [], 'the second ask is on the page, not a dialog')
  assert.deepEqual(s.errors, [])
})
