// The fonts that ship with the app, as the build and the notices see them (installer/fonts.mjs, installer/notices.mjs) —
// redesign R6a (docs/checks/2026-11-13-r6a/contract.md R6a-1). Needs no build and installs nothing: the notices are written
// for small stages made here under the OS temp folder, with the repository's own font files and license texts in them.
//   · what the build asks of the app's files (fontFilesToShip): the working tree's app has the two fonts, each with its license
//     text — four files; a font without its license text, a license text without its font, a font nobody listed, or (for the
//     working tree) a font missing altogether stops the build; an older commit's app (the update test's 0.9.0) may have one
//     font or none;
//   · THIRD-PARTY-NOTICES.txt section 6 (buildNotices): a line for each font file — which font, what the app uses it for, its
//     license, where it is installed, its sha256 — and each font's OFL text in full, read from the stage; a stage with a font
//     whose license text is missing, or with a font file nobody listed, is reported; a stage with the interface font only (an
//     older app) lists that one.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BUNDLED_FONTS, FONT_DIR, fontFilesToShip, fontOfFile } from '../fonts.mjs'
import { buildNotices } from '../notices.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { removeTree } = await import(pathToFileURL(join(REPO, 'desktop', 'scripts', 'lib', 'remove-tree.mjs')).href)
const { tempDir } = await import(pathToFileURL(join(REPO, 'desktop', 'scripts', 'lib', 'temp.mjs')).href)
const ROOT = tempDir('st-installer-fonts-')
after(() => removeTree(ROOT, { waitMs: 10_000 }))

const FONTS = join(REPO, ...FONT_DIR.split('/'))
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const SANS = ['NotoSansSC-VF.ttf', 'OFL-NotoSansSC.txt']
const SERIF = ['NotoSerifSC-VF.ttf', 'OFL-NotoSerifSC.txt']
const FACTS = { appName: 'Streams', version: '9.9.9', electron: '44.0.0' }

/** A stage with only what section 6 reads: resources/app/src/renderer/fonts/<files>, Streams' LICENSE, an empty lock. */
function stageWith(name, files, extra = {}) {
  const stage = join(ROOT, name)
  const dir = join(stage, 'resources', 'app', 'src', 'renderer', 'fonts')
  mkdirSync(dir, { recursive: true })
  for (const f of files) copyFileSync(join(FONTS, f), join(dir, f))
  for (const [f, bytes] of Object.entries(extra)) writeFileSync(join(dir, f), bytes)
  copyFileSync(join(REPO, 'LICENSE'), join(stage, 'resources', 'app', 'LICENSE'))
  const lockFile = join(stage, 'lock.json')
  writeFileSync(lockFile, '{"packages":{}}')
  return { stage, dir, lockFile }
}
const section6 = text => text.slice(text.lastIndexOf('6. Fonts / 字体'))
const trimmed = file => readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim()

test('the two fonts and their words: Noto Sans SC the interface font, Noto Serif SC the heading font of the Research theme, each with its license text', () => {
  assert.deepEqual(BUNDLED_FONTS.map(f => [f.name, f.file, f.licenseFile, f.license]), [
    ['Noto Sans SC', 'NotoSansSC-VF.ttf', 'OFL-NotoSansSC.txt', 'SIL Open Font License 1.1'],
    ['Noto Serif SC', 'NotoSerifSC-VF.ttf', 'OFL-NotoSerifSC.txt', 'SIL Open Font License 1.1'],
  ])
  assert.equal(fontOfFile('NotoSerifSC-VF.ttf').role, 'the heading font of the Research theme (研究对话主题的标题字体)')
  assert.equal(fontOfFile('Other.ttf'), null, 'control: a file nobody listed has no words')
  // the app's own table of the two fonts names the same files (desktop/src/main/licenses.mjs)
  const app = readFileSync(join(REPO, 'desktop', 'src', 'main', 'licenses.mjs'), 'utf8')
  for (const f of BUNDLED_FONTS) assert.ok(app.includes(`'${f.file}'`) && app.includes(`'${f.licenseFile}'`) && app.includes(`name: '${f.name}'`), `the license page reads ${f.file} and ${f.licenseFile}`)
})

test('what the build asks: the working tree has the four files; a font without its license, a license without its font, a font not listed, a font missing — each stops it; an older app may have fewer', () => {
  // the files git knows in the working tree (what build-installer.mjs gitFiles('desktop/src') gives)
  const r = spawnSync('git', ['-C', REPO, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'desktop/src'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  assert.equal(r.status, 0, r.stderr)
  const tree = r.stdout.split('\0').filter(Boolean)
  assert.ok(tree.length > 100 && tree.includes('desktop/src/main/main.mjs'), 'control: the app\'s files are listed')
  const all = [...SANS, ...SERIF].map(f => `${FONT_DIR}/${f}`)
  assert.deepEqual(fontFilesToShip(tree), { files: all, problems: [] }, 'the working tree\'s app: both fonts, each with its license text')
  const without = (...names) => tree.filter(p => !names.some(n => p === `${FONT_DIR}/${n}`))
  let got = fontFilesToShip(without('OFL-NotoSerifSC.txt'))
  assert.equal(got.problems.length, 1)
  assert.match(got.problems[0], /OFL-NotoSerifSC\.txt is not a file git knows: Noto Serif SC must ship with its license/)
  got = fontFilesToShip(without('NotoSerifSC-VF.ttf'))
  assert.match(got.problems.join('\n'), /NotoSerifSC-VF\.ttf is not a file git knows: the license text of Noto Serif SC is there without the font/)
  got = fontFilesToShip(without(...SERIF))
  assert.match(got.problems.join('\n'), /NotoSerifSC-VF\.ttf and OFL-NotoSerifSC\.txt are not files git knows: the working tree's app uses Noto Serif SC/, 'the working tree without the heading font: the build stops')
  assert.match(fontFilesToShip(without(...SANS)).problems.join('\n'), /the working tree's app uses Noto Sans SC/)
  got = fontFilesToShip([...tree, `${FONT_DIR}/Extra-Regular.otf`])
  assert.match(got.problems.join('\n'), /Extra-Regular\.otf: a font file installer\/fonts\.mjs does not list/)
  // an older commit's app (STREAMS_INSTALLER_APP_REF): K2…R5 had the interface font only, v1.0 none — both build
  assert.deepEqual(fontFilesToShip(without(...SERIF), { appRef: 'abc1234' }), { files: SANS.map(f => `${FONT_DIR}/${f}`), problems: [] })
  assert.deepEqual(fontFilesToShip(without(...SANS, ...SERIF), { appRef: 'abc1234' }), { files: [], problems: [] })
  assert.equal(fontFilesToShip(without('OFL-NotoSansSC.txt', ...SERIF), { appRef: 'abc1234' }).problems.length, 1, 'but a font it has still needs its license text')
  // the build script asks this function, and no longer asks for styles/fonts.css (a file redesign R1 removed)
  const build = readFileSync(join(REPO, 'installer', 'build-installer.mjs'), 'utf8')
  assert.match(build, /const shippedFonts = fontFilesToShip\(srcFiles, \{ appRef: APP_REF \}\)\n\s+if \(shippedFonts\.problems\.length\) throw new Stop\(/)
  assert.equal(/srcFiles\.includes\('desktop\/src\/renderer\/styles\/fonts\.css'\)/.test(build), false)
  assert.equal(tree.includes('desktop/src/renderer/styles/fonts.css'), false, 'control: the app has no styles/fonts.css any more')
  assert.match(build, /if \(notices\.fontProblems\.length\) throw new Stop\(/)
})

test('THIRD-PARTY-NOTICES.txt section 6: a line and a sha256 for each font, each font\'s OFL in full', () => {
  const { stage, lockFile } = stageWith('both', [...SANS, ...SERIF])
  const n = buildNotices({ stage, lockFile, facts: FACTS })
  assert.deepEqual([n.fonts, n.fontLicenses, n.fontProblems], [2, ['Noto Sans SC', 'Noto Serif SC'], []])
  const s6 = section6(n.text)
  const at = f => `resources\\app\\src\\renderer\\fonts\\${f}`
  // the interface font's line is what it was before R6a (installer/test/packaged.test.mjs reads it)
  assert.ok(s6.includes(`* NotoSansSC-VF.ttf — Noto Sans SC, the interface font (界面字体), unmodified — SIL Open Font License 1.1 — installed at ${at('NotoSansSC-VF.ttf')}\n    sha256: ${sha(join(FONTS, 'NotoSansSC-VF.ttf'))}\n`), s6.slice(0, 900))
  assert.ok(s6.includes(`* NotoSerifSC-VF.ttf — Noto Serif SC, the heading font of the Research theme (研究对话主题的标题字体), unmodified — SIL Open Font License 1.1 — installed at ${at('NotoSerifSC-VF.ttf')}\n    sha256: 5326cfb097e3ab26fcb39329752b5c0a439bf8d5c4649520e4b492939c352a09\n`), s6.slice(0, 900))
  assert.equal(sha(join(FONTS, 'NotoSerifSC-VF.ttf')), '5326cfb097e3ab26fcb39329752b5c0a439bf8d5c4649520e4b492939c352a09', 'control: the sha256 in the line is the file\'s (the record\'s: docs/design/fonts/noto-serif-sc/)')
  // each license text whole, under its own heading
  const sans = trimmed(join(FONTS, 'OFL-NotoSansSC.txt'))
  const serif = trimmed(join(FONTS, 'OFL-NotoSerifSC.txt'))
  assert.notEqual(sans, serif, 'control: two texts, not one twice')
  assert.ok(s6.includes(`Noto Sans SC: ${at('OFL-NotoSansSC.txt')}\n${'-'.repeat(78)}\n${sans}\n`))
  assert.ok(s6.includes(`Noto Serif SC: ${at('OFL-NotoSerifSC.txt')}\n${'-'.repeat(78)}\n${serif}\n`))
  assert.match(serif, /SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007/)
  assert.ok(n.text.includes('  6. Fonts / 字体'), 'the contents list the section')
})

test('reverse: the heading font without its license text, and a font file nobody listed, are reported; the interface font alone (an older app) is listed alone', () => {
  const noText = stageWith('no-serif-text', [...SANS, 'NotoSerifSC-VF.ttf'])
  let n = buildNotices({ stage: noText.stage, lockFile: noText.lockFile, facts: FACTS })
  assert.deepEqual(n.fontProblems, ['NotoSerifSC-VF.ttf: its license text OFL-NotoSerifSC.txt is not in the stage'])
  assert.deepEqual([n.fonts, n.fontLicenses], [2, ['Noto Sans SC']], 'the build compares these: two fonts, one license text → it stops')
  assert.equal(section6(n.text).includes('Noto Serif SC: resources'), false, 'no heading for a text that is not there')
  const extra = stageWith('extra', [...SANS, ...SERIF], { 'Extra-Regular.otf': Buffer.from('not a real font') })
  n = buildNotices({ stage: extra.stage, lockFile: extra.lockFile, facts: FACTS })
  assert.deepEqual(n.fontProblems, ['Extra-Regular.otf: a font file installer/fonts.mjs does not list'])
  const old = stageWith('sans-only', SANS)
  n = buildNotices({ stage: old.stage, lockFile: old.lockFile, facts: FACTS })
  assert.deepEqual([n.fonts, n.fontLicenses, n.fontProblems], [1, ['Noto Sans SC'], []])
  assert.equal(section6(n.text).includes('Noto Serif SC'), false)
  const none = stageWith('none', [])
  rmSync(none.dir, { recursive: true })
  n = buildNotices({ stage: none.stage, lockFile: none.lockFile, facts: FACTS })
  assert.deepEqual([n.fonts, n.fontLicenses, n.fontProblems], [0, [], []])
  assert.ok(section6(n.text).includes('(none in this build)'))
})
