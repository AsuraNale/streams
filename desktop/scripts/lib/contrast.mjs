// The contrast check of redesign R6d (docs/checks/2026-11-15-r6d/contract.md R6d-3): run inside a page just before its
// picture is taken (scripts/shots-r6d.mjs). For every piece of text a person can see in the window it works out the colour
// the text is drawn in and the colour really behind it, and their WCAG 2 contrast ratio; what is under the bar is returned.
//
//   contrastInPage({ maxY })   the function that runs in the page (page.evaluate / webContents.executeJavaScript): it is
//                              sent as its source text, so it uses nothing outside itself
//   REQUIRED                   the bars: 4.5 : 1 for text, 3 : 1 for large text (≥ 24 px, or ≥ 18.66 px and bold ≥ 700)
//   EXEMPT                     the only two reasons a piece under the bar is not counted (WCAG 1.4.3 asks nothing of them)
//
// What counts as a piece of text: an element with a text node of its own that is not blank (one piece per element), the
// value an <input> / <textarea> / <select> shows, and — when a field is empty — its placeholder. <script>, <style>,
// <template>, <option> (drawn by its <select>) and the text children of a <textarea> are not pieces.
//
// What counts as seen: the element is rendered (Element.checkVisibility with opacity and visibility), its text has a box,
// the box — cut by the window and by every ancestor that clips its overflow — keeps at least 2 × 2 px, and the middle of
// what is left is not covered by something opaque (document.elementFromPoint: an element that is neither the piece's own
// nor one of its ancestors / descendants and that paints a background of alpha ≥ 0.5, a picture or a canvas over it). Text
// behind an open modal dialog is inert (hit testing skips it), so it is not asked about covering: it is still measured, on
// its own colours — the dialog's scrim lies over the text and its background alike — and is marked `inert`.
//
// The colour behind (「逐层往上找到不透明的背景，带透明度的按叠加算」): from <html> down to the element, starting on white (the
// canvas), each ancestor's background-color is laid over what is there by its alpha; a gradient background-image is laid
// over that once for each of its colour stops (the text may sit on any of them — every stop is a scenario and the worst
// ratio is the one reported); a modal <dialog>'s ::backdrop is laid under the dialog; an ancestor with opacity < 1 is a
// group: what is inside it (its backgrounds and the text) is mixed, by that opacity, with what was there before it. The
// text's own colour (-webkit-text-fill-color when it is set, else color; fill for SVG text) is laid over the result by its
// alpha. A background-image that is a picture (url(…)) cannot be worked out: the piece is counted in `pictures` and
// measured on the colours under the picture.
//
// What it does not see: backgrounds painted by ::before / ::after, text-shadow, mix-blend-mode, backdrop-filter (the blur
// changes nothing of an even background; over a busy one the colour behind is the one computed here only on average), and
// an absolutely positioned element lying over ancestors that are not its DOM ancestors (a menu over the page: its own
// background is opaque in all four themes, so the page behind does not matter).

export const REQUIRED = Object.freeze({ text: 4.5, large: 3 })
export const EXEMPT = Object.freeze({
  disabled: 'a disabled control: WCAG 1.4.3 does not apply to inactive user interface components',
  placeholder: 'a placeholder hint in an empty field: not content, gone as soon as something is typed (contract R6d-3)',
})

/* eslint-disable no-undef */
export function contrastInPage(opts) {
  const VW = innerWidth
  const VH = Math.min(innerHeight, (opts && opts.maxY) || innerHeight)
  const cache = new Map()
  let ctx = null
  const parse = s => {
    if (cache.has(s)) return cache.get(s)
    let c = null
    const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s)
    if (m) c = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4])]
    else if (s === 'transparent') c = [0, 0, 0, 0]
    else {
      // any other notation (color(srgb …), oklch(…), color-mix(…)): drawn on a canvas and read back
      if (!ctx) { const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1; ctx = cv.getContext('2d', { willReadFrequently: true }) }
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = s
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      c = [d[0], d[1], d[2], d[3] / 255]
    }
    cache.set(s, c)
    return c
  }
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]))
  const mix = (below, c, o) => [0, 1, 2].map(i => c[i] * o + below[i] * (1 - o))
  const lin = v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
  const ratioOf = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const hex = c => `#${c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
  const STOP = /rgba?\([^()]*\)|color\([^()]*\)|okl(?:ch|ab)\([^()]*\)|hsla?\([^()]*\)|#[0-9a-fA-F]{3,8}\b/g

  /** The colours of `el`'s text and of what is behind it, as drawn: the scenario with the lowest ratio. */
  const resolve = (el, fgText) => {
    const chain = []
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) chain.unshift(e)
    let scen = [{ cur: [255, 255, 255], groups: [] }]
    let picture = false
    for (const e of chain) {
      const cs = getComputedStyle(e)
      if (e.tagName === 'DIALOG' && e.matches(':modal')) {
        const bd = parse(getComputedStyle(e, '::backdrop').backgroundColor)
        if (bd && bd[3] > 0) for (const s of scen) s.cur = over(bd, s.cur)
      }
      const o = parseFloat(cs.opacity)
      for (const s of scen) s.below = s.cur
      const bg = parse(cs.backgroundColor)
      if (bg && bg[3] > 0) for (const s of scen) s.cur = over(bg, s.cur)
      const bi = cs.backgroundImage
      if (bi && bi !== 'none') {
        if (/url\(/.test(bi)) picture = true
        const stops = (bi.match(STOP) || []).map(parse).filter(c => c && c[3] > 0)
        if (stops.length) {
          const next = []
          const seen = new Set()
          for (const s of scen) for (const st of stops) {
            const cur = over(st, s.cur)
            const key = hex(cur) + s.groups.length + hex(s.below)
            if (seen.has(key)) continue
            seen.add(key)
            next.push({ cur, below: s.below, groups: s.groups })
          }
          scen = next.slice(0, 32)
        }
      }
      if (o < 1) for (const s of scen) s.groups = [...s.groups, { below: s.below, o }]
    }
    let worst = null
    for (const s of scen) {
      let bg = s.cur
      let fg = over(fgText, bg)
      for (let i = s.groups.length - 1; i >= 0; i--) { const g = s.groups[i]; bg = mix(g.below, bg, g.o); fg = mix(g.below, fg, g.o) }
      const r = ratioOf(fg, bg)
      if (!worst || r < worst.ratio) worst = { ratio: r, fg, bg }
    }
    return { ...worst, picture, scenarios: scen.length }
  }

  const kebab = k => k.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`)
  const KEYS = ['part', 'action', 'dialog', 'screen', 'pane', 'field', 'panelTab', 'tab', 'nav', 'connection', 'check', 'group', 'mode']
  const selectorOf = el => {
    const parts = []
    for (let e = el; e && e.nodeType === 1 && e !== document.body && parts.length < 5; e = e.parentElement) {
      const d = e.dataset || {}
      let mark = ''
      for (const k of KEYS) if (d[k] !== undefined) { mark = d[k] !== '' && d[k].length <= 40 ? `[data-${kebab(k)}="${d[k]}"]` : `[data-${kebab(k)}]`; break }
      if (!mark) {
        const cls = typeof e.className === 'string' ? e.className.trim() : (e.getAttribute('class') || '').trim()
        mark = e.id ? `#${e.id}` : (cls ? `.${cls.split(/\s+/)[0]}` : '')
      }
      parts.unshift(`${e.tagName.toLowerCase()}${mark}`)
    }
    return parts.join(' > ')
  }

  const clips = new Map()
  const clipOf = el => {
    if (clips.has(el)) return clips.get(el)
    let r = { l: 0, t: 0, r: VW, b: VH }
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const b = e.getBoundingClientRect()
        r = { l: Math.max(r.l, b.left), t: Math.max(r.t, b.top), r: Math.min(r.r, b.right), b: Math.min(r.b, b.bottom) }
      }
      if (cs.position === 'fixed') break
    }
    clips.set(el, r)
    return r
  }
  const modal = document.querySelector('dialog:modal')
  const paints = e => {
    if (['IMG', 'VIDEO', 'CANVAS', 'IFRAME'].includes(e.tagName)) return true
    const cs = getComputedStyle(e)
    const bg = parse(cs.backgroundColor)
    return (bg && bg[3] >= 0.5) || (cs.backgroundImage && cs.backgroundImage !== 'none')
  }
  /** The part of `rects` a person sees, or null: { x, y } its middle; `inert` when it is behind the open modal dialog. */
  const seen = (el, rects) => {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null
    const clip = clipOf(el)
    for (const b of rects) {
      const l = Math.max(b.left, clip.l)
      const t = Math.max(b.top, clip.t)
      const r = Math.min(b.right, clip.r)
      const bt = Math.min(b.bottom, clip.b)
      if (r - l < 2 || bt - t < 2) continue
      const x = (l + r) / 2
      const y = (t + bt) / 2
      const inert = Boolean((modal && !modal.contains(el)) || el.closest('[inert]'))
      if (inert) return { x, y, inert }
      const hit = document.elementFromPoint(x, y)
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return { x, y, inert }
      // something else is on top there: it covers the text only if it paints (itself or up to the ancestor it shares with el)
      let covered = false
      for (let e = hit; e && !e.contains(el); e = e.parentElement) if (paints(e)) { covered = true; break }
      if (!covered) return { x, y, inert }
      return { covered: true }
    }
    return null
  }

  const out = { checked: 0, below: 0, covered: 0, pictures: 0, lowestPassing: null, entries: [] }
  const DISABLED = 'button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled, [aria-disabled="true"]'
  const measure = (el, text, fgString, kind, where) => {
    const fgText = parse(fgString)
    if (!fgText || fgText[3] === 0) return
    const cs = getComputedStyle(el)
    const size = parseFloat(cs.fontSize)
    const weight = parseInt(cs.fontWeight, 10) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const required = large ? 3 : 4.5
    const r = resolve(el, fgText)
    out.checked += 1
    if (r.picture) out.pictures += 1
    const shown = Math.floor(r.ratio * 100) / 100
    const piece = { selector: selectorOf(el), text: text.replace(/\s+/g, ' ').trim().slice(0, 20), fg: hex(r.fg), bg: hex(r.bg), ratio: shown, required, size, weight }
    if (where.inert) piece.inert = true
    if (r.picture) piece.picture = true
    if (r.ratio >= required) {
      if (!out.lowestPassing || shown < out.lowestPassing.ratio) out.lowestPassing = piece
      return
    }
    out.below += 1
    if (opts && opts.rules) piece.rules = rulesOf(el, kind === 'placeholder' ? null : 'color')
    if (kind === 'placeholder') { piece.exempt = 'placeholder' } else if (el.closest(DISABLED)) { piece.exempt = 'disabled' }
    out.entries.push(piece)
  }

  /** For looking into a failure (--rules): the style rules that give `el` (or the nearest ancestor that has one) its `prop`. */
  const rulesOf = (el, prop) => {
    if (!prop) return []
    const all = []
    const walk = (rules, href) => { for (const r of rules) { if (r.cssRules && !r.selectorText) walk(r.cssRules, href); else if (r.selectorText && r.style && r.style.getPropertyValue(prop)) all.push([r, href]) } }
    for (const sh of document.styleSheets) { try { walk(sh.cssRules, (sh.href || 'inline').split('/').slice(-2).join('/')) } catch { /* another origin */ } }
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const hit = all.filter(([r]) => { try { return e.matches(r.selectorText) } catch { return false } })
      if (hit.length) return hit.slice(-6).map(([r, href]) => `${e === el ? '' : '(inherited) '}${r.selectorText} { ${prop}: ${r.style.getPropertyValue(prop)} } @ ${href}`)
    }
    return []
  }
  const done = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || done.has(el) || n.nodeValue.trim() === '') continue
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'OPTION', 'TEXTAREA', 'TITLE'].includes(el.tagName)) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    const where = seen(el, [...range.getClientRects()])
    if (!where) continue
    if (where.covered) { out.covered += 1; continue }
    done.add(el)
    const cs = getComputedStyle(el)
    const svg = typeof SVGElement !== 'undefined' && el instanceof SVGElement
    const fill = cs.webkitTextFillColor
    measure(el, n.nodeValue, svg ? cs.fill : (fill && fill !== cs.color ? fill : cs.color), 'text', where)
  }
  for (const el of document.body.querySelectorAll('input, textarea, select')) {
    if (el.tagName === 'INPUT' && ['checkbox', 'radio', 'hidden', 'range', 'file', 'color', 'button', 'submit', 'image'].includes(el.type)) continue
    const where = seen(el, [el.getBoundingClientRect()])
    if (!where) continue
    if (where.covered) { out.covered += 1; continue }
    const cs = getComputedStyle(el)
    const value = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].textContent : '') : el.value
    if (value && value.trim() !== '') measure(el, el.type === 'password' ? '•'.repeat(Math.min(value.length, 8)) : value, cs.color, 'value', where)
    else if (el.placeholder && el.placeholder.trim() !== '') measure(el, el.placeholder, getComputedStyle(el, '::placeholder').color, 'placeholder', where)
  }
  return out
}
