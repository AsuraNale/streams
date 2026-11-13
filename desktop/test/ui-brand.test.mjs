// 流息's brand mark in the app — the new logo (docs/checks/2026-11-12-logo/contract.md L-3; docs/desktop.md 「品牌记号」), on the
// running app (the world's library open, its 待看):
//   - the sidebar's brand (kit/sidebar.js Sidebar, the one sidebar every screen uses — 首次打开 and 新建库 too) draws the one path
//     of docs/design/logo/source/流息/mark-black.svg: the same viewBox, transform and path data, read off the real window; its
//     fill is currentColor, not the file's black; no template glyph (the old `weave`) stands in for the brand;
//   - four themes × light / dark (set the way 设置 sets them): the mark's computed fill and colour are the theme's ink — the value
//     of the template's --ink11 there, which is also the colour of the page's text (body) — it is shown at its size, nothing is
//     drawn behind it (no tile, no gradient, no 单线黑白 picture of the red / blue 3D mark), and it stands out from the sidebar
//     behind it (contrast ≥ 4.5 : 1).
// Each check first shows the input that makes it fail (mutants logo-*: scripts/mutation-check.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THEME_IDS, THEME_TEMPLATE } from '../src/shared/themes.mjs'
import { appSession } from './support/app.mjs'
import { markIn, markOfFile } from './support/brand.mjs'

const s = appSession({ env: { STREAMS_DEV_CONNECTION: 'fake' } })
const POLL = { polling: 100, timeout: 60_000 }
const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
const BRAND = '.st-sidebar .brand .brandmark svg'
const FILE = markOfFile()

const rgb = hex => {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h
  return `rgb(${[0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(', ')})`
}
/** sRGB relative luminance and the contrast of two `rgb(…)` strings (WCAG 2). */
const channels = c => /rgba?\(([^)]+)\)/.exec(c)[1].split(',').map(Number)
const lum = c => {
  const [r, g, b] = channels(c).slice(0, 3).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

async function setLook(theme, appearance) {
  for (const [m, v] of [['setTheme', theme], ['setAppearance', appearance]]) {
    const r = await s.page.evaluate(([mm, vv]) => window.streams[mm](vv), [m, v])
    assert.equal(r.ok, true, `${m}(${v}): ${JSON.stringify(r)}`)
  }
  await until(([t, a, cls]) => document.body.dataset.appearance === a && document.body.className === cls && document.documentElement.dataset.theme === t
    && [...document.querySelectorAll('link[data-theme-sheet]')].every(l => l.sheet !== null), [theme, appearance, THEME_TEMPLATE[theme].bodyClass])
}

/** The theme's ink and what the brand sits on, in the page as it is now. */
const inkAndGround = () => s.page.evaluate(() => {
  const mark = document.querySelector('.st-sidebar .brand .brandmark')
  // the colour behind the mark: the backgrounds from the window down to the mark, each laid over the one under it
  const chain = []
  for (let el = mark; el; el = el.parentElement) chain.unshift(getComputedStyle(el).backgroundColor)
  let under = [255, 255, 255]
  for (const c of chain) {
    const v = /rgba?\(([^)]+)\)/.exec(c)[1].split(',').map(Number)
    const a = v.length > 3 ? v[3] : 1
    under = under.map((u, i) => Math.round(v[i] * a + u * (1 - a)))
  }
  const cs = getComputedStyle(mark)
  return {
    ink: getComputedStyle(document.body).getPropertyValue('--ink11'),
    text: getComputedStyle(document.body).color,
    ground: `rgb(${under.join(', ')})`,
    behind: { image: cs.backgroundImage, colour: cs.backgroundColor, border: cs.borderTopWidth, shadow: cs.boxShadow, transform: cs.transform },
  }
})

test('controls: the file\'s mark is one path; a path, a colour and a contrast that would be wrong are told apart', () => {
  assert.equal(FILE.paths, 1)
  assert.equal(FILE.viewBox, '0 0 520 360')
  assert.equal(FILE.transform, 'scale(40)')
  assert.equal(FILE.fill, '#000000', 'the file is the black one')
  assert.match(FILE.d, /^M2 0L4\.707 0/)
  const weave = 'M3 14 10 7l5 5 6-6 M3 20l7-7 5 5 6-6 M4 7l4-4' // the template's glyph the sidebar drew before
  assert.notEqual(weave, FILE.d)
  assert.equal(rgb('#292c2d'), 'rgb(41, 44, 45)')
  assert.notEqual(rgb('#000'), rgb('#e5e5df'), 'a mark written black is not the dark ink')
  assert.ok(contrast('rgb(229, 229, 223)', 'rgb(21, 21, 21)') > 4.5 && contrast('rgb(0, 0, 0)', 'rgb(21, 21, 21)') < 1.5)
})

test('the sidebar\'s brand is mark-black.svg\'s one path (viewBox, transform, path data), filled with currentColor; no template glyph as the brand', async () => {
  const got = await markIn(s.page, BRAND)
  assert.ok(got, 'the brand has an <svg>')
  assert.equal(got.viewBox, FILE.viewBox)
  assert.equal(got.paths.length, 1, JSON.stringify(got.paths))
  assert.equal(got.paths[0].transform, FILE.transform)
  assert.equal(got.paths[0].d, FILE.d, 'the path data is the file\'s')
  assert.equal(got.paths[0].fill, 'currentColor', 'the file\'s black becomes the theme\'s colour')
  assert.equal(got.glyph, null, 'not one of the template\'s icons (data-glyph)')
  assert.equal(await s.page.evaluate(() => document.querySelectorAll('.st-sidebar .brand [data-glyph], .st-sidebar .brand .ico').length), 0)
  // the brand link still says the name (V7: only 流息 / Streams in the brand)
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar .brand').getAttribute('aria-label')), '流息')
  assert.equal(await s.page.evaluate(() => document.querySelector('.st-sidebar .brand .brandname').textContent), '流息')
})

for (const theme of THEME_IDS) {
  for (const appearance of ['light', 'dark']) {
    test(`${theme} · ${appearance}: the mark is the theme's ink (--ink11, the text's colour), shown, nothing behind it, and it stands out`, async () => {
      await setLook(theme, appearance)
      const got = await markIn(s.page, BRAND)
      const look = await inkAndGround()
      const ink = rgb(look.ink)
      assert.equal(look.text, ink, 'control: the page\'s text is the --ink11 of this theme')
      assert.equal(got.paths[0].computedFill, ink, `the mark's fill is ${got.paths[0].computedFill}, the theme's ink ${ink}`)
      assert.equal(got.color, ink)
      assert.equal(got.shown, true, 'the mark is drawn (单线黑白 hides the template\'s svg for a picture)')
      assert.ok(got.width >= 30 && got.width <= 44 && Math.abs(got.width / got.height - 13 / 9) < 0.05, `${got.width}×${got.height}: the mark at its 13 : 9 size`)
      assert.deepEqual(look.behind, { image: 'none', colour: 'rgba(0, 0, 0, 0)', border: '0px', shadow: 'none', transform: 'none' }, 'no tile, gradient, picture or tilt behind the mark')
      const c = contrast(ink, look.ground)
      assert.ok(c >= 4.5, `the mark against the sidebar: ${c.toFixed(2)} : 1 (ink ${ink} on ${look.ground})`)
    })
  }
}

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
