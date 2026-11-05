// The three looks (docs/desktop.md §五「主题」; docs/tokens.md), in plain Node: the ids and the one default; tokens.css holds the
// three sets (:root = river, the other two only override) with each set's color-scheme and page colour where the main
// process reads them (shared/themes.mjs: the window's background before the first frame); the WCAG 2 contrast of the
// contract's twelve word / ground pairs in each set; index.html served with data-theme (theme.mjs withTheme); the native
// side (nativeTheme.themeSource). Controls first: each check fails on input made to break it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { DEFAULT_THEME, THEME_IDS, isThemeId, nativeSource, themeOf, windowColour, withTheme } from '../src/main/theme.mjs'
import { THEME_PAGE, THEME_SCHEME } from '../src/shared/themes.mjs'
import { contrast, tokenBlocks, tokenSets } from './support/tokens.mjs'

const TOKENS = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'styles', 'tokens.css'), 'utf8')
const INDEX = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'index.html'), 'utf8')

// the contract's pairs (T): words on their ground, each at least 4.5 : 1 in every set
const PAIRS = [
  ['text', 'page'], ['text', 'surface'], ['text-2', 'surface'], ['text-2', 'page'],
  ['sidebar-text', 'sidebar'], ['sidebar-text-2', 'sidebar'], ['sidebar-selected-title', 'surface'], ['on-accent', 'accent'],
  ['wait', 'wait-bg'], ['done', 'done-bg'], ['danger', 'danger-bg'], ['fetch-blocked', 'fetch-blocked-bg'],
]
// river keeps the plan's values (the contract: 「值一个不改」); two of its pairs were under 4.5 before any of this work and are
// listed here as they are, for 维护者 to decide (docs/tokens.md 「对比度」). Fixing river's values makes this list fail: empty it then.
const RIVER_BELOW = Object.freeze({ 'wait/wait-bg': 4.42, 'done/done-bg': 4.45 })

function below(set, pairs = PAIRS) {
  const out = {}
  for (const [fg, bg] of pairs) {
    const r = contrast(set[`--st-${fg}`], set[`--st-${bg}`])
    if (r < 4.5) out[`${fg}/${bg}`] = Math.round(r * 100) / 100
  }
  return out
}

function srcFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...srcFiles(p))
    else if (/\.(mjs|cjs|js)$/.test(name)) out.push(p)
  }
  return out
}

test('controls: the contrast and the readers can fail', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 100) / 100, 21)
  assert.equal(contrast('#777777', '#777777'), 1)
  assert.deepEqual(below({ '--st-a': '#777777', '--st-b': '#888888' }, [['a', 'b']]), { 'a/b': 1.26 })
  const sets = tokenSets(':root {\n  color-scheme: light;\n  --st-a: #fff;\n  --st-b: 1px;\n}\n:root[data-theme="x"] {\n  color-scheme: dark;\n  --st-a: #000;\n}')
  assert.deepEqual(sets, { river: { '--st-a': '#fff', '--st-b': '1px' }, x: { '--st-a': '#000', '--st-b': '1px' } })
  assert.throws(() => withTheme('<p>no tag</p>', 'night'))
  assert.throws(() => withTheme('<html lang="zh-CN"><html>', 'night'))
  assert.throws(() => withTheme('<html lang="zh-CN" data-theme="paper">', 'night'))
})

test('three ids; DEFAULT_THEME is river and is defined in one place only (main/theme.mjs)', () => {
  assert.deepEqual([...THEME_IDS], ['river', 'paper', 'night'])
  assert.equal(DEFAULT_THEME, 'river')
  const defining = srcFiles(join(DESKTOP_DIR, 'src')).filter(f => /\bDEFAULT_THEME\s*=/.test(readFileSync(f, 'utf8'))).map(f => relative(DESKTOP_DIR, f).replace(/\\/g, '/'))
  assert.deepEqual(defining, ['src/main/theme.mjs'])
  for (const id of THEME_IDS) assert.equal(themeOf(id), id)
  for (const bad of ['blue', 'River', '', null, undefined, 3, ['night']]) {
    assert.equal(themeOf(bad), DEFAULT_THEME, String(bad))
    assert.equal(isThemeId(bad), false)
  }
})

test('tokens.css: river in :root, paper and night override; each set its color-scheme; the window colour is each set\'s --st-page', () => {
  const blocks = tokenBlocks(TOKENS)
  assert.deepEqual(blocks.map(b => [b.theme, b.scheme]), [['river', 'light'], ['paper', 'light'], ['night', 'dark']])
  const sets = tokenSets(TOKENS)
  assert.deepEqual(Object.keys(sets), [...THEME_IDS])
  for (const id of THEME_IDS) {
    assert.equal(THEME_PAGE[id].toUpperCase(), sets[id]['--st-page'].toUpperCase(), `${id}: shared/themes.mjs THEME_PAGE is tokens.css --st-page`)
    assert.equal(windowColour(id), THEME_PAGE[id])
    assert.equal(THEME_SCHEME[id], blocks.find(b => b.theme === id).scheme, `${id}: the native side is the page's color-scheme`)
  }
  assert.deepEqual(THEME_IDS.map(nativeSource), ['light', 'light', 'dark'])
  assert.equal(nativeSource('blue'), nativeSource(DEFAULT_THEME), 'an unknown id is the default')
  // what the contract says each set is
  const paper = blocks.find(b => b.theme === 'paper').values
  const night = blocks.find(b => b.theme === 'night').values
  assert.equal(paper.get('--st-sidebar'), '#E9EEF2', 'paper: the sidebar on sunk')
  assert.equal(paper.get('--st-sidebar-text'), '#16222B', 'paper: ink words')
  assert.equal(paper.has('--st-accent'), false, 'paper: the accent stays river')
  assert.equal(paper.has('--st-sidebar-selected-title'), false, 'paper: the current entry keeps river words')
  assert.ok(['divider', 'button', 'button-border'].every(k => paper.get(`--st-sidebar-${k}`).startsWith('rgba(22, 34, 43,')), 'paper: the sidebar\'s lines and buttons are ink at an opacity')
  assert.equal(night.get('--st-sidebar'), '#16303C', 'night: the sidebar on the dark river-soft')
  assert.equal(night.get('--st-accent'), '#74B7D3')
  assert.equal(night.get('--st-on-accent'), '#0F161B', 'night: dark words on the light accent')
  assert.equal(night.get('--st-sidebar-selected-title'), '#74B7D3')
  assert.equal(night.get('--st-surface'), '#171F26')
  assert.ok(contrast(night.get('--st-accent-hover'), '#000000') > contrast(night.get('--st-accent'), '#000000'), 'night: the hover is lighter than the accent')
  const steps = [1, 2, 3, 4, 5].map(i => contrast(night.get(`--st-chart-${i}`), night.get('--st-surface')))
  assert.deepEqual([...steps].sort((a, b) => b - a), steps, 'night: the five chart steps fade toward the surface')
})

test('the twelve word / ground pairs: at least 4.5 : 1 in paper and night; river as the plan left it (two listed pairs under)', () => {
  const sets = tokenSets(TOKENS)
  const report = Object.fromEntries(THEME_IDS.map(id => [id, Object.fromEntries(PAIRS.map(([fg, bg]) => [`${fg}/${bg}`, Math.round(contrast(sets[id][`--st-${fg}`], sets[id][`--st-${bg}`]) * 100) / 100]))]))
  process.stdout.write(`# contrast ${JSON.stringify(report)}\n`)
  assert.deepEqual(below(sets.paper), {}, 'paper')
  assert.deepEqual(below(sets.night), {}, 'night')
  assert.deepEqual(below(sets.river), RIVER_BELOW, 'river: only the two pairs the plan\'s palette already had under 4.5')
})

test('index.html as served: data-theme on its one <html> tag, before any script; an unknown id is the default; nothing else changes', () => {
  assert.equal(/data-theme/.test(INDEX), false, 'control: the file itself names no theme')
  for (const id of THEME_IDS) {
    const served = withTheme(INDEX, id)
    assert.match(served, new RegExp(`^<!doctype html>\\n<html lang="zh-CN" data-theme="${id}">\\n`))
    assert.equal(served.replace(` data-theme="${id}"`, ''), INDEX, 'only the attribute is added')
    assert.ok(served.indexOf('data-theme') < served.indexOf('<script'), 'before the first script')
  }
  assert.match(withTheme(INDEX, '"><script>x</script>'), /<html lang="zh-CN" data-theme="river">/, 'a value that is not an id cannot write into the page')
})

test('docs/tokens.md: each row\'s three value columns are tokens.css\'s (「同河蓝」 = not overridden in that set)', () => {
  const doc = readFileSync(join(DESKTOP_DIR, '..', 'docs', 'tokens.md'), 'utf8')
  const blocks = tokenBlocks(TOKENS)
  const norm = v => v.replace(/\s+/g, '').replace(/0\./g, '.').toLowerCase()
  const codeOf = cell => /`([^`]+)`/.exec(cell)?.[1] ?? null
  const rows = doc.split('\n').filter(l => /^\| `--st-/.test(l)).map(l => l.split('|').slice(1, -1).map(c => c.trim()))
  assert.ok(rows.length > 60, `${rows.length} rows`)
  const problems = []
  for (const [nameCell, river, paper, night] of rows) {
    const name = codeOf(nameCell)
    if (norm(codeOf(river) ?? '') !== norm(blocks[0].values.get(name) ?? '?')) problems.push(`${name} river: ${river}`)
    for (const [i, cell] of [[1, paper], [2, night]]) {
      const own = blocks[i].values.get(name)
      if (own === undefined ? cell !== '同河蓝' : norm(codeOf(cell) ?? '') !== norm(own)) problems.push(`${name} ${blocks[i].theme}: ${cell}`)
    }
  }
  assert.deepEqual(problems, [])
  // control: a changed value in the doc is told apart
  assert.notEqual(norm('`#16303C`'), norm('`#16303D`'))
})
