// Redesign R6b-3 (docs/checks/2026-11-13-r6b/contract.md 「英文逐屏真窗口测试」): the 21 screens of the design's list
// (docs/design/redesign/source/07-模板版/画面清单.json) in the real window with the interface in English — every piece of text
// a person can see on each (text nodes of rendered elements, aria-label / title / placeholder / alt, the values of fields,
// the window's title) has no Chinese character and no full-width punctuation mark, except what the user wrote.
//
// How each screen is reached: as the pictures of R1–R6a reach it (docs/checks/2026-11-13-r6b/survey/shots.md §2 — scripts/
// shots-r2 … r6a), on worlds under the OS temp folder: the shelf's three libraries (test/support/seed.mjs), the fake
// connection, the detection / the build conversation / 问库 scripted, feeds and a site on this machine. The dialogs are opened.
// 1.1 W7b: 新建库 (new) and 主 Agent (agent) are the build page — its one sentence and its conversation; v1.0's 新建库 form, v2's
// main agent chat, 系统检测, 未通过筛选, 待评分 and 评分环节 are gone. A library of the seed is one the last version made (it
// opens, its 来源与要求 is read only); 运行与排队 and 连接出问题 run on libraries with a card.
//
// The user's own content. The seeded worlds are Chinese (library names, briefs, topics, item titles, summaries a model
// wrote, notes): those words are the user's, shown as they are in any language (05 规则 10). They are told apart by where
// they come from, not by a list: a run of Chinese characters / full-width marks on the screen is the user's only if that
// exact run stands in the world's own files — the library folders (streams.json, notes/, _pipeline/), the folder new
// libraries go to, the scripts this test wrote for the stand-in model, the list of libraries (libraries.json: the names
// and marks the user gave them) — or in what this test typed. The rest of the app's own data folder is NOT part of it
// (what the app itself writes there must be English). A run is a whole text node's stretch, so a
// mark the app puts beside a user's word (「记忆方案（」) is not in the files and is reported; a mark standing alone
// between other characters (「rule（locked」) is looked up with the three characters on each side of it, because the mark
// by itself is in every Chinese file; a short run (fewer than four Chinese characters: 新, 追踪) is inside some sentence of
// every Chinese world, so it is the user's only as a whole value the user gave (a string of its own in the world's JSON: a
// topic, a keyword, a name, a mark), as the whole piece of text standing in the files as a run of its own, or
// together with the three characters on one side of it (the rest of the user's words it is part of) — not as a bare
// word beside the app's text (redesign R6b precheck). Everything this test types or
// scripts itself is English. One glyph is allowed by name: the Chinese language's own name in 设置's language chooser.
// The libraries are set to English before the app starts (a library made under an English interface is English:
// its instructions and its 问库 rules follow the library's language, docs/desktop.md §六).
//
// Controls. In-process: the same check on a screen's texts with a dictionary word in Chinese added, with a full-width mark
// beside English added, with a mark beside a user's word added — each reported; the user's own words alone — not reported.
// On a broken copy (scripts/mutation-check.mjs r6b-en-*): an English key put back in Chinese, a full-width mark put back
// in a screen — this file's tests fail.
//
// Pictures: each screen is also saved as <id>.png (研究对话, 浅色) — into STREAMS_EN_SHOTS_DIR when it is set
// (docs/shots/2026-11-13-r6b/en/ was made that way), otherwise into a temp folder removed at the end.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeApp } from '../scripts/lib/close-app.mjs'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'
import { launch, ready } from './support/app.mjs'
import { seedPlanB, seedShelf } from './support/seed.mjs'
import { seedQueue, startHoldingFeed } from './support/queue-world.mjs'
import { seedReaderLibrary, startReaderSite } from './support/reader-site.mjs'
import { BAR_HEIGHT, READER_PARTITION } from '../src/main/reader.mjs'
import { quietCard } from './support/card-world.mjs'
import { SHELL as SHELL_ZH } from '../src/renderer/texts/shell.js'
import { SHELL as SHELL_EN } from '../src/renderer/texts-en/shell.js'
import { SETTINGS as SETTINGS_EN } from '../src/renderer/texts-en/settings.js'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
// v1.0's default steps in English, for a library of the last version made under an English interface (tests may use core/legacy)
const legacy = await import(pathToFileURL(join(REPO_DIR, 'core', 'legacy', 'index.mjs')).href)

// ---- the design's 21 screens -------------------------------------------------------------------------------------------------
const LIST = JSON.parse(readFileSync(join(REPO_DIR, 'docs', 'design', 'redesign', 'source', '07-模板版', '画面清单.json'), 'utf8'))
const SCREENS = [...new Set(LIST.map(x => x.screen))]
const POLL = { polling: 100, timeout: 60_000 }
const SHOTS_KEPT = Boolean(process.env.STREAMS_EN_SHOTS_DIR)
const SHOTS = SHOTS_KEPT ? resolve(process.env.STREAMS_EN_SHOTS_DIR) : tempDir('st-en-shots-')
mkdirSync(SHOTS, { recursive: true })
after(() => { if (!SHOTS_KEPT) removeTree(SHOTS, { waitMs: 5_000 }) })

/** id → { texts: number, problems: string[] } for every screen looked at. */
const seen = new Map()

// ---- what is on the screen ---------------------------------------------------------------------------------------------------
const range = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`
const WIDE_CLASS = `${range(0x3000, 0x303F)}${range(0x3400, 0x9FFF)}${range(0xFF00, 0xFFEF)}`
/** A stretch of Chinese characters and full-width marks (CJK punctuation U+3000–303F, the ideographs, the full-width forms). */
const WIDE_RUN = new RegExp(`[${WIDE_CLASS}]+`, 'g')
const IDEOGRAPH = new RegExp(`[${range(0x3400, 0x9FFF)}]`)
/** The one glyph an English screen shows on purpose (texts-en.test.mjs GLYPHS): the Chinese language's own name. */
const GLYPH = SETTINGS_EN.languages['zh-CN']

/**
 * Runs in a page: every piece of text a person can see there — [{ where, text }]. Text nodes whose element is rendered
 * (Element.checkVisibility: not display:none, not visibility:hidden, not inside a closed <details> or a closed dialog),
 * the aria-label / title / placeholder / alt of rendered elements, what fields hold, and the document's title.
 */
function visibleTexts() {
  const out = []
  const where = el => {
    const parts = []
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      const d = e.dataset ?? {}
      const mark = d.part ? `[part=${d.part}]` : d.action ? `[action=${d.action}]` : d.screen ? `[screen=${d.screen}]` : d.dialog ? `[dialog=${d.dialog}]` : e.id ? `#${e.id}` : (e.classList?.[0] ? `.${e.classList[0]}` : '')
      parts.unshift(`${e.tagName.toLowerCase()}${mark}`)
    }
    return parts.join(' > ')
  }
  const shown = el => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) : el.getClientRects().length > 0)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName)) continue
    if (n.nodeValue.trim() === '') continue
    // an <option> is drawn by its <select>
    const box = el.tagName === 'OPTION' ? el.closest('select') : el
    if (!box || !shown(box)) continue
    out.push({ where: where(el), text: n.nodeValue })
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (!shown(el)) continue
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = el.getAttribute(a)
      if (v && v.trim() !== '') out.push({ where: `${where(el)} @${a}`, text: v })
    }
    if ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'hidden', 'password'].includes(el.type)) || el.tagName === 'TEXTAREA') {
      if (el.value && el.value.trim() !== '') out.push({ where: `${where(el)} value`, text: el.value })
    }
  }
  out.push({ where: 'document.title', text: document.title })
  return out
}

/** The world's own words: every text file of the library folders and of what this test wrote beside them (never the app's data folder). */
function corpusOf(root, typed) {
  const parts = [...typed]
  const TEXT = new Set(['.json', '.jsonl', '.md', '.txt', '.yaml', '.yml', '.xml', '.html'])
  const skip = [join(root, 'world', 'app-data'), join(root, 'world', 'local-data')]
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (skip.includes(p)) continue
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) walk(p)
      else if (TEXT.has(extname(name).toLowerCase()) && st.size < 8_000_000) { try { parts.push(readFileSync(p, 'utf8')) } catch { /* in use: not the user's words then */ } }
    }
  }
  walk(root)
  // the one file of the app's data folder that holds the user's words: the list of libraries (the name and the one-character
  // mark the user gave each — they can differ from the folder's own streams.json)
  try { parts.push(readFileSync(join(root, 'world', 'app-data', 'libraries.json'), 'utf8')) } catch { /* no library yet */ }
  return parts.join('\n')
}

const IDEOGRAPHS = new RegExp(`[${range(0x3400, 0x9FFF)}]`, 'g')
/** Fewer Chinese characters than this in a stretch: a word short enough to stand inside any Chinese sentence (新, 追踪). */
const SHORT = 4
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whether `run` stands in the corpus as a whole stretch of its own: not inside a longer stretch of Chinese / full-width marks. */
const standsAlone = (corpus, run) => new RegExp(`(?<![${WIDE_CLASS}])${escapeRe(run)}(?![${WIDE_CLASS}])`).test(corpus)

/** The Chinese / full-width stretches of the texts that are not the user's: [`where: 「run」 in 「text」`]. */
function wideProblems(texts, corpus, { glyph = false } = {}) {
  const problems = []
  for (const { where, text } of texts) {
    for (const m of text.matchAll(WIDE_RUN)) {
      const run = m[0]
      if (glyph && run === GLYPH && text.trim() === GLYPH) continue
      // a mark alone (「（」, 「：」) is in every Chinese text, so it is the user's only together with the three characters on each
      // side of it in this piece of text
      if (!IDEOGRAPH.test(run)) {
        if (corpus.includes(text.slice(Math.max(0, m.index - 3), m.index + run.length + 3))) continue
      } else if ((run.match(IDEOGRAPHS) ?? []).length < SHORT) {
        // redesign R6b precheck (adversarial M1): a short stretch (新, 追踪) is inside some Chinese sentence of the world almost
        // always — 「…评测的新动态」 — so a dictionary word put back in Chinese passed as the user's. It is the user's only
        //   - where it is a whole value the user gave, a string of its own in the world's JSON (a topic, a keyword, a name, a
        //     mark: 「"评测"」 — shown between the app's separators, 「mcp-news / 评测 · agent 记忆」), or
        //   - where it is the whole piece of text and stands in the files as a stretch of its own (「**记忆**」 of a note), or
        //   - together with the three characters on one side of it in this piece of text (the rest of the user's words it is
        //     part of: 「追踪 ag」 of a brief, 「nt 记」 of a title cut short) —
        // not as a bare word beside the app's own text or beside another stretch: 「追踪 追踪 agent…」, 「新 Letta …」
        const left = m.index > 0 ? text.slice(Math.max(0, m.index - 3), m.index) + run : null
        const end = m.index + run.length
        const right = end < text.length ? run + text.slice(end, end + 3) : null
        if (corpus.includes(`"${run}"`)) continue
        if (text.trim() === run && standsAlone(corpus, run)) continue
        if ((left && corpus.includes(left)) || (right && corpus.includes(right))) continue
      } else if (corpus.includes(run)) continue
      problems.push(`${where}: 「${run}」 in 「${text.trim().slice(0, 80)}」`)
    }
  }
  return problems
}

// ---- one run of the app ------------------------------------------------------------------------------------------------------
function quotaFile(root) {
  const file = join(root, 'quota.json')
  const now = Math.floor(Date.now() / 1000)
  writeFileSync(file, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [
    { id: 'five_hour', usedPercent: 8, resetsAt: now + 4 * 3600 },
    { id: 'seven_day', usedPercent: 26, resetsAt: now + 3 * 86400 },
  ] } }))
  return file
}
const DETECT_OK = { 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } }

/** A library made under an English interface is an English library: its language, before the app starts. */
function englishLibrary(dir) {
  const file = join(dir, 'streams.json')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  // the pipeline a library gets when it is made in English (createLibrary(dir, { language: 'en' })): its language and the
  // default instructions of its steps in English — what the seed wrote in Chinese is the default of a Chinese library
  config.pipeline = { ...(config.pipeline ?? {}), ...legacy.DEFAULT_PIPELINE('en') }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

/**
 * One run of the app in English on a fresh world. `kind` 'empty' (no library: 首次打开) or 'seeded' (the shelf's three
 * libraries, plan B's notes when `planB`); `prepare({ world, shelf, root })` writes the data before the start and may return
 * { env, cleanup }. `work(t)` drives the page; t.see(id) looks at a screen: its texts checked, its picture saved.
 */
async function session({ kind = 'seeded', planB = false, start = null, detect = DETECT_OK, connection = 'fake', settings = {}, prepare = null }, work) {
  const root = tempDir('st-en-screens-')
  let app = null
  let cleanup = null
  try {
    const world = await makeWorld({ root, kind })
    let shelf = null
    if (kind === 'seeded') {
      if (planB) await seedPlanB(world)
      shelf = await seedShelf(world)
      for (const dir of shelf.dirs) englishLibrary(dir)
    }
    const typed = []
    const extra = prepare ? (await prepare({ world, shelf, root })) ?? {} : {}
    cleanup = extra.cleanup ?? null
    const detectFile = join(root, 'detect.json')
    writeFileSync(detectFile, JSON.stringify(detect), 'utf8')
    const env = {
      STREAMS_DEV_CONNECTION: connection, STREAMS_DEV_DETECT: detectFile, STREAMS_DEV_LIBRARY: '', STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'),
      STREAMS_DEV_QUOTA: quotaFile(root), ...(start ? { STREAMS_START_SCREEN: start } : {}), ...(extra.env ?? {}),
    }
    const started = await launch(world, { env, settings: { language: 'en', theme: 'research', appearance: 'light', panel: { open: true, tab: 'detail' }, ...(kind === 'seeded' ? { connections: { active: 'claude-code' } } : {}), ...settings } })
    app = started.app
    const page = started.page
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    const until = (fn, arg) => page.waitForFunction(fn, arg, POLL)
    await ready(page, start ?? 'first-run')
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en', 'the interface is in English')
    const tab = async name => {
      if (await page.evaluate(() => document.querySelector('[data-part="right-panel"]')?.dataset.open === 'false')) await page.click('[data-action="unfold"] button')
      await page.click(`[data-panel-tab="${name}"]`)
      await until(x => document.querySelector('[data-part="right-panel"]')?.dataset.tab === x, name)
    }
    const picture = async file => {
      for (let i = 0; ; i++) {
        try { await page.screenshot({ path: file, timeout: 20_000 }); return } catch (err) {
          if (i === 2) throw err
          await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.showInactive() })
          await page.waitForTimeout(500)
        }
      }
    }
    /** Look at a screen: every visible text checked against the world's own words, the picture saved. Returns the texts. */
    const see = async (id, { glyph = false, texts: given = null, shot = null } = {}) => {
      assert.ok(SCREENS.includes(id), `${id} is one of the design's screens`)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(400)
      const texts = given ?? await page.evaluate(visibleTexts)
      const corpus = corpusOf(root, typed)
      const problems = wideProblems(texts, corpus, { glyph })
      seen.set(id, { texts: texts.length, problems })
      if (shot) await shot(join(SHOTS, `${id}.png`))
      else await picture(join(SHOTS, `${id}.png`))
      assert.ok(texts.length >= 8, `${id}: the screen has text (${texts.length} pieces)`)
      assert.deepEqual(problems, [], `${id}: Chinese or full-width marks that are not the user's own`)
      return { texts, corpus }
    }
    await work({ page, app, until, tab, see, world, shelf, root, typed })
    assert.deepEqual(errors, [], 'no page errors')
  } finally {
    if (app) await closeApp(app, { userDataDir: join(root, 'world', 'app-data', 'electron') })
    if (cleanup) await cleanup()
    removeTree(root, { waitMs: 15_000 })
  }
}

// ---- the 21 screens ----------------------------------------------------------------------------------------------------------
test('firstrun · 首次打开 in English', async () => {
  await session({ kind: 'empty', settings: { panel: { open: true, tab: 'detail' } } }, async t => {
    await t.until(() => document.querySelector('[data-part="first-run"][data-view="home"] [data-part="current-connection"][data-kind="claude-code"]') !== null)
    await t.see('firstrun')
  })
})

test('connect · 连接选择 in English', async () => {
  await session({ kind: 'empty', detect: { 'claude-code': { installed: true, loggedIn: false, version: '2.1.287' }, codex: { installed: false } } }, async t => {
    await t.until(() => document.querySelector('[data-part="first-run"][data-view="pick"] [data-connection="claude-code"][data-conn-state="not-logged-in"]') !== null)
    await t.see('connect')
  })
})

test('shelf · 库架 in English', async () => {
  await session({ start: 'shelf', settings: { panel: { open: true, tab: 'progress' } } }, async t => {
    await t.until(sel => document.querySelector(sel) !== null, `[data-shelf-card="${t.shelf.ids[0]}"]`)
    const { texts } = await t.see('shelf')
    // the page really is the English one, and the user's own words really are on it (the check is not passing on an empty page)
    assert.ok(texts.some(x => x.text.trim() === SHELL_EN.shelf.title), 'the shelf\'s English title is on the screen')
    assert.ok(texts.some(x => x.text.includes(t.shelf.names[1])), 'a library\'s own (Chinese) name is on the screen, as the user wrote it')
  })
})

// the build conversation's replies (services/build.mjs devBuildSession): a question, then a whole card whose addresses were read
const BUILD_CARD = {
  name: 'Agent long-term memory',
  definition: { summary: 'A library for long-term memory designs of AI agents and how they are evaluated; only pieces with technical detail or data.', purpose: 'Research', scope: 'Who: labs and tool makers; field: AI agents; region: anywhere; size: any', exclude: 'Marketing pieces', trust: 'Papers and project pages', rhythm: 'Once a day', language: 'English', hard: 'Each item names its source' },
  decide: [{ what: 'Keep product announcements', default: 'No' }], collect: ['Memory designs', 'Memory evaluations'], skip: ['Marketing'],
  sources: [{ name: 'memory feed', url: 'https://example-a.test/feed.xml', status: 'readable' }],
  unreadable: [{ name: 'a members area', url: 'https://example-c.test/members', reason: 'sign-in required' }],
  pick: ['New results first'], write: ['Give the numbers'], samples: [{ title: 'A memory benchmark', url: 'https://example-b.test/1', date: '2026-11-20' }],
}
const BUILD_REPLIES = { replies: [
  { json: { say: 'One question first.', question: { text: 'What will you use the library for?', kind: 'input' } } },
  { json: { say: 'The library card is ready. Have a look.', card: BUILD_CARD }, reads: ['https://example-a.test/feed.xml', 'https://example-b.test/1', 'https://example-c.test/members'].map(url => ({ url, ok: true })) },
] }

test('agent · 主Agent in English', async () => {
  await session({
    start: 'build', settings: { panel: { open: true, tab: 'decide' } },
    prepare: ({ root }) => {
      const replies = join(root, 'build-replies.json')
      writeFileSync(replies, JSON.stringify(BUILD_REPLIES), 'utf8')
      return { env: { STREAMS_DEV_BUILD: replies } }
    },
  }, async t => {
    const { page, until } = t
    const sentence = 'I want to follow long-term memory designs for AI agents and how they are evaluated, no marketing.'
    t.typed.push(sentence)
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"] [data-action="start"] button') !== null)
    await page.fill('textarea[data-field="opener"]', sentence)
    await page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="talk"] [data-part="question"]') !== null && document.querySelector('textarea[data-field="message"]')?.disabled === false)
    const answer = 'For research on agent memory.'
    t.typed.push(answer)
    await page.fill('textarea[data-field="message"]', answer)
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('article[data-part="build-card"][data-last="true"][data-can-confirm="true"]') !== null && document.querySelector('[data-pane="decide"] [data-part="build-waiting"]') !== null)
    await page.evaluate(() => { const el = document.querySelector('main[data-screen="build"] .thread-scroll'); if (el) el.scrollTop = el.scrollHeight })
    await t.see('agent')
  })
})

test('new · 新建库 in English', async () => {
  await session({ start: 'build' }, async t => {
    const { page, until } = t
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"] [data-field="opener"]') !== null)
    const sentence = 'Track the monthly numbers of new energy cars in China: retail and wholesale, share of sales, battery installations. No car reviews, no promotions.'
    t.typed.push(sentence)
    await page.fill('textarea[data-field="opener"]', sentence)
    await t.see('new')
  })
})

const sha1 = s => createHash('sha1').update(String(s)).digest('hex')

test('inbox · 待看 in English (and the controls of the check itself)', async () => {
  await session({
    planB: true, start: 'inbox',
    prepare: ({ world }) => {
      // the second card carries the mark of 面向 AI 的指令, as a run that found one writes it into the card's file (scripts/shots-r2.mjs)
      const file = join(world.library, '_pipeline', 'inbox', `${sha1(world.seed.inbox[1].url)}.json`)
      const card = JSON.parse(readFileSync(file, 'utf8'))
      card.aiInstruction = true
      card.verification = { ...(card.verification ?? {}), aiInstruction: { source: 'rule', matches: [{ phrase: 'ignore all previous instructions' }] } }
      writeFileSync(file, `${JSON.stringify(card, null, 2)}\n`, 'utf8')
    },
  }, async t => {
    const { page, until } = t
    await until(() => document.querySelectorAll('[data-card]').length === 4)
    const urls = await page.evaluate(() => [...document.querySelectorAll('[data-card]')].map(e => e.dataset.url))
    await page.click(`[data-card][data-url="${urls[2]}"] [data-action="later"] button`)
    await until(() => document.querySelector('[data-part="later"]') !== null)
    await page.click(`[data-card][data-url="${urls[3]}"] [data-action="dismiss"] button`)
    await until(() => document.querySelector('[data-part="dismiss-bar"]') !== null)
    await page.click(`[data-card][data-url="${urls[0]}"] .card-body`)
    await until(u => document.querySelector(`[data-card][data-url="${u}"]`)?.dataset.current === 'true', urls[0])
    await t.tab('detail')
    await until(() => document.querySelector('[data-part="detail-inbox"]') !== null)
    // the verification record opened: its rules are the built-in ones, described in English
    await page.click('[data-part="detail-record"] summary')
    await until(() => document.querySelector('[data-part="detail-record"] .vd[data-state="ready"]') !== null)
    await page.evaluate(() => document.querySelector('.inbox-body')?.scrollTo(0, 0))
    const { texts, corpus } = await t.see('inbox')
    assert.ok(texts.some(x => x.text.trim() === SHELL_EN.tabs.inbox), 'the tab says Inbox')
    assert.ok(texts.some(x => x.text.includes(t.world.seed.inbox[0].title)), 'a card\'s own title is on the screen')

    // ---- controls: the check on this screen's texts with something put in ----
    const zhWord = SHELL_ZH.tabs.library
    assert.equal(corpus.includes(zhWord), false, `control: 「${zhWord}」 is not among the user's own words`)
    assert.equal(wideProblems([...texts, { where: 'control', text: zhWord }], corpus).length, 1, 'a dictionary word in Chinese is reported')
    assert.equal(wideProblems([...texts, { where: 'control', text: 'Built-in rule（locked）' }], corpus).length, 2, 'full-width brackets beside English are reported')
    const topic = t.world.seed.topics[0]
    assert.ok(corpus.includes(topic) && /[㐀-鿿]/.test(topic), `control: the topic 「${topic}」 is the user's and has Chinese in it`)
    assert.deepEqual(wideProblems([{ where: 'control', text: topic }], corpus), [], 'the user\'s own word alone is not reported')
    const cjk = topic.match(WIDE_RUN)[0]
    assert.equal(wideProblems([{ where: 'control', text: `${cjk}（agent memory）` }], corpus).length >= 1, true, 'a full-width mark the app puts beside a user\'s word is reported')
    // a short word in Chinese that the world's sentences hold inside them (「…的新动态」) is still reported, alone and beside a
    // user's words (redesign R6b precheck: these passed before, the run was looked up as a bare substring). It was v1.0's mark
    // 新 (INBOX.card.freshness.new, gone with the scoring in 1.1 W7b); the check is the same with the word written here
    const zhNew = '\u65b0'
    assert.ok(corpus.includes(zhNew) && !standsAlone(corpus, zhNew), `control: 「${zhNew}」 is inside the world's sentences, not a word of its own there`)
    assert.equal(wideProblems([{ where: 'control', text: zhNew }], corpus).length, 1, `「${zhNew}」 alone is reported`)
    assert.equal(wideProblems([{ where: 'control', text: `${zhNew} ${t.world.seed.inbox[0].title}` }], corpus).length, 1, `「${zhNew}」 beside a card's title is reported`)
    assert.deepEqual(wideProblems([{ where: 'control', text: t.world.seed.inbox[0].title }], corpus), [], 'the card\'s title alone (short stretches in it: 发布, ：把) is not reported')
    // a short word the user's brief itself starts with (「追踪 agent …」): the brief is the user's, the same word put before it is not
    const brief = t.shelf.briefs[0]
    const zhTracking = SHELL_ZH.head.tracking.slice(0, 2)
    assert.ok(brief.startsWith(`${zhTracking} `) && standsAlone(corpus, zhTracking) && !corpus.includes(`"${zhTracking}"`), `control: the brief 「${brief}」 starts with 「${zhTracking}」 as a word of its own, not a value of its own`)
    // a short topic of the user's (a whole value in streams.json) between the app's separators is the user's
    const shortTopic = t.world.seed.topics.find(x => (x.match(IDEOGRAPHS) ?? []).length < SHORT && IDEOGRAPH.test(x))
    assert.ok(shortTopic && corpus.includes(`"${shortTopic}"`), `control: a short topic of the seed (${JSON.stringify(t.world.seed.topics)})`)
    assert.deepEqual(wideProblems([{ where: 'control', text: `mcp-news / ${shortTopic} · 3` }], corpus), [], `the short topic 「${shortTopic}」 between separators is not reported`)
    assert.deepEqual(wideProblems([{ where: 'control', text: `Tracking: ${brief}` }], corpus), [], 'the brief after the English label is not reported')
    assert.equal(wideProblems([{ where: 'control', text: `${zhTracking} ${brief}` }], corpus).length, 1, `「${zhTracking}」 put before the brief is reported`)
    assert.equal(wideProblems([{ where: 'control', text: `${zhTracking}: ${brief}` }], corpus).length, 1, `「${zhTracking}:」 put before the brief is reported`)
    assert.equal(wideProblems([{ where: 'control', text: GLYPH }], corpus).length, 1, 'the language\'s own name is allowed only where it is asked for')
    assert.deepEqual(wideProblems([{ where: 'control', text: GLYPH }], corpus, { glyph: true }), [])
  })
})

test('empty · 待看空着时 in English', async () => {
  await session({
    planB: true, start: 'inbox',
    prepare: ({ world }) => {
      const items = core.listInbox(world.library)
      core.keep(world.library, items[0].url)
      core.keep(world.library, items[1].url)
      core.dismiss(world.library, items[2].url, 'Marketing', { quick: 'marketing' })
      core.dismiss(world.library, items[3].url)
    },
  }, async t => {
    await t.until(() => document.querySelector('[data-part="empty"]') !== null && document.querySelector('main [data-part="last-run"]') !== null)
    await t.tab('progress')
    await t.until(() => document.querySelector('[data-part="right-panel"] [data-part="last-run"]') !== null)
    await t.see('empty')
  })
})

test('run · 运行与排队 in English', async () => {
  let feed = null
  await session({
    planB: true, start: 'inbox',
    prepare: async ({ world, shelf }) => {
      feed = await startHoldingFeed({ holdMs: 18_000 })
      const q = await seedQueue(world, shelf, feed, { sources: 2 })
      world.q = q
      return { env: { STREAMS_DEV_NOW: q.now }, cleanup: () => feed.close() }
    },
  }, async t => {
    const { page, until } = t
    const q = t.world.q
    await until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`) !== null, [q.running, q.waiting])
    await page.click(`[data-library-row="${q.running}"]`)
    await until(i => document.querySelector(`.lib-page[data-library="${i}"] main[data-screen="inbox"][data-state="ready"]`) !== null, q.running)
    await until(() => document.querySelector('[data-part="run-steps"]') !== null && document.querySelector('[data-part="running-chip"]') !== null)
    await t.tab('progress')
    await until(() => document.querySelector('[data-part="running"]') !== null)
    await t.see('run')
  })
})

test('expired · 连接出问题 in English', async () => {
  await session({
    start: 'inbox', connection: 'login-expired', settings: { panel: { open: true, tab: 'progress' } },
    prepare: ({ world }) => {
      const dir = world.library
      // 1.1: the library has a card, so 立即运行 is an update — which finds the connection's sign-in expired (W6a B12)
      core.writeCard(dir, quietCard('AI agent memory'))
      // 待看 empty; three runs without output; one source 地址无效 twice in a row (scripts/shots-r5b.mjs)
      for (const it of core.listInbox(dir)) core.keep(dir, it.url)
      const at = i => new Date(Date.now() - (4 - i) * 3_600_000).toISOString()
      appendFileSync(join(dir, '_pipeline', 'rounds.jsonl'), [1, 2, 3].map(i => `${JSON.stringify({ id: `dry-${i}`, startedAt: at(i), finishedAt: at(i), counts: { fetched: 2, new: 0, maybeDuplicates: 0, summarized: 0, inbox: 0 }, gates: {}, calls: 0 })}\n`).join(''), 'utf8')
      for (const i of [2, 3]) core.appendFetchLog(dir, { ts: at(i), round: `dry-${i}`, source: 'mcp-news', kind: 'rss', status: 'gap', hint: 'fix-address-or-remove', count: 0, new: 0, http: 404, message: 'HTTP 404: check the address' })
    },
  }, async t => {
    const { page, until } = t
    await until(() => document.querySelector('[data-part="run-button"][data-run-state="idle"] button')?.disabled === false)
    await page.click('[data-part="run-button"] button')
    await until(() => document.querySelector('.lib-page [data-part="update-banner"][data-code="login-expired"]') !== null)
    await t.see('expired')
  })
})

test('library · edit · header · graph — 资料库, 编辑笔记, 缺少文件头, 图谱 in English', async () => {
  await session({ planB: true, start: 'library' }, async t => {
    const { page, until, world } = t
    const id = world.planB.evals.id
    await until(() => document.querySelector('main[data-screen="library"][data-state="ready"] [data-part="list"] [data-row]') !== null)
    await page.click(`[data-part="list"] [data-row="${id}"]`)
    await until(i => document.querySelector(`[data-reader="${i}"]`) !== null && document.querySelector(`[data-part="note-panel"][data-id="${i}"]`) !== null, id)
    await t.tab('detail')
    await until(() => document.querySelector('[data-part="detail-record"] small')?.textContent.includes('6') === true)
    await t.see('library')

    await page.click('[data-part="item-actions"] [data-action="edit"] button')
    await until(() => document.querySelector('dialog[data-dialog="edit"][open]') !== null)
    await t.see('edit')
    await page.click('[data-action="cancel-edit"] button')
    await until(() => document.querySelector('[data-dialog="edit"]') === null)

    await until(() => document.querySelector('[data-part="missing-header-hint"] [data-action="go-missing-header"] button') !== null)
    await page.click('[data-part="missing-header-hint"] [data-action="go-missing-header"] button')
    await until(() => document.querySelector('[data-part="missing-header"] [data-card]') !== null)
    await t.tab('files')
    await t.see('header')
    await page.click('[data-action="back-to-library"] button')
    await until(() => document.querySelector('[data-part="list"] [data-row]') !== null)
    await t.tab('detail')

    await page.click('[data-part="view-switch"] [data-mode="graph"]')
    await until(() => document.querySelector('main[data-screen="graph"][data-state="ready"] [data-part="graph"] [data-node]') !== null)
    await page.click(`[data-node="topic:${world.seed.topics[0]}"]`)
    await until(() => document.querySelector('[data-part="detail-graph"] [data-part="node-items"] [data-node-item]') !== null)
    await t.see('graph')
  })
})

test('ask · 问库 in English', async () => {
  const QUESTION = 'Which agent memory design does best on long conversations, and what does it cost?'
  await session({
    planB: true, start: 'ask',
    prepare: ({ root }) => {
      const askFile = join(root, 'ask-answer.json')
      writeFileSync(askFile, JSON.stringify({
        answer: [
          { text: 'The evaluation in the library compares five agent memory designs side by side; the authors\' own comes first and layered memory is the baseline.', cites: [1] },
          { text: 'Layered memory keeps the main memory in the context and swaps outside storage in and out as needed; it does best on long conversations.', cites: [2] },
          { text: 'Its cost is one more model call each turn.', cites: [2] },
        ],
        notInLibrary: false,
        missing: 'a direct ranking of the designs when the user comes back a day later',
        claimed: ['json-keys', 'cites-in-set', 'cited-sentences', 'claims-supported'],
      }), 'utf8')
      return { env: { STREAMS_DEV_ASK_SCRIPT: askFile } }
    },
  }, async t => {
    const { page, until } = t
    t.typed.push(QUESTION)
    await page.fill('textarea[data-field="question"]', QUESTION)
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done' && document.querySelector('[data-turn="0"] [data-sentence]') !== null)
    await page.click('[data-turn="0"] [data-action="add-demand"] button')
    await until(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]') !== null)
    await t.tab('detail')
    await until(() => document.querySelector('[data-part="detail-ask"] [data-detail-cite]') !== null)
    await page.evaluate(() => { const b = document.querySelector('.st-ask .thread-scroll'); b?.scrollTo(0, b.scrollHeight) })
    await t.see('ask')
  })
})

test('sources · advanced · remove — 来源与要求, 高级设置, 移除该库 in English (no full-width mark beside a name)', async () => {
  await session({ start: 'sources', settings: { panel: { open: true, tab: 'files' } } }, async t => {
    const { page, until } = t
    // a library the last version made: the notice, its brief and its sources, read only
    await until(() => document.querySelector('main[data-screen="sources"][data-state="ready"] [data-part="old-library"]') && document.querySelectorAll('[data-part="old-sources"] [data-row]').length > 0)
    await t.see('sources')

    // a little history, written the way the page writes it (the library's schedule saved twice), so 变更记录 has lines
    await page.evaluate(async () => {
      const id = (await window.streams.getAppState()).data.library.libraryId
      await window.streams.setLibrarySchedule(id, { enabled: true, time: '07:30' })
      await window.streams.setLibrarySchedule(id, { enabled: false, time: '07:30' })
    })
    await page.click('[data-action="go-advanced"]')
    await until(() => document.querySelector('[data-view="advanced"] [data-part="changes"][data-state="ready"] [data-change-row]') !== null)
    // every fold open, so everything 高级设置 can say is on the screen
    await page.evaluate(() => { for (const d of document.querySelectorAll('main details')) d.open = true })
    const { texts } = await t.see('advanced')
    assert.ok(texts.some(x => x.text.includes('Change history')), 'the change history is on the screen')
    assert.ok(await page.evaluate(() => document.querySelectorAll('[data-change-row][data-field="schedule"][data-by="you"]').length) >= 2, 'the page\'s own changes are in it')

    await page.click('[data-action="remove-library"] button')
    await until(() => document.querySelector('dialog[data-dialog="remove-library"][open]') !== null)
    await t.see('remove')
  })
})

test('settings · apikey · licenses — 设置, 输入 API key, 许可证与致谢 in English', async () => {
  await session({
    start: 'settings', settings: { panel: { open: true, tab: 'progress' } },
  }, async t => {
    const { page, until } = t
    await until(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3 && document.querySelector('[data-part="usage-sum"]') !== null)
    await page.evaluate(() => { document.querySelector('[data-part="advanced"]').open = true })
    const { texts } = await t.see('settings', { glyph: true })
    assert.ok(texts.some(x => x.text.trim() === GLYPH), 'the language chooser names Chinese in Chinese (the one glyph allowed)')
    assert.ok(texts.some(x => x.text.trim() === SETTINGS_EN.conn.use), 'Set as current connection is on the screen')

    await page.evaluate(() => { document.querySelector('.st-main__body').scrollTop = 0 })
    await page.click('[data-connection="api"] [data-action="setup-key"] button')
    await until(() => document.querySelector('dialog[data-dialog="api-key"][open]') !== null)
    await t.see('apikey', { glyph: true })
    await page.click('[data-dialog="api-key"] [data-action="cancel-key"] button')
    await until(() => document.querySelector('[data-dialog="api-key"]') === null)

    await page.click('[data-part="about"] [data-action="licenses"] button')
    await until(() => document.querySelector('dialog[data-dialog="licenses"][open] [data-part="components"]') !== null)
    await t.see('licenses', { glyph: true })
  })
})

test('reader · 阅读窗口 in English (its bar and its reading page)', async () => {
  await session({
    planB: true, start: 'library',
    prepare: async ({ world }) => {
      const site = await startReaderSite()
      await seedReaderLibrary(world.library, site)
      world.site = site
      return { cleanup: () => site.close() }
    },
  }, async t => {
    const { page, app, world } = t
    const inWindow = code => app.evaluate(async ({ BrowserWindow, session: ses }, [partition, js]) => {
      const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses.fromPartition(partition) && w.contentView.children.length > 0)
      if (!win || win.webContents.isLoading() || win.contentView.children[0].webContents.isLoading()) return null
      const bar = await win.webContents.executeJavaScript(js).catch(() => null)
      const view = await win.contentView.children[0].webContents.executeJavaScript(js).catch(() => null)
      return bar === null || view === null ? null : { bar, view }
    }, [READER_PARTITION, code])
    // an English article of the site on this machine (the page is the web's content; the bar and the reading page's own line are the app's)
    const r = await page.evaluate(u => window.streams.openReader(u, 'reader'), world.site.urls.english)
    assert.equal(r.ok, true, JSON.stringify(r))
    let state = null
    for (const end = Date.now() + 60_000; Date.now() < end;) {
      state = await inWindow('[document.querySelector("[data-reader-bar]")?.dataset.mode ?? null, document.documentElement.lang, Boolean(document.querySelector(".reader-title"))]')
      if (state && state.bar[0] === 'reading' && state.view[2] === true) break
      await new Promise(done => setTimeout(done, 150))
    }
    assert.ok(state && state.bar[0] === 'reading' && state.view[2] === true, `the reading window came to the reading page: ${JSON.stringify(state)}`)
    assert.equal(state.bar[1], 'en', 'the bar is the English one')
    const both = await inWindow(`(${visibleTexts.toString()})()`)
    assert.ok(both && both.bar.length >= 4 && both.view.length >= 4, `the bar and the page have text: ${JSON.stringify(both && [both.bar.length, both.view.length])}`)
    const texts = [...both.bar.map(x => ({ ...x, where: `bar ${x.where}` })), ...both.view.map(x => ({ ...x, where: `page ${x.where}` }))]
    const stitched = async file => {
      const png = await app.evaluate(async ({ BrowserWindow, session: ses, nativeImage }, [partition, barHeight]) => {
        const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.session === ses.fromPartition(partition) && w.contentView.children.length > 0)
        if (!win.isVisible()) win.showInactive()
        await new Promise(done => setTimeout(done, 800))
        const bar = (await win.webContents.capturePage()).crop({ x: 0, y: 0, width: win.getContentSize()[0], height: barHeight })
        const pg = await win.contentView.children[0].webContents.capturePage()
        const a = bar.getSize()
        const b = pg.getSize()
        const width = Math.min(a.width, b.width)
        const rows = (img, size) => { const buf = img.toBitmap(); const out = []; for (let y = 0; y < size.height; y++) out.push(buf.subarray(y * size.width * 4, y * size.width * 4 + width * 4)); return out }
        return nativeImage.createFromBitmap(Buffer.concat([...rows(bar, a), ...rows(pg, b)]), { width, height: a.height + b.height }).toPNG().toString('base64')
      }, [READER_PARTITION, BAR_HEIGHT])
      writeFileSync(file, Buffer.from(png, 'base64'))
    }
    await t.see('reader', { texts, shot: stitched })
    assert.ok(texts.some(x => x.where.startsWith('page') && /Reading view/.test(x.text)), 'the reading page\'s own line is the English one')
  })
})

test('all 21 screens of the design\'s list were looked at, each without Chinese or full-width marks of the app\'s own; 21 pictures', () => {
  assert.equal(SCREENS.length, 21, 'the design lists 21 screens')
  assert.deepEqual([...seen.keys()].sort(), [...SCREENS].sort(), 'every one of them was reached')
  for (const [id, r] of seen) assert.deepEqual(r.problems, [], id)
  const pictures = readdirSync(SHOTS).filter(f => f.endsWith('.png')).sort()
  assert.deepEqual(pictures, SCREENS.map(s => `${s}.png`).sort())
  for (const f of pictures) assert.ok(statSync(join(SHOTS, f)).size > 5_000, `${f} is a picture`)
  assert.ok(existsSync(SHOTS))
})
