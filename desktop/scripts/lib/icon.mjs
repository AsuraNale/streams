// The app icon, from its SVG sources (desktop/assets/icon/README.md): the PNG renders and the Windows .ico.
//
// Sources, all in desktop/assets/icon/:
//   icon-16.svg icon-24.svg icon-32.svg icon-48.svg   hand-placed whole-pixel forms, one per size: rendered 1:1
//   icon-512.svg                                      the full mark on the squircle tile: rendered at 256 (the large entry)
// Renders go to png/icon-<size>.png; streams.ico packs the five. Rendering with sharp (loadSharp below says
// where it comes from; nothing is added to desktop/). The same
// input gives the same bytes: no time stamp anywhere (sharp writes none, the .ico format has none), so a second run is
// byte-identical — test/icon.test.mjs rebuilds into a temporary folder and compares.
//
// The .ico: 256 as a PNG-compressed entry; 48/32/24/16 as 32-bpp BGRA
// BITMAPINFOHEADER DIBs (height doubled in the header, bottom-up rows, straight alpha), each followed by the 1-bpp AND
// mask padded to 4-byte rows (bit set = transparent). Entries in the directory smallest first.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from './paths.mjs'

export const ICON_SRC_DIR = join(DESKTOP_DIR, 'assets', 'icon')
export const ICON_NAME = 'streams.ico'
/** The .ico's entries: the pixel sizes (the SVG each is rendered from, and how). */
export const SIZES = Object.freeze([16, 24, 32, 48, 256])
const SMALL_DENSITY = 72 * 8 // the whole-pixel SVGs: rendered at 8× and brought down with lanczos3 (edges stay crisp)

/**
 * sharp, the renderer. Not a dependency of this repository (a native module, 30+ MB): it is loaded from a folder that
 * holds it in its node_modules — STREAMS_SHARP_DIR when set, else installer/icon-tools (where an `npm install sharp`
 * would put it; not in git). Nothing else of that folder is used. Throws, saying so, when it is nowhere.
 */
export function loadSharp() {
  const dirs = [process.env.STREAMS_SHARP_DIR, join(REPO_DIR, 'installer', 'icon-tools')].filter(Boolean)
  for (const dir of dirs) {
    try { return createRequire(join(dir, 'package.json'))('sharp') } catch { /* not there */ }
  }
  const err = new Error(`sharp is not installed in any of: ${dirs.join(', ')} (set STREAMS_SHARP_DIR to a folder whose node_modules holds sharp)`)
  err.code = 'no_sharp'
  throw err
}

export const sha256 = buf => createHash('sha256').update(buf).digest('hex')

/** The source SVG of one size and how it is rendered: a hand-placed icon-<size>.svg when there is one, else the large one
 *  brought down (logo, 2026-11-12: the new logo's five sources are all there, so each small size is its own SVG). */
function sourceOf(size, srcDir = ICON_SRC_DIR) {
  if (size !== 256 && existsSync(join(srcDir, `icon-${size}.svg`))) return { file: `icon-${size}.svg`, density: SMALL_DENSITY, kernel: 'lanczos3' }
  return { file: 'icon-512.svg', density: 72 * (size === 256 ? 1 : 2), kernel: 'lanczos3' }
}

/** Render every size to PNG bytes. @returns {Promise<Map<number, Buffer>>} */
export async function renderPngs(sharp, srcDir = ICON_SRC_DIR) {
  const out = new Map()
  for (const size of SIZES) {
    const src = sourceOf(size, srcDir)
    const png = await sharp(join(srcDir, src.file), { density: src.density }).resize(size, size, { kernel: src.kernel }).png().toBuffer()
    const meta = await sharp(png).metadata()
    if (meta.width !== size || meta.height !== size) throw new Error(`${src.file}: rendered ${meta.width}x${meta.height}, not ${size}`)
    out.set(size, png)
  }
  return out
}

async function dibEntry(sharp, png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  if (info.channels !== 4) throw new Error('expected RGBA')
  const xorRow = w * 4 // 32 bpp: rows are already 4-byte aligned
  const andRow = Math.ceil(w / 32) * 4 // 1 bpp, padded to a 4-byte boundary
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // biSize
  header.writeInt32LE(w, 4) // biWidth
  header.writeInt32LE(h * 2, 8) // biHeight: XOR + AND
  header.writeUInt16LE(1, 12) // biPlanes
  header.writeUInt16LE(32, 14) // biBitCount
  header.writeUInt32LE(0, 16) // biCompression = BI_RGB
  header.writeUInt32LE(xorRow * h + andRow * h, 20) // biSizeImage
  const xor = Buffer.alloc(xorRow * h)
  const and = Buffer.alloc(andRow * h) // zero = opaque; bit set = transparent
  for (let y = 0; y < h; y += 1) {
    const dstRow = h - 1 - y // bottom-up
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4
      const d = dstRow * xorRow + x * 4
      const a = data[s + 3]
      // straight (not premultiplied) BGRA, as Windows expects of a 32-bpp icon
      xor[d] = data[s + 2]; xor[d + 1] = data[s + 1]; xor[d + 2] = data[s]; xor[d + 3] = a
      if (a === 0) and[dstRow * andRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return { w, h, bits: 32, bytes: Buffer.concat([header, xor, and]) }
}

/** Pack the renders into one .ico (directory smallest first; 256 kept as PNG, the others as DIBs). */
export async function packIco(sharp, pngs) {
  const entries = []
  for (const [size, png] of pngs) {
    if (png.readUInt32BE(0) !== 0x89504e47) throw new Error(`${size}: not a PNG`)
    entries.push(size >= 256 ? { w: size, h: size, bits: 32, bytes: png } : await dibEntry(sharp, png))
  }
  entries.sort((a, b) => a.w - b.w)
  const dirSize = 6 + 16 * entries.length
  const dir = Buffer.alloc(dirSize)
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(entries.length, 4)
  let offset = dirSize
  entries.forEach((e, i) => {
    const o = 6 + i * 16
    dir.writeUInt8(e.w >= 256 ? 0 : e.w, o)
    dir.writeUInt8(e.h >= 256 ? 0 : e.h, o + 1)
    dir.writeUInt8(0, o + 2) // colour count (0 at 8 bpp and above)
    dir.writeUInt8(0, o + 3) // reserved
    dir.writeUInt16LE(1, o + 4) // planes
    dir.writeUInt16LE(e.bits, o + 6) // bit count
    dir.writeUInt32LE(e.bytes.length, o + 8) // bytes in resource
    dir.writeUInt32LE(offset, o + 12) // image offset
    offset += e.bytes.length
  })
  return Buffer.concat([dir, ...entries.map(e => e.bytes)])
}

/**
 * Read an .ico back: its directory, each entry checked against its image (a PNG's IHDR, or a DIB's header and size).
 * @returns {{width: number, height: number, bits: number, size: number, offset: number, png: boolean, image: Buffer}[]}
 */
export function parseIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('not an .ico (reserved/type)')
  const count = buf.readUInt16LE(4)
  const entries = []
  for (let i = 0; i < count; i += 1) {
    const o = 6 + i * 16
    const width = buf.readUInt8(o) || 256
    const height = buf.readUInt8(o + 1) || 256
    const bits = buf.readUInt16LE(o + 6)
    const size = buf.readUInt32LE(o + 8)
    const offset = buf.readUInt32LE(o + 12)
    if (offset + size > buf.length) throw new Error(`entry ${i} overruns the file`)
    const image = buf.subarray(offset, offset + size)
    const png = image.readUInt32BE(0) === 0x89504e47
    if (png) {
      if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) throw new Error(`entry ${i}: PNG IHDR ${image.readUInt32BE(16)}x${image.readUInt32BE(20)}, directory ${width}x${height}`)
    } else {
      const biW = image.readInt32LE(4)
      const biH = image.readInt32LE(8)
      const bpp = image.readUInt16LE(14)
      const andRow = Math.ceil(biW / 32) * 4
      const expect = 40 + biW * 4 * (biH / 2) + andRow * (biH / 2)
      if (biW !== width || biH !== height * 2 || bpp !== bits || expect !== size) throw new Error(`entry ${i}: DIB ${biW}x${biH} ${bpp}bpp ${size} bytes; directory ${width}x${height} ${bits}bpp, ${expect} expected`)
    }
    entries.push({ width, height, bits, size, offset, png, image })
  }
  return entries
}

/** The files the build writes, relative to the icon folder, in order. */
export const OUTPUT_FILES = Object.freeze([...SIZES.map(s => `png/icon-${s}.png`), ICON_NAME])

/**
 * Render the PNGs and pack the .ico from the sources in `srcDir`, into `outDir` (png/ below it, the .ico beside it).
 * @returns {Promise<{files: Record<string, {bytes: number, sha256: string}>, entries: object[]}>}
 */
export async function buildIcon({ srcDir = ICON_SRC_DIR, outDir = ICON_SRC_DIR, sharp = loadSharp() } = {}) {
  const pngs = await renderPngs(sharp, srcDir)
  const ico = await packIco(sharp, pngs)
  const entries = parseIco(ico)
  if (entries.length !== SIZES.length) throw new Error(`${entries.length} entries packed, ${SIZES.length} expected`)
  mkdirSync(join(outDir, 'png'), { recursive: true })
  const files = {}
  for (const size of SIZES) {
    const rel = `png/icon-${size}.png`
    writeFileSync(join(outDir, ...rel.split('/')), pngs.get(size))
    files[rel] = { bytes: pngs.get(size).length, sha256: sha256(pngs.get(size)) }
  }
  writeFileSync(join(outDir, ICON_NAME), ico)
  files[ICON_NAME] = { bytes: ico.length, sha256: sha256(ico) }
  return { files, entries: entries.map(({ image: _image, ...rest }) => rest) }
}

/** The committed outputs' bytes, for a comparison. */
export function readOutputs(dir = ICON_SRC_DIR) {
  return Object.fromEntries(OUTPUT_FILES.map(rel => [rel, readFileSync(join(dir, ...rel.split('/')))]))
}
