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
  const all = [...TOKENS.matchAll(/^\s*(--st-[a-z0-9-]+)\s*:/gm)].map(m => m[1])
  assert.equal(all.length, inCss.length, 'no token is defined twice')
})

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

test('the font and the identity colour are what the maintainer settled (11-02)', () => {
  assert.match(TOKENS, /--st-font: 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif;/)
  assert.match(TOKENS, /--st-accent: #1F6E8C;/)
  assert.match(TOKENS, /--st-page: #F2F5F7;/)
})
