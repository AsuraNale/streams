/**
 * What the build reads back from Streams.exe after rcedit has written its icon and version info (the icon round,
 * 2026-10-08; docs/installer.md §二 and §三). rcedit rewrites one PE section, .rsrc; so "Streams.exe is still the pinned
 * electron.exe" is checked section by section: the same section names in the same order, and every section but .rsrc
 * byte for byte the same (hashed in place, the two files are 244 MB each). Inside .rsrc, the icon groups
 * (RT_GROUP_ICON → RT_ICON) are parsed and their images compared with the .ico's; the version info is read the way
 * Windows reads it (PowerShell, FileVersionInfo).
 * @module installer/exe-resources
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'

const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const RT_ICON = 3
const RT_GROUP_ICON = 14

function readAt(fd, offset, length) {
  const buf = Buffer.alloc(length)
  let done = 0
  while (done < length) {
    const n = readSync(fd, buf, done, length - done, offset + done)
    if (n <= 0) throw new Error(`short read at ${offset + done}`)
    done += n
  }
  return buf
}

/** The PE section table: [{name, virtualAddress, virtualSize, rawSize, rawPointer}], in file order. */
export function peSections(path) {
  const fd = openSync(path, 'r')
  try {
    const dos = readAt(fd, 0, 64)
    if (dos.readUInt16LE(0) !== 0x5a4d) throw new Error(`${path}: not a PE file (no MZ)`)
    const peAt = dos.readUInt32LE(0x3c)
    const coff = readAt(fd, peAt, 24)
    if (coff.readUInt32LE(0) !== 0x00004550) throw new Error(`${path}: no PE signature at ${peAt}`)
    const count = coff.readUInt16LE(6)
    const optionalSize = coff.readUInt16LE(20)
    const table = readAt(fd, peAt + 24 + optionalSize, 40 * count)
    const sections = []
    for (let i = 0; i < count; i += 1) {
      const o = i * 40
      sections.push({
        name: table.subarray(o, o + 8).toString('latin1').replace(/\0+$/, ''),
        virtualSize: table.readUInt32LE(o + 8),
        virtualAddress: table.readUInt32LE(o + 12),
        rawSize: table.readUInt32LE(o + 16),
        rawPointer: table.readUInt32LE(o + 20),
      })
    }
    return sections
  } finally {
    closeSync(fd)
  }
}

/** sha256 of each section's raw bytes, by name (read in 1 MiB pieces). */
export function sectionHashes(path, sections = peSections(path)) {
  const fd = openSync(path, 'r')
  try {
    const out = {}
    const piece = 1 << 20
    for (const s of sections) {
      const hash = createHash('sha256')
      for (let at = 0; at < s.rawSize; at += piece) hash.update(readAt(fd, s.rawPointer + at, Math.min(piece, s.rawSize - at)))
      out[s.name] = { sha256: hash.digest('hex'), bytes: s.rawSize }
    }
    return out
  } finally {
    closeSync(fd)
  }
}

/**
 * Two PE files compared section by section: the same names in the same order, and which sections' raw bytes are the
 * same. rcedit changes .rsrc only (and the headers that describe it).
 * @returns {{names: string[], same: string[], different: string[]}}
 */
export function compareSections(a, b) {
  const sa = peSections(a)
  const sb = peSections(b)
  const names = sa.map(s => s.name)
  if (JSON.stringify(names) !== JSON.stringify(sb.map(s => s.name))) throw new Error(`section tables differ: ${names.join(' ')} vs ${sb.map(s => s.name).join(' ')}`)
  const ha = sectionHashes(a, sa)
  const hb = sectionHashes(b, sb)
  const same = []
  const different = []
  for (const n of names) (ha[n].sha256 === hb[n].sha256 && ha[n].bytes === hb[n].bytes ? same : different).push(n)
  return { names, same, different }
}

/** The .rsrc section's resource tree, flattened: [{type, name, lang, data: Buffer}] (named entries carry their string). */
export function resources(path) {
  const sections = peSections(path)
  const rsrc = sections.find(s => s.name === '.rsrc')
  if (!rsrc) throw new Error(`${path}: no .rsrc section`)
  const fd = openSync(path, 'r')
  let sec
  try { sec = readAt(fd, rsrc.rawPointer, rsrc.rawSize) } finally { closeSync(fd) }
  const str = at => { const n = sec.readUInt16LE(at); return sec.subarray(at + 2, at + 2 + n * 2).toString('utf16le') }
  const entries = at => {
    const named = sec.readUInt16LE(at + 12)
    const ids = sec.readUInt16LE(at + 14)
    const out = []
    for (let i = 0; i < named + ids; i += 1) {
      const o = at + 16 + i * 8
      const nameField = sec.readUInt32LE(o)
      const offsetField = sec.readUInt32LE(o + 4)
      out.push({
        key: nameField & 0x80000000 ? str(nameField & 0x7fffffff) : nameField,
        sub: offsetField & 0x80000000 ? offsetField & 0x7fffffff : null,
        data: offsetField & 0x80000000 ? null : offsetField,
      })
    }
    return out
  }
  const out = []
  for (const t of entries(0)) {
    if (t.sub === null) continue
    for (const n of entries(t.sub)) {
      if (n.sub === null) continue
      for (const l of entries(n.sub)) {
        if (l.data === null) continue
        const rva = sec.readUInt32LE(l.data)
        const size = sec.readUInt32LE(l.data + 4)
        const at = rva - rsrc.virtualAddress
        if (at < 0 || at + size > sec.length) throw new Error(`${path}: resource data outside .rsrc (type ${t.key}, name ${n.key})`)
        out.push({ type: t.key, name: n.key, lang: l.key, data: sec.subarray(at, at + size) })
      }
    }
  }
  return out
}

/**
 * The icon groups of an executable and their images: [{id, lang, images: [{width, height, bits, bytes}]}], groups in
 * resource order (the first is the one Explorer shows).
 */
export function iconGroups(path) {
  const all = resources(path)
  const icons = all.filter(r => r.type === RT_ICON)
  return all.filter(r => r.type === RT_GROUP_ICON).map(g => {
    const d = g.data
    const count = d.readUInt16LE(4)
    const images = []
    for (let i = 0; i < count; i += 1) {
      const o = 6 + i * 14
      const id = d.readUInt16LE(o + 12)
      const icon = icons.find(r => r.name === id && r.lang === g.lang) ?? icons.find(r => r.name === id)
      if (!icon) throw new Error(`${path}: icon group ${g.name} names RT_ICON ${id}, which is not there`)
      images.push({ width: d.readUInt8(o) || 256, height: d.readUInt8(o + 1) || 256, bits: d.readUInt16LE(o + 6), bytes: icon.data })
    }
    return { id: g.name, lang: g.lang, images }
  })
}

/**
 * Does an icon group hold exactly the images of the .ico (parsed with desktop/scripts/lib/icon.mjs parseIco): the same
 * count, and for every .ico entry one image of the same size whose bytes are the same?
 * @returns {{ok: boolean, matched: number, missing: string[], extra: number}}
 */
export function groupMatchesIco(group, icoEntries) {
  const left = [...group.images]
  const missing = []
  for (const e of icoEntries) {
    const i = left.findIndex(im => im.width === e.width && im.height === e.height && im.bytes.equals(e.image))
    if (i < 0) missing.push(`${e.width}x${e.height}`)
    else left.splice(i, 1)
  }
  return { ok: missing.length === 0 && left.length === 0, matched: icoEntries.length - missing.length, missing, extra: left.length }
}

/**
 * The copyright line the way Inno Setup writes VersionInfoCopyright into the setup program: "(C)" becomes the © sign
 * (Inno Setup's compiler does this on purpose, ReplaceWithRealCopyrightSymbols). release.json's `copyright` goes
 * through this before it is compared with what setupVersionInfo reads back.
 */
export const innoCopyright = line => line.replace(/\(C\)/g, '©')

/**
 * The setup program's version info, as Inno Setup wrote it and ready to compare with the .iss's values: Inno Setup
 * patches a template resource whose string fields are fixed-width and padded with spaces, so every string is trimmed
 * at its end (versionInfo gives the raw values).
 */
export function setupVersionInfo(path) {
  return Object.fromEntries(Object.entries(versionInfo(path)).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/\s+$/, '') : v]))
}

/** The version info as Windows reads it (System.Diagnostics.FileVersionInfo). */
export function versionInfo(path) {
  const script = '$v = (Get-Item -LiteralPath $env:ST_FILE).VersionInfo; @{ CompanyName = [string]$v.CompanyName; ProductName = [string]$v.ProductName; FileDescription = [string]$v.FileDescription; FileVersion = [string]$v.FileVersion; ProductVersion = [string]$v.ProductVersion; LegalCopyright = [string]$v.LegalCopyright; InternalName = [string]$v.InternalName; OriginalFilename = [string]$v.OriginalFilename; FileVersionRaw = [string]$v.FileVersionRaw; ProductVersionRaw = [string]$v.ProductVersionRaw } | ConvertTo-Json -Compress'
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8', windowsHide: true, timeout: 60_000, env: { ...process.env, ST_FILE: path } })
  if (r.status !== 0) throw new Error(`version info of ${path}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
