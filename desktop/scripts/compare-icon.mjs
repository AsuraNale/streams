#!/usr/bin/env node
// The app icon's renders against the design's own PNGs (the new logo, docs/checks/2026-11-12-logo/contract.md L-2): each
// desktop/assets/icon/png/icon-<size>.png beside docs/design/logo/source/流息/png/icon-<size>.png, pixel by pixel (RGBA, 8 bits a
// channel): how many pixels differ, the largest difference of one channel, and where the largest is. Also each entry of
// streams.ico read back (the DIBs as straight BGRA, the 256 PNG) against the same design PNG, so what Windows is given is
// compared too. Reads only; sharp as scripts/lib/icon.mjs loadSharp finds it (STREAMS_SHARP_DIR).
//   node desktop/scripts/compare-icon.mjs            the table; exit code 0 (differences are reported, not judged)
//   node desktop/scripts/compare-icon.mjs --json     the same as JSON
//   --ours <dir> --theirs <dir>                      other folders of icon-<size>.png (e.g. a control: a folder made to differ)
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ICON_NAME, ICON_SRC_DIR, SIZES, loadSharp, parseIco } from './lib/icon.mjs'
import { REPO_DIR } from './lib/paths.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const OURS = resolve(value('--ours') ?? join(ICON_SRC_DIR, 'png'))
const THEIRS = resolve(value('--theirs') ?? join(REPO_DIR, 'docs', 'design', 'logo', 'source', '流息', 'png'))
const sharp = loadSharp()

async function rgba(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

/** RGBA from an .ico entry: a PNG as it is, a 32-bpp DIB turned back into top-down RGBA. */
async function fromEntry(e) {
  if (e.png) return rgba(e.image)
  const w = e.width
  const h = e.height
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    const src = 40 + (h - 1 - y) * w * 4
    for (let x = 0; x < w; x += 1) {
      const s = src + x * 4
      const d = (y * w + x) * 4
      out[d] = e.image[s + 2]; out[d + 1] = e.image[s + 1]; out[d + 2] = e.image[s]; out[d + 3] = e.image[s + 3]
    }
  }
  return { data: out, w, h }
}

function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { size: `${a.w}x${a.h} vs ${b.w}x${b.h}`, pixels: a.w * a.h, differing: null, maxChannel: null }
  let differing = 0
  let maxChannel = 0
  let at = null
  for (let i = 0; i < a.w * a.h; i += 1) {
    let px = 0
    for (let c = 0; c < 4; c += 1) px = Math.max(px, Math.abs(a.data[i * 4 + c] - b.data[i * 4 + c]))
    if (px > 0) differing += 1
    if (px > maxChannel) { maxChannel = px; at = { x: i % a.w, y: Math.floor(i / a.w), ours: [...a.data.subarray(i * 4, i * 4 + 4)], theirs: [...b.data.subarray(i * 4, i * 4 + 4)] } }
  }
  return { size: `${a.w}x${a.h}`, pixels: a.w * a.h, differing, maxChannel, at }
}

const ico = parseIco(readFileSync(join(ICON_SRC_DIR, ICON_NAME)))
const rows = []
for (const size of SIZES) {
  const theirs = await rgba(readFileSync(join(THEIRS, `icon-${size}.png`)))
  const ours = await rgba(readFileSync(join(OURS, `icon-${size}.png`)))
  const entry = ico.find(e => e.width === size)
  rows.push({ size, png: diff(ours, theirs), ico: entry ? diff(await fromEntry(entry), theirs) : null })
}

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ ours: OURS, theirs: THEIRS, rows }, null, 1)}\n`)
} else {
  process.stdout.write(`ours:   ${OURS}\ntheirs: ${THEIRS}\n\n`)
  process.stdout.write('size  pixels  png: differing  max channel diff  | ico entry: differing  max channel diff\n')
  for (const r of rows) {
    const p = r.png
    const i = r.ico
    process.stdout.write(`${String(r.size).padStart(4)}  ${String(p.pixels).padStart(6)}  ${String(p.differing).padStart(14)}  ${String(p.maxChannel).padStart(16)}  | ${String(i?.differing ?? '-').padStart(20)}  ${String(i?.maxChannel ?? '-').padStart(16)}\n`)
    if (p.at) process.stdout.write(`      largest at (${p.at.x},${p.at.y}): ours rgba(${p.at.ours.join(',')}) theirs rgba(${p.at.theirs.join(',')})\n`)
  }
}
