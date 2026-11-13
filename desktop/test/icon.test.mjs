// The app icon (desktop/assets/icon/README.md): the committed streams.ico is well formed and holds the five sizes; the
// sources render to exactly the committed files (so the script is reproducible and nobody edited the outputs by hand);
// the file main.mjs gives its windows is that one. The rebuild needs sharp (scripts/lib/icon.mjs loadSharp): skipped, and
// said so, when it is not installed anywhere the loader looks.
// logo (docs/checks/2026-11-12-logo/contract.md L-2, 2026-11-12): the sources are now 赞妮's final 五流 files — a test added that
// icon-512/48/32/24/16.svg are byte for byte docs/design/logo/source/流息/'s (the river-blue three waves are gone); and the
// rebuild no longer skips when STREAMS_SHARP_DIR is set (a folder named for sharp that has none is a failure, not a skip).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ICON_FILE, iconPath } from '../src/main/icon.mjs'
import { ICON_NAME, ICON_SRC_DIR, OUTPUT_FILES, SIZES, buildIcon, loadSharp, parseIco, readOutputs, sha256 } from '../scripts/lib/icon.mjs'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'

// logo: the design's final files, as copied into the repository (docs/design/logo/来源.md)
const DESIGN = join(REPO_DIR, 'docs', 'design', 'logo', 'source', '流息')
const SOURCES = Object.freeze(['icon-512.svg', 'icon-48.svg', 'icon-32.svg', 'icon-24.svg', 'icon-16.svg'])

test('streams.ico: five entries, 16/24/32/48 as 32-bpp DIBs with the AND mask, 256 as PNG; the file main.mjs names', () => {
  const file = iconPath(DESKTOP_DIR)
  assert.equal(file, join(ICON_SRC_DIR, ICON_NAME))
  assert.deepEqual([...ICON_FILE], ['assets', 'icon', 'streams.ico'])
  assert.ok(existsSync(file), file)
  const entries = parseIco(readFileSync(file))
  assert.deepEqual(entries.map(e => e.width), [...SIZES])
  assert.deepEqual(entries.map(e => e.height), [...SIZES])
  assert.deepEqual(entries.map(e => e.png), [false, false, false, false, true])
  assert.ok(entries.every(e => e.bits === 32))
  // the main process reads it from the same relative place in an install (resources/app/assets/icon/streams.ico)
  const main = readFileSync(join(DESKTOP_DIR, 'src', 'main', 'main.mjs'), 'utf8')
  assert.match(main, /import \{ iconPath \} from '\.\/icon\.mjs'/)
  assert.match(main, /\bicon: ICON,/)
})

test('the sources render to the committed png/ and streams.ico, byte for byte (the build is reproducible)', async t => {
  let sharp
  // logo: when STREAMS_SHARP_DIR names a folder, sharp must be there — the rebuild runs, it is not skipped
  try { sharp = loadSharp() } catch (err) { if (process.env.STREAMS_SHARP_DIR) throw err; t.skip(err.message); return }
  const out = mkdtempSync(join(tmpdir(), 'st-icon-test-'))
  try {
    const built = await buildIcon({ outDir: out, sharp })
    const committed = readOutputs()
    for (const rel of OUTPUT_FILES) {
      assert.equal(built.files[rel].sha256, sha256(committed[rel]), `${rel} differs from what the sources render to: run node desktop/scripts/build-icon.mjs`)
      assert.equal(built.files[rel].bytes, committed[rel].length, rel)
    }
    assert.equal(Object.keys(built.files).length, OUTPUT_FILES.length)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('parseIco can fail (controls): a wrong type, a directory that overruns the file', () => {
  const ico = readFileSync(iconPath(DESKTOP_DIR))
  const badType = Buffer.from(ico); badType.writeUInt16LE(2, 2)
  assert.throws(() => parseIco(badType), /not an \.ico/)
  const overrun = Buffer.from(ico); overrun.writeUInt32LE(ico.length, 6 + 8) // the first entry's size: the whole file
  assert.throws(() => parseIco(overrun), /overruns/)
})

test('logo: the five SVG sources are the design\'s final files byte for byte (五流, docs/design/logo/source/流息/), the old mark gone', () => {
  for (const name of SOURCES) {
    const ours = readFileSync(join(ICON_SRC_DIR, name))
    const theirs = readFileSync(join(DESIGN, name))
    assert.equal(sha256(ours), sha256(theirs), `${name} differs from docs/design/logo/source/流息/${name}`)
  }
  // the large one is the white tile with the mark three times (red to the left, blue to the right, black on top)
  const big = readFileSync(join(ICON_SRC_DIR, 'icon-512.svg'), 'utf8')
  assert.deepEqual([...big.matchAll(/fill="(#[0-9A-F]{6})"/g)].map(m => m[1]), ['#FFFFFF', '#E53935', '#1E88E5', '#000000'])
  assert.equal(/#1F6E8C/i.test(big), false, 'the river blue of the first mark is gone')
  // 16 px: black and white only (设计说明.md 第六节)
  assert.deepEqual([...readFileSync(join(ICON_SRC_DIR, 'icon-16.svg'), 'utf8').matchAll(/fill="(#[0-9A-F]{6})"/g)].map(m => m[1]), ['#FFFFFF', '#000000'])
  // control: one byte changed is told apart
  const changed = Buffer.from(readFileSync(join(ICON_SRC_DIR, 'icon-16.svg'))); changed[changed.length - 2] ^= 1
  assert.notEqual(sha256(changed), sha256(readFileSync(join(DESIGN, 'icon-16.svg'))))
})
