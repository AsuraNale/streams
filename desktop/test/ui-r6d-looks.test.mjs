// Redesign R6d (docs/checks/2026-11-15-r6d/contract.md R6d-3, and R6d-2 「每个已修…写一条真窗口测试」): what the pictures of the 21
// screens in the 8 looks (scripts/shots-r6d.mjs) found and styles/template-app.css §12 and §7 set right, each seen again in
// the real window — on the screen and in the look where it was found, with the same check the pictures use
// (scripts/lib/contrast.mjs: every piece of text a person sees, its colour against the colour really behind it; 4.5 : 1,
// large text 3 : 1; only disabled controls and placeholders are not counted).
//   - 待看, 精密国际主义 dark: a card's body was white under the dark theme's light ink (1.26 : 1)
//   - 待看, the four dark looks: .activity-row kept #666; 研究对话 dark: the section-label's buttons kept the light blue
//   - 待看 and 资料库, 澄明玻璃 dark: the chosen row's small lines; the library's mark in the sidebar (研究对话 light too)
//   - 待看, 精密国际主义 and 研究对话 light: .chart-row and .step-line in round 6's #777
//   - 新建库: 新建库 in the sidebar while it is the screen — white on white in 单线黑白 light, dark on dark in every dark look;
//     研究对话 light: the preset pack's second line
//   - 问库, the four light looks: .speaker small, .compose-help, .after-card, .confirm-footer .muted, .panel-summary p
//   - 图谱, 单线黑白: a pressed node jumped away from the pointer and the click was lost
// Each test here fails when its rule is taken out again (scripts/mutation-check.mjs r6d-contrast-* · r6d-graph-press). The
// check itself is seen to fail first: a line of grey text put into the page is reported, the same line in a disabled
// button is reported as exempt, and the page without them has nothing under the bar.
// Worlds: under the OS temp folder (tempDir), the shelf's three libraries with plan B's notes, the fake connection, 问库 and
// the main agent scripted; the window hidden (so every transition is brought to its end before the colours are read).
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeApp } from '../scripts/lib/close-app.mjs'
import { contrastInPage } from '../scripts/lib/contrast.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'
import { launch, ready } from './support/app.mjs'
import { seedPlanB, seedShelf } from './support/seed.mjs'
import { THEME_TEMPLATE } from '../src/shared/themes.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const CONTRAST = `(${contrastInPage.toString()})({})`
const open = []
after(async () => {
  for (const s of open) {
    try { await closeApp(s.app, { userDataDir: join(s.root, 'world', 'app-data', 'electron') }) } catch { /* already gone */ }
    try { removeTree(s.root, { waitMs: 15_000 }) } catch { /* the next run's temp sweep */ }
  }
})

/** A run of the app started when a test first asks for it (so a run with --test-name-pattern starts only what it needs). */
function lazySession({ start, tab = 'detail', prepare = null }) {
  let made = null
  return () => (made ??= (async () => {
    const root = tempDir('st-r6d-looks-')
    const world = await makeWorld({ root, kind: 'seeded' })
    await seedPlanB(world)
    const shelf = await seedShelf(world)
    // the sidebar's plan usage (its rows are .chart-row), read at start from a file (nothing real is read)
    const quota = join(root, 'quota.json')
    const now = Math.floor(Date.now() / 1000)
    writeFileSync(quota, JSON.stringify({ 'claude-code': { source: 'claude-code', at: new Date().toISOString(), windows: [{ id: 'five_hour', usedPercent: 8, resetsAt: now + 4 * 3600 }, { id: 'seven_day', usedPercent: 26, resetsAt: now + 3 * 86400 }] } }))
    const env = { STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_LIBRARY: '', STREAMS_DEV_LIBRARY_ROOT: join(root, 'new-libs'), STREAMS_DEV_QUOTA: quota, STREAMS_START_SCREEN: start, ...(prepare ? prepare({ world, shelf, root }) : {}) }
    const started = await launch(world, { env, settings: { theme: 'research', appearance: 'light', connections: { active: 'claude-code' }, panel: { open: true, tab } } })
    const s = { root, world, shelf, app: started.app, page: started.page, errors: [] }
    open.push(s)
    s.page.on('pageerror', err => s.errors.push(err.message))
    await ready(s.page, start)
    s.until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
    // the look changed the way 设置 changes it (scripts/shots-r6a.mjs look())
    s.look = async id => {
      const [theme, appearance] = id.split('-')
      for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
        const r = await s.page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
        assert.equal(r.ok, true, `${m}(${v}): ${JSON.stringify(r)}`)
      }
      await s.until(([t, a, cls]) => document.documentElement.dataset.theme === t && document.body.dataset.appearance === a && document.body.className === cls
        && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass])
      await s.page.mouse.move(4, 4)
      await s.page.evaluate(() => document.activeElement?.blur?.())
      await s.page.evaluate(() => document.fonts.ready)
      await s.page.waitForTimeout(300)
      // the window is hidden: it draws no frames, so the template's colour transitions (160 ms) never run to their end by
      // themselves and a computed colour would be the one of the look before. They are brought to their end here.
      await s.until(() => { const running = document.getAnimations().filter(a => a instanceof CSSTransition); for (const a of running) a.finish(); return running.length === 0 })
    }
    /** The pieces of text under the bar that are not exempt, as short lines. */
    s.under = async () => {
      const r = await s.page.evaluate(CONTRAST)
      assert.ok(r.checked >= 20, `the check measured the screen's text (${r.checked} pieces)`)
      return r.entries.filter(e => !e.exempt).map(e => `${e.ratio} < ${e.required}  ${e.fg} on ${e.bg}  「${e.text}」  ${e.selector}`)
    }
    s.tab = async name => {
      await s.page.click(`[data-panel-tab="${name}"]`)
      await s.until(x => document.querySelector('[data-part="right-panel"]')?.dataset.tab === x, name)
    }
    return s
  })())
}

/** Every look in `looks`: the parts in `must` are on the screen and nothing that is not exempt is under the bar. */
async function clean(s, looks, must, where) {
  for (const id of looks) {
    await s.look(id)
    for (const sel of must) assert.ok(await s.page.evaluate(q => { const e = document.querySelector(q); return Boolean(e && e.getClientRects().length && e.textContent.trim() !== '') }, sel), `${where} · ${id}: ${sel} is on the screen with text`)
    assert.deepEqual(await s.under(), [], `${where} · ${id}: every piece of text meets the contrast bar`)
  }
}

// ---- 待看 · 资料库 · 图谱: one run of the app ---------------------------------------------------------------------------------------
const libraryRun = lazySession({ start: 'inbox' })
async function onInbox() {
  const s = await libraryRun()
  if (!(await s.page.evaluate(() => document.querySelector('main[data-screen="inbox"]') !== null))) { await s.page.click('.st-lib-tabs [data-tab="inbox"]'); await ready(s.page, 'inbox') }
  await s.until(() => document.querySelectorAll('[data-card]').length === 4)
  const url = await s.page.evaluate(() => document.querySelector('[data-card]').dataset.url)
  await s.page.click(`[data-card][data-url="${url}"] .card-body`)
  await s.until(u => document.querySelector(`[data-card][data-url="${u}"]`)?.dataset.current === 'true', url)
  await s.tab('detail')
  await s.until(() => document.querySelector('[data-part="detail-inbox"]') !== null)
  return s
}
async function onLibrary() {
  const s = await libraryRun()
  if (!(await s.page.evaluate(() => document.querySelector('main[data-screen="library"]') !== null))) {
    if (await s.page.evaluate(() => document.querySelector('main[data-screen="graph"]') !== null)) await s.page.click('[data-part="view-switch"] [data-mode="list"]')
    else await s.page.click('.st-lib-tabs [data-tab="library"]')
    await ready(s.page, 'library')
  }
  const id = s.world.planB.evals.id
  await s.page.click(`[data-part="list"] [data-row="${id}"]`)
  await s.until(i => document.querySelector(`[data-reader="${i}"]`) !== null && document.querySelector(`[data-part="list"] [data-row="${i}"].selected`) !== null, id)
  return s
}

test('R6d-3 the check can fail: grey text put into 待看 is reported, the same text in a disabled button is exempt, the page without them is clean', async () => {
  const s = await onInbox()
  await s.look('research-light')
  assert.deepEqual(await s.under(), [], 'before: nothing under the bar')
  await s.page.evaluate(() => {
    const p = document.createElement('p'); p.id = 'r6d-control'; p.textContent = 'control grey'; p.style.cssText = 'position:fixed;left:300px;top:300px;z-index:99;margin:0;padding:4px;font-size:14px;color:#999;background:#fff'
    const b = document.createElement('button'); b.id = 'r6d-control-off'; b.disabled = true; b.textContent = 'control off'; b.style.cssText = 'position:fixed;left:300px;top:340px;z-index:99;font-size:14px;color:#999;background:#fff;opacity:1'
    document.body.append(p, b)
  })
  try {
    const r = await s.page.evaluate(CONTRAST)
    const own = r.entries.filter(e => /^control /.test(e.text))
    assert.deepEqual(own.map(e => [e.text, e.exempt ?? null, e.ratio, e.required, e.fg, e.bg]), [['control grey', null, 2.84, 4.5, '#999999', '#ffffff'], ['control off', 'disabled', 2.84, 4.5, '#999999', '#ffffff']], JSON.stringify(own))
    const under = await s.under()
    assert.equal(under.length, 1, `only the line that is not exempt counts: ${JSON.stringify(under)}`)
    assert.match(under[0], /control grey/)
  } finally {
    await s.page.evaluate(() => { document.getElementById('r6d-control')?.remove(); document.getElementById('r6d-control-off')?.remove() })
  }
  assert.deepEqual(await s.under(), [], 'after: nothing under the bar')
})

test('R6d-3 待看 in 精密国际主义, dark: the text of a card\'s body can be read (the body is not left white)', async () => {
  const s = await onInbox()
  await clean(s, ['precision-dark'], ['[data-card] .card-body [data-part="what"]'], '待看')
  const bodies = await s.page.evaluate(() => [...document.querySelectorAll('[data-card] .card-body')].map(e => getComputedStyle(e).backgroundColor))
  assert.ok(bodies.length >= 1 && bodies.every(c => c === 'rgba(0, 0, 0, 0)'), `the card bodies show the card's own surface: ${JSON.stringify(bodies)}`)
})

test('R6d-3 待看 in the four dark looks: 最近的放弃原因 (.activity-row) is not left in round 6\'s grey', async () => {
  const s = await onInbox()
  await clean(s, ['precision-dark', 'glass-dark', 'research-dark', 'monoline-dark'], ['[data-part="reasons"] .activity-row'], '待看')
})

test('R6d-3 待看 in 研究对话, dark: 添加链接 (a section-label\'s button) is not left in the light theme\'s blue', async () => {
  const s = await onInbox()
  await clean(s, ['research-dark'], ['.section-label [data-action="add-link"] button'], '待看')
})

test('R6d-3 待看 in 澄明玻璃 dark and 研究对话 light: the current library\'s line and the libraries\' marks in the sidebar', async () => {
  const s = await onInbox()
  await clean(s, ['glass-dark', 'research-light', 'glass-light'], ['.project-item.active .project-meta', '.project-item .st-lib-mark'], '待看')
})

test('R6d-3 待看 in 精密国际主义 and 研究对话, light: the quota rows (.chart-row) and 核验通过 (.step-line) are not left in round 6\'s grey', async () => {
  const s = await onInbox()
  await clean(s, ['precision-light', 'research-light'], ['[data-part="quota"] .chart-row', '[data-part="detail-inbox"] .step-line'], '待看')
})

test('R6d-3 资料库 in 澄明玻璃, dark: the small lines of the note that is open in the list', async () => {
  const s = await onLibrary()
  await clean(s, ['glass-dark'], ['.source-card.selected p'], '资料库')
})

test('R6d 图谱 in 单线黑白 and 精密国际主义: a node stays under the pointer while it is pressed, and the click chooses it', async () => {
  const s = await onLibrary()
  await s.page.click('[data-part="view-switch"] [data-mode="graph"]')
  await s.until(() => document.querySelector('main[data-screen="graph"][data-state="ready"] [data-part="graph"] [data-node]') !== null)
  const nodes = await s.page.evaluate(() => [...document.querySelectorAll('[data-part="graph"] [data-node][data-kind="topic"]')].map(n => n.dataset.node))
  assert.ok(nodes.length >= 2, `the picture has topics: ${nodes.join(', ')}`)
  for (const [i, id] of ['monoline-light', 'precision-light'].entries()) {
    await s.look(id)
    const sel = `[data-node="${nodes[i]}"]`
    const box = () => s.page.evaluate(q => { const r = document.querySelector(q).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }, sel)
    const before = await box()
    await s.page.mouse.move(before[0] + before[2] / 2, before[1] + before[3] / 2)
    await s.page.mouse.down()
    await s.page.waitForTimeout(400) // 精密国际主义 moves a pressed button over 160 ms
    const pressed = await box()
    const under = await s.page.evaluate(([q, x, y]) => document.elementFromPoint(x, y) === document.querySelector(q), [sel, before[0] + before[2] / 2, before[1] + before[3] / 2])
    await s.page.mouse.up()
    assert.deepEqual(pressed, before, `${id}: the pressed node is where it was`)
    assert.equal(under, true, `${id}: the pointer is still on it`)
    await s.until(q => document.querySelector(q)?.getAttribute('aria-pressed') === 'true', sel)
    await s.until(() => document.querySelector('[data-part="detail-graph"] [data-part="node-items"]') !== null)
  }
  assert.deepEqual(s.errors, [])
})

test('R6d a theme chosen while the app runs brings its own icons at once, not the icons of the theme before it', async () => {
  const s = await onInbox()
  // every icon of the sidebar, the library's tabs and the right panel's tabs: which glyph and what it is drawn with
  const icons = () => s.page.evaluate(() => [...document.querySelectorAll('.sidebar svg, .st-lib-tabs svg, [data-part="right-panel"] .panel-tabs svg')]
    .map(e => `${e.dataset.glyph}:${[...e.querySelectorAll('path')].map(p => p.getAttribute('d')).join('|')}`).join('\n'))
  // 新建库's icon as the theme's own edition of the template has it (lib/template-icons.js TIcon name newProject, fallback plus)
  const own = theme => s.page.evaluate(t => {
    const e = window.yunzhiRound11Edition(`${t}11`)
    const layers = e?.controlArt?.newProject
    return (layers ? layers.map(l => l.d) : [e?.icons?.plus ?? 'M12 5v14M5 12h14']).join('|')
  }, theme)
  const drawn = () => s.page.evaluate(() => [...document.querySelectorAll('.sidebar [data-action="add-library"] svg path')].map(p => p.getAttribute('d')).join('|'))
  const seen = {}
  for (const theme of ['research', 'precision', 'glass', 'research']) {
    await s.look(`${theme}-light`)
    const now = await icons()
    assert.ok(now.split('\n').length >= 8, `${theme}: the icons were read (${now.split('\n').length})`)
    assert.equal(await drawn(), await own(theme), `${theme}: 新建库's icon is this theme's own`)
    if (seen[theme]) assert.equal(now, seen[theme], `${theme}: the same icons as the first time`)
    seen[theme] = now
  }
  assert.notEqual(seen.precision, seen.research, '精密国际主义 and 研究对话 do not draw the same icons')
  assert.notEqual(seen.glass, seen.precision, '澄明玻璃 and 精密国际主义 do not draw the same icons')
  assert.deepEqual(s.errors, [])
})

// ---- 新建库 ---------------------------------------------------------------------------------------------------------------------
const newRun = lazySession({ start: 'new-library' })
test('R6d-3 新建库 in 单线黑白 and the dark looks: 新建库 in the sidebar can be read while it is the screen', async () => {
  const s = await newRun()
  await clean(s, ['monoline-light', 'monoline-dark', 'precision-dark', 'glass-dark', 'research-dark'], ['.sidebar .navitem.new.active'], '新建库')
})

test('R6d-3 新建库 in 研究对话, light: the preset pack\'s second line (.document-link small)', async () => {
  const s = await newRun()
  await clean(s, ['research-light'], ['[data-part="pack-line"] small'], '新建库')
})

// ---- 问库 -----------------------------------------------------------------------------------------------------------------------
const askRun = lazySession({
  start: 'ask',
  prepare: ({ shelf, root }) => {
    const askFile = join(root, 'ask-answer.json')
    writeFileSync(askFile, JSON.stringify({
      answer: [{ text: '库里的评测横向比较了五种 agent 记忆方案，作者自己的方案排第一。', cites: [1] }, { text: '分层记忆在长对话上的评测效果最好。', cites: [2] }],
      notInLibrary: false, missing: '「隔天回来」情形下各方案的直接排名', claimed: ['json-keys', 'cites-in-set', 'cited-sentences', 'claims-supported'],
    }), 'utf8')
    const agentFile = join(root, 'agent-script.json')
    writeFileSync(agentFile, JSON.stringify([{ reply: '已生成修改提议：单次运行上限从 120 次改为 30 次模型调用，确认后生效。', proposals: [{ kind: 'edit_cap', why: '你说 30 次就够了', params: { libraryId: shelf.ids[0], cap: 30 } }] }]), 'utf8')
    return { STREAMS_DEV_ASK_SCRIPT: askFile, STREAMS_DEV_AGENT_SCRIPT: agentFile }
  },
})
test('R6d-3 问库 in the four light looks: the small notes round 6 draws in fixed greys (.speaker small, .compose-help, .after-card, .confirm-footer .muted, .panel-summary p)', async () => {
  const s = await askRun()
  const { page, until } = s
  await page.fill('textarea[data-field="question"]', 'agent 记忆方案里哪种在长对话上表现最好？')
  await page.click('[data-action="send"] button')
  await until(() => document.querySelector('[data-turn="0"]')?.dataset.state === 'done' && document.querySelector('[data-turn="0"] [data-sentence]') !== null)
  await page.click('[data-turn="0"] [data-action="add-demand"] button')
  await until(() => document.querySelector('[data-turn="0"] [data-part="demand-added"]') !== null)
  await page.fill('textarea[data-field="question"]', '这个库单次运行最多调用 30 次就够了，帮我把上限改成 30。')
  await page.click('[data-action="send"] button')
  await until(() => document.querySelector('[data-turn="1"]')?.dataset.state === 'done' && document.querySelector('[data-turn="1"] [data-proposal]') !== null)
  await s.tab('detail')
  await until(() => document.querySelector('[data-part="detail-ask"] [data-detail-cite]') !== null)
  // the first answer's notes (库内缺少 · 已加入待补充主题) in view; the second turn's speaker line and proposal below it
  await page.evaluate(() => document.querySelector('[data-turn="0"] .after-card')?.scrollIntoView({ block: 'start' }))
  await clean(s, ['precision-light', 'glass-light', 'research-light', 'monoline-light'], ['[data-turn="0"] .after-card [data-part="missing"]', '.speaker small', '.compose-help', '.panel-summary p'], '问库')
  await page.evaluate(() => { const b = document.querySelector('.st-ask .thread-scroll'); b?.scrollTo(0, b.scrollHeight) })
  await clean(s, ['precision-light', 'glass-light', 'research-light', 'monoline-light'], ['[data-turn="1"] [data-proposal] .confirm-footer [data-part="note"]', '.speaker small[data-part="routed"]'], '问库')
  assert.deepEqual(s.errors, [])
})
