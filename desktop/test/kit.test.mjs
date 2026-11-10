// The token list (docs/tokens.md) and the styles, in plain Node: every token tokens.css defines is in the table of
// docs/tokens.md and the table names no token the file does not define (the list is what Friday's comparison of three
// sets runs on, so it must stay in step); every `var(--st-…)` a style file uses is defined; no colour is written anywhere
// but tokens.css (a hex, rgb() or hsl() in another style file); the five fetch states each have their pair of tokens.
// Controls first: each check fails on text made to break it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { FETCH_STATES } from '../src/shared/fetch-states.mjs'

const STYLES = join(DESKTOP_DIR, 'src', 'renderer', 'styles')
const TOKENS = readFileSync(join(STYLES, 'tokens.css'), 'utf8')
const DOC = readFileSync(join(REPO_DIR, 'docs', 'tokens.md'), 'utf8')

const defined = text => [...new Set([...text.matchAll(/^\s*(--st-[a-z0-9-]+)\s*:/gm)].map(m => m[1]))]
const used = text => [...new Set([...text.matchAll(/var\((--st-[a-z0-9-]+)\)/g)].map(m => m[1]))]
/** The tokens the doc's table names: the first cell of each row, `--st-…` in back-ticks. */
const documented = text => [...new Set([...text.matchAll(/^\|\s*`(--st-[a-z0-9-]+)`/gm)].map(m => m[1]))]
const COLOUR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i

function cssFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...cssFiles(p))
    else if (name.endsWith('.css')) out.push(p)
  }
  return out
}

test('controls: the readers see tokens and colours', () => {
  assert.deepEqual(defined(':root {\n  --st-a: #fff;\n  --st-b-c: 1px;\n}'), ['--st-a', '--st-b-c'])
  assert.deepEqual(used('.x { color: var(--st-a); border: 1px solid var(--st-b-c) }'), ['--st-a', '--st-b-c'])
  assert.deepEqual(documented('| `--st-a` | #fff |\n| `--st-b-c` | 1px |\n| name | x |'), ['--st-a', '--st-b-c'])
  assert.ok(COLOUR.test('color: #1F6E8C') && COLOUR.test('rgba(1,2,3,.4)') && !COLOUR.test('color: var(--st-text)'))
})

test('tokens.css and docs/tokens.md name the same tokens, each once', () => {
  const inCss = defined(TOKENS)
  const inDoc = documented(DOC)
  assert.ok(inCss.length > 60, `${inCss.length} tokens in tokens.css`)
  assert.deepEqual(inDoc.filter(t => !inCss.includes(t)), [], 'documented but not defined')
  assert.deepEqual(inCss.filter(t => !inDoc.includes(t)), [], 'defined but not in the list')
  // v2 package K2 (six sets, generated from the K1 draft: scripts/gen-tokens.mjs): the first block, :root, holds the values all
  // six share; each of the six set blocks names the same tokens, each once, none of the shared ones; together they are all.
  // (Before K2: :root was river and two blocks overrode some of its values — rewritten for the new layout.)
  const blocks = tokenBlocks(TOKENS)
  assert.equal(blocks.length, 7)
  assert.equal(blocks[0].selector, ':root')
  const shared = blocks[0].names
  const first = blocks[1].names
  for (const b of blocks) assert.equal(new Set(b.names).size, b.names.length, `${b.selector}: no token defined twice`)
  for (const b of blocks.slice(1)) {
    assert.deepEqual([...b.names].sort(), [...first].sort(), `${b.selector}: the same names as the others`)
    assert.deepEqual(b.names.filter(n => shared.includes(n)), [], `${b.selector}: none of the shared ones`)
  }
  assert.deepEqual([...shared, ...first].sort(), [...inCss].sort(), 'shared + one set = every token')
  // the readers can fail: a token defined twice in a block, a block naming another token than the rest
  const bad = tokenBlocks(':root {\n  --st-a: #fff;\n  --st-a: #000;\n}\n[data-theme="x"] {\n  --st-b: #fff;\n}')
  assert.deepEqual(bad.map(b => b.names), [['--st-a', '--st-a'], ['--st-b']])
})

/** The blocks of tokens.css: each selector with the token names it sets, in order. */
function tokenBlocks(text) {
  const plain = text.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...plain.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ selector: m[1].trim(), names: [...m[2].matchAll(/^\s*(--st-[a-z0-9-]+)\s*:/gm)].map(x => x[1]) }))
}

test('every token a style file uses is defined; no colour is written outside tokens.css', () => {
  const inCss = defined(TOKENS)
  const problems = []
  for (const file of cssFiles(STYLES)) {
    const rel = relative(STYLES, file)
    const text = readFileSync(file, 'utf8')
    for (const t of used(text)) if (!inCss.includes(t)) problems.push(`${rel}: ${t} is not defined`)
    if (rel === 'tokens.css') continue
    for (const [i, line] of text.split('\n').entries()) if (COLOUR.test(line.replace(/\/\*.*?\*\//g, ''))) problems.push(`${rel}:${i + 1}: a colour outside tokens.css: ${line.trim()}`)
  }
  assert.deepEqual(problems, [])
})

test('the five fetch states (src/shared/fetch-states.mjs) each have a colour and a background token, in the list', () => {
  assert.deepEqual([...FETCH_STATES], ['ok', 'empty', 'gap', 'failed', 'blocked'])
  const inCss = defined(TOKENS)
  for (const s of FETCH_STATES) {
    assert.ok(inCss.includes(`--st-fetch-${s}`), `--st-fetch-${s}`)
    assert.ok(inCss.includes(`--st-fetch-${s}-bg`), `--st-fetch-${s}-bg`)
  }
})

// v2 package K2 (维护者 11-10 #6 「定」: the font is Noto Sans SC, shipped; the default theme 精密国际主义) — replaces the check of
// 11-02's font (Microsoft YaHei UI) and river's identity colour, which the new themes changed
test('the font is the bundled Noto Sans SC (styles/fonts.css, loaded through app://) and the default set is 精密国际主义\'s', () => {
  const sets = TOKENS.match(/--st-font: [^;]+;/g)
  assert.equal(sets.length, 6)
  for (const s of sets) assert.equal(s, "--st-font: 'Streams Numerals', 'Streams Noto Sans SC', sans-serif;")
  const fonts = readFileSync(join(STYLES, 'fonts.css'), 'utf8')
  const face = /@font-face \{[^}]*font-family: 'Streams Noto Sans SC';[^}]*src: url\('([^']+)'\) format\('truetype'\);[^}]*\}/.exec(fonts)
  assert.ok(face, 'fonts.css has the face of the bundled font')
  const file = join(STYLES, face[1])
  assert.equal(face[1], '../fonts/NotoSansSC-VF.ttf')
  assert.ok(statSync(file).size > 10_000_000, 'the variable font itself (17.8 MB), next to its license')
  assert.ok(statSync(join(STYLES, '..', 'fonts', 'OFL-NotoSansSC.txt')).size > 4000)
  assert.match(readFileSync(join(STYLES, 'app.css'), 'utf8'), /@import url\('\.\/fonts\.css'\);/, 'the page imports it')
  assert.equal(/@font-face/.test(TOKENS), false, 'not in tokens.css: the reading window\'s pages take tokens.css and load nothing')
  // the default (精密国际主义 · 浅色) is also :root
  assert.match(TOKENS, /:root, \[data-theme="precision"\] \{\n  color-scheme: light;\n  --st-page: #F6F6F3;/)
})
