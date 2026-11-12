// The looks (docs/desktop.md §五「主题」), in plain Node. Rewritten for redesign R1 (维护者 11-11, 04 第 19–21 题; the R1
// contract R1-2): the template's four themes replace K2's three token sets — tokens.css, gen-tokens.mjs and its contrast
// checks are gone with them (the reason the K2 checks of those files were removed: the files themselves are gone; the
// template's colours are the design's, not the app's). What is held:
//   - the ids, the appearances and the two defaults (research · system), each default defined in main/theme.mjs only;
//   - the migration (the contract's table), every row, only the two fields, and mutants of it that must be caught;
//   - each theme's sheets and <body> class are those of the design's 07-模板版/templates/<主题>/index.html (read here), and
//     every sheet the app loads is in src/renderer/template/ byte for byte the design's (template/manifest.json);
//   - index.html as served: the theme's sheets, the body's class / data-theme / data-appearance, the <html> attributes;
//   - THEME_PAGE (the window before the first frame) has every theme × scheme, eight different colours (that each is the
//     real window's: test/ui-theme.test.mjs).
// Controls first: each check fails on input made to break it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import {
  APPEARANCES, DEFAULT_APPEARANCE, DEFAULT_THEME, LEGACY_THEMES, SHEETS_MARK, THEME_IDS, appearanceOf, isAppearance, isThemeId, migrateLook,
  nativeSource, resolveAppearance, themeOf, windowColour, withTheme,
} from '../src/main/theme.mjs'
import { SCHEMES, TEMPLATE_BASE, TEMPLATE_SCRIPTS, THEME_PAGE, THEME_TEMPLATE } from '../src/shared/themes.mjs'
import { readSettings } from '../src/main/settings.mjs'

const INDEX = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'index.html'), 'utf8')
const TEMPLATE_DIR = join(DESKTOP_DIR, 'src', 'renderer', 'template')
// the design as copied into the repository (docs/design/redesign/source/, byte for byte the design folder: 来源.md)
const DESIGN = join(REPO_DIR, 'docs', 'design', 'redesign', 'source', '07-模板版')
// the design's folder of each theme (07-模板版/templates/<主题>/index.html)
const DESIGN_PAGES = { precision: '精密国际主义-第十一轮', glass: '澄明玻璃-第十一轮', research: '研究对话-第十一轮', monoline: '单线黑白-第十二轮' }
// the app's copy renames one folder (no Chinese in the app's code): templates/精密国际主义-精修 → templates/precision-detail
const RENAMED = [['templates/精密国际主义-精修/', 'templates/precision-detail/']]
const toApp = p => RENAMED.reduce((s, [a, b]) => s.replace(a, b), p)
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')

/** The contract's migration table: [theme, appearance] read → what it becomes. */
const MIGRATION = [
  [undefined, undefined, 'research', 'system'],
  [null, undefined, 'research', 'system'],
  [undefined, 'dark', 'research', 'system'],
  ['river', undefined, 'research', 'system'],
  ['river', 'dark', 'research', 'system'],
  ['paper', undefined, 'research', 'light'],
  ['night', undefined, 'research', 'dark'],
  ['night', 'light', 'research', 'dark'],
  ['blue', undefined, 'research', 'system'],
  ['Night', undefined, 'research', 'system'],
  [3, undefined, 'research', 'system'],
  // the ids of now keep their appearance (checked)
  ['precision', 'system', 'precision', 'system'],
  ['glass', 'dark', 'glass', 'dark'],
  ['research', 'light', 'research', 'light'],
  ['monoline', 'dark', 'monoline', 'dark'],
  ['glass', undefined, 'glass', 'system'],
  ['monoline', 'dim', 'monoline', 'system'],
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

/** A design page's sheets (in order, resolved to paths under 07-模板版/), its scripts and its <body> class / data-theme. */
function designPage(theme) {
  const dir = posix.join('templates', DESIGN_PAGES[theme])
  const text = readFileSync(join(DESIGN, dir, 'index.html'), 'utf8')
  const sheets = [...text.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => posix.normalize(posix.join(dir, m[1])))
  const scripts = [...text.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(m => posix.normalize(posix.join(dir, m[1])))
  const body = /<body class="([^"]+)" data-theme="([^"]+)"><\/body>/.exec(text)
  return { sheets, scripts, bodyClass: body?.[1], dataTheme: body?.[2] }
}

test('controls: withTheme refuses a page it cannot place the look into; the design pages are read', () => {
  assert.throws(() => withTheme('<p>no tag</p>', 'glass', 'dark'))
  assert.throws(() => withTheme(`<html lang="zh-CN"><html>${SHEETS_MARK}<body>`, 'glass', 'dark'))
  assert.throws(() => withTheme(`<html lang="zh-CN" data-theme="glass">${SHEETS_MARK}<body>`, 'glass', 'dark'))
  assert.throws(() => withTheme(`<html lang="zh-CN">${SHEETS_MARK}<body class="x">`, 'glass', 'dark'), 'a body that has attributes of its own')
  assert.throws(() => withTheme('<html lang="zh-CN"><body>', 'glass', 'dark'), 'no place for the sheets')
  assert.throws(() => withTheme(`<html lang="zh-CN">${SHEETS_MARK}${SHEETS_MARK}<body>`, 'glass', 'dark'), 'two places for the sheets')
  const p = designPage('monoline')
  assert.ok(p.sheets.length >= 10 && p.sheets.includes('shared/round12/line.css'), JSON.stringify(p.sheets))
  assert.equal(p.dataTheme, 'line12')
  assert.equal(designPage('research').sheets.includes('shared/round12/line.css'), false, 'control: 研究对话 has no line.css')
})

test('four themes, three appearances; DEFAULT_THEME research and DEFAULT_APPEARANCE system, each defined in main/theme.mjs only', () => {
  assert.deepEqual([...THEME_IDS], ['precision', 'glass', 'research', 'monoline'])
  assert.deepEqual([...APPEARANCES], ['light', 'dark', 'system'])
  assert.equal(DEFAULT_THEME, 'research')
  assert.equal(DEFAULT_APPEARANCE, 'system')
  for (const name of ['DEFAULT_THEME', 'DEFAULT_APPEARANCE']) {
    const defining = srcFiles(join(DESKTOP_DIR, 'src')).filter(f => new RegExp(`\\b${name}\\s*=`).test(readFileSync(f, 'utf8'))).map(f => relative(DESKTOP_DIR, f).replace(/\\/g, '/'))
    assert.deepEqual(defining, ['src/main/theme.mjs'], name)
  }
  for (const id of THEME_IDS) assert.equal(themeOf(id), id)
  for (const a of APPEARANCES) assert.equal(appearanceOf(a), a)
  for (const bad of ['river', 'paper', 'night', 'Glass', 'line12', '', null, undefined, 3, ['glass']]) {
    assert.equal(themeOf(bad), DEFAULT_THEME, String(bad))
    assert.equal(isThemeId(bad), false)
  }
  for (const bad of ['Dark', 'auto', '', null, 1]) {
    assert.equal(appearanceOf(bad), DEFAULT_APPEARANCE, String(bad))
    assert.equal(isAppearance(bad), false)
  }
  // a new install: no settings file at all → research + system
  const fresh = readSettings(join(DESKTOP_DIR, 'no-such-settings.json'))
  assert.deepEqual([fresh.theme, fresh.appearance], ['research', 'system'])
})

test('migration (the R1 contract\'s table): none / river / other → research + system; paper → light; night → dark; the four kept — mutants are caught', () => {
  assert.deepEqual(migrationProblems(migrateLook), [])
  assert.deepEqual({ ...LEGACY_THEMES }, { paper: 'light', night: 'dark' })
  // the reverse: a migration that sends night to light (or paper to dark, or river to light) is told apart, row by row
  const mutant = (from, to) => (t, a) => (t === from ? { theme: DEFAULT_THEME, appearance: to } : migrateLook(t, a))
  assert.deepEqual(migrationProblems(mutant('night', 'light')), ['night/undefined → {"theme":"research","appearance":"light"}, not research/dark', 'night/light → {"theme":"research","appearance":"light"}, not research/dark'])
  assert.equal(migrationProblems(mutant('paper', 'dark')).length, 1)
  assert.equal(migrationProblems(mutant('river', 'light')).length, 2)
  // the old default kept (precision) instead of research: every row but the kept ids' is caught
  assert.equal(migrationProblems((t, a) => (isThemeId(t) ? migrateLook(t, a) : { ...migrateLook(t, a), theme: 'precision' })).length, MIGRATION.filter(r => !isThemeId(r[0])).length)
  // a migration that keeps the appearance written next to an unknown theme (K2's rule) is caught too
  assert.equal(migrationProblems((t, a) => (t === undefined && a === 'dark' ? { theme: 'research', appearance: 'dark' } : migrateLook(t, a))).length, 1)
})

test('readSettings migrates only the two fields: every other field of a v1.0 file stays as written', () => {
  const dir = join(DESKTOP_DIR, '..', '.work')
  // a file with every field set: read through migrateLook, the others are compared with a read of the same file without theme
  const file = join(dir, `theme-migrate-${process.pid}.json`)
  const base = { language: 'en', showDeveloperInfo: true, schedule: { enabled: false, time: '07:15' }, panel: { open: false, tab: 'files' } }
  return import('node:fs').then(({ mkdirSync, writeFileSync, rmSync }) => {
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(file, JSON.stringify({ ...base, theme: 'night' }))
      const migrated = readSettings(file)
      writeFileSync(file, JSON.stringify(base))
      const plain = readSettings(file)
      assert.deepEqual([migrated.theme, migrated.appearance], ['research', 'dark'])
      const { theme: _a, appearance: _b, ...restMigrated } = migrated
      const { theme: _c, appearance: _d, ...restPlain } = plain
      assert.deepEqual(restMigrated, restPlain, 'only theme and appearance differ')
      assert.deepEqual([migrated.language, migrated.schedule, migrated.panel], ['en', { enabled: false, time: '07:15' }, { open: false, tab: 'files' }])
    } finally { rmSync(file, { force: true }) }
  })
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

test('each theme loads the design page\'s sheets in its order and its <body> class / data-theme (07-模板版/templates/<主题>/index.html)', () => {
  for (const id of THEME_IDS) {
    const page = designPage(id)
    const t = THEME_TEMPLATE[id]
    assert.deepEqual(t.sheets, page.sheets.map(toApp), `${id}: the sheets`)
    assert.equal(t.bodyClass, page.bodyClass, `${id}: the body class`)
    assert.equal(t.dataTheme, page.dataTheme, `${id}: data-theme`)
    // the scripts the page loads that the app takes are its icon data (edition.js); the design's own renderer (app.js) and
    // the demo bar's interactions.js are not the app's
    const icons = page.scripts.filter(s => s.endsWith('/edition.js')).map(toApp)
    for (const s of icons) assert.ok(TEMPLATE_SCRIPTS.includes(s), `${id}: ${s} is loaded`)
    assert.deepEqual(page.scripts.filter(s => !s.endsWith('/edition.js')).sort(), ['shared/round11/interactions.js', 'streams/app.js'], `${id}: the rest is the demo's`)
  }
  // control: two themes' lists differ, so the comparison is not of a list with itself
  assert.notDeepEqual(THEME_TEMPLATE.glass.sheets, THEME_TEMPLATE.research.sheets)
})

test('every file the app loads from the template is the design\'s byte for byte (template/manifest.json, sha256)', () => {
  const manifest = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'manifest.json'), 'utf8'))
  const used = new Set([...THEME_IDS.flatMap(id => THEME_TEMPLATE[id].sheets), ...TEMPLATE_SCRIPTS, 'shared/round12/brand/streams.svg'])
  const listed = new Set(manifest.files.map(f => f.app))
  for (const u of used) assert.ok(listed.has(u), `${u} is in the manifest`)
  for (const f of manifest.files) {
    const app = join(TEMPLATE_DIR, f.app)
    const design = join(REPO_DIR, 'docs', 'design', 'redesign', 'source', f.source)
    assert.ok(existsSync(app) && existsSync(design), f.app)
    assert.equal(sha(app), f.sha256, `${f.app}: the app's copy`)
    assert.equal(sha(design), f.sha256, `${f.app}: the design's file`)
  }
  // nothing else is in the template folder
  const all = []
  const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else all.push(relative(TEMPLATE_DIR, p).replace(/\\/g, '/')) } }
  walk(TEMPLATE_DIR)
  assert.deepEqual(all.filter(f => f !== 'manifest.json').sort(), [...listed].sort())
  // control: a changed byte changes the hash
  assert.notEqual(createHash('sha256').update(Buffer.concat([readFileSync(join(TEMPLATE_DIR, 'streams', 'streams.css')), Buffer.from(' ')])).digest('hex'), sha(join(TEMPLATE_DIR, 'streams', 'streams.css')))
})

test('index.html as served: the theme\'s sheets in its order, its <body> class, data-theme, data-appearance; <html> marked; unknown values are the defaults', () => {
  assert.equal(/data-theme=|data-appearance=/.test(INDEX), false, 'control: the file itself names neither')
  for (const id of THEME_IDS) {
    for (const s of SCHEMES) {
      const served = withTheme(INDEX, id, s)
      assert.match(served, new RegExp(`\\n<html lang="zh-CN" data-theme="${id}" data-appearance="${s}">\\n`))
      const t = THEME_TEMPLATE[id]
      assert.deepEqual([...served.matchAll(/<link rel="stylesheet" data-theme-sheet href="([^"]+)">/g)].map(m => m[1]), t.sheets.map(p => `${TEMPLATE_BASE}${p}`))
      assert.ok(served.includes(`<body class="${t.bodyClass}" data-theme="${t.dataTheme}" data-appearance="${s}" data-product="streams">`))
      assert.ok(served.indexOf('data-theme-sheet') < served.indexOf('/styles/app.css'), 'the template before the app\'s own styles')
      assert.ok(served.indexOf('data-theme-sheet') < served.indexOf('<script defer'), 'before the first script that runs')
    }
  }
  const odd = withTheme(INDEX, '"><script>x</script>', 'x"><b>')
  assert.match(odd, /<html lang="zh-CN" data-theme="research" data-appearance="light">/, 'a value that is not an id cannot write into the page')
  assert.ok(odd.includes(`<body class="${THEME_TEMPLATE.research.bodyClass}" data-theme="research11" data-appearance="light"`))
})

test('THEME_PAGE (the window before the first frame): every theme × scheme, eight different colours; windowColour reads it', () => {
  const report = {}
  for (const t of THEME_IDS) {
    for (const s of SCHEMES) {
      assert.match(THEME_PAGE[t][s], /^#[0-9A-F]{6}$/, `${t}/${s}`)
      assert.equal(windowColour(t, s), THEME_PAGE[t][s])
      report[`${t}/${s}`] = THEME_PAGE[t][s]
    }
  }
  process.stdout.write(`# THEME_PAGE ${JSON.stringify(report)}\n`)
  assert.equal(new Set(Object.values(report)).size, 8, 'eight different page colours')
  assert.equal(windowColour('river', 'dark'), THEME_PAGE.research.dark, 'an unknown theme is the default')
  assert.equal(windowColour('glass', 'dim'), THEME_PAGE.glass.light, 'an unknown scheme is light')
})

test('K2\'s token files are gone: no tokens.css, no gen-tokens.mjs, no --st- colour defined outside the interim aliases', () => {
  assert.equal(existsSync(join(DESKTOP_DIR, 'src', 'renderer', 'styles', 'tokens.css')), false)
  assert.equal(existsSync(join(DESKTOP_DIR, 'scripts', 'gen-tokens.mjs')), false)
  const styles = join(DESKTOP_DIR, 'src', 'renderer', 'styles')
  const css = []
  const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.css')) css.push(p) } }
  walk(styles)
  // a definition of an --st- variable with a colour value (#…, rgb(…), a named colour) anywhere: there is none — interim.css
  // only points the old names at the template's variables
  const COLOUR_DEF = /--st-[a-z0-9-]+\s*:\s*(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/
  const found = css.filter(f => COLOUR_DEF.test(readFileSync(f, 'utf8'))).map(f => relative(styles, f))
  assert.deepEqual(found, [])
  assert.ok(COLOUR_DEF.test('--st-page: #F6F6F3;'), 'control: such a line is found')
})
