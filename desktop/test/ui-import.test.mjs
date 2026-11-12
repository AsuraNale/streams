// redesign R1: 概览 is gone — the screens waited for are 'inbox' (was 'overview'); 「away and back」 goes by 来源与要求 (was 概览)
// 导入已有文件夹 (plan A3, mockup S8; docs/desktop.md §4.3) on the running app, with a folder of the user's own .md files
// written by test/support/seed.mjs seedImportFolder (no streams.json): five files that need a header (three the core can
// propose one for, one whose name cannot be an id, one whose header cannot be read), one that conforms, a sub folder.
// Session M (a library open, 设置 first): 「打开已有文件夹」 says how many .md the folder holds and writes nothing until
// 「当库打开」; then 资料库 · 待规范: one card per file with the core's proposal in the text box, the two that cannot be
// written say why and have no write button, the sub folder is named; a text box line that cannot be read is refused with
// the file untouched (control); 「跳过」 writes nothing and the card is back when the page is opened again; a changed title
// is what lands on disk; 「全部按拟的写入」 writes the rest. After every write the file's body is byte for byte the old one
// (the core's bodyHash of the file on disk = listPending's before) and the file is in 我写的.
// Session F (no library, 首次设置): step 1 with that folder says the same and 下一步 opens it as a library.
// v2 package I: 设置 has no 「打开已有文件夹」 any more and 首次设置 has no folder step: both sessions reach the folder through 新建库
// (the manual way, screens/new-library.js), whose first step is v1.0's — session M opens 新建库 directly (a library is open, the
// words are FIRST_RUN.folder's), and session F goes 首次打开 → the connection skipped → 和主 Agent 聊 → 「也可以手动新建」. After
// 下一步 the folder is a library and 新建库 is at its pack step; session M then loads the page again to reach the library's page.
// Plain Node at the end: lib/header-text.js round trips what the core proposes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { LIBRARY } from '../src/renderer/texts/library.js'
import { FIRST_RUN } from '../src/renderer/texts/first-run.js'
import { fmt } from '../src/renderer/lib/format.js'
import { headerText, parseHeaderText } from '../src/renderer/lib/header-text.js'
import { ready } from './support/app.mjs'
import { IMPORT_FILES, seedImportFolder, worldSession } from './support/seed.mjs'
// v2 package F: 资料库 and 今日 (概览) are tabs of the library's page, reached through it, not v1.0's sidebar entries; the assertions are v1.0's

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const NO_SCHEDULE = { schedule: { enabled: false, time: '08:30' } }
const T = LIBRARY.pending

/** sha256 of every file under dir, by its path relative to dir with "/". */
function hashTree(dir, base = dir, out = {}) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) hashTree(p, base, out)
    else out[p.slice(base.length + 1).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex')
  }
  return out
}

let vault = null
let seeded = null
let before = null
let pendingBefore = null
const m = worldSession({
  kind: 'empty',
  waitFor: 'new-library',
  settings: world => ({ libraryPath: world.library, ...NO_SCHEDULE }),
  prepare: world => {
    vault = join(world.root, 'vault')
    seeded = seedImportFolder(vault)
    before = hashTree(vault)
  },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: vault, STREAMS_START_SCREEN: 'new-library' }),
})
const page = () => m.page
const click = sel => page().click(`${sel} button`)
const until = (fn, arg) => page().waitForFunction(fn, arg, POLL)
const text = sel => page().evaluate(s => document.querySelector(s)?.textContent ?? null, sel)
const cards = () => page().evaluate(() => [...document.querySelectorAll('[data-card]')].map(c => c.dataset.card))
const card = file => `[data-card="${file}"]`
const bodyHash = file => core.bodyHashOf(readFileSync(join(vault, file)))
const untouched = files => { const now = hashTree(vault); for (const f of files) assert.equal(now[f], before[f], `${f} is byte for byte what it was`) }

async function openPending() {
  // v2 package I: from 新建库 (its own sidebar): the page loaded again opens on the current library, the folder just imported
  if (await page().evaluate(() => document.querySelector('main[data-screen="new-library"]') !== null)) {
    await page().evaluate(() => { location.hash = ''; location.reload() })
    await ready(page(), 'inbox')
  }
  // v2 package F: 资料库 is a tab of the library's page (from 设置: the library's line first)
  if (await page().evaluate(() => document.querySelector('.st-lib-tabs') === null)) {
    await page().click('[data-library-row][data-active="true"]')
    await until(() => document.querySelector('.st-lib-tabs') !== null)
  }
  await page().click('.st-lib-tabs [data-tab="library"]')
  await ready(page(), 'library')
  await page().click('[data-view="pending"]')
  await until(() => document.querySelector('[data-part="tidy"]') !== null && document.querySelectorAll('[data-card]').length > 0)
}

test('新建库 (v2 package I; v1.0: 设置 「打开已有文件夹」) on a folder of .md files: it says how many and writes nothing; 下一步 imports it, every file as it was', async () => {
  await click('[data-action="choose-folder"]')
  await until(() => document.querySelector('.fr-folder') !== null)
  assert.equal(await page().evaluate(() => document.querySelector('.fr-folder').dataset.folderState), 'importable')
  assert.equal(await text('[data-folder-note]'), fmt(FIRST_RUN.folder.importable, { n: seeded.mdCount }))
  assert.equal(existsSync(join(vault, 'streams.json')), false, 'only said, nothing written yet')
  assert.deepEqual(hashTree(vault), before)
  await click('[data-action="next"]')
  await until(() => document.querySelector('main[data-screen="new-library"][data-state="ready"] .fr-body')?.dataset.step === 'pack')
  assert.equal((await page().evaluate(() => window.streams.getAppState())).data.library.path, vault)
  const cfg = JSON.parse(readFileSync(join(vault, 'streams.json'), 'utf8'))
  assert.equal(cfg.notesDir, '.')
  untouched(Object.keys(IMPORT_FILES))
  const added = Object.keys(hashTree(vault)).filter(k => !(k in before)).sort()
  assert.deepEqual(added, ['_pipeline/fetch_log.jsonl', '_pipeline/ledger.jsonl', 'index.jsonl', 'index.meta.json', 'streams.json'])
  pendingBefore = Object.fromEntries(core.listPending(vault).map(p => [p.file, p]))
})

test('待规范 (S8): a card per file, the proposal in the text box, the two that cannot be written say why and have no write button, the sub folder named', async () => {
  await openPending()
  const want = core.listPending(vault).map(p => p.file)
  assert.deepEqual(await cards(), want, 'the cards are the core\'s list, in its order')
  assert.deepEqual(await page().evaluate(() => [...document.querySelectorAll('[data-part="list"] [data-row]')].map(e => e.dataset.row)), want)
  assert.equal(await text('#lib-tidy-title'), fmt(T.heading, { n: want.length }))
  assert.equal(await text('[data-part="tidy"] > p'), T.note)
  assert.equal(await text('[data-part="skipped-dirs"]'), fmt(T.subfolders, { dirs: '旧笔记' }))
  for (const file of seeded.proposable) {
    const p = pendingBefore[file]
    const dated = p.codes.includes('no-frontmatter') || p.codes.includes('missing:date')
    const value = await page().evaluate(s => document.querySelector(`${s} textarea[data-field="header"]`)?.value ?? null, card(file))
    assert.equal(value, headerText(p.proposedHeader, { comments: dated ? { date: T.dateComment } : {} }), file)
    assert.equal(await page().evaluate(s => document.querySelector(`${s} [data-action="apply"] button`) !== null, card(file)), true, `${file} can be written`)
  }
  assert.ok((await page().evaluate(s => document.querySelector(`${s} textarea`).value, card('记忆方案选型.md'))).includes('title: 记忆方案选型'), 'control: the title comes from the "# heading"')
  const bad = card('会议记录(草稿).md')
  assert.equal(await page().evaluate(s => document.querySelector(s).dataset.nameOk, bad), 'false')
  assert.equal(await text(`${bad} [data-card-why]`), fmt(T.badName, { name: '会议记录(草稿)' }))
  assert.equal(await page().evaluate(s => document.querySelector(`${s} [data-action="apply"]`) === null && document.querySelector(`${s} textarea`) === null, bad), true, 'no text box, no write button')
  const broken = card('坏了的文件头.md')
  assert.equal(await text(`${broken} [data-card-why]`), fmt(T.notProposable, { problems: T.codes['bad-frontmatter'] }))
  assert.equal(await page().evaluate(s => document.querySelector(`${s} [data-action="apply"]`) === null, broken), true)
  assert.equal(await page().evaluate(() => document.querySelector('[data-action="apply-all"] button').disabled), false)
})

test('control: a text box line that cannot be read is refused on the page, the file untouched', async () => {
  const sel = `${card('2025-读书笔记.md')} textarea[data-field="header"]`
  const original = await page().evaluate(s => document.querySelector(s).value, sel)
  await page().fill(sel, `${original}\n这一行没有冒号`)
  await page().click(`${card('2025-读书笔记.md')} [data-action="apply"] button`)
  await until(s => document.querySelector(`${s} [data-card-error]`) !== null, card('2025-读书笔记.md'))
  assert.equal(await text(`${card('2025-读书笔记.md')} [data-card-error]`), fmt(T.parseFailed, { line: original.split('\n').length + 1 }))
  untouched(['2025-读书笔记.md'])
  await page().fill(sel, original)
})

test('「跳过」 writes nothing and hides the card; opened again, the card is back', async () => {
  await page().click(`${card('untitled.md')} [data-action="skip"] button`)
  await until(s => document.querySelector(s) === null, card('untitled.md'))
  assert.equal(await page().evaluate(() => document.querySelector('[data-part="skipped-line"]').dataset.count), '1')
  untouched(['untitled.md'])
  // away and back: the page forgets the skip, the file is still to tidy
  // redesign R1: 概览 is gone — away to 来源与要求 instead
  await page().click('.st-lib-tabs [data-tab="sources"]')
  await ready(page(), 'sources')
  await openPending()
  assert.ok((await cards()).includes('untitled.md'))
  untouched(['untitled.md'])
})

test('「写入这一个」 with a changed title: the title on disk is the changed one, the body byte for byte the old file, the file is in 我写的', async () => {
  const file = '记忆方案选型.md'
  const sel = `${card(file)} textarea[data-field="header"]`
  const original = await page().evaluate(s => document.querySelector(s).value, sel)
  assert.ok(original.includes('title: 记忆方案选型'))
  const authoredBefore = Number(await page().evaluate(() => document.querySelector('[data-view="authored"]').dataset.count))
  await page().fill(sel, original.replace('title: 记忆方案选型', 'title: 改过的标题'))
  await page().click(`${card(file)} [data-action="apply"] button`)
  await until(s => document.querySelector(s) === null && document.querySelector('[data-part="written"]') !== null, card(file))
  assert.equal(await text('[data-part="written"]'), fmt(T.written, { file, view: LIBRARY.views.authored }))
  const disk = readFileSync(join(vault, file), 'utf8')
  const meta = core.parseFrontmatter(disk).meta
  assert.equal(meta.title, '改过的标题')
  assert.equal(meta.source, `file:${file}`)
  assert.equal(meta.status, 'authored')
  assert.equal(core.validateNote({ fileName: file, text: disk, config: null }).ok, true)
  assert.equal(bodyHash(file), pendingBefore[file].bodyHash, 'the body is the old file byte for byte')
  assert.ok(readFileSync(join(vault, file)).subarray(-Buffer.byteLength(IMPORT_FILES[file])).equals(Buffer.from(IMPORT_FILES[file], 'utf8')), 'CRLF and no final newline kept')
  await until(n => Number(document.querySelector('[data-view="authored"]')?.dataset.count) === n, authoredBefore + 1)
  assert.ok(core.readIndex(vault).some(e => e.id === '记忆方案选型' && e.title === '改过的标题'))
  await page().click('[data-view="authored"]')
  await until(() => document.querySelector('[data-part="list"] [data-row="记忆方案选型"]') !== null)
  await page().click('[data-view="pending"]')
  await until(() => document.querySelectorAll('[data-card]').length > 0)
})

test('「全部按拟的写入」 writes every file it can, says which it could not; the two that cannot stay as cards and as they were', async () => {
  await click('[data-action="apply-all"]')
  await until(() => document.querySelector('[data-part="apply-all-result"]') !== null)
  const result = await page().evaluate(() => { const e = document.querySelector('[data-part="apply-all-result"]'); return [e.dataset.written, e.dataset.left] })
  assert.deepEqual(result, ['2', '2'])
  await until(() => document.querySelectorAll('[data-card]').length === 2)
  assert.deepEqual((await cards()).sort(), [...seeded.badName, ...seeded.notProposable].sort())
  for (const file of ['2025-读书笔记.md', 'untitled.md']) {
    assert.equal(bodyHash(file), pendingBefore[file].bodyHash, file)
    assert.equal(core.validateNote({ fileName: file, text: readFileSync(join(vault, file), 'utf8'), config: null }).ok, true, file)
  }
  untouched([...seeded.badName, ...seeded.notProposable, ...seeded.conforming, '旧笔记/2024.md', '.obsidian/app.json'])
  assert.deepEqual(core.readIndex(vault).map(e => e.id).sort(), ['2025-读书笔记', 'untitled', '已经合规范', '记忆方案选型'].sort())
  assert.deepEqual(readdirSync(vault).filter(f => f.endsWith('.tmp')), [])
  assert.deepEqual(m.errors, [])
})

// ---- 首次设置 with that folder ----

let vaultF = null
let beforeF = null
const f = worldSession({
  kind: 'empty',
  waitFor: 'first-run',
  settings: NO_SCHEDULE,
  prepare: world => {
    vaultF = join(world.root, 'vault')
    seedImportFolder(vaultF)
    beforeF = hashTree(vaultF)
  },
  env: () => ({ STREAMS_DEV_LIBRARY: '', STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_CHOOSE_FOLDER: vaultF }),
})

test('首次打开 → 和主 Agent 聊 → 也可以手动新建 → 新建库 step 1 on a folder of .md files: it says how many and that nothing is moved; 下一步 opens it as a library, the files as they were', async () => {
  await f.page.waitForFunction(() => document.querySelectorAll('[data-connection]').length === 3, null, POLL)
  await f.page.click('[data-action="skip"] button')
  await ready(f.page, 'chat')
  await f.page.click('[data-action="manual-new"] button')
  await ready(f.page, 'new-library')
  await f.page.click('[data-action="choose-folder"] button')
  await f.page.waitForFunction(() => document.querySelector('[data-folder-path]') !== null, null, POLL)
  assert.equal(await f.page.evaluate(() => document.querySelector('.fr-folder').dataset.folderState), 'importable')
  assert.equal(await f.page.evaluate(() => document.querySelector('[data-folder-note]').textContent), fmt(FIRST_RUN.folder.importable, { n: 6 }))
  assert.equal(await f.page.evaluate(() => document.querySelector('[data-action="next"] button').disabled), false)
  assert.equal(existsSync(join(vaultF, 'streams.json')), false)
  await f.page.click('[data-action="next"] button')
  await f.page.waitForFunction(() => document.querySelector('main[data-screen="new-library"][data-state="ready"] .fr-body')?.dataset.step === 'pack', null, POLL)
  assert.equal(JSON.parse(readFileSync(join(vaultF, 'streams.json'), 'utf8')).notesDir, '.')
  const now = hashTree(vaultF)
  for (const [rel, h] of Object.entries(beforeF)) assert.equal(now[rel], h, rel)
  assert.equal((await f.page.evaluate(() => window.streams.getAppState())).data.library.path, vaultF)
  assert.deepEqual(f.errors, [])
})

// ---- the text box's format (plain Node) ----

test('headerText / parseHeaderText: what the core proposes comes back as it was; quoting where the core would read something else', () => {
  const headers = [
    { id: 'x', title: '记忆方案选型', source: 'file:记忆方案选型.md', date: '2026-10-20', status: 'authored', topics: ['未分类'] },
    { id: 'y', title: '2025', source: 'https://x.test/a#b', date: '2026-01-02', status: 'kept', topics: ['agent 记忆', 'a, b', 'true'], extra: 'keep: me', n: 3 },
    { title: '- starts with a dash', topics: ['[x]'], note: "it's \"quoted\"", empty: '' },
  ]
  for (const h of headers) {
    const { id, ...rest } = h
    const r = parseHeaderText(headerText(h, { comments: { date: T.dateComment } }))
    assert.equal(r.ok, true, JSON.stringify(h))
    assert.deepEqual(r.header, rest)
    // and the core's own reader reads the same text (as front matter) the same way
    assert.deepEqual(core.parseFrontmatter(`---\n${headerText(h)}\n---\n`).meta, rest)
  }
  assert.equal(headerText({ scores: { relevance: { score: 1 } }, title: 't' }), 'title: t', 'nested values are not shown (the core keeps them)')
  assert.deepEqual(parseHeaderText('title: a\nno colon here'), { ok: false, line: 2 })
  assert.deepEqual(parseHeaderText('title: a\ntitle: b'), { ok: false, line: 2 }, 'a key twice')
  assert.deepEqual(parseHeaderText('topics: [a, '), { ok: false, line: 1 })
  assert.deepEqual(parseHeaderText('  title: indented'), { ok: false, line: 1 })
  assert.deepEqual(parseHeaderText('# a comment\n\ndate: 2026-10-20  # 取文件修改时间'), { ok: true, header: { date: '2026-10-20' } })
})
