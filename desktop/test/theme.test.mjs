// The looks (docs/desktop.md §五「主题」; docs/tokens.md), in plain Node. v2 package K2 (维护者 11-10): the three themes of the
// K1 design draft (precision · glass · research) × light / dark replace v1.0's river / paper / night — the old checks of
// three sets were rewritten here for six (the reason: the sets themselves changed). What is held:
//   - the ids, the appearances and the two defaults, each default defined in main/theme.mjs only;
//   - the migration of v1.0's settings (the maintainer's table), every row and a mutant of it that must be caught;
//   - tokens.css is exactly what scripts/gen-tokens.mjs makes of K1's tools/tokens-data.mjs, six complete sets, each value
//     the data's (counted), each set's color-scheme; THEME_PAGE (the window before the first frame) is each set's --st-page;
//   - the contrast of every pair of test/support/contrast-pairs.mjs in all six sets (body ≥ 4.5, secondary ≥ 3, buttons and
//     states ≥ 4.5), with controls: a set whose secondary words are moved toward the ground turns the check red;
//   - index.html served with data-theme and data-appearance; docs/tokens.md's tables are tokens.css's values.
// Controls first: each check fails on input made to break it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { TOKENS_DATA, tokenData, tokensCss } from '../scripts/gen-tokens.mjs'
import {
  APPEARANCES, DEFAULT_APPEARANCE, DEFAULT_THEME, LEGACY_THEMES, THEME_IDS, appearanceOf, isAppearance, isThemeId, migrateLook,
  nativeSource, resolveAppearance, themeOf, windowColour, withTheme,
} from '../src/main/theme.mjs'
import { SCHEMES, THEME_PAGE } from '../src/shared/themes.mjs'
import { contrast, tokenBlocks, tokenSets } from './support/tokens.mjs'
import { CONTRAST_PAIRS } from './support/contrast-pairs.mjs'

const TOKENS = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'styles', 'tokens.css'), 'utf8')
const INDEX = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'index.html'), 'utf8')
const SETS = THEME_IDS.flatMap(t => SCHEMES.map(a => `${t}/${a}`))

/** The pairs of a set under their floor: { 'fg/bg': ratio }. */
function below(set, pairs = CONTRAST_PAIRS) {
  const out = {}
  for (const [fg, bg, floor] of pairs) {
    const r = contrast(set[`--st-${fg}`], set[`--st-${bg}`])
    if (r < floor) out[`${fg}/${bg}`] = Math.round(r * 100) / 100
  }
  return out
}

/** 维护者's migration table (docs/feedback/2026-11-10-maintainer-v2-trial.md, 「K1 设计稿的四件事」 2): [theme, appearance] read → what it becomes. */
const MIGRATION = [
  [undefined, undefined, 'precision', 'system'],
  [null, undefined, 'precision', 'system'],
  ['river', undefined, 'precision', 'system'],
  ['paper', undefined, 'precision', 'light'],
  ['night', undefined, 'precision', 'dark'],
  ['blue', undefined, 'precision', 'system'],
  ['Night', undefined, 'precision', 'system'],
  [3, undefined, 'precision', 'system'],
  // the ids of now keep their appearance (checked)
  ['glass', 'dark', 'glass', 'dark'],
  ['research', 'light', 'research', 'light'],
  ['precision', 'system', 'precision', 'system'],
  ['glass', undefined, 'glass', 'system'],
  ['glass', 'dim', 'glass', 'system'],
]
function migrationProblems(fn) {
  const out = []
  for (const [t, a, theme, appearance] of MIGRATION) {
    const got = fn(t, a)
    if (got?.theme !== theme || got?.appearance !== appearance) out.push(`${String(t)}/${String(a)} → ${JSON.stringify(got)}, not ${theme}/${appearance}`)
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

test('controls: the contrast, the readers and withTheme can fail', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 100) / 100, 21)
  assert.equal(contrast('#777777', '#777777'), 1)
  assert.deepEqual(below({ '--st-a': '#777777', '--st-b': '#888888' }, [['a', 'b', 4.5]]), { 'a/b': 1.26 })
  assert.deepEqual(below({ '--st-a': '#777777', '--st-b': '#FFFFFF' }, [['a', 'b', 3]]), {}, '4.48 passes a floor of 3')
  const sample = ':root {\n  --st-z: 1px;\n}\n:root, [data-theme="a"] {\n  color-scheme: light;\n  --st-x: #fff;\n}\n[data-theme="a"][data-appearance="dark"] {\n  color-scheme: dark;\n  --st-x: #000;\n}'
  assert.deepEqual(tokenSets(sample), { 'a/light': { '--st-z': '1px', '--st-x': '#fff' }, 'a/dark': { '--st-z': '1px', '--st-x': '#000' } })
  assert.deepEqual(tokenBlocks(sample).map(b => [b.theme, b.appearance, b.scheme]), [[null, null, null], ['a', 'light', 'light'], ['a', 'dark', 'dark']])
  assert.throws(() => withTheme('<p>no tag</p>', 'glass', 'dark'))
  assert.throws(() => withTheme('<html lang="zh-CN"><html>', 'glass', 'dark'))
  assert.throws(() => withTheme('<html lang="zh-CN" data-theme="glass">', 'glass', 'dark'))
  assert.throws(() => withTheme('<html lang="zh-CN" data-appearance="dark">', 'glass', 'dark'))
})

test('three themes, three appearances; DEFAULT_THEME precision and DEFAULT_APPEARANCE system, each defined in main/theme.mjs only', () => {
  assert.deepEqual([...THEME_IDS], ['precision', 'glass', 'research'])
  assert.deepEqual([...APPEARANCES], ['light', 'dark', 'system'])
  assert.equal(DEFAULT_THEME, 'precision')
  assert.equal(DEFAULT_APPEARANCE, 'system')
  for (const name of ['DEFAULT_THEME', 'DEFAULT_APPEARANCE']) {
    const defining = srcFiles(join(DESKTOP_DIR, 'src')).filter(f => new RegExp(`\\b${name}\\s*=`).test(readFileSync(f, 'utf8'))).map(f => relative(DESKTOP_DIR, f).replace(/\\/g, '/'))
    assert.deepEqual(defining, ['src/main/theme.mjs'], name)
  }
  for (const id of THEME_IDS) assert.equal(themeOf(id), id)
  for (const a of APPEARANCES) assert.equal(appearanceOf(a), a)
  for (const bad of ['river', 'paper', 'night', 'Glass', '', null, undefined, 3, ['glass']]) {
    assert.equal(themeOf(bad), DEFAULT_THEME, String(bad))
    assert.equal(isThemeId(bad), false)
  }
  for (const bad of ['Dark', 'auto', '', null, 1]) {
    assert.equal(appearanceOf(bad), DEFAULT_APPEARANCE, String(bad))
    assert.equal(isAppearance(bad), false)
  }
})

test('migration of v1.0\'s theme (the maintainer 11-10): none / river / other → precision + system; paper → light; night → dark — and a mutant is caught', () => {
  assert.deepEqual(migrationProblems(migrateLook), [])
  assert.deepEqual({ ...LEGACY_THEMES }, { river: 'system', paper: 'light', night: 'dark' })
  // the reverse: a migration that sends night to light (or paper to dark, or river to light) is told apart, row by row
  const mutant = (from, to) => (t, a) => (t === from ? { theme: DEFAULT_THEME, appearance: to } : migrateLook(t, a))
  assert.deepEqual(migrationProblems(mutant('night', 'light')), ['night/undefined → {"theme":"precision","appearance":"light"}, not precision/dark'])
  assert.equal(migrationProblems(mutant('paper', 'dark')).length, 1)
  assert.equal(migrationProblems(mutant('river', 'light')).length, 1)
  assert.equal(migrationProblems((t, a) => ({ ...migrateLook(t, a), theme: 'glass' })).length, MIGRATION.filter(r => r[2] !== 'glass').length, 'a migration to another theme')
})

test('the appearance in force: light / dark as set; system is what Windows uses now; nativeTheme.themeSource follows the setting', () => {
  assert.equal(resolveAppearance('light', true), 'light')
  assert.equal(resolveAppearance('dark', false), 'dark')
  assert.equal(resolveAppearance('system', true), 'dark')
  assert.equal(resolveAppearance('system', false), 'light')
  assert.equal(resolveAppearance('bogus', true), 'dark', 'an unknown setting is the default: system')
  assert.deepEqual(APPEARANCES.map(nativeSource), ['light', 'dark', 'system'])
  assert.equal(nativeSource('bogus'), 'system')
})

test('tokens.css is what scripts/gen-tokens.mjs makes of K1\'s tokens-data.mjs: six complete sets, every value the data\'s', async () => {
  assert.equal(TOKENS, await tokensCss(), 'tokens.css is the generator\'s output (run node scripts/gen-tokens.mjs)')
  assert.ok(TOKENS_DATA.replace(/\\/g, '/').endsWith('docs/design/next/themes/tools/tokens-data.mjs'))
  const data = await tokenData()
  const blocks = tokenBlocks(TOKENS)
  assert.deepEqual(blocks.map(b => b.selector), [
    ':root',
    ':root, [data-theme="precision"]', '[data-theme="precision"][data-appearance="dark"]',
    '[data-theme="glass"]', '[data-theme="glass"][data-appearance="dark"]',
    '[data-theme="research"]', '[data-theme="research"][data-appearance="dark"]',
  ])
  const sets = tokenSets(TOKENS)
  assert.deepEqual(Object.keys(sets), SETS)
  const norm = v => String(v).replace(/\s+/g, ' ').trim()
  let compared = 0
  const problems = []
  for (const key of SETS) {
    const [t, a] = key.split('/')
    const block = blocks.find(b => b.theme === t && b.appearance === a)
    assert.equal(block.scheme, a, `${key}: color-scheme`)
    const rows = data.tokensOf(t, a)
    assert.equal(block.values.size, rows.length, `${key}: every token of the data, no other`)
    for (const [name, value] of rows) {
      compared++
      if (norm(block.values.get(name)) !== norm(value)) problems.push(`${key} ${name}: ${block.values.get(name)} ≠ ${value}`)
    }
    for (const [name, value] of data.COMMON) {
      compared++
      if (sets[key][name] !== value) problems.push(`${key} ${name}`)
    }
  }
  process.stdout.write(`# tokens compared with tokens-data.mjs: ${compared}, differing: ${problems.length}\n`)
  assert.deepEqual(problems, [])
  // control: a value changed in the text is seen
  const changed = tokenBlocks(TOKENS.replace('--st-page: #F6F8FC;', '--st-page: #F6F8FD;')).find(b => b.theme === 'glass' && b.appearance === 'light')
  assert.notEqual(changed.values.get('--st-page'), data.tokensOf('glass', 'light').find(r => r[0] === '--st-page')[1])
})

test('THEME_PAGE (the window before the first frame) is each of the six sets\' --st-page; windowColour reads it', () => {
  const sets = tokenSets(TOKENS)
  const report = {}
  for (const key of SETS) {
    const [t, a] = key.split('/')
    report[key] = THEME_PAGE[t][a]
    assert.equal(THEME_PAGE[t][a].toUpperCase(), sets[key]['--st-page'].toUpperCase(), `${key}: shared/themes.mjs THEME_PAGE is tokens.css --st-page`)
    assert.equal(windowColour(t, a), THEME_PAGE[t][a])
  }
  process.stdout.write(`# THEME_PAGE ${JSON.stringify(report)}\n`)
  assert.equal(new Set(Object.values(report)).size, 6, 'six different page colours')
  assert.equal(windowColour('river', 'dark'), THEME_PAGE.precision.dark, 'an unknown theme is the default')
  assert.equal(windowColour('glass', 'dim'), THEME_PAGE.glass.light, 'an unknown scheme is light')
})

test('contrast in all six sets: body words ≥ 4.5, secondary ≥ 3, button words and state words ≥ 4.5 (computed from tokens.css)', () => {
  const sets = tokenSets(TOKENS)
  assert.ok(CONTRAST_PAIRS.length >= 20)
  for (const floor of [4.5, 3]) assert.ok(CONTRAST_PAIRS.some(p => p[2] === floor), `pairs with the floor ${floor}`)
  for (const [fg, bg] of [['text', 'page'], ['text-2', 'page'], ['on-accent', 'accent'], ['text', 'surface-2']]) assert.ok(CONTRAST_PAIRS.some(p => p[0] === fg && p[1] === bg), `${fg}/${bg} is held`)
  const report = Object.fromEntries(SETS.map(k => [k, Object.fromEntries(CONTRAST_PAIRS.map(([fg, bg]) => [`${fg}/${bg}`, Math.round(contrast(sets[k][`--st-${fg}`], sets[k][`--st-${bg}`]) * 100) / 100]))]))
  process.stdout.write(`# contrast ${JSON.stringify(report)}\n`)
  for (const key of SETS) assert.deepEqual(below(sets[key]), {}, key)
  // control: the secondary words of one set moved to just off its ground, and the button words to its accent, are caught
  const glassDark = sets['glass/dark']
  assert.deepEqual(Object.keys(below({ ...glassDark, '--st-text-2': '#2A2F38' })).filter(k => k.startsWith('text-2/')).sort(), ['text-2/page', 'text-2/selected', 'text-2/surface', 'text-2/surface-2'])
  assert.ok('on-accent/accent' in below({ ...sets['precision/light'], '--st-on-accent': '#4A4A4A' }))
  // and through the file: tokens.css with research light's --st-text-2 written next to its page colour fails
  const weak = tokenSets(TOKENS.replace(/(\[data-theme="research"\] \{[^}]*--st-text-2: )#536466;/, '$1#E8E8E2;'))
  assert.notEqual(weak['research/light']['--st-text-2'], sets['research/light']['--st-text-2'], 'control: the replacement took')
  assert.ok(Object.keys(below(weak['research/light'])).includes('text-2/page'))
})

// v2 package F: a library's colour (core LIBRARY_COLORS, the names only) → --st-lib-<name>, the words on it --st-on-lib
test('the library colours: every name of core LIBRARY_COLORS has its token in all six sets, the words on it at least 4.5 : 1', async () => {
  const { LIBRARY_COLORS } = await import('../src/main/core.mjs')
  const { LIBRARY_COLOR_NAMES } = await import('../src/renderer/kit/library-sections.js')
  assert.deepEqual([...LIBRARY_COLOR_NAMES], [...LIBRARY_COLORS], 'the page knows the core\'s colour names')
  const sets = tokenSets(TOKENS)
  const report = {}
  for (const key of SETS) {
    for (const c of LIBRARY_COLORS) {
      const bg = sets[key][`--st-lib-${c}`]
      assert.ok(bg, `${key}: --st-lib-${c}`)
      report[`${key}/${c}`] = Math.round(contrast(sets[key]['--st-on-lib'], bg) * 100) / 100
    }
  }
  process.stdout.write(`# library colours ${JSON.stringify(report)}\n`)
  assert.deepEqual(Object.entries(report).filter(([, r]) => r < 4.5), [])
  // control: the check fails on a pair under 4.5 (a light square with the dark set's dark words)
  assert.ok(contrast(sets['precision/dark']['--st-on-lib'], sets['precision/light']['--st-lib-river']) < 4.5)
  const kit = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'styles', 'kit.css'), 'utf8')
  for (const c of LIBRARY_COLORS) assert.match(kit, new RegExp(`\\.st-lib-mark--${c} \\{ background: var\\(--st-lib-${c}\\); \\}`))
})

test('index.html as served: data-theme and data-appearance on its one <html> tag, before any script; unknown values are the defaults', () => {
  assert.equal(/data-theme|data-appearance/.test(INDEX), false, 'control: the file itself names neither')
  for (const id of THEME_IDS) {
    for (const s of SCHEMES) {
      const served = withTheme(INDEX, id, s)
      assert.match(served, new RegExp(`^<!doctype html>\\n<html lang="zh-CN" data-theme="${id}" data-appearance="${s}">\\n`))
      assert.equal(served.replace(` data-theme="${id}" data-appearance="${s}"`, ''), INDEX, 'only the two attributes are added')
      assert.ok(served.indexOf('data-theme') < served.indexOf('<script'), 'before the first script')
    }
  }
  assert.match(withTheme(INDEX, '"><script>x</script>', 'x"><b>'), /<html lang="zh-CN" data-theme="precision" data-appearance="light">/, 'a value that is not an id cannot write into the page')
})

test('docs/tokens.md: each row\'s six value columns are tokens.css\'s; every token is in the list', () => {
  const doc = readFileSync(join(REPO_DIR, 'docs', 'tokens.md'), 'utf8')
  const sets = tokenSets(TOKENS)
  const norm = v => v.replace(/\\\|/g, '|').replace(/\s+/g, '').replace(/0\./g, '.').toLowerCase()
  const rows = doc.split('\n').filter(l => /^\| `--st-/.test(l)).map(l => l.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim()))
  const named = rows.map(r => /`([^`]+)`/.exec(r[0])[1])
  assert.deepEqual([...new Set(named)].sort(), Object.keys(sets['precision/light']).sort(), 'the doc lists exactly the tokens of tokens.css')
  const problems = []
  for (const r of rows) {
    const name = /`([^`]+)`/.exec(r[0])[1]
    SETS.forEach((key, i) => {
      const v = /`([^`]+)`/.exec(r[2 + i])?.[1] ?? '?'
      if (norm(v) !== norm(sets[key][name])) problems.push(`${name} ${key}: ${v}`)
    })
  }
  assert.deepEqual(problems, [])
  assert.notEqual(norm('`#F6F8FC`'), norm('`#F6F8FD`'), 'control: a changed value is told apart')
})
