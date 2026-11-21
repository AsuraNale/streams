// The app's own styles, in plain Node. Rewritten for redesign R1 (the R1 contract R1-2: K2's tokens.css and docs/tokens.md's
// table are gone — the checks of the two being in step went with them): every `var(--st-…)` a style file of the app uses is
// one interim.css points at the template's variables (so the screens not rebuilt yet still have every colour); no colour
// is written in any style file of the app (the colours are the template's); the five fetch states each have their pair;
// the font is the bundled Noto Sans SC, declared by the template's own design.css and served through app:// (FILE_ALIASES).
// Controls first: each check fails on text made to break it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { FETCH_STATES } from '../src/shared/fetch-states.mjs'
import { FILE_ALIASES } from '../src/main/protocol.mjs'

const STYLES = join(DESKTOP_DIR, 'src', 'renderer', 'styles')
const INTERIM = readFileSync(join(STYLES, 'interim.css'), 'utf8')

const defined = text => [...new Set([...text.matchAll(/^\s*(--st-[a-z0-9-]+)\s*:/gm)].map(m => m[1]))]
const used = text => [...new Set([...text.matchAll(/var\((--st-[a-z0-9-]+)\)/g)].map(m => m[1]))]
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

test('controls: the readers see variables and colours', () => {
  assert.deepEqual(defined(':root {\n  --st-a: var(--x);\n  --st-b-c: 1px;\n}'), ['--st-a', '--st-b-c'])
  assert.deepEqual(used('.x { color: var(--st-a); border: 1px solid var(--st-b-c) }'), ['--st-a', '--st-b-c'])
  assert.ok(COLOUR.test('color: #1F6E8C') && COLOUR.test('rgba(1,2,3,.4)') && !COLOUR.test('color: var(--st-text)'))
})

test('every --st- variable a style file uses is defined in interim.css, there only as the template\'s variables or sizes; no colour in any app style file', () => {
  const inInterim = defined(INTERIM)
  const problems = []
  for (const file of cssFiles(STYLES)) {
    const rel = relative(STYLES, file)
    const text = readFileSync(file, 'utf8')
    for (const t of used(text)) if (!inInterim.includes(t)) problems.push(`${rel}: ${t} is not defined`)
    if (rel !== 'interim.css') for (const t of defined(text)) problems.push(`${rel}: defines ${t} (only interim.css does)`)
    for (const [i, line] of text.split('\n').entries()) if (COLOUR.test(line.replace(/\/\*.*?\*\//g, ''))) problems.push(`${rel}:${i + 1}: a colour: ${line.trim()}`)
  }
  assert.deepEqual(problems, [])
  // every value interim.css gives is a var() of the template's, a color-mix of them, or a size / weight / font name
  const values = [...INTERIM.matchAll(/^\s*--st-[a-z0-9-]+\s*:\s*([^;]+);/gm)].map(m => m[1].trim())
  // redesign R5b: styles/screens/agent.css is deleted and the five names only it used went with it (64 → 59 values): the control
  // that the read finds the file's values is now > 50 (was > 60)
  assert.ok(values.length > 50)
  const ok = v => /^var\(--(bench|panel|paper|well|ink11|sub11|accent11|pick|inverse11|rule11|float11)\)$/.test(v) || /^color-mix\(/.test(v) || /^-?[\d.]+(px)?$/.test(v) || /^(round|0)$/.test(v) || /^'[^']+', monospace$/.test(v)
  assert.deepEqual(values.filter(v => !ok(v)), [])
  assert.equal(ok('#F6F6F3'), false, 'control: a colour is not taken')
})

test('the six fetch states (src/shared/fetch-states.mjs; 1.1 W2 added 要登录) each have a colour and a background variable', () => {
  assert.deepEqual([...FETCH_STATES], ['ok', 'empty', 'gap', 'failed', 'blocked', 'login'])
  const inInterim = defined(INTERIM)
  for (const s of FETCH_STATES) {
    assert.ok(inInterim.includes(`--st-fetch-${s}`), `--st-fetch-${s}`)
    assert.ok(inInterim.includes(`--st-fetch-${s}-bg`), `--st-fetch-${s}-bg`)
  }
})

test('the font is the bundled Noto Sans SC: the template\'s design.css declares it at ../fonts/, which app:// answers with fonts/NotoSansSC-VF.ttf', () => {
  const design = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'template', 'shared', 'round6', 'design.css'), 'utf8')
  const face = /@font-face\{font-family:'Yunzhi Noto';src:url\('([^']+)'\) format\('truetype'\)/.exec(design)
  assert.ok(face, 'the template declares the face')
  assert.equal(face[1], '../fonts/NotoSansSC-VF.ttf')
  assert.deepEqual({ ...FILE_ALIASES }, { 'template/shared/fonts/NotoSansSC-VF.ttf': 'fonts/NotoSansSC-VF.ttf' })
  const file = join(DESKTOP_DIR, 'src', 'renderer', 'fonts', 'NotoSansSC-VF.ttf')
  assert.ok(statSync(file).size > 10_000_000, 'the variable font itself (17.8 MB), next to its license')
  assert.ok(statSync(join(DESKTOP_DIR, 'src', 'renderer', 'fonts', 'OFL-NotoSansSC.txt')).size > 4000)
  assert.equal(/fonts\.css/.test(readFileSync(join(STYLES, 'app.css'), 'utf8')), false, 'K2\'s own face file is gone: the template\'s is the one')
})
