// 1.1.1 P9 「来源授权」 (docs/checks/2026-11-24-1.1.1/p9/scorecard.json; acceptance B24), in the real window with the app's own
// readers (no STREAMS_DEV_READS: the update reads two real servers of this machine):
//   甲 on 127.0.0.1 — of the list in this test (STREAMS_DEV_SITE_AUTH lays a list with 127.0.0.1 over sec.gov): its pages answer
//      403 to a request without the contact, the page to one with it
//   乙 on localhost — not of the list: the contact must never be in a request it receives
// Steps: an update with no contact — 甲's new page is not kept (原文没存下来) and its card says the site wants a contact e-mail,
// with a way to 设置; 乙's card has no such sentence. 设置「来源授权」: the sites, a bad address not saved, a good one saved (in
// settings.json, not in the library), the card's sentence gone. A second update — 甲's next page is read and kept. 乙 never saw
// the contact; the log never holds it.
import assert from 'node:assert/strict'
import { describe, test, after } from 'node:test'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { SETTINGS } from '../src/renderer/texts/settings.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'
import { ready } from './support/app.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const SHOTS = process.env.STREAMS_P9_SHOTS && isAbsolute(process.env.STREAMS_P9_SHOTS) ? process.env.STREAMS_P9_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 90_000 }
const CONTACT = 'p9-reader@example.com'
const sentence = n => `公告第 ${n} 段：这份文件写了公司名称、提交日期和文件编号，第 ${n} 项要点写在这里，足够长，读得出是一篇文章。`
const ARTICLE = title => `<html><head><title>${title}</title></head><body><article><h1>${title}</h1>${[1, 2, 3, 4, 5, 6].map(n => `<p>${sentence(n)}</p>`).join('')}</article></body></html>`
const OLD = n => `/old/${n}`

function serve(host, handler) {
  const seen = []
  const server = createServer((req, res) => { seen.push({ path: req.url, ua: req.headers['user-agent'] ?? '', all: JSON.stringify(req.headers) }); handler(req, res) })
  return new Promise(resolve => server.listen(0, host, () => resolve({ server, seen, port: server.address().port })))
}
const listPage = (paths) => `<html><body>${paths.map(p => `<a href="${p}">${p}</a>`).join(' ')}</body></html>`
let aDocs = ['/doc/1']
const A = await serve('127.0.0.1', (req, res) => {
  if (req.url === '/list') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(listPage([1, 2, 3, 4, 5].map(OLD).concat(aDocs))); return }
  if (!String(req.headers['user-agent'] ?? '').includes(CONTACT)) { res.writeHead(403, { 'content-type': 'text/html' }); res.end('<html><body><p>Undeclared automated tool. Please declare your traffic by updating your user agent to include company specific information.</p></body></html>'); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(ARTICLE(`甲的公告 ${req.url}`))
})
const B = await serve('::', (req, res) => {
  if (req.url === '/list') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(listPage([1, 2, 3, 4, 5].map(OLD).concat(['/doc/1']))); return }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(ARTICLE(`乙的文章 ${req.url}`))
})
after(() => { A.server.close(); B.server.close() })
const a = p => `http://127.0.0.1:${A.port}${p}`
const b = p => `http://localhost:${B.port}${p}`

const CARD = {
  name: '授权测试', definition: { summary: '一座测试来源授权的库。', purpose: '测试', scope: '对象：公告', exclude: '无', trust: '官方', rhythm: '每天一次', language: '中文', hard: '无' },
  decide: [], collect: ['公告'], skip: [], sources: [{ name: '甲', url: a('/list'), status: 'ok' }, { name: '乙', url: b('/list'), status: 'ok' }], unreadable: [],
  pick: ['新的先收'], write: ['写清要点'], samples: [],
}
const item = (url, title) => ({ url, title, date: '2026-11-24', due: '', what: '一份新的公告。', points: [1, 2, 3].map(n => ({ text: `第 ${n} 项`, quote: sentence(n) })), why: '在范围里' })
const SITES = [{ id: 'test', hosts: ['127.0.0.1'], needs: 'contact', name: { zh: '甲（本机测试站）', en: 'A (test site)' }, why: { zh: '不留联系邮箱就不让读', en: 'no contact e-mail, no reading' } }]

const F = {}
const s = worldSession({
  kind: 'empty',
  waitFor: 'inbox',
  prepare: world => {
    core.writeCard(world.library, CARD)
    const st = core.readUpdateState(world.library)
    const seen = u => [1, 2, 3, 4, 5].map(n => u(OLD(n)))
    core.writeUpdateState(world.library, { ...st, sources: { [a('/list')]: { ok: true, seen: seen(a), firstAt: '2026-11-20T10:00:00.000Z' }, [b('/list')]: { ok: true, seen: seen(b), firstAt: '2026-11-20T10:00:00.000Z' } }, lastAgentAt: '2026-11-23T10:00:00.000Z' })
    F.sites = join(world.root, 'sites.json')
    F.script = join(world.root, 'update-script.json')
    writeFileSync(F.sites, JSON.stringify(SITES))
    // the stand-in update agent hands in both new pages and says it opened 甲's (which Streams could not read without the contact)
    writeFileSync(F.script, JSON.stringify({ progress: [], holdMs: 0, items: [item(a('/doc/1'), '甲的公告一'), item(b('/doc/1'), '乙的文章一')], reads: [{ url: a('/doc/1'), ok: false }], judgeDelayMs: 0 }))
  },
  settings: { connections: { active: 'claude-code' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_SITE_AUTH: F.sites, STREAMS_DEV_UPDATE_SCRIPT: F.script, STREAMS_START_SCREEN: 'inbox', ...(SHOTS ? { STREAMS_WINDOW: 'shown', STREAMS_DEV_NOTIFY_LOG: '1' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(300); await s.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [s.page.locator('.st-path'), s.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }
const card = url => s.page.evaluate(u => {
  const c = document.querySelector(`article[data-card][data-url="${u}"]`)
  if (!c) return null
  const n = c.querySelector('[data-part="needs-contact"]')
  return { missing: c.querySelector('[data-original-missing]')?.dataset.originalMissing ?? null, hint: n ? n.textContent.replace(/\s+/g, ' ').trim() : null, site: n?.dataset.site ?? null, go: Boolean(c.querySelector('[data-action="to-source-auth"] button')), what: Boolean(c.querySelector('[data-part="what"]')) }
}, url)
const runUpdate = async () => {
  await s.page.click('[data-part="run-button"] button')
  await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'running')
  await until(() => document.querySelector('[data-part="run-button"]')?.dataset.runState === 'idle')
}
const contactIn = seen => seen.some(r => r.all.includes(CONTACT))

describe('P9: 来源授权 in the app', () => {
  test('no contact: 甲\'s page not kept, its card says the site wants a contact e-mail; 乙\'s card does not', async () => {
    await runUpdate()
    await until(u => document.querySelector(`article[data-card][data-url="${u}"]`) !== null, a('/doc/1'))
    const ca = await card(a('/doc/1'))
    assert.equal(ca.missing, 'blocked', JSON.stringify(ca))
    assert.equal(ca.site, 'test')
    assert.ok(ca.hint.includes(INBOX.card.needsContact), ca.hint)
    assert.equal(ca.go, true)
    const cb = await card(b('/doc/1'))
    assert.equal(cb.missing, null, '乙\'s page was read')
    assert.equal(cb.hint, null)
    assert.equal(contactIn(A.seen), false, 'nothing filled in: nothing sent')
    await s.page.evaluate(u => document.querySelector(`article[data-card][data-url="${u}"]`).scrollIntoView({ block: 'center' }), a('/doc/1'))
    await shot('card-needs-contact')
  })

  test('设置「来源授权」: the sites it goes to; a bad address not saved; a good one saved in the settings, not in the library', async () => {
    await s.page.click(`article[data-card][data-url="${a('/doc/1')}"] [data-action="to-source-auth"] button`)
    await ready(s.page, 'settings')
    await until(() => document.querySelector('[data-part="source-auth"]')?.dataset.filled === 'false')
    const part = await s.page.evaluate(() => {
      const p = document.querySelector('[data-part="source-auth"]')
      return { text: p.textContent.replace(/\s+/g, ' '), sites: [...p.querySelectorAll('[data-site]')].map(e => [e.dataset.site, e.textContent.trim()]) }
    })
    assert.ok(part.text.includes(SETTINGS.sourceAuth.note), part.text)
    assert.deepEqual(part.sites, [['test', fmt(SETTINGS.sourceAuth.site, { name: SITES[0].name.zh, why: SITES[0].why.zh })]])
    await s.page.evaluate(() => document.querySelector('[data-part="source-auth"]').scrollIntoView({ block: 'center' }))
    await shot('settings-empty')
    await s.page.fill('[data-field="source-contact"]', 'not an address')
    await s.page.click('[data-action="save-contact"] button')
    await until(() => document.querySelector('[data-contact-note]')?.dataset.contactNote === 'bad')
    assert.equal(JSON.parse(readFileSync(join(s.world.appData, 'settings.json'), 'utf8')).sourceContact ?? null, null, 'not saved')
    await s.page.fill('[data-field="source-contact"]', CONTACT)
    await s.page.click('[data-action="save-contact"] button')
    await until(() => document.querySelector('[data-part="source-auth"]')?.dataset.filled === 'true')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-contact-note]').dataset.contactNote), 'saved')
    assert.ok((await s.page.evaluate(() => document.querySelector('[data-part="source-auth-state"]').textContent)).includes(CONTACT))
    assert.equal(JSON.parse(readFileSync(join(s.world.appData, 'settings.json'), 'utf8')).sourceContact, CONTACT)
    assert.equal(readFileSync(join(s.world.library, 'streams.json'), 'utf8').includes(CONTACT), false, 'not in the library')
    await shot('settings-filled')
    assert.ok((await s.page.evaluate(() => window.streams.setAppearance('dark'))).ok)
    await s.page.waitForTimeout(300)
    await shot('settings-filled-dark')
    assert.ok((await s.page.evaluate(() => window.streams.setAppearance('light'))).ok)
  })

  test('the contact filled in: the card\'s sentence is gone; the next update reads and keeps 甲\'s page; 乙 never got it; the log never holds it', async () => {
    await s.page.click('.st-sidebar [data-library-row]')
    await ready(s.page, 'inbox')
    await until(u => document.querySelector(`article[data-card][data-url="${u}"]`) !== null, a('/doc/1'))
    const ca = await card(a('/doc/1'))
    assert.equal(ca.missing, 'blocked', 'still not kept (it was not read)')
    assert.equal(ca.hint, null, 'no sentence once the contact is filled in')
    aDocs = ['/doc/1', '/doc/2']
    writeFileSync(F.script, JSON.stringify({ progress: [], holdMs: 0, items: [item(a('/doc/2'), '甲的公告二')], reads: [], judgeDelayMs: 0 }))
    await runUpdate()
    await until(u => document.querySelector(`article[data-card][data-url="${u}"]`) !== null, a('/doc/2'))
    const c2 = await card(a('/doc/2'))
    assert.equal(c2.missing, null, '甲\'s page read with the contact, its original kept')
    assert.equal(c2.what, true)
    assert.ok(A.seen.some(r => r.path === '/doc/2' && r.ua.endsWith(` ${CONTACT}`)), JSON.stringify(A.seen.map(r => [r.path, r.ua])))
    assert.ok(B.seen.length >= 2, '乙 was read in both updates')
    assert.equal(contactIn(B.seen), false, JSON.stringify(B.seen))
    assert.equal(readFileSync(join(s.world.appData, 'logs', 'main.log'), 'utf8').includes(CONTACT), false, 'the log never holds the contact')
    assert.deepEqual(s.errors, [])
  })
})
