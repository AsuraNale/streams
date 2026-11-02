// The app icon (desktop/assets/icon/README.md): the committed streams.ico is well formed and holds the five sizes; the
// sources render to exactly the committed files (so the script is reproducible and nobody edited the outputs by hand);
// the file main.mjs gives its windows is that one. The rebuild needs sharp (scripts/lib/icon.mjs loadSharp): skipped, and
// said so, when it is not installed anywhere the loader looks.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ICON_FILE, iconPath } from '../src/main/icon.mjs'
import { ICON_NAME, ICON_SRC_DIR, OUTPUT_FILES, SIZES, buildIcon, loadSharp, parseIco, readOutputs, sha256 } from '../scripts/lib/icon.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'

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
  try { sharp = loadSharp() } catch (err) { t.skip(err.message); return }
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
