// Redesign R6d (docs/checks/2026-11-15-r6d/contract.md R6d-2 「每个已修…写一条真窗口测试」): what the side-by-side reading of the
// app's 84 light pictures against the design's (docs/checks/2026-11-15-r6d/对照.md) found to be the app's own defects, each
// seen again in the real window on the screen and in the look where it was found. Every test here was red on the code
// before its fix and fails again when the fix is taken out (scripts/mutation-check.mjs r6d-cmp-*).
//   - 进度: the running library's step dots sit beside its state (the template styles them there only), not in the details
//     (1.1 W7b: an update is one step, so one dot)
//   - 图谱's 详情: 「n 篇 · 关键词 n 个」 is in the head block; no empty band above the node's rows; 我的笔记 has the note's icon
//   - the template's dialog (编辑笔记, 移除该库, 输入 API key, 许可证与致谢): the body keeps the template's padding, a dialog that
//     only says something shows the dialog's own surface, the close button is the theme's close; 许可证与致谢 scrolls inside
//   - 缺少文件头: the card's label does not touch the card's head; its hint in the list is a line and a button below it
//   - 来源与要求: 「追踪要求」 is written once in its block (1.1 W7b: a library of the last version shows it read only)
//   - 待确认: a small card's title is not smaller than its text (1.1 W7b: the build's card; v2's 提议 and the 主 Agent page's
//     「n 项待确认」 chip are gone)
//   - 设置: the three connections' model boxes start at the same place; the icon lies inside its box (单线黑白's was squeezed)
//   - 待看: a card's title is in the theme's display face (研究对话's serif)
//   - 首次打开 in 单线黑白: the connection's icon is the theme's spark
//   - dark: a button of a notice can be told from the notice (澄明玻璃)
// Worlds: under the OS temp folder (tempDir), the shelf's three libraries with plan B's notes, the fake connection; the
// window hidden.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeApp } from '../scripts/lib/close-app.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'
import { launch, ready } from './support/app.mjs'
import { seedPlanB, seedShelf } from './support/seed.mjs'
import { seedQueue, startHoldingFeed } from './support/queue-world.mjs'
import { THEME_TEMPLATE } from '../src/shared/themes.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const open = []
after(async () => {
  for (const s of open) {
    try { await closeApp(s.app, { userDataDir: join(s.root, 'world', 'app-data', 'electron') }) } catch { /* already gone */ }
    try { if (s.cleanup) await s.cleanup() } catch { /* gone */ }
    try { removeTree(s.root, { waitMs: 15_000 }) } catch { /* the next run's temp sweep */ }
  }
})

/** A run of the app started when a test first asks for it. */
function lazySession({ kind = 'seeded', start, tab = 'detail', prepare = null }) {
  let made = null
  return () => (made ??= (async () => {
    const root = tempDir('st-r6d-cmp-')
    const world = await makeWorld({ root, kind })
    let shelf = null
    if (kind === 'seeded') { await seedPlanB(world); shelf = await seedShelf(world) }
    const extra = prepare ? (await prepare({ world, shelf, root })) ?? {} : {}
    const detect = join(root, 'detect.json')
    writeFileSync(detect, JSON.stringify({ 'claude-code': { installed: true, loggedIn: true, version: '2.1.287' }, codex: { installed: true, loggedIn: true, version: '0.44' } }), 'utf8')
    const env = { STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_DETECT: detect, STREAMS_DEV_LIBRARY: '', STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), ...(kind === 'seeded' ? { STREAMS_START_SCREEN: start } : {}), ...(extra.env ?? {}) }
    const settings = { theme: 'research', appearance: 'light', panel: { open: true, tab }, ...(kind === 'seeded' ? { connections: { active: 'claude-code' } } : {}) }
    const started = await launch(world, { env, settings })
    const s = { root, world, shelf, extra, cleanup: extra.cleanup ?? null, app: started.app, page: started.page, errors: [] }
    open.push(s)
    s.page.on('pageerror', err => s.errors.push(err.message))
    await ready(s.page, start)
    s.until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
    s.look = async id => {
      const [theme, appearance] = id.split('-')
      for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
        const r = await s.page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
        assert.equal(r.ok, true, `${m}(${v}): ${JSON.stringify(r)}`)
      }
      await s.until(([t, a, cls]) => document.documentElement.dataset.theme === t && document.body.dataset.appearance === a && document.body.className === cls
        && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass])
      await s.page.mouse.move(4, 4)
      await s.page.evaluate(() => document.fonts.ready)
      await s.page.waitForTimeout(300)
      // the window is hidden and draws no frames: the template's transitions are brought to their end before anything is read
      await s.until(() => { const running = document.getAnimations().filter(a => a instanceof CSSTransition); for (const a of running) a.finish(); return running.length === 0 })
    }
    s.tab = async name => {
      await s.page.click(`[data-panel-tab="${name}"]`)
      await s.until(x => document.querySelector('[data-part="right-panel"]')?.dataset.tab === x, name)
    }
    /** A tab of the library's page (any dialog closed first). */
    s.libTab = async name => {
      for (const sel of ['[data-action="cancel-edit"] button', 'dialog[open] [data-action="close-dialog"] button']) {
        if (await s.page.evaluate(q => document.querySelector(q) !== null, sel)) { await s.page.click(sel); await s.until(() => document.querySelector('dialog[open]') === null) }
      }
      await s.page.click(`.st-lib-tabs [data-tab="${name}"]`)
      await ready(s.page, name)
    }
    return s
  })())
}
const px = v => Number.parseFloat(v)

// ---- a library's pages: one run of the app ------------------------------------------------------------------------------------------
const libraryRun = lazySession({ start: 'library' })
async function onNote() {
  const s = await libraryRun()
  await s.libTab('inbox')
  await s.libTab('library')
  const id = s.world.planB.evals.id
  await s.page.click(`[data-part="list"] [data-row="${id}"]`)
  await s.until(i => document.querySelector(`[data-reader="${i}"]`) !== null, id)
  return s
}

test('R6d 对照 · 待看: a card\'s title is in the face of its heading (研究对话: the display serif, not the body face of a link)', async () => {
  const s = await libraryRun()
  await s.libTab('inbox')
  await s.until(() => document.querySelectorAll('[data-card]').length >= 1)
  for (const id of ['research-light', 'precision-light', 'glass-light']) {
    await s.look(id)
    const f = await s.page.evaluate(() => { const a = document.querySelector('[data-card] .st-card__title'); return [getComputedStyle(a).fontFamily, getComputedStyle(a.closest('h2')).fontFamily, getComputedStyle(document.querySelector('[data-card] [data-part="card-line"]')).fontFamily] })
    assert.equal(f[0], f[1], `${id}: the title's link is in its heading's face`)
    if (id === 'research-light') assert.notEqual(f[1], f[2], 'research: the heading\'s face is not the small line\'s (the comparison can tell them apart)')
  }
  await s.look('research-light')
})

test('R6d 对照 · 资料库: the hint of a file without a header is a line with its button below it; in 澄明玻璃 dark the button can be told from the notice', async () => {
  const s = await onNote()
  await s.until(() => document.querySelector('[data-part="missing-header-hint"] [data-action="go-missing-header"] button') !== null)
  await s.look('research-light')
  const r = await s.page.evaluate(() => { const h = document.querySelector('[data-part="missing-header-hint"]'); const t = h.querySelector(':scope > span:first-child').getBoundingClientRect(); const b = h.querySelector('button').getBoundingClientRect(); return [Math.round(t.bottom), Math.round(b.top), Math.round(t.height), Math.round(h.getBoundingClientRect().width)] })
  assert.ok(r[1] >= r[0] - 1, `the button (top ${r[1]}) is below the line (bottom ${r[0]})`)
  for (const id of ['glass-dark', 'research-dark']) {
    await s.look(id)
    const c = await s.page.evaluate(() => { const h = document.querySelector('[data-part="missing-header-hint"]'); return [getComputedStyle(h).backgroundColor, getComputedStyle(h.querySelector('button')).backgroundColor] })
    assert.notEqual(c[1], 'rgba(0, 0, 0, 0)', `${id}: the button has a surface`)
    assert.notEqual(c[1], c[0], `${id}: the button's surface is not the notice's own (${c[0]})`)
  }
  await s.look('research-light')
})

test('R6d 对照 · 缺少文件头: the card\'s label keeps its distance from the card\'s head', async () => {
  const s = await onNote()
  await s.page.click('[data-part="missing-header-hint"] [data-action="go-missing-header"] button')
  await s.until(() => document.querySelector('[data-part="missing-header"] [data-card] .field') !== null)
  try {
    for (const id of ['research-light', 'monoline-light']) {
      await s.look(id)
      const gap = await s.page.evaluate(() => { const c = document.querySelector('[data-part="missing-header"] [data-card]'); return Math.round(c.querySelector('.field > span').getBoundingClientRect().top - c.querySelector('.confirm-top').getBoundingClientRect().bottom) })
      assert.ok(gap >= 12, `${id}: ${gap}px between the head and the label (at least 12)`)
    }
  } finally {
    await s.look('research-light')
    await s.page.click('[data-action="back-to-library"] button')
    await s.until(() => document.querySelector('[data-part="list"] [data-row]') !== null)
  }
})

test('R6d 对照 · 编辑笔记: the dialog\'s body keeps the template\'s padding; in 单线黑白 the close button is the theme\'s close', async () => {
  const s = await onNote()
  await s.page.click('[data-part="item-actions"] [data-action="edit"] button')
  await s.until(() => document.querySelector('dialog[data-dialog="edit"][open]') !== null)
  try {
    await s.look('research-light')
    const pad = await s.page.evaluate(() => { const c = getComputedStyle(document.querySelector('dialog[data-dialog="edit"] .dialog-body')); return [c.paddingLeft, c.paddingTop, c.paddingRight, c.paddingBottom] })
    assert.ok(pad.every(v => px(v) >= 16), `the body's padding: ${pad.join(' ')}`)
    await s.look('monoline-light')
    const d = await s.page.evaluate(() => [[...document.querySelectorAll('[data-action="close-edit"] svg path')].map(p => p.getAttribute('d')).join('|'), window.yunzhiVisualEdition.icons.close, window.yunzhiVisualEdition.icons.down])
    assert.notEqual(d[1], d[2])
    assert.equal(d[0], d[1], 'the close button draws the theme\'s close')
  } finally {
    await s.look('research-light')
    await s.page.click('[data-action="cancel-edit"] button')
    await s.until(() => document.querySelector('[data-dialog="edit"]') === null)
  }
})

test('R6d 对照 · 图谱: the node\'s line is in the head block of 详情, its rows follow their label, 我的笔记 has the note\'s icon', async () => {
  const s = await onNote()
  await s.page.click('[data-part="view-switch"] [data-mode="graph"]')
  await s.until(() => document.querySelector('main[data-screen="graph"][data-state="ready"] [data-part="graph"] [data-node]') !== null)
  try {
    await s.tab('detail')
    await s.look('monoline-light')
    await s.page.click(`[data-node="topic:${s.world.seed.topics[0]}"]`)
    await s.until(() => document.querySelector('[data-part="detail-graph"] [data-part="node-items"] [data-node-item]') !== null)
    const r = await s.page.evaluate(() => {
      const d = document.querySelector('[data-part="detail-graph"]')
      const meta = d.querySelector('[data-part="node-meta"]')
      const items = [...d.querySelectorAll('[data-node-item]')].map(b => [b.querySelector('.file-text small').textContent, [...b.querySelectorAll('.file-icon svg path')].map(p => p.getAttribute('d')).join('|')])
      return { meta: meta?.textContent ?? null, inHead: Boolean(meta?.closest('[data-part="detail-head"]')), margin: getComputedStyle(d.querySelector('[data-part="node-items"]')).marginTop, items, note: window.yunzhiVisualEdition.icons.note, file: window.yunzhiVisualEdition.icons.file }
    })
    assert.match(r.meta ?? '', /\d/, 'the node\'s line is there')
    assert.equal(r.inHead, true, 'the node\'s line is inside the head block')
    assert.equal(r.margin, '0px', 'the rows follow their label')
    assert.notEqual(r.note, r.file)
    const mine = r.items.filter(([small]) => small === '我的笔记')
    assert.ok(mine.length >= 1 && r.items.length > mine.length, `the topic has a note of mine and others: ${JSON.stringify(r.items.map(i => i[0]))}`)
    for (const [small, d] of r.items) assert.equal(d, small === '我的笔记' ? r.note : r.file, `${small}: its icon`)
  } finally {
    await s.look('research-light')
    await s.page.click('[data-part="view-switch"] [data-mode="list"]')
    await ready(s.page, 'library')
  }
})

test('R6d 对照 · 来源与要求: 「追踪要求」 is written once in its block; 移除该库 shows the dialog\'s own surface with the template\'s padding', async () => {
  const s = await libraryRun()
  await s.libTab('sources')
  await s.until(() => document.querySelector('main[data-screen="sources"][data-state="ready"] [data-part="old-brief"]') !== null)
  await s.look('glass-light')
  const seen = await s.page.evaluate(() => { const b = document.querySelector('[data-part="old-brief"]'); const label = b.querySelector('.section-label span').textContent.trim(); return [label, [...b.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === label && e.getClientRects().length > 0).length, document.getElementById(b.getAttribute('aria-labelledby'))?.textContent.trim() ?? null] })
  assert.equal(seen[0], '追踪要求')
  assert.equal(seen[1], 1, 'the words are on the screen once')
  assert.equal(seen[2], '追踪要求', 'the block still has its name for a screen reader')
  await s.page.click('[data-action="go-advanced"]')
  await s.until(() => document.querySelector('[data-view="advanced"] [data-part="changes"][data-state="ready"]') !== null)
  await s.page.click('[data-action="remove-library"] button')
  await s.until(() => document.querySelector('dialog[data-dialog="remove-library"][open]') !== null)
  try {
    await s.look('research-light')
    const r = await s.page.evaluate(() => { const d = document.querySelector('dialog[data-dialog="remove-library"]'); const c = getComputedStyle(d.querySelector('.dialog-body')); return { pad: [c.paddingLeft, c.paddingTop, c.paddingRight, c.paddingBottom], content: getComputedStyle(d.querySelector('.new-content')).backgroundColor, head: getComputedStyle(d.querySelector('.dialog-head')).backgroundColor, paper: getComputedStyle(d).backgroundColor } })
    assert.ok(r.pad.every(v => px(v) >= 16), `the body's padding: ${r.pad.join(' ')}`)
    assert.equal(r.content, 'rgba(0, 0, 0, 0)', 'a dialog with no field shows the dialog\'s own surface')
    assert.notEqual(r.head, r.paper, 'the head and the body are two surfaces')
    await s.look('monoline-light')
    const d = await s.page.evaluate(() => [[...document.querySelectorAll('dialog[open] [data-action="close-dialog"] svg path')].map(p => p.getAttribute('d')).join('|'), window.yunzhiVisualEdition.icons.close])
    assert.equal(d[0], d[1], 'the close button draws the theme\'s close')
  } finally {
    await s.look('research-light')
    await s.page.click('dialog[open] [data-action="close-dialog"] button')
    await s.until(() => document.querySelector('dialog[open]') === null)
  }
  assert.deepEqual(s.errors, [])
})

// ---- 待确认: the build's card ---------------------------------------------------------------------------------------------------------
// the build conversation's one reply: a whole card whose addresses were all read, so it waits for 确认 (lib/build.js waitingCard)
const BUILD_CARD = {
  name: '中国电动车',
  definition: { summary: '给行业研究用的库：中国电动车和动力电池的月度销量、价格战、出海和固态电池进展。', purpose: '行业研究', scope: '对象：车企和电池厂；行业：电动车；地域：中国；规模：大中型', exclude: '自媒体和营销号', trust: '公司公告为准', rhythm: '每周一次', language: '中文简报', hard: '每条要有一手出处' },
  decide: [{ what: '零跑只收销量', default: '收' }], collect: ['月度销量和交付'], skip: ['传闻'],
  sources: [{ name: '甲来源', url: 'https://example-a.test/list', status: '读得到' }],
  unreadable: [{ name: '某协会', url: 'https://example-c.test/members', reason: '要登录' }],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: 'https://example-b.test/samples/1', date: '2026-11-20' }],
}
const decideRun = lazySession({
  start: 'inbox', tab: 'decide',
  prepare: ({ root }) => {
    const replies = join(root, 'build-replies.json')
    writeFileSync(replies, JSON.stringify({ replies: [{ json: { say: '写好了建库卡，请看一下。', card: BUILD_CARD }, reads: ['https://example-a.test/list', 'https://example-b.test/samples/1', 'https://example-c.test/members'].map(url => ({ url, ok: true })) }] }), 'utf8')
    return { env: { STREAMS_DEV_BUILD: replies } }
  },
})
test('R6d 对照 · 待确认: a small card\'s title is not smaller than its text (the build\'s card waiting for 确认)', async () => {
  const s = await decideRun()
  const { page, until } = s
  const r = await page.evaluate(() => window.streams.startBuild('跟踪中国电动车和动力电池'))
  assert.equal(r.ok, true, JSON.stringify(r))
  await s.tab('decide')
  await until(() => document.querySelector('[data-pane="decide"] [data-part="build-waiting"] h3') !== null && document.querySelector('[data-pane="decide"] [data-part="build-waiting"] .card-body p') !== null)
  for (const id of ['precision-light', 'research-light']) {
    await s.look(id)
    const sizes = await page.evaluate(() => [...document.querySelectorAll('[data-pane="decide"] [data-part="build-waiting"]')].map(c => `${Number.parseFloat(getComputedStyle(c.querySelector('h3')).fontSize)}/${Math.max(...[...c.querySelectorAll('.card-body p')].map(p => Number.parseFloat(getComputedStyle(p).fontSize)))}`))
    assert.equal(sizes.length, 1, 'the small card is there, once')
    for (const pair of sizes) { const [h, p] = pair.split('/').map(Number); assert.ok(h >= p, `${id}: the title (${h}px) is not smaller than the text (${p}px)`) }
  }
  await s.look('research-light')
  assert.deepEqual(s.errors, [])
})

// ---- 设置 · 许可证与致谢 · 输入 API key ------------------------------------------------------------------------------------------------
const settingsRun = lazySession({ start: 'settings', tab: 'progress' })
test('R6d 对照 · 设置: the three connections\' model boxes start at the same place (澄明玻璃); 单线黑白\'s icon box is not squeezed', async () => {
  const s = await settingsRun()
  await s.until(() => document.querySelectorAll('[data-part="connections"] [data-connection]').length === 3)
  for (const id of ['glass-light', 'monoline-light', 'research-light']) {
    await s.look(id)
    const r = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="connections"] [data-connection]')].map(row => { const i = row.querySelector('.file-icon').getBoundingClientRect(); const g = row.querySelector('.file-icon svg').getBoundingClientRect(); return [Math.round(row.querySelector('.st-set-slots select').getBoundingClientRect().left), Math.round(g.left - i.left), Math.round(i.right - g.right), row.querySelector('.st-set-conn__acts').textContent.trim().length, Math.round(i.width)] }))
    assert.equal(new Set(r.map(x => x[3])).size > 1, true, 'the rows\' last columns hold different things (the comparison can fail)')
    assert.equal(new Set(r.map(x => x[0])).size, 1, `${id}: the model boxes start at ${r.map(x => x[0]).join(' · ')}`)
    // the template's icon box is its icon with 8px around it (round6/base.css .file-icon) and, in 单线黑白, a border
    for (const x of r) assert.ok(x[1] >= 7 && x[2] >= 7, `${id}: the icon lies inside its box (${x[4]}px wide): ${x[1]}px to its left, ${x[2]}px to its right`)
  }
  await s.look('research-light')
})

test('R6d 对照 · 许可证与致谢: the dialog\'s head and its buttons stay, the text scrolls inside; 输入 API key keeps the form\'s panel inside the padding', async () => {
  const s = await settingsRun()
  const { page, until, app } = s
  const size = (w, h) => app.evaluate(({ BrowserWindow }, [ww, hh]) => { BrowserWindow.getAllWindows()[0].setContentSize(ww, hh) }, [w, h])
  await size(1440, 800)
  await until(() => innerHeight === 800)
  await page.click('[data-part="about"] [data-action="licenses"] button')
  await until(() => document.querySelector('dialog[data-dialog="licenses"][open] [data-part="components"]') !== null)
  try {
    for (const id of ['precision-light', 'glass-light']) {
      await s.look(id)
      const r = await page.evaluate(() => {
        const d = document.querySelector('dialog[data-dialog="licenses"]')
        const box = e => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)] }
        const inner = [...d.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.querySelector('[data-part="components"]'))
        return { dialog: box(d), close: box(d.querySelector('[data-action="close-dialog"] button')), foot: box(d.querySelector('.form-footer')), own: d.scrollHeight - d.clientHeight, inner: inner.length, h: innerHeight }
      })
      assert.ok(r.own <= 1, `${id}: the dialog itself does not scroll (${r.own}px over)`)
      assert.ok(r.inner >= 1, `${id}: the text is longer than the dialog and scrolls inside it`)
      assert.ok(r.close[0] >= r.dialog[0] && r.close[1] <= r.dialog[1] && r.close[0] >= 0, `${id}: the close button is in the dialog: ${JSON.stringify(r)}`)
      assert.ok(r.foot[1] <= r.dialog[1] + 1 && r.foot[1] <= r.h && r.foot[0] > r.close[1], `${id}: the buttons at the foot are in the dialog and in the window: ${JSON.stringify(r)}`)
    }
  } finally {
    await s.look('research-light')
    await page.click('dialog[open] [data-action="close-dialog"] button')
    await until(() => document.querySelector('dialog[open]') === null)
    await size(1440, 960)
    await until(() => innerHeight === 960)
  }
  await page.evaluate(() => { document.querySelector('.st-main__body').scrollTop = 0 })
  await page.click('[data-connection="api"] [data-action="setup-key"] button')
  await until(() => document.querySelector('dialog[data-dialog="api-key"][open]') !== null)
  try {
    const r = await page.evaluate(() => { const d = document.querySelector('dialog[data-dialog="api-key"]'); const c = getComputedStyle(d.querySelector('.dialog-body')); return { pad: [c.paddingLeft, c.paddingTop, c.paddingRight, c.paddingBottom], content: getComputedStyle(d.querySelector('.new-content')).backgroundColor, paper: getComputedStyle(d).backgroundColor } })
    assert.ok(r.pad.every(v => px(v) >= 16), `the body's padding: ${r.pad.join(' ')}`)
    assert.notEqual(r.content, 'rgba(0, 0, 0, 0)', 'a form keeps the template\'s panel')
    assert.notEqual(r.content, r.paper, 'the panel is not the dialog\'s own surface')
  } finally {
    await page.click('[data-dialog="api-key"] [data-action="cancel-key"] button')
    await until(() => document.querySelector('[data-dialog="api-key"]') === null)
  }
  assert.deepEqual(s.errors, [])
})

// ---- 首次打开 -----------------------------------------------------------------------------------------------------------------------
const firstRun = lazySession({ kind: 'empty', start: 'first-run' })
test('R6d 对照 · 首次打开 in 单线黑白: the current connection\'s icon is the theme\'s spark, not its note', async () => {
  const s = await firstRun()
  await s.until(() => document.querySelector('[data-part="first-run"][data-view="home"] [data-part="current-connection"] .file-icon svg') !== null)
  await s.look('monoline-light')
  const d = await s.page.evaluate(() => [[...document.querySelectorAll('[data-part="current-connection"] .file-icon svg path')].map(p => p.getAttribute('d')).join('|'), window.yunzhiVisualEdition.icons.spark, window.yunzhiVisualEdition.icons.note])
  assert.notEqual(d[1], d[2])
  assert.equal(d[0], d[1])
  assert.deepEqual(s.errors, [])
})

// ---- 运行与排队 ---------------------------------------------------------------------------------------------------------------------
const queueRun = lazySession({
  start: 'inbox', tab: 'progress',
  prepare: async ({ world, shelf }) => {
    const feed = await startHoldingFeed({ holdMs: 19_000 })
    const q = await seedQueue(world, shelf, feed, { sources: 4 })
    return { q, env: { STREAMS_DEV_NOW: q.now }, cleanup: () => feed.close() }
  },
})
test('R6d 对照 · 进度: the step dots of the library that runs, and of the one that waits, are beside the state — where the template styles them', async () => {
  const s = await queueRun()
  const q = s.extra.q
  await s.until(([r, w]) => document.querySelector(`[data-library-row="${r}"] [data-library-queue="running"]`) !== null && document.querySelector(`[data-library-row="${w}"] [data-library-queue="queued"]`) !== null, [q.running, q.waiting])
  await s.tab('progress')
  await s.until(() => document.querySelector('[data-part="running"]') !== null && document.querySelector('[data-queue-row][data-position="2"]') !== null)
  const r = await s.page.evaluate(() => {
    const run = document.querySelector('[data-part="running"]')
    const wait = document.querySelector('[data-queue-row][data-position="2"]')
    const dots = run.querySelector('.phase-label small .step-dots')
    return { beside: Boolean(dots), n: dots?.children.length ?? 0, lit: dots ? [...dots.children].filter(i => i.className !== '').length : 0, inDetails: run.querySelector('.phase-details .step-dots') !== null, total: document.querySelectorAll('[data-part="order"] .step-dots').length, waiting: wait.querySelector('.phase-label small .step-dots')?.children.length ?? 0, waitingLit: [...(wait.querySelector('.phase-label small .step-dots')?.children ?? [])].filter(i => i.className !== '').length, text: run.querySelector('.phase-label small').textContent }
  })
  assert.equal(r.beside, true, 'the running row\'s dots are in its state line')
  assert.equal(r.inDetails, false, 'and not in its details')
  // 1.1.1 P10 (A8): an update is four steps now (读来源 · 取原文 · 更新 Agent · 核对; it was one, 1.1 W7a)
  assert.equal(r.n, 4, 'one dot a step: an update is four steps (1.1.1 P10)')
  assert.ok(r.lit >= 1, 'the step it is at is marked')
  assert.equal(r.waiting, 4, 'the waiting row has its dots')
  assert.equal(r.waitingLit, 0, 'none of them marked')
  assert.equal(r.total, 2)
  assert.match(r.text, /运行中/)
  assert.deepEqual(s.errors, [])
})
