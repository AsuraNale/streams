// Redesign R6a (docs/checks/2026-11-13-r6a/contract.md) on the real window — the shelf's three libraries (test/support/seed.mjs
// seedShelf), the app started on 库架:
//   R6a-1  研究对话's headings are drawn with the Noto Serif SC that ships with the app: the face 'Noto Serif SC' (styles/base.css;
//          that its file is the one app:// serves is test/r6a.test.mjs) is loaded, document.fonts.check says so, the heading's computed font names
//          the family first among its Chinese ones, and the glyphs Chromium actually drew for the heading come from that web
//          font (CSS.getPlatformFontsForNode: isCustomFont — a copy installed in Windows would not be one). With the family
//          misspelt or the file not where the face says, this test fails (mutants r6a-font-family, r6a-font-file) — a misspelt
//          family at once, on the list of the faces the page declares, before anything is waited for.
//   R6a-3  库架's card under the pointer — the selected one — in the four themes, light and dark: every piece of text on it (the
//          line of when it ran, the name, what it follows, the numbers at its foot, 进入待看, its chip) against the colour really
//          behind it: ≥ 4.5 : 1, ≥ 3 : 1 for large text (WCAG: 24 px, or 18.66 px bold). Measured on the current library's card,
//          hovered and at rest. Before R6a the hovered card kept the template's round 9 light surface under round 11's dark
//          ink (docs/desktop.md): with the app's rule taken out the dark tests fail (mutant r6a-shelf-hover). 单线黑白's card
//          under the pointer also has a bar of ink at its left edge (its --well is close to the resting card in the dark set).
// Each test sets the look it needs itself and stands on its own (`--test-name-pattern` runs any one of them).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THEME_IDS, THEME_TEMPLATE } from '../src/shared/themes.mjs'
import { seedShelf, worldSession } from './support/seed.mjs'

const s = worldSession({
  kind: 'seeded', waitFor: 'shelf', settings: { theme: 'research', appearance: 'light' },
  prepare: async world => { world.shelf = await seedShelf(world) },
  env: () => ({ STREAMS_DEV_CONNECTION: 'fake', STREAMS_DEV_LIBRARY: '', STREAMS_START_SCREEN: 'shelf' }),
})
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)

async function setLook(theme, appearance) {
  for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
    const r = await s.page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
    assert.equal(r.ok, true, `${m}(${v}): ${JSON.stringify(r)}`)
  }
  await until(([t, a, cls]) => document.body.dataset.appearance === a && document.body.className === cls && document.documentElement.dataset.theme === t
    && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass])
}

/** sRGB relative luminance and the contrast of two [r, g, b] (WCAG 2). */
const lum = c => {
  const [r, g, b] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
/** What WCAG asks of a text of this size and weight. */
const needed = (px, weight) => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5)

// ---- R6a-1 the font ------------------------------------------------------------------------------------------------------

/** The fonts Chromium used for the element's own text: [{ familyName, isCustomFont, glyphCount }]. */
async function platformFonts(selector) {
  const cdp = await s.page.context().newCDPSession(s.page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    assert.ok(nodeId, `${selector} is on the page`)
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    return fonts.map(f => ({ familyName: f.familyName, isCustomFont: f.isCustomFont, glyphCount: f.glyphCount }))
  } finally {
    await cdp.detach().catch(() => {})
  }
}

test('R6a-1 研究对话: the heading is drawn with the bundled Noto Serif SC — the face is loaded through app://, the computed font names it, the glyphs come from the web font', async () => {
  await setLook('research', 'light')
  const TITLE = '.shelf-body .home-title'
  // the faces the page's style sheets declare (document.fonts lists a face from the moment its sheet is read, loaded or not): one
  // of them has to be under the family the template asks for. Looked at before any waiting, so a face declared under another
  // name fails here at once and says which families there are, not after a wait for a face that will never come.
  const declared = await s.page.evaluate(() => [...document.fonts].map(f => ({ family: f.family.replace(/"/g, ''), status: f.status })))
  assert.ok(declared.length >= 1, 'control: the page declares font faces')
  assert.ok(declared.some(f => f.family === 'Noto Serif SC'),
    `no font face is declared under the family 'Noto Serif SC' (the name 研究对话's --display-chinese asks for); the page's faces: ${[...new Set(declared.map(f => f.family))].join(', ')}`)
  // the face is asked for once a heading that names it is laid out; wait for the load to end either way
  await until(() => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Noto Serif SC' && f.status !== 'unloaded' && f.status !== 'loading'))
  await s.page.evaluate(() => document.fonts.ready)
  const got = await s.page.evaluate(sel => {
    const h = document.querySelector(sel)
    const cs = getComputedStyle(h)
    return {
      text: h.textContent,
      faces: [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Noto Serif SC').map(f => ({ status: f.status, weight: f.weight })),
      check: document.fonts.check(`${cs.fontWeight} ${cs.fontSize} "Noto Serif SC"`, h.textContent),
      families: cs.fontFamily.split(',').map(f => f.trim().replace(/"/g, '')),
      weight: cs.fontWeight,
    }
  }, TITLE)
  assert.ok(/[一-鿿]/.test(got.text), `control: the heading is Chinese text: ${got.text}`)
  assert.deepEqual(got.faces, [{ status: 'loaded', weight: '200 900' }], 'one face of that family, loaded')
  assert.equal(got.check, true, 'document.fonts.check for the heading\'s own text')
  // the computed font: the template's stack — digits' face, then Noto Serif SC, before SimSun and every other Chinese family
  const chinese = got.families.filter(f => f !== 'Workbench Numerals')
  assert.equal(chinese[0], 'Noto Serif SC', `the heading's font: ${got.families.join(', ')}`)
  assert.ok(got.families.indexOf('Noto Serif SC') < got.families.indexOf('SimSun'), 'before the fallback')
  // what was really drawn: the heading's glyphs come from the web font of that family, not from a font installed in Windows
  const drawn = await platformFonts(TITLE)
  const serif = drawn.filter(f => f.familyName === 'Noto Serif SC')
  assert.ok(serif.length >= 1 && serif.every(f => f.isCustomFont === true), `drawn with the bundled face: ${JSON.stringify(drawn)}`)
  assert.ok(serif.reduce((n, f) => n + f.glyphCount, 0) >= 5, `most of the heading's glyphs: ${JSON.stringify(drawn)}`)
  assert.equal(drawn.some(f => f.familyName === 'SimSun' || f.familyName === '宋体'), false, 'nothing fell back to SimSun')
  // controls: a line of body text on the same page is not drawn with it, and the library head (h1) is
  const body = await platformFonts('.shelf-body > p')
  assert.equal(body.some(f => f.familyName === 'Noto Serif SC'), false, `control: body text is not the heading font: ${JSON.stringify(body)}`)
  const h1 = await platformFonts('#shelf-title')
  assert.ok(h1.some(f => f.familyName === 'Noto Serif SC' && f.isCustomFont === true), `the page's title too: ${JSON.stringify(h1)}`)
})

test('R6a-1 a theme that does not name the family draws its headings without it (精密国际主义: the interface font)', async () => {
  await setLook('precision', 'light')
  await s.page.evaluate(() => document.fonts.ready)
  const drawn = await platformFonts('.shelf-body .home-title')
  assert.ok(drawn.length >= 1, 'control: the heading has drawn text')
  assert.equal(drawn.some(f => f.familyName === 'Noto Serif SC'), false, JSON.stringify(drawn))
  const families = await s.page.evaluate(() => getComputedStyle(document.querySelector('.shelf-body .home-title')).fontFamily)
  assert.equal(families.includes('Noto Serif SC'), false, families)
})

// ---- R6a-3 the shelf's selected card --------------------------------------------------------------------------------------

/** Every piece of text of the card `id`: its colour as drawn, the colour behind it, its size and weight. */
const readCard = id => s.page.evaluate(cardId => {
  for (const a of document.getAnimations()) { try { a.finish() } catch { /* an animation that cannot end */ } }
  const card = document.querySelector(`[data-shelf-card="${cardId}"]`)
  const rgba = c => { const v = /rgba?\(([^)]+)\)/.exec(c)[1].split(',').map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1] }
  const over = (top, under, alpha) => under.map((u, i) => Math.round(top[i] * alpha + u * (1 - alpha)))
  // the colour behind an element: the backgrounds from the window down to it, each laid over the one under it
  const ground = el => {
    const chain = []
    for (let e = el; e; e = e.parentElement) chain.unshift(e)
    let under = [255, 255, 255]
    const images = []
    for (const e of chain) {
      const cs = getComputedStyle(e)
      const [r, g, b, a] = rgba(cs.backgroundColor)
      under = over([r, g, b], under, a)
      if (cs.backgroundImage !== 'none' && card.contains(e)) images.push(cs.backgroundImage.slice(0, 60))
    }
    return { under, images }
  }
  const opacity = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  const parts = { updated: '[data-part="updated"]', name: '[data-part="name"]', tracking: '[data-part="tracking"]', inbox: '[data-part="inbox"]', problem: '.project-tile-footer [data-part="problem"]', enter: '.project-tile-footer > span:last-child', chip: '.status-chip' }
  const out = {}
  for (const [key, sel] of Object.entries(parts)) {
    const el = card.querySelector(sel)
    if (!el) continue
    const cs = getComputedStyle(el)
    const g = ground(el)
    const [r, gg, b, a] = rgba(cs.color)
    out[key] = { text: el.textContent.trim().slice(0, 24), colour: over([r, gg, b], g.under, a * opacity(el)), ground: g.under, images: g.images, px: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) }
  }
  return { hovered: card.matches(':hover'), active: card.dataset.active, surface: ground(card).under, ink: rgba(getComputedStyle(card).color).slice(0, 3), shadow: getComputedStyle(card).boxShadow, parts: out }
}, id)

const rounded = n => Math.round(n * 100) / 100
/** { part: contrast } of a reading, and the parts below what their size asks. */
function judge(reading) {
  const numbers = {}
  const low = []
  for (const [key, p] of Object.entries(reading.parts)) {
    assert.deepEqual(p.images, [], `${key}: a picture or gradient behind the text cannot be measured as one colour`)
    const c = contrast(p.colour, p.ground)
    numbers[key] = rounded(c)
    if (c < needed(p.px, p.weight)) low.push(`${key} 「${p.text}」 ${rounded(c)} : 1 (needs ${needed(p.px, p.weight)}; rgb(${p.colour}) on rgb(${p.ground}), ${p.px}px / ${p.weight})`)
  }
  return { numbers, low }
}

test('R6a-3 controls: light text on a light card is far below 4.5 : 1; large text may be 3 : 1', () => {
  // the dark ink of 研究对话 on the light surface round 9 leaves under the pointer: what the card looked like before R6a
  assert.ok(contrast([229, 229, 223], [237, 242, 247]) < 1.3)
  assert.ok(contrast([229, 229, 223], [48, 62, 56]) > 4.5, 'the same ink on the dark set\'s --pick')
  assert.deepEqual([needed(22, 600), needed(24, 400), needed(19, 700), needed(13, 400)], [4.5, 3, 3, 4.5])
  assert.equal(rounded(contrast([0, 0, 0], [255, 255, 255])), 21)
})

for (const theme of THEME_IDS) {
  for (const appearance of ['light', 'dark']) {
    test(`R6a-3 ${theme} · ${appearance}: the shelf's selected card — its name, what it follows and its numbers stand out from the colour behind them, hovered and at rest`, async () => {
      await setLook(theme, appearance)
      const id = s.world.shelf.ids[0]
      const sel = `[data-shelf-card="${id}"]`
      assert.equal(await s.page.evaluate(q => document.querySelector(q)?.dataset.active, sel), 'true', 'control: the current library\'s card')
      // at rest
      await s.page.mouse.move(2, 2)
      await until(q => !document.querySelector(q).matches(':hover'), sel)
      const rest = await readCard(id)
      assert.equal(rest.hovered, false)
      for (const key of ['updated', 'name', 'tracking', 'inbox', 'problem', 'enter']) assert.ok(rest.parts[key], `the card has its ${key}`)
      assert.ok(/\d/.test(rest.parts.inbox.text), `control: the foot has the card's number: ${rest.parts.inbox.text}`)
      // under the pointer: the selected card
      await s.page.hover(`${sel} [data-part="name"]`)
      await until(q => document.querySelector(q).matches(':hover'), sel)
      const hover = await readCard(id)
      assert.equal(hover.hovered, true)
      assert.notDeepEqual(hover.surface, rest.surface, 'control: the card under the pointer has its own surface')
      const a = judge(rest)
      const b = judge(hover)
      process.stdout.write(`# shelf card ${theme}/${appearance} ${JSON.stringify({ rest: { surface: `rgb(${rest.surface})`, ...a.numbers }, hover: { surface: `rgb(${hover.surface})`, ...b.numbers } })}\n`)
      assert.deepEqual(b.low, [], `the selected card (hover), ${theme}/${appearance}`)
      assert.deepEqual(a.low, [], `the card at rest, ${theme}/${appearance}`)
      // the card's ink under the pointer is the theme's ink, on the theme's own surface for a picked part
      const vars = await s.page.evaluate(() => { const cs = getComputedStyle(document.body); return { ink: cs.getPropertyValue('--ink11').trim(), pick: cs.getPropertyValue('--pick').trim() } })
      const hex = h => { const x = h.replace('#', ''); const f = x.length === 3 ? [...x].map(c => c + c).join('') : x; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)) }
      assert.deepEqual(hover.ink, hex(vars.ink), 'the theme\'s --ink11')
      // 单线黑白's --pick is its ink (a picked part there is a solid block): its card under the pointer is on --well
      const well = await s.page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--well').trim())
      assert.deepEqual(hover.surface, hex(theme === 'monoline' ? well : vars.pick), theme === 'monoline' ? 'the theme\'s --well' : 'the theme\'s --pick')
      // 单线黑白: --well is close to the resting card's --paper (in the dark set 1.20 : 1), so the card under the pointer also has
      // the bar of ink at its left edge that the template gives its own selected card; the card at rest has none
      if (theme === 'monoline') {
        const bar = /^rgba?\(([^)]+)\) 4px 0px 0px 0px inset$/.exec(hover.shadow)
        assert.ok(bar, `the selected card's bar: ${hover.shadow}`)
        assert.deepEqual(bar[1].split(',').map(Number), hex(vars.ink), 'the bar is the theme\'s --ink11')
        assert.equal(rest.shadow, 'none', 'the card at rest has no bar')
        assert.ok(contrast(hex(vars.ink), rest.surface) >= 3, `the bar against the resting card's surface: ${rounded(contrast(hex(vars.ink), rest.surface))} : 1`)
      }
      await s.page.mouse.move(2, 2)
    })
  }
}

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
