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
// Redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-4; design P12): 「待规范」 is no tab of 资料库 any more — the page is reached
// from 资料库's line 「n 个文件缺少文件头，尚未入库。 去处理」 (only while there are such files), its words are 05-措辞规范's (写入 ·
// 跳过 · 全部写入 · 建议的文件头（可编辑）), the files are not listed a second time on its left, and 我的笔记's number is read back in
// 资料库 (← 返回资料库). Only the way there and those places changed; what is checked of the cards, the writes and the bodies is
// as it was. Added: before a header is written, the file is in no list of 资料库 (全部 = the index).
// Redesign R4a (docs/checks/2026-11-12-r4a/contract.md R4a-3, F57): 新建库 is one page — the folder is chosen with 「更改…」 on its
// 存储位置 line (the same hook, STREAMS_DEV_CHOOSE_FOLDER), the line says how many .md the folder holds and that nothing is moved or
// changed (NEW_LIBRARY.folderStates.importable), and 「仅创建」 (with a name and 追踪要求, which the form requires) opens it as a
// library and goes to its 待看 — v2 package I's 「下一步」 and pack step are gone. Session F reaches 新建库 from 首次打开's
// 「手动创建」 (首次打开 is one screen now). What is checked of the folder is as it was (nothing written before, every file byte for
// byte after, notesDir "."), and the files the import adds now include _pipeline/changes.jsonl (the form's settings are the user's
// own: 「谁定的」, as every change the user makes).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { LIBRARY } from '../src/renderer/texts/library.js'
import { NEW_LIBRARY } from '../src/renderer/texts/first-run.js'
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
  // redesign R3: the line that leads to the page (was the 待规范 tab)
  await until(() => document.querySelector('[data-part="missing-header-hint"] [data-action="go-missing-header"] button') !== null)
  await click('[data-part="missing-header-hint"] [data-action="go-missing-header"]')
  await until(() => document.querySelector('[data-part="missing-header"]') !== null && document.querySelectorAll('[data-card]').length > 0)
}
/** ← 返回资料库 (redesign R3), and the number 我的笔记 has there. */
async function backToLibrary() {
  await click('[data-action="back-to-library"]')
  await until(() => document.querySelector('[data-view="authored"]')?.dataset.count !== undefined && document.querySelector('[data-part="missing-header"]') === null)
  return Number(await page().evaluate(() => document.querySelector('[data-view="authored"]').dataset.count))
}

test("新建库 (v2 package I; redesign R4a: the one-page form's 更改…) on a folder of .md files: it says how many and writes nothing; 仅创建 imports it, every file as it was", async () => {
  await until(() => document.querySelector('main[data-screen="new-library"][data-state="ready"] [data-part="folder-state"]')?.dataset.state !== '')
  await click('[data-action="change-folder"]')
  await until(p => document.querySelector('[data-part="location"]')?.dataset.path === p, vault)
  assert.equal(await page().evaluate(() => document.querySelector('[data-part="folder-state"]').dataset.state), 'importable')
  assert.equal(await text('[data-part="folder-state"]'), fmt(NEW_LIBRARY.folderStates.importable, { n: seeded.mdCount }))
  assert.equal(existsSync(join(vault, 'streams.json')), false, 'only said, nothing written yet')
  assert.deepEqual(hashTree(vault), before)
  await page().fill('[data-field="name"]', 'vault')
  await page().fill('[data-field="brief"]', '我自己的笔记。')
  await click('[data-action="create-only"]')
  await ready(page(), 'inbox')
  assert.equal((await page().evaluate(() => window.streams.getAppState())).data.library.path, vault)
  const cfg = JSON.parse(readFileSync(join(vault, 'streams.json'), 'utf8'))
  assert.equal(cfg.notesDir, '.')
  untouched(Object.keys(IMPORT_FILES))
  const added = Object.keys(hashTree(vault)).filter(k => !(k in before)).sort()
  assert.deepEqual(added, ['_pipeline/changes.jsonl', '_pipeline/fetch_log.jsonl', '_pipeline/ledger.jsonl', 'index.jsonl', 'index.meta.json', 'streams.json'])
  pendingBefore = Object.fromEntries(core.listPending(vault).map(p => [p.file, p]))
})

test('缺少文件头 (S8, redesign R3 P12): a card per file, the proposal in the text box, the two that cannot be written say why and have no write button, the sub folder named', async () => {
  // redesign R3: before 去处理, 资料库's 全部 lists the index only — none of these files is in it — and the line says how many
  const want = core.listPending(vault).map(p => p.file)
  await page().evaluate(() => { location.hash = ''; location.reload() })
  await ready(page(), 'inbox')
  await page().click('.st-lib-tabs [data-tab="library"]')
  await ready(page(), 'library')
  await until(n => document.querySelector('[data-part="missing-header-hint"]')?.dataset.count === String(n), want.length)
  const listed = await page().evaluate(() => [...document.querySelectorAll('[data-part="list"] [data-row]')].map(e => e.dataset.row))
  assert.deepEqual(listed, core.listLibrary(vault, { view: 'all' }).items.map(i => i.id))
  for (const file of want) assert.ok(!listed.includes(file.replace(/\.md$/, '')), `${file}: not in 资料库 before its header is written`)
  await openPending()
  assert.deepEqual(await cards(), want, 'the cards are the core\'s list, in its order')
  assert.equal(await text('[data-part="missing-header"] #library-title'), fmt(T.heading, { n: want.length }))
  assert.equal(await text('[data-part="missing-header"] .intro-copy'), T.note)
  assert.equal(T.note, '这些文件已存在于库文件夹中（例如在 Obsidian 中创建的笔记），流息尚未对其做任何修改。写入文件头后方可入库，正文内容不会被改动。')
  assert.ok((await text(`${card('untitled.md')} [data-part="card-codes"]`)).includes(T.codes['no-frontmatter']), '缺少文件头 on the card')
  assert.equal(T.codes['no-frontmatter'], '缺少文件头')
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
  const authoredBefore = core.libraryCounts(vault).authored
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
  assert.ok(core.readIndex(vault).some(e => e.id === '记忆方案选型' && e.title === '改过的标题'))
  // redesign R3: 我的笔记's number is in 资料库 (back there), and the file is listed under it now
  assert.equal(await backToLibrary(), authoredBefore + 1)
  await page().click('[data-view="authored"]')
  await until(() => document.querySelector('[data-part="list"] [data-row="记忆方案选型"]') !== null)
  await openPending()
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

test("首次打开 → 手动创建 → 新建库 (redesign R4a: one page) with 更改… on a folder of .md files: it says how many and that nothing is moved; 仅创建 opens it as a library, the files as they were", async () => {
  await f.page.waitForFunction(() => document.querySelector('[data-part="first-run"]')?.dataset.view === 'home', null, POLL)
  await f.page.click('[data-action="manual-new"] button')
  await ready(f.page, 'new-library')
  await f.page.waitForFunction(() => document.querySelector('[data-part="folder-state"]')?.dataset.state !== '', null, POLL)
  await f.page.click('[data-action="change-folder"] button')
  await f.page.waitForFunction(p => document.querySelector('[data-part="location"]')?.dataset.path === p, vaultF, POLL)
  assert.equal(await f.page.evaluate(() => document.querySelector('[data-part="folder-state"]').dataset.state), 'importable')
  assert.equal(await f.page.evaluate(() => document.querySelector('[data-part="folder-state"]').textContent), fmt(NEW_LIBRARY.folderStates.importable, { n: 6 }))
  assert.equal(existsSync(join(vaultF, 'streams.json')), false)
  await f.page.fill('[data-field="name"]', 'vault')
  await f.page.fill('[data-field="brief"]', '我自己的笔记。')
  assert.equal(await f.page.evaluate(() => document.querySelector('[data-action="create-only"] button').disabled), false)
  await f.page.click('[data-action="create-only"] button')
  await ready(f.page, 'inbox')
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
