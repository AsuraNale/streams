#!/usr/bin/env node
// Noto Serif SC as it ships with the app (docs/design/fonts/noto-serif-sc/来源.md): the two files under desktop/src/renderer/fonts/
// against source-sha256.txt and source.json — size, SHA-256, CRC-32, the font's own header and name table. Reads only.
//   node docs/design/fonts/noto-serif-sc/check-source.mjs             the files in the repository against the record
//   node docs/design/fonts/noto-serif-sc/check-source.mjs --release   and the record against the official release itself: the
//       two entries are read out of the release's .zip on GitHub by HTTP range requests (about 15.5 MB, not the 246 MB of
//       the whole .zip), inflated in memory and compared — nothing is written, nothing that is fetched is run
// Exit code 1 on any difference.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, inflateRawSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..', '..')
const RECORD = JSON.parse(readFileSync(join(HERE, 'source.json'), 'utf8'))
const LIST = readFileSync(join(HERE, 'source-sha256.txt'), 'utf8').trim().split('\n').map(l => /^([0-9a-f]{64}) {2}(.+)$/.exec(l)).map(m => ({ hash: m[1], path: m[2] }))

const sha = b => createHash('sha256').update(b).digest('hex')
const crc = b => crc32(b).toString(16).padStart(8, '0')

/** A TrueType font's name-table string (Windows, English) by id, or '' — the same table the app's license page reads. */
export function fontName(b, id) {
  try {
    const tables = b.readUInt16BE(4)
    let name = -1
    for (let i = 0; i < tables; i++) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'name') name = b.readUInt32BE(12 + i * 16 + 8)
    if (name < 0) return ''
    const count = b.readUInt16BE(name + 2)
    const strings = name + b.readUInt16BE(name + 4)
    for (let i = 0; i < count; i++) {
      const r = name + 6 + i * 12
      if (b.readUInt16BE(r) !== 3 || b.readUInt16BE(r + 4) !== 0x409 || b.readUInt16BE(r + 6) !== id) continue
      const len = b.readUInt16BE(r + 8)
      const at = strings + b.readUInt16BE(r + 10)
      let s = ''
      for (let j = 0; j + 1 < len; j += 2) s += String.fromCharCode(b.readUInt16BE(at + j))
      return s
    }
  } catch { /* not a font */ }
  return ''
}

/** What is wrong with `bytes` as the record's file `f` ([] = nothing). */
export function fileProblems(f, bytes, where) {
  const out = []
  if (bytes.length !== f.bytes) out.push(`${where}: ${bytes.length} bytes, the record says ${f.bytes}`)
  if (sha(bytes) !== f.sha256) out.push(`${where}: sha256 ${sha(bytes)}, the record says ${f.sha256}`)
  if (crc(bytes) !== f.crc32) out.push(`${where}: CRC-32 ${crc(bytes)}, the record says ${f.crc32}`)
  if (f.head) {
    if (bytes.subarray(0, 4).toString('hex') !== f.head) out.push(`${where}: starts with ${bytes.subarray(0, 4).toString('hex')}, not a TrueType font (${f.head})`)
    if (fontName(bytes, 1) !== f.family) out.push(`${where}: the family in its name table is "${fontName(bytes, 1)}", not "${f.family}"`)
    const version = fontName(bytes, 5).replace(/^Version\s+/i, '').split(';')[0].trim()
    if (version !== f.version) out.push(`${where}: version ${version}, the record says ${f.version}`)
  }
  return out
}

/** The files in the repository against the list and the record. */
export function localProblems(repo = REPO) {
  const out = []
  if (LIST.length !== RECORD.files.length) out.push(`source-sha256.txt lists ${LIST.length} files, source.json ${RECORD.files.length}`)
  for (const f of RECORD.files) {
    const listed = LIST.find(l => l.path === f.path)
    if (!listed) out.push(`${f.path}: not in source-sha256.txt`)
    else if (listed.hash !== f.sha256) out.push(`${f.path}: source-sha256.txt and source.json differ`)
    const file = join(repo, ...f.path.split('/'))
    if (!existsSync(file)) { out.push(`${f.path}: missing`); continue }
    out.push(...fileProblems(f, readFileSync(file), f.path))
  }
  return out
}

async function range(url, from, to) {
  const r = await fetch(url, { headers: { 'user-agent': 'font-check', range: `bytes=${from}-${to}` }, redirect: 'follow' })
  if (r.status !== 206) throw new Error(`bytes ${from}-${to} of ${url}: HTTP ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/** The record against the release's .zip on GitHub: its size, and the two entries read out of it. */
export async function releaseProblems() {
  const out = []
  const url = RECORD.asset.url
  if (!url.startsWith('https://github.com/notofonts/noto-cjk/releases/download/')) return [`${url}: not an asset of the official repository's releases`]
  const head = await fetch(url, { method: 'HEAD', headers: { 'user-agent': 'font-check' }, redirect: 'follow' })
  if (!head.ok) return [`${url}: HTTP ${head.status}`]
  const total = Number(head.headers.get('content-length'))
  if (total !== RECORD.asset.bytes) out.push(`the asset is ${total} bytes, the record says ${RECORD.asset.bytes}`)
  const tail = await range(url, Math.max(0, total - 70000), total - 1)
  const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) return [...out, 'the asset has no zip directory']
  const count = tail.readUInt16LE(end + 10)
  const cdSize = tail.readUInt32LE(end + 12)
  const cdOffset = tail.readUInt32LE(end + 16)
  const cd = await range(url, cdOffset, cdOffset + cdSize - 1)
  const entries = []
  for (let i = 0, p = 0; i < count; i++) {
    const n = cd.readUInt16LE(p + 28)
    entries.push({ name: cd.toString('utf8', p + 46, p + 46 + n), method: cd.readUInt16LE(p + 10), crc: cd.readUInt32LE(p + 16), csize: cd.readUInt32LE(p + 20), usize: cd.readUInt32LE(p + 24), local: cd.readUInt32LE(p + 42) })
    p += 46 + n + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32)
  }
  for (const f of RECORD.files) {
    const e = entries.find(x => x.name === f.entry)
    if (!e) { out.push(`${f.entry}: not an entry of the asset`); continue }
    const lh = await range(url, e.local, e.local + 29)
    const start = e.local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28)
    const raw = await range(url, start, start + e.csize - 1)
    const bytes = e.method === 0 ? raw : inflateRawSync(raw)
    out.push(...fileProblems(f, bytes, `release ${RECORD.release.tag} ${f.entry}`))
  }
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = localProblems()
  process.stdout.write(`${RECORD.files.length} files of ${RECORD.font} ${RECORD.files[0].version} (release ${RECORD.release.tag}) against the record\n`)
  if (process.argv.includes('--release')) {
    process.stdout.write(`reading the two entries out of ${RECORD.asset.url}\n`)
    problems.push(...await releaseProblems())
  }
  if (problems.length) {
    process.stdout.write(`${problems.join('\n')}\n`)
    process.exit(1)
  }
  process.stdout.write(process.argv.includes('--release') ? 'the files in the repository, the record and the release are the same bytes\n' : 'the files in the repository are the bytes of the record\n')
}
