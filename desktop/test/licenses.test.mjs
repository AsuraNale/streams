// 许可证与致谢 (src/main/licenses.mjs), in plain Node: in development the repository's LICENSE, in a packaged layout the app's
// own copy; the six parts with the runtime's versions and the shipped package.json's version and license; the notices only
// in an install that has the file. Controls first: a folder laid out as an install with another LICENSE gives that one.
// redesign R6a: Noto Serif SC (研究对话's heading font, shipped from this package on) has its row after Noto Sans SC, read the same
// way, and its own license text (displayFont): the two component lists below and the install's layout got that row and those
// two files — because licensesView now reads them. Nothing else these tests check changed.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { DISPLAY_FONT, FONT, NOTICES_FILE, fontVersion, licensesView, noticesFileOf } from '../src/main/licenses.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const made = []
after(() => { for (const dir of made) removeTree(dir, { waitMs: 3000 }) })
const pkg = name => JSON.parse(readFileSync(join(DESKTOP_DIR, 'node_modules', name, 'package.json'), 'utf8'))
const VERSIONS = { electron: '44.0.0', chrome: '150.0.1.2', node: '24.9.0' }

/**
 * v2 package K2: a font file with only a name table whose version (name id 5, Windows / Unicode) is `version` — the smallest
 * file fontVersion reads, for an install's layout and as the control of the reader.
 */
function fontWith(version) {
  const text = Buffer.from(version, 'utf16le').swap16()
  const name = Buffer.alloc(18 + text.length)
  name.writeUInt16BE(0, 0); name.writeUInt16BE(1, 2); name.writeUInt16BE(18, 4)
  name.writeUInt16BE(3, 6); name.writeUInt16BE(1, 8); name.writeUInt16BE(0x409, 10); name.writeUInt16BE(5, 12); name.writeUInt16BE(text.length, 14); name.writeUInt16BE(0, 16)
  text.copy(name, 18)
  const head = Buffer.alloc(28)
  head.writeUInt32BE(0x00010000, 0); head.writeUInt16BE(1, 4)
  head.write('name', 12, 'latin1'); head.writeUInt32BE(28, 20); head.writeUInt32BE(name.length, 24)
  return Buffer.concat([head, name])
}

/** An install's layout: <root>/Streams.exe's folder with resources/app (LICENSE, node_modules/<preact, htm, @mozilla/readability>/package.json). */
function install({ license = 'MIT License\n\nCopyright (c) test\n', notices = true } = {}) {
  const root = tempDir('st-licenses-')
  made.push(root)
  const app = join(root, 'resources', 'app')
  for (const [name, version, lic] of [['preact', '9.9.9', 'MIT'], ['htm', '8.8.8', 'Apache-2.0'], ['@mozilla/readability', '7.7.7', 'BSD-2-Clause'], ['unpdf', '6.6.6', 'MIT']]) {
    mkdirSync(join(app, 'node_modules', name), { recursive: true })
    writeFileSync(join(app, 'node_modules', name, 'package.json'), JSON.stringify({ name, version, license: lic }))
  }
  writeFileSync(join(app, 'LICENSE'), license)
  // v2 package K2: the bundled font and its license text, where the app reads them (src/renderer/fonts)
  mkdirSync(join(app, ...FONT.file.slice(0, -1)), { recursive: true })
  writeFileSync(join(app, ...FONT.file), fontWith('Version 9.87;test'))
  writeFileSync(join(app, ...FONT.licenseFile), 'SIL OPEN FONT LICENSE (test copy)\n')
  // redesign R6a: and the heading font with its license text
  writeFileSync(join(app, ...DISPLAY_FONT.file), fontWith('Version 6.54;test'))
  writeFileSync(join(app, ...DISPLAY_FONT.licenseFile), 'SIL OPEN FONT LICENSE (serif test copy)\n')
  if (notices) writeFileSync(join(root, NOTICES_FILE), 'notices\n')
  return { root, app }
}

test('development: the repository\'s LICENSE in full, the six parts, no notices to open', () => {
  const v = licensesView({ packaged: false, desktopDir: DESKTOP_DIR, installDir: join(DESKTOP_DIR, 'node_modules'), versions: VERSIONS })
  assert.equal(v.own.text, readFileSync(join(REPO_DIR, 'LICENSE'), 'utf8'), 'word for word the repository\'s LICENSE')
  assert.equal(v.own.license, 'MIT')
  assert.deepEqual(v.components, [
    { name: 'Electron', version: '44.0.0', license: 'MIT' },
    { name: 'Chromium', version: '150.0.1.2', license: 'BSD-3-Clause' },
    { name: 'Node.js', version: '24.9.0', license: 'MIT' },
    { name: 'Preact', version: pkg('preact').version, license: pkg('preact').license },
    { name: 'htm', version: pkg('htm').version, license: pkg('htm').license },
    { name: '@mozilla/readability', version: pkg('@mozilla/readability').version, license: pkg('@mozilla/readability').license },
    // 1.1 W2: the PDF reader, and PDF.js inside it
    { name: 'unpdf', version: pkg('unpdf').version, license: pkg('unpdf').license },
    { name: 'PDF.js', version: '6.4.299', license: 'Apache-2.0' },
    // v2 package K2: the bundled UI font, its version from the font file that ships
    { name: 'Noto Sans SC', version: '2.04', license: 'OFL-1.1' },
    // redesign R6a: the heading font of 研究对话, the same way
    { name: 'Noto Serif SC', version: '2.003', license: 'OFL-1.1' },
  ])
  // v2 package K2: the font's license in full, the file shipped beside it (copied from the K1 draft's source unchanged)
  assert.equal(v.font.text, readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'fonts', 'OFL-NotoSansSC.txt'), 'utf8'))
  assert.equal(v.font.text, readFileSync(join(REPO_DIR, 'docs', 'design', 'next', 'themes-source', 'shared', 'fonts', 'OFL-NotoSansSC.txt'), 'utf8'))
  assert.match(v.font.text, /SIL OPEN FONT LICENSE Version 1\.1/)
  assert.deepEqual([v.font.name, v.font.license], ['Noto Sans SC', 'OFL-1.1'])
  assert.equal(readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'fonts', 'NotoSansSC-VF.ttf')).equals(readFileSync(join(REPO_DIR, 'docs', 'design', 'next', 'themes-source', 'shared', 'fonts', 'NotoSansSC-VF.ttf'))), true, 'the font as it came, byte for byte')
  assert.deepEqual([pkg('preact').version, pkg('htm').version, pkg('@mozilla/readability').version], ['10.29.8', '3.1.1', '0.6.0'], 'control: the pinned versions (desktop/package.json)')
  assert.equal(pkg('@mozilla/readability').license, 'Apache-2.0', 'control: the reading mode\'s part is Apache-2.0')
  const deps = JSON.parse(readFileSync(join(DESKTOP_DIR, 'package.json'), 'utf8')).dependencies
  assert.deepEqual(Object.keys(deps).sort(), ['@mozilla/readability', 'htm', 'preact', 'unpdf'], 'every package the app ships has its row (a new dependency without one turns this red)')
  assert.deepEqual(v.notices, { available: false })
  assert.equal(noticesFileOf({ packaged: false, installDir: 'C:\\x' }), null)
})

// v2 package K2: the font's version reader, with its controls (no name table, not a font)
test('fontVersion: the name table\'s version without 「Version」 and the build after 「;」; nothing for a file that is not a font', () => {
  assert.equal(fontVersion(fontWith('Version 2.04;241114210130;non-release')), '2.04')
  assert.equal(fontVersion(fontWith('3.1')), '3.1')
  assert.equal(fontVersion(Buffer.from('not a font at all, just some words')), '')
  assert.equal(fontVersion(Buffer.alloc(0)), '')
})

test('installed: the app\'s own LICENSE and package.json files, the notices beside Streams.exe; without the file, none', () => {
  const { root, app } = install({ license: 'MIT License\n\nanother copy\n' })
  const v = licensesView({ packaged: true, desktopDir: app, installDir: root, versions: VERSIONS })
  assert.equal(v.own.text, 'MIT License\n\nanother copy\n', 'control: the install\'s copy, not the repository\'s')
  assert.deepEqual(v.components.slice(3), [{ name: 'Preact', version: '9.9.9', license: 'MIT' }, { name: 'htm', version: '8.8.8', license: 'Apache-2.0' }, { name: '@mozilla/readability', version: '7.7.7', license: 'BSD-2-Clause' }, { name: 'unpdf', version: '6.6.6', license: 'MIT' }, { name: 'PDF.js', version: '6.4.299', license: 'Apache-2.0' }, { name: 'Noto Sans SC', version: '9.87', license: 'OFL-1.1' }, { name: 'Noto Serif SC', version: '6.54', license: 'OFL-1.1' }], 'the install\'s own package.json files and fonts, not the repository\'s')
  assert.equal(v.displayFont.text, 'SIL OPEN FONT LICENSE (serif test copy)\n', 'redesign R6a: the install\'s own copy of the heading font\'s license')
  assert.equal(v.font.text, 'SIL OPEN FONT LICENSE (test copy)\n', 'the install\'s own copy of the font license')
  assert.deepEqual(v.notices, { available: true })
  assert.equal(noticesFileOf({ packaged: true, installDir: root }), join(root, NOTICES_FILE))
  const bare = install({ notices: false, license: 'Some Other License\n' })
  const w = licensesView({ packaged: true, desktopDir: bare.app, installDir: bare.root, versions: VERSIONS })
  assert.deepEqual(w.notices, { available: false })
  assert.equal(w.own.license, 'unknown', 'a text that is not MIT is not called MIT')
  // a development run never offers the notices, even with a file of that name in its folder
  assert.deepEqual(licensesView({ packaged: false, desktopDir: DESKTOP_DIR, installDir: root, versions: VERSIONS }).notices, { available: false })
})

// 1.1 W2: PDF.js is inside unpdf; the version the licenses page and the notices give is the one unpdf really carries, and
// the license text that goes into the notices is the Apache License 2.0 in full
test('PDF.js inside unpdf: the version unpdf carries, and the Apache-2.0 text the notices copy', async () => {
  const { getResolvedPDFJS } = await import('unpdf')
  const { BUNDLED } = await import('../src/main/licenses.mjs')
  const { BUNDLED_INSIDE } = await import('../../installer/notices.mjs')
  const real = (await getResolvedPDFJS()).version
  assert.deepEqual(BUNDLED.map(b => [b.name, b.version, b.license, b.inside]), [['PDF.js', real, 'Apache-2.0', 'unpdf']])
  assert.deepEqual(BUNDLED_INSIDE.map(b => [b.pkg, b.name, b.license]), [['unpdf', `PDF.js ${real}`, 'Apache-2.0']])
  const text = readFileSync(join(DESKTOP_DIR, ...BUNDLED_INSIDE[0].file), 'utf8')
  assert.match(text, new RegExp(`^PDF\.js ${real.replace(/\./g, '\.')} `))
  assert.match(text, /Apache License\s+Version 2\.0, January 2004/)
  assert.match(text, /9\. Accepting Warranty or Additional Liability/)
  assert.match(text.trimEnd(), /END OF TERMS AND CONDITIONS$/)
})
