// 1.0.1 F4 (docs/checks/2026-11-17-1.0.1/contract.md) on the running app, English interface: a 主 Agent 提议 whose source's test
// fetch did not pass says so beside Confirm in English (texts-en/proposals.js); the first press does not confirm, it asks once
// more on the page (Confirm anyway; no system dialog); the second press confirms. A card whose test fetch passed: one press.
// The conversation's card and the right panel's To confirm (the same card, compact). The world as test/ui-v101.test.mjs's,
// smaller: three registered libraries, the main agent on the core's scripted stand-in, a feed server on this machine.
// Fails on the code before the fix: no line beside Confirm, and the first press confirms.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { PROPOSALS } from '../src/renderer/texts-en/proposals.js'
import { CJK } from './support/literals.mjs'
import { seedShelf, worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const here = tempDir('st-ui-v101-en-')
const scriptFile = join(here, 'agent-script.json')
const libraryRoot = join(here, 'library-root')
mkdirSync(libraryRoot)
const C = PROPOSALS.card

const server = createServer((req, res) => {
  const base = `http://127.0.0.1:${server.address().port}`
  const u = new URL(req.url ?? '/', base)
  if (u.pathname === '/feed/ok') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
    res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>ok</title><item><title>ok item</title><link>${base}/item/1</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`)
    return
  }
  const code = /^\/status\/(\d{3})$/.exec(u.pathname)
  res.writeHead(code ? Number(code[1]) : 404); res.end('no')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${server.address().port}`
const SOURCES = [['v101-en-ok', `${BASE}/feed/ok`, 'ok'], ['v101-en-blocked', `${BASE}/status/403`, 'blocked'], ['v101-en-failed', `${BASE}/status/503`, 'failed']]

const s = worldSession({
  kind: 'seeded',
  waitFor: 'chat',
  settings: { language: 'en' },
  prepare: async world => {
    const shelf = await seedShelf(world)
    writeFileSync(scriptFile, JSON.stringify([
      { reply: 'Three proposals to add sources; the test fetch of each is on its proposal.', proposals: SOURCES.map(([name, url]) => ({ kind: 'add_source', params: { libraryId: shelf.ids[0], source: { name, kind: 'rss', url } }, why: `Test: ${name}` })) },
    ]))
    return () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
  },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_AGENT_SCRIPT: scriptFile, STREAMS_DEV_LIBRARY_ROOT: libraryRoot, STREAMS_START_SCREEN: 'chat' }),
})
after(() => removeTree(here, { waitMs: 5000 }))

const dialogs = []
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])
const cardNamed = async name => (await bridge('listProposals', null)).data.find(c => c.kind === 'add_source' && c.params?.source?.name === name)
const transcriptFile = () => join(s.world.appData, core.AGENT_DIR, core.TRANSCRIPT_FILE)
const transcript = () => (existsSync(transcriptFile()) ? readFileSync(transcriptFile(), 'utf8').split('\n').filter(Boolean) : [])
const partOf = sel => s.page.evaluate(q => {
  const card = document.querySelector(q)
  if (!card) return null
  const btn = card.querySelector('[data-action="confirm"] button')
  const warn = card.querySelector('[data-part="trial-warning"]')
  return {
    status: card.dataset.status ?? null, armed: card.querySelector('[data-action="confirm"]')?.dataset.armed ?? null, button: btn?.textContent.trim() ?? null,
    warning: warn?.textContent.trim() ?? null, beside: Boolean(warn && btn?.closest('.row')?.contains(warn)), again: card.querySelector('[data-part="trial-again"]')?.textContent.trim() ?? null,
  }
}, sel)

test('v101 F4 (English) setup: the interface is English; one message → three cards, their test fetches as made', async () => {
  s.page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}) })
  await until(() => document.documentElement.lang === 'en' && document.querySelector('main[data-screen="chat"][data-state="ready"]'))
  const before = transcript().length
  await s.page.fill('textarea[data-field="message"]', 'Add these three sources')
  await s.page.click('[data-action="send"] button')
  const end = Date.now() + 60_000
  while (transcript().length <= before) {
    if (Date.now() > end) throw new Error('the turn wrote nothing to the record')
    await sleep(100)
  }
  await until(() => document.querySelectorAll('[data-part="conversation"] [data-proposal][data-status="pending"]').length === 3)
  for (const [name, , state] of SOURCES) assert.equal((await cardNamed(name)).trial?.status, state, `control: ${name}'s test fetch`)
})

test('v101 F4 (English): Access denied — "This address did not pass the test fetch" beside Confirm; the first press asks again, the second confirms', async () => {
  const id = (await cardNamed('v101-en-blocked')).id
  const sel = `[data-part="conversation"] [data-proposal="${id}"]`
  const p = await partOf(sel)
  assert.deepEqual([p.status, p.warning, p.beside, p.armed, p.button], ['pending', C.trialWarn, true, 'false', PROPOSALS.actions.confirm])
  assert.equal(C.trialWarn, 'This address did not pass the test fetch', 'the English words, as agreed')
  assert.ok(!CJK.test(`${p.warning}${p.button}`), 'no Chinese on the English card')
  await s.page.click(`${sel} [data-action="confirm"] button`)
  await sleep(1500)
  assert.equal((await cardNamed('v101-en-blocked')).status, 'pending', 'the first press did not confirm')
  const asked = await partOf(sel)
  assert.deepEqual([asked.armed, asked.button, asked.again], ['true', 'Confirm anyway', 'The source will still be added. Press again to go ahead.'])
  assert.ok(!CJK.test(`${asked.button}${asked.again}`), 'no Chinese in the second ask')
  await s.page.click(`${sel} [data-action="confirm"] button`)
  await until(q => document.querySelector(q)?.dataset.status === 'confirmed', sel)
  assert.equal((await cardNamed('v101-en-blocked')).status, 'confirmed', 'the second press confirmed')
})

test('v101 F4 (English): the right panel\'s To confirm — Temporary failure: the line, then Confirm anyway, then confirmed', async () => {
  const id = (await cardNamed('v101-en-failed')).id
  const sel = `[data-pane="decide"] [data-proposal-id="${id}"]`
  await until(q => document.querySelector(q) !== null, sel)
  const p = await partOf(sel)
  assert.deepEqual([p.warning, p.beside, p.armed], [C.trialWarn, true, 'false'])
  await s.page.click(`${sel} [data-action="confirm"] button`)
  await sleep(1500)
  assert.equal((await cardNamed('v101-en-failed')).status, 'pending', 'the first press did not confirm')
  const asked = await partOf(sel)
  assert.deepEqual([asked?.armed, asked?.button, asked?.again], ['true', C.confirmAgain, C.trialAgain])
  await s.page.click(`${sel} [data-action="confirm"] button`)
  await until(i => document.querySelector(`[data-part="conversation"] [data-proposal="${i}"]`)?.dataset.status === 'confirmed', id)
  assert.equal((await cardNamed('v101-en-failed')).status, 'confirmed')
})

test('v101 F4 (English): OK — no line beside Confirm, one press confirms', async () => {
  const id = (await cardNamed('v101-en-ok')).id
  const sel = `[data-part="conversation"] [data-proposal="${id}"]`
  const p = await partOf(sel)
  assert.deepEqual([p.status, p.warning, p.armed, p.button], ['pending', null, null, 'Confirm'])
  await s.page.click(`${sel} [data-action="confirm"] button`)
  await sleep(1500)
  assert.equal((await cardNamed('v101-en-ok')).status, 'confirmed', 'one press: confirmed')
})

test('v101 F4 (English): no system dialog, no page errors', () => {
  assert.deepEqual(dialogs, [])
  assert.deepEqual(s.errors, [])
})
