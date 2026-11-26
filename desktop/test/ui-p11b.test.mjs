// 1.1.1 P11b in the real window (docs/checks/2026-11-24-1.1.1/handoff/2026-11-24-v1.1.1-acceptance.md A13, A15; 场景四②):
//   A15  the app knows no library (its data was removed): 首次打开 lists the libraries already in the place new ones go —
//        two libraries, not the plain folder beside them — and registers nothing until 「加回」; a path it did not list is refused;
//        the shelf with no library lists them again and 「全部加回」 registers both
//   A13  待看's top: the last update's line (sources read, how many could not be read, how many new) and the update agent's
//        notes; with nothing in 待看 too; 「拿这条去改卡」 opens the card's conversation with that sentence in its box
//   场景四②  a library whose notes have no topic (kept from a card's library: the fallback 「未分类」) — the right panel's 文件
//        lists them flat, no lone group; a library with a topic of its own keeps its groups
// With STREAMS_P11B_SHOTS=<folder> the window is shown and the pictures are saved there. Each check holds first the state that
// would make it fail.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { SHELL } from '../src/renderer/texts/shell.js'
import { UPDATE_NOTE } from '../src/renderer/texts/inbox.js'
import { fmt } from '../src/renderer/lib/format.js'
import { ready } from './support/app.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const SHOTS = process.env.STREAMS_P11B_SHOTS && isAbsolute(process.env.STREAMS_P11B_SHOTS) ? process.env.STREAMS_P11B_SHOTS : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const POLL = { polling: 100, timeout: 60_000 }
const CARD = JSON.parse(readFileSync(join(REPO_DIR, 'core', 'test', 'fixtures', 'w4-cards.json'), 'utf8')).cards.find(c => c.n === 2).card
const GAPS = ['卡上要收皮尔区的补助，来源里却没有皮尔区的入口。', 'RTRI 的网址卡上是 node/549，取回的是 node/568，卡上的那一个该换了。']

const F = {}
const s = worldSession({
  kind: 'empty',
  waitFor: 'load',
  prepare: async world => {
    F.root = join(world.root, 'new-libs')
    F.a = join(F.root, '补助库')
    F.b = join(F.root, '电池库')
    F.plain = join(F.root, '普通文件夹')
    for (const [dir, name] of [[F.a, '补助库'], [F.b, '电池库']]) {
      core.createLibrary(dir, { name, language: 'zh-CN' })
      core.writeCard(dir, { ...CARD, name })
    }
    mkdirSync(F.plain, { recursive: true })
    writeFileSync(join(F.plain, '随手记.txt'), '不是库\n')
    // 补助库: its last update read 3 sources, one could not be read, put nothing into 待看, and left two notes
    writeFileSync(join(F.a, '_pipeline', 'rounds.jsonl'), `${JSON.stringify({ id: 'u-1', kind: 'update', startedAt: new Date(Date.now() - 3_600_000).toISOString(), finishedAt: new Date(Date.now() - 3_500_000).toISOString(), status: 'done', counts: { sources: 3, read: 3, unreadable: 1, newLinks: 0, originals: 0, missing: 0, carried: 0, items: 0, inbox: 0, dropped: 0 }, calls: 1, agent: { searches: 2, reads: 5, sources: [], gaps: GAPS } })}\n`)
    // notes kept from 待看 the way a card's library keeps them: no topic of their own (the fallback 「未分类」)
    for (const [dir, url, topics] of [[F.a, 'https://example.org/a/1', undefined], [F.a, 'https://example.org/a/2', undefined], [F.b, 'https://example.org/b/1', ['电池']]]) {
      core.putMissingInInbox(dir, { item: { url, title: `一条 ${url.slice(-3)}`, date: '2026-11-24' } })
      core.keep(dir, url, topics ? { topics } : {})
    }
  },
  settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'files' }, theme: 'research', appearance: 'light' },
  env: world => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_LIBRARY_ROOT: join(world.root, 'new-libs'), ...(SHOTS ? { STREAMS_WINDOW: 'shown' } : {}) }),
})
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
// the test world's folders are under this computer's temp folder: their paths are masked in the pictures (evidence carries no
// home folder or user name)
const shot = async name => { if (SHOTS) { await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400); await s.page.screenshot({ path: join(SHOTS, `${name}.png`), mask: [s.page.locator('.st-path'), s.page.getByText(/AppData|[A-Z]:\\Users/)] }) } }
const registered = async () => (await s.page.evaluate(() => window.streams.listLibraries())).data.map(l => l.path)
const listing = dir => readdirSync(dir).sort()
const hashOf = dir => { const h = createHash('sha256'); const walk = d => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else h.update(p.slice(dir.length)).update(readFileSync(p)) } }; walk(dir); return h.digest('hex') }
const found = () => s.page.evaluate(() => { const p = document.querySelector('[data-part="found-libraries"]'); return p ? { count: Number(p.dataset.count), paths: [...p.querySelectorAll('[data-found]')].map(r => r.dataset.found) } : null })

describe('P11b: libraries found again, the last update\'s note, notes without a topic', () => {
  test('A15: 首次打开 lists the two libraries in the default place, not the plain folder; nothing registered or written before a press', async () => {
    await until(() => document.querySelector('main[data-screen="first-run"] [data-part="track"]') !== null)
    await until(() => document.querySelector('[data-part="found-libraries"]') !== null)
    const plainBefore = listing(F.plain)
    const hashA = hashOf(F.a)
    assert.deepEqual(await found(), { count: 2, paths: [F.a, F.b].sort() }, 'the two libraries (sorted by folder name); the plain folder is not one')
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="found-libraries"] .section-label').textContent.trim()), fmt(SHELL.found.title, { n: 2 }) + SHELL.found.addAll)
    assert.deepEqual(await registered(), [], 'nothing registered by listing them')
    assert.deepEqual(listing(F.plain), plainBefore, 'the plain folder untouched')
    assert.equal(hashOf(F.a), hashA, 'the library untouched by listing it')
    await shot('first-run-found')
    // a path it did not list is refused, and nothing is registered
    const r = await s.page.evaluate(p => window.streams.addFoundLibraries([p]), F.plain)
    assert.equal(r.error?.code, 'bad_arguments', JSON.stringify(r))
    assert.deepEqual(await registered(), [])
  })

  test('A15: 「加回」 one — only it registered, current, its 待看', async () => {
    await s.page.click(`[data-found="${F.a.replace(/\\/g, '\\\\')}"] [data-action="found-add"] button`)
    await ready(s.page, 'inbox')
    assert.deepEqual((await registered()).map(p => p.toLowerCase()), [F.a.toLowerCase()])
  })

  test('A13: 待看\'s top — the last update read 3 sources, 1 could not be read, none new; the agent\'s two notes; with 待看 empty too', async () => {
    await until(() => document.querySelector('[data-part="update-note"]') !== null)
    const note = await s.page.evaluate(() => { const n = document.querySelector('[data-part="update-note"]'); return { read: n.dataset.read, bad: n.dataset.unreadable, added: n.dataset.added, line: n.querySelector('.section-label span').textContent, empty: document.querySelector('[data-part="empty"]') !== null, gaps: n.querySelectorAll('[data-update-gap]').length } })
    // 1.1.2 (U7): 「改卡建议」 are shown at once (two of them: no 「查看全部」); they were folded behind a button
    assert.deepEqual([note.read, note.bad, note.added, note.empty, note.gaps], ['3', '1', '0', true, GAPS.length], JSON.stringify(note))
    assert.ok(note.line.includes(fmt(UPDATE_NOTE.bad, { n: 1 })) && note.line.endsWith(fmt('新增 {n} 条', { n: 0 })), note.line)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-part="update-note"] [data-action="update-notes"]')), null, 'no 「查看全部」 for two')
    assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-update-gap] > span:first-child')].map(e => e.textContent)), GAPS)
    await shot('inbox-update-note')
  })

  test('A13: 「拿这条去改卡」 — the card\'s conversation, that sentence in its box, nothing sent, the card unchanged', async () => {
    const card = readFileSync(join(F.a, '_card', 'card.json'), 'utf8')
    await s.page.click('[data-update-gap="1"] [data-action="gap-to-card"] button')
    await ready(s.page, 'build')
    // 1.1.3: the library's conversation (nothing open there: the box takes the words, nothing sent)
    await until(t => document.querySelector('main[data-screen="build"][data-kind="library"] textarea[data-field="message"]')?.value === t, GAPS[1])
    assert.ok(['none', 'idle'].includes(await s.page.evaluate(() => document.querySelector('main[data-screen="build"]').dataset.convState)), 'nothing sent')
    assert.equal(readFileSync(join(F.a, '_card', 'card.json'), 'utf8'), card)
    await shot('build-with-gap')
  })

  test('场景四②: the right panel\'s 文件 — notes with no topic of their own listed flat, no 「未分主题」 group', async () => {
    // back from the card's conversation to the library's own page (its right panel shows its files)
    await s.page.click('.st-sidebar [data-library-row]')
    await ready(s.page, 'inbox')
    await s.page.click('[data-panel-tab="files"]')
    await until(() => document.querySelector('[data-tree-flat]') !== null || document.querySelector('[data-tree-topic]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-tree-flat] [data-tree-note]').length), 2)
    assert.equal(await s.page.evaluate(() => document.querySelectorAll('[data-tree-topic]').length), 0, 'no group at all')
    await shot('files-flat')
    // 资料库: the two notes listed, no topic filter (none at all, so no 「未分类」 one either)
    await s.page.click('.st-lib-tabs [data-tab="library"]')
    await ready(s.page, 'library')
    await until(() => document.querySelectorAll('[data-row]').length >= 2)
    assert.deepEqual(await s.page.evaluate(() => [...document.querySelectorAll('[data-filter-topic]')].map(b => b.dataset.filterTopic)), [])
    await shot('library-no-topic-filter')
  })

  test('A15: the shelf with no library lists them again; 「全部加回」 registers both; then 文件 of the library with a topic keeps its group', async () => {
    const [entry] = (await s.page.evaluate(() => window.streams.listLibraries())).data
    await s.page.evaluate(id => window.streams.removeLibrary(id), entry.id)
    await s.page.click('.st-sidebar [data-nav="shelf"]')
    await until(() => document.querySelector('[data-part="shelf-empty"]') !== null && document.querySelector('[data-part="found-libraries"]') !== null)
    assert.deepEqual(await found(), { count: 2, paths: [F.a, F.b].sort() })
    await shot('shelf-found')
    await s.page.click('[data-action="found-add-all"] button')
    await ready(s.page, 'inbox')
    assert.deepEqual((await registered()).map(p => p.toLowerCase()).sort(), [F.a, F.b].map(p => p.toLowerCase()).sort())
    // 电池库: its note has a topic of its own — a group, as before
    const b = (await s.page.evaluate(() => window.streams.listLibraries())).data.find(l => l.path.toLowerCase() === F.b.toLowerCase())
    await s.page.click(`.st-sidebar [data-library-row="${b.id}"]`)
    await s.page.click('[data-panel-tab="files"]')
    await until(() => document.querySelector('[data-tree-topic="电池"]') !== null)
    assert.equal(await s.page.evaluate(() => document.querySelector('[data-tree-flat]')), null)
  })

  test('no page errors', () => { assert.deepEqual(s.errors, []) })
})
