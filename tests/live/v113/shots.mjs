#!/usr/bin/env node
// 1.1.3 in pictures (赞妮's mock streams-sessions-mock.html, the after side): the real window, Chinese and English, light. No
// connection used — the development connection and a scripted main agent (a script per conversation), on a world made here
// with 维护者's own situation of 11-26 laid down as 1.1.2 left it (a 新建库 conversation where the agent only replied, his
// library with its build kept). Pictures:
//   01 主 Agent after the upgrade: the one-time note, 未建成 / 我的库, 维护者's conversation with 放弃建库 in its head
//   02 his library's conversation: 历史记录, the box (no 开始 page)
//   03 a change going: the line that says what the agent was given, a question
//   04 停止处理 while the agent works (the stop button), 05 after it: the words back in the box
//   06 one at a time: a new library's conversation working (the ring), the library's words waiting (等待主 Agent · 第 1 位)
//   07 the right panel's 待确认 with three cards, the one of this library first (当前库)
//   08 菜单一 (a library's conversation), 09 菜单二 (one not built yet), 10 菜单三 (a card), 11 菜单五 (a library of the sidebar)
//   12 放弃建库's confirmation
//   13 改卡的卡过期: the card cannot be confirmed
//   node tests/live/v113/shots.mjs --out <folder> [--lang zh|en|both]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DESKTOP = join(here, '..', '..', '..', 'desktop')
const imp = p => import(pathToFileURL(join(DESKTOP, p)).href)
const { launch, closeApp } = await imp('test/support/app.mjs')
const { makeWorld } = await imp('scripts/lib/world.mjs')
const { tempDir } = await imp('scripts/lib/temp.mjs')
const { removeTree } = await imp('scripts/lib/remove-tree.mjs')
const { writeCard, createLibrary } = await imp('src/main/core.mjs')
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1] }
const OUT = arg('out')
if (!OUT) { console.error('usage: shots.mjs --out <folder> [--lang zh|en|both]'); process.exit(2) }
const LANGS = arg('lang', 'both') === 'both' ? ['zh', 'en'] : [arg('lang')]
mkdirSync(OUT, { recursive: true })

const A = 'https://example-a.test/list'
const B = 'https://example-b.test/samples/1'
const CARD = (name, collect = ['月度销量']) => ({
  name,
  definition: { summary: '一座测试库。', purpose: '行业研究', scope: '对象：车企；行业：电动车；地域：中国；规模：大中型', exclude: '自媒体', trust: '公司公告为准', rhythm: '每周一次', language: '中文', hard: '一手出处' },
  decide: [], collect, skip: ['传闻'], sources: [{ name: '甲来源', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
})
const reads = [A, B].map(url => ({ url, ok: true }))
const question = (text, extra = {}) => ({ json: { say: '', question: { text, kind: 'input', options: [] } }, ...extra })
const card = (c, extra = {}) => ({ json: { say: '请看卡', card: c }, reads, ...extra })
const OPENER = '一人独立站那个库，我觉得东西不够全，可以多帮我找一点吗？'
const LIB = 'AI 一人独立站代发货入门'

async function one(lang) {
  const root = tempDir('st-v113-shots-')
  const world = await makeWorld({ root, kind: 'empty' })
  // a library named as the maintainer's (the development library is named by its folder)
  const libDir = join(world.root, LIB)
  createLibrary(libDir, { name: LIB, language: 'zh-CN' })
  world.library = libDir
  writeCard(libDir, CARD(LIB))
  const script = join(root, 'build-script.json')
  const setScript = x => writeFileSync(script, JSON.stringify({ replies: [question('?')], ...x }))
  setScript({})
  const dir = join(world.appData, 'build')
  mkdirSync(dir, { recursive: true })
  const built = [{ role: 'user', text: '我想学一人独立站代发货', at: '2026-11-25T17:32:00.000Z' }, { role: 'agent', kind: 'card', say: '请看卡', card: CARD(LIB), at: '2026-11-25T17:40:00.000Z' }]
  writeFileSync(join(dir, 'ended-2026-11-25T17-41-00-000Z-built.json'), JSON.stringify({ v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', opener: '我想学一人独立站代发货', status: 'built', turns: built, asked: [], reads: [], searches: [], calls: 1, card: null, pendingId: null, libraryDir: libDir, edit: null, convert: null } }))
  const stuck = [
    { role: 'user', text: OPENER, at: '2026-11-25T19:09:00.000Z' },
    { role: 'agent', kind: 'say', say: '这是新建库的对话，我看不到已经建立的库。要修改那座库，请从库里点「改建库卡」。', at: '2026-11-25T19:10:00.000Z' },
    { role: 'user', text: '放弃对话', at: '2026-11-27T02:51:00.000Z' },
    { role: 'agent', kind: 'say', say: '好的，这次就到这里，我什么都没改。', at: '2026-11-27T02:51:30.000Z' },
  ]
  writeFileSync(join(dir, 'build.json'), JSON.stringify({ v: 1, core: { v: 1, language: 'zh-CN', kind: 'claude-code', opener: OPENER, sessionId: 'old', status: 'talking', turns: stuck, asked: [], reads: [], searches: [], calls: 2, card: null, pendingId: null, libraryDir: null, edit: null, convert: null, extra: '' }, stopped: null, trouble: null, retry: null }))
  const { app, page } = await launch(world, {
    settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' }, theme: 'research', appearance: 'light', ...(lang === 'en' ? { language: 'en' } : {}) },
    env: { STREAMS_DEV_LIBRARY: libDir, STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_BUILD: script, STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_START_SCREEN: 'inbox', STREAMS_WINDOW: 'shown' },
  })
  const until = (fn, a) => page.waitForFunction(fn, a, { polling: 100, timeout: 60_000 })
  const shot = async name => { await page.waitForTimeout(450); await page.screenshot({ path: join(OUT, `${lang}-${name}.png`), mask: [page.locator('.st-path')] }); console.log(`${lang}-${name}.png`) }
  const row = sel => page.click(`nav[data-part="conversations"] ${sel} .st-conv__main`)
  try {
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
    await until(() => document.querySelector('main[data-screen="inbox"]') !== null)
    await page.click('.st-sidebar [data-nav="chat"]')
    await until(() => document.querySelector('main[data-screen="build"][data-conv="new:build"]') !== null)
    await shot('01-maintainer-after-upgrade')
    await page.click('[data-action="organised-ok"] button')
    const lib = await page.evaluate(() => document.querySelector('[data-conv-group="libraries"] [data-conv]').dataset.conv)
    setScript({ byLibrary: { [lib.slice(4)]: [question('要多找哪方面的内容？选品、供应商，还是平台规则？'), question('?', { holdMs: 60_000 }), question('明白了。要不要把海外平台的规则也收进来？'), card(CARD(LIB, ['月度销量', '选品', '供应商']))] }, byOpener: { 甲: [card(CARD('光伏产业'), { holdMs: 6000 })], 乙: [card(CARD('储能'))] } })
    await row(`[data-conv="${lib}"]`)
    await until(a => document.querySelector(`main[data-screen="build"][data-conv="${a}"]`) !== null, lib)
    await shot('02-library-conversation')
    await page.fill('textarea[data-field="message"]', '东西不够全，多帮我找一点')
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-conv-state="question"]') !== null)
    await shot('03-change-going')
    await page.fill('textarea[data-field="message"]', '主要是选品和供应商')
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-action="stop-turn"] button') !== null)
    await shot('04-working-stop')
    await page.click('[data-action="stop-turn"] button')
    await until(() => document.querySelector('[data-part="gave-back"]') !== null)
    await shot('05-stopped-words-back')
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-conv-state="question"]') !== null && document.querySelector('[data-part="gave-back"]') === null)
    // 放弃建库 on 维护者's
    await row('[data-conv="new:build"]')
    await until(() => document.querySelector('main[data-screen="build"][data-conv="new:build"]') !== null)
    await page.click('[data-action="drop-open"] button')
    await until(() => document.querySelector('dialog[data-dialog="drop-open"]') !== null)
    await shot('12-drop-confirm')
    await page.click('dialog[data-dialog="drop-open"] [data-action="drop-confirm"] button')
    await until(() => document.querySelector('[data-conv-group="unbuilt"]') === null)
    // one at a time
    await page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null)
    await page.fill('textarea[data-field="opener"]', '甲：跟踪光伏产业')
    await page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-kind="unbuilt"][data-conv-state="working"]') !== null)
    await row(`[data-conv="${lib}"]`)
    await until(a => document.querySelector(`main[data-screen="build"][data-conv="${a}"]`) !== null, lib)
    await page.fill('textarea[data-field="message"]', '也看看海外平台的规则')
    await page.click('[data-action="send"] button')
    await until(() => document.querySelector('[data-part="waiting-row"]') !== null)
    await shot('06-waiting')
    await until(() => document.querySelector('main[data-screen="build"][data-conv-state="card"]') !== null)
    await page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
    await page.fill('textarea[data-field="opener"]', '乙：跟踪储能')
    await page.click('[data-action="start"] button')
    await until(() => document.querySelector('main[data-screen="build"][data-kind="unbuilt"][data-conv-state="card"]') !== null)
    await row(`[data-conv="${lib}"]`)
    await until(a => document.querySelector(`main[data-screen="build"][data-conv="${a}"][data-conv-state="card"]`) !== null, lib)
    await page.click('[data-panel-tab="decide"]')
    await until(() => document.querySelectorAll('article[data-part="build-waiting"]').length === 3)
    await shot('07-panel-three-cards')
    await page.click(`nav[data-part="conversations"] [data-conv="${lib}"]`, { button: 'right' })
    await until(() => document.querySelector('[data-menu]') !== null)
    await shot('08-menu-library-conversation')
    await page.keyboard.press('Escape')
    const a = await page.evaluate(() => document.querySelector('[data-conv-group="unbuilt"] [data-conv]').dataset.conv)
    await page.click(`nav[data-part="conversations"] [data-conv="${a}"]`, { button: 'right' })
    await until(() => document.querySelector('[data-menu]') !== null)
    await shot('09-menu-unbuilt')
    await page.keyboard.press('Escape')
    await page.click('article[data-part="build-waiting"][data-here="true"] [data-action="card-more"] button')
    await until(() => document.querySelector('[data-menu]') !== null)
    await shot('10-menu-card')
    await page.keyboard.press('Escape')
    await page.click('.st-sidebar [data-library-row]', { button: 'right' })
    await until(() => document.querySelector('[data-menu]') !== null)
    await shot('11-menu-library')
    await page.keyboard.press('Escape')
    // 改卡的卡过期: a step changed on the library's page
    await page.click('.st-sidebar [data-library-row]')
    await page.click('nav.st-lib-tabs button[data-tab="sources"]')
    await until(() => document.querySelector('section[data-part="volume"] [data-volume="most"]:not([disabled])') !== null)
    await page.click('section[data-part="volume"] [data-volume="most"]')
    await until(() => document.querySelector('article[data-part="build-waiting"][data-stale="true"]') !== null)
    await page.click('article[data-part="build-waiting"][data-stale="true"] [data-action="full"] button')
    await until(() => document.querySelector('[data-part="card-problems"][data-stale="true"]') !== null)
    await shot('13-stale-card')
  } finally {
    await closeApp(app, { userDataDir: join(world.appData, 'electron') }).catch(() => {})
    try { removeTree(root, { waitMs: 20_000 }) } catch { /* the OS removes it later */ }
  }
}

for (const lang of LANGS) await one(lang)
