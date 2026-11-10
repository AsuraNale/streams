// Reading styles/tokens.css the way the page gets it (test/theme.test.mjs, test/kit.test.mjs). Comments are dropped before reading.
// v2 package K2: six sets — a `:root` block of the values all share, then per theme its light block (`[data-theme="<id>"]`,
// precision's also `:root, …`) and its dark block (`[data-theme="<id>"][data-appearance="dark"]`), each complete.
//   tokenBlocks(text)  [{ selector, theme, scheme, values: Map(name → value) }]   (theme null and scheme null: the shared block)
//   tokenSets(text)    { 'precision/light': {name: value}, 'precision/dark': {...}, … } — each set the shared values with its own on top
// And the WCAG 2 contrast of two colours (#RRGGBB): (L1 + 0.05) / (L2 + 0.05) with the relative luminance of each.
const BLOCK = /([^{}]+)\{([^}]*)\}/g
const DECL = /^\s*(--st-[a-z0-9-]+)\s*:\s*([^;]+);/gm
const LIGHT = /^(?::root, )?\[data-theme="([a-z]+)"\]$/
const DARK = /^\[data-theme="([a-z]+)"\]\[data-appearance="dark"\]$/

export function tokenBlocks(text) {
  const plain = text.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...plain.matchAll(BLOCK)].map(m => {
    const selector = m[1].trim()
    const light = LIGHT.exec(selector)
    const dark = DARK.exec(selector)
    const theme = light?.[1] ?? dark?.[1] ?? null
    return {
      selector,
      theme,
      appearance: light ? 'light' : (dark ? 'dark' : null),
      values: new Map([...m[2].matchAll(DECL)].map(d => [d[1], d[2].trim()])),
      scheme: /color-scheme:\s*([a-z]+)/.exec(m[2])?.[1] ?? null,
    }
  })
}

export function tokenSets(text) {
  const blocks = tokenBlocks(text)
  const shared = blocks.find(b => b.selector === ':root')
  if (!shared) throw new Error('tokens.css has no :root block')
  const sets = {}
  for (const b of blocks) {
    if (!b.theme) continue
    sets[`${b.theme}/${b.appearance}`] = { ...Object.fromEntries(shared.values), ...Object.fromEntries(b.values) }
  }
  return sets
}

const channel = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }

/** Relative luminance of #RRGGBB (WCAG 2). */
export function luminance(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim())
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`)
  const [r, g, b] = m.slice(1).map(h => channel(parseInt(h, 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio of two #RRGGBB colours (1 … 21). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
