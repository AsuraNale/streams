#!/usr/bin/env node
// The app icon from its sources (desktop/assets/icon/README.md):
//
//   node desktop/scripts/build-icon.mjs              render png/icon-{16,24,32,48,256}.png and pack streams.ico, in place
//   node desktop/scripts/build-icon.mjs --out <dir>  the same, into another folder (the test does this and compares)
//   node desktop/scripts/build-icon.mjs --check      render into a temporary folder and compare with the committed files;
//                                                    exit code 1 when any byte differs (nothing in the repository is written)
//
// Needs sharp (not a dependency of this repository): from STREAMS_SHARP_DIR, or installer/icon-tools (scripts/lib/icon.mjs).
// --check compares what the sources render to, not the SVG bytes: a byte that changes nothing drawn passes here, and the
// sources' own bytes are held by test/icon.test.mjs (the five SVGs = docs/design/logo/source byte for byte) (logo). The same sources give the same bytes
// every time, so the committed streams.ico is exactly what this script writes (scripts/lib/icon.mjs says how).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ICON_SRC_DIR, OUTPUT_FILES, buildIcon, readOutputs, sha256 } from './lib/icon.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const check = args.includes('--check')
const outDir = check ? mkdtempSync(join(tmpdir(), 'st-icon-')) : (value('--out') ?? ICON_SRC_DIR)

try {
  const result = await buildIcon({ outDir })
  for (const [rel, f] of Object.entries(result.files)) process.stdout.write(`  ${rel.padEnd(18)} ${String(f.bytes).padStart(6)} bytes  sha256 ${f.sha256}\n`)
  process.stdout.write(`  ${result.entries.map(e => `${e.width}x${e.height} ${e.png ? 'PNG' : `${e.bits}bpp DIB`}`).join(', ')}\n`)
  if (check) {
    const committed = readOutputs()
    const differ = OUTPUT_FILES.filter(rel => sha256(committed[rel]) !== result.files[rel].sha256)
    if (differ.length) {
      process.stdout.write(`\ndiffer from the committed files: ${differ.join(', ')} — run without --check to update them\n`)
      process.exitCode = 1
    } else {
      process.stdout.write('\nthe committed files are what the sources render to\n')
    }
  } else {
    process.stdout.write(`\nwritten to ${outDir}\n`)
  }
} finally {
  if (check) rmSync(outDir, { recursive: true, force: true })
}
